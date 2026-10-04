-- Production ledger 20260820193608 settings2_notification_preferences: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 02b9edb7172f89cf088c99a9308610dd; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  think boolean not null default true,
  today boolean not null default true,
  bond boolean not null default true,
  relationship boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select_self on public.notification_preferences;
create policy notification_preferences_select_self on public.notification_preferences for select using (user_id = auth.uid());

drop policy if exists notification_preferences_insert_self on public.notification_preferences;
create policy notification_preferences_insert_self on public.notification_preferences for insert with check (user_id = auth.uid());

drop policy if exists notification_preferences_update_self on public.notification_preferences;
create policy notification_preferences_update_self on public.notification_preferences for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.notification_preferences to authenticated;

create or replace function public.get_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare uid uuid:=auth.uid(); prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into prefs from public.notification_preferences where user_id=uid;
  if not found then
    insert into public.notification_preferences(user_id) values(uid)
    on conflict(user_id) do nothing;
    select * into prefs from public.notification_preferences where user_id=uid;
  end if;
  return jsonb_build_object('think',prefs.think,'today',prefs.today,'bond',prefs.bond,'relationship',prefs.relationship);
end;
$$;

grant execute on function public.get_notification_preferences() to authenticated;

create or replace function public.set_notification_preference(target_key text, target_value boolean)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare uid uuid:=auth.uid(); prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_key not in ('think','today','bond','relationship') then raise exception 'Invalid preference'; end if;
  insert into public.notification_preferences(user_id) values(uid) on conflict(user_id) do nothing;
  if target_key='think' then update public.notification_preferences set think=target_value,updated_at=now() where user_id=uid;
  elsif target_key='today' then update public.notification_preferences set today=target_value,updated_at=now() where user_id=uid;
  elsif target_key='bond' then update public.notification_preferences set bond=target_value,updated_at=now() where user_id=uid;
  else update public.notification_preferences set relationship=target_value,updated_at=now() where user_id=uid;
  end if;
  select * into prefs from public.notification_preferences where user_id=uid;
  return jsonb_build_object('think',prefs.think,'today',prefs.today,'bond',prefs.bond,'relationship',prefs.relationship);
end;
$$;

grant execute on function public.set_notification_preference(text,boolean) to authenticated;;
