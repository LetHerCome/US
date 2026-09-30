# M11B → M11E — Game V2

Candidate branch design and decision log, 2026-09-30. Migrations and Edge
Functions are prepared in the repository only; nothing has been applied to or
deployed on production.

## Scope

| Milestone | Delivered |
| --- | --- |
| Pre-flight | M11A.1 migration file renamed to its production ledger version `20260930121312`. |
| M11B | Five-question rounds on the M11A session authority, first-class prediction, the weekly couple question, the curated catalog, Per voi, the new Gioca hub and the top-left Per voi control. |
| M11C | Explicit context adapters, recipes with provenance, centralized anti-repeat, longitudinal resurfacing, perspective rotation. |
| M11D | Game V2 push on the existing web-push infrastructure. |
| M11E | Legacy Gioca presentation removed, security and concurrency review, two-user visual QA, one RC marker bump. |

## Migrations, in order

1. `20260930121312_m11a_1_game_rpc_readonly_actor.sql` (already in production; ledger alignment only).
2. `20260930150000_m11b_game_v2_core.sql`
3. `20260930160000_m11c_game_v2_context.sql`
4. `20260930170000_m11d_game_v2_push.sql`

All are additive and forward-only: new tables, columns and functions, widened
checks, replaced function bodies with unchanged signatures. No applied
migration is edited, no row is deleted.

Deploy with M11D: Edge Functions `game-v2-push` (verify_jwt) and
`game-v2-push-worker` (no JWT, dedicated vault cron key). `send-web-push` is
byte-identical to the base.

## Decisions

**Game V2 reuses the M11A session layer.** Rounds are `game_sessions` with
`engine_version = 2` and five immutable `game_session_items` snapshots. Answers,
sides, completion and personal reveal receipts are the M11A tables and RPCs.
Every row is keyed by couple + stable role (`francesco` / `beatrice`), like
M10.2, so a `claim_us_role` re-pair keeps everything without a transfer.

**Legacy backend kept, legacy UI retired.** The old weekly quiz and Partner
Knowledge SQL is not in this repository and stays untouched in production.
Gioca is owned by `games.js` (`window.USGameV2`); the old quiz markup, the
`quiz_responses` realtime subscription and the dead `.quiz-*` styles and
selectors are removed. `create_couple_question` and `start_custom_game_session`
lose their `authenticated` grant: unrestricted creation would bypass the weekly
contract, and single-question sessions would unseal a weekly question on
demand. Existing questions and sessions stay readable and playable.

**Prediction is an item mechanic, not a mode.** "Quanto mi conosci?" items
carry a subject role; the subject answers about themselves, the predictor
guesses. In a round the 3/2 split alternates which role is the heavier
subject; M11C adds perspective rotation inside that split.

**No relationship score.** The reveal shows both answers and a restrained
outcome only: "Uguale ♡" / "Una sorpresa" for choices, and for prediction
"L'hai capito/a al volo ♡", "Ti ha capito/a al volo ♡", "Ti ha sorpreso/a",
"L'hai sorpreso/a". The participle agrees with the person it refers to
(Francesco masculine, Bea feminine).

**Weekly question.** The creator is a pure function of the Europe/Rome week:
Francesco for the week of Monday 2026-09-28, then Bea, alternating; a missed
week does not roll over. The turn changes Monday 00:00 Europe/Rome (DST-safe
truncation on the Rome wall clock). Creation is idempotent (client request id
plus a per-couple advisory lock and a unique week constraint). The question is
sealed for the partner until a round contains it; it then stays in the pool as
a durable couple question. The partner's hub card never contains its text.

**Clock seam.** `private.game_v2_clock()` is the only "now" for weeks,
cooldowns, context windows and push windows. `start_game_round` writes
`started_at` from it, so longitudinal labels and cooldowns agree with tests.

**Per voi.** The orchestrator: one round across families, catalog and context,
built by the deterministic selector (score + md5 jitter keyed by couple and
day). The top-left sparkle control mirrors its state: `idle`, `pending` (the
partner answered, orbit on), `waiting` (orbit off), `reveal_ready` (orbit on),
cleared once the reveal is seen.

**Context adapters (M11C).** One plpgsql adapter per source, each
exception-guarded so a missing or changed table never breaks a round:

