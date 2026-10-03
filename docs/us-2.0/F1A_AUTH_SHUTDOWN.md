# US 2.0 — F1A Legacy Auth Shutdown

**Status:** F1A_READY_FOR_REVIEW (not merged)
**Branch:** `mission/us-2-0-f1a-auth-shutdown` · **Base:** `origin/main` `c8de18dd650487e39196b2014ce479314fe1c1c0` (unchanged since the mission was issued)
**Project:** Supabase `iiakdfsxpywdkxravqjh` · **Frontend:** Cloudflare Pages `https://us-a33.pages.dev`
**Build id:** `us-gioca-weekly-remaining-v1-20261003-1` → `us-f1a-auth-shutdown-v1-20261003-1`
**Production changes applied:** 2026-10-03, about 14:23–14:26 UTC

US is a private two-person app. Its only intended login is email + password. F1A closes the legacy anonymous/pairing authority surface found by F0 (§7.1, P0) without deleting any account, profile, invite or data.

---

## 1. Before state (re-verified live, not copied from F0)

| Finding | F0 claim | Re-verified before change |
|---|---|---|
| Anonymous sign-ins | enabled | `enable_anonymous_sign_ins = true` (`config diff`) |
| Public signup | enabled | `enable_signup = true` (remote, explicit in diff once declared) |
| Twilio SMS | enabled | `auth.sms.twilio.enabled = true`. Phone sign-in itself already **off** (`/auth/v1/settings` → `external.phone = false`). 0 users with a phone, 0 phone identities. |
| Manual linking | enabled | `enable_manual_linking = true` (needed only by the legacy anon→email upgrade) |
| `site_url` / redirects | Vercel | `https://us-francesco-beatrice-app.vercel.app` (both). That origin now returns **404**. |
| `claim_us_role` | callable by signed-in users | `SECURITY DEFINER`, owner `postgres`, `search_path=public, auth, extensions`, ACL `{postgres=X, authenticated=X, service_role=X}`. anon: no. authenticated: **yes**. |
| `claim_us_role` body | — | Byte-identical (modulo CRLF) to `20260929121430_m7a_claim_us_role_bucket_items_transfer.sql`. It requires an anonymous caller and never checks `used_at`/`used_by`, then **deletes** the existing profile of the chosen role. |
| Anonymous accounts | exist | 8 anonymous users (no profile, no identities), 8 sessions, 7 unrevoked refresh tokens |
| Client | email/password only | `signInWithPassword` is the only sign-in call. Leftover legacy code: the Settings anon→email "Proteggi il tuo account" upgrade flow. |

Security advisors before (security type): **93 WARN**. They break down as `authenticated_security_definer_function_executable` 47 (including `claim_us_role`), `auth_allow_anonymous_sign_ins` 37, `anon_security_definer_function_executable` 8, `auth_leaked_password_protection` 1.

### Users inventory (counts only)

| Class | Count | Profile | Notes |
|---|---|---|---|
| Email, with US profile | 2 | yes, both in the one couple (`francesco`, `beatrice`) | confirmed, password set, `email` identity, not banned |
| Email, **no** profile | 1 | no | created 2026-08-18, last sign-in 2026-08-18. The app shows "Nessun profilo US valido" for it. |
| Anonymous | 8 | no | created 2026-08-18 → 08-20. Last session refresh between 08-19 and 09-20. |
| **Total** | **11** | 2 profiles · 1 couple · 2 invites (both used, by the two real profiles) | |

Deletion impact of the 9 profile-less users:
- **Rows owned through FKs to `auth.users`:** 0. The FKs are `profiles`, `daily_answers`, `moods`, `quiz_responses`, `bucket_items`, `shared_messages` ×2, `activity`, `couple_invites.used_by`, and no profile-less user owns rows in any of them. The 27 FKs to `profiles` are irrelevant because these users have no profile.
- **Storage — blocker for deletion:** 28 of the 51 `us-media` objects are owned by 3 of the anonymous users. They are all under the couple's folder, created 2026-08-19 → 08-28, and are the couple's media from the pre-email era. Supabase refuses to delete an Auth user who owns Storage objects. Deletion therefore needs an ownership migration first (see §7).
- **Current access of the profile-less users:** none in practice. Every `us-media` policy and every couple-scoped RLS policy requires `private.current_couple_id()`, which is null without a profile. `profiles` has RLS enabled and **no INSERT policy**, so a profile-less session cannot create one. `claim_us_role` was the only path, and it is now revoked.

---

## 2. Exact changes

