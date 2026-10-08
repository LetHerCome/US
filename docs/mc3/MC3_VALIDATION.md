# MC3 validation candidate

## Final security and main integration — 2026-10-09

This is the current delivery section; older reports below describe earlier candidates. Starting MC3 HEAD: `83c4b40346acb921e0fefcddae99378208fdd7a1`. `git fetch origin` completed. Integrated main: `28e4461` through a normal two-parent merge into the MC3 line, never a merge into main. Destination remains `mission/us-mc3-onboarding-invites-v1`; the implementation worktree uses `codex/mc3-push-security-fix` because the destination is checked out elsewhere. Delivery SHA is reported after commit/push.

### Web Push concurrency

Five deferred-Promise tests execute the actual enable/disable/sync/invalidation functions. The initial four failed on the starting runtime: B activation joined a queued cleanup that in turn joined B's newly published operation, and A activation did not terminate while permissions, getSubscription or registration RPC stayed pending. The added fifth case covers a pending subscribe call and B activation before its late result.

Activation now joins prior cleanup before publishing its operation. Cleanup captures the preceding operation when it is queued instead of looking up a future operation at execution time. Each activation has an identity cancellation scope, invalidated synchronously on account change, with bounded waits. Active sync never joins cleanup that can depend on itself. Late subscription results are quarantined for the original owner and unsubscribed; B cannot start another activation while an older subscription request is physically unresolved. RPC requests cannot be cancelled by a local Promise race: their late results remain subject to existing identity/epoch guards, and remote owner-bound cleanup remains best effort. Permission prompts are browser-owned and cannot be forcibly dismissed; the app operation and busy state terminate independently.

### Native reuse versus delivery — beta gate remains open

The Android/iOS boundary tests model a valid A server registration independently of the client and fail both server revocation and provider unregister. They prove two different facts: B cannot register that token, yet the retained A row plus a still-valid provider can continue delivering A notifications. This is a counterexample to complete isolation, not live FCM/APNs evidence. The prior implementation also called native register before checking the retired token. The tests reproduced that extra provider activation; requestToken now refuses provider registration while another account (or an ownerless legacy entry) has an unresolved retirement. B therefore does not reactivate APNs/FCM merely to discover a blocked token.

