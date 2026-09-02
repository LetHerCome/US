-- M3 Daily Question: minimal post-reveal outcome authority.
-- Ownership is couple + stable relationship role, not auth/profile UID.
-- This is intentional: claim_us_role replaces profile/user IDs during re-pair,
-- while the relationship role remains stable and must retain its outcome.

create table public.daily_question_outcomes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  question_id uuid not null references public.daily_questions(id) on delete cascade,
  author_role text not null check (author_role in ('francesco', 'beatrice')),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  revision integer not null default 1 check (revision > 0),
  last_operation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, question_id, author_role)
);

create index daily_question_outcomes_couple_question_idx
  on public.daily_question_outcomes (couple_id, question_id);

create or replace function private.daily_question_reveal_ready(target_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 2
  from public.daily_answers as answer
  where answer.question_id = target_question_id
    and answer.couple_id = (
      select profile.couple_id
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.couple_id is not null
    );
$$;

grant usage on schema private to authenticated;
revoke all on function private.daily_question_reveal_ready(uuid) from public, anon;
grant execute on function private.daily_question_reveal_ready(uuid) to authenticated;

revoke all on public.daily_question_outcomes from public, anon, authenticated;
grant select on public.daily_question_outcomes to authenticated;

alter table public.daily_question_outcomes enable row level security;
alter table public.daily_question_outcomes force row level security;

create policy daily_question_outcomes_select_after_reveal
on public.daily_question_outcomes
for select
to authenticated
using (
  couple_id = private.current_couple_id()
  and private.daily_question_reveal_ready(question_id)
);

create or replace function public.save_daily_question_outcome(
  target_question_id uuid,
  target_body text,
  operation_id uuid,
  expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_couple uuid;
  actor_role text;
  existing public.daily_question_outcomes%rowtype;
  normalized_body text := btrim(target_body);
  next_revision integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if operation_id is null then
    raise exception using errcode = '22004', message = 'operation_id required';
  end if;

  if normalized_body is null or char_length(normalized_body) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'outcome body must contain 1..1000 characters';
  end if;

  select profile.couple_id, profile.role
    into current_couple, actor_role
    from public.profiles as profile
   where profile.id = auth.uid()
     and profile.couple_id is not null;

  if current_couple is null or actor_role not in ('francesco', 'beatrice') then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;

  if not private.daily_question_reveal_ready(target_question_id) then
    raise exception using errcode = '42501', message = 'daily question reveal is not ready';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_couple::text || ':' || target_question_id::text || ':' || actor_role, 0)
  );

  select *
    into existing
    from public.daily_question_outcomes as outcome
   where outcome.couple_id = current_couple
     and outcome.question_id = target_question_id
     and outcome.author_role = actor_role
   for update;

  if existing.id is not null then
    if existing.last_operation_id = operation_id then
      return jsonb_build_object('status', 'duplicate', 'id', existing.id, 'revision', existing.revision, 'body', existing.body);
    end if;
    if expected_revision is null or expected_revision <> existing.revision then
      return jsonb_build_object('status', 'stale', 'id', existing.id, 'revision', existing.revision);
    end if;

    next_revision := existing.revision + 1;
    update public.daily_question_outcomes
       set body = normalized_body,
           revision = next_revision,
           last_operation_id = operation_id,
           updated_at = now()
     where id = existing.id
     returning * into existing;

    return jsonb_build_object('status', 'saved', 'id', existing.id, 'revision', existing.revision, 'body', existing.body);
  end if;

  if expected_revision is not null then
    return jsonb_build_object('status', 'stale', 'revision', 0);
  end if;

  insert into public.daily_question_outcomes (couple_id, question_id, author_role, body, last_operation_id)
  values (current_couple, target_question_id, actor_role, normalized_body, operation_id)
  returning * into existing;

  return jsonb_build_object('status', 'saved', 'id', existing.id, 'revision', existing.revision, 'body', existing.body);
end;
$$;

create or replace function public.delete_daily_question_outcome(
  target_question_id uuid,
  expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_couple uuid;
  actor_role text;
  existing public.daily_question_outcomes%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select profile.couple_id, profile.role
    into current_couple, actor_role
    from public.profiles as profile
   where profile.id = auth.uid()
     and profile.couple_id is not null;

  if current_couple is null or actor_role not in ('francesco', 'beatrice') then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_couple::text || ':' || target_question_id::text || ':' || actor_role, 0)
  );

  select *
    into existing
    from public.daily_question_outcomes as outcome
   where outcome.couple_id = current_couple
     and outcome.question_id = target_question_id
     and outcome.author_role = actor_role
   for update;

  if existing.id is null then
    return jsonb_build_object('status', 'already_absent');
  end if;

  if expected_revision is null or expected_revision <> existing.revision then
    return jsonb_build_object('status', 'stale', 'id', existing.id, 'revision', existing.revision);
  end if;

  delete from public.daily_question_outcomes where id = existing.id;
  return jsonb_build_object('status', 'deleted', 'id', existing.id, 'revision', existing.revision);
end;
$$;

revoke all on function public.save_daily_question_outcome(uuid, text, uuid, integer) from public, anon;
revoke all on function public.delete_daily_question_outcome(uuid, integer) from public, anon;
grant execute on function public.save_daily_question_outcome(uuid, text, uuid, integer) to authenticated;
grant execute on function public.delete_daily_question_outcome(uuid, integer) to authenticated;

comment on table public.daily_question_outcomes is
  'M3-only post-reveal Daily Question reflections; ownership is couple + stable role so claim_us_role re-pair preserves data.';
comment on column public.daily_question_outcomes.author_role is
  'Stable relationship role, intentionally not a profile or auth UID; claim_us_role changes UID without changing this ownership.';
