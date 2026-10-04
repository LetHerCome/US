# US 2.0 — Security / RLS Hardening audit

**Status:** SECURITY_PRODUCTION_VERIFIED — MERGE READY
**Branch:** `mission/us-2-0-security-rls-hardening-t4fvlh` · **Base:** `main` `489fe711457439af39ba09a6db608a3f5560f0f6` (F2A.1 + F2A.2 + F2C merged)
**Production changes:** SEC-01/SEC-02 migration applied and verified on 2026-10-04; no Edge deploy, Auth config change, frontend change, or application-data mutation.
**Candidate migration:** `supabase/migrations/20261004150000_sec_rls_hardening.sql`
**Tests:** `tests/sec-rls-hardening.test.js` (18 tests, all passing against the committed production run)
**Production evidence:** `docs/us-2.0/SEC_RLS_AUDIT_PRODUCTION.json` (pack s01–s11, read-only, 2026-10-04) and `docs/us-2.0/SEC_RLS_AUDIT_ADVISORS.json` (security advisors, 2026-10-04 15:28 UTC), both run by Francesco
**Production pack:** `docs/us-2.0/SEC_RLS_AUDIT_READONLY.sql` (11 read-only blocks, s01–s11)
**Production rollout evidence:** `docs/us-2.0/SEC_RLS_PRODUCTION_POST.json`

---

## 1. Method and evidence

This cloud session has no production access (egress proxy 403, no connector, no token). The audit therefore ran on the **production schema as rebuilt from the repo**, which is proven equal to production:

- `supabase/migrations` = the F2A.2 baseline (generated from the F2A.1 production capture) + F2C. `tests/f2a1-production-baseline.test.js` and `tests/f2c-edge-cron-source-truth.test.js` rebuild an empty PostgreSQL from it and match every F2A / F2A.1 production fingerprint (tables, ACLs, policies, function bodies and ACLs, views, storage, realtime, cron).
- F2A.2 schema digest PRE = POST (22/22). F2C changed only cron commands and 8 Edge Function deploys (`docs/us-2.0/F2C_PRODUCTION_POST.json`).
- Production facts from earlier missions used here: 1 couple, 2 profiles, 1 email user without profile, 8 anonymous users (anonymous sign-in and signup disabled in F1A), 0 `calendar_reminders` rows (F1C).

On that rebuild, the pack `SEC_RLS_AUDIT_READONLY.sql` (the same SQL Francesco will run on production) produced the inventory, and the tests seed two couples (C1 = Francesco + Beatrice, C2 = a foreign couple), an email user without profile and `anon`, then try every access path as each of them. Each finding below says whether it is **proven** (test reproduces it), **code-read** (Edge source, cannot run Deno here) or **catalog** (pure catalog fact).

Francesco then ran the pack on production (`iiakdfsxpywdkxravqjh`, one block at a time, read-only) and the security advisors. Test 17 compares that run with the rebuild and test 18 maps every advisor finding to this classification (§4, §8).

---

## 2. Inventory (audited state = production today)

| Surface | Count | Notes |
|---|---|---|
| `public` tables | 57 | RLS **enabled on all 57**. FORCE RLS on 23. |
| … with 0 policies | 23 | Deny-all for clients by design (RPC- or service-only): `couple_invites`, `couple_progression_preferences`, `couple_questions`, `couple_reward_unlocks`, `daily_question_reveal_states`, `daily_question_templates`, `game_session_*` (3), `game_sessions`, `game_v2_*` (3), `progression_events`, `progression_reward_catalog`, `progression_reward_views`, `push_event_log`, `push_subscriptions`, `widget_*` (5). |
| `private` tables | 2 | No RLS, no client grant, schema not exposed by the API. |
| Policies | 73 public + 4 storage | Classified in §3. |
| Views | 1 | `relationship_event_history`: `security_invoker=true`, filters `couple_id = current_couple_id()`, `authenticated` SELECT only. No materialized view. |
| Functions (public + private) | 145 | 96 `SECURITY DEFINER`, **all with a pinned `search_path`**. |
| … executable by `anon` | **0** | |
| … executable by `authenticated` | 42 (40 after SEC-02) | 39 definer (34 in `public` + 5 `private` helpers used by RLS / wrappers) + 3 invoker wrappers. Each derives the couple from `auth.uid()`; reviewed in §3.3. |
| … service_role only | 33 definer | Cron keys, VAPID key, `*_internal`, workers, `claim_us_role` (retired). |
| Column write grants | 3 | `couples(name, started_on, home_photo_path)`, `profiles(avatar_path)`, `shared_events(title, event_date, event_time, location, note, recurs_yearly)` (F1C). |
| Storage | 1 bucket | `us-media`, private, 40 MB, image/audio/video MIME allow-list. 4 policies, all `TO authenticated`, all keyed on `foldername[1] = current_couple_id()`. |
| Realtime | 15 published tables | `postgres_changes` honours RLS. The client uses no broadcast/presence channel. |
| `auth.role()` | 1 function | `get_internal_vapid_private_key` (service-only). No policy uses it. |
| User/app metadata | 1 function | `claim_us_role` (retired in F1A, service-only). No policy uses JWT claims or metadata. |

