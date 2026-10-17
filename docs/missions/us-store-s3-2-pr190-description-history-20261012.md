# PR #190 — descrizione precedente (fasi S3.2/S3.3, 11–12 ottobre 2026)

Copia integrale della descrizione della PR prima dell'implementazione v1 del 13 ottobre, conservata come storia.

---

## US Store S3.2 — Policy A, export-first and non-destructive migration preflight

**DRAFT / STAGING-ONLY PROTOTYPE / NOT DEPLOYED.** This PR is based on main and contains **no executed SQL, Auth account deletion, Edge deployment, public release or production change**. S3.1 #189 and native push #187 remain separate gates.

### Formal product decision: A APPROVED, privacy caveats open
When one member leaves, the remaining partner may retain **eligible** shared memories and history subject to explicit rights/consent/privacy review. The exiting member's strictly personal information, location, credentials and device tokens must be deleted/restricted under an independently reviewed procedure. Distinct operations: logout, unpair, delete individual account, erase entire couple. Unilateral account deletion must not erase partner's history. Sensitive/disputed/unreviewed media is blocked pending review.

### Observed migration risks (STAGING read-only)
- `auth.users`: 7 CASCADE foreign keys + 2 SET NULL.
- `profiles`: 24 CASCADE, 3 SET NULL, 1 NO ACTION.
- `couples`: 41 CASCADE.
- Naive user deletion can remove sender/recipient messages, memories, calendar events and shared content of partner. Naively converting FK to SET NULL fails where columns/triggers/RLS require an author.
- Private `us-media` bucket, RLS scoped to couple/owner folders; no actual GET/PUT end-to-end authorized Storage tests yet.
- Read-only SQL preflight in `docs/missions/us-store-s3-2-foreign-key-preflight-20261012.sql`.

### Implemented safely in this PR
- `s3-2-preservation-a-preview.cjs`: pure **non-executable** product policy A classifier; malformed, foreign tenant and disputed/sensitive inputs fail closed.
- `supabase/functions/_shared/s3-2-export-core.mjs`: strict whitelist serializer for **partial owner-authored personal-data export** across 13 domains; independently validates owner/couple identity and every row; excludes partner-authored content, media paths/bytes, raw tokens, precise location and unreviewed domains; reject rather than silently truncate (500-row/domain + 1 MiB caps).
- `supabase/functions/export-my-data/index.ts`: **un-deployed STAGING-only, default disabled** GET Edge prototype. Hard locked to US-STAGING Supabase host, `US_S32_EXPORT_ENABLED=true` gate, origin allowlist, caller's bearer token / publishable key with actual RLS, identity/membership recheck, no service_role fallback, no-store headers, no mutation or privacy logs.
- Data lifecycle/retention/migration docs: `docs/missions/us-store-s3-2-lifecycle-risk-gates-20261012.md`, `docs/missions/us-store-s3-2-export-migration-plan-20261012.md`, machine contract `docs/missions/us-store-s3-2-lifecycle-contract-20261012.json`.
- CI `.github/workflows/s3-2-lifecycle-design.yml`: Node unit tests and direct Deno type-check of Supabase Edge prototype; deletion-locked contract and read-only preflight SQL asserts.
- Live US-STAGING SQL role smoke: **13/13 selected export dataset queries** compile with `authenticated` context and `LIMIT 0`, validating columns/SELECT grants without retrieving personal data. Separate 2-couple authenticated role probes showed 0 foreign profiles, calendars, moments, shared messages; all synthetic inserted fixtures rolled back.

