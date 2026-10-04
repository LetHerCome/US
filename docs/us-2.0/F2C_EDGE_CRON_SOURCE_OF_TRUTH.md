# US 2.0 — F2C Edge & cron source of truth

**Status:** `F2C_READY_FOR_REVIEW`. This pass is repo and local work only; nothing in production changed. The production rollout below is a plan awaiting approval.
**Project:** Supabase `iiakdfsxpywdkxravqjh`

## SOURCE

- **Branch:** `mission/us-2-0-f2c-edge-cron-source-truth`.
- **Base:** `main` `2ace4fab934e3af5668b664d9b1123205de14a4c` (F2A.2, PR #59).
- **HEAD:** the commit carrying this document; the review reply reports the SHA.
- **Production access in this pass:** read-only `select` through `supabase db query --linked`. The output is recorded in `docs/us-2.0/F2C_PRODUCTION_PREFLIGHT.json`. No write, no deploy, no secret or Vault change.

## WHAT F2C CHANGES

### 1. Cron becomes an executable migration

`supabase/migrations/20261004110718_f2c_edge_cron_source_of_truth.sql` was created with `supabase migration new`. It is the first forward migration after the baseline `20261004000000`.

- **What it contains:** the seven jobs, with the names, schedules and command bytes of the F2A.1 capture (c09).
  - The read-only preflight found production byte-identical to that capture: same md5 and length for all seven commands.
  - The only change is in the five Edge calls. The URL literal `'https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/<fn>'` becomes `(select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/<fn>'`. The value is read when the job runs.
  - If the value is missing, the URL is null and pg_net calls nothing (fail closed).
- **Mechanism, chosen after reading the installed pg_cron (1.6.4):**
  - pg_cron keys jobs on `(jobname, username)`. A `cron.schedule(name, …)` run by another role would add a second job.
  - So an existing job is updated **in place** with `cron.alter_job(job_id, schedule, command, active := true)`, which keeps its jobid. A missing job is created with `cron.schedule`. Nothing is unscheduled.
- **Guards** (a `DO` block, so a failure changes nothing):
  - a job name that appears twice → abort;
  - a job owned by a role other than `current_user` → abort (no second job);
  - a job that still calls a hard-coded URL (production before F2C) while `us_project_url` is missing → abort;
  - a vault value that is not the origin the live job calls today → abort;
  - a malformed vault value (not `http(s)://host[:port]`) → abort;
  - after each job: exactly one row with that name and the intended schedule, command and `active`, or abort.
- **Idempotent:** re-applying changes nothing, on a fresh database or on production.
- **`supabase/baseline/90_cron.sql`** is untouched: it stays the F2A.1 production capture, as historical evidence.
  - It is not part of any executable migration.
  - A fresh database gets its cron state from the F2C migration.
  - The F2A.2 test keeps its historical claim (baseline + `90_cron.sql` = production). The new F2C test proves baseline + F2C = production, with only the URL expression differing. Cron is never applied twice.
- **Tooling:**
  - `MIGRATION_CUTOFF.json` is regenerated: `forward_migrations` now lists the F2C file.
  - `node scripts/build-supabase-baseline.mjs --check` is clean.
  - The baseline migration bytes are unchanged, so the production ledger md5 still matches.
  - The PGlite pg_cron emulation now matches production: unique `(jobname, username)`, and an `alter_job` with the same signature.

### 2. Cron before → after

| jobid | Job | Schedule | Command before (md5) | Command after (md5) |
|---|---|---|---|---|
| 1 | `us-monthiversary-hourly` | `5 * * * *` | hard-coded URL (`230af74c…`) | vault URL (`b2920d6d…`) |
| 2 | `us-widget-scriptable-state-expiry` | `* * * * *` | SQL only (`4352b18b…`) | unchanged (`4352b18b…`) |
| 3 | `us-calendar-reminders-dispatch` | `* * * * *` | hard-coded URL (`bf899b41…`) | vault URL (`37200156…`) |
| 4 | `us-left-for-you-push-sweep` | `* * * * *` | hard-coded URL (`15260d7c…`) | vault URL (`28476a2e…`) |
| 5 | `us-daily-question-materialize` | `1 * * * *` | SQL only (`e277a76b…`) | unchanged (`e277a76b…`) |
| 6 | `us-daily-question-push` | `*/10 * * * *` | hard-coded URL (`03d7ffdb…`) | vault URL (`821f9e44…`) |
| 7 | `us-game-v2-push` | `*/10 * * * *` | hard-coded URL (`fbed16df…`) | vault URL (`9f40b6b6…`) |

Names, schedules, jobids, owner (`postgres`), database and `active = true` are preserved. The cron keys still come from their own vault secrets, and the request bodies and headers are unchanged.

Full md5 after the migration, for rollout step 6:

| Job | md5 |
|---|---|
| `us-monthiversary-hourly` | `b2920d6da6807bf0baa3ad51340c80ce` |
| `us-widget-scriptable-state-expiry` | `4352b18b72d70db23cd378e7aa3601ec` |
| `us-calendar-reminders-dispatch` | `37200156b93c39e535624b94d1edbc28` |
| `us-left-for-you-push-sweep` | `28476a2ea4706f63129805b69d6453e0` |
| `us-daily-question-materialize` | `e277a76b9c1b07691fda007fc25461d8` |
| `us-daily-question-push` | `821f9e44350d47cf57019bd666557b9d` |
| `us-game-v2-push` | `9f40b6b65cf0cf1b77ad7da198f8fe0a` |

### 3. `calendar-reminders-worker`: VAPID was never configured (defect)

- **Production v1 and the repo (identical)** called `webpush.sendNotification()` without ever calling `webpush.setVapidDetails()`.
  - The client subscribes with an `applicationServerKey` (`app.js`), so push services reject an unsigned request.
  - The worker had already inserted its `push_event_log` dedupe key. The next run hit `23505` and marked the reminder sent, so **calendar reminders were dropped without being delivered**.
  - This follows from the code; delivery logs were not inspected.
- **Fix** (same pattern as the other push workers): once due rows exist and **before** any dedupe key is consumed, the worker:
  - reads the private key through `get_internal_vapid_private_key()` (vault, service_role only);
  - calls `webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate)`.
  - If either is unavailable, it returns 500 without consuming a key, and the reminder is retried the next minute.
- **Unchanged:** cron-key auth, reminder selection, timezone/DST, dedupe, the absence of a preference check (it never had one), 404/410 cleanup and the payload.
- **Tests:** they run the real `index.ts` under the existing Edge harness, against a fake push service that rejects unsigned sends.
  - On the base worker, 4 of the 5 calendar tests fail: the happy path delivers 0 and fails 1, and the three no-configuration cases consume the dedupe key.
  - On HEAD, all 5 pass.

### 4. `VAPID_SUBJECT`: Edge configuration, one helper

**Audit.** Every Web Push producer carried its own `const VAPID_SUBJECT = "https://usfinal.vercel.app"`:

| Producer | Deployed as |
|---|---|
| `monthiversary-job` | itself |
| `calendar-reminders-worker` | itself |
| `daily-question-push-worker` | itself |
| `game-v2-push-worker` | itself |
| `game-v2-push` | itself |
| `left-for-you-push-worker` | itself |
| `send-web-push` | itself |
| `_shared/think-web-push.ts` | inside `send-web-push` and `widget-think-send` |

No other function sends Web Push.

**Decision.**
- `VAPID_SUBJECT` is Edge configuration (`supabase secrets set`), read by `supabase/functions/_shared/web-push-vapid.mjs`.
  - `vapidSubject()` trims the value and accepts only `https://host…` or `mailto:addr`. It rejects `http:`, a localhost host (Apple rejects one), embedded credentials and a malformed value.
  - When the value is missing or invalid, it throws `push_configuration_unavailable`, the error every producer already uses for a missing private key. So it fails closed before any dedupe key, award or send.
- All eight producers now call `setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate)`.
  - Each file loses its constant and gains one import line, nothing else.
  - A tested static rule: any function that calls `webpush.sendNotification` must configure VAPID through the helper.
- **No fallback domain in code.** A future frontend domain change needs no code edit and no deploy, and the subject need not be a frontend URL at all.
- **The rollout preserves the current effective value**, `https://usfinal.vercel.app`, by provisioning it before any changed function is deployed. Changing it later (for example to a `mailto:`) is one `supabase secrets set`.
- **Kept as is:** the VAPID **public** key stays a constant in each producer. It is public by design and is paired with the client (`app.js`), so moving it adds nothing to F2C.

### 5. `monthiversary-job`

- Its repo source equalled deployed v4. F2C makes one deliberate change: the `VAPID_SUBJECT` edit above (4,405 → 4,418 bytes). It does not reformat the file.
- `PROVENANCE.md` keeps the recovered v4 hashes and adds the F2C hash.
- The F2A.1 test now requires: repo `index.ts` = recovered v4 bytes + exactly that edit, and `deno.json` unchanged.
- `verify_jwt = false` stays. The only caller is pg_cron with the dedicated `x-us-cron-key`, and the invocation model does not change.
- A harness test runs it at 09:30 Europe/Rome:
  - with `VAPID_SUBJECT` set, it awards and delivers, signed with that subject;
  - without it, it returns 500 **before** any milestone is awarded.

### 6. New configuration (names only; `supabase/SECRETS_MANIFEST.json`)

| Name | Store | Value to provision | Required before |
|---|---|---|---|
| `us_project_url` | Vault | the project origin, `https://iiakdfsxpywdkxravqjh.supabase.co` (no path). Not a secret, but project-specific, so not in executable SQL | the F2C migration, which refuses to run on production without it |
| `VAPID_SUBJECT` | Edge secret | the current effective subject `https://usfinal.vercel.app` (preserved) | deploying any F2C push function (they fail closed without it) |

The manifest test still requires the vault names without `introduced_by` to equal production's F2A names. `us_project_url` is the only `introduced_by: F2C` entry. `us_web_push_vapid_private` now lists `calendar-reminders-worker` as a consumer.

## FILES CHANGED

- **Added:**
  - `supabase/migrations/20261004110718_f2c_edge_cron_source_of_truth.sql`
  - `supabase/functions/_shared/web-push-vapid.mjs`
  - `tests/f2c-edge-cron-source-truth.test.js`
  - `docs/us-2.0/F2C_PRODUCTION_PREFLIGHT.json`
  - `docs/us-2.0/F2C_EDGE_CRON_SOURCE_OF_TRUTH.md`
- **Edge:**
  - `calendar-reminders-worker/index.ts` (VAPID fix + helper) and its `README.md`;
  - `monthiversary-job/index.ts` and `PROVENANCE.md`;
  - `daily-question-push-worker`, `game-v2-push`, `game-v2-push-worker`, `left-for-you-push-worker` and `send-web-push` `index.ts`;
  - `_shared/think-web-push.ts`.
- **Configuration and generated:** `supabase/SECRETS_MANIFEST.json`, `supabase/baseline/MIGRATION_CUTOFF.json`, `supabase/baseline/platform/pglite-platform.sql` (test emulation only).
- **Tooling and tests:**
  - `scripts/supabase-baseline/migration.cjs` (comment only);
  - `tests/f2a1-production-baseline.test.js`: monthiversary pin, manifest, forward migrations;
  - `tests/f2a2-ledger-reconciliation.test.js`: historical rebuild, postcondition up to the baseline;
  - `tests/m10-2-daily-reactions.test.js`: the `send-web-push` pin becomes the M10 production hash after undoing exactly the F2C edit;
  - `tests/helpers/edge-function-harness.js`: `update()`, opt-in `requireVapid`, default `VAPID_SUBJECT`.

## PRODUCTION ROLLOUT — PLAN ONLY, NOT EXECUTED

Run from a clean checkout of the reviewed commit, with the Supabase CLI linked to `iiakdfsxpywdkxravqjh`. Stop at the first failed check.

1. **Read-only preflight.**
   - `supabase migration list --linked`: local `20261004000000`, `20261004110718`; remote `20261004000000` only.
   - `supabase db push --dry-run --linked`: exactly one pending migration, `20261004110718_f2c_edge_cron_source_of_truth.sql`.
   - Re-run the cron query from `F2C_PRODUCTION_PREFLIGHT.json`: 7 jobs, jobids 1–7, owner `postgres`, active, and command md5 equal to the "before" column above.
   - Vault names: the same six, with `us_project_url` absent.
   - `supabase functions list`: record the current versions. `monthiversary-job` is v4 and `calendar-reminders-worker` is v1; the others are recorded for rollback.
   - `supabase secrets list`: record whether `VAPID_SUBJECT` exists.
   - **Parity of the six other producers:** `supabase functions download <slug>` into a scratch directory (read-only), then diff against `main` `2ace4fa`. The six are `daily-question-push-worker`, `game-v2-push`, `game-v2-push-worker`, `left-for-you-push-worker`, `send-web-push` and `widget-think-send`.
     - Any difference beyond what the repo already has → STOP for that function and report. Deploying it would replace production code the repo does not know.
     - Confirm that every deployed producer uses `https://usfinal.vercel.app` (the value to preserve).
2. **Provision `us_project_url`** (Vault write). It does not affect the running jobs, which do not read it yet.
   - `select vault.create_secret('https://iiakdfsxpywdkxravqjh.supabase.co', 'us_project_url', 'US project origin; pg_cron builds Edge Function URLs from it (F2C)');`
   - Verify: `select decrypted_secret = 'https://iiakdfsxpywdkxravqjh.supabase.co' from vault.decrypted_secrets where name = 'us_project_url';` → `true`.
3. **Provision `VAPID_SUBJECT`** (preserve the current value). It does not affect the deployed functions, which do not read it yet.
   - `supabase secrets set VAPID_SUBJECT=https://usfinal.vercel.app --project-ref iiakdfsxpywdkxravqjh`.
   - Verify: `supabase secrets list` lists it, with digest `13943e922524dd9b5ef957bf5318d300e2a579f2fe28e7e9dee9764251225eb8` (sha256 of the value).
4. **Deploy only the changed Edge Functions**, from the reviewed commit, one at a time. After each, `supabase functions list` must show the new version and `verify_jwt` as in `supabase/config.toml`.
   1. `supabase functions deploy calendar-reminders-worker` (the defect fix; `verify_jwt = false`)
   2. `supabase functions deploy monthiversary-job` (`verify_jwt = false`)
   3. `supabase functions deploy daily-question-push-worker` (false)
   4. `supabase functions deploy left-for-you-push-worker` (false)
   5. `supabase functions deploy game-v2-push-worker` (false)
   6. `supabase functions deploy game-v2-push` (true)
   7. `supabase functions deploy send-web-push` (true)
   8. `supabase functions deploy widget-think-send` (false; it carries `_shared/think-web-push.ts`)
5. **Apply only the reviewed F2C migration:** `supabase db push --linked`.
   - The confirmation must list only `20261004110718_f2c_edge_cron_source_of_truth.sql`.
   - If the guard aborts, nothing changed: fix the reported cause and rerun.
6. **Verify the seven jobs:** `select jobid, jobname, schedule, active, username, md5(command) from cron.job order by jobid`.
   - jobids 1–7 unchanged, the same schedules, all active, owner `postgres`;
   - md5 equal to the "after" table above;
   - no other row with these names.
7. **Verify Edge:** each function's version and `verify_jwt` as recorded in step 4, and `VAPID_SUBJECT` in `supabase secrets list`.
8. **Safe smoke checks.**
   - After two minutes: `select j.jobname, d.status, d.return_message from cron.job_run_details d join cron.job j using (jobid) where d.start_time > <step 5 time> order by d.start_time desc;` → `succeeded`.
   - `select status_code, count(*) from net._http_response where created > <step 5 time> group by 1;` → only `200`. The minute workers answer `{"ok":true,"due":0,…}` when idle.
   - `curl -X POST https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/calendar-reminders-worker` without a key → `401`; the same for `monthiversary-job`.
   - Edge logs: no `push_configuration_unavailable`.
   - Optional, owner-run: one real calendar reminder about 15 minutes ahead, confirmed on a device.
9. `supabase migration list --linked`: local = remote = `20261004000000`, `20261004110718`.
10. `supabase db push --dry-run --linked`: "Remote database is up to date."
11. **Production post-evidence:** commit `docs/us-2.0/F2C_PRODUCTION_POST.json` (the cron query, function versions, vault and secret **names**, steps 9–10 output) and a rollout record.

**Rollback.**
- **Cron:** `cron.alter_job` each Edge job back to its captured command (`supabase/baseline/90_cron.sql`, same jobid). The vault value can stay.
- **Edge:** redeploy the previous source from `main` `2ace4fa` (for `monthiversary-job`, the recovered v4 bytes).
- **`VAPID_SUBJECT`:** can stay set; the old code ignores it.
- Rolling back `calendar-reminders-worker` brings the reminder-loss defect back.

## TESTS

The tests use the same Windows machine and the same `node_modules` (`F:\AI\US\node_modules`) for base and head (`node --test`).

| Run | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| base `main` `2ace4fa` | 1362 | 1322 | 7 | 33 |
| head (this branch) | 1381 | 1341 | 7 | 33 |

- The same 7 failures occur on base and head, all environment-related on this machine: the F2A.1 PGlite rebuild (`bond_quest_templates`) and 5 Capacitor native-staging tests.
- The 19 new F2C tests all pass.

- `tests/f2c-edge-cron-source-truth.test.js`: 19 tests.
  - **Source:** the migration is created after the baseline and is the only forward one; seven jobs and schedules; byte-derivation from the capture and the live md5s; no hard-coded project in any executable migration.
  - **Fresh database:** seven jobs, idempotent; URL derived from the vault at run time, and none without it; the rebuild fingerprint equals production with cron included.
  - **Production state:** updated in place with the same jobids, idempotent; aborts with nothing changed when the vault value is missing, wrong or malformed; aborts on a foreign owner or a duplicate instead of adding a job.
  - **`calendar-reminders-worker`:** VAPID before the push and before the dedupe key; three fail-closed cases; auth and the nothing-due path do not touch VAPID.
  - **`monthiversary-job`:** behaviour with and without `VAPID_SUBJECT`; `verify_jwt` pinned.
  - **`VAPID_SUBJECT` source of truth:** producer audit, helper validation, no VAPID private value in the repo.
- **F2A.1 / F2A.2 guards still pass,** evolved only where F2C is the intended change:
  - the archive, the cutoff guard and the baseline bytes are unchanged;
  - forward migrations must be newer than the baseline;
  - the postcondition is compared up to the baseline;
  - the monthiversary pin becomes v4 + the F2C edit.
- `node scripts/build-supabase-baseline.mjs --check` and `git diff --check` are clean.
- **Known environment failure (not F2C):** the F2A.1 PGlite rebuild fails on `bond_quest_templates` content md5 on this Windows machine. `main` fails the same way here, and the Linux runs recorded in F2A.2 pass.

## PRODUCTION CHANGES IN THIS PASS

**NONE.** Only read-only `select` queries ran (see `F2C_PRODUCTION_PREFLIGHT.json`).

## RISKS / OPEN QUESTIONS

- **Real pg_cron is not exercised locally:** Docker was not running, so the migration ran on the PGlite emulation of pg_cron 1.6.4.
  - The production facts it relies on were read live: `(jobname, username)` uniqueness, the `alter_job` signature, and every job owned by `postgres`.
  - Its guards abort, changing nothing, on any mismatch.
  - A `supabase db start` plus `db reset` run on Docker before rollout would add real pg_cron evidence.
- **Role during `db push`:** the jobs belong to `postgres`. If `db push` ran as another role, the ownership guard would abort the migration (safe, no duplicates) and it would need a rerun as `postgres`.
- **Eight functions to deploy.** Only `monthiversary-job` and `calendar-reminders-worker` are verified byte-identical to the repo. Step 1 checks the other six before any deploy.
- **The `VAPID_SUBJECT` value is the owner's choice.** It preserves `https://usfinal.vercel.app` (Apple and FCM do not fetch it). A `mailto:` contact would decouple it from any web domain, and that is a later one-line secret change.
- **Fresh projects still need the other vault values by hand:** the five cron keys and the VAPID private key (as before F2C), plus `us_project_url`.
- **Calendar reminders already lost:** reminders marked sent after a failed push are not recoverable. Each was a single notification.

## NEXT

Independent review of this candidate, then approval of the rollout above. F2C does not deploy, push or merge on its own.
