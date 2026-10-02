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

  select r.* into reward
    from public.progression_reward_catalog r
   where r.id = target_reward_id and r.active = true;
  if reward.id is null then raise exception using errcode = '22023', message = 'reward unavailable'; end if;

  if not exists (
    select 1
      from public.couple_reward_unlocks u
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
    frame_reward_id = case
      when reward.category = 'frame' then
        case
          when public.couple_progression_preferences.frame_reward_id = reward.id then null
          else reward.id
        end
      else public.couple_progression_preferences.frame_reward_id
    end,
    theme_reward_id = case
      when reward.category = 'theme' then
        case
          when public.couple_progression_preferences.theme_reward_id = reward.id then null
          else reward.id
        end
      else public.couple_progression_preferences.theme_reward_id
    end,
    effect_reward_id = case
      when reward.category = 'effect' then
        case
          when public.couple_progression_preferences.effect_reward_id = reward.id then null
          else reward.id
        end
      else public.couple_progression_preferences.effect_reward_id
    end,
    updated_by = excluded.updated_by,
    updated_at = now();

  return public.get_progression_v1();
end;
$$;

revoke all on function public.equip_progression_reward(text) from public, anon;
grant execute on function public.equip_progression_reward(text) to authenticated;
