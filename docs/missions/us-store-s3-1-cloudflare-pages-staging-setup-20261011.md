# US STAGING Pages — isolated Git-connected project (11 Oct 2026)

This config is **only** for Cloudflare Pages STAGING. The current public US Pages deployment is `https://us-a33.pages.dev`; do not edit its settings, repo integration, environment variables or production branch.

## Create the new Pages project

Cloudflare dashboard → Workers & Pages → Create application → Pages → Import an existing Git repository.

| Field | Required value |
|---|---|
| Project name | `us-staging-s31` (use a unique, separate name if already taken) |
| Git repository | `LetHerCome/US` |
| **Production branch for THIS NEW project** | `mission/us-store-s3-1-public-auth-staging-20261011` (not `main`) |
| Framework preset | `None` |
| Build command | `npm run build:us-staging-pages` |
| Build output directory | `dist/s31-staging-preview` |
| Root directory | repository root |
| Environment variables (production scope of NEW staging project) | `US_STAGING_SUPABASE_PUBLISHABLE_KEY` = publishable API key `default` from **US-STAGING Supabase**, never `service_role` |
| Node | Node.js `22` if the build image doesn't already provide a supported version |

The build script **fails closed** if `CF_PAGES_BRANCH` is not the approved staging branch, if the key is missing/invalid or if production Supabase project ID appears in the staged app.js or index.html. It copies staged PWA assets to the separate `dist/s31-staging-preview` output directory and does **not** rewrite source files.

The `US_S31_STAGING_PREVIEW=true` build guard is set automatically by the package script; do not add it manually to Cloudflare. Do NOT run the production build command `npm run build:cloudflare-pages` alone in this staging Pages project, as that output uses production Supabase.

## Post-deploy verification before real signup

1. Capture the actual URL allocated by Cloudflare, likely `https://us-staging-s31.pages.dev` if available, **but do not assume it exists beforehand**.
2. On the staged site, inspect that `app.js` contains only `https://dugmhngrfkuieeletatb.supabase.co` and NO `iiakdfsxpywdkxravqjh`. Production `https://us-a33.pages.dev` must remain unchanged.
3. Only then configure Supabase project **US-STAGING** Auth URL Configuration `Site URL` and `Redirect URLs` for the actual Cloudflare staging HTTPS origin and its root callback. Production Supabase Auth settings must remain unchanged.
4. Verify STAGING signup and **Confirm email** are enabled, email sender config/SMTP works, rate limits are reasonable and reset-password email resolves to a reviewed STAGING URL. Do not enable production signup.
5. Run real four-account / two-couple QA under STAGING with evidence (no passwords, tokens or private couple data in logs). The first signup can only be considered verified if no automatic session is returned and the callback completes.
6. **Do not deploy S3.1 Android APK independently of draft S3 FCM security PR #187**. This branch is browser-only staging preview and does not include the newer owner-gated native push patches.
7. Never merge PR #189 or close issue #183 based solely on static-build test green.

## Manual Cloudflare environment variable provided — redeploy trigger

On 2026-10-11 the project owner confirmed saving the STAGING publishable API key in the new Cloudflare Pages project. This source-only documentation change triggers the existing Git-connected Cloudflare Pages automatic build on the approved STAGING branch; it is **not** evidence the hosting build has succeeded. The environment variable value is not committed. Verify the Cloudflare build log and live HTTPS origin after Git push, never promote to production based solely on GitHub CI.

## Recovery

A failed stage deploy does not affect the public Pages project. To roll back, use the new project deployment history only; do not change the production branch or roll back `us-a33`. Do not paste `service_role` or Auth session tokens anywhere into Cloudflare build variables.

## Repeatable CI

Workflow `.github/workflows/s3-1-public-auth.yml` builds the exact same command with Cloudflare branch environment simulation using existing STAGING publishable key stored in GitHub Actions secrets. It does not deploy to Cloudflare automatically. The Cloudflare dashboard remains the only place where a Pages project gets created.
