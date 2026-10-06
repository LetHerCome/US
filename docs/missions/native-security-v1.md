# Mission — Native Security V1

**Status:** READY FOR REVIEW (do not merge)
**Base:** `origin/main` ae16bc7 (Android stable update signing V1)

## Goal

Device-local biometric protection of the already-authenticated US session on Android
(BiometricPrompt + Keystore) and iOS (Face ID / Touch ID + Keychain), with a lock screen,
a Settings switch, a lifecycle policy and a recovery path through the normal email + password login.

Details and decisions: `docs/native/NATIVE_SECURITY_V1.md`.

## Out of scope

- Supabase schema/RLS/backend or auth architecture changes;
- push, widgets, share, camera, updater, signing/distribution;
- PIN, recovery questions, custom passwords, couple-synchronised preference.

## Verification

- `tests/native-security-v1.test.js` (+ browser test), Android JVM tests, iOS host policy checks;
- full `npm test` (HEAD vs base in the same environment);
- `npm run build:capacitor-web`, `npx cap sync`, `npm run build:cloudflare-pages`, `git diff --check`;
- GitHub Actions: `android-native-ci.yml` (Gradle unit tests, debug + unsigned release) and
  `ios-native.yml` (unsigned simulator builds).
