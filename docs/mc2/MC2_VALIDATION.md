# MC2 validation evidence — 2026-10-08

Base: `4dcfa4580e0d43789325271291647e948ca21dd6`. Branch: `mission/us-mc2-couple-invites-v1`. Candidate identity: the commit containing this report (`git log origin/main..HEAD`).

| Run | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| Untouched origin/main | 1608 | 1498 | 30 | 80 |
| MC2 candidate | 1638 | 1517 | 30 | 91 |
| MC2 PostgreSQL races | 11 | 11 | 0 | 0 |

Full comparison command, identical Windows Node environment and lockfile dependencies: `npm test -- --test-concurrency=4`. The base is a fresh git archive of origin/main with its own installed dependencies; no repository code edits. Failure-name sets are identical: 0 added, 0 removed. An earlier unconstrained concurrent run had one additional existing-test ETIMEDOUT under CPU load; the complete controlled-concurrency base/head rerun above resolves it without changing that test.

Dedicated MC2 DB + isolation command: `node --test tests/mc2-couple-invites-db.test.js tests/mc2-tenant-isolation.test.js`: 19 PASS, 0 FAIL, 0 SKIP. Twelve grouped tests cover DB-01–25; seven cover tenant isolation/notifies, including retired RPC denial and DB-backed dispatcher exclusion with a same-couple delivery positive control. The final full head run also includes all these tests.

Real-race command in WSL Ubuntu: `MC2_RACE_REQUIRED=1 node --test tests/mc2-couple-invites-race.test.js`: 11 PASS, 0 FAIL, 0 SKIP on PostgreSQL 18.6. Full actual migrations are reconstructed on a disposable Unix-socket-only cluster. Both contender orderings, distinct-row same-slot unique defense, user retry, create/accept and expiry during creator-row wait are exercised. Windows full-suite skips include these 11 Linux-only tests; the required real execution above is separate and has zero skips.

Security/auth/native/ledger focus: `node --test tests/f1b-rpc-grant-hardening.test.js tests/sec-rls-hardening.test.js tests/multicouple-foundation-v1.test.js tests/native-boot-auth-safety.test.js tests/native-notifications-v1-db.test.js tests/f2a2-ledger-reconciliation.test.js`: 60 PASS, 2 pre-existing FAIL, 0 SKIP. Failures are the stale F2A.2 migration enumeration and N2 newest-migration assertion listed below. They already fail on the untouched baseline and were not relaxed.

Builds: `npm run build:cloudflare-pages` PASS (155 files); `npm run build:capacitor-web` PASS (151 files). No native runtime/project files changed. No signed APK/IPA generated.

Independent security review: expiry-after-lock and exact-target drift findings were reproduced RED, then corrected and proven GREEN. Original constraints/defaults, preserved policies/ACLs, grant options and conditional MAINTAIN are now validated. No existing historical tests or baseline objects were edited.

Diff/secret gate: staged `git diff --check` plus scoped key-pattern scan; see mission final ledger. No production access, PR, push, merge, deployment, remote migration or ledger repair.

## Unchanged baseline failures

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
