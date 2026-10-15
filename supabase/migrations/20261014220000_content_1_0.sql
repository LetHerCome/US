-- US 1.0 content (founder approval 2026-10-14, decision 4).
--
-- 1. English stored now: nullable *_en columns on the five content tables,
--    filled for every row. Clients still receive Italian: a later i18n change
--    picks the language per viewer. RLS and grants are unchanged; the new
--    columns follow the table-level privileges of their Italian twin (only
--    bond_quest_templates is client-readable, as before; nothing becomes
--    client-writable).
-- 2. Content, generated from supabase/game-v2/content-1-0 (see the
--    content-1-0 block): 150 new Game V2 prompts, 40 new Swipe cards, Italian
--    fixes (same id, version + 1 where the table versions its rows), 5 retired
--    Swipe cards (active = false, never deleted) and the English text.
-- 3. Real names: the role tokens {francesco}, {beatrice} and {subject} render
--    with the couple's own display names instead of the hardcoded
--    'Francesco' / 'Bea'.
-- Re-applying this migration changes nothing.

-- Preflight: public.start_game_round must be the audited baseline body, or
-- the body this migration writes (a re-apply). Anything else aborts before
-- any change, so an unknown production edit is never overwritten.
do $content_1_0_preflight$
declare body text;
begin
  select pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) into body
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.start_game_round(text,uuid)');
  if body is null or body not in ('c57ba90dcafa8fc117eb456907c0225f', '60b096ee1a0ada7e51a8766865207c99') then
    raise exception using errcode = 'P0001', message = 'content 1.0: public.start_game_round is not the audited version',
      detail = coalesce(body, 'missing');
  end if;
end;
$content_1_0_preflight$;

alter table public.game_v2_catalog
  add column if not exists question_text_en text,
  add column if not exists predict_text_en text,
  add column if not exists options_en jsonb;
alter table private.game_swipe_v1_catalog
  add column if not exists question_text_en text,
  add column if not exists options_en jsonb;
alter table public.daily_question_templates add column if not exists question_en text;
alter table public.game_v2_recipes add column if not exists question_text_en text;
alter table public.bond_quest_templates add column if not exists title_en text;

-- English options mirror the Italian ones one to one (answers are stored as
-- an index), and the English predictor wording keeps the {subject} token.
alter table public.game_v2_catalog drop constraint if exists game_v2_catalog_options_en_check;
alter table public.game_v2_catalog add constraint game_v2_catalog_options_en_check check (
  options_en is null or (jsonb_typeof(options_en) = 'array' and jsonb_array_length(options_en) = jsonb_array_length(options)));
alter table public.game_v2_catalog drop constraint if exists game_v2_catalog_predict_text_en_check;
alter table public.game_v2_catalog add constraint game_v2_catalog_predict_text_en_check check (
  predict_text_en is null or (predict_text is not null and predict_text_en like '%{subject}%'));
alter table private.game_swipe_v1_catalog drop constraint if exists game_swipe_v1_catalog_options_en_check;
alter table private.game_swipe_v1_catalog add constraint game_swipe_v1_catalog_options_en_check check (
  options_en is null or (jsonb_typeof(options_en) = 'array' and jsonb_array_length(options_en) = 2
    and (options_en ->> 0) <> (options_en ->> 1)));

comment on column public.game_v2_catalog.question_text_en is 'US 1.0 English of question_text. Not served yet: the RPCs return Italian until the i18n change.';
comment on column public.game_v2_catalog.predict_text_en is 'US 1.0 English of predict_text (keeps {subject}).';
comment on column public.game_v2_catalog.options_en is 'US 1.0 English of options, same order and length.';
comment on column private.game_swipe_v1_catalog.question_text_en is 'US 1.0 English of question_text. Not served yet.';
comment on column private.game_swipe_v1_catalog.options_en is 'US 1.0 English of options, same order.';
comment on column public.daily_question_templates.question_en is 'US 1.0 English of question. Not served yet.';
comment on column public.game_v2_recipes.question_text_en is 'US 1.0 English of question_text (same placeholders). Not served yet.';
comment on column public.bond_quest_templates.title_en is 'US 1.0 English of title. Not served yet.';
comment on table public.game_v2_catalog is 'M11B curated Game V2 prompts. Source of truth: supabase/game-v2/catalog/*.json (M11B seed) and supabase/game-v2/content-1-0 (US 1.0 seed, fixes and English), both generated. Retire a prompt with active=false; bump version for a new wording in a new migration. Server-only.';
comment on table private.game_swipe_v1_catalog is 'Swipe V1 curated binary-choice cards. Source of truth: supabase/game-v2/swipe-v1/catalog.json and supabase/game-v2/content-1-0/swipe.json. Private server-only catalog; materialized into immutable Game V2 session items.';

-- content-1-0:begin (generated by scripts/build-content-1-0-sql.mjs from supabase/game-v2/content-1-0; do not edit by hand)

