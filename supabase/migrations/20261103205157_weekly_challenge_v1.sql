-- La sfida della settimana (founder, 03/11/2026; docs/DECISIONS.md, «Noi
-- nuova, lavagna e sfida della settimana»). It replaces the weekly missions.
--
-- * One challenge a week per couple, Monday to Sunday in Europe/Rome, chosen
--   by the server from the curated bond_quest_templates and «Come vi vedete»
--   (private.bond_mode_for_couple): near → near and any challenges, far →
--   challenges for two places, not answered yet → any challenges. One change
--   a week, before any photo.
-- * A photo closes it: it is a Ricordo (public.moments) of this week, made by
--   the person who sends it. Couples apart need one photo each (the second
--   one usually in the album of the first Ricordo, public.moment_photos); a
--   single photo by Sunday closes it with 30 points when the next week starts.
-- * 60 points to the couple (couples.bond_xp) through
--   private.progression_award, source 'challenge'; 100 more every 4 weeks in
--   a row. Expiring on Sunday at 23:59 costs nothing.
-- * The old missions: tables and history stay, ensure_bond_week no longer
--   creates a weekly board (old apps get an empty one).
-- * Account deletion: a person's photo rows go with them (the Ricordi follow
--   their own rule); the export lists them.
-- Re-applying this migration changes nothing.

-- ---------------------------------------------------------------- catalog
alter table public.bond_quest_templates add column if not exists challenge boolean not null default false;
alter table public.bond_quest_templates add column if not exists two_places boolean not null default false;
alter table public.bond_quest_templates add column if not exists short_title text;
alter table public.bond_quest_templates add column if not exists short_title_en text;
comment on column public.bond_quest_templates.challenge is 'Sfida della settimana: it can be closed with a photo, so it may be a weekly challenge.';
comment on column public.bond_quest_templates.two_places is 'Sfida della settimana: made for a couple apart, one photo from each place.';
comment on column public.bond_quest_templates.short_title is 'Sfida della settimana: the short name (Oggi, the closed card, the Ricordo).';

alter table public.bond_quest_templates drop constraint if exists bond_quest_templates_challenge_titles_check;
alter table public.bond_quest_templates add constraint bond_quest_templates_challenge_titles_check
  check (not challenge or (pg_catalog.length(pg_catalog.btrim(coalesce(short_title, ''))) between 3 and 40
    and pg_catalog.length(pg_catalog.btrim(coalesce(short_title_en, ''))) between 3 and 40
    and pg_catalog.length(pg_catalog.btrim(coalesce(title_en, ''))) > 0));
alter table public.bond_quest_templates drop constraint if exists bond_quest_templates_two_places_check;
alter table public.bond_quest_templates add constraint bond_quest_templates_two_places_check
  check (not two_places or (mode = 'far' and challenge));

