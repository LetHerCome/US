# US Store 1.0 — Remote staging status
**Checked:** 2026-10-10
**State:** FREE STAGING CREATED / PARTIAL SCHEMA / CRONS OFF / S2 REMOTE QA NOT YET CLEARED

## Environment

| Surface | Production | Staging |
|---|---|---|
| Supabase project | `iiakdfsxpywdkxravqjh` | `dugmhngrfkuieeletatb` (**US-STAGING**) |
| Region | eu-west-3 | eu-west-3 |
| PostgreSQL | 17.6 | 17.11 |
| Cost | Existing Free project | **$0/month** per Supabase direct quote; subject to Free quotas |
| Data | Real private couple media/content | **ZERO copied production user data**, zero couples/profiles, empty questions |
| Workload | Live; do not modify without separate permission | 9 US scheduled jobs present, **all disabled** |
| Schema | 58 public tables | 57 public tables — NOT at parity |
| Week participation S2 | Absent | Absent |

**Access:** https://supabase.com/dashboard/project/dugmhngrfkuieeletatb

## Applied only to staging

1. `us_staging_platform_extensions` — pg_cron, pg_net.
2. `us_staging_baseline_from_20261004000000` — verbatim 20261004000000 baseline SQL; includes application catalog fixture rows but no private user data.
3. `us_staging_f2c_crons_immediately_disabled` — F2C source followed by disabling all US cron jobs in the **same transaction**; no Vault project URL or secrets provisioned.
4. `us_stage_sec_rls_hardening` — exact SEC migration.
5. `us_stage_f2a3_retention_operations` — exact retention migration (new retention jobs also disabled).

Because this is a purpose-created staging project, the local migration ledger uses new staging-specific versions. It is **not** a replay of the nine numeric migration history entries installed on production. Never use this ledger to synchronize/mutate production.

## Blockers and observed behavior

- Next source migration `20261004231911_countdown_oggi_v1.sql` was **not applied** because the deployment connector's safety control blocked the operation. Do not bypass the control or claim that the migration succeeded.
- Following native-notifications, thumbnails, MC2 migrations were not executed out of order. Their absence accounts for differences including Countdown table, `device_push_tokens.installation_id`, thumbnails and `get_couple_membership()`.
- A test application of **S2** SQL was automatically **rolled back** by its own expected precondition: `P0001: week participation requires protected membership parents`. Stage had `TRUNCATE` and `MAINTAIN` on `public.profiles` granted to `authenticated`; production does **not**. The not-yet-applied MC2 source migration is responsible for revoking this legacy privilege.
- **Verified after failure:** S2 receipt column/RPC absent, migration ledger unchanged, jobs all inactive, no private profiles or couples.
- This is a meaningful fail-closed check, **not** remote staging QA success. In particular the 9/9 GitHub checks on S2 commit `c5602b6a097fdaed66dc3b5b6b61f79bcfce726d` cover isolated PG17, PGlite, Android, iOS Simulator and browser tests, not a full hosted-schema migration.

## Read-only parity gate — executed 2026-10-10

The source-controlled query [`US_STAGING_S2_GATE.sql`](US_STAGING_S2_GATE.sql) was **executed successfully** against both Supabase projects (SELECT only, no writes):

| Criterion | Production | US-STAGING |
|---|---|---|
| Required 7 source tables RLS-enabled | **7/7 PASS** | **7/7 PASS** |
| Countdown table | Present | **Missing** |
| Native device installation field | Present | **Missing** |
| Ricordi thumbnail field | Present | **Missing** |
| MC2 couple membership RPC | Present | **Missing** |
| Unique couple roles index | Present | Present |
| No anon INSERT on `profiles` | PASS | **FAIL** |
| No authenticated TRUNCATE on `profiles` | PASS | **FAIL** |
| No authenticated MAINTAIN on `profiles` | PASS | **FAIL** |
| US cron jobs enabled | 9 (normal production) | **0/9**, all disabled (required in staging) |
| S2 week RPC and receipt field | Missing (not released) | Missing (not released) |
| `source_parity_for_s2` | **true** | **false** |

The stage has all seven relevant RLS-enabled tables, but that is **not equivalent to the completed MC2 authorization model**. In particular the S2 migration's fail-closed precondition is correct. The only safe next action is completing missing forward migrations via a supported, reviewed deployment method, in order, before hosted S2 SQL or synthetic couples smoke testing. No substitute grants, permissive test bypass or out-of-order S2 application may count as parity.

## Next safe execution

1. Audit the blocked forward migration through the established approved deployment route, without disabling or evading safety gates.
2. Apply missing forward migrations to **staging only** in correct dependency order; preserve job-disable invariant and never install production Vault URLs/secrets.
3. Compare object, index, trigger, grant and RLS fingerprints to production, **excluding actual user data** and expected PostgreSQL minor-version drift.
4. Apply the updated S2 candidate once schema parity is established; verify ledger, RPC, sealed Daily receipt, grants, signed-in account access and cross-couple isolation using **synthetic users**.
5. After independent review, ask for separate consent before **production** SQL, client merge/release or Google Play publication.

## Governance

- Source feature: [S2 PR #180](https://github.com/LetHerCome/US/pull/180); source PR #177 superseded and closed.
- Public beta notification blocker: [issue #181](https://github.com/LetHerCome/US/issues/181).
- Public account deletion/onboarding work: [issue #183](https://github.com/LetHerCome/US/issues/183).
- No upgrade to paid Supabase plan and no billable branching requested or authorized.
