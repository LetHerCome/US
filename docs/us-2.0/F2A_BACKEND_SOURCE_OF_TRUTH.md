# US 2.0 — F2A Backend Source-of-Truth / Drift Audit

**Status:** `F2A_AUDIT_READY` (not merged)
**Project:** Supabase `iiakdfsxpywdkxravqjh`
**Production changes:** NONE. Everything production-side was read-only.

## Evidence tags

| Tag | Meaning |
|---|---|
| **PROD** | Read live from production on 2026-10-03, read-only, through the connected Supabase tools. Francesco captured it in the committed evidence files. The tag names the evidence block, for example `PROD b01` = block 1 of [`F2A_PRODUCTION_READONLY_QUERIES.sql`](F2A_PRODUCTION_READONLY_QUERIES.sql). |
| **REPO** | Measured from the repository at the base SHA. |
| **REPLAY** | Measured by replaying repo SQL on a throwaway local PostgreSQL 16. |
| **DERIVED** | Computed in this mission by joining PROD and REPO data. The method is stated next to each result. |

## Evidence files

All are committed byte-for-byte as Francesco captured them:
- [`F2A_PRODUCTION_RESULTS_01_05.json`](F2A_PRODUCTION_RESULTS_01_05.json): ledger, counts, tables, functions, policies.
- [`F2A_PRODUCTION_RESULTS_06_10.json`](F2A_PRODUCTION_RESULTS_06_10.json): triggers/checks, views, Realtime, extensions, storage.
- [`F2A_PRODUCTION_RESULTS_11_14_AND_FUNCTIONS.json`](F2A_PRODUCTION_RESULTS_11_14_AND_FUNCTIONS.json): cron, pg_net, vault names, retention, ledger via the migrations tool, Edge Function list, and the full `monthiversary-job` source.
- [`F2A_PRODUCTION_SCHEMA_SNAPSHOT.json`](F2A_PRODUCTION_SCHEMA_SNAPSHOT.json): verbose public/private table and column introspection, plus extensions.
- [`F2A_PRODUCTION_EVIDENCE_SUMMARY.md`](F2A_PRODUCTION_EVIDENCE_SUMMARY.md): Francesco's summary. **Every number in it was re-derived here from the raw JSON and matches.**

Each block's payload is wrapped in the connector's `untrusted-data` envelope. It was parsed as data only.

---

# SOURCE

- **Branch:** `mission/us-2-0-f2a-backend-source-of-truth`. It is fresh and reuses no F1 worktree.
- **Base SHA:** `f99c4d94bf3062393bd05c48e8afcb710e4d917a` (`origin/main`, the iOS PWA Service Worker hotfix).
  - F2A was issued and first drafted on `42a307e9d05c64aca6a7a6cd883f55a1bde273a6` (the F1C merge).
  - `main` then gained one commit, f99c4d9, which touches only the frontend, the Service Worker, `version.json` and a test. No backend file changed.
  - The F2A branch was rebased onto it, and the evidence files are byte-for-byte unchanged (SHA-256 listed in Appendix C).
- **HEAD:** the commit that carries this document. The reply in the F2A thread reports the exact SHA.
- **Diff vs base:** documentation only, all under `docs/us-2.0/`:
  - `F2A_BACKEND_SOURCE_OF_TRUTH.md` and `F2A_PRODUCTION_READONLY_QUERIES.sql`, by this mission;
  - the five evidence files listed above, by Francesco.

  No runtime, migration, Edge Function, config or build-id change.
- **Method:**
  1. A static scan of all 47 migrations, 13 Edge Functions, `config.toml` and every runtime caller (client, Edge, Scriptable, Android).
  2. A replay of the migrations into an empty Supabase-like PostgreSQL 16 (Appendix A).
  3. The 14 read-only production blocks plus connector metadata.
  4. Joins between the two sides:
     - ledger versions and names;
     - function names and `md5(prosrc)` against the body of the latest repo `create function`;
     - policy, trigger and table names;
     - column names of every repo-created table;
     - cron commands, whitespace-normalised;
     - Edge `verify_jwt`.

---

# EXECUTIVE STATE

1. **The repository cannot rebuild the backend. Reconstruction: NO.**
   - Replayed on an empty Supabase-like database, only **1 of 47** migrations applies.
   - The base schema exists only in production: **30 of 57** public tables, **18 of 145** functions (including `private.current_couple_id()`), **55 of 73** public RLS policies, the `us-media` storage policies, and **13 of 15** Realtime memberships.
   - It was built by **36 ledger migrations dated 2026-08-18 to 2026-08-21** that have no file in the repo.
2. **The ledger is exactly explained** (PROD b01):
   - **83** ledger rows vs **47** repo files: **37** exact matches, **10 REPO_ONLY**, **46 LEDGER_ONLY** (36 pre-repo base + 10 alternates).
   - All 10 REPO_ONLY files are the same migrations recorded under a different version, matched 1:1 by name. Their effects are present in production. Nothing is UNKNOWN.