The installed official PushNotifications plugin is `8.1.3`. Its Android unregister calls `setAutoInitEnabled(false)` and `deleteToken()` then immediately resolves the bridge call, without awaiting the deleteToken task. iOS calls `UIApplication.shared.unregisterForRemoteNotifications()`. Our stopNativeDelivery catches plugin errors/timeouts. Neither a JS resolved call, a cleared badge/tray, a rotated installation nor a B registration refusal proves all A delivery stopped. Already queued/delivered notifications and a failed provider unregister remain relevant. See [FCM token management](https://firebase.google.com/docs/cloud-messaging/manage-tokens) and [Apple unregisterForRemoteNotifications](https://developer.apple.com/documentation/uikit/uiapplication/unregisterforremotenotifications()). Provider invalidation/pruning is not assumed immediate or sufficient without evidence.

**Shared-device native beta is NOT cleared for complete notification isolation.** Before that beta gate can close, independently prove server removal under A's credentials or confirmed provider invalidation, then prove no A private alert/body or action reaches a device being used as B. Physical Android/FCM and iOS/APNs QA must include failed/offline remote revoke, failed/late local unregister, network restoration after logout, stable APNs token, foreground/background/terminated processes, queued alerts and cold restart. If A credentials are no longer available, the existing owner-only RPC cannot remove A using B. The current task makes no backend/SQL/RLS/credential change; any stronger server/provider revocation mechanism needs a separate authorized change. See the updated controlled-beta handoff.

### Merge resolution and retained main work

Five conflict files: `index.html`, `manifest.webmanifest`, `service-worker.js`, `version.json`, `tests/native-performance-ux-v1.test.js`. In HTML, kept main's current resource blocks and restored the MC3 onboarding stylesheet; the onboarding DOM and pre-app script survived the merge. Manifest and worker conflicts were build markers. Kept main's version-independent marker test. Ran the existing build-ID script to generate **`us-mc3-integrated-20261009-1`** across HTML resource URLs, manifest, version and worker/cache ID.

Both build allowlists and atomic APP_SHELL contain onboarding plus top chrome, centered modal and both Ricordi carousel resources. Main's Sintonia/rewards, Gioca spacing, Settings organization, Ricordi inline feed, centered popups and native edge-to-edge files compare byte-identically with integrated origin/main; no old MC3 copy silently replaced them. Assets, Supabase source/config, package and lockfile are unchanged relative to main. Existing private media cache is preserved.

Main/MC3 Chromium comparison: 320×568, 390×844, 844×390; Home, Noi, Gioca, Settings, Ricordi; **30 screenshots, identical measured page geometry, no browser errors**. Contact sheets were visually inspected. MC3 browser cases additionally cover onboarding keyboard, reduced motion, invite/account transitions and original Couple A bootstrap. Physical native safe areas/system bars remain device QA.

### Final evidence

Focused MC3/Auth/logout/native-boundary/worker/main-UI contracts: **127 passed, 0 failed, 0 skipped**. MC3/native Chromium: **13 passed, 1 failed, 0 skipped**; all seven MC3 cases pass. Remaining N3 cold-process registration timeout at native browser line 251 is the inherited failure documented below. It remains unresolved and is not counted as passing.

Full updated-main and candidate suites were run in separate local checkouts with the same installed dependencies and concurrency of four. Updated main: **1676 total, 1544 passed, 38 failed, 94 skipped**, exit 1. Final candidate results and exact failure comparison follow below. The extra main-only P1 verification-artifact assertion is checkout/artifact dependent; no P1 product fix is claimed. No new candidate failed name is present versus updated main. PostgreSQL process/race tests without a local PostgreSQL server and unavailable default browser tests remain skips, not passes; selected browser gates were explicitly run in installed Chromium.

Cloudflare: **PASS, 162 files**. Capacitor: **PASS, 159 files**. JavaScript syntax and staged/working `git diff --check`: **PASS**. Logs, main archive, comparison JSON and screenshots are retained in this chat's `mc3-final` visualization directory. No deployment, PR, merge into main or Supabase operation was performed; delivery is new commits plus an ordinary fast-forward push to MC3.

### Final full-suite failure comparison

Final MC3: **1710 total, 1572 passed, 37 failed, 101 skipped**, exit 1. All 37 failed names below also fail on updated main; no added failed name. The five deferred concurrency cases, native delivery-boundary cases and integration asset contract pass. Exact inherited failures:

- F2A.1 cutoff: MIGRATION_CUTOFF.json is current and accounts for every file and ledger row
- F2A.2 guard: supabase/migrations holds only the baseline and newer; history can never run
- F2C migration: created by the CLI after the baseline, the only forward migration
- Home cleanup runtime is present in Cloudflare/native builds and in the atomic PWA shell
- M10.1D: Risonanza is progress accumulated inside US — never relationship quality
- M12B.5 media and icons: signed URLs only, private media cache untouched, Phosphor icons already in the shell
- M12B.5 story: a Moment that is the photo of a lived source says so; an Event without photo is a read-only record
- M12C: UI explains XP history, never relationship quality or a second score
- M7B runtime: hydrateNoiIdeas è collegato alla navigazione verso Noi senza toccare la logica del Calendario
- M9D/Progression V1: Sintonia explains only server-backed meaningful actions
- MainActivity resta vuota e nessuna credential entra nello snapshot
- N2 Android: official plugin + local support plugin synced, channels match the server contract
- N2 iOS: APNs forwarding, Push entitlement, Ricambia category, environment detection
- N2 migration: forward-only, after every earlier migration, fails closed
- N2 payload contract: only allow-listed targets, UUID refs, no URL ever navigates
- Settings: one "Maudit" switch row, device-local, correct accessible state, no explanatory copy
- Stories Left for You e album hanno recovery media esplicita
- SystemBars Capacitor 8.5 usa inset CSS e contenuto chiaro sul shell scuro
- contract: every catalogue entry builds a valid, URL-free, allow-listed notification
- contract: the Web Push wire format keeps exactly the keys the service worker reads
- dispatch: Web Push 404/410 prunes the subscription exactly as before
- dispatch: a failed recipient query releases the claim
- dispatch: a native-only recipient is reached; Web Push never consumes the event first
- dispatch: a thrown transport error is transient, never deletes
- dispatch: invalid tokens are removed, transient and config failures keep the token
- dispatch: missing configuration fails safely without consuming the event
- dispatch: one logical event reaches Web Push AND native devices under ONE claim
- dispatch: rows of another couple are skipped
- foreground ripara Home avatar e Ricordi senza richiedere un nuovo login
- i controlli delete restano espliciti e hanno target 44px
- perf 1.0: Settings pre-fills after Home settles, but hydrates at once when it is the launch page
- plugin: niente Supabase client o session token, storage privato non-backup, MainActivity invariata
- ricordi: creation wires the marker from the inserted id; CSS animates only .ricordi-new
- transport APNs: ES256 provider token, sandbox vs production host, headers, category
- transport FCM: signed RS256 assertion, HTTP v1 message, channel and data contract
- transport config: missing or malformed secrets leave the provider not ready
- transport: provider errors are classified (invalid token / transient / config / rejected)

## MC3 push security correction — 2026-10-08

This section reports NEW implementation after `db8963d3a69a4e526ad1432916427617249b2148`; the original mission report below remains historical. Destination: `mission/us-mc3-onboarding-invites-v1`. Implementation checkout: `codex/mc3-push-security-fix` (the destination branch is checked out in another worktree). The new commit SHA is provided in the delivery message.

MC3 logout now starts device revocation before invalidating private state. Native revocation snapshots and retires its installation synchronously before awaiting Web Push, and logout waits for cleanup before Auth signOut. Account-change invalidation is a separate local cleanup path: it does not attempt to revoke A using B credentials or run Auth RPCs synchronously inside onAuthStateChange.

Web Push persists unresolved endpoints with their owner, unsubscribes locally even when remote revocation fails, retries on the owner's next UI refresh/registration, and rejects quarantined endpoints for B. Native retirement now stores installation/owner/provider-token metadata without dropping older unresolved retirements. Cleanup retries only with the original authenticated owner, rotates installation IDs, clears per-account enable/sync state, and blocks any unresolved old token (including a stable APNs token) from registration. Legacy UUID-only retirements without provable ownership stay quarantined. No Auth credentials or administrative keys are persisted by these additions.

Identity/generation checks reject obsolete enable, token, registration and authReady work. Cleanup waits for outstanding native registration; if that request is still unresolved after its deadline, its retirement remains blocked. UI refresh releases push operations before joining cleanup to avoid a logout/enable dependency cycle. Delivered native notifications and badges are cleared during local account cleanup.

New regression file: `tests/mc3-push-lifecycle.test.js` (9 cases). First three reproductions failed on the untouched starting runtime before implementation. Coverage includes logout order, native A→B identity rotation, offline owner-only retry, cold-process retirement, obsolete authReady, late provider callbacks, Web Push remote failure, local-only account cleanup and unsubscribe failure. Existing logout/native test harnesses now exercise the new owner-bound retirement format.

Final focused gate: **61 passed, 0 failed, 0 skipped** (new lifecycle, existing logout, MC3 controller, MC3 actual local SQL, boot/auth, Auth shutdown and Service Worker runtime). The worker gate includes push display and notificationclick. Full `npm test -- --test-concurrency=4`: **1682 total, 1551 passed, 30 failed, 101 skipped**, exit 1; the exact 30 failed names match the inherited list below. Full testing used existing local dependencies with an authorized execution outside the restricted sandbox; an earlier restricted run produced packaging access failures and is not the final result.

Chromium MC3/native gate: **13 passed, 1 failed, 0 skipped**; all seven MC3 cases pass, including original Couple A bootstrap, four users/two couples, account switching, simultaneous login/Auth callback and late Home images. The remaining N3 cold-process registration timeout is the already documented inherited failure (now line 251); it is not claimed passing. Cloudflare Pages build: **PASS, 157 files**. `node --check app.js`, `node --check notifications.js`, `git diff --check`: **PASS**. Logs are retained outside the repository in this chat's visualization directory.

Known limits: B cannot delete A's server row with the existing owner-authorized RPCs. Offline retired rows stay queued until A authenticates again (or provider pruning removes them); B cannot activate an unresolved matching native token. Legacy ownerless retirements conservatively block registration. Physical FCM/APNs/device verification remains a rollout gate. No database, RLS, Supabase configuration, approved assets or worker/build markers changed.

Delivery scope: one NEW commit and ordinary fast-forward push to the MC3 destination branch. No PR, merge, deployment or production Supabase operations.

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