---

## 3. Findings

Severity is for this deployment (one real couple, signup and anonymous sign-in disabled) and, in brackets, for the model the backend is written for (many couples).

| ID | Severity | Class | Finding | Evidence | Decision |
|---|---|---|---|---|---|
| **SEC-01** | **Medium** [High] | broken (BOLA via confused deputy) | `couples.home_photo_path` is client-writable (F1C column grant, `couples_update_own`) with no shape check. `us-widget-state` signs it with the **service key** (`createSignedUrl`, `supabase/functions/us-widget-state/index.ts:146,183`), bypassing Storage RLS. A couple member can set it to another couple's object and read that object through a 24 h signed URL from their widget. Today there is no foreign couple, so no victim exists; the hole is real for any second couple. | **proven** (DB accepts the foreign path as Francesco; direct Storage read of it returns 0 rows) + **code-read** (service-key signer) | **FIX** — CHECK `couples_home_photo_path_own_folder`: `null` or `<couple id>/…` without `..`. No Edge change. |
| **SEC-02** | **Low** [Medium] | broken (RLS bypass oracle) | `calendar_reminder_recipient_in_couple(couple, user)` and `calendar_reminder_offset_valid(entry, offset)` are `SECURITY DEFINER` and executable by every signed-in user (including the profile-less one). They answer "is user U in couple C" and "is entry E all-day" for **any** ids, which RLS hides. F1B P2. Since F1C only `service_role` writes `calendar_reminders`, the CHECK constraints that call them never run as `authenticated`. | **proven** (both answer about C2 for Francesco and the profile-less user) | **FIX** — revoke EXECUTE from `public, anon, authenticated`; `service_role` keeps it. |
| SEC-03 | Info | broken, inert | `calendar_reminders_insert_couple` contains tautologies (`p.couple_id = p.couple_id`, `e.couple_id = e.couple_id`). Not exploitable: no INSERT grant since F1C, **and** even with the grant back the EXISTS subqueries run under the caller's RLS, so a foreign entry or recipient is invisible. | **proven** (with a simulated grant, foreign entry and foreign recipient are both refused; own-couple passes) | ACCEPT (not fixed: no access path). Drop in a later policy cleanup. |
| SEC-04 | Info | inert | `messages_update_recipient`, `calendar_reminders_update_requester`, `calendar_reminders_delete_requester` have no matching grant (F1C). | catalog | ACCEPT (cleanup later). |
| SEC-05 | Low | intentionally broad / hygiene | `anon` holds S,I,U,D,TRUNCATE on 22 public tables (and `authenticated` TRUNCATE on several). Every policy is `TO authenticated` or identity-bound, so RLS returns nothing / refuses writes; TRUNCATE is not reachable through PostgREST or GraphQL. | **proven** (anon reads 0 rows of every public table/view) | ACCEPT. Revoking is defense in depth, not a fix (F1C follow-up). |
| SEC-06 | Info | suspicious, safe | 6 policies are `TO public` (`notification_preferences` ×3, `partner_knowledge_attempts`, `relationship_milestones`, `shared_event_completions`). All require `auth.uid()` or `current_couple_id()`, which are NULL for `anon`. | **proven** + invariant test | ACCEPT. |
| SEC-07 | Info | intentionally broad | Catalog tables readable by any signed-in user: `daily_questions` (`using true`), `quiz_questions`, `quiz_sets`, `bond_quest_templates` (`active`). No couple data. The profile-less user can read today's question text, never an answer (`get_daily_state` refuses). | **proven** | INTENTIONAL. |
| SEC-08 | Low (process) | suspicious | Default privileges in `public` grant ALL on new functions/tables to `anon` and `authenticated` (Supabase default). Every future function starts callable until a migration revokes it. 0 functions are anon-callable today. | catalog | ACCEPT now. Recommended as its own deliberate step (F1B deferred it). |
| SEC-09 | Info | deprecated | `get_internal_vapid_private_key` checks `auth.role() <> 'service_role'`. The EXECUTE grant (service_role only) is the real gate; the check is extra. | catalog + invariant test | ACCEPT. |
| SEC-10 | Info | retired | `claim_us_role` trusts `raw_user_meta_data->>'is_anonymous'` (user-writable). Not callable by clients since F1A. | catalog + invariant test | ACCEPT. |
| SEC-11 | Info | hygiene | 9 definer functions pin `search_path` to `public[, auth|private]` without `pg_temp` last (F1B P3). Clients cannot create temp objects through the API. | catalog | ACCEPT. |
| SEC-12 | Low | intentionally broad (Edge) | `delete-moment` lets either partner delete a shared Moment (intended, matches the UI) and then removes the `storage_path` values the creator wrote at insert, with the service key. A partner could thus remove the other partner's own object in the couple folder (e.g. a Left for You file), which `us_media_delete_own` would refuse. Cross-couple is blocked by the `<couple>/` prefix filter. | code-read | ACCEPT (inside the couple). Later: restrict removal to `moments`/album files, or add a folder CHECK like SEC-01. |
| SEC-13 | Info | intentionally broad | `register_web_push_subscription` upserts on `endpoint` and moves the row to the caller. Needs the secret endpoint URL of the other device; meant for device hand-over. | code-read | ACCEPT. |
| SEC-14 | Info | oracle | FK errors and `bucket_items_guard_calendar_link` distinguish "not found" from "other couple" for guessed UUIDs. | catalog | ACCEPT. |
| SEC-15 | Info | safe | `profiles.avatar_path` is client-writable without folder check, but nothing signs it with the service key (clients sign with their own RLS). Production: 0 avatar paths outside their couple folder. | code-read + production s10 | ACCEPT (add the SEC-01 shape check if a server-side signer appears). |
| SEC-16 | Low | auth config | Advisor `auth_leaked_password_protection` (WARN): Supabase Auth does not check new passwords against HaveIBeenPwned. The check only runs when a password is **set** (sign-up, password change or reset). In US none of these exists: signup is disabled (F1A, `config.toml`), the client has no `signUp` / `updateUser` / `resetPasswordForEmail` call, and the two real accounts already have passwords, which the setting would never re-check. Enabling it is an Auth configuration change, which this mission must not make. F1A already listed it as deferred. | advisor + code (test 18) | ACCEPT. Enable it in the same step that adds any password-setting flow, or as a standalone Auth setting (Dashboard > Authentication, password security; it may depend on the plan). Zero app impact either way. |

