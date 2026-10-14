# US Store S3 — Legacy Firebase sender retirement / Google Play gate

Status: **PRODUCTION NOT MODIFIED. GO for preparatory audit and tests; NO-GO for native public release.**  
Prepared: 2026-10-11; tracking PR #187 (draft), issue #181 (P0).

## Evidence from LIVE Supabase, read-only

Project US (production): `iiakdfsxpywdkxravqjh`. Project US-STAGING: `dugmhngrfkuieeletatb`.

Production snapshot on 2026-10-11:
- `public.device_push_tokens`: **0 total / 0 FCM / 0 Android**. Do not interpret this as a permanent guarantee; re-check immediately before cutover.
- `public.push_subscriptions`: **6 Web Push registrations**. These must continue functioning.
- Four production pg_cron push/reminder jobs: `us-calendar-reminders-dispatch`, `us-daily-question-push`, `us-game-v2-push`, `us-left-for-you-push-sweep` (all active). Do not disable just to avoid an FCM issue: doing so would interrupt legitimate PWA reminders.
- Live Edge bundle sources of ALL eight FCM-capable functions contain **legacy `message.notification` and `android.notification`** with title/body and can therefore auto-display in Android without entering the guarded Java service:
  1. `send-web-push` (live v13)
  2. `widget-think-send` (v8; via shared `think-web-push`)
  3. `calendar-reminders-worker` (v6)
  4. `daily-question-push-worker` (v6)
  5. `left-for-you-push-worker` (v6)
  6. `game-v2-push` (v7)
  7. `game-v2-push-worker` (v7)
  8. `monthiversary-job` (v9)
- Six other active Edge functions inspected for alternate FCM sender code: no alternate FCM transport found. Future/new Edge functions require a fresh audit.
- Production legacy FCM includes `ttl: notification.ttl`; the longest native catalogue TTL found in the eight live bundles was **86,400 seconds (24 h)**. It may remain queued for this window *after its send time*.
- Data above are provider schema/configuration observations, **not** evidence of currently leaked notifications. With zero currently registered native devices, no current FCM routing was observed in this snapshot. No write queries executed.

## Why this matters

Android OS can directly render an FCM `notification` payload in background even when `onMessageReceived` of our `UsGuardedMessagingService` is owner-gated. Local application code cannot revoke a legacy notification already accepted by FCM while the OS is in control. The new branch `supabase/functions/_shared/native-push-transport.mjs` emits Android data-only `v=2` with **only the destination installation UUID**, never title, body, sender, target, URL, reference or account ID. Native `UsPushOwnerGate` validates the installation under a lock.

## Required coordinated release order (after owner approval)

**0. Preflight / rollback.** Confirm release commit and CI checks, verify staged sender bundle schema, current `device_push_tokens` counts by platform, PWA subscriptions count, active cron, up-to-date signed Android target. Snapshot the eight currently deployed function versions/sha256 via Supabase and keep rollback code accessible. Rollback of legacy FCM notification payloads is **NOT safe** once any native user is registered; only rollback to data-only/better security.

**1. Sender-first migration.** Deploy only the reviewed commit's eight Edge functions (including their shared `native-push-transport.mjs` and `notification-core.mjs` bundles) in a controlled batch. Do not change credentials, cron cadence, database tables, RLS, Web Push contract, APNs configuration or current PWA subscriptions. Supabase Edge function bundles are independent: updating one does **not** update the other seven. Monitor each deployment individually.

**2. Verify LIVE deployed bundles, not just Git.** Fetch all eight live Edge function sources. PASS only if:
- their included `native-push-transport.mjs` is **identical to the reviewed safe source**;
- `fcmMessage` includes `data: { v: '2', installation }`, `android.priority`, `ttl`, a fixed collapse key and **NO `message.notification`, NO `android.notification`, NO private data**;
- no other active function has an independent FCM sender;
- a synthetic STAGING Android notification still arrives on the controlled B1 device; confirm PWA Web Push still sends and receives;
- count native devices again; no unsupported legacy token rows have been created during cutover.

**3. Drain legacy queue.** Because previously accepted legacy FCM requests may remain in Google's queue for as long as the **24-hour maximum observed TTL**, ensure at least 24 h elapsed since **the last possible legacy send** before promoting a multi-couple production Android APK. Re-check function source and push token counts then. If the last legacy send cannot be established, use the latest verified replacement time of the eighth function as the conservative lower bound (24 h afterward). A provider-side purge of already-queued messages is not assumed possible.

**4. Only then promote guarded native clients.** Reconfirm Android appId, production Firebase credentials (not staging), permanent signing/upgrade compatibility, native single receiver manifest, user registration and logout/owner-bound logic; then controlled distribution/internal testing. Keep A→B fail-closed check, suspended/terminated process checks and customer privacy review. Do not ship STAGING/Firebase QA panel to the store.

## Deployment gate and what remains

- Source CI test: `node --test tests/s3-fcm-legacy-senders-cutover.test.js` enumerates every current FCM sender and validates v2 data-only shape. **This is not a live deployment certification.**
- Existing S3 native owner-gate emulator tests: 5/5 PASS for delayed A after B, offline native clear, persistence/epoch, invalid IDs and serialization. They are NOT a literal real-FCM queued-packet or process-killed delivery trial.
- Physical STAGING B1 token registration and positive message delivery: PASS by tester report.
- A real in-flight legacy queued Android FCM packet under a different account is **not yet reproduced**. No honest complete privacy GO can be derived from simulated native gate tests alone.
- Independent security review and coordinated deployment authorization required before any production changes, PR merge or Google Play release.