3. **The repo matches production almost everywhere it covers.**
   - **119 / 127** repo-defined functions are byte-identical in production (body md5).
   - All 29 repo-created tables have identical column sets, and all 12 repo-added columns on base tables exist.
   - All 18 repo policies, all 19 repo triggers and all 6 repo cron commands are present. The cron text is identical.
   - Edge `verify_jwt` matches `config.toml` for all 12 shared functions.
4. **Real drift is small and named:**
   - **8 function bodies** differ from their latest repo definition;
   - **m6d**: its CHECK constraint cannot be applied as written, and production uses an unrecorded helper;
   - the **monthiversary subsystem** (Edge source, cron, two RPCs) exists only in production.
5. **Edge Functions: 13 in the repo, 13 deployed, 12 shared.**
   - `monthiversary-job` (v4, ACTIVE) is deployed only. Its source was recovered into the evidence, but it is still not in `supabase/functions/`.
   - `cleanup-left-for-you` is in the repo only. It is not deployed and not scheduled.
6. **Cron:**
   - 7 active jobs, 0 failures in 7 days.
   - 6 are defined in the repo with identical commands. 1 (`us-monthiversary-hourly`) is ledger-only history.
   - `cron.job_run_details` holds **26,798** rows since 2026-08-20 and grows by about 4,656 a day, with no purge.
7. **Retention:**
   - **Left for You** has nothing to clean yet: 0 rows are eligible, and 18 legacy rows are never eligible. The first rows become eligible around **2026-10-28**, and no worker is deployed for them.
   - **Other tables** are small. Logs (cron history, `push_event_log`, `net._http_response`) grow without bound.
8. **Canonical going forward:**
   - the repository, from a captured production baseline;
   - the ledger reconciled to it;
   - Edge Functions and cron defined only from the repo.

   **Next mission: F2A.1, Production Baseline & Missing-Source Recovery.** It writes to the repo only.

---

# MIGRATION MATRIX

## Counts (DERIVED from PROD b01 + REPO)

| Bucket | Count | Detail |
|---|---|---|
| Repo migration files | **47** | `20260831131130` … `20261003200000` |
| Production ledger rows | **83** | `20260818181916` … `20261003200000`. The `list_migrations` connector output has the same 83 versions |
| **REPO_AND_LEDGER** | **37** | same version in both |
| **REPO_ONLY** | **10** | each recorded in the ledger under a different version (table below), so the effect is present |
| **LEDGER_ONLY** | **46** | 36 pre-repo base migrations + the 10 alternate versions of the REPO_ONLY files |
| **NON_CANONICAL / UNKNOWN** | **0** | every version is accounted for |
| Duplicate versions | 0 in the repo, 0 in the ledger | |
| Version/name collisions | 0. **3 cosmetic name mismatches** among the 37: the ledger names of `20260901192817`, `20260902101619` and `20260902114732` embed an older filename (e.g. `20260901160000_daily_question_outcomes.sql`) | harmless |

## REPO_ONLY ↔ LEDGER_ONLY pairs (same migration, different version)

"Effect present" is checked against PROD b03/b04/b06/b10/b11.

| Repo file | Ledger version | Effect present in production? | Replay hazard if the CLI treats the repo file as pending |
|---|---|---|---|
| `20260831131130_widget_think_silent_send` | `20260831212415` | yes: tables present. Function later superseded, and its prod body differs (see drift) | fails (plain `create table`), safe |
| `20260831213000_fix_widget_think_couple_id_ambiguity` | `20260831213824` | yes (superseded by `20260922120726`) | **succeeds and downgrades `widget_send_think_internal`** |
| `20260923180800_m5g2_video_upload_limit_40mb` | `20260923200535` | **yes**: `us-media` limit is 41,943,040 B (PROD b10). The "prepared only" header is stale | harmless (same value) |
| `20260923210000_m5g3_left_for_you_notification_preference` | `20260924072631` | yes: column present; functions superseded by m11d | **succeeds and downgrades `get/set_notification_preference` to pre-M11D bodies** |
| `20260924160000_m5i_ephemeral_left_for_you` | `20260928050608` | yes: trigger and queue present; 4/5 bodies identical, `claim_left_for_you_cleanup` differs | mostly re-runnable. Replay would **overwrite the production body of `claim_left_for_you_cleanup`** |
| `20260924194500_widget_scriptable_setup` | `20260925143951` | yes: 3/3 bodies identical; cron identical | fails (plain creates), safe |
| `20261001133906_m12d_quest_server_authority` | `20261001144011` | yes: 9/9 bodies identical | re-runnable, identical |
| `20261002181500_us_progression_v1` | `20261002171243` | yes: 13 bodies identical (2 superseded) | partly re-runnable. **Downgrades `get_progression_v1` and `equip_progression_reward`** |
| `20261002181501_progression_reward_toggle_unequip` | `20261002171949` | yes (superseded by Rewards V2) | **succeeds and downgrades `equip_progression_reward`** |
| `20261002190000_swipe_v1` | `20261002181136` | yes: 1/1 body identical | fails (plain creates), safe |

The ledger order also differs from repo order for these files. For example, m5i was applied on 2026-09-28 after M6A, while the repo sorts it on 09-24. This doesn't matter for production, but a replay follows filename order.

