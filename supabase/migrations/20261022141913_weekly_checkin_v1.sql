-- Weekly check-in V1 («Il punto della settimana»), founder decisions of
-- 2026-10-22 (D5 exception). Spec: docs/missions/weekly-checkin-v1.md, audit:
-- docs/missions/weekly-checkin-v1-audit.md.
--
-- Once per ISO week (Monday, Europe/Rome, private.bond_week_start_rome) each
-- member answers alone: closeness, energy, appreciation (required) and
-- support. Nothing of the partner leaves the server before both answered;
-- an answer can change only until the partner answers. After the reveal each
-- one may react to the partner's appreciation and keep it in Ricordi.
--
-- * Tables are RPC-only; grants are written out in full because from
--   2026-10-30 Supabase no longer exposes new public tables by default.
-- * Lifecycle: a member's rows go with their profile (FK ON DELETE CASCADE),
--   so leaving the couple and deleting the account need no change; the
--   couple's rows go with the couple. A kept appreciation is a shared memory
--   (Policy A) and stays. The S3.2 export lists the member's own rows.
-- * No XP, streak, reward, cron or retention job.
-- Re-applying this migration changes nothing.

-- Preflight: the export must be the audited S3.2 body, or the body this
-- migration writes (a re-apply). Anything else aborts before any change.
do $weekly_checkin_preflight$
declare body text;
begin
  select pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) into body
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.s32_export_user_data(uuid)');
  if body is null or body not in ('c56f572867f6ec5c6d6ae175c3dbfdd1', 'cf2559e217d506b6fc0995b477d7afc8') then
    raise exception using errcode = 'P0001', message = 'weekly check-in: public.s32_export_user_data is not the audited version',
      detail = coalesce(body, 'missing');
  end if;
end;
$weekly_checkin_preflight$;

-- 1. Answers -----------------------------------------------------------------
create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  closeness smallint check (closeness between 1 and 5),
  closeness_note text check (closeness_note is null or char_length(closeness_note) between 1 and 280),
  energy smallint check (energy between 1 and 5),
  energy_note text check (energy_note is null or char_length(energy_note) between 1 and 280),
  appreciation text not null check (char_length(appreciation) between 1 and 500),
  support_last smallint check (support_last between 1 and 3),
  support_request text check (support_request is null or char_length(support_request) between 1 and 280),
  appreciation_reaction text check (appreciation_reaction in ('heart', 'angry', 'cry')),
  version integer not null default 1 check (version >= 1),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_checkins_one_per_member_week unique (couple_id, week_start, user_id)
);
comment on table public.weekly_checkins is 'Weekly check-in V1: one row per member and ISO week (Monday, Europe/Rome). RPC-only; the partner row is returned only after both answered. Personal data: deleted with the profile (FK cascade).';
comment on column public.weekly_checkins.support_last is 'Answer to the partner''s support request of the previous revealed week: 1 yes, 2 partly, 3 not yet.';
comment on column public.weekly_checkins.appreciation_reaction is 'This member''s reaction to the PARTNER''s appreciation of the same week, after the reveal (Daily vocabulary).';
alter table public.weekly_checkins enable row level security;
alter table public.weekly_checkins force row level security;
revoke all on table public.weekly_checkins from public, anon, authenticated, service_role;
grant select on table public.weekly_checkins to service_role;

