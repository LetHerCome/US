# Native Notifications V1 — audit and design

**Status:** READY FOR REVIEW (not merged). Base `origin/main` e6e0d4b (Native Security V1).
Nothing in this document has been applied to production: no migration, no Edge deploy, no secret.

## 1. Forensic audit (before any change)

### 1.1 Web Push as it existed

| Piece | Role |
|---|---|
| `app.js` (`US v20 · Web Push Foundation`) | `enableWebPush` (user-initiated `Notification.requestPermission` + `pushManager.subscribe` with the public VAPID key) → `register_web_push_subscription`; `disableWebPush` → `remove_web_push_subscription` + `unsubscribe`; `sendWebPushEvent(type, ref)` → `send-web-push` (or `game-v2-push` for `game_*`) with the user JWT and `keepalive`. Navigation: `?open=<target>` on cold start, `US_PUSH_NAVIGATE` from the service worker, `usPendingPushTarget` flushed once `initCloud` has a profile. |
| `service-worker.js` | `push` → `showNotification(title, {body, tag, data:{target,url}})`; `notificationclick` → focus a window + `postMessage`, or `openWindow(url)`. |
| `platform.js` | `canUseWebPush: !isNative`, `canUseServiceWorker: !isNative`: the Capacitor app has **no** push today. |
| `settings.js` | Notifications modal: master Web Push switch + six content preferences (`get_notification_preferences` / `set_notification_preference`). |

### 1.2 Logical notification producers (all server-side, service role)

| Producer | Events | Dedupe key | Preference |
|---|---|---|---|
| `send-web-push` (user JWT) | `test` (to self) | none | none |
| → `_shared/think-web-push.ts` | `think`, `think_reaction` | `think:<msg>`, `think-reaction:<msg>` | `think` |
| `send-web-push` inline | `daily_answer` → partner "ha risposto" / both "risposte pronte" | `daily-answer:<q>:<sender>`, `daily-reveal:<couple>:<q>` | `today` |
| `send-web-push` inline | `quest_confirmed` | `quest-confirmed:<quest>:<sender>` | `bond` |
| → `_shared/left-for-you-push-core.mjs` (also `left-for-you-push-worker`, cron) | `left_for_you` | `left-for-you:<item>` | `left_for_you` |
| `widget-think-send` (Android widget credential) | `think` via `dispatchThinkWebPush` | `think:<msg>` | `think` |
| `daily-question-push-worker` → `_shared/daily-question-push-core.mjs` | `daily_question` | `daily-question:<q>:<user>` | `today` |
| `game-v2-push` + `game-v2-push-worker` → `_shared/game-v2-push-core.mjs` | `game_waiting`, `game_reveal`, `game_weekly_created`, `game_weekly_turn` | role-based keys derived in SQL | `games` |
| `calendar-reminders-worker` | `calendar_reminder` | `calendar-reminder:<reminder>` (+ `calendar_reminders.sent_at`) | none |
| `monthiversary-job` | anniversary / monthiversary | none (award idempotency) | `relationship` |

Every producer repeated the same tail: claim the key in `push_event_log`, read `push_subscriptions`,
`web-push.sendNotification`, delete 404/410 subscriptions, release the key when nothing was delivered.

### 1.3 Schema truth (baseline `20261004000000` = production capture F2A.1)

- `notification_preferences(user_id pk, think, today, bond, relationship, left_for_you, games)` — default
  `true`; a missing row means enabled. RPCs `get_notification_preferences()`, `set_notification_preference(key, value)`.
- `push_event_log(dedupe_key pk, couple_id, sender_id null, event_type, created_at)` — one row per **logical**
  event; unique insert = claim; released when no device received it. F2A.3 retention prunes it.
- `push_subscriptions(id, user_id, couple_id, endpoint unique, p256dh, auth_key, …)` — Web Push only.
- `device_push_tokens(id, user_id, couple_id, token unique, platform android|ios, created_at, last_seen_at)` —
  **exists in the baseline and in production** (captured), RLS select/delete own, table grants `ALL` to
  anon/authenticated (RLS denies writes). `register_push_token(text,text)` exists but is **RETIRED (F1B)**:
  EXECUTE revoked from clients, never wired to any client. Its upsert keyed only on the token, with no
  installation identity: it cannot express "this installation", so it is not reused.
- The 47 archived migrations in `supabase/migrations_history/` are history, not truth.
  The read-only pack `docs/native/NATIVE_NOTIFICATIONS_V1_PREFLIGHT.sql` re-checks the production facts
  this design relies on (row count of `device_push_tokens`, grants, policies) before the rollout.

### 1.4 Native state

- Deep links: `app-links.mjs` (`com.usapp.us://open/<oggi|noi|ricordi|gioca>`), held until `us-auth-resolved`.
- Logout / account switch: `revokeCurrentDevice()` (Web Push revoke, private caches, widgets) is called by
  Settings logout **and** by the app-lock "Usa l'account" recovery (`usAppLockAccountLogin`).
