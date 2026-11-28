-- Play Us (28/11/2026): its points really reach the couple's level. The source
-- 'play_us' was missing from the allowed list, so play_us_finish's award failed
-- (and was swallowed). Same function as weekly_challenge_v1, with 'play_us'.

alter table public.progression_events drop constraint if exists progression_events_source_kind_check;
alter table public.progression_events add constraint progression_events_source_kind_check
  check (source_kind = any (array['quest'::text, 'event'::text, 'milestone'::text, 'daily'::text, 'game'::text, 'think'::text, 'moment'::text, 'challenge'::text, 'play_us'::text]));

create or replace function private.progression_award(target_couple uuid, target_actor uuid, target_source_kind text, target_source_key text, target_xp integer, target_action_at timestamp with time zone default now(), target_counts_rhythm boolean default true, add_to_bond boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  inserted_id uuid;
  current_xp integer;
  action_day date := (coalesce(target_action_at, now()) at time zone 'Europe/Rome')::date;
begin
  if target_couple is null or not exists (select 1 from public.couples c where c.id = target_couple) then
    raise exception using errcode = '22023', message = 'progression_couple_required';
  end if;
  if target_source_kind not in ('quest','event','milestone','daily','game','think','moment','challenge','play_us') then
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
$function$;
revoke all on function private.progression_award(uuid, uuid, text, text, integer, timestamp with time zone, boolean, boolean) from public, anon, authenticated, service_role;