-- Game V2 catalog: 150 new prompts, Italian and English.
insert into public.game_v2_catalog (id, version, family, source_type, mechanic, answer_kind, question_text, predict_text, options, depth, topic, cooldown_class, longitudinal, question_text_en, predict_text_en, options_en) values
  ('quanto_mi_conosci-013', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Di casa, cosa ti manca di più quando stai via per qualche giorno?', 'Di casa, cosa manca di più a {subject} quando sta via per qualche giorno?', '["Il mio letto","La doccia di casa","La cucina e le mie cose","Il silenzio di casa"]'::jsonb, 1, 'cosa_mi_manca_di_casa', 'light', false, 'What do you miss most about home when you’re away for a few days?', 'What does {subject} miss most about home when they’re away for a few days?', '["My own bed","My own shower","The kitchen and my things","The quiet of home"]'::jsonb),
  ('quanto_mi_conosci-014', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Cosa ti toglie energie più di quanto sembri da fuori?', 'Cosa toglie energie a {subject} più di quanto sembri da fuori?', '["Le chiacchiere di circostanza","Il rumore di fondo, sempre acceso","Una giornata senza un minuto per me","Dover decidere troppe cose"]'::jsonb, 2, 'cosa_mi_scarica', 'standard', false, 'What drains you more than anyone would guess?', 'What drains {subject} more than anyone would guess?', '["Small talk","Constant background noise","A day without a minute to myself","Having to make too many decisions"]'::jsonb),
  ('quanto_mi_conosci-015', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Sei in una sala d’attesa, senza niente da fare per mezz’ora. Cosa fai davvero?', '{subject} è in una sala d’attesa, senza niente da fare per mezz’ora. Cosa fa davvero?', '["Guardo le persone e invento storie","Scorro il telefono senza leggere niente","Ripasso le cose da fare","Controllo l’ora ogni due minuti"]'::jsonb, 1, 'sala_d_attesa', 'light', false, 'You’re in a waiting room with nothing to do for half an hour. What do you actually do?', '{subject} is in a waiting room with nothing to do for half an hour. What do they actually do?', '["Watch people and make up their stories","Scroll my phone without reading a thing","Go over my to-do list","Check the time every two minutes"]'::jsonb),
  ('quanto_mi_conosci-016', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando ti fermi e non fai proprio niente, cosa succede dentro di te?', 'Quando {subject} si ferma e non fa proprio niente, cosa succede dentro di sé?', '["Sto benissimo, finalmente","Dopo dieci minuti mi sento in colpa","Trovo subito qualcosa da sistemare","Mi addormento, puntualmente"]'::jsonb, 2, 'fermarsi_senza_fare_niente', 'standard', false, 'When you stop and do absolutely nothing, what goes on inside you?', 'When {subject} stops and does absolutely nothing, what goes on inside them?', '["Bliss, finally","Ten minutes in, I feel guilty","I find something to sort out right away","I fall asleep, like clockwork"]'::jsonb),
  ('quanto_mi_conosci-017', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando ti chiedo come stai e rispondi «bene», cosa vuol dire di solito?', 'Quando chiedi a {subject} come sta e risponde «bene», cosa vuol dire di solito?', '["Che sto bene, davvero","Che ne parliamo più tardi","Che ho solo bisogno di dormire","Che aspetto una seconda domanda"]'::jsonb, 3, 'quando_dico_bene', 'deep', false, 'When I ask how you are and you say “fine”, what does it usually mean?', 'When you ask {subject} how they are and they say “fine”, what does it usually mean?', '["That I’m fine, really","That we’ll talk about it later","That I just need some sleep","That I’m waiting for a second question"]'::jsonb),
  ('quanto_mi_conosci-018', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale di queste faccende, sotto sotto, ti rilassa?', 'Quale di queste faccende, sotto sotto, rilassa {subject}?', '["Stirare, con calma","Stendere il bucato","Riordinare un cassetto","Nessuna: le odio tutte uguali"]'::jsonb, 1, 'faccenda_rilassante', 'light', false, 'Which of these chores secretly relaxes you?', 'Which of these chores secretly relaxes {subject}?', '["Ironing, slowly","Hanging out the laundry","Tidying a drawer","None: I hate them all equally"]'::jsonb),
  ('quanto_mi_conosci-019', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Sei alle prese con qualcosa di complicato, tipo un modulo infinito o un mobile da montare. Che aiuto vuoi da me?', '{subject} è alle prese con qualcosa di complicato, tipo un modulo infinito o un mobile da montare. Che aiuto vuole da te?', '["Nessuno: voglio farcela io","Compagnia, ma niente consigli","Una mano solo quando la chiedo","Che ci pensi tu, io guardo"]'::jsonb, 2, 'aiuto_nelle_cose_complicate', 'standard', false, 'You’re wrestling with something tricky, like an endless form or furniture to assemble. What help do you want from me?', '{subject} is wrestling with something tricky, like an endless form or furniture to assemble. What help do they want from you?', '["None: I want to crack it myself","Company, but no advice","A hand only when I ask","You take over, I’ll watch"]'::jsonb),
  ('quanto_mi_conosci-020', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Fai una piccola figuraccia davanti a tutti. Come reagisci?', '{subject} fa una piccola figuraccia davanti a tutti. Come reagisce?', '["Ci rido sopra subito","Faccio finta di niente","Divento color peperone","Ci ripenso per anni"]'::jsonb, 1, 'figuraccia', 'light', false, 'You make a small fool of yourself in front of everyone. How do you react?', '{subject} makes a small fool of themselves in front of everyone. How do they react?', '["Laugh it off right away","Act like nothing happened","Turn bright red","Replay it for years"]'::jsonb),
  ('quanto_mi_conosci-021', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Qualcuno ti chiede un favore che non hai nessuna voglia di fare. Cosa succede?', 'Qualcuno chiede a {subject} un favore che non ha nessuna voglia di fare. Cosa succede?', '["Dico di sì, e poi me ne pento","Dico di no, con garbo e chiarezza","Prendo tempo e spero che se ne dimentichi","Propongo un’altra cosa al posto di quella"]'::jsonb, 2, 'favore_controvoglia', 'standard', false, 'Someone asks you a favor you really don’t feel like doing. What happens?', 'Someone asks {subject} a favor they really don’t feel like doing. What happens?', '["I say yes, then regret it","I say no, kindly but clearly","I stall and hope they forget","I offer something else instead"]'::jsonb),
  ('quanto_mi_conosci-022', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando devo dirti una cosa che non ti farà piacere, come preferisci che lo faccia?', 'Quando devi dire a {subject} una cosa poco piacevole, come preferisce che lo faccia?', '["Subito, dritto al punto","Con calma, nel momento giusto","Prima una cosa bella, poi il resto","Per iscritto, così ho tempo di pensarci"]'::jsonb, 3, 'cose_difficili_da_dire', 'deep', false, 'When I have to tell you something you won’t like, how do you want me to do it?', 'When you have to tell {subject} something they won’t like, how do they want you to do it?', '["Right away, straight to the point","Calmly, at the right moment","Something nice first, then the rest","In writing, so I have time to think"]'::jsonb),
  ('quanto_mi_conosci-023', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Ti fanno una domanda e non sai la risposta. Cosa fai?', 'Fanno a {subject} una domanda e non sa la risposta. Cosa fa?', '["Lo ammetto subito","Improvviso, con grande sicurezza","Dico «bella domanda» e prendo tempo","Cerco subito sul telefono"]'::jsonb, 1, 'non_so_la_risposta', 'light', false, 'Someone asks you something and you don’t know the answer. What do you do?', 'Someone asks {subject} something and they don’t know the answer. What do they do?', '["Admit it right away","Improvise, with total confidence","Say “good question” and stall","Look it up on the spot"]'::jsonb),
  ('quanto_mi_conosci-024', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Tutti cantano «tanti auguri» e gli sguardi sono su di te. Cosa fai?', 'Tutti cantano «tanti auguri» e gli sguardi sono su {subject}. Cosa fa?', '["Me lo godo fino in fondo","Non so dove guardare","Canto anche io, per confondermi","Una battuta, per spostare l’attenzione"]'::jsonb, 2, 'tanti_auguri', 'standard', false, 'Everyone’s singing “Happy Birthday” and all eyes are on you. What do you do?', 'Everyone’s singing “Happy Birthday” and all eyes are on {subject}. What do they do?', '["Soak up every second","Don’t know where to look","Sing along to blend in","Crack a joke to shift the spotlight"]'::jsonb),
  ('quanto_mi_conosci-025', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Rientri a casa dopo una giornata fuori. Qual è la prima cosa che fai?', '{subject} rientra a casa dopo una giornata fuori. Qual è la prima cosa che fa?', '["Mi cambio e metto qualcosa di comodo","Svuoto le tasche e metto tutto a posto","Apro il frigo, anche senza fame","Mi siedo un attimo, ancora col cappotto"]'::jsonb, 1, 'rientro_a_casa', 'light', false, 'You get home after a day out. What’s the first thing you do?', '{subject} gets home after a day out. What’s the first thing they do?', '["Change into something comfy","Empty my pockets and put everything away","Open the fridge, even if I’m not hungry","Sit for a moment, coat still on"]'::jsonb),
  ('quanto_mi_conosci-026', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale di queste cose ti commuove più facilmente?', 'Quale di queste cose commuove più facilmente {subject}?', '["Due persone che si ritrovano dopo anni","Qualcuno che ce la fa contro ogni pronostico","Una gentilezza tra sconosciuti","La musica giusta al momento giusto"]'::jsonb, 2, 'cosa_mi_commuove', 'standard', false, 'Which of these moves you most easily?', 'Which of these moves {subject} most easily?', '["Two people reuniting after years","Someone making it against all odds","Kindness between strangers","The right music at the right moment"]'::jsonb),
  ('quanto_mi_conosci-027', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando vorresti qualcosa da me ma non lo chiedi, come provi a farmelo capire?', 'Quando {subject} vorrebbe qualcosa da te ma non lo chiede, come prova a fartelo capire?', '["Lo nomino per caso, più volte","Lo faccio io per te, sperando che ricambi","Lo chiedo scherzando, ma dico sul serio","Sospiro, e aspetto che ci arrivi"]'::jsonb, 3, 'chiedere_senza_chiedere', 'deep', false, 'When you’d like something from me but don’t ask, how do you try to get it across?', 'When {subject} would like something from you but doesn’t ask, how do they try to get it across?', '["Mention it casually, more than once","Do it for you, hoping you’ll do the same","Ask as a joke, but mean it","Sigh, and wait for you to get it"]'::jsonb),
  ('quanto_mi_conosci-028', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Qualcuno ti svela il finale di una storia che stai seguendo. Come la prendi?', 'Qualcuno svela a {subject} il finale di una storia che sta seguendo. Come la prende?', '["Mi arrabbio sul serio","Mi va benissimo, anzi mi rilassa","Smetto di seguirla","Lo sapevo già: sbircio sempre la fine"]'::jsonb, 1, 'finale_svelato', 'light', false, 'Someone spoils the ending of a story you’re following. How do you take it?', 'Someone spoils the ending of a story {subject} is following. How do they take it?', '["I’m genuinely annoyed","Fine by me, it actually relaxes me","I stop following it","I knew already: I always peek at the end"]'::jsonb),
  ('quanto_mi_conosci-029', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Qual è il modo migliore per farti cambiare idea?', 'Qual è il modo migliore per far cambiare idea a {subject}?', '["Darmi dati e buoni argomenti","Lasciarmi tempo: ci arrivo da me","Farmi ridere, poi ci ripenso"]'::jsonb, 2, 'farmi_cambiare_idea', 'standard', false, 'What’s the best way to get you to change your mind?', 'What’s the best way to get {subject} to change their mind?', '["Give me facts and good arguments","Give me time: I’ll get there myself","Make me laugh, then I’ll rethink it"]'::jsonb),
  ('quanto_mi_conosci-030', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale di queste piccole cose ti dà più soddisfazione di quanto ammetteresti?', 'Quale di queste piccole cose dà a {subject} più soddisfazione di quanto ammetterebbe?', '["Spuntare una voce da una lista","Togliere la pellicola a una cosa nuova","Il primo sorso di qualcosa di caldo","Le lenzuola pulite, la prima notte"]'::jsonb, 1, 'piccole_soddisfazioni', 'light', false, 'Which of these little things satisfies you more than you’d admit?', 'Which of these little things satisfies {subject} more than they’d admit?', '["Ticking something off a list","Peeling the plastic off something new","The first sip of something hot","Clean sheets, the first night"]'::jsonb),
  ('quanto_mi_conosci-031', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Dopo una discussione con qualcuno (non con me), cosa ti succede?', 'Dopo una discussione con qualcuno (non con te), cosa succede a {subject}?', '["Riscrivo in testa la risposta perfetta","Mi passa nel giro di un’ora","Ne parlo con te, battuta per battuta"]'::jsonb, 2, 'dopo_una_discussione', 'standard', false, 'After an argument with someone (not me), how do you handle it?', 'After an argument with someone (not you), how does {subject} handle it?', '["I rewrite the perfect comeback in my head","It’s gone within the hour","I tell you about it, line by line"]'::jsonb),
  ('quanto_mi_conosci-032', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Cosa serve a una persona appena conosciuta per conquistare la tua fiducia?', 'Cosa serve a una persona appena conosciuta per conquistare la fiducia di {subject}?', '["Tempo, tanto tempo","Una piccola promessa mantenuta","Sincerità, anche quando costa","Niente: mi fido subito, poi vedo"]'::jsonb, 3, 'conquistare_la_fiducia', 'deep', false, 'What does someone new need to earn your trust?', 'What does someone new need to earn {subject}’s trust?', '["Time, lots of time","One small promise kept","Honesty, even when it costs them","Nothing: I trust first, then see"]'::jsonb),
  ('quanto_mi_conosci-033', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Ricevi un regalo con scritto sopra «da aprire tra una settimana». Cosa fai?', '{subject} riceve un regalo con scritto sopra «da aprire tra una settimana». Cosa fa?', '["Aspetto, con disciplina","Lo apro subito: non resisto","Lo scuoto e provo a indovinare","Lo apro e lo richiudo per bene"]'::jsonb, 1, 'regalo_da_aprire_dopo', 'light', false, 'You get a present with a note saying “open in a week”. What do you do?', '{subject} gets a present with a note saying “open in a week”. What do they do?', '["Wait, with iron discipline","Open it now: I can’t resist","Shake it and try to guess","Open it and rewrap it perfectly"]'::jsonb),
  ('quanto_mi_conosci-034', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale parte della giornata difendi da tutto e da tutti?', 'Quale parte della giornata {subject} difende da tutto e da tutti?', '["La colazione, in silenzio","Il tragitto, con le cuffie","Una pausa a metà giornata","L’ultima mezz’ora prima di dormire"]'::jsonb, 2, 'momento_da_difendere', 'standard', false, 'Which part of the day do you guard from everyone and everything?', 'Which part of the day does {subject} guard from everyone and everything?', '["Breakfast, in silence","My commute, headphones on","A break in the middle of the day","The last half hour before sleep"]'::jsonb),
  ('quanto_mi_conosci-035', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Ti raccontano una barzelletta che non fa ridere per niente. Cosa fai?', 'Raccontano a {subject} una barzelletta che non fa ridere per niente. Cosa fa?', '["Rido lo stesso, per gentilezza","Rido proprio perché non fa ridere","Rilancio con una ancora peggiore"]'::jsonb, 1, 'barzelletta_che_non_fa_ridere', 'light', false, 'Someone tells you a joke that isn’t funny at all. What do you do?', 'Someone tells {subject} a joke that isn’t funny at all. What do they do?', '["Laugh anyway, to be kind","Laugh precisely because it’s so bad","Top it with an even worse one"]'::jsonb),
  ('quanto_mi_conosci-036', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Devi scrivere un messaggio importante e delicato. Come va?', '{subject} deve scrivere un messaggio importante e delicato. Come va?', '["Lo scrivo di getto e lo mando","Lo riscrivo dieci volte","Lo faccio leggere prima a qualcuno","Lascio perdere e chiamo"]'::jsonb, 2, 'messaggio_delicato', 'standard', false, 'You have to write an important, delicate message. How does it go?', '{subject} has to write an important, delicate message. How does it go?', '["I write it in one go and hit send","I rewrite it ten times","I get someone to read it first","I give up and call instead"]'::jsonb),
  ('quanto_mi_conosci-037', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando le cose vanno bene per un bel po’, cosa ti succede?', 'Quando le cose vanno bene per un bel po’, cosa succede a {subject}?', '["Me lo godo, senza pensieri","Aspetto il colpo di scena","Mi viene voglia di cambiare qualcosa"]'::jsonb, 3, 'quando_va_tutto_bene', 'deep', false, 'When things have been going well for a while, what happens to you?', 'When things have been going well for a while, what happens to {subject}?', '["I enjoy it, no second thoughts","I wait for the plot twist","I get the urge to shake something up"]'::jsonb),
  ('quanto_mi_conosci-038', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Entri in un locale con tanti tavoli liberi. Dove ti siedi?', '{subject} entra in un locale con tanti tavoli liberi. Dove si siede?', '["Spalle al muro, con vista su tutto","Vicino alla finestra","Dove capita: decide il caso"]'::jsonb, 1, 'dove_mi_siedo', 'light', false, 'You walk into a café with lots of free tables. Where do you sit?', '{subject} walks into a café with lots of free tables. Where do they sit?', '["Back to the wall, with a view of everything","By the window","Wherever: I let chance decide"]'::jsonb),
  ('quanto_mi_conosci-039', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando ti parlo mentre stai facendo un’altra cosa, cosa succede davvero?', 'Quando parli a {subject} mentre sta facendo un’altra cosa, cosa succede davvero?', '["Ti ascolto davvero","Annuisco, ma non sento niente","Ti chiedo di aspettare un attimo","Mollo tutto e mi giro verso di te"]'::jsonb, 2, 'parlarmi_mentre_faccio_altro', 'standard', false, 'When I talk to you while you’re busy with something else, what really happens?', 'When you talk to {subject} while they’re busy with something else, what really happens?', '["I really listen","I nod, but hear nothing","I ask you to give me a second","I drop everything and turn to you"]'::jsonb),
  ('quanto_mi_conosci-040', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Hai lo sguardo perso nel vuoto e ti chiedo «a cosa pensi?». Qual è la risposta vera?', '{subject} ha lo sguardo perso nel vuoto e chiedi «a cosa pensi?». Qual è la risposta vera?', '["Al cibo, quasi sempre","A una cosa che ho dimenticato di fare","A una cosa che hai detto tu","A niente, davvero niente"]'::jsonb, 1, 'sguardo_nel_vuoto', 'light', false, 'You’re staring into space and I ask what you’re thinking about. What’s the real answer?', '{subject} is staring into space and you ask what they’re thinking about. What’s the real answer?', '["Food, almost always","Something I forgot to do","Something you said","Nothing, honestly nothing"]'::jsonb),
  ('quanto_mi_conosci-041', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Un impegno salta all’ultimo minuto. Cosa provi, prima di tutto?', 'Un impegno di {subject} salta all’ultimo minuto. Cosa prova, prima di tutto?', '["Un sollievo segreto","Un po’ di delusione","Voglia di riempire subito il buco","L’occasione per recuperare arretrati"]'::jsonb, 2, 'impegno_saltato', 'standard', false, 'Plans fall through at the last minute. What do you feel first?', '{subject}’s plans fall through at the last minute. What do they feel first?', '["A secret sense of relief","A little disappointment","An urge to fill the gap right away","A chance to catch up on things"]'::jsonb),
  ('quanto_mi_conosci-042', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Cosa ti fa pensare, più di tutto, «questa persona mi conosce davvero»?', 'Cosa fa pensare a {subject}, più di tutto, «questa persona mi conosce davvero»?', '["Capisce cosa mi serve prima che lo chieda","Sa quando lasciarmi in pace","Si ricorda le piccole cose che dico","Ride delle mie battute prima della fine"]'::jsonb, 3, 'chi_mi_conosce_davvero', 'deep', false, 'What, above all, makes you think “this person really knows me”?', 'What, above all, makes {subject} think “this person really knows me”?', '["Knowing what I need before I ask","Knowing when to leave me be","Remembering little things I’ve said","Laughing at my jokes before the punchline"]'::jsonb),
  ('quanto_mi_conosci-043', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Hai fame e si mangia più tardi del previsto. Cosa succede?', '{subject} ha fame e si mangia più tardi del previsto. Cosa succede?', '["Divento intrattabile","Smetto di parlare","Mangio la prima cosa che trovo","Non me ne accorgo neanche"]'::jsonb, 1, 'quando_ho_fame', 'light', false, 'You’re hungry and the meal is running late. What happens?', '{subject} is hungry and the meal is running late. What happens?', '["I become impossible to be around","I stop talking","I eat the first thing I find","I barely even notice"]'::jsonb),
  ('quanto_mi_conosci-044', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'C’è da scegliere una cosa piccola insieme, tipo dove mangiare. Cosa dici di solito?', 'C’è da scegliere una cosa piccola insieme, tipo dove mangiare. Cosa dice di solito {subject}?', '["«Decidi tu», e lo penso davvero","«Decidi tu», ma ho già deciso","Tre proposte in dieci secondi","Propongo, boccio, ripropongo"]'::jsonb, 2, 'decidi_tu', 'standard', false, 'We need to pick something small together, like where to eat. What do you usually say?', 'You two need to pick something small, like where to eat. What does {subject} usually say?', '["“You decide”, and I mean it","“You decide”, but I’ve already decided","Three ideas in ten seconds","Suggest, veto, suggest again"]'::jsonb),
  ('quanto_mi_conosci-045', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Ti fai una promessa, tipo andare a dormire prima. Come va a finire?', '{subject} si fa una promessa, tipo andare a dormire prima. Come va a finire?', '["La mantengo, quasi sempre","La rimando a domani, ogni giorno","Dura tre giorni, poi basta","Non me ne faccio più, per prudenza"]'::jsonb, 1, 'buoni_propositi', 'light', false, 'You make yourself a promise, like going to bed earlier. How does that usually go?', '{subject} makes themselves a promise, like going to bed earlier. How does that usually go?', '["I keep it, almost always","I push it to tomorrow, every day","It lasts three days, then that’s it","I’ve stopped making them, just in case"]'::jsonb),
  ('quanto_mi_conosci-046', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando ti prendo in giro con affetto, come reagisci?', 'Quando prendi in giro {subject} con affetto, come reagisce?', '["Rido più forte di te","Rispondo a tono, e di solito vinco","Faccio finta di offendermi","Arrossisco e cambio discorso"]'::jsonb, 2, 'prese_in_giro', 'standard', false, 'When I tease you affectionately, how do you react?', 'When you tease {subject} affectionately, how do they react?', '["Laugh louder than you","Hit back, and usually win","Pretend to be offended","Blush and change the subject"]'::jsonb),
  ('quanto_mi_conosci-047', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando una cosa a cui tenevi va storta, cosa ti aiuta a ripartire?', 'Quando va storta una cosa a cui teneva, cosa aiuta {subject} a ripartire?', '["Capire bene cosa non ha funzionato","Lasciarla andare, senza parlarne più","Riprovarci subito, per orgoglio","Che qualcuno mi ricordi cosa so fare"]'::jsonb, 3, 'ripartire_dopo_un_intoppo', 'deep', false, 'When something you cared about goes badly, what helps you bounce back?', 'When something {subject} cared about goes badly, what helps them bounce back?', '["Understanding what didn’t work","Letting it go and never mentioning it","Trying again right away, out of pride","Someone reminding me what I’m good at"]'::jsonb),
  ('quanto_mi_conosci-048', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Cammini per strada senza fretta. Cosa guardi di più?', '{subject} cammina per strada senza fretta. Cosa guarda di più?', '["Le finestre illuminate delle case","Tutti i cani che passano","I palazzi, con il naso all’insù","Le vetrine, una per una"]'::jsonb, 1, 'passeggiata_senza_fretta', 'light', false, 'You’re walking down a street in no hurry. What do you look at most?', '{subject} is walking down a street in no hurry. What do they look at most?', '["Lit-up windows of people’s homes","Every dog that walks by","The buildings, looking up","Shop windows, one by one"]'::jsonb),
  ('quanto_mi_conosci-049', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Si scopre che avevi ragione tu, su una piccola questione. Cosa fai?', 'Si scopre che {subject} aveva ragione, su una piccola questione. Cosa fa?', '["Lo faccio notare, con eleganza","Sorrido tra me e me","Faccio il balletto della vittoria","Lascio perdere: conta poco"]'::jsonb, 2, 'avere_ragione', 'standard', false, 'Turns out you were right about some small thing. What do you do?', 'Turns out {subject} was right about some small thing. What do they do?', '["Point it out, elegantly","Smile quietly to myself","Do a victory dance","Let it go: it hardly matters"]'::jsonb),
  ('quanto_mi_conosci-050', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Ti viene una buona idea nel momento meno adatto. Cosa fai?', 'A {subject} viene una buona idea nel momento meno adatto. Cosa fa?', '["La scrivo subito, ovunque","La racconto alla prima persona che trovo","Comincio subito, anche di notte","Me la ripeto finché svanisce"]'::jsonb, 1, 'buona_idea_fuori_orario', 'light', false, 'A good idea hits you at the worst possible moment. What do you do?', 'A good idea hits {subject} at the worst possible moment. What do they do?', '["Write it down right away, anywhere","Tell the first person I see","Start right away, even at night","Repeat it to myself until it fades"]'::jsonb),
  ('quanto_mi_conosci-051', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Entri per la prima volta a casa di qualcuno. Cosa noti subito?', '{subject} entra per la prima volta a casa di qualcuno. Cosa nota subito?', '["Il profumo, appena entro","Libri e oggetti sugli scaffali","Le foto appese alle pareti","Quanto è in ordine"]'::jsonb, 2, 'casa_di_qualcuno', 'standard', false, 'You walk into someone’s home for the first time. What do you notice right away?', '{subject} walks into someone’s home for the first time. What do they notice right away?', '["The smell, the moment I walk in","The books and things on the shelves","The photos on the walls","How tidy it is"]'::jsonb),
  ('quanto_mi_conosci-052', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Nella tua testa, qual è la frase che ti ripeti più spesso?', 'Qual è la frase che {subject} si ripete più spesso, nella sua testa?', '["«Dai, ce la fai»","«Non pensarci troppo»","«Ci penso domani»","«Che bello, questo»"]'::jsonb, 3, 'frase_che_mi_ripeto', 'deep', false, 'In your head, which line do you tell yourself most often?', 'Which line does {subject} tell themselves most often, in their head?', '["“Come on, you’ve got this”","“Don’t overthink it”","“I’ll deal with it tomorrow”","“Oh, this is nice”"]'::jsonb),
  ('scopritevi-013', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quando parli tra te e te per farti coraggio o per sgridarti, come ti chiami: per nome, per cognome, con un soprannome?', null, '[]'::jsonb, 1, 'voce_interiore', 'light', false, 'When you talk to yourself, to cheer yourself on or to tell yourself off, what do you call yourself: your first name, your last name, a nickname?', null, '[]'::jsonb),
  ('scopritevi-014', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Negli ultimi minuti prima di addormentarti, dove va di solito la tua testa?', null, '["Ripasso la giornata appena finita","Organizzo già il giorno dopo","Invento storie che non racconto a nessuno","Da nessuna parte: mi spengo come una lampadina"]'::jsonb, 1, 'prima_di_addormentarsi', 'light', false, 'In the last few minutes before you fall asleep, where does your mind usually go?', null, '["Replaying the day I just had","Planning the next day already","Making up stories I never tell anyone","Nowhere: I go out like a light"]'::jsonb),
  ('scopritevi-015', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Se avessi un libretto d’istruzioni, cosa troverei scritto alla voce «Avvertenze»? E alla voce «Manutenzione»?', null, '[]'::jsonb, 2, 'libretto_istruzioni', 'standard', false, 'If you came with an instruction manual, what would I find under “Warnings”? And under “Care and maintenance”?', null, '[]'::jsonb),
  ('scopritevi-016', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è la cosa più coraggiosa che tu abbia mai fatto e che, vista da fuori, sembrerebbe una sciocchezza?', null, '[]'::jsonb, 3, 'coraggio_invisibile', 'deep', false, 'What’s the bravest thing you’ve ever done that would look like nothing from the outside?', null, '[]'::jsonb),
  ('scopritevi-017', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Cosa fai finta di capire da anni, pur di non ammettere che non ci hai mai capito niente?', null, '[]'::jsonb, 1, 'finta_di_capire', 'light', false, 'What have you been pretending to understand for years, just so you don’t have to admit you’ve never had a clue?', null, '[]'::jsonb),
  ('scopritevi-018', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Quando devi prendere una decisione importante, come la prendi davvero?', null, '["Pro e contro, rigorosamente per iscritto","Chiedo consigli, poi faccio di testa mia","Lancio una moneta e scopro cosa speravo","Di pancia: le ragioni arrivano dopo"]'::jsonb, 2, 'decidere', 'standard', false, 'When you have a big decision to make, how do you really make it?', null, '["Pros and cons, strictly in writing","Ask for advice, then do my own thing","Flip a coin and see what I was hoping for","Gut first, reasons later"]'::jsonb),
  ('scopritevi-019', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è la tua contraddizione preferita, tipo odiare il freddo ma adorare l’inverno?', null, '[]'::jsonb, 2, 'contraddizioni', 'standard', false, 'What’s your favorite contradiction about yourself, like hating the cold but loving winter?', null, '[]'::jsonb),
  ('scopritevi-020', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è il tuo modo di dire «ti voglio bene» senza parole, quello che magari passa inosservato?', null, '[]'::jsonb, 3, 'affetto_senza_parole', 'deep', true, 'What’s your way of saying “I love you” without words, the one that might go unnoticed?', null, '[]'::jsonb),
  ('scopritevi-021', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'A quindici anni, che ruolo avevi nel tuo gruppo di amici?', null, '["Organizzavo tutto io","Facevo ridere tutti","Ascoltavo i problemi di tutti","Osservavo, un po’ in disparte"]'::jsonb, 1, 'ruolo_nel_gruppo', 'light', false, 'At fifteen, what was your role in your group of friends?', null, '["I organized everything","I made everyone laugh","I listened to everyone’s problems","I watched from the sidelines"]'::jsonb),
  ('scopritevi-022', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Se aprissero un piccolo museo dedicato a te, quali tre oggetti metteresti nella prima sala?', null, '[]'::jsonb, 2, 'museo_personale', 'standard', true, 'If someone opened a tiny museum all about you, which three objects would go in the first room?', null, '[]'::jsonb),
  ('scopritevi-023', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'In cosa ti senti una persona adulta a tutti gli effetti, e in cosa per niente?', null, '[]'::jsonb, 2, 'essere_grandi', 'standard', true, 'In what ways do you feel like a proper grown-up, and in what ways not at all?', null, '[]'::jsonb),
  ('scopritevi-024', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è una decisione piccola, presa anni fa quasi per caso, senza la quale oggi la tua vita non sarebbe la stessa?', null, '[]'::jsonb, 3, 'scelta_decisiva', 'deep', false, 'What’s a small decision you made years ago, almost by chance, without which your life wouldn’t be the same today?', null, '[]'::jsonb),
  ('scopritevi-025', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale tua abitudine sembra pigrizia, ma in realtà è un sistema perfetto?', null, '[]'::jsonb, 1, 'pigrizia_apparente', 'light', false, 'Which of your habits looks like laziness but is actually a flawless system?', null, '[]'::jsonb),
  ('scopritevi-026', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Quando vorresti un po’ di attenzione ma non ti va di chiederla, cosa fai?', null, '["Sospiro un po’ più forte del solito","Ronzo nei paraggi facendo finta di niente","Mando messaggi o cose da guardare","Alla fine lo dico e basta"]'::jsonb, 2, 'chiedere_attenzioni', 'standard', false, 'When you want some attention but don’t feel like asking for it, what do you do?', null, '["Sigh a little louder than usual","Hover nearby, acting casual","Send random messages and things to look at","Eventually just say it"]'::jsonb),
  ('scopritevi-027', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Cosa ti fa venire gli occhi lucidi ogni volta, anche se non lo ammetteresti volentieri?', null, '[]'::jsonb, 2, 'occhi_lucidi', 'standard', false, 'What makes your eyes well up every single time, even if you’d rather not admit it?', null, '[]'::jsonb),
  ('scopritevi-028', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'In cosa pretendi da te più di quanto pretenderesti da chiunque altro?', null, '[]'::jsonb, 3, 'asticella_alta', 'deep', true, 'Where do you expect more of yourself than you’d ever expect of anyone else?', null, '[]'::jsonb),
  ('scopritevi-029', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è la cosa più strana che c’è nelle note del tuo telefono o nei tuoi quaderni?', null, '[]'::jsonb, 1, 'note_del_telefono', 'light', false, 'What’s the weirdest thing in the notes on your phone or in your notebooks?', null, '[]'::jsonb),
  ('scopritevi-030', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Che tipo di nostalgia ti prende più spesso?', null, '["Per i posti in cui ho vissuto","Per persone che vedo meno di prima","Per una vecchia versione di me","Per epoche che non ho mai vissuto"]'::jsonb, 2, 'nostalgia', 'standard', false, 'What kind of nostalgia hits you most often?', null, '["For places I’ve lived","For people I see less than I used to","For an older version of me","For eras I never even lived through"]'::jsonb),
  ('scopritevi-031', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è un pezzo della tua vita prima di noi che vorresti farmi vedere almeno una volta: un posto, una persona, un’abitudine?', null, '[]'::jsonb, 2, 'vita_prima_di_noi', 'standard', false, 'What’s a piece of your life from before us that you’d love me to see at least once: a place, a person, a habit?', null, '[]'::jsonb),
  ('scopritevi-032', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è una cosa di te che ti piace davvero, ma che fai fatica a dire ad alta voce?', null, '[]'::jsonb, 3, 'piacersi', 'deep', true, 'What’s something you really like about yourself but find hard to say out loud?', null, '[]'::jsonb),
  ('scopritevi-033', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è una tua marachella di anni fa che non hai mai confessato a nessuno?', null, '[]'::jsonb, 1, 'marachella', 'light', false, 'What’s a bit of mischief from years ago that you’ve never confessed to a soul?', null, '[]'::jsonb),
  ('scopritevi-034', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Con le persone nuove, quale lato di te tieni nascosto più a lungo?', null, '["Quello buffo e un po’ assurdo","Quello che si commuove facilmente","Quello competitivo","Quello che ha bisogno di conferme"]'::jsonb, 2, 'lato_nascosto', 'standard', false, 'With new people, which side of you do you keep hidden the longest?', null, '["The goofy, slightly absurd side","The side that gets emotional easily","The competitive side","The side that needs reassurance"]'::jsonb),
  ('scopritevi-035', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Se ci fosse una premiazione per i tuoi ultimi dodici mesi, in quale categoria vinceresti?', null, '[]'::jsonb, 2, 'premiazione_personale', 'standard', true, 'If there were an awards night for your last twelve months, which category would you win?', null, '[]'::jsonb),
  ('scopritevi-036', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quand’è stata l’ultima volta in cui hai provato una libertà totale, anche solo per un’ora? Cosa stavi facendo?', null, '[]'::jsonb, 3, 'liberta', 'deep', true, 'When was the last time you felt completely free, even just for an hour? What were you doing?', null, '[]'::jsonb),
  ('scopritevi-037', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è un torto piccolissimo che ancora oggi non hai digerito? Tipo l’ultimo biscotto mangiato da qualcun altro o un libro prestato e mai tornato.', null, '[]'::jsonb, 1, 'torto_mai_digerito', 'light', false, 'What’s a tiny injustice you still haven’t gotten over? Like someone else eating the last cookie, or a book you lent that never came back.', null, '[]'::jsonb),
  ('scopritevi-038', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Quando scopri qualcosa che ti piace tantissimo, una canzone, un libro, un posto, cosa ne fai?', null, '["Lo consumo fino alla nausea","Lo centellino per farlo durare","Lo faccio scoprire a tutti","Me lo tengo stretto, come un segreto"]'::jsonb, 2, 'cose_che_ami', 'standard', false, 'When you discover something you absolutely love, a song, a book, a place, what do you do with it?', null, '["Wear it out until I’m sick of it","Ration it so it lasts","Get everyone else hooked on it","Keep it close, like a secret"]'::jsonb),
  ('scopritevi-039', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'C’è un consiglio che ti hanno dato anni fa, che allora ti sembrava assurdo e che oggi invece capisci?', null, '[]'::jsonb, 2, 'consiglio_rivalutato', 'standard', false, 'Is there a piece of advice you got years ago that sounded absurd back then but makes sense to you now?', null, '[]'::jsonb),
  ('scopritevi-040', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Tra queste cose, quale ti costa più fatica chiedere, anche a chi ti vuole bene?', null, '["Una mano, anche quando mi serve davvero","Del tempo tutto per me","Una conferma, quando dubito di me","Qualcuno che mi ascolti, senza consigli"]'::jsonb, 3, 'difficile_da_chiedere', 'deep', false, 'Which of these do you find hardest to ask for, even from people who love you?', null, '["Help, even when I really need it","Time just for me","Reassurance, when I doubt myself","Someone to just listen, no advice"]'::jsonb),
  ('scopritevi-041', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Che rito hai per i nuovi inizi, tipo un quaderno nuovo, una pulizia generale o una lista di propositi?', null, '[]'::jsonb, 2, 'nuovi_inizi', 'standard', false, 'What’s your ritual for fresh starts, like a new notebook, a big clear-out or a list of resolutions?', null, '[]'::jsonb),
  ('scopritevi-042', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Se la persona che eri a diciott’anni ti vedesse oggi, cosa la stupirebbe di più?', null, '[]'::jsonb, 3, 'te_a_diciotto_anni', 'deep', true, 'If the person you were at eighteen could see you today, what would surprise them most?', null, '[]'::jsonb),
  ('ridete-011', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Qual è la cosa più ridicola che hai fatto per fare colpo su di me, e che forse non ho nemmeno notato?', null, '[]'::jsonb, 2, 'fare_colpo', 'standard', false, 'What’s the most ridiculous thing you did to impress me that I may not have even noticed?', null, '[]'::jsonb),
  ('ridete-012', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Chi di noi esce a comprare il pane e torna con l’iscrizione a un corso di giocoleria?', null, '["{francesco}","{beatrice}","Noi due: ci vediamo a lezione"]'::jsonb, 1, 'pane_e_giocoleria', 'light', false, 'Which of us heads out for bread and comes back signed up for juggling classes?', null, '["{francesco}","{beatrice}","Both of us: see you in class"]'::jsonb),
  ('ridete-013', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Quando racconti una storia, qual è il tuo stile inconfondibile?', null, '["Parto dalla fine e torno indietro","Aggiungo dettagli inutili ma bellissimi","Faccio tutte le voci dei personaggi","Rido prima di arrivare al punto"]'::jsonb, 1, 'raccontare_storie', 'light', false, 'When you tell a story, what’s your signature style?', null, '["I start at the end and work backwards","I add useless but beautiful details","I do all the characters’ voices","I laugh before I get to the point"]'::jsonb),
  ('ridete-014', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Una mia copia perfetta prende il mio posto per un giorno. Da quale dettaglio capisci subito che non sono io?', null, '[]'::jsonb, 1, 'copia_perfetta', 'light', false, 'A perfect double of me takes my place for a day. What detail instantly tells you it’s not me?', null, '[]'::jsonb),
  ('ridete-015', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Al ristorante ci portano i piatti e ci augurano «Buon appetito». Chi di noi risponde «Grazie, altrettanto!»?', null, '["{francesco}","{beatrice}","Noi due, in coro"]'::jsonb, 1, 'grazie_altrettanto', 'light', false, 'The server brings our food and says “Enjoy your meal.” Which of us replies “Thanks, you too!”?', null, '["{francesco}","{beatrice}","Both of us, in unison"]'::jsonb),
  ('ridete-016', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Un quotidiano ci dedica la prima pagina per una cosa minuscola che abbiamo fatto, raccontata come un evento storico. Qual è il titolo?', null, '[]'::jsonb, 1, 'prima_pagina', 'light', false, 'A newspaper puts us on the front page for something tiny we did, reported like a historic event. What’s the headline?', null, '[]'::jsonb),
  ('ridete-017', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Ci serve un segnale segreto per dirci «Andiamo via» a una festa. Quale proponi?', null, '["Una parola in codice, tipo «carciofo»","Uno sguardo che capisci solo tu","Uno sbadiglio molto teatrale","Annuncio che andiamo, poi saluto tutti per un’ora"]'::jsonb, 1, 'segnale_segreto', 'light', false, 'We need a secret signal that means “let’s go” at a party. What do you suggest?', null, '["A code word, like “artichoke”","A look only you understand","A very theatrical yawn","I announce we’re leaving, then say goodbye for an hour"]'::jsonb),
  ('ridete-018', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Medaglia d’oro nella disciplina «ultimo pezzo lasciato nel piatto per educazione»: chi di noi la vince?', null, '["{francesco}","{beatrice}","Pari: il pezzo è ancora lì"]'::jsonb, 1, 'ultimo_pezzo', 'light', false, 'Gold medal in the event “last bite left on the plate out of politeness”: which of us takes it home?', null, '["{francesco}","{beatrice}","A tie: the last bite is still there"]'::jsonb),
  ('ridete-019', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Quale record mondiale potremmo battere insieme senza nemmeno allenarci?', null, '[]'::jsonb, 1, 'record_mondiale', 'light', false, 'What world record could we break together without even training?', null, '[]'::jsonb),
  ('ridete-020', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Ti chiama un numero sconosciuto. Cosa fai?', null, '["Lo guardo squillare, immobile","Rispondo con la mia voce più ufficiale","Lo cerco su internet prima di decidere","Rispondo e finisco a chiacchierare mezz’ora"]'::jsonb, 1, 'numero_sconosciuto', 'light', false, 'An unknown number is calling you. What do you do?', null, '["I watch it ring, frozen","I answer in my most official voice","I look it up online before deciding","I answer and end up chatting for half an hour"]'::jsonb),
  ('ridete-021', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Quando suona la sveglia, chi di noi avvia trattative degne di un vertice internazionale?', null, '["{francesco}","{beatrice}","Pari: la sveglia ormai si arrende"]'::jsonb, 1, 'trattative_con_la_sveglia', 'light', false, 'When the alarm goes off, which of us opens negotiations worthy of an international summit?', null, '["{francesco}","{beatrice}","A tie: the alarm has given up on us"]'::jsonb),
  ('ridete-022', 1, 'ridete', 'curated', 'reciprocal', 'open', 'C’è una festa in maschera e ce ne ricordiamo un’ora prima. Da cosa ci travestiamo, con quello che abbiamo sotto mano?', null, '[]'::jsonb, 1, 'festa_in_maschera', 'light', false, 'There’s a costume party and we only remember an hour before. What do we go as, using whatever we have on hand?', null, '[]'::jsonb),
  ('ridete-023', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Tra mille anni degli archeologi trovano la nostra chat. Quale messaggio cercano di decifrare per decenni?', null, '[]'::jsonb, 1, 'archeologi_della_chat', 'light', false, 'A thousand years from now, archaeologists find our chat. Which message do they spend decades trying to decipher?', null, '[]'::jsonb),
  ('ridete-024', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Chi di noi risponderebbe con entusiasmo a un saluto che in realtà era per qualcun altro?', null, '["{francesco}","{beatrice}","Insieme, e con grande convinzione"]'::jsonb, 1, 'saluto_frainteso', 'light', false, 'Which of us would enthusiastically wave back at someone who was actually waving at someone else?', null, '["{francesco}","{beatrice}","Together, with total conviction"]'::jsonb),
  ('ridete-025', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'In un negozio parte una canzone che conosci a memoria. Cosa fai?', null, '["Canto sottovoce, ma non troppo","Ballo con le spalle e faccio finta di niente","Lo annuncio: «Questa la conosco!»","Niente, ma poi la canto per tre giorni"]'::jsonb, 1, 'canzone_nel_negozio', 'light', false, 'A song you know by heart comes on in a store. What do you do?', null, '["I sing under my breath, just not very quietly","I dance with my shoulders and act natural","I announce it: “I know this one!”","Nothing, then I sing it for three days straight"]'::jsonb),
  ('ridete-026', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Diventiamo due pupazzetti da collezione, venduti in coppia. Quale accessorio inutile ma indispensabile c’è nella confezione?', null, '[]'::jsonb, 1, 'pupazzetti_di_noi', 'light', false, 'We become a pair of collectible figurines, sold as a set. What useless but essential accessory comes in the box?', null, '[]'::jsonb),
  ('ridete-027', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Chi di noi tornerebbe da una passeggiata con un sasso «troppo bello per lasciarlo lì»?', null, '["{francesco}","{beatrice}","Noi due: ormai è una collezione"]'::jsonb, 1, 'sasso_troppo_bello', 'light', false, 'Which of us would come back from a walk with a rock that was “too nice to leave there”?', null, '["{francesco}","{beatrice}","Both of us: it’s a collection now"]'::jsonb),
  ('ridete-028', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Ci iscrivono per sbaglio a una gara di ballo di coppia e non possiamo ritirarci. Qual è la nostra strategia?', null, '[]'::jsonb, 1, 'gara_di_ballo', 'light', false, 'We get signed up for a couples dance competition by mistake, and we can’t back out. What’s our strategy?', null, '[]'::jsonb),
  ('ridete-029', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Quando un oggetto si rifiuta di funzionare, qual è la tua tecnica?', null, '["Gli parlo con dolcezza","Spengo e riaccendo, con fiducia","Leggo le istruzioni, per la prima volta","Lo passo a te e mi allontano piano"]'::jsonb, 1, 'oggetti_ribelli', 'light', false, 'When something refuses to work, what’s your technique?', null, '["I sweet-talk it","Off and on again, full of hope","I read the manual, for the very first time","I hand it to you and slowly back away"]'::jsonb),
  ('ridete-030', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'In visita a casa di amici, chi di noi passerebbe tutto il tempo a chiacchierare con il loro cane?', null, '["{francesco}","{beatrice}","Insieme, ovviamente"]'::jsonb, 1, 'cane_degli_amici', 'light', false, 'When we visit friends, which of us spends the whole time chatting with their dog?', null, '["{francesco}","{beatrice}","Together, obviously"]'::jsonb),
  ('ridete-031', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Ci scelgono come testimonial di un prodotto noiosissimo. Quale prodotto, e qual è il nostro slogan?', null, '[]'::jsonb, 1, 'pubblicita_noiosa', 'light', false, 'We get picked to star in an ad for an incredibly boring product. What’s the product, and what’s our slogan?', null, '[]'::jsonb),
  ('ridete-032', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Se avessimo un ufficio oggetti smarriti tutto nostro, cosa ci sarebbe sullo scaffale più pieno?', null, '[]'::jsonb, 1, 'oggetti_smarriti', 'light', false, 'If we had a lost and found all our own, what would be on the most crowded shelf?', null, '[]'::jsonb),
  ('ridete-033', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Facciamo un viaggio nel tempo. Chi di noi cambierebbe la storia in cinque minuti, toccando l’unica cosa da non toccare?', null, '["{francesco}","{beatrice}","Noi due: la storia non ha scampo"]'::jsonb, 1, 'viaggio_nel_tempo', 'light', false, 'We travel back in time. Which of us changes history within five minutes by touching the one thing nobody should touch?', null, '["{francesco}","{beatrice}","Both of us: history doesn’t stand a chance"]'::jsonb),
  ('ridete-034', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Quando mi scrivi «Arrivo!», cosa significa davvero?', null, '["Sto davvero arrivando","Sto per uscire, più o meno","Sono in pigiama, ma col pensiero sono già lì","Arrivo, nel senso di tra venti minuti"]'::jsonb, 1, 'arrivo_tra_poco', 'light', false, 'When you text me “On my way!”, what does it really mean?', null, '["I’m genuinely on my way","I’m about to leave, more or less","I’m in pajamas, but there in spirit","On my way, as in twenty minutes from now"]'::jsonb),
  ('ridete-035', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Per un giorno intero possiamo parlarci solo in rima. Come mi dai la buonanotte?', null, '[]'::jsonb, 1, 'parlare_in_rima', 'light', false, 'For one whole day we can only talk to each other in rhyme. How do you say goodnight to me?', null, '[]'::jsonb),
  ('ridete-036', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'A metà di un gioco da tavolo, chi di noi tirerebbe fuori una regola nuova giurando che c’era da sempre?', null, '["{francesco}","{beatrice}","Ce la giochiamo"]'::jsonb, 1, 'gioco_da_tavolo', 'light', false, 'Halfway through a board game, which of us would pull out a brand-new rule and swear it was always there?', null, '["{francesco}","{beatrice}","We’d have to roll for it"]'::jsonb),
  ('ridete-037', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Un’agenzia di viaggi vende una nostra serata qualunque come pacchetto di lusso. Cosa c’è scritto nella descrizione?', null, '[]'::jsonb, 1, 'pacchetto_di_lusso', 'light', false, 'A travel agency is selling one of our ordinary evenings as a luxury package. What does the description say?', null, '[]'::jsonb),
  ('ridete-038', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Che verso fai quando ti lasci cadere sul divano dopo una giornata piena?', null, '["Un sospiro da film","Un «aaah» da pubblicità","Un lamento da porta che cigola","Silenzio assoluto: mi spengo e basta"]'::jsonb, 1, 'verso_sul_divano', 'light', false, 'What noise do you make when you flop onto the couch after a busy day?', null, '["A movie-worthy sigh","A commercial-style “aaah”","A creaky-door groan","Total silence: I just power down"]'::jsonb),
  ('ridete-039', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Chi di noi si addormenterebbe a metà del film che ha tanto insistito per vedere?', null, '["{francesco}","{beatrice}","Noi due, prima dei titoli di testa"]'::jsonb, 1, 'pisolino_davanti_al_film', 'light', false, 'Which of us would fall asleep halfway through the movie they begged to watch?', null, '["{francesco}","{beatrice}","Both of us, before the opening credits"]'::jsonb),
  ('ridete-040', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Ci chiedono di organizzare la festa per i cento anni di una tartaruga. Qual è il tema, e cosa c’è sulla torta?', null, '[]'::jsonb, 1, 'tartaruga_centenaria', 'light', false, 'We’re asked to throw a hundredth birthday party for a tortoise. What’s the theme, and what’s on the cake?', null, '[]'::jsonb),
  ('confrontatevi-011', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Arriva il tuo compleanno. Cosa speri davvero che succeda?', null, '["Una festa con tutte le persone care","Una giornata intera, solo noi due","Un giorno normale, con una sorpresa dentro","Che passi senza troppo rumore"]'::jsonb, 1, 'compleanno_ideale', 'light', false, 'Your birthday is coming up. What are you really hoping for?', null, '["A party with everyone I love","A whole day, just the two of us","An ordinary day with a surprise tucked inside","For it to slip by quietly"]'::jsonb),
  ('confrontatevi-012', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Ci consegnano una lettera che racconta come saremo tra vent’anni. Cosa ne fai?', null, '["La apro subito, non resisto","Leggo solo l’ultima riga","La tengo chiusa per un giorno difficile","La strappo: voglio scoprirlo vivendo"]'::jsonb, 3, 'lettera_dal_futuro', 'deep', false, 'Someone hands us a letter describing who we’ll be in twenty years. What do you do with it?', null, '["Open it right away, I can’t resist","Read only the last line","Keep it sealed for a hard day","Tear it up: I want to find out by living it"]'::jsonb),
  ('confrontatevi-013', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quando ti serve una mano, quanto ci metti a chiedermela?', null, '["Te la chiedo subito, senza problemi","Prima ci provo in tutti i modi","Aspetto che te ne accorga","Te lo faccio capire con un sospiro"]'::jsonb, 2, 'chiedere_una_mano', 'standard', false, 'When you need a hand, how long does it take you to ask me?', null, '["I ask right away, no problem","First I try every other way","I wait for you to notice","I let a loud sigh do the asking"]'::jsonb),
  ('confrontatevi-014', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Per un mese possiamo scambiarci una capacità: tu prendi una delle mie, io una delle tue. Quale mi chiedi in prestito?', null, '[]'::jsonb, 1, 'capacita_in_prestito', 'light', false, 'For one month we can swap skills: you borrow one of mine, I borrow one of yours. Which one are you taking?', null, '[]'::jsonb),
  ('confrontatevi-015', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quando non la pensiamo allo stesso modo su qualcosa di importante, cosa conta di più per te?', null, '["Arrivare a una decisione comune","Che tu mi capisca, anche senza cambiare idea","Che nessuno ceda solo per stanchezza","Che restiamo gentili, anche nel pieno"]'::jsonb, 3, 'disaccordi_importanti', 'deep', false, 'When we see something important differently, what matters most to you?', null, '["Reaching a decision together","That you understand me, even if you don’t change your mind","That nobody gives in just because they’re tired","That we stay kind, even in the thick of it"]'::jsonb),
  ('confrontatevi-016', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Per un giorno abbiamo una città intera tutta per noi: niente code, niente orari, nessuno in giro. Cosa facciamo?', null, '["Giriamo un museo senza nessuno davanti","Ceniamo in mezzo alla strada","Balliamo in piazza a tutto volume","Ci sdraiamo in mezzo a un viale a guardare il cielo"]'::jsonb, 1, 'citta_tutta_nostra', 'light', false, 'For one day we have a whole city to ourselves: no lines, no opening hours, nobody around. What do we do?', null, '["Wander a museum with nobody in front of us","Have dinner in the middle of the street","Dance in the square with the music blasting","Lie in the middle of an avenue, watching the sky"]'::jsonb),
  ('confrontatevi-017', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Quale persona della mia vita ti piacerebbe conoscere meglio, e perché?', null, '[]'::jsonb, 2, 'persone_della_mia_vita', 'standard', true, 'Who in my life would you like to get to know better, and why?', null, '[]'::jsonb),
  ('confrontatevi-018', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Ci regalano un viaggio bellissimo, ma si parte stasera. Cosa fai?', null, '["Valigia in dieci minuti, andiamo","Sì, ma prima avviso chi mi aspetta","Solo se torniamo in tempo per i miei impegni","Passo: per me metà del bello è aspettare"]'::jsonb, 2, 'partenza_stasera', 'standard', false, 'Someone gives us an amazing trip, but it leaves tonight. What do you do?', null, '["Bag packed in ten minutes, let’s go","Yes, but first I tell the people expecting me","Only if we’re back in time for my plans","I’ll pass: half the fun is looking forward to it"]'::jsonb),
  ('confrontatevi-019', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Se ti preparo una sorpresa, quanto vuoi sapere prima?', null, '["Niente, nemmeno che esiste","Solo cosa mettermi","Il giorno, per pregustarla","Qualche indizio, per provare a indovinare"]'::jsonb, 1, 'sorpresa_quanto_sapere', 'light', false, 'If I plan a surprise for you, how much do you want to know beforehand?', null, '["Nothing, not even that it exists","Just what to wear","The date, so I can look forward to it","A few clues, so I can try to guess"]'::jsonb),
  ('confrontatevi-020', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Ci propongono un patto: per un anno avremo la metà delle cose che abbiamo, ma il doppio del tempo libero. Accetti?', null, '["Subito: le cose mi pesano","Sì, ma tengo le mie cose del cuore","Proviamo un mese, poi decido","No, le mie cose mi fanno sentire a casa"]'::jsonb, 2, 'meta_cose_doppio_tempo', 'standard', false, 'We’re offered a deal: for one year we’d have half the stuff we own, but twice the free time. Do you take it?', null, '["In a heartbeat: stuff weighs me down","Yes, but I’m keeping the things I love","Let’s try a month, then I’ll decide","No, my things make me feel at home"]'::jsonb),
  ('confrontatevi-021', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'In cosa ci aiutiamo già benissimo, e in cosa ti piacerebbe che ci aiutassimo di più?', null, '[]'::jsonb, 3, 'aiutarsi_a_vicenda', 'deep', true, 'What do we already help each other with brilliantly, and where would you like us to help each other more?', null, '[]'::jsonb),
  ('confrontatevi-022', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Nella nostra vita arriva un’amicizia nuova, in comune. Che tipo di persona speri che sia?', null, '["Qualcuno che ci trascina in avventure","Qualcuno che ci invita sempre a cena","Qualcuno più grande, con mille storie","Qualcuno che ci prende in giro con affetto"]'::jsonb, 2, 'amicizia_nuova', 'standard', false, 'A new friend comes into our lives, one we share. What kind of person do you hope they are?', null, '["Someone who drags us into adventures","Someone who always has us over for dinner","Someone older, with a thousand stories","Someone who teases us, lovingly"]'::jsonb),
  ('confrontatevi-023', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Per te, cosa vuol dire davvero passare del tempo insieme?', null, '["Fare la stessa cosa, fianco a fianco","Fare cose diverse nella stessa stanza","Parlare, anche di niente","Uscire a scoprire qualcosa di nuovo"]'::jsonb, 2, 'stare_insieme_davvero', 'standard', false, 'To you, what does spending time together really mean?', null, '["Doing the same thing, side by side","Doing different things in the same room","Talking, even about nothing","Going out to discover something new"]'::jsonb),
  ('confrontatevi-024', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Ci regalano un ottavo giorno della settimana, solo per noi. Come lo chiamiamo, e cosa ci facciamo?', null, '[]'::jsonb, 1, 'ottavo_giorno', 'light', false, 'We’re given an eighth day of the week, just for us. What do we call it, and what do we do with it?', null, '[]'::jsonb),
  ('confrontatevi-025', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quale di queste frasi ti costa di più dirmi ad alta voce?', null, '["«Scusa»","«Avevi ragione»","«Ho bisogno di te»","«Mi manchi»"]'::jsonb, 3, 'frasi_difficili', 'deep', false, 'Which of these is hardest for you to say to me out loud?', null, '["“I’m sorry”","“You were right”","“I need you”","“I miss you”"]'::jsonb),
  ('confrontatevi-026', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Per un mese, tutte le piccole scelte di coppia, da dove mangiare a cosa guardare, si decidono con un solo metodo. Quale scegli?', null, '["Decide chi ci tiene di più","Rigorosamente a turno","Testa o croce, senza appello","Si discute finché non siamo d’accordo"]'::jsonb, 2, 'metodo_per_decidere', 'standard', false, 'For one month, every small couple decision, from where to eat to what to watch, gets settled one way only. Which do you pick?', null, '["Whoever cares more decides","Strictly taking turns","Heads or tails, no appeals","We talk it out until we agree"]'::jsonb),
  ('confrontatevi-027', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quando ci rivediamo dopo qualche giorno, come vorresti che fosse il primo minuto?', null, '["Un abbraccio lunghissimo, senza parlare","Raccontarci tutto, a raffica","Mangiare subito qualcosa insieme","Un saluto tranquillo, come se fosse ieri"]'::jsonb, 1, 'primo_minuto_insieme', 'light', false, 'When we see each other again after a few days, what should the first minute be like?', null, '["A very long hug, no talking","Telling each other everything at once","Eating something together, right away","A calm hello, as if it were yesterday"]'::jsonb),
  ('confrontatevi-028', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Se ci incontrassimo per la prima volta oggi, cosa vorresti che notassi subito di te?', null, '[]'::jsonb, 2, 'incontrarsi_oggi', 'standard', true, 'If we met for the very first time today, what would you want me to notice about you right away?', null, '[]'::jsonb),
  ('confrontatevi-029', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'C’è una piccola questione su cui non siamo mai d’accordo e su cui, in fondo, non vorresti mai vincere?', null, '[]'::jsonb, 2, 'disaccordo_affettuoso', 'standard', false, 'Is there a small thing we never agree on that, deep down, you’d never actually want to win?', null, '[]'::jsonb),
  ('confrontatevi-030', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Ci regalano una stanza segreta che si apre da qualsiasi porta, ovunque siamo. Cosa diventa?', null, '["Il posto dove ritrovarci ogni sera","Una biblioteca con due poltrone enormi","Un laboratorio per fare cose con le mani","Una stanza vuota, solo per ballare"]'::jsonb, 2, 'stanza_segreta', 'standard', false, 'We’re given a secret room that opens from any door, wherever we are. What does it become?', null, '["The place where we meet up every evening","A library with two enormous armchairs","A workshop for making things by hand","An empty room, just for dancing"]'::jsonb),
  ('confrontatevi-031', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Chi di noi due se ne esce più spesso con un «e se provassimo…»?', null, '["{francesco}","{beatrice}","Noi due, a turno"]'::jsonb, 1, 'chi_propone', 'light', false, 'Which of us is more likely to come out with a “what if we tried…”?', null, '["{francesco}","{beatrice}","We take turns"]'::jsonb),
  ('confrontatevi-032', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Una persona molto saggia ci offre un solo consiglio sulla nostra coppia. Su cosa lo chiedi?', null, '["Su come discutere meglio","Su come non perdere la leggerezza","Su come trovare più tempo per noi","Su come continuare a sorprenderci"]'::jsonb, 3, 'consiglio_saggio', 'deep', false, 'A very wise person offers us one piece of advice about us as a couple. What do you ask about?', null, '["How to argue better","How to keep things light","How to find more time for us","How to keep surprising each other"]'::jsonb),
  ('confrontatevi-033', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Qual è una cosa noiosa che, fatta con me, diventa quasi divertente?', null, '[]'::jsonb, 1, 'noia_condivisa', 'light', false, 'What’s something boring that turns almost fun when you do it with me?', null, '[]'::jsonb),
  ('confrontatevi-034', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Per un anno, quando non siamo insieme, possiamo sentirci in un solo modo. Quale scegli?', null, '["Lettere scritte a mano","Una chiamata ogni sera","Messaggi vocali a qualsiasi ora","Una foto al giorno, senza parole"]'::jsonb, 1, 'un_solo_modo_di_sentirsi', 'light', false, 'For a whole year, whenever we’re not together, we can keep in touch only one way. Which do you pick?', null, '["Handwritten letters","A call every evening","Voice notes at any hour","One photo a day, no words"]'::jsonb),
  ('confrontatevi-035', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'In questo periodo, di cosa avrebbe più bisogno la tua settimana?', null, '["Più tempo con te","Più tempo tutto per me","Più tempo con gli amici","Va bene così com’è"]'::jsonb, 2, 'bisogno_della_settimana', 'standard', false, 'These days, what does your week need more of?', null, '["More time with you","More time just for me","More time with friends","Nothing, it’s good as it is"]'::jsonb),
  ('confrontatevi-036', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Una macchina del tempo porta a cena con noi la versione di te di dieci anni fa. Cosa speri che pensi di noi?', null, '[]'::jsonb, 3, 'te_di_dieci_anni_fa', 'deep', false, 'A time machine brings the you of ten years ago to dinner with us. What do you hope they think of us?', null, '[]'::jsonb),
  ('confrontatevi-037', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Qual è il nostro rito più piccolo, così piccolo che da fuori nessuno lo noterebbe?', null, '[]'::jsonb, 1, 'rito_minuscolo', 'light', false, 'What’s our smallest ritual, so small that nobody looking in would ever notice it?', null, '[]'::jsonb),
  ('confrontatevi-038', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Girano un cortometraggio su di noi: un minuto, senza dialoghi. Cosa speri che si veda?', null, '["Quanto ridiamo, anche di niente","Come ci aiutiamo nelle cose piccole","Come facciamo pace dopo un battibecco","Come ci cerchiamo con lo sguardo"]'::jsonb, 2, 'cortometraggio_muto', 'standard', false, 'Someone makes a short film about us: one minute, no dialogue. What do you hope it shows?', null, '["How much we laugh, even at nothing","How we help each other with the small stuff","How we make up after a squabble","How we look for each other across a room"]'::jsonb),
  ('confrontatevi-039', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Devi prendere una decisione importante che riguarda soprattutto te. Cosa vorresti da me?', null, '["Il tuo parere sincero, subito","Domande che mi aiutino a vederci chiaro","Il tuo appoggio, qualunque cosa scelga","Un po’ di leggerezza mentre ci penso"]'::jsonb, 3, 'decisione_personale', 'deep', false, 'You have to make an important decision that’s mostly about you. What would you want from me?', null, '["Your honest opinion, right away","Questions that help me see clearly","Your support, whatever I choose","A bit of lightness while I think it over"]'::jsonb),
  ('confrontatevi-040', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Se potessi togliere dalla tua settimana un «dovrei» per fare spazio a un «vorrei», quali sarebbero?', null, '[]'::jsonb, 2, 'dovrei_e_vorrei', 'standard', true, 'If you could swap one “I should” in your week for one “I’d love to”, what would they be?', null, '[]'::jsonb),
  ('rivivete-009', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Con quale nome comparivo nel tuo telefono all’inizio, e con quale compaio adesso?', null, '[]'::jsonb, 1, 'nome_in_rubrica', 'light', false, 'What was I saved as in your phone at the start, and what am I saved as now?', null, '[]'::jsonb),
  ('rivivete-010', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è il posto meno adatto in cui abbiamo avuto la ridarella? E chi ha cominciato?', null, '[]'::jsonb, 1, 'ridarella_fuori_luogo', 'light', false, 'What’s the worst possible place we’ve ever had a fit of the giggles? And who started it?', null, '[]'::jsonb),
  ('rivivete-011', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Il primo messaggio tra noi: chi l’ha mandato, e cosa diceva? Riscrivilo come lo ricordi, errori compresi.', null, '[]'::jsonb, 1, 'primo_messaggio', 'light', false, 'The first message between us: who sent it, and what did it say? Write it out as you remember it, typos and all.', null, '[]'::jsonb),
  ('rivivete-012', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Che tempo faceva il giorno del nostro primo incontro, secondo te?', null, '["Un sole da cartolina","Pioggia, ovviamente","Un freddo cane","Non ricordo: guardavo te"]'::jsonb, 1, 'meteo_primo_incontro', 'light', false, 'What was the weather like on the day we first met, as you remember it?', null, '["Postcard-perfect sunshine","Rain, obviously","Freezing cold","No idea: I was looking at you"]'::jsonb),
  ('rivivete-013', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Da dove viene il nomignolo, o la parola buffa, che usiamo più spesso tra noi?', null, '["Da una battuta","Da un errore di battitura","Da un momento tenero","Chissà: c’è da sempre"]'::jsonb, 1, 'origine_nomignolo', 'light', false, 'Where does the nickname, or silly word, we use most with each other come from?', null, '["A joke","A typo","A tender moment","Who knows: it’s always been there"]'::jsonb),
  ('rivivete-014', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Quando raccontiamo insieme un nostro ricordo, tu che parte fai?', null, '["Racconto io, con gli effetti speciali","Lascio parlare te e correggo i dettagli","Aggiungo ogni volta un particolare nuovo","Mi godo la tua versione"]'::jsonb, 1, 'racconto_a_due_voci', 'light', false, 'When we tell one of our stories together, what part do you play?', null, '["I tell it, with special effects","I let you talk and fix the details","I add a new detail every time","I sit back and enjoy your version"]'::jsonb),
  ('rivivete-015', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'All’inizio, chi di noi allungava di più i saluti?', null, '["{francesco}","{beatrice}","Pari: i nostri saluti non finivano mai"]'::jsonb, 1, 'saluti_infiniti', 'light', false, 'Back at the start, which of us dragged out our goodbyes the most?', null, '["{francesco}","{beatrice}","A tie: our goodbyes never ended"]'::jsonb),
  ('rivivete-016', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Racconta in tre righe l’inizio della nostra storia, nella tua versione ufficiale.', null, '[]'::jsonb, 2, 'versione_ufficiale', 'standard', true, 'In three lines, tell how our story began: your official version.', null, '[]'::jsonb),
  ('rivivete-017', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Ricordi una volta in cui abbiamo capito due cose diverse dalla stessa frase? Cosa avevi capito tu?', null, '[]'::jsonb, 2, 'equivoco_nostro', 'standard', false, 'Remember a time the same sentence meant two different things to us? What did you think it meant?', null, '[]'::jsonb),
  ('rivivete-018', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'C’è una nostra abitudine cominciata per puro caso? Racconta la prima volta: dove eravamo e chi ha fatto cosa.', null, '[]'::jsonb, 2, 'abitudine_per_caso', 'standard', false, 'Is there a habit of ours that started by pure chance? Tell the story of the first time: where we were and who did what.', null, '[]'::jsonb),
  ('rivivete-019', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è un piccolo salvataggio tra noi che ricordi bene? Chi ha salvato chi, e da cosa?', null, '[]'::jsonb, 2, 'piccolo_salvataggio', 'standard', false, 'What’s a small rescue between us that you remember well? Who saved who, and from what?', null, '[]'::jsonb),
  ('rivivete-020', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Pensa a un nostro saluto che ricordi bene, alla fine di una serata o su un binario. Cosa hai fatto nei cinque minuti dopo?', null, '[]'::jsonb, 2, 'dopo_il_saluto', 'standard', false, 'Think of a goodbye between us that you remember well, at the end of an evening or on a train platform. What did you do in the five minutes after?', null, '[]'::jsonb),
  ('rivivete-021', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è l’ultima «prima volta» che abbiamo vissuto insieme, anche piccolissima?', null, '[]'::jsonb, 2, 'ultima_prima_volta', 'standard', true, 'What’s the most recent “first time” we’ve shared, even a tiny one?', null, '[]'::jsonb),
  ('rivivete-022', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Cosa stavi facendo un’ora prima del nostro primo incontro? Se non lo ricordi, inventa: basta che sia credibile.', null, '[]'::jsonb, 2, 'un_ora_prima', 'standard', false, 'What were you doing an hour before we first met? If you don’t remember, make it up, as long as it’s believable.', null, '[]'::jsonb),
  ('rivivete-023', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è un’attesa tra noi rimasta negli annali, un ritardo o una risposta che non arrivava? Racconta quei minuti come li hai vissuti tu.', null, '[]'::jsonb, 2, 'attesa_memorabile', 'standard', false, 'What’s a wait between us that went down in history, someone running late or a reply that wouldn’t come? Tell me about those minutes from your side.', null, '[]'::jsonb),
  ('rivivete-024', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Quando ripensi a un momento nostro, cosa ti torna in mente per prima cosa?', null, '["Le frasi esatte","Il posto e la luce","Odori e suoni","Quello che provavo"]'::jsonb, 2, 'come_ricordi', 'standard', false, 'When you think back to a moment of ours, what comes back to you first?', null, '["The exact words","The place and the light","Smells and sounds","What I was feeling"]'::jsonb),
  ('rivivete-025', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'In quale momento hai sentito per la prima volta di poterti fidare di me fino in fondo? Cosa avevo fatto o detto?', null, '[]'::jsonb, 3, 'prima_fiducia', 'deep', false, 'When did you first feel you could trust me all the way? What had I done or said?', null, '[]'::jsonb),
  ('rivivete-026', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Ricordi un momento in cui hai provato orgoglio per me? Cosa stavo facendo?', null, '[]'::jsonb, 3, 'orgoglio_per_te', 'deep', false, 'Remember a moment when you felt proud of me? What was I doing?', null, '[]'::jsonb),
  ('rivivete-027', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale ricordo nostro ti dà coraggio quando ne hai bisogno?', null, '[]'::jsonb, 3, 'ricordo_coraggio', 'deep', true, 'Which memory of ours gives you courage when you need it?', null, '[]'::jsonb),
  ('rivivete-028', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'C’è un momento nostro che, secondo te, io ho vissuto in modo molto diverso da te?', null, '[]'::jsonb, 3, 'vissuto_diverso', 'deep', false, 'Is there a moment of ours that you think I experienced very differently from you?', null, '[]'::jsonb)
on conflict (id) do nothing;

-- Game V2 catalog: 8 new Italian wordings (same id, version + 1, only when the text changes).
update public.game_v2_catalog as c
set question_text = coalesce(v.question_text, c.question_text), predict_text = coalesce(v.predict_text, c.predict_text),
    options = coalesce(v.options, c.options), version = c.version + 1
from (values
  ('ridete-001', 'Dobbiamo aprire un ristorante insieme. Chi di noi si farebbe licenziare prima, e perché?', null, null::jsonb),
  ('ridete-003', 'Siamo in una stanza della fuga e mancano due minuti. Chi di noi sta già dando la colpa al resto della squadra?', null, '["{francesco}","{beatrice}","Noi due, a turno"]'::jsonb),
  ('ridete-005', 'Naufraghiamo su un’isola deserta. Chi di noi sopravvive più a lungo, e solo per testardaggine?', null, '["{francesco}","{beatrice}","Pari: litighiamo per l’unica noce di cocco"]'::jsonb),
  ('ridete-008', 'Se dovessimo organizzarci a vicenda una festa a sorpresa, chi di noi si farebbe scoprire prima?', null, '["{francesco}","{beatrice}","Impossibile: siamo spie perfette"]'::jsonb),
  ('confrontatevi-002', 'Abbiamo tre giorni completamente liberi: preferiresti scoprire un posto che non conosciamo ancora o tornare in un posto che per noi significa già qualcosa?', null, '["Un posto nuovo","Un posto che è già nostro"]'::jsonb),
  ('confrontatevi-008', 'Quando arrivi a sera senza energie, cosa dovrei fare io?', null, null::jsonb),
  ('e_se-006', 'Per un mese intero possiamo darci una sola regola nuova. Quale scegli?', null, '["Niente telefoni quando siamo insieme","Una sera a settimana decide chi è di turno","Un messaggio di buongiorno, sempre","Una cosa nuova ogni weekend"]'::jsonb),
  ('rivivete-007', null, null, '["L’emozione di ogni messaggio","Non sapere ancora tutto di te","Il tempo che sembrava infinito","Niente: preferisco noi adesso"]'::jsonb)
) as v(id, question_text, predict_text, options)
where c.id = v.id
  and (c.question_text, c.predict_text, c.options) is distinct from (coalesce(v.question_text, c.question_text), coalesce(v.predict_text, c.predict_text), coalesce(v.options, c.options));

-- Game V2 catalog: English for the 62 existing prompts.
update public.game_v2_catalog as c
set question_text_en = v.question_text_en, predict_text_en = v.predict_text_en, options_en = v.options_en
from (values
  ('quanto_mi_conosci-001', 'After a rough day, what do you really want from me in the first ten minutes?', 'After a rough day, what does {subject} really want from you in the first ten minutes?', '["A hug, no questions asked","To vent while you listen","A little silence and space","Something to take my mind off it"]'::jsonb),
  ('quanto_mi_conosci-002', 'If you had a free afternoon all to yourself, how would you really spend it?', 'If {subject} had a free afternoon all to themselves, how would they really spend it?', '["Sleeping with no alarm","Walking with nowhere to go","Picking up a passion I set aside","Seeing someone I haven’t seen in ages"]'::jsonb),
  ('quanto_mi_conosci-003', 'What do you find hardest about receiving a gift?', 'What does {subject} find hardest about receiving a gift?', '["Opening it in front of everyone","Not knowing how to return the favor","Showing how much I like it","Nothing, I love gifts"]'::jsonb),
  ('quanto_mi_conosci-004', 'On a trip, which part brings you the most joy?', 'On a trip, which part brings {subject} the most joy?', '["Planning it down to the last detail","The moment of setting off","Getting lost with no plan","Telling the story once I’m back"]'::jsonb),
  ('quanto_mi_conosci-005', 'When something’s worrying you, what’s the first sign people can see?', 'When something’s worrying {subject}, what’s the first sign people can see?', '["I sleep badly","I talk less than usual","I start tidying things up","I joke more than usual"]'::jsonb),
  ('quanto_mi_conosci-006', 'Which of these would you like to hear more often?', 'Which of these would {subject} like to hear more often?', '["“I’ll take care of it”","“How did it really go?”","“I thought of you today”","“Shall we?”"]'::jsonb),
  ('quanto_mi_conosci-007', 'If you could learn one thing from scratch, effortlessly, what would you pick?', 'If {subject} could learn one thing from scratch, effortlessly, what would they pick?', '["Playing an instrument","Speaking a new language","Cooking really well","Drawing or painting"]'::jsonb),
  ('quanto_mi_conosci-008', 'What recharges you most after a full week?', 'What recharges {subject} most after a full week?', '["An evening with friends","A day with no plans","Something physical","A dinner just for the two of us"]'::jsonb),
  ('quanto_mi_conosci-009', 'When you’re angry with me, what would you like me to do first?', 'When {subject} is angry with you, what would they like you to do first?', '["Ask me what happened","Give me a little time","Hug me, even if I resist","Make me laugh"]'::jsonb),
  ('quanto_mi_conosci-010', 'What’s your gut reaction when something unexpected happens?', 'What’s {subject}’s gut reaction when something unexpected happens?', '["Come up with a plan B right away","Get annoyed, then get over it","Ask for help","Treat it like an adventure"]'::jsonb),
  ('quanto_mi_conosci-011', 'What do you need most when you’re about to face something important?', 'What does {subject} need most when they’re about to face something important?', '["To hear that it’ll be fine","To prepare without distractions","To talk it through endlessly","Not to think about it until the last minute"]'::jsonb),
  ('quanto_mi_conosci-012', 'Which compliment do you most enjoy getting?', 'Which compliment does {subject} most enjoy getting?', '["On what I’ve built","On how I treat people","On how I look","On my sense of humor"]'::jsonb),
  ('scopritevi-001', 'Is there something I do for you that I probably think is no big deal, but that means far more to you than I realize?', null, '[]'::jsonb),
  ('scopritevi-002', 'What’s a part of you that you think I’ve only half understood?', null, '[]'::jsonb),
  ('scopritevi-003', 'Is there something you’ve changed your mind about in the last year, where I might still be going by the old version of you?', null, '[]'::jsonb),
  ('scopritevi-004', 'What’s something you’re good at that you feel nobody really notices?', null, '[]'::jsonb),
  ('scopritevi-005', 'Which childhood fear makes you smile now, and which one never quite went away?', null, '[]'::jsonb),
  ('scopritevi-006', 'When you feel truly at home, what’s around you: people, sounds, smells, light?', null, '[]'::jsonb),
  ('scopritevi-007', 'What’s a compliment that stuck with you for years, and who gave it to you?', null, '[]'::jsonb),
  ('scopritevi-008', 'What’s a little habit you have when no one’s watching that you’ve never told me about?', null, '[]'::jsonb),
  ('scopritevi-009', 'At what point in the week do you feel most like yourself, and when do you feel a bit out of place?', null, '[]'::jsonb),
  ('scopritevi-010', 'What’s a question you wish I asked you more often?', null, '[]'::jsonb),
  ('scopritevi-011', 'When you get good news, what’s the first thing you feel like doing?', null, '["Tell someone right away","Keep it to myself for a while","Celebrate it with something tangible","Start thinking about what comes next"]'::jsonb),
  ('scopritevi-012', 'Which of these gestures goes straight to your heart?', null, '["The right word at the right moment","A practical gesture that lightens my day","Phone-free time, just for us","A small but thoughtful surprise"]'::jsonb),
  ('ridete-001', 'We have to open a restaurant together. Which of us would get fired first, and why?', null, '[]'::jsonb),
  ('ridete-002', 'We have to go on a reality show together. What would our first on-camera argument be about?', null, '[]'::jsonb),
  ('ridete-003', 'We’re in an escape room with two minutes left. Which of us is already blaming the rest of the team?', null, '["{francesco}","{beatrice}","Both of us, taking turns"]'::jsonb),
  ('ridete-004', 'If our story became a movie, what would the tagline on the poster be?', null, '[]'::jsonb),
  ('ridete-005', 'We’re shipwrecked on a desert island. Which of us survives the longest, purely out of stubbornness?', null, '["{francesco}","{beatrice}","A tie: we’re fighting over the only coconut"]'::jsonb),
  ('ridete-006', 'What’s the smallest, most absurd thing you’ve ever seen me take way too seriously?', null, '[]'::jsonb),
  ('ridete-007', 'We’re starting a band. What’s it called, and what’s the title of our first album?', null, '[]'::jsonb),
  ('ridete-008', 'If we had to throw each other a surprise party, which of us would get caught first?', null, '["{francesco}","{beatrice}","Impossible: we’re perfect spies"]'::jsonb),
  ('ridete-009', 'A wildlife documentary narrates my morning routine. What does the narrator say?', null, '[]'::jsonb),
  ('ridete-010', 'We end up in a city we don’t know, with no phone and no money. What’s your first instinct?', null, '["Ask the first friendly face for help","Walk until something looks familiar","Turn it into an adventure right away","Sit down and wait for you to sort it out"]'::jsonb),
  ('confrontatevi-001', 'If we had a completely free Sunday with nothing planned, what would you really want us to do?', null, '["Not leave the house until evening","Head off early somewhere new","Cook something long and complicated","See people and get home late"]'::jsonb),
  ('confrontatevi-002', 'We have three completely free days: would you rather discover a place we don’t know yet, or go back to one that already means something to us?', null, '["Somewhere new","A place that’s already ours"]'::jsonb),
  ('confrontatevi-003', 'If we could protect just one of our habits, even through a really busy stretch, which one would you choose?', null, '[]'::jsonb),
  ('confrontatevi-004', 'After an argument, what really helps you feel close again?', null, '["Talking it through right away, even if it’s uncomfortable","A bit of space, then talking","A gesture before any words","Laughing at something and starting over"]'::jsonb),
  ('confrontatevi-005', 'Someone treats us to a surprise evening. What do you hope they’ve picked for us?', null, '["Something we’ve never done","Our usual place","Something simple, done beautifully"]'::jsonb),
  ('confrontatevi-006', 'What makes an ordinary day together special for you?', null, '[]'::jsonb),
  ('confrontatevi-007', 'If we could live in another city for a year, what would you look for first?', null, '["Nature right on the doorstep","A city that stays up late","A slow place where you get to know everyone","Anywhere, as long as the pace changes"]'::jsonb),
  ('confrontatevi-008', 'When you reach the evening with no energy left, what should I do?', null, '["Take charge of the evening without asking","Ask what’s really needed","Leave room for space and quiet","Take us out somewhere for a change of scene"]'::jsonb),
  ('confrontatevi-009', 'Which gift moves you more: the one you’ve wanted for ages, or the one you’d never have thought of?', null, '["The one I’d wanted for ages","The one I’d never thought of"]'::jsonb),
  ('confrontatevi-010', 'Ten years from now, what would you want to still be exactly the same between us?', null, '[]'::jsonb),
  ('e_se-001', 'We have a free weekend but can only pick one thing: finally do something we’ve been putting off for months, or leave with barely any plan. Which do you choose?', null, '["The thing we’ve put off for months","Leave with no plan"]'::jsonb),
  ('e_se-002', 'If we could live for six months somewhere we don’t know a soul, what do you hope we’d discover about ourselves?', null, '[]'::jsonb),
  ('e_se-003', 'If we looked back a year from now, what small thing would you want us to have started doing today?', null, '[]'::jsonb),
  ('e_se-004', 'A sum of money lands in our lap, enough for one big change. Which do you choose?', null, '["A different home","A sabbatical year together","A project all our own","Put it aside and sleep easy"]'::jsonb),
  ('e_se-005', 'If you could ask the two of us twenty years from now just one question, what would you ask?', null, '[]'::jsonb),
  ('e_se-006', 'For a whole month we can set ourselves just one new rule. Which do you pick?', null, '["No phones when we’re together","One night a week, whoever’s turn it is decides","A good-morning message, always","Something new every weekend"]'::jsonb),
  ('e_se-007', 'If we wrote down three things to do together before the end of the year, what’s the first one you’d put on the list?', null, '[]'::jsonb),
  ('e_se-008', 'We’re offered the chance to swap everyday lives for a week. How do you take it?', null, '["I’m in, I want to see what it’s like","Only if I get to keep my own bed","I’m writing you an instruction manual","I’m out: your schedule scares me"]'::jsonb),
  ('e_se-009', 'If you could give us one couple superpower, like reading each other’s minds or never arguing about dinner, which would you choose?', null, '[]'::jsonb),
  ('e_se-010', 'Is there a dream you’ve set aside that, if it were only up to the two of us, you’d want to pick back up?', null, '[]'::jsonb),
  ('rivivete-001', 'What’s an ordinary day of ours that you’d happily live again, precisely because there was nothing special about it?', null, '[]'::jsonb),
  ('rivivete-002', 'What’s the first thing about me that stuck with you, before you even really knew me?', null, '[]'::jsonb),
  ('rivivete-003', 'Was there a moment when you realized things between us were getting serious? What were we doing?', null, '[]'::jsonb),
  ('rivivete-004', 'Which of our phrases, inside jokes or made-up words would you use to explain the two of us to someone?', null, '[]'::jsonb),
  ('rivivete-005', 'If you could relive just one evening we’ve spent together, which would you pick, and would you change anything?', null, '[]'::jsonb),
  ('rivivete-006', 'What’s a time I did something you never saw coming from me?', null, '[]'::jsonb),
  ('rivivete-007', 'Thinking back to our beginning, what do you miss most about that time?', null, '["The thrill of every message","Not knowing everything about you yet","Time that seemed endless","Nothing: I like us better now"]'::jsonb),
  ('rivivete-008', 'What’s a place you can no longer see without thinking of us?', null, '[]'::jsonb)
) as v(id, question_text_en, predict_text_en, options_en)
where c.id = v.id
  and (c.question_text_en, c.predict_text_en, c.options_en) is distinct from (v.question_text_en, v.predict_text_en, v.options_en);

-- Swipe V1: 40 new cards, Italian and English.
insert into private.game_swipe_v1_catalog (id, version, question_text, options, topic, active, question_text_en, options_en) values
  ('swipe-033', 1, 'Un mio vocale di cinque minuti: lo ascolti tutto o a velocità doppia?', '["Tutto, con calma","A velocità doppia"]'::jsonb, 'vocali_lunghi', true, 'A five-minute voice note from me: every second or double speed?', '["Every second","Double speed"]'::jsonb),
  ('swipe-034', 1, 'Sul divano: sotto la stessa coperta o due coperte separate?', '["Stessa coperta","Due coperte"]'::jsonb, 'coperta_sul_divano', true, 'On the couch: under the same blanket or two separate ones?', '["Same blanket","Two blankets"]'::jsonb),
  ('swipe-035', 1, 'I nostri messaggi: tante emoji o solo parole?', '["Tante emoji","Solo parole"]'::jsonb, 'emoji_nei_messaggi', true, 'Our texts: lots of emoji or just words?', '["Lots of emoji","Just words"]'::jsonb),
  ('swipe-036', 1, 'In valigia: lo stretto necessario o tutto, perché non si sa mai?', '["Lo stretto necessario","Tutto, non si sa mai"]'::jsonb, 'valigia', true, 'Packing: only the essentials or everything, just in case?', '["Only the essentials","Everything, just in case"]'::jsonb),
  ('swipe-037', 1, 'Quando mi racconti un problema: vuoi una soluzione o solo ascolto?', '["Una soluzione","Solo ascolto"]'::jsonb, 'consigli_o_ascolto', true, 'When you tell me about a problem: want solutions or just an ear?', '["Solutions","Just listen"]'::jsonb),
  ('swipe-038', 1, 'Il dolce a fine cena: uno a testa o uno solo e due cucchiaini?', '["Uno a testa","Due cucchiaini"]'::jsonb, 'dolce_da_dividere', true, 'Dessert after dinner: one each, or one to share with two spoons?', '["One each","Two spoons"]'::jsonb),
  ('swipe-039', 1, 'A fine telefonata: saluto veloce o il classico «chiudi tu», «no, chiudi tu»?', '["Saluto veloce","No, chiudi tu!"]'::jsonb, 'chiudere_la_chiamata', true, 'Ending a call: quick goodbye or a round of “you hang up”, “no, you hang up”?', '["Quick goodbye","“No, you hang up!”"]'::jsonb),
  ('swipe-040', 1, 'Svegliarsi all’alba per vedere sorgere il sole insieme: ci stai?', '["Ci sto","Svegliami a pranzo"]'::jsonb, 'alba_insieme', true, 'Getting up at dawn to watch the sunrise together: are you in?', '["I’m in","Wake me at lunch"]'::jsonb),
  ('swipe-041', 1, 'Fare la spesa insieme: passeggiata tra gli scaffali o missione lampo?', '["Passeggiata","Missione lampo"]'::jsonb, 'spesa_insieme', true, 'Grocery shopping together: a leisurely stroll or a speed run?', '["Leisurely stroll","Speed run"]'::jsonb),
  ('swipe-042', 1, 'Un complimento da me: davanti a tutti o a tu per tu?', '["Davanti a tutti","A tu per tu"]'::jsonb, 'complimenti_in_pubblico', true, 'A compliment from me: in front of everyone or just between us?', '["In front of everyone","Just between us"]'::jsonb),
  ('swipe-043', 1, 'In viaggio: una tenda sotto le stelle o un letto comodo?', '["Tenda e stelle","Letto comodo"]'::jsonb, 'dormire_in_viaggio', true, 'On a trip: a tent under the stars or a comfy bed?', '["Tent and stars","Comfy bed"]'::jsonb),
  ('swipe-044', 1, 'Dopo una giornata intera insieme: ancora noi o un po’ di tempo per te?', '["Ancora noi","Un po’ per me"]'::jsonb, 'dopo_un_giorno_insieme', true, 'After a whole day together: more of us or a little time for you?', '["More of us","Some me-time"]'::jsonb),
  ('swipe-045', 1, 'Un regalo da aprire: strappi la carta o lo scarti con calma?', '["Strappo tutto","Con calma"]'::jsonb, 'scartare_i_regali', true, 'Opening a present: rip the paper off or unwrap it slowly?', '["Rip it open","Nice and slow"]'::jsonb),
  ('swipe-046', 1, 'Un mio messaggio a metà giornata: meglio dolce o scemo?', '["Qualcosa di dolce","Qualcosa di scemo"]'::jsonb, 'tono_dei_messaggi', true, 'A text from me in the middle of your day: sweet or silly?', '["Something sweet","Something silly"]'::jsonb),
  ('swipe-047', 1, 'D’inverno in casa: meglio il fresco col maglione o il caldo in maglietta?', '["Fresco e maglione","Caldo e maglietta"]'::jsonb, 'temperatura_in_casa', true, 'Home in winter: cool with a sweater on or toasty in a T-shirt?', '["Cool, with a sweater","Toasty, in a T-shirt"]'::jsonb),
  ('swipe-048', 1, 'A una festa: sempre insieme o ci si mescola e ci si ritrova dopo?', '["Sempre insieme","Ci ritroviamo dopo"]'::jsonb, 'feste_in_coppia', true, 'At a party: stick together or mingle and find each other later?', '["Stick together","Mingle, meet later"]'::jsonb),
  ('swipe-049', 1, 'I sogni che faccio di notte: vuoi sentirli tutti o solo i più assurdi?', '["Tutti, nei dettagli","Solo i più assurdi"]'::jsonb, 'sogni_della_notte', true, 'My dreams from last night: every detail or only the weird ones?', '["Every detail","Only the weird ones"]'::jsonb),
  ('swipe-050', 1, 'Un treno da prendere: in stazione con largo anticipo o di corsa all’ultimo?', '["Largo anticipo","Di corsa all’ultimo"]'::jsonb, 'treno_da_prendere', true, 'Catching a train: at the station way early or a last-second sprint?', '["Way early","Last-second sprint"]'::jsonb),
  ('swipe-051', 1, 'Un pensierino a sorpresa per te: un fiore o qualcosa di buono da mangiare?', '["Un fiore","Qualcosa di buono"]'::jsonb, 'pensierino_a_sorpresa', true, 'A little surprise for you: a flower or something tasty?', '["A flower","Something tasty"]'::jsonb),
  ('swipe-052', 1, 'Una serie da guardare insieme: un episodio a sera o tutta d’un fiato?', '["Uno a sera","Tutta d’un fiato"]'::jsonb, 'ritmo_delle_serie', true, 'A show we’re watching together: one episode a night or all at once?', '["One a night","All at once"]'::jsonb),
  ('swipe-053', 1, 'Fare sport insieme: ci si motiva o ci si distrae?', '["Ci si motiva","Ci si distrae"]'::jsonb, 'sport_insieme', true, 'Working out together: motivating or distracting?', '["Motivating","Distracting"]'::jsonb),
  ('swipe-054', 1, 'Gli auguri di compleanno: a mezzanotte in punto o al risveglio?', '["A mezzanotte","Al risveglio"]'::jsonb, 'auguri_a_mezzanotte', true, 'Birthday wishes: right at midnight or when you wake up?', '["At midnight","When I wake up"]'::jsonb),
  ('swipe-055', 1, 'Le chiacchierate più belle: camminando o a tavola?', '["Camminando","A tavola"]'::jsonb, 'chiacchierate_migliori', true, 'Our best talks: on a walk or around a table?', '["On a walk","Around a table"]'::jsonb),
  ('swipe-056', 1, 'In un posto nuovo: il piatto locale più strano o si va sul sicuro?', '["Assaggio tutto","Vado sul sicuro"]'::jsonb, 'assaggi_in_viaggio', true, 'Somewhere new: the strangest local dish or something safe?', '["Try everything","Play it safe"]'::jsonb),
  ('swipe-057', 1, 'Il messaggio «Sono a casa» a fine serata: rito sacro o facoltativo?', '["Rito sacro","Facoltativo"]'::jsonb, 'messaggio_sono_a_casa', true, 'The “I’m home” text at the end of the night: sacred ritual or optional?', '["Sacred ritual","Optional"]'::jsonb),
  ('swipe-058', 1, 'I piatti dopo cena: si lavano subito o domani è un altro giorno?', '["Subito","Domani è un altro giorno"]'::jsonb, 'piatti_dopo_cena', true, 'Dishes after dinner: right away or tomorrow’s problem?', '["Right away","Tomorrow’s problem"]'::jsonb),
  ('swipe-059', 1, 'Un viaggio in macchina insieme: musica a tutto volume o chiacchiere?', '["Musica a tutto volume","Chiacchiere"]'::jsonb, 'viaggio_in_macchina', true, 'A road trip together: music cranked up or nonstop talking?', '["Music cranked up","Nonstop talking"]'::jsonb),
  ('swipe-060', 1, 'Ballare insieme: in pista o solo in cucina?', '["In pista","Solo in cucina"]'::jsonb, 'ballare_insieme', true, 'Dancing together: on a real dance floor or only in the kitchen?', '["Dance floor","Kitchen only"]'::jsonb),
  ('swipe-061', 1, 'Le parole dolci: le preferisci scritte a mano o dette a voce?', '["Scritte a mano","Dette a voce"]'::jsonb, 'parole_dolci', true, 'Sweet words: do you like them handwritten or said out loud?', '["Handwritten","Said out loud"]'::jsonb),
  ('swipe-062', 1, 'Acquazzone mentre siamo fuori: corsa sotto la pioggia o riparo e attesa?', '["Corsa sotto la pioggia","Riparo e attesa"]'::jsonb, 'acquazzone', true, 'Caught in a downpour together: run through it or shelter and wait?', '["Run through it","Shelter and wait"]'::jsonb),
  ('swipe-063', 1, 'Amici che suonano alla porta senza avvisare: che bello o che panico?', '["Che bello","Che panico"]'::jsonb, 'visite_improvvise', true, 'Friends dropping by unannounced: how lovely or total panic?', '["How lovely","Total panic"]'::jsonb),
  ('swipe-064', 1, 'Il primo caffè o tè della giornata: momento da condividere o tutto tuo?', '["Da condividere","Tutto mio"]'::jsonb, 'primo_caffe', true, 'The first coffee or tea of the day: a moment to share or all yours?', '["To share","All mine"]'::jsonb),
  ('swipe-065', 1, 'Un gioco da tavolo insieme: si gioca per vincere o per ridere?', '["Per vincere","Per ridere"]'::jsonb, 'spirito_di_gioco', true, 'A board game together: play to win or play for laughs?', '["To win","For laughs"]'::jsonb),
  ('swipe-066', 1, 'A cena con amici: accanto a me o di fronte?', '["Accanto","Di fronte"]'::jsonb, 'posto_a_tavola', true, 'Dinner with friends: next to me or across from me?', '["Next to you","Across from you"]'::jsonb),
  ('swipe-067', 1, 'In un museo: si legge ogni didascalia o si va a sensazione?', '["Ogni didascalia","A sensazione"]'::jsonb, 'ritmo_al_museo', true, 'At a museum: read every caption or wander by instinct?', '["Every caption","By instinct"]'::jsonb),
  ('swipe-068', 1, 'Chiacchierare fino a notte fonda con la sveglia presto: ne vale la pena?', '["Sì, sempre","Vince il sonno"]'::jsonb, 'chiacchiere_notturne', true, 'Talking late into the night with an early alarm: worth it?', '["Always worth it","Sleep wins"]'::jsonb),
  ('swipe-069', 1, 'Se cucino per te: il tuo piatto di sempre o una novità?', '["Il piatto di sempre","Una novità"]'::jsonb, 'piatto_per_te', true, 'If I cook for you: your usual favorite or something new?', '["My usual favorite","Something new"]'::jsonb),
  ('swipe-070', 1, 'Un auricolare a testa per ascoltare la stessa canzone: romantico o scomodo?', '["Che romantico","Un po’ scomodo"]'::jsonb, 'auricolare_a_testa', true, 'One earbud each, listening to the same song: romantic or awkward?', '["How romantic","A bit awkward"]'::jsonb),
  ('swipe-071', 1, 'Appena finisce un film: commenti a raffica o un attimo di silenzio?', '["Commenti a raffica","Un attimo di silenzio"]'::jsonb, 'fine_del_film', true, 'When a movie ends: instant debrief or a moment of quiet?', '["Instant debrief","A moment of quiet"]'::jsonb),
  ('swipe-072', 1, 'Organizzare una sorpresa: ti piace di più prepararla o vedere la reazione?', '["Prepararla in segreto","Vedere la reazione"]'::jsonb, 'preparare_sorprese', true, 'Planning a surprise: is the best part the secret prep or the reaction?', '["The secret prep","The reaction"]'::jsonb)
on conflict (id) do nothing;

-- Swipe V1: 9 new Italian wordings (same id, version + 1, only when the text changes).
update private.game_swipe_v1_catalog as c
set question_text = coalesce(v.question_text, c.question_text), options = coalesce(v.options, c.options), version = c.version + 1
from (values
  ('swipe-003', 'Quando abbiamo poche energie, preferisci parlare comunque o stare in silenzio insieme?', null::jsonb),
  ('swipe-005', null, '["Sì","No, meglio improvvisare"]'::jsonb),
  ('swipe-007', 'Una sorpresa organizzata da me ti entusiasma o ti mette un po’ in ansia?', null::jsonb),
  ('swipe-010', null, '["Vedere tutto","Andare piano"]'::jsonb),
  ('swipe-011', 'Nei giorni giù di morale, meglio coccole subito o prima un po’ di spazio?', null::jsonb),
  ('swipe-022', 'Quando siamo a distanza, preferisci più messaggi brevi o una chiamata lunga?', null::jsonb),
  ('swipe-024', 'Ti piacerebbe provare insieme un hobby che non sappiamo ancora fare?', null::jsonb),
  ('swipe-026', 'Davanti a un piano assurdo proposto all’ultimo minuto, la risposta ideale è sì?', null::jsonb),
  ('swipe-027', 'Preferisci che ci diciamo sempre tutto subito o che ci siano anche cose solo tue e solo mie?', null::jsonb)
) as v(id, question_text, options)
where c.id = v.id
  and (c.question_text, c.options) is distinct from (coalesce(v.question_text, c.question_text), coalesce(v.options, c.options));

-- Swipe V1: 5 retired cards (kept, never deleted).
update private.game_swipe_v1_catalog set active = false where id = any (array['swipe-004', 'swipe-016', 'swipe-019', 'swipe-029', 'swipe-030']::text[]) and active;

-- Swipe V1: English for the 27 kept cards.
update private.game_swipe_v1_catalog as c
set question_text_en = v.question_text_en, options_en = v.options_en
from (values
  ('swipe-001', 'Our perfect evening: out on the town or curled up on the couch?', '["Out on the town","On the couch"]'::jsonb),
  ('swipe-002', 'If we left tomorrow with no plans at all, would you really enjoy it?', '["Yes, let’s go","No, let’s plan"]'::jsonb),
  ('swipe-003', 'When we’re low on energy, would you rather talk anyway or be quiet together?', '["Talk","Quiet together"]'::jsonb),
  ('swipe-005', 'Would you like us to have a fixed tradition of our own every month?', '["Yes","No, let’s improvise"]'::jsonb),
  ('swipe-006', 'On a free day, would you rather get up early or sleep with no alarm?', '["Early","No alarm"]'::jsonb),
  ('swipe-007', 'Does a surprise I plan for you thrill you or make you a little anxious?', '["It thrills me","I’d rather know"]'::jsonb),
  ('swipe-008', 'If we could choose right now: a fancy dinner or street food?', '["Fancy dinner","Street food"]'::jsonb),
  ('swipe-009', 'Would you like to spend an evening looking through all our photos together?', '["Yes","Not my thing"]'::jsonb),
  ('swipe-010', 'On a trip, would you rather see as much as possible or take it slow?', '["See it all","Take it slow"]'::jsonb),
  ('swipe-011', 'On down days: cuddles right away or a little space first?', '["Cuddles right away","A little space"]'::jsonb),
  ('swipe-012', 'Would it be fun to take turns picking an evening, with no vetoes allowed?', '["Yes","No"]'::jsonb),
  ('swipe-013', 'Would you rather get a useful gift or something totally useless but romantic?', '["Useful","Useless but romantic"]'::jsonb),
  ('swipe-014', 'A vacation together: a city packed with things to do or somewhere remote?', '["City","Somewhere remote"]'::jsonb),
  ('swipe-015', 'Would you like more candid photos of us, even if they come out badly?', '["Yes","No, fewer but better"]'::jsonb),
  ('swipe-017', 'If we cook together, do you want an exact recipe or should we wing it?', '["Exact recipe","Let’s wing it"]'::jsonb),
  ('swipe-018', 'Would you like to make a list of places to see together and tick them off?', '["Yes","No, play it by ear"]'::jsonb),
  ('swipe-020', 'If we had a home together, would you want it minimal or full of our things?', '["Minimal","Full of us"]'::jsonb),
  ('swipe-021', 'Would you like to celebrate the little anniversaries too, not just the big ones?', '["Yes","No"]'::jsonb),
  ('swipe-022', 'When we’re apart, would you rather have lots of short texts or one long call?', '["More texts","One long call"]'::jsonb),
  ('swipe-023', 'Picking a movie: something that makes us cry or something that makes us laugh?', '["Cry","Laugh"]'::jsonb),
  ('swipe-024', 'Would you like to try a hobby together that we don’t know how to do yet?', '["Yes","No"]'::jsonb),
  ('swipe-025', 'For an anniversary, would you rather have an experience or a keepsake?', '["Experience","Keepsake"]'::jsonb),
  ('swipe-026', 'Faced with a wild plan suggested at the last minute, is the ideal answer yes?', '["Yes","It really depends"]'::jsonb),
  ('swipe-027', 'Should we tell each other everything right away, or each keep some things of our own?', '["Share almost everything","Keep our own spaces"]'::jsonb),
  ('swipe-028', 'Would you like a new song to become “ours” every year?', '["Yes","No"]'::jsonb),
  ('swipe-031', 'Would you like more little gestures for no particular reason?', '["Yes","I don’t need them"]'::jsonb),
  ('swipe-032', 'If we only had two hours together, would you rather do something or absolutely nothing?', '["Do something","Nothing, together"]'::jsonb)
) as v(id, question_text_en, options_en)
where c.id = v.id
  and (c.question_text_en, c.options_en) is distinct from (v.question_text_en, v.options_en);

-- Daily Question bank: 9 new Italian wordings.
update public.daily_question_templates as t
set question = v.question
from (values
  ('desideri-17', 'Quale posto vicino a casa, dove non abbiamo mai messo piede, ti incuriosisce?'),
  ('gioco-01', 'Se fossimo la coppia protagonista di un film, quale film sarebbe?'),
  ('gioco-15', 'Chi di noi resisterebbe di più su un’isola deserta, e perché?'),
  ('gioco-19', 'Chi di noi riuscirebbe a perdersi anche con il navigatore acceso?'),
  ('profonda-03', 'In cosa pensi che la nostra coppia sia cresciuta di più nell’ultimo anno?'),
  ('profonda-20', 'In cosa siamo differenti, e perché ti piace?'),
  ('ricordi-13', 'Ricordi un momento che ci ha fatto commuovere insieme?'),
  ('vicinanza-07', 'In quale momento della giornata senti di più la nostra vicinanza?'),
  ('vicinanza-15', 'Quando siamo a distanza, cosa ti fa sentire la mia presenza?')
) as v(id, question)
where t.id = v.id
  and t.question is distinct from v.question;

-- Daily Question bank: English for the 182 questions.
update public.daily_question_templates as t
set question_en = v.question_en
from (values
  ('desideri-01', 'Where would you love to go with me at least once in your life?'),
  ('desideri-02', 'What would you love for us to learn to do together?'),
  ('desideri-03', 'How do you picture a perfect Sunday for us, five years from now?'),
  ('desideri-04', 'What’s something a little wild you’d do with me without thinking twice?'),
  ('desideri-05', 'With a free weekend and a tight budget, where would you go with me?'),
  ('desideri-06', 'What concert, show or event would you love to go to with me?'),
  ('desideri-07', 'What tradition of our very own would you love to start?'),
  ('desideri-08', 'What’s a dream you haven’t said out loud yet?'),
  ('desideri-09', 'If we could live in another city for a year, which would you pick?'),
  ('desideri-10', 'What dish would you love to learn to cook for me?'),
  ('desideri-11', 'What would you love to do before this year is over?'),
  ('desideri-12', 'What’s one specific detail of our dream home?'),
  ('desideri-13', 'What train ride or road trip would you love to take with me?'),
  ('desideri-14', 'Is there an outdoor adventure you’d love to try together?'),
  ('desideri-15', 'If you could give me any gift at all, no limits, what would it be?'),
  ('desideri-16', 'What new habit would you like us to make our own next year?'),
  ('desideri-17', 'What place near home, somewhere we’ve never been, makes you curious?'),
  ('desideri-18', 'If you could book a special dinner for us tonight, where would it be?'),
  ('desideri-19', 'Twenty years from now, what story about us would you love to tell your friends?'),
  ('desideri-20', 'What language would you love to learn, and where would you go to use it?'),
  ('desideri-21', 'What kind of party would you love to throw with me?'),
  ('desideri-22', 'What trip would you take if we had a whole month free?'),
  ('desideri-23', 'What would you love for us to do together for the very first time?'),
  ('desideri-24', 'What would you love to build with your own hands one day?'),
  ('desideri-25', 'What small wish could we make come true within a month?'),
  ('desideri-26', 'Where would you love to be with me, exactly one year from now?'),
  ('gioco-01', 'If we were the stars of a movie, which one would it be?'),
  ('gioco-02', 'If you could have a superpower for just one day, which would you pick?'),
  ('gioco-03', 'What animals would you and I be, and why?'),
  ('gioco-04', 'If we were a band, what would we be called?'),
  ('gioco-05', 'Pizza forever or pasta forever: which do you pick?'),
  ('gioco-06', 'If we won a surprise trip tomorrow, where would you hope they’d send us?'),
  ('gioco-07', 'Which object at home, if it could talk, would have the most to say about us?'),
  ('gioco-08', 'If you had your own cooking show, what would it be called?'),
  ('gioco-09', 'What would our shameless karaoke song be?'),
  ('gioco-10', 'If you could live my life for a day, what’s the first thing you’d do?'),
  ('gioco-11', 'Which period in history would you visit for a weekend?'),
  ('gioco-12', 'If you were an ice cream flavor, which one would you be?'),
  ('gioco-13', 'What’s the worst movie you’d happily watch with me?'),
  ('gioco-14', 'If we opened a place together, what kind of spot would it be?'),
  ('gioco-15', 'Which of us would last longer on a desert island, and why?'),
  ('gioco-16', 'If our life were a TV show, what would this season be called?'),
  ('gioco-17', 'Which emoji sums you up best today?'),
  ('gioco-18', 'If you could get rid of one household chore forever, which would it be?'),
  ('gioco-19', 'Which of us would manage to get lost even with the GPS on?'),
  ('gioco-20', 'If we had a talking pet, what would it say about us?'),
  ('gioco-21', 'What ridiculous house rule would you make us follow for a whole day?'),
  ('gioco-22', 'Which famous person would you invite to dinner with us, and what would you ask them?'),
  ('gioco-23', 'Which cartoon from your childhood would you happily watch again tonight?'),
  ('gioco-24', 'If you had to describe me as a dish, what would I be?'),
  ('gioco-25', 'If we could teleport anywhere just for dinner tonight, where would we go?'),
  ('gioco-26', 'What would the book of our story be called?'),
  ('noi_adesso-01', 'What would get your week off to a good start?'),
  ('noi_adesso-02', 'Is there something this week you’d love to get off your mind soon?'),
  ('noi_adesso-03', 'What’s one concrete thing I can help you with this week?'),
  ('noi_adesso-04', 'What kind of evening would you love to spend with me in the next few days?'),
  ('noi_adesso-05', 'How’s your mood today, in three words?'),
  ('noi_adesso-06', 'What’s been giving you energy lately?'),
  ('noi_adesso-07', 'If this week had a title, what would it be?'),
  ('noi_adesso-08', 'What do you miss most when your days are packed?'),
  ('noi_adesso-09', 'Is there something you’d love to hear this week?'),
  ('noi_adesso-10', 'What’s your battery at today, from 1 to 10, and what would recharge it?'),
  ('noi_adesso-11', 'What little habit would you like us to bring into this week?'),
  ('noi_adesso-12', 'What task would you love to hand over to me for a few days?'),
  ('noi_adesso-13', 'What are you looking forward to most in the next seven days?'),
  ('noi_adesso-14', 'What time of day would you like to spend with me more often?'),
  ('noi_adesso-15', 'What would make tonight a little lighter for you?'),
  ('noi_adesso-16', 'What went well for you last week, even in a small way?'),
  ('noi_adesso-17', 'Is there a little thing I do that’s been helping you lately, more than I’d guess?'),
  ('noi_adesso-18', 'How would you like us to spend next Sunday?'),
  ('noi_adesso-19', 'What have you been putting off that you’d love to wrap up by Friday?'),
  ('noi_adesso-20', 'Which of this week’s plans are you most curious about?'),
  ('noi_adesso-21', 'What are you craving most these days: calm, company or something new?'),
  ('noi_adesso-22', 'What thought from this weekend is still with you?'),
  ('noi_adesso-23', 'If you could change one thing about your current routine, what would it be?'),
  ('noi_adesso-24', 'What would you like me to know about your week before it starts?'),
  ('noi_adesso-25', 'What makes you feel at home on a rough day?'),
  ('noi_adesso-26', 'What would you love to celebrate by Sunday, even in a small way?'),
  ('profonda-01', 'What happened this week that made you think, even just to yourself, “lucky me”?'),
  ('profonda-02', 'Of the things we’re building together, which matters most to you?'),
  ('profonda-03', 'Where do you think we’ve grown most as a couple over the past year?'),
  ('profonda-04', 'What have I taught you without meaning to?'),
  ('profonda-05', 'What does “home” mean to you these days?'),
  ('profonda-06', 'What’s one value that feels truly ours?'),
  ('profonda-07', 'What moment this week felt small but important?'),
  ('profonda-08', 'What do you like about who you are when you’re with me?'),
  ('profonda-09', 'What do you hope never changes between us?'),
  ('profonda-10', 'What have you learned about love since we’ve been together?'),
  ('profonda-11', 'Who among your family and friends has taught you something about love?'),
  ('profonda-12', 'What about me have you come to appreciate over time?'),
  ('profonda-13', 'What would you like to thank me for, even if it was a while ago?'),
  ('profonda-14', 'What precious thing do we have that money can’t buy?'),
  ('profonda-15', 'What makes you feel like we’re a team?'),
  ('profonda-16', 'Is there a dream of yours you feel better able to chase because of us?'),
  ('profonda-17', 'How would you describe our relationship to someone who doesn’t know us?'),
  ('profonda-18', 'What’s a small everyday thing in our life that you’d never take for granted?'),
  ('profonda-19', 'What would you like us to remember about this time, ten years from now?'),
  ('profonda-20', 'How are we different, and why do you like that?'),
  ('profonda-21', 'What unspoken promise do you feel you keep with me every day?'),
  ('profonda-22', 'What has surprised you most about the way we love each other?'),
  ('profonda-23', 'What’s the simplest thing that makes our life together beautiful?'),
  ('profonda-24', 'Looking at us, what makes you think, “it’s been worth it”?'),
  ('profonda-25', 'What part of your life has changed most since I came along?'),
  ('profonda-26', 'What words would you like to carry with us into the years ahead?'),
  ('ricordi-01', 'What’s the first thing about me that stuck in your mind?'),
  ('ricordi-02', 'What moment of ours would you relive exactly as it was, without changing a thing?'),
  ('ricordi-03', 'Do you remember the first time you thought, “I really like being with this person”? Where were we?'),
  ('ricordi-04', 'Which outing or trip together comes to mind most often?'),
  ('ricordi-05', 'What’s the biggest laugh you remember having with me?'),
  ('ricordi-06', 'Which message of mine do you still know almost by heart?'),
  ('ricordi-07', 'What place feels like “ours” to you now?'),
  ('ricordi-08', 'What gift from me, even a tiny one, has stayed in your heart?'),
  ('ricordi-09', 'What little mishap we faced together makes you smile when you look back?'),
  ('ricordi-10', 'Is there an ordinary evening with me that, for some reason, you remember perfectly?'),
  ('ricordi-11', 'What’s the childhood memory you love going back to most?'),
  ('ricordi-12', 'What song instantly takes you back to a moment of ours?'),
  ('ricordi-13', 'Do you remember a moment that moved us both?'),
  ('ricordi-14', 'What dish brings back a memory of us?'),
  ('ricordi-15', 'Which photo of us best shows how we were at the start?'),
  ('ricordi-16', 'Do you remember a day when my being there made a difference?'),
  ('ricordi-17', 'What do you think was our first habit as a couple?'),
  ('ricordi-18', 'What did we do at the beginning that you’d love to start doing again?'),
  ('ricordi-19', 'Which summer of your life do you remember as the best?'),
  ('ricordi-20', 'What detail of our first date do you remember best?'),
  ('ricordi-21', 'What’s something I said to you that has stayed with you, in a good way?'),
  ('ricordi-22', 'Which home or city you’ve lived in do you miss, and what about it?'),
  ('ricordi-23', 'When did it hit you that you really knew me?'),
  ('ricordi-24', 'Which celebration or special day together do you remember most fondly?'),
  ('ricordi-25', 'What story from your teenage years haven’t you told me yet?'),
  ('ricordi-26', 'If you could keep just one day from our past year, which would you choose?'),
  ('scoprirsi-01', 'What’s your favorite way to spend a morning with nothing planned?'),
  ('scoprirsi-02', 'What song almost always puts you in a good mood?'),
  ('scoprirsi-03', 'Do you have a little quirk I might not have noticed yet?'),
  ('scoprirsi-04', 'What scent takes you straight back to childhood?'),
  ('scoprirsi-05', 'What job did you dream of having when you were little?'),
  ('scoprirsi-06', 'What does your ideal breakfast look like, with no limits at all?'),
  ('scoprirsi-07', 'What makes you laugh even when you shouldn’t?'),
  ('scoprirsi-08', 'What movie could you watch over and over without ever getting tired of it?'),
  ('scoprirsi-09', 'Is there something you always do the same way, almost like a ritual?'),
  ('scoprirsi-10', 'What’s the compliment that stayed with you most, whoever it came from?'),
  ('scoprirsi-11', 'Which season of the year feels most like you?'),
  ('scoprirsi-12', 'What’s a small, slightly silly fear you have?'),
  ('scoprirsi-13', 'What did you collect as a kid, or wish you had?'),
  ('scoprirsi-14', 'What book, show or story changed the way you see things, even a little?'),
  ('scoprirsi-15', 'On an off day, would you rather talk it through right away or let it settle?'),
  ('scoprirsi-16', 'Which corner of your home do you feel best in, and why that one?'),
  ('scoprirsi-17', 'What dish could you cook with your eyes closed?'),
  ('scoprirsi-18', 'Is there a food you love but almost never order?'),
  ('scoprirsi-19', 'What’s your favorite word in English?'),
  ('scoprirsi-20', 'If someone gave you an hour all to yourself today, how would you spend it?'),
  ('scoprirsi-21', 'Is there a talent you secretly wish you had?'),
  ('scoprirsi-22', 'What sound relaxes you more than any other?'),
  ('scoprirsi-23', 'What kind of gift really moves you: useful, handmade or unexpected?'),
  ('scoprirsi-24', 'What could you talk about for hours without getting bored?'),
  ('scoprirsi-25', 'What makes you more impatient than anything else?'),
  ('scoprirsi-26', 'What habit from your family do you carry with you without even noticing?'),
  ('vicinanza-01', 'What’s a little thing I do that goes straight to your heart?'),
  ('vicinanza-02', 'What time of day do you miss me most?'),
  ('vicinanza-03', 'What have I done for you, without you asking, that felt incredibly sweet?'),
  ('vicinanza-04', 'What’s better: a long hug, a surprise message or coffee in bed?'),
  ('vicinanza-05', 'What’s your favorite way for me to say good morning?'),
  ('vicinanza-06', 'Is there a word or nickname that makes you melt when I say it?'),
  ('vicinanza-07', 'What time of day do you feel we’re closest?'),
  ('vicinanza-08', 'What do I do that makes you feel safe?'),
  ('vicinanza-09', 'What would you like me to do for you more often?'),
  ('vicinanza-10', 'Which of my flaws do you secretly find endearing?'),
  ('vicinanza-11', 'What part of a day together stays with you long after?'),
  ('vicinanza-12', 'What message would you love to get from me on a hard day?'),
  ('vicinanza-13', 'What about me do you find yourself looking at when you think I won’t notice?'),
  ('vicinanza-14', 'What simple thing can I do to make your day better?'),
  ('vicinanza-15', 'When we’re apart, what makes you feel I’m with you?'),
  ('vicinanza-16', 'What’s your favorite hug: waking up, coming home or right before sleep?'),
  ('vicinanza-17', 'What tells you I’m really listening to you?'),
  ('vicinanza-18', 'What do I often say that you love hearing?'),
  ('vicinanza-19', 'What little surprise would make you happy this week?'),
  ('vicinanza-20', 'When do you most like me to take your hand?'),
  ('vicinanza-21', 'What’s a quality of mine you admire but have never told me about?'),
  ('vicinanza-22', 'What would you like me to remind you of on days when you’re feeling down?'),
  ('vicinanza-23', 'Where do you feel most at peace when we’re together?'),
  ('vicinanza-24', 'How can you tell when I’m happy?'),
  ('vicinanza-25', 'To you, what’s the most romantic thing about an ordinary day?'),
  ('vicinanza-26', 'In everyday life, how can you tell that I still choose you?')
) as v(id, question_en)
where t.id = v.id
  and t.question_en is distinct from v.question_en;

-- Context recipes: 1 new Italian wording (version + 1).
update public.game_v2_recipes as r
set question_text = v.question_text, version = r.version + 1
from (values
  ('calendar_past-002', 'Ripensando a «{title}», {when}, c’è qualcosa di quella giornata che non mi hai mai raccontato?')
) as v(id, question_text)
where r.id = v.id
  and r.question_text is distinct from v.question_text;

-- Context recipes: English for the 13 templates.
update public.game_v2_recipes as r
set question_text_en = v.question_text_en
from (values
  ('calendar_past-001', 'What detail do you remember best from “{title}” {when}?'),
  ('calendar_past-002', 'Looking back on “{title}” {when}, is there anything about that day you’ve never told me?'),
  ('calendar_upcoming-001', 'What part of “{title}” on {date} are you looking forward to most?'),
  ('calendar_upcoming-002', 'Imagine “{title}” went even better than expected. What happened?'),
  ('conservati-001', 'Of everything we’ve kept, which would you reread tonight, and why that one?'),
  ('da_vivere_idea-001', 'If we could do “{title}” this weekend without planning a thing, how do you picture the day?'),
  ('da_vivere_idea-002', '“{title}”: for you, is this something to plan carefully or to do on a whim?'),
  ('da_vivere_idea-003', 'What do you hope “{title}” leaves you with, when the time comes?'),
  ('da_vivere_lived-001', 'What moment from “{title}” has stayed with you?'),
  ('da_vivere_lived-002', 'If we could relive “{title}” tomorrow, what would you change?'),
  ('longitudinal-001', '{previous_question}'),
  ('moment-001', 'Think back to the memory “{title}” {when}: what was on your mind right then?'),
  ('moment-002', 'If the memory “{title}” had a soundtrack, what song would it be?')
) as v(id, question_text_en)
where r.id = v.id
  and r.question_text_en is distinct from v.question_text_en;

-- Weekly Quests: 10 new Italian titles.
update public.bond_quest_templates as q
set title = v.title
from (values
  ('any-mini-surprise', 'Preparatevi a vicenda una mini sorpresa entro domenica.'),
  ('any-absurd-question', 'Fatevi a turno una domanda assurda e rispondete con la massima serietà.'),
  ('any-appreciate', 'Ditevi a vicenda una cosa che apprezzate e che vi dite troppo poco.'),
  ('far-thought-photo', 'Mandatevi la foto di qualcosa che oggi vi ha fatto pensare a chi la riceve.'),
  ('near-movie-snack', 'Dividetevi i compiti: chi sceglie cosa guardare non sceglie lo snack.'),
  ('any-secret-detail', 'Raccontatevi a vicenda una cosa di voi che non avete ancora mai raccontato.'),
  ('far-playlist', 'Createvi a vicenda una playlist di 5 canzoni.'),
  ('any-grow-together', 'Scegliete a turno una piccola cosa che vorreste migliorare insieme.'),
  ('near-new-place', 'Provate un posto che non conoscete ancora.'),
  ('any-private-meme', 'Create un meme privato su qualcosa che è successo tra voi.')
) as v(key, title)
where q.key = v.key
  and q.title is distinct from v.title;

-- Weekly Quests: English for the 33 templates.
update public.bond_quest_templates as q
set title_en = v.title_en
from (values
  ('any-intentional-memory', 'Make an intentional memory: a photo, a note and something new.'),
  ('any-mini-surprise', 'Plan a little surprise for each other before Sunday.'),
  ('far-next-meeting-note', 'Write a note to be read only the next time you see each other.'),
  ('any-absurd-question', 'Take turns asking an absurd question and answering it with a completely straight face.'),
  ('any-appreciate', 'Tell each other one thing you appreciate and don’t say often enough.'),
  ('any-couple-mood', 'Write one sentence that sums up your mood as a couple this week.'),
  ('any-wake-up-top3', 'Make a top 3 of the places you’d love to wake up tomorrow.'),
  ('any-week-photo', 'Take a photo that captures this week of you two.'),
  ('far-same-episode', 'Watch the same episode or video at the same time.'),
  ('far-song-sync', 'Pick a song and listen to it at the same time.'),
  ('far-thought-photo', 'Send each other a photo of something that made you think of each other today.'),
  ('near-breakfast', 'Go out together for breakfast, a snack or a coffee.'),
  ('near-movie-snack', 'Split the jobs: whoever picks what to watch doesn’t pick the snack.'),
  ('near-walk', 'Take a walk of at least 30 minutes, no phones.'),
  ('any-home-photo', 'Choose a new Home photo for US together.'),
  ('any-next-month', 'Together, pick one thing you want to experience next month.'),
  ('any-old-photo', 'Pick an old photo and share what you remember about that moment.'),
  ('any-private-meme', 'Make a private meme about something that happened between you.'),
  ('any-secret-detail', 'Tell each other something about yourselves you’ve never shared before.'),
  ('any-week-ritual', 'Invent a little ritual to repeat at least twice this week.'),
  ('far-dinner-call', 'Have dinner together on a video call.'),
  ('far-playlist', 'Make each other a 5-song playlist.'),
  ('far-ten-questions', 'Take turns asking each other 10 questions on a call, without preparing them.'),
  ('near-cook-new', 'Cook something you’ve never made together.'),
  ('near-five-euro', 'Swap little surprises with a budget of €5 at most.'),
  ('near-random-road', 'Pick a random direction and follow it for 20 minutes.'),
  ('any-grow-together', 'Take turns choosing one small thing you’d like to get better at together.'),
  ('any-no-phone', '45 minutes with no distractions: together or on a call.'),
  ('far-comfort-food', 'Pick the same kind of comfort food and eat it together on a call.'),
  ('far-dream-date', 'Plan an impossible date on a call, with no budget limits.'),
  ('near-new-place', 'Try a place neither of you has been to yet.'),
  ('near-recreate-photo', 'Recreate an old photo of you two.'),
  ('near-sunset', 'Find a nice spot and watch the sunset together.')
) as v(key, title_en)
where q.key = v.key
  and q.title_en is distinct from v.title_en;

-- Fails closed (and rolls the whole migration back) unless every row this
-- content names exists, retired cards are inactive and every active row has English.
do $content_1_0_check$
begin
  if (select count(*) from public.game_v2_catalog where id = any (array['quanto_mi_conosci-013', 'quanto_mi_conosci-014', 'quanto_mi_conosci-015', 'quanto_mi_conosci-016', 'quanto_mi_conosci-017', 'quanto_mi_conosci-018', 'quanto_mi_conosci-019', 'quanto_mi_conosci-020', 'quanto_mi_conosci-021', 'quanto_mi_conosci-022', 'quanto_mi_conosci-023', 'quanto_mi_conosci-024', 'quanto_mi_conosci-025', 'quanto_mi_conosci-026', 'quanto_mi_conosci-027', 'quanto_mi_conosci-028', 'quanto_mi_conosci-029', 'quanto_mi_conosci-030', 'quanto_mi_conosci-031', 'quanto_mi_conosci-032', 'quanto_mi_conosci-033', 'quanto_mi_conosci-034', 'quanto_mi_conosci-035', 'quanto_mi_conosci-036', 'quanto_mi_conosci-037', 'quanto_mi_conosci-038', 'quanto_mi_conosci-039', 'quanto_mi_conosci-040', 'quanto_mi_conosci-041', 'quanto_mi_conosci-042', 'quanto_mi_conosci-043', 'quanto_mi_conosci-044', 'quanto_mi_conosci-045', 'quanto_mi_conosci-046', 'quanto_mi_conosci-047', 'quanto_mi_conosci-048', 'quanto_mi_conosci-049', 'quanto_mi_conosci-050', 'quanto_mi_conosci-051', 'quanto_mi_conosci-052', 'scopritevi-013', 'scopritevi-014', 'scopritevi-015', 'scopritevi-016', 'scopritevi-017', 'scopritevi-018', 'scopritevi-019', 'scopritevi-020', 'scopritevi-021', 'scopritevi-022', 'scopritevi-023', 'scopritevi-024', 'scopritevi-025', 'scopritevi-026', 'scopritevi-027', 'scopritevi-028', 'scopritevi-029', 'scopritevi-030', 'scopritevi-031', 'scopritevi-032', 'scopritevi-033', 'scopritevi-034', 'scopritevi-035', 'scopritevi-036', 'scopritevi-037', 'scopritevi-038', 'scopritevi-039', 'scopritevi-040', 'scopritevi-041', 'scopritevi-042', 'ridete-011', 'ridete-012', 'ridete-013', 'ridete-014', 'ridete-015', 'ridete-016', 'ridete-017', 'ridete-018', 'ridete-019', 'ridete-020', 'ridete-021', 'ridete-022', 'ridete-023', 'ridete-024', 'ridete-025', 'ridete-026', 'ridete-027', 'ridete-028', 'ridete-029', 'ridete-030', 'ridete-031', 'ridete-032', 'ridete-033', 'ridete-034', 'ridete-035', 'ridete-036', 'ridete-037', 'ridete-038', 'ridete-039', 'ridete-040', 'confrontatevi-011', 'confrontatevi-012', 'confrontatevi-013', 'confrontatevi-014', 'confrontatevi-015', 'confrontatevi-016', 'confrontatevi-017', 'confrontatevi-018', 'confrontatevi-019', 'confrontatevi-020', 'confrontatevi-021', 'confrontatevi-022', 'confrontatevi-023', 'confrontatevi-024', 'confrontatevi-025', 'confrontatevi-026', 'confrontatevi-027', 'confrontatevi-028', 'confrontatevi-029', 'confrontatevi-030', 'confrontatevi-031', 'confrontatevi-032', 'confrontatevi-033', 'confrontatevi-034', 'confrontatevi-035', 'confrontatevi-036', 'confrontatevi-037', 'confrontatevi-038', 'confrontatevi-039', 'confrontatevi-040', 'rivivete-009', 'rivivete-010', 'rivivete-011', 'rivivete-012', 'rivivete-013', 'rivivete-014', 'rivivete-015', 'rivivete-016', 'rivivete-017', 'rivivete-018', 'rivivete-019', 'rivivete-020', 'rivivete-021', 'rivivete-022', 'rivivete-023', 'rivivete-024', 'rivivete-025', 'rivivete-026', 'rivivete-027', 'rivivete-028', 'ridete-001', 'ridete-003', 'ridete-005', 'ridete-008', 'confrontatevi-002', 'confrontatevi-008', 'e_se-006', 'rivivete-007']::text[])) <> 158 then
    raise exception using errcode = 'P0001', message = 'content 1.0: Game V2 catalog rows missing';
  end if;
  if (select count(*) from private.game_swipe_v1_catalog where id = any (array['swipe-033', 'swipe-034', 'swipe-035', 'swipe-036', 'swipe-037', 'swipe-038', 'swipe-039', 'swipe-040', 'swipe-041', 'swipe-042', 'swipe-043', 'swipe-044', 'swipe-045', 'swipe-046', 'swipe-047', 'swipe-048', 'swipe-049', 'swipe-050', 'swipe-051', 'swipe-052', 'swipe-053', 'swipe-054', 'swipe-055', 'swipe-056', 'swipe-057', 'swipe-058', 'swipe-059', 'swipe-060', 'swipe-061', 'swipe-062', 'swipe-063', 'swipe-064', 'swipe-065', 'swipe-066', 'swipe-067', 'swipe-068', 'swipe-069', 'swipe-070', 'swipe-071', 'swipe-072', 'swipe-003', 'swipe-005', 'swipe-007', 'swipe-010', 'swipe-011', 'swipe-022', 'swipe-024', 'swipe-026', 'swipe-027', 'swipe-004', 'swipe-016', 'swipe-019', 'swipe-029', 'swipe-030']::text[])) <> 54 then
    raise exception using errcode = 'P0001', message = 'content 1.0: Swipe cards missing';
  end if;
  if (select count(*) from public.daily_question_templates where id = any (array['desideri-17', 'gioco-01', 'gioco-15', 'gioco-19', 'profonda-03', 'profonda-20', 'ricordi-13', 'vicinanza-07', 'vicinanza-15']::text[])) <> 9 then
    raise exception using errcode = 'P0001', message = 'content 1.0: Daily Question rows missing';
  end if;
  if (select count(*) from public.game_v2_recipes where id = any (array['calendar_past-002']::text[])) <> 1 then
    raise exception using errcode = 'P0001', message = 'content 1.0: recipe rows missing';
  end if;
  if (select count(*) from public.bond_quest_templates where key = any (array['any-mini-surprise', 'any-absurd-question', 'any-appreciate', 'far-thought-photo', 'near-movie-snack', 'any-secret-detail', 'far-playlist', 'any-grow-together', 'near-new-place', 'any-private-meme']::text[])) <> 10 then
    raise exception using errcode = 'P0001', message = 'content 1.0: Quest templates missing';
  end if;
  if exists (select 1 from private.game_swipe_v1_catalog where id = any (array['swipe-004', 'swipe-016', 'swipe-019', 'swipe-029', 'swipe-030']::text[]) and active) then
    raise exception using errcode = 'P0001', message = 'content 1.0: a retired Swipe card is still active';
  end if;
  if exists (select 1 from public.game_v2_catalog where active and (question_text_en is null or options_en is null
      or (predict_text is null) <> (predict_text_en is null))) then
    raise exception using errcode = 'P0001', message = 'content 1.0: an active Game V2 prompt has no English';
  end if;
  if exists (select 1 from private.game_swipe_v1_catalog where active and (question_text_en is null or options_en is null)) then
    raise exception using errcode = 'P0001', message = 'content 1.0: an active Swipe card has no English';
  end if;
  if exists (select 1 from public.daily_question_templates where active and question_en is null) then
    raise exception using errcode = 'P0001', message = 'content 1.0: an active Daily Question has no English';
  end if;
  if exists (select 1 from public.game_v2_recipes where active and question_text_en is null) then
    raise exception using errcode = 'P0001', message = 'content 1.0: an active recipe has no English';
  end if;
  if exists (select 1 from public.bond_quest_templates where active and title_en is null) then
    raise exception using errcode = 'P0001', message = 'content 1.0: an active Quest template has no English';
  end if;
end;
$content_1_0_check$;
-- content-1-0:end

-- Role tokens render with the couple's own display names. The couple is
-- always the caller's: start_game_round passes actor.caller_couple from
-- private.m11a_actor_locked(), so no other couple is ever read. A missing or
-- blank name (a partner who has not joined yet) falls back to a neutral
-- 'Partner 1' / 'Partner 2'; two identical names get a ' 1' / ' 2' suffix,
-- so a who-would choice never shows two equal options.
create or replace function private.game_v2_role_label(target_couple uuid, target_role text)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  with slots(role, ordinal) as (values ('francesco', 1), ('beatrice', 2)),
  names as (
    select s.role, s.ordinal, nullif(pg_catalog.left(pg_catalog.btrim(p.display_name), 40), '') as name
    from slots s
    left join public.profiles p on p.couple_id = target_couple and p.role = s.role
  )
  select case
    when n.name is null then 'Partner ' || n.ordinal::text
    when exists (select 1 from names o where o.role <> n.role and pg_catalog.lower(o.name) = pg_catalog.lower(n.name))
      then n.name || ' ' || n.ordinal::text
    else n.name
  end
  from names n
  where n.role = target_role;
$function$;

create or replace function private.game_v2_render(template text, subject text, target_couple uuid)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select replace(replace(replace(template, '{subject}', coalesce(private.game_v2_role_label(target_couple, subject), '{subject}')),
    '{francesco}', private.game_v2_role_label(target_couple, 'francesco')), '{beatrice}', private.game_v2_role_label(target_couple, 'beatrice'));
$function$;

create or replace function private.game_v2_render_options(raw jsonb, subject text, target_couple uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(jsonb_agg(to_jsonb(private.game_v2_render(o.value, subject, target_couple)) order by o.ordinality), '[]'::jsonb)
  from jsonb_array_elements_text(raw) with ordinality o;
$function$;

revoke all on function private.game_v2_role_label(target_couple uuid, target_role text) from public, anon, authenticated, service_role;
revoke all on function private.game_v2_render(template text, subject text, target_couple uuid) from public, anon, authenticated, service_role;
revoke all on function private.game_v2_render_options(raw jsonb, subject text, target_couple uuid) from public, anon, authenticated, service_role;

-- start_game_round: unchanged except that the three render calls pass the
-- caller's couple. CREATE OR REPLACE keeps its owner and grants.
CREATE OR REPLACE FUNCTION public.start_game_round(target_family text, request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor record; sid uuid; existing_family text; at_time timestamptz := private.game_v2_clock();
  ordinal integer; heavy text; items jsonb; e jsonb; pos integer := 0; subject text;
  sources text[]; source_kind text; usage jsonb;
begin
  select * into actor from private.m11a_actor_locked();
  if request_id is null then raise exception using errcode = '22023', message = 'request id required'; end if;
  if target_family is null or not (target_family = 'per_voi' or target_family = any (private.game_v2_families())) then
    raise exception using errcode = '22023', message = 'invalid family';
  end if;

  -- Replay of an earlier request: always the original round, whatever the
  -- allowance or the week is now.
  select s.id, s.game_family into sid, existing_family from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.started_by_role = actor.caller_role
      and s.create_request_id = start_game_round.request_id;
  if sid is not null then
    if existing_family is distinct from target_family then
      raise exception using errcode = '22023', message = 'request already used';
    end if;
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('game_v2_round:' || actor.caller_couple::text || ':' || target_family, 0));
  select s.id into sid from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.started_by_role = actor.caller_role
      and s.create_request_id = start_game_round.request_id and s.game_family = target_family;
  if sid is not null then
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', true);
  end if;
  -- An open round of the same mode (from this week or an earlier one) is
  -- resumed and spends nothing.
  select s.id into sid from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.game_family = target_family
      and s.completed_at is null;
  if sid is not null then
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', true);
  end if;

  -- Weekly budget. Taken after the per-mode lock on every path, so the lock
  -- order is fixed; usage is read again under it (READ COMMITTED: a new
  -- snapshot per statement sees a concurrent start that just committed).
  perform pg_advisory_xact_lock(hashtextextended('game_v2_budget:' || actor.caller_couple::text, 0));
  usage := private.game_v2_week_usage(actor.caller_couple, at_time);
  if target_family = 'per_voi' and not (usage->>'per_voi_available')::boolean then
    raise exception using errcode = 'P0001', message = 'weekly per voi played',
      detail = 'resets_on=' || (usage->>'resets_on');
  end if;
  if target_family <> 'per_voi' and not (usage->>'free_available')::boolean then
    raise exception using errcode = 'P0001', message = 'weekly allowance exhausted',
      detail = 'resets_on=' || (usage->>'resets_on');
  end if;
  if (usage->>'open_count')::integer >= (usage->>'open_limit')::integer then
    raise exception using errcode = 'P0001', message = 'too many open rounds';
  end if;

  select count(*) into ordinal from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2;
  select case when count(*) % 2 = 0 then 'beatrice' else 'francesco' end into heavy
    from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.subject_heavy_role is not null;

  items := private.game_v2_select_items(actor.caller_couple, target_family, at_time, ordinal);
  if jsonb_array_length(items) < 5 then
    raise exception using errcode = 'P0001', message = 'not enough content';
  end if;
  items := private.game_v2_assign_subjects(actor.caller_couple, items, heavy);
  select array_agg(distinct x->>'source_type' order by x->>'source_type') into sources from jsonb_array_elements(items) x;
  source_kind := case when sources = array['curated'] then 'curated'
    when sources = array['couple_custom'] then 'couple_custom' else 'mixed' end;

  -- started_at follows the server clock: it is what the weekly usage counts.
  insert into public.game_sessions(couple_id, game_family, content_source, started_by_role, create_request_id,
    engine_version, subject_heavy_role, started_at)
  values (actor.caller_couple, target_family, source_kind, actor.caller_role, start_game_round.request_id, 2,
    case when exists (select 1 from jsonb_array_elements(items) x where x->>'mechanic' = 'prediction') then heavy end,
    at_time)
  returning id into sid;

  for e in select value from jsonb_array_elements(items) loop
    pos := pos + 1;
    subject := e->>'subject_role';
    insert into public.game_session_items(session_id, position, source_question_id, source_version,
      question_text, answer_kind, options, mechanic, subject_role, predict_text, family, source_type,
      source_ref, recipe_id, recipe_version, topic, perspective, depth, fingerprint, context)
    values (sid, pos, (e->>'source_question_id')::uuid, (e->>'source_version')::integer,
      private.game_v2_render(e->>'question_text', subject, actor.caller_couple), e->>'answer_kind',
      private.game_v2_render_options(e->'options', subject, actor.caller_couple), e->>'mechanic', subject,
      case when subject is not null then private.game_v2_render(e->>'predict_text', subject, actor.caller_couple) end,
      e->>'family', e->>'source_type', e->>'source_ref', e->>'recipe_id', (e->>'recipe_version')::integer,
      e->>'topic', coalesce('subject:' || subject, 'mutual'), (e->>'depth')::smallint, e->>'candidate_key',
      coalesce(e->'context', '{}'::jsonb));
  end loop;
  insert into public.game_session_sides(session_id, actor_role) values (sid, 'francesco'), (sid, 'beatrice');
  return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', false);
end;
$function$;

-- The two-argument helpers hardcoded the names; nothing calls them any more.
drop function if exists private.game_v2_render_options(jsonb, text);
drop function if exists private.game_v2_render(text, text);
drop function if exists private.game_v2_role_label(text);
