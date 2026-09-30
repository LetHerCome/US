-- M9E — Permanent Daily Question engine.
--
-- Root cause: public.daily_questions only held a finite seeded block of dated
-- rows (2026-08-18..2026-09-17). Once it ran out the client legitimately found
-- no row for today and showed "La prossima domanda sta arrivando…".
--
-- This migration keeps every existing authority exactly as it is:
--   public.daily_questions      = the concrete question instance for a day
--   public.daily_answers        = answers (not read, not written here)
--   public.get_daily_state      = answer visibility and reveal (unchanged)
--   private.daily_question_reveal_ready / public.daily_question_outcomes (unchanged)
-- and adds only:
--   public.daily_question_templates     curated bank, server-only (no client grants)
--   daily_questions.template_id         optional provenance (NULL for history)
--   private.daily_question_day(ts)      the canonical day authority
--   private.materialize_daily_question  the one writer of new daily rows
--   public.get_or_create_daily_question the authenticated client entry point
--   cron us-daily-question-materialize  pre-materializes the day for widgets
--
-- DAY AUTHORITY: the canonical day is the calendar date in Europe/Rome, the
-- product timezone already used by us-widget-state (romeToday) and the
-- calendar reminders worker. It is computed on the server from now(); the
-- client never sends a date, so both partners resolve the SAME question even
-- when they open US on either side of midnight on different devices.
--
-- SELECTION: the weekday (ISO, Monday = 1) picks the thematic family. Inside a
-- family the active template never used (by provenance or identical text) is
-- taken first in editorial sequence order; once every template of the family
-- has been used, the least recently used one comes back. With 26 templates
-- per family, no template repeats before the full 26-week / 182-day cycle.
--
-- Historical rows are never updated: no backfill, no delete, no rewrite.

-- 1. One concrete question per calendar day. Production already has
--    question_date UNIQUE; the guard only creates an index where none exists.
do $$
begin
  if not exists (
    select 1
      from pg_index as i
      join pg_attribute as a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = 'public.daily_questions'::regclass
       and i.indisunique
       and i.indnkeyatts = 1
       and i.indpred is null
       and a.attname = 'question_date'
  ) then
    create unique index daily_questions_question_date_m9e_key on public.daily_questions (question_date);
  end if;
end;
$$;

