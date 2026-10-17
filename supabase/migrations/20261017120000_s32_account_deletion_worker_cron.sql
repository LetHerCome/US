-- US Store S3.2 — schedule account-deletion-worker (hourly).
--
-- The worker (supabase/functions/account-deletion-worker) resumes account
-- deletions and "leave the couple" requests left in pending_cleanup, purges
-- deletion receipts older than 12 months and removes data exports older than
-- 7 days. It is inert unless US_ACCOUNT_DELETION_ENABLED = true and it only
-- answers a caller that presents the Vault secret us_account_deletion_cron_key
-- (read by public.get_internal_account_deletion_cron_key, service_role only).
--
-- Same pattern as the F2C jobs (20261004110718): the URL comes from the Vault
-- value us_project_url, the key from the Vault, nothing is written in clear.
--
-- * No us_project_url (US-STAGING keeps every US cron off on purpose): nothing
--   is scheduled and nothing changes.
-- * The cron key is created once, random, if it does not exist; nobody needs
--   to read it. An existing key is kept.
-- * cron.schedule with the same name by the same role updates the job in
--   place, so re-running converges. A job of that name owned by another role
--   aborts the whole file before any change.
-- * No table, grant, RLS or data change.

do $s32_worker_cron$
declare
  project_url text;
  jobs integer;
begin
  if pg_catalog.to_regclass('cron.job') is null or pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise notice 's32 worker cron: pg_cron or vault missing, nothing scheduled';
    return;
  end if;

  select pg_catalog.rtrim(decrypted_secret, '/') into project_url
  from vault.decrypted_secrets where name = 'us_project_url' limit 1;
  if project_url is null then
    raise notice 's32 worker cron: vault us_project_url not provisioned (staging), nothing scheduled';
    return;
  end if;
  if project_url !~ '^https://[A-Za-z0-9.-]+$' then
    raise exception using errcode = 'P0001', message = 's32 worker cron: vault us_project_url must be https://<ref>.supabase.co';
  end if;

  select pg_catalog.count(*) into jobs from cron.job where jobname = 'us-account-deletion-worker';
  if jobs > 1 then
    raise exception using errcode = 'P0001', message = 's32 worker cron: us-account-deletion-worker exists ' || jobs || ' times';
  end if;
  if exists (select 1 from cron.job where jobname = 'us-account-deletion-worker' and username is distinct from current_user) then
    raise exception using errcode = 'P0001', message = 's32 worker cron: us-account-deletion-worker is owned by another role';
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'us_account_deletion_cron_key' and pg_catalog.btrim(coalesce(decrypted_secret, '')) <> ''
  ) then
    perform vault.create_secret(
      pg_catalog.replace(gen_random_uuid()::text, '-', '') || pg_catalog.replace(gen_random_uuid()::text, '-', ''),
      'us_account_deletion_cron_key'
    );
  end if;

  perform cron.schedule('us-account-deletion-worker', '23 * * * *', $cron$
    select net.http_post(
      url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/account-deletion-worker',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_account_deletion_cron_key' limit 1)
      ),
      body := '{}'::jsonb
    );
  $cron$);
end;
$s32_worker_cron$;
