# Store S3/P0 — isolated Android FCM hardware QA handoff
**Updated:** 2026-10-10  
**State:** CODE PREPARED / Firebase STAGING NOT CONNECTED / NO STAGING APK GENERATED / DEVICE QA PENDING

## What is ready

- Free US-STAGING Supabase project `dugmhngrfkuieeletatb` in eu-west-3. Source schema + candidate S2 on **STAGING ONLY**, 9/9 US cron jobs disabled, no real or synthetic Auth rows persisted.
- DRAFT [PR #187](https://github.com/LetHerCome/US/pull/187) implements data-only v2 FCM and a guarded Android receiver; source-level isolation and CI passed on baseline head `c8ab600c2025a9ae24747914bc40262a9d6f7304`. Later S3 branch commits tighten offline disable and staging builds; check their own CI before use.
- Android `disable()` now clears native owner state **before** remote unregister. Offline error persists the old token as a retired installation, drops the enabled flag and refuses to count server revocation as success. Added online/offline lifecycle tests.
- The old signed QA workflow cannot build S3 against production anymore. The separate `.github/workflows/s3-staging-android-qa.yml` **fails closed to NO ARTIFACT** unless staging Firebase, staging Supabase and signing inputs are supplied.
- Staging app has its own applicationId **`com.usapp.us.staging`** and label `US STAGING`. It installs *alongside* US, never upgrades/overwrites or shares Android app data with `com.usapp.us`. The build-time script rewrites `app.js`, `index.html` and Capacitor config and checks that the bundled app is bound only to `https://dugmhngrfkuieeletatb.supabase.co`.

## Required non-production setup (not yet performed)

**Firebase is not yet connected.** The repo can never use the real Firebase config for shared-device tests.

1. Create a **separate staging Firebase project** under an explicitly approved free tier, register Android application `com.usapp.us.staging`, and retrieve its own `google-services.json`. Do not register the staging app inside the production Firebase project. Do not provision paid resources.
2. Add encrypted repository Actions secret `US_STAGING_GOOGLE_SERVICES_JSON_B64` containing base64-encoded staging `google-services.json`; add `US_STAGING_SUPABASE_PUBLISHABLE_KEY` for `dugmhngrfkuieeletatb` (**publishable** client key, never service_role). Add GitHub Actions variable `US_STAGING_FIREBASE_PROJECT_ID` matching the JSON `project_info.project_id`. The existing Android signing bundle is reused, but the Android app ID is distinct. Do NOT print secret values in logs.
3. Only when all inputs are present, the S3 staging QA workflow creates a signed **US-Android-S3-STAGING-QA** artifact. It first proves isolation tests, applies the staging rewrite, confirms the dist bundle excludes the production Supabase host, validates Firebase package/project, Gradle builds and checks the *actual APK* has package `com.usapp.us.staging`. Until then: **NO APK generated**. A green skipped job alone is NOT a QA pass.
4. Supabase US-STAGING currently has **0 Edge Functions deployed**. Prepare a separate staging-only authenticated notification dispatcher and supply the **staging Firebase service account JSON** as a Supabase Edge secret **on STAGING only**. Deploy/test only once the independent Firebase project is connected. Never reuse a production service account, Firebase token, live Edge URL or Google credential. Source functions may need separate, non-production cron/trigger setup; keep all US staging jobs disabled. No staged delivery is currently possible.
5. Provision real synthetic staging Auth sessions with two isolated couples, without private user data. Validate signed JWT + RLS/RPC via the actual PostgREST APIs, not just the earlier DB role-simulation. Protect staging signup against unwanted public users before exposing any QR/app build.
6. QA phone: install isolated US STAGING beside real US, register a token against staging, send verified **data-only v2** via authenticated staging sender, assert generic local banner for current owner while background; no banner while foreground. Switch A -> B under online/offline failed revocation, stale token replay, app killed/Doze/reboot. Assert **no A banner/action/badge** under B. Inspect actual FCM envelope/Android OS tray and merged manifest.
7. **Separate in-place upgrade test on a dedicated test phone:** isolated `com.usapp.us.staging` cannot establish production-package upgrade-in-place compatibility, and it cannot by itself reproduce queued legacy messages tied to production Firebase. A special QA plan must handle legacy message TTL, old app auto-rendering and the coordinated rollout without modifying the real couple's phone/data.
8. iOS APNs still sends private alert text and lacks a proven owner gate. #181 remains P0 for a shared-account/public beta. Separately complete account deletion #183.

## Stop conditions

Never install a production-bound PR #187 QA artifact as a two-account test against real accounts. Do not merge PR #187, deploy production Edge/SQL, enable public signup, publish to Play or claim Firebase hardware isolation while stage Firebase and sender are missing. A green Android build/CI is only a **static/compile** assurance. All operational approvals remain separate.

**No additional charge was authorized, no external Firebase project has been created, and no Edge function has been deployed in this work.**
