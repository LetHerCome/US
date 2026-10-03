# US 2.0 — F1B RPC / SECURITY DEFINER Grant Hardening

**Status:** F1B_READY_FOR_REVIEW (not merged)
**Branch:** `mission/us-2-0-f1b-rpc-grant-hardening`
**Base:** `origin/main` `9e86b53630552acaf62e19ea834a7dd95e9a29b6` (F1A merge; it matched the issued baseline)
**Project:** Supabase `iiakdfsxpywdkxravqjh`
**Production change applied:** 2026-10-03 14:51 UTC
**Migration:** `supabase/migrations/20261003180000_f1b_rpc_grant_hardening.sql`

F1B is grant-only. No function body, owner, `search_path` or `SECURITY DEFINER` flag changed, and no table, policy, row, Auth setting, Edge Function or cron job changed. Every revoked function still exists, and its owner keeps EXECUTE. service_role also keeps EXECUTE wherever it had an explicit grant.

---

## 1. Verified inventory (production, before F1B)

| Schema | Functions | SECURITY DEFINER | Trigger fns | anon EXECUTE | authenticated EXECUTE | PUBLIC EXECUTE | auth + definer |
|---|---|---|---|---|---|---|---|
| public | 70 | 67 | 0 | 8 | 49 | 4 | 46 |
| private | 75 | 29 | 20 | 1 | 6 | 1 | 6 |

There were no extension-owned functions in either schema. `private` is not an exposed API schema. Its client-executable functions matter only because RLS policies and SECURITY INVOKER wrappers call them as the client role.

**After F1B:**

| Schema | anon EXECUTE | authenticated EXECUTE | PUBLIC EXECUTE | auth + definer |
|---|---|---|---|---|
| public | **0** | 37 | **0** | 34 |
| private | **0** | 5 | **0** | 5 |

---

## 2. How the caller map was built

Each function was checked against every surface. A missing client call alone was never enough to call a function unused.

| Surface | Method |
|---|---|
| Client | `.rpc('name')` across every runtime file (multi-line aware), plus a word-boundary search for every function name across the whole repo, grouped by area. Callers were dated with `git log -S` to see when each one was removed. |
| Edge Functions, in the repo | Same scan of `supabase/functions/**`, including the dynamic `derive(admin, 'fn')` in `_shared/game-v2-push-core.mjs` |
| Edge Functions, **deployed** | `supabase functions download` for all 13 deployed functions, including `monthiversary-job`, which has no source in the repo. Every RPC they call is service-role-only, and none of them references an F1B target. |
| SQL / triggers / constraints / policies / defaults / views / indexes | Live: references in `pg_proc.prosrc`, `pg_trigger`, `pg_policies`, `pg_constraint` (CHECK), `pg_attrdef`, `pg_views` and expression indexes |
| Cron | Live `cron.job` commands (7 jobs). They call Edge Functions through `net.http_post` or `private.materialize_daily_question`, and none calls an F1B target. |
| Widgets / native | `integrations/`, `native-plugins/`, `android/`. No RPC or REST `rpc/` calls. |
| Usage evidence | `pg_stat_statements`. The counts are cumulative since 2026-08-18 with no timestamps, so they only rule out "never called". Recency came from table writes: last `quiz_responses` write 2026-09-30 08:59 UTC, last `partner_knowledge_attempts` write 2026-08-31, and 0 rows each in `couple_questions`, `device_push_tokens` and `living_provenance`. |

---

## 3. Classification (all 76 exposed / client-reachable functions)

The authoritative per-function list is `MATRIX` in `tests/f1b-rpc-grant-hardening.test.js`. It records each function's signature, its production ACL before F1B, the intended ACL after, and its class.

