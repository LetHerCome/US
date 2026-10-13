-- US Store S3.2 — account deletion v1 (Policy A, approved by the founder).
--
-- One member deletes their account. Their personal data is deleted; the
-- shared content they created stays with the partner, without author. The
-- couple space is closed to new members. When the leaving member is the last
-- one, the whole couple space is deleted.
--
-- Safety model:
-- * Author/recipient FKs of shared content become NOT NULL-free and
--   ON DELETE NO ACTION (fail closed): deleting a profile or an auth user by
--   any other path (dashboard, cascade) now fails instead of erasing the
--   partner's history. Only s32_delete_account_data() detaches them first.
-- * Every entry point is service_role only and called by the delete-account
--   Edge function after password re-authentication. No client grant.
-- * The receipt lives in the private schema, without FK to auth.users, so it
--   survives the deletion (user id, dates, channel, state only).

-- 1. Private receipt ---------------------------------------------------------
create table if not exists private.account_deletions (
  user_id uuid primary key,
  couple_id uuid,
  mode text not null check (mode in ('no_couple','departed','couple_erased')),
  state text not null check (state in ('db_done','storage_done','completed')),
  channel text not null check (channel in ('app','web','operator')),
  storage_prefix text,
  requested_at timestamptz not null default now(),
  db_done_at timestamptz not null default now(),
  storage_done_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$')
);
alter table private.account_deletions enable row level security;
alter table private.account_deletions force row level security;
revoke all on table private.account_deletions from public, anon, authenticated;

-- 2. Closed couples -----------------------------------------------------------
alter table public.couples add column if not exists member_departed_at timestamptz;

-- 3. Fail-closed author/recipient references on shared content ----------------
alter table public.shared_messages alter column sender_id drop not null;
alter table public.shared_messages alter column recipient_id drop not null;
alter table public.shared_messages drop constraint shared_messages_sender_id_fkey,
  add constraint shared_messages_sender_id_fkey foreign key (sender_id) references auth.users(id) on delete no action;
alter table public.shared_messages drop constraint shared_messages_recipient_id_fkey,
  add constraint shared_messages_recipient_id_fkey foreign key (recipient_id) references auth.users(id) on delete no action;

alter table public.bucket_items alter column created_by drop not null;
alter table public.bucket_items drop constraint bucket_items_created_by_fkey,
  add constraint bucket_items_created_by_fkey foreign key (created_by) references auth.users(id) on delete no action;

alter table public.moments alter column created_by drop not null;
alter table public.moments drop constraint moments_created_by_fkey,
  add constraint moments_created_by_fkey foreign key (created_by) references public.profiles(id) on delete no action;

alter table public.moment_photos alter column created_by drop not null;
alter table public.moment_photos drop constraint moment_photos_created_by_fkey,
  add constraint moment_photos_created_by_fkey foreign key (created_by) references public.profiles(id) on delete no action;

-- Personal entries keep owner_id = created_by (CHECK) and are deleted with
-- their owner; only shared entries can lose their author.
alter table public.calendar_entries alter column created_by drop not null;
alter table public.calendar_entries drop constraint calendar_entries_created_by_fkey,
  add constraint calendar_entries_created_by_fkey foreign key (created_by) references public.profiles(id) on delete no action;
alter table public.calendar_entries add constraint calendar_entries_author_by_type_check
  check (entry_type = 'shared' or created_by is not null);

alter table public.shared_events alter column created_by drop not null;
alter table public.shared_events drop constraint shared_events_created_by_fkey,
  add constraint shared_events_created_by_fkey foreign key (created_by) references public.profiles(id) on delete no action;

alter table public.shared_event_completions alter column completed_by drop not null;

alter table public.left_for_you alter column sender_id drop not null;
alter table public.left_for_you alter column recipient_id drop not null;
alter table public.left_for_you drop constraint left_for_you_sender_id_fkey,
  add constraint left_for_you_sender_id_fkey foreign key (sender_id) references public.profiles(id) on delete no action;
alter table public.left_for_you drop constraint left_for_you_recipient_id_fkey,
  add constraint left_for_you_recipient_id_fkey foreign key (recipient_id) references public.profiles(id) on delete no action;

alter table public.conserva_contributions alter column source_sender_id drop not null;
alter table public.conserva_contributions drop constraint conserva_contributions_source_sender_id_fkey,
  add constraint conserva_contributions_source_sender_id_fkey foreign key (source_sender_id) references public.profiles(id) on delete no action;

-- 4. The survivor keeps control of the anonymous content ---------------------
-- Before: only the author could delete a Momento photo or a shared calendar
-- entry. Content whose author deleted their account can be deleted by the
-- remaining member of the same couple.
create policy moments_delete_departed_author on public.moments for delete to authenticated
  using (created_by is null and couple_id = private.current_couple_id());