Everything not listed was classified **safe**. Summary of §3.1–§3.4:

### 3.1 RLS coverage and policies
- All 57 public tables have RLS. Every SELECT policy on a table with `couple_id` is couple- or user-scoped (invariant test).
- All 14 UPDATE policies have both USING and WITH CHECK.
- Couple isolation proven dynamically on couples, profiles, calendar_entries, moments, shared_events, daily_answers, shared_messages, left_for_you, bucket_items, activity and storage: Francesco and Beatrice see only C1, the foreign couple only C2, both partners keep the shared view (moments, events, profiles, couple media), daily answers stay per-user until the reveal RPC.
- anon and the profile-less email user read nothing except the SEC-07 catalogs.

### 3.2 Authority columns
The F1C column grants hold: no client can change `profiles.couple_id/role`, `couples.bond_xp`, ownership columns, or write `calendar_reminders`. The only unchecked client-written value with a server-side consumer is SEC-01.

### 3.3 SECURITY DEFINER RPCs
Every authenticated-callable definer RPC derives the couple from `auth.uid()` (`private.current_couple_id`, `m11a_actor[_locked]`, `daily_reveal_context` or a `profiles` lookup) and filters target rows by that couple; "not found" and "other couple" return the same error. None accepts a couple or user id from the caller except the two SEC-02 helpers. Reveal-gated data (`get_daily_state`, `keep_daily_question`, `daily_question_outcomes`, game sessions) is released only after both answers. Pinned in the test as the reviewed surface: any new client-callable function fails it until reviewed.