-- New challenges for two places (the founder's example: the same sky).
insert into public.bond_quest_templates (key, title, category, rarity, xp, mode, active, title_en) values
  ('far-same-sky', 'Fotografate il vostro cielo stasera, alla stessa ora.', 'connection', 'rare', 60, 'far', true, 'Photograph your sky tonight, at the same time.'),
  ('far-window-morning', 'Appena svegli, fotografate la vista dalla vostra finestra.', 'memory', 'common', 25, 'far', true, 'As soon as you wake up, photograph the view from your window.'),
  ('far-same-cup', 'Fate colazione alla stessa ora e fotografate la vostra tazza.', 'connection', 'common', 25, 'far', true, 'Have breakfast at the same time and photograph your cup.'),
  ('far-favourite-corner', 'Fotografate il vostro angolo preferito della città in cui vivete.', 'discover', 'uncommon', 40, 'far', true, 'Photograph your favourite corner of the city you live in.'),
  ('far-same-colour', 'Scegliete un colore e trovatelo per strada: una foto a testa.', 'fun', 'uncommon', 40, 'far', true, 'Pick a colour and find it in the street: one photo each.'),
  ('far-my-street', 'Fotografate la strada di casa, come la vedete appena uscite.', 'discover', 'common', 25, 'far', true, 'Photograph your street, the way you see it as you step out.'),
  ('far-two-sunsets', 'Fotografate il tramonto dalla vostra città, lo stesso giorno.', 'memory', 'rare', 60, 'far', true, 'Photograph the sunset from your city, on the same day.'),
  ('far-words-for-you', 'Trovate per strada una scritta che vorreste dedicare all’altra persona.', 'surprise', 'uncommon', 40, 'far', true, 'Find words in the street you would dedicate to the other one.'),
  ('far-my-spot-today', 'Fotografate il posto dove avete passato più ore oggi.', 'connection', 'common', 25, 'far', true, 'Photograph the place where you spent the most hours today.'),
  ('far-feels-like-you', 'Fotografate un oggetto che vi fa pensare all’altra persona.', 'memory', 'uncommon', 40, 'far', true, 'Photograph something that makes you think of the other one.')
on conflict (key) do nothing;

-- Which templates are challenges, and their short names. Missions that cannot
-- end in a photo (a talk, a song, no phones) stay missions only.
update public.bond_quest_templates as t
set challenge = true, two_places = v.two_places, short_title = v.short_title, short_title_en = v.short_title_en
from (values
  ('near-no-plan-hour', false, 'Un’ora senza meta', 'An hour with no destination'),
  ('near-breakfast', false, 'Colazione fuori', 'Breakfast out'),
  ('near-cook-new', false, 'Una ricetta nuova', 'A new recipe'),
  ('near-dance-kitchen', false, 'Ballo in cucina', 'Kitchen dance'),
  ('near-new-place', false, 'Un posto nuovo', 'A new place'),
  ('near-random-road', false, 'Una direzione a caso', 'A random direction'),
  ('near-recreate-photo', false, 'Una vecchia foto, di nuovo', 'An old photo, again'),
  ('near-sunset', false, 'Il vostro tramonto', 'Your sunset'),
  ('near-tourists-at-home', false, 'Turisti a casa', 'Tourists at home'),
  ('near-blind-tasting', false, 'Degustazione alla cieca', 'Blind tasting'),
  ('near-movie-snack', false, 'Film e snack', 'Movie and snacks'),
  ('near-five-euro', false, 'Sorpresa da 5 €', 'A €5 surprise'),
  ('any-week-photo', false, 'La foto della settimana', 'Photo of the week'),
  ('any-old-photo', false, 'Una vecchia foto', 'An old photo'),
  ('any-hidden-note', false, 'Il messaggio nascosto', 'The hidden message'),
  ('any-future-letter', false, 'Una lettera per tra un anno', 'A letter for next year'),
  ('any-perfect-day-plan', false, 'La giornata perfetta', 'The perfect day'),
  ('any-intentional-memory', false, 'Un ricordo voluto', 'A memory on purpose'),
  ('any-mini-surprise', false, 'Una mini sorpresa', 'A little surprise'),
  ('any-hug-twenty', false, 'L’abbraccio più lungo', 'The longest hug'),
  ('any-private-meme', false, 'Il vostro meme', 'Your meme'),
  ('any-top-five-memories', false, 'Top 5 insieme', 'Top 5 together'),
  ('far-same-dinner', true, 'La stessa ricetta', 'The same recipe'),
  ('far-comfort-food', true, 'Lo stesso comfort food', 'The same comfort food'),
  ('far-dinner-call', true, 'Cena in videochiamata', 'Dinner on a video call'),
  ('far-postcard', true, 'Una cartolina vera', 'A real postcard'),
  ('far-thought-photo', true, 'Ti ho pensato qui', 'Thought of you here'),
  ('far-guided-walk', true, 'La passeggiata in chiamata', 'A walk on a call'),
  ('far-same-episode', true, 'Lo stesso episodio', 'The same episode'),
  ('far-same-sky', true, 'Lo stesso cielo', 'The same sky'),
  ('far-window-morning', true, 'Dalla finestra', 'From the window'),
  ('far-same-cup', true, 'La stessa colazione', 'The same breakfast'),
  ('far-favourite-corner', true, 'Il mio angolo preferito', 'My favourite corner'),
  ('far-same-colour', true, 'Lo stesso colore', 'The same colour'),
  ('far-my-street', true, 'La mia strada', 'My street'),
  ('far-two-sunsets', true, 'Due tramonti', 'Two sunsets'),
  ('far-words-for-you', true, 'Una scritta per te', 'Words for you'),
  ('far-my-spot-today', true, 'Il mio posto di oggi', 'My spot today'),
  ('far-feels-like-you', true, 'Qualcosa che sa di te', 'Something that feels like you')
) as v(key, two_places, short_title, short_title_en)
where t.key = v.key
  and (t.challenge, t.two_places, t.short_title, t.short_title_en)
    is distinct from (true, v.two_places, v.short_title, v.short_title_en);

-- ---------------------------------------------------------------- tables
create table if not exists public.couple_weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  week_start date not null,
  template_key text not null references public.bond_quest_templates(key),
  title text not null,
  short_title text not null,
  two_places boolean not null,
  changes_used smallint not null default 0,
  completed_at timestamptz,
  xp_awarded integer not null default 0,
  bonus_xp integer not null default 0,
  streak_weeks integer not null default 0,
  created_at timestamptz not null default now(),
  constraint couple_weekly_challenges_week_key unique (couple_id, week_start),
  constraint couple_weekly_challenges_monday_check check (extract(isodow from week_start) = 1),
  constraint couple_weekly_challenges_changes_check check (changes_used between 0 and 1),
  constraint couple_weekly_challenges_xp_check check (xp_awarded in (0, 30, 60) and bonus_xp in (0, 100) and streak_weeks >= 0),
  constraint couple_weekly_challenges_completed_check check ((completed_at is null) = (xp_awarded = 0))
);
comment on table public.couple_weekly_challenges is 'Sfida della settimana: one per couple and Rome week. Written only by the weekly_challenge functions.';
create index if not exists couple_weekly_challenges_template_idx on public.couple_weekly_challenges (template_key);

