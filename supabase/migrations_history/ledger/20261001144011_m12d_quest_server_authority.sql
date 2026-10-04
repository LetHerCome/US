-- Production ledger 20261001144011 m12d_quest_server_authority: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 38cd6b61c3a5337c93eb8593ee86fd3b; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M12D.1 — Quest server authority.
-- No backfill. Moves weekly Quest creation and all mutable Quest state behind
-- authenticated RPCs, while keeping the existing read model and history rows.

do $preflight$
begin
  if to_regclass('public.bond_weekly_state') is null
     or to_regclass('public.bond_weekly_quests') is null
     or to_regclass('public.bond_quest_templates') is null
     or to_regclass('public.couples') is null then
    raise exception 'M12D Quest authority preflight: expected tables missing';
  end if;

  if to_regprocedure('public.confirm_bond_quest(uuid)') is null
     or to_regprocedure('public.reroll_bond_quest(uuid,text)') is null then
    raise exception 'M12D Quest authority preflight: expected RPCs missing';
  end if;

  if exists (
    select 1
    from public.bond_weekly_quests
    group by couple_id, week_start, template_key
    having count(*) > 1
  ) then
    raise exception 'M12D Quest authority preflight: duplicate template in a weekly board';
  end if;
end
$preflight$;

create or replace function private.bond_week_start_rome(at_time timestamptz default now())
returns date
language sql
stable
set search_path = pg_catalog
as $$
  select date_trunc('week', timezone('Europe/Rome', at_time))::date
$$;

create or replace function private.bond_hash_seed(seed_text text)
returns bigint
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  h bigint := 2166136261;
  i integer;