| Class | Count | Members / rule |
|---|---|---|
| CLIENT_REQUIRED | 32 | Exactly the set of RPCs the shipped client calls. The test checks this both ways. 29 are SECURITY DEFINER, and 3 are SECURITY INVOKER wrappers (`confirm_bond_quest`, `ensure_bond_week`, `reroll_bond_quest`). |
| SERVER_REQUIRED | 17 | Edge Function / cron callers through service_role: `get_internal_*` keys (6), `widget_*_internal` (4), `game_v2_pending_pushes` / `_push_for_session` / `_push_for_weekly`, `claim/complete/finalize_left_for_you_cleanup`, `award_relationship_milestone`. All were already service-role-only. |
| INTERNAL_HELPER | 8 | Keep authenticated, because the client path runs them as the caller: `private.current_couple_id` and `private.daily_question_reveal_ready` (RLS policies), `private.{ensure_bond_week,confirm_bond_quest,reroll_bond_quest}_internal` (called from SECURITY INVOKER wrappers), `public.calendar_reminder_offset_valid` and `calendar_reminder_recipient_in_couple` (CHECK constraints on `calendar_reminders`, which authenticated inserts and updates and service_role updates). Revoked: `private.us_touch_updated_at` (trigger-only). |
| COMPATIBILITY | 3 | Kept on purpose, see §5: `equip_progression_reward`, `get_weekly_question_state`, `link_moment_to_source` |
| LEGACY_CANDIDATE | 16 | 12 revoked by F1B (§4), plus 4 that were already closed: `claim_us_role` (F1A), `create_couple_question` and `start_custom_game_session` (M11A.1), `delete_think_reaction` |
| UNKNOWN | 0 | — |

The other 69 `private` functions are not executable by anon or authenticated. They are reached only from SECURITY DEFINER bodies, triggers or cron, so they are INTERNAL_HELPER and F1B leaves them untouched.

---

## 4. Changed functions

Flags: `a` anon · `A` authenticated · `S` service_role · `P` PUBLIC.

| Function | Before | After | Classification | Evidence |
|---|---|---|---|---|
| `public.get_notification_preferences()` | aASP | -AS- | CLIENT_REQUIRED | `settings.js` calls it signed in. anon/PUBLIC were never needed (body rejects a null `auth.uid()`). |
| `public.set_notification_preference(text,boolean)` | aASP | -AS- | CLIENT_REQUIRED | Same as above. |
| `public.complete_shared_event(uuid,date)` | aAS- | -AS- | CLIENT_REQUIRED | `events.js`, signed in. |
| `public.get_weekly_quiz_sets()` | aASP | --S- | LEGACY_CANDIDATE | Gioca v1. Client call removed in `b3bc863` (M11B, 2026-09-30); no DB, Edge or cron caller. |
| `public.get_quiz_state(uuid)` | -AS- | --S- | LEGACY_CANDIDATE | Gioca v1, removed in `b3bc863`. |
| `public.save_quiz_answer(uuid,smallint)` | -AS- | --S- | LEGACY_CANDIDATE | Gioca v1, removed in `b3bc863`. Last `quiz_responses` write 2026-09-30 08:59 UTC, the same day. |
| `public.get_weekly_game_sets()` | aASP | --S- | LEGACY_CANDIDATE | Gioca v1 hub, removed in `b3bc863`. |
| `public.get_partner_knowledge_hub()` | aAS- | --S- | LEGACY_CANDIDATE | Partner knowledge, removed in `b3bc863`. Pre-repo function. |
| `public.complete_partner_knowledge_deck(smallint,jsonb)` | aAS- | --S- | LEGACY_CANDIDATE | Same as above. Last attempt 2026-08-31. |
| `public.list_couple_questions()` | -AS- | --S- | LEGACY_CANDIDATE | M11A question management, superseded by Game V2 (client removed in `b3bc863`). 0 `couple_questions` rows. |
| `public.list_game_sessions()` | -AS- | --S- | LEGACY_CANDIDATE | M11A, removed in `b3bc863`. Game V2 uses `get_game_v2_home` / `get_game_session`. |
| `public.update_couple_question(uuid,integer,text,text,jsonb)` | -AS- | --S- | LEGACY_CANDIDATE | M11A, removed in `b3bc863`. 0 rows. |
| `public.archive_couple_question(uuid)` | -AS- | --S- | LEGACY_CANDIDATE | M11A, removed in `b3bc863`. 0 rows. |
| `public.register_push_token(text,text)` | aAS- | --S- | LEGACY_CANDIDATE | Native push was never wired (`push-bootstrap.js` deleted 2026-08-19). 0 `device_push_tokens` rows. |
| `public.get_web_push_status()` | -AS- | --S- | LEGACY_CANDIDATE | Not referenced anywhere in the repo (client, Edge, SQL, tests, docs). No `pg_stat_statements` entry since 2026-08-18. |
| `private.us_touch_updated_at()` | aASP (default ACL) | ---- | INTERNAL_HELPER | Trigger-only. Postgres does not check EXECUTE when a trigger fires; pglite proves the trigger still fires for authenticated and service_role. |

The 12 retired public RPCs also got a `RETIRED (US 2.0 F1B): …` comment. The migration ends with a DO-block self-check that aborts it if any targeted function is still anon- or authenticated-executable, or if a client RPC lost authenticated access.

