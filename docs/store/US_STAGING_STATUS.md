# US Store 1.0 — Remote staging status
**Checked:** 2026-10-22 (read-only schema and Edge comparison with production) · earlier full database gate 2026-10-10
**State:** AT PRODUCTION LEVEL except the documented differences below / S2 ON STAGING ONLY / ALL CRONS OFF

## Update 2026-10-22 — parity with production

**How it was checked:** a read-only fingerprint of the catalog on both projects, via `supabase db query --linked --project-ref …`: functions (body, `search_path`, SECURITY DEFINER), function and table ACLs, columns, RLS, policies (storage included), indexes, triggers, constraints, cron jobs, extensions and buckets, about 1,790 objects. It read no table rows. Edge functions were compared through the bundle hash (`ezbr_sha256`) from `supabase functions list`.

**Applied to US-STAGING on 22/10** (never to production):
- **SQL:** `20261017120000_s32_account_deletion_worker_cron.sql`. As designed it schedules nothing here, because there is no `us_project_url` in the staging Vault.
- **Edge**, from `main` 542b986, whose code for these functions is unchanged since the production deploy from 21a7992: `send-web-push`, `game-v2-push`, `game-v2-push-worker`, `daily-question-push-worker`, `monthiversary-job`, `left-for-you-push-worker`, `widget-think-send`, `calendar-reminders-worker`. **`send-web-push` is now the real function**, no longer the QA-only `s3-staging-send-web-push` from #187. Redeploy that source as slug `send-web-push` only for another FCM isolation QA.

**Result:** schema identical to production except the items below. 13 Edge functions have the same bundle as production.

| Difference | Why | Action |
|---|---|---|
| S2 week participation (#180): `get_couple_week_participation_v1`, its two private helpers, the `daily_answers.server_answered_at` receipt and trigger, two indexes, and the tighter grants on `daily_answers` (no client DELETE) and `daily_questions` (client read only) | candidate installed on staging only (10/10) | kept: it is additive and needed to test #180. Production grants on those two tables are broader than staging's; see the S2 notes. |
| All US cron jobs `active=false`; `us-account-deletion-worker` absent | staging keeps every cron off on purpose (no `us_project_url`) | none |
| `couple_questions_families_check` | same condition, different parentheses | none |
| `register_native_push_device`, `save_countdown_oggi_v1` | comments only: production was applied by hand without comments | none |
| Edge `monthiversary-job` | same source (unchanged since 002e5b2), different bundle hash: probably packaging differences between the CI and local deploy | none: worth checking if a monthiversary test behaves differently |
| Edge only in production: `cleanup-left-for-you`, `spotify-search`, `us-widget-state`, `widget-device-token`, `widget-scriptable-setup` | legacy functions deployed from sources outside the current repo layout (`widget-scriptable-setup` is not in the repo) | not ported; not needed to test the app flows |

Auth settings, Edge secrets and data are intentionally different: no copied production data.

**Ahead of production, staging only (22/10):** `20261022141913_weekly_checkin_v1.sql`, the weekly check-in mission. Its postflight is read-only:
- `s32_export_user_data` has the new body (md5 `cf2559e2…`);
- both tables have RLS on and forced;
- clients cannot read `weekly_checkins`; `authenticated` can only read `weekly_checkin_keepsakes`, through the same-couple policy;
- the 5 RPCs are executable by `authenticated` and not by `anon`; the private helpers by neither;
- `supabase db advisors` adds only the usual SECURITY DEFINER warning on the 5 client RPCs, the same as the 48 existing ones.

**Not yet in production.**

**Content 1.1 on staging only (22/10):** `20261022160549_content_1_1.sql`, insert only. Counts before → after, re-applied with no change:
- Daily Question templates 182 → 364;
- Game V2 prompts 212 → 296;
- active Swipe cards 67 → 97;
- couple missions 33 → 49.

The web preview of the branch serves the new content right away: it is read from the server. **Not in production.**

**Staging QA app (22/10):** run `39803123201` built the signed staging APK from `85363f1`, with the weekly check-in and sign-up open on US-STAGING only.
- Package `com.usapp.us.staging`, Firebase `us-staging-45e0f`, version `1.0-s3staging.1792682238`.
- The APK is encrypted in the artifact (7z with `ANDROID_INTERNAL_ARTIFACT_PASSWORD`).
- Built without the 10/10 S3 diagnostics panel, which no longer matches `notifications.js`.

**Edge ahead of production, staging only (22/10):** `send-web-push` v11 with the `weekly_checkin_answer` event (phase 3 of the check-in), deployed from the mission worktree. The 8 functions ported earlier in the day are therefore no longer all identical to production: `send-web-push` differs by this event only.

## Update 2026-10-17

- **#190 + #196 on US-STAGING:** migrations and Edge functions applied (manually, never `db push`). Not in production.
- **Tested on staging:** account deletion (the partner keeps the authorless content); the partner can delete authorless memories/photos (fix on the #190 branch); Segnala layout (fix on #196).
- **Not yet confirmed:** report rate limit, data export.
- **Still to run:** test 5 (the last member deletes their account), 9 (public deletion page), 6 (leave couple). Use throwaway synthetic accounts, never the push-QA accounts.
- **Web preview:** temporary QA branch `claude/qa-store-lifecycle` builds the Cloudflare Pages preview `us-staging-s31` against US-STAGING. **Never merge it.**
- **Production, for contrast (16/10):** the six migrations of V3/#195/#197/#199 are applied and the #199 Edge functions are deployed from `main` 21a7992 ([current state](../CURRENT_STATE.md)). Their state on US-STAGING was not re-checked; do not assume it.
- **Earlier (#187, #189):** FCM owner gate tested on a Xiaomi with the staging APK (founder-reported); staging-only signup code merged, staging Auth settings and real email delivery not certified.
- The staging ledger still uses staging-specific versions: apply by hand in the SQL Editor or through reviewed migration calls, never `db push`.

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