### Verified
**CI [run #38186983462](https://github.com/LetHerCome/US/actions/runs/38186983462) PASS, 25/25 Node tests and Deno type-check.** No user files, passwords, bearer tokens or personal data added to repo.

### Still release-blocking
This prototype is **not** complete data portability, does not deliver binary media, and must NOT appear in-app as full export. Before STAGING activation/deletion: reviewed content rights and retention periods, actual JWT+Storage HTTP negative tests, pagination/async large export, rate limits, database FK/trigger/RLS migration with synthetic QA couples, signed media export and physical byte cleanup, explicit session/push/widget purge, Google Play deletion webpage and independent privacy/legal review. **No production merge/deploy without explicit approval**. Issue #183 remains OPEN.
### S3.2 execution pass #2 — safe pagination & exhaustive FK inventory (2026-10-12)
- Export endpoint now traverses **50-row keyset pages** by a verified unique PostgreSQL UUID key on each of the 13 domains (`id`, except `notification_preferences.user_id`). Rejects repeated/unordered cursors, transport errors and a 501st result; hard fail before returning an incomplete export. Limit is **500 rows per domain / 1 MiB response**, still **partial** and un-deployed. Concurrent cross-table edits are not a consistent snapshot and remain a documented blocker for complete exports.
- Read-only `pg_constraint` inspection produced `docs/missions/us-store-s3-2-fk-coverage-20261012.json`: **all 78 FK constraints**, 9 referencing `auth.users`, 28 `profiles`, 41 `couples`. Each is `approvedResolution: null`, `implemented: false`, with a fail-closed gate. Critical message sender/recipient, moments/photos, shared calendar and `NO ACTION` completion references explicitly asserted.
- Independently verified all **13 sort columns have UNIQUE/PRIMARY KEY indexes** in STAGING. No user content exported or modified during inspection.
- CI **[run #38189735116](https://github.com/LetHerCome/US/actions/runs/38189735116) PASS: 37/37 Node tests, Deno Edge type-check, read-only SQL/no-deletion checks**.
- Remains DRAFT and **NOT DEPLOYED**. No FK migration, data deletion, live export, production Auth change or Play release. Real JWT HTTP tests, Storage object transfer, snapshot semantics, quota policy, privacy/content rights and account/partner erasure implementation remain pending.

### Phase 1 safety rehearsal — actual schema, zero live modifications (2026-10-12)

- Added `tests/s3-2-account-exit-real-schema.test.js`, using the full repo PostgreSQL schema in disposable PGlite and **two synthetic pairs**. Tests show direct `auth.users` deletion would cascade shared Messages/Moments/calendar, while a completed shared event can instead block erasure due to its `NO ACTION` FK. Every destructive test is enclosed by **ROLLBACK** and asserts the pre-test database state is restored.
- Added a STAGING-only **un-deployed, read-only** `public.s32_preview_account_exit()` proposal in `docs/missions/us-store-s3-2-stage1-exit-preview-draft.sql`, deliberately **outside** deployed migrations. Returns only aggregate per-requesting-member risk counts (self sent/received messages, own Moments/photos/calendar, Daily answers, push-device count). No partner identifiers, content, photo paths, tokens, deletions, export writes or unpairing. Server derives actor from `auth.uid()`, validates confirmed membership, filters owner+couple, uses hardened SECURITY DEFINER and authenticated-only EXECUTE grant. It explicitly returns deletion flags **false**.
- Added `tests/s3-2-exit-impact-db.test.js`: authorization, tenant isolation, read-only function metadata and deny-by-default behavior against disposable cloned schema.
- **Green** [GitHub Actions #38243644809](https://github.com/LetHerCome/US/actions/runs/38243644809): **9/9 full-schema integration tests + 37/37 Node/contract tests**, Supabase Edge Deno type-check and no-deletion guard pass.
- No SQL migration/Edge deployed. Policy A rights, complete export/media rights, 78-FK migration, physical cleanup, real signed-JWT Storage tests, legal review and release gates **all remain open**. PR remains DRAFT and must not be merged without separate release approval.

### S3.2 Phase 2 — bounded message preservation vault, not deployable (2026-10-12)

- Added a **draft only**, NON-DEPLOYED SQL migration proposal in docs/missions/us-store-s3-2-preserved-message-vault-draft.sql. Separate retention table stores a canonical, participant-scoped *copy* of a specifically approved shared message without a FK to the departed actor. Existing `shared_messages` sender/recipient FKs remain unchanged; this is **not** a complete erasure migration.
- Requires a matching PRIVATE item-specific approval ledger entry, bound to source, couple, retaining member, review timestamp and future expiry. A random approval UUID is rejected. This does not constitute actual consent/rights approval: **the real legal/approval workflow is not implemented**, and the vault is never automatically populated.
- Row insert trigger verifies original message, same couple and party, overwrites forged body/title/kind/timestamp with canonical data, rejects update. Authenticated roles have SELECT-only access with forced RLS for **exact retaining profile + couple and non-expired retention**; anon/foreign couple/no-longer-member cannot read. Auth clients cannot write archive nor private review ledger. Expiry hides the record, but **physical deletion of expired bytes still requires a separate cleanup job**.
- Two-couple disposable PGlite test proves: approved mock message survives simulated source/Auth user cascade, only survivor can see it, and all account deletion is **ROLLED BACK**. Unreviewed messages are not archived. Invalid tenant, nonexistent source, forged receipt, mismatched review and improper permissions are rejected; failed approval+archive transaction is rolled back.
- CI [run #38245840905](https://github.com/LetHerCome/US/actions/runs/38245840905) **PASS: 18/18 full-schema PostgreSQL tests + 37/37 Node contracts = 55/55, Deno Edge check PASS**.
- Still required: independent rights/retention policy approval and trusted issuer; Messages UI integration, Memories/photos/calendar preservation, signed Storage and expired-byte cleanup, comprehensive 78-FK rewrite, full export/account deletion, real JWT negative tests and legal review. **No merge, live DDL, deployment, account deletion or production modification.**

### Phase 2.2 — Ricordi, Calendario, and private-media fail-closed inventory (2026-10-12)

**Added un-deployed code/docs on the draft branch:**
- `docs/missions/us-store-s3-2-preserved-moments-calendar-draft.sql`: new item-review-gated, **metadata-only** preservation vaults for a former author's eligible Moment and **shared** calendar entries, with a private approval ledger. Only a matching (source ID + couple + retaining member + type + review timestamp + expiry) review receipt can authorize copying; a SECURITY DEFINER trigger overwrites forged metadata with the canonical record, denies self/foreign archives, excludes personal appointments and exact calendar `location`. Forced RLS: only the current surviving member of the original couple can read, within a verified TTL; clients cannot create, edit, delete or approve.
- `s3-2-media-inventory.cjs`: pure **non-executable** per-Moment private Storage planner for the original, thumbnail and carousel photos (including surviving partner uploads). Validates US `<couple>/<uploader>/moment-albums/<id>/<file>` convention; denies foreign couple, spoofed uploader, duplicate paths/IDs, traversal, encoded paths, malformed inputs and oversized lists. **Does not transfer photo bytes, generate signed URLs, disclose private paths or execute Storage requests**. Every result remains `BLOCKED_STORAGE_AND_PRIVACY_REVIEW`.
- `tests/s3-2-preserved-moments-calendar-db.test.js` and `tests/s3-2-media-inventory.test.js`: two synthetic couples and local disposable PostgreSQL; reviewed metadata remains after a simulated author deletion in a ROLLBACK-only transaction; private events excluded, foreign rows invisible, media bytes/ref cleanup still not claimed. Audited plans return metadata/counters only.
- CI hard gates were extended to prevent the draft archive from modifying live Moments/Calendar FKs or including account deletion and to prevent media planner IO.
- **[GitHub Actions run #38248413995](https://github.com/LetHerCome/US/actions/runs/38248413995) PASS**: **25/25 disposable PostgreSQL** tests + **44/44 Node/policy** tests = **69/69**, Deno Edge check PASS.

**Important release hold:** local evidence only. No actual Storage files uploaded, read, copied or deleted; no verified storage integrity or migration of `moment_photos` foreign keys; no real rights-review service; no actual data deletion. Old Auth cascades remain unsafe. Do not merge/ship as account deletion or full export. Production and STAGING databases remain unchanged; PR remains DRAFT.

### Phase 2.3 — byte-integrity copy and atomic-failure rehearsal (2026-10-12)

- Added `s3-2-media-copy-rehearsal.cjs`, a **synthetic-in-memory-only** byte-copy implementation. It strictly accepts its own `SyntheticObjectStore`; it has **no Supabase API, network, signed link, service role, filesystem, storage removal or Auth capabilities**. Hypothetical reviews made by `makeSyntheticFixtureReview()` are deliberately marked **FOR QA ONLY, trivially forgeable and not legal/privacy authorization**.
- Uses the existing tenant/path/uploader inventory to validate each original Moment, thumbnail and partner-uploaded album photo; fake item-specific review must bind source-path SHA-256, source-byte SHA-256, retaining member and unexpired review. Verifies the actual synthetic bytes before copying to a dedicated retaining-member in-memory namespace, then independently verifies destination hashes. Source objects never deleted.
- Partner-owned original photos remain untouched and aren't duplicated. **Their original `moment_photos` database FK/reference would still be lost under naive profile/Moment deletion**; full partner-safe DB migration remains required.
- Copies staged on a separate in-memory map, committed only after EVERY asset passes; missing source, source mutation, invalid review, synthetic copy interruption, checksum corruption, cross-couple/forged owner, destination collision, expired receipt, oversize object fail closed **without any partial copy**. Idempotent retries only reuse byte-identical destinations.
- Returns counts and explicitly blocked release flags: `executable:false`, `uploadedToSupabase:false`, `sourceDeleted:false`, `databaseReferenceMigrationComplete:false`, `privacyRightsApprovedForRealUsers:false`; no user/couple identifiers, raw paths, media contents, URL or token returned. Automated CI forbids real Storage API calls/deletion.
- **[CI #38249616316](https://github.com/LetHerCome/US/actions/runs/38249616316) PASS:** **56/56 policy/Node** + **25/25 disposable PostgreSQL** = **81/81**, Deno type check also PASS.
- Design details and all real-world blockers documented in `docs/missions/us-store-s3-2-export-migration-plan-20261012.md` §8. Before any actual media migration: real independently authenticated JWT Storage GET/PUT negative access tests, audited server rights issuer and source ownership, streaming copy and checksum re-read, reference-safe FK/album migration, retention cleanup/Cache and signed-link revocation, legal review. **PR stays DRAFT; no actual STAGING/production media transfer or release authorization.**

### S3.3 access-matrix hardening / live test remains pending (2026-10-12)

- Existing draft branch already contained the **partner-photo-reference metadata vault**, eight isolated DB tests, and `scripts/s3-3-storage-jwt-readonly.cjs` for a **future** 4-principal/2-couple actual JWT + Storage GET-only test. Did not duplicate or deploy these.
- Fixed a concrete assurance problem: `runPlan(plan)` formerly only checked `checks.length===24`, which could allow an imported caller to replace or reorder test cases and report PASS without verifying the required negative accesses. It now **reconstructs and exactly compares all 24 canonical cases**, all four actor principals and paths, and confirmation before **any** external request; rejects tampered plans, enforces exactly **4 live Auth confirmations + 8 allowed + 16 denied**, and no longer treats HTTP 400 (potentially malformed request) as evidence of denied access.
- Added negative unit tests for forged allow flags, reordered cases, changed identities/paths, missing confirmation, malformed 400 responses; invalid plans cause **zero network requests**.
- **[GitHub Actions #38273508884](https://github.com/LetHerCome/US/actions/runs/38273508884) PASS: 63/63 Node/security and 33/33 disposable DB = 96/96; Deno Edge type check PASS.**
- **NOT a live JWT/Storage proof**. Actual run remains blocked pending **four separately authenticated STAGING test JWTs + four existing harmless QA Storage objects** in two separate couples. Do **not** paste bearer tokens into chat, GitHub comments, code or workflow logs. No synthetic objects have been created through this work, no live media copy/upload/delete, no production change.

### Phase 2.5 — private survivor-owned photo locator continuity (2026-10-12)

**Uninstalled draft only:** `docs/missions/us-store-s3-2-partner-photo-storage-ref-draft.sql` adds `private.s32_partner_photo_storage_refs`, referencing only the reviewed preserved photo vault, remaining member and couple. A private SECURITY DEFINER trigger verifies the archived photo, canonical original `moment_photos` record, couple/uploader and safe nested `us-media` path, and ignores any forged path/bucket/readiness supplied at insertion. No FK to the leaving account, original Moment or source photo, so the private locator survives their synthetic cascade, while it is deleted with the reviewed archive row.

- Access: **NO client/anonymous SELECT/INSERT/UPDATE/DELETE grants**; private schema, forced RLS, immutable locator, explicitly `BLOCKED_PENDING_REAL_STORAGE_AUTH_AND_BYTES`. It does not prove real file existence, enable photo retrieval, issue a signed URL, approve consent, rebind public UI or transfer bytes. Paths remain **private**, not in public preserved metadata.
- `tests/s3-2-partner-photo-storage-ref-db.test.js` verifies canonical-private location, invalid tenant/owner/path and traversal rejection, absence of grants, source account deletion **ROLLBACK-only**, survivor archive lifetime and separate-couple isolation. CI enforces draft cannot modify original live FKs or expose private fields.
- Current real STAGING `us-media` had **zero objects** at read-only inspection, so live JWT/GET/PUT authorization and remote byte-transfer proof remain **OPEN**, as do real rights reviewer, per-object checksum validation, safe reparenting, expiry physical deletion and full account lifecycle.
- **[CI #38274037542](https://github.com/LetHerCome/US/actions/runs/38274037542) PASS:** 63/63 Node security/policy checks + 39/39 disposable PGlite DB tests = **102/102**; Deno type-check PASS. No live Supabase changes, no copied or deleted real photo, no real account deletion. PR stays DRAFT.

### Phase 2.6 — combined four-vault account-exit rehearsal (2026-10-12)

Added `tests/s3-2-integrated-account-exit-db.test.js` to the existing isolated PGlite integration job. It installs all four current review-only SQL drafts **together** and exercises **two independent synthetic couples**. With hypothetical per-item reviews, the partner retains canonically copied shared message, Moment, shared Calendar and their own album-photo metadata/private Storage locator when the departing user's source rows cascade. **All destructive changes are wrapped in ROLLBACK.** Under the real reconstructed authenticated RLS role, only the surviving partner sees the archived metadata; departing and foreign-couple users see none, and private Storage paths are inaccessible to client roles.

A failure injected at the *last* foreign-couple photo review after staging the other domains rolls back the entire simulated preservation batch, including all tentative review receipts. The untouched other couple and the restored originals are independently asserted.

**[GitHub Actions #38288218616](https://github.com/LetHerCome/US/actions/runs/38288218616) PASS: 45/45 full-schema PGlite + 71/71 Node/security = 116/116**, with Deno Edge check green. Latest accompanying documentation in `docs/missions/us-store-s3-2-export-migration-plan-20261012.md` §9.

**This does not certify live deletion or media bytes.** Rechecked Supabase STAGING read-only: **three verified couples, six users, private `us-media` contains 0 objects**, so S3.3 four-JWT Storage GET proof remains **BLOCKED/NOT RUN**. Existing QA users are not silently assumed to be disposable. No STAGING/production data writes, migrations, media copies or account deletions. Real rights reviewer, ownership and byte checks, 78-FK migration, deletion state machine, retention cleanup and independent JWT authorization remain open. PR stays DRAFT.

### S3.3 — complete live STAGING Storage-policy drift assessment, still no JWT GET proof (2026-10-12)

- Independently read ALL `storage.objects` policies from live `dugmhngrfkuieeletatb`. Created `docs/missions/us-store-s3-3-storage-policy-baseline-20261012.json` containing only schema policy metadata, no user IDs, paths, private content or credentials.
- Added `scripts/s3-3-storage-policy-audit.cjs` with a **pinned exact-SQL** comparison for the four expected policies. Checks all policy names, operations, `{authenticated}` roles, bucket and couple scopes, uploader/owner checks, and detects an added permissive fifth policy or `OR true` appended to an existing policy. It is pure/offline; a changed policy requires a separate security review, not a silent test update.
- `tests/s3-3-storage-policy-audit.test.cjs` supplies malicious-policy negative fixtures; CI includes the tests. Expanded `docs/missions/us-store-s3-3-staging-readonly-preflight-20261012.sql` to report TOTAL policies, extras and role/mode drift; executed this query READ-ONLY on US-STAGING: **3 verified couples, 6 users, private bucket, 0 objects, 0 QA fixtures, 4/4 expected policies, 0 extra policies, 0 role/mode drift**.
- [GitHub Actions #38288781368](https://github.com/LetHerCome/US/actions/runs/38288781368) passed **77/77 security/Node tests + 45/45 isolated DB tests = 122/122**, Deno type-check PASS. Schema snapshot and static checks are NOT real HTTP/JWT authorization tests.
- Still a hard hold: **4 separately authorized disposable QA identities, 4 safe Storage fixtures, and the actual 4 Auth + 24 private Storage GET matrix**. Do not treat existing unclassified accounts as QA identities, request JWTs in chat, modify production, enable deletion, or merge this draft.

