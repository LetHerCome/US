# MC2 — Couple creation and invite backend

Base: `4dcfa4580e0d43789325271291647e948ca21dd6`.
Branch: `mission/us-mc2-couple-invites-v1`.
Specification: `docs/mc2/US_MC2_COUPLE_INVITES_BLUEPRINT_FINAL.md`, with the user's binding clarifications below.

## Binding clarifications

- Complete only the MC2 test harness with `auth.users.banned_until` and a minimal `auth.sessions` table; never change the historical platform stub.
- Migration states: exact legacy applies; exact complete target verifies and does nothing; partial/unknown aborts without repair.
- Lock order: read-only eligibility, user transaction advisory lock, existing actor row if present, invite row, membership checks, atomic mutation. An account without a profile has no actor row to lock.
- Public API: `create_couple(text,date,text default null)`, `create_partner_invite()`, `revoke_partner_invite()`, `accept_partner_invite(text,text)`, `get_couple_membership()`, all returning jsonb.
- ISO-04 amendment: `list_couple_questions()` remains retired. Assert client SQLSTATE `42501`, no foreign data, and successful smoke/isolation via supported active RPCs. Never restore its grant.
- D1–D4 unchanged. No production access/mutation, deploy, merge, db push, repair, UI work, legacy cleanup or role migration.

## Implementation plan

Tech stack: PL/pgSQL, PGlite, node:test, real PostgreSQL multi-session tests.

- [x] Task 1: MC2 harness and failing DB contract tests. Rebuild all real migrations; seed the production-shaped full Couple A and eligible/ineligible orphans. Prove missing APIs before implementation.
- [x] Task 2: CLI-created single migration. Validate legacy/target/unknown, implement account/name/token helpers and five APIs, revoke membership writes, verify catalog and preserved data. Run DB-01–25 including bad target variants and second rebuild.
- [x] Task 3: real race harness and RACE-01–06. Exercise both serializations of rotation/revoke, user retry and create/accept; observe lock waits rather than relying on timing.
- [x] Task 4: catalog-derived bidirectional private tenant isolation, Storage, RPC smoke and notification integration. Global catalogs remain shared; their rows are not private tenant state.
- [x] Task 5: regressions vs untouched baseline in the same environment; full tests, security/auth/native checks, web build, diff check, secret scan and independent review. Document evidence and commit the candidate without pushing.

Review focus: target drift must abort; anonymous metadata spoofing cannot bypass eligibility; transaction time cannot extend validity after a lock wait; creator deletion must not leave a zero-member successful join; legacy invite and Couple A data must remain unchanged.

## Evidence ledger

- Blueprint read and catalog references checked against origin/main. Three ambiguities resolved explicitly by the user.
- CLI 2.117.0 created `20261007201842_mc2_couple_invites.sql`.
- Supabase current functions/auth documentation and changelog checked on 2026-10-07. The pgcrypto breaking change concerns legacy PGP ciphers, not random bytes or SHA-256 used here.
- Initial environment: Windows, Node available; repository Linux PostgreSQL harness cannot run natively. WSL Ubuntu available; Docker daemon initially stopped.
- RED: primary create/invite/join test failed with missing function `42883` before SQL implementation. GREEN: primary flow and DB-01–25 passed after migration.
- Ruling: history-view positive control uses the owner JWT context, because this existing security-invoker view explicitly resolves `current_couple_id()` even as postgres. Numeric catalog OIDs use the oid overload rather than relation-name overload in privilege checks. Only the MC2 harness was corrected.
- Independent review found expiry-after-creator-lock and incomplete target catalog checks. RED tests reproduced both before fixes. Accept now rechecks the wall clock after membership locks and after insert (exceptions roll back atomically). Original PK/FK/defaults, membership SELECT/UPDATE policies, preserved couples ACLs, column grants and PG17+ MAINTAIN are verified; drift aborts without repair.
- Final real races: 11/11 PASS on disposable PostgreSQL 18.6 in WSL, including RACE-01–06, both rotation/revoke orderings, R6/R7 and expiry while waiting on the creator. Zero skips. Cluster starts with a Unix socket only and is removed afterwards.
- Dedicated DB + isolation/notifies: 19/19 PASS (12 grouped tests cover DB-01–25; isolation/notifies 7/7). Both fresh rebuild and pre-MC2 upgrade preserve Couple A original fields.
- Existing security/auth/native/ledger focused tests: 60 PASS, 2 baseline failures (stale migration enumeration/newest-migration assertions), zero skips. Historical tests and baseline were not edited.
- Web and Capacitor web builds PASS. No native project or runtime files changed; no signed native binary was produced by this backend-only mission.
- Final controlled full-suite comparison: base 1608 tests, 1498 PASS / 30 FAIL / 80 SKIP; candidate 1638 tests, 1517 PASS / the same 30 FAIL / 91 SKIP. No added or removed failures. The 11 extra Windows skips are the real-race tests executed separately in WSL with zero skips.
- Final staged diff check PASS; scoped credential-pattern scan found zero matches in all 15 candidate files. Protected implementation paths, baseline and historical migrations are unchanged.

Final status: **MC2_READY_FOR_REVIEW**. See `docs/mc2/MC2_VALIDATION.md` for counts and every baseline failure, and `docs/mc2/MC2_ROLLOUT.md` for the precise review checklist. Commit remains local; production/PR/merge were not touched.

## Schema, authority and threat invariants

- Extend existing `couple_invites` with `expires_at timestamptz NOT NULL`, nullable `revoked_at`, nullable `created_by` FK to profiles; backfill only the new expiry field of USED legacy rows. Add four validated CHECK constraints; preserve original unique indexes, PK and FKs.
- Implement four mutation APIs and one STABLE membership read API, all postgres-owned definer functions with an empty search path and explicit qualified names. Their EXECUTE ACL is authenticated-only. Five private invoker helpers are owner-only.
- Revoke client profile INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER, conditional MAINTAIN; preserve existing SELECT and UPDATE(avatar_path). Couples grant/policies and Storage are unchanged.
- I1–I7/T1–T14: immutable profile membership, structural two-slot limit, server-assigned tenant/slot, eligible permanent confirmed accounts only, no metadata authority, hashed non-enumerable bearer codes, atomic single-use joins, generic invite rejects, explicit ACL/RLS and consistent lock order. Cross-tenant reads and writes are tested in both directions using populated rows and actual client permissions.
- `get_couple_membership` returns `member:false` for ineligible/no-profile callers; it never exposes a code, hash or invite ID. Retry acceptance of the same consumed code returns `already_joined` only to its original joining user.

## Residual risks and review limits

- The 30 baseline failures remain out of scope; the exact same-name comparison and counts are in `docs/mc2/MC2_VALIDATION.md`.
- Windows lacks the native Linux race harness, so the Windows full suite reports those tests as skipped; the required MC2 races were independently executed with `MC2_RACE_REQUIRED=1` in WSL, zero skips.
- Live production was not re-read or mutated. Production schema can drift after the user's capture; the migration deliberately aborts on unexpected state. Native Notifications ledger drift is not repaired.
- Public signup remains disabled. Onboarding/UI names, role normalization, Realtime DELETE metadata follow-up and legacy Auth/Storage cleanup remain separate missions. This backend candidate does not make a real beta launch product-ready.
- Review candidate only. No production change, PR, push, merge or deploy. Candidate identity is the eventual branch commit; use `git log origin/main..HEAD` for its commit list.
