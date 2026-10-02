# US — Frontend deployment (Cloudflare Pages)

**Status: Cloudflare Pages is the production frontend: https://us-a33.pages.dev**
The migration described below is complete. Vercel is no longer a production target; it is kept only as a
cold rollback origin until it is removed from the account (not from this repo's
scope). Do not add Vercel-specific code, config or runtime dependencies.

## Architecture

- Frontend PWA: **Cloudflare Pages** (production) — `https://us-a33.pages.dev`
- Auth, database, storage, RPCs, Edge Functions and push backend: Supabase project `iiakdfsxpywdkxravqjh`
- Legacy Vercel deployment: rollback only, not maintained

Frontend deploys never require a database migration. Supabase migrations are
applied separately (see `supabase/migrations/`), before the frontend that needs
them reaches production.

## Cloudflare Pages project

GitHub repository `LetHerCome/US`:

- Production branch: `main`
- Framework preset: None
- Build command: `npm run build:cloudflare-pages`
- Build output directory: `dist/cloudflare-pages`
- Root directory: repository root

`scripts/build-cloudflare-pages.mjs` publishes only the PWA runtime and `assets/`,
plus `cloudflare/_headers`. It deliberately excludes repository source and
configuration (`supabase/`, migrations, tests, docs, Android sources, package
files). `tests/cloudflare-pages-migration.test.js` keeps that contract.

Every release that changes a runtime file or the Service Worker bumps the build
id (`npm run build:id -- <build-id>`): it rewrites `index.html` cache-busting
query strings, `service-worker.js` `BUILD_ID`, `version.json` and the manifest.
The private media cache `us-private-media-v1` is never renamed by a build bump.

## Supabase Auth

Magic Link uses `emailRedirectTo: location.origin + '/'`, so the production
Pages origin (and any custom domain) must be in the Supabase Auth redirect
allow-list. The legacy Vercel origin can stay in the list while rollback is
still possible; remove it when Vercel is retired.

Email/password sessions, RPCs, storage and Edge Functions are host-independent.

## Release QA gate (production)

After each production deploy that touches runtime files:

1. Cold load and reload.
2. Existing session restore.
3. Home image and signed media.
4. Daily Question.
5. Quest / Gioca.
6. Ti penso.
7. Sintonia collection: equip + unequip one reward per slot.
8. Lasciato per te: record (tap / tap), preview, send, receive.
9. Ricordi: Elimina → Annulla, and Elimina → grace expiry.
10. Web push: one received notification.
11. Standalone launch (Add to Home Screen) on iOS and Android.
12. Service-worker update path after a second deployment.

## Rollback

Rollback never requires database work: every frontend talks to the same
Supabase backend and no data lives on the host.

1. Preferred: in Cloudflare Pages, roll back to the previous production
   deployment (Deployments → previous build → Rollback).
2. Emergency only: point users at the legacy Vercel origin (same backend).

## Host references outside the PWA bundle

The PWA itself is host-agnostic (`location.origin`, `self.location.origin`).
The one place that must name the production frontend explicitly uses
`https://us-a33.pages.dev` (guarded by `tests/cloudflare-pages-migration.test.js`):

- `integrations/widgets/scriptable/*.js` `APP_URL`: the URL the iOS widgets
  open. Re-install / update the two Scriptable scripts on each iPhone so the
  copies on the devices pick it up.

Intentionally unchanged: `supabase/functions/**` `VAPID_SUBJECT` still reads
`https://usfinal.vercel.app`. It is the Web Push sender contact (`sub` claim
of the VAPID JWT), not a frontend URL: it never decides where a notification
opens (the service worker uses `self.location.origin`). The Edge Function
sources are pinned to their deployed bytes (`tests/m10-2-daily-reactions.test.js`),
so change it only together with a coordinated redeploy of every push function.

If a custom domain replaces `us-a33.pages.dev`, update `APP_URL` together with
the Supabase Auth redirect allow-list.

## Custom domain

A custom domain can be attached to the Pages project at any time. Add that
origin to the Supabase Auth redirect allow-list before switching users to it.
