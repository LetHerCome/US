# US Store S3 — Native push security / Phase 1 (Android)

**Date:** 2026-10-10  
**Status:** candidate mitigation / NOT production-ready / NOT complete account isolation  
**Owner issue:** [#181](https://github.com/LetHerCome/US/issues/181)

## Proven source-level vulnerability

Legacy FCM transport sends personalized `message.notification.title/body` and `message.data` with event type, navigation target, private UUID reference and per-event tag. Android/FCM **auto-renders** notification payloads while the app is backgrounded/terminated. The client cannot intercept or suppress that system notification by calling JavaScript when A's stale token survives account switch to B. Capacitor PushNotifications 8.1.3 Android `unregister` resolves before Firebase `deleteToken()` completes. Remote unregister can fail offline.

Firebase documentation: https://firebase.google.com/docs/cloud-messaging/android/receive-messages

## Candidate mitigation — phase 1, source only

- `supabase/functions/_shared/native-push-transport.mjs`: every Android FCM message uses the same neutral `US.` / `Apri US per vedere le novità.` title/body and neutral channel/tag/collapse key.
- **No** `data` payload: no private event type/target/UUID/ref/tag reaches Android; tapping opens the application rather than the specific content.
- FCM authentication and provider error classification, recipient/couple filter, server logical dedupe, priority, TTL, badge behavior and existing Android signing stay unchanged.
- **No changes** to APNs, Web Push/PWA, Supabase schema, user registration, tokens or credentials. No production Edge deployment is authorized.
- Relevant tests: `tests/s3-android-native-push-privacy.test.js`, existing native transport/dispatcher tests. GitHub CI `.github/workflows/s3-native-push-privacy.yml`.

**Intentional UX tradeoff:** Android notifications are generic and no longer deep-link to a private event. Revalidate with product/device QA before any deployment. One generic collapse tag may replace several OS notifications; the user must open US for complete activity.

## This does NOT fix the P0

A notification for **A can still display generically when B uses the same phone**. Already-queued legacy personalized FCM messages and currently shipped Edge functions also remain hazardous until a safe, coordinated rollout. Android content minimization reduces impact, but does **not** prove account isolation. Native public multi-couple beta remains blocked. APNs still contains private alert text and has not passed real iOS validation.

## Full isolation architecture — next engineering package

Prefer a data-only FCM protocol and dedicated Android `FirebaseMessagingService`; remove OS-auto-rendered `notification` entirely. Native receiver decides whether to post a local notification **before** exposing any content or route. Only show when a separately authenticated, device-bound current account/installation proof matches the recipient and the account is still enabled for push. Otherwise discard without action, sound or badge.

1. **Identity binding:** store owner/installation binding in Android private, non-backed-up native storage. Account switch clears it synchronously before sign-out; a new owner is activated only after its authenticated server registration succeeds. Do not trust WebView localStorage, FCM token string or user-supplied JWT metadata as authorization for native OS display.
2. **Server transport:** data-only message carries *opaque* recipient/installation routing proof, short TTL and random dedupe reference; never include content, sender name, calendar title, underlying content UUID or action URL. Validate server-side couple membership before fan-out. Treat queued/replayed and cross-account messages as reject.
3. **Receiver:** verify binding before any notification is posted, including background/terminated process, stale offline logout, Android Doze and cold boot. Avoid implicit app-launch navigations for mismatched events. If proof is absent, **suppress** message (fail closed). Validate Android 13+ notification permission/channels and provider plugin service registration to avoid duplicate notification rendering.
4. **Delivery semantics:** FCM high-priority data-only may be delayed in power saving mode. Do not promise instant notifications; use safe WorkManager fallback only if required after test evidence. Device push token retirement cannot be claimed complete from an async JavaScript `unregister` callback.
5. **APNs:** separately design a safe equivalent (no OS-rendered private `aps.alert` prior to owner proof), test on real iPhone. Do not claim iOS isolation merely from iOS simulator compilation.
6. **Web Push:** independently validate service worker subscription invalidation and locked/offline account switch behavior. This phase does not modify that transport.

## Required test matrix to close #181

Real signed Android APK installed **over** existing US, preserving app data/widgets; two synthetic accounts and couples on shared device. A online logout / failed server revoke / provider unregister fails or resolves early / B login / queued A notification / network reconnection / Android in foreground, background, terminated, Doze and cold reboot. Assert **zero A alert, action, text, badge or navigation** while B is the current owner. Include wrong-device forged target and token rotation; inspect actual FCM envelope and Android notification tray, not just JavaScript callback.

## Release gates

- Independent native/security review of full owner-proof design and regression test evidence.
- Separate approval for production Edge deployment or Supabase SQL, beyond authorization to audit/prepare a PR.
- Android beta remains on established private accounts; no public sign-up until S3/P0 closed. No claim of physical QA in this Phase 1 branch.
