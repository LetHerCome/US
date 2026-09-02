# M3 Daily Question Outcomes — Rollback Runbook

This runbook is part of the migration authority for `20260901192817_daily_question_outcomes.sql`.

## Preferred behavioral rollback

1. Stop rollout of the client surface only.
2. Ship or restore a client version that ignores `daily_question_outcomes` and the two RPCs.
3. Keep the table, policies, RPCs and existing outcome rows intact.
4. Keep `daily_questions`, `daily_answers` and `get_daily_state` unchanged.

This rollback is non-destructive and compatible with cached PWA clients. Existing Daily Question answers and reveals are unaffected.

## Structural rollback before production data exists

Only when an authoritative check confirms that `daily_question_outcomes` is empty:

```sql
begin;

lock table public.daily_question_outcomes in access exclusive mode;
do $$
begin
  if exists (select 1 from public.daily_question_outcomes limit 1) then
    raise exception 'refusing structural rollback: daily_question_outcomes contains user data';
  end if;
end;
$$;

drop policy if exists daily_question_outcomes_select_after_reveal on public.daily_question_outcomes;
revoke execute on function public.save_daily_question_outcome(uuid, text, uuid, integer) from authenticated;
revoke execute on function public.delete_daily_question_outcome(uuid, integer) from authenticated;
drop function if exists public.save_daily_question_outcome(uuid, text, uuid, integer);
drop function if exists public.delete_daily_question_outcome(uuid, integer);
revoke execute on function private.daily_question_reveal_ready(uuid) from authenticated;
drop table if exists public.daily_question_outcomes;
drop function if exists private.daily_question_reveal_ready(uuid);

commit;
```

The structural rollback must abort instead of dropping the table once it contains user outcomes. Dropping or truncating persisted reflections is an irreversible data transformation and requires a new explicit authorization, export/retention plan and a separate migration review.

## Order and safety

- Client rollback precedes database rollback.
- Never modify Auth, `daily_answers`, `daily_questions` or `get_daily_state` as part of this rollback.
- Verify ACLs, publication membership and object existence after every structural rollback step in a staging environment first.
- No structural rollback has been applied to the remote project for M3.
