-- US Store 1.0 — leave the couple, reports, data export (founder decisions 3
-- and 8 of 2026-10-14, on top of account deletion v1).
--
-- * Leaving the couple closes the couple space exactly as an account deletion
--   does (Policy A, D-5 separation) but keeps both accounts: the leaving
--   member's profile goes (MC2: no profile = onboarding), their personal data
--   in that couple goes, the shared content stays with the partner without
--   author. The last member leaving erases the couple space.
-- * Reports ("Segnala") are write-only for the app and read by the operator.
-- * The data export is prepared by the operator on request (Edge
--   export-user-data); this file only provides the data and the private bucket.
-- Every new entry point except submit_user_report is service_role only.

-- 1. Closing a membership (shared by account deletion and leaving) ----------
-- Returns {mode, couple_id, storage_prefix}. Caller holds the user lock.
create or replace function private.s32_close_membership(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare cid uuid; other uuid;
begin
  select p.couple_id into cid from public.profiles p where p.id = p_user;
  if cid is null then
    return pg_catalog.jsonb_build_object('mode','no_couple','couple_id',null,'storage_prefix',null);
  end if;

  -- Serialise with the partner (both leaving at once) and with invites.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('s32-couple:' || cid::text, 0));
  perform 1 from public.couples c where c.id = cid for update;
  select p.id into other from public.profiles p where p.couple_id = cid and p.id <> p_user for update;

  -- Personal rows keyed on the auth user, not on the profile.
  delete from public.daily_answers where user_id = p_user and couple_id = cid;
  delete from public.moods where user_id = p_user and couple_id = cid;
  delete from public.quiz_responses where user_id = p_user and couple_id = cid;

  if other is null then
    -- Last member: the whole couple space goes. Every child row, the profile
    -- included, has couple_id ON DELETE CASCADE.
    delete from public.couples where id = cid;
    return pg_catalog.jsonb_build_object('mode','couple_erased','couple_id',cid,'storage_prefix',cid::text || '/');
  end if;

  delete from public.calendar_entries where entry_type = 'personal' and owner_id = p_user;
  delete from public.activity where actor_id = p_user;
  -- Scheduled messages not delivered yet are never delivered (D-15).
  delete from public.shared_messages where sender_id = p_user and unlock_at is not null and unlock_at > pg_catalog.now();
  -- "Lasciati per te" of the leaving member that the partner did not keep.
  delete from public.left_for_you l where l.sender_id = p_user
    and not exists (select 1 from public.conserva_contributions c where c.source_item_id = l.id);

  -- Shared content stays with the partner, without author.
  update public.shared_messages set sender_id = null where sender_id = p_user;
  update public.shared_messages set recipient_id = null where recipient_id = p_user;
  update public.left_for_you set sender_id = null where sender_id = p_user;
  update public.left_for_you set recipient_id = null where recipient_id = p_user;
  update public.conserva_contributions set source_sender_id = null where source_sender_id = p_user;
  update public.moments set created_by = null where created_by = p_user;
  update public.moment_photos set created_by = null where created_by = p_user;
  update public.calendar_entries set created_by = null where created_by = p_user and entry_type = 'shared';
  update public.shared_events set created_by = null where created_by = p_user;
  update public.shared_event_completions set completed_by = null where completed_by = p_user;
  perform pg_catalog.set_config('us.bucket_items_lived_confirm', 'on', true);
  update public.bucket_items set lived_proposed_by = null, lived_proposed_at = null where lived_proposed_by = p_user;
  perform pg_catalog.set_config('us.bucket_items_lived_confirm', '', true);
  update public.bucket_items set created_by = null where created_by = p_user;
  update public.bond_weekly_quests set confirmed_by = pg_catalog.array_remove(confirmed_by, p_user)
    where couple_id = cid and p_user = any(confirmed_by);

  -- XP history stays with the couple; keys that embed the user id do not.
  update public.progression_events set source_key = 'departed:' || id::text
    where couple_id = cid and pg_catalog.strpos(source_key, p_user::text) > 0;

  -- Close the couple: pending invites revoked, nobody can join any more.
  update public.couple_invites set revoked_at = pg_catalog.now()
    where couple_id = cid and used_at is null and revoked_at is null;
  update public.couple_invites set used_by = null where couple_id = cid and used_by = p_user;
  update public.couples set member_departed_at = pg_catalog.now() where id = cid;

  -- Profile last: cascades the remaining personal rows (devices, push,
  -- widget tokens, location, stories, preferences, reminders, own
  -- conserva). Any shared row still pointing at it fails the transaction.
  delete from public.profiles where id = p_user;
  return pg_catalog.jsonb_build_object('mode','departed','couple_id',cid,
    'storage_prefix',cid::text || '/' || p_user::text || '/');
