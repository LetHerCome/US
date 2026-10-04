-- 20261004150000_sec_rls_hardening.sql
-- US 2.0 Security / RLS hardening: the two findings of the security audit
-- that have a demonstrated access path (docs/us-2.0/SEC_RLS_AUDIT.md).
-- Newer than the F2A.2 baseline and F2C. No data is changed, no function body
-- is changed, no client-visible behavior of the app changes.
--
--   SEC-01  couples.home_photo_path is client-writable (F1C column grant) with
--           no shape check, and the us-widget-state Edge Function signs it
--           with the service key (bypassing Storage RLS). A member could point
--           it at another couple's object and read it through the widget. The
--           CHECK pins it to the couple's own folder `<couple id>/...`.
--   SEC-02  calendar_reminder_recipient_in_couple / calendar_reminder_offset_valid
--           are SECURITY DEFINER and executable by every signed-in user: they
--           answer membership / all-day questions for ANY couple, entry or
--           user id (F1B P2). Since F1C only service_role writes
--           calendar_reminders, so the CHECK constraints that call them only
--           run as service_role (or a definer owner). authenticated loses EXECUTE.
--
-- Fails closed: the preconditions below abort the migration (nothing applied)
-- if production is not in the audited state, and the final self-check aborts
-- if any postcondition does not hold. Re-applying it changes nothing.

do $sec_pre$
declare
  bad integer;
begin
  if to_regprocedure('public.calendar_reminder_recipient_in_couple(uuid,uuid)') is null
     or to_regprocedure('public.calendar_reminder_offset_valid(uuid,integer)') is null then
    raise exception 'SEC: calendar reminder CHECK helpers missing; production is not in the audited state';
  end if;
  if has_table_privilege('authenticated', 'public.calendar_reminders', 'INSERT')
     or has_table_privilege('anon', 'public.calendar_reminders', 'INSERT') then
    raise exception 'SEC: a client role can INSERT into calendar_reminders again; review SEC-02 before applying';
  end if;
  select count(*) into bad from public.couples c
  where c.home_photo_path is not null
    and not (starts_with(c.home_photo_path, c.id::text || '/') and position('..' in c.home_photo_path) = 0);
  if bad > 0 then
    raise exception 'SEC: % couples row(s) have a home_photo_path outside the couple folder; fix the data first', bad;
  end if;
end
$sec_pre$;

-- SEC-01 ---------------------------------------------------------------------
alter table public.couples drop constraint if exists couples_home_photo_path_own_folder;
alter table public.couples
  add constraint couples_home_photo_path_own_folder check (
    home_photo_path is null
    or (starts_with(home_photo_path, id::text || '/') and position('..' in home_photo_path) = 0)
  );
comment on constraint couples_home_photo_path_own_folder on public.couples is
  'US 2.0 SEC-01: the home photo must live in the couple''s own us-media folder. us-widget-state signs this path with the service key.';

-- SEC-02 ---------------------------------------------------------------------
revoke execute on function public.calendar_reminder_recipient_in_couple(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.calendar_reminder_offset_valid(uuid, integer) from public, anon, authenticated;

do $sec_post$
begin
  if has_function_privilege('authenticated', 'public.calendar_reminder_recipient_in_couple(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.calendar_reminder_offset_valid(uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.calendar_reminder_recipient_in_couple(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.calendar_reminder_offset_valid(uuid,integer)', 'EXECUTE') then
    raise exception 'SEC: a client role can still execute a calendar reminder CHECK helper';
  end if;
  if not has_function_privilege('service_role', 'public.calendar_reminder_recipient_in_couple(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.calendar_reminder_offset_valid(uuid,integer)', 'EXECUTE') then
    raise exception 'SEC: service_role lost EXECUTE on a calendar reminder CHECK helper (the reminder worker needs it)';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.couples'::regclass and conname = 'couples_home_photo_path_own_folder' and convalidated) then
    raise exception 'SEC: couples_home_photo_path_own_folder is missing or not validated';
  end if;
end
$sec_post$;
