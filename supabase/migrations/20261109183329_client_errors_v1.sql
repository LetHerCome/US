-- Errori dell'app (09/11/2026, dopo l'ispezione verso l'uscita pubblica).
--
-- Today a JavaScript error on someone's phone is seen by nobody: there is no
-- crash reporting and the in-app reports are 0. The app now sends its own
-- errors here, with no third-party service:
--
-- * private.client_errors keeps only technical facts: the error message (at
--   most 300 characters, the app strips addresses and long numbers first),
--   the file and line, the build, the platform. Never what a couple wrote.
-- * Rows belong to an account and go with it (ON DELETE CASCADE on auth.users),
--   and the daily operational retention deletes them after 30 days.
-- * Only public.report_client_errors() writes, for a signed-in caller and for
--   that caller only: at most 20 rows per call and 50 per account per day, so a
--   broken loop on one phone cannot fill the table. Invalid items are skipped,
--   never an error back to the app.
-- * Nobody reads through the API: the schema private is not exposed, the table
--   has RLS and no policy, and only the founder reads it (SQL, aggregated).
-- Re-applying the function parts changes nothing; the table is created once.

create table private.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  build text not null check (char_length(build) between 1 and 64),
  platform text not null check (platform in ('android', 'ios', 'web')),
  kind text not null check (kind in ('error', 'rejection')),
  message text not null check (char_length(message) between 1 and 300),
  source text check (char_length(source) <= 200),
  line integer check (line >= 0),
  col integer check (col >= 0),
  repeats integer not null default 1 check (repeats between 1 and 1000)
);

comment on table private.client_errors is 'Errori JavaScript dell''app (09/11/2026): solo dati tecnici, 30 giorni, scritti da public.report_client_errors().';

create index client_errors_user_created_idx on private.client_errors (user_id, created_at);
create index client_errors_created_idx on private.client_errors (created_at);

alter table private.client_errors enable row level security;
revoke all on table private.client_errors from public, anon, authenticated, service_role;

create or replace function public.report_client_errors(errors jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $report$
declare
  caller uuid := auth.uid();
  room integer;
  saved integer;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if errors is null or jsonb_typeof(errors) <> 'array' then
    return 0;
  end if;

  -- One call at a time per account, so two tabs cannot both use the last room.
  perform pg_advisory_xact_lock(hashtextextended('us-client-errors:' || caller::text, 0));
  select 50 - count(*)::integer into room
    from private.client_errors
   where user_id = caller and created_at > now() - interval '1 day';
  if room <= 0 then
    return 0;
  end if;

  insert into private.client_errors (user_id, build, platform, kind, message, source, line, col, repeats)
  select caller,
         left(item ->> 'build', 64),
         item ->> 'platform',
         item ->> 'kind',
         left(btrim(item ->> 'message'), 300),
         nullif(left(btrim(coalesce(item ->> 'source', '')), 200), ''),
         case when (item ->> 'line') ~ '^[0-9]{1,9}$' then (item ->> 'line')::integer end,
         case when (item ->> 'col') ~ '^[0-9]{1,9}$' then (item ->> 'col')::integer end,
         case when (item ->> 'repeats') ~ '^[0-9]{1,4}$' then least(greatest((item ->> 'repeats')::integer, 1), 1000) else 1 end
    from (
      select value as item
        from jsonb_array_elements(errors)
       where jsonb_typeof(value) = 'object'
       limit 20
    ) as given
   where item ->> 'platform' in ('android', 'ios', 'web')
     and item ->> 'kind' in ('error', 'rejection')
     and char_length(coalesce(item ->> 'build', '')) between 1 and 64
     and char_length(btrim(coalesce(item ->> 'message', ''))) >= 1
   limit room;
  get diagnostics saved = row_count;
  return saved;
end;
$report$;

comment on function public.report_client_errors(jsonb) is 'Errori dell''app (09/11/2026): salva al massimo 20 errori per chiamata e 50 al giorno per l''account che chiama; mai dati della coppia.';

alter function public.report_client_errors(jsonb) owner to postgres;
revoke all on function public.report_client_errors(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.report_client_errors(jsonb) to authenticated;

-- The daily operational retention (cron us-operational-retention-daily, owner
-- postgres) also deletes errors older than 30 days. Same body as F2A3, plus
-- one step before the outbox.
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

  -- Errori dell'app (09/11/2026): technical facts only, kept 30 days.
  delete from private.client_errors where created_at < cutoff_30;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('client_errors', affected);

  -- Pending Storage outbox entries must survive regardless of their age.
  delete from private.left_for_you_cleanup_queue where completed_at < cutoff_30;
  get diagnostics affected = row_count;
  return counts || jsonb_build_object('left_for_you_cleanup_queue', affected);
end;
$retention$;
alter function private.run_operational_retention() owner to postgres;
revoke all on function private.run_operational_retention() from public, anon, authenticated, service_role;
