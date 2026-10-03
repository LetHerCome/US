# US 2.0 — F1C Authority / RLS Write-Boundary Hardening

**Status:** F1C_READY_FOR_REVIEW (not merged)
**Project:** Supabase `iiakdfsxpywdkxravqjh`
**Migration:** `supabase/migrations/20261003200000_f1c_authority_write_boundaries.sql` (grants only)

## SOURCE

- **Branch:** `mission/us-2-0-f1c-authority-rls-hardening`, in a fresh worktree `.claude/worktrees/us-2-0-f1c-authority-rls`. The F1B worktree was not reused. No F1C branch or worktree existed beforehand.
- **Base:** `origin/main` `98c473c3b5616dcb952b1a2e883de2e6c93b6667` (F1B merge). It had not moved since the mission was issued.
- **Head:** see the completion report. It is the doc commit on top of `8d3655a` (migration + tests).

---

## AUTHORITY MAP

I read the map live from production (2026-10-03): `pg_class.relacl`, `pg_attribute.attacl`, `pg_policies`, `pg_trigger` and `pg_constraint`.
- All 57 public tables have RLS enabled.
- A write is effective only when `authenticated` holds both the privilege and a permissive policy for that command. That leaves **18 tables**.
- Every other table that grants writes has no write policy, so RLS denies those writes.

I mapped write paths with a multi-line scan of every `.from(table).insert|update|upsert|delete` in client, Edge, widget and native code, the `.rpc` callers from F1B, and the trigger and constraint bodies.

| Table | Ops (grant ∩ policy) | Authority columns | How they are held | Client / server writer | Verdict |
|---|---|---|---|---|---|
| **profiles** | UPDATE | `couple_id`, `role`, `id` | Policy `id = auth.uid()` only; table-wide UPDATE | client: `avatar_path` only (`app.js` photo) | **VULNERABLE → fixed** |
| **shared_messages** | INSERT, UPDATE | `sender_id`, `recipient_id`, `couple_id` | INSERT check is good. UPDATE: `USING recipient = me`, `CHECK couple + recipient`; table-wide UPDATE | client: none (sends via `send_think` RPC; reads via SELECT / Realtime) | **VULNERABLE → fixed** |
| **shared_events** | INSERT, UPDATE, DELETE | `created_by`, `couple_id` | UPDATE CHECK pins only `couple_id`; table-wide UPDATE | client: `events.js` insert, update(payload), delete | **VULNERABLE → fixed** |
| **calendar_reminders** | INSERT, UPDATE, DELETE | `requested_by`, `recipient_id`, `entry_id`, `couple_id` | UPDATE CHECK pins requester + couple only and never re-validates entry or recipient. The INSERT check has tautologies (`p.couple_id = p.couple_id`), but its entry subquery is RLS-filtered, so it is not exploitable. | client: **none since M9C** (`89fd9a1`, 2026-09-29). Worker writes `sent_at` with the secret key. | **VULNERABLE → fixed** |
| bucket_items | INSERT, UPDATE, DELETE | `couple_id`, `created_by`, `lived_proposed_by` | Guard triggers make `couple_id` / `created_by` immutable and route lived state through the confirm RPC | client: `app.js` | held |
| calendar_entries | INSERT, UPDATE, DELETE | `couple_id`, `created_by`, `owner_id`, `entry_type` | Guard trigger (immutable type / couple / creator) and CHECKs (`owner_by_type`, `personal_owner_is_creator`) | client: `calendar.js` | held |
| couples | UPDATE (columns `name`, `started_on`, `home_photo_path`) | `id`, `bond_xp` | Column grants already | client: `settings.js` `started_on` | held |
| couple_locations | INSERT, UPDATE | `user_id`, `couple_id` | USING and CHECK both pin `user_id = me`, couple = mine | client upsert | held |
| daily_answers | INSERT, UPDATE | `user_id`, `couple_id` | CHECK pins both | client upsert | held (see follow-ups: `question_id`) |
| moments / moment_photos | INSERT, UPDATE, DELETE | `created_by`, `couple_id` | USING and CHECK pin both | client | held |
| moods | INSERT, UPDATE | `user_id`, `couple_id` | CHECK pins both | none (legacy) | held |
| notification_preferences | INSERT, UPDATE | `user_id` | USING and CHECK `user_id = me` | RPCs | held |
| left_for_you | INSERT | `sender_id`, `recipient_id`, `couple_id` | CHECK pins sender = me, recipient = partner in couple | client insert | held |
| activity | INSERT | `actor_id`, `couple_id` | CHECK pins both | none | held |
| stories / story_views | INSERT, DELETE / INSERT | `author_id` / `viewer_id` | CHECK pins them | `stories.js` | held |
| device_push_tokens | DELETE | `user_id` | USING `user_id = me` | none | held |

