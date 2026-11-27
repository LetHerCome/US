-- Il vostro mese (founder, 27/11/2026; grill P1–P8, C1–C6, tavola «Il vostro
-- mese» approvata). On the first of every month a pack with 10 cards of the
-- month just ended; on 31 December a golden one with the 10 best of the year.
-- Each person opens it when they like; the cards stay in Ricordi, «Le vostre carte».
--
-- * The same 10 cards for the couple (C3): chosen once, by rules, the first
--   time someone of the couple asks after the month is over (no cron: staging
--   keeps its crons off). One row per couple and period; a parallel call waits
--   on a per-couple lock and finds the row already there.
-- * A card keeps only a reference (kind, source, id, day, points) and, for the
--   numbers, a few counts already computed (C6): never a copy of a photo or a
--   text. The content is read live, so a deleted memory turns its card off.
-- * Points (P4): fixed on the board +5, kept (Conservati) +4, a first time
--   said in Noi +3, a question both answered at length +2, a photo in a place
--   never seen before +2, every heart +1 (at most 3). Variety: at most 3 photos
--   and 2 questions, one card for the other kinds, never two cards of the same
--   day while there is something else. The rare one has the most points.
--   A poor month is filled with real cards (numbers, places, the agreement in
--   Gioca), never invented ones; with nothing at all the pack stays empty.
-- * Only what both already see: answers both have read (reveal seen by the
--   two), kept letters, memories; a caption with delicate words stays out.
-- * «Il vostro Come stai» is not a card: Come stai keeps no history (02/11).
-- * Leaving the couple and deleting the account: the packs are the couple's
--   (they go with the couple); who opened what goes with the person.
-- Staging first, with the founder's go-ahead. Re-applying changes nothing.

create table if not exists public.us_mese_pacchi (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  kind text not null,
  period_start date not null,
  cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint us_mese_pacchi_kind check (kind in ('mese', 'anno')),
  constraint us_mese_pacchi_start check (extract(day from period_start) = 1 and (kind = 'mese' or extract(month from period_start) = 1)),
  constraint us_mese_pacchi_cards check (pg_catalog.jsonb_typeof(cards) = 'array' and pg_catalog.jsonb_array_length(cards) <= 10),
  constraint us_mese_pacchi_one unique (couple_id, kind, period_start)
);

