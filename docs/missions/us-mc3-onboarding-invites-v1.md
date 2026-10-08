# MC3 — Controlled Beta Onboarding + Partner Invites V1

**Status:** READY FOR IMPLEMENTATION — design/audit only, not implemented
**Base:** `main` @ `df7760b9b7519cfc148d064f2d01629ce8f763dc` (MC2 + D5 merged)
**Mission branch:** `mission/us-mc3-onboarding-invites-v1`
**Stack:** vanilla HTML/CSS/JS, Supabase Auth/PostgREST, existing Cloudflare PWA + Capacitor.
**Authority:** `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/mc2/US_MC2_COUPLE_INVITES_BLUEPRINT_FINAL.md`, the actual committed MC2 migration, `docs/missions/us-d5-generic-ui-identity-v1.md`.

## Goal

A person with a **manually provisioned, confirmed email/password account** and no `profiles` row can enter US, choose **"Crea il nostro US"** or **"Ho un codice d'invito"**, and either start a new couple or join a partner's existing couple. A creator with no partner can generate/share a one-time invite, see its expiration/revocation state, revoke/replace it, and wait for the partner. The partner joins, and both become normal US users without sharing data or identities with Couple A or other tenants.

**Important:** Public signup remains OFF. MC3 does not create new `auth.users` accounts; beta accounts are provisioned separately through a controlled administrative workflow. Do not add "Registrati", magic links, OTP, guest/anonymous login or client-side `auth.signUp()`.

## Facts verified from actual main and remote Supabase (2026-10-08, read-only)

- Remote project `iiakdfsxpywdkxravqjh`, MC2 migration ledger `20261007232641 mc2_couple_invites`, 1 couple, 2 profiles, 11 auth users.
- 5 MC2 RPCs are deployed and `EXECUTE` is granted to Postgres `authenticated`, denied to `anon`; MC2 account eligibility is enforced **in the database** (including existing anonymous-account sessions).
- `app.js` `initCloud()` currently treats an authenticated account lacking a profile as error and returns to `authLogin` with "Nessun profilo US valido associato a questo account." (around current lines 877–891). **This is the entry point MC3 changes; do NOT sign out that valid session.**
- `loginAccount()` signs in via `sb.auth.signInWithPassword` then calls `initCloud()`; `sb.auth.onAuthStateChange` can also schedule `initCloud`. Preserve single-flight and guard against duplicate/late identity results.
- Existing D5 presentation identity authority: `window.UsCoupleContext` / `window.UsIdentity`, `profiles.couple_id`, `profiles.display_name`. Do not add parallel tenant/membership storage.
- Existing `auth-first-run.js` install card belongs to login; `app-lock.js` gates private content before auth bootstrap. Preserve native/biometric gate behavior.
- `index.html` `#authOverlay` currently contains `#authLogin` and install card. `settings.js` and `index.html` Settings > Voi are existing UI surfaces. Cross-cutting modal patterns belong to `ui-foundation.*`; do not start a second design system.
- D5 shared `game-v2-push-core.mjs` source was merged but `game-v2-push` / `game-v2-push-worker` Edge functions are **not authorized for deploy in MC3**. Production notification naming rollout stays independent.
- Existing 30 full-suite failures are inherited. Compare exact failed test names versus untouched main; never claim `npm test` green if it exits 1.

## Backend contract — consume EXACT existing RPCs; do not alter SQL

| RPC | Request (`sb.rpc` args) | Success |
|---|---|---|
| `create_couple` | `{p_display_name: string, p_started_on: 'YYYY-MM-DD', p_couple_name?: string|null}` | `{status:'created'|'already_member',couple_id:string}` |
| `create_partner_invite` | no args | `{code:'XXXX-…',expires_at:string}` |
| `revoke_partner_invite` | no args | `{revoked:boolean}` |
| `accept_partner_invite` | `{p_code:string,p_display_name:string}` | `{status:'joined'|'already_joined',couple_id:string}` |
| `get_couple_membership` | no args | `{member:false}` OR `{member:true,couple_id:string,partner_joined:boolean,invite:{status:'none'|'pending'|'expired'|'revoked'|'used',expires_at:string|null}}` |

Additional client reads for names/date already authorized by RLS: `profiles` in viewer's own `couple_id`, `couples` for current ID. Never pass client-chosen `couple_id`, `role`, `user_id`, `used_by` or invite row IDs to an MC2 RPC. Never INSERT or UPDATE `profiles`, `couples`, `couple_invites` to perform membership.

**Exact backend errors**:
- SQLSTATE `42501`: `authentication_required`, `account_not_eligible`, `profile_state_unsupported`, other membership authorization denials;
- `22023`: `display_name_invalid`, `started_on_invalid`, `couple_name_invalid`;
- `P0001`: `invite_invalid`, `already_in_couple`, `couple_full`;
- transport/session failures: retry/fail-safe, do NOT perform local account-role fallbacks.
- `create_partner_invite` **rotates the code on EVERY invocation**. NO automatic retry and no duplicate parallel submission.
- `create_couple` and `accept_partner_invite` support idempotent return statuses; on ambiguous network failure, refetch membership before offering retry.
- `get_couple_membership` may report `member:false` for a session whose account fails server eligibility; mutating RPC will return account_not_eligible.

