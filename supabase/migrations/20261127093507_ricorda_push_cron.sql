-- Avvisi di US vi ricorda (27/11/2026) — schedule us-ricorda-push-worker (hourly).
--
-- The worker (supabase/functions/us-ricorda-push-worker) acts only at two
-- Rome hours: 10 (a birthday in 7 days or today, the anniversary in 7 days)
-- and 18 («un anno fa», then a memory US hung on the bacheca today). Every
-- other hour it answers "skipped", so no push ever leaves at night. It only
-- answers a caller that presents the Vault secret us_ricorda_push_cron_key
-- (read by public.get_internal_ricorda_push_cron_key, service_role only).
--
-- Same pattern as 20261103205200_weekly_challenge_job_cron: the URL comes
-- from the Vault value us_project_url, the key from the Vault, nothing in
-- clear.
-- * No us_project_url (US-STAGING keeps every US cron off on purpose): nothing
--   is scheduled and nothing changes. On staging the worker is tried by hand.
-- * The cron key is created once, random, if it does not exist; an existing
--   key is kept.
-- * cron.schedule with the same name by the same role updates the job in
--   place, so re-running converges. A job of that name owned by another role
--   aborts the whole file before any change.
-- * No table, grant, RLS or data change.

do $ricorda_push_cron$
declare
  project_url text;
  jobs integer;
begin
  if pg_catalog.to_regclass('cron.job') is null or pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise notice 'ricorda push cron: pg_cron or vault missing, nothing scheduled';
    return;
  end if;

  select pg_catalog.rtrim(decrypted_secret, '/') into project_url
  from vault.decrypted_secrets where name = 'us_project_url' limit 1;
  if project_url is null then
    raise notice 'ricorda push cron: vault us_project_url not provisioned (staging), nothing scheduled';
    return;
  end if;
  if project_url !~ '^https://[A-Za-z0-9.-]+$' then
    raise exception using errcode = 'P0001', message = 'ricorda push cron: vault us_project_url must be https://<ref>.supabase.co';
  end if;

  select pg_catalog.count(*) into jobs from cron.job where jobname = 'us-ricorda-push-hourly';
  if jobs > 1 then
    raise exception using errcode = 'P0001', message = 'ricorda push cron: us-ricorda-push-hourly exists ' || jobs || ' times';
  end if;
  if exists (select 1 from cron.job where jobname = 'us-ricorda-push-hourly' and username is distinct from current_user) then
    raise exception using errcode = 'P0001', message = 'ricorda push cron: us-ricorda-push-hourly is owned by another role';
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'us_ricorda_push_cron_key' and pg_catalog.btrim(coalesce(decrypted_secret, '')) <> ''
  ) then
    perform vault.create_secret(
      pg_catalog.replace(gen_random_uuid()::text, '-', '') || pg_catalog.replace(gen_random_uuid()::text, '-', ''),
      'us_ricorda_push_cron_key'
    );
  end if;

  perform cron.schedule('us-ricorda-push-hourly', '25 * * * *', $cron$
    select net.http_post(
      url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/us-ricorda-push-worker',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_ricorda_push_cron_key' limit 1)
      ),
      body := '{}'::jsonb
    );
  $cron$);
end;
$ricorda_push_cron$;