create table if not exists public.us_mese_aperti (
  pack_id uuid not null references public.us_mese_pacchi(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default pg_catalog.now(),
  primary key (pack_id, user_id)
);
create index if not exists us_mese_aperti_user on public.us_mese_aperti (user_id);

alter table public.us_mese_pacchi enable row level security;
alter table public.us_mese_aperti enable row level security;
revoke all on table public.us_mese_pacchi, public.us_mese_aperti from public, anon, authenticated;
grant all on table public.us_mese_pacchi, public.us_mese_aperti to service_role;
-- The two of the couple read their packs; every write goes through the functions below.
grant select on table public.us_mese_pacchi, public.us_mese_aperti to authenticated;
drop policy if exists us_mese_pacchi_read_couple on public.us_mese_pacchi;
create policy us_mese_pacchi_read_couple on public.us_mese_pacchi as permissive for select to authenticated
  using (couple_id = (select private.current_couple_id()));
drop policy if exists us_mese_aperti_read_couple on public.us_mese_aperti;
create policy us_mese_aperti_read_couple on public.us_mese_aperti as permissive for select to authenticated
  using (exists (select 1 from public.us_mese_pacchi x where x.id = pack_id and x.couple_id = (select private.current_couple_id())));

-- The cards of one period [p_from, p_to) for a couple: the choice, by rules.
create or replace function private.us_mese_build(p_couple uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  cands jsonb;
  c jsonb;
  real_cards jsonb := '[]'::jsonb;
  fillers jsonb := '[]'::jsonb;
  taken text[] := '{}';
  days text[] := '{}';
  caps constant jsonb := '{"foto": 3, "qa": 2, "lettera": 1, "prima": 1, "scelta": 1}'::jsonb;
  used jsonb := '{}'::jsonb;
  room int;
  rare_key text;
  ordered jsonb := '[]'::jsonb;
  n_real int;
  n_fill int;
  i int;
  j int;
  nums record;
  agree record;
  places jsonb;
  p_ids jsonb;
  p_new jsonb;
  rare_card jsonb;
  members int;
  from_ts timestamptz := (p_from::timestamp at time zone 'Europe/Rome');
  to_ts timestamptz := (p_to::timestamp at time zone 'Europe/Rome');
begin
  if p_couple is null or p_from is null or p_to is null or p_to <= p_from then return '[]'::jsonb; end if;
  select pg_catalog.count(*)::int into members from public.profiles p where p.couple_id = p_couple;

  with pins as (
    select x.ref_key from public.us_bacheca_pins x where x.couple_id = p_couple and x.fixed
  ),
  foto as (
    select 'foto'::text as k, 'foto'::text as g, 'moment'::text as src, mo.id, mo.moment_date as day,
           1 + case when exists (select 1 from pins where pins.ref_key = 'moment:' || mo.id) then 5 else 0 end
             + case when mo.place_label is not null and pg_catalog.btrim(mo.place_label) <> '' and not exists (
                 select 1 from public.moments o
                  where o.couple_id = p_couple and o.id <> mo.id and o.place_label is not null
                    and pg_catalog.lower(pg_catalog.btrim(o.place_label)) = pg_catalog.lower(pg_catalog.btrim(mo.place_label))
                    and (o.moment_date < mo.moment_date or (o.moment_date = mo.moment_date and o.created_at < mo.created_at)))
               then 2 else 0 end as pts,
           (mo.caption is not null and pg_catalog.btrim(mo.caption) <> '') as nice, mo.created_at as at_
      from public.moments mo
     where mo.couple_id = p_couple and mo.moment_date >= p_from and mo.moment_date < p_to
       and not private.us_ricorda_delicato(mo.caption)
  ),
  dq as (
    select q.id as qid, q.question_date,
           (select k.id from public.daily_question_keepsakes k where k.couple_id = p_couple and k.question_id = q.id order by k.kept_at limit 1) as kid,
           (select pg_catalog.count(distinct a.user_id) from public.daily_answers a join public.profiles p on p.id = a.user_id and p.couple_id = p_couple
             where a.question_id = q.id and a.couple_id = p_couple) as n_ans,
           (select pg_catalog.bool_and(pg_catalog.char_length(pg_catalog.btrim(a.answer)) >= 40) from public.daily_answers a
             where a.question_id = q.id and a.couple_id = p_couple) as long_ans,
           (select pg_catalog.count(*) from public.daily_question_reveal_states r
             where r.couple_id = p_couple and r.question_id = q.id and r.reveal_seen_at is not null) as n_seen,
           (select pg_catalog.count(*) from public.daily_question_reveal_states r
             where r.couple_id = p_couple and r.question_id = q.id and r.reaction = 'heart') as hearts
      from public.daily_questions q
     where q.question_date >= p_from and q.question_date < p_to
  ),
  qa as (
    select 'qa'::text as k, 'qa'::text as g,
           case when d.kid is not null then 'keepsake' else 'question' end as src,
           coalesce(d.kid, d.qid) as id, d.question_date as day,
           1 + case when d.kid is not null then 4 else 0 end
             + case when d.kid is not null and exists (select 1 from pins where pins.ref_key = 'keepsake:' || d.kid) then 5 else 0 end
             + case when coalesce((select pg_catalog.char_length(pg_catalog.btrim(k.francesco_answer)) >= 40 and pg_catalog.char_length(pg_catalog.btrim(k.beatrice_answer)) >= 40
                                     from public.daily_question_keepsakes k where k.id = d.kid), d.n_ans = 2 and d.long_ans, false) then 2 else 0 end
             + least(d.hearts, 3)::int as pts,
           true as nice, d.question_date::timestamptz as at_
      from dq d
     where d.kid is not null or (members = 2 and d.n_ans = 2 and d.n_seen >= 2)
  ),
  lettera as (
    select distinct on (lf.id) 'lettera'::text as k, 'lettera'::text as g, 'conserva'::text as src, cc.id,
           (lf.created_at at time zone 'Europe/Rome')::date as day,
           5 + case when exists (select 1 from pins where pins.ref_key = 'conserva:' || cc.id) then 5 else 0 end as pts,
           true as nice, lf.created_at as at_
      from public.conserva_contributions cc
      join public.left_for_you lf on lf.id = cc.source_item_id and lf.couple_id = p_couple
     where cc.couple_id = p_couple and cc.created_at >= from_ts and cc.created_at < to_ts
       and lf.kind = 'text' and lf.body is not null and pg_catalog.btrim(lf.body) <> '' and not private.us_ricorda_delicato(lf.body)
     order by lf.id, cc.created_at, cc.id
  ),
  prima as (
    select 'prima'::text as k, 'prima'::text as g, 'bucket'::text as src, b.id,
           (b.completed_at at time zone 'Europe/Rome')::date as day, 4 as pts, true as nice, b.completed_at as at_
      from public.bucket_items b
     where b.couple_id = p_couple and b.status = 'lived' and b.completed_at >= from_ts and b.completed_at < to_ts
       and not private.us_ricorda_delicato(b.title)
  ),
  scelta as (
    select 'scelta'::text as k, 'scelta'::text as g, 'game_item'::text as src, i.id,
           (s.completed_at at time zone 'Europe/Rome')::date as day, 1 as pts, true as nice, s.completed_at as at_
      from public.game_sessions s
      join public.game_session_items i on i.session_id = s.id
     where s.couple_id = p_couple and s.game_family = 'swipe' and s.completed_at >= from_ts and s.completed_at < to_ts
       and pg_catalog.jsonb_typeof(i.options) = 'array' and pg_catalog.jsonb_array_length(i.options) = 2
       and (select pg_catalog.count(*) from public.game_session_sides sd where sd.session_id = s.id and sd.completed_at is not null and sd.reveal_seen_at is not null) = 2
       and (select pg_catalog.count(*) from public.game_session_answers a where a.item_id = i.id and a.answer_index in (0, 1)) = 2
       and (select pg_catalog.count(distinct a.answer_index) from public.game_session_answers a where a.item_id = i.id and a.answer_index in (0, 1)) = 1
  ),
  all_c as (
    select * from foto union all select * from qa union all select * from lettera union all select * from prima union all select * from scelta
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('k', a.k, 'g', a.g, 'src', a.src, 'id', a.id, 'day', a.day, 'pts', a.pts)
           order by a.pts desc, a.nice desc, a.day desc, a.at_ desc, a.id), '[]'::jsonb)
    into cands from all_c a;

  -- Pass 1: by points, inside the variety caps, one card a day.
  for c in select value from pg_catalog.jsonb_array_elements(cands) loop
    exit when pg_catalog.jsonb_array_length(real_cards) >= 10;
    if coalesce((used ->> (c ->> 'g'))::int, 0) >= (caps ->> (c ->> 'g'))::int or (c ->> 'day') = any(days) then continue; end if;
    real_cards := real_cards || pg_catalog.jsonb_build_array(c);
    taken := taken || ((c ->> 'src') || ':' || (c ->> 'id'));
    days := days || (c ->> 'day');
    used := used || pg_catalog.jsonb_build_object(c ->> 'g', coalesce((used ->> (c ->> 'g'))::int, 0) + 1);
  end loop;

  -- The real cards of the month as a whole (never invented): numbers, places, agreement.
  select (select pg_catalog.count(*) from public.shared_messages m
           where m.couple_id = p_couple and m.kind = 'think' and m.created_at >= from_ts and m.created_at < to_ts)::int as thinks,
         (select pg_catalog.count(*) from public.game_sessions s
           where s.couple_id = p_couple and s.completed_at >= from_ts and s.completed_at < to_ts)::int as games,
         (select pg_catalog.count(*) from public.daily_questions q
           where q.question_date >= p_from and q.question_date < p_to
             and (select pg_catalog.count(distinct a.user_id) from public.daily_answers a join public.profiles p on p.id = a.user_id and p.couple_id = p_couple
                   where a.question_id = q.id and a.couple_id = p_couple) = 2)::int as questions
    into nums;
  if nums.thinks + nums.games + nums.questions > 0 then
    fillers := fillers || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('k', 'numeri', 'g', 'numeri', 'src', 'numeri', 'id', null, 'day', null, 'pts', 0,
      'v', pg_catalog.jsonb_build_object('thinks', nums.thinks, 'games', nums.games, 'questions', nums.questions)));
  end if;
  select pg_catalog.jsonb_agg(f.id order by f.first_day, f.id), pg_catalog.jsonb_agg(f.id order by f.first_day, f.id) filter (where f.is_new)
    into p_ids, p_new
    from (
      select distinct on (pg_catalog.lower(pg_catalog.btrim(mo.place_label))) mo.id, mo.moment_date as first_day,
             not exists (select 1 from public.moments o where o.couple_id = p_couple and o.moment_date < p_from and o.place_label is not null
                          and pg_catalog.lower(pg_catalog.btrim(o.place_label)) = pg_catalog.lower(pg_catalog.btrim(mo.place_label))) as is_new
        from public.moments mo
       where mo.couple_id = p_couple and mo.moment_date >= p_from and mo.moment_date < p_to
         and mo.place_label is not null and pg_catalog.btrim(mo.place_label) <> '' and not private.us_ricorda_delicato(mo.caption)
       order by pg_catalog.lower(pg_catalog.btrim(mo.place_label)), mo.moment_date, mo.created_at, mo.id
    ) f;
  if p_ids is not null then
    -- At most four places on the card (references only), and which of them are new.
    places := pg_catalog.jsonb_build_object(
      'ids', (select pg_catalog.jsonb_agg(e order by n) from pg_catalog.jsonb_array_elements(p_ids) with ordinality t(e, n) where n <= 4),
      'nuovi', coalesce(p_new, '[]'::jsonb), 'count', pg_catalog.jsonb_array_length(p_ids));
    fillers := fillers || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('k', 'posti', 'g', 'posti', 'src', 'posti', 'id', null, 'day', null, 'pts', 0, 'v', places));
  end if;
  -- L'intesa in Gioca (instead of «Il vostro Come stai»): the same choice, both read.
  select pg_catalog.count(*)::int as total,
         pg_catalog.count(*) filter (where x.a = x.b)::int as same
    into agree
    from (
      select (select a.answer_index from public.game_session_answers a where a.item_id = i.id and a.actor_role = 'francesco') as a,
             (select a.answer_index from public.game_session_answers a where a.item_id = i.id and a.actor_role = 'beatrice') as b
        from public.game_sessions s
        join public.game_session_items i on i.session_id = s.id
       where s.couple_id = p_couple and s.completed_at >= from_ts and s.completed_at < to_ts
         and (select pg_catalog.count(*) from public.game_session_sides sd where sd.session_id = s.id and sd.completed_at is not null and sd.reveal_seen_at is not null) = 2
    ) x
   where x.a is not null and x.b is not null;
  if agree.total >= 3 then
    fillers := fillers || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('k', 'intesa', 'g', 'intesa', 'src', 'intesa', 'id', null, 'day', null, 'pts', 0,
      'v', pg_catalog.jsonb_build_object('same', agree.same, 'total', agree.total)));
  end if;

  room := 10 - pg_catalog.jsonb_array_length(real_cards);
  if room > 0 then
    fillers := coalesce((select pg_catalog.jsonb_agg(e) from (select e from pg_catalog.jsonb_array_elements(fillers) e limit room) s), '[]'::jsonb);
  else
    fillers := '[]'::jsonb;
  end if;
  -- Pass 2: what is left, the same day too, still inside the caps.
  for c in select value from pg_catalog.jsonb_array_elements(cands) loop
    exit when pg_catalog.jsonb_array_length(real_cards) + pg_catalog.jsonb_array_length(fillers) >= 10;
    if ((c ->> 'src') || ':' || (c ->> 'id')) = any(taken) or coalesce((used ->> (c ->> 'g'))::int, 0) >= (caps ->> (c ->> 'g'))::int then continue; end if;
    real_cards := real_cards || pg_catalog.jsonb_build_array(c);
    taken := taken || ((c ->> 'src') || ':' || (c ->> 'id'));
    used := used || pg_catalog.jsonb_build_object(c ->> 'g', coalesce((used ->> (c ->> 'g'))::int, 0) + 1);
  end loop;

  n_real := pg_catalog.jsonb_array_length(real_cards);
  n_fill := pg_catalog.jsonb_array_length(fillers);
  if n_real + n_fill = 0 then return '[]'::jsonb; end if;
  -- The rare one: the most points (a photo first on a tie, then the latest); with no real card, the first other one.
  if n_real > 0 then
    select e into rare_card from pg_catalog.jsonb_array_elements(real_cards) e
     order by (e ->> 'pts')::int desc, (e ->> 'k') = 'foto' desc, (e ->> 'day') desc limit 1;
  else
    rare_card := fillers -> 0;
  end if;
  rare_key := (rare_card ->> 'src') || ':' || coalesce(rare_card ->> 'id', '');
  -- The order: the days of the month, the others spread among them, the rare one last.
  real_cards := coalesce((select pg_catalog.jsonb_agg(e order by (e ->> 'day'), (e ->> 'pts')::int desc) from pg_catalog.jsonb_array_elements(real_cards) e
                          where (e ->> 'src') || ':' || coalesce(e ->> 'id', '') <> rare_key), '[]'::jsonb);
  fillers := coalesce((select pg_catalog.jsonb_agg(e order by n) from pg_catalog.jsonb_array_elements(fillers) with ordinality t(e, n)
                       where (e ->> 'src') || ':' || coalesce(e ->> 'id', '') <> rare_key), '[]'::jsonb);
  n_real := pg_catalog.jsonb_array_length(real_cards);
  n_fill := pg_catalog.jsonb_array_length(fillers);
  j := 0;
  for i in 0 .. n_real loop
    -- Before the i-th day card, the fillers whose turn has come.
    while j < n_fill and (j + 1) * (n_real + 1) <= (i + 1) * (n_fill + 1) loop
      ordered := ordered || pg_catalog.jsonb_build_array(((fillers -> j) - 'g') || '{"rare": false}'::jsonb);
      j := j + 1;
    end loop;
    if i < n_real then ordered := ordered || pg_catalog.jsonb_build_array(((real_cards -> i) - 'g') || '{"rare": false}'::jsonb); end if;
  end loop;
  return ordered || pg_catalog.jsonb_build_array((rare_card - 'g') || '{"rare": true}'::jsonb);
