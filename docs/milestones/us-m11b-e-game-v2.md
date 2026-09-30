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

## Decision log

Each entry: problem, chosen solution, rejected obvious alternative, why this fits US.

### Prediction representation

- **Problem:** "Quanto mi conosci?" needs a subject who answers about themselves and a predictor who guesses, comparable objectively.
- **Chosen:** Prediction is an item mechanic: catalog rows with `mechanic = 'prediction'`, choice-only, a first-person `question_text` for the subject and a `predict_text` naming `{subject}` for the predictor. Each round item snapshots its `subject_role`; the 3/2 split alternates which role is the heavier subject, and M11C rotates perspective inside it.
- **Rejected:** A separate prediction table or a sixth engine alongside sessions.
- **Why:** One answer table and one reveal path for every family; prediction appears inside Per voi rounds, not only in its own mode.

### Game Session reuse

- **Problem:** Game V2 needs rounds, sides, answers and personal reveal receipts.
- **Chosen:** Reuse the M11A tables and RPCs (`game_sessions` with `engine_version = 2`, five immutable `game_session_items`, `game_session_sides`, `game_session_answers`, save / complete / reveal-seen).
- **Rejected:** A new `game_v2_*` session schema.
- **Why:** M11A was built as the reciprocal authority precisely for this; one reveal privacy rule, one re-pair model.

### Old quiz reuse / deprecation

- **Problem:** The weekly quiz stores one `smallint` index per user per week in `quiz_responses`; it cannot hold open answers, sessions or predictions, and its SQL is not in this repository.
- **Chosen:** Keep the backend untouched in production; retire the UI (markup, realtime subscription, dead `.quiz-*` styles and selectors). Gioca is owned by `games.js`.
- **Rejected:** Rewriting or migrating `quiz_responses`.
- **Why:** No destructive change to a production domain this repo does not own, and no duplicate old/new experience.

### Partner Knowledge migration / reuse

- **Problem:** Partner Knowledge reads the partner's weekly quiz indices; its authority is index-only and week-bound.
- **Chosen:** Absorb the concept into "Quanto mi conosci?" on the session authority; preserve its data, show no legacy entry point.
- **Rejected:** Adapting Partner Knowledge to per-item subjects.
- **Why:** Its model cannot represent a subject role per item or open wording; the session model already can.

### Weekly turn authority

- **Problem:** Who may create this week's question must not be spoofable or drift.
- **Chosen:** `private.game_v2_weekly_role(week_start)` is a pure function of the Europe/Rome week; `create_weekly_question` checks it against the caller's server-derived role, a table check enforces it again, and a partial unique index allows one weekly question per couple per week.
- **Rejected:** A stored rotation pointer advanced on creation.
- **Why:** Nothing to repair after a missed week or a re-pair; the rule is visible in one line of SQL.

### Weekly anchor / parity

- **Problem:** The alternation needs a fixed starting point.
- **Chosen:** Week of Monday 2026-09-28 is Francesco's; parity of whole weeks since then decides (DST-safe: truncation on the Rome wall clock; turn changes Monday 00:00 Europe/Rome). A missed week does not roll over.
- **Rejected:** ISO week number parity.
- **Why:** ISO parity flips at year boundaries with 53-week years; an explicit anchor never does.

### Sealed weekly question

- **Problem:** The partner must discover the question by playing, not by reading the hub.
- **Chosen:** `private.game_v2_question_sealed` hides the text from the non-author until a round contains it; the partner's hub card carries only "<nome> ha lasciato una domanda per voi". Once materialized it stays in the pool as a durable couple question.
- **Rejected:** Unlocking on a date.
- **Why:** The reveal happens inside gameplay, which is the point of the ritual.

### Custom question classification

- **Problem:** Couple questions must enter the right families.
- **Chosen:** `couple_questions.families` (1-6 families; "Quanto mi conosci?" only with choice answers) and `origin` (`library` / `weekly`). Existing M11A questions get families from their format. The author picks families in the weekly form.
- **Rejected:** Free-form tags or automatic classification.
- **Why:** Deterministic, author-controlled, checkable in SQL.

### Curated question storage

- **Problem:** Quality needs editorial review and a single source of truth.
- **Chosen:** Editorial JSON in `supabase/game-v2/catalog/` (62 prompts across six families) generates the `game_v2_catalog` seed block in the migration; a test fails on drift. Prompts carry depth, topic and cooldown class; retire with `active = false`, reword with a version bump in a new migration.
- **Rejected:** Hundreds of generated prompts, or rows edited directly in SQL.
- **Why:** Few prompts that sound like the two of them, reviewable in a diff.

### Context adapter boundary

- **Problem:** Game V2 must use shared US context without scraping private tables.
- **Chosen:** One exception-guarded plpgsql adapter per source (Da vivere, shared calendar entries, Ricordi captions, Conservati metadata, longitudinal history) returning only a cleaned title, dates, eligible recipes and provenance. Personal calendar entries, Daily Question answers and Left for You content are never read.
- **Rejected:** A generic query over any table with a text column.
- **Why:** Each boundary is auditable, and a schema change in one source cannot break a round.

