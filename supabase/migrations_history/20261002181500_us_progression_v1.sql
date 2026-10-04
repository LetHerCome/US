-- US Progression V1 — Sintonia, Ritmo, rewards and server-authoritative unlocks.
-- Existing couples.bond_xp remains the single progression total. This migration
-- adds an idempotent ledger around meaningful actions and never renames or
-- rewrites the existing Quest/Event authorities.

create table public.progression_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  source_kind text not null check (source_kind in ('quest','event','milestone','daily','game','think','moment')),
  source_key text not null check (length(source_key) between 1 and 180),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  counts_rhythm boolean not null default true,
  action_day date not null,
  created_at timestamptz not null default now(),
  unique (couple_id, source_kind, source_key)
);

create index progression_events_rhythm_idx
  on public.progression_events(couple_id, action_day desc)
  where counts_rhythm = true;

create table public.progression_reward_catalog (
  id text primary key,
  level_required smallint not null check (level_required >= 1),
  category text not null check (category in ('frame','theme','effect')),
  title text not null,
  description text not null,
  token text not null unique,
  sort_order smallint not null,
  active boolean not null default true,
  announce boolean not null default true
);

create table public.couple_reward_unlocks (
  couple_id uuid not null references public.couples(id) on delete cascade,
  reward_id text not null references public.progression_reward_catalog(id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (couple_id, reward_id)
);

create table public.progression_reward_views (
  couple_id uuid not null references public.couples(id) on delete cascade,
  reward_id text not null references public.progression_reward_catalog(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (couple_id, reward_id, profile_id)
);

create table public.couple_progression_preferences (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  frame_reward_id text references public.progression_reward_catalog(id) on delete set null,
  theme_reward_id text references public.progression_reward_catalog(id) on delete set null,
  effect_reward_id text references public.progression_reward_catalog(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.progression_events enable row level security;
alter table public.progression_events force row level security;
alter table public.progression_reward_catalog enable row level security;
alter table public.progression_reward_catalog force row level security;
alter table public.couple_reward_unlocks enable row level security;
alter table public.couple_reward_unlocks force row level security;
alter table public.progression_reward_views enable row level security;
alter table public.progression_reward_views force row level security;
alter table public.couple_progression_preferences enable row level security;
alter table public.couple_progression_preferences force row level security;

revoke all on public.progression_events from public, anon, authenticated;
revoke all on public.progression_reward_catalog from public, anon, authenticated;
revoke all on public.couple_reward_unlocks from public, anon, authenticated;
revoke all on public.progression_reward_views from public, anon, authenticated;
revoke all on public.couple_progression_preferences from public, anon, authenticated;

insert into public.progression_reward_catalog
  (id, level_required, category, title, description, token, sort_order, active, announce)
values
  ('frame_glow',      2, 'frame',  'Glow',     'Un bordo di luce per la foto di Oggi.', 'frame_glow',      20, true, true),
  ('theme_rose',      3, 'theme',  'Rose',     'Una variante più calda dei colori di US.', 'theme_rose',      30, true, true),
  ('frame_aurora',    4, 'frame',  'Aurora',   'Una cornice sfumata che vive sulla foto di Oggi.', 'frame_aurora',    40, true, true),
  ('theme_midnight',  5, 'theme',  'Midnight', 'Una variante più profonda e violetta di US.', 'theme_midnight',  50, true, true),
  ('effect_pulse',    6, 'effect', 'Pulse',    'Un respiro leggero sul simbolo US.', 'effect_pulse',    60, true, true)
on conflict (id) do update set
  level_required = excluded.level_required,
  category = excluded.category,
  title = excluded.title,
  description = excluded.description,
  token = excluded.token,
  sort_order = excluded.sort_order,
  active = excluded.active,
  announce = excluded.announce;

create or replace function private.progression_level(total_xp integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  total integer := greatest(0, coalesce(total_xp, 0));
  level_no integer := 1;
  floor_xp integer := 0;
  needed integer := 200;
begin
  while total >= floor_xp + needed loop
    floor_xp := floor_xp + needed;
    level_no := level_no + 1;
    needed := 200 + (level_no - 1) * 150;
    exit when level_no > 999;
  end loop;
  return level_no;
end;
$$;

create or replace function private.progression_level_info(total_xp integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  total integer := greatest(0, coalesce(total_xp, 0));
  level_no integer := 1;
  floor_xp integer := 0;
  needed integer := 200;
  current_xp integer;
begin
  while total >= floor_xp + needed loop
    floor_xp := floor_xp + needed;
    level_no := level_no + 1;
    needed := 200 + (level_no - 1) * 150;
    exit when level_no > 999;
  end loop;
  current_xp := total - floor_xp;
  return jsonb_build_object(
    'total_xp', total,
    'level', level_no,
    'current_xp', current_xp,
    'needed_xp', needed,
    'remaining_xp', greatest(0, needed - current_xp),
    'progress', case when needed > 0 then (current_xp::numeric / needed::numeric) else 0 end
  );
end;
$$;

create or replace function private.progression_sync_unlocks(target_couple uuid, supplied_xp integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
  level_no integer;
begin
  if target_couple is null then return; end if;
  if supplied_xp is null then
    select coalesce(c.bond_xp, 0) into total from public.couples c where c.id = target_couple;
  else
    total := greatest(0, supplied_xp);
  end if;
  if total is null then return; end if;
  level_no := private.progression_level(total);
  insert into public.couple_reward_unlocks(couple_id, reward_id)
  select target_couple, reward.id
    from public.progression_reward_catalog reward
   where reward.active = true and reward.level_required <= level_no
  on conflict (couple_id, reward_id) do nothing;
end;
$$;

create or replace function private.progression_award(
  target_couple uuid,
  target_actor uuid,
  target_source_kind text,
  target_source_key text,
  target_xp integer,
  target_action_at timestamptz default now(),
  target_counts_rhythm boolean default true,
  add_to_bond boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id uuid;
  current_xp integer;
  action_day date := (coalesce(target_action_at, now()) at time zone 'Europe/Rome')::date;
begin
  if target_couple is null or not exists (select 1 from public.couples c where c.id = target_couple) then
    raise exception using errcode = '22023', message = 'progression_couple_required';
  end if;
  if target_source_kind not in ('quest','event','milestone','daily','game','think','moment') then
    raise exception using errcode = '22023', message = 'progression_source_invalid';
  end if;
  if target_source_key is null or btrim(target_source_key) = '' or char_length(target_source_key) > 180 then
    raise exception using errcode = '22023', message = 'progression_source_key_invalid';
  end if;
  if coalesce(target_xp, 0) < 0 then
    raise exception using errcode = '22023', message = 'progression_xp_invalid';
  end if;
  if target_actor is not null and not exists (
    select 1 from public.profiles p where p.id = target_actor and p.couple_id = target_couple
  ) then
    raise exception using errcode = '42501', message = 'progression_actor_outside_couple';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('us:progression:' || target_couple::text, 0));

  insert into public.progression_events(
    couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at
  )
  values (
    target_couple, target_actor, target_source_kind, btrim(target_source_key),
    greatest(0, coalesce(target_xp, 0)), coalesce(target_counts_rhythm, true),
    action_day, coalesce(target_action_at, now())
  )
  on conflict (couple_id, source_kind, source_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null and add_to_bond and coalesce(target_xp, 0) > 0 then
    update public.couples
       set bond_xp = coalesce(bond_xp, 0) + target_xp
     where id = target_couple
    returning bond_xp into current_xp;
  else
    select coalesce(c.bond_xp, 0) into current_xp from public.couples c where c.id = target_couple;
  end if;

  perform private.progression_sync_unlocks(target_couple, current_xp);

  return jsonb_build_object(
    'recorded', inserted_id is not null,
    'xp_added', case when inserted_id is not null and add_to_bond then greatest(0, coalesce(target_xp, 0)) else 0 end,
    'total_xp', coalesce(current_xp, 0),
    'level', private.progression_level(coalesce(current_xp, 0)),
    'action_day', action_day
  );
end;
$$;

create or replace function private.progression_couples_xp_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bond_xp is distinct from old.bond_xp then
    perform private.progression_sync_unlocks(new.id, coalesce(new.bond_xp, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists progression_couples_xp on public.couples;
create trigger progression_couples_xp
after update of bond_xp on public.couples
for each row execute function private.progression_couples_xp_trigger();

create or replace function private.progression_quest_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.completed_at is null and new.completed_at is not null then
    perform private.progression_award(new.couple_id, null, 'quest', new.id::text, new.xp, new.completed_at, true, false);
  end if;
  return new;
end;
$$;

drop trigger if exists progression_quest_complete on public.bond_weekly_quests;
create trigger progression_quest_complete
after update of completed_at on public.bond_weekly_quests
for each row execute function private.progression_quest_trigger();

create or replace function private.progression_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.progression_award(new.couple_id, new.completed_by, 'event', new.id::text, new.xp_awarded, new.completed_at, true, false);
  return new;
end;
$$;

drop trigger if exists progression_event_complete on public.shared_event_completions;
create trigger progression_event_complete
after insert on public.shared_event_completions
for each row execute function private.progression_event_trigger();

create or replace function private.progression_milestone_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.progression_award(new.couple_id, null, 'milestone', new.id::text, new.xp_awarded, new.awarded_at, false, false);
  return new;
end;
$$;

drop trigger if exists progression_milestone_complete on public.relationship_milestones;
create trigger progression_milestone_complete
after insert on public.relationship_milestones
for each row execute function private.progression_milestone_trigger();

create or replace function private.progression_game_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.completed_at is null and new.completed_at is not null then
    perform private.progression_award(new.couple_id, null, 'game', new.id::text, 15, new.completed_at, true, true);
  end if;
  return new;
end;
$$;

drop trigger if exists progression_game_complete on public.game_sessions;
create trigger progression_game_complete
after update of completed_at on public.game_sessions
for each row execute function private.progression_game_trigger();

create or replace function private.progression_daily_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  answered integer;
begin
  select count(distinct a.user_id)::integer into answered
    from public.daily_answers a
   where a.couple_id = new.couple_id and a.question_id = new.question_id;
  if answered >= 2 then
    perform private.progression_award(
      new.couple_id, new.user_id, 'daily', new.question_id::text, 10,
      coalesce(new.updated_at, new.created_at, now()), true, true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists progression_daily_answer on public.daily_answers;
create trigger progression_daily_answer
after insert or update of answer on public.daily_answers
for each row execute function private.progression_daily_trigger();

create or replace function private.progression_think_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_rome date;
begin
  if new.kind = 'think' then
    day_rome := (new.created_at at time zone 'Europe/Rome')::date;
    perform private.progression_award(
      new.couple_id, new.sender_id, 'think', new.sender_id::text || ':' || day_rome::text,
      2, new.created_at, true, true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists progression_think_send on public.shared_messages;
create trigger progression_think_send
after insert on public.shared_messages
for each row execute function private.progression_think_trigger();

create or replace function private.progression_moment_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_rome date;
begin
  day_rome := (new.created_at at time zone 'Europe/Rome')::date;
  perform private.progression_award(
    new.couple_id, new.created_by, 'moment', new.created_by::text || ':' || day_rome::text,
    10, new.created_at, true, true
  );
  return new;
end;
$$;

drop trigger if exists progression_moment_create on public.moments;
create trigger progression_moment_create
after insert on public.moments
for each row execute function private.progression_moment_trigger();

-- Historical facts seed Ritmo/history without retroactively adding Sintonia.
insert into public.progression_events(couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at)
select q.couple_id, null, 'quest', q.id::text, q.xp, true,
       (q.completed_at at time zone 'Europe/Rome')::date, q.completed_at
  from public.bond_weekly_quests q
 where q.completed_at is not null
on conflict (couple_id, source_kind, source_key) do nothing;

insert into public.progression_events(couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at)
select e.couple_id, e.completed_by, 'event', e.id::text, e.xp_awarded, true,
       (e.completed_at at time zone 'Europe/Rome')::date, e.completed_at
  from public.shared_event_completions e
on conflict (couple_id, source_kind, source_key) do nothing;

insert into public.progression_events(couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at)
select m.couple_id, null, 'milestone', m.id::text, m.xp_awarded, false,
       (m.awarded_at at time zone 'Europe/Rome')::date, m.awarded_at
  from public.relationship_milestones m
on conflict (couple_id, source_kind, source_key) do nothing;

insert into public.progression_events(couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at)
select g.couple_id, null, 'game', g.id::text, 0, true,
       (g.completed_at at time zone 'Europe/Rome')::date, g.completed_at
  from public.game_sessions g
 where g.completed_at is not null
on conflict (couple_id, source_kind, source_key) do nothing;

insert into public.progression_events(couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at)
select a.couple_id, null, 'daily', a.question_id::text, 0, true,
       (max(a.created_at) at time zone 'Europe/Rome')::date, max(a.created_at)
  from public.daily_answers a
 group by a.couple_id, a.question_id
having count(distinct a.user_id) >= 2
on conflict (couple_id, source_kind, source_key) do nothing;

insert into public.progression_events(couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at)
select msg.couple_id, msg.sender_id, 'think',
       msg.sender_id::text || ':' || (msg.created_at at time zone 'Europe/Rome')::date::text,
       0, true, (msg.created_at at time zone 'Europe/Rome')::date, min(msg.created_at)
  from public.shared_messages msg
 where msg.kind = 'think'
 group by msg.couple_id, msg.sender_id, (msg.created_at at time zone 'Europe/Rome')::date
on conflict (couple_id, source_kind, source_key) do nothing;

insert into public.progression_events(couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at)
select moment.couple_id, moment.created_by, 'moment',
       moment.created_by::text || ':' || (moment.created_at at time zone 'Europe/Rome')::date::text,
       0, true, (moment.created_at at time zone 'Europe/Rome')::date, min(moment.created_at)
  from public.moments moment
 group by moment.couple_id, moment.created_by, (moment.created_at at time zone 'Europe/Rome')::date
on conflict (couple_id, source_kind, source_key) do nothing;

insert into public.couple_reward_unlocks(couple_id, reward_id)
select c.id, reward.id
  from public.couples c
  join public.progression_reward_catalog reward
    on reward.active = true and reward.level_required <= private.progression_level(coalesce(c.bond_xp, 0))
on conflict (couple_id, reward_id) do nothing;

create or replace function public.get_progression_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  total integer;
  level_data jsonb;
  today_rome date := (now() at time zone 'Europe/Rome')::date;
  last_day date;
  rhythm integer := 0;
  rewards jsonb := '[]'::jsonb;
  pending jsonb := '[]'::jsonb;
  next_reward jsonb;
  prefs public.couple_progression_preferences%rowtype;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select p.couple_id into cid from public.profiles p where p.id = uid;
  if cid is null then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;

  select coalesce(c.bond_xp, 0) into total from public.couples c where c.id = cid;
  if total is null then
    raise exception using errcode = 'P0002', message = 'couple not found';
  end if;
  perform private.progression_sync_unlocks(cid, total);
  level_data := private.progression_level_info(total);

  select pref.* into prefs from public.couple_progression_preferences pref where pref.couple_id = cid;

  select max(e.action_day) into last_day
    from public.progression_events e
   where e.couple_id = cid and e.counts_rhythm = true and e.action_day <= today_rome;

  if last_day is not null and last_day >= today_rome - 1 then
    with days as (
      select distinct e.action_day
        from public.progression_events e
       where e.couple_id = cid and e.counts_rhythm = true and e.action_day <= last_day
    ), ranked as (
      select d.action_day, row_number() over(order by d.action_day desc) as rn from days d
    )
    select count(*)::integer into rhythm
      from ranked r
     where r.action_day = last_day - ((r.rn - 1)::integer);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', reward.id,
      'level_required', reward.level_required,
      'category', reward.category,
      'title', reward.title,
      'description', reward.description,
      'token', reward.token,
      'unlocked', unlock.reward_id is not null,
      'equipped', case reward.category
        when 'frame' then prefs.frame_reward_id = reward.id
        when 'theme' then prefs.theme_reward_id = reward.id
        when 'effect' then prefs.effect_reward_id = reward.id
        else false end
    ) order by reward.sort_order), '[]'::jsonb)
    into rewards
    from public.progression_reward_catalog reward
    left join public.couple_reward_unlocks unlock
      on unlock.couple_id = cid and unlock.reward_id = reward.id
   where reward.active = true;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', reward.id,
      'level_required', reward.level_required,
      'category', reward.category,
      'title', reward.title,
      'description', reward.description,
      'token', reward.token
    ) order by reward.sort_order), '[]'::jsonb)
    into pending
    from public.progression_reward_catalog reward
    join public.couple_reward_unlocks unlock
      on unlock.couple_id = cid and unlock.reward_id = reward.id
    left join public.progression_reward_views seen
      on seen.couple_id = cid and seen.reward_id = reward.id and seen.profile_id = uid
   where reward.active = true and reward.announce = true and seen.reward_id is null;

  select jsonb_build_object(
      'id', reward.id,
      'level_required', reward.level_required,
      'category', reward.category,
      'title', reward.title,
      'description', reward.description,
      'token', reward.token
    )
    into next_reward
    from public.progression_reward_catalog reward
   where reward.active = true
     and reward.level_required > private.progression_level(total)
   order by reward.level_required, reward.sort_order
   limit 1;

  return jsonb_build_object(
    'total_xp', total,
    'level', (level_data->>'level')::integer,
    'current_xp', (level_data->>'current_xp')::integer,
    'needed_xp', (level_data->>'needed_xp')::integer,
    'remaining_xp', (level_data->>'remaining_xp')::integer,
    'progress', (level_data->>'progress')::numeric,
    'rhythm_days', coalesce(rhythm, 0),
    'rhythm_today', exists(
      select 1 from public.progression_events e
       where e.couple_id = cid and e.counts_rhythm = true and e.action_day = today_rome
    ),
    'today', today_rome,
    'rewards', rewards,
    'pending_unlocks', pending,
    'next_reward', next_reward,
    'preferences', jsonb_build_object(
      'frame_reward_id', prefs.frame_reward_id,
      'theme_reward_id', prefs.theme_reward_id,
      'effect_reward_id', prefs.effect_reward_id
    )
  );
end;
$$;

create or replace function public.ack_progression_unlock(target_reward_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select p.couple_id into cid from public.profiles p where p.id = uid;
  if cid is null then raise exception using errcode = '42501', message = 'couple membership required'; end if;
  if not exists (
    select 1 from public.couple_reward_unlocks u
     where u.couple_id = cid and u.reward_id = target_reward_id
  ) then
    raise exception using errcode = '42501', message = 'reward not unlocked';
  end if;
  insert into public.progression_reward_views(couple_id, reward_id, profile_id)
  values (cid, target_reward_id, uid)
  on conflict (couple_id, reward_id, profile_id) do nothing;
  return jsonb_build_object('acknowledged', true, 'reward_id', target_reward_id);
end;
$$;

create or replace function public.equip_progression_reward(target_reward_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  reward public.progression_reward_catalog%rowtype;
begin
  if uid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select p.couple_id into cid from public.profiles p where p.id = uid;
  if cid is null then raise exception using errcode = '42501', message = 'couple membership required'; end if;
  select r.* into reward from public.progression_reward_catalog r
   where r.id = target_reward_id and r.active = true;
  if reward.id is null then raise exception using errcode = '22023', message = 'reward unavailable'; end if;
  if not exists (
    select 1 from public.couple_reward_unlocks u
     where u.couple_id = cid and u.reward_id = reward.id
  ) then
    raise exception using errcode = '42501', message = 'reward not unlocked';
  end if;

  insert into public.couple_progression_preferences(
    couple_id, frame_reward_id, theme_reward_id, effect_reward_id, updated_by, updated_at
  )
  values (
    cid,
    case when reward.category = 'frame' then reward.id end,
    case when reward.category = 'theme' then reward.id end,
    case when reward.category = 'effect' then reward.id end,
    uid, now()
  )
  on conflict (couple_id) do update set
    frame_reward_id = case when reward.category = 'frame' then excluded.frame_reward_id else public.couple_progression_preferences.frame_reward_id end,
    theme_reward_id = case when reward.category = 'theme' then excluded.theme_reward_id else public.couple_progression_preferences.theme_reward_id end,
    effect_reward_id = case when reward.category = 'effect' then excluded.effect_reward_id else public.couple_progression_preferences.effect_reward_id end,
    updated_by = excluded.updated_by,
    updated_at = now();

  return public.get_progression_v1();
end;
$$;

revoke all on function private.progression_level(integer) from public, anon, authenticated;
revoke all on function private.progression_level_info(integer) from public, anon, authenticated;
revoke all on function private.progression_sync_unlocks(uuid, integer) from public, anon, authenticated;
revoke all on function private.progression_award(uuid, uuid, text, text, integer, timestamptz, boolean, boolean) from public, anon, authenticated;
revoke all on function private.progression_couples_xp_trigger() from public, anon, authenticated;
revoke all on function private.progression_quest_trigger() from public, anon, authenticated;
revoke all on function private.progression_event_trigger() from public, anon, authenticated;
revoke all on function private.progression_milestone_trigger() from public, anon, authenticated;
revoke all on function private.progression_game_trigger() from public, anon, authenticated;
revoke all on function private.progression_daily_trigger() from public, anon, authenticated;
revoke all on function private.progression_think_trigger() from public, anon, authenticated;
revoke all on function private.progression_moment_trigger() from public, anon, authenticated;

revoke all on function public.get_progression_v1() from public, anon;
revoke all on function public.ack_progression_unlock(text) from public, anon;
revoke all on function public.equip_progression_reward(text) from public, anon;
grant execute on function public.get_progression_v1() to authenticated;
grant execute on function public.ack_progression_unlock(text) to authenticated;
grant execute on function public.equip_progression_reward(text) to authenticated;