create table if not exists public.couple_weekly_challenge_photos (
  challenge_id uuid not null references public.couple_weekly_challenges(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  moment_id uuid not null references public.moments(id) on delete cascade,
  photo_id uuid references public.moment_photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
comment on table public.couple_weekly_challenge_photos is 'Sfida della settimana: the Ricordo (or its album photo) each person sent. Goes with the person and with the Ricordo.';
create index if not exists couple_weekly_challenge_photos_couple_idx on public.couple_weekly_challenge_photos (couple_id);
create index if not exists couple_weekly_challenge_photos_user_idx on public.couple_weekly_challenge_photos (user_id);
create index if not exists couple_weekly_challenge_photos_moment_idx on public.couple_weekly_challenge_photos (moment_id);
create index if not exists couple_weekly_challenge_photos_photo_idx on public.couple_weekly_challenge_photos (photo_id);

alter table public.couple_weekly_challenges enable row level security;
alter table public.couple_weekly_challenge_photos enable row level security;
revoke all on table public.couple_weekly_challenges from public, anon, authenticated;
revoke all on table public.couple_weekly_challenge_photos from public, anon, authenticated;
grant select on table public.couple_weekly_challenges to authenticated;
grant select on table public.couple_weekly_challenge_photos to authenticated;
grant all on table public.couple_weekly_challenges to service_role;
grant all on table public.couple_weekly_challenge_photos to service_role;

drop policy if exists couple_weekly_challenges_select_same_couple on public.couple_weekly_challenges;
create policy couple_weekly_challenges_select_same_couple on public.couple_weekly_challenges as permissive for select to authenticated
  using (couple_id = private.current_couple_id());
drop policy if exists couple_weekly_challenge_photos_select_same_couple on public.couple_weekly_challenge_photos;
create policy couple_weekly_challenge_photos_select_same_couple on public.couple_weekly_challenge_photos as permissive for select to authenticated
  using (couple_id = private.current_couple_id());

-- ---------------------------------------------------------------- points
alter table public.progression_events drop constraint if exists progression_events_source_kind_check;
alter table public.progression_events add constraint progression_events_source_kind_check
  check (source_kind = any (array['quest'::text, 'event'::text, 'milestone'::text, 'daily'::text, 'game'::text, 'think'::text, 'moment'::text, 'challenge'::text]));

-- Same function as the baseline, with the source 'challenge'.
create or replace function private.progression_award(target_couple uuid, target_actor uuid, target_source_kind text, target_source_key text, target_xp integer, target_action_at timestamp with time zone default now(), target_counts_rhythm boolean default true, add_to_bond boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  inserted_id uuid;
  current_xp integer;
  action_day date := (coalesce(target_action_at, now()) at time zone 'Europe/Rome')::date;
begin
  if target_couple is null or not exists (select 1 from public.couples c where c.id = target_couple) then
    raise exception using errcode = '22023', message = 'progression_couple_required';
  end if;
  if target_source_kind not in ('quest','event','milestone','daily','game','think','moment','challenge') then
    raise exception using errcode = '22023', message = 'progression_source_invalid';
  end if;
  if target_source_key is null or btrim(target_source_key) = '' or char_length(target_source_key) > 180 then
    raise exception using errcode = '22023', message = 'progression_source_key_invalid';
  end if;
  if coalesce(target_xp, 0) < 0 then
    raise exception using errcode = '22023', message = 'progression_xp_invalid';
  end if;
  if target_actor is not null and not exists (
    select 1 from public.profiles p where p.id = target_actor and p.couple_id = target_couple
  ) then
    raise exception using errcode = '42501', message = 'progression_actor_outside_couple';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('us:progression:' || target_couple::text, 0));

  insert into public.progression_events(
    couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at
  )
  values (
    target_couple, target_actor, target_source_kind, btrim(target_source_key),
    greatest(0, coalesce(target_xp, 0)), coalesce(target_counts_rhythm, true),
    action_day, coalesce(target_action_at, now())
  )
  on conflict (couple_id, source_kind, source_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null and add_to_bond and coalesce(target_xp, 0) > 0 then
    update public.couples
       set bond_xp = coalesce(bond_xp, 0) + target_xp
     where id = target_couple
    returning bond_xp into current_xp;
  else
    select coalesce(c.bond_xp, 0) into current_xp from public.couples c where c.id = target_couple;
  end if;

  perform private.progression_sync_unlocks(target_couple, current_xp);

  return jsonb_build_object(
    'recorded', inserted_id is not null,
    'xp_added', case when inserted_id is not null and add_to_bond then greatest(0, coalesce(target_xp, 0)) else 0 end,
    'total_xp', coalesce(current_xp, 0),
    'level', private.progression_level(coalesce(current_xp, 0)),
    'action_day', action_day
  );
end;
$function$;
revoke all on function private.progression_award(uuid, uuid, text, text, integer, timestamp with time zone, boolean, boolean) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- helpers
-- Sunday 23:59:59 in Rome of the week that starts on target_week.
create or replace function private.weekly_challenge_ends_at(target_week date)
 returns timestamptz
 language sql
 stable
 set search_path to ''
as $function$
  select (((target_week + 7)::timestamp at time zone 'Europe/Rome') - interval '1 second')
$function$;

-- The challenge for a couple in a mode, deterministic for the couple and the
-- week. Recent ones are avoided while others remain; must_not never returns.
create or replace function private.weekly_challenge_pick(target_couple uuid, target_week date, couple_mode text, salt text, avoid text[], must_not text)
 returns public.bond_quest_templates
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  fits text[];
  fresh text[];
  picked public.bond_quest_templates;
begin
  select coalesce(array_agg(t.key order by t.key), '{}') into fits
  from public.bond_quest_templates t
  where t.active and t.challenge
    and t.key is distinct from must_not
    and case coalesce(couple_mode, 'any')
      when 'far' then t.two_places
      when 'near' then not t.two_places and t.mode in ('near', 'any')
      else not t.two_places and t.mode = 'any'
    end;
  select coalesce(array_agg(k order by k), '{}') into fresh from unnest(fits) k where not (k = any(coalesce(avoid, '{}')));
  if cardinality(fresh) > 0 then fits := fresh; end if;
  if cardinality(fits) = 0 then return null; end if;
  select * into picked from public.bond_quest_templates
  where key = fits[(private.bond_hash_seed(target_couple::text || '|' || target_week::text || '|challenge|' || salt) % cardinality(fits))::integer + 1];
  return picked;
end;
$function$;

-- Closes one challenge: points, weeks in a row, the bonus every 4, activity.
create or replace function private.weekly_challenge_complete(target_challenge uuid, target_xp integer, at_time timestamptz, actor uuid)
 returns public.couple_weekly_challenges
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  ch public.couple_weekly_challenges;
  streak integer := 1;
  w date;
  bonus integer := 0;
begin
  select * into ch from public.couple_weekly_challenges where id = target_challenge for update;
  if not found or ch.completed_at is not null then return ch; end if;
  if target_xp not in (30, 60) then
    raise exception using errcode = '22023', message = 'challenge_xp_invalid';
  end if;
  w := ch.week_start - 7;
  while exists (select 1 from public.couple_weekly_challenges c
                where c.couple_id = ch.couple_id and c.week_start = w and c.completed_at is not null) loop
    streak := streak + 1;
    w := w - 7;
  end loop;
  if streak % 4 = 0 then bonus := 100; end if;

  update public.couple_weekly_challenges
     set completed_at = at_time, xp_awarded = target_xp, bonus_xp = bonus, streak_weeks = streak
   where id = ch.id
  returning * into ch;

  perform private.progression_award(ch.couple_id, actor, 'challenge', ch.id::text, target_xp, at_time, true, true);
  if bonus > 0 then
    perform private.progression_award(ch.couple_id, actor, 'challenge', 'streak:' || ch.id::text, bonus, at_time, false, true);
  end if;
  insert into public.activity(couple_id, actor_id, type, payload)
  values (ch.couple_id, actor, 'weekly_challenge_completed', jsonb_build_object(
    'challenge_id', ch.id, 'title', ch.short_title, 'xp', target_xp, 'bonus_xp', bonus, 'streak', streak));
  return ch;
end;
$function$;

-- The couple's challenge of the week of at_time: the weeks before it closed
-- first (one photo of two → 30 points, on their Sunday night), then this
-- week's created if missing.
create or replace function private.weekly_challenge_ensure(target_couple uuid, at_time timestamptz)
 returns public.couple_weekly_challenges
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  week date := private.bond_week_start_rome(at_time);
  ch public.couple_weekly_challenges;
  past record;
  t public.bond_quest_templates;
  recent text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('us:weekly-challenge:' || target_couple::text, 0));
  for past in
    select c.id, c.week_start from public.couple_weekly_challenges c
    where c.couple_id = target_couple and c.week_start < week and c.completed_at is null
      and exists (select 1 from public.couple_weekly_challenge_photos p where p.challenge_id = c.id)
    order by c.week_start
  loop
    perform private.weekly_challenge_complete(past.id, 30, private.weekly_challenge_ends_at(past.week_start), null);
  end loop;

  select * into ch from public.couple_weekly_challenges where couple_id = target_couple and week_start = week;
  if found then return ch; end if;

  select coalesce(array_agg(c.template_key), '{}') into recent
  from public.couple_weekly_challenges c where c.couple_id = target_couple and c.week_start >= week - 84;
  t := private.weekly_challenge_pick(target_couple, week, private.bond_mode_for_couple(target_couple), 'week', recent, null);
  if t.key is null then return null; end if;
  insert into public.couple_weekly_challenges(couple_id, week_start, template_key, title, short_title, two_places, created_at)
  values (target_couple, week, t.key, t.title, t.short_title, t.two_places, least(at_time, now()))
  on conflict (couple_id, week_start) do nothing
  returning * into ch;
  if ch.id is null then
    select * into ch from public.couple_weekly_challenges where couple_id = target_couple and week_start = week;
  end if;
  return ch;
end;
$function$;

-- The member's couple, or the same error for no account and no couple.
create or replace function private.weekly_challenge_couple(target_user uuid)
 returns uuid
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  cid uuid;
begin
  select p.couple_id into cid from public.profiles p where p.id = target_user;
  if target_user is null or cid is null then
    raise exception using errcode = '42501', message = 'challenge_auth_required';
  end if;
  return cid;
end;
$function$;

-- What a member sees, in their language.
create or replace function private.weekly_challenge_json(target_user uuid, target_challenge uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  ch public.couple_weekly_challenges;
  t public.bond_quest_templates;
  en boolean;
  streak integer := 0;
  w date;
  photos jsonb;
  mine boolean;
  theirs boolean;
begin
  select * into ch from public.couple_weekly_challenges where id = target_challenge;
  if not found then return null; end if;
  select * into t from public.bond_quest_templates where key = ch.template_key;
  select p.locale = 'en' into en from public.profiles p where p.id = target_user;
  if ch.completed_at is not null then
    streak := ch.streak_weeks;
  else
    w := ch.week_start - 7;
    while exists (select 1 from public.couple_weekly_challenges c
                  where c.couple_id = ch.couple_id and c.week_start = w and c.completed_at is not null) loop
      streak := streak + 1;
      w := w - 7;
    end loop;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'mine', p.user_id = target_user,
      'moment_id', p.moment_id,
      'photo_id', p.photo_id,
      'path', coalesce(mp.storage_path, m.thumbnail_path, m.storage_path),
      'place_label', case when p.photo_id is null then m.place_label end,
      'created_at', p.created_at) order by p.created_at), '[]'),
    coalesce(bool_or(p.user_id = target_user), false),
    coalesce(bool_or(p.user_id <> target_user), false)
    into photos, mine, theirs
  from public.couple_weekly_challenge_photos p
  join public.moments m on m.id = p.moment_id
  left join public.moment_photos mp on mp.id = p.photo_id
  where p.challenge_id = ch.id;
  return jsonb_build_object(
    'id', ch.id,
    'week_start', ch.week_start,
    'ends_at', private.weekly_challenge_ends_at(ch.week_start),
    'title', case when en and t.title_en is not null then t.title_en else ch.title end,
    'short_title', case when en and t.short_title_en is not null then t.short_title_en else ch.short_title end,
    'two_places', ch.two_places,
    'points', 60,
    'partial_points', 30,
    'bonus_points', 100,
    'bonus_every', 4,
    'changes_left', 1 - ch.changes_used,
    'completed_at', ch.completed_at,
    'xp_awarded', ch.xp_awarded,
    'bonus_xp', ch.bonus_xp,
    'streak', streak,
    'photos', photos,
    'waiting_for', case when ch.completed_at is null and ch.two_places and mine <> theirs
      then case when mine then 'partner' else 'me' end end
  );