end;
$fn$;
revoke all on function private.us_mese_build(uuid, date, date) from public, anon, authenticated;

-- The packs due to a couple by p_today (Rome): every month already over since
-- the couple began on US (at most the last 24), and the year's golden one from
-- its 31 December. Idempotent; a parallel call waits on the couple's lock.
create or replace function private.us_mese_ensure(p_couple uuid, p_today date) returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  first_month date;
  last_month date;
  m date;
  y int;
begin
  if p_couple is null or p_today is null then return; end if;
  select pg_catalog.date_trunc('month', (x.created_at at time zone 'Europe/Rome'))::date into first_month from public.couples x where x.id = p_couple;
  if first_month is null then return; end if;
  last_month := (pg_catalog.date_trunc('month', p_today) - interval '1 month')::date;
  first_month := greatest(first_month, (pg_catalog.date_trunc('month', p_today) - interval '24 months')::date);
  -- Nothing missing: no lock, no work.
  if not exists (
      select 1 from pg_catalog.generate_series(first_month, last_month, interval '1 month') g(d)
       where not exists (select 1 from public.us_mese_pacchi x where x.couple_id = p_couple and x.kind = 'mese' and x.period_start = g.d::date))
     and not exists (
      select 1 from pg_catalog.generate_series(extract(year from first_month)::int, extract(year from p_today)::int) g(yy)
       where p_today >= pg_catalog.make_date(g.yy, 12, 31)
         and not exists (select 1 from public.us_mese_pacchi x where x.couple_id = p_couple and x.kind = 'anno' and x.period_start = pg_catalog.make_date(g.yy, 1, 1))) then
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('us_mese:' || p_couple::text));
  for m in select g.d::date from pg_catalog.generate_series(first_month, last_month, interval '1 month') g(d) loop
    if not exists (select 1 from public.us_mese_pacchi x where x.couple_id = p_couple and x.kind = 'mese' and x.period_start = m) then
      insert into public.us_mese_pacchi (couple_id, kind, period_start, cards)
      values (p_couple, 'mese', m, private.us_mese_build(p_couple, m, (m + interval '1 month')::date))
      on conflict (couple_id, kind, period_start) do nothing;
    end if;
  end loop;
  for y in select g.yy from pg_catalog.generate_series(extract(year from first_month)::int, extract(year from p_today)::int) g(yy) loop
    if p_today >= pg_catalog.make_date(y, 12, 31)
       and not exists (select 1 from public.us_mese_pacchi x where x.couple_id = p_couple and x.kind = 'anno' and x.period_start = pg_catalog.make_date(y, 1, 1)) then
      insert into public.us_mese_pacchi (couple_id, kind, period_start, cards)
      values (p_couple, 'anno', pg_catalog.make_date(y, 1, 1), private.us_mese_build(p_couple, pg_catalog.make_date(y, 1, 1), pg_catalog.make_date(y + 1, 1, 1)))
      on conflict (couple_id, kind, period_start) do nothing;
    end if;
  end loop;