## UX state machine (one authoritative controller)

`SIGNED_OUT` → existing email/password login, no public registration.

`AUTHENTICATED_NO_PROFILE` → **private onboarding UI**, choice:
1. **Crea il nostro US**: fields display name (1–40 chars), relationship start date (required, 1900-01-01 to today Europe/Rome), optional couple name (default `US.`, max 40). Clear relationship-date explanation; NEVER use Couple A's database date default. Submit `create_couple`; handle `created`/`already_member`; refetch profile and membership.
2. **Ho un codice d'invito**: fields display name (1–40) and code (Crockford Base32, 26 chars after removing spaces/hyphens, O→0, I/L→1 handled by server). Paste-friendly/autocapitalize; never force a manual exact format. Submit `accept_partner_invite`; handle `joined`/`already_joined`; refetch profile and membership.

`MEMBER_WAITING_PARTNER` (`member:true,partner_joined:false`) → **waiting/invite screen**: gentle confirmation ("Il tuo spazio è pronto"), own display name if safely loaded, current invite `status` + expiration; "Crea invito"/"Genera nuovo codice" invokes `create_partner_invite`; show the new code on screen **only from that RPC response** with explicit "Copia codice" and optionally native share (user-initiated, no embedded deep link required). "Revoca codice" invokes `revoke_partner_invite`. After reload or reopen, `get_couple_membership` can show pending status/expiration but **never** the old raw code; explain that regenerating invalidates the prior code. Never show a fake/recovered raw code, never auto-rotate in response to refresh/offline/error. "Verifica accesso partner" refreshes membership; optionally a conservative visible-only check every 30s with session/tenant guard, paused in background and cleaned on logout.
- Creator of a single-member couple reaches waiting flow on next login too, **not** the "Nessun profilo" error.
- Preserve the default private app shell for fully paired members; when waiting, avoid mounting or revealing partner-dependent private views with inconsistent state. Do not add large blocking network work to Couple A's normal first paint; use appropriately scoped bootstrap state and explain any unavoidable added request in report.

`PAIRED` (`member:true,partner_joined:true`) → hide onboarding/waiting UI, bootstrap standard US app through the existing `initCloud` path, D5 identity hydrating and native/notification setup. No full forced logout. Reload is acceptable only with correct, persisted authenticated session and no loops; prefer guarded soft transition when feasible.

`ERROR_OR_INELIGIBLE` → keep session isolation, display a recoverable error + "Riprova" or "Esci" (real sign-out path, not secret-reset). If the account is not eligible show a neutral message; do not expose backend existence/other couple metadata.

**Avoid** conflating "profile unavailable because offline/RLS read failed" with "profile does not exist". On network errors fail safe with Retry; NEVER create/join due only to a failed profile SELECT. Distinguish `null` without an error (`maybeSingle`) from query error. `get_couple_membership` is the server-issued status authority; compare it with current profile if both exist, detect mismatches and halt safely.

## Required UI details

- Follow current US visuals, small screens (320×568; 390×844), PWA and Android native keyboard/safe-area, reduced motion, accessibility labels/status/live regions. Italian default. No forced design overhaul, no new frameworks, no unapproved visual assets/icons (Phosphor only).
- Onboarding must be usable by an **authenticated profile-less** account without revealing the ordinary app shell. An authenticated permanent beta account must not be required to sign out/in after RPC creates its profile.
- Neither UI HTML nor a client toast should print raw RPC error stacks or private info; map known error codes to human-readable text. `invite_invalid` must remain one generic message ("Codice non valido, scaduto o già utilizzato"), not an invite-existence oracle.
- Preserve login/reset/logout and `UsAppLock` gating; no authenticated content while app locked. Clear invite code and form data on logout/account switch/unmount; request-generation/epoch checks block stale async results.
- Invite code is **bearer secret**: never store in localStorage/sessionStorage/IndexedDB/native widget snapshot, analytics, URL/query/hash, logs, service worker cache, sentry/telemetry, HTML attributes after dismissal or device push. Only ephemeral memory/active view; `navigator.clipboard.writeText` on deliberate tap, with selectable text fallback. Explicit clipboard caution optional.
- Buttons block duplicate submissions; `create_partner_invite` must never auto-retry (every retry invalidates preceding code). Show expiry using backend `expires_at` and device-local formatted time without treating client clock as authority. `revoke` updates UI only after RPC confirmation.
- Existing Couple A login must **not** see onboarding, waiting UI or identity fallback regressions. A full couple cannot generate a new invite; if invited state accidentally shown server returns `couple_full`, handled gracefully.
- Add minimally discoverable entry to invite/waiting state if needed for a single-member couple; **do not** reorganize Settings V2/N3.7 in MC3.
- Account provisioning remains admin-side: document exact handoff to create **two confirmed non-anonymous email/password accounts** without placing passwords or privileged API keys in client or repository. No actual user creation in this mission.

