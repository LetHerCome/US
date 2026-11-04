-- Note condivise V1 (founder, 31/10/2026, grill D7/D8): notes of the couple
-- in Noi. Spec: docs/missions/note-condivise-v1.md.
--
-- * A note has a title, a text and an optional checklist (items: a list of
--   {id, text, done}). Both members create, edit, tick and delete every note
--   of their couple; the other couple sees nothing (RLS on
--   private.current_couple_id(), as bucket_items).
-- * The server writes who changed a note last, when, and the revision; the
--   app never decides them. couple_id and created_by never change through the
--   app. Last save wins (D8): the app shows a notice when the partner saves.
-- * Authors are shared content (S3.2): NO ACTION to profiles, detached by
--   private.s32_close_membership when a member leaves or deletes the account.
--   The notes stay with the partner. The couple's erasure cascades them.
-- * Realtime: in supabase_realtime with the default replica identity, so a
--   deletion carries only the id.

create table public.couple_notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  items jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  constraint couple_notes_title_length check (char_length(title) <= 80),
  constraint couple_notes_body_length check (char_length(body) <= 4000),
  constraint couple_notes_not_empty check (btrim(title) <> '' or btrim(body) <> '' or jsonb_array_length(items) > 0)
);
create index couple_notes_couple_updated_idx on public.couple_notes (couple_id, updated_at desc);

-- A checklist: at most 100 items, each exactly {id, text, done}.
create or replace function private.couple_note_items_valid(p_items jsonb) returns boolean
language sql immutable set search_path = ''
as $fn$
  select case when pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then false
    else pg_catalog.jsonb_array_length(p_items) <= 100 and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_items) as e(v)
      where pg_catalog.jsonb_typeof(e.v) <> 'object'
         or pg_catalog.jsonb_typeof(e.v->'id') is distinct from 'string'
         or pg_catalog.jsonb_typeof(e.v->'text') is distinct from 'string'
         or pg_catalog.jsonb_typeof(e.v->'done') is distinct from 'boolean'
         or pg_catalog.char_length(e.v->>'id') not between 1 and 40
         or pg_catalog.char_length(e.v->>'text') > 200
         or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(e.v)) <> 3)
  end
$fn$;
revoke all on function private.couple_note_items_valid(jsonb) from public, anon;
-- The check runs with the writer's rights: a pure shape check, nothing read.
grant execute on function private.couple_note_items_valid(jsonb) to authenticated, service_role;
alter table public.couple_notes add constraint couple_notes_items_valid check (private.couple_note_items_valid(items));

-- The app's writes: author, time and revision from the server.
create or replace function private.couple_notes_guard() returns trigger
language plpgsql set search_path = ''
as $fn$
begin
  -- Only the app's role is guarded; account deletion and leaving (security
  -- definer, see s32_close_membership) detach the authors as they are.
  if current_user <> 'authenticated' then return new; end if;
  new.title := pg_catalog.btrim(new.title);
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('couple-notes:' || new.couple_id::text, 0));
    if (select pg_catalog.count(*) from public.couple_notes n where n.couple_id = new.couple_id) >= 300 then
      raise exception using errcode = 'P0001', message = 'couple_notes_limit';
    end if;
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := pg_catalog.now();
    new.updated_at := pg_catalog.now();
    new.revision := 1;
    return new;
  end if;
  if new.couple_id is distinct from old.couple_id then
    raise exception using errcode = '42501', message = 'couple_notes_couple_id_immutable';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := pg_catalog.now();
  new.revision := old.revision + 1;
  return new;
end;
$fn$;
revoke all on function private.couple_notes_guard() from public, anon, authenticated;
create trigger couple_notes_guard before insert or update on public.couple_notes
  for each row execute function private.couple_notes_guard();

alter table public.couple_notes enable row level security;
create policy couple_notes_read_same_couple on public.couple_notes as permissive for select to authenticated
  using (couple_id = private.current_couple_id());
create policy couple_notes_insert_same_couple on public.couple_notes as permissive for insert to authenticated
  with check (couple_id = private.current_couple_id());
create policy couple_notes_update_same_couple on public.couple_notes as permissive for update to authenticated
  using (couple_id = private.current_couple_id())
  with check (couple_id = private.current_couple_id());
create policy couple_notes_delete_same_couple on public.couple_notes as permissive for delete to authenticated
  using (couple_id = private.current_couple_id());

revoke all on table public.couple_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.couple_notes to authenticated;
grant all on table public.couple_notes to service_role;

alter publication supabase_realtime add table only public.couple_notes;

-- Closing a membership (leaving, account deletion) now detaches the note
-- authors too. Same function as 20261014120000, plus the two notes lines.
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
  -- Note condivise V1 (31/10/2026): the notes stay with the partner, without author.
  update public.couple_notes set created_by = null where created_by = p_user;
  update public.couple_notes set updated_by = null where updated_by = p_user;
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
