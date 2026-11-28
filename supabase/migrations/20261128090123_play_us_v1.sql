-- Play Us v1 (founder, 28/11/2026, grill D1–D22; docs/missions/play-us-v1.md).
-- The one mode of Gioca played together, live: an invite valid 3 minutes, then
-- 8 steps decided by the server (time or both done). One spent game per couple
-- and Rome day; spent from step 4. The server picks the questions, keeps every
-- move, and at the end writes the memory, the level points and the forfeit.
-- Clients never write the tables: everything goes through the functions below.

create table if not exists public.play_us_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  day date not null,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited',
  step smallint not null default 0,
  step_started_at timestamp with time zone,
  spent boolean not null default false,
  seed integer not null,
  items jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  moment_id uuid,
  invite_expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint play_us_sessions_status_check check (status in ('invited', 'declined', 'expired', 'playing', 'done', 'abandoned')),
  constraint play_us_sessions_step_check check (step between 0 and 8)
);
comment on table public.play_us_sessions is 'Play Us (28/11/2026): one live game of the couple, its step and result. Written only by the play_us_* functions.';
create index if not exists play_us_sessions_couple_idx on public.play_us_sessions (couple_id, created_at desc);
create index if not exists play_us_sessions_invited_by_idx on public.play_us_sessions (invited_by);
create unique index if not exists play_us_sessions_one_open on public.play_us_sessions (couple_id) where status in ('invited', 'playing');
create unique index if not exists play_us_sessions_one_spent_day on public.play_us_sessions (couple_id, day) where spent;