### 2.1 Database — `supabase/migrations/20261003160000_f1a_revoke_claim_us_role.sql`

```sql
revoke execute on function public.claim_us_role(text, text) from public, anon, authenticated;
comment on function public.claim_us_role(text, text) is 'RETIRED (US 2.0 F1A): …';
-- plus a DO block that aborts if anon/authenticated can still execute it
```

- This is the revoke-only remediation the Supabase advisor (lint 0029) recommends, including `PUBLIC`, because Postgres' default function ACL lives there.
- **Not** dropped. The body, `SECURITY DEFINER`, `search_path`, owner and migration history (`20260928071749`, `20260929121430`) are unchanged. Production `md5(prosrc)` is `9548d2d6…` both before and after.
- `postgres` (owner) and `service_role` keep EXECUTE. Nothing calls the function, and no client JWT maps to those roles.
- No new `SECURITY DEFINER`, no RLS change, no data change.

### 2.2 Auth config — `supabase/config.toml` (declared-only `supabase config push`)

```toml
[auth]
site_url = "https://us-a33.pages.dev"
additional_redirect_urls = ["https://us-a33.pages.dev"]
enable_signup = false
enable_anonymous_sign_ins = false
enable_manual_linking = false

[auth.sms]
enable_signup = false   # phone/SMS sign-in off (already off remotely; now pinned in the repo)
```

- CLI 2.117 `config push` writes **only declared properties**. The other 11 remote-only settings were left untouched: email confirmations, OTP length/frequency, TOTP MFA, pooler, storage analytics/transformations, Twilio provider selection.
- I took the canonical URL from the repo rather than guessing it: `docs/cloudflare-pages-migration.md` ("production frontend"), and the Scriptable widgets' `APP_URL`. It is live and serving the current build (`/version.json` = `us-gioca-weekly-remaining-v1-20261003-1`). No Vercel URL is needed: the client sends no `redirectTo`/`emailRedirectTo`, and the Capacitor shell uses no auth deep links.
- **Twilio:** `[auth.sms.twilio] enabled = false` could **not** be pushed. The CLI reports: "config push can switch between SMS providers but cannot turn the active provider off; disable phone sign-in or use the dashboard". Phone sign-in is off (`external.phone = false`) and declared off, so the stored Twilio provider entry is inert: phone OTP returns `phone_provider_disabled`. Clearing the provider entry itself is a dashboard step (§7).

### 2.3 Client — retired the anonymous → email upgrade flow

The Settings row "Proteggi il tuo account" (`usAccountUpgradeRow`) was visible only for an anonymous session, or one with a pending `us:account-upgrade` key for its own UID. An anonymous session reaches Settings only with a US profile. Today 0 anonymous users have a profile, new anonymous sign-ins are disabled, and `claim_us_role` (the only way an anonymous user ever got a profile) is revoked, so the flow is unreachable.

Removed:
- `app.js`: `setPasswordFromActiveSession`, `ACCOUNT_UPGRADE_KEY`/`PHASES`, `readPendingAccountUpgrade`, `clearPendingAccountUpgrade`, `requestAccountEmailUpgrade` (their only caller was the upgrade modal).
- `settings.js`: the row visibility block, `accountUpgradeModal`, `resumeAccountUpgradePhase`, and the `account-upgrade` action.
- `index.html`: the Settings row.

Unchanged: the login overlay (email + password only), `loginAccount`/`signInWithPassword`, the "no valid US profile" guard, logout, and all other Settings rows.

The build id was bumped with `npm run build:id`, the same mechanism as previous releases: `service-worker.js` `BUILD_ID`, `version.json`, the manifest and the `index.html` `?v=` strings. `us-private-media-v1` is untouched, and no Service Worker logic changed.

---

## 3. Production mutations performed (complete list)

| # | Mutation | How |
|---|---|---|
| 1 | `revoke execute on public.claim_us_role(text,text) from public, anon, authenticated` + function comment | The committed migration file applied verbatim in one transaction (`supabase db query --linked -f`). Its self-check passed. |
| 2 | Migration ledger row `20261003160000 f1a_revoke_claim_us_role` | `supabase migration repair --status applied 20261003160000`. Only this version was recorded. `db push` was deliberately not used, because the ledger has pre-existing historical drift (§7). |
| 3 | Auth: `site_url`, `additional_redirect_urls`, `enable_signup=false`, `enable_anonymous_sign_ins=false`, `enable_manual_linking=false` | `supabase config push` (5 properties, per-property diff shown before writing) |

