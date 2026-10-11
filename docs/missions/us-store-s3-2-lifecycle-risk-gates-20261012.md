# US Store 1.0 · S3.2 — Lifecycle and deletion safety audit
**2026-10-12 · DESIGN/SECURITY PREFLIGHT · NO DESTRUCTIVE OPERATIONS AUTHORIZED**

## Scope and precedence

- Deliver a self-service path for **export my data**, **delete my account**, **end my membership/separate**, and (when appropriate) **erase a shared space**.
- Account deletion != unpair != device logout != couple deletion. They must be four distinctly named, authenticated actions.
- This branch adds **policy documents and offline tests only**. No UI exposed, migrations, Edge deploy, account deletion, storage purge, secret, signup change, PR merge or production action.
- Product decisions D1/D2/D3/D5 stay locked; monetization D4 out of scope. Native push gate #181, S3.1 #189 and S2 #180 are independent in-progress workstreams.

## STAGING schema evidence (read-only)

US-STAGING Supabase project `dugmhngrfkuieeletatb`: 3 synthetic completed couples, 6 profiles/users during inspection, 0 objects in private `storage.us-media`. The current database has:

| Parent row removed | `CASCADE` FKs | `SET NULL` FKs | Blocking `NO ACTION` FKs |
|---|---:|---:|---:|
| `auth.users` | 7 | 2 | 0 |
| `public.profiles` | 24 | 3 | 1 |
| `public.couples` | 41 | 0 | 0 |

**Concrete unintended-loss examples:** deleting an `auth.users` row cascades the user's `profiles` row and **all** `shared_messages` for which that person is *sender OR recipient*. Deleting the profile cascades `moments`, `moment_photos`, `calendar_entries` created by or owned by that person, `shared_events`, `stories`, `left_for_you`, subscriptions and device tokens. `shared_event_completions.completed_by` references profiles with default NO ACTION, so naive deletion may also error. `couples` deletion cascades through **41** FKs, including both members' profiles and activity/content. These are schema facts, not an acceptable privacy policy or approved implementation.

**Storage:** `us-media` bucket is PRIVATE, Storage RLS enabled; `storage.objects` uses own-couple folder restriction for read and own-uploader subfolder restriction for insert, plus ownership checks for change/delete. Two authenticated-principal, read-only `storage.foldername` / `private.current_couple_id()` probes passed (own path true, foreign-couple and other-user paths false), but no actual object upload/download from independent client JWTs has yet been tested. PostgreSQL row cascades do **not** prove object bytes have been deleted from Supabase Storage. The app also has private local caches, thumbnails, PWA SW media cache, widgets and push token retirement paths.

## Domain inventory and retention plan (requires review)

| Domain | Examples | Who contributes / who can view | Export | Delete/separate gate |
|---|---|---|---|---|
| Identity | `auth.users`, `profiles`, auth credentials, profile photos | Individual, selected profile to partner | Own profile fields, never credentials or raw tokens | Delete identity only via server after ownership recheck; stop sessions and tokens |
| Partner membership | `couples`, `couple_invites`, roles, start date | Both members, invitation bearer secret | Human-readable relationship metadata excluding invite secret | Must not delete both members' data from one member's request |
| Private media | `storage.us-media`, `moments`, `moment_photos`, story assets, avatars, optimized derivatives | Uploader and own couple (per current read policy) | Own or policy-permitted shared files with short-lived authenticated signed URLs | Must inventory every owned/reference path and physically purge or reassign before claiming success |
| Conversations | `shared_messages`, `left_for_you`, story messages | Sender/recipient or couple according to row policies | Own sent/received or couple-shared records after authorization | Current dual sender/recipient CASCADE can destroy partner messages — requires migration first |
| Shared calendar / plans | `calendar_entries`, `calendar_reminders`, `bucket_items`, `shared_events`, `shared_event_completions` | Shared/personal with distinct permissions | Own personal + approved shared export | Current actor/owner CASCADE can remove shared events; preserve partner data by explicit policy |
| Daily / relationship | `daily_answers`, `daily_question_*`, `conserva_contributions`, `relationship_milestones` | Individual contributions & shared outcomes | Own answers and allowed shared summaries | Decide historic contribution attribution and shared keepsakes |
| Games / progress | `game_sessions`, `quiz_responses`, `partner_knowledge_attempts`, `bond_*`, `progression_*` | Own results + shared progress | Own results and shared stats with provenance | Must not leak deleted user's answers or corrupt retained user's progression |
| Device integration | `device_push_tokens`, `push_subscriptions`, `notification_preferences`, `widget_*`, `push_event_log` | Account/device, not partner | Preferences only; NEVER push tokens | Retire FCM token/owner, invalidate widgets and subscriptions; purge device/PWA caches, guard stale FCM |
| Location | `couple_locations` | Individual sensitive location, optionally shared | Own points only subject to privacy policy | Remove at first safe opportunity; no lingering location in widget/media cache |
| Operational logs | Edge/function logs, telemetry, backend delivery logs | Service-controlled | Only subject-access-relevant records within retention policy | Define short retention, legal hold exceptions, no tokens/invites/credentials in logs |

**No retention duration has been approved.** Placeholder `TBD` must never silently become infinite retention or a hard-delete promise. External platforms/backups and support records need a separate bounded policy reviewed before release.