---

## CONFIRMED VULNERABILITIES (exact before behaviour)

I reproduced these on production as an authenticated partner (`set local role authenticated` with the real `sub` claim). Everything ran inside a single DO block that always ends in `RAISE EXCEPTION`, so every fixture and attempt rolled back. A full-table md5 fingerprint before and after the probe showed **0 changed tables**.

| # | Attempt (as Francesco) | Before F1C | Severity |
|---|---|---|---|
| 1 | `profiles.couple_id = <another couple>` | **allowed**. `current_couple_id()` switched to the foreign couple, and that couple's calendar entry became readable. Needs that couple's UUID; production has one couple, so the live impact is self-lockout or tampering. | **P1** |
| 2 | `profiles.couple_id = null` | **allowed** | P1 |
| 3 | `profiles.role = 'beatrice'` | blocked only by the unique index `profiles_one_role_per_couple` (23505), not by authorization. **Allowed** right after #2. | P1 |
| 4 | Recipient rewrites `shared_messages.sender_id`, `body`, `kind` | **allowed**. A received "Ti penso" could be forged into anything, attributed to anyone. | **P1** (integrity) |
| 5 | `shared_events.created_by` reassigned by either partner | **allowed** | P2 |
| 6 | Requester re-points a reminder to the partner's personal entry and recipient | **allowed** | P2 |
| 7 | Update Beatrice's profile row | 0 rows (RLS works) | — |
| 8 | Insert a reminder on a foreign couple's entry | refused 42501 (RLS-filtered subquery) | — |

---

## CHANGES

These are grant changes only. No policy, trigger, function, row or service_role privilege changed. The table-level privilege is revoked first, because a table-wide UPDATE grant overrides column grants.

```sql
revoke update on table public.profiles from authenticated, anon;
grant update (avatar_path) on table public.profiles to authenticated;

revoke update on table public.shared_messages from authenticated, anon;

revoke update on table public.shared_events from authenticated, anon;
grant update (title, event_date, event_time, location, note, recurs_yearly) on table public.shared_events to authenticated;

revoke insert, update, delete on table public.calendar_reminders from authenticated, anon;
```

The migration ends with a DO-block self-check. It aborts if any authority column of the four tables is still updatable by anon or authenticated, if a legitimate column grant is missing, or if the `calendar_reminders` read-only / service-role boundary is wrong.

Notes on each fix:
- **profiles:** `display_name` is not granted, because no client path edits it. I didn't invent a feature.
- **shared_messages:** the now-unused `messages_update_recipient` policy stays in place (inert without a grant) to keep F1C grant-only.
- **calendar_reminders:** the INSERT policy tautology also stays in place (inert, the INSERT grant is gone).

**Rollback** (not needed; recorded for completeness):
- `grant update on public.profiles, public.shared_messages, public.shared_events to authenticated, anon;`
- `grant insert, update, delete on public.calendar_reminders to authenticated;`

---

## AUTHORITY MATRIX

Verified live after the change, in a rollback-only probe, symmetric for Francesco (F) and Beatrice (B).

