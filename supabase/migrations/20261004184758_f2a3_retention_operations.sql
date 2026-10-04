-- US 2.0 F2A.3: bounded technical retention, never product history.
-- Created with Supabase CLI 2.117.0: supabase migration new f2a3_retention_operations.
-- Both NEW jobs start paused. Before enabling either destructive worker:
-- fresh off-site logical DB dump (Free plan), then follow F2A3_ROLLOUT.md.
-- No Vault values are provisioned; no retention runs during this migration.

create or replace function private.run_operational_retention()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $retention$
declare
  cutoff_30 timestamptz := now() - interval '30 days';
  affected bigint;
  counts jsonb := '{}'::jsonb;
begin
  -- Only the established cron owner may perform housekeeping. No JWT can
  -- turn a client/service API session into the database cron owner.
  if current_user <> 'postgres' then
    raise exception 'F2A3: operational retention requires the cron owner' using errcode = '42501';
  end if;

  delete from cron.job_run_details
  where status = 'succeeded' and end_time < now() - interval '14 days';
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('cron_success', affected);

  -- Null end_time (unfinished runs) is deliberately retained.
  delete from cron.job_run_details
  where status <> 'succeeded' and end_time < cutoff_30;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('cron_unsuccessful', affected);

  -- push_event_log is a persistent idempotency ledger. Some authenticated
  -- fast paths can validly reference old source rows; pruning the dedupe key
  -- would allow an old logical event to be notified again.

  -- Receipts and linked installations use the EXISTING token FK cascades.
  -- Do not prune receipts independently: live credentials keep idempotency.
  delete from public.widget_action_tokens
  where revoked_at < cutoff_30 or expires_at < cutoff_30;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('widget_action_tokens', affected);

  delete from public.widget_tokens where revoked_at < cutoff_30;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('widget_tokens', affected);

  delete from public.widget_scriptable_setup_codes
  where consumed_at < cutoff_30 or revoked_at < cutoff_30 or expires_at < cutoff_30;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('widget_scriptable_setup_codes', affected);

  delete from public.widget_scriptable_installations
  where revoked_at < cutoff_30 or expires_at < cutoff_30;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('widget_scriptable_installations', affected);

  -- Pending Storage outbox entries must survive regardless of their age.
  delete from private.left_for_you_cleanup_queue where completed_at < cutoff_30;
  get diagnostics affected = row_count;
  return counts || jsonb_build_object('left_for_you_cleanup_queue', affected);
end;
$retention$;
alter function private.run_operational_retention() owner to postgres;
revoke all on function private.run_operational_retention() from public, anon, authenticated, service_role;

-- Same service-only dedicated cron-auth pattern as the existing workers.
create or replace function public.get_internal_left_for_you_cleanup_cron_key()
returns text
language sql
stable
security definer
set search_path = ''
as $key$
  select nullif(btrim(decrypted_secret), '')
  from vault.decrypted_secrets
  where name = 'us_left_for_you_cleanup_cron_key'
  limit 1;
$key$;
alter function public.get_internal_left_for_you_cleanup_cron_key() owner to postgres;
revoke all on function public.get_internal_left_for_you_cleanup_cron_key() from public, anon, authenticated, service_role;
grant execute on function public.get_internal_left_for_you_cleanup_cron_key() to service_role;

do $f2a3$
declare
  spec record;
  job record;
  matches integer;
  new_job_id bigint;
begin
  if current_user <> 'postgres' then
    raise exception 'F2A3: migration must run as the established cron owner postgres';
  end if;

  -- Serialize this mission's scheduling; pg_cron keys names per owner.
  perform pg_advisory_xact_lock(hashtextextended('us-f2a3-cron-registration', 0));
  for spec in select * from (values
    ('us-operational-retention-daily', '20 3 * * *', $cron$select private.run_operational_retention();$cron$),
    ('us-left-for-you-cleanup-daily', '40 3 * * *', $cron$
      select net.http_post(
        url := rtrim(config.project_url, '/') || '/functions/v1/cleanup-left-for-you',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-us-cron-key', config.cron_key),
        body := '{}'::jsonb
      )
      from (
        select
          (select nullif(btrim(decrypted_secret), '') from vault.decrypted_secrets where name = 'us_project_url' limit 1) as project_url,
          (select nullif(btrim(decrypted_secret), '') from vault.decrypted_secrets where name = 'us_left_for_you_cleanup_cron_key' limit 1) as cron_key
      ) as config
      where config.project_url ~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?/?$'
        and config.cron_key is not null;
    $cron$)
  ) as s(jobname, schedule, command)
  loop
    select count(*) into matches from cron.job where jobname = spec.jobname;
    if matches > 1 then
      raise exception 'F2A3: cron job % exists % times; resolve duplicates before applying', spec.jobname, matches;
    end if;
    if matches = 0 then
      new_job_id := cron.schedule(spec.jobname, spec.schedule, spec.command);
      perform cron.alter_job(job_id := new_job_id, active := false);
    else
      select * into job from cron.job where jobname = spec.jobname;
      if job.username is distinct from current_user then
        raise exception 'F2A3: cron job % has another owner %; refusing a duplicate', spec.jobname, job.username;
      end if;
      if job.schedule is distinct from spec.schedule or job.command is distinct from spec.command
        or job.database is distinct from current_database() then
        raise exception 'F2A3: cron job % has drifted; review before applying', spec.jobname;
      end if;
      -- Preserve active, jobid and command bytes; never reactivate on reapply.
    end if;
    select count(*) into matches from cron.job where jobname = spec.jobname;
    select * into job from cron.job where jobname = spec.jobname;
    if matches <> 1 or job.username is distinct from current_user
      or job.database is distinct from current_database()
      or job.schedule is distinct from spec.schedule or job.command is distinct from spec.command then
      raise exception 'F2A3: cron job % failed its registration postcondition', spec.jobname;
    end if;
  end loop;
end;
$f2a3$;
