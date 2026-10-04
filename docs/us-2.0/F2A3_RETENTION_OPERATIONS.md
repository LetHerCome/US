# US 2.0 — F2A.3 Retention & Operations Audit

**Status:** F2A3_AUDIT_READY — implementation not started  
**Branch:** `mission/us-2-0-f2a3-retention-operations`  
**Base:** `main` `9907e1c0e879c39fae3cc1b8745915d0bbff0a6c`  
**Production changes:** NONE  
**Project:** `iiakdfsxpywdkxravqjh`

## Goal

Close the last backend-foundation housekeeping gap without deleting user history or changing product behavior. F2A.3 is limited to operational retention, cleanup scheduling, backup/runbook posture, and bounded technical tables.

## Production facts captured read-only

- Database size: ~44 MB.
- `cron.job_run_details`: 31,189 rows and ~22.8 MB — more than half the current database footprint.
- Current seven cron jobs had **0 non-success runs in the last 7 days**.
- Supabase documentation states pg_cron does **not** automatically prune `cron.job_run_details`.
- `net._http_response`: ~6 hours of data, matching pg_net's managed default TTL. No custom cleanup needed.
- `push_event_log`: 151 rows. It is a delivery/idempotency ledger; do not aggressively prune it.
- `widget_action_tokens`: 194 rows, **192 revoked**; 52 revoked rows are already >30 days old. Three old receipts reference revoked tokens. One active Scriptable installation references an active token.
- Native Android `authReady()` currently provisions a fresh action credential each time and the Edge endpoint revokes the previous token. This explains the churn. The PWA path is unaffected.
- `left_for_you`: 32 rows; 0 are currently eligible for the existing 30-day cleanup rule. Oldest seen item is 2026-09-23.
- The repository contains `cleanup-left-for-you` and the durable cleanup queue/RPCs, but the Edge Function is **not deployed** and there is **no cron job** for it in production.
- Vault has no dedicated Left-for-You cleanup key.
- Storage `us-media`: 51 objects, ~87.9 MB. 8 objects (~2.59 MB) are currently unreferenced by any known media-path column; all eight are old (August 2026).
- Supabase organization plan is **Free**. Current Supabase docs recommend regular off-site logical dumps for Free projects; managed daily backups are documented for Pro/Team/Enterprise. Storage objects are not included in database backups.

## Decisions

### Retain permanently / product history

Do **not** prune product/history tables as part of F2A.3:

- moments / moment_photos / conserved contributions;
- shared messages / reactions;
- daily questions, answers, outcomes, keepsakes;
- game sessions, answers, sides and editorial catalogs;
- quiz responses;
- progression events and rewards;
- activity;
- calendar entries / shared events;
- profiles / couples / preferences.

`progression_events` is also an idempotency/audit ledger for XP and must not be treated as disposable telemetry.

### Bounded technical retention

Proposed daily database housekeeping:

| Surface | Policy | Reason |
|---|---:|---|
| successful `cron.job_run_details` | 14 days | enough operational history; table otherwise grows without bound |
| non-success cron runs | 30 days | preserve failures longer for diagnosis |
| `push_event_log` | 180 days | conservative dedupe window; all current recovery workers operate on windows <= 7 days / 48 hours / same-day |
| revoked or long-expired `widget_action_tokens` | 30 days | unusable credentials; deleting cascades obsolete receipts/installations |
| revoked `widget_tokens` | 30 days | unusable state credentials |
| consumed/revoked/expired `widget_scriptable_setup_codes` | 30 days | one-time setup material |
| revoked/expired `widget_scriptable_installations` | 30 days | inactive installation metadata |
| completed `private.left_for_you_cleanup_queue` rows | 30 days | completed durable outbox entries |

Do not independently delete `widget_action_receipts`; they are retained with their token and removed by the token's FK cascade. This preserves action-id idempotency while a credential remains usable.

### Left for You cleanup activation

The 30-day cleanup logic already exists and is safe-by-design (Conserva check, durable outbox, Storage deletion after source deletion), but it is currently dormant.

F2A.3 should:

1. deploy `cleanup-left-for-you`;
2. replace its legacy `M5I_CLEANUP_SECRET` dependency with the same dedicated Vault/RPC cron-auth pattern used by the other workers;
3. introduce Vault name `us_left_for_you_cleanup_cron_key`;
4. add service-only RPC `get_internal_left_for_you_cleanup_cron_key()`;
5. schedule a new cron job `us-left-for-you-cleanup-daily` using `us_project_url` + the dedicated Vault key;
6. verify a no-op production run before any row becomes eligible.

No current row is eligible, so rollout can be proven without deleting user data.

### Storage orphans

Do **not** automatically delete the eight current orphan objects in the first F2A.3 rollout.

Reasons:

- object bytes are not restored by a database backup;
- some upload flows can temporarily create an object before its database row;
- SQL deletion from `storage.objects` is not a substitute for Storage API deletion.

F2A.3 records an orphan monitor only. A later explicit Storage cleanup can remove old orphans through the Storage API after review.

### Backup gate

Before the first destructive retention run:

- create a fresh logical database dump off-site;
- record its timestamp/hash/location in the operational runbook (never commit credentials);
- do not claim this backs up Storage object bytes.

For the current Free plan, repeat logical exports regularly or move to a plan with managed backups if US becomes production-critical.

## Current immediate effect if policy were run today

- cron successful history eligible at 14 days: 744 rows;
- cron failure history eligible at 30 days: 0;
- widget action tokens eligible at 30 days: 52;
- other widget/setup/install/cleanup-queue rows eligible at 30 days: 0;
- push event rows eligible at 180 days: 0;
- Left for You items eligible at 30 days: 0.

So the first rollout can be low-risk: it primarily bounds cron history and removes already-revoked widget credentials.

## Follow-up, not part of F2A.3 rollout

**Native widget credential churn:** `ti-penso-widget.js -> authReady() -> provisionCredential()` issues a fresh credential on every native auth-ready pass. The Android bridge can store/read the credential internally but exposes no safe “credential exists for owner” check to JS. Fix this in the native-widget track by exposing a boolean/status method, not by exposing the plaintext token.

This is not a blocker for the current PWA and is not required to close backend foundation once retention is bounded.

## Implementation boundary

Implementation should add:

- one forward migration created with `supabase migration new` (do not invent its timestamp);
- one private housekeeping function, not client-executable;
- two new cron jobs: operational retention + Left-for-You cleanup;
- cleanup worker auth modernization and deployment source;
- focused tests for retention boundaries, cron idempotency/fresh DB behavior, service-only auth and no-op Left-for-You smoke;
- `SECRETS_MANIFEST.json` update;
- production pre/post evidence and runbook.

First implementation pass is repo/local only. No production write until independent review.
