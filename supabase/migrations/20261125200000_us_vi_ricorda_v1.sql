-- US vi ricorda, prima versione (founder, 25/11/2026; grill D1–D22,
-- docs/product/2026-11-25-us-vi-ricorda.md). US remembers the couple and,
-- rarely, the characters say something of theirs: a birthday coming, the
-- anniversary, a month or a hundred days, a memory of a year ago, a first
-- time, a question to get to know them. At most one line a day per person.
--
-- * Rules only, no AI: everything here is read from what both already see
--   (couples, shared_events, moments, calendar_entries, bucket_items).
--   Never: daily answers not revealed, Lasciato per te, positions, moods.
-- * One authority per fact: a line keeps only its kind and the few values to
--   say it (vars); the app writes the sentence (templates, IT first).
-- * Planned lazily: the first time someone of the couple opens US on a day,
--   get_my_battuta_v1() plans that day for both (us_ricorda_plan_couple),
--   then returns the caller's line. No cron needed: staging keeps its crons
--   off, and a couple that does not open US costs nothing.
-- * Surprises one way (D5): a birthday is told only to the other person; the
--   anniversary a week before reaches both, each on their own.
-- * «Non dirmelo più» (D8) and the switch «Le voci dei personaggi» (D22) are
--   us_battute_mute rows, one kind or '*' for all.
-- Staging first, with the founder's go-ahead. Re-applying changes nothing.

create table if not exists public.us_battute (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null,
  ref_key text not null,
  speaker text not null default 'me',
  slot text not null default 'mattina',
  vars jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  seen_at timestamptz,
  done_at timestamptz,
  later_at timestamptz,
  constraint us_battute_kind check (kind in ('compleanno', 'anniversario', 'mesiversario', 'giorni', 'un_anno_fa', 'traguardo', 'conoscervi')),
  constraint us_battute_speaker check (speaker in ('me', 'both')),
  constraint us_battute_slot check (slot in ('mattina', 'sera')),
  constraint us_battute_one_a_day unique (recipient_id, day),
  constraint us_battute_never_twice unique (recipient_id, ref_key)
);
create index if not exists us_battute_couple_day on public.us_battute (couple_id, day);

create table if not exists public.us_battute_planned (
  couple_id uuid not null references public.couples(id) on delete cascade,
  day date not null,
  planned_at timestamptz not null default pg_catalog.now(),
  primary key (couple_id, day)
);

create table if not exists public.us_battute_mute (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  muted_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, kind),
  constraint us_battute_mute_kind check (kind in ('*', 'compleanno', 'anniversario', 'mesiversario', 'giorni', 'un_anno_fa', 'traguardo', 'conoscervi', 'ti_aspetta'))
);

alter table public.us_battute enable row level security;
alter table public.us_battute_planned enable row level security;
alter table public.us_battute_mute enable row level security;
revoke all on table public.us_battute, public.us_battute_planned, public.us_battute_mute from public, anon, authenticated;
grant all on table public.us_battute, public.us_battute_planned, public.us_battute_mute to service_role;
-- Each person reads only their own lines and switches; writes go through the functions below.
grant select on table public.us_battute, public.us_battute_mute to authenticated;
drop policy if exists us_battute_read_own on public.us_battute;
create policy us_battute_read_own on public.us_battute as permissive for select to authenticated
  using (recipient_id = (select auth.uid()));
drop policy if exists us_battute_mute_read_own on public.us_battute_mute;
create policy us_battute_mute_read_own on public.us_battute_mute as permissive for select to authenticated
  using (user_id = (select auth.uid()));

-- Words that never become a line (D4): a commitment or an idea about health,
-- grief or the like stays out, whatever else it says.
create or replace function private.us_ricorda_delicato(p_text text) returns boolean
language sql immutable set search_path = ''
as $fn$
  select coalesce(pg_catalog.lower(p_text), '') ~ '(medic|ospedal|analisi|terapi|psicolog|dentist|ginecolog|visita|esami del sangue|chemio|malat|lutto|funeral|cimitero|avvocat|tribunal|separaz|divorz|test di gravidanza)';
$fn$;
revoke all on function private.us_ricorda_delicato(text) from public, anon, authenticated;

