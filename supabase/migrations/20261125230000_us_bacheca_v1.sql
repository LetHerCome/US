-- La vostra bacheca, prima versione (founder, 25/11/2026; grill D1–D27,
-- tavola «US · La vostra bacheca»). The Bacheca in Ricordi is the couple's
-- «anta del frigo», kept by US (Cupido): it fills it and changes it from what
-- the couple already has; the two of them have the last word (fix, move,
-- unpin, «never again»).
--
-- * Rules only, no AI, from what both already see: moments, the Lasciato per
--   te items kept in Conservati, the kept answers of the daily question.
--   A caption with delicate words never goes up (private.us_ricorda_delicato).
-- * What is pinned is only a reference (source + id) with the reason and a few
--   values for its post-it; the content is read live, so a deleted memory
--   leaves the board by itself.
-- * Planned lazily, like US vi ricorda: the first get_bacheca_v1() of a day
--   plans that day for the couple. The first time it fills up to 8 places with
--   the couple's story; then at most one new thing a day (a year ago, a
--   milestone), two on Monday (the memory of the week, something kept).
-- * 12 things for free (US and yours together); with US Plus no practical
--   limit (500). When the board is full, US makes room only by taking down one
--   of its own unfixed things; yours and the fixed ones stay.
-- Staging first, with the founder's go-ahead. Re-applying changes nothing.

create table if not exists public.us_bacheca_pins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  source text not null,
  source_id uuid,
  ref_key text not null,
  reason text not null,
  vars jsonb not null default '{}'::jsonb,
  item_date date not null,
  pinned_by uuid references public.profiles(id) on delete set null,
  fixed boolean not null default false,
  pos_x real,
  pos_y real,
  created_at timestamptz not null default pg_catalog.now(),
  constraint us_bacheca_pins_source check (source in ('moment', 'conserva', 'keepsake', 'traguardo')),
  constraint us_bacheca_pins_reason check (reason in ('primo', 'prima_volta', 'storia', 'un_anno_fa', 'traguardo', 'tenuta', 'settimana', 'scelta')),
  constraint us_bacheca_pins_ref unique (couple_id, ref_key),
  constraint us_bacheca_pins_pos check ((pos_x is null) = (pos_y is null))
);
create index if not exists us_bacheca_pins_couple on public.us_bacheca_pins (couple_id, item_date);
create index if not exists us_bacheca_pins_pinned_by on public.us_bacheca_pins (pinned_by);

create table if not exists public.us_bacheca_bans (
  couple_id uuid not null references public.couples(id) on delete cascade,
  ref_key text not null,
  banned_by uuid references public.profiles(id) on delete set null,
  banned_at timestamptz not null default pg_catalog.now(),
  primary key (couple_id, ref_key)
);
create index if not exists us_bacheca_bans_banned_by on public.us_bacheca_bans (banned_by);

create table if not exists public.us_bacheca_planned (
  couple_id uuid not null references public.couples(id) on delete cascade,
  day date not null,
  first_fill boolean not null default false,
  planned_at timestamptz not null default pg_catalog.now(),
  primary key (couple_id, day)
);

alter table public.us_bacheca_pins enable row level security;
alter table public.us_bacheca_bans enable row level security;
alter table public.us_bacheca_planned enable row level security;
revoke all on table public.us_bacheca_pins, public.us_bacheca_bans, public.us_bacheca_planned from public, anon, authenticated;
grant all on table public.us_bacheca_pins, public.us_bacheca_bans, public.us_bacheca_planned to service_role;
-- The two of the couple read their board; every write goes through the functions below.
grant select on table public.us_bacheca_pins to authenticated;
drop policy if exists us_bacheca_pins_read_couple on public.us_bacheca_pins;
create policy us_bacheca_pins_read_couple on public.us_bacheca_pins as permissive for select to authenticated
  using (couple_id = (select private.current_couple_id()));

create or replace function private.us_bacheca_limit(p_couple uuid) returns int
language sql stable security definer set search_path = ''
as $fn$
  select case when coalesce(private.couple_has_plus(p_couple), false) then 500 else 12 end;
$fn$;
revoke all on function private.us_bacheca_limit(uuid) from public, anon, authenticated;

