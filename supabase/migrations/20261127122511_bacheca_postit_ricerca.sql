-- La bacheca, fasi 2 e 3 (founder, grill 27/11/2026 D1–D16, tavola approvata):
-- i vostri post-it sulle cose della bacheca, e la ricerca in Ricordi con «Appendi».
--
-- Post-it (us_bacheca_notes):
-- * attached to a THING (moment, kept letter, kept answer, milestone) by its
--   ref_key, never to the pin: unpinning keeps them, they come back when the
--   thing is pinned again; deleting the memory or the kept item removes them;
-- * 80 characters, at most one per person per thing; each person writes,
--   edits and takes down only their own (auth.uid() is the author);
-- * free for everyone, no place in the 12; writing one makes the thing
--   «yours»: US never takes it down by itself any more.
-- US's own «why» (us_bacheca_why) survives an unpin too, so the memory shows
-- «Sulla bacheca» with US's post-it and yours even when it is not pinned.
--
-- Ricerca (search_ricordi_v1): on the server, only the caller's couple, at most
-- 60 results, the query never stored or logged by these functions. It reads
-- captions, places, post-its (US's and yours), month and year, who added it,
-- kept letters (Conservati) and kept answers. Never what was not kept.
--
-- Fai spazio: bacheca_pin_v1 takes an optional p_replace, the unfixed thing to
-- take down; the unpin and the pin happen in one transaction.
-- STAGING ONLY until the founder decides otherwise. Re-applying changes nothing.

-- ---------------------------------------------------------------- tables
create table if not exists public.us_bacheca_notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  ref_key text not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint us_bacheca_notes_body check (pg_catalog.char_length(body) between 1 and 80 and body = pg_catalog.btrim(body)),
  constraint us_bacheca_notes_ref check (ref_key ~ '^(moment|conserva|keepsake|traguardo):'),
  constraint us_bacheca_notes_one unique (couple_id, ref_key, author_id)
);
create index if not exists us_bacheca_notes_author on public.us_bacheca_notes (author_id);

create table if not exists public.us_bacheca_why (
  couple_id uuid not null references public.couples(id) on delete cascade,
  ref_key text not null,
  reason text not null,
  vars jsonb not null default '{}'::jsonb,
  primary key (couple_id, ref_key),
  constraint us_bacheca_why_reason check (reason in ('primo', 'prima_volta', 'storia', 'un_anno_fa', 'traguardo', 'tenuta', 'settimana'))
);

alter table public.us_bacheca_notes enable row level security;
alter table public.us_bacheca_why enable row level security;
revoke all on table public.us_bacheca_notes, public.us_bacheca_why from public, anon, authenticated;
grant all on table public.us_bacheca_notes, public.us_bacheca_why to service_role;
-- The two of the couple read their post-its; every write goes through bacheca_postit_v1.
grant select on table public.us_bacheca_notes to authenticated;
drop policy if exists us_bacheca_notes_read_couple on public.us_bacheca_notes;
create policy us_bacheca_notes_read_couple on public.us_bacheca_notes as permissive for select to authenticated
  using (couple_id = (select private.current_couple_id()));