-- 2. Curated template bank.
create table if not exists public.daily_question_templates (
  id text primary key,
  weekday_slot smallint not null check (weekday_slot between 1 and 7),
  sequence smallint not null check (sequence >= 1),
  question text not null check (char_length(btrim(question)) between 8 and 240),
  theme text not null check (theme in ('noi_adesso', 'scoprirsi', 'ricordi', 'desideri', 'vicinanza', 'gioco', 'profonda')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint daily_question_templates_theme_weekday check (
    weekday_slot = case theme
      when 'noi_adesso' then 1
      when 'scoprirsi' then 2
      when 'ricordi' then 3
      when 'desideri' then 4
      when 'vicinanza' then 5
      when 'gioco' then 6
      when 'profonda' then 7
    end
  ),
  constraint daily_question_templates_id_theme check (id ~ '^[a-z_]+-[0-9]{2,}$' and split_part(id, '-', 1) = theme),
  constraint daily_question_templates_slot_sequence_key unique (weekday_slot, sequence),
  constraint daily_question_templates_question_key unique (question)
);

comment on table public.daily_question_templates is
  'M9E curated Daily Question bank. Server-only: no client grants, RLS forced with no policies. Rows are materialized into public.daily_questions by private.materialize_daily_question.';
comment on column public.daily_question_templates.weekday_slot is
  'ISO weekday (1 = Monday … 7 = Sunday) of the Europe/Rome day this family belongs to.';
comment on column public.daily_question_templates.sequence is
  'Editorial order inside the weekday family (week of the 26-week cycle).';
comment on column public.daily_question_templates.active is
  'Retire a template by setting false; never delete one already used (FK is ON DELETE RESTRICT).';

revoke all on public.daily_question_templates from public, anon, authenticated;
alter table public.daily_question_templates enable row level security;
alter table public.daily_question_templates force row level security;

-- 3. Optional provenance on the concrete instance. Historical rows stay NULL.
alter table public.daily_questions
  add column if not exists template_id text references public.daily_question_templates(id) on delete restrict;

create index if not exists daily_questions_template_id_idx on public.daily_questions (template_id);

comment on column public.daily_questions.template_id is
  'M9E provenance: template this day was materialized from. NULL for rows seeded before M9E.';

-- 4. Canonical day authority.
create or replace function private.daily_question_day(at_time timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (at_time at time zone 'Europe/Rome')::date;
$$;

comment on function private.daily_question_day(timestamptz) is
  'M9E day authority: the Daily Question day is the Europe/Rome calendar date of the given instant.';

-- 5. The only writer of new daily_questions rows. Idempotent and
--    concurrency-safe: fast path read, then a transaction-scoped advisory
--    lock, re-read, insert ON CONFLICT DO NOTHING on the unique date, re-read.
create or replace function private.materialize_daily_question(target_date date)
returns public.daily_questions
language plpgsql
set search_path = ''
as $$
declare
  existing public.daily_questions%rowtype;
  chosen public.daily_question_templates%rowtype;
  slot smallint;
begin
  if target_date is null then
    raise exception using errcode = '22004', message = 'daily_question_date_required';
  end if;

  select * into existing from public.daily_questions as q where q.question_date = target_date;
  if found then
    return existing;
  end if;

  -- One global key: selection reads the history, so materializations are
  -- serialized with each other (they are rare: at most one per day).
  perform pg_advisory_xact_lock(hashtextextended('us:daily_question:materialize', 0));

  select * into existing from public.daily_questions as q where q.question_date = target_date;
  if found then
    return existing;
  end if;

  slot := extract(isodow from target_date)::smallint;

  select t.* into chosen
    from public.daily_question_templates as t
    left join lateral (
      select max(q.question_date) as last_used
        from public.daily_questions as q
       where q.template_id = t.id
          or lower(btrim(q.question)) = lower(btrim(t.question))
    ) as usage on true
   where t.active
     and t.weekday_slot = slot
   order by usage.last_used asc nulls first, t.sequence asc, t.id asc
   limit 1;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'daily_question_template_bank_empty',
      detail = format('no active daily_question_templates row for ISO weekday %s (%s)', slot, target_date);
  end if;

  insert into public.daily_questions (question_date, question, template_id)
  values (target_date, chosen.question, chosen.id)
  on conflict (question_date) do nothing;

  select * into existing from public.daily_questions as q where q.question_date = target_date;
  if not found then
    raise exception using errcode = 'P0001', message = 'daily_question_materialization_failed';
  end if;
  return existing;
end;
$$;

revoke all on function private.daily_question_day(timestamptz) from public, anon, authenticated;
revoke all on function private.materialize_daily_question(date) from public, anon, authenticated;

comment on function private.materialize_daily_question(date) is
  'M9E: returns the daily_questions row for target_date, creating exactly one from the template bank when missing. Never reads or writes answers.';

-- 6. Authenticated entry point. No arguments: the server decides the day.
create or replace function public.get_or_create_daily_question()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := private.daily_question_day(now());
  question_row public.daily_questions%rowtype;
  question_theme text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1 from public.profiles as profile
     where profile.id = auth.uid()
       and profile.couple_id is not null
  ) then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;

  question_row := private.materialize_daily_question(today);

  select t.theme into question_theme
    from public.daily_question_templates as t
   where t.id = question_row.template_id;

  return jsonb_build_object(
    'id', question_row.id,
    'question', question_row.question,
    'question_date', question_row.question_date,
    'theme', question_theme,
    'day_timezone', 'Europe/Rome'
  );
end;
$$;

revoke all on function public.get_or_create_daily_question() from public, anon;
grant execute on function public.get_or_create_daily_question() to authenticated;

comment on function public.get_or_create_daily_question() is
  'M9E: today''s concrete Daily Question (Europe/Rome day), materialized once from the template bank if missing. Reveal stays with public.get_daily_state.';

-- 7. Pre-materialize the day hourly so server-side readers that look up
--    daily_questions by date (us-widget-state) see today's row from 00:01
--    Europe/Rome, even before either partner opens US. Idempotent.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'us-daily-question-materialize') then
      perform cron.schedule(
        'us-daily-question-materialize',
        '1 * * * *',
        $cron$select private.materialize_daily_question(private.daily_question_day(now()))$cron$
      );
    end if;
  end if;