end;
$function$;

create or replace function private.weekly_challenge_state(target_user uuid, at_time timestamptz)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  cid uuid := private.weekly_challenge_couple(target_user);
  ch public.couple_weekly_challenges;
begin
  ch := private.weekly_challenge_ensure(cid, at_time);
  return private.weekly_challenge_json(target_user, ch.id);
end;
$function$;

-- The challenge passed must be this week's: one opened on Sunday night and
-- saved on Monday is closed.
create or replace function private.weekly_challenge_current(cid uuid, target_challenge uuid, at_time timestamptz)
 returns public.couple_weekly_challenges
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  ch public.couple_weekly_challenges := private.weekly_challenge_ensure(cid, at_time);
begin
  if target_challenge is null or ch.id is distinct from target_challenge then
    if exists (select 1 from public.couple_weekly_challenges c where c.id = target_challenge and c.couple_id = cid) then
      raise exception using errcode = '22023', message = 'challenge_closed';
    end if;
    raise exception using errcode = 'P0002', message = 'challenge_not_found';
  end if;
  select * into ch from public.couple_weekly_challenges where id = target_challenge for update;
  return ch;
end;
$function$;

create or replace function private.weekly_challenge_change(target_user uuid, target_challenge uuid, at_time timestamptz)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  cid uuid := private.weekly_challenge_couple(target_user);
  ch public.couple_weekly_challenges := private.weekly_challenge_current(cid, target_challenge, at_time);
  t public.bond_quest_templates;
  recent text[];
