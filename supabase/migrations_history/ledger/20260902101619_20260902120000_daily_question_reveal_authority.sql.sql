-- Production ledger 20260902101619 20260902120000_daily_question_reveal_authority.sql: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 5778cee406ed2be0eae96852f658a49c; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M3 corrective migration: keep get_daily_state as the canonical reveal authority.
-- No schema, data, Auth, RPC signature, or Realtime changes.

create or replace function private.daily_question_reveal_ready(target_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (public.get_daily_state(target_question_id)->>'both_answered')::boolean,
    false
  );
$$;

revoke all on function private.daily_question_reveal_ready(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.daily_question_reveal_ready(uuid) to authenticated;

comment on function private.daily_question_reveal_ready(uuid) is
  'M3 helper only: delegates reveal semantics to public.get_daily_state and extracts both_answered.';;
