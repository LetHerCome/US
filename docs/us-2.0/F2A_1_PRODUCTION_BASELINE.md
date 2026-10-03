# US 2.0 — F2A.1 Production Baseline & Missing-Source Recovery

**Status:** `F2A_1_READY_FOR_REVIEW` only once the read-only capture is committed. Until then it is **`BLOCKED`** on that one input (see SOURCE). Not merged.
**Project:** Supabase `iiakdfsxpywdkxravqjh`
**Production changes:** NONE. This mission wrote only to the repository. No ledger repair, `db push`, migration apply, Edge deploy or cron change.

## SOURCE

- **Branch:** `mission/us-2-0-f2a-1-production-baseline` (the exact name from the brief).
- **Base:** `origin/main` `59dfb0e7609c976ecb97bf8e324bbb4f86f75000` (F2A merged). `main` did not move during the mission.
- **HEAD:** the commit that carries this document; the thread reply reports the SHA.
- **Production access from this environment:** none. The egress proxy returns 403 for `api.supabase.com` and the project host, and there is no Supabase connector or token. That matches F2A.
- **Evidence used:**
  - the committed F2A production evidence (`F2A_PRODUCTION_RESULTS_*.json`, `F2A_PRODUCTION_SCHEMA_SNAPSHOT.json`), parsed as data only;
  - the repository and its full git history (891 historical blobs of migrations, tests and docs);
  - **the F2A.1 capture** (`docs/us-2.0/F2A_1_PRODUCTION_CAPTURE*.json`): PENDING. Francesco runs [`F2A_1_PRODUCTION_CAPTURE.sql`](F2A_1_PRODUCTION_CAPTURE.sql), read-only.

**Why a capture was needed.** F2A recorded functions, policies, triggers and indexes as **hashes**, not definitions: `md5(prosrc)`, `md5(qual|with_check)`, trigger names. It recorded tables with columns but without unique keys, FK actions, identity, column ACLs or comments. A baseline built from that would have to guess definitions, which the brief forbids. The capture pack takes them read-only with `pg_get_functiondef`, `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef`, `pg_policies`, `pg_get_viewdef`, catalog ACLs, the realtime publication, `storage.buckets`, `cron.job`, the vault secret **names** and the catalog content.

The capture pack:
- holds 22 single-`SELECT` blocks inside `BEGIN READ ONLY … ROLLBACK`;
- never selects a vault secret value;
- masks key-like literals in the applied ledger SQL it reads (c10);
- was validated on a local PostgreSQL 16 against a mock schema;
- is pinned by a test that rejects any write keyword or secret column.

---

## BASELINE CONTENT

`supabase/baseline/` sits outside `supabase/migrations/`, so the CLI never runs it. F2A.2 decides how it enters the migration history.

