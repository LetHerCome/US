# US 2.0 — F2A Backend Source-of-Truth / Drift Audit

**Status:** `BLOCKED` on production read access. The repository half of the audit is complete; every production cell is marked **NOT VERIFIED** and is filled by the read-only pack in [`F2A_PRODUCTION_READONLY_QUERIES.sql`](F2A_PRODUCTION_READONLY_QUERIES.sql).
**Project:** Supabase `iiakdfsxpywdkxravqjh`
**Production changes:** NONE.

Legend used in every table:

| Tag | Meaning |
|---|---|
| **VERIFIED (repo)** | Measured in this mission from the repository at the base SHA. |
| **VERIFIED (replay)** | Measured in this mission by replaying repo SQL on a throwaway local PostgreSQL 16. |
| **LAST OBSERVED (doc, date)** | Read live from production by an earlier mission (F1A/F1B/F1C on 2026-10-03, M5A on 2026-09-22) and recorded in the repo. Not re-read today. |
| **NOT VERIFIED** | Needs production. Filled by the numbered block of the read-only pack. |

---

# SOURCE

- **Branch:** `mission/us-2-0-f2a-backend-source-of-truth` (fresh, from `origin/main`; no F1 worktree reused).
- **Base SHA:** `42a307e9d05c64aca6a7a6cd883f55a1bde273a6` (F1C merge). `git fetch origin` on 2026-10-03 18:51 UTC: `origin/main` had **not moved** from the issued SHA, and the issued SHA is its own tip (ancestry confirmed).
- **Production access in this session: none.**
  - No Supabase connector, CLI login, access token or database URL is configured.
  - The environment's network policy denies the Supabase hosts: `api.supabase.com` and `iiakdfsxpywdkxravqjh.supabase.co` both return `CONNECT tunnel failed, response 403` from the egress proxy.
  - So nothing in production was read today, and nothing was written.
- **What was used instead:**
  1. A static scan of all 47 migrations, all 13 Edge Functions, `supabase/config.toml`, and every runtime caller (client JS, Edge, Scriptable widgets, Android native widget).
  2. A replay of all 47 migrations, in version order, into an empty PostgreSQL 16 that mimics a new Supabase project (roles, `auth`, `storage`, `extensions.pgcrypto`, `supabase_realtime`, plus stubs for `vault`, `pg_cron` and `pg_net`).
  3. Production facts that F1A/F1B/F1C and the M5A manifest already recorded in the repo, always tagged LAST OBSERVED.
  4. Git history across all 106 remote branches (renames "aligned with production ledger", removed pre-ledger filenames).
- **Diff:** documentation only. It adds this file and `F2A_PRODUCTION_READONLY_QUERIES.sql`. No runtime, migration, Edge Function, config or build-id change.
- **Verification:**
  - `npm ci && npm test` on this branch: 1307 tests, 1301 pass, 0 fail, 6 skipped.
  - The SQL pack was run end to end on a local PG16 stub with `ON_ERROR_STOP`, inside `BEGIN READ ONLY … ROLLBACK`.

---

# EXECUTIVE STATE

1. **The repository cannot rebuild the backend.** Replayed on an empty Supabase-like database, **1 of 47** migrations applies and **46 fail**. The first failure is the very first file (`relation "public.couples" does not exist`). Everything created before 2026-08-31 lives only in production: about 30 public tables, 18 functions (including `private.current_couple_id()`, which almost every RLS policy uses), the base RLS policies, the `us-media` bucket and its policies, and 12 of the 14 Realtime memberships the client subscribes to. **Reconstruction: NO.**
2. **The migration ledger cannot be matched from here, but the repo evidence is clear.**
   - 27 of 47 files carry explicit evidence that production records the same version (ledger-alignment renames, or a recorded `migration repair`).
   - 10 files are suspect: round timestamps, "prepared only" headers, or a rename away from an applied version (`20261002171949` → `20261002181501`).
   - The F0 finding of about 36 production-only base versions cannot be re-counted without block 1.
3. **At least one repo migration is not the SQL production ran.** `20260928210000_m6d_calendar_reminders.sql` puts a sub-query inside a CHECK constraint, which PostgreSQL rejects (verified). Production instead uses the production-only helper `public.calendar_reminder_offset_valid()` (LAST OBSERVED F1B/F1C).
4. **A broad replay is dangerous, not just noisy.** Several suspect files are fully re-runnable `create or replace` scripts. If the CLI ever treats them as pending (after a wrong `migration repair`, or with `--include-all`), they would succeed silently and downgrade newer production behaviour:
   - notification preferences back to before M11D;
   - `equip_progression_reward` back to before Rewards V2;
   - `widget_send_think_internal` back to before the idempotent version.
5. **Edge Functions: 13 in the repo, 13 deployed (LAST OBSERVED F1B), but not the same 13.**
   - `monthiversary-job` is deployed with no source. It is the only writer of `relationship_milestones`, which the client reads, subscribes to and awards XP from.
   - `cleanup-left-for-you` is in the repo but not deployed or scheduled.
6. **Cron: 6 jobs are defined in the repo, 7 are live (LAST OBSERVED F1B).** The 7th almost certainly drives `monthiversary-job`, through the production-only `get_internal_monthiversary_cron_key()`. Three repo jobs run every minute (about 4,600 runs/day), and nothing in the repo purges `cron.job_run_details`.
7. **What should be canonical:**
   - **Today:** production schema for everything before the repo's first migration and for the drifted objects.
   - **Going forward:** the repository, starting from a captured production baseline (see the canonical model).
   - **Next mission:** F2A.1, production baseline capture and missing-source recovery. It writes to the repo only; production stays read-only.

