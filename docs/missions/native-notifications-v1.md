# Mission — US Native Notifications V1

**Status:** READY FOR REVIEW (do not merge)
**Base:** `origin/main` e6e0d4b (Native Security V1)

## Goal

Genuine OS push in the Capacitor Android and iOS apps as another transport of the
same US notification domain, with PWA Web Push intact: one catalogue and one
dispatcher on the server (dedupe, preferences, failures), FCM HTTP v1 for Android,
direct APNs for iOS, registration per app installation, exact allow-listed
navigation that waits for the session and the biometric app lock.

Audit, architecture and decisions: `docs/native/NATIVE_NOTIFICATIONS_V1.md`.
Rollout (Francesco only): `docs/native/NATIVE_NOTIFICATIONS_V1_ROLLOUT.md`.

## Out of scope

- applying the migration, deploying Edge Functions, setting secrets;
- Firebase project / `google-services.json`, APNs key, signing, store upload;
- notification content redesign, new events, unread-count badges, Android action buttons.

## Verification

- `tests/native-notifications-v1-{dispatch,db,native,browser}.test.js` + updated pins;
- full `npm test` HEAD vs base in the same environment;
- `npm run build:capacitor-web`, `npx cap sync android|ios` (clean diff), `npm run build:cloudflare-pages`, `git diff --check`;
- `.github/workflows/android-native-ci.yml` (Gradle unit tests, debug + unsigned release) and `ios-native.yml` (simulator Debug/Release, unsigned).
