# US Store S3 — Android stale-push gate verification (2026-10-11)

Status: **PASS for on-device native owner-gate behavior in emulator; NO-GO for full production release.**
Scope: isolated draft PR #187, no merge, no production config, no live credentials.

## Proven by instrumentation against production Java owner-gate class

CI run: https://github.com/LetHerCome/US/actions/runs/38171763556
Report artifact: `s3-android-owner-gate-emulator-reports` (id `11714575555`).
Android API 35 / emulator-5554 / Google APIs.
Source: `android/app/src/androidTest/java/com/usapp/us/UsPushOwnerGateInstrumentedTest.java`.
JUnit XML suite: `com.usapp.us.UsPushOwnerGateInstrumentedTest` — **5 tests, 0 failures, 0 errors, 0 skipped**.

| Test | Verified result |
|---|---|
| `delayedPacketForAIsRejectedAfterBBecomesOwner` | A-bound installation is not accepted or posted after B binds; B is accepted |
| `offlineLogoutRejectsDelayedPacketWithoutServerOrFirebase` | Synchronous native clear blocks late A packet without Supabase or network |
| `persistedGateReadAfterReentryRejectsStaleInstallation` | Gate re-reads persisted SharedPreferences; stale A epoch cannot bind after B |
| `missingLegacyAndMalformedInstallationAreRejected` | Absent, malformed, unmatched or legacy installation values cannot post |
| `logoutCannotInterleaveInsideCheckedNotificationPost` | Native `postIfCurrent()` owner-check and post are one critical section; clear cannot interleave |

**Important limitations:** This is **not** a live FCM message-delivery test, a literal killed-process reboot, a battery/Doze test, or an OS-level notification tray inspection. It exercises the real native `UsPushOwnerGate` code used by `UsGuardedMessagingService` with synthetic installation IDs. It does not change Firebase state.

## Other S3 evidence

- Store S3 privacy CI PASS: https://github.com/LetHerCome/US/actions/runs/38171767152
- Android native validation PASS: https://github.com/LetHerCome/US/actions/runs/38171767111
- iOS native validation PASS: https://github.com/LetHerCome/US/actions/runs/38171767117
- Signed isolated STAGING QA build PASS: https://github.com/LetHerCome/US/actions/runs/38171763561
- Prior physical Android STAGING: B1 Firebase token and installation registration confirmed in staging Supabase; B1 positive delivery observed and reported by device tester.
- Local owner gate commits synchronously and `UsGuardedMessagingService` uses owner checks before display. The FCM v2 wire format is strictly data-only and contains no private content.

## Gate still open before production merge

1. Coordinated deprecation/retirement of **legacy notification-type FCM packets**: Android OS may auto-render a legacy `notification` payload without executing our guarded `onMessageReceived`. The local Java test does not eliminate this provider/OS risk.
2. One reproducible STAGING physical-device validation of A→B with a genuinely in-flight/delayed A message, including background and process-terminated delivery if feasible. Do not fake this by sending to A after its server token was deleted; such a test only proves zero routing.
3. Independent security review of same-device token retirement and account switch; keep `device_push_tokens` unique indexes, RLS isolation and native fail-closed checks intact.

**Decision:** PR #187 stays draft; issue #181 stays P0 open; no production Supabase/Firebase migration, no APK promotion and no Google Play approval based solely on these emulator tests.
