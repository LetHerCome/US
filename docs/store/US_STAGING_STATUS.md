# US Store 1.0 — Remote staging status
**Checked:** 2026-10-10
**State:** SOURCE SCHEMA PARITY PASS / S2 ON STAGING / SYNTHETIC DB SMOKE PASS / LIVE FCM DEVICE QA PENDING / 9 CRONS OFF

## Environment

| Surface | Production | Staging |
|---|---|---|
| Supabase project | `iiakdfsxpywdkxravqjh` | `dugmhngrfkuieeletatb` (**US-STAGING**) |
| Region | eu-west-3 | eu-west-3 |
| PostgreSQL | 17.6 | 17.11 |
| Cost | Existing Free project | **$0/month** per Supabase direct quote; subject to Free quotas |
| Data | Real private couple media/content | **ZERO copied production user data**, zero couples/profiles, empty questions |
| Workload | Live; do not modify without separate permission | 9 US scheduled jobs present, **all disabled** |
| Schema | 58 public tables | **58 public tables** — source schema at parity (before candidate S2) |
| Week participation S2 | **Absent** (NOT production deployed) | **Installed and postflight verified** |

**Access:** https://supabase.com/dashboard/project/dugmhngrfkuieeletatb

## Applied only to staging

1. `us_staging_platform_extensions` — pg_cron, pg_net.
2. `us_staging_baseline_from_20261004000000` — verbatim 20261004000000 baseline SQL; includes application catalog fixture rows but no private user data.
3. `us_staging_f2c_crons_immediately_disabled` — F2C source followed by disabling all US cron jobs in the **same transaction**; no Vault project URL or secrets provisioned.
4. `us_stage_sec_rls_hardening` — exact SEC migration.
5. `us_stage_f2a3_retention_operations` — exact retention migration (new retention jobs also disabled).
6. `us_stage_countdown_oggi_v1_source` — original Countdown SQL.
7. `us_stage_native_notifications_v1_source` — original FCM/APNs registration RPC SQL, empty token table.
8. `us_stage_ricordi_thumbnails_v1_column` — original thumbnails column SQL.
9. `us_stage_ricordi_thumbnails_v1_rpc` — original thumbnails RPC SQL.
10. `us_stage_mc2_couple_invites` — exact original MC2 membership/invite protections.
11. `us_stage_s2_week_participation_candidate` — exact candidate S2 SQL from draft PR #180, HEAD `c5602b6a097fdaed66dc3b5b6b61f79bcfce726d`. **STAGING ONLY.**

Because this is a purpose-created staging project, the local migration ledger uses new staging-specific versions. It is **not** a replay of the nine numeric migration history entries installed on production. Never use this ledger to synchronize/mutate production.

## Historical blockers — now resolved for the hosted DB (initial preflight)

- Next source migration `20261004231911_countdown_oggi_v1.sql` was **not applied** because the deployment connector's safety control blocked the operation. Do not bypass the control or claim that the migration succeeded.
- Following native-notifications, thumbnails, MC2 migrations were not executed out of order. Their absence accounts for differences including Countdown table, `device_push_tokens.installation_id`, thumbnails and `get_couple_membership()`.
- A test application of **S2** SQL was automatically **rolled back** by its own expected precondition: `P0001: week participation requires protected membership parents`. Stage had `TRUNCATE` and `MAINTAIN` on `public.profiles` granted to `authenticated`; production does **not**. The not-yet-applied MC2 source migration is responsible for revoking this legacy privilege.
- **Verified after failure:** S2 receipt column/RPC absent, migration ledger unchanged, jobs all inactive, no private profiles or couples.
- This is a meaningful fail-closed check, **not** remote staging QA success. In particular the 9/9 GitHub checks on S2 commit `c5602b6a097fdaed66dc3b5b6b61f79bcfce726d` cover isolated PG17, PGlite, Android, iOS Simulator and browser tests, not a full hosted-schema migration.

## Historical read-only parity gate — before remediation (superseded)

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

## Current hosted postflight and synthetic S2/S3 smoke — 2026-10-10

- Applied the original Countdown → N2 Native Notifications → two Ricordi thumbnail files → MC2 files **in source order**, via supported Supabase migration calls. Original blocked attempt was not bypassed; the later approved run succeeded.
- Post-migration `US_STAGING_S2_GATE.sql`: `source_parity_for_s2=true` **before** candidate S2 was installed. Required 7/7 tables have RLS; all client `profiles` membership DELETE/TRUNCATE/MAINTAIN guards satisfy S2 preflight.
- Applied unmodified candidate S2 `20261009185803_us_v6_week_participation.sql` from PR #180 to **US-STAGING ONLY**. Verified public no-argument RPC and private helper exist, immutable Daily server receipt trigger/column exist, authenticated EXECUTE true, anon EXECUTE false, client Daily DELETE/MAINTAIN false, and client token table SELECT denied.
- Exact committed [`US_STAGING_S2_S3_SYNTHETIC_SMOKE.sql`](US_STAGING_S2_S3_SYNTHETIC_SMOKE.sql) was **executed on US-STAGING** and returned PASS. Its own project marker/empty-DB guards prevent running on production; a PostgreSQL EXCEPTION subtransaction rolls back all synthetic Auth users, profiles, couples and device tokens. Verified test cases: partner A/B see consistent empty S2 week; other couple X sees only its empty week; A's native FCM installation can be registered under its membership; X cannot revoke or claim it; invalid takeover returns SQLSTATE 42501.
- Post-smoke SELECT: **0 synthetic Auth rows, 0 profiles, 0 couples, 0 FCM device tokens, 0 active / 9 inactive US cron jobs**. No files, private production data or real FCM tokens copied.
- Production read-only inspection still reports `get_couple_week_participation_v1()` **absent**, sealed receipt field **absent**; no production SQL executed.

**Boundaries:** This is meaningful *hosted PostgreSQL* proof, not full Supabase Auth signup/JWT issuance, native Firebase provider delivery, real Android notification-tray account-switch QA, web/native app connected to STAGING, or iOS/APNs proof. It exercises authenticated RPC authorization via synthetic database-auth context, not signed real JWT sessions.

### Next safe execution

1. Plan a separate nonproduction Firebase integration and configure a **staging-only** native app bundle pointing at US-STAGING before any actual live FCM device test. Never install the current S3 QA APK against production for account-switch tests; its backend protocol does not match the legacy production Edge FCM.
2. Test separate real **synthetic Auth sessions** (signup flow on staging only), two isolated couples and native A→B ownership rotation on a physical Android device. Verify offline server revoke, app terminated, queued stale legacy packets and new v2 data-only FCM.
3. Security review: legacy message draining, iOS/APNs owner proof, account deletion (#183), independent review of #187. Keep S3 P0 #181 open.
4. Reconcile the **11 MCP-generated staging migration versions** against checked-in file versions before configuring automated Supabase CLI `db push`; never sync the staging ledger with production blindly.
5. Ask separately before **production** S2 SQL/Edge deployment, merge #180/#187, public signup or Google Play publication.

## Governance

- Source feature: [S2 PR #180](https://github.com/LetHerCome/US/pull/180); source PR #177 superseded and closed.
- Public beta notification blocker: [issue #181](https://github.com/LetHerCome/US/issues/181).
- Public account deletion/onboarding work: [issue #183](https://github.com/LetHerCome/US/issues/183).
- No upgrade to paid Supabase plan and no billable branching requested or authorized.
