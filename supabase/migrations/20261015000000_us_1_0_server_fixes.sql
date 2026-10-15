-- US 1.0 server fixes (founder-approved audit scope B, 2026-10-14).
-- Runs after 20261014230000_us_1_0_locale_content_en. Re-applying it changes
-- nothing. No row, table, function or Edge Function is deleted, and no
-- function body is replaced.
--
-- 1. N8 Calendar reminders: they can no longer be created, so the every-minute
--    pg_cron job us-calendar-reminders-dispatch is unscheduled. The reminders
--    already stored, the calendar-reminders-worker Edge Function and its vault
--    key stay: the job comes back in 1.1 (same name and command as F2C,
--    20261004110718). Absent job = nothing to do.
-- 2. T4 Table privileges. Every US API call runs signed in (role
--    authenticated); RLS already shows anon nothing. Revoked:
--      - from anon and authenticated, on every table of schema public:
--        TRUNCATE (it bypasses RLS: anon could empty shared_messages),
--        REFERENCES, TRIGGER and, on PostgreSQL 17+, MAINTAIN. The app never
--        uses them (PostgREST only selects, inserts, updates, deletes);
--      - from anon, on every table of schema public: INSERT, UPDATE, DELETE,
--        every column grant, and SELECT except on public.profiles (the MC2
--        migration verifies that anon keeps SELECT there; its RLS policy is
--        TO authenticated, so anon still reads no row);
--      - Stories (stories.js reads, adds and removes stories, adds views):
--        UPDATE on public.stories and UPDATE, DELETE on public.story_views
--        from authenticated. anon loses everything on both (above).
--    service_role and the table owner are untouched. Nothing is granted.
--
-- The other US 1.0 server fixes live in the Edge Functions (deploy after this
-- file): delete-moment (R2), monthiversary-job (A11/N7), send-web-push (A2,
-- A6, N5, O2, O7), game-v2-push and game-v2-push-worker (G11),
-- daily-question-push-worker (O3), left-for-you-push-worker and
-- widget-think-send (shared copy and language).

-- Preflight: the objects this file narrows exist, and the cron job, when
-- present, is the single F2C job owned by the applying role (cron.unschedule
-- by name only sees the caller's own jobs). Anything else aborts first.
do $us_1_0_server_fixes_preflight$
declare jobs integer;
begin
  if pg_catalog.to_regclass('public.stories') is null or pg_catalog.to_regclass('public.story_views') is null
    or pg_catalog.to_regclass('public.shared_messages') is null or pg_catalog.to_regclass('public.profiles') is null then
    raise exception using errcode = 'P0001', message = 'us 1.0 server fixes: stories, story_views, shared_messages or profiles is missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
    or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception using errcode = 'P0001', message = 'us 1.0 server fixes: roles anon and authenticated are required';
  end if;
  if pg_catalog.to_regclass('cron.job') is not null then
    select pg_catalog.count(*) into jobs from cron.job where jobname = 'us-calendar-reminders-dispatch';
    if jobs > 1 then
      raise exception using errcode = 'P0001', message = 'us 1.0 server fixes: cron job us-calendar-reminders-dispatch exists ' || jobs || ' times';
    end if;
    if exists (select 1 from cron.job where jobname = 'us-calendar-reminders-dispatch' and username is distinct from current_user) then
      raise exception using errcode = 'P0001', message = 'us 1.0 server fixes: cron job us-calendar-reminders-dispatch is owned by another role';
    end if;
  end if;
end;
$us_1_0_server_fixes_preflight$;

-- 1. N8: the reminder dispatch stops; data and worker stay -------------------
do $us_1_0_calendar_reminders_off$
begin
  if pg_catalog.to_regclass('cron.job') is not null
    and exists (select 1 from cron.job where jobname = 'us-calendar-reminders-dispatch') then
    perform cron.unschedule('us-calendar-reminders-dispatch');
  end if;
end;
$us_1_0_calendar_reminders_off$;

-- 2. T4: table privileges ----------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
revoke update on table public.stories from authenticated;
revoke update, delete on table public.story_views from authenticated;

do $us_1_0_table_privileges$
declare r record;
begin
  if pg_catalog.current_setting('server_version_num')::integer >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
  end if;
  -- anon SELECT, except public.profiles (MC2 invariant, see above).
  for r in
    select c.oid::regclass as rel
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and a.grantee = 'anon'::regrole and a.privilege_type = 'SELECT'
      and c.oid <> 'public.profiles'::regclass
  loop
    execute pg_catalog.format('revoke select on table %s from anon', r.rel);
  end loop;
  -- Column grants to anon, if any environment has one.
  for r in
    select distinct a.attrelid::regclass as rel, a.attname
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(a.attacl) g
    where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and g.grantee = 'anon'::regrole
  loop
    execute pg_catalog.format('revoke all (%I) on table %s from anon', r.attname, r.rel);
  end loop;
end;
$us_1_0_table_privileges$;

-- Postconditions: the intended state, or the whole file rolls back.
do $us_1_0_server_fixes_check$
declare left_over text;
begin
  if pg_catalog.to_regclass('cron.job') is not null
    and exists (select 1 from cron.job where jobname = 'us-calendar-reminders-dispatch') then
    raise exception using errcode = 'P0001', message = 'us 1.0 server fixes: us-calendar-reminders-dispatch is still scheduled';
  end if;
  select c.oid::regclass::text || ' ' || a.privilege_type || ' to ' || pg_catalog.pg_get_userbyid(a.grantee) into left_over
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(c.relacl) a
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and (
      (a.grantee = 'anon'::regrole and not (c.oid = 'public.profiles'::regclass and a.privilege_type = 'SELECT'))
      or (a.grantee = 'authenticated'::regrole and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'))
    )
  limit 1;
  if left_over is not null then
    raise exception using errcode = 'P0001', message = 'us 1.0 server fixes: a revoked table privilege is still granted', detail = left_over;
  end if;
  select a.attrelid::regclass::text || '.' || a.attname into left_over
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(a.attacl) g
  where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and g.grantee = 'anon'::regrole
  limit 1;
  if left_over is not null then
    raise exception using errcode = 'P0001', message = 'us 1.0 server fixes: anon still holds a column privilege', detail = left_over;
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.stories', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.story_views', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.story_views', 'DELETE') then
    raise exception using errcode = 'P0001', message = 'us 1.0 server fixes: Stories privileges are still wider than the app needs';
  end if;
end;
$us_1_0_server_fixes_check$;