## LEDGER_ONLY base history (36, PROD b01): no file in the repo

| Range | Migrations |
|---|---|
| 2026-08-18 | `init_us_sync_schema`, `add_private_pairing_and_seed`, `anonymous_private_pairing_v2`, `remove_legacy_pairing_rpc`, `protect_pairing_role_transfer`, `prevent_direct_pairing_table_reads`, `lock_private_helper_schema`, `fix_claim_us_role_digest_schema`, `real_quiz_sync_and_private_results`, `normalize_quiz_questions_for_shared_comparison`, `seed_daily_questions_aug_sep_2026`, `clean_quiz_wording_for_both_partners`, `add_profile_avatar_path` |
| 2026-08-19 | `add_shared_home_photo`, `add_couple_locations`, `add_device_push_tokens`, `weekly_quiz_rotation_and_bond_xp` |
| 2026-08-20 | `web_push_foundation`, `web_push_vapid_vault_access`, `web_push_rpc_permissions_fix`, `add_shared_events_and_widget_tokens`, `widget_tokens_service_only_public`, `add_moment_album_photos`, `performance1_enable_targeted_realtime`, `us_event_rewards_and_milestones`, `us_quiz_modes_engine`, `us_partner_knowledge_engine`, `seed_never_have_i_games`, `seed_agree_disagree_games`, `seed_would_you_rather_games`, **`us_monthiversary_scheduler`**, **`us_monthiversary_award_rpc`**, `settings2_notification_preferences` |
| 2026-08-21 | `harden_private_repair_profile_migration`, `fix_repair_claim_us_role_order`, `fix_role_repair_atomic_profile_bridge` |

- These built every production-only object listed under CURRENT DATABASE OBJECTS.
- Their exact SQL is still in `supabase_migrations.schema_migrations.statements` (not captured; an F2A.1 input).
- They must become provenance documentation, never new executable migrations.

## Repo files whose source differs from what production runs

| File (in ledger) | Finding | Evidence |
|---|---|---|
| `20260928210000_m6d_calendar_reminders` | Same version in the ledger, but **the repo text cannot be what was applied**. Its `calendar_reminders_allday_offset_check` uses a sub-query in CHECK, which PostgreSQL rejects. Production has `CHECK (calendar_reminder_offset_valid(entry_id, offset_minutes))`, with a helper function that exists in no migration | REPLAY (`cannot use subquery in check constraint`); PROD b06, b04 |
| `20260922120726`, `20260922120945`, `20260928071627`, `20260929121350`, `20260929121430`, `20260924160000` | Each holds the **latest** repo definition of a function whose production body differs (8 functions, see drift D3) | DERIVED md5 |

Full per-file replay results are in Appendix A.

---

# CURRENT DATABASE OBJECTS

| Object class | Production (PROD) | Repo defines (REPO) | Production-only (DERIVED) |
|---|---|---|---|
| Public tables | **57**, all RLS-enabled; 23 with FORCE RLS (b02, b03) | 27 | **30** |
| Private tables | **2** (b02) | 2 | 0 |
| Views | **1** `public.relationship_event_history` (b07) | 1 | 0 |
| Materialized views / enums | 0 / 0 (b02) | 0 / 0 | 0 |
| Public functions | **70** (b02) | 54 | **16** |
| Private functions | **75** (b02) | 73 | **2** |
| SECURITY DEFINER | public 67, private 29 (b02) | — | all 18 production-only functions are SECURITY DEFINER |
| Triggers | **20** (b06) | 19 | **1** (`shared_events_touch_updated_at`) |
| RLS policies | **73 public + 4 storage** (b02, b05) | 18 | **55 public + 4 storage** |
| Column grants (anon/authenticated) | **10** (b02): `profiles.avatar_path`, `shared_events` × 6, `couples` × 3 | 7 (F1C) | 3 (`couples` name, started_on, home_photo_path) |
| CHECK constraints | 154 (b06) | — | not individually diffed except D2 |
| Extensions | pg_cron 1.6.4, pg_net 0.20.4, pg_stat_statements 1.11, pgcrypto 1.3, plpgsql, supabase_vault 0.3.1, uuid-ossp 1.1 (b09) | **none enabled** | all 7 |
| Realtime `supabase_realtime` | **15** tables (b08) | 2 (`think_reactions`, `left_for_you`) | **13** |
| Storage | 1 bucket `us-media`: private, 40 MiB, 12 MIME types, 51 objects; 4 policies (b10, b05) | 2 `update storage.buckets` only | the bucket + 4 policies |
| Cron jobs | **7** active (b11) | 6 | 1 |
| Vault secrets (names) | 6: `us_{calendar_reminders,daily_question_push,game_v2_push,left_for_you_push,monthiversary}_cron_key`, `us_web_push_vapid_private` (b13) | 4 created by migrations | `us_monthiversary_cron_key`, `us_web_push_vapid_private` |

**The 30 production-only public tables** (DERIVED: b03 minus REPO; the row figure is `reltuples` or the snapshot count):

