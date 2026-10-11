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

## Mandatory product-policy decision (Presidency)

**When one member leaves or requests account deletion, what happens to content created/shared during the relationship?** Do not write destructive code without the decision.

Options for deliberation:
- **A — Preservation for remaining member, with explicit boundaries (recommended direction):** keep eligible shared photos/events/keepsakes where permitted, remove leaver's personal profile/location/credentials/device access, scrub/restrict attribution according to agreed rules, let leaver download permitted export first. Requires FK redesign, media ownership and privacy review.
- **B — Suspend shared space pending both partners' decision:** freeze shared content from leaver's access, prevent creation of new entries, retain only for a clearly bounded, approved window before mutually authorized export/delete. No indefinite retention and no pretending the data is deleted.
- **C — Delete the entire shared space when either partner deletes:** **not recommended**; unilateral request would destroy non-requesting person's content.

Until policy is approved: **fail closed.** Do not delete profile/couple or unpair. A request can be recorded for manual review only after support/legal policy is specified; never mark it as erased prematurely.

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