end;
$fn$;
revoke all on function private.us_mese_ensure(uuid, date) from public, anon, authenticated;

-- One card as the app shows it: the reference plus what it points to, read
-- now. Gone (the memory deleted, an answer no longer there): «gone».
create or replace function private.us_mese_card(p_couple uuid, p_card jsonb, p_role text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  k text := p_card ->> 'k';
  src text := p_card ->> 'src';
  ref uuid;
  base jsonb := pg_catalog.jsonb_build_object('k', p_card ->> 'k', 'rare', coalesce((p_card ->> 'rare')::boolean, false), 'day', p_card -> 'day');
  body jsonb;
  other text := case when p_role = 'beatrice' then 'francesco' else 'beatrice' end;
begin
  if src in ('moment', 'keepsake', 'question', 'conserva', 'bucket', 'game_item') then ref := (p_card ->> 'id')::uuid; end if;
  if src = 'moment' then
    select pg_catalog.jsonb_build_object('path', mo.storage_path, 'caption', mo.caption, 'place', mo.place_label, 'date', mo.moment_date,
             'by', (select p.role from public.profiles p where p.id = mo.created_by and p.couple_id = p_couple),
             'pin', pg_catalog.jsonb_build_object('source', 'moment', 'id', mo.id),
             'pinned', exists (select 1 from public.us_bacheca_pins x where x.couple_id = p_couple and x.ref_key = 'moment:' || mo.id))
      into body from public.moments mo where mo.id = ref and mo.couple_id = p_couple;
  elsif src = 'keepsake' then
    select pg_catalog.jsonb_build_object('question', k2.question_text,
             'mine', case when p_role = 'beatrice' then k2.beatrice_answer else k2.francesco_answer end,
             'theirs', case when p_role = 'beatrice' then k2.francesco_answer else k2.beatrice_answer end,
             'pin', pg_catalog.jsonb_build_object('source', 'keepsake', 'id', k2.id),
             'pinned', exists (select 1 from public.us_bacheca_pins x where x.couple_id = p_couple and x.ref_key = 'keepsake:' || k2.id))
      into body from public.daily_question_keepsakes k2 where k2.id = ref and k2.couple_id = p_couple;
  elsif src = 'question' then
    -- Both answers still there and both read.
    select pg_catalog.jsonb_build_object('question', q.question,
             'mine', (select a.answer from public.daily_answers a join public.profiles p on p.id = a.user_id and p.couple_id = p_couple and p.role = p_role
                       where a.question_id = q.id and a.couple_id = p_couple limit 1),
             'theirs', (select a.answer from public.daily_answers a join public.profiles p on p.id = a.user_id and p.couple_id = p_couple and p.role = other
                         where a.question_id = q.id and a.couple_id = p_couple limit 1))
      into body from public.daily_questions q
     where q.id = ref
       and (select pg_catalog.count(*) from public.daily_question_reveal_states r where r.couple_id = p_couple and r.question_id = q.id and r.reveal_seen_at is not null) >= 2;
    if body is not null and (body ->> 'mine' is null or body ->> 'theirs' is null) then body := null; end if;
  elsif src = 'conserva' then
    select pg_catalog.jsonb_build_object('body', lf.body,
             'by', (select p.role from public.profiles p where p.id = lf.sender_id and p.couple_id = p_couple),
             'pin', pg_catalog.jsonb_build_object('source', 'conserva', 'id', cc.id),
             'pinned', exists (select 1 from public.us_bacheca_pins x where x.couple_id = p_couple and x.ref_key = 'conserva:' || cc.id))
      into body from public.conserva_contributions cc join public.left_for_you lf on lf.id = cc.source_item_id and lf.couple_id = p_couple
     where cc.id = ref and cc.couple_id = p_couple;
  elsif src = 'bucket' then
    select pg_catalog.jsonb_build_object('title', b.title) into body
      from public.bucket_items b where b.id = ref and b.couple_id = p_couple and b.status = 'lived';
  elsif src = 'game_item' then
    select pg_catalog.jsonb_build_object('question', i.question_text,
             'chosen', i.options ->> a.answer_index::int, 'other', i.options ->> (1 - a.answer_index)::int)
      into body
      from public.game_session_items i
      join public.game_sessions s on s.id = i.session_id and s.couple_id = p_couple
      join public.game_session_answers a on a.item_id = i.id and a.answer_index in (0, 1)
     where i.id = ref limit 1;
  elsif src = 'numeri' or src = 'intesa' then
    body := coalesce(p_card -> 'v', '{}'::jsonb);
  elsif src = 'posti' then
    select pg_catalog.jsonb_build_object(
             'places', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('label', mo.place_label, 'nuovo', coalesce(p_card -> 'v' -> 'nuovi', '[]'::jsonb) ? mo.id::text) order by t.n),
             'nuovi', (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements_text(coalesce(p_card -> 'v' -> 'nuovi', '[]'::jsonb)) e(v)
                        where exists (select 1 from public.moments o where o.id = e.v::uuid and o.couple_id = p_couple)),
             'count', (p_card -> 'v' ->> 'count')::int)
      into body
      from pg_catalog.jsonb_array_elements_text(coalesce(p_card -> 'v' -> 'ids', '[]'::jsonb)) with ordinality t(e, n)
      join public.moments mo on mo.id = t.e::uuid and mo.couple_id = p_couple and mo.place_label is not null;
    if body -> 'places' is null or pg_catalog.jsonb_typeof(body -> 'places') <> 'array' then body := null; end if;
  end if;
  if body is null then return base || '{"gone": true}'::jsonb; end if;
  return base || body || '{"gone": false}'::jsonb;
