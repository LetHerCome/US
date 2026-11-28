-- La prima settimana guidata (founder, 27/11/2026: «la prima settimana di guida la farei ma
-- solamente per gli account appena creati, quindi per i Beta tester no»).
--
-- For the first seven days after the other person joins, the characters of US vi ricorda suggest
-- one small first step a day: the question of the day, the first photo, a game, a post-it, the
-- Ti penso, the birthdays, and «una settimana insieme». Only couples born after this migration
-- ran (private.us_primi_passi_start), so whoever already uses US never sees it. A step already
-- done (a photo already there, your birthday already in the calendar) is skipped. Like every
-- line it can be muted for good («Non dirmelo più»), and the stronger lines (birthdays, the
-- anniversary) win the day.
--
-- * private.us_primi_passi_start: one row, the moment this ran. No client reads it.
-- * us_battute and us_battute_mute accept the kind 'primi_passi'.
-- * private.us_ricorda_plan_couple: the same planner, one more candidate (priority 2).

create table if not exists private.us_primi_passi_start (
  one boolean primary key default true check (one),
  since timestamptz not null default pg_catalog.now()
);
insert into private.us_primi_passi_start (one) values (true) on conflict do nothing;
revoke all on table private.us_primi_passi_start from public, anon, authenticated;

alter table public.us_battute drop constraint if exists us_battute_kind;
alter table public.us_battute add constraint us_battute_kind
  check (kind in ('compleanno', 'anniversario', 'mesiversario', 'giorni', 'un_anno_fa', 'traguardo', 'conoscervi', 'primi_passi'));
alter table public.us_battute_mute drop constraint if exists us_battute_mute_kind;
alter table public.us_battute_mute add constraint us_battute_mute_kind
  check (kind in ('*', 'compleanno', 'anniversario', 'mesiversario', 'giorni', 'un_anno_fa', 'traguardo', 'conoscervi', 'ti_aspetta', 'primi_passi'));

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
  joined date;
  fresh boolean;
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
  -- La prima settimana (27/11/2026): the day the other person joined (the invite used, else the
  -- couple's creation), and whether the couple was born after this feature (the beta testers not).
  select coalesce((select (pg_catalog.max(i.used_at) at time zone 'Europe/Rome')::date from public.couple_invites i
                    where i.couple_id = p_couple and i.used_at is not null),
                  (x.created_at at time zone 'Europe/Rome')::date),
         x.created_at >= (select s.since from private.us_primi_passi_start s limit 1)
    into joined, fresh
    from public.couples x where x.id = p_couple;

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
        -- 2. La prima settimana (27/11/2026): new couples only, days 1-7 after the other person
        -- joined, one small first step a day; a step already done is skipped.
        select 2, 'primi_passi', case when fw.step = 'settimana' then 'both' else 'me' end, 'mattina',
               'primi_passi:' || fw.step,
               pg_catalog.jsonb_build_object('step', fw.step, 'day', fw.n, 'name', m.display_name, 'partner', (select display_name from partner))
          from (select x.n, (array['domanda', 'ricordo', 'gioco', 'postit', 'tipenso', 'compleanni', 'settimana'])[x.n] as step
                  from (select (p_day - joined)::int as n) x
                 where coalesce(fresh, false) and joined is not null and (p_day - joined) between 1 and 7) fw
         where not (fw.step = 'ricordo' and exists (select 1 from public.moments mo where mo.couple_id = p_couple))
           and not (fw.step = 'compleanni' and exists (select 1 from birthdays b where b.owner = m.id))
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
