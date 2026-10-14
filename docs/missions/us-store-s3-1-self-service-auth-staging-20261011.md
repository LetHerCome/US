# US Store 1.0 — S3.1: self-service account entry (staging candidate)

**Scope:** PR draft only; no public signup enabled, no production Auth setting changed, no production deploy or main merge. Based on `main` at `9de2073fcad9646856bfa85242a4d1554e616c14`.

## Delivered in source

- Existing `authLogin` unchanged. New screens `usSignup`, `usVerifyEmail`, `usForgotPassword`, `usRecovery`, sharing the existing native-feeling auth card and standard styles, input autocomplete and scroll.
- `public-auth.js` is loaded in both Cloudflare and Capacitor bundles but **mounts the new links/screens only if the actual Supabase URL equals US-STAGING** (`https://dugmhngrfkuieeletatb.supabase.co`). The production URL remains the only URL in the committed `app.js`; main/live frontend is untouched. **This client gate is not a security control; production Supabase signup itself must remain disabled.**
- Supabase Auth is the only credential authority: `signUp({email,password})` (no inline session accepted), `resend({type:'signup',email})`, `resetPasswordForEmail(email)`, `updateUser({password})` only after the Supabase `PASSWORD_RECOVERY` auth event; signed out afterward. No new auth provider, SQL, RLS or storage schema.
- UI avoids account-existence disclosure for known duplicate signup / missing-account recovery provider codes; does not display or retain passwords, tokens or email in persisted storage. Busy/single-flight, stale epoch rejection, no cross-user response reuse.
- Existing MC2/MC3 `AUTHENTICATED_NO_PROFILE` -> create / invite -> `MEMBER_WAITING_PARTNER` -> paired UI unchanged. New account can reach those screens only after a real Supabase verified login.
- Recovery sessions are routed to the auth overlay before displaying private couple data.

## Important release/test blockers

1. **Supabase Auth project configuration cannot be read by the available management tools.** Before STAGING email QA, owner/reviewer must verify email confirmation is ENABLED, public signup is enabled in US-STAGING only, SMTP/email delivery and rate limits are configured, and the Auth **Site URL** points to a reviewed STAGING HTTPS callback. Current code intentionally uses the provider-configured Site URL for both confirmation and password recovery (no `https://localhost` native redirect and no unapproved custom scheme).
2. The hosted STAGING browser origin and Auth allowed redirect URLs must be established. This is necessary before the password-reset email flow can be certified on PWA or Android WebView; the test suite currently uses a fake Auth provider and only validates protocol contracts.
3. This S3.1 branch is based on `main`, which does **not yet include S3 owner-gated FCM** from draft PR #187. **DO NOT distribute a new native STAGING APK from this branch alone**: it could regress cross-account push safety tested in S3. Only produce/ship a consolidated QA APK after security review/rebase of S3 and signing continuity checks. Browser source-only QA is permissible.
4. Public signup in production stays OFF; production DB, real couple, tokens, Cloudflare and Google Play untouched. No email addresses are provided to GitHub CI; unit tests use `.invalid` synthetic emails.
5. S3.2 account deletion, export and couple separation are **not implemented** in S3.1 and remain P0 issue #183. Do not authorize public rollout before those flows and issue #181 are closed.
6. Validate real 4-account / 2-couple STAGING Auth sessions, verified emails, rejected unverified login, duplicate and expired tokens, upload/access isolation, invite race, offline/cold start, restore link, and authentication rate-limit responses before a security GO.

## CI and acceptance

Run `node --test tests/s3-1-public-auth.test.js tests/mc3-onboarding.test.js tests/native-boot-auth-safety.test.js tests/beatrice-password-login.test.js` and `npm run build:cloudflare-pages && npm run build:capacitor-web`. The isolated workflow `.github/workflows/s3-1-public-auth.yml` runs the same checks and ensures production endpoint does not mount signup.

**State separation:** committed/source-tested != deployed on staging != verified Auth emails != deployed production != public launch. The first is addressed here, while the remaining gates are OPEN.
