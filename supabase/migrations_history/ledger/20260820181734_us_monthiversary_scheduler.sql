-- Production ledger 20260820181734 us_monthiversary_scheduler: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 a0c684bede67648aeabdf0a16041d75c; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists(select 1 from vault.secrets where name='us_monthiversary_cron_key') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'us_monthiversary_cron_key','US monthiversary scheduler');
  end if;
end $$;

create or replace function public.get_internal_monthiversary_cron_key()
returns text language sql security definer set search_path='public','vault' as $$
  select decrypted_secret from vault.decrypted_secrets where name='us_monthiversary_cron_key' limit 1
$$;
revoke all on function public.get_internal_monthiversary_cron_key() from public,anon,authenticated;
grant execute on function public.get_internal_monthiversary_cron_key() to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='us-monthiversary-hourly' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'us-monthiversary-hourly',
    '5 * * * *',
    $cron$
      select net.http_post(
        url := 'https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/monthiversary-job',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='us_monthiversary_cron_key' limit 1)
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
end $$;;