-- One thing up by US: never twice, never a banned one; when the board is full,
-- only one of US's own unfixed things makes room.
create or replace function private.us_bacheca_add(p_couple uuid, p_ref text, p_source text, p_source_id uuid, p_reason text, p_vars jsonb, p_date date)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  room uuid;
begin
  if exists (select 1 from public.us_bacheca_bans b where b.couple_id = p_couple and b.ref_key = p_ref)
     or exists (select 1 from public.us_bacheca_pins x where x.couple_id = p_couple and x.ref_key = p_ref) then
    return false;
  end if;
  if (select pg_catalog.count(*) from public.us_bacheca_pins x where x.couple_id = p_couple) >= private.us_bacheca_limit(p_couple) then
    select x.id into room from public.us_bacheca_pins x
     where x.couple_id = p_couple and x.pinned_by is null and not x.fixed
     order by x.created_at, x.id limit 1;
    if room is null then return false; end if;
    delete from public.us_bacheca_pins x where x.id = room;
  end if;
  insert into public.us_bacheca_pins (couple_id, source, source_id, ref_key, reason, vars, item_date)
  values (p_couple, p_source, p_source_id, p_ref, p_reason, coalesce(p_vars, '{}'::jsonb), p_date)
  on conflict do nothing;
  return found;
end;
$fn$;
revoke all on function private.us_bacheca_add(uuid, text, text, uuid, text, jsonb, date) from public, anon, authenticated;

create or replace function private.us_bacheca_plan(p_couple uuid, p_day date) returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  started date;
  first_time boolean;
  added int := 0;
  budget int;
  c record;
  months int;
  step int;