-- 2. Kept appreciations (Ricordi, Conservati; M12B.4 model) ------------------
create table if not exists public.weekly_checkin_keepsakes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  source_kind text not null default 'weekly_checkin' check (source_kind = 'weekly_checkin'),
  checkin_id uuid not null,
  source_key text generated always as ('weekly_checkin:' || checkin_id::text) stored,
  week_start date not null,
  author_role text not null check (author_role in ('francesco', 'beatrice')),
  appreciation text not null check (char_length(appreciation) between 1 and 500),
  revealed_at timestamptz not null,
  kept_by_role text not null check (kept_by_role in ('francesco', 'beatrice')),
  kept_at timestamptz not null default now(),
  constraint weekly_checkin_keepsakes_one_per_answer unique (couple_id, checkin_id)
);
comment on table public.weekly_checkin_keepsakes is 'Weekly check-in V1: a revealed appreciation kept by the member it was written for. Server-written snapshot via keep_weekly_appreciation; same-couple read; immutable; stays with the partner when its author leaves (Policy A).';
comment on column public.weekly_checkin_keepsakes.checkin_id is 'The author''s weekly_checkins row at keep time; no FK on purpose, the snapshot outlives it.';
alter table public.weekly_checkin_keepsakes enable row level security;
alter table public.weekly_checkin_keepsakes force row level security;
drop policy if exists weekly_checkin_keepsakes_select_same_couple on public.weekly_checkin_keepsakes;
create policy weekly_checkin_keepsakes_select_same_couple on public.weekly_checkin_keepsakes
  as permissive for select to authenticated using (couple_id = private.current_couple_id());
revoke all on table public.weekly_checkin_keepsakes from public, anon, authenticated, service_role;
grant select on table public.weekly_checkin_keepsakes to authenticated, service_role;

-- 3. Helpers ------------------------------------------------------------------
create or replace function private.weekly_checkin_week(p_week_start date) returns date
language plpgsql stable set search_path = ''
as $fn$
declare current_week date := private.bond_week_start_rome(pg_catalog.now());
begin
  if p_week_start is null then return current_week; end if;
  if extract(isodow from p_week_start) <> 1 or p_week_start > current_week then
    raise exception using errcode = '22023', message = 'weekly_checkin_invalid', detail = 'week_start';
  end if;
  return p_week_start;
end;
$fn$;
revoke all on function private.weekly_checkin_week(date) from public, anon, authenticated, service_role;

create or replace function private.weekly_checkin_json(r public.weekly_checkins, p_own boolean) returns jsonb
language sql immutable set search_path = ''
as $fn$
  select case when r.id is null then null else pg_catalog.jsonb_build_object(
    'closeness', r.closeness, 'closeness_note', r.closeness_note,
    'energy', r.energy, 'energy_note', r.energy_note,
    'appreciation', r.appreciation,
    'support_last', r.support_last, 'support_request', r.support_request,
    'appreciation_reaction', r.appreciation_reaction,
    'submitted_at', r.submitted_at
  ) || case when p_own then pg_catalog.jsonb_build_object('version', r.version) else '{}'::jsonb end end;
$fn$;
revoke all on function private.weekly_checkin_json(public.weekly_checkins, boolean) from public, anon, authenticated, service_role;

-- The partner's support request of the week before p_week, only when that
-- week was revealed (both answered) and the request is not empty.
create or replace function private.weekly_checkin_previous_request(p_couple uuid, p_user uuid, p_week date) returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object('week_start', theirs.week_start, 'text', theirs.support_request)
  from public.weekly_checkins mine
  join public.weekly_checkins theirs
    on theirs.couple_id = mine.couple_id and theirs.week_start = mine.week_start and theirs.user_id <> mine.user_id
  where mine.couple_id = p_couple and mine.user_id = p_user and mine.week_start = p_week - 7
    and theirs.support_request is not null
  limit 1;
$fn$;
revoke all on function private.weekly_checkin_previous_request(uuid, uuid, date) from public, anon, authenticated, service_role;

