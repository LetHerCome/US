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

Both files are the captured bytes, unedited. Do not reformat them: the
F2A.1 source test pins these hashes so the repo keeps the deployed behaviour
until an explicit Edge mission (F2C) changes and redeploys it.

Caller: cron `us-monthiversary-hourly`, schedule `5 * * * *`, header
`x-us-cron-key` read from vault secret `us_monthiversary_cron_key`
(source representation: supabase/baseline/90_cron.sql).
RPCs (service_role): get_internal_monthiversary_cron_key, get_internal_vapid_private_key,
award_relationship_milestone.
Reads: couples (id, started_on), profiles (id by couple_id),
notification_preferences (user_id, relationship), push_subscriptions.
Writes: only through award_relationship_milestone (its definition is in the
baseline), plus deleting push_subscriptions rows on 404/410 from the push service.
Env: SUPABASE_URL, SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY (platform).
Known, kept as deployed: supabase-js 2.57.4 pin, VAPID_SUBJECT https://usfinal.vercel.app
(the same Web Push sender contact the other push workers use).
