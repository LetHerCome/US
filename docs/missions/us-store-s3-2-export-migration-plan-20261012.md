# US Store S3.2 — export-first and safe-FK migration execution plan
**2026-10-12 · NOT DEPLOYED · PR #190 DRAFT · Policy A approved in principle**

## 1. Real user export: phase 1, read-only

- Core serializer: supabase/functions/_shared/s3-2-export-core.mjs.
- Prototype GET Edge route: supabase/functions/export-my-data/index.ts.
- **Fail-safe gates:**
  - Host must be exactly SUPABASE_URL=https://dugmhngrfkuieeletatb.supabase.co; US_S32_EXPORT_ENABLED must equal true. Default is NOT AVAILABLE, even after accidental deploy.
  - Same-origin browser only: https://us-staging-s31.pages.dev; nonbrowser clients must still present bearer token.
  - SUPABASE_ANON_KEY or publishable key with request JWT, never service_role or secret fallback. Auth getUser validates session and must match queried own profile and couple. All domain reads use actual RLS plus explicit owner and couple filters; mismatches reject entire export.
  - Revalidate identity and membership before response to stop account/couple changes mid-export.
  - Maximum response **1 MiB** and **500 rows/domain**. Keyset pagination in batches of 50, sorted by each domain's unique UUID key, with an additional probe after the 500th record; returns 413 rather than a truncated success. Duplicate/out-of-order cursor rows fail closed. The current partial export is not a consistent cross-table transaction snapshot; edits made concurrently may change the contents, so full-release export still needs an audited snapshot/async job.
  - No-store/private caching; generic error responses without secrets or private logs.
- Explicitly PARTIAL, not a full GDPR/portability fulfillment and not downloadable in the app yet: only actor-authored records across 13 domains. Partner-authored shared content, sensitive media binaries, precise location, token credentials, and other feature domains are excluded pending review.
- Filename explicitly identifies the export as partial. Never present this as complete export until media and other domains are audited.
- **Open before STAGING activation:** real JWT/CORS/abuse tests, rate limiting, pagination or asynchronous export for large users, per-domain policy review, right to access shared data, media downloads/expiry, external privacy counsel review.
- **Deployment caution:** main supabase/config.toml targets production. Do not use generic Supabase deployment without an explicit STAGING ref and separate authorization. This PR has no deploy or enabled export.

## 2. Relational deletion cascade and migration strategy

STAGING schema evidence: auth.users has **7 CASCADE** FKs; profiles **24 CASCADE** and **1 NO ACTION**; couples **41 CASCADE**. Deleting auth.users can erase private messages where the person was sender OR recipient. Profile deletion also cascades memories, media rows, calendar, stories and events. Couple deletion cascades both members and all shared data.

**DO NOT** change FKs globally from CASCADE to SET NULL as a shortcut. Many actor columns are NOT NULL; triggers, client UI, progression and security policies depend on those columns. Blindly reassigning authorship to the partner would falsify attribution.

**Proposed later reviewed migration order:**

1. Server-only lifecycle state machine: active, export_ready, separating, erasure_pending, cleanup_verified. Separate device logout, unpair, personal account deletion and whole-space deletion. Must be row-locked, idempotent and revalidated by server Auth and current membership.
2. Explicit per-content shared preservation contract and per-person rights check. Preserve only appropriate shared items, not sensitive/disputed/unreviewed media. Scrub departed creator attribution without inventing a different author or retaining identifying information without a legal basis.
3. Rewrite FKs PER TABLE with dependent NOT NULL, trigger, UI, RLS and RPC changes. For messages remove sender/recipient cascades that erase the remaining partner's copies; for moments/calendar distinguish personal from reviewed shareable content first. Handle existing shared_event_completions NO ACTION reference.
4. Complete export and object-byte cleanup before enabling deletion. Test on ISOLATED disposable 2-couple fixtures, not the six account baseline in STAGING.
5. Revoke invites, push subscriptions/FCM bindings, widgets, cache and signed media access. Ensure old JWTs cannot see data after member removal.
6. Verify database rows, actual Storage bytes and Auth/session cleanup before reporting success. Cover retries, interruption, concurrent requests, cross-tenant negative paths and legal retention windows.
7. Only after independent security/legal review use an explicit STAGING feature flag, then production-release review. Product choice A does not authorize any deletion.

