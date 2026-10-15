# US 1.0 — Production release checklist for self-service signup, email verification and password recovery (PR #189)

**State on 2026-10-13:** code ready behind a switch that is **OFF**. Production Auth is unchanged: signup is disabled and `supabase/config.toml` still declares `enable_signup = false`. Nothing in this document has been applied to production.

## 1. The switch

| Layer | Control | Release value | Who / when |
|---|---|---|---|
| App (client) | `PRODUCTION_SIGNUP_RELEASED` in `public-auth.js` | `false` → `true` | Code change + test change, in a release PR approved by the founder |
| Supabase production (server) | Auth → Sign In / Providers → **Allow new users to sign up** (`enable_signup`) | `false` → `true` | Founder, in the dashboard, only after §2–§4 are done |

- The client switch only shows the "Crea account" and "Password dimenticata?" screens. It is not a security control.
- The server setting is the real gate **and the kill switch**. Setting `enable_signup = false` again stops new signups immediately, without an app update. Existing users keep logging in. The UI then answers with the generic "Operazione non disponibile" message.
- `supabase/config.toml` must be updated to `enable_signup = true` in the same release PR. Otherwise a later `supabase config push` would switch signup off again. The F1A test (`tests/f1a-auth-shutdown.test.js`) must change with it.

## 2. Production Auth settings (dashboard, project `iiakdfsxpywdkxravqjh`)

Read each value before changing it, and record before/after in the release PR.

| Setting | Required value | Why |
|---|---|---|
| Confirm email | **ON** | The app refuses a signup that returns a session right away and signs it out ("Verifica email non attiva"). |
| Minimum password length | **10** | Same rule as the app (10–72 characters, no leading/trailing space). |
| Password requirements | none (length only) | Matches the app; no composition rules. |
| Leaked password protection | ON if the plan allows it | Pro plan only; production is on Free today. Not a blocker. |
| Secure email change | ON | Both addresses must confirm. |
| Site URL | `https://us-a33.pages.dev` (unchanged) | Confirmation and recovery links open the web app. |
| Redirect URLs | `https://us-a33.pages.dev` only (unchanged) | No custom schemes, no localhost. |
| Email OTP / link expiry | 3600 s (default) or lower | |
| Rate limits (Auth → Rate Limits) | emails ≤ 30/h to start; sign-ups and verification at defaults | Limits abuse. Increase only if real traffic needs it. |
| Email templates | Italian text for Confirm signup and Reset password | The default templates are in English. |

**Precheck before turning Confirm email ON:** in Auth → Users, every existing production user must have *Email confirmed*. Owner-created accounts normally are. An unconfirmed existing user could no longer log in.

## 3. SMTP (required: the built-in Supabase mailer is not usable for real users)

Supabase's default mailer only sends to project team members and has a very low hourly limit, so a real signup would never receive its email. Production needs a custom SMTP provider.

- **Provider:** any transactional provider with SMTP (for example Resend, Postmark, Brevo or Amazon SES). This is a founder choice, and it may have a cost.
- **Sending domain:** one the founder controls, such as `mail.<dominio US>`. It needs SPF, DKIM and DMARC records in DNS. A free `pages.dev` address cannot send mail.
- **Sender:** for example `US <noreply@<dominio>>`, plus a reply/support address. The support address also goes in the Play listing and the privacy policy.
- **Credentials:** entered by the founder directly in Supabase → Auth → SMTP Settings. They never go in GitHub, `config.toml`, chat or CI logs.
- **Test on US-STAGING first,** with the same provider, or a sandbox mode of it, and the staging Site URL.

## 4. Release gates (all must be true before §1 is flipped)

1. **Account deletion is live** (PR #190 / issue #183). Google Play requires in-app account deletion **and** a public web deletion request page for any app that lets users create accounts.
2. Privacy policy and support contact are published, and their URLs are in the Play listing. The published Terms and Privacy URLs are set in `LEGAL_URLS` in `public-auth.js`: the sign-up box "Ho almeno 18 anni e accetto i Termini e la Privacy" links to them (the S3.1 test refuses a release without both).
3. On US-STAGING, with real email delivery:
   - signup → email → confirm → login;
   - an unconfirmed login is refused;
   - a duplicate signup gives the same message as a new one;
   - recovery for an unknown email gives the same message;
   - reset link → new password → forced re-login;
   - an expired or reused link is refused.

   Evidence is screenshots, with no addresses or tokens in GitHub.
4. A new account reaches "create couple / join with invite" and **never** sees another couple's data. Use the 4-account staging check, with disposable accounts only.
5. PR #187 (push owner gate) is merged first. A native build of this branch without #187 must not be distributed.

## 5. Native app note

Confirmation and recovery links open in the browser, on the web app at the Site URL. A user who resets the password on the web then logs in with the new password in the Android app. No deep-link or custom URL scheme is added in 1.0.

## 6. Cloudflare `us-staging-s31`

That Pages project builds every branch. Builds of any branch other than `mission/us-store-s3-1-public-auth-staging-20261011` now publish a static "not a staging preview" page, so the check passes instead of failing. Branches that do not contain this script yet (for example #187) stay red until they include `main` after #189 is merged. That is cosmetic, not a code failure.

## 7. Rollback

- Set Supabase `enable_signup = false`. This takes effect at once.
- Optionally ship `PRODUCTION_SIGNUP_RELEASED = false` in the next app update.
- Accounts already created stay. Removing them goes through the account deletion flow (#190), never a manual SQL delete.