---

## 5. Untouched on purpose

| Function | Why it stays authenticated |
|---|---|
| `equip_progression_reward(text)` | The client call was removed only today, in `37bb242` (00:01 +02:00), when the equipped look became device-local. A PWA still running the previous build could call it until its Service Worker updates. Revoke in a later mission, after one release cycle. |
| `get_weekly_question_state()` | An M11B read API covered by the M11B race and core tests as a user-facing read RPC. No client has ever called it, but it is part of the current Game V2 contract and only reads. |
| `link_moment_to_source(uuid,text,uuid)` | M12B.3 living-provenance API with explicit auth checks and test coverage. The client is not wired yet (0 `living_provenance` rows), so the evidence points to "not yet used" rather than obsolete. |
| `calendar_reminder_offset_valid`, `calendar_reminder_recipient_in_couple` | Required. They back CHECK constraints that run with the caller's privileges on authenticated and service_role writes (see §9 for their oracle shape). |
| `private.current_couple_id`, `private.daily_question_reveal_ready` | Required. They are called inside RLS policies. |
| `private.*_internal` (bond quest) | Required. They are called from the SECURITY INVOKER wrappers `confirm_bond_quest`, `ensure_bond_week` and `reroll_bond_quest`. |

---

## 6. Role matrix before → after (summary)

| Group | anon | authenticated | service_role |
|---|---|---|---|
| 32 CLIENT_REQUIRED | 3 → **0** | 32 → 32 | 32 → 32 |
| 17 SERVER_REQUIRED | 0 → 0 | 0 → 0 | 17 → 17 |
| 8 INTERNAL_HELPER (client-reachable) | 1 → **0** | 8 → **7** | 6 → **5** (trigger helper had it only via PUBLIC) |
| 3 COMPATIBILITY | 0 → 0 | 3 → 3 | 3 → 3 |
| 16 LEGACY_CANDIDATE | 5 → **0** | 12 → **0** | 16 → 16 |

---

## 7. Advisors (security type)

| Advisor | Before | After |
|---|---|---|
| `anon_security_definer_function_executable` | 8 | **0** |
| `authenticated_security_definer_function_executable` | 46 | **34** |
| `auth_leaked_password_protection` | 1 | 1 (not in scope) |
| **Total** | **55** | **35**, with no new warnings |

**Gone (20 findings).**
- anon: `complete_partner_knowledge_deck`, `complete_shared_event`, `get_notification_preferences`, `get_partner_knowledge_hub`, `get_weekly_game_sets`, `get_weekly_quiz_sets`, `register_push_token`, `set_notification_preference`.
- authenticated: `archive_couple_question`, `complete_partner_knowledge_deck`, `get_partner_knowledge_hub`, `get_quiz_state`, `get_web_push_status`, `get_weekly_game_sets`, `get_weekly_quiz_sets`, `list_couple_questions`, `list_game_sessions`, `register_push_token`, `save_quiz_answer`, `update_couple_question`.

**Remaining 34 (all intentional).**
- 29 CLIENT_REQUIRED SECURITY DEFINER RPCs
- 2 constraint helpers
- 3 COMPATIBILITY functions

---

## 8. Production change and verification

**Mutations (complete list).**
1. The committed migration file, applied verbatim in one transaction (`supabase db query --linked -f`). Its self-check passed.
2. Ledger row `20261003180000 f1b_rpc_grant_hardening`, via `supabase migration repair --status applied 20261003180000`. No `db push`: the pre-existing ledger drift (F1A §7) still makes it unsafe.

Immediately before applying, a drift check confirmed all 145 live ACLs and bodies were identical to the snapshot the manifest was built from.