-- The day's lines of one couple, one per person at most (D3, D20).
-- The day of month d in the month of p, or that month's last day when shorter.
create or replace function private.us_ricorda_on_day(p_year int, p_month int, p_day int) returns date
language sql immutable set search_path = ''
as $fn$
  select pg_catalog.make_date(p_year, p_month, least(p_day, extract(day from (pg_catalog.make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int));
$fn$;
revoke all on function private.us_ricorda_on_day(int, int, int) from public, anon, authenticated;

create or replace function private.us_ricorda_plan_couple(p_couple uuid, p_day date) returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  started date;
  members uuid[];
  m record;
  c record;
  picked boolean;
  turn uuid;
begin
  if p_couple is null or p_day is null then return; end if;
  insert into public.us_battute_planned (couple_id, day) values (p_couple, p_day) on conflict do nothing;
  if not found then return; end if;
  select x.started_on into started from public.couples x where x.id = p_couple;
  select pg_catalog.array_agg(p.id order by p.role) into members from public.profiles p where p.couple_id = p_couple;
  -- Only a couple of two hears the characters.
  if started is null or coalesce(pg_catalog.array_length(members, 1), 0) <> 2 then return; end if;
  -- «Un anno fa» goes to one of the two, by turns (D20).
  turn := members[1 + (extract(doy from p_day)::int % 2)];

  for m in select p.id, p.display_name, p.role from public.profiles p where p.couple_id = p_couple order by p.role loop
    picked := false;
    for c in
      with partner as (
        select p.id, p.display_name from public.profiles p where p.couple_id = p_couple and p.id <> m.id limit 1
      ),
      birthdays as (
        -- «Compleanno di X»: X is the person of that name in the couple, else who wrote it.
        select e.id, e.event_date,
               coalesce(
                 (select p.id from public.profiles p where p.couple_id = p_couple
                    and pg_catalog.lower(pg_catalog.btrim(p.display_name)) = pg_catalog.lower(pg_catalog.btrim(pg_catalog.substr(e.title, 14)))
                  limit 1),
                 e.created_by) as owner
          from public.shared_events e
         where e.couple_id = p_couple and e.recurs_yearly and e.title ilike 'Compleanno di %'
      ),
      birthday_next as (
        select b.id, b.owner,
               (select o from (values
                  (private.us_ricorda_on_day(extract(year from p_day)::int, extract(month from b.event_date)::int, extract(day from b.event_date)::int)),
                  (private.us_ricorda_on_day(extract(year from p_day)::int + 1, extract(month from b.event_date)::int, extract(day from b.event_date)::int))
                ) v(o) where v.o >= p_day order by v.o limit 1) as occ
          from birthdays b
      ),
      anniversary as (
        select (select o from (values
                  (private.us_ricorda_on_day(extract(year from p_day)::int, extract(month from started)::int, extract(day from started)::int)),
                  (private.us_ricorda_on_day(extract(year from p_day)::int + 1, extract(month from started)::int, extract(day from started)::int))
                ) v(o) where v.o >= p_day order by v.o limit 1) as occ
      ),
      cands as (
        -- 1. Birthdays: 7 days before, the day before, the day; only to the other one.
        select 1 as prio, 'compleanno'::text as kind, 'me'::text as speaker, 'mattina'::text as slot,
               'compleanno:' || bn.id || ':' || bn.occ || ':' || (bn.occ - p_day) as ref_key,
               pg_catalog.jsonb_build_object('name', (select p.display_name from public.profiles p where p.id = bn.owner), 'days', bn.occ - p_day, 'date', bn.occ) as vars
          from birthday_next bn
         where bn.owner is not null and bn.owner <> m.id and (bn.occ - p_day) in (7, 1, 0)
        union all
        -- 1. The anniversary: a week before to each, as a surprise; on the day, together.
        select 1, 'anniversario', case when a.occ = p_day then 'both' else 'me' end, 'mattina',
               'anniversario:' || a.occ || ':' || (a.occ - p_day),
               pg_catalog.jsonb_build_object('years', extract(year from a.occ)::int - extract(year from started)::int, 'days', a.occ - p_day, 'partner', (select display_name from partner))
          from anniversary a
         where (a.occ - p_day) in (7, 0) and a.occ > started
        union all
        -- 3. A year ago: a memory (with a place first), else a «Ci vediamo», else an idea lived.
        (select 3, 'un_anno_fa', 'both', 'sera', 'un_anno_fa:moment:' || mo.id,
                pg_catalog.jsonb_build_object('source', 'moment', 'id', mo.id, 'place', mo.place_label, 'caption', pg_catalog.left(mo.caption, 120), 'date', mo.moment_date, 'path', mo.storage_path, 'partner', (select display_name from partner))
           from public.moments mo
          where mo.couple_id = p_couple and mo.moment_date = (p_day - interval '1 year')::date and m.id = turn
          order by (mo.place_label is null), mo.created_at limit 1)
        union all
        (select 3, 'un_anno_fa', 'both', 'sera', 'un_anno_fa:meet:' || ce.id,
                pg_catalog.jsonb_build_object('source', 'meet', 'id', ce.id, 'title', pg_catalog.left(ce.title, 80), 'date', coalesce(ce.start_date, (ce.starts_at at time zone 'Europe/Rome')::date), 'partner', (select display_name from partner))
           from public.calendar_entries ce
          where ce.couple_id = p_couple and ce.ci_vediamo and m.id = turn
            and coalesce(ce.start_date, (ce.starts_at at time zone 'Europe/Rome')::date) = (p_day - interval '1 year')::date
            and not private.us_ricorda_delicato(ce.title)
          limit 1)
        union all
        (select 3, 'un_anno_fa', 'both', 'sera', 'un_anno_fa:idea:' || bi.id,
                pg_catalog.jsonb_build_object('source', 'idea', 'id', bi.id, 'title', pg_catalog.left(bi.title, 80), 'date', (bi.completed_at at time zone 'Europe/Rome')::date, 'partner', (select display_name from partner))
           from public.bucket_items bi
          where bi.couple_id = p_couple and bi.status = 'lived' and m.id = turn
            and (bi.completed_at at time zone 'Europe/Rome')::date = (p_day - interval '1 year')::date
            and not private.us_ricorda_delicato(bi.title)
          limit 1)
        union all
        -- 4. A month more, a hundred days more (not on the anniversary itself).
        select 4, 'mesiversario', 'both', 'mattina', 'mesiversario:' || p_day,
               pg_catalog.jsonb_build_object('months', ((extract(year from p_day) - extract(year from started)) * 12 + extract(month from p_day) - extract(month from started))::int, 'partner', (select display_name from partner))
         where p_day = private.us_ricorda_on_day(extract(year from p_day)::int, extract(month from p_day)::int, extract(day from started)::int)
           and p_day > started and extract(month from p_day) <> extract(month from started)
        union all
        select 4, 'giorni', 'both', 'mattina', 'giorni:' || (p_day - started),
               pg_catalog.jsonb_build_object('days', p_day - started, 'partner', (select display_name from partner))
         where p_day > started and (p_day - started) % 100 = 0
        union all
        -- 4. First times: yesterday a memory in a place never seen before.
        (select 4, 'traguardo', 'both', 'sera', 'traguardo:luogo:' || pg_catalog.lower(mo.place_label),
                pg_catalog.jsonb_build_object('what', 'luogo', 'place', mo.place_label, 'id', mo.id, 'partner', (select display_name from partner))
           from public.moments mo
          where mo.couple_id = p_couple and mo.place_label is not null and pg_catalog.btrim(mo.place_label) <> ''
            and (mo.created_at at time zone 'Europe/Rome')::date = p_day - 1
            and not exists (select 1 from public.moments o where o.couple_id = p_couple and o.id <> mo.id
                              and pg_catalog.lower(o.place_label) = pg_catalog.lower(mo.place_label)
                              and o.created_at < mo.created_at)
          order by mo.created_at limit 1)
        union all
        -- 4. Round numbers of memories, reached yesterday.
        (select 4, 'traguardo', 'both', 'sera', 'traguardo:ricordi:' || n.total,
                pg_catalog.jsonb_build_object('what', 'ricordi', 'count', n.total, 'partner', (select display_name from partner))
           from (select pg_catalog.count(*)::int as total,
                        pg_catalog.count(*) filter (where (mo.created_at at time zone 'Europe/Rome')::date = p_day - 1)::int as yesterday
                   from public.moments mo where mo.couple_id = p_couple and (mo.created_at at time zone 'Europe/Rome')::date < p_day) n
          where n.yesterday > 0 and n.total in (10, 25, 50, 100, 200, 300, 500, 1000))
        union all
        -- 5. To get to know you (D14): one question, never two days in a row.
        select 5, 'conoscervi', 'me', 'mattina', 'conoscervi:compleanno:' || pg_catalog.to_char(p_day, 'YYYY-MM'),
               pg_catalog.jsonb_build_object('ask', 'compleanno', 'name', m.display_name)
         where not exists (select 1 from birthdays b where b.owner = m.id)
        union all
        select 5, 'conoscervi', 'both', 'mattina', 'conoscervi:primo_ricordo:' || pg_catalog.to_char(p_day, 'YYYY-MM'),
               pg_catalog.jsonb_build_object('ask', 'primo_ricordo', 'partner', (select display_name from partner))
         where not exists (select 1 from public.moments mo where mo.couple_id = p_couple)
      )
      select * from cands
       where not exists (select 1 from public.us_battute_mute mu where mu.user_id = m.id and mu.kind in ('*', cands.kind))
         and not exists (select 1 from public.us_battute b where b.recipient_id = m.id and b.ref_key = cands.ref_key)
         and not (cands.kind = 'conoscervi' and exists (select 1 from public.us_battute b where b.recipient_id = m.id and b.kind = 'conoscervi' and b.day = p_day - 1))
       order by cands.prio, cands.ref_key
    loop
      exit when picked;
      insert into public.us_battute (couple_id, recipient_id, day, kind, ref_key, speaker, slot, vars)
      values (p_couple, m.id, p_day, c.kind, c.ref_key, c.speaker, c.slot, c.vars)
      on conflict do nothing;
      picked := found;
    end loop;
  end loop;
end;
$fn$;
revoke all on function private.us_ricorda_plan_couple(uuid, date) from public, anon, authenticated;

-- The caller's line of today (Rome), planning the couple's day the first time.
create or replace function public.get_my_battuta_v1() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  today date := (pg_catalog.now() at time zone 'Europe/Rome')::date;
  mine public.us_battute;
begin
  if me is null or cid is null then return null; end if;
  perform private.us_ricorda_plan_couple(cid, today);
  if exists (select 1 from public.us_battute_mute mu where mu.user_id = me and mu.kind = '*') then
    return pg_catalog.jsonb_build_object('muted', true);
  end if;
  select * into mine from public.us_battute b where b.recipient_id = me and b.day = today;
  if not found then return pg_catalog.jsonb_build_object('muted', false, 'battuta', null); end if;
  return pg_catalog.jsonb_build_object('muted', false, 'battuta', pg_catalog.jsonb_build_object(
    'id', mine.id, 'kind', mine.kind, 'ref_key', mine.ref_key, 'speaker', mine.speaker, 'slot', mine.slot,
    'vars', mine.vars, 'day', mine.day, 'seen', mine.seen_at is not null, 'done', mine.done_at is not null, 'later', mine.later_at is not null));
end;
$fn$;
revoke all on function public.get_my_battuta_v1() from public, anon;
grant execute on function public.get_my_battuta_v1() to authenticated;

-- Seen, done (the gesture was opened), later («Non ora»).
create or replace function public.mark_my_battuta_v1(p_id uuid, p_action text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $fn$
declare me uuid := auth.uid();
begin
  if me is null or p_id is null or p_action not in ('seen', 'done', 'later') then return false; end if;
  update public.us_battute b set
    seen_at = coalesce(b.seen_at, pg_catalog.now()),
    done_at = case when p_action = 'done' then coalesce(b.done_at, pg_catalog.now()) else b.done_at end,
    later_at = case when p_action = 'later' then pg_catalog.now() else b.later_at end
   where b.id = p_id and b.recipient_id = me;
  return found;
end;
$fn$;
revoke all on function public.mark_my_battuta_v1(uuid, text) from public, anon;
grant execute on function public.mark_my_battuta_v1(uuid, text) to authenticated;

-- «Non dirmelo più» for one kind, or '*' for all («Le voci dei personaggi»).
create or replace function public.set_my_battute_mute_v1(p_kind text, p_muted boolean) returns boolean
language plpgsql volatile security definer set search_path = ''
as $fn$
declare me uuid := auth.uid();
begin
  if me is null or p_kind is null then return false; end if;
  if p_muted then
    insert into public.us_battute_mute (user_id, kind) values (me, p_kind) on conflict do nothing;
  else
    delete from public.us_battute_mute mu where mu.user_id = me and mu.kind = p_kind;
  end if;
  return true;
end;
$fn$;
revoke all on function public.set_my_battute_mute_v1(text, boolean) from public, anon;
grant execute on function public.set_my_battute_mute_v1(text, boolean) to authenticated;

comment on table public.us_battute is 'US vi ricorda (25/11/2026): the line of the day for one person, at most one; kind and vars only, the app writes the sentence.';
comment on table public.us_battute_mute is 'US vi ricorda: «Non dirmelo più» per kind, or * for «Le voci dei personaggi» off.';
