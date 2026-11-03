-- Lavagna V1 (founder, 03/11/2026, «Noi nuova, lavagna e sfida della
-- settimana»): one board per couple, at the top of the Noi bacheca, drawn
-- with a finger by both.
--
-- * A stroke is saved when the finger lifts: the points the app already
--   simplified, as x,y pairs in board units (x 0..1000, y 0..1600), at most
--   600 points; a pen colour of four or the eraser; two widths. The server
--   writes who drew it and when; nobody changes a stroke afterwards.
-- * Both members see and draw on the board of their couple; the other couple
--   sees nothing (RLS on private.current_couple_id(), as couple_notes).
--   Undo takes back the caller's own last stroke; «Pulisci» empties the board
--   for both. At most 1500 strokes on a board.
-- * Realtime: a new stroke reaches the partner as its INSERT. A deletion
--   cannot be filtered by couple (RLS, default replica identity), so every
--   deletion also writes the couple's lavagna_boards row: the ids that went
--   and, when the board is empty, when it was cleaned.
-- * Authors are shared content (S3.2): NO ACTION to profiles, detached by
--   private.s32_close_membership when a member leaves or deletes the account.
--   The drawing stays with the partner. The couple's erasure cascades it.
-- * notification_preferences.lavagna: «X ha disegnato sulla lavagna», at most
--   every 2 hours (send-web-push), switched off in Impostazioni › Notifiche.

create table public.lavagna_strokes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid references public.profiles(id),
  tool text not null default 'pen',
  color text,
  width smallint not null default 1,
  points smallint[] not null,
  created_at timestamptz not null default now(),
  constraint lavagna_strokes_tool check (tool in ('pen', 'eraser')),
  constraint lavagna_strokes_color check ((tool = 'pen' and color is not null and color in ('rosa', 'lilla', 'ambra', 'latte')) or (tool = 'eraser' and color is null)),
  constraint lavagna_strokes_width check (width in (1, 2))
);
create index lavagna_strokes_couple_created_idx on public.lavagna_strokes (couple_id, created_at, id);

-- x,y pairs, one dimension, no holes, inside the board: 1 to 600 points.
create or replace function private.lavagna_points_valid(p_points smallint[]) returns boolean
language sql immutable set search_path = ''
as $fn$
  select p_points is not null
    and pg_catalog.array_ndims(p_points) = 1
    and pg_catalog.cardinality(p_points) between 2 and 1200
    and pg_catalog.cardinality(p_points) % 2 = 0
    and pg_catalog.array_position(p_points, null::smallint) is null
    and not exists (
      select 1 from pg_catalog.unnest(p_points) with ordinality as u(v, i)
      where u.v < 0 or u.v > case when u.i % 2 = 1 then 1000 else 1600 end)
$fn$;
revoke all on function private.lavagna_points_valid(smallint[]) from public, anon;
-- The check runs with the writer's rights: a pure shape check, nothing read.
grant execute on function private.lavagna_points_valid(smallint[]) to authenticated, service_role;
alter table public.lavagna_strokes add constraint lavagna_strokes_points check (private.lavagna_points_valid(points));

-- The app's strokes: author and time from the server, 1500 at most.
create or replace function private.lavagna_strokes_guard() returns trigger
language plpgsql set search_path = ''
as $fn$
begin
  -- Only the app's role is guarded; the service role and the S3.2 functions
  -- (security definer) write rows as they are.
  if current_user <> 'authenticated' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lavagna:' || new.couple_id::text, 0));
  if (select pg_catalog.count(*) from public.lavagna_strokes s where s.couple_id = new.couple_id) >= 1500 then
    raise exception using errcode = 'P0001', message = 'lavagna_full';
  end if;
  new.author_id := auth.uid();
  -- Strokes are drawn in this order; two of them never share the start of a transaction.
  new.created_at := pg_catalog.clock_timestamp();
  return new;
end;
$fn$;
revoke all on function private.lavagna_strokes_guard() from public, anon, authenticated;
create trigger lavagna_strokes_guard before insert on public.lavagna_strokes
  for each row execute function private.lavagna_strokes_guard();

