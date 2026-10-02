# US — Cloudflare Pages migration

This migration is intentionally parallel and reversible.

## Architecture

- Frontend PWA: Cloudflare Pages
- Auth, database, storage, RPCs, Edge Functions and push backend: existing Supabase project
- Existing Vercel deployment: keep it online until Cloudflare has passed QA

No database migration is required.

## Cloudflare Pages project

Create a new Pages project from the GitHub repository `LetHerCome/US`.

Use:

- Production branch: `main`
- Framework preset: None
- Build command: `npm run build:cloudflare-pages`
- Build output directory: `dist/cloudflare-pages`
- Root directory: repository root

The build script publishes only the PWA runtime and `assets/`. It deliberately excludes repository source/configuration such as `supabase/`, migrations, tests, docs and Android sources.

## Supabase Auth

The app's Magic Link uses:

`emailRedirectTo: location.origin + '/'`

Before testing Magic Link on the new Pages hostname, add the final Cloudflare Pages origin to the Supabase Auth redirect URL allow-list.

Keep the existing Vercel origin in the allow-list during the migration so rollback remains possible.

Normal email/password sessions, database RPCs, storage and Edge Functions are already host-independent.

## PWA QA gate

Before treating Cloudflare as production, verify on the generated `*.pages.dev` URL:

1. Cold load and reload.
2. Existing login/session restore.
3. Fresh login.
4. Magic Link recovery after the Cloudflare origin is allow-listed in Supabase.
5. Home image and signed media.
6. Daily Question.
7. Quest / Gioca.
8. Ti penso.
9. Sintonia reward equip + unequip.
10. Web push subscription and one received notification.
11. Add to Home Screen / standalone launch.
12. Service-worker update path after a second deployment.

Do not remove Vercel until this checklist passes.

## Rollback

Rollback does not require database work.

If Cloudflare fails QA, continue using the existing Vercel URL. Both frontends talk to the same Supabase backend. No data is copied or moved.

## Custom domain later

After Pages QA, a custom domain can be attached to Cloudflare. Add that origin to the Supabase Auth redirect allow-list before switching users to it.