create or replace function private.weekly_checkin_state(p_couple uuid, p_role text, p_week date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  mine public.weekly_checkins;
  theirs public.weekly_checkins;
  revealed boolean;
begin
  select * into mine from public.weekly_checkins w
    where w.couple_id = p_couple and w.week_start = p_week and w.user_id = uid;
  select * into theirs from public.weekly_checkins w
    where w.couple_id = p_couple and w.week_start = p_week and w.user_id <> uid
    order by w.submitted_at limit 1;
  revealed := mine.id is not null and theirs.id is not null;
  return pg_catalog.jsonb_build_object(
    'week_start', p_week,
    'next_week_start', p_week + 7,
    'me', private.weekly_checkin_json(mine, true),
    'partner_submitted', theirs.id is not null,
    'revealed', revealed,
    'partner', case when revealed then private.weekly_checkin_json(theirs, false) end,
    'previous_request', private.weekly_checkin_previous_request(p_couple, uid, p_week),
    'kept', revealed and exists (
      select 1 from public.weekly_checkin_keepsakes k
      where k.couple_id = p_couple and k.checkin_id = theirs.id and k.kept_by_role = p_role)
  );
end;
$fn$;
revoke all on function private.weekly_checkin_state(uuid, text, date) from public, anon, authenticated, service_role;

-- A text field: absent or null -> null; a string is trimmed, empty -> null.
create or replace function private.weekly_checkin_text(p jsonb, p_key text, p_max integer) returns text
language plpgsql immutable set search_path = ''
as $fn$
declare v text;
begin
  if not (p ? p_key) or pg_catalog.jsonb_typeof(p -> p_key) = 'null' then return null; end if;
  if pg_catalog.jsonb_typeof(p -> p_key) <> 'string' then
    raise exception using errcode = '22023', message = 'weekly_checkin_invalid', detail = p_key;
  end if;
  v := nullif(pg_catalog.btrim(p ->> p_key), '');
  if v is not null and pg_catalog.char_length(v) > p_max then
    raise exception using errcode = '22023', message = 'weekly_checkin_invalid', detail = p_key;
  end if;
  return v;
end;
$fn$;
revoke all on function private.weekly_checkin_text(jsonb, text, integer) from public, anon, authenticated, service_role;

-- A level: absent or null -> null; otherwise a whole number in 1..p_max.
create or replace function private.weekly_checkin_level(p jsonb, p_key text, p_max integer) returns smallint
language plpgsql immutable set search_path = ''
as $fn$
begin
  if not (p ? p_key) or pg_catalog.jsonb_typeof(p -> p_key) = 'null' then return null; end if;
  if pg_catalog.jsonb_typeof(p -> p_key) <> 'number' or (p ->> p_key) !~ '^[0-9]$'
     or (p ->> p_key)::integer not between 1 and p_max then
    raise exception using errcode = '22023', message = 'weekly_checkin_invalid', detail = p_key;
  end if;
  return (p ->> p_key)::smallint;
end;
$fn$;
revoke all on function private.weekly_checkin_level(jsonb, text, integer) from public, anon, authenticated, service_role;

-- 4. Client RPCs --------------------------------------------------------------
create or replace function public.get_weekly_checkin_state(p_week_start date default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare actor record;
begin
  select * into actor from private.m11a_actor();
  return private.weekly_checkin_state(actor.caller_couple, actor.caller_role, private.weekly_checkin_week(p_week_start));
end;
$fn$;
comment on function public.get_weekly_checkin_state(date) is 'Weekly check-in V1: the caller''s week (default: this week). The partner''s answer only after both answered; last week''s partner request only if that week was revealed.';

create or replace function public.submit_weekly_checkin(p_payload jsonb, p_expected_version integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  actor record;
  uid uuid := auth.uid();
  week date;
  mine public.weekly_checkins;
  partner_answered boolean;
  v_closeness smallint; v_energy smallint; v_support_last smallint;
  v_closeness_note text; v_energy_note text; v_appreciation text; v_support_request text;
begin
  select * into actor from private.m11a_actor_locked();
  if not exists (select 1 from public.profiles p where p.couple_id = actor.caller_couple and p.id <> uid) then
    raise exception using errcode = 'P0001', message = 'weekly_checkin_partner_required';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' or p_expected_version is null
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_payload) k
                where k not in ('closeness','closeness_note','energy','energy_note','appreciation','support_last','support_request')) then
    raise exception using errcode = '22023', message = 'weekly_checkin_invalid', detail = 'payload';
  end if;

  week := private.bond_week_start_rome(pg_catalog.now());
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('weekly-checkin:' || actor.caller_couple::text || ':' || week::text, 0));

  v_closeness := private.weekly_checkin_level(p_payload, 'closeness', 5);
  v_energy := private.weekly_checkin_level(p_payload, 'energy', 5);
  v_support_last := private.weekly_checkin_level(p_payload, 'support_last', 3);
  v_closeness_note := private.weekly_checkin_text(p_payload, 'closeness_note', 280);
  v_energy_note := private.weekly_checkin_text(p_payload, 'energy_note', 280);
  v_support_request := private.weekly_checkin_text(p_payload, 'support_request', 280);
  v_appreciation := private.weekly_checkin_text(p_payload, 'appreciation', 500);
  if v_appreciation is null then
    raise exception using errcode = '22023', message = 'weekly_checkin_invalid', detail = 'appreciation';
  end if;
  if v_support_last is not null and private.weekly_checkin_previous_request(actor.caller_couple, uid, week) is null then
    raise exception using errcode = '22023', message = 'weekly_checkin_invalid', detail = 'support_last';
  end if;

  select * into mine from public.weekly_checkins w
    where w.couple_id = actor.caller_couple and w.week_start = week and w.user_id = uid for update;
  partner_answered := exists (select 1 from public.weekly_checkins w
    where w.couple_id = actor.caller_couple and w.week_start = week and w.user_id <> uid);
  if mine.id is not null and partner_answered then
    raise exception using errcode = 'P0001', message = 'weekly_checkin_sealed';
  end if;
  if coalesce(mine.version, 0) <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'weekly_checkin_conflict';
  end if;

  if mine.id is null then
    insert into public.weekly_checkins(couple_id, user_id, week_start, closeness, closeness_note, energy, energy_note,
        appreciation, support_last, support_request)
      values (actor.caller_couple, uid, week, v_closeness, v_closeness_note, v_energy, v_energy_note,
        v_appreciation, v_support_last, v_support_request);
  else
    update public.weekly_checkins set
        closeness = v_closeness, closeness_note = v_closeness_note, energy = v_energy, energy_note = v_energy_note,
        appreciation = v_appreciation, support_last = v_support_last, support_request = v_support_request,
        version = mine.version + 1, updated_at = pg_catalog.now()
      where id = mine.id;
  end if;
  return private.weekly_checkin_state(actor.caller_couple, actor.caller_role, week);
