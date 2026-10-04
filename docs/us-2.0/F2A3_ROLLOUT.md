# US 2.0 F2A.3 — repository implementation and future rollout

Production changes in this pass: **NONE**. No deploy, db push, Vault provisioning, PR or merge.

Starting branch: `mission/us-2-0-f2a3-retention-operations`; starting HEAD: `623842f96723a9f6aeb072306c7292e6410ecccd`; base main: `9907e1c0e879c39fae3cc1b8745915d0bbff0a6c`.

The production facts and decisions in `F2A3_RETENTION_OPERATIONS.md` and the read-only pack remain authoritative. This document implements those decisions and does not repeat the production audit.

## Source implementation

CLI 2.117.0 created `supabase/migrations/20261004184758_f2a3_retention_operations.sql` using exactly `supabase migration new f2a3_retention_operations`. No timestamp was invented.

`private.run_operational_retention()` is owned by the established cron owner `postgres`, uses SECURITY INVOKER and an empty search path, explicitly revokes PUBLIC/anon/authenticated/service_role execution, and checks the database role. It returns only deletion counts. Each call is atomic; it never accepts a user-supplied cutoff or targets product tables.

| Technical surface | Eligibility (strictly older than the cutoff) |
|---|---|
| `cron.job_run_details`, succeeded | `end_time < now() - 14 days` |
| Other cron run statuses | `end_time < now() - 30 days`; null end times survive |
| `push_event_log` | `created_at < now() - 180 days` |
| `widget_action_tokens` | `revoked_at` OR `expires_at < now() - 30 days` |
| `widget_tokens` | `revoked_at < now() - 30 days` |
| `widget_scriptable_setup_codes` | `consumed_at` OR `revoked_at` OR `expires_at < now() - 30 days` |
| `widget_scriptable_installations` | `revoked_at` OR `expires_at < now() - 30 days` |
| `private.left_for_you_cleanup_queue` | `completed_at < now() - 30 days`; pending outbox entries survive |

Times exactly at each cutoff survive. Receipt deletion happens only through the existing action-token FK cascade, which also removes linked installation metadata. The returned installation count excludes rows already removed by that cascade. Active-token receipts survive regardless of their age; receipt deletion does not cascade into message history.

Messages, moments, quiz responses, game history, daily answers, progression events, activity, calendar content, profiles, couples and other product/history tables are outside operational retention. The existing separate Left-for-You lifecycle remains unchanged: seen for more than 30 days, eligible under the legacy boundary, not conserved; durable queue; finalize the source before deleting owned media with the Storage API; retry incomplete outbox work.

`cleanup-left-for-you` now authenticates `x-us-cron-key` using `public.get_internal_left_for_you_cleanup_cron_key()`. That RPC reads Vault name `us_left_for_you_cleanup_cron_key` and is executable only by service_role (plus its database owner). Missing/blank keys and lookup errors fail closed. `verify_jwt=false` remains intentional because this is a cron-only endpoint with dedicated authentication. `M5I_CLEANUP_SECRET` is no longer consumed.

Two jobs are registered **paused**:

- `us-operational-retention-daily`: `20 3 * * *` (03:20 UTC on Supabase), invoking the private function.
- `us-left-for-you-cleanup-daily`: `40 3 * * *` (03:40 UTC), calling the existing cleanup worker with Vault `us_project_url` and the dedicated key. Missing/blank configuration or a malformed origin sends no HTTP request.

Only these two job names are touched. Duplicates, another owner, or schedule/command/database drift abort registration. Reapply preserves job IDs, active/paused state and the original seven jobs; it never runs cleanup or retention, provisions secrets or re-enables a paused job.

## Hard rollout preconditions — future explicitly authorized production pass

**STOP before enabling or manually calling either destructive worker unless a fresh off-site logical DB dump exists.** The audited Supabase organization is Free; do not assume a recoverable managed daily backup. Record UTC timestamp, SHA-256, encrypted off-site location, export scope (schema/data/roles including required private/auth data) and successful readability/restore verification in a private operations record. Never commit dump data, credentials or secret values. If rollout is delayed, obtain a fresh dump again before activation. A logical DB dump does **not** back up Storage object bytes.

