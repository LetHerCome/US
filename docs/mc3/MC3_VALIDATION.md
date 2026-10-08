# MC3 validation candidate

Branch: `mission/us-mc3-onboarding-invites-v1`.
Mission starting HEAD: `71363367796f8ab28a6ec24b0703fc87bae6b20a`.
Runtime base: main `df7760b9b7519cfc148d064f2d01629ce8f763dc` (the starting branch differs only by its mission spec).
Build: `us-mc3-onboarding-invites-v1-20261008-1`.
The final local candidate SHA is delivered with the completion message; this report is part of that commit.

## Behavior and authority

`SIGNED_OUT` uses the existing password front door. A validated permanent session, a successful null profile read and `{member:false}` route to private create/join. Query/RPC failures and inconsistent profile/member/couple IDs route to a neutral retry/exit view. Single membership routes to waiting; paired membership alone enables the ordinary bootstrap, D5 identities, native widgets/notifications and partner-dependent hydration.

Fresh profile and `get_couple_membership` run in parallel after the native lock, each bounded to five seconds. This adds one parallel membership request to normal Couple A boot. Cached profiles still help durable session restoration but authorize neither membership nor private paint. Offline initial verification fails closed; an already verified live session keeps the ordinary foreground behavior. The old offline profile rescue was removed and cached Home media cannot paint for another viewer.

The controller consumes only the five deployed MC2 RPCs, with exact argument keys. No new client, profile/membership persistence, SQL, RLS, Auth configuration or server write path was added. Names/date/codes are validated without compatibility-name defaults; the relationship date is required and checked against Europe/Rome today.

Create/join reconcile profile and membership after success or ambiguous transport failure. Invite generation is never retried automatically. Its per-account mutation guard survives suspension/reverification until the actual transport settles, because a local timeout cannot cancel a committed transaction. A indefinitely pending mutation leaves writes disabled; **Esci** remains available. Codes are response-only active-view text/memory, cleared on refresh, dismissal, background, lock, logout and account change. Deliberate copy has a selectable fallback; no bearer URL/deep link, attributes, persistence, telemetry, widget or worker caching was added.

## Four-user/two-couple evidence

| Synthetic actor | Result |
| --- | --- |
| Couple A first/second members | Existing paired routes and D5 names preserved; no onboarding/invite action |
| B creator Mira | No profile → create with explicit date → waiting; generate/copy/refresh/revoke/replace tested |
| B partner Nico | Formatted code → paired B immediately, correct own/partner names |
| B creator after partner join | Manual refresh → soft normal bootstrap, no forced logout |
| B compatibility slots | Browser fixture intentionally reverses creator/partner slots; identity stays ID/couple-based |
| Actual MC2 SQL | Controller uses committed migration in PGlite; exactly four profiles across A/B and RLS reads return only own couple |
| Anonymous/unconfirmed/banned | Actual SQL rejects mutation; controller shows neutral ineligible message |

The actual SQL tests also cover all invalid/expired/revoked/consumed/rotated codes, idempotent create/join, auth grants, tenant isolation and no direct membership writes. Real PostgreSQL row-lock races ran in a disposable PostgreSQL 18 instance under WSL, with no remote connection.

## Verification

Dedicated controller: 9 passed, no skips. Controller against actual MC2 SQL: 1 passed, no skips. Dedicated browser: 7 passed, no skips. Broader focused MC1/MC2/D5/auth/lock/widget/worker suite: 153 passed and 11 Windows-only PostgreSQL race skips; the same 11 race tests were executed separately in WSL with **11 passed, 0 skipped**.

Browser gates for MC3/D5, native lock and installed PWA: 17 passed, no skips; the subsequently extended dedicated MC3 suite has 7 passed. The separately executed native notification suite has 6 passing cases and the inherited N3 cold-process registration timeout. That exact test fails on archived untouched main at the same line 250; it is not represented as passing.

Worker checks cover coherent HTML/version/cache markers, both new critical assets, atomic installation failure with old shell retained, prior-worker upgrade, redirected document repair, offline reload/recovery, private media cache preservation, push display/click and logout cleanup. Cloudflare and Capacitor packaging include the module/styles. No approved assets changed.

Real Chromium views: 320×568, 390×844, 844×390; baseline Home plus create/choice/waiting captures, action scrolling and a 320px-tall keyboard viewport, focus/disabled controls, reduced motion, XSS text handling, simultaneous password-login/Auth callback, stale account response, offline cached-profile rescue, lock/code purge and late Home image are verified. Physical keyboard/biometric/native cover still requires device QA.

Read-only independent review found two important races (mutation guard released on resume; pending Home image crossing account boundary). Both have reproductions, fixes, passing tests and a follow-up review with no remaining Critical/Important findings.

Artifacts/logs and viewport captures are outside the repository in the task visualization directory. Full suite comparison and build results follow below.

## Remaining rollout gates