end;
$fn$;
comment on function public.submit_weekly_checkin(jsonb, integer) is 'Weekly check-in V1: insert or edit the caller''s answer for this week. expected_version 0 for a first answer; editing stops once the partner answered (weekly_checkin_sealed).';

create or replace function public.get_weekly_checkin_history(p_weeks integer default 8) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare actor record; uid uuid := auth.uid(); n integer := least(greatest(coalesce(p_weeks, 8), 1), 8);
begin
  select * into actor from private.m11a_actor();
  return pg_catalog.jsonb_build_object('weeks', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('week_start', x.week_start, 'me', x.me, 'partner', x.partner) order by x.week_start)
    from (
      select mine.week_start, mine.closeness me, theirs.closeness partner
      from public.weekly_checkins mine
      join public.weekly_checkins theirs
        on theirs.couple_id = mine.couple_id and theirs.week_start = mine.week_start and theirs.user_id <> mine.user_id
      where mine.couple_id = actor.caller_couple and mine.user_id = uid
      order by mine.week_start desc
      limit n
    ) x), '[]'::jsonb));
end;
$fn$;
comment on function public.get_weekly_checkin_history(integer) is 'Weekly check-in V1: closeness of the last revealed weeks (at most 8), oldest first. Levels only, never texts.';

create or replace function public.set_weekly_checkin_reaction(p_week_start date, p_reaction text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare actor record; uid uuid := auth.uid(); week date; mine_id uuid;
begin
  if p_reaction is not null and p_reaction not in ('heart', 'angry', 'cry') then
    raise exception using errcode = '22023', message = 'weekly_checkin_invalid', detail = 'reaction';
  end if;
  select * into actor from private.m11a_actor_locked();
  week := private.weekly_checkin_week(p_week_start);
  select w.id into mine_id from public.weekly_checkins w
    where w.couple_id = actor.caller_couple and w.week_start = week and w.user_id = uid for update;
  if mine_id is null or not exists (select 1 from public.weekly_checkins w
      where w.couple_id = actor.caller_couple and w.week_start = week and w.user_id <> uid) then
    raise exception using errcode = 'P0001', message = 'weekly_checkin_not_revealed';
  end if;
  update public.weekly_checkins set appreciation_reaction = p_reaction, updated_at = pg_catalog.now() where id = mine_id;
  return private.weekly_checkin_state(actor.caller_couple, actor.caller_role, week);
end;
$fn$;
comment on function public.set_weekly_checkin_reaction(date, text) is 'Weekly check-in V1: caller reaction (heart|angry|cry, null clears) to the PARTNER''s appreciation. Requires both answered.';

create or replace function public.keep_weekly_appreciation(p_week_start date) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  actor record; uid uuid := auth.uid(); week date;
  mine public.weekly_checkins; theirs public.weekly_checkins; author text; kept uuid;
begin
  select * into actor from private.m11a_actor_locked();
  week := private.weekly_checkin_week(p_week_start);
  select * into mine from public.weekly_checkins w
    where w.couple_id = actor.caller_couple and w.week_start = week and w.user_id = uid;
  select * into theirs from public.weekly_checkins w
    where w.couple_id = actor.caller_couple and w.week_start = week and w.user_id <> uid
    order by w.submitted_at limit 1;
  if mine.id is null or theirs.id is null then
    raise exception using errcode = 'P0001', message = 'weekly_checkin_not_revealed';
  end if;
  select p.role into author from public.profiles p where p.id = theirs.user_id;
  insert into public.weekly_checkin_keepsakes(couple_id, checkin_id, week_start, author_role, appreciation, revealed_at, kept_by_role)
    values (actor.caller_couple, theirs.id, week, author, theirs.appreciation,
      greatest(mine.submitted_at, theirs.submitted_at), actor.caller_role)
    on conflict (couple_id, checkin_id) do nothing
    returning id into kept;
  if kept is null then
    select k.id into kept from public.weekly_checkin_keepsakes k
      where k.couple_id = actor.caller_couple and k.checkin_id = theirs.id;
    return pg_catalog.jsonb_build_object('status', 'already_kept', 'id', kept);
  end if;
  return pg_catalog.jsonb_build_object('status', 'kept', 'id', kept);
end;
$fn$;
comment on function public.keep_weekly_appreciation(date) is 'Weekly check-in V1: keep in Ricordi the appreciation the partner wrote for the caller (snapshot, idempotent). Requires both answered.';

revoke all on function public.get_weekly_checkin_state(date) from public, anon, authenticated, service_role;
grant execute on function public.get_weekly_checkin_state(date) to authenticated;
revoke all on function public.submit_weekly_checkin(jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.submit_weekly_checkin(jsonb, integer) to authenticated;
revoke all on function public.get_weekly_checkin_history(integer) from public, anon, authenticated, service_role;
grant execute on function public.get_weekly_checkin_history(integer) to authenticated;
revoke all on function public.set_weekly_checkin_reaction(date, text) from public, anon, authenticated, service_role;
grant execute on function public.set_weekly_checkin_reaction(date, text) to authenticated;
revoke all on function public.keep_weekly_appreciation(date) from public, anon, authenticated, service_role;
grant execute on function public.keep_weekly_appreciation(date) to authenticated;

-- 5. S3.2 export: the member's own check-ins ----------------------------------
-- Same body as 20261014120000, plus personal.weekly_checkins.
create or replace function public.s32_export_user_data(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare cid uuid; prof jsonb; cpl jsonb; media text[];
  strip constant text[] := array['couple_id','recipient_id','owner_id','user_id','sender_id','created_by','author_id','profile_id'];
begin
  if p_user is null then raise exception using errcode = '22023', message = 'user_required'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;
  select p.couple_id, pg_catalog.jsonb_build_object('display_name', p.display_name, 'role', p.role, 'created_at', p.created_at)
    into cid, prof from public.profiles p where p.id = p_user;
  select pg_catalog.jsonb_build_object('name', c.name, 'started_on', c.started_on, 'created_at', c.created_at)
    into cpl from public.couples c where c.id = cid;

  select coalesce(pg_catalog.array_agg(distinct p order by p), '{}') into media from (
    select m.storage_path p from public.moments m where m.couple_id = cid and m.created_by = p_user
    union all select m.thumbnail_path from public.moments m where m.couple_id = cid and m.created_by = p_user
    union all select mp.storage_path from public.moment_photos mp where mp.couple_id = cid and mp.created_by = p_user
    union all select l.media_path from public.left_for_you l where l.couple_id = cid and l.sender_id = p_user
    union all select s.media_path from public.stories s where s.couple_id = cid and s.author_id = p_user
    union all select pr.avatar_path from public.profiles pr where pr.id = p_user
  ) x where p is not null and p <> '' and pg_catalog.starts_with(p, cid::text || '/');

  return pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'user_id', p_user,
    'profile', prof,
    'couple', cpl,
    'personal', pg_catalog.jsonb_build_object(
      'daily_answers', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'question_date', q.question_date, 'question', q.question, 'answer', a.answer, 'created_at', a.created_at) order by a.created_at), '[]')
        from public.daily_answers a left join public.daily_questions q on q.id = a.question_id where a.user_id = p_user),
      'moods', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.moods x where x.user_id = p_user),
      'quiz_responses', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.quiz_responses x where x.user_id = p_user),
      'partner_knowledge_attempts', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.completed_at), '[]') from public.partner_knowledge_attempts x where x.user_id = p_user),
      'personal_calendar', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.calendar_entries x where x.entry_type = 'personal' and x.owner_id = p_user),
      'location', (select pg_catalog.to_jsonb(x) - strip from public.couple_locations x where x.user_id = p_user),
      'notification_preferences', (select pg_catalog.to_jsonb(x) - strip from public.notification_preferences x where x.user_id = p_user),
      'weekly_checkins', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip - 'id' - 'version' order by x.week_start), '[]') from public.weekly_checkins x where x.user_id = p_user)
    ),
    'created', pg_catalog.jsonb_build_object(
      'moments', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.moments x where x.couple_id = cid and x.created_by = p_user),
      'moment_photos', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.moment_photos x where x.couple_id = cid and x.created_by = p_user),
      'messages_sent', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.shared_messages x where x.couple_id = cid and x.sender_id = p_user),
      'left_for_you_sent', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.left_for_you x where x.couple_id = cid and x.sender_id = p_user),
      'stories', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.stories x where x.couple_id = cid and x.author_id = p_user),
      'shared_calendar', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.calendar_entries x where x.couple_id = cid and x.entry_type = 'shared' and x.created_by = p_user),
      'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.shared_events x where x.couple_id = cid and x.created_by = p_user),
      'wishes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip - 'lived_proposed_by' order by x.created_at), '[]') from public.bucket_items x where x.couple_id = cid and x.created_by = p_user)
    ),
    'media', pg_catalog.to_jsonb(media)
  );
end;
$fn$;
revoke all on function public.s32_export_user_data(uuid) from public, anon, authenticated;
grant execute on function public.s32_export_user_data(uuid) to service_role;