### Recipe representation

- **Problem:** Context must never become a question by itself or produce broken Italian.
- **Chosen:** Curated recipes in `supabase/game-v2/recipes/*.json` (adapter from the file name, family, text with slots such as `{title}`, `{date}`, a provenance label), seeded into `game_v2_recipes`. Titles are cleaned (3-60 chars, letters, no URLs, quotes stripped); wording is gender-neutral, guarded by a test.
- **Rejected:** Templates assembled in the client.
- **Why:** The recipe is curated, the slot is real, and every item records where it came from.

### Per voi selector

- **Problem:** Per voi must feel prepared, not random.
- **Chosen:** A deterministic SQL selector: quality score, depth progression, source diversity, context caps (2 in Per voi, 3 in a mode round), prediction when both roles exist, unused couple questions preferred, md5 jitter keyed by couple and day. Three passes: every rule; relaxed cooldowns; relaxed diversity, so the curated fallback always completes a round.
- **Rejected:** `order by random()` over the eligible pool.
- **Why:** Random is not personal; a deterministic ranking is testable and reproducible.

### Anti-repeat / fingerprint model

- **Problem:** The same memory reworded is still a repetition.
- **Chosen:** Every item stores provenance (source type and id, recipe, family, perspective, subject role, topic, started_at). `game_v2_cooldowns` centralizes days per class for exact item, recipe, source object and topic (topic lowers the score, never blocks). Values are in the table above.
- **Rejected:** Tracking question ids only, or intervals scattered in code.
- **Why:** One table to tune; repetition is judged on meaning, not wording.

### Longitudinal resurfacing

- **Problem:** A year of play should make Gioca more theirs.
- **Chosen:** Longitudinal catalog prompts both partners answered and revealed at least 90 days ago can return through the longitudinal recipe ("L'avete già giocata ad aprile"); the reveal then shows "COSA AVEVATE RISPOSTO" with both earlier answers. At most once a year per answer.
- **Rejected:** Random replays of old questions.
- **Why:** Intentional evolution, only on revealed answers, only when the recipe allows it.

### Bond XP

- **Problem:** Game V2 could reward participation.
- **Chosen:** Deferred: no repository writer for Bond XP exists that Game V2 can reuse safely; rounds award nothing and the UI never mentions XP.
- **Rejected:** A new points path from Game V2.
- **Why:** A parallel economy is explicitly unwanted; deferring costs nothing.

### Push architecture

- **Problem:** Game events need push without touching `send-web-push` (byte-pinned by M10.2 tests).
- **Chosen:** Dedicated `game-v2-push` fast path (JWT, the client sends only a round or question id) and `game-v2-push-worker` cron recovery (dedicated vault key, every 10 minutes, 09-22 Europe/Rome). Service-role SQL derives what to send, to which role, and the dedupe key. The client helper routes `game_*` types to the new function.
- **Rejected:** Adding game types to `send-web-push`.
- **Why:** The existing function stays byte-identical, and the recipient is never client-supplied.

### Re-pair semantics

- **Problem:** `claim_us_role` can replace a profile.
- **Chosen:** Every Game V2 row is keyed by couple + stable role, as in M10.2; push dedupe keys are role-based too.
- **Rejected:** Rows keyed by user id with a transfer on re-pair.
- **Why:** A legitimate re-pair keeps sessions, answers, receipts, predictions and weekly history, and never re-notifies.

### Other choices

- **No relationship score.** The reveal shows both answers and a restrained outcome: "Uguale ♡" / "Una sorpresa" for choices; for prediction "L'hai capito/a al volo ♡", "Ti ha capito/a al volo ♡", "Ti ha sorpreso/a", "L'hai sorpreso/a", with the participle agreeing with the person it refers to (Francesco masculine, Bea feminine).
- **Clock seam.** `private.game_v2_clock()` is the only "now" for weeks, cooldowns, context windows and push windows; `start_game_round` writes `started_at` from it.
- **Per voi control.** The top-left sparkle mirrors Per voi: `idle`, `pending` (orbit on), `waiting` (orbit off), `reveal_ready` (orbit on), cleared once the reveal is seen.
- **Snapshots are immutable.** An item keeps its rendered text after its source is edited or deleted.
- **Revoked M11A creation RPCs.** `create_couple_question` and `start_custom_game_session` lose their `authenticated` grant: unrestricted creation would bypass the weekly contract, and single-question sessions would unseal a weekly question on demand. Existing questions and sessions stay readable and playable.
- **Push events.** `game_waiting`, `game_reveal` (to whoever finished first, ties broken by role), `game_weekly_created` (never the text), `game_weekly_turn`. The `games` preference (default on) disables all; payloads carry no question, answer, prediction result or context source; no standalone Per voi push.

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

## Known limitations

- Previous outcomes feed back only through longitudinal resurfacing; the
  selector does not yet weight items by past surprises or matches.
- The curated catalog is small on purpose (62 prompts); after heavy play of one
  mode the selector's relaxed passes reuse the least recently played prompts.
- Rounds of different families started at the same instant can share a
  prompt (freshness only).
- Bond XP for Game V2 is deferred.
