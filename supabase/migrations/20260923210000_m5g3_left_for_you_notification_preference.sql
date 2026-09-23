-- M5G3 — prepared only; do not apply remotely in this mission.
-- Adds a dedicated preference for Lasciato per te without overloading Ti penso.

alter table public.notification_preferences
  add column if not exists left_for_you boolean not null default true;

create or replace function public.get_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into prefs from public.notification_preferences where user_id = uid;
  if not found then
    insert into public.notification_preferences(user_id) values(uid)
    on conflict(user_id) do nothing;
    select * into prefs from public.notification_preferences where user_id = uid;
  end if;
  return jsonb_build_object(
    'think', prefs.think,
    'today', prefs.today,
    'bond', prefs.bond,
    'relationship', prefs.relationship,
    'left_for_you', prefs.left_for_you
  );
end;
$$;

create or replace function public.set_notification_preference(target_key text, target_value boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_key not in ('think', 'today', 'bond', 'relationship', 'left_for_you') then
    raise exception 'Invalid preference';
  end if;
  insert into public.notification_preferences(user_id) values(uid)
  on conflict(user_id) do nothing;
  if target_key = 'think' then
    update public.notification_preferences set think = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'today' then
    update public.notification_preferences set today = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'bond' then
    update public.notification_preferences set bond = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'relationship' then
    update public.notification_preferences set relationship = target_value, updated_at = now() where user_id = uid;
  else
    update public.notification_preferences set left_for_you = target_value, updated_at = now() where user_id = uid;
  end if;
  select * into prefs from public.notification_preferences where user_id = uid;
  return jsonb_build_object(
    'think', prefs.think,
    'today', prefs.today,
    'bond', prefs.bond,
    'relationship', prefs.relationship,
    'left_for_you', prefs.left_for_you
  );
end;
$$;