Read-only side effect, as in F0: the CLI's own `Initialising login role…` temporary login role.

Not touched: users, sessions, profiles, couples, invites, data, Storage, RLS, Edge Functions, cron, secrets.

---

## 4. Production verification (after)

**Auth settings** (`GET /auth/v1/settings`, publishable key): `disable_signup: true`, `anonymous_users: false`, `phone: false`, `email: true`. Email is the only enabled provider.

**Live endpoint probes.** None can create anything: each was gated on the settings above, and they used fake, non-existent identities.

| Probe | Result |
|---|---|
| `POST /auth/v1/signup {}` (anonymous) | `422 anonymous_provider_disabled` |
| `POST /auth/v1/signup` (fake email + password) | `422 signup_disabled` |
| `POST /auth/v1/otp {phone}` | `400 phone_provider_disabled` |
| `POST /auth/v1/otp {email, create_user:false}` (unknown email) | `422 otp_disabled` |
| `POST /auth/v1/token?grant_type=password` (fake credentials) | `400 invalid_credentials`. The password grant is live and the login contract is unchanged. |
| `POST /rest/v1/rpc/claim_us_role` as anon | `401 42501 permission denied for function claim_us_role` |

**`claim_us_role` as `authenticated`.** I simulated this in-database: read-only transaction, `set local role authenticated`, real `sub` claims, bogus code. The result was `permission denied for function claim_us_role` for all 4 personas: an anonymous user, the profile-less email user, Francesco and Beatrice. Grants after the change: ACL `{postgres=X, service_role=X}`. anon false, authenticated false, PUBLIC false, service_role true.

**Data integrity.** I took an md5 of every row of every public table, before and after. All **57/57 public tables are byte-identical**, including `profiles` (2), `couples` (1) and `couple_invites` (2). Storage ownership is unchanged (28 objects still owned by anonymous users). User counts are unchanged (11 = 3 email + 8 anonymous).

**Real accounts.** Both profiles exist with the same role and couple. Both are confirmed, have a password set, have an `email` identity and are not banned. Their sessions were untouched.
- I did **not** sign in as either of them: the agent never handles real passwords.
- The remaining manual check: one real login, or a session restore, on each phone after the change.

**Repo ↔ production alignment.**
- `supabase config diff` reports **0 declared updates**. The 11 remote-only properties are intentionally unmanaged.
- The remote ledger contains `20261003160000`.

### Security advisors (security type)

| Advisor | Before | After |
|---|---|---|
| `auth_allow_anonymous_sign_ins` | 37 | **0** |
| `authenticated_security_definer_function_executable` | 47 | **46** (`claim_us_role` gone) |
| `anon_security_definer_function_executable` | 8 | 8 (all start with an auth guard, F0 §5; F1C) |
| `auth_leaked_password_protection` | 1 | 1 (deferred) |
| **Total** | **93** | **55**, with no new findings |

---

## 5. Tests

New: `tests/f1a-auth-shutdown.test.js` (8 tests).
1. The shipped runtime has no anonymous, OTP/Magic Link, signup, other-provider, phone, pairing or anon→email upgrade call. It scans every JS/HTML file in the Cloudflare `RUNTIME_FILES` list.
2. The login overlay has exactly one auth step and exactly two inputs (email, password), and `signInWithPassword` is the only `sb.auth.signIn*` call.
3. Settings no longer carries the upgrade row.
4. The Auth config declares signup, anonymous sign-ins, manual linking and phone sign-in off. It never declares secrets or the unencodable Twilio toggle.
5. The Auth URLs are only the canonical Pages origin, which matches the repo's production docs and the widget `APP_URL`. No Vercel or localhost URL.
6. The migration is revoke-only: no drop, DML, grant, function (re)definition, `SECURITY DEFINER` or `service_role`.
7. pglite with the real latest function and the production ACL: before, authenticated can execute. After the migration, anon, authenticated and PUBLIC cannot, while service_role can. The definition (body, definer flag, config) is identical. A real call as anon or authenticated gets `permission denied`, and re-applying is idempotent.
8. The migration's self-check aborts if a client grant survives.

Updated:
- `tests/beatrice-password-login.test.js`: 12 tests that pinned the retired upgrade flow were replaced by tests asserting it is gone.
- `tests/us-human-ui-02.test.js`: Settings control lists no longer include `account-upgrade`.