- Native Security V1: `UsAppLock.gate()` runs in `initCloud` before anything private; the native policy
  marks `locked` in `onStart`/`willEnterForeground` and emits `lockRequired`.
- Android Firebase: `android/build.gradle` already has the `google-services` classpath and
  `app/build.gradle` applies the plugin only if `google-services.json` exists. **No `google-services.json`,
  no Firebase dependency, no messaging service.**
- iOS: no Push capability, no entitlements file, no `aps-environment`, no remote-notification
  forwarding in `AppDelegate`.

## 2. Architecture

```
US logical event (producer validates actor, recipient, couple; checks the content preference)
      |
      v
_shared/notification-core.mjs  deliverNotification()
      |   one claim in push_event_log per LOGICAL event (unchanged keys)
      |   then every device of every recipient, across transports, in one fan-out
      +--> Web Push transport  (push_subscriptions, VAPID, existing payload shape)  -> PWA / browser
      +--> Native transport    (device_push_tokens)
               +--> FCM HTTP v1  -> Android app
               +--> APNs (token auth, HTTP/2) -> iOS app
      |
      v
device -> notifications.js (parse allow-listed payload) -> pending navigation queue
       -> waits for session + profile + app lock open -> performPushNavigation(target, ref)
```

### 2.1 One logical event, one notification object

`notification-core.mjs` owns the catalogue: for every event type it fixes **title/body builder, target,
channel, urgency, TTL and iOS category**. A producer builds the canonical object once
(`buildNotification(type, {...})`) and hands it to `deliverNotification`. Transports only serialize it:

- Web: exactly the payload the service worker already reads (`title, body, icon, badge, tag, target, url`);
  `url` is derived from the target, never taken from input.
- FCM v1: `notification{title,body}` + `data{v,type,target,ref,tag}` + `android{priority, ttl,
  collapse_key, notification{channel_id, tag}}`.
- APNs: `aps{alert{title,body}, sound, thread-id, category?}` + `us{v,type,target,ref,tag}`; headers
  `apns-push-type: alert`, priority 10/5, expiration, collapse id = tag.

### 2.2 Dedupe (N2.12)

The bug to avoid is "Web Push claims the key, native sees it, native sends nothing". It cannot happen
because transports never claim keys: the **dispatcher** claims the logical key once and then fans out to
every device of every transport inside the same claim. Semantics, unchanged from Web Push:

- retry of the same logical event → `23505` → nothing sent anywhere (no duplicate on any transport);
- delivered to ≥1 device (any transport) → key kept;
- delivered to 0 devices → key released, so a later retry (workers) can still deliver;
- a single device failing while another succeeded is not retried (pre-existing Web Push semantics).

### 2.3 Preferences (N2.13)

Unchanged and transport-agnostic: the producer filters recipients by `notification_preferences` before the
dispatcher runs, so `think=false` means no Ti penso on Web, Android or iOS. OS permission is transport
activation only. No native-specific preference set exists.

### 2.4 Configuration boundaries (fail closed)

| Missing | Effect |
|---|---|
| VAPID private key / `VAPID_SUBJECT` | as before: nothing claimed, the producer fails (500) **unless** the recipient has a configured native transport, in which case native still delivers. |
| `FCM_SERVICE_ACCOUNT_JSON` | Android devices are skipped (`transport-unconfigured`); Web still delivers. If nothing else could deliver, the key is released (not consumed) and workers retry later. |
| `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_PRIVATE_KEY` | same, for iOS devices. |

Native delivery outcomes: `invalid-token` (FCM `UNREGISTERED`, `SENDER_ID_MISMATCH`, invalid registration
token; APNs `410`, `BadDeviceToken`, `DeviceTokenNotForTopic`) → device row deleted;
`transient` (429/5xx/timeout) → kept; `config` (401/403 auth) → kept; `rejected` (bad payload) → kept.
Secrets are never logged; responses are aggregates only.

### 2.5 Native device registration (N2.3–N2.5)

Forward migration `supabase/migrations/20261006200000_native_notifications_v1.sql` reshapes the retired
`device_push_tokens` (aborts unless it is empty, as the production capture says):

- one row per **installation**: `installation_id uuid unique` (random UUID generated by the app, stored
  in the WebView; not a hardware identifier), `token unique`, `platform`, `provider` (`fcm`|`apns`),
  `apns_environment` (iOS only), `created_at`, `last_seen_at`, `token_updated_at`;
- client roles lose every table privilege and both policies: tokens are reachable only through RPCs and
  the service role;
- `register_native_push_device(installation, platform, provider, token, environment, retired_installation)`
  — SECURITY DEFINER, `auth.uid()` only (no client user id), requires a non-anonymous `auth.users` row, a
  profile and a current couple, bounded token shape per provider; a retired installation is deleted only
  when it belongs to the same `auth.uid()`; an existing installation id owned by another account cannot
  be taken over. A provider token may move to another installation only within the same authenticated
  account; the token string itself is never treated as authorization;