end;
$fn$;
revoke all on function private.s32_close_membership(uuid) from public, anon, authenticated;

-- 2. Account deletion now uses the shared closing --------------------------
create or replace function public.s32_delete_account_data(p_user uuid, p_channel text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare closed jsonb; arch uuid; archives text[] := '{}';
begin
  if p_user is null then raise exception using errcode = '22023', message = 'user_required'; end if;
  if p_channel is null or p_channel not in ('app','web','operator') then
    raise exception using errcode = '22023', message = 'channel_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('s32-user:' || p_user::text, 0));
  if exists (select 1 from private.account_deletions d where d.user_id = p_user) then
    return private.s32_storage_plan(p_user) || pg_catalog.jsonb_build_object('status','already_done');
  end if;

  -- Archives of earlier couples the user still holds (D-5) go with them:
  -- the user is their only remaining member.
  for arch in select a.couple_id from private.couple_archive_access a where a.user_id = p_user order by a.couple_id loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('s32-couple:' || arch::text, 0));
    delete from private.couple_archive_access where couple_id = arch and user_id = p_user;
    if exists (select 1 from private.couple_archive_access a where a.couple_id = arch)
       or exists (select 1 from public.profiles p where p.couple_id = arch) then
      raise exception using errcode = 'P0001', message = 'archive_shared_unsupported';
    end if;
    delete from public.couples where id = arch;
    archives := archives || (arch::text || '/');
  end loop;

  closed := private.s32_close_membership(p_user);
  -- Without a couple only auth-level personal rows can be left; shared rows
  -- that still reference the user make the later auth deletion fail closed.
  delete from public.profiles where id = p_user;
  delete from public.daily_answers where user_id = p_user;
  delete from public.moods where user_id = p_user;
  delete from public.quiz_responses where user_id = p_user;
  update public.user_reports set reporter_id = null where reporter_id = p_user;

  insert into private.account_deletions(user_id, couple_id, mode, state, channel, storage_prefix, archive_prefixes)
    values (p_user, (closed->>'couple_id')::uuid, closed->>'mode', 'db_done', p_channel, closed->>'storage_prefix', archives);
  return private.s32_storage_plan(p_user) || pg_catalog.jsonb_build_object('status','db_done');
end;
$fn$;
revoke all on function public.s32_delete_account_data(uuid, text) from public, anon, authenticated;
grant execute on function public.s32_delete_account_data(uuid, text) to service_role;

-- 3. Leaving the couple ------------------------------------------------------
create table if not exists private.couple_departures (
  user_id uuid not null,
  couple_id uuid not null,
  mode text not null check (mode in ('departed','couple_erased')),
  state text not null check (state in ('db_done','storage_done','completed')),
  channel text not null check (channel in ('app','operator')),
  storage_prefix text not null,
  requested_at timestamptz not null default now(),
  db_done_at timestamptz not null default now(),
  storage_done_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  primary key (couple_id, user_id)
);
alter table private.couple_departures enable row level security;
alter table private.couple_departures force row level security;
revoke all on table private.couple_departures from public, anon, authenticated;