begin
  if ch.completed_at is not null then
    raise exception using errcode = '22023', message = 'challenge_closed';
  end if;
  if ch.changes_used >= 1 then
    raise exception using errcode = '22023', message = 'challenge_change_used';
  end if;
  if exists (select 1 from public.couple_weekly_challenge_photos p where p.challenge_id = ch.id) then
    raise exception using errcode = '22023', message = 'challenge_has_photo';
  end if;
  select coalesce(array_agg(c.template_key), '{}') into recent
  from public.couple_weekly_challenges c where c.couple_id = cid and c.week_start >= ch.week_start - 84;
  t := private.weekly_challenge_pick(cid, ch.week_start, private.bond_mode_for_couple(cid), 'change', recent, ch.template_key);
  if t.key is null then
    raise exception using errcode = 'P0002', message = 'challenge_no_alternative';
  end if;
  update public.couple_weekly_challenges
     set template_key = t.key, title = t.title, short_title = t.short_title, two_places = t.two_places, changes_used = changes_used + 1
   where id = ch.id;
  return private.weekly_challenge_json(target_user, ch.id);
end;
$function$;

create or replace function private.weekly_challenge_add_photo(target_user uuid, target_challenge uuid, target_moment uuid, target_photo uuid, at_time timestamptz)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  cid uuid := private.weekly_challenge_couple(target_user);
  ch public.couple_weekly_challenges := private.weekly_challenge_current(cid, target_challenge, at_time);
  since timestamptz := ch.week_start::timestamp at time zone 'Europe/Rome';
  m public.moments;
  ph public.moment_photos;
  posted integer;