- `unregister_native_push_device(installation)` — authenticated and ownership-scoped:
  `installation_id = target AND user_id = auth.uid()`. Other users' rows and other devices are never
  touched. An offline logout still unregisters the provider token locally and rotates the installation id;
  if the next login is a different account, the stale server row is left for provider invalid-token
  pruning rather than allowing cross-account deletion;
- both are EXECUTE for `authenticated` only (F1B rule for client RPCs: never `anon`);
- `register_push_token` is dropped (retired since F1B, incompatible shape).

### 2.6 Client (`notifications.js`, `window.UsNotifications`)

- Native only (`UsPlatform.isNative` and the `PushNotifications` plugin); the PWA never loads a native plugin
  and Web Push code is untouched.
- Permission is requested only from an explicit "Attiva" (Oggi opt-in card or Settings), after copy that
  says what arrives. Never at boot.
- Boot with notifications enabled on this installation (device-local flag per user) and permission granted
  → `register()` silently refreshes the token and `last_seen_at`. `registration` events (token rotation)
  re-register.
- Logout / app-lock account recovery (`revokeCurrentDevice`, before `signOut`): authenticated
  `unregister_native_push_device` → on failure (offline, dead session) the old installation id is kept as
  *pending revoke*; native `unregister()` (FCM token deleted / APNs unregistered) stops delivery to this
  phone even while the server row survives; delivered notifications and badge cleared; **the installation
  id rotates**, so the next account gets a new identity. The pending revoke is retried at the next
  authenticated boot. The RPC removes it only if it still belongs to that authenticated user; after an
  account switch it is deliberately left for provider invalid-token pruning rather than permitting
  cross-account mutation.
- Foreground: `presentationOptions: []` (no OS banner while US is open). The app shows a short toast
  (only while unlocked), a light haptic, and refreshes the affected state.
- Taps (foreground, background, cold start, iOS action `Ricambia`): parsed against the allow-list
  (`home, today, think, left_for_you, quiz, bond, calendar`; `ref` must be a UUID), stored as one pending
  target, executed only after (1) a session and a paired profile exist and (2) `UsAppLock.whenOpen()` says
  the lock is open (biometric unlock or protection off). If the session ends instead, the target is dropped.
  Malformed payloads are ignored.

### 2.7 Android

Official `@capacitor/push-notifications` 8.1.3 (FCM, Android 13 `POST_NOTIFICATIONS`, token, refresh,
foreground event, tap incl. cold start via `BridgeActivity.onNewIntent(getIntent())`). A small local plugin
`@us/push-support` adds what the official plugin lacks: "is Firebase configured" (so `register()` is never
called without `google-services.json`), two channels created natively at startup, the app notification
settings screen, and badge clearing. Channels: `us_partner` "Dalla tua persona" (high importance:
Ti penso, Lasciato per te, risposte, quest, giochi) and `us_reminders` "Promemoria" (default importance:
domanda del giorno, calendario, ricorrenze, turno settimanale). Sound/vibration are channel defaults, so
the OS settings stay in charge. Small icon: the approved adaptive foreground `us_adaptive_foreground_v1`
(the OS draws its alpha mask; no new asset was created).

### 2.8 iOS — transport choice: direct APNs

Chosen over FCM-for-iOS because the official Capacitor plugin already returns the APNs device token on iOS,
so the app needs no Firebase SDK, no `GoogleService-Info.plist`, no swizzling and no second vendor in the
iOS delivery path; the APNs key (.p8) is needed either way (Firebase would require it uploaded to Firebase).
The backend cost is one small, tested adapter (ES256 JWT with WebCrypto + one HTTPS request) behind the
same dispatcher, so no business rule is duplicated. APNs environment is detected natively from the
embedded provisioning profile (`development` / `production`; no profile = App Store/TestFlight =
production; simulator = development) and stored per device.

iOS app side: `App.entitlements` with `aps-environment`, `AppDelegate` forwards
`didRegisterForRemoteNotificationsWithDeviceToken` / `didFail…` to Capacitor, category `US_THINK` with a
foreground action **Ricambia** (opens US into the Ti penso reaction sheet after unlock — no background
mutation), badge cleared on open and logout.

### 2.9 Notification actions and badge

- `Ricambia` never mutates data from the notification: it opens US, waits for session + app lock, then
  opens the Ti penso sheet with its one-tap reactions. Android V1 has no action buttons (FCM notification
  messages displayed by the OS cannot carry them without replacing the OS display path).
- No trustworthy unread-count domain exists, so V1 sends no badge numbers. The contract accepts an
  authoritative `badge` integer for later; the app clears the badge when US opens unlocked and on logout.

## 3. External configuration still required (not in Git, never invented)

See the report: Firebase Android app for `com.usapp.us` + `android/app/google-services.json`,
`FCM_SERVICE_ACCOUNT_JSON` Edge secret, Apple Push capability + APNs auth key
(`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` Edge secrets). Rollout steps:
`docs/native/NATIVE_NOTIFICATIONS_V1_ROLLOUT.md`.
