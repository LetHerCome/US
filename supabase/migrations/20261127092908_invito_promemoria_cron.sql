-- L'invito che si rinnova — schedule invite-reminder-job (hourly).
--
-- The job (supabase/functions/invite-reminder-job) acts only at 18 in Rome:
-- whoever created the couple and still waits for the other person gets «manda
-- il codice alla tua persona» the day after and three days after the couple
-- was made (once each, push_event_log dedupe). Every other hour it answers
-- "skipped". It only answers a caller that presents the Vault secret
-- us_invite_reminder_cron_key (read by
-- public.get_internal_invite_reminder_cron_key, service_role only).
--
-- Same pattern as 20261103205200 (weekly-challenge-job): the URL comes from
-- the Vault value us_project_url, the key from the Vault, nothing in clear.
--
-- * No us_project_url (US-STAGING keeps every US cron off on purpose): the
--   key reader is created, nothing is scheduled.
-- * The cron key is created once, random, if it does not exist; an existing
--   key is kept.
-- * cron.schedule with the same name by the same role updates the job in
--   place, so re-running converges. A job of that name owned by another role
--   aborts the whole file before any change.
-- * No table, grant to clients, RLS or data change.

create or replace function public.get_internal_invite_reminder_cron_key()
 returns text
 language sql
 security definer
 set search_path to ''
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'us_invite_reminder_cron_key' limit 1
$function$;

revoke all on function public.get_internal_invite_reminder_cron_key() from public, anon, authenticated, service_role;
grant execute on function public.get_internal_invite_reminder_cron_key() to service_role;

do $invite_reminder_cron$
declare
  project_url text;
  jobs integer;
begin
  if pg_catalog.to_regclass('cron.job') is null or pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise notice 'invite reminder cron: pg_cron or vault missing, nothing scheduled';
    return;
  end if;

  select pg_catalog.rtrim(decrypted_secret, '/') into project_url
  from vault.decrypted_secrets where name = 'us_project_url' limit 1;
  if project_url is null then
    raise notice 'invite reminder cron: vault us_project_url not provisioned (staging), nothing scheduled';
    return;
  end if;
  if project_url !~ '^https://[A-Za-z0-9.-]+$' then
    raise exception using errcode = 'P0001', message = 'invite reminder cron: vault us_project_url must be https://<ref>.supabase.co';
  end if;

  select pg_catalog.count(*) into jobs from cron.job where jobname = 'us-invite-reminder-hourly';
  if jobs > 1 then
    raise exception using errcode = 'P0001', message = 'invite reminder cron: us-invite-reminder-hourly exists ' || jobs || ' times';
  end if;
  if exists (select 1 from cron.job where jobname = 'us-invite-reminder-hourly' and username is distinct from current_user) then
    raise exception using errcode = 'P0001', message = 'invite reminder cron: us-invite-reminder-hourly is owned by another role';
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'us_invite_reminder_cron_key' and pg_catalog.btrim(coalesce(decrypted_secret, '')) <> ''
  ) then
    perform vault.create_secret(
      pg_catalog.replace(gen_random_uuid()::text, '-', '') || pg_catalog.replace(gen_random_uuid()::text, '-', ''),
      'us_invite_reminder_cron_key'
    );
  end if;

  perform cron.schedule('us-invite-reminder-hourly', '17 * * * *', $cron$
    select net.http_post(
      url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/invite-reminder-job',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_invite_reminder_cron_key' limit 1)
      ),
      body := '{}'::jsonb
    );
  $cron$);
end;
$invite_reminder_cron$;