| Domain | Tables |
|---|---|
| Identity / pairing | `profiles`, `couples`, `couple_invites` |
| Ti penso / Daily | `shared_messages`, `daily_questions`, `daily_answers`, `moods` (0 rows) |
| Moments / Stories | `moments`, `moment_photos`, `stories`, `story_views` |
| Events / Noi | `shared_events`, `shared_event_completions`, `relationship_milestones`, `couple_locations`, `bucket_items`, `activity` (19) |
| Push / widget | `push_subscriptions`, `push_event_log`, `notification_preferences`, `device_push_tokens` (0), `widget_tokens` |
| Quest | `bond_weekly_state`, `bond_weekly_quests`, `bond_quest_templates` |
| Legacy Gioca v1 | `quiz_sets` (36), `quiz_questions` (252), `quiz_responses` (410), `weekly_quiz_rewards` (14), `partner_knowledge_attempts` (12) |

**The 18 production-only functions** (DERIVED: b04 minus REPO, all SECURITY DEFINER):

| Class | Functions |
|---|---|
| Helpers | `private.current_couple_id()`, used by 16 repo migrations and most policies · `private.us_touch_updated_at()` · `public.calendar_reminder_offset_valid(uuid,integer)` |
| Client RPCs | `get_daily_state(uuid)`, `complete_shared_event(uuid,date)`, `register_web_push_subscription(text,text,text,bigint,text)`, `remove_web_push_subscription(text)` |
| Server-only | `get_internal_vapid_private_key()`, `get_internal_monthiversary_cron_key()`, `award_relationship_milestone(uuid,date,integer,text,integer)` |
| Legacy (EXECUTE revoked by F1B) | `get_weekly_quiz_sets`, `get_quiz_state`, `save_quiz_answer`, `get_weekly_game_sets`, `get_partner_knowledge_hub`, `complete_partner_knowledge_deck`, `register_push_token`, `get_web_push_status` |

**Repo ⊂ production check (DERIVED):**
- every repo-created table, function, policy and trigger exists in production;
- every column of the 29 repo tables, and the 12 columns repo migrations add to base tables, exists;
- production has no extra columns on repo tables.

---

# MATERIAL SCHEMA DRIFT

| # | Object | Production state | Repository state | Likely origin | Risk | Proposed canonical source |
|---|---|---|---|---|---|---|
| D1 | **Base schema:** 30 tables, 18 functions, 55 policies, 1 trigger, 3 column grants, 7 extensions | Present (b02–b09) | Absent; altered by 20+ migrations | 36 LEDGER_ONLY migrations, 2026-08-18 → 21 | **High.** No rebuild, no staging, and tests hand-write partial fixtures | **Production** → captured baseline |
| D2 | `calendar_reminders_allday_offset_check` + `calendar_reminder_offset_valid()` | Helper function in CHECK (b06, b04) | Sub-query CHECK that PostgreSQL rejects; no helper | m6d corrected at apply time, never committed back | **High** for rebuild; none at runtime | **Production**; record the applied form |
| D3 | Function bodies differ (md5) from the latest repo definition: `public.send_think`, `public.set_think_reaction`, `public.widget_send_think_internal`, `public.claim_left_for_you_cleanup`, `public.claim_us_role`, `private.calendar_entries_guard_update`, `private.bucket_items_guard_calendar_link`, `private.bucket_items_guard_delete` | 8 bodies (b04) | 8 bodies with a different md5 | Edits to repo files after apply (`afc8f54` "fix(m5i): disambiguate…" is one), or production hotfixes. md5 alone can't tell comment-only edits from logic edits | **Medium.** A rebuild or replay could change behaviour of Ti penso, the widget, Left for You cleanup and the Da vivere/Calendar guards | **Production** (it is what runs), after an F2A.1 `pg_get_functiondef` diff |
| D4 | Monthiversary subsystem: `monthiversary-job` (Edge v4), cron `us-monthiversary-hourly`, `award_relationship_milestone`, `get_internal_monthiversary_cron_key`, vault `us_monthiversary_cron_key` | Active; 2 milestones, last 2026-09-21; cron 1,057 runs, 0 failures (b11, b14) | Only consumers (`events.js`, Realtime in `app.js`, the progression trigger) | LEDGER_ONLY `us_monthiversary_scheduler` / `_award_rpc` (2026-08-20) | **High.** It drives Noi milestones and Bond XP; no repo source | **Production** → recover into the repo |
| D5 | Realtime membership | 15 tables, including legacy `quiz_responses` (b08) | Adds 2 | Base migration `performance1_enable_targeted_realtime` + dashboard | **Medium.** A rebuild loses live updates on 12 subscribed tables; `quiz_responses` is a stale member with no subscriber | Repo, once captured |
| D6 | `us-media` bucket + 4 policies (`us_media_{select_same_couple,insert_own_folder,update_own,delete_own}`) | Private, 40 MiB, 51 objects (b10, b05) | Only updates the limit/MIME list | Dashboard (M5A §7) | **High** for rebuild | **Production** → baseline |
| D7 | Extensions (7) | Installed (b09) | Never declared; m10c's unqualified `gen_random_bytes` relies on the `extensions` search_path | Platform/dashboard | Medium | Repo (baseline declares them) |
| D8 | Quest tables + `bond_quest_templates` content | Present (b03) | Tables absent; RPCs present | Pre-repo | **Medium/High.** Template content exists nowhere else | **Production** → baseline + seed |
| D9 | Hard-coded project URL in 5 cron commands (b11) and the Android widget | Correct for prod | Same literal | Convenience | **Replay hazard:** a staging rebuild would fire cron at production Edge Functions | Repo, parametrised later |
| D10 | 10 REPO_ONLY versions | Recorded under alternate versions | Different filenames | Files renamed or never renamed after apply | Medium (`db push` / `repair` hazard) | Ledger reconciliation (F2A.2) |

