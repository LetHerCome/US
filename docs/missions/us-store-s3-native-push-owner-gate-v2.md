# S3/P0 — Android owner-gated data-only push candidate
**Date:** 10 October 2026  
**Status:** DRAFT CODE / CI REQUIRED / DEVICE QA PENDING / NOT DEPLOYED

This is the Phase 2 architecture for [issue #181](https://github.com/LetHerCome/US/issues/181); it includes the Phase 1 mitigation from draft #186 but intentionally supersedes Android auto-rendered generic notifications. It must NOT be merged as two independently deployable changes.

## 1. Root cause / threat model

Previous FCM HTTP v1 messages contained `message.notification.title/body` (personalized sender/calendar) plus `data.type/target/ref/tag`; Firebase auto-renders those messages when US is in background or terminated **without consulting our client logout state**. Async Capacitor unregister / failed RPC can leave an A token valid while B uses that device. Android JavaScript can only observe some messages and cannot enforce the OS boundary.

See Firebase official docs: https://firebase.google.com/docs/cloud-messaging/android/receive-messages

## 2. Proposed end-to-end protocol

- Edge transport selects the already-authenticated, per-couple `device_push_tokens` row including its random `installation_id`, never an arbitrary caller-supplied recipient. PostgreSQL authenticated clients cannot SELECT or UPDATE these rows directly.
- Android FCM **data only**, exactly `{v:"2",installation:"<random-uuid>"}`. No `message.notification`, no `android.notification`, no title/body/metadata ref/action/couple ID or user ID. Standard TTL/collapse behavior retained. Bad/missing installation UUID fails closed.
- App Android manifest uses `tools:node="remove"` for Capacitor's default `MessagingService`, and registers **one** `UsGuardedMessagingService` for `com.google.firebase.MESSAGING_EVENT`. It subclasses the original service to retain `onNewToken` forwarding. A merged-manifest and real-FCM validation are required, not optional.
- Java service discards legacy/unknown payloads and any v2 installation value that does not match the current native active binding. On match it posts a local **generic** notification with the approved US icon, neutral tag/channel, no activity extras and no private deep-link.
- Owner record is kept in Android app-private `SharedPreferences` (package `com.usapp.us`, `allowBackup=false`). A random *generation epoch* is rotated by an atomic synchronous commit on logout/account recovery/disable; remote registration responses from an earlier epoch cannot rebind after logout.
- `UsPushSupport` returns the current epoch, exposes `bindPushOwner` and `clearPushOwner`; `notifications.js` binds **after** successful authenticated `register_native_push_device` RPC. JS verifies the session has not changed and checks the returned native result. On logout, native binding clear precedes remote revoke retries; a missing/failing native owner gate prevents new native registration from being considered successful.
- No SQL migration, no new third-party dependencies, no new privileges, no changes to Web Push or APNs transport; existing appId/signing untouched.

## 3. Operational caveats (not solved by compiling)

- **Already enqueued legacy notification-type FCM** may auto-display even with the new Android service while in background, because Firebase controls these packets. The old transport must be retired and in-flight TTL drained; existing recipient phones should receive the updated APK *before* an account-switch beta. Existing auto-rendered system notifications must be cleared on logout. A physical packet capture is required.
- Before new server transport deployment, old Android app versions will not render v2 data-only notifications; this requires coordinated client adoption, or explicit support policy. Do not silently push the server change.
- Native binding is only as authoritative as the trusted JS bridge + authenticated RPC that supplied it. Device compromise/root and tampered clients are not addressed. It is a **local display gate**, not a cryptographic claim proven inside FCM. Wrong-account server rows still require revocation and dedupe audits.
- Native owner clearing is dispatched through Capacitor's asynchronous bridge even though the underlying Android write is synchronous. The tiny transition window and process death/races require **real device verification**; CI model tests cannot prove zero banners.
- Data-only Android messages can be delayed/dropped by Doze, battery restrictions or provider throttling. The protocol intentionally prioritizes privacy over immediate delivery. The app should fetch state after unlock/resume; never include sensitive copy in FCM.
- Foreground behavior and notification consolidation must be reviewed for unwanted duplicate OS banners.
- APNs remains on legacy personalized alerts; public iOS/shared-device beta is blocked separately.

## 4. Explicit acceptance gates

1. [ ] Dedicated JS tests and native static checks pass, FCM service dependency compiles.
2. [ ] Gradle manifest merge proves EXACTLY ONE effective `MESSAGING_EVENT` receiver: `com.usapp.us.UsGuardedMessagingService`; original `MessagingService` removed.
3. [ ] Android debug/unsigned release build + JVM tests pass, iOS simulator remains green.
4. [ ] Remote Edge JS tests confirm v2 shape for **every notification type**, provider auth unchanged, native dispatcher tenant filter unchanged, APNs and Web Push unchanged.
5. [ ] Real signed APK installed **over existing installation**; widget IDs/data and signature intact.
6. [ ] Physical FCM test: two separate synthetic couples A and B, same device, offline/failed A unregister, provider token reuse, queued old A packet, B sign-in, background, killed process, cold start, Doze/network recovery. Zero A visible notification/action/badge after B. Account B can receive its own generic notifications when enabled. Include session-rotation race and failure to write native binding.
7. [ ] Independent privacy/security review and signed release plan covering residual old packets and iOS.
8. [ ] No public signup / native beta until #181 and account deletion #183 gates closed.

**Governance:** Source branch only; **NO automatic main merge, production SQL/Edge deploy, FCM secrets, new test accounts or Play Store publication**. Keep #181 open until physical QA and rollout are proved.