**After:**
- **ACLs.** All 76 manifest rows match their `after` flags in production (0 mismatches). Exactly 16 ACLs changed, as listed in §4. Across all 145 functions, 0 bodies, definer flags, configs or owners changed.
- **anon over REST** (publishable key): `get_notification_preferences`, `get_weekly_quiz_sets`, `get_partner_knowledge_hub`, `get_web_push_status` and `get_game_v2_home` all return `401 42501 permission denied`.
- **authenticated** (Francesco's claims, `set local role authenticated`, read-only transaction):
  - Client RPCs `get_notification_preferences`, `get_game_v2_home` and `get_weekly_question_state` return results.
  - `get_progression_v1` passes the EXECUTE check and is then stopped by the read-only transaction (it inserts on first read), so nothing was written.
  - `get_quiz_state`, `list_game_sessions`, `get_web_push_status`, `get_weekly_quiz_sets` and `claim_us_role` return `42501 permission denied`.
- **service_role** keeps EXECUTE on all 17 SERVER_REQUIRED functions and on every revoked public RPC.
- **Data:** an md5 of every row of all **57/57 public tables is identical** before and after, including `profiles`, `couples` and `couple_invites`.

---

## 9. Tests and builds

New file: `tests/f1b-rpc-grant-hardening.test.js` (11 tests), driven by the `MATRIX` manifest.

- **Manifest integrity.** One row per signature, valid flags, no UNKNOWN class.
- **Matrix invariants.**
  - No anon or PUBLIC access anywhere.
  - F1B only removes access and never changes service_role on public RPCs.
  - CLIENT_REQUIRED stays authenticated; SERVER and LEGACY are not browser-callable.
- **Client parity.** The RPC set the shipped runtime calls equals CLIENT_REQUIRED, in both directions. A new client RPC fails the test until it is classified.
- **Edge parity.** Every RPC an Edge Function calls keeps service_role.
- **Migration shape.** It revokes exactly the before ≠ after rows, always including `public` and `anon`, and includes `authenticated` exactly when the after-state drops it. It contains no grant, DML, DDL, policy or `service_role`.
- **pglite behaviour.**
  - All 76 functions are recreated with their production signatures and pre-F1B ACLs. The fixture must reproduce production, and after the real migration it must equal `after` exactly. The migration is idempotent.
  - Real calls: authenticated succeeds on every client RPC and is refused on every closed one; anon is refused on both.
  - The trigger helper still fires for authenticated and service_role writes.
  - The migration self-check aborts on the pre-F1B ACLs.

| Command | Result |
|---|---|
| `node --test tests/f1b-rpc-grant-hardening.test.js tests/f1a-auth-shutdown.test.js` | 19 pass, 0 fail |
| `npm test` | 1299 tests: 1229 pass, **37 fail**, 33 skipped |
| Failure set vs the recorded baseline (`origin/main` `c8de18d`; F1A changed no failing suite) | **Identical** 37: the Windows-baseline M9A, M10C, M11B catalog, M11C recipes and M11D push suites. 0 new, 0 fixed. The test count is 1288 + 11 new = 1299. |
| `npm run build:cloudflare-pages` | OK, 141 files |
| `npm run build:capacitor-web` | OK, 139 files. Its whitespace-only rewrite of `android/brand-assets-manifest.json` was reverted. |

No runtime file changed, so there is no build-id bump and no Service Worker or cache impact.

---

## 10. Deferred (F1C or later) and remaining legacy candidates

**F1C (authorization).** The F1B function safety review (§F of the mission) found no new P0 or P1.
- **P2 — constraint-helper oracles.** `calendar_reminder_recipient_in_couple(p_couple_id, p_recipient_id)` and `calendar_reminder_offset_valid(p_entry_id, …)` are authenticated-callable SECURITY DEFINER functions that answer membership and all-day questions for any supplied UUID. They are boolean-only and need guessed UUIDs. Make them SECURITY INVOKER or move them out of `public`, keeping the constraints working.
- **P3 — `search_path` hardening.** 9 still-callable definer functions pin `search_path` to `public` (sometimes plus `auth` / `private`) without `pg_temp` last: `private.current_couple_id`, `get_daily_state`, `register_/remove_web_push_subscription`, `complete_shared_event`, `get_/set_notification_preference(s)` and the 2 calendar constraint helpers. Clients cannot create temp objects through PostgREST, so this is defense-in-depth only.
- **Default privileges.** `alter default privileges in schema public revoke execute on functions from anon, authenticated, public`, so that future functions start closed. This changes how every later migration behaves, so it belongs in a deliberate F1C step.
- **Unchanged F0 findings (profiles authority).** `profiles.couple_id` / `role` self-update, `shared_messages_update_recipient`, and broad `anon` table grants.

**Later product or cleanup missions.**
- Revoke `equip_progression_reward` once no deployed client predates `37bb242`.
- Decide whether `get_weekly_question_state` and `link_moment_to_source` get a client or get retired.
- Drop the 16 LEGACY_CANDIDATE functions once their migration and test history no longer needs them.
- `get_progression_v1` inserts on read: it is a `get_` RPC with a write side effect. Note this for the progression owner.

**Repo / deploy alignment (not F1B).**
- `monthiversary-job` is deployed without source in the repo.
- `cleanup-left-for-you` is in the repo but not deployed.
- Migration-ledger drift persists. F1B recorded only its own version.