create or replace function private.s32_departure_plan(p_user uuid, p_couple uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare d private.couple_departures%rowtype; keep text[] := '{}';
begin
  select * into d from private.couple_departures where user_id = p_user and couple_id = p_couple;
  if not found then raise exception using errcode = 'P0002', message = 'departure_not_found'; end if;
  if d.mode = 'departed' then
    select coalesce(pg_catalog.array_agg(p order by p), '{}') into keep
      from pg_catalog.unnest(private.s32_referenced_media_paths(d.couple_id)) p
      where pg_catalog.starts_with(p, d.storage_prefix);
  end if;
  return pg_catalog.jsonb_build_object('couple_id', d.couple_id, 'state', d.state, 'mode', d.mode,
    'storage_prefix', d.storage_prefix, 'keep_paths', pg_catalog.to_jsonb(keep));
end;
$fn$;
revoke all on function private.s32_departure_plan(uuid, uuid) from public, anon, authenticated;

create or replace function public.s32_leave_couple(p_user uuid, p_channel text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare closed jsonb; pending uuid;
begin
  if p_user is null then raise exception using errcode = '22023', message = 'user_required'; end if;
  if p_channel is null or p_channel not in ('app','operator') then
    raise exception using errcode = '22023', message = 'channel_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('s32-user:' || p_user::text, 0));
  if exists (select 1 from private.account_deletions d where d.user_id = p_user) then
    raise exception using errcode = '42501', message = 'account_deleted';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.couple_id is not null) then
    -- A retry after the database step: resume the unfinished departure.
    select d.couple_id into pending from private.couple_departures d
      where d.user_id = p_user and d.state <> 'completed' order by d.db_done_at desc limit 1;
    if found then
      return private.s32_departure_plan(p_user, pending) || pg_catalog.jsonb_build_object('status','already_done');
    end if;
    raise exception using errcode = 'P0002', message = 'not_in_couple';
  end if;

  closed := private.s32_close_membership(p_user);
  insert into private.couple_departures(user_id, couple_id, mode, state, channel, storage_prefix)
    values (p_user, (closed->>'couple_id')::uuid, closed->>'mode', 'db_done', p_channel, closed->>'storage_prefix');
  return private.s32_departure_plan(p_user, (closed->>'couple_id')::uuid) || pg_catalog.jsonb_build_object('status','db_done');
end;
$fn$;
revoke all on function public.s32_leave_couple(uuid, text) from public, anon, authenticated;
grant execute on function public.s32_leave_couple(uuid, text) to service_role;

create or replace function public.s32_couple_departure_plan(p_user uuid, p_couple uuid) returns jsonb
language sql stable security definer set search_path = ''
as $fn$ select private.s32_departure_plan(p_user, p_couple) $fn$;
revoke all on function public.s32_couple_departure_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.s32_couple_departure_plan(uuid, uuid) to service_role;

create or replace function public.s32_mark_couple_departure(p_user uuid, p_couple uuid, p_state text, p_error text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare d private.couple_departures%rowtype;
begin
  select * into d from private.couple_departures where user_id = p_user and couple_id = p_couple for update;
  if not found then raise exception using errcode = 'P0002', message = 'departure_not_found'; end if;
  if p_state = 'failed' then
    if p_error is null or p_error !~ '^[a-z0-9_]{1,64}$' then
      raise exception using errcode = '22023', message = 'error_code_invalid';
    end if;
    update private.couple_departures set attempts = attempts + 1, last_error_code = p_error
      where user_id = p_user and couple_id = p_couple;
  elsif p_state = 'completed' and d.state in ('db_done','storage_done','completed') then
    -- Leaving has no auth step: Storage done means completed.
    update private.couple_departures set state = 'completed',
      storage_done_at = coalesce(storage_done_at, pg_catalog.now()),
      completed_at = coalesce(completed_at, pg_catalog.now()), last_error_code = null
      where user_id = p_user and couple_id = p_couple;
  else
    raise exception using errcode = '22023', message = 'state_transition_invalid';
  end if;
  return private.s32_departure_plan(p_user, p_couple);
end;
$fn$;
revoke all on function public.s32_mark_couple_departure(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.s32_mark_couple_departure(uuid, uuid, text, text) to service_role;

create or replace function public.s32_claim_pending_couple_departures(p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', user_id, 'couple_id', couple_id) order by db_done_at), '[]'::jsonb) from (
    select d.user_id, d.couple_id, d.db_done_at from private.couple_departures d
    where d.state <> 'completed' and d.attempts < 10
    order by d.db_done_at limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) x
$fn$;
revoke all on function public.s32_claim_pending_couple_departures(integer) from public, anon, authenticated;
grant execute on function public.s32_claim_pending_couple_departures(integer) to service_role;

-- 4. Reports ("Segnala un problema o un contenuto") -------------------------
-- The app can only add a report; nobody but the operator reads them. A
-- report survives the reporter's deletion without the reporter id.
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  couple_id uuid references public.couples(id) on delete set null,
  category text not null check (category in ('content','person','minor_safety','app_problem')),
  details text not null check (pg_catalog.char_length(details) between 1 and 2000),
  status text not null default 'open' check (status in ('open','in_review','actioned','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists user_reports_reporter_created on public.user_reports(reporter_id, created_at);
create index if not exists user_reports_open on public.user_reports(created_at) where status in ('open','in_review');
alter table public.user_reports enable row level security;
alter table public.user_reports force row level security;
revoke all on table public.user_reports from public, anon, authenticated;

create or replace function public.submit_user_report(p_category text, p_details text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare uid uuid; clean text; cid uuid;
begin
  uid := private.mc2_require_account();
  if p_category is null or p_category not in ('content','person','minor_safety','app_problem') then
    raise exception using errcode = '22023', message = 'report_category_invalid';
  end if;
  clean := pg_catalog.btrim(coalesce(p_details, ''));
  if pg_catalog.char_length(clean) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'report_details_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('s32-report:' || uid::text, 0));
  if (select pg_catalog.count(*) from public.user_reports r
      where r.reporter_id = uid and r.created_at > pg_catalog.now() - interval '24 hours') >= 5 then
    raise exception using errcode = 'P0001', message = 'report_rate_limited';
  end if;
  select p.couple_id into cid from public.profiles p where p.id = uid;
  insert into public.user_reports(reporter_id, couple_id, category, details) values (uid, cid, p_category, clean);
  return pg_catalog.jsonb_build_object('status','received');
end;
$fn$;
revoke all on function public.submit_user_report(text, text) from public, anon;
grant execute on function public.submit_user_report(text, text) to authenticated;

-- 5. Retention: one purge for every lifecycle record ------------------------
-- Defaults to ratify: deletion and departure receipts 12 months after
-- completion, reports 12 months after they were filed.
create or replace function public.s32_purge_account_deletion_receipts() returns integer
language plpgsql volatile security definer set search_path = ''
as $fn$
declare purged integer; n integer;
begin
  delete from private.account_deletions
    where state = 'completed' and completed_at < pg_catalog.now() - interval '12 months';
  get diagnostics purged = row_count;
  delete from private.couple_departures
    where state = 'completed' and completed_at < pg_catalog.now() - interval '12 months';
  get diagnostics n = row_count; purged := purged + n;
  delete from public.user_reports where created_at < pg_catalog.now() - interval '12 months';
  get diagnostics n = row_count; purged := purged + n;
  return purged;
end;
$fn$;
revoke all on function public.s32_purge_account_deletion_receipts() from public, anon, authenticated;
grant execute on function public.s32_purge_account_deletion_receipts() to service_role;

-- 6. Data export on request (decision 8: by email, prepared by the operator) -
-- What the user created or that is only about them, in their current couple.
-- Content written by the partner is the partner's data and is not included;
-- partner ids are stripped from the rows.
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
      'notification_preferences', (select pg_catalog.to_jsonb(x) - strip from public.notification_preferences x where x.user_id = p_user)
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

create or replace function public.s32_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = ''
as $fn$
  select u.id from auth.users u
  where pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(p_email)) and u.email is not null
  limit 1
$fn$;
revoke all on function public.s32_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.s32_user_id_by_email(text) to service_role;

-- Operator tooling key (Vault), same pattern as the cron keys.
create or replace function public.get_internal_operator_key() returns text
language sql stable security definer set search_path = ''
as $fn$
  select nullif(pg_catalog.btrim(decrypted_secret), '')
  from vault.decrypted_secrets
  where name = 'us_operator_key'
  limit 1
$fn$;
revoke all on function public.get_internal_operator_key() from public, anon, authenticated;
grant execute on function public.get_internal_operator_key() to service_role;

-- Private bucket for the prepared exports. No client policy: only the
-- service role reads or writes it; files are handed out as signed links and
-- removed after 7 days by the lifecycle worker.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('us-exports', 'us-exports', false, 52428800, array['application/json'])
on conflict (id) do nothing;