### 3.4 Edge Functions using the service key
`send-web-push`, `game-v2-push`, `delete-moment`, `widget-*`, workers: each authenticates (JWT, hashed widget token or Vault cron key) and re-derives the couple server-side. Findings: SEC-01 (signing), SEC-12 (removal). The workers (`verify_jwt=false`) require the Vault cron key.

---

## 4. Production vs repo drift

Production run of the pack (s01–s11) compared with the repo rebuild (baseline + F2C) by test 17:

| Block | What | Result |
|---|---|---|
| s01 | ledger, roles | Ledger = `20261004000000 us_2_0_baseline`, `20261004110718 f2c_edge_cron_source_of_truth`: SEC is the next push. PG 17.6. Only `service_role` bypasses RLS. `authenticator` role settings carry no `pgrst.db_schemas` (exposed schemas are set in the API settings, not on the role); `private` is not exposed either way, and nothing in it is anon-callable. |
| s02 | 57 public + 2 private tables, RLS flags, client privileges | **equal** |
| s03 | 73 public + 4 storage policies | **equal** |
| s04 | 145 functions: definer, search_path, ACL, client EXECUTE, body md5 | **equal** |
| s05 | column grants | **equal** |
| s06 | views | **equal** |
| s07 | storage bucket | **equal** |
| s08 | realtime tables, `private` schema ACL | **equal**. Default privileges and the `public` schema ACL are platform-owned and differ only by platform entries (`postgres`, `supabase_admin`); they confirm SEC-08 (new functions in `public` start executable by `anon`). |
| s09 | auth.role / JWT / metadata usage | **equal** (2 functions, no policy) |
| s10 | data (counts only) | 1 couple, 2 profiles, 11 auth users (8 anonymous, 9 without profile), 51 objects all in the couple folder. `home_photo_path` = 1 row, inside its folder (SEC-01 precondition holds). `calendar_reminders` = 0. Moments, album photos, avatars, Left for You media: 0 paths outside their folder. |
| s11 | realtime authorization | `realtime.messages` exists with **no policy**: every private broadcast/presence channel is refused. The client uses none. |

Arrays are compared as sets: production sorts with its collation, the rebuild with C (same rows, different order).

**Drift: none** in tables, RLS, policies, functions, grants, views, storage or realtime. Repo intent (F1A–F1C, F2A.1 baseline, F2C) equals production.

Not covered by SQL: the deployed bytes of `us-widget-state` v4 (SEC-01 is fixed in the database, so it holds whatever they are) and Auth settings (SEC-16).

---

## 5. Proposed fixes (exact)

`supabase/migrations/20261004150000_sec_rls_hardening.sql`:

```sql
-- preconditions (abort, nothing applied): helpers exist; no client INSERT grant
-- on calendar_reminders; 0 couples with a home_photo_path outside their folder.
alter table public.couples drop constraint if exists couples_home_photo_path_own_folder;
alter table public.couples add constraint couples_home_photo_path_own_folder check (
  home_photo_path is null
  or (starts_with(home_photo_path, id::text || '/') and position('..' in home_photo_path) = 0));
revoke execute on function public.calendar_reminder_recipient_in_couple(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.calendar_reminder_offset_valid(uuid, integer) from public, anon, authenticated;
-- postconditions (abort): no client EXECUTE, service_role keeps EXECUTE, constraint validated.
```

No data change, no function body change, no new grant, no Edge, no client, no Service Worker/cache change (so no build-id bump). Re-applying it changes nothing.