## Live STAGING RLS proof — moments and private messages (2026-10-12)

Two real but **synthetic QA principals**, belonging to different STAGING couples, were impersonated only for read checks via `BEGIN; INSERT synthetic rows; SET LOCAL ROLE authenticated; set_config('request.jwt.claim.sub', ...); SELECT; ROLLBACK;`. Synthetic fixtures deliberately had no real image object in Supabase Storage and contained no personal conversation text.

| Principal | Own moment | Other couple's moment | Own private message | Other couple's message |
|---|---:|---:|---:|---:|
| Couple A | 1 visible | **0 visible** | 1 visible | **0 visible** |
| Couple B | 1 visible | **0 visible** | 1 visible | **0 visible** |

A subsequent independent read-only SQL verification found **0 test moments, 0 test messages, 0 test objects**. Tests prove current table RLS under authenticated role for these two surfaces, not Storage object GET/PUT, app-browser behaviour, every RPC or a third-party security review. No real user data was modified; any progression effects of the moment insert were within the rolled-back transaction.

## Presidency decision — A APPROVED (2026-10-12)

**Approved product principle:** If one US member deletes their account, the other partner may retain **eligible shared** memories, photos, calendar events and other history **only under explicit, applicable privacy/ownership conditions**. The departing member's credentials, device tokens, exact location and data to which only they are entitled must be deleted or restricted per the approved erasure procedure. Do not turn a partner's ability to retain memories into a blanket right to keep every personal or sensitive datum.

**Four distinct operations:** device logout, separation/unpair, individual account erasure, and whole-space erasure must remain separate. No single-user account request may trigger whole-space erasure. An explicit, separately authorized policy and independent rights checks are mandatory for any whole-space deletion.

**Mechanically safe classification (preview ONLY):**
- `actor-personal` → erasure review for the requesting member, never a partner export.
- `partner-personal` → preserve untouched; one member cannot authorize its deletion.
- `shared` → **eligible for scoped preservation only after a rights/privacy review**. If sensitive, disputed, or not reviewed, fail closed pending review. Do not assume consent because both partners once participated.
- `actor-device` → token/session/widget retirement review; never export a secret or retain it for partner.

The policy preview in `s3-2-preservation-a-preview.cjs` is a pure, offline, non-executable classifier; it has **no database, Firebase, Storage or Auth permissions**. Every output remains review-only even when rights flags are true. This is not the deletion backend.

**Still OPEN, and not silently authorized by decision A:** limits of each party's personal data rights and copyright, sensitive media, rights to object/restrict, export scope, time limits for retention and backup cleanup, exact Storage ownership transitions, GDPR/privacy counsel review, error handling and migration of cascade FKs. No implementation can claim complete data erasure until physical Storage bytes, sessions, push and caches are accounted for. Individual erasure requests must have a real, supported path and must not be blocked indefinitely by an unreviewed product policy.

**Result:** product principle A approved; **destructive execution remains blocked** until these specific safeguards, server implementation and tests are completed.

## Proposed implementation order, gated

1. **Read-only preflight**: authenticated user context, fresh reauthentication, trusted membership RPC and owner proof, both-membership snapshot, quota limits, owned/shared data inventory including storage paths; no raw JWT/email in logs.
2. **Download first**: asynchronous server-generated export with manifest, per-file checksums, bounded signed URLs, encryption in transit, expiry, rate limit, idempotent status and explicit permission boundaries; avoid giving partner's personal data or other-tenant bytes. Do not put email/tokens in filename.
3. **Device disconnection**: clear local app storage, PWA/media caches, widget snapshots, native owner, FCM token and subscriptions; revoke sessions/recovery/device grants where possible. Delayed in-flight FCM must fail closed (S3).
4. **Membership transition**: server-only, row-locked/idempotent RPC with approved shared-data preservation rules, revoke invites, stop scheduled reminders and game jobs, prevent rejoin to old private space. Two concurrent delete/unpair attempts must never erase an uninvolved member.
5. **Storage and Auth identity removal**: enumerate physical object paths before FK cascades, use audited server-side Storage API and retries, verify bytes removed, then remove user identity when remaining content/ownership is safe. Handle eventual job failure with explicit `pending_cleanup`; never report success before confirmed.
6. **Recovery/security**: expired/reused request, offline interruption, restored app/session on Android/iOS, link replay, copy of export outside account, cross-tenant RLS and storage negative-path with two distinct couples.
7. **Google Play & app surfaces**: in-app discoverable delete/export controls, public HTTPS deletion help/request page, privacy-policy and retention disclosures, support channel, no forced phone calls. Legal/privacy review before launch.

## Acceptance evidence and stop conditions

- Real four-account/two-couple STAGING lifecycle tests with benign private fixtures, including concurrent delete/unpair, failed storage cleanup, offline logout and new partner pairing.
- Reviewed RLS / `SECURITY DEFINER` ownership checks on every new RPC/Edge function; **no client service_role credentials**.
- A successful deletion request must not leave foreign-accessible media, OAuth/recovery grants, server-deliverable push or private SW cache; no accidental shared-content loss.
- Audit only synthetic fixtures, never store passwords/tokens/real photos in CI logs or GitHub issues.
- Block if partner-data policy remains unresolved, P0 #181 open, or S3.1 #189 not ready.