1. Obtain independent review and explicit authorization for the future production rollout. Verify the deployment/ledger state and that F2C precedes this migration. Capture the current seven jobs (IDs, names, schedules, command hashes, active state and owner) with the committed read-only packs.
2. Satisfy and record the backup gate. Preview counts with `F2A3_RETENTION_READONLY.sql`; re-check eligibility at rollout time rather than relying on the audit's historical counts.
3. Apply only the forward F2A.3 migration under `postgres` using the reviewed migration process. Both new jobs must remain paused. Verify exactly one of each, correct owner/database/schedule/command, execution ACLs, and byte-identical original job definitions. No destructive call is part of migration apply.
4. Provision a strong random dedicated key in Vault named `us_left_for_you_cleanup_cron_key` **before deployment**. Confirm `us_project_url` identifies this project's origin. Do not provision or reuse the old M5I env secret, another worker's key, anon JWT or service API key as cron authentication. Verify names/presence only in evidence.
5. Deploy the reviewed `cleanup-left-for-you` source with `verify_jwt=false`. Keep its cron paused. Verify unauthorized/missing/wrong keys are refused before any claim. Do not log the Vault value or put it in committed commands.
6. Require the read-only Left-for-You eligibility count and pending cleanup outbox count to be zero before the first authenticated no-op smoke. If either is nonzero, stop and review the changed conditions; do not claim a no-op. With the backup gate still satisfied, invoke the worker through its dedicated authenticated path; require HTTP 200, `claimed: 0`, `results: []`, no source mutation and no Storage deletion. The audit observed zero eligible rows; this must be reconfirmed then.
7. Immediately before enabling retention, reconfirm the fresh off-site dump record. Execute one reviewed retention call as postgres, capture returned counts, rerun read-only previews, and verify product/history rows, pending outbox state and Storage objects did not change. A repeat call should delete zero further eligible rows (apart from rows that crossed a cutoff meanwhile).
8. Enable only `us-operational-retention-daily` and `us-left-for-you-cleanup-daily` through `cron.alter_job(job_id := <verified jobid>, active := true)`. Confirm the original seven jobs are unchanged. Observe the next scheduled executions, cron success/failure evidence and pg_net HTTP status. Worker HTTP 200 reports per-item results, so inspect retry/unsafe-path statuses as well as transport status.

Future activation is an operator step, never inferred from applying or reapplying this migration. Deactivate either new job with `cron.alter_job(..., active := false)` if unexpected counts, errors or retry accumulation occur. Do not alter the original jobs as rollback. Pausing prevents future work but does not undo committed deletes; database restoration requires the off-site dump. Storage recovery requires a separate byte backup, not SQL metadata restoration.

## Storage monitoring and accepted follow-ups

- First rollout only monitors the eight previously identified Storage orphans using r06. There is no orphan deletion automation and no direct `storage.objects` deletion. Later deletion needs explicit object review and the Storage API, with an appropriate byte-backup posture.
- Android widget credential churn is an accepted native follow-up: expose an owner-bound boolean/status check, never a plaintext credential. Retention bounds residue without changing provisioning behavior in this mission.
- Establish a recurring off-site logical export procedure or reassess the plan when production backup requirements warrant it. Establish separate Storage byte backups. Neither is provisioned by this repo pass.
- The existing cleanup worker processes at most 50 items per scheduled request (explicit requests can select up to 100). Monitor pending outbox age/volume after activation; do not silently change lifecycle or batching policy here.

## Local acceptance evidence

Focused tests execute real baseline/migration SQL in embedded PostgreSQL, including actual widget FK cascades and role ACLs. The real TypeScript worker is bundled by esbuild and its no-op claim/key lookups execute against that local database. Vault/pg_cron/pg_net platform surfaces use the existing test skeleton; native extension scheduling and actual network delivery remain rollout checks.

Coverage: strict 14/30/180-day boundaries and null timestamps; idempotent retention; product table snapshots with old messages/moments/progression/Left-for-You data retained; Storage metadata retained; live receipts retained; expired/revoked token cascades; fresh database and captured production cron upgrade; no duplicates and atomic rejection of foreign owner/drift; paused-state preservation; explicit API revocations and service-only Vault RPC; legacy/bearer/wrong/missing-key refusal; real no-op cleanup twice with recently seen/unseen data retained.

Historical F1B/F2C assertions continue to validate their original matrix and seven jobs. Later Edge RPCs prove ACLs by applying real forward migrations; later Vault consumers must exist in those migrations. The baseline rebuild harness explicitly uses UTC, matching production timestamp JSON fingerprints on Windows without changing any production capture or expected hash.

Verified locally on 2026-10-04:

- `node --test tests/f2a3-retention-operations.test.js tests/sec-rls-hardening.test.js`: 27 passed, zero failed/skipped (including all 9 focused F2A.3 tests).
- `node --test tests/f2c-edge-cron-source-truth.test.js tests/f2a1-production-baseline.test.js`: 51 passed, zero failed/skipped.
- Full package test runner, `node --test --test-concurrency=2`: 1,408 tests; 1,375 passed, zero failed, 33 skipped. Existing multi-connection tests require Linux PostgreSQL server binaries/postgres OS user/root unavailable on this Windows host. Runtime approximately 189 seconds.
- Changed JavaScript/CommonJS files: `node --check` passed. Worker TypeScript and shared helper: esbuild bundle/transpile and emitted JavaScript syntax check passed. SQL compiled and executed in the local database tests.
- `node scripts/build-supabase-baseline.mjs --check`, `git diff --check` and staged diff check passed. Independent read-only review and follow-up review found no actionable issues.

Local status: **F2A3_READY_FOR_REVIEW**. Production changes: **NONE**. Production extension/network behavior, Vault provisioning, deployment and authenticated production no-op are deliberately pending the authorized future rollout above.
