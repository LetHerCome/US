-- Countdown Oggi V1. Additive, server-only persistence; no XP awards or media.
create table public.couple_countdown_preferences (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  active_id text default 'together',
  together_style text not null default 'editorial',
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.couple_countdown_preferences enable row level security;
alter table public.couple_countdown_preferences force row level security;
revoke all on public.couple_countdown_preferences from public, anon, authenticated;

create function public.get_countdown_oggi_v1() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid; pref public.couple_countdown_preferences%rowtype; started date;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='authentication required'; end if;
  select p.couple_id into cid from public.profiles p where p.id=auth.uid();
  if cid is null then raise exception using errcode='42501',message='couple membership required'; end if;
  select c.started_on into started from public.couples c where c.id=cid;
  select * into pref from public.couple_countdown_preferences where couple_id=cid;
  return jsonb_build_object('items',coalesce(pref.items,'[]'::jsonb),
    'active_id',case when pref.couple_id is null then 'together' else pref.active_id end,
    'together_style',coalesce(pref.together_style,'editorial'),'version',coalesce(pref.version,0),
    'started_on',started);
end;
$$;

create function public.save_countdown_oggi_v1(next_state jsonb, expected_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid; current_version integer; xp integer; e jsonb; ids text[] := '{}';
  style text; reward text; styles text[] := '{}'; target_date date; target_instant timestamptz;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='authentication required'; end if;
  select p.couple_id into cid from public.profiles p where p.id=auth.uid();
  if cid is null then raise exception using errcode='42501',message='couple membership required'; end if;
  -- Lock the couple first, matching the existing progression mutation order.
  select c.bond_xp into xp from public.couples c where c.id=cid for update;
  if not found then raise exception 'couple not found'; end if;
  insert into public.couple_countdown_preferences(couple_id) values(cid) on conflict do nothing;
  select version into current_version from public.couple_countdown_preferences where couple_id=cid for update;
  if expected_version is null or current_version<>expected_version then
    raise exception using errcode='40001',message='countdown_conflict';
  end if;
  if jsonb_typeof(next_state) is distinct from 'object'
    or jsonb_typeof(next_state->'items') is distinct from 'array'
    or jsonb_array_length(next_state->'items')>12
    or jsonb_typeof(next_state->'together_style') is distinct from 'string'
    or not(next_state ? 'active_id')
    or jsonb_typeof(next_state->'active_id') not in ('string','null') then
    raise exception using errcode='22023',message='countdown_invalid';
  end if;
  styles:=array_append(styles,next_state->>'together_style');
  for e in select value from jsonb_array_elements(next_state->'items') loop
    if jsonb_typeof(e) is distinct from 'object'
      or jsonb_typeof(e->'id') is distinct from 'string'
      or coalesce(e->>'id','')!~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (e->>'id')=any(ids)
      or jsonb_typeof(e->'title') is distinct from 'string'
      or length(trim(e->>'title')) not between 1 and 32
      or length(e->>'title')>32
      or jsonb_typeof(e->'style') is distinct from 'string'
      or jsonb_typeof(e->'target') is distinct from 'string'
      or coalesce(e->>'mode','') not in ('days','clock') then
      raise exception using errcode='22023',message='countdown_invalid_item';
    end if;
    ids:=array_append(ids,e->>'id'); styles:=array_append(styles,e->>'style');
    if e->>'mode'='days' then
      if (e->>'target') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'countdown_invalid_date'; end if;
      target_date:=(e->>'target')::date;
      if target_date not between date '2000-01-01' and date '2100-12-31' then raise exception 'countdown_invalid_date'; end if;
    else
      if (e->>'target') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' then raise exception 'countdown_invalid_date'; end if;
      target_instant:=(e->>'target')::timestamptz;
      if target_instant not between timestamptz '2000-01-01T00:00:00Z' and timestamptz '2100-12-31T23:59:59Z' then raise exception 'countdown_invalid_date'; end if;
    end if;
  end loop;
  if next_state->>'active_id' is not null and next_state->>'active_id'<>'together'
    and not((next_state->>'active_id')=any(ids)) then raise exception 'countdown_invalid_selection'; end if;
  perform private.progression_sync_unlocks(cid,coalesce(xp,0));
  foreach style in array styles loop
    reward:=case style when 'aurora' then 'frame_aurora' when 'orbit' then 'ring_orbit' when 'chrome' then 'frame_chrome' end;
    if style not in ('editorial','signal','glass','aurora','orbit','chrome') then raise exception 'countdown_invalid_style'; end if;
    if reward is not null and not exists(select 1 from public.couple_reward_unlocks u
      join public.progression_reward_catalog r on r.id=u.reward_id
      where u.couple_id=cid and u.reward_id=reward and r.active) then
      raise exception using errcode='42501',message='countdown_style_locked';
    end if;
  end loop;
  update public.couple_countdown_preferences set items=next_state->'items',active_id=next_state->>'active_id',
    together_style=next_state->>'together_style',version=version+1,updated_at=now() where couple_id=cid;
  return public.get_countdown_oggi_v1();
end;
$$;
revoke all on function public.get_countdown_oggi_v1() from public,anon;
revoke all on function public.save_countdown_oggi_v1(jsonb,integer) from public,anon;
grant execute on function public.get_countdown_oggi_v1() to authenticated;
grant execute on function public.save_countdown_oggi_v1(jsonb,integer) to authenticated;