**Not drift (verified):**
- 119/127 repo function bodies are byte-identical.
- Repo table columns, policies and triggers are all present.
- All 6 repo cron commands are identical.
- `us-media` at 40 MiB matches the client limit (`left-for-you.js:1306`). The M5G2 risk from the first draft is closed.
- The F1A/F1B/F1C files are recorded under their own versions.

**Advisor note (b-snapshot):** the connector flagged `rls_disabled` (critical) on `private.left_for_you_cleanup_queue` and `private.game_swipe_v1_catalog`. b03 shows ACL `postgres=arwdDxtm/postgres` and `NULL` (owner-only), and `private` is not an API-exposed schema (F1B). So no anon/authenticated path reaches them, and this is a false positive in effect. Enabling RLS for advisor hygiene belongs to the RLS track (DEFERRED), not F2A.

---

# EDGE FUNCTION MATRIX

Repo **13** (REPO) · Deployed **13**, all ACTIVE (PROD connector `list_edge_functions`).

| Function | Repo | Deployed (version, last deploy UTC) | `verify_jwt` repo / prod | Callers (REPO) | Class |
|---|---|---|---|---|---|
| calendar-reminders-worker | yes | v1, 2026-09-28 19:52 | false / false | cron `us-calendar-reminders-dispatch` | SAME_NAME_SOURCE_NOT_VERIFIED |
| cleanup-left-for-you | yes | **not deployed** | false / — | none: no cron, no client, no SQL | **REPO_ONLY** (dormant by M5I design) |
| daily-question-push-worker | yes | v1, 2026-09-30 06:10 | false / false | cron `us-daily-question-push` | SAME_NAME_SOURCE_NOT_VERIFIED |
| delete-moment | yes | v2, 2026-10-03 09:11 | true / true | `app.js:2601` | SAME_NAME_SOURCE_NOT_VERIFIED |
| game-v2-push | yes | v1, 2026-09-30 15:38 | true / true | `app.js:217` | SAME_NAME_SOURCE_NOT_VERIFIED |
| game-v2-push-worker | yes | v1, 2026-09-30 15:38 | false / false | cron `us-game-v2-push` | SAME_NAME_SOURCE_NOT_VERIFIED |
| left-for-you-push-worker | yes | v1, 2026-09-29 20:19 | false / false | cron `us-left-for-you-push-sweep` | SAME_NAME_SOURCE_NOT_VERIFIED |
| send-web-push | yes | v8, 2026-09-29 20:19 | true / true | `app.js:217` | SAME_NAME_SOURCE_NOT_VERIFIED |
| spotify-search | yes | v1, 2026-09-24 14:33 | true / true | `left-for-you.js:684` | SAME_NAME_SOURCE_NOT_VERIFIED |
| us-widget-state | yes | v4, 2026-09-25 14:44 | false / false | Scriptable widgets | SAME_NAME_SOURCE_NOT_VERIFIED (`PROVENANCE.md` still says v3) |
| widget-device-token | yes | v3, 2026-08-31 21:26 | true / true | `app.js:78/84` | SAME_NAME_SOURCE_NOT_VERIFIED |
| widget-scriptable-setup | yes | v1, 2026-09-25 14:45 | false / false | `settings.js`, Scriptable | SAME_NAME_SOURCE_NOT_VERIFIED |
| widget-think-send | yes | v3, 2026-08-31 21:27 | false / false | Scriptable, Android `UsWidgetActionClient.java:12` | SAME_NAME_SOURCE_NOT_VERIFIED |
| **monthiversary-job** | **no** | **v4, 2026-08-20 19:37**, bundle SHA-256 `2c8bb67f…3073` | — / false | cron `us-monthiversary-hourly` | **DEPLOYED_ONLY**; source recovered in the evidence |

- **MATCH:** 0 asserted. The connector gives bundle hashes (`ezbr_sha256`), not sources, for the 12 shared functions, so a byte comparison needs `functions download` (F2A.1).
- **`verify_jwt` parity:** 12/12 match `config.toml`. `monthiversary-job` has no `config.toml` entry.
- **Recovered `monthiversary-job`** (evidence `monthiversary_job.files`: `index.ts` 4,397 B, `deno.json`):
  - It authenticates by `x-us-cron-key` against `get_internal_monthiversary_cron_key()`.
  - It does work only at 09:00 Europe/Rome, so 23 of its 24 hourly runs a day are no-ops.
  - It awards `monthiversary` (+60 XP) or `anniversary` (+200 XP) via `award_relationship_milestone`, and sends Web Push itself:
    - it does not use `_shared/think-web-push.ts` or `push_event_log`;
    - it honours `notification_preferences.relationship`;
    - it pins `supabase-js@2.57.4` (the repo uses 2.112.4) and still has `VAPID_SUBJECT = https://usfinal.vercel.app`.