alter table public.lavagna_strokes enable row level security;
create policy lavagna_strokes_read_same_couple on public.lavagna_strokes as permissive for select to authenticated
  using (couple_id = private.current_couple_id());
create policy lavagna_strokes_insert_same_couple on public.lavagna_strokes as permissive for insert to authenticated
  with check (couple_id = private.current_couple_id());
-- «Pulisci» removes both members' strokes: both may remove every stroke of
-- their board, as with the notes. Undo picks only the caller's own.
create policy lavagna_strokes_delete_same_couple on public.lavagna_strokes as permissive for delete to authenticated
  using (couple_id = private.current_couple_id());

revoke all on table public.lavagna_strokes from public, anon, authenticated;
grant select, insert, delete on table public.lavagna_strokes to authenticated;
grant all on table public.lavagna_strokes to service_role;

-- The couple's board: what the last deletion removed (null when more than
-- 200 strokes went: the app reloads) and when the board was last emptied.
-- Written only by the trigger below.
create table public.lavagna_boards (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  revision bigint not null default 0,
  cleared_at timestamptz,
  removed uuid[],
  updated_at timestamptz not null default now()
);
alter table public.lavagna_boards enable row level security;
create policy lavagna_boards_read_same_couple on public.lavagna_boards as permissive for select to authenticated
  using (couple_id = private.current_couple_id());
revoke all on table public.lavagna_boards from public, anon, authenticated;
grant select on table public.lavagna_boards to authenticated;
grant all on table public.lavagna_boards to service_role;

create or replace function private.lavagna_strokes_removed() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  -- One row per board touched. A couple being erased (cascade) is already
  -- gone: nothing is written for it.
  insert into public.lavagna_boards as b (couple_id, revision, cleared_at, removed, updated_at)
  select g.couple_id, 1,
    case when g.left_over then null else pg_catalog.now() end,
    case when pg_catalog.cardinality(g.ids) <= 200 then g.ids end,
    pg_catalog.now()
  from (
    select o.couple_id, pg_catalog.array_agg(o.id order by o.created_at, o.id) as ids,
      exists (select 1 from public.lavagna_strokes s where s.couple_id = o.couple_id) as left_over
    from gone o group by o.couple_id
  ) g
  where exists (select 1 from public.couples c where c.id = g.couple_id)
  on conflict (couple_id) do update set
    revision = b.revision + 1,
    cleared_at = coalesce(excluded.cleared_at, b.cleared_at),
    removed = excluded.removed,
    updated_at = excluded.updated_at;
  return null;
end;
$fn$;
revoke all on function private.lavagna_strokes_removed() from public, anon, authenticated;
create trigger lavagna_strokes_removed after delete on public.lavagna_strokes
  referencing old table as gone for each statement execute function private.lavagna_strokes_removed();

-- Undo: the caller's newest stroke on their board. Returns its id, or null.
create or replace function public.lavagna_undo() returns uuid
language sql volatile security invoker set search_path = ''
as $fn$
  delete from public.lavagna_strokes s
  where s.id = (
    select x.id from public.lavagna_strokes x
    where x.couple_id = private.current_couple_id() and x.author_id = auth.uid()
    order by x.created_at desc, x.id desc limit 1)
  returning s.id
$fn$;
revoke all on function public.lavagna_undo() from public, anon, authenticated;
grant execute on function public.lavagna_undo() to authenticated;

-- «Pulisci»: every stroke of the caller's board, for both. Returns how many.
create or replace function public.lavagna_clear() returns integer
language plpgsql volatile security invoker set search_path = ''
as $fn$
declare n integer;
begin
  delete from public.lavagna_strokes s where s.couple_id = private.current_couple_id();
  get diagnostics n = row_count;
  return n;
end;
$fn$;
revoke all on function public.lavagna_clear() from public, anon, authenticated;
grant execute on function public.lavagna_clear() to authenticated;

alter publication supabase_realtime add table only public.lavagna_strokes;
alter publication supabase_realtime add table only public.lavagna_boards;