end;
$$;

-- 8. Editorial bank: 26 weeks × 7 families = 182 templates.
--    Mon noi_adesso · Tue scoprirsi · Wed ricordi · Thu desideri ·
--    Fri vicinanza · Sat gioco · Sun profonda.
insert into public.daily_question_templates (id, weekday_slot, sequence, question, theme)
values
  ('noi_adesso-01', 1, 1, 'Cosa ti farebbe partire bene questa settimana?', 'noi_adesso'),
  ('noi_adesso-02', 1, 2, 'C’è una cosa di questa settimana che vorresti toglierti presto dalla testa?', 'noi_adesso'),
  ('noi_adesso-03', 1, 3, 'In cosa posso darti una mano questa settimana, concretamente?', 'noi_adesso'),
  ('noi_adesso-04', 1, 4, 'Che serata ti piacerebbe passare con me nei prossimi giorni?', 'noi_adesso'),
  ('noi_adesso-05', 1, 5, 'Com’è il tuo umore di oggi, in tre parole?', 'noi_adesso'),
  ('noi_adesso-06', 1, 6, 'Cosa ti sta dando energia in questo periodo?', 'noi_adesso'),
  ('noi_adesso-07', 1, 7, 'Se questa settimana avesse un titolo, quale sarebbe?', 'noi_adesso'),
  ('noi_adesso-08', 1, 8, 'Cosa ti manca di più quando le giornate sono piene?', 'noi_adesso'),
  ('noi_adesso-09', 1, 9, 'C’è qualcosa che ti farebbe piacere sentirti dire questa settimana?', 'noi_adesso'),
  ('noi_adesso-10', 1, 10, 'Quanta batteria hai oggi, da 1 a 10, e cosa la ricaricherebbe?', 'noi_adesso'),
  ('noi_adesso-11', 1, 11, 'Quale piccola abitudine vorresti che ci portassimo dietro questa settimana?', 'noi_adesso'),
  ('noi_adesso-12', 1, 12, 'Quale incombenza ti piacerebbe lasciare a me per qualche giorno?', 'noi_adesso'),
  ('noi_adesso-13', 1, 13, 'Cosa aspetti di più nei prossimi sette giorni?', 'noi_adesso'),
  ('noi_adesso-14', 1, 14, 'Quale momento della giornata vorresti passare più spesso con me?', 'noi_adesso'),
  ('noi_adesso-15', 1, 15, 'Cosa renderebbe più leggera la tua serata di oggi?', 'noi_adesso'),
  ('noi_adesso-16', 1, 16, 'Cosa ti è riuscito bene la settimana scorsa, anche in piccolo?', 'noi_adesso'),
  ('noi_adesso-17', 1, 17, 'C’è un piccolo gesto mio che in questi giorni ti aiuta più di quanto immagino?', 'noi_adesso'),
  ('noi_adesso-18', 1, 18, 'Come vorresti che passassimo la prossima domenica?', 'noi_adesso'),
  ('noi_adesso-19', 1, 19, 'Cosa stai rimandando da un po’ e ti piacerebbe chiudere entro venerdì?', 'noi_adesso'),
  ('noi_adesso-20', 1, 20, 'Quale impegno di questa settimana ti incuriosisce di più?', 'noi_adesso'),
  ('noi_adesso-21', 1, 21, 'Di cosa hai più voglia in questo periodo: calma, compagnia o novità?', 'noi_adesso'),
  ('noi_adesso-22', 1, 22, 'Quale pensiero ti porti dietro da questo weekend?', 'noi_adesso'),
  ('noi_adesso-23', 1, 23, 'Se potessi cambiare una cosa della tua routine attuale, quale sarebbe?', 'noi_adesso'),
  ('noi_adesso-24', 1, 24, 'Cosa vorresti che sapessi della tua settimana, prima che cominci?', 'noi_adesso'),
  ('noi_adesso-25', 1, 25, 'Cosa ti fa sentire a casa in una giornata storta?', 'noi_adesso'),
  ('noi_adesso-26', 1, 26, 'Cosa ti piacerebbe festeggiare, anche in piccolo, entro domenica?', 'noi_adesso'),
  ('scoprirsi-01', 2, 1, 'Qual è il tuo modo preferito di passare una mattina senza impegni?', 'scoprirsi'),
  ('scoprirsi-02', 2, 2, 'Quale canzone ti mette di buonumore quasi sempre?', 'scoprirsi'),
  ('scoprirsi-03', 2, 3, 'Hai una piccola mania che forse non ho ancora notato?', 'scoprirsi'),
  ('scoprirsi-04', 2, 4, 'Quale profumo ti riporta subito all’infanzia?', 'scoprirsi'),
  ('scoprirsi-05', 2, 5, 'Quale lavoro sognavi di fare quando andavi alle elementari?', 'scoprirsi'),
  ('scoprirsi-06', 2, 6, 'Com’è la tua colazione ideale, senza nessun limite?', 'scoprirsi'),
  ('scoprirsi-07', 2, 7, 'Cosa ti fa ridere anche quando non dovresti?', 'scoprirsi'),
  ('scoprirsi-08', 2, 8, 'Quale film riguarderesti all’infinito senza stancarti?', 'scoprirsi'),
  ('scoprirsi-09', 2, 9, 'C’è una cosa che fai sempre allo stesso modo, quasi come un rito?', 'scoprirsi'),
  ('scoprirsi-10', 2, 10, 'Qual è il complimento che ti è rimasto più impresso, da chiunque arrivasse?', 'scoprirsi'),
  ('scoprirsi-11', 2, 11, 'In quale stagione dell’anno ti riconosci di più?', 'scoprirsi'),
  ('scoprirsi-12', 2, 12, 'Di cosa hai una paura piccola e un po’ buffa?', 'scoprirsi'),
  ('scoprirsi-13', 2, 13, 'Cosa collezionavi, o avresti voluto collezionare, alle medie?', 'scoprirsi'),
  ('scoprirsi-14', 2, 14, 'Quale libro, serie o storia ti ha cambiato un po’ il modo di vedere le cose?', 'scoprirsi'),
  ('scoprirsi-15', 2, 15, 'Quando hai una giornata no, preferisci parlarne subito o lasciarla decantare?', 'scoprirsi'),
  ('scoprirsi-16', 2, 16, 'In quale angolo di casa stai meglio, e perché proprio lì?', 'scoprirsi'),
  ('scoprirsi-17', 2, 17, 'Quale piatto sapresti cucinare a occhi chiusi?', 'scoprirsi'),
  ('scoprirsi-18', 2, 18, 'C’è un cibo che adori e che non ordini quasi mai?', 'scoprirsi'),
  ('scoprirsi-19', 2, 19, 'Qual è la parola italiana che ti piace di più?', 'scoprirsi'),
  ('scoprirsi-20', 2, 20, 'Se oggi ti regalassero un’ora tutta per te, come la useresti?', 'scoprirsi'),
  ('scoprirsi-21', 2, 21, 'C’è un talento che ti piacerebbe avere e che non hai mai confessato?', 'scoprirsi'),
  ('scoprirsi-22', 2, 22, 'Quale suono ti rilassa più di tutti?', 'scoprirsi'),
  ('scoprirsi-23', 2, 23, 'Che tipo di regalo ti emoziona davvero: utile, fatto a mano o inaspettato?', 'scoprirsi'),
  ('scoprirsi-24', 2, 24, 'Di cosa potresti parlare per ore senza annoiarti?', 'scoprirsi'),
  ('scoprirsi-25', 2, 25, 'Cosa ti rende impaziente più di ogni altra cosa?', 'scoprirsi'),
  ('scoprirsi-26', 2, 26, 'Quale abitudine della tua famiglia ti porti dietro senza accorgertene?', 'scoprirsi'),
  ('ricordi-01', 3, 1, 'Qual è la prima cosa di me che ti è rimasta in mente?', 'ricordi'),
  ('ricordi-02', 3, 2, 'Quale momento nostro rivivresti identico, senza cambiare nulla?', 'ricordi'),
  ('ricordi-03', 3, 3, 'Ricordi la prima volta che hai pensato “con questa persona sto bene”? Dov’eravamo?', 'ricordi'),
  ('ricordi-04', 3, 4, 'Quale gita o viaggio insieme ti torna in mente più spesso?', 'ricordi'),
  ('ricordi-05', 3, 5, 'Qual è la risata più forte che ricordi di aver fatto con me?', 'ricordi'),
  ('ricordi-06', 3, 6, 'Quale mio messaggio ricordi ancora quasi a memoria?', 'ricordi'),
  ('ricordi-07', 3, 7, 'Quale posto per te ormai è “nostro”?', 'ricordi'),
  ('ricordi-08', 3, 8, 'Quale mio regalo, anche piccolissimo, ti è rimasto nel cuore?', 'ricordi'),
  ('ricordi-09', 3, 9, 'Quale piccolo imprevisto affrontato insieme, a ripensarci, ti fa sorridere?', 'ricordi'),
  ('ricordi-10', 3, 10, 'C’è una serata normale con me che, chissà perché, ricordi benissimo?', 'ricordi'),
  ('ricordi-11', 3, 11, 'Qual è il ricordo d’infanzia a cui torni più volentieri?', 'ricordi'),
  ('ricordi-12', 3, 12, 'Quale canzone ti riporta subito a un momento nostro?', 'ricordi'),
  ('ricordi-13', 3, 13, 'Ricordi un momento in cui ci siamo commossi insieme?', 'ricordi'),
  ('ricordi-14', 3, 14, 'Che piatto associ a un ricordo con me?', 'ricordi'),
  ('ricordi-15', 3, 15, 'Quale foto nostra racconta meglio com’eravamo all’inizio?', 'ricordi'),
  ('ricordi-16', 3, 16, 'Ricordi un giorno in cui la mia presenza ha fatto la differenza?', 'ricordi'),
  ('ricordi-17', 3, 17, 'Qual è stata la nostra prima abitudine di coppia, secondo te?', 'ricordi'),
  ('ricordi-18', 3, 18, 'Cosa facevamo all’inizio che ti piacerebbe tornare a fare?', 'ricordi'),
  ('ricordi-19', 3, 19, 'Quale estate della tua vita ricordi come la più bella?', 'ricordi'),
  ('ricordi-20', 3, 20, 'Quale dettaglio del nostro primo appuntamento ricordi meglio?', 'ricordi'),
  ('ricordi-21', 3, 21, 'Quale frase che ti ho detto ti è rimasta addosso, nel senso buono?', 'ricordi'),
  ('ricordi-22', 3, 22, 'Quale casa o città in cui hai vissuto ti manca, e per cosa?', 'ricordi'),
  ('ricordi-23', 3, 23, 'Quando hai capito che mi conoscevi davvero bene?', 'ricordi'),
  ('ricordi-24', 3, 24, 'Quale festa o ricorrenza passata insieme ricordi con più tenerezza?', 'ricordi'),
  ('ricordi-25', 3, 25, 'Che storia di quando eri adolescente non mi hai ancora raccontato?', 'ricordi'),
  ('ricordi-26', 3, 26, 'Se potessi conservare un solo giorno del nostro ultimo anno, quale sceglieresti?', 'ricordi'),
  ('desideri-01', 4, 1, 'Dove vorresti andare con me almeno una volta nella vita?', 'desideri'),
  ('desideri-02', 4, 2, 'Cosa ti piacerebbe imparare a fare insieme?', 'desideri'),
  ('desideri-03', 4, 3, 'Come immagini una nostra domenica perfetta tra cinque anni?', 'desideri'),
  ('desideri-04', 4, 4, 'Qual è un’esperienza un po’ folle che faresti con me senza pensarci troppo?', 'desideri'),
  ('desideri-05', 4, 5, 'Con un weekend libero e un budget piccolo, dove andresti con me?', 'desideri'),
  ('desideri-06', 4, 6, 'Quale concerto, spettacolo o evento vorresti vivere con me?', 'desideri'),
  ('desideri-07', 4, 7, 'Quale tradizione tutta nostra ti piacerebbe inventare?', 'desideri'),
  ('desideri-08', 4, 8, 'Qual è un sogno che non hai ancora detto ad alta voce?', 'desideri'),
  ('desideri-09', 4, 9, 'Se potessimo vivere un anno in un’altra città, quale sceglieresti?', 'desideri'),
  ('desideri-10', 4, 10, 'Quale piatto vorresti imparare a cucinare per me?', 'desideri'),
  ('desideri-11', 4, 11, 'Cosa vorresti fare prima della fine di quest’anno?', 'desideri'),
  ('desideri-12', 4, 12, 'Qual è un dettaglio preciso della nostra casa ideale?', 'desideri'),
  ('desideri-13', 4, 13, 'Che viaggio in treno o in macchina ti piacerebbe fare con me?', 'desideri'),
  ('desideri-14', 4, 14, 'C’è un’avventura all’aria aperta che vorresti provare insieme?', 'desideri'),
  ('desideri-15', 4, 15, 'Se potessi farmi un regalo qualsiasi, senza limiti, quale sarebbe?', 'desideri'),
  ('desideri-16', 4, 16, 'Quale nuova abitudine vorresti che diventasse nostra l’anno prossimo?', 'desideri'),
  ('desideri-17', 4, 17, 'Quale posto vicino a casa, dove non siamo mai stati, ti incuriosisce?', 'desideri'),
  ('desideri-18', 4, 18, 'Se potessi prenotare stasera una cena speciale per noi, dove sarebbe?', 'desideri'),
  ('desideri-19', 4, 19, 'Tra vent’anni, quale storia su di noi ti piacerebbe raccontare agli amici?', 'desideri'),
  ('desideri-20', 4, 20, 'Quale lingua ti piacerebbe imparare, e dove andresti a usarla?', 'desideri'),
  ('desideri-21', 4, 21, 'Che festa ti piacerebbe organizzare con me?', 'desideri'),
  ('desideri-22', 4, 22, 'Che viaggio faresti se avessimo un mese intero a disposizione?', 'desideri'),
  ('desideri-23', 4, 23, 'Quale “prima volta” ti piacerebbe vivere con me?', 'desideri'),
  ('desideri-24', 4, 24, 'Cosa ti piacerebbe costruire con le tue mani, un giorno?', 'desideri'),
  ('desideri-25', 4, 25, 'Quale desiderio piccolo potremmo realizzare entro un mese?', 'desideri'),
  ('desideri-26', 4, 26, 'Dove ti piacerebbe essere, con me, esattamente tra un anno?', 'desideri'),
  ('vicinanza-01', 5, 1, 'Qual è un piccolo gesto mio che ti arriva dritto al cuore?', 'vicinanza'),
  ('vicinanza-02', 5, 2, 'In quale momento della giornata ti manco di più?', 'vicinanza'),
  ('vicinanza-03', 5, 3, 'Cosa ho fatto per te, senza che me lo chiedessi, che ti è sembrato dolcissimo?', 'vicinanza'),
  ('vicinanza-04', 5, 4, 'Meglio un abbraccio lungo, un messaggio inatteso o un caffè portato a letto?', 'vicinanza'),
  ('vicinanza-05', 5, 5, 'Come ti piace di più che ti saluti la mattina?', 'vicinanza'),
  ('vicinanza-06', 5, 6, 'C’è una parola o un soprannome che ti fa sciogliere quando lo dico io?', 'vicinanza'),
  ('vicinanza-07', 5, 7, 'In quale momento della giornata ci senti più vicini?', 'vicinanza'),
  ('vicinanza-08', 5, 8, 'Cosa faccio che ti fa sentire al sicuro?', 'vicinanza'),
  ('vicinanza-09', 5, 9, 'Cosa ti piacerebbe che facessi più spesso per te?', 'vicinanza'),
  ('vicinanza-10', 5, 10, 'Quale mio difetto, sotto sotto, trovi tenero?', 'vicinanza'),
  ('vicinanza-11', 5, 11, 'Quale parte di una giornata passata insieme ti rimane addosso anche dopo?', 'vicinanza'),
  ('vicinanza-12', 5, 12, 'Quale messaggio ti piacerebbe ricevere da me in una giornata pesante?', 'vicinanza'),
  ('vicinanza-13', 5, 13, 'Qual è la cosa di me che guardi quando pensi che non me ne accorga?', 'vicinanza'),
  ('vicinanza-14', 5, 14, 'Con quale gesto semplice posso migliorarti una giornata?', 'vicinanza'),
  ('vicinanza-15', 5, 15, 'Quando siamo lontani, cosa ti fa sentire la mia presenza?', 'vicinanza'),
  ('vicinanza-16', 5, 16, 'Qual è il tuo abbraccio preferito: al risveglio, al rientro o prima di dormire?', 'vicinanza'),
  ('vicinanza-17', 5, 17, 'Cosa ti fa capire che ti sto ascoltando davvero?', 'vicinanza'),
  ('vicinanza-18', 5, 18, 'Cosa dico spesso che ti piace sentire?', 'vicinanza'),
  ('vicinanza-19', 5, 19, 'Quale piccola sorpresa ti renderebbe felice questa settimana?', 'vicinanza'),
  ('vicinanza-20', 5, 20, 'In quale situazione ti piace che ti prenda per mano?', 'vicinanza'),
  ('vicinanza-21', 5, 21, 'Qual è una mia qualità che ammiri e che non mi hai mai detto?', 'vicinanza'),
  ('vicinanza-22', 5, 22, 'Cosa vorresti che ti ricordassi nei giorni in cui sei giù di morale?', 'vicinanza'),
  ('vicinanza-23', 5, 23, 'Dove ti senti più in pace quando siamo insieme?', 'vicinanza'),
  ('vicinanza-24', 5, 24, 'Come ti accorgi che sono felice?', 'vicinanza'),
  ('vicinanza-25', 5, 25, 'Cosa c’è di più romantico, secondo te, in un giorno qualsiasi?', 'vicinanza'),
  ('vicinanza-26', 5, 26, 'Da cosa ti accorgi, nella vita di tutti i giorni, che ti scelgo ancora?', 'vicinanza'),
  ('gioco-01', 6, 1, 'Se fossimo i protagonisti di un film, quale film sarebbe?', 'gioco'),
  ('gioco-02', 6, 2, 'Se potessi avere un superpotere solo per un giorno, quale sceglieresti?', 'gioco'),
  ('gioco-03', 6, 3, 'Quali animali saremmo, tu e io, e perché?', 'gioco'),
  ('gioco-04', 6, 4, 'Se fossimo un gruppo musicale, come ci chiameremmo?', 'gioco'),
  ('gioco-05', 6, 5, 'Pizza per sempre o pasta per sempre: cosa scegli?', 'gioco'),
  ('gioco-06', 6, 6, 'Se vincessimo un viaggio a sorpresa domani, dove speri che ci mandino?', 'gioco'),
  ('gioco-07', 6, 7, 'Quale oggetto di casa, se potesse parlare, racconterebbe più cose su di noi?', 'gioco'),
  ('gioco-08', 6, 8, 'Se avessi un programma di cucina tutto tuo, come si chiamerebbe?', 'gioco'),
  ('gioco-09', 6, 9, 'Quale sarebbe la nostra canzone da karaoke, senza vergogna?', 'gioco'),
  ('gioco-10', 6, 10, 'Se potessi vivere la mia vita per un giorno, qual è la prima cosa che faresti?', 'gioco'),
  ('gioco-11', 6, 11, 'Quale epoca storica visiteresti per un weekend?', 'gioco'),
  ('gioco-12', 6, 12, 'Se fossi un gusto di gelato, quale saresti?', 'gioco'),
  ('gioco-13', 6, 13, 'Qual è il film più brutto che guarderesti volentieri con me?', 'gioco'),
  ('gioco-14', 6, 14, 'Se aprissimo un locale insieme, che tipo di posto sarebbe?', 'gioco'),
  ('gioco-15', 6, 15, 'Chi dei due resisterebbe di più su un’isola deserta, e perché?', 'gioco'),
  ('gioco-16', 6, 16, 'Se la nostra vita fosse una serie TV, come si intitolerebbe questa stagione?', 'gioco'),
  ('gioco-17', 6, 17, 'Quale emoji ti rappresenta meglio oggi?', 'gioco'),
  ('gioco-18', 6, 18, 'Se potessi eliminare per sempre una faccenda di casa, quale sceglieresti?', 'gioco'),
  ('gioco-19', 6, 19, 'Chi dei due riuscirebbe a perdersi anche con il navigatore acceso?', 'gioco'),
  ('gioco-20', 6, 20, 'Se avessimo un animale domestico parlante, cosa direbbe di noi?', 'gioco'),
  ('gioco-21', 6, 21, 'Quale regola assurda metteresti in casa nostra per un giorno intero?', 'gioco'),
  ('gioco-22', 6, 22, 'Con quale personaggio famoso vorresti cenare insieme a me, e cosa gli chiederesti?', 'gioco'),
  ('gioco-23', 6, 23, 'Quale cartone animato della tua infanzia rivedresti volentieri stasera?', 'gioco'),
  ('gioco-24', 6, 24, 'Se dovessi descrivermi come un piatto, quale sarei?', 'gioco'),
  ('gioco-25', 6, 25, 'Se potessimo teletrasportarci per una sola cena stasera, dove andremmo?', 'gioco'),
  ('gioco-26', 6, 26, 'Quale sarebbe il titolo del libro sulla nostra storia?', 'gioco'),
  ('profonda-01', 7, 1, 'Cosa di questa settimana ti ha fatto pensare, anche solo tra te, “che fortuna”?', 'profonda'),
  ('profonda-02', 7, 2, 'Tra le cose che stiamo costruendo insieme, quale ti sta più a cuore?', 'profonda'),
  ('profonda-03', 7, 3, 'In cosa pensi che siamo cresciuti di più nell’ultimo anno?', 'profonda'),
  ('profonda-04', 7, 4, 'Cosa ti ho insegnato senza volerlo?', 'profonda'),
  ('profonda-05', 7, 5, 'Cosa significa per te “casa”, oggi?', 'profonda'),
  ('profonda-06', 7, 6, 'Qual è un valore che senti davvero nostro?', 'profonda'),
  ('profonda-07', 7, 7, 'Quale momento di questa settimana ti è sembrato piccolo ma importante?', 'profonda'),
  ('profonda-08', 7, 8, 'Cosa ti piace di chi sei quando stai con me?', 'profonda'),
  ('profonda-09', 7, 9, 'Tra noi, cosa speri che non cambi mai?', 'profonda'),
  ('profonda-10', 7, 10, 'Cosa hai capito dell’amore da quando stiamo insieme?', 'profonda'),
  ('profonda-11', 7, 11, 'Chi, tra famiglia e amici, ti ha insegnato qualcosa sull’amore?', 'profonda'),
  ('profonda-12', 7, 12, 'Cosa di me hai imparato ad apprezzare col tempo?', 'profonda'),
  ('profonda-13', 7, 13, 'Per cosa vorresti ringraziarmi, anche se è passato un po’ di tempo?', 'profonda'),
  ('profonda-14', 7, 14, 'Cosa abbiamo di prezioso che non si può comprare?', 'profonda'),
  ('profonda-15', 7, 15, 'Cosa ti dà la sensazione che siamo una squadra?', 'profonda'),
  ('profonda-16', 7, 16, 'C’è un tuo sogno che senti di poter inseguire meglio grazie a noi?', 'profonda'),
  ('profonda-17', 7, 17, 'Come descriveresti il nostro rapporto a qualcuno che non ci conosce?', 'profonda'),
  ('profonda-18', 7, 18, 'Qual è una piccola cosa quotidiana della nostra vita che non daresti mai per scontata?', 'profonda'),
  ('profonda-19', 7, 19, 'Cosa vorresti che ricordassimo di questo periodo tra dieci anni?', 'profonda'),
  ('profonda-20', 7, 20, 'In cosa siamo diversi, e perché ti piace?', 'profonda'),
  ('profonda-21', 7, 21, 'Quale promessa silenziosa senti di mantenere ogni giorno con me?', 'profonda'),
  ('profonda-22', 7, 22, 'Cosa ti ha sorpreso di più del modo in cui ci vogliamo bene?', 'profonda'),
  ('profonda-23', 7, 23, 'Qual è la cosa più semplice che rende bella la nostra vita insieme?', 'profonda'),
  ('profonda-24', 7, 24, 'Guardando a noi, cosa ti fa pensare “ne è valsa la pena”?', 'profonda'),
  ('profonda-25', 7, 25, 'Quale parte della tua vita è cambiata di più da quando ci sono io?', 'profonda'),
  ('profonda-26', 7, 26, 'Quale frase vorresti che ci accompagnasse nei prossimi anni?', 'profonda')
on conflict (id) do nothing;