begin
  if ch.completed_at is not null then
    return private.weekly_challenge_json(target_user, ch.id);
  end if;
  -- Same error for "does not exist" and "belongs to another couple".
  select * into m from public.moments where id = target_moment and couple_id = cid;
  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_photo_not_found';
  end if;
  if target_photo is null then
    if m.created_by is distinct from target_user then
      raise exception using errcode = '42501', message = 'challenge_photo_not_own';
    end if;
    if m.created_at < since then
      raise exception using errcode = '22023', message = 'challenge_photo_too_old';
    end if;
  else
    select * into ph from public.moment_photos where id = target_photo and moment_id = m.id and couple_id = cid;
    if not found then
      raise exception using errcode = 'P0002', message = 'challenge_photo_not_found';
    end if;
    if ph.created_by is distinct from target_user then
      raise exception using errcode = '42501', message = 'challenge_photo_not_own';
    end if;
    if ph.created_at < since then
      raise exception using errcode = '22023', message = 'challenge_photo_too_old';
    end if;
  end if;

  insert into public.couple_weekly_challenge_photos(challenge_id, couple_id, user_id, moment_id, photo_id, created_at)
  values (ch.id, cid, target_user, m.id, target_photo, least(at_time, now()))
  on conflict (challenge_id, user_id) do nothing;

  select count(distinct p.user_id)::integer into posted
  from public.couple_weekly_challenge_photos p
  join public.profiles pr on pr.id = p.user_id and pr.couple_id = cid
  where p.challenge_id = ch.id;
  if posted >= (case when ch.two_places then 2 else 1 end) then
    perform private.weekly_challenge_complete(ch.id, 60, at_time, target_user);
  end if;
  return private.weekly_challenge_json(target_user, ch.id);
