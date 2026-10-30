Function: monthiversary-job
Project ID: iiakdfsxpywdkxravqjh
Status: ACTIVE
verify_jwt: false
Deployed version: 4 (created 2026-08-20, last deploy 2026-08-20 19:37 UTC)
Recovered: US 2.0 F2A.1, from the `get_edge_function` capture committed in
docs/us-2.0/F2A_PRODUCTION_RESULTS_11_14_AND_FUNCTIONS.json (`monthiversary_job`).

DEPLOYMENT_BUNDLE_SHA256 (ezbr_sha256, not a source hash):
2c8bb67fb1b6ad3ab195a2772d7d003bc9bca7eedd67ac2803d7c104a53e3073

RECOVERED_INDEX_TS_SHA256 (4,405 bytes, no trailing newline):
e17da8978218956ee075723b3034c68c7ebbefab618faf18e58f80ce51a38253

RECOVERED_DENO_JSON_SHA256 (94 bytes, no trailing newline):
5602f2eef98d54a238eb2248d52404ff87b620a3f1058e799631bf70d38bc6fe

Both hashes above are the captured bytes, unedited. Do not reformat the
files: the F2A.1 source test pins them.

F2C (US 2.0, Edge & cron source of truth) changed index.ts in exactly one way:
the VAPID subject is no longer the hard-coded `https://usfinal.vercel.app` but
the `VAPID_SUBJECT` Edge configuration, read through
`../_shared/web-push-vapid.mjs` (fail closed when unset). deno.json is unchanged.
F2C_INDEX_TS_SHA256 (4,418 bytes, no trailing newline):
15a5d810920a6a5319fb753820c6078b7bcb76db2bdb2992be3bd9babc28b374
Until the F2C rollout deploys it, production still runs v4 (the recovered
bytes). verify_jwt stays false: the only caller is pg_cron with the dedicated
`x-us-cron-key`.

Caller: cron `us-monthiversary-hourly`, schedule `5 * * * *`, header
`x-us-cron-key` read from vault secret `us_monthiversary_cron_key`
(executable source since F2C:
supabase/migrations/20261004110718_f2c_edge_cron_source_of_truth.sql; the URL
comes from vault `us_project_url`. supabase/baseline/90_cron.sql is the F2A.1
capture.)
RPCs (service_role): get_internal_monthiversary_cron_key, get_internal_vapid_private_key,
award_relationship_milestone.
Reads: couples (id, started_on), profiles (id by couple_id),
notification_preferences (user_id, relationship), push_subscriptions.
Writes: only through award_relationship_milestone (its definition is in the
baseline), plus deleting push_subscriptions rows on 404/410 from the push service.
Env: SUPABASE_URL, SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY (platform).
Env: VAPID_SUBJECT (Edge configuration, since F2C).
Known, kept as deployed: supabase-js 2.57.4 pin.

Native Notifications V1 (N2, not deployed) changed index.ts in exactly one
more way: the per-subscription Web Push loop is replaced by the shared
dispatcher (`../_shared/notification-core.mjs` `deliverNotification` with the
same title/body/tag/TTL/urgency), so the anniversary also reaches the native
apps (`../_shared/native-push-env.ts` + `native-push-transport.mjs`, FCM/APNs from Edge secrets,
skipped while unconfigured). Award logic, preferences, cron key and VAPID
are unchanged; tests/f2a1-production-baseline.test.js applies the F2C edit
and then this N2 edit to the recovered bytes.
N2_INDEX_TS_SHA256:
39500d8fe52f2043c267f32f43eb561009b7c464c5a66c65c61183d240bff0b5

US 1.0 (A11/N7, not deployed) changed index.ts in exactly one more way: a
start on the 29th, 30th or 31st fires on the last day of shorter months (the
client's rule, events.js addMonthsDay), months count without the old
day-of-month decrement, and the notification is built by the shared catalogue
(`relationship` with kind + months: no points in the text, target `events`,
each recipient in their profiles.locale, one delivery per recipient). The
award call (kind, months, XP 60/200, milestone date = today) is unchanged;
tests/f2a1-production-baseline.test.js applies this edit after F2C and N2.
US10_INDEX_TS_SHA256:
6ba3d93f088a54c2583069f4ce7323a00200ab3cd3c82b03034181260b415a5f

Traguardi dei giorni (29/10/2026, not deployed) changed index.ts in exactly
one more way: which milestones fall today comes from
`../_shared/relationship-milestones.mjs` `dueMilestones` (every 100 days
together, 1000 the biggest prize, then the mesiversario with the US 1.0
rule). Each is awarded (`award_relationship_days_milestone`, service_role,
supabase/migrations/20261028232743_days_together_milestones_v1.sql, for the
days; `award_relationship_milestone` unchanged for the months); the first one
granted is told, once per person (`relationship` with kind `days` + days).
tests/f2a1-production-baseline.test.js applies this edit after US 1.0.
DAYS_INDEX_TS_SHA256:
26233c569d67d7ad058c0d4152167647c064ac1b8a4e87f355e9d26543656f07
