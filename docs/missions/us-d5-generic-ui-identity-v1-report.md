# D5 — Generic UI Identity V1: review candidate

Status: **D5_READY_FOR_REVIEW** (repository candidate; no production rollout).

Branch: `mission/us-d5-generic-ui-identity-v1`.
Base: `dfeb05a4dd04a283b7f1db275df15354a37b8829`; original mission-spec HEAD: `6edd374`.
Candidate HEAD is the local commit containing this report, reported in the delivery message.

## Implementation

- Pure `resolveUsIdentity` in app.js consumes viewer ID, couple ID and MC1 profiles. It rejects foreign rows and an absent viewer, resolves partner by ID within the couple, and maps compatibility slots to actual names. It never authorizes by name or metadata.
- Existing `UsCoupleContext` remains the tenant/profile authority. Scoped generation and profile/couple checks reject obsolete hydration; errors clear named state. Home painting does not wait for identity hydration.
- Generic signed-out title, login, ARIA, initial and widget fallbacks. Mounted Gioca, Daily/reveal/keepsakes, Noi/ideas, calendar and widget previews refresh from scoped presentation state. Same initials have stable numbered markers; shared calendar ownership says Noi.
- Logout/account changes reset rendered names, avatars, game panels/drafts, Daily state, secondary labels and snapshots. Late game, Think, avatar, Settings and profile reads have identity checks; native widget clear cannot erase a newly activated account. Cached native names are discarded until refreshed.
- Display-name HTML sinks retain escaping; DOM labels use textContent. Prediction outcomes use neutral Italian. Compatibility role values, persisted answer columns, RPC signatures, RLS, progression migration and approved assets remain intact.

## Scenario matrix

| Scenario | Evidence | Result |
|---|---|---|
| Couple A Francesco/Beatrice | Pure resolver, real app screenshots at three viewports | PASS: profile-derived identities preserved |
| Couple B Sam/Alex with reversed compatibility slots | Resolver and real browser account switch | PASS: actual names, no A names |
| Alex/Anna, equal initials | Resolver plus screenshots | PASS: A1/A2; actual names in accessible labels |
| Single member | Resolver | PASS: partner stays neutral |
| Logged out/auth pending/missing or foreign viewer | Resolver and mounted browser reset | PASS: Tu / La tua persona / Voi due |
| Late profile arrival, logout, in-place couple switch | Executed MC1 runtime tests | PASS: obsolete responses discarded |
| Offline/failed refresh | Executed MC1 runtime rejection test | PASS: cached names removed, no rejected bootstrap |
| App lock | Resolver and existing lock/boot safety tests | PASS locally; physical biometrics remain a device gate |
| HTML-injection name | Resolver and real browser text/DOM assertions | PASS: no execution |
| Mounted waiting Gioca, Daily, Settings avatars | Browser switch regression | PASS: old panel/data/alt names reset |
| Late Think reactions and native widget clear | Async regression tests | PASS: replacement state protected |
| Web Push, FCM, APNs | Synthetic same/foreign tenant and dedupe tests | PASS: real sender, neutral invalid-name fallback, one logical claim |

## Validation