## Technical strategy / explicit risk boundaries

1. Audit `initCloud`/auth listeners/login/lock and D5 clear/hydrate lifecycle before edits. Use a **single onboarding controller** with small testable pure routing function for session/profile/membership state. UI can be placed in `index.html` with dedicated CSS + JS, wired through `app.js`, or in a small standalone module loaded deterministically. No duplicate Supabase clients.
2. Avoid race with existing `sb.auth.onAuthStateChange` + `loginAccount` concurrent `initCloud`; protect all RPC reads and post-mutation callbacks by current authenticated `session.user.id`, current profile ID/couple ID and an epoch/generation. Never hydrate old Couple A content after B signs in. Preserve D5 `UsCoupleContext` reset, `UsIdentity` and native widget state.
3. Beware `initCloud`'s cached-profile fast path: do not let a cached profile from a prior account or a single-member couple improperly skip MC3 routing. Do not replace a server profile read failure with cached data for an unverified new account.
4. Respect existing service worker/browser cache rules; avoid caching invite codes, and ensure new JS/CSS assets enter Cloudflare/Capacitor builds. Bump app version/build ID only via the project's existing mechanism if required.
5. For `MEMBER_WAITING_PARTNER`, a single-member couple may not yet satisfy unrelated Game V2/progression constraints; do not silently fabricate a partner or initialize partner-dependent flows. Recheck membership on foreground/manual refresh.
6. Keep registration OFF in local config and remote prod. No migrations, DB direct writes, Supabase deploy, Edge deploy, secrets, user provisioning, domain switch, Vercel, Apple account changes or native security rewrite.
7. Edge Game V2 sender-name rollout remains a distinct authorized step; MC3 cannot ship to a *real* second couple until both backend and push code paths have been validated live with synthetic/controlled tests.

## Test matrix (must execute, no skips hidden as pass)

- **Baseline:** Couple A two permanent accounts can sign in/restore and reach Home quickly; D5 names and existing push/native boot remain normal.
- **New confirmed account:** profile absent → onboarding, no erroneous login-error message, no public sign-up.
- **Create flow:** valid fields, validation errors, `created` and `already_member`; idempotent after an ambiguous response; no duplicate couple/profile; exact RPC argument keys.
- **Join flow:** paste formatted/unformatted code, `joined`/`already_joined`; invalid/expired/revoked/consumed/foreign/full codes produce only generic wording, no leaked metadata.
- **Waiting:** generate + manual copy + revoke + generate again; second generation invalidates first; refresh shows pending status but NOT raw previous token; 48h expiry rendering; already full gives no invite action.
- **Transition:** creator waiting → partner joins in another simulated session → creator manual refresh/foreground → PAIRed + correct `UsIdentity`; partner joins and enters correct couple immediately; 4 synthetic users / 2 couples with reversed compatibility slots.
- **Security:** anonymous JWT with authenticated DB role cannot create/join; ban/unconfirmed errors neutral; no anonymous/signup/OTP/magic links; raw code never stored or logged; no client-generated couple_id/role; HTML injection in display name/token errors cannot render active HTML.
- **Auth lifecycle:** account A→B without reload, logout, app-lock cover, slow/suspended requests, offline app start, request failure, simultaneous login/auth callback, native widget/session state cannot retain A's data or invite code.
- **Navigation/a11y:** 320×568, 390×844, 844×390, Android keyboard safe-area, focus management and disabled buttons; no layout break/cover stuck.
- **Regression:** D5, MC1/MC2 client contracts, standard login, native authentication/security/widgets, full `npm test` with exact failures vs untouched main, `npm run build:cloudflare-pages`, `npm run build:capacitor-web`, `git diff --check`, secret/URL/cache scan.
- Use **synthetic/local** Supabase mock/fixtures and PGlite/local Postgres as needed. DO NOT create real accounts/couples/invites in remote Supabase for tests.

## Completion gate

Return only `MC3_READY_FOR_REVIEW` after code, focused tests and builds actually pass, with:
- branch and base/HEAD SHA, clean worktree, changed file list;
- detailed UX state transition/result and four-user/two-couple test matrix;
- dedicated tests and browser tests counts (distinguish skipped);
- complete suite exact failed-test comparison against untouched main;
- web/Capacitor build results; mobile regression notes;
- remaining blocker: controlled provisioning of two beta accounts, D5 Edge deploy, physical four-account/device QA;
- whether GitHub push, PR, merge, production, Supabase, Edge were touched.

**Scope stop:** no push, PR, merge, deploy or live Supabase changes without separate authorization. If an existing RPC cannot deliver the contract, report exact error and stop instead of inventing SQL/API. No need to involve Opus unless architectural incompatibility is demonstrated.
