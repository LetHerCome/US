-- 20261004110718_f2c_edge_cron_source_of_truth.sql
-- US 2.0 F2C: the seven production pg_cron jobs become executable source of
-- truth, newer than the F2A.2 baseline. From now on a fresh database gets its
-- cron state from this migration; supabase/baseline/90_cron.sql stays the
-- historical F2A.1 capture and is never applied on top of supabase/migrations.
--
-- Each job keeps the name, schedule and command bytes captured in F2A.1
-- (docs/us-2.0/F2A_1_PRODUCTION_CAPTURE_C07_C11B.json, c09), with one change:
-- the five Edge Function calls no longer hard-code the project URL. They read
-- the vault configuration value `us_project_url` (https://<ref>.supabase.co)
-- when the job runs and append /functions/v1/<function>. If the value is
-- missing, the URL is null and the job fails without calling anything.
--
-- Safe on both targets, and idempotent:
--   * production: the seven jobs exist (owner postgres). Each is updated in
--     place with cron.alter_job, keeping its jobid; nothing is unscheduled or
--     duplicated. Before any change, `us_project_url` must be provisioned and
--     equal the URL the live commands call, or the migration aborts.
--   * a fresh database: none exists; each is created with cron.schedule.
--     Provision `us_project_url` before the first run (the jobs fail closed
--     until then).
-- pg_cron keys jobs on (jobname, username). A job with one of these names
-- owned by another role, or a name that already appears twice, aborts the
-- migration instead of adding a second job. The final check requires exactly
-- one job per name, with the intended schedule, command and active = true.

do $f2c$
declare
  project_url text;
  live_base text;
  spec record;
  job record;
  matches integer;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets where name = 'us_project_url' limit 1;
  project_url := rtrim(project_url, '/');

  if project_url is not null and project_url !~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'F2C: vault us_project_url must be the project origin (https://<ref>.supabase.co), got a malformed value';
  end if;

  for spec in select * from (values
    ('us-monthiversary-hourly', '5 * * * *', $cron$
      select net.http_post(
        url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/monthiversary-job',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='us_monthiversary_cron_key' limit 1)
        ),
        body := '{}'::jsonb
      );
    $cron$),
    ('us-widget-scriptable-state-expiry', '* * * * *', $cron$
    update public.widget_tokens as state_token
    set revoked_at = now()
    from public.widget_scriptable_installations as installation
    where state_token.token_hash = installation.state_token_hash
      and installation.expires_at <= now()
      and installation.revoked_at is null
      and state_token.revoked_at is null;
  $cron$),
    ('us-calendar-reminders-dispatch', '* * * * *', $cron$
        select net.http_post(
          url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/calendar-reminders-worker',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_calendar_reminders_cron_key' limit 1)
          ),
          body := '{}'::jsonb
        );
      $cron$),
    ('us-left-for-you-push-sweep', '* * * * *', $cron$
        select net.http_post(
          url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/left-for-you-push-worker',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_left_for_you_push_cron_key' limit 1)
          ),
          body := '{}'::jsonb
        );
      $cron$),
    ('us-daily-question-materialize', '1 * * * *', $cron$select private.materialize_daily_question(private.daily_question_day(now()))$cron$),
    ('us-daily-question-push', '*/10 * * * *', $cron$
        with today as (
          select private.materialize_daily_question(private.daily_question_day(now())) as question
        )
        select net.http_post(
          url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/daily-question-push-worker',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_daily_question_push_cron_key' limit 1)
          ),
          body := '{}'::jsonb
        )
        from today;
      $cron$),
    ('us-game-v2-push', '*/10 * * * *', $cron$
        select net.http_post(
          url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/game-v2-push-worker',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_game_v2_push_cron_key' limit 1)
          ),
          body := '{}'::jsonb
        );
      $cron$)
  ) as s(jobname, schedule, command)
  loop
    select count(*) into matches from cron.job where jobname = spec.jobname;
    if matches > 1 then
      raise exception 'F2C: cron job % exists % times; resolve the duplicate before applying', spec.jobname, matches;
    end if;

    if matches = 0 then
      perform cron.schedule(spec.jobname, spec.schedule, spec.command);
    else
      select * into job from cron.job where jobname = spec.jobname;
      if job.username is distinct from current_user then
        raise exception 'F2C: cron job % is owned by %, not %; refusing to add a second job', spec.jobname, job.username, current_user;
      end if;

      -- A job that still calls a hard-coded URL (production before F2C): the
      -- vault value must be provisioned and be exactly that base URL.
      live_base := substring(job.command from $re$url := '(https?://[^'/]+)/functions/v1/$re$);
      if live_base is not null and project_url is null then
        raise exception 'F2C: provision vault secret us_project_url before applying this migration (cron job % calls %)', spec.jobname, live_base;
      end if;
      if live_base is not null and live_base <> project_url then
        raise exception 'F2C: vault us_project_url (%) differs from the URL cron job % calls today (%)', project_url, spec.jobname, live_base;
      end if;

      perform cron.alter_job(job_id := job.jobid, schedule := spec.schedule, command := spec.command, active := true);
    end if;

    -- Postcondition: exactly one job with this name, in the intended state.
    select count(*) into matches from cron.job where jobname = spec.jobname;
    select * into job from cron.job where jobname = spec.jobname;
    if matches <> 1 or job.schedule <> spec.schedule or job.command <> spec.command or not job.active then
      raise exception 'F2C: cron job % is not in the intended state after this migration (% rows)', spec.jobname, matches;
    end if;
  end loop;

  if project_url is null then
    raise notice 'F2C: vault us_project_url is not provisioned; the Edge cron jobs fail closed until it is';
  end if;
end
$f2c$;