---

# MIGRATION MATRIX

## Counts

| Bucket | Count | Status |
|---|---|---|
| Repo migration files | **47** (`20260831131130` … `20261003200000`) | VERIFIED (repo) |
| Duplicate versions in repo | **0** | VERIFIED (repo) |
| Filename/version collisions in repo | **0** (every file is `<14-digit version>_<name>.sql`, all versions unique) | VERIFIED (repo) |
| Production ledger rows | **NOT VERIFIED** (block 1) | — |
| REPO_AND_LEDGER | **NOT VERIFIED.** Expected ≥ 27 (evidence class A below) | block 1 |
| REPO_ONLY | **NOT VERIFIED.** Expected 0–10 (class C) | block 1 |
| LEDGER_ONLY | **NOT VERIFIED.** F0 reported about 36 pre-repo versions. Two are known by name (`20260820160643 add_moment_album_photos`, `20260820163727 performance1_enable_targeted_realtime`, LAST OBSERVED M5A 2026-09-22). Plus any alternate versions of class C files, for example `20261002171949` | block 1 |
| NON_CANONICAL / UNKNOWN | **NOT VERIFIED.** Class B = 10 files, plausibly in the ledger but with no recorded proof | block 1 |

## Evidence classes (repo side, VERIFIED (repo))

- **A, same version recorded:** the file was renamed to a production ledger version (the "align … with production ledger" commits), or its header says "Applied to production as ledger migration …", or F1A/F1B/F1C recorded `supabase migration repair --status applied <version>`.
- **B, no evidence either way:** the timestamp has non-round seconds, typical of an MCP or dashboard `apply_migration`. These are plausibly in the ledger, but nothing in the repo proves it.
- **C, suspect:** a round timestamp (`…0000`/`…3000`/`…4500`), an explicit "prepared only, do not apply remotely" header, or a version that git history shows was moved away from an applied one. F1A §7 already reported divergence "before 2026-09-01 and around 09-23/09-24 and 10-01/10-02", and these files fall exactly in those windows.

## Per-file matrix

Replay column: `FAIL(base)` means it failed only because a production-only base object is missing. `FAIL(own)` means it would fail even on a correct base.