begin
  if seed_text = '' then
    return h;
  end if;

  for i in 1..char_length(seed_text) loop
    h := ((h # ascii(substr(seed_text, i, 1))::bigint) * 16777619) % 4294967296;
  end loop;

  return h;
end;
$$;

create or replace function private.bond_mode_for_couple(target_couple_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lat1 double precision;
  lon1 double precision;
  lat2 double precision;
  lon2 double precision;
  hav double precision;
  km double precision;
begin
  select latitude, longitude
    into lat1, lon1
  from public.couple_locations
  where couple_id = target_couple_id
  order by user_id
  limit 1;

  select latitude, longitude
    into lat2, lon2
  from public.couple_locations
  where couple_id = target_couple_id
  order by user_id
  offset 1
  limit 1;

  if lat1 is null or lat2 is null then
    return 'any';
  end if;

  hav :=
    power(sin(radians((lat2 - lat1) / 2.0)), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians((lon2 - lon1) / 2.0)), 2);

  km := 6371.0 * 2.0 * asin(sqrt(least(1.0, greatest(0.0, hav))));
  return case when km > 50.0 then 'far' else 'near' end;
end;
$$;

create or replace function private.ensure_bond_week_internal()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  week date;
  quest_mode text;
  slot_no integer;
  pool text[];
  candidates text[];
  used_keys text[];
  picked_key text;
  picked public.bond_quest_templates%rowtype;
  pick_index integer;
  quest_count integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cid := private.current_couple_id();
  if cid is null then
    raise exception 'Couple not found';
  end if;

  week := private.bond_week_start_rome(now());

  insert into public.bond_weekly_state(couple_id, week_start, rerolls_used)
  values (cid, week, 0)
  on conflict (couple_id, week_start) do nothing;

  perform 1
  from public.bond_weekly_state
  where couple_id = cid and week_start = week
  for update;

  quest_mode := private.bond_mode_for_couple(cid);

  for slot_no in 1..3 loop
    if exists (
      select 1
      from public.bond_weekly_quests
      where couple_id = cid
        and week_start = week
        and slot = slot_no
    ) then
      continue;
    end if;

    select coalesce(array_agg(template_key order by template_key), '{}'::text[])
      into used_keys
    from public.bond_weekly_quests
    where couple_id = cid
      and week_start = week;

    select array_agg(t.key order by t.key)
      into pool
    from public.bond_quest_templates t
    where t.active = true
      and (t.mode = 'any' or t.mode = quest_mode)
      and (
        (slot_no = 1 and t.rarity in ('common', 'uncommon'))
        or (slot_no = 2 and t.rarity in ('uncommon', 'rare'))
        or (slot_no = 3 and t.rarity in ('rare', 'epic'))
      );

    if coalesce(cardinality(pool), 0) = 0 then
      select array_agg(t.key order by t.key)
        into pool
      from public.bond_quest_templates t
      where t.active = true
        and (t.mode = 'any' or t.mode = quest_mode);
    end if;

    select array_agg(k order by k)
      into candidates
    from unnest(coalesce(pool, '{}'::text[])) as k
    where not (k = any(coalesce(used_keys, '{}'::text[])));

    if coalesce(cardinality(candidates), 0) = 0 then
      continue;
    end if;

    pick_index :=
      (private.bond_hash_seed(
        cid::text || '|' || week::text || '|' || slot_no::text || '|bond'
      ) % cardinality(candidates))::integer + 1;

    picked_key := candidates[pick_index];

    select *
      into picked
    from public.bond_quest_templates
    where key = picked_key
      and active = true;

    if not found then
      raise exception 'Quest template disappeared during initialization';
    end if;

    insert into public.bond_weekly_quests(
      couple_id,
      week_start,
      slot,
      template_key,
      title,
      category,
      rarity,
      xp,
      confirmed_by,
      completed_at
    )
    values (
      cid,
      week,
      slot_no,
      picked.key,
      picked.title,
      picked.category,
      picked.rarity,
      picked.xp,
      '{}'::uuid[],
      null
    )
    on conflict (couple_id, week_start, slot) do nothing;
  end loop;

  select count(*)::integer
    into quest_count
  from public.bond_weekly_quests
  where couple_id = cid
    and week_start = week;

  return jsonb_build_object(
    'week_start', week,
    'mode', quest_mode,
    'quest_count', quest_count
  );
end;
$$;

create or replace function private.confirm_bond_quest_internal(target_quest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.bond_weekly_quests%rowtype;
  uid uuid := auth.uid();
  cid uuid;
  next_confirmed uuid[];
  valid_confirmers integer;
  new_xp integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cid := private.current_couple_id();
  if cid is null then
    raise exception 'Couple not found';
  end if;

  select *
    into q
  from public.bond_weekly_quests
  where id = target_quest_id
    and couple_id = cid
  for update;

  if not found then
    raise exception 'Quest not found';
  end if;

  if q.week_start <> private.bond_week_start_rome(now()) then
    raise exception 'Quest week is closed';
  end if;

  if q.completed_at is not null then
    select bond_xp
      into new_xp
    from public.couples
    where id = q.couple_id;

    return jsonb_build_object(
      'completed', true,
      'bond_xp', new_xp,
      'confirmed_by', q.confirmed_by
    );
  end if;

  next_confirmed := coalesce(q.confirmed_by, '{}'::uuid[]);

  if array_position(next_confirmed, uid) is null then
    next_confirmed := array_append(next_confirmed, uid);
  end if;

  select count(distinct p.id)::integer
    into valid_confirmers
  from public.profiles p
  where p.couple_id = q.couple_id
    and p.id = any(next_confirmed);

  if valid_confirmers >= 2 then
    update public.bond_weekly_quests
      set confirmed_by = next_confirmed,
          completed_at = now()
    where id = q.id;

    update public.couples
      set bond_xp = bond_xp + q.xp
    where id = q.couple_id
    returning bond_xp into new_xp;

    insert into public.activity(couple_id, actor_id, type, payload)
    values (
      q.couple_id,
      uid,
      'bond_quest_completed',
      jsonb_build_object(
        'quest_id', q.id,
        'title', q.title,
        'xp', q.xp
      )
    );

    return jsonb_build_object(
      'completed', true,
      'bond_xp', new_xp,
      'confirmed_by', next_confirmed,
      'xp_awarded', q.xp
    );
  end if;

  update public.bond_weekly_quests
    set confirmed_by = next_confirmed
  where id = q.id;

  select bond_xp
    into new_xp
  from public.couples
  where id = q.couple_id;

  return jsonb_build_object(
    'completed', false,
    'bond_xp', new_xp,
    'confirmed_by', next_confirmed
  );
end;
$$;

create or replace function private.reroll_bond_quest_internal(
  target_quest_id uuid,
  target_template_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.bond_weekly_quests%rowtype;
  s public.bond_weekly_state%rowtype;
  t public.bond_quest_templates%rowtype;
  uid uuid := auth.uid();
  cid uuid;
  quest_mode text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cid := private.current_couple_id();
  if cid is null then
    raise exception 'Couple not found';
  end if;

  select *
    into q
  from public.bond_weekly_quests
  where id = target_quest_id
    and couple_id = cid
  for update;

  if not found then
    raise exception 'Quest not found';
  end if;

  if q.week_start <> private.bond_week_start_rome(now()) then
    raise exception 'Quest week is closed';
  end if;

  if q.completed_at is not null then
    raise exception 'Quest already completed';
  end if;

  if cardinality(q.confirmed_by) > 0 then
    raise exception 'Quest already confirmed';
  end if;

  select *
    into s
  from public.bond_weekly_state
  where couple_id = q.couple_id
    and week_start = q.week_start
  for update;

  if not found then
    raise exception 'Weekly state not found';
  end if;

  if s.rerolls_used >= 3 then
    raise exception 'No rerolls left';
  end if;

  select *
    into t
  from public.bond_quest_templates
  where key = target_template_key
    and active = true;

  if not found then
    raise exception 'Template not found';
  end if;

  quest_mode := private.bond_mode_for_couple(cid);

  if not (t.mode = 'any' or t.mode = quest_mode) then
    raise exception 'Template not eligible for current couple mode';
  end if;

  if exists (
    select 1
    from public.bond_weekly_quests x
    where x.couple_id = q.couple_id
      and x.week_start = q.week_start
      and x.id <> q.id
      and x.template_key = t.key
  ) then
    raise exception 'Template already used';
  end if;

  update public.bond_weekly_quests
    set template_key = t.key,
        title = t.title,
        category = t.category,
        rarity = t.rarity,
        xp = t.xp,
        confirmed_by = '{}'::uuid[],
        completed_at = null
  where id = q.id;

  update public.bond_weekly_state
    set rerolls_used = rerolls_used + 1
  where couple_id = q.couple_id
    and week_start = q.week_start
  returning * into s;

  return jsonb_build_object(
    'rerolls_used', s.rerolls_used,
    'template_key', t.key
  );
end;
$$;

create or replace function public.ensure_bond_week()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.ensure_bond_week_internal()
$$;

create or replace function public.confirm_bond_quest(target_quest_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_bond_quest_internal(target_quest_id)
$$;

create or replace function public.reroll_bond_quest(
  target_quest_id uuid,
  target_template_key text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.reroll_bond_quest_internal(target_quest_id, target_template_key)
$$;

alter table public.bond_weekly_quests
  add constraint bond_weekly_quests_couple_week_template_key
  unique (couple_id, week_start, template_key);

drop policy if exists bond_quests_insert on public.bond_weekly_quests;
drop policy if exists bond_quests_update on public.bond_weekly_quests;
drop policy if exists bond_weekly_state_insert on public.bond_weekly_state;
drop policy if exists bond_weekly_state_update on public.bond_weekly_state;

revoke all on table public.bond_weekly_quests from anon, authenticated;
grant select on table public.bond_weekly_quests to authenticated;

revoke all on table public.bond_weekly_state from anon, authenticated;
grant select on table public.bond_weekly_state to authenticated;

revoke all on table public.bond_quest_templates from anon, authenticated;
grant select on table public.bond_quest_templates to authenticated;

revoke all on table public.couples from anon, authenticated;
grant select on table public.couples to authenticated;
grant update (name, started_on, home_photo_path)
  on table public.couples
  to authenticated;

grant usage on schema private to authenticated, service_role;

revoke all on function private.ensure_bond_week_internal()
  from public, anon, authenticated, service_role;
grant execute on function private.ensure_bond_week_internal()
  to authenticated, service_role;

revoke all on function private.confirm_bond_quest_internal(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.confirm_bond_quest_internal(uuid)
  to authenticated, service_role;

revoke all on function private.reroll_bond_quest_internal(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.reroll_bond_quest_internal(uuid, text)
  to authenticated, service_role;

revoke all on function public.ensure_bond_week() from public, anon, authenticated;
grant execute on function public.ensure_bond_week() to authenticated, service_role;

revoke all on function public.confirm_bond_quest(uuid) from public, anon, authenticated;
grant execute on function public.confirm_bond_quest(uuid) to authenticated, service_role;

revoke all on function public.reroll_bond_quest(uuid, text) from public, anon, authenticated;
grant execute on function public.reroll_bond_quest(uuid, text) to authenticated, service_role;

revoke all on function private.bond_week_start_rome(timestamptz)
  from public, anon, authenticated;
revoke all on function private.bond_hash_seed(text)
  from public, anon, authenticated;
revoke all on function private.bond_mode_for_couple(uuid)
  from public, anon, authenticated;;