- **LEGACY_CANDIDATE:** none by caller analysis. `cleanup-left-for-you` is dormant, not obsolete.
- **Secrets outside the repo** (names only):
  - Edge env: `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`, `M5I_CLEANUP_SECRET`;
  - vault: `us_web_push_vapid_private`, `us_monthiversary_cron_key` (b13);
  - platform `SUPABASE_*`.

---

# CRON MATRIX

PROD b11: 7 jobs, all `active`, latest status `succeeded`, **0 failures in the last 7 days**.

| id | Job | Schedule | Calls | Edge Function | Repo source | Command vs repo | Runs (total) |
|---|---|---|---|---|---|---|---|
| 1 | **us-monthiversary-hourly** | `5 * * * *` | `net.http_post` + vault `us_monthiversary_cron_key` | monthiversary-job | **none** (ledger-only `20260820181734 us_monthiversary_scheduler`) | — | 1,057 |
| 2 | us-widget-scriptable-state-expiry | `* * * * *` | SQL `update widget_tokens` | — | `20260924194500` (REPO_ONLY; ledger `20260925143951`) | identical | 11,806 |
| 3 | us-calendar-reminders-dispatch | `* * * * *` | `net.http_post` | calendar-reminders-worker | `20260928210000` | identical | 7,176 |
| 4 | us-left-for-you-push-sweep | `* * * * *` | `net.http_post` | left-for-you-push-worker | `20260929201958` | identical | 5,706 |
| 5 | us-daily-question-materialize | `1 * * * *` | `private.materialize_daily_question` | — | `20260930045233` | identical | 87 |
| 6 | us-daily-question-push | `*/10 * * * *` | materialize + `net.http_post` | daily-question-push-worker | `20260930061045` | identical | 511 |
| 7 | us-game-v2-push | `*/10 * * * *` | `net.http_post` | game-v2-push-worker | `20260930153755` | identical | 455 |

- **Cron pointing to missing functions:** none. Every target is deployed.
- **Cron not represented in the repo:** job 1.
- **Repo cron absent from production:** none.
- **Duplicates:** jobs 5 and 6 both materialize the daily question. This is by design and idempotent.
- **Legacy / cadence candidates (F2C):**
  - job 2 runs every minute for 3 widget tokens;
  - job 3 runs every minute and `calendar_reminders` has 0 rows (F1C);
  - job 1 runs hourly but does work once a day.
- **Volume:** 3 × 1,440 + 2 × 144 + 24 + 24 = **4,656 runs/day**. `cron.job_run_details` = **26,798** rows, oldest 2026-08-20 19:05 UTC, never purged.

---

# OPERATIONAL / RETENTION OBSERVATIONS

PROD b12/b14 (counts only):

| Area | State | Assessment |
|---|---|---|
| `left_for_you` | 32 rows · 0 unseen · **0 eligible now** · **18 legacy seen rows with `cleanup_eligible_at` NULL** (never eligible by design) · queue 0 · oldest seen 2026-09-23 | **Nothing to clean today.** The other 14 rows got eligibility after M5I went live (2026-09-28), so the first ones become eligible from **2026-10-28** (30 days after `seen_at`). From then on they accumulate, because `cleanup-left-for-you` is not deployed or scheduled. The 18 legacy rows need an explicit decision (M5I §10) |
| `cron.job_run_details` | 26,798 rows, about 4,656/day | unbounded growth; needs a purge job (F2A.3) |
| `net._http_response` | 798 rows | pg_net TTL-bounded; fine |
| `push_event_log` | 149 rows | small, unbounded; low priority |
| Widget | 3 tokens · 3 receipts · 0 expired setup codes · 0 expired installations | fine |
| `push_subscriptions` / `device_push_tokens` | 5 / 0 | `device_push_tokens` is legacy and empty |
| Legacy Gioca v1 | `quiz_responses` 410 (still in Realtime) · `quiz_questions` 252 · `quiz_sets` 36 · `weekly_quiz_rewards` 14 · `partner_knowledge_attempts` 12 · `couple_questions` 0 | RPCs already revoked (F1B). Archive or drop is a product decision |
| Other legacy | `moods` 0 · `activity` 19 · `couple_invites` 2 (used) · `game_sessions` open 0 | small |
| `us-media` objects | 51 | ownership cleanup is out of scope |
| Anonymous auth users | **8** | **separate future mission** (F1A §6). Not touched here |

---

# RECONSTRUCTION ASSESSMENT

**"If production disappeared tomorrow, can this repository rebuild the intended US backend without guessing?" — NO.**

- **REPLAY result:** on an empty Supabase-like PostgreSQL 16, **1/47** migrations applies. The very first file fails on `public.couples`.
- **What production adds on top of the repo** (PROD): 30 tables, 18 functions, 55 policies, 1 trigger, 3 column grants, 7 extensions, 13 Realtime memberships, 1 bucket + 4 storage policies, 1 cron job, 2 vault secrets and 1 Edge Function.