| Table | Operation | Authority column | Before | After | Enforcement |
|---|---|---|---|---|---|
| profiles | UPDATE self | `couple_id` → null | allowed | **42501** (F, B) | column grant (`avatar_path` only) |
| profiles | UPDATE self | `couple_id` → foreign couple | allowed (re-scoped access) | **42501** (F, B) | column grant |
| profiles | UPDATE self | `role` | allowed once the slot is free | **42501** (F, B) | column grant |
| profiles | UPDATE self | `display_name` (unused) | allowed | **42501** (F, B) | column grant |
| profiles | UPDATE partner | any | 0 rows | 0 rows (F, B) | RLS `id = auth.uid()` |
| profiles | UPDATE self | `avatar_path` (legitimate) | allowed | **allowed** (F, B) | column grant |
| shared_messages | UPDATE as recipient | `sender_id` / `body` / `kind` | allowed | **42501** (F, B) | no UPDATE grant |
| shared_messages | UPDATE | `recipient_id`, `opened_at` | allowed | **42501** (F, B) | no UPDATE grant |
| shared_messages | INSERT (legitimate) | `sender_id = me` | allowed | **allowed** (F, B) | policy (unchanged) |
| shared_events | UPDATE | `created_by` | allowed | **42501** (F, B) | column grant |
| shared_events | UPDATE | `couple_id` | allowed (same couple) | **42501** (F, B) | column grant |
| shared_events | UPDATE / INSERT / DELETE (legitimate) | content columns | allowed | **allowed** (F, B); `updated_at` still set by trigger | column grant + policy |
| calendar_reminders | UPDATE | `entry_id` / `recipient_id` | allowed | **42501** (F, B) | browser SELECT only |
| calendar_reminders | INSERT / DELETE | requester / recipient | allowed | **42501** (F, B) | browser SELECT only |
| calendar_reminders | SELECT (legitimate) | — | allowed | **allowed** (F, B) | policy |
| calendar_reminders | UPDATE `sent_at` (worker) | — | service_role | service_role (unchanged) | service_role grant + BYPASSRLS |
| couples | UPDATE `started_on` (legitimate) | — | allowed | **allowed** (F, B) | existing column grant |

`private.current_couple_id()` still resolves to the couple for both partners.

---

## UNCHANGED / DEFERRED (investigated, intentionally left)

- **Other writable tables (14):** held by CHECKs, guard triggers or existing column grants (see the map).
- **Inert leftovers.** The `shared_messages` UPDATE policy and the `calendar_reminders` INSERT/UPDATE/DELETE policies remain. The INSERT tautology `p.couple_id = p.couple_id` / `e.couple_id = e.couple_id` remains too. All are inert without grants; drop them in a policy-cleanup pass.
- **Broad `anon` table grants** (INSERT/DELETE/TRUNCATE…) on ~20 tables. These are denied by RLS policies scoped to `authenticated`. F1C revoked only `anon` UPDATE on the three tables it fixed.
- **F1B calendar-helper oracle (P2):** untouched, as instructed. Note that `calendar_reminders` no longer accepts browser writes, so the helpers' CHECK-constraint role is now exercised by service_role only. That makes revoking authenticated EXECUTE possible in a later step.
- **daily_answers `question_id`:** the owner can move their own answer to another question of the couple. This is content routing on their own row, not an identity or authority column.
- **moment_photos `moment_id`:** the creator can re-attach their own photo to another moment of the same couple (INSERT allows the same).

---

## PRODUCTION CHANGES

1. The committed migration file, applied verbatim in one transaction (`supabase db query --linked -f`), on 2026-10-03 at about 15:25 UTC. The self-check passed.
2. Ledger row `20261003200000` only, via `supabase migration repair --status applied 20261003200000`. I didn't use `db push`, because the historical ledger drift is unchanged.

Pre-apply:
- the target ACLs were byte-identical to the captured before-state;
- I took a full-table fingerprint;
- the migration and tests were committed first (`8d3655a`).

**ACLs before → after:**
- `profiles`, `shared_events`, `shared_messages`: `authenticated` and `anon` went from `arwdDxtm` to `ardDxtm` (UPDATE removed).
- Column `w` grants were added for `authenticated`: `profiles.avatar_path` and `shared_events.{title, event_date, event_time, location, note, recurs_yearly}`.
- `calendar_reminders`: `authenticated` went from `arwd` to `r`.
- `service_role` is unchanged on all four tables.

