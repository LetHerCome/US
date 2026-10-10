# Store S3/P0 — isolated Android FCM hardware QA handoff
**Updated:** 2026-10-11  
**State:** STAGING APP SIGNED / STAGING EDGE SENDER TEST-ONLY ACTIVE / FCM SECRET USER-REPORTED (NOT YET PROVED BY AUTHENTICATED TEST) / AUTH + DEVICE QA PENDING

## 2026-10-11 — Verified current live staging state

- Android staging QA APK signed and independently verified by CI (NOT yet installed/validated on a real phone): [GitHub Actions run 38089884527](https://github.com/LetHerCome/US/actions/runs/38089884527); package `com.usapp.us.staging` connected to `dugmhngrfkuieeletatb`, separate from real US.
- On **US-STAGING ONLY**, Supabase Edge function slug **`send-web-push` v3** is **ACTIVE**, with `verify_jwt=true`. Its source is the staging-only [`s3-staging-send-web-push/index.ts`](../../supabase/functions/s3-staging-send-web-push/index.ts) from PR #187. Do not deploy that source to production.
- This QA sender has a hard-coded Supabase project gate `dugmhngrfkuieeletatb`, accepts exactly `{"type":"test"}`, authenticates its caller again through Auth, and sends exclusively to the authenticated user's own registered FCM device(s) in the user's current couple; no arbitrary recipient, token, calendar copy or action. Rate-limited by a once-per-minute per-user logical event claim. The transport carries data-only v2 installation routing.
- It also refuses a Firebase service account unless `project_id` is exactly **`us-staging-45e0f`**, so a production/private Firebase service account is rejected; iOS APNs explicitly disabled for this test sender.
- Post-deploy database check: **0 Auth users, 0 profiles, 0 couples, 0 push tokens, 0 active / 9 inactive cron jobs**.
- User confirms `FCM_SERVICE_ACCOUNT_JSON` is stored in Supabase Edge Secrets. We cannot read or verify private secret values; correctness/permission is **NOT yet proven**. The sender will reject a malformed key or an account for any Firebase project other than `us-staging-45e0f`. A real signed Auth session and device token are required for the first FCM test. The Android `google-services.json` is client-only configuration.

### One manual credential boundary: Firebase STAGING → Supabase STAGING

1. In [Google Cloud Console → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=us-staging-45e0f), ensure project **US-STAGING-PUSH** / project ID **`us-staging-45e0f`** is selected, and create an isolated service account, e.g. `us-staging-fcm-qa`.
2. Assign the **Firebase Cloud Messaging API Admin** role (`roles/firebasecloudmessaging.admin`) on that staging project only; verify the [FCM HTTP v1 API](https://console.cloud.google.com/apis/library/fcm.googleapis.com?project=us-staging-45e0f) is enabled. Do not grant Owner, Editor, Production project access or billing roles.
3. From the service account's **Keys → Add key → Create new key → JSON**, download the PRIVATE JSON key. Some Google organizations restrict JSON key creation; do not bypass an organization policy to create it.
4. Open the **US-STAGING** [Supabase Edge Function Secrets](https://supabase.com/dashboard/project/dugmhngrfkuieeletatb/settings/functions). Add a secret named **`FCM_SERVICE_ACCOUNT_JSON`**, with the entire raw JSON file text as its value. **NOT** Base64; not the Android `google-services.json`; never paste into GitHub source, a public URL or this chat.
5. Confirm the private JSON has `"project_id": "us-staging-45e0f"` (no need to share other fields). Remove the downloaded local private-key file after the secret is stored securely. Tell the assistant only **"Secret Firebase STAGING aggiunto"**.
6. The assistant can then prepare two separate *synthetic* couples, install/run the isolated staging APK, exercise real signed Auth and verify actual FCM delivery on the QA device. Real usernames/passwords, session JWTs and raw FCM tokens should never be shared in chat; keep them confined to staging.

**Safety:** US production Firebase and Supabase credentials are never used. Never install or deploy the staging sender on production. Edge JWT verification does not by itself prove signed-in session correctness: the sender calls `admin.auth.getUser` and checks the sender's profile/couple. The function and live FCM delivery are separate QA gates.

## Next signed-Auth step — user creates four users, no passwords in chat

Create these accounts with **Auth → Users → Add user → Create user** in the **US-STAGING** dashboard only (not in the production project). Use unique temporary passwords and enable **Auto Confirm User**. Do not enable public signup or deliver emails; the `.invalid` domain is intentionally nonexistent.

| Couple | Email (synthetic) | Profile role |
| --- | --- | --- |
| A | `us-s3-a1@qa.invalid` | `francesco` |
| A | `us-s3-a2@qa.invalid` | `beatrice` |
| B | `us-s3-b1@qa.invalid` | `francesco` |
| B | `us-s3-b2@qa.invalid` | `beatrice` |

Then execute the **reviewed staging-only** `US_S3_QA_PAIR_ACCOUNTS.sql` (this is the assistant's next step after checking counts). It refuses production/unexpected accounts, active cron, existing couples or tokens. It creates only two couples and four profiles; no Auth user manipulation, no passwords, no email, no FCM send. Validate that all four users can log in via signed Supabase Auth and `get_couple_membership` returns only their assigned couple.

For triggering a safe authenticated self-test *from a separate Windows machine/PowerShell window* after pairing, use `scripts/s3-staging-self-push.ps1 -Account A1`, supplying only the staging **publishable** key and local QA password through secure prompt. Script never prints Auth JWT or FCM token. On Android, install only the `com.usapp.us.staging` APK. Run A1 then B1 to exercise cross-couple owner rotation; a second signed A1 session is needed to send a controlled stale A test after B1 logs in.

**Pending gates:** verify secret service account authority in the first signed FCM self-test, positive A1 delivery, B1 isolation, offline/logout and terminated-app test, and external device evidence. No merge or public beta until all pass.

## What is ready

- Free US-STAGING Supabase project `dugmhngrfkuieeletatb` in eu-west-3. Source schema + candidate S2 on **STAGING ONLY**, 9/9 US cron jobs disabled, no real or synthetic Auth rows persisted.
- DRAFT [PR #187](https://github.com/LetHerCome/US/pull/187) implements data-only v2 FCM and a guarded Android receiver; source-level isolation and CI passed on baseline head `c8ab600c2025a9ae24747914bc40262a9d6f7304`. Later S3 branch commits tighten offline disable and staging builds; check their own CI before use.
- Android `disable()` now clears native owner state **before** remote unregister. Offline error persists the old token as a retired installation, drops the enabled flag and refuses to count server revocation as success. Added online/offline lifecycle tests.
- The old signed QA workflow cannot build S3 against production anymore. The separate `.github/workflows/s3-staging-android-qa.yml` **fails closed to NO ARTIFACT** unless staging Firebase, staging Supabase and signing inputs are supplied.
- Staging app has its own applicationId **`com.usapp.us.staging`** and label `US STAGING`. It installs *alongside* US, never upgrades/overwrites or shares Android app data with `com.usapp.us`. The build-time script rewrites `app.js`, `index.html` and Capacitor config and checks that the bundled app is bound only to `https://dugmhngrfkuieeletatb.supabase.co`.

## Isolated non-production setup — completed and pending portions

**Client Firebase and isolated signed APK are configured.** Server credential addition is user-reported, pending authenticated first-send proof. The repo must never use the real Firebase config for shared-device tests.

1. Create a **separate staging Firebase project** under an explicitly approved free tier, register Android application `com.usapp.us.staging`, and retrieve its own `google-services.json`. Do not register the staging app inside the production Firebase project. Do not provision paid resources.
2. Add encrypted repository Actions secret `US_STAGING_GOOGLE_SERVICES_JSON_B64` containing base64-encoded staging `google-services.json`; add `US_STAGING_SUPABASE_PUBLISHABLE_KEY` for `dugmhngrfkuieeletatb` (**publishable** client key, never service_role). Add GitHub Actions variable `US_STAGING_FIREBASE_PROJECT_ID` matching the JSON `project_info.project_id`. The existing Android signing bundle is reused, but the Android app ID is distinct. Do NOT print secret values in logs.
3. Only when all inputs are present, the S3 staging QA workflow creates a signed **US-Android-S3-STAGING-QA** artifact. It first proves isolation tests, applies the staging rewrite, confirms the dist bundle excludes the production Supabase host, validates Firebase package/project, Gradle builds and checks the *actual APK* has package `com.usapp.us.staging`. Until then: **NO APK generated**. A green skipped job alone is NOT a QA pass.
4. Supabase US-STAGING has **one Edge Function deployed**: `send-web-push` v3, JWT enforced, only permits authenticated `{\"type\":\"test\"}` to the same user. The private FCM service-account secret is reported as added; do not read or print it. The first authenticated self-test will verify the Firebase project and delivery. Never reuse production credentials. All staging cron jobs remain disabled.
5. Provision real synthetic staging Auth sessions with two isolated couples, without private user data. Validate signed JWT + RLS/RPC via the actual PostgREST APIs, not just the earlier DB role-simulation. Protect staging signup against unwanted public users before exposing any QR/app build.
6. QA phone: install isolated US STAGING beside real US, register a token against staging, send verified **data-only v2** via authenticated staging sender, assert generic local banner for current owner while background; no banner while foreground. Switch A -> B under online/offline failed revocation, stale token replay, app killed/Doze/reboot. Assert **no A banner/action/badge** under B. Inspect actual FCM envelope/Android OS tray and merged manifest.
7. **Separate in-place upgrade test on a dedicated test phone:** isolated `com.usapp.us.staging` cannot establish production-package upgrade-in-place compatibility, and it cannot by itself reproduce queued legacy messages tied to production Firebase. A special QA plan must handle legacy message TTL, old app auto-rendering and the coordinated rollout without modifying the real couple's phone/data.
8. iOS APNs still sends private alert text and lacks a proven owner gate. #181 remains P0 for a shared-account/public beta. Separately complete account deletion #183.

## Stop conditions

Never install a production-bound PR #187 QA artifact as a two-account test against real accounts. Do not merge PR #187, deploy production Edge/SQL, enable public signup, publish to Play or claim Firebase hardware isolation while stage Firebase and sender are missing. A green Android build/CI is only a **static/compile** assurance. All operational approvals remain separate.

**No additional charge authorized.** User created an independent Firebase test project and configured GitHub client secrets; an isolated Supabase STAGING sender was deployed. No production change, real device proof or public signup has occurred.