**Actual reconstruction blockers:**
1. The base schema (D1), whose SQL lives only in 36 ledger `statements`.
2. The m6d applied form (D2).
3. The 8 drifted function bodies (D3). Without them a rebuild would run different code.
4. Monthiversary: its Edge source exists only in the evidence JSON, not in `supabase/functions/` (D4).
5. Quest template content (D8).
6. Storage and Realtime (D5, D6).
7. Secret provisioning: the VAPID key, the monthiversary key, Spotify and M5I are not named in one place.

**Dangerous replay hazards:**
- re-runnable downgrades (`20260831213000`, `20260923210000`, `20261002181500/181501`, and the `claim_left_for_you_cleanup` body in `20260924160000`);
- m6d cannot apply;
- `20260930105724` re-grants functions F1B revoked;
- cron in a staging rebuild fires at production (D9).

`supabase db push` would refuse today because of the 46 LEDGER_ONLY versions, so it fails safe. A wrong `migration repair` or `--include-all` would execute the hazards.

**Historical provenance gaps (no rebuild impact once a baseline exists):**
- the 36 pre-repo files;
- the 3 cosmetic ledger names;
- the ledger-order vs filename-order differences.

**Harmless ledger inconsistencies:** the 10 REPO_ONLY ↔ alternate-version pairs, once reconciled.

**After F2A.1** (baseline + recovered sources + seeds) this becomes **YES** for schema, functions, policies, cron and Edge. The secret values stay in Supabase by design.

---

# CANONICAL SOURCE-OF-TRUTH MODEL

1. **Schema: the repository is canonical, from one baseline onward.**
   - The baseline is a schema-level capture of production plus the missing seeds, taken read-only.
   - Until F2A.2 it lives outside `migrations/` (`supabase/baseline/`), used for rebuilds and tests only.
   - After F2A.2, `migrations/` = baseline + forward files, and the historical files move to `migrations_history/`, kept as documentation and never executed.
2. **Ledger = a record of which repo file ran.**
   - After F2A.2, `supabase migration list --linked` shows every version on both sides.
   - Each apply records exactly its own file's version (as F1A/F1B/F1C did).
   - Never rename after apply.
   - "Prepared only" files are not committed under `migrations/` until they are approved to apply.
3. **Production may lead the repo only inside an apply.** SQL run in production (dashboard, connector, hotfix) is committed verbatim **before** its ledger row is written, and it is committed in its applied form. D2 and D3 must not recur.
4. **Edge Functions: the repo source is canonical; deployment state is derived.**
   - Every deployed function has a `supabase/functions/<name>/` directory and a `config.toml` entry with explicit `verify_jwt`.
   - Deploys happen only from a pushed commit, and the mission doc records the function version and commit.
   - A repo-only function is scheduled, or marked dormant with a comment.
5. **Cron: only in migrations**, idempotent by job name, with keys from vault. Command changes go through `cron.alter_job` in a migration, never a dashboard edit.
6. **Operational config: names in the repo, values never.** One secrets manifest (name, store = vault or Edge env, consumer, rotation).
7. **Drift check:** the read-only pack plus the md5 joins used here become a repeatable script. Running it is read-only.

---

# REMEDIATION PLAN

| Mission | Scope | Production risk | Depends on | Model | Effort |
|---|---|---|---|---|---|
| **F2A.1: Production Baseline & Missing-Source Recovery** (recommended next) | **Read-only inputs:**<br>• the 36 base `statements` and the m6d `statements` from `supabase_migrations.schema_migrations`;<br>• `pg_get_functiondef` for the 18 production-only and the 8 drifted functions;<br>• full policy/trigger/constraint definitions;<br>• the Realtime and storage DDL;<br>• the `bond_quest_templates` rows;<br>• `functions download` for the 12 shared functions;<br>• optionally a literal `supabase db dump`.<br>**Repo outputs:**<br>• `supabase/baseline/`;<br>• `supabase/functions/monthiversary-job/` + `config.toml` entry (from the recovered v4 source, byte-for-byte);<br>• the applied m6d form and the 8 function bodies recorded;<br>• a secrets manifest;<br>• a rebuild test (baseline + forward migrations on PG16 reproduce the production fingerprints from this audit);<br>• a byte comparison of the 12 deployed Edge bundles. | **None** (read-only) | F2A | **Opus High** | Medium |
| **F2A.2: Ledger reconciliation** | Use `migration repair` for the 10 alternate pairs and adopt the baseline. Move historical files to `migrations_history/`. Prove `db push --dry-run` is a no-op | Low–Medium (ledger DML only; explicit authorization) | F2A.1 | Opus High | Low–Medium |
| **F2C: Edge / cron consolidation** | Deploy monthiversary from the repo; move cron job 1 into a migration; decide cadence for jobs 1–3; update `VAPID_SUBJECT`; redeploy only mismatching Edge bundles; decide on `cleanup-left-for-you` | Medium (deploys, cron) | F2A.1, F2A.2 | Opus Medium | Medium |
| **F2A.3: Operational retention** | Left for You cleanup activation **before 2026-10-28** (blast radius first, M5I §10) and the 18 legacy rows; `cron.job_run_details` purge; `push_event_log` retention; legacy Gioca v1 data decision; stale `quiz_responses` Realtime membership | Medium (deletes; each authorized) | F2C (worker scheduled) | Sonnet High | Medium |

