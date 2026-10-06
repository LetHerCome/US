# Native Security V1 — biometric app lock

**Status:** READY FOR REVIEW (not merged). Android + iOS, native app only. The PWA is unchanged.

## Model

Biometrics protect access to a session that already exists on this phone. They are not an account,
a credential or a login method.

1. The first sign-in is always **email + password** (`signInWithPassword`). No OTP/magic link.
2. Once signed in, the person may turn on *Proteggi US con Face ID / Touch ID / l'impronta* in
   Impostazioni → Su questo telefono. It is **off by default**, **local to this phone**, never a couple
   setting, never sent to Supabase.
3. With protection on, US opens on a lock screen; biometrics unlock the app UI and the existing
   Supabase session continues.
4. Supabase stays authoritative. Before US opens, the session is re-read (`getSession`, which refreshes
   it) and, when online, checked on the server (`getUser`). Expired or revoked → the local session is
   destroyed and the normal login appears. Biometrics never resurrect a session.

## What is stored, and where

| Data | Where | Notes |
|---|---|---|
| Supabase session (access + refresh token) | WebView IndexedDB (`auth-storage.js`), unchanged | App sandbox; Android `allowBackup=false`, iOS `Library/WebKit` excluded from backups. Never copied to native. |
| Protection record `{v, ownerHash, enabledAt, state}` (+ iOS enrollment hash) | Android: private SharedPreferences, **AES-256-GCM with an Android Keystore key**. iOS: **Keychain**, generic password, `WhenUnlockedThisDeviceOnly`, not synchronizable. | `ownerHash` = SHA-256 of the user id, so another account on the same phone never inherits it. No password, token or PII. |
| Biometric key (Android) | Android Keystore, AES-256-GCM, `setUserAuthenticationRequired(true)`, `AUTH_BIOMETRIC_STRONG` (API 30+), `setInvalidatedByBiometricEnrollment(true)` | Every unlock runs through `BiometricPrompt.CryptoObject`; success is proven by using the key. |

Nothing security-related lives in localStorage, IndexedDB, plain preferences or committed config.

## How biometrics gate access

- **Android:** `androidx.biometric` 1.1.0, `BiometricPrompt` with `BIOMETRIC_STRONG` + CryptoObject.
  Weak (class 2) face unlock is not offered. Adding/removing a fingerprint invalidates the key →
  "biometria cambiata" → account login only.
- **iOS:** `LocalAuthentication`, `.deviceOwnerAuthenticationWithBiometrics` (Face ID / Touch ID; the
  device passcode is not accepted as a shortcut). After success the enrollment hash
  (`domainState.biometry.stateHash` on iOS 18+, `evaluatedPolicyDomainState` before) must match the
  one saved at enable time; a change → account login only. `NSFaceIDUsageDescription` is declared.
- **Web layer (`app-lock.js`):** the native shell starts with `html.us-app-lock-pending` (added by
  `scripts/build-capacitor-web.mjs`), so only the brand canvas paints. `app.js#initCloud` resolves the
  local session, then awaits `UsAppLock.gate()` **before** the cached profile shell, the Home photo or
  any fetch. While locked every other `body` child is `visibility:hidden` and `inert`.

## Locking policy

| Situation | Result |
|---|---|
| Protection off | Never locks; US behaves exactly as before. |
| Cold start / process recreation / reload after process death | Locked. |
| Back to foreground after **≥ 60 s** in background (incl. screen off) | Locked. |
| Shorter interruptions (call, Control Centre, permission dialog, photo picker, the biometric sheet itself) | No prompt. |
| Logout, session expiry/revocation, no session at boot | Protection record removed (after the session is gone); the login screen shows. |

Time is monotonic and includes deep sleep (Android `SystemClock.elapsedRealtime`, iOS
`CLOCK_MONOTONIC`); changing the clock cannot extend the grace period. The policy lives natively
(`UsAppLockPolicy.java` / `.swift`), so a WebView that resumes cannot skip it.

## Privacy while locked / in background

- Android 13+: `setRecentsScreenshotEnabled(false)` while protected (no app-switcher thumbnail;
  screenshots stay allowed, no `FLAG_SECURE`). All versions: a #08040E cover view over the WebView
  from `onStop` until the web lock screen is painted (or 1.5 s).
- iOS: a brand cover (launch colour + launch mark) from `willResignActive`, so the app-switcher
  snapshot never shows couple content; on a locked return it stays until the lock screen is painted.

## Recovery

*Usa l'accesso con account* (and the only option when biometrics changed, are locked out
permanently, or the native record is unreadable/corrupted):

1. destroy the local session (`signOut({scope:'local'})`, or remove the stored session if offline)
   and the device-local private caches;
2. only then remove the protection record;
3. reload → email + password login. Other devices stay signed in.

If the native bridge does not answer, US stays locked with *Riprova* and the account login; it never
opens silently.

## Files

- `native-plugins/us-app-lock/` — Capacitor plugin `UsAppLock` (Android Java, iOS Swift/SPM).
- `app-lock.js`, `app-lock.css` — lock screen and gate; `settings.js` — the row; `app.js` — hooks.
- `tests/native-security-v1.test.js`, `tests/native-security-v1-browser.test.js`,
  `UsAppLockPolicyTest.java`, `ios/Tests/PolicyCheck/main.swift`.
- CI: `.github/workflows/android-native-ci.yml` (no secrets), `.github/workflows/ios-native.yml`.