begin
  if p_couple is null or p_day is null then return; end if;
  -- The first fill waits for the first memory: an empty couple keeps it for later.
  first_time := not exists (select 1 from public.us_bacheca_planned pl where pl.couple_id = p_couple and pl.first_fill)
                and exists (select 1 from public.moments mo where mo.couple_id = p_couple);
  insert into public.us_bacheca_planned (couple_id, day, first_fill) values (p_couple, p_day, first_time) on conflict do nothing;
  if not found then return; end if;
  select x.started_on into started from public.couples x where x.id = p_couple;

  if first_time then
    -- The story, the first time (D15): the first memory, the first times in new
    -- places, one memory for some different months, the memory of the week. Up to 8.
    for c in
      select mo.id, mo.moment_date, mo.place_label from public.moments mo
       where mo.couple_id = p_couple and not private.us_ricorda_delicato(mo.caption)
       order by mo.moment_date, mo.created_at, mo.id limit 1
    loop
      if private.us_bacheca_add(p_couple, 'moment:' || c.id, 'moment', c.id, 'primo', pg_catalog.jsonb_build_object('place', c.place_label), c.moment_date) then added := added + 1; end if;
    end loop;
    for c in
      select f.id, f.moment_date, f.place_label from (
        select distinct on (pg_catalog.lower(pg_catalog.btrim(mo.place_label))) mo.id, mo.moment_date, mo.place_label, mo.created_at
          from public.moments mo
         where mo.couple_id = p_couple and mo.place_label is not null and pg_catalog.btrim(mo.place_label) <> ''
           and not private.us_ricorda_delicato(mo.caption)
         order by pg_catalog.lower(pg_catalog.btrim(mo.place_label)), mo.moment_date, mo.created_at
      ) f order by f.moment_date, f.created_at limit 3
    loop
      if private.us_bacheca_add(p_couple, 'moment:' || c.id, 'moment', c.id, 'prima_volta', pg_catalog.jsonb_build_object('place', c.place_label), c.moment_date) then added := added + 1; end if;
    end loop;
    select pg_catalog.count(distinct pg_catalog.date_trunc('month', mo.moment_date))::int into months from public.moments mo where mo.couple_id = p_couple;
    step := greatest(1, ceil(months::numeric / greatest(1, 7 - added))::int);
    for c in
      select s.id, s.moment_date, s.place_label from (
        select m2.*, pg_catalog.row_number() over (order by m2.month) as n from (
          select distinct on (pg_catalog.date_trunc('month', mo.moment_date)) pg_catalog.date_trunc('month', mo.moment_date) as month,
                 mo.id, mo.moment_date, mo.place_label
            from public.moments mo
           where mo.couple_id = p_couple and not private.us_ricorda_delicato(mo.caption)
           order by pg_catalog.date_trunc('month', mo.moment_date), (mo.caption is null or pg_catalog.btrim(mo.caption) = ''), mo.created_at
        ) m2
      ) s where (s.n - 1) % step = 0 order by s.month
    loop
      exit when added >= 7;
      if private.us_bacheca_add(p_couple, 'moment:' || c.id, 'moment', c.id, 'storia', pg_catalog.jsonb_build_object('place', c.place_label), c.moment_date) then added := added + 1; end if;
    end loop;
    for c in
      select mo.id, mo.moment_date, mo.place_label from public.moments mo
       where mo.couple_id = p_couple and mo.caption is not null and pg_catalog.btrim(mo.caption) <> ''
         and not private.us_ricorda_delicato(mo.caption)
       order by mo.created_at desc, mo.id limit 1
    loop
      perform private.us_bacheca_add(p_couple, 'moment:' || c.id, 'moment', c.id, 'settimana', pg_catalog.jsonb_build_object('place', c.place_label), c.moment_date);
    end loop;
    return;
  end if;

  -- Every day (D10): one new thing at most; on Monday two.
  budget := case when extract(isodow from p_day) = 1 then 2 else 1 end;
  for c in
    select * from (
      -- A year ago today.
      (select 1 as prio, 'moment:' || mo.id as ref, 'moment'::text as source, mo.id as source_id, 'un_anno_fa'::text as reason,
              pg_catalog.jsonb_build_object('place', mo.place_label, 'years', 1) as vars, mo.moment_date as day_at
         from public.moments mo
        where mo.couple_id = p_couple and mo.moment_date = (p_day - interval '1 year')::date
          and not private.us_ricorda_delicato(mo.caption)
        order by (mo.place_label is null), mo.created_at limit 1)
      union all
      -- The anniversary of being together.
      select 1, 'traguardo:anni:' || (extract(year from p_day)::int - extract(year from started)::int), 'traguardo', null::uuid, 'traguardo',
             pg_catalog.jsonb_build_object('what', 'anni', 'count', extract(year from p_day)::int - extract(year from started)::int), p_day
       where started is not null and p_day > started
         and p_day = private.us_ricorda_on_day(extract(year from p_day)::int, extract(month from started)::int, extract(day from started)::int)
      union all
      -- Round numbers of memories, reached yesterday.
      select 2, 'traguardo:ricordi:' || n.total, 'traguardo', null::uuid, 'traguardo',
             pg_catalog.jsonb_build_object('what', 'ricordi', 'count', n.total), p_day - 1
        from (select pg_catalog.count(*)::int as total,
                     pg_catalog.count(*) filter (where (mo.created_at at time zone 'Europe/Rome')::date = p_day - 1)::int as yesterday
                from public.moments mo where mo.couple_id = p_couple and (mo.created_at at time zone 'Europe/Rome')::date < p_day) n
       where n.yesterday > 0 and n.total in (10, 25, 50, 100, 200, 300, 500, 1000)
      union all
      -- Monday: the memory of the week (the latest with words)…
      (select 3, 'moment:' || mo.id, 'moment', mo.id, 'settimana',
              pg_catalog.jsonb_build_object('place', mo.place_label), mo.moment_date
         from public.moments mo
        where extract(isodow from p_day) = 1 and mo.couple_id = p_couple
          and mo.created_at >= ((p_day - 7)::timestamp at time zone 'Europe/Rome')
          and mo.caption is not null and pg_catalog.btrim(mo.caption) <> '' and not private.us_ricorda_delicato(mo.caption)
        order by mo.created_at desc limit 1)
      union all
      -- …and something kept in the week: a letter, or an answer.
      (select 4, 'conserva:' || cc.id, 'conserva', cc.id, 'tenuta', '{}'::jsonb, (cc.created_at at time zone 'Europe/Rome')::date
         from public.conserva_contributions cc
         join public.left_for_you lf on lf.id = cc.source_item_id and lf.couple_id = p_couple
        where extract(isodow from p_day) = 1 and cc.couple_id = p_couple
          and cc.created_at >= ((p_day - 7)::timestamp at time zone 'Europe/Rome')
          and lf.kind in ('text', 'photo') and not private.us_ricorda_delicato(lf.body)
        order by cc.created_at desc limit 1)
      union all
      (select 4, 'keepsake:' || k.id, 'keepsake', k.id, 'tenuta', '{}'::jsonb, k.question_date
         from public.daily_question_keepsakes k
        where extract(isodow from p_day) = 1 and k.couple_id = p_couple
          and k.kept_at >= ((p_day - 7)::timestamp at time zone 'Europe/Rome')
        order by k.kept_at desc limit 1)
    ) cands
    order by cands.prio, cands.ref
  loop
    exit when added >= budget;
    if private.us_bacheca_add(p_couple, c.ref, c.source, c.source_id, c.reason, c.vars, c.day_at) then added := added + 1; end if;
  end loop;