| Command | Result |
|---|---|
| `node --test tests/f1a-auth-shutdown.test.js tests/beatrice-password-login.test.js tests/us-human-ui-02.test.js tests/cloudflare-pages-migration.test.js tests/local-dev-mode.test.js` | 50 pass, 0 fail |
| `npm test` (branch) | 1288 tests: 1218 pass, **37 fail**, 33 skipped |
| `npm test` (untouched `origin/main` `c8de18d`, temporary worktree) | 1292 tests: 1222 pass, **37 fail**, 33 skipped |
| Failure-set diff (branch vs base) | **identical**. All 37 are the Windows-baseline M9A, M10C, M11B, M11C and M11D push-worker/catalog suites. Test count: 1292 − 12 retired + 8 new = 1288. |
| `npm run build:cloudflare-pages` | OK, 141 files. The bundle contains no upgrade-flow code. |
| `npm run build:capacitor-web` | OK, 139 files. Its whitespace-only rewrite of `android/brand-assets-manifest.json` was reverted. |

Release gate:
- The frontend changes ship on the next Cloudflare Pages deploy after merge.
- The production Auth/DB changes are already live and are compatible with the currently deployed frontend, which never calls any closed path.
- After the deploy, run the standard QA gate in `docs/cloudflare-pages-migration.md`, especially: cold load, existing session restore, Settings → TU (no "Proteggi il tuo account" row), and the service-worker update path.

---

## 6. Remaining legacy accounts (not deleted — F1A forbids it)

- **8 anonymous users** with 8 sessions and 7 unrevoked refresh tokens. A device still holding one can refresh to an `authenticated` JWT. With no profile, revoked pairing, couple-scoped RLS/Storage and no `profiles` INSERT policy, that JWT has no effective access. It is still residual authority and should be closed in F1B.
- **1 email account without a profile.** It can still sign in with its password, but it lands on "Nessun profilo US valido" and has no data access. The owner needs to decide whether to keep or delete it.

---

## 7. Deferred

### F1B — Auth hygiene and legacy-account removal (proposed order)

1. **Revoke the anonymous users' sessions and refresh tokens** (Auth admin sign-out, or delete the 8 sessions). They own no data, so this is low risk.
2. **Storage ownership migration.** Reassign the 28 `us-media` objects owned by the 3 anonymous users (`owner`/`owner_id`) to the matching real profile, or to a deliberate owner. Do this before any deletion, because Supabase refuses to delete users who own objects.
   - These objects also cannot be removed by either partner through `us_media_delete_own`, which requires `owner_id = auth.uid()`. Verify how `delete-moment` handles them.
3. **Delete the 8 anonymous users** after steps 1 and 2. No FK rows depend on them (verified).
4. **Decide on the profile-less email account:** keep it, or delete it (it owns nothing).
5. **Twilio provider entry:** clear it in the dashboard (Auth → Providers → Phone/SMS) if the owner confirms it is unused. Phone sign-in is already off and pinned off in the repo.
6. **Leaked-password protection:** enable it (advisor `auth_leaked_password_protection`; plan availability to check).
7. **`couple_invites`:** both codes are used and their only consumer is the retired RPC. Archive or delete them once history no longer needs them.
8. **Email OTP for existing users:** GoTrue still serves email OTP/Magic Link to the 3 existing email accounts. This is inherent to the email provider, needs inbox access (the same trust level as password recovery), and the client never calls it. Revisit if Supabase exposes a per-flow toggle.
9. **Edge Functions:** `VAPID_SUBJECT` is still `https://usfinal.vercel.app` in `send-web-push`, the `*-push-worker`s, `game-v2-push` and `_shared/think-web-push.ts`. This is the Web Push sender contact, not Auth and not a navigation URL. Switch it to the Pages origin or a `mailto:` when those functions are next deployed.

### F1C — Authorization hardening (unchanged by F1A)

- `profiles.couple_id` / `profiles.role` are self-updatable through `profiles_update_self` plus the column grants (F0 §6.2). This is now the main remaining authority risk for the 2 real accounts.
- `shared_messages_update_recipient` can rewrite content and sender.
- Over-broad `anon` table grants, 8 anon-executable `SECURITY DEFINER` RPCs (all auth-guarded), and 46 authenticated ones. Also `alter default privileges … revoke execute on functions from anon, authenticated, public`.
- Finally retire `claim_us_role` (drop) once no migration or test depends on its definition.

### Migration-ledger drift (pre-existing, not F1A)

Local and remote versions diverge for history before 2026-09-01 and around 09-23/09-24 and 10-01/10-02: migrations were applied under different timestamps. `supabase db push` is therefore unsafe on this project until a dedicated ledger-reconciliation task is done. F1A recorded only its own version.
