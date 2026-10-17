# US Store S3.2 / Phase 2.4 — surviving partner's album-photo reference continuity
Date: 2026-10-12. **DRAFT / DISPOSABLE PostgreSQL ONLY / NOT DEPLOYED / account deletion remains BLOCKED**.

## Confirmed data-loss case
The current FK graph contains:
- `moments.created_by -> profiles.id ON DELETE CASCADE`.
- `moment_photos.moment_id -> moments.id ON DELETE CASCADE`.
- `moment_photos.created_by -> profiles.id ON DELETE CASCADE`.

Thus deleting a departing Moment author removes that Moment and **also its child photo rows owned/uploaded by the surviving partner**. A still-existing Storage object is *not* a preserved app reference. Reassigning `created_by` would falsify provenance. No account should be deleted directly.

## Safe experimental step in draft PR #190
`docs/missions/us-store-s3-2-partner-photo-reference-vault-draft.sql` builds an intentionally **metadata-only** archive, after the existing reviewed Moments archive, exclusively for photo rows satisfying all conditions:
- Original parent Moment was authored by another user in the *same* couple and has already been individually reviewed/preserved in `s32_preserved_moments`.
- The photo's actual `created_by` equals the surviving partner; only their own uploads qualify.
- A separate **photo-specific** hypothetical private approval receipt matches exact photo, Moment, couple, retaining member, review timestamp and expiry.
- Canonical caption, position and creation time are taken from the original row under row locks; forged metadata is overwritten.
- There are no FK references to the deleted author, original Moment or original photo. The remaining partner/couple are protected with forced RLS and a TTL.
- No `storage_path`, link, media byte or former author identity is exposed from the vault. Media state remains `BLOCKED_PENDING_RIGHTS_STORAGE_AND_PARENT_REBIND`.
- There is no INSERT/UPDATE/DELETE privilege for ordinary clients, nor client access to private receipts. The private validator is not an exposed RPC.

This is **not the final app's photo table**, nor a live FK rewrite, and it **cannot display or restore a photo**. It proves that partner-owned *descriptive references* can survive a simulated cascade without misattributing ownership. The test receipt is not valid legal consent or server authorization.

## Test evidence
`tests/s3-2-partner-photo-reference-db.test.js` rebuilds the full schema in disposable PGlite and seeds two independent synthetic couples. It covers initial fail-closed behavior, canonical metadata, source cascades inside ROLLBACK, unaffected foreign couple, missing parent approval, illegal ownership, foreign-tenant injection, forged receipt, duplicate archive, immutable rows, lack of client grants, survivor-only forced RLS and no FK to deleted source. Every simulated destructive operation is rolled back. Runs in `.github/workflows/s3-2-lifecycle-design.yml` alongside prior gates.

## Remaining blockers to actual protection
1. Real signed-JWT same-couple/cross-couple read-only Storage matrix still **NOT RUN** (S3.3); four genuinely authenticated staging QA users and synthetic assets required.
2. A trusted private rights issuer with per-item consent/dispute handling and independently reviewed retention policy.
3. Real media byte and checksum transfer for eligible departing-owned originals/thumbnails; permission denial tests, idempotent remote state/recovery, signed URLs and cache retirement.
4. **A reviewed, transactional app-visible parent/photo reference migration**. A metadata archive alone is insufficient. It must explicitly maintain the surviving partner's original media file and attribution, without leaking it after separation.
5. A complete 78-FK account exit plan, full export, token/session/widget cleanup, physical byte expiry cleanup, legal/privacy/security review, signed Android QA and release approval.

**No live DDL/SQL/Auth mutation, Storage read/write/delete, deployment, PR merge, or release is authorized by this prototype.**