- Focused command: `node --test tests/d5-identity.test.js tests/d5-push.test.js tests/m11b-game-v2-client.test.js tests/m11d-game-v2-push.test.js tests/m10-1c-calendar-ownership.test.js tests/m9b-daily-ritual.test.js tests/m9e-daily-question-client.test.js tests/m10-2-daily-reactions.test.js tests/widget-system.test.js tests/multicouple-foundation-v1.test.js tests/native-boot-auth-safety.test.js tests/logout-device-revocation.test.js`: **123/123 pass**, 0 fail, 0 skipped.
- D5 browser command: `node --test tests/d5-browser.test.js`, with the bundled Playwright and local Chromium executable: **3/3 pass**, zero page errors. All external network requests blocked; synthetic Supabase only.
- Visual before/after comparison: **320×568, 390×844, 844×390**, unchanged layout for A; verified B and equal-initial labels. Screenshots in the task visualization directory.
- Untouched main-base archive, independent local Git index and lockfile dependencies, `npm test`: **1638 tests, 1517 pass, 30 fail, 91 skipped**; exit 1.
- Candidate `npm test`: **1656 tests, 1532 pass, 30 fail, 94 skipped**; exit 1. **Exactly the same 30 named failures; no introduced failures.** Three new browser cases are skipped in the ordinary suite because Playwright is not a repository dependency; they were run separately above. Remaining skips are inherited.
- `npm run build:cloudflare-pages`: PASS, 155 files.
- `npm run build:capacitor-web`: PASS, 151 files (web payload for Capacitor, not a signed APK/IPA).
- `git diff --check`: PASS. Added-line private-key/secret/JWT-signature scan: no findings. No migration/SQL, credentials, package or approved-asset changes.
- Independent read-only review found game-panel, Daily, Settings-avatar and Think reset gaps. Fixed before delivery; game/Think failures reproduced before the fix and passed afterward. Widget cleanup concurrency also reproduced and fixed.

Initial runs without dependencies and the first archive comparison without its own Git index are diagnostic runs, not the comparison above. The final comparison has installed lockfile dependencies and a local index for tests using git ls-files.

## Source and tests changed

- `app-lock.js`
- `app.js`
- `calendar.js`
- `games.js`
- `home-cleanup.js`
- `index.html`
- `left-for-you.js`
- `settings.js`
- `stories.js`
- `supabase/functions/_shared/game-v2-push-core.mjs`
- `tests/gioca-tiles.test.js`
- `tests/helpers/m10-2-harness.js`
- `tests/m10-1a-daily-home-visibility.test.js`
- `tests/m10-1c-calendar-ownership.test.js`
- `tests/m10-2-daily-reactions.test.js`
- `tests/m10-attention-orbit.test.js`
- `tests/m11b-game-v2-client.test.js`
- `tests/m12a-game-ricordi-motion.test.js`
- `tests/m12a-location.test.js`
- `tests/m12b-4-daily-keepsake-client.test.js`
- `tests/m12b-5-rivivi-living-archive.test.js`
- `tests/m4-stories-interactions.test.js`
- `tests/m5f-unified-envelope.test.js`
- `tests/m6b-calendar-surface.test.js`
- `tests/m6c-week-view.test.js`
- `tests/m7d-da-vivere-lived.test.js`
- `tests/m9b-daily-ritual.test.js`
- `tests/m9e-daily-question-client.test.js`
- `tests/service-worker-static-runtime.test.js`
- `tests/us-home-cleanup-noi-board-daily-move.test.js`
- `tests/us-human-ui-02.test.js`
- `tests/us-vnext-m3-daily-question.test.js`
- `tests/widget-system.test.js`
- `tests/multicouple-foundation-v1.test.js`
- `widget-hub.js`
- `widgets.js`
- New: `tests/d5-identity.test.js`, `tests/d5-push.test.js`, `tests/d5-browser.test.js`, `tests/helpers/identity-fixture.js`.

Existing tests changed only where presentation contracts were superseded (neutral defaults, profile names instead of Bea, neutral outcomes, generic ARIA and calendar markers), or where isolated VM blocks need the real resolver fixture/event interface. No production test hooks added.

## Edge deployment impact and residual gates

The changed shared `game-v2-push-core.mjs` is imported by **game-v2-push** and **game-v2-push-worker**. Their authorized future Edge deployment is required for production Game V2 notifications to use real display names. This work did not deploy either function; current live notification behavior is unchanged. Dedupe keys, preferences, recipient slots and Web Push/FCM/APNs contracts were preserved.

Production Supabase, SQL, Auth/Storage data, deploy, PR, push and merge: **not touched**. Only local candidate commits are authorized by this implementation task.

Residual risks: the inherited full-suite failures below remain; signed Android candidate/physical PWA, installed native widgets and biometric-device smoke are still required before rollout/merge. No APK/IPA or live multi-couple beta was produced. npm ci reported six existing dependency advisories; dependencies were not upgraded in D5.

## Inherited full-suite failures

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