end;
$function$;

revoke all on function private.weekly_challenge_ends_at(date) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_pick(uuid, date, text, text, text[], text) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_complete(uuid, integer, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_ensure(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_couple(uuid) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_json(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_state(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_current(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_change(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.weekly_challenge_add_photo(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- client RPCs
create or replace function public.get_weekly_challenge()
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
  select private.weekly_challenge_state(auth.uid(), now())
$function$;

create or replace function public.change_weekly_challenge(target_challenge_id uuid)
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
  select private.weekly_challenge_change(auth.uid(), target_challenge_id, now())
$function$;

create or replace function public.add_weekly_challenge_photo(target_challenge_id uuid, target_moment_id uuid, target_photo_id uuid default null)
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
  select private.weekly_challenge_add_photo(auth.uid(), target_challenge_id, target_moment_id, target_photo_id, now())
$function$;

revoke all on function public.get_weekly_challenge() from public, anon, authenticated, service_role;
revoke all on function public.change_weekly_challenge(uuid) from public, anon, authenticated, service_role;
revoke all on function public.add_weekly_challenge_photo(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_weekly_challenge() to authenticated;
grant execute on function public.change_weekly_challenge(uuid) to authenticated;
grant execute on function public.add_weekly_challenge_photo(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- the weekly job
-- weekly-challenge-job (Monday morning, Saturday reminder): each couple's
-- challenge of this week, in both languages, and who already sent a photo.
create or replace function public.weekly_challenge_for_job(target_couple_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  ch public.couple_weekly_challenges := private.weekly_challenge_ensure(target_couple_id, now());
  t public.bond_quest_templates;
begin
  if ch.id is null then return null; end if;
  select * into t from public.bond_quest_templates where key = ch.template_key;
  return jsonb_build_object(
    'id', ch.id,
    'week_start', ch.week_start,
    'title', ch.title,
    'title_en', coalesce(t.title_en, ch.title),
    'short_title', ch.short_title,
    'short_title_en', coalesce(t.short_title_en, ch.short_title),
    'two_places', ch.two_places,
    'completed', ch.completed_at is not null,
    'posted_by', (select coalesce(jsonb_agg(p.user_id order by p.created_at), '[]') from public.couple_weekly_challenge_photos p where p.challenge_id = ch.id)
  );
end;
$function$;

create or replace function public.get_internal_weekly_challenge_cron_key()
 returns text
 language sql
 security definer
 set search_path to ''
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'us_weekly_challenge_cron_key' limit 1
$function$;

revoke all on function public.weekly_challenge_for_job(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_internal_weekly_challenge_cron_key() from public, anon, authenticated, service_role;
grant execute on function public.weekly_challenge_for_job(uuid) to service_role;
grant execute on function public.get_internal_weekly_challenge_cron_key() to service_role;

-- ---------------------------------------------------------------- the old missions
-- No more weekly boards: the answer keeps its shape, nothing is created.
create or replace function private.ensure_bond_week_internal()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  cid uuid;
  week date;
  quest_count integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  cid := private.current_couple_id();
  if cid is null then
    raise exception 'Couple not found';
  end if;
  week := private.bond_week_start_rome(now());
  select count(*)::integer into quest_count
  from public.bond_weekly_quests
  where couple_id = cid and week_start = week;
  return jsonb_build_object('week_start', week, 'mode', private.bond_mode_for_couple(cid), 'quest_count', quest_count);
end;
$function$;

-- ---------------------------------------------------------------- export
-- Same function as 20261103010817, plus the challenge photos the person sent.
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
      -- Lavagna V1 (20261103205050) runs before this file: its strokes stay in the export.
      'lavagna_strokes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at, x.id), '[]') from public.lavagna_strokes x where x.couple_id = cid and x.author_id = p_user),
      'weekly_challenge_photos', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'week_start', c.week_start, 'challenge', c.short_title, 'moment_id', x.moment_id, 'photo_id', x.photo_id, 'created_at', x.created_at) order by x.created_at), '[]')
        from public.couple_weekly_challenge_photos x join public.couple_weekly_challenges c on c.id = x.challenge_id where x.couple_id = cid and x.user_id = p_user)
    ),
    'media', pg_catalog.to_jsonb(media)
  );
end;
$fn$;
revoke all on function public.s32_export_user_data(uuid) from public, anon, authenticated;
grant execute on function public.s32_export_user_data(uuid) to service_role;

-- ---------------------------------------------------------------- Realtime
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['couple_weekly_challenges', 'couple_weekly_challenge_photos'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute pg_catalog.format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
