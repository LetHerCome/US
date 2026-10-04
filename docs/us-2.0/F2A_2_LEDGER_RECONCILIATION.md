# US 2.0 — F2A.2 Ledger Reconciliation

**Status:** `F2A_2_MERGE_READY`. The ledger repair is done in production, verified from the committed evidence, and confirmed by a real linked-CLI `migration list` and `db push --dry-run`. Not merged yet.
**Project:** Supabase `iiakdfsxpywdkxravqjh`
**Authorization:** Francesco, 2026-10-04 07:54 UTC. It covers the migration-ledger repair from the F2A.1 plan, including its ledger DML, and no schema or application-data change.

## SOURCE

- **Branch:** `mission/us-2-0-f2a-2-ledger-reconciliation`.
- **Base:** `origin/main` `6dd23d7b2f5e57c7fd078df6783a46689baccf43` (F2A.1, PR #58, merged).
- **Repair gate commit:** `2851314265dc16e6788298a82f53bf6f1378e4d6` (reviewed before the write).
- **HEAD:** the commit carrying this document; the thread reply reports the SHA.
- **Production access:** none from the authoring environment (egress proxy).
  - The read-only packs and the ledger repair were executed through the Supabase connector. The repair was one atomic SQL transaction, guarded on the 83 reviewed versions.
  - `scripts/f2a2-ledger-repair.mjs` was reviewed but **not executed** against production (see RESULTS).
  - Only the final read-only gate, `migration list --linked` and `db push --dry-run --linked`, ran through a real Supabase CLI, from a local linked checkout.

## PLAN AND STATE

| Step (F2A.1 plan) | What | Where | State |
|---|---|---|---|
| 1. Freeze | no backend migration between the F2A.1 capture and the repair | — | holds: the ledger tip is still `20261003200000` |
| 2. Re-verify, read-only | re-run `F2A_1_PRODUCTION_CAPTURE.sql`; every block must equal the F2A.1 capture | `docs/us-2.0/F2A_2_PREFLIGHT_CAPTURE_*.json` | **PASS**: all 22 aliases deep-equal the F2A.1 capture, no drift |
| 2b. Schema digest, read-only | `F2A_2_SCHEMA_DIGEST.sql` before the repair | `docs/us-2.0/F2A_2_SCHEMA_DIGEST_PRE.json` | **PASS**: 22 block digests; ledger = the 83 F2A.1 rows |
| 3. Export the ledger, read-only | `F2A_2_LEDGER_EXPORT.sql`: all 83 rows, masked in the database | `docs/us-2.0/F2A_2_LEDGER_EXPORT_*.json` → `supabase/migrations_history/ledger/` | **PASS**: 83 rows, version / name / count / length / unmasked md5 equal to F2A.1 c01; `l13` null; 20 values masked in 4 rows; 83 history files + `LEDGER.json` |
| 4. Move files (repo) | 47 migrations to `supabase/migrations_history/`; one baseline migration | repo | **done** |
| 5. Ledger repair (the only write) | revert the 83 versions; record the baseline as applied | executed through the Supabase connector as one guarded SQL transaction (see RESULTS) | **done**, 2026-10-04 |
| 6. Prove it is clean | `migration list --linked`, `db push --dry-run --linked`, digest after, rebuild | `docs/us-2.0/F2A_2_LEDGER_REPAIR_OUTPUT.txt`, `…_DIGEST_POST.json` | **done**: digest and ledger verified here; both CLI commands run literally, read-only, on 2026-10-04 (see RESULTS) |
| 7. Guard | test: nothing older than the baseline is executable | `tests/f2a2-ledger-reconciliation.test.js` | **done** |

The tests that need production evidence skip with `pending: … not committed yet` until it is committed. The mission is complete only when none skips.

## REPOSITORY CHANGES

- **Archive:** `git mv` of the 47 files from `supabase/migrations/` to `supabase/migrations_history/`, with their names and bytes unchanged. Their SHA-256 values are pinned in `supabase/baseline/HISTORY_ARCHIVE.json`, and each one equals its blob on `main` `6dd23d7`. The Supabase CLI reads only `supabase/migrations/`, so none of them can run again. The 9 replay hazards in `MIGRATION_CUTOFF.json` become impossible.
- **Baseline migration:** `supabase/migrations/20261004000000_us_2_0_baseline.sql` (7,347 lines).
  - It is generated: the `supabase/baseline` files in `MANIFEST.json` order, without `00_extensions.sql` (platform-managed) and without `90_cron.sql` (stays a source file until F2C).
  - `20261004000000` is greater than every ledger version (tip `20261003200000`).
  - Production never runs it: the repair records it as applied. It runs only on a new, empty project.
- **Tests repointed:** 56 existing test files and helpers that read historical migration files now read `supabase/migrations_history/`. Only the path changed, in a mechanical `supabase/migrations` → `supabase/migrations_history` substitution, so every assertion still checks the same file. `supabase/SECRETS_MANIFEST.json` paths changed the same way.
- **Generated, kept current by `node scripts/build-supabase-baseline.mjs --check`:** the baseline migration, `supabase/baseline/LEDGER_REPAIR.json`, `docs/us-2.0/F2A_2_SCHEMA_DIGEST.sql` and, once exported, `supabase/migrations_history/ledger/`.
- **`.gitattributes`:** the baseline migration, the archive and the F2A.2 evidence are never converted, because some production function bodies carry CRLF.

## READ-ONLY PACKS

- **`F2A_2_LEDGER_EXPORT.sql`**, blocks `l00`–`l13`:
  - `l00` is the ledger table shape; `l01`–`l13` are the rows in ~55 KB buckets, in version order.
  - Every statement is masked **inside the database**: JWTs, `sb_secret_` / `sb_publishable_` keys, the F2A.1 c10 quoted-literal rule, 32+ hex characters, and 32+ character tokens that mix upper case, lower case and digits.
  - Each row also returns the md5 of the **unmasked** text, so it matches F2A.1 c01 without exposing it.
  - It is validated on a local PostgreSQL 16 with planted fake secrets: all 83 rows came back, every planted value was masked, and the counts were right.
  - It exports all 83 rows, not only the 36 pre-repo rows the plan names. The repair deletes the only copy of what production recorded, and the m6d row already showed that the recorded SQL can differ from the repo file. The extra rows are read-only and masked the same way.
- **`F2A_2_SCHEMA_DIGEST.sql`**, one block `d01`:
  - Every F2A.1 capture block runs inside the database and returns only `md5(result::text)`. The ledger keys `c01.ledger` and `c10.ledger_sql` are left out of the digest.
  - It also lists the ledger: version, name, statement count, length, md5.
  - Run before and after the repair, equal digests prove the repair touched nothing but `supabase_migrations`.
  - On a local copy, two runs gave identical output, and deleting the ledger rows changed only the ledger listing.

## EXACT LEDGER REPAIR SET

`supabase/baseline/LEDGER_REPAIR.json`, generated from F2A.1 c01 and checked against the F2A b01 ledger and `MIGRATION_CUTOFF.json` by test.

- **Revert (delete ledger rows only):** the 83 versions `20260818181916` … `20261003200000`, exactly the rows recorded today.
  - 36 pre-repo base rows;
  - 37 repo files recorded under the same version;
  - 10 repo files recorded under an alternate version.
- **Apply (insert one ledger row, no SQL executed):** `20261004000000` `us_2_0_baseline`. The CLI reads it from the committed file.
- **Commands** (all `--linked`, nothing else):
  1. `supabase migration list --linked`
  2. `supabase migration repair --linked --status reverted <83 versions>`
  3. `supabase migration repair --linked --status applied 20261004000000`
  4. `supabase migration list --linked`
  5. `supabase db push --dry-run --linked`

`scripts/f2a2-ledger-repair.mjs` is the reviewed CLI runner for these commands. It was **not executed** against production: the repair went through the Supabase connector (see RESULTS). The runner aborts before any write if:
- HEAD is not the reviewed commit, or a tracked file is modified (untracked `supabase/.temp/` from `supabase link` is fine);
- `LEDGER_REPAIR.json` is stale;
- the remote ledger is not exactly the 83 versions;
- the local migrations are anything but the baseline.

After the write, it requires one ledger row with local = remote and a dry-run that reports "up to date". Without `--execute` it only prints the commands. It was tested end to end against a fake CLI.

## RESULTS

**Preflight (read-only, 2026-10-04, through the Supabase connector): PASS.** Production is exactly the F2A.1 state.

**Masked values in the exported ledger:**
- `20260818181951 add_private_pairing_and_seed`: 2 literals hashed into the pairing seed. These are real secrets, masked.
- `m11b`, `m11c`, `m11d`: 12, 2 and 4 catalog slugs or keys that look like tokens. These are false positives; their content is in the archived files and the baseline.

The ledger's other columns:
- `rollback` and `idempotency_key` are null on every row;
- `created_by` is the owner account on 78 rows and null on 5.

**Ledger repair (the only production write): DONE.** It was executed on 2026-10-04 at gate commit `2851314`.
- **How it ran:** it was executed through the Supabase connector, not a linked CLI. `scripts/f2a2-ledger-repair.mjs` was reviewed but **not run**. Its effect was applied as one SQL transaction on `supabase_migrations.schema_migrations`, with the same pre-write guard: the live versions had to equal the reviewed 83, or nothing was written.
- **Writes:** delete the 83 reviewed rows; insert 1 row, `20261004000000 us_2_0_baseline`. Nothing else: no migration SQL, no schema or application data.
- **Record:** `docs/us-2.0/F2A_2_LEDGER_REPAIR_OUTPUT.txt`.

**Ledger before and after** (from the committed digests, not from the record):

| | Rows | Versions |
|---|---|---|
| Before (`F2A_2_SCHEMA_DIGEST_PRE.json`) | 83 | `20260818181916` … `20261003200000`, equal to F2A.1 c01 |
| After (`F2A_2_SCHEMA_DIGEST_POST.json`) | 1 | `20261004000000 us_2_0_baseline` |

The stored row holds the committed baseline migration byte for byte: 1 statement, 488,901 characters, md5 `819fa722…b355`, equal to `supabase/migrations/20261004000000_us_2_0_baseline.sql`. The CLI's own `repair --status applied` would have split it into many statements. Only the version is compared by `db push` and `migration list`, so the difference has no effect on them.

**Schema unchanged:** all 22 capture-block digests are identical before and after the repair (c16–c20 are null both times, since every function fit in c12–c15).

**`migration list --linked` and `db push --dry-run --linked`: PASS, run as real CLI commands.**
- **At repair time** they could not run: the record's `migration list` table is a transcript built from the live ledger, not CLI stdout, and it is now labelled as reconstructed.
- **Later, read-only (2026-10-04):** both commands were run for real from a local checkout with a linked Supabase CLI v2.117.0, at HEAD `dcace83550b79cd9256ad9d715f5300599c5aa8e`. Nothing was written: no real `db push` and no `migration repair`. The real stdout is appended to `F2A_2_LEDGER_REPAIR_OUTPUT.txt` under "REAL CLI VERIFICATION".

| Command | Result |
|---|---|
| `supabase migration list --linked` | one row: local `20261004000000`, remote `20261004000000` |
| `supabase db push --dry-run --linked` | `"upToDate":true`, `"migrations":[]`, "Remote database is up to date.", exit 0 |

The test `F2A.2 postcondition` checks the same comparison from the committed post-repair ledger.

**Rebuild:**
- the F2A.1 baseline rebuild still reproduces the production fingerprint;
- empty PostgreSQL + `supabase/migrations` (+ the cron source) gives the same fingerprint as the baseline.

## TESTS

Linux, Node, same container, same `node_modules`.

| Run | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| base `origin/main` `6dd23d7` | 1349 | 1343 | 0 | 6 |
| head (this branch) | 1362 | 1356 | 0 | 6 |

- The 13 new tests in `tests/f2a2-ledger-reconciliation.test.js` all run; none skips.
- The 6 skips are the same Windows-only tests on base and head.
- `node scripts/build-supabase-baseline.mjs --check` and `git diff --check` are clean.

**CLI gate run (Windows, local linked checkout, 2026-10-04):**
- `tests/f2a2-ledger-reconciliation.test.js`: 13/13 pass, none skipped. `build-supabase-baseline.mjs --check` and `git diff --check` are clean.
- `tests/f2a1-production-baseline.test.js`: the PGlite rebuild fails on `bond_quest_templates` (content md5 differs, 33 rows). This is an environment difference, not an F2A.2 regression: `main` `6dd23d7` fails the same way on this machine, and the Linux run above passes.

## PRODUCTION CHANGES

Ledger rows only, in `supabase_migrations.schema_migrations`: 83 deleted, 1 inserted. No schema and no application data changed: the 22-block digest is identical before and after.

## NEXT

**F2C Edge & cron source of truth** (Opus, High):
- deploy `monthiversary-job` from the repo;
- move the 7 cron jobs from `supabase/baseline/90_cron.sql` into a migration newer than the baseline, with a parametrised URL;
- decide `VAPID_SUBJECT` and the `calendar-reminders-worker` `setVapidDetails` fix.

The linked-CLI check that F2A.2 left open is closed (see RESULTS).

## DEFERRED

- **F2C:** deploy `monthiversary-job` from the repo; move the cron jobs into a migration with a parametrised URL; `VAPID_SUBJECT`; the `calendar-reminders-worker` `setVapidDetails` bug.
- **F2A.3:** operational retention.
- **RLS track:** as listed in F2A.1.