## 3. Read-only preflight

docs/missions/us-store-s3-2-foreign-key-preflight-20261012.sql enumerates FK dependencies, Storage bucket/row policies and RLS flags within a READ ONLY transaction. No DDL/DML, credentials or individual user data.

A separate read-only STAGING inspection captured **all 78 foreign keys** directly referencing auth.users (9), profiles (28) and couples (41), including dependent column nullability and ON DELETE behavior, in docs/missions/us-store-s3-2-fk-coverage-20261012.json. Every row has a fail-closed migration gate; **zero resolutions are approved or implemented**. Tests require complete coverage of recipient/sender message FKs, Moments, calendar and the blocking completion FK. This manifest is schema evidence, not a runnable migration, and MUST be rechecked against the exact target schema immediately before any DDL.

## 4. Exit gates

- Independent JWT and Storage object GET/PUT denial tests with two pairs.
- Per-domain export and preservation review, including location, Daily, games, cache and notifications.
- No accidental destruction of the surviving partner's owned/shared approved data.
- Media signed URL expiry, retention/deletion window and independent physical cleanup verification.
- No indefinite hold preventing a lawful personal erasure request.
- In-app and external HTTPS deletion request flow for Google Play.
- Reconciliation with S3.1 PR #189, S3 native push PR #187 and independent privacy review.

## 5. Full-schema disposable PostgreSQL rehearsal and Phase-1 account-exit preview — 2026-10-12

**Only local isolated test databases** were used, recreated from the repository's actual baseline/migrations with `tests/helpers/mc2-db.js`. No STAGING SQL DDL/DML, no real user delete and no production writes.

**Observed in disposable PostgreSQL:** given two distinct two-member couples and synthetic shared messages, Moments and calendar entries, deleting an Auth user cascaded and removed a message, a Moment and a shared event authored by that person. Deleting the author in a case containing `shared_event_completions.completed_by` instead raised PostgreSQL `23503` (`NO ACTION`). Every destructive trial executed in an explicit transaction with `ROLLBACK`; tests independently proved complete restoration. This is evidence against performing any direct Auth `deleteUser` before the FK/retention policy migration, not evidence of a safe deletion solution.

**New STAGING-only draft:** `docs/missions/us-store-s3-2-stage1-exit-preview-draft.sql` introduces a **read-only impact preview RPC**, not an account-deletion API. It is intentionally **outside** the automatic `supabase/migrations` directory, un-deployed, and refuses reinstallation/overwrite. No user-facing UI is connected.

- `public.s32_preview_account_exit()` computes aggregate **own** sent/received message counts, self-created Moments/photos/calendar events, own Daily answers and push-device counts; no actual content, partner identity, email, token, or path leaves the DB. Response explicitly sets `individual_account_deletion_enabled=false` and `couple_deletion_enabled=false`.
- No client-supplied user ID or couple ID. Identity is taken from `auth.uid()`; membership is verified against a confirmed Auth user and its profile. All aggregate queries filter the requesting user's ID AND their current couple ID.
- `SECURITY DEFINER`, empty `search_path`, stable read-only routine, `EXECUTE` revoked from PUBLIC/anon and granted only to authenticated; missing profile or unconfirmed account fails with SQLSTATE 42501.
- The proposal itself does not create a retention ledger, change existing FKs, delete or export files, or grant support users access. Privacy, subject access, rate limiting, and independent security review remain mandatory before any real deployment.

**CI** https://github.com/LetHerCome/US/actions/runs/38243644809 verified **9/9 independent full-schema integration tests** (4 rollback-only data-loss rehearsals + 5 preview-RPC policy/authorization/tenant tests) and **37/37 contract/Node tests and Deno check**. These results are scoped to reconstructed local PostgreSQL; no real JWT HTTP/RPC or Storage GET/PUT test yet.

**Next real implementation stage:** approved retention/rights classification per content domain (including shared Messages/Moments/calendar), then one narrow FK remediation on isolated synthetic pairs with untouched partner content + physical media lifecycle. Do not expose a working delete button, mark an account deleted, or merge/deploy either RPC or migrations without the explicit security/privacy release gates.