end;
$fn$;
revoke all on function private.us_bacheca_plan(uuid, date) from public, anon, authenticated;

-- The board of the caller's couple, planning today the first time.
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
           'id', x.id, 'source', x.source, 'source_id', x.source_id, 'reason', x.reason, 'vars', x.vars,
           'item_date', x.item_date, 'by_us', x.pinned_by is null, 'mine', x.pinned_by = me, 'fixed', x.fixed,
           'x', x.pos_x, 'y', x.pos_y, 'created_at', x.created_at,
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

-- The last word is yours (D11, D26): fix, unfix, move (it becomes yours and
-- stays), unpin (back where it came from), ban («Non appenderla più»).
create or replace function public.bacheca_pin_action_v1(p_pin uuid, p_action text, p_x real default null, p_y real default null)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  pin public.us_bacheca_pins;
begin
  if me is null or cid is null or p_pin is null or p_action not in ('fix', 'unfix', 'move', 'unpin', 'ban') then return false; end if;
  select * into pin from public.us_bacheca_pins x where x.id = p_pin and x.couple_id = cid;
  if not found then return false; end if;
  if p_action = 'fix' then
    update public.us_bacheca_pins x set fixed = true where x.id = pin.id;
  elsif p_action = 'unfix' then
    update public.us_bacheca_pins x set fixed = false where x.id = pin.id;
  elsif p_action = 'move' then
    if p_x is null or p_y is null or 'NaN'::real in (p_x, p_y) or abs(p_x) > 100000 or abs(p_y) > 100000 then return false; end if;
    update public.us_bacheca_pins x set pos_x = p_x, pos_y = p_y, fixed = true, pinned_by = coalesce(x.pinned_by, me) where x.id = pin.id;
  elsif p_action = 'unpin' then
    delete from public.us_bacheca_pins x where x.id = pin.id;
  else
    delete from public.us_bacheca_pins x where x.id = pin.id;
    insert into public.us_bacheca_bans (couple_id, ref_key, banned_by) values (cid, pin.ref_key, me) on conflict do nothing;
  end if;
  return true;
end;
$fn$;
revoke all on function public.bacheca_pin_action_v1(uuid, text, real, real) from public, anon;
grant execute on function public.bacheca_pin_action_v1(uuid, text, real, real) to authenticated;

-- You pin something yourselves (from the search, D19): a memory, a kept letter
-- or a kept answer of your couple. Full board: 'full' (the app asks what to take down).
create or replace function public.bacheca_pin_v1(p_source text, p_source_id uuid) returns text
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  v_at date;
  ref text;
begin
  if me is null or cid is null or p_source_id is null or p_source not in ('moment', 'conserva', 'keepsake') then return 'no'; end if;
  if p_source = 'moment' then
    select mo.moment_date into v_at from public.moments mo where mo.id = p_source_id and mo.couple_id = cid;
  elsif p_source = 'conserva' then
    select (cc.created_at at time zone 'Europe/Rome')::date into v_at from public.conserva_contributions cc where cc.id = p_source_id and cc.couple_id = cid;
  else
    select k.question_date into v_at from public.daily_question_keepsakes k where k.id = p_source_id and k.couple_id = cid;
  end if;
  if v_at is null then return 'no'; end if;
  ref := p_source || ':' || p_source_id;
  if exists (select 1 from public.us_bacheca_pins x where x.couple_id = cid and x.ref_key = ref) then return 'already'; end if;
  if (select pg_catalog.count(*) from public.us_bacheca_pins x where x.couple_id = cid) >= private.us_bacheca_limit(cid) then return 'full'; end if;
  delete from public.us_bacheca_bans b where b.couple_id = cid and b.ref_key = ref;
  insert into public.us_bacheca_pins (couple_id, source, source_id, ref_key, reason, item_date, pinned_by, fixed)
  values (cid, p_source, p_source_id, ref, 'scelta', v_at, me, true)
  on conflict do nothing;
  return case when found then 'pinned' else 'already' end;
end;
$fn$;
revoke all on function public.bacheca_pin_v1(text, uuid) from public, anon;
grant execute on function public.bacheca_pin_v1(text, uuid) to authenticated;

comment on table public.us_bacheca_pins is 'La vostra bacheca (25/11/2026): what hangs on the couple''s board, kept by US; a reference and its reason, the content is read live.';
comment on table public.us_bacheca_bans is 'La vostra bacheca: «Non appenderla più», a reference US never pins again.';
comment on table public.us_bacheca_planned is 'La vostra bacheca: the days already planned for a couple (first_fill on the very first).';
