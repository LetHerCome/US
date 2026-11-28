-- La sfida della settimana, spenta (founder, 28/11/2026: «sfida della settimana
-- spegnila e la puoi anche eliminare»). The redesign took it out of the app
-- (Gioca, fase 6, 24/11), but the hourly cron kept calling weekly-challenge-job,
-- which sends the Monday 9 and Saturday 10 notifications.
--
-- * Removes the cron job us-weekly-challenge-hourly
--   (20261103205200_weekly_challenge_job_cron). After it, the Edge function
--   weekly-challenge-job is deleted from the project by hand (supabase
--   functions delete), never deployed again.
-- * Nothing else changes: tables, photos already linked, points already
--   earned, the functions and the Vault key stay as they are. Deleting the
--   challenge's tables is a separate decision.
-- * US-STAGING has no us_project_url, so there the job never existed and this
--   file changes nothing. Re-applying it changes nothing.
-- * cron.unschedule by name only sees the caller's own jobs: a job of that name
--   owned by another role aborts before any change.

do $sfida_settimana_spenta$
begin
  if pg_catalog.to_regclass('cron.job') is null then
    raise notice 'weekly challenge off: pg_cron missing, nothing to do';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'us-weekly-challenge-hourly' and username is distinct from current_user) then
    raise exception using errcode = 'P0001', message = 'weekly challenge off: us-weekly-challenge-hourly is owned by another role';
  end if;
  if exists (select 1 from cron.job where jobname = 'us-weekly-challenge-hourly') then
    perform cron.unschedule('us-weekly-challenge-hourly');
  end if;
  if exists (select 1 from cron.job where jobname = 'us-weekly-challenge-hourly') then
    raise exception using errcode = 'P0001', message = 'weekly challenge off: us-weekly-challenge-hourly is still scheduled';
  end if;
end;
$sfida_settimana_spenta$;
