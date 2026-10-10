# US — Architecture


## 2026-10-10 Store 1.0 architecture update

**Source:** main @ b0c9f82d; the original 2026-10-04 technical map below remains useful but its status flags are historical. For live implementation/release readiness prefer [CURRENT_STATE.md](CURRENT_STATE.md) and [Store Baseline](store/US_STORE_1_0_BASELINE.md).

- Primary navigation stays four surfaces Oggi/Noi/Ricordi/Gioca. Main feature modules added since the map: noi-v2.js/css (canonical calendar), oggi-look.js/css (Oggi themes), ricordi-inline-carousel.js/css, modal-center.css, top-chrome.css, native-frameless.css.
- MC2 SQL has been registered on the live Supabase migration ledger; MC3 onboarding source is merged in main. This **does not** certify public signup and shared-device push isolation.
- Widget Bridge and Premium Motion V2 are in draft #170, not main. The server-authoritative weekly participation SQL and client are in draft #177, not live.
- Android: target/compile API 36, Capacitor 8; iOS Capacitor 8 builds simulators but has no device QA.
- Preserve auth, push, media-cache, progression, calendar and Service Worker authorities; no parallel framework/tenant systems during Store V1 freeze.
- Keep monetization D4 undecided. No subscription/payment runtime exists by decision.

---

**Status:** CURRENT TECHNICAL MAP  
**Updated:** 2026-10-04

## Runtime

- Frontend: vanilla HTML/CSS/JavaScript PWA.
- Production hosting: Cloudflare Pages.
- Production build: `npm run build:cloudflare-pages` → `dist/cloudflare-pages`.
- Backend: Supabase project `iiakdfsxpywdkxravqjh`.
- Native shell: Capacitor exists, but PWA is the primary active client.
- Production branch: `main`.

## Main domain map

| Domain | Main source |
|---|---|
| Shell / auth / Oggi / Daily / Noi glue | `app.js`, `index.html` |
| Navigation / history / back | `navigation.js` |
| Gioca / Game V2 | `games.js`, `games.css` |
| Sintonia / Ritmo / rewards | `progression.js`, `progression.css` |
| Calendar | `calendar.js`, `calendar-domain.js`, `calendar.css` |
| Ricordi / albums | `app.js`, `moments-albums.js`, `moments-albums.css` |
| Lasciato per te | `left-for-you.js`, `left-for-you.css` |
| Stories | `stories.js`, `stories.css` |
| Settings | `settings.js`, `settings.css`, `settings2.css` |
| UI primitives | `ui-foundation.js`, `ui-foundation.css` |
| Platform/native boundary | `platform.js`, `native-entry.mjs`, `app-links.mjs`, `android/`, `ios/` (see `docs/native/IOS_BASELINE.md`); biometric app lock `app-lock.js` + `native-plugins/us-app-lock` (see `docs/native/NATIVE_SECURITY_V1.md`); native push `notifications.js` + `native-plugins/us-push-support` (see `docs/native/NATIVE_NOTIFICATIONS_V1.md`) |
| Notification domain (Web Push + FCM + APNs) | `supabase/functions/_shared/notification-core.mjs`, `native-push-transport.mjs`, `native-push-env.ts` |
| Service worker / PWA caching | `service-worker.js` |
| Supabase source | `supabase/` |
| Membership / invites (MC2 review candidate) | `profiles.couple_id` authority; `couple_invites` SHA-256 bearer state; five authenticated MC2 RPCs in `20261007201842_mc2_couple_invites.sql`; review/rollout artifacts in `docs/mc2/` |
| Tests | `tests/` |

## Sensitive authorities

Do not create parallel systems for:
- authentication/session identity;
- Push delivery/deduplication;
- private media signing/caching;
- Realtime state;
- progression/idempotency;
- calendar domain calculations;
- Service Worker lifecycle.

Audit the existing authority first.

## Delivery model

Use one branch/worktree for a mission. Typical path:

`audit → plan → implement → focused tests → full tests/build → review → PR/merge → production rollout when separately authorized`.

Repository implementation and production rollout are separate gates.