-- ---------------------------------------------------------------- helpers
-- A thing of the couple, from its ref_key: what it is and its day. Nothing when
-- it is not the couple's (or no longer exists, or was never kept).
create or replace function private.us_bacheca_thing(p_couple uuid, p_ref text, out source text, out source_id uuid, out item_date date)
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  m text[];
begin
  m := pg_catalog.regexp_match(coalesce(p_ref, ''), '^(moment|conserva|keepsake):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  if m is not null then
    if m[1] = 'moment' then
      select mo.moment_date into item_date from public.moments mo where mo.id = m[2]::uuid and mo.couple_id = p_couple;
    elsif m[1] = 'conserva' then
      select (cc.created_at at time zone 'Europe/Rome')::date into item_date
        from public.conserva_contributions cc join public.left_for_you lf on lf.id = cc.source_item_id and lf.couple_id = p_couple
       where cc.id = m[2]::uuid and cc.couple_id = p_couple;
    else
      select k.question_date into item_date from public.daily_question_keepsakes k where k.id = m[2]::uuid and k.couple_id = p_couple;
    end if;
    if item_date is not null then source := m[1]; source_id := m[2]::uuid; end if;
    return;
  end if;
  -- A milestone has no row of its own: it is a thing while it hangs, or once
  -- it hung (its «why» is kept).
  if p_ref ~ '^traguardo:[a-z]+:[0-9]+$' then
    select x.item_date into item_date from public.us_bacheca_pins x where x.couple_id = p_couple and x.ref_key = p_ref;
    if item_date is null and exists (select 1 from public.us_bacheca_why y where y.couple_id = p_couple and y.ref_key = p_ref) then
      item_date := (pg_catalog.now() at time zone 'Europe/Rome')::date;
    end if;
    if item_date is not null then source := 'traguardo'; end if;
  end if;
end;
$fn$;
revoke all on function private.us_bacheca_thing(uuid, text) from public, anon, authenticated;

-- US's «why» of a thing: the pin's own reason while US's reason is on it, else
-- the one kept when it was taken down.
create or replace function private.us_bacheca_why_of(p_couple uuid, p_ref text, p_reason text, p_vars jsonb) returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select case when p_reason is not null and p_reason <> 'scelta'
    then pg_catalog.jsonb_build_object('reason', p_reason, 'vars', coalesce(p_vars, '{}'::jsonb))
    else (select pg_catalog.jsonb_build_object('reason', y.reason, 'vars', y.vars) from public.us_bacheca_why y where y.couple_id = p_couple and y.ref_key = p_ref)
  end;
$fn$;
revoke all on function private.us_bacheca_why_of(uuid, text, text, jsonb) from public, anon, authenticated;

-- The post-its of a thing, oldest first.
create or replace function private.us_bacheca_notes_of(p_couple uuid, p_ref text, p_me uuid) returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', n.id, 'by', n.author_id, 'mine', n.author_id = p_me, 'body', n.body, 'at', n.updated_at
         ) order by n.created_at, n.id), '[]'::jsonb)
    from public.us_bacheca_notes n where n.couple_id = p_couple and n.ref_key = p_ref;
$fn$;
revoke all on function private.us_bacheca_notes_of(uuid, text, uuid) from public, anon, authenticated;

