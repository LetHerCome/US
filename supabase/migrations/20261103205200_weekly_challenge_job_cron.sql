-- La sfida della settimana — schedule weekly-challenge-job (hourly).
--
-- The job (supabase/functions/weekly-challenge-job) acts only at two Rome
-- hours: Monday at 9 («La sfida della settimana», with its title) and
-- Saturday at 10 (a reminder to whoever has not sent a photo yet). Both obey
-- the notification preference of the challenge. Every other hour it answers
-- "skipped". It only answers a caller that presents the Vault secret
-- us_weekly_challenge_cron_key (read by
-- public.get_internal_weekly_challenge_cron_key, service_role only).
--
-- Same pattern as 20261017120000 (account-deletion-worker): the URL comes from
-- the Vault value us_project_url, the key from the Vault, nothing in clear.
--
-- * No us_project_url (US-STAGING keeps every US cron off on purpose): nothing
--   is scheduled and nothing changes.
-- * The cron key is created once, random, if it does not exist; an existing
--   key is kept.
-- * cron.schedule with the same name by the same role updates the job in
--   place, so re-running converges. A job of that name owned by another role
--   aborts the whole file before any change.
-- * No table, grant, RLS or data change.

do $weekly_challenge_cron$
declare
  project_url text;
  jobs integer;
begin
  if pg_catalog.to_regclass('cron.job') is null or pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise notice 'weekly challenge cron: pg_cron or vault missing, nothing scheduled';
    return;
  end if;

  select pg_catalog.rtrim(decrypted_secret, '/') into project_url
  from vault.decrypted_secrets where name = 'us_project_url' limit 1;
  if project_url is null then
    raise notice 'weekly challenge cron: vault us_project_url not provisioned (staging), nothing scheduled';
    return;
  end if;
  if project_url !~ '^https://[A-Za-z0-9.-]+$' then
    raise exception using errcode = 'P0001', message = 'weekly challenge cron: vault us_project_url must be https://<ref>.supabase.co';
  end if;

  select pg_catalog.count(*) into jobs from cron.job where jobname = 'us-weekly-challenge-hourly';
  if jobs > 1 then
    raise exception using errcode = 'P0001', message = 'weekly challenge cron: us-weekly-challenge-hourly exists ' || jobs || ' times';
  end if;
  if exists (select 1 from cron.job where jobname = 'us-weekly-challenge-hourly' and username is distinct from current_user) then
    raise exception using errcode = 'P0001', message = 'weekly challenge cron: us-weekly-challenge-hourly is owned by another role';
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'us_weekly_challenge_cron_key' and pg_catalog.btrim(coalesce(decrypted_secret, '')) <> ''
  ) then
    perform vault.create_secret(
      pg_catalog.replace(gen_random_uuid()::text, '-', '') || pg_catalog.replace(gen_random_uuid()::text, '-', ''),
      'us_weekly_challenge_cron_key'
    );
  end if;

  perform cron.schedule('us-weekly-challenge-hourly', '12 * * * *', $cron$
    select net.http_post(
      url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/weekly-challenge-job',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_weekly_challenge_cron_key' limit 1)
      ),
      body := '{}'::jsonb
    );
  $cron$);
end;
$weekly_challenge_cron$;