create policy moment_photos_delete_departed_author on public.moment_photos for delete to authenticated
  using (created_by is null and couple_id = private.current_couple_id());
create policy calendar_entries_delete_departed_author on public.calendar_entries for delete to authenticated
  using (entry_type = 'shared' and created_by is null and couple_id = private.current_couple_id());
create policy calendar_entries_update_departed_author on public.calendar_entries for update to authenticated
  using (entry_type = 'shared' and created_by is null and couple_id = private.current_couple_id())
  with check (entry_type = 'shared' and created_by is null and couple_id = private.current_couple_id());

-- 5. Nobody joins a closed couple; a deleted account cannot come back --------
create or replace function private.s32_guard_profile_membership() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if exists (select 1 from private.account_deletions d where d.user_id = new.id) then
    raise exception using errcode = '42501', message = 'account_deleted';
  end if;
  if new.couple_id is not null and exists (
    select 1 from public.couples c where c.id = new.couple_id and c.member_departed_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'couple_closed';
  end if;
  return new;
end;
$fn$;
revoke all on function private.s32_guard_profile_membership() from public, anon, authenticated;
create trigger s32_profiles_membership_guard
  before insert or update of couple_id on public.profiles
  for each row execute function private.s32_guard_profile_membership();

create or replace function private.s32_guard_couple_invite() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  -- Revocations and the used_by SET NULL of an old invite stay allowed.
  if new.used_at is null and new.revoked_at is null and exists (
    select 1 from public.couples c where c.id = new.couple_id and c.member_departed_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'couple_closed';
  end if;
  return new;
end;
$fn$;
revoke all on function private.s32_guard_couple_invite() from public, anon, authenticated;
create trigger s32_couple_invites_closed_guard
  before insert or update on public.couple_invites
  for each row execute function private.s32_guard_couple_invite();

-- 6. Membership: the survivor stays in the app with the shared archive -------
-- partner_joined stays true for a closed couple so current clients keep the
-- survivor in the normal app (not in "invite your person"); partner_departed
-- lets updated clients explain it.
create or replace function public.get_couple_membership() returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare uid uuid; cid uuid; slot text; inv public.couple_invites%rowtype; state text := 'none'; partner boolean; departed boolean;
begin
  begin uid := private.mc2_require_account();
  exception when insufficient_privilege then return pg_catalog.jsonb_build_object('member',false); end;
  select p.couple_id,p.role into cid,slot from public.profiles p where p.id=uid;
  if not found or cid is null then return pg_catalog.jsonb_build_object('member',false); end if;
  select exists(select 1 from public.profiles p where p.couple_id=cid and p.id<>uid) into partner;
  select c.member_departed_at is not null into departed from public.couples c where c.id=cid;
  select i.* into inv from public.couple_invites i where i.couple_id=cid and i.role<>slot;
  if found then
    state := case when inv.used_at is not null then 'used' when inv.revoked_at is not null then 'revoked'
      when inv.expires_at <= pg_catalog.statement_timestamp() then 'expired' else 'pending' end;
  end if;
  return pg_catalog.jsonb_build_object('member',true,'couple_id',cid,'partner_joined',partner or coalesce(departed,false),
    'partner_departed',coalesce(departed,false) and not partner,
    'invite',pg_catalog.jsonb_build_object('status',state,'expires_at',inv.expires_at));
end;
$fn$;

-- 7. Storage paths still referenced by the couple's content -------------------
create or replace function private.s32_referenced_media_paths(p_couple uuid) returns text[]
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(pg_catalog.array_agg(distinct p order by p), '{}'::text[]) from (
    select m.storage_path p from public.moments m where m.couple_id = p_couple
    union all select m.thumbnail_path from public.moments m where m.couple_id = p_couple
    union all select mp.storage_path from public.moment_photos mp where mp.couple_id = p_couple
    union all select l.media_path from public.left_for_you l where l.couple_id = p_couple
    union all select s.media_path from public.stories s where s.couple_id = p_couple
    union all select pr.avatar_path from public.profiles pr where pr.couple_id = p_couple
    union all select c.home_photo_path from public.couples c where c.id = p_couple
  ) x where p is not null and p <> ''
$fn$;
revoke all on function private.s32_referenced_media_paths(uuid) from public, anon, authenticated;

create or replace function private.s32_storage_plan(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare d private.account_deletions%rowtype; keep text[] := '{}';
begin
  select * into d from private.account_deletions where user_id = p_user;
  if not found then raise exception using errcode = 'P0002', message = 'deletion_not_found'; end if;
  if d.mode = 'departed' then
    select coalesce(pg_catalog.array_agg(p order by p), '{}') into keep
      from pg_catalog.unnest(private.s32_referenced_media_paths(d.couple_id)) p
      where pg_catalog.starts_with(p, d.storage_prefix);
  end if;
  return pg_catalog.jsonb_build_object('state', d.state, 'mode', d.mode,
    'storage_prefix', d.storage_prefix, 'keep_paths', pg_catalog.to_jsonb(keep));
end;
$fn$;
revoke all on function private.s32_storage_plan(uuid) from public, anon, authenticated;

-- 8. The deletion itself (one transaction) ------------------------------------
create or replace function public.s32_delete_account_data(p_user uuid, p_channel text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare cid uuid; other uuid; v_mode text; prefix text; plan jsonb;
begin
  if p_user is null then raise exception using errcode = '22023', message = 'user_required'; end if;
  if p_channel is null or p_channel not in ('app','web','operator') then
    raise exception using errcode = '22023', message = 'channel_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('s32-user:' || p_user::text, 0));
  if exists (select 1 from private.account_deletions d where d.user_id = p_user) then
    return private.s32_storage_plan(p_user) || pg_catalog.jsonb_build_object('status','already_done');
  end if;

  select p.couple_id into cid from public.profiles p where p.id = p_user;
  if cid is null then
    -- No couple: only auth-level personal rows can exist. Shared rows that
    -- still reference the user make the later auth deletion fail closed.
    delete from public.profiles where id = p_user;
    delete from public.daily_answers where user_id = p_user;
    delete from public.moods where user_id = p_user;
    delete from public.quiz_responses where user_id = p_user;
    insert into private.account_deletions(user_id, couple_id, mode, state, channel, storage_prefix)
      values (p_user, null, 'no_couple', 'db_done', p_channel, null);
    return private.s32_storage_plan(p_user) || pg_catalog.jsonb_build_object('status','db_done');
  end if;

  -- Serialise with the partner (both deleting at once) and with invites.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('s32-couple:' || cid::text, 0));
  perform 1 from public.couples c where c.id = cid for update;
  select p.id into other from public.profiles p where p.couple_id = cid and p.id <> p_user for update;

  if other is null then
    -- Last member: the whole couple space goes. Every child row has
    -- couple_id ON DELETE CASCADE; the NO ACTION author FKs are checked at
    -- the end of the statement, when those rows are gone too.
    v_mode := 'couple_erased'; prefix := cid::text || '/';
    delete from public.couples where id = cid;
    delete from public.daily_answers where user_id = p_user;
    delete from public.moods where user_id = p_user;
    delete from public.quiz_responses where user_id = p_user;
  else
    v_mode := 'departed'; prefix := cid::text || '/' || p_user::text || '/';

    -- Personal data of the leaving member.
    delete from public.daily_answers where user_id = p_user;
    delete from public.moods where user_id = p_user;
    delete from public.quiz_responses where user_id = p_user;
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
  end if;

  insert into private.account_deletions(user_id, couple_id, mode, state, channel, storage_prefix)
    values (p_user, cid, v_mode, 'db_done', p_channel, prefix);
  plan := private.s32_storage_plan(p_user);
  return plan || pg_catalog.jsonb_build_object('status','db_done');
end;
$fn$;
revoke all on function public.s32_delete_account_data(uuid, text) from public, anon, authenticated;
grant execute on function public.s32_delete_account_data(uuid, text) to service_role;

create or replace function public.s32_account_deletion_storage_plan(p_user uuid) returns jsonb
language sql stable security definer set search_path = ''
as $fn$ select private.s32_storage_plan(p_user) $fn$;
revoke all on function public.s32_account_deletion_storage_plan(uuid) from public, anon, authenticated;
grant execute on function public.s32_account_deletion_storage_plan(uuid) to service_role;

create or replace function public.s32_mark_account_deletion(p_user uuid, p_state text, p_error text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare d private.account_deletions%rowtype;
begin
  select * into d from private.account_deletions where user_id = p_user for update;
  if not found then raise exception using errcode = 'P0002', message = 'deletion_not_found'; end if;
  if p_state = 'failed' then
    if p_error is null or p_error !~ '^[a-z0-9_]{1,64}$' then
      raise exception using errcode = '22023', message = 'error_code_invalid';
    end if;
    update private.account_deletions set attempts = attempts + 1, last_error_code = p_error where user_id = p_user;
  elsif p_state = 'storage_done' and d.state in ('db_done','storage_done') then
    update private.account_deletions set state = 'storage_done', storage_done_at = coalesce(storage_done_at, pg_catalog.now()),
      last_error_code = null where user_id = p_user;
  elsif p_state = 'completed' and d.state in ('storage_done','completed') then
    update private.account_deletions set state = 'completed', completed_at = coalesce(completed_at, pg_catalog.now()),
      last_error_code = null where user_id = p_user;
  else
    raise exception using errcode = '22023', message = 'state_transition_invalid';
  end if;
  return private.s32_storage_plan(p_user);
end;
$fn$;
revoke all on function public.s32_mark_account_deletion(uuid, text, text) from public, anon, authenticated;
grant execute on function public.s32_mark_account_deletion(uuid, text, text) to service_role;
