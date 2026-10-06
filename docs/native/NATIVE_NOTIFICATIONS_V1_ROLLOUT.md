# Native Notifications V1 — rollout (Francesco only)

Nothing in this document was executed by the mission. No migration was applied, no Edge Function was
deployed, no secret was set. Every step below is done by Francesco, in this order, on a reviewed and merged
commit. Each step is safe on its own: until the last one, production behaves exactly as today.

## 0. Read-only preflight

Run `docs/native/NATIVE_NOTIFICATIONS_V1_PREFLIGHT.sql` one block at a time (Supabase connector
`execute_sql` or SQL Editor) and keep the cells as `docs/native/NATIVE_NOTIFICATIONS_V1_PREFLIGHT.json`.
Go on only if `n02.rows = 0` and `n02.has_installation_id = false` (the migration aborts otherwise) and
`n03.new_rpcs_exist = false`.

## 1. Migration

`supabase/migrations/20261006200000_native_notifications_v1.sql` (forward, after every applied migration).
It only reshapes the empty, never-used `device_push_tokens`, removes client table access, drops the retired
`register_push_token(text,text)` and adds `register_native_push_device` / `unregister_native_push_device`
(EXECUTE: authenticated only). Both mutation paths are ownership-scoped: an authenticated account cannot
take over or delete another account's installation row. It sends nothing. Its own self-check aborts the
transaction if a privilege postcondition does not hold.

## 2. Edge Functions (same code paths, Web Push unchanged)

Deploy, from the merged commit: `send-web-push`, `left-for-you-push-worker`, `daily-question-push-worker`,
`game-v2-push`, `game-v2-push-worker`, `calendar-reminders-worker`, `monthiversary-job`,
`widget-think-send` (it imports `_shared/think-web-push.ts`).

With no native secret set, every function behaves as today: the native transport is "not ready",
`device_push_tokens` is not even read, Web Push payloads keep the same keys and copy. Deploying the
functions before the migration is also safe for the same reason, but the order above is the reviewed one.

## 3. Firebase (Android)

1. Firebase console → project → add an Android app with package **`com.usapp.us`** (do not change it).
   Add the SHA-256 of the permanent signing key only if a Firebase feature needs it (FCM does not).
2. Download `google-services.json` and place it at `android/app/google-services.json` **locally / in the
   build secret store**. `android/app/build.gradle` applies the Google Services plugin only when that file
   exists. Decide whether it is committed (it contains client identifiers, not server credentials) or
   injected by the internal release workflow; this mission committed nothing.
3. Google Cloud → IAM → a service account allowed to send with FCM HTTP v1 (Firebase Cloud Messaging API
   enabled; role "Firebase Cloud Messaging API Admin" or equivalent) → JSON key.
4. `supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"` — the whole JSON. Never
   committed, never pasted in chats or logs.

## 4. Apple (iOS)

1. Apple Developer → Identifiers → `com.usapp.us` → enable **Push Notifications**.
2. Keys → create an **APNs Auth Key** (.p8). Note the Key ID and the Team ID.
3. `supabase secrets set APNS_KEY_ID=… APNS_TEAM_ID=… APNS_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"`
   (`APNS_TOPIC` optional, defaults to `com.usapp.us`).
4. Signing: the app's provisioning profiles must include the Push capability. `App.entitlements` declares
   `aps-environment = development`; Xcode/App Store distribution signing rewrites it to `production` for
   TestFlight/App Store builds. The app reports which APNs environment its token belongs to.

## 5. Verify

- Android QA build with `google-services.json`: Settings → Notifiche → "Attiva su questo dispositivo" →
  OS permission → state "Attive". Partner sends a Ti penso → notification on the `Dalla tua persona` channel;
  tap → Ti penso opens after the biometric unlock (if enabled).
- Web Push on the PWA still delivers (same event, same dedupe key, one notification per device).
- Logout on the phone → no further notifications to that phone.

## Rollback

- Unset the native secrets → native delivery stops immediately; Web Push unaffected.
- The migration has no data to lose; reverting it is a new forward migration (not needed to stop sending).
