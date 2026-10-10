# US Store S2 — reconciliation audit / 2026-10-10

**STATUS:** CANDIDATE READY FOR CI / NOT MERGED / NO SQL DEPLOY.

- Main base after approved Android S1-A: `0682a9b4db45c44914cbcfba9d29c09356d82353`
- Draft #177 candidate SHA: `d9a6a1066b8039a9d6be4c0271cb70da9d9aa16f`
- Common ancestor: `b0c9f82d7830f13a0310016067e36da961855d23`
- Source PR has 32 changed files; 5 are concurrent with main: `app.js \`, \`index.html \`, \`manifest.webmanifest \`, \`service-worker.js \`, \`version.json`.
- Original blobs preserved for 27 nonconcurrent files, including migration/tests/CI and browser QA fixtures; no inferred edits.
- `app.js`: verified 2 exact hunks on top of merged S1-A code (Daily answer and realtime refresh participation).
- `index.html`, `service-worker.js`, `version.json`, `manifest.webmanifest`: only synchronized build marker `us-store-s2-week-participation-20261010-1` on current main; retained S1-A widget and premium motion scripts / private cache.
- SQL file `20261009185803_us_v6_week_participation.sql` transported unchanged from reviewed #177 branch; **presence on Git does not authorize running it**.

## Production preflight (readonly)

- Supabase project `iiakdfsxpywdkxravqjh`, 9 recorded applied migrations; candidate SQL absent.
- `daily_answers`, `daily_questions`, `game_sessions`, `game_session_sides`, `progression_events`: all RLS enabled.
- Game sessions/sides and progression_events have no authenticated write grants; couples/profiles TRUNCATE denied. Daily answers and questions retain original write grants that proposed migration restricts.
- New `daily_answers.server_answered_at` absent, `public.get_couple_week_participation_v1()` absent, private helper absent. No partial application observed.
- Aggregate snapshot (no private content read): 43 answers, 42 questions, 6 sessions, 12 sides, 69 progression events.

## Still required

- New branch CI focused, PG17 SQL concurrency, full suite vs baseline 40 failures, Android/iOS build, PWA upgrade and caches, signed Android QA artifact if needed.
- Separate security review of definer authorization, trigger timestamp immutability, tenant boundaries, permissions, migrations ordering (some other migrations remain un-applied) and same-day Rome rule.
- Staging deployment via exact SQL migration after separate authorization; ACL/ledger/smoke + real two-account tests; signed physical QA.
- Production SQL rollout **requires new explicit authorization**, separate from merge; never broad `db push` that could apply unrelated cosmetics migrations.
- Until RPC is present, preview UI must show unavailable state, no fake completions or XP.

**No production SQL, merge or store launch performed by this S2 candidate.**

## Independent security preflight hardening — 2026-10-10

- Verified the live database already has unique partial index `profiles_one_role_per_couple (couple_id, role) WHERE couple_id IS NOT NULL`; no duplicate partner roles possible through ordinary writes. Added a test guarding this existing foundation, **no schema DDL** added for roles.
- Found `MAINTAIN` privilege on both `daily_answers` and `daily_questions` for `anon` and `authenticated`, even after the original migration revocations. The SQL candidate now revokes `MAINTAIN` too, completing least-privilege for provenance and avoiding client-initiated maintenance. Added test checking all 4 privilege outcomes.
- This migration change exists **only in this Git branch**. No production or staging SQL applied. Requires PostgreSQL 17+ and CI rerun on the amended commit; historical 11/11 checks from previous SHA are not transferable.