App impact: none. The current client never writes `home_photo_path` (it only reads it, `app.js:1031`) and never calls the two helpers. The calendar reminder worker runs as `service_role` and keeps both helpers (tested: insert + `sent_at` update).

---

## 6. Tests added — `tests/sec-rls-hardening.test.js`

| # | Test | Proves |
|---|---|---|
| 1 | migration source | newest, after F2C, listed in MIGRATION_CUTOFF, no DML / function / grant |
| 2 | re-apply | idempotent |
| 3 | preconditions | aborts with a foreign `home_photo_path` or a restored INSERT grant, nothing applied |
| 4–5 | SEC-01 before / after | exploit accepted on base; refused (23514) on head for foreign, `..`, bare, empty, URL paths; own-folder, null, name/started_on edits and service_role still behave |
| 6–7 | SEC-02 before / after | oracle answers about C2 on base; 42501 for authenticated, profile-less and anon on head; service_role insert, CHECK rejections and `sent_at` update unchanged |
| 8 | SEC-03 accepted | tautology not exploitable with or without the grant |
| 9–13 | invariants | RLS everywhere; 0 anon functions; reviewed authenticated RPC list; pinned search_path; UPDATE USING+CHECK; no tautology; anon-reachable policies identity-bound; no JWT/metadata authorization; views invoker; storage private and folder-scoped |
| 14–15 | isolation | two couples isolated, partners share, answers private; anon / profile-less read nothing but catalogs |
| 16 | pack | read-only, one SELECT per block, no secret column, runs on the rebuild |
| 17 | pack vs production | s02–s09 of the committed production run equal the rebuild; s10 preconditions; ledger; SEC-08 default ACL; realtime has no private-channel policy |
| 18 | advisors | exactly 3 lints: `rls_enabled_no_policy` names = the 23 deny-all tables; `authenticated_security_definer_function_executable` names = the reviewed definer surface (34), and SEC-02 removes exactly the 2 helpers (32); `auth_leaked_password_protection` = SEC-16, with no password-setting call in the client |

`tests/f2c-edge-cron-source-truth.test.js` now accepts forward migrations newer than F2C (it pinned the list to exactly two files).

---

## 7. Remaining accepted risks

SEC-03 … SEC-16 above. The ones worth a later mission: SEC-08 (default privileges) and SEC-05 (anon grants) as one "closed by default" step; SEC-12 (delete-moment removal scope); policy cleanup for SEC-03/04.

---

## 8. Security advisors (production, 2026-10-04 15:28 UTC)

| Lint | Level | Count | Classification |
|---|---|---|---|
| `rls_enabled_no_policy` | INFO | 23 | Intentional deny-all tables (RPC- or service-only), same 23 names as §2. Matches the expectation. |
| `authenticated_security_definer_function_executable` | WARN | 34 | The reviewed client RPC surface (§3.3), same 34 names. Matches the expectation. Becomes **32** after SEC-02. |
| `auth_leaked_password_protection` | WARN | 1 | Not classified before: now **SEC-16**, accepted with rationale (§3). |

Absent, as expected: `rls_disabled_in_public`, `policy_exists_rls_disabled`, `security_definer_view`, `function_search_path_mutable`, `anon_security_definer_function_executable`, `auth_allow_anonymous_sign_ins`.

---

## 9. Production rollout result

The reviewed migration `20261004150000_sec_rls_hardening.sql` was applied atomically to production on 2026-10-04 and recorded in the remote migration ledger with the exact reviewed version/name.

Post-rollout verification:

- `couples_home_photo_path_own_folder` exists and is validated;
- `anon` and `authenticated` cannot execute the two calendar reminder SECURITY DEFINER helpers; `service_role` still can;
- security advisors are 23 / 32 / 1, with no new lint;
- `us-calendar-reminders-dispatch` succeeded after rollout and its worker returned HTTP 200;
- migration ledger is baseline + F2C + SEC;
- post-rollout s10 remains clean;
- no Edge, Auth, frontend or application-data change was made.

Authoritative evidence: `docs/us-2.0/SEC_RLS_PRODUCTION_POST.json`.

Rollback, if ever required, must be a new forward migration; do not rewrite migration history.