| # | Version | Name | Ev. | Evidence | Replay on empty project | Re-runnable on prod? |
|---|---|---|---|---|---|---|
| 1 | 20260831131130 | widget_think_silent_send | B | non-round | FAIL(base) `couples` | no (create table) |
| 2 | 20260831213000 | fix_widget_think_couple_id_ambiguity | **C** | round; pre-09-01 window | FAIL(base) | **yes, downgrades `widget_send_think_internal`** (later redefined in #6) |
| 3 | 20260901192817 | daily_question_outcomes | B | | FAIL(base) | no |
| 4 | 20260902101619 | daily_question_reveal_authority | B | | FAIL(base) `private` schema | yes (old `daily_question_reveal_ready`, same as current) |
| 5 | 20260902114732 | think_reactions | B | | FAIL(base) | no |
| 6 | 20260922120726 | think_send_idempotency_final_reaction | B | | FAIL(base) | no |
| 7 | 20260922120945 | fix_send_think_conflict_ambiguity | B | "first M4A migration is preserved as applied history" | FAIL(base) | yes |
| 8 | 20260922180436 | left_for_you_v1 | B | | FAIL(base) | no |
| 9 | 20260922182210 | fix_left_for_you_partner_scope_and_grants | B | header: aligns to remote state | FAIL(base) | yes |
| 10 | 20260923100236 | enforce_left_for_you_insert_unseen | A | renamed to remote version (3479f9f) | FAIL(base) | — |
| 11 | 20260923110119 | m5c_left_for_you_rich_media | A | 90f0b33 | FAIL(base) | — |
| 12 | 20260923112331 | m5d_conserva_contribution | A | c6b1a59 | FAIL(base) | — |
| 13 | 20260923112428 | harden_conserva_contribution_grants | B | | FAIL(base) | yes |
| 14 | 20260923180800 | m5g2_video_upload_limit_40mb | **C** | header "prepared only, do not apply remotely" | **OK** (only `update storage.buckets`, 0 rows here) | yes. **Pending effect?** The client allows 40 MB video (`left-for-you.js:1306`); if not applied, the bucket stays at 25 MB |
| 15 | 20260923210000 | m5g3_left_for_you_notification_preference | **C** | header "prepared only"; round; M5G3 prod hotfix #21 shipped the feature | FAIL(base) | **yes, downgrades `get/set_notification_preference` to pre-M11D bodies** |
| 16 | 20260924160000 | m5i_ephemeral_left_for_you | **C** | round; 09-24 window | FAIL(base) | mostly (create-if-not-exists + drop-if-exists) |
| 17 | 20260924194500 | widget_scriptable_setup | **C** | round; 09-24 window | FAIL(base) | no (6 plain creates) |
| 18 | 20260928071627 | m6a_shared_calendar_domain | A | 13a4660 | FAIL(base) | — |
| 19 | 20260928071749 | m6a_claim_us_role_calendar_entries_transfer | A | 13a4660 | FAIL(base) | — |
| 20 | 20260928210000 | m6d_calendar_reminders | **C** | round; **source not applicable as written** (CHECK with sub-query) | FAIL(base) **+ FAIL(own)** | no |
| 21 | 20260929121350 | m7a_da_vivere_bucket_items_domain | A | 5b0269d | FAIL(base) | — |
| 22 | 20260929121430 | m7a_claim_us_role_bucket_items_transfer | A | 5b0269d | FAIL(base) | — |
| 23 | 20260929190126 | m7c_da_vivere_calendar_unschedule | A | 79babda | FAIL(base) | — |
| 24 | 20260929190145 | m7d_da_vivere_reciprocal_lived | A | 79babda | FAIL(base) | — |
| 25 | 20260929201958 | m9a_left_for_you_push_reliability | A | bb69a5f | FAIL(base) | — |
| 26 | 20260930045233 | m9e_daily_question_engine | A | 95bd657 | FAIL(base) `daily_questions` | — |
| 27 | 20260930061045 | m10c_daily_question_push | A | bca7ee0 | FAIL (unqualified `gen_random_bytes`, which resolves only via Supabase's `extensions` search_path) | — |
| 28 | 20260930080452 | m10_2_daily_reveal_states | A | pre-ledger file removed (38fb0a2) | FAIL(base) | — |
| 29 | 20260930105724 | m11a_game_sessions_custom_questions | A | bb76486 | FAIL(base) | — |
| 30 | 20260930121312 | m11a_1_game_rpc_readonly_actor | A | 96bc9f9 | FAIL(base) | — |
| 31 | 20260930153745 | m11b_game_v2_core | A | 8e5d69b; memory "never edit" | FAIL(base) | — |
| 32 | 20260930153749 | m11c_game_v2_context | A | 7ca27a0 | FAIL(base) | — |
| 33 | 20260930153755 | m11d_game_v2_push | A | 2321cc7 | FAIL(base) | — |
| 34 | 20260930172615 | m11f_game_v2_weekly_rhythm | A | 5866f9f | FAIL(base) | — |
| 35 | 20260930225935 | m12b_2_da_vivere_archived_link_release | A | header + 31d5c32 | FAIL(base) | — |
| 36 | 20260930233501 | m12b_3_living_provenance | A | header + 213c85f | FAIL(precondition) | — |
| 37 | 20260930233503 | m12b_3_game_v2_living_origin | A | header | FAIL(base) | — |
| 38 | 20260930233506 | m12b_3_event_completion_history | A | header | FAIL(base) | — |
| 39 | 20261001093123 | m12b_4_daily_question_keepsakes | A | header + f4144a4 | FAIL(precondition) | — |
| 40 | 20261001133906 | m12d_quest_server_authority | B | non-round | FAIL(preflight: Quest tables missing) | — |
| 41 | 20261002181500 | us_progression_v1 | **C** | round; 10-02 window | FAIL(base) | partly |
| 42 | 20261002181501 | progression_reward_toggle_unequip | **C** | moved from `20261002171949` (179ec4a / 89f74d4, "misordered") | FAIL(base) | **yes, downgrades `equip_progression_reward`** (redefined in #44) |
| 43 | 20261002190000 | swipe_v1 | **C** | round; 10-02 window | FAIL(base) | no |
| 44 | 20261003090000 | progression_rewards_v2 | **C** | round; 10-03 window | FAIL(base) | yes (latest body) |
| 45 | 20261003160000 | f1a_revoke_claim_us_role | A | F1A §4: `migration repair` recorded | FAIL(base) | — |
| 46 | 20261003180000 | f1b_rpc_grant_hardening | A | F1B: `migration repair` recorded | FAIL(base) | — |
| 47 | 20261003200000 | f1c_authority_write_boundaries | A | F1C: repair recorded; SHA-256 `8296852…dd` | FAIL(base) | — |

## Mismatch analysis

- **Recorded-but-missing-source (LEDGER_ONLY):**
  - the pre-2026-08-31 base history (F0: about 36 versions);
  - the alternate versions under which class C files were applied.

  Their effect is present in production by definition, since production runs on them. None can be replayed from the repo. They become documentation and baseline input, never new migration files.
- **Applied-but-unrecorded:** objects present in production with no migration anywhere:
  - `calendar_reminder_offset_valid`;
  - the `us-media` bucket and its policies, and `stories` / `story_views` (M5A §7: "created outside tracked history, dashboard/manual SQL");
  - `monthiversary-job` and its cron.
- **Superseded / recreated:** 29 functions are defined in more than one migration (for example `start_game_round` ×3, `equip_progression_reward` ×3, `widget_send_think_internal` ×3). Only the newest definition is live. Out-of-order replay of an older file silently reverts it.
- **Unsafe to replay:**
  - #20, whose source cannot apply;
  - #2, #15 and #42, which apply cleanly and downgrade newer behaviour;
  - any file with `grant … to authenticated` on functions F1B later revoked (#29 re-grants `list_couple_questions`, `update_couple_question`, `archive_couple_question` and `list_game_sessions`). `create or replace` keeps ACLs, but an explicit `grant` re-opens them.
- **Future documentation placeholders:** all 46 pre-baseline files once a baseline exists (see the canonical model). Do not delete them, and do not manufacture files to make the lists equal.

---

# CURRENT DATABASE OBJECTS

| Object class | Repo defines (VERIFIED repo) | Production | Production-only (derived) |
|---|---|---|---|
| Public tables | **27** created | **57**, all RLS-enabled (LAST OBSERVED F1C 2026-10-03); NOT VERIFIED today (block 2/3) | **~30**: 26 named in repo SQL/runtime but never created (below), plus `relationship_milestones`, plus ~3 unnamed (Gioca v1 storage, see block 3) |
| Private tables | 2 (`left_for_you_cleanup_queue`, `game_swipe_v1_catalog`) | NOT VERIFIED | NOT VERIFIED |
| Views | 1 (`public.relationship_event_history`) | NOT VERIFIED (block 7) | — |
| Types | 1 (`private.game_v2_candidate`) | NOT VERIFIED | — |
| Public functions | **54** | **70** (LAST OBSERVED F1B) | **16**, exact list below. 54 + 16 = 70, consistent. |
| Private functions | **73** | **75** (LAST OBSERVED F1B) | **2**: `current_couple_id`, `us_touch_updated_at`. 73 + 2 = 75, consistent. |
| SECURITY DEFINER | 118 occurrences in SQL | public 67, private 29 (LAST OBSERVED F1B) | NOT VERIFIED |
| Triggers | 19 created | NOT VERIFIED (block 6) | base-table triggers (e.g. `shared_events_touch_updated_at`, LAST OBSERVED F1C) |
| RLS policies | 22 `create policy` statements (repo tables only) | NOT VERIFIED (block 5) | every policy on the ~30 base tables |
| Column grants | F1C: `profiles.avatar_path`, `shared_events` (6 cols). Base: `couples (name, started_on, home_photo_path)` | LAST OBSERVED F1C | `couples` column grant |
| Extensions | **none enabled by the repo** | NOT VERIFIED (block 9) | `pg_cron`, `pg_net`, `supabase_vault`, `pgcrypto` are all required and all set up outside the repo |
| Realtime publication | 2 tables added (`think_reactions`, `left_for_you`) | NOT VERIFIED (block 8). M5A 2026-09-22 listed `stories`, `story_views`, `moments`, `moment_photos` | client subscribes to **14** tables, so up to **12** memberships are production-only |
| Storage buckets | 0 created; 2 `update storage.buckets` on `us-media` | `us-media`, private (LAST OBSERVED M5A); limit NOT VERIFIED (block 10) | the bucket and its 4 `storage.objects` policies |
| Cron jobs | 6 | 7 (LAST OBSERVED F1B) | 1 |
| Vault secrets | 4 created by migrations (`us_*_cron_key`) | NOT VERIFIED (block 13, names only) | at least the monthiversary cron key and probably the VAPID private key |

**Production-only public tables referenced by repo code or SQL** (VERIFIED repo; existence LAST OBSERVED via F1C's count of 57, names NOT VERIFIED individually):

| Domain | Tables |
|---|---|
| Identity | `profiles`, `couples`, `couple_invites` |
| Ti penso / Daily | `shared_messages`, `daily_questions`, `daily_answers`, `moods` |
| Moments / Stories | `moments`, `moment_photos`, `stories`, `story_views` |
| Events / Noi | `shared_events`, `shared_event_completions`, `relationship_milestones`, `couple_locations`, `bucket_items`, `activity` |
| Push / widget | `push_subscriptions`, `push_event_log`, `notification_preferences`, `device_push_tokens`, `widget_tokens` |
| Quest | `bond_weekly_state`, `bond_weekly_quests`, `bond_quest_templates` (including the template **content**) |
| Legacy Gioca v1 | `quiz_responses`, `partner_knowledge_attempts` (+ ~3 unnamed set/deck tables) |

**Production-only functions** (LAST OBSERVED F1B MATRIX `tests/f1b-rpc-grant-hardening.test.js`, compared with repo definitions):

| Class | Functions |
|---|---|
| Used by RLS / helpers | `private.current_couple_id()` (referenced by 16 repo migrations), `private.us_touch_updated_at()`, `public.calendar_reminder_offset_valid(uuid,integer)` |
| Client-required | `get_daily_state(uuid)`, `complete_shared_event(uuid,date)`, `register_web_push_subscription(text,text,text,bigint,text)`, `remove_web_push_subscription(text)` |
| Server-required | `get_internal_vapid_private_key()` (6 Edge Functions), `get_internal_monthiversary_cron_key()`, `award_relationship_milestone(uuid,date,integer,text,integer)` |
| Legacy (revoked by F1B) | `get_weekly_quiz_sets`, `get_quiz_state`, `save_quiz_answer`, `get_weekly_game_sets`, `get_partner_knowledge_hub`, `complete_partner_knowledge_deck`, `register_push_token`, `get_web_push_status` |

---

# MATERIAL SCHEMA DRIFT

Only drift that changes behaviour or reconstructability. "Production state" is LAST OBSERVED or NOT VERIFIED as tagged.

| # | Object | Production state | Repository state | Likely origin | Risk | Proposed canonical source |
|---|---|---|---|---|---|---|
| D1 | Base schema: ~30 public tables, their columns, constraints, indexes, RLS policies, triggers, grants | Present, 57 tables, RLS on (LAST OBSERVED F1C) | Absent. Altered by 20+ migrations, never created | Pre-repo development (from 2026-08-18) via dashboard/MCP | **High.** No rebuild, no staging, no realistic tests (each test hand-writes a partial fixture) | **Production**, captured as a baseline dump |
| D2 | `private.current_couple_id()` | Present, SECURITY DEFINER, `search_path=public` (LAST OBSERVED F1C, verbatim in its test) | Absent, used by 16 migrations | Pre-repo | **High.** Every couple-scoped RLS policy depends on it | Production → baseline |
| D3 | `calendar_reminders` all-day offset rule | CHECK `calendar_reminder_offset_valid(entry_id, offset_minutes)` + helper function (LAST OBSERVED F1B/F1C) | CHECK with a `not exists (select …)` sub-query; **PostgreSQL refuses it** (VERIFIED replay: `cannot use subquery in check constraint`) | m6d applied in a corrected form that was never committed back | **High** for reconstruction; none at runtime | **Production**; the repo must record the applied form |
| D4 | `calendar_reminders_insert_couple` policy | Recipient/entry sub-queries compare `p.couple_id = p.couple_id` (tautology, inert since F1C) | Same bug in source: unqualified `couple_id` binds to the inner alias | Authoring bug, faithfully applied | Low (no INSERT grant since F1C) | Repo (fix in the F1C policy-cleanup follow-up, not F2) |
| D5 | Monthiversary subsystem: `relationship_milestones`, `award_relationship_milestone`, `get_internal_monthiversary_cron_key`, `monthiversary-job`, cron #7 | Deployed and running (LAST OBSERVED F1B) | Only consumers: `events.js` reads, `app.js` Realtime, the progression trigger `progression_milestone_complete` (20261002181500) | Pre-repo feature | **High.** Its source is lost; the XP and Noi milestone feed would not survive a rebuild | Production → recover source into the repo |
| D6 | Quest tables + `bond_quest_templates` content | Present (LAST OBSERVED via the M12D preflight passing in prod) | Tables absent; RPCs present (20261001133906) | Pre-repo | **Medium/High.** Quest cannot be rebuilt; template content exists nowhere else | Production → baseline + seed |
| D7 | Realtime membership | NOT VERIFIED; M5A saw 4 tables on 2026-09-22 | Repo adds 2; client listens on 14 | Dashboard toggles | **Medium.** A rebuild silently loses live updates | Repo, once captured (one idempotent migration) |
| D8 | `us-media` bucket + 4 `storage.objects` policies | Present (LAST OBSERVED M5A) | Only two `update storage.buckets` | Dashboard | **High** for rebuild (all media access) | Production → baseline |
| D9 | `us-media.file_size_limit` | NOT VERIFIED (block 10) | m5g2 sets 40 MiB but says "prepared only"; client allows 40 MB video | Possibly never applied | **Medium, user-visible:** 25–40 MB videos would fail upload | Decide after block 10 |
| D10 | Extensions `pg_cron`, `pg_net`, `supabase_vault`, `pgcrypto` | Present (implied by live cron/vault use) | Never enabled; m10c also relies on Supabase's `extensions` search_path for `gen_random_bytes` | Dashboard | Medium (a rebuild fails at the first cron/vault statement) | Repo (baseline declares them) |
| D11 | Hard-coded project URL in 4 cron commands and the Android widget | Correct for prod | Same literal `iiakdfsxpywdkxravqjh` | Convenience | **Replay hazard:** a staging rebuild would fire cron at **production** Edge Functions (rejected only because the keys differ) | Repo; parametrise via a vault secret later |
| D12 | Progression toggle version | Probably ledger `20261002171949` | File `20261002181501` | Renamed after apply to fix ordering | Medium (`db push` hazard, see matrix #42) | Ledger reconciliation |

Not drift (verified consistent): the 54 repo public functions all exist in production with the same names (F1B MATRIX), and the F1A/F1B/F1C files match what production ran (F1C SHA-256 recorded; F1A/F1B self-checks).

---

# EDGE FUNCTION MATRIX

Repo: **13** functions (VERIFIED repo). Deployed: **13** (LAST OBSERVED F1B 2026-10-03, `supabase functions download` of all 13). Deployed list today: NOT VERIFIED (`supabase functions list`).

| Function | In repo | `verify_jwt` (config.toml) | Repo callers (VERIFIED repo) | Deployed | Class |
|---|---|---|---|---|---|
| calendar-reminders-worker | yes | false (cron key) | cron `us-calendar-reminders-dispatch` | yes (implied) | SAME_NAME_SOURCE_NOT_VERIFIED |
| cleanup-left-for-you | yes | false (`M5I_CLEANUP_SECRET`) | **none**: no cron, no client, no SQL | **no** (LAST OBSERVED F1B) | **REPO_ONLY**, dormant by design (M5I §10: "ship unscheduled first") |
| daily-question-push-worker | yes | false | cron `us-daily-question-push` | yes | SAME_NAME_SOURCE_NOT_VERIFIED |
| delete-moment | yes | true | `app.js:2601` | yes | SAME_NAME_SOURCE_NOT_VERIFIED |
| game-v2-push | yes | true | `app.js:217` (`game_*` events) | yes (memory) | SAME_NAME_SOURCE_NOT_VERIFIED |
| game-v2-push-worker | yes | false | cron `us-game-v2-push` | yes (memory) | SAME_NAME_SOURCE_NOT_VERIFIED |
| left-for-you-push-worker | yes | false | cron `us-left-for-you-push-sweep` | yes | SAME_NAME_SOURCE_NOT_VERIFIED |
| send-web-push | yes | true | `app.js:217` | yes | SAME_NAME_SOURCE_NOT_VERIFIED |
| spotify-search | yes | true | `left-for-you.js:684` | yes | SAME_NAME_SOURCE_NOT_VERIFIED |
| us-widget-state | yes | false (widget token) | Scriptable `US-Noi.js`, `US-Ti-Penso.js` | yes; `PROVENANCE.md` records deployed v3 recovered, then edited | SAME_NAME_SOURCE_NOT_VERIFIED |
| widget-device-token | yes | true | `app.js:78/84` | yes | SAME_NAME_SOURCE_NOT_VERIFIED |
| widget-scriptable-setup | yes | false | `settings.js:338/354/378`, Scriptable | yes | SAME_NAME_SOURCE_NOT_VERIFIED |
| widget-think-send | yes | false | Scriptable, Android `UsWidgetActionClient.java:12` | yes | SAME_NAME_SOURCE_NOT_VERIFIED |
| **monthiversary-job** | **no** | not in config.toml | no repo caller; cron #7 (inferred) | **yes** (LAST OBSERVED F1B) | **DEPLOYED_ONLY** |

- **MATCH count:** 0 can be asserted today. Nobody has compared deployed bundles with repo sources since F1B, and F1B compared only RPC references, not bytes.
- **LEGACY_CANDIDATE:** none. Every repo function except `cleanup-left-for-you` has a live caller, and `cleanup-left-for-you` is unscheduled on purpose, not obsolete. Its retirement or activation is a product decision (F2A.3).
- **Configuration outside the repo** (names only, VERIFIED repo):
  - `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`;
  - `M5I_CLEANUP_SECRET`;
  - the VAPID private key behind `get_internal_vapid_private_key()`;
  - `SUPABASE_SECRET_KEYS` / `SUPABASE_SERVICE_ROLE_KEY` (platform);
  - `VAPID_SUBJECT`, still hard-coded as `https://usfinal.vercel.app` (F1A follow-up #9).

---

# CRON MATRIX

Repo jobs: VERIFIED (repo). Live state, last run, failures: NOT VERIFIED (block 11). F1B saw **7** live jobs on 2026-10-03.

| # | Job | Schedule | Command | Calls | Edge Function | Repo source | Notes |
|---|---|---|---|---|---|---|---|
| 1 | us-widget-scriptable-state-expiry | `* * * * *` | SQL `update widget_tokens set revoked_at` | — | — | 20260924194500 (**C**) | 1,440 runs/day for 3 widget tokens. F1C saw it report `UPDATE 0` throughout |
| 2 | us-calendar-reminders-dispatch | `* * * * *` | `net.http_post` + vault `us_calendar_reminders_cron_key` | HTTP | calendar-reminders-worker | 20260928210000 (**C**; source not appliable as written) | 0 reminder rows (F1C), yet 1,440 HTTP calls/day |
| 3 | us-left-for-you-push-sweep | `* * * * *` | `net.http_post` + vault `us_left_for_you_push_cron_key` | HTTP | left-for-you-push-worker | 20260929201958 (A) | |
| 4 | us-daily-question-materialize | `1 * * * *` | `private.materialize_daily_question(...)` | RPC | — | 20260930045233 (A) | guarded on `pg_extension` |
| 5 | us-daily-question-push | `*/10 * * * *` | materialize + `net.http_post` | RPC + HTTP | daily-question-push-worker | 20260930061045 (A) | Also materializes, so it overlaps job 4. Idempotent, harmless |
| 6 | us-game-v2-push | `*/10 * * * *` | `net.http_post` + vault `us_game_v2_push_cron_key` | HTTP | game-v2-push-worker | 20260930153755 (A) | |
| 7 | **unknown** (inferred monthiversary) | NOT VERIFIED | NOT VERIFIED (uses `get_internal_monthiversary_cron_key` per F1B) | HTTP (inferred) | monthiversary-job | **none** | **Orphan of the repo** |

- **Cron pointing to missing functions:** none expected. Job 7's target exists in production, though not in the repo. Confirm with blocks 11 and 13.
- **Repo cron absent from production:** none expected, since F1B's count of 7 = 6 + 1. A job whose migration version is class C may still have been registered by hand (job 2: the earlier m6d design said "registered separately at deploy, same pattern as monthiversary-job"). Confirm the `command` text with block 11.
- **Duplicates:** the materialization overlap between jobs 4 and 5 (by design).
- **Legacy candidates:** job 1's every-minute cadence is heavy for its purpose. Changing it is F2C scope.
- **Guard drift:** every repo job registers only `if not exists (jobname)`. A later migration that changes a command never updates the live job, so live commands can lag repo intent. Block 11 compares them.
- **Run volume (derived):** 3 × 1,440 + 2 × 144 + 24 = **4,632 runs/day, about 139k/month** into `cron.job_run_details`, with no purge in the repo. Actual size: NOT VERIFIED (block 11).

---

# OPERATIONAL / RETENTION OBSERVATIONS

All counts are NOT VERIFIED today (block 14). Only the mechanisms are VERIFIED (repo).

| Area | Mechanism | Evidence | Expected state |
|---|---|---|---|
| Expired Left for You | Rows are eligible 30 days after `seen_at` unless conserved, but **no worker is deployed or scheduled** (`cleanup-left-for-you` dormant). Rows seen before M5I have `cleanup_eligible_at` NULL and are never eligible | `20260924160000` lines 99–123 | Rows and their `us-media` objects accumulate indefinitely. F0 reported expired rows |
| Cron history | No `cron.job_run_details` purge | cron matrix | ~4.6k rows/day |
| `net._http_response` | pg_net keeps responses for a bounded TTL by default | — | block 12 |
| `push_event_log` | Dedupe log, insert-only except rollback deletes; no retention | `_shared/think-web-push.ts:28–73` | grows with every push |
| Widget codes/installations | Expired setup codes and installations are never deleted (job 1 only revokes tokens) | `20260924194500` | small |
| Legacy compatibility data | `quiz_responses`, `partner_knowledge_attempts`, `couple_questions` (0 rows), `device_push_tokens` (0 rows), `couple_invites` (2 used): RPCs revoked by F1A/F1B, data kept | F1A/F1B | candidates for an archive decision, not deletion |
| Anonymous users / media ownership | 8 anonymous users, 28 objects owned by them (LAST OBSERVED F1A) | F1A §6 | **out of scope**, a separate future mission |

---

# RECONSTRUCTION ASSESSMENT

**"If production disappeared tomorrow, can this repository rebuild the intended US backend without guessing?" — NO.**

Concrete evidence (VERIFIED replay): an empty PostgreSQL 16 with Supabase's platform objects (roles, `auth`, `storage`, `extensions.pgcrypto`, an empty `supabase_realtime`) and generous `vault`/`pg_cron`/`pg_net` stubs → **1/47 migrations apply** (`20260923180800`, a no-op `update storage.buckets`). The first file already fails.

**Actual reconstruction blockers** (production would need guessing):
1. About 30 base tables: columns, constraints, indexes, grants, and RLS policies (D1).
2. 18 production-only functions, including `private.current_couple_id()` and `get_daily_state()` (D2).
3. The monthiversary subsystem: Edge source, cron, `award_relationship_milestone` (D5).
4. Quest tables and the `bond_quest_templates` content (D6).
5. The `us-media` bucket, its storage policies and Realtime membership (D7, D8).
6. The VAPID private key source and the other secrets (by design they must not be in the repo, but the repo doesn't even name them in one place).

**Dangerous replay hazards:**
- The m6d source cannot apply (D3).
- Re-runnable downgrades (#2, #15, #42).
- Re-grants of revoked functions (#29).
- Cron hitting production from a staging rebuild (D11).
- In practice, `supabase db push` would refuse while LEDGER_ONLY versions exist (fail-safe), but `migration repair` mistakes or `--include-all` would not.

**Historical provenance gaps (no rebuild impact once a baseline exists):**
- 46 pre-baseline files whose exact applied text is unknowable;
- class B/C ledger versions.

**Harmless ledger inconsistencies:** version-only differences for files whose effect is present and which are never replayed (most class C files after a baseline).

**With a captured schema-only dump of production as baseline:** PARTIALLY → YES. The remaining gaps would be the monthiversary-job source (recoverable with `supabase functions download`), the Quest template content (a data seed), and the secrets manifest.

---

# CANONICAL SOURCE-OF-TRUTH MODEL

The goal is one direction of truth, kept small:

1. **Schema: the repository is canonical, from one baseline onward.**
   - `supabase/migrations/` = one **baseline** file (a schema-only `supabase db dump` of production, taken read-only), then the forward migrations dated after it.
   - The 47 current files, and any recovered pre-repo SQL, move to `supabase/migrations_history/` as provenance documentation that is never executed.
   - Until the ledger is reconciled (F2A.2), the baseline can live outside `migrations/` (for example `supabase/baseline/`) and be used for local and staging rebuilds and tests. That needs no production change.
2. **Ledger = a record of which repo files ran, nothing else.**
   - After F2A.2, `supabase migration list --linked` must show every remote version with a local file, and none the other way.
   - Every production apply records exactly its own file's version (as F1A/F1B/F1C did).
   - A version is never renamed after apply.
   - "Prepared only" files are not committed under `migrations/` until approved for apply.
3. **Production may lead the repo only inside an apply.** Any SQL run in production (dashboard, MCP, hotfix) is committed verbatim as a migration **before** the ledger row is written. A corrected-on-apply file is committed in its applied form (D3 must not recur).
4. **Edge Functions: the repo source is canonical; deployment state is derived.**
   - Every deployed function has a directory in `supabase/functions/` and an entry in `config.toml` with explicit `verify_jwt`.
   - Deploys happen only from a pushed commit, and the deployed commit SHA and function version are recorded in the mission doc.
   - Repo-only functions are either scheduled or marked dormant in `config.toml` with a comment.
5. **Cron: defined in migrations only**, idempotent by job name, with the target URL and keys from vault. A command change uses `cron.alter_job` or unschedule-plus-schedule in a migration, never a dashboard edit.
6. **Operational config: names in the repo, values never.** One secrets manifest (name, owner, consumer, rotation) for Edge secrets and vault secrets. Values stay in Supabase.
7. **Drift check:** the read-only pack becomes a periodic diff (counts, function `body_md5`, policy md5, cron commands, ledger) against the baseline expectation. Running it is read-only. Scheduling it is optional.

---

# REMEDIATION PLAN

Small missions, in dependency order. None is implemented here.

| Mission | Scope | Production risk | Depends on | Model | Effort |
|---|---|---|---|---|---|
| **F2A.1 — Production baseline capture + missing-source recovery** | Ingest read-only evidence (the pack in this branch, `supabase migration list --linked`, `supabase db dump --linked` schema-only for `public`, `private`, plus storage/realtime/cron metadata, `supabase functions list`, `supabase functions download monthiversary-job`). Then: fill every NOT VERIFIED cell here; commit the baseline outside `migrations/`; recover `monthiversary-job` source, its cron definition, the Quest template seed and the m6d applied form; prove the rebuild by replaying baseline + forward migrations on empty PG16 and comparing fingerprints with production. Repo writes only | **None** (read-only on production) | Francesco runs the read-only commands, or grants read-only access | **Opus High** | Medium |
| **F2A.2 — Migration ledger reconciliation** | Using F2A.1's exact lists, make `migration list` clean: `migration repair` only (ledger rows; no schema). Move the baseline into `migrations/` and historical files to `migrations_history/`. Re-verify that `db push --dry-run` is a no-op | Low–Medium (ledger DML only; needs explicit authorization) | F2A.1 | Opus High | Low–Medium |
| **F2C — Edge / cron consolidation** | `monthiversary-job` into the repo deploy flow; cron #7 into a migration; job 1/2 cadence; `VAPID_SUBJECT`; `verify_jwt` parity check; byte-compare deployed vs repo (`functions download`) and redeploy only on mismatch; decide `cleanup-left-for-you` (activate with a schedule, or retire) | Medium (deploys and cron changes) | F2A.1 (F2A.2 for cron migrations) | Opus Medium | Medium |
| **F2A.3 — Operational retention** | Report the blast radius first (M5I §10), then activate Left for You cleanup, purge `cron.job_run_details`, add `push_event_log` and expired widget-code retention, and decide on legacy Gioca v1 data | Medium (deletes data; each step explicitly authorized) | F2C (cleanup function scheduled) | Sonnet High | Medium |

**Recommended next mission: F2A.1.** It is the only step that turns "NO" into "YES" without touching production. F2A.2, F2C and F2A.3 all need its exact lists.

---

# RISKS

- **`supabase db push`** must stay forbidden until F2A.2 (matrix #2, #15, #20, #29, #42).
- **`supabase migration repair`** is equally dangerous with the wrong version list. Use it only from F2A.1's verified ledger dump.
- **Monthiversary single point of failure:** if the deployed function is deleted or overwritten, its source is lost. Recover it in F2A.1 before any Edge cleanup.
- **m5g2 / 40 MB:** a possible live upload failure for 25–40 MB videos (D9). Check block 10 first. It is cheap and user-visible.
- **Staging rebuilds** would call production Edge Functions from cron (D11) until the URL is parametrised.
- **Every-minute cron jobs** create steady load and log growth for near-empty work.
- **This audit's production cells are LAST OBSERVED or NOT VERIFIED.** A production change made after 2026-10-03 15:30 UTC (the end of F1C) is not reflected.

---

# DEFERRED

Recorded for other roadmap items. F2A does not own these.

- **RLS / policy cleanup (F1C follow-ups):**
  - inert `messages_update_recipient` and `calendar_reminders_*` write policies;
  - the tautological reminder INSERT policy (D4);
  - broad anon table grants;
  - default privileges.
- **Calendar helper oracle (F1B P2):** revoke authenticated EXECUTE now that only service_role writes reminders.
- **Auth:** anonymous users and their 28 `us-media` objects; the profile-less email account; leaked-password protection (F1A §6/§7).
- **Realtime lifecycle:** subscription scope and reconnect behaviour. F2A only flags membership drift (D7).
- **Performance / indexes:** not assessed.
- **Gioca, Rewards, Pets, UI, Service Worker, native packaging:** untouched.
- **Policy, index and advisor reviews:** advisor output was not re-read (no access). F1C last saw 35 security findings.

---

## Appendix A — How the replay was run

These are throwaway local commands, not part of the repo, and touch no production.

1. `initdb` a PostgreSQL 16 cluster on a local socket.
2. Create the platform skeleton:
   - roles `anon`, `authenticated`, `service_role`;
   - `auth.users`, `auth.uid()`, `auth.jwt()`;
   - `storage.buckets` / `storage.objects` / `storage.foldername()`;
   - `extensions.pgcrypto`;
   - publication `supabase_realtime`;
   - stubs for `vault.secrets` / `vault.decrypted_secrets` / `vault.create_secret`, `cron.job` / `cron.schedule`, and `net.http_post`.
3. Apply each `supabase/migrations/*.sql` in filename order, each with `psql -v ON_ERROR_STOP=1 --single-transaction`, and record the first `ERROR` per file. The result is in the per-file matrix.
4. Separately, run `create temp table t(a int, check (not exists (select 1 …)))` → `ERROR: cannot use subquery in check constraint`. This confirms D3.

## Appendix B — Read-only evidence Francesco can provide

Any one of these unblocks F2A.1. All are read-only for production.

1. **Recommended, no access grant:**
   - run [`F2A_PRODUCTION_READONLY_QUERIES.sql`](F2A_PRODUCTION_READONLY_QUERIES.sql), 14 blocks, `BEGIN READ ONLY … ROLLBACK`, each returning one JSON cell; it was syntax-checked here on PG16;
   - plus the CLI commands `supabase migration list --linked`, `supabase functions list --project-ref iiakdfsxpywdkxravqjh`, and `supabase db dump --linked --schema public,private -f prod_schema.sql` (schema only);
   - plus `supabase functions download monthiversary-job`.

   Paste or attach the outputs in the thread.
2. **Live read access for a cloud session:**
   - add `api.supabase.com` and `iiakdfsxpywdkxravqjh.supabase.co` (or the database pooler host) to the cloud environment's allowed domains;
   - provide a credential limited to reading, for example a Postgres role with only `pg_read_all_data` + `pg_read_all_settings`, as an environment secret.

   A personal access token would grant write access too, so prefer the database role.
3. **A Supabase connector** started in read-only mode, scoped to this project (the M5A manifest used a read-only "us-read" connection on 2026-09-22).