create table if not exists public.play_us_moves (
  session_id uuid not null references public.play_us_sessions(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  step smallint not null,
  kind text not null,
  slot smallint not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint play_us_moves_pkey primary key (session_id, user_id, step, kind, slot),
  constraint play_us_moves_step_check check (step between 1 and 8),
  constraint play_us_moves_kind_check check (kind in ('answer', 'photo', 'edit', 'guess', 'voice', 'gesture', 'score', 'done', 'ready', 'pegno'))
);
comment on table public.play_us_moves is 'Play Us: one move of one member in one step (an answer, a photo path, a score…). Written only by public.play_us_move.';
create index if not exists play_us_moves_couple_idx on public.play_us_moves (couple_id);
create index if not exists play_us_moves_user_idx on public.play_us_moves (user_id);

alter table public.play_us_sessions enable row level security;
alter table public.play_us_moves enable row level security;
revoke all on table public.play_us_sessions from public, anon, authenticated;
revoke all on table public.play_us_moves from public, anon, authenticated;
grant select on table public.play_us_sessions to authenticated;
grant select on table public.play_us_moves to authenticated;
grant all on table public.play_us_sessions to service_role;
grant all on table public.play_us_moves to service_role;

drop policy if exists play_us_sessions_select_same_couple on public.play_us_sessions;
create policy play_us_sessions_select_same_couple on public.play_us_sessions as permissive for select to authenticated
  using (couple_id = (select private.current_couple_id()));
drop policy if exists play_us_moves_select_same_couple on public.play_us_moves;
create policy play_us_moves_select_same_couple on public.play_us_moves as permissive for select to authenticated
  using (couple_id = (select private.current_couple_id()));

-- How long each step lasts, in seconds (step 1: three questions of 10 s with a
-- 2 s look at the answers; 7: until both are ready; 8: the end, no clock).
create or replace function private.play_us_step_seconds(p_step integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_step when 0 then 4 when 1 then 38 when 2 then 32 when 3 then 42 when 4 then 32
                     when 5 then 22 when 6 then 47 when 7 then 90 else 0 end
$$;
revoke all on function private.play_us_step_seconds(integer) from public, anon, authenticated;

-- One spent game a day for now; US Plus will raise it here, in one place.
create or replace function private.play_us_daily_limit(p_couple uuid)
returns integer
language sql
stable
set search_path = ''
as $$ select 1 $$;
revoke all on function private.play_us_daily_limit(uuid) from public, anon, authenticated;

create or replace function private.play_us_today()
returns date
language sql
stable
set search_path = ''
as $$ select (pg_catalog.now() at time zone 'Europe/Rome')::date $$;
revoke all on function private.play_us_today() from public, anon, authenticated;

-- The whole game as the client draws it: the session, every move, the clock.
create or replace function private.play_us_state(p_session uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when s.id is null then null else pg_catalog.jsonb_build_object(
    'id', s.id, 'couple_id', s.couple_id, 'day', s.day, 'invited_by', s.invited_by, 'status', s.status,
    'step', s.step, 'step_started_at', s.step_started_at, 'step_seconds', private.play_us_step_seconds(s.step),
    'spent', s.spent, 'seed', s.seed, 'items', s.items, 'result', s.result, 'moment_id', s.moment_id,
    'invite_expires_at', s.invite_expires_at, 'created_at', s.created_at,
    'moves', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', m.user_id, 'step', m.step, 'kind', m.kind, 'slot', m.slot, 'payload', m.payload, 'at', m.created_at) order by m.created_at)
                       from public.play_us_moves m where m.session_id = s.id), '[]'::jsonb),
    'server_now', pg_catalog.now()) end
  from public.play_us_sessions s where s.id = p_session
$$;
revoke all on function private.play_us_state(uuid) from public, anon, authenticated;

-- Stale invites expire; nobody left in a game for a long time: abandoned.
create or replace function private.play_us_tidy(p_couple uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.play_us_sessions set status = 'expired', updated_at = pg_catalog.now()
   where couple_id = p_couple and status = 'invited' and invite_expires_at <= pg_catalog.now();
  update public.play_us_sessions set status = 'abandoned', updated_at = pg_catalog.now()
   where couple_id = p_couple and status = 'playing'
     and step_started_at + pg_catalog.make_interval(secs => private.play_us_step_seconds(step) + 120) <= pg_catalog.now();
end;
$$;
revoke all on function private.play_us_tidy(uuid) from public, anon, authenticated;

-- The end: what the two of you did, the level points (once per game), the
-- memory with the two retouched photos.
create or replace function private.play_us_finish(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.play_us_sessions%rowtype;
  intesa integer := 0;
  scores jsonb := '{}'::jsonb;
  guessed jsonb := '{}'::jsonb;
  winner uuid := null;
  top integer := -1;
  ties integer := 0;
  member record;
  edits text[];
  mid uuid;
  months text[] := array['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  caption text;
begin
  select * into s from public.play_us_sessions where id = p_session for update;
  if s.id is null or s.result ? 'finished_at' then return; end if;

  -- Same answer to the same quick question.
  select count(*) into intesa from (
    select a.slot from public.play_us_moves a
      join public.play_us_moves b on b.session_id = a.session_id and b.step = 1 and b.kind = 'answer' and b.slot = a.slot and b.user_id <> a.user_id
     where a.session_id = s.id and a.step = 1 and a.kind = 'answer' and a.user_id = s.invited_by
       and a.payload->'i' = b.payload->'i') same;

  for member in select p.id from public.profiles p where p.couple_id = s.couple_id loop
    scores := scores || pg_catalog.jsonb_build_object(member.id::text, coalesce((select (m.payload->>'score')::integer from public.play_us_moves m
      where m.session_id = s.id and m.user_id = member.id and m.step = 6 and m.kind = 'score' order by m.created_at desc limit 1), 0));
    guessed := guessed || pg_catalog.jsonb_build_object(member.id::text, (select count(*) from public.play_us_moves g
      join public.play_us_moves t on t.session_id = g.session_id and t.step = 4 and t.kind = 'guess' and t.slot = g.slot and t.user_id <> g.user_id
      where g.session_id = s.id and g.user_id = member.id and g.step = 4 and g.kind = 'guess' and g.payload->'guess' = t.payload->'self'));
  end loop;
  for member in select key, value::integer as v from pg_catalog.jsonb_each_text(scores) loop
    if member.v > top then top := member.v; winner := member.key::uuid; ties := 1;
    elsif member.v = top then ties := ties + 1; end if;
  end loop;
  if ties > 1 or top <= 0 then winner := null; end if;

  -- The memory: the retouched photos (the inviter's work first).
  select pg_catalog.array_agg(m.payload->>'path' order by (m.user_id = s.invited_by) desc, m.created_at) into edits
    from public.play_us_moves m where m.session_id = s.id and m.step = 3 and m.kind = 'edit' and m.payload ? 'path';
  if edits is not null and pg_catalog.array_length(edits, 1) > 0 then
    mid := gen_random_uuid();
    caption := 'Play Us · ' || pg_catalog.date_part('day', s.day)::integer || ' ' || months[pg_catalog.date_part('month', s.day)::integer];
    insert into public.moments (id, couple_id, created_by, storage_path, caption, moment_date, created_at)
    values (mid, s.couple_id, s.invited_by, edits[1], caption, s.day, pg_catalog.now());
    if pg_catalog.array_length(edits, 1) > 1 then
      insert into public.moment_photos (id, moment_id, couple_id, created_by, storage_path, caption, position, created_at)
      values (gen_random_uuid(), mid, s.couple_id, s.invited_by, edits[2], null, 1, pg_catalog.now());
    end if;
  end if;

  -- +30 to the couple's level, once per game (provisional until the balance pass).
  begin
    perform private.progression_award(s.couple_id, s.invited_by, 'play_us', s.id::text, 30);
  exception when others then
    raise warning 'play_us award skipped: %', sqlerrm;
  end;

  update public.play_us_sessions
     set moment_id = mid,
         result = pg_catalog.jsonb_build_object('intesa', intesa, 'scores', scores, 'guessed', guessed, 'winner', winner, 'xp', 30, 'finished_at', pg_catalog.now()),
         updated_at = pg_catalog.now()
   where id = s.id;
end;
$$;
revoke all on function private.play_us_finish(uuid) from public, anon, authenticated;

-- Today: is the game of the day still there, is an invite open, the game in course.
create or replace function public.play_us_today()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  spent_today integer;
  open_id uuid;
  last_id uuid;
begin
  if uid is null or cid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  perform private.play_us_tidy(cid);
  select count(*) into spent_today from public.play_us_sessions where couple_id = cid and day = private.play_us_today() and spent;
  select id into open_id from public.play_us_sessions where couple_id = cid and status in ('invited', 'playing') order by created_at desc limit 1;
  select id into last_id from public.play_us_sessions where couple_id = cid and day = private.play_us_today() and status in ('done', 'abandoned') and spent order by created_at desc limit 1;
  return pg_catalog.jsonb_build_object(
    'limit', private.play_us_daily_limit(cid), 'spent_today', spent_today,
    'can_invite', open_id is null and spent_today < private.play_us_daily_limit(cid),
    'session', private.play_us_state(coalesce(open_id, last_id)), 'server_now', pg_catalog.now());
end;
$$;
revoke all on function public.play_us_today() from public, anon;
grant execute on function public.play_us_today() to authenticated;

create or replace function public.play_us_invite()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  partners integer;
  sid uuid;
begin
  if uid is null or cid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select count(*) into partners from public.profiles where couple_id = cid;
  if partners < 2 then raise exception using errcode = '22023', message = 'partner missing'; end if;
  perform private.play_us_tidy(cid);
  if (select count(*) from public.play_us_sessions where couple_id = cid and day = private.play_us_today() and spent) >= private.play_us_daily_limit(cid) then
    raise exception using errcode = '22023', message = 'played today';
  end if;
  if exists (select 1 from public.play_us_sessions where couple_id = cid and status in ('invited', 'playing')) then
    raise exception using errcode = '22023', message = 'game open';
  end if;
  insert into public.play_us_sessions (couple_id, day, invited_by, seed, invite_expires_at)
  values (cid, private.play_us_today(), uid, (pg_catalog.floor(pg_catalog.random() * 2147483646) + 1)::integer, pg_catalog.now() + interval '3 minutes')
  returning id into sid;
  return private.play_us_state(sid);
end;
$$;
revoke all on function public.play_us_invite() from public, anon;
grant execute on function public.play_us_invite() to authenticated;

-- The other one answers. Accepted: the server picks 3 quick questions and 2
-- «Quanto mi conosci» ones (short, choice, not used in the last 14 days) and
-- the game starts after a 4 s lobby countdown.
create or replace function public.play_us_answer(p_session uuid, p_accept boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  s public.play_us_sessions%rowtype;
  quick jsonb;
  know jsonb;
begin
  if uid is null or cid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  perform private.play_us_tidy(cid);
  select * into s from public.play_us_sessions where id = p_session and couple_id = cid for update;
  if s.id is null then raise exception using errcode = '42501', message = 'not your game'; end if;
  if s.invited_by = uid then raise exception using errcode = '22023', message = 'own invite'; end if;
  if s.status <> 'invited' then raise exception using errcode = '22023', message = 'invite closed'; end if;
  if not coalesce(p_accept, false) then
    update public.play_us_sessions set status = 'declined', updated_at = pg_catalog.now() where id = s.id;
    return private.play_us_state(s.id);
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'q', c.question_text, 'o', c.options)) into quick
    from (select c.* from public.game_v2_catalog c
           where c.active and c.mechanic = 'reciprocal' and c.answer_kind = 'choice'
             and pg_catalog.jsonb_array_length(c.options) between 2 and 4
             and pg_catalog.char_length(c.question_text) <= 70 and pg_catalog.strpos(c.question_text, '{') = 0
             and not exists (select 1 from public.play_us_sessions o, pg_catalog.jsonb_array_elements(o.items) e
                              where o.couple_id = cid and o.created_at > pg_catalog.now() - interval '14 days' and e->>'id' = c.id)
           order by pg_catalog.random() limit 3) c;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'q', c.question_text, 'o', c.options)) into know
    from (select c.* from public.game_v2_catalog c
           where c.active and c.mechanic = 'prediction' and c.answer_kind = 'choice'
             and pg_catalog.jsonb_array_length(c.options) between 2 and 4
             and pg_catalog.char_length(c.question_text) <= 80 and pg_catalog.strpos(c.question_text, '{') = 0
             and not exists (select 1 from public.play_us_sessions o, pg_catalog.jsonb_array_elements(o.items) e
                              where o.couple_id = cid and o.created_at > pg_catalog.now() - interval '14 days' and e->>'id' = c.id)
           order by pg_catalog.random() limit 2) c;
  if coalesce(pg_catalog.jsonb_array_length(quick), 0) < 3 or coalesce(pg_catalog.jsonb_array_length(know), 0) < 2 then
    raise exception using errcode = '22023', message = 'not enough content';
  end if;
  update public.play_us_sessions
     set status = 'playing', step = 1, step_started_at = pg_catalog.now() + interval '4 seconds',
         items = quick || know, updated_at = pg_catalog.now()
   where id = s.id;
  return private.play_us_state(s.id);
end;
$$;
revoke all on function public.play_us_answer(uuid, boolean) from public, anon;
grant execute on function public.play_us_answer(uuid, boolean) to authenticated;

-- One move, only in its step and its time.
create or replace function public.play_us_move(p_session uuid, p_step integer, p_kind text, p_slot integer, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  s public.play_us_sessions%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_slot integer := coalesce(p_slot, 0);
  n integer;
  prefix text;
  v_path text;
  pegni text[] := array['Mi devi un caffè', 'Stasera il film lo scelgo io', 'Un vocale della buonanotte', 'Una foto di te appena sveglia', 'Un massaggio di dieci minuti', 'La prossima pizza la offri tu'];
  note_id uuid;
begin
  if uid is null or cid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select * into s from public.play_us_sessions ps where ps.id = p_session and ps.couple_id = cid;
  if s.id is null then raise exception using errcode = '42501', message = 'not your game'; end if;
  if p_kind = 'pegno' then
    if s.status <> 'done' or p_step <> 8 then raise exception using errcode = '22023', message = 'not now'; end if;
    if (s.result->>'winner') is distinct from uid::text then raise exception using errcode = '42501', message = 'only the winner'; end if;
    if not coalesce(v_payload->>'text' = any (pegni), false) then raise exception using errcode = '22023', message = 'pegno invalid'; end if;
    if exists (select 1 from public.play_us_moves pm where pm.session_id = s.id and pm.kind = 'pegno') then
      return private.play_us_state(s.id);
    end if;
    note_id := gen_random_uuid();
    insert into public.couple_notes (id, couple_id, title, body, created_by, updated_by, color)
    values (note_id, cid, 'Pegno di Play Us', v_payload->>'text', uid, uid, 'pink');
    insert into public.play_us_moves as pm (session_id, couple_id, user_id, step, kind, slot, payload)
    values (s.id, cid, uid, 8, 'pegno', 0, pg_catalog.jsonb_build_object('text', v_payload->>'text', 'note_id', note_id));
    return private.play_us_state(s.id);
  end if;
  if s.status <> 'playing' or s.step <> p_step then raise exception using errcode = '22023', message = 'not this step'; end if;
  if pg_catalog.now() < s.step_started_at - interval '1 second'
     or pg_catalog.now() > s.step_started_at + pg_catalog.make_interval(secs => private.play_us_step_seconds(s.step) + 3) then
    raise exception using errcode = '22023', message = 'time is up';
  end if;
  if not ((p_step = 1 and p_kind in ('answer', 'done')) or (p_step = 2 and p_kind in ('photo', 'done'))
       or (p_step = 3 and p_kind in ('edit', 'done')) or (p_step = 4 and p_kind in ('guess', 'done'))
       or (p_step = 5 and p_kind in ('voice', 'gesture', 'done')) or (p_step = 6 and p_kind in ('score', 'done'))
       or (p_step = 7 and p_kind = 'ready')) then
    raise exception using errcode = '22023', message = 'kind invalid';
  end if;
  prefix := cid::text || '/' || uid::text || '/play-us/' || s.id::text || '/';
  if p_kind = 'answer' then
    if v_slot not between 0 and 2 then raise exception using errcode = '22023', message = 'slot invalid'; end if;
    n := pg_catalog.jsonb_array_length(s.items->v_slot->'o');
    if pg_catalog.jsonb_typeof(v_payload->'i') is distinct from 'number' or (v_payload->>'i')::integer not between 0 and n - 1 then
      raise exception using errcode = '22023', message = 'answer invalid';
    end if;
    v_payload := pg_catalog.jsonb_build_object('i', (v_payload->>'i')::integer);
  elsif p_kind = 'guess' then
    if v_slot not between 0 and 1 then raise exception using errcode = '22023', message = 'slot invalid'; end if;
    n := pg_catalog.jsonb_array_length(s.items->(3 + v_slot)->'o');
    if pg_catalog.jsonb_typeof(v_payload->'self') is distinct from 'number' or pg_catalog.jsonb_typeof(v_payload->'guess') is distinct from 'number'
       or (v_payload->>'self')::integer not between 0 and n - 1 or (v_payload->>'guess')::integer not between 0 and n - 1 then
      raise exception using errcode = '22023', message = 'guess invalid';
    end if;
    v_payload := pg_catalog.jsonb_build_object('self', (v_payload->>'self')::integer, 'guess', (v_payload->>'guess')::integer);
  elsif p_kind in ('photo', 'edit', 'voice') then
    v_path := v_payload->>'path';
    if p_kind = 'photo' and coalesce((v_payload->>'skipped')::boolean, false) then
      v_payload := '{"skipped": true}'::jsonb;
    elsif v_path is null or pg_catalog.left(v_path, pg_catalog.length(prefix)) <> prefix
          or v_path !~ '^[0-9a-z/_.-]+$' or pg_catalog.strpos(v_path, '..') > 0 or pg_catalog.length(v_path) > 300 then
      raise exception using errcode = '22023', message = 'path invalid';
    else
      v_payload := pg_catalog.jsonb_build_object('path', v_path);
    end if;
  elsif p_kind = 'gesture' then
    if not coalesce(v_payload->>'g' = any (array['abbraccio', 'bacio', 'cuore']), false) then raise exception using errcode = '22023', message = 'gesture invalid'; end if;
    v_payload := pg_catalog.jsonb_build_object('g', v_payload->>'g');
  elsif p_kind = 'score' then
    if pg_catalog.jsonb_typeof(v_payload->'score') is distinct from 'number' or (v_payload->>'score')::integer not between 0 and 5000 then
      raise exception using errcode = '22023', message = 'score invalid';
    end if;
    v_payload := pg_catalog.jsonb_build_object('score', (v_payload->>'score')::integer);
  else
    v_payload := '{}'::jsonb;
    v_slot := 0;
  end if;
  if p_kind in ('answer', 'guess') then
    insert into public.play_us_moves as pm (session_id, couple_id, user_id, step, kind, slot, payload)
    values (s.id, cid, uid, p_step, p_kind, v_slot, v_payload)
    on conflict on constraint play_us_moves_pkey do nothing;
  else
    insert into public.play_us_moves as pm (session_id, couple_id, user_id, step, kind, slot, payload)
    values (s.id, cid, uid, p_step, p_kind, v_slot, v_payload)
    on conflict on constraint play_us_moves_pkey do update set payload = excluded.payload, created_at = pg_catalog.now();
  end if;
  return private.play_us_state(s.id);
end;
$$;
revoke all on function public.play_us_move(uuid, integer, text, integer, jsonb) from public, anon;
grant execute on function public.play_us_move(uuid, integer, text, integer, jsonb) to authenticated;

-- Next step when both are done or the time is up; both phones call it, the
-- server moves once. From step 4 the game of the day is spent; step 8 is the end.
create or replace function public.play_us_advance(p_session uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  s public.play_us_sessions%rowtype;
  both_done boolean;
  next_step integer;
begin
  if uid is null or cid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  perform private.play_us_tidy(cid);
  select * into s from public.play_us_sessions where id = p_session and couple_id = cid for update;
  if s.id is null then raise exception using errcode = '42501', message = 'not your game'; end if;
  if s.status <> 'playing' then return private.play_us_state(s.id); end if;
  select count(distinct m.user_id) >= 2 into both_done from public.play_us_moves m
   where m.session_id = s.id and m.step = s.step and m.kind in ('done', 'ready');
  if not both_done and pg_catalog.now() < s.step_started_at + pg_catalog.make_interval(secs => private.play_us_step_seconds(s.step)) then
    return private.play_us_state(s.id);
  end if;
  next_step := s.step + 1;
  if next_step >= 8 then
    update public.play_us_sessions set step = 8, step_started_at = pg_catalog.now(), status = 'done', spent = true, updated_at = pg_catalog.now() where id = s.id;
    perform private.play_us_finish(s.id);
  else
    update public.play_us_sessions
       set step = next_step, step_started_at = pg_catalog.now(), spent = spent or next_step >= 4, updated_at = pg_catalog.now()
     where id = s.id;
  end if;
  return private.play_us_state(s.id);
end;
$$;
revoke all on function public.play_us_advance(uuid) from public, anon;
grant execute on function public.play_us_advance(uuid) to authenticated;

-- The other one is gone for 60 s: the game closes; what was done stays (and,
-- when the game was already spent, the memory and the points too).
create or replace function public.play_us_abandon(p_session uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  s public.play_us_sessions%rowtype;
begin
  if uid is null or cid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select * into s from public.play_us_sessions where id = p_session and couple_id = cid for update;
  if s.id is null then raise exception using errcode = '42501', message = 'not your game'; end if;
  if s.status = 'invited' then
    update public.play_us_sessions set status = 'expired', updated_at = pg_catalog.now() where id = s.id;
  elsif s.status = 'playing' then
    update public.play_us_sessions set status = 'abandoned', updated_at = pg_catalog.now() where id = s.id;
    if s.spent then perform private.play_us_finish(s.id); end if;
  end if;
  return private.play_us_state(s.id);
end;
$$;
revoke all on function public.play_us_abandon(uuid) from public, anon;
grant execute on function public.play_us_abandon(uuid) to authenticated;

-- Live: both tables in the Realtime publication (postgres_changes, filtered by couple).
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'play_us_sessions') then
      alter publication supabase_realtime add table public.play_us_sessions;
    end if;
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'play_us_moves') then
      alter publication supabase_realtime add table public.play_us_moves;
    end if;
  end if;
end;
$$;

-- Presence and Broadcast on the couple's private channel «us-couple:<couple id>»
-- (Realtime Authorization: RLS on realtime.messages; the client joins with
-- config.private = true). Only the two of the couple can listen and send.
do $$
begin
  if pg_catalog.to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists us_couple_channel_listen on realtime.messages';
    execute $p$create policy us_couple_channel_listen on realtime.messages as permissive for select to authenticated
      using (realtime.messages.extension in ('broadcast', 'presence')
             and (select realtime.topic()) = 'us-couple:' || (select private.current_couple_id())::text)$p$;
    execute 'drop policy if exists us_couple_channel_send on realtime.messages';
    execute $p$create policy us_couple_channel_send on realtime.messages as permissive for insert to authenticated
      with check (realtime.messages.extension in ('broadcast', 'presence')
                  and (select realtime.topic()) = 'us-couple:' || (select private.current_couple_id())::text)$p$;
  end if;
end;
$$;
