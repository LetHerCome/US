# Mission — M15 iOS Native Baseline V1

**Status:** READY FOR REVIEW (do not merge)
**Base:** `origin/main` 6472a76 (Native Android Widget System V1 merged)

## Goal

First maintainable native iOS target for US on the existing Capacitor/shared web app:
bundle `com.usapp.us`, Xcode project, icon/launch, safe areas, keyboard, Back-equivalent,
lifecycle, cold start, session persistence, deep-link foundation, private storage.
Architecture prepared (not implemented) for APNs, Haptics, biometrics, WidgetKit,
Share Extension, Quick Actions and App Groups (`group.com.usapp.us.shared`).

Details and decisions: `docs/native/IOS_BASELINE.md`.

## Out of scope

- Supabase schema/RLS/backend;
- WidgetKit / Share / Notification extensions, entitlements, signing, TestFlight upload;
- any Android behaviour change.

## Verification

- `tests/ios-native-baseline.test.js` + native/Android regression tests;
- full `npm test` (HEAD vs base in the same environment);
- `npm run build:capacitor-web`, `npx cap sync ios`, `npm run build:cloudflare-pages`, `git diff --check`;
- `.github/workflows/ios-native.yml` unsigned simulator builds on macOS.
