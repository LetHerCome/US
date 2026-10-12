# US Store S3.3 — authenticated private Storage READ-ONLY test gate (2026-10-12)

**Status: code committed for review; REAL SUPABASE GATE NOT RUN / NOT PASS.** Companion to draft PR #190 and issue #183.

## Purpose

Before any actual media transfer, prove the existing `us-media` **private** bucket enforces separation between **two distinct synthetic couples** when accessed with **four real independently authenticated Supabase Auth JWTs** in **US-STAGING**. This proof is mandatory but not sufficient to authorize account deletion.

Implementation: `scripts/s3-3-storage-jwt-readonly.cjs`. Unit tests: `tests/s3-3-storage-jwt-readonly.test.cjs`.

## Prerequisites (do NOT create implicitly)

- Four **existing, explicitly authorized synthetic** US-STAGING Auth users A1/A2 (couple A) and B1/B2 (couple B), all with separate valid JWTs. No actual user accounts.
- Four existing, **known synthetic, nonsensitive**, nonempty private Storage files, uploaded by the corresponding identity under `<couple_uuid>/<uploader_uuid>/moment-albums/<moment_uuid>/s33-qa-<fixture>.webp` (also `.png`/`.jpg` accepted). The filename prefix and exact five-segment path are mandatory to avoid accidentally reading actual user media. The harness neither creates nor mutates files.
- A **modern** US-STAGING publishable API key beginning with `sb_publishable_`. The project has an enabled modern publishable key. The harness **rejects both modern secret keys and legacy JWT-shaped anon/service_role keys**, so no privileged or ambiguous key can bypass RLS during the test.
- Configure secrets in a protected isolated test environment, not source, pull-request comments, command arguments, CI logs or untrusted PR jobs.

## Live opt-in

In a **controlled environment only**, set `US_S33_READONLY_CONFIRM=US_S33_READ_ONLY_STAGE`, `US_S33_STAGING_PUBLISHABLE_KEY`, the four `US_S33_{A1,A2,B1,B2}_JWT` values and corresponding `US_S33_{A1,A2,B1,B2}_OBJECT_PATH` values. Execute:

```bash
node scripts/s3-3-storage-jwt-readonly.cjs
```

The endpoint is hardcoded to `https://dugmhngrfkuieeletatb.supabase.co` and `us-media`: production endpoint cannot be selected. The script makes **four GET requests** to US-STAGING `/auth/v1/user` first to verify each token signature/session and assert the actual returned user ID matches the declared uploader, then **24 GET-only Storage requests**. It checks the expected JWT issuer and audience locally but does not treat parsing alone as trusted verification. Before any network request, it reconstructs the complete canonical **24-case matrix** from the four validated principals and compares the supplied plan byte-for-byte at the case level; missing, forged, reordered or inconsistent checks fail closed. It also verifies exact final counts of 4 Auth/8 allowed/16 denied. It never signs in, creates users, lists directories, requests signed URLs, uploads, copies, updates or deletes. It does not read private object bodies into memory or print IDs, paths, tokens or object contents. Network interruptions fail.

## Strict request matrix (24 total)

| Viewer | A1 object | A2 object | B1 object | B2 object |
|---|---|---|---|---|
| A1 authenticated | 200 | 200 | DENY | DENY |
| A2 authenticated | 200 | 200 | DENY | DENY |
| B1 authenticated | DENY | DENY | 200 | 200 |
| B2 authenticated | DENY | DENY | 200 | 200 |
| No JWT / publishable key only | DENY | DENY | DENY | DENY |
| Public-object URL | DENY | DENY | DENY | DENY |

DENY means HTTP **401, 403 or 404**. HTTP **400 is rejected**, because a malformed request is not proof of access authorization being denied. A 200 on any forbidden request fails the **entire** run. A 404 for an intended allowed file also fails, so denial results cannot all be explained by nonexistent files. Redirects, HTTP 3xx and 5xx also fail. A result must explicitly be `S33_READONLY_JWT_MATRIX_PASS`, with **4 Auth identity checks + 8 allowed + 16 denied**. Merely passing CI unit tests is not a Storage authorization success.

The baseline repository snapshot defines a private bucket and Storage policies `us_media_select_same_couple`, `us_media_insert_own_folder`, `us_media_update_own`, `us_media_delete_own`. Actual live STAGING policy equivalence remains to be independently verified; source SQL is **not** proof of live configuration.

## Still blocked after this gate

1. **Write-denial proofs**: INSERT, COPY, UPDATE and DELETE negative scenarios must use disposable isolated fixtures and require a separate, explicitly authorized test. This read-only harness cannot certify those operations.
2. Expired/revoked session behavior and signed-URL access semantics: fresh JWT validation/expiry, public CDN cache and revocation must be separately checked. A revoked session can leave a still-valid JWT.
3. Per-object review/consent and partner rights; media byte-level copy/checksums against real Supabase; idempotent recovery on partial external writes; no originals deleted prematurely.
4. Transactionally recoverable re-linking of `moments` and `moment_photos`, especially surviving partner-owned album photos; comprehensive 78-FK account-exit remediation; final physical cleanup of expired retained bytes.
5. Independent privacy/security review, full export, real Android tests and release approval.

**No deployment, SQL mutation, real JWT or real user data use, account deletion, or change to US-STAGING/production was performed by adding this test gate.** If required fixtures or credentials are missing, report **NOT RUN**; do not claim a pass.