---

## VERIFICATION

- **Authority matrix above:** I ran it live for both partners. Every authority mutation now returns 42501, every legitimate operation succeeds, and every attempt rolled back.
- **Data:**
  - **56/57 public tables are byte-identical** before and after. That includes `profiles` (2 rows), `couples` (1), `couple_invites` (2), `shared_messages` (72), `shared_events` (4) and `calendar_reminders` (0).
  - The one difference is `widget_tokens`: same 3 rows, but one token's `last_used_at` moved to 15:32:40 UTC. That is the phone widget being used through the service-role Edge Function. The every-minute expiry cron reported `UPDATE 0` throughout, and F1C grants nothing on that table.
- **Profiles and couple:** Francesco and Beatrice keep their ids, roles and couple (the profile and couple rows' md5 is unchanged), and `current_couple_id()` resolves for both.

---

## TESTS

New: `tests/f1c-authority-write-boundaries.test.js` (8 tests). It uses pglite with the four tables' production columns, ACLs, policies, triggers, constraint helpers and the verbatim `private.current_couple_id()`. There are two couples: F + B, and a foreign user X.
- The pre-F1C fixture reproduces each hole: every `AUTHORITY_MATRIX` attack succeeds, the cross-couple move makes the foreign couple readable, and the role changes after leaving the couple.
- After the real migration, every matrix attack is refused with 42501.
- The legitimate writes of both partners still work, and `updated_at` is still touched.
- Profiles: symmetric F/B reads, couple resolution, and no cross-profile or foreign updates.
- A foreign user cannot reach the couple's messages or events.
- Reminders: the browser can only read, service_role still marks `sent_at`, and deleting an entry still cascades.
- The migration contains only grants, is idempotent, and its self-check aborts on the pre-F1C ACLs.
- Client contract: the shipped client's writes to these four tables are exactly the expected set, and the `shared_events` editor payload stays inside the column grant.

| Command | Result |
|---|---|
| `node --test tests/f1c-authority-write-boundaries.test.js` | 8 pass, 0 fail |
| `node --test tests/f1a-auth-shutdown.test.js tests/f1b-rpc-grant-hardening.test.js tests/beatrice-password-login.test.js tests/m6a-calendar-domain-backend.test.js tests/us-human-ui-02.test.js` | 78 pass, 0 fail |
| `node --test tests/m6d-reminders.test.js tests/m4a-think-backend.test.js tests/m4b-think-ui.test.js tests/m12a1-brand-events.test.js` | 36 pass, 0 fail |
| `npm test` | 1307 tests: 1237 pass, **37 fail**, 33 skipped |
| Failure set vs the known Windows baseline | **identical** 37 (M9A, M10C, M11B catalog, M11C recipes and M11D push suites). 0 new, 0 fixed. The test count is 1299 + 8 = 1307. |
| `npm run build:cloudflare-pages` | OK, 141 files |
| `npm run build:capacitor-web` | OK, 139 files. Its whitespace-only `android/brand-assets-manifest.json` rewrite was reverted. |

No runtime file changed, so there is no build-id bump and no Service Worker impact.

---

## ADVISORS (security)

| Advisor | Before | After |
|---|---|---|
| `authenticated_security_definer_function_executable` | 34 | 34 |
| `auth_leaked_password_protection` | 1 | 1 |
| **Total** | **35** | **35** |

There are no new and no resolved findings. As expected, the advisors don't model column-level authority.

---

## FOLLOW-UPS (F2 or later)

- **Policy cleanup.** Drop the inert `messages_update_recipient` and `calendar_reminders_*` write policies, and fix or drop the tautological reminder INSERT policy.
- **Calendar helper oracle (F1B P2).** Now only service_role writes reminders, so revoke authenticated EXECUTE on the two helpers or make them SECURITY INVOKER.
- **Broad anon table grants.** Revoke anon INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES from public tables that no anon path uses.
- **Default privileges** for new tables and functions in `public`.
- **Profile display names.** If the product ever edits them, add a deliberate column grant.
