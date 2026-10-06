# US — Architecture

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
| Platform/native boundary | `platform.js`, `native-entry.mjs`, `app-links.mjs`, `android/`, `ios/` (see `docs/native/IOS_BASELINE.md`) |
| Service worker / PWA caching | `service-worker.js` |
| Supabase source | `supabase/` |
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
