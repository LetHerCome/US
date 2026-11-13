-- US — Numeri della settimana (09/11/2026)
--
-- Solo lettura e solo conteggi: nessun nome, nessuna email, nessun contenuto.
-- Legge i dati che l'app salva già: non raccoglie niente di nuovo.
--
-- Come si usa, da una cartella FUORI dal repo (dal repo la CLI riscrive
-- supabase/.temp/cli-latest, che è tracciato):
--   supabase db query --linked --project-ref iiakdfsxpywdkxravqjh -f <percorso>/US_NUMERI_DELLA_SETTIMANA.sql
-- Staging: --project-ref dugmhngrfkuieeletatb. La CLI crea da sola un ruolo
-- di accesso temporaneo («Initialising login role…»): è normale.
--
-- «settimana» = ultimi 7 giorni, «prima» = i 7 giorni precedenti.
-- Il percorso (righe 1x) segue chi si è iscritto negli ultimi 28 giorni.
-- Gli errori dell'app sono in US_ERRORI_APP.sql (servono la migrazione
-- client_errors_v1).

with
members as (
  select couple_id, count(*)::int as n
    from public.profiles
   where couple_id is not null
   group by couple_id
),
joined as (
  -- Quando la coppia è diventata completa: il primo invito usato.
  select couple_id, min(used_at) as at
    from public.couple_invites
   where used_at is not null
   group by couple_id
),
actions as (
  select couple_id, user_id as who, created_at as at, 'Risposte alla domanda del giorno' as what from public.daily_answers
  union all select couple_id, sender_id, created_at, case when kind = 'think' then 'Ti penso' else 'Altri messaggi' end from public.shared_messages
  union all select couple_id, sender_id, created_at, 'Lasciato per te' from public.left_for_you
  union all select couple_id, created_by, created_at, 'Ricordi' from public.moments
  union all select couple_id, author_id, created_at, 'Tratti sulla lavagna' from public.lavagna_strokes
  union all select couple_id, created_by, created_at, 'Impegni nel calendario' from public.calendar_entries
  union all select s.couple_id, p.id, side.completed_at, 'Partite finite (una per persona)'
    from public.game_session_sides as side
    join public.game_sessions as s on s.id = side.session_id
    join public.profiles as p on p.couple_id = s.couple_id and p.role = side.actor_role
   where side.completed_at is not null
),
week as (select now() - interval '7 days' as since, now() - interval '14 days' as before),
signups as (
  select u.id, u.created_at, p.couple_id, m.n as members, j.at as joined_at
    from auth.users as u
    left join public.profiles as p on p.id = u.id
    left join members as m on m.couple_id = p.couple_id
    left join joined as j on j.couple_id = p.couple_id
   where not coalesce(u.is_anonymous, false)
     and u.created_at >= now() - interval '28 days'
)
select voce, settimana, prima from (
  select 10 as ord, '1. Iscritti negli ultimi 28 giorni' as voce,
         (select count(*) from signups)::text as settimana, '' as prima
  union all select 11, '   con il profilo (nome scelto)',
         (select count(*) from signups s where exists (select 1 from public.profiles p where p.id = s.id))::text, ''
  union all select 12, '   in una coppia (creata o raggiunta)',
         (select count(*) from signups where couple_id is not null)::text, ''
  union all select 13, '   coppia completa',
         (select count(*) from signups where members = 2)::text, ''
  union all select 14, '   prima risposta alla domanda del giorno',
         (select count(*) from signups s where exists (select 1 from public.daily_answers a where a.user_id = s.id))::text, ''
  union all select 15, '   ancora attivi dopo 7 giorni di coppia (su chi ci è arrivato)',
         (select count(*) from signups s
           where s.joined_at <= now() - interval '7 days'
             and exists (select 1 from actions a where a.who = s.id and a.at >= s.joined_at + interval '7 days'))::text
         || ' su ' || (select count(*) from signups where joined_at <= now() - interval '7 days')::text, ''
  union all select 20, '2. Coppie complete', (select count(*) from members where n = 2)::text, ''
  union all select 21, '   in attesa del partner (giorni di attesa)',
         (select count(*) from members where n = 1)::text,
         coalesce((select string_agg(extract(day from now() - c.created_at)::int::text, ', ' order by c.created_at)
                     from members m join public.couples c on c.id = m.couple_id where m.n = 1), '')
  union all select 22, '   coppie attive (almeno un gesto)',
         (select count(distinct a.couple_id) from actions a join members m using (couple_id), week where m.n = 2 and a.at >= week.since)::text,
         (select count(distinct a.couple_id) from actions a join members m using (couple_id), week where m.n = 2 and a.at >= week.before and a.at < week.since)::text
  union all select 23, '   persone attive',
         (select count(distinct a.who) from actions a, week where a.at >= week.since)::text,
         (select count(distinct a.who) from actions a, week where a.at >= week.before and a.at < week.since)::text
  union all select 30 + row_number() over (order by what), '3. ' || what,
         count(*) filter (where at >= (select since from week))::text,
         count(*) filter (where at >= (select before from week) and at < (select since from week))::text
    from actions
   group by what
) as rows
order by ord;