Controlled administrative provisioning of two confirmed permanent beta accounts; separately authorized D5 Edge sender rollout; physical four-account PWA/Android/device QA. Existing dependency advisories and inherited suite failures remain outside this mission. See `CONTROLLED_BETA_HANDOFF.md`.

GitHub push, PR, merge, Cloudflare deployment, production Supabase/SQL/RLS/Auth changes, Edge deployment and real provisioning: **none**.

## Complete suite comparison

Untouched main runtime: **1656 total, 1532 passed, 30 failed, 94 skipped** (`npm test`, exit 1). Final candidate: **1673 total, 1542 passed, 30 failed, 101 skipped** (`npm test -- --test-concurrency=4`, exit 1). The seven additional skips are the dedicated browser cases executed separately with 7/7 passed. The existing 11 real-PostgreSQL skips were executed in WSL with 11/11 passed. No new or removed failed test names.

The first unrestricted concurrent run exhausted an asset-test buffer while browser/DB gates were also running. Its three new Home VM harness failures were corrected by supplying viewer/epoch fixtures; the branding test passes independently. The final complete run bounds concurrency to four without narrowing test coverage.

Exact inherited failures:

- F2A.1 cutoff: MIGRATION_CUTOFF.json is current and accounts for every file and ledger row
- F2A.2 guard: supabase/migrations holds only the baseline and newer; history can never run
- F2C migration: created by the CLI after the baseline, the only forward migration
- foreground ripara Home avatar e Ricordi senza richiedere un nuovo login
- ricordi: creation wires the marker from the inserted id; CSS animates only .ricordi-new
- M12B.5 story: a Moment that is the photo of a lived source says so; an Event without photo is a read-only record
- M12B.5 media and icons: signed URLs only, private media cache untouched, Phosphor icons already in the shell
- M7B runtime: hydrateNoiIdeas è collegato alla navigazione verso Noi senza toccare la logica del Calendario
- N2 migration: forward-only, after every earlier migration, fails closed
- contract: every catalogue entry builds a valid, URL-free, allow-listed notification
- contract: the Web Push wire format keeps exactly the keys the service worker reads
- dispatch: one logical event reaches Web Push AND native devices under ONE claim
- dispatch: a native-only recipient is reached; Web Push never consumes the event first
- dispatch: rows of another couple are skipped
- dispatch: invalid tokens are removed, transient and config failures keep the token
- dispatch: a thrown transport error is transient, never deletes
- dispatch: missing configuration fails safely without consuming the event
- dispatch: a failed recipient query releases the claim
- dispatch: Web Push 404/410 prunes the subscription exactly as before
- transport config: missing or malformed secrets leave the provider not ready
- transport FCM: signed RS256 assertion, HTTP v1 message, channel and data contract
- transport APNs: ES256 provider token, sandbox vs production host, headers, category
- transport: provider errors are classified (invalid token / transient / config / rejected)
- N2 Android: official plugin + local support plugin synced, channels match the server contract
- N2 iOS: APNs forwarding, Push entitlement, Ricambia category, environment detection
- N2 payload contract: only allow-listed targets, UUID refs, no URL ever navigates
- Home cleanup runtime is present in Cloudflare/native builds and in the atomic PWA shell
- Settings: TU holds what is the actor's or this phone's, VOI what the couple shares
- Settings: every control exists exactly once and keeps its existing action
- perf 1.0: Settings pre-fills after Home settles, but hydrates at once when it is the launch page

## Builds and final checks

Cloudflare Pages: **PASS**, 157 files. Capacitor web: **PASS**, 153 files; staged bundle hash `f00f4bfbe380812761fca40e908eb7657bff73542d0c4752a9e04e6c045aaac4`. JS syntax and `git diff --check`: PASS. All new runtime assets are in both curated bundles and atomic APP_SHELL. SQL/RLS/Auth configuration unchanged; approved assets unchanged; secret/URL/cache checks found no persisted bearer token or new production credential.

## Candidate files

- `app.js`
- `auth-first-run.js`
- `docs/mc3/CONTROLLED_BETA_HANDOFF.md`
- `docs/mc3/MC3_VALIDATION.md`
- `docs/superpowers/plans/2026-10-08-mc3-onboarding-invites.md`
- `fastboot2.js`
- `fix4.js`
- `index.html`
- `manifest.webmanifest`
- `onboarding.css`
- `onboarding.js`
- `scripts/build-capacitor-web.mjs`
- `scripts/build-cloudflare-pages.mjs`
- `service-worker.js`
- `tests/f1a-auth-shutdown.test.js`
- `tests/helpers/oggi-browser.js`
- `tests/m3-home-navigation.test.js`
- `tests/m5c1-photo-motion.test.js`
- `tests/m7b-da-vivere-ui.test.js`
- `tests/mc3-browser.test.js`
- `tests/mc3-db-controller.test.js`
- `tests/mc3-onboarding.test.js`
- `tests/native-performance-ux-v1.test.js`
- `tests/native-security-v1.test.js`
- `tests/service-worker-static-runtime.test.js`
- `version.json`