end;
$fn$;
revoke all on function private.us_mese_card(uuid, jsonb, text) from public, anon, authenticated;

-- «Le vostre carte»: the album of a year (12 places and the golden one), and
-- the packs still to open, making the due ones first.
create or replace function public.get_carte_v1(p_year int default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  today date := (pg_catalog.now() at time zone 'Europe/Rome')::date;
  first_month date;
  my_role text;
  yr int;
  months jsonb;
  gold jsonb;
begin
  if me is null or cid is null then return null; end if;
  perform private.us_mese_ensure(cid, today);
  select pg_catalog.date_trunc('month', (x.created_at at time zone 'Europe/Rome'))::date into first_month from public.couples x where x.id = cid;
  select p.role into my_role from public.profiles p where p.id = me;
  yr := coalesce(p_year, extract(year from today)::int);
  if yr < extract(year from first_month)::int or yr > extract(year from today)::int then yr := extract(year from today)::int; end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'month', g.m,
           'state', case
             when pg_catalog.make_date(yr, g.m, 1) < first_month then 'before'
             when today < (pg_catalog.make_date(yr, g.m, 1) + interval '1 month')::date then 'future'
             when x.id is null or pg_catalog.jsonb_array_length(x.cards) = 0 then 'empty'
             when exists (select 1 from public.us_mese_aperti o where o.pack_id = x.id and o.user_id = me) then 'opened'
             else 'closed' end,
           'pack', x.id,
           'count', coalesce(pg_catalog.jsonb_array_length(x.cards), 0),
           'partner_opened', exists (select 1 from public.us_mese_aperti o join public.profiles p on p.id = o.user_id and p.couple_id = cid where o.pack_id = x.id and o.user_id <> me),
           'cover', case when x.id is not null and pg_catalog.jsonb_array_length(x.cards) > 0 and exists (select 1 from public.us_mese_aperti o where o.pack_id = x.id and o.user_id = me)
                     then private.us_mese_card(cid, x.cards -> (pg_catalog.jsonb_array_length(x.cards) - 1), my_role) end
         ) order by g.m)
    into months
    from pg_catalog.generate_series(1, 12) g(m)
    left join public.us_mese_pacchi x on x.couple_id = cid and x.kind = 'mese' and x.period_start = pg_catalog.make_date(yr, g.m, 1);
  select pg_catalog.jsonb_build_object(
           'state', case when x.id is null then 'future' when pg_catalog.jsonb_array_length(x.cards) = 0 then 'empty'
                         when exists (select 1 from public.us_mese_aperti o where o.pack_id = x.id and o.user_id = me) then 'opened' else 'closed' end,
           'pack', x.id, 'count', coalesce(pg_catalog.jsonb_array_length(x.cards), 0),
           'partner_opened', exists (select 1 from public.us_mese_aperti o join public.profiles p on p.id = o.user_id and p.couple_id = cid where o.pack_id = x.id and o.user_id <> me))
    into gold
    from (select 1) z left join public.us_mese_pacchi x on x.couple_id = cid and x.kind = 'anno' and x.period_start = pg_catalog.make_date(yr, 1, 1);
  return pg_catalog.jsonb_build_object(
    'year', yr, 'today', today, 'first_month', first_month,
    'years', (select pg_catalog.jsonb_agg(g.y order by g.y) from pg_catalog.generate_series(extract(year from first_month)::int, extract(year from today)::int) g(y)),
    'partner', exists (select 1 from public.profiles p where p.couple_id = cid and p.id <> me),
    'months', months, 'gold', gold,
    -- The packs I have not opened yet, the latest first (Gioca and the end of an opening point here).
    'waiting', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('pack', x.id, 'kind', x.kind, 'period_start', x.period_start) order by x.period_start desc, x.kind)
                  from public.us_mese_pacchi x
                 where x.couple_id = cid and pg_catalog.jsonb_array_length(x.cards) > 0
                   and not exists (select 1 from public.us_mese_aperti o where o.pack_id = x.id and o.user_id = me)), '[]'::jsonb));
