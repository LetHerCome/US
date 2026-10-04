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
  'M3 helper only: delegates reveal semantics to public.get_daily_state and extracts both_answered.';