-- The words the search compares: lower case, no accents, one kind of apostrophe.
create or replace function private.us_fold(p text) returns text
language sql immutable set search_path = ''
as $fn$
  select pg_catalog.lower(pg_catalog.translate(coalesce(p, ''),
    'ÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑàáâãäåèéêëìíîïòóôõöùúûüçñ’‘',
    'AAAAAAEEEEIIIIOOOOOUUUUCNaaaaaaeeeeiiiiooooouuuucn'''''));
$fn$;
revoke all on function private.us_fold(text) from public, anon, authenticated;

-- What US's post-it says (bacheca.js postit()), in Italian and English, for the search.
create or replace function private.us_bacheca_why_text(p_reason text, p_vars jsonb) returns text
language sql immutable set search_path = ''
as $fn$
  select case p_reason
    when 'primo' then 'Il vostro primo ricordo Your first memory'
    when 'prima_volta' then 'La prima volta a ' || coalesce(p_vars ->> 'place', '') || ' Una prima volta The first time'
    when 'storia' then 'Un pezzo della vostra storia A piece of your story'
    when 'un_anno_fa' then 'Un anno fa ' || coalesce(p_vars ->> 'place', '') || ' A year ago'
    when 'traguardo' then case when p_vars ->> 'what' = 'anni' then coalesce(p_vars ->> 'count', '') || ' anni insieme years together'
                               else coalesce(p_vars ->> 'count', '') || ' ricordi insieme memories together' end
    when 'tenuta' then 'Tenuta da voi Kept by you'
    when 'settimana' then 'Il ricordo della settimana The memory of the week'
    else '' end;
$fn$;
revoke all on function private.us_bacheca_why_text(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- triggers
-- A thing taken down (unpin, never again, US making room): US's «why» stays
-- with the thing, for the memory and for when it is pinned again. Not when
-- the thing itself is gone, nor when the couple is.
create or replace function private.us_bacheca_keep_why() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if old.reason <> 'scelta'
     and exists (select 1 from public.couples c where c.id = old.couple_id)
     and (old.source = 'traguardo' or (select t.source from private.us_bacheca_thing(old.couple_id, old.ref_key) t) is not null) then
    insert into public.us_bacheca_why (couple_id, ref_key, reason, vars)
    values (old.couple_id, old.ref_key, old.reason, coalesce(old.vars, '{}'::jsonb))
    on conflict (couple_id, ref_key) do update set reason = excluded.reason, vars = excluded.vars;
  end if;
  return null;
end;
$fn$;
revoke all on function private.us_bacheca_keep_why() from public, anon, authenticated;
drop trigger if exists us_bacheca_pins_keep_why on public.us_bacheca_pins;
create trigger us_bacheca_pins_keep_why after delete on public.us_bacheca_pins
  for each row execute function private.us_bacheca_keep_why();

-- The memory deleted, the letter or the answer no longer kept: its pin, its
-- post-its and US's «why» go with it (TG_ARGV[0] is the source).
create or replace function private.us_bacheca_forget_source() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  ref text := TG_ARGV[0] || ':' || old.id::text;
begin
  delete from public.us_bacheca_pins x where x.couple_id = old.couple_id and x.ref_key = ref;
  delete from public.us_bacheca_notes n where n.couple_id = old.couple_id and n.ref_key = ref;
  delete from public.us_bacheca_why y where y.couple_id = old.couple_id and y.ref_key = ref;
  return null;
end;
$fn$;
revoke all on function private.us_bacheca_forget_source() from public, anon, authenticated;
drop trigger if exists us_bacheca_forget_moment on public.moments;
create trigger us_bacheca_forget_moment after delete on public.moments
  for each row execute function private.us_bacheca_forget_source('moment');
drop trigger if exists us_bacheca_forget_conserva on public.conserva_contributions;
create trigger us_bacheca_forget_conserva after delete on public.conserva_contributions
  for each row execute function private.us_bacheca_forget_source('conserva');
drop trigger if exists us_bacheca_forget_keepsake on public.daily_question_keepsakes;
create trigger us_bacheca_forget_keepsake after delete on public.daily_question_keepsakes
  for each row execute function private.us_bacheca_forget_source('keepsake');

-- ---------------------------------------------------------------- the board
-- As in 20261125230000_us_bacheca_v1.sql, plus each thing's ref_key, US's
-- «why» and the post-its.
create or replace function public.get_bacheca_v1() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  today date := (pg_catalog.now() at time zone 'Europe/Rome')::date;
  pins jsonb;
begin
  if me is null or cid is null then return null; end if;
  perform private.us_bacheca_plan(cid, today);
  -- A memory deleted, a kept item no longer kept: it leaves the board.
  delete from public.us_bacheca_pins x
   where x.couple_id = cid and (
     (x.source = 'moment' and not exists (select 1 from public.moments mo where mo.id = x.source_id and mo.couple_id = cid))
     or (x.source = 'conserva' and not exists (select 1 from public.conserva_contributions cc join public.left_for_you lf on lf.id = cc.source_item_id where cc.id = x.source_id and cc.couple_id = cid))
     or (x.source = 'keepsake' and not exists (select 1 from public.daily_question_keepsakes k where k.id = x.source_id and k.couple_id = cid)));
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', x.id, 'ref_key', x.ref_key, 'source', x.source, 'source_id', x.source_id, 'reason', x.reason, 'vars', x.vars,
           'item_date', x.item_date, 'by_us', x.pinned_by is null, 'mine', x.pinned_by = me, 'fixed', x.fixed,
           'x', x.pos_x, 'y', x.pos_y, 'created_at', x.created_at,
           'why', private.us_bacheca_why_of(cid, x.ref_key, x.reason, x.vars),
           'notes', private.us_bacheca_notes_of(cid, x.ref_key, me),
           'content', case x.source
             when 'moment' then (select pg_catalog.jsonb_build_object('path', mo.storage_path, 'caption', mo.caption, 'place', mo.place_label, 'date', mo.moment_date, 'by', mo.created_by)
                                   from public.moments mo where mo.id = x.source_id)
             when 'conserva' then (select pg_catalog.jsonb_build_object('kind', lf.kind, 'body', lf.body, 'path', case when lf.kind = 'photo' then lf.media_path end, 'by', lf.sender_id)
                                     from public.conserva_contributions cc join public.left_for_you lf on lf.id = cc.source_item_id where cc.id = x.source_id)
             when 'keepsake' then (select pg_catalog.jsonb_build_object('question', k.question_text, 'francesco', k.francesco_answer, 'beatrice', k.beatrice_answer)
                                     from public.daily_question_keepsakes k where k.id = x.source_id)
             else null end
         ) order by x.item_date, x.created_at, x.id), '[]'::jsonb)
    into pins
    from public.us_bacheca_pins x where x.couple_id = cid;
  return pg_catalog.jsonb_build_object('limit', private.us_bacheca_limit(cid), 'plus', coalesce(private.couple_has_plus(cid), false), 'pins', pins);
end;
$fn$;
revoke all on function public.get_bacheca_v1() from public, anon;
grant execute on function public.get_bacheca_v1() to authenticated;

-- One thing, pinned or not (the memory's «Sulla bacheca», a search result):
-- its pin, US's «why», the post-its, and how full the board is.
create or replace function public.get_bacheca_thing_v1(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  ref text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_ref, '')));
  t record;
  pin public.us_bacheca_pins;
begin
  if me is null or cid is null then return null; end if;
  select * into t from private.us_bacheca_thing(cid, ref);
  if t.source is null then return null; end if;
  select * into pin from public.us_bacheca_pins x where x.couple_id = cid and x.ref_key = ref;
  return pg_catalog.jsonb_build_object(
    'ref_key', ref, 'source', t.source, 'source_id', t.source_id,
    'pin', case when pin.id is null then null else pg_catalog.jsonb_build_object('id', pin.id, 'fixed', pin.fixed, 'by_us', pin.pinned_by is null) end,
    'why', private.us_bacheca_why_of(cid, ref, pin.reason, pin.vars),
    'notes', private.us_bacheca_notes_of(cid, ref, me),
    'count', (select pg_catalog.count(*)::int from public.us_bacheca_pins x where x.couple_id = cid),
    'limit', private.us_bacheca_limit(cid));
end;
$fn$;
revoke all on function public.get_bacheca_thing_v1(text) from public, anon;
grant execute on function public.get_bacheca_thing_v1(text) to authenticated;

-- Your post-it on a thing: write or change it (p_body), or take it down (an
-- empty p_body). Only your own: the author is always the caller.
create or replace function public.bacheca_postit_v1(p_ref text, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  ref text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_ref, '')));
  clean text := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_body, ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
  t record;
  nid uuid;
  fresh boolean;
begin
  if me is null or cid is null then return pg_catalog.jsonb_build_object('status', 'no'); end if;
  select * into t from private.us_bacheca_thing(cid, ref);
  if t.source is null then return pg_catalog.jsonb_build_object('status', 'no'); end if;
  if clean = '' then
    delete from public.us_bacheca_notes n where n.couple_id = cid and n.ref_key = ref and n.author_id = me;
    return pg_catalog.jsonb_build_object('status', case when found then 'deleted' else 'none' end);
  end if;
  if pg_catalog.char_length(clean) > 80 then return pg_catalog.jsonb_build_object('status', 'too_long'); end if;
  insert into public.us_bacheca_notes as n (couple_id, ref_key, author_id, body)
  values (cid, ref, me, clean)
  on conflict (couple_id, ref_key, author_id) do update set body = excluded.body, updated_at = pg_catalog.now()
  returning n.id, (n.xmax = 0) into nid, fresh;
  -- Written on: the thing is yours, US never takes it down by itself (as when moved).
  update public.us_bacheca_pins x set pinned_by = coalesce(x.pinned_by, me) where x.couple_id = cid and x.ref_key = ref;
  return pg_catalog.jsonb_build_object('status', 'saved', 'id', nid, 'created', fresh);
end;
$fn$;
revoke all on function public.bacheca_postit_v1(text, text) from public, anon;
grant execute on function public.bacheca_postit_v1(text, text) to authenticated;

-- You pin something yourselves (from the search or a memory): a memory, a kept
-- letter or a kept answer of your couple. Full board: 'full', unless p_replace
-- names one of your unfixed things to take down in its place ('replaced'); a
-- fixed one is never taken ('fixed'). One couple's board changes one at a time.
drop function if exists public.bacheca_pin_v1(text, uuid);
create or replace function public.bacheca_pin_v1(p_source text, p_source_id uuid, p_replace uuid default null) returns text
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  v_at date;
  ref text;
  gone public.us_bacheca_pins;
  replaced boolean := false;
begin
  if me is null or cid is null or p_source_id is null or p_source not in ('moment', 'conserva', 'keepsake') then return 'no'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('us_bacheca:' || cid::text, 0));
  ref := p_source || ':' || p_source_id;
  select t.item_date into v_at from private.us_bacheca_thing(cid, ref) t where t.source is not null;
  if v_at is null then return 'no'; end if;
  if exists (select 1 from public.us_bacheca_pins x where x.couple_id = cid and x.ref_key = ref) then return 'already'; end if;
  if (select pg_catalog.count(*) from public.us_bacheca_pins x where x.couple_id = cid) >= private.us_bacheca_limit(cid) then
    if p_replace is null then return 'full'; end if;
    select * into gone from public.us_bacheca_pins x where x.id = p_replace and x.couple_id = cid for update;
    if gone.id is null then return 'full'; end if;
    if gone.fixed then return 'fixed'; end if;
    delete from public.us_bacheca_pins x where x.id = gone.id;
    replaced := true;
  end if;
  delete from public.us_bacheca_bans b where b.couple_id = cid and b.ref_key = ref;
  insert into public.us_bacheca_pins (couple_id, source, source_id, ref_key, reason, item_date, pinned_by, fixed)
  values (cid, p_source, p_source_id, ref, 'scelta', v_at, me, true)
  on conflict do nothing;
  -- US pinned it in the meantime: what was taken down never stays without its replacement.
  if not found then
    if replaced then raise exception 'bacheca_pin_race' using errcode = '40001'; end if;
    return 'already';
  end if;
  return case when replaced then 'replaced' else 'pinned' end;
end;
$fn$;
revoke all on function public.bacheca_pin_v1(text, uuid, uuid) from public, anon;
grant execute on function public.bacheca_pin_v1(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- the search
-- p_query: words (all must match); p_year / p_month; p_place (a place of the
-- memories, exact); p_who: 'me' or 'partner'. Without any of them, only the
-- hints for the empty field (years, the places with most memories, a year ago).
create or replace function public.search_ricordi_v1(p_query text default null, p_year int default null, p_place text default null, p_who text default null, p_month int default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  words text[];
  place text := nullif(private.us_fold(pg_catalog.btrim(coalesce(p_place, ''))), '');
  who text := case when p_who in ('me', 'partner') then p_who end;
  today date := (pg_catalog.now() at time zone 'Europe/Rome')::date;
  months_it text[] := array['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  months_en text[] := array['january','february','march','april','may','june','july','august','september','october','november','december'];
  results jsonb := '[]'::jsonb;
  hints jsonb;
begin
  if me is null or cid is null then return null; end if;
  -- At most 8 words of 40 letters; the LIKE wildcards are plain letters here.
  select coalesce(pg_catalog.array_agg(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.left(w, 40), '\', '\\'), '%', '\%'), '_', '\_')), '{}')
    into words
    from (select w from pg_catalog.regexp_split_to_table(private.us_fold(pg_catalog.left(coalesce(p_query, ''), 120)), '\s+') w where w <> '' limit 8) s;

  with names as (
    select pr.id, pr.role, pr.display_name from public.profiles pr where pr.couple_id = cid
  ), notes as (
    select n.ref_key, pg_catalog.string_agg(n.body, ' ') as body from public.us_bacheca_notes n where n.couple_id = cid group by n.ref_key
  ), whys as (
    select x.ref_key, private.us_bacheca_why_text(x.reason, x.vars) as body from public.us_bacheca_pins x where x.couple_id = cid and x.reason <> 'scelta'
    union all
    select y.ref_key, private.us_bacheca_why_text(y.reason, y.vars) from public.us_bacheca_why y where y.couple_id = cid
  ), things as (
    select 'moment'::text as kind, mo.id, mo.moment_date as d, mo.created_at as at, mo.created_by as by_id,
           pg_catalog.jsonb_build_object('caption', mo.caption, 'place', mo.place_label, 'path', mo.storage_path) as content,
           mo.place_label as place_label,
           pg_catalog.concat_ws(' ', mo.caption, mo.place_label,
             (select pg_catalog.string_agg(mp.caption, ' ') from public.moment_photos mp where mp.moment_id = mo.id and mp.couple_id = cid)) as hay
      from public.moments mo where mo.couple_id = cid
    union all
    select 'conserva', cc.id, (cc.created_at at time zone 'Europe/Rome')::date, cc.created_at, lf.sender_id,
           pg_catalog.jsonb_build_object('kind', lf.kind, 'body', lf.body, 'path', case when lf.kind = 'photo' then lf.media_path end),
           null, pg_catalog.concat_ws(' ', lf.body, 'lettera letter')
      from public.conserva_contributions cc join public.left_for_you lf on lf.id = cc.source_item_id and lf.couple_id = cid
     where cc.couple_id = cid and lf.kind in ('text', 'photo')
    union all
    select 'keepsake', k.id, k.question_date, k.kept_at, (select nm.id from names nm where nm.role = k.kept_by_role limit 1),
           pg_catalog.jsonb_build_object('question', k.question_text, 'francesco', k.francesco_answer, 'beatrice', k.beatrice_answer),
           null, pg_catalog.concat_ws(' ', k.question_text, k.francesco_answer, k.beatrice_answer, 'risposta domanda answer question')
      from public.daily_question_keepsakes k where k.couple_id = cid
  ), found_things as (
    select th.*, th.kind || ':' || th.id::text as ref_key from things th
     where (pg_catalog.cardinality(words) > 0 or p_year is not null or p_month is not null or place is not null or who is not null)
       and (p_year is null or extract(year from th.d)::int = p_year)
       and (p_month is null or extract(month from th.d)::int = p_month)
       and (place is null or private.us_fold(pg_catalog.btrim(th.place_label)) = place)
       and (who is null or (who = 'me' and th.by_id = me) or (who = 'partner' and th.by_id is distinct from me and th.by_id is not null))
  ), matched as (
    select ft.* from found_things ft
     where pg_catalog.cardinality(words) = 0 or not exists (
       select 1 from pg_catalog.unnest(words) w
        where private.us_fold(pg_catalog.concat_ws(' ', ft.hay,
                (select nt.body from notes nt where nt.ref_key = ft.ref_key),
                (select pg_catalog.string_agg(wy.body, ' ') from whys wy where wy.ref_key = ft.ref_key),
                (select nm.display_name from names nm where nm.id = ft.by_id),
                months_it[extract(month from ft.d)::int], months_en[extract(month from ft.d)::int], extract(year from ft.d)::int::text))
              not like '%' || w || '%' escape '\')
     order by ft.d desc, ft.at desc, ft.id
     limit 60
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'kind', m.kind, 'id', m.id, 'ref_key', m.ref_key, 'date', m.d, 'by', m.by_id, 'mine', m.by_id = me,
           'content', m.content,
           'pin', (select x.id from public.us_bacheca_pins x where x.couple_id = cid and x.ref_key = m.ref_key)
         ) order by m.d desc, m.at desc, m.id), '[]'::jsonb)
    into results from matched m;

  select pg_catalog.jsonb_build_object(
    'years', coalesce((select pg_catalog.jsonb_agg(y order by y desc) from (
        select distinct extract(year from mo.moment_date)::int as y from public.moments mo where mo.couple_id = cid
        union select distinct extract(year from (cc.created_at at time zone 'Europe/Rome'))::int from public.conserva_contributions cc where cc.couple_id = cid
        union select distinct extract(year from k.question_date)::int from public.daily_question_keepsakes k where k.couple_id = cid) ys), '[]'::jsonb),
    'places', coalesce((select pg_catalog.jsonb_agg(pl.label order by pl.n desc, pl.label) from (
        select pg_catalog.min(pg_catalog.btrim(mo.place_label)) as label, pg_catalog.count(*) as n
          from public.moments mo
         where mo.couple_id = cid and mo.place_label is not null and pg_catalog.btrim(mo.place_label) <> ''
         group by private.us_fold(pg_catalog.btrim(mo.place_label))
         order by pg_catalog.count(*) desc, 1 limit 12) pl), '[]'::jsonb),
    'year_ago', pg_catalog.jsonb_build_object('year', extract(year from today)::int - 1, 'month', extract(month from today)::int,
        'count', (select pg_catalog.count(*)::int from public.moments mo where mo.couple_id = cid
                    and extract(year from mo.moment_date)::int = extract(year from today)::int - 1
                    and extract(month from mo.moment_date)::int = extract(month from today)::int)),
    'pinned', (select pg_catalog.count(*)::int from public.us_bacheca_pins x where x.couple_id = cid),
    'limit', private.us_bacheca_limit(cid)
  ) into hints;
  return pg_catalog.jsonb_build_object('results', results, 'hints', hints);
end;
$fn$;
revoke all on function public.search_ricordi_v1(text, int, text, text, int) from public, anon;
grant execute on function public.search_ricordi_v1(text, int, text, text, int) to authenticated;

comment on table public.us_bacheca_notes is 'La bacheca, fase 2 (27/11/2026): your post-its on a thing of the board, one per person, 80 characters; tied to the thing (ref_key), not to the pin.';
comment on table public.us_bacheca_why is 'La bacheca, fase 2: US''s «why» of a thing taken down, kept for the memory and for when it is pinned again.';