end;
$fn$;
revoke all on function public.get_carte_v1(int) from public, anon;
grant execute on function public.get_carte_v1(int) to authenticated;

-- One pack of the caller's couple, its cards read now.
create or replace function public.get_pacchetto_v1(p_pack uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  my_role text;
  pack public.us_mese_pacchi;
begin
  if me is null or cid is null or p_pack is null then return null; end if;
  select * into pack from public.us_mese_pacchi x where x.id = p_pack and x.couple_id = cid;
  if not found then return null; end if;
  select p.role into my_role from public.profiles p where p.id = me;
  return pg_catalog.jsonb_build_object(
    'id', pack.id, 'kind', pack.kind, 'period_start', pack.period_start,
    'opened', exists (select 1 from public.us_mese_aperti o where o.pack_id = pack.id and o.user_id = me),
    'partner_opened', exists (select 1 from public.us_mese_aperti o join public.profiles p on p.id = o.user_id and p.couple_id = cid where o.pack_id = pack.id and o.user_id <> me),
    'partner', exists (select 1 from public.profiles p where p.couple_id = cid and p.id <> me),
    'cards', coalesce((select pg_catalog.jsonb_agg(private.us_mese_card(cid, t.e, my_role) || pg_catalog.jsonb_build_object('n', t.n) order by t.n)
                         from pg_catalog.jsonb_array_elements(pack.cards) with ordinality t(e, n)), '[]'::jsonb));
end;
$fn$;
revoke all on function public.get_pacchetto_v1(uuid) from public, anon;
grant execute on function public.get_pacchetto_v1(uuid) to authenticated;

-- I opened it (once; again changes nothing). Whether the other has too.
create or replace function public.apri_pacchetto_v1(p_pack uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
begin
  if me is null or cid is null or p_pack is null then return null; end if;
  if not exists (select 1 from public.us_mese_pacchi x where x.id = p_pack and x.couple_id = cid) then return null; end if;
  insert into public.us_mese_aperti (pack_id, user_id) values (p_pack, me) on conflict do nothing;
  return pg_catalog.jsonb_build_object('opened', true,
    'partner_opened', exists (select 1 from public.us_mese_aperti o join public.profiles p on p.id = o.user_id and p.couple_id = cid where o.pack_id = p_pack and o.user_id <> me));
end;
$fn$;
revoke all on function public.apri_pacchetto_v1(uuid) from public, anon;
grant execute on function public.apri_pacchetto_v1(uuid) to authenticated;

comment on table public.us_mese_pacchi is 'Il vostro mese (27/11/2026): the pack of a month (or the golden one of a year) of a couple; ten references chosen once, the content read live.';
comment on table public.us_mese_aperti is 'Il vostro mese: who of the couple opened which pack, and when.';