| Adapter | Reads | Window |
| --- | --- | --- |
| Da vivere | bucket item titles (idea / scheduled; lived) | lived 3–730 days ago |
| Calendar | shared entries only, not linked to bucket items | +1..60 days, −365..−7 days |
| Ricordi | moment captions | 14–730 days ago |
| Conservati | existence within 365 days, metadata only | never content |
| Longitudinal | a reciprocal open catalog prompt both answered | last played ≥ 90 days ago |

Titles are cleaned (3–60 chars, letters required, no URLs, quotes stripped).
Personal calendar entries are never read. Daily Question answers and Left for
You content are never mined. Recipes are editorial JSON with provenance
(`adapter`, `recipe_id`, source object); the migration seed is generated from
those files and a test fails on drift. Context caps: 2 items in Per voi, 3 in a
mode round.

**Anti-repeat, centralized.** `game_v2_cooldowns` holds the days per class for
exact item, recipe, source object and topic:

| Class | Item | Recipe | Source | Topic |
| --- | --- | --- | --- | --- |
| light | 30 | 30 | 0 | 3 |
| standard | 60 | 60 | 0 | 5 |
| deep | 120 | 120 | 0 | 10 |
| custom | 180 | 0 | 180 | 5 |
| context | 180 | 7 | 30 | 5 |
| longitudinal | 365 | 60 | 365 | 14 |

The selector fills in three passes: every rule; then relaxed cooldowns (least
recently played first); then relaxed diversity. A round is always possible
while the curated fallback exists.

**Longitudinal reveal.** When a revealed item came from the longitudinal
adapter, the session state adds `previous` (both earlier answers and when), shown
as "COSA AVEVATE RISPOSTO" under the new answers.

**Snapshots are immutable.** An item keeps its rendered text after the source
(a moment, a bucket item) is edited or deleted.

**Bond XP deferred.** No repository writer for Bond XP exists that Game V2 can
reuse safely, so rounds award none. Nothing in the UI mentions XP.

**Push (M11D).** A dedicated `game-v2-push` fast path (called by the actor's
own client with only a round or question id) and a `game-v2-push-worker` cron
recovery (every 10 minutes, 09–22 Europe/Rome, events 2 min–48 h old). What to
send is decided in SQL by service-role-only functions from the same tables and
clock; the recipient is derived from couple + stable role, never from the
client. Events: `game_waiting`, `game_reveal` (to whoever finished first, ties
broken by role), `game_weekly_created` (never the text), `game_weekly_turn`.
Dedupe keys are role-based (`game-waiting:<session>:<role>` and so on) and are
released when no device received the push. The new `games` preference (default
on) disables all of them. Payloads carry no question, answer, prediction result
or context source. There is no standalone Per voi push: Per voi rounds use the
waiting and reveal events like every other round.

`send-web-push` was left byte-identical (its hash is pinned by the M10.2 tests);
the client helper routes `game_*` types to `game-v2-push`.

## Security and concurrency review

- Every new public RPC is `SECURITY DEFINER`, `set search_path = ''`, revoked
  from `public`/`anon`; user RPCs are granted to `authenticated`, push
  derivations and the cron key reader to `service_role` only. Private helpers
  are revoked from every client role.
- Every new table has forced RLS and no client privileges.
- The actor, couple and role always come from `auth.uid()` through
  `private.m11a_actor()` / `m11a_actor_locked()`; no RPC trusts a client user,
  couple or role.
- Read RPCs and the push derivations are `STABLE` and take no row locks; real
  PostgreSQL tests run them inside `begin read only`.
- Mutators serialize on `m11a_actor_locked()` plus per-couple advisory locks
  (weekly per couple, rounds per couple + family). Real two-connection tests
  cover simultaneous finalize (one reveal), weekly double-click and retry
  racing its original (one question), 12 simultaneous Per voi taps (one
  round), and a context round opened by both partners.
- Known limit: rounds of different families started at the same instant can
  share a catalog prompt; this affects freshness only, never integrity.
- `get_notification_preferences` / `set_notification_preference` are replaced
  with `create or replace`, which keeps their existing grants.

## Release

One RC bump: build `us-m11-game-v2-20260930-1` (index.html `us-build` and
version.json), Service Worker `us-shell-static-runtime-39`, cache-bust query
strings for games, identity, fix4, settings and navigation assets, and the ten
new Phosphor icons precached. `us-private-media-v1` is unchanged.

Rollout order: apply the three migrations, deploy the two Edge Functions, then
deploy the client. An old cached client calling the revoked M11A creation RPCs
gets a permission error until it updates.
