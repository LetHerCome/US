# F2A Production Evidence Summary

Captured read-only from Supabase production on 2026-10-03 through the connected Supabase tools.

No production mutations were performed.

## Migration inventory

- Repo migration files: **47**
- Production ledger rows: **83**
- Exact version present in both: **37**
- Repo-only versions: **10**
- Ledger-only versions: **46**

Repo-only versions:
- 20260831131130
- 20260831213000
- 20260923180800
- 20260923210000
- 20260924160000
- 20260924194500
- 20261001133906
- 20261002181500
- 20261002181501
- 20261002190000

Important alternate ledger versions confirmed:
- repo 20260831131130 -> ledger 20260831212415
- repo 20260831213000 -> ledger 20260831213824
- repo 20260923180800 -> ledger 20260923200535
- repo 20260923210000 -> ledger 20260924072631
- repo 20260924160000 -> ledger 20260928050608
- repo 20260924194500 -> ledger 20260925143951
- repo 20261001133906 -> ledger 20261001144011
- repo 20261002181500 -> ledger 20261002171243
- repo 20261002181501 -> ledger 20261002171949
- repo 20261002190000 -> ledger 20261002181136

## Current production object counts

- public tables: **57**
- private tables: **2**
- views: **1**
- materialized views: **0**
- public functions: **70**
- private functions: **75**
- SECURITY DEFINER: public **67**, private **29**
- triggers: **20**
- public policies: **73**
- storage policies: **4**
- public tables with RLS: **57**
- public column grants for anon/authenticated: **10**

## Realtime

Production publication currently contains **15** tables:
couples, daily_answers, quiz_responses, shared_messages, moments, couple_locations,
bond_weekly_quests, stories, story_views, shared_events, moment_photos,
shared_event_completions, relationship_milestones, think_reactions, left_for_you.

## Extensions

Installed:
- pg_cron 1.6.4
- pg_net 0.20.4
- pg_stat_statements 1.11
- pgcrypto 1.3
- plpgsql 1.0
- supabase_vault 0.3.1
- uuid-ossp 1.1

## Storage

- bucket: `us-media`
- private
- file size limit: **41,943,040 bytes (40 MiB)** — confirms M5G2 is live
- objects: **51**
- configured MIME list includes images, audio and video

## Cron

Exactly **7 active jobs**.

1. `us-monthiversary-hourly` — `5 * * * *` — calls `monthiversary-job`
2. `us-widget-scriptable-state-expiry` — every minute
3. `us-calendar-reminders-dispatch` — every minute
4. `us-left-for-you-push-sweep` — every minute
5. `us-daily-question-materialize` — hourly at minute 1
6. `us-daily-question-push` — every 10 minutes
7. `us-game-v2-push` — every 10 minutes

All seven report zero failures in the last 7 days and their latest status is `succeeded`.

`cron.job_run_details`: **26,798 rows**, oldest 2026-08-20.

`net._http_response`: **798 rows**.

Vault secret names only:
- us_calendar_reminders_cron_key
- us_daily_question_push_cron_key
- us_game_v2_push_cron_key
- us_left_for_you_push_cron_key
- us_monthiversary_cron_key
- us_web_push_vapid_private

## Operational counts

- left_for_you total: **32**
- unseen: **0**
- cleanup eligible now: **0**
- legacy seen rows with null cleanup eligibility: **18**
- cleanup queue: **0**
- push_event_log: **149**
- widget action receipts: **3**
- widget tokens: **3**
- push subscriptions: **5**
- quiz responses: **410**
- partner knowledge attempts: **12**
- relationship milestones: **2**
- latest relationship milestone date: **2026-09-21**
- anonymous auth users: **8**

## Edge Functions

Production currently has exactly **13** deployed Edge Functions.

`monthiversary-job`:
- deployed and ACTIVE
- version **4**
- `verify_jwt=false`
- bundle SHA-256: `2c8bb67fb1b6ad3ab195a2772d7d003bc9bca7eedd67ac2803d7c104a53e3073`
- source successfully recovered via the Supabase connector and is preserved in the raw evidence artifact.

The deployed function confirms:
- authorization by `x-us-cron-key` via `get_internal_monthiversary_cron_key`
- runs only at local hour 09 Europe/Rome
- awards monthiversary/anniversary via `award_relationship_milestone`
- sends Web Push notifications.

## Raw evidence artifacts

- `F2A_PRODUCTION_RESULTS_01_05.json`
- `F2A_PRODUCTION_RESULTS_06_10.json`
- `F2A_PRODUCTION_RESULTS_11_14_AND_FUNCTIONS.json`
- `F2A_PRODUCTION_SCHEMA_SNAPSHOT.json`

The environment does not expose the literal CLI command `supabase db dump --linked`.
The schema snapshot above uses the connector's verbose table introspection plus the catalog evidence blocks.
For F2A itself this is sufficient to fill the previously NOT VERIFIED audit cells; an exact pg_dump baseline can remain an F2A.1 input if desired.