F2A.1 is the only step that turns reconstruction from NO into YES without touching production, and every later mission needs its exact definitions.

---

# RISKS

- **`supabase db push` and broad `migration repair` stay forbidden** until F2A.2. Five repo files would silently downgrade live functions.
- **Monthiversary is a single point of loss.** Until F2A.1 commits the recovered source into `supabase/functions/`, overwriting or deleting the deployed v4 loses it, apart from the evidence JSON.
- **The 8 drifted bodies:** any future migration that `create or replace`s one of them from the repo text could revert a production fix. Treat production as authoritative for these until F2A.1 diffs them.
- **Left for You cleanup deadline:** from about 2026-10-28, rows and media start to outlive their designed lifetime.
- **Staging rebuilds** call production Edge Functions through hard-coded cron URLs until those are parametrised.
- **Evidence time:** production was captured on 2026-10-03, around 19:25 UTC (latest cron run in b11). Changes after that are not reflected.

---

# DEFERRED

Recorded for their owners. F2A does not own these.

- **RLS / grants:**
  - the advisor `rls_disabled` on 2 `private` tables (not exploitable, see the advisor note);
  - broad anon table privileges (**22** public tables still grant anon write privileges; RLS denies them);
  - inert F1C leftover policies;
  - the tautological reminder INSERT policy;
  - default privileges.
- **Calendar helper oracle (F1B P2).**
- **Auth:** 8 anonymous users and their media ownership (a separate mission); the profile-less account; leaked-password protection.
- **Realtime lifecycle:** subscription scope and reconnects. F2A only records membership.
- **Performance / indexes, advisors:** not re-run (F1C last saw 35 security findings).
- **Gioca, Rewards, Pets, UI, Service Worker, native packaging:** untouched.

---

## Appendix A — Replay method and per-file result

A throwaway PostgreSQL 16 was set up with a Supabase-like platform skeleton:
- roles `anon`, `authenticated`, `service_role`;
- `auth.users` / `uid()` / `jwt()`;
- `storage.buckets`, `storage.objects`, `storage.foldername()`;
- `extensions.pgcrypto`;
- an empty `supabase_realtime`;
- stubs for `vault`, `cron.schedule` and `net.http_post`.

Each migration was applied in filename order with `psql -v ON_ERROR_STOP=1 --single-transaction`.

Result: only `20260923180800` succeeds. The other 46 fail on a missing base object:
- `couples`, `profiles`, `shared_messages`, `left_for_you` or other base tables;
- the `private` schema;
- the M12B.3 / M12B.4 / M12D preflight guards;
- `claim_us_role`, `get_notification_preferences`;
- or unqualified `gen_random_bytes` (m10c).

Separately, `check (not exists (select …))` → `ERROR: cannot use subquery in check constraint`, which confirms D2.

## Appendix B — How the joins were computed

- **Ledger:** set difference of 14-digit versions. REPO_ONLY ↔ LEDGER_ONLY pairs are matched by migration name.
- **Function bodies:**
  - for each production function in b04, the body of the **latest** `create [or replace] function` for that name in repo filename order;
  - "body" = the text between the `AS $tag$` delimiters, which is exactly what `pg_proc.prosrc` stores;
  - its `md5` is compared with b04 `body_md5`.

  Result: 119 identical and 8 different among 127 repo-defined functions, plus 18 with no repo definition.
- **Tables:** b03 names vs repo `create table`. Columns: snapshot column names vs repo `create table` bodies + `add column` statements.
- **Policies / triggers:** b05 / b06 names vs repo `create policy` / `create trigger`.
- **Cron:** b11 `command`, whitespace-normalised, vs the repo `$cron$ … $cron$` body.

## Appendix C — Evidence file hashes (SHA-256, unchanged by the rebase)

```
945e56448ff26975ab8ff1179bbea69f14e0ffc6f1ecba06a158c471f3b8eedf  F2A_PRODUCTION_EVIDENCE_SUMMARY.md
81cd0577043ac3f5c79e8cfc75fa59273567538854e59676cbe73fdecec1809a  F2A_PRODUCTION_RESULTS_01_05.json
1eacb4dc92475662b076ac438c9b01dbf57e52cf93dcb6bc8542a0e5c4ea1bb0  F2A_PRODUCTION_RESULTS_06_10.json
d33cbed61bbd4894b6d6afcbb929819e1976a10f2fd27a43ef798812344c8768  F2A_PRODUCTION_RESULTS_11_14_AND_FUNCTIONS.json
48f19c5feba3f3efc36cf84554af4886e99f1f09b756970e603748a95bee6cd5  F2A_PRODUCTION_SCHEMA_SNAPSHOT.json
```