-- Impostazioni › Notifiche › Lavagna. Same two functions as the baseline,
-- plus the lavagna key; create or replace keeps their grants.
alter table public.notification_preferences add column lavagna boolean not null default true;

CREATE OR REPLACE FUNCTION public.get_notification_preferences()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into prefs from public.notification_preferences where user_id = uid;
  if not found then
    insert into public.notification_preferences(user_id) values(uid)
    on conflict(user_id) do nothing;
    select * into prefs from public.notification_preferences where user_id = uid;
  end if;
  return jsonb_build_object(
    'think', prefs.think,
    'today', prefs.today,
    'bond', prefs.bond,
    'relationship', prefs.relationship,
    'left_for_you', prefs.left_for_you,
    'games', prefs.games,
    'lavagna', prefs.lavagna
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_notification_preference(target_key text, target_value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_key not in ('think', 'today', 'bond', 'relationship', 'left_for_you', 'games', 'lavagna') then
    raise exception 'Invalid preference';
  end if;
  insert into public.notification_preferences(user_id) values(uid)
  on conflict(user_id) do nothing;
  if target_key = 'think' then
    update public.notification_preferences set think = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'today' then
    update public.notification_preferences set today = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'bond' then
    update public.notification_preferences set bond = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'relationship' then
    update public.notification_preferences set relationship = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'left_for_you' then
    update public.notification_preferences set left_for_you = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'lavagna' then
    update public.notification_preferences set lavagna = target_value, updated_at = now() where user_id = uid;
  else
    update public.notification_preferences set games = target_value, updated_at = now() where user_id = uid;
  end if;
  select * into prefs from public.notification_preferences where user_id = uid;
  return jsonb_build_object(
    'think', prefs.think,
    'today', prefs.today,
    'bond', prefs.bond,
    'relationship', prefs.relationship,
    'left_for_you', prefs.left_for_you,
    'games', prefs.games,
    'lavagna', prefs.lavagna
  );
end;
$function$;

-- Closing a membership (leaving, account deletion) now detaches the stroke
-- authors too. Same function as 20261031132258_couple_notes_v1, plus the
-- lavagna line.
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
  -- Lavagna V1 (03/11/2026): the drawing stays with the partner, without author.
  update public.lavagna_strokes set author_id = null where author_id = p_user;
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

-- The data export on request (Edge export-user-data, D-7) covers the strokes
-- the person drew too. Same function as 20261103010817, plus that entry
-- (author_id and couple_id are stripped as before). Still service_role only.
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
      'battery', (select pg_catalog.to_jsonb(x) - strip from public.couple_batteries x where x.user_id = p_user),
      'member_status', (select pg_catalog.to_jsonb(x) - strip from public.member_status x where x.user_id = p_user)
    ),
    'created', pg_catalog.jsonb_build_object(
      'moments', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.moments x where x.couple_id = cid and x.created_by = p_user),
      'moment_photos', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.moment_photos x where x.couple_id = cid and x.created_by = p_user),
      'messages_sent', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.shared_messages x where x.couple_id = cid and x.sender_id = p_user),
      'left_for_you_sent', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.left_for_you x where x.couple_id = cid and x.sender_id = p_user),
      'stories', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.stories x where x.couple_id = cid and x.author_id = p_user),
      'shared_calendar', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.calendar_entries x where x.couple_id = cid and x.entry_type = 'shared' and x.created_by = p_user),
      'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.shared_events x where x.couple_id = cid and x.created_by = p_user),
      'wishes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip - 'lived_proposed_by' order by x.created_at), '[]') from public.bucket_items x where x.couple_id = cid and x.created_by = p_user),
      'couple_notes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip - 'updated_by' order by x.created_at), '[]') from public.couple_notes x where x.couple_id = cid and (x.created_by = p_user or x.updated_by = p_user)),
      'lavagna_strokes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at, x.id), '[]') from public.lavagna_strokes x where x.couple_id = cid and x.author_id = p_user)
    ),
    'media', pg_catalog.to_jsonb(media)
  );
end;
$fn$;
revoke all on function public.s32_export_user_data(uuid) from public, anon, authenticated;
grant execute on function public.s32_export_user_data(uuid) to service_role;