The files are **generated**, never hand-written: `node scripts/build-supabase-baseline.mjs` prints them from the committed capture, and `--check` fails if any file is stale. Every statement wraps a production catalog value (a `pg_get_*def` output, an ACL item, a column's type or default). The generator refuses anything it can't reproduce exactly: a non-`postgres` owner or grantor, an unknown constraint or type kind, a non-default publication, or a function without a captured definition.

| File | Content | Objects |
|---|---|---|
| `00_extensions.sql` | the 7 production extensions with versions and schemas (F2A b09) | 6 + plpgsql |
| `10_schemas.sql` | schema `private` and its ACL (`public` is platform-owned) | PENDING |
| `15_types.sql` | standalone types, e.g. `private.game_v2_candidate` | PENDING |
| `20_tables.sql` | columns, nullability, identity, PK / UNIQUE / EXCLUDE, comments | PENDING (57 public + 2 private) |
| `30_functions.sql` | `pg_get_functiondef` of every function, with byte-exact bodies | PENDING (70 + 75) |
| `35_column_defaults.sql` | defaults, applied after functions because some call them | PENDING |
| `40_constraints.sql` | CHECK constraints (some call functions), then FKs with their actions | PENDING (154 CHECK) |
| `50_indexes.sql` | indexes that back no constraint | PENDING |
| `55_views.sql` | `public.relationship_event_history` | 1 |
| `60_triggers.sql` | `pg_get_triggerdef` | 20 |
| `65_rls_policies.sql` | RLS / FORCE flags and every public and private policy | PENDING (73 policies) |
| `70_grants.sql` | table, column, view, sequence and function ACLs, item by item and in production order | PENDING (10 column grants) |
| `80_realtime.sql` | `supabase_realtime` membership and replica identity | 15 |
| `85_storage.sql` | the `us-media` bucket configuration and its 4 storage policies | 1 + 4 |
| `90_cron.sql` | the 7 jobs as a source representation (see warning below) | 7 |
| `95_reference_data.sql` | curated catalog content only, no user data | PENDING |
| `MANIFEST.json` | apply order, object counts, vault names, default privileges, SHA-256 of every file | — |
| `MIGRATION_CUTOFF.json` | the Phase G boundary (below) | 47 files / 83 ledger rows |
| `platform/pglite-platform.sql` | **test-only** Supabase skeleton (roles, auth, storage, vault, pg_cron, pg_net, publication) | — |
| `recovered/*.sql` | documentation slices of the same text (Phase B) | 6 |

**How ACLs are reproduced exactly.** PostgreSQL appends new grantees, so ACL item order is reproducible. The generator revokes every API role and then grants in production order. That reaches the production `relacl` / `proacl` text whether the object starts with a NULL ACL or with Supabase's default privileges. Functions that kept `PUBLIC` first keep it.

**Deparse rules.** Constraint, default, policy and view text is printed relative to the capture session's `search_path` (c01). Every baseline file sets that same path first. A CHECK or policy written as `x between 1 and 6 and y` is stored as nested ANDs and printed with extra parentheses; replaying it stores the flat form. This is the same limit `pg_dump` has. The rebuild test proves that such a difference is the round trip and nothing else (below).

**`90_cron.sql` warning.** The commands hold the production project URL and read vault keys by name. This is F2A D9: apply the file only to a production-equivalent project, because a staging rebuild must substitute its own URL first. No secret value is in the repository.

---

## RECOVERED PRODUCTION-ONLY OBJECTS

| # | Object | Where in the repo now | Status |
|---|---|---|---|
| 1 | `monthiversary-job` v4 source + `deno.json` | `supabase/functions/monthiversary-job/` byte-for-byte; `PROVENANCE.md` with SHA-256 | **done** |
| 1b | `verify_jwt = false` | `supabase/config.toml` `[functions.monthiversary-job]` | **done** |
| 2 | cron `us-monthiversary-hourly`, `5 * * * *` | `supabase/baseline/90_cron.sql`, `recovered/monthiversary.sql` | generated from the capture |
| 3 | `award_relationship_milestone`, `get_internal_monthiversary_cron_key`, `get_internal_vapid_private_key` and the other 15 production-only functions | `30_functions.sql`, `recovered/production_only_functions.sql` | generated from the capture |
| 4 | m6d as applied, including `calendar_reminder_offset_valid` | `recovered/m6d_calendar_reminders_applied.sql` | generated from the capture |
| 5 | Quest tables, functions, policies and `bond_quest_templates` rows | `20/30/65/95_*.sql`, `recovered/quest.sql` | generated from the capture |
| 6 | storage bucket + policies, Realtime membership | `80_realtime.sql`, `85_storage.sql`, `recovered/storage_realtime.sql` | generated from the capture |
| 7 | secrets manifest | `supabase/SECRETS_MANIFEST.json` | **done** |
| + | the 30 production-only tables, 55 policies, 1 trigger and 3 column grants (F2A D1) | baseline | generated from the capture |
| + | catalogs seeded by historical migrations (Game V2 catalog, cooldowns and recipes, Daily Question templates, rewards, Swipe) | `95_reference_data.sql` | generated from the capture |

**Secrets manifest.** It records 6 vault names (exactly F2A b13) and 6 Edge env names (every `Deno.env.get` in `supabase/functions`), each with its consumers. It holds names and consumers only. A test enforces the field allow-list, rejects anything key-shaped, and checks every Edge Function that reads a vault-backed key through an RPC. Two vault secrets, `us_monthiversary_cron_key` and `us_web_push_vapid_private`, were created outside any repo migration, so a new project must provision them by hand.

---

## FUNCTION DRIFT DECISIONS

Method:
1. For each function, take every body that ever existed in git (all refs, all migration, test and doc blobs).
2. Compute `md5` of the body exactly as `pg_proc.prosrc` stores it.
3. Compare it, also under line-ending and comment transforms, with production `body_md5` (F2A b04).

None of the 8 production bodies equals any historical repo body byte-for-byte. 5 equal the latest repo body under a purely cosmetic transform, which the test `F2A.1 drift` asserts.

| Function | Prod hash | Repo hash | Canonical | Evidence | Action |
|---|---|---|---|---|---|
| `public.claim_us_role` | `9548d2d6…` | `32361a61…` (m7a `20260929121430`) | PRODUCTION_CANONICAL (logic = repo) | prod = latest repo body with **CRLF** line endings | none; the baseline carries the production bytes. Revoked from clients since F1A |
| `private.calendar_entries_guard_update` | `0b1837a7…` | `b67a3ca3…` (m6a `20260928071627`) | PRODUCTION_CANONICAL (logic = repo) | prod = repo body with **CRLF** | none |
| `private.bucket_items_guard_calendar_link` | `4ccf01d7…` | `7d15ce40…` (m7a `20260929121350`) | PRODUCTION_CANONICAL (logic = repo) | prod = repo body with **CRLF** | none |
| `private.bucket_items_guard_delete` | `b8416771…` | `f9d5aac0…` (m7a `20260929121350`) | PRODUCTION_CANONICAL (logic = repo) | prod = repo body with **CRLF** | none |
| `public.claim_left_for_you_cleanup` | `de5f5ee6…` | `cd83ab26…` (m5i `20260924160000`, ledger `20260928050608`) | PRODUCTION_CANONICAL (logic = repo) | prod = current repo body (since `afc8f54` "disambiguate") with the full-line `--` comments removed. The older `d313e18` body does not match | none. The m5i file is a replay hazard only for comments |
| `public.send_think` | `018e7147…` | `0a9cb916…` (`20260922120945`) | PENDING CAPTURE | no cosmetic variant of any repo body matches; files recovered after apply in `6472885` "reconcile M4A think backend authority" | decide on the captured `pg_get_functiondef` diff |
| `public.set_think_reaction` | `15e7492e…` | `37543eef…` (`20260922120726`) | PENDING CAPTURE | same | same |
| `public.widget_send_think_internal` | `1d28cbb5…` | `345cd0a0…` (`20260922120726`) | PENDING CAPTURE | same | same |

Callers:
- `send_think`: `app.js:3714`.
- `set_think_reaction`: `app.js:1634`.
- `widget_send_think_internal`: Edge `widget-think-send` (Scriptable and the Android widget).
- `claim_left_for_you_cleanup`: Edge `cleanup-left-for-you`, which is not deployed.
- `claim_us_role`: none (revoked in F1A).
- The three guards: triggers on `calendar_entries` / `bucket_items`, plus the insert/update guards that call `bucket_items_guard_calendar_link`.

No body is overwritten in either direction by F2A.1. The baseline is production.

---

## M6D RECOVERY

**Why the committed m6d file is unsafe to replay** (test `F2A.1 m6d`, run on PGlite):
- `calendar_reminders_allday_offset_check` is written as `check (not exists (select 1 from public.calendar_entries …))`. PostgreSQL rejects it with **`cannot use subquery in check constraint`**, so the file has never been applicable as written.
- Production runs `CHECK (calendar_reminder_offset_valid(entry_id, offset_minutes))` (F2A b06). The helper is a SECURITY DEFINER SQL function that exists in **no** repo migration (F2A b04; the test asserts it).
- The ledger still records version `20260928210000` under the repo's name, so the ledger claims a file whose text production never ran.
- The file's INSERT policy also carries the tautology `p.couple_id = couple_id`, which resolves to `p.couple_id`. F1C classified it as not exploitable (DEFERRED, RLS track).

**Recovered source:** `supabase/baseline/recovered/m6d_calendar_reminders_applied.sql`, generated from the capture. It contains:
- the table and its PK, UNIQUE, CHECK and FK constraints;
- both helpers, `calendar_reminder_offset_valid` and `calendar_reminder_recipient_in_couple`;
- the indexes, RLS / FORCE and the 4 policies;
- the table and function ACLs after F1B / F1C;
- the cron key RPC and `us-calendar-reminders-dispatch`.

The capture also brings the m6d ledger SQL as applied (c10, key-like literals masked), so the repo can show what actually ran. Production truth is not rewritten to match the repo file; the repo file becomes history-only in F2A.2.

---

## MONTHIVERSARY RECOVERY

| Item | Value | Evidence |
|---|---|---|
| Edge source | `supabase/functions/monthiversary-job/index.ts` (4,405 B, SHA-256 `e17da897…8253`) + `deno.json` (94 B, `5602f2ee…c6fe`), unedited | F2A `monthiversary_job` capture; test `F2A.1 monthiversary-job` compares bytes |
| Deployed | v4, ACTIVE, bundle `ezbr_sha256` `2c8bb67f…3073`, last deploy 2026-08-20 19:37 UTC | F2A connector list |
| `verify_jwt` | `false`, now in `config.toml` | F2A + test |
| Cron | `us-monthiversary-hourly`, `5 * * * *`, `net.http_post` to `/functions/v1/monthiversary-job` with header `x-us-cron-key` from vault `us_monthiversary_cron_key` | F2A b11; `90_cron.sql` |
| Vault | `us_monthiversary_cron_key` (name only); `us_web_push_vapid_private` for Web Push | F2A b13; `SECRETS_MANIFEST.json` |
| RPCs | `get_internal_monthiversary_cron_key`, `get_internal_vapid_private_key`, `award_relationship_milestone`. All are `service_role`-only (test asserts the production ACL) | F2A b04; definitions in `recovered/monthiversary.sql` |
| Reads | `couples(id, started_on)`, `profiles(id by couple_id)`, `notification_preferences(user_id, relationship)`, `push_subscriptions` | source |
| Writes | only through `award_relationship_milestone` (definition from the capture), plus deleting `push_subscriptions` rows on 404/410 | source |
| Behaviour | works only at 09:00 Europe/Rome; +60 XP monthiversary, +200 XP anniversary | source |

**Kept as deployed, on purpose:** the `supabase-js@2.57.4` pin and `VAPID_SUBJECT = https://usfinal.vercel.app`. The same subject is in the other 5 push workers.

**`cloudflare-pages-migration` conflict:** none on this base. F2A's merge already excludes `supabase/` and `docs/` from the "no Vercel URL in runtime code", because `VAPID_SUBJECT` is a Web Push sender contact, not a frontend URL. Changing it is an Edge redeploy, so it belongs to F2C.

---

## REBUILD RESULT

**Test:** `tests/f2a1-production-baseline.test.js`. It runs in plain `npm test` and needs no production access:
- **EMPTY** PGlite: real pgcrypto and uuid-ossp in schema `extensions`, plus the Supabase skeleton in `platform/pglite-platform.sql`;
- **+** `supabase/baseline/*.sql` in `MANIFEST.json` order (`00_extensions.sql` is supplied by the skeleton);
- **+** forward migrations from `MIGRATION_CUTOFF.json` (none today);
- **→** the same read-only queries that produced the production evidence. It runs F2A blocks 2–8, 10 and 11 and every F2A.1 capture block on the rebuild, then compares them with the committed production results.

Compared:
- object counts;
- tables, columns, types, nullability, defaults, identity, comments, RLS / FORCE, table ACLs and column grants;
- every constraint;
- every function's signature, header attributes, `md5(prosrc)`, `md5(pg_get_functiondef)` and ACL;
- triggers, indexes, policies, view, types and sequences;
- Realtime membership, the storage bucket configuration and the cron job definitions;
- content fingerprints of every catalog table.

Excluded: data volumes, cron run history, ledger rows, and vault values, which the baseline never creates.

**Result:** PENDING CAPTURE. On a mock schema the pipeline round-trips exactly:
- the mock was 46 tables, 1,500+ lines of functions, real Game V2 migrations, policies, column grants, a view, a composite type, a storage bucket and policy, Realtime and cron;
- the run was capture → generate → rebuild → capture again;
- one CHECK differed only by the deparse round trip, and the test's canonical replay accepts it.

---

## FORWARD MIGRATION CUTOFF

`supabase/baseline/MIGRATION_CUTOFF.json`, generated from the repo plus F2A b01 and kept current by a test.

- **The baseline represents** production at ledger tip **`20261003200000`** (F1C).
- **History-only after F2A.2:** all **47** repo migrations.
  - 37 have the same version in the ledger.
  - 10 are recorded under an alternate version, mapped 1:1.
  - Every one is already applied in production.
- **Active forward migrations:** **none**. No repo migration is newer than the production tip.
- **Ledger rows:** 83 = 36 pre-repo base (`2026-08-18 … 08-21`) + 37 same-version + 10 alternate-version.
- **Replay hazards** become impossible once these files are history-only:

| Version | Hazard |
|---|---|
| `20260831213000` | succeeds and downgrades `widget_send_think_internal` |
| `20260923210000` | succeeds and downgrades `get/set_notification_preference(s)` (pre-M11D) |
| `20260924160000` | overwrites `claim_left_for_you_cleanup` (same logic) |
| `20261002181500` | downgrades `get_progression_v1`, `equip_progression_reward` |
| `20261002181501` (applied as `20261002171949`) | downgrades `equip_progression_reward` |
| `20260928210000` | cannot apply (m6d sub-query CHECK) |
| `20260930105724` | re-grants functions F1B revoked |

---

## F2A.2 EXACT PLAN

Ledger and history reconciliation. It needs Francesco's explicit authorization for ledger DML. There are no schema changes.

1. **Freeze.** Apply no backend migration between the F2A.1 capture and F2A.2. If one lands, it is added to the baseline by re-running step 2.
2. **Re-verify, read-only.**
   - Re-run `F2A_1_PRODUCTION_CAPTURE.sql`, commit the results, and run `node scripts/build-supabase-baseline.mjs --check`. Zero stale files means production still equals the baseline.
   - The rebuild test must stay green.
3. **Export the ledger, read-only.**
   - Take `version, name` plus `md5`/length of `statements` for all 83 rows. Capture c01 already has it.
   - Take the full `statements` of the 36 pre-repo rows, with key-like literals masked as c10 does. These become provenance under `supabase/migrations_history/ledger/` and are never executed.
   - **Never commit an unmasked statement:** the pre-repo VAPID / monthiversary migrations may hold secret values.
4. **Move files (repo).**
   - `git mv supabase/migrations/*.sql supabase/migrations_history/` (47 files, kept verbatim with their names).
   - Add `supabase/migrations/<BASELINE_VERSION>_us_2_0_baseline.sql`: the concatenation of the baseline files in `MANIFEST.json` order, without `00_extensions.sql` (platform-managed) and without `90_cron.sql`.
   - `<BASELINE_VERSION>` is one new version greater than `20261003200000`.
   - Cron stays in `supabase/baseline/90_cron.sql` until F2C moves each job into a migration with a parametrised URL.
5. **Ledger repair (production, ledger rows only; the only write).**
   - `supabase migration repair --status reverted <v>` for the **83** current versions. This deletes ledger rows only, never schema.
   - Then `supabase migration repair --status applied <BASELINE_VERSION>`.
   - Run it as one reviewed script with a dry listing first.
6. **Prove it is clean.**
   - `supabase migration list --linked`: exactly one row, `<BASELINE_VERSION>`, local = remote.
   - `supabase db push --dry-run --linked`: "Remote database is up to date" (no-op).
   - The rebuild test, pointed at `supabase/migrations/` instead of `supabase/baseline/`, gives the same fingerprint.
7. **Guard.** Add a test that fails if any file under `supabase/migrations/` has a version ≤ `<BASELINE_VERSION>` other than the baseline, or if `migrations_history/` gains an executable path.

---

## DEFERRED

- **Ti penso drift decision** (3 functions): needs the captured definitions. If the repo is canonical and production is stale, that is a later explicit migration mission, not F2A.1.
- **Edge byte comparison** of the 12 shared functions: `functions download` / `get_edge_function` (F2C).
- **F2C:**
  - deploy `monthiversary-job` from the repo;
  - move `us-monthiversary-hourly` into a migration;
  - parametrise cron URLs (D9);
  - update `VAPID_SUBJECT` everywhere;
  - decide cron cadence for jobs 1–3;
  - decide on `cleanup-left-for-you`.
- **Found while recovering, not fixed (out of scope):** `calendar-reminders-worker` never calls `webpush.setVapidDetails`. Any due reminder would fail to send and be retried every minute. `calendar_reminders` has 0 rows (F1C), so nothing is affected today. Fix and redeploy in F2C.
- **Legacy Gioca v1 content** (`quiz_sets`, `quiz_questions`) is fingerprinted, not seeded. Archiving it or dropping it is a product decision (F2A.3).
- **RLS track:**
  - advisor `rls_disabled` on 2 private tables;
  - the tautological reminder INSERT policy;
  - anon table privileges;
  - the F1B P2 constraint-helper oracles.
- **Operational retention** (F2A.3): Left for You cleanup before 2026-10-28, `cron.job_run_details`, `push_event_log`, and the stale `quiz_responses` Realtime member.
