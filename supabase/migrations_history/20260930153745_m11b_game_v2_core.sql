-- M11B — Game V2 core: five-question rounds, first-class prediction, weekly
-- couple question, curated editorial catalog, Per voi (basic selector).
--
-- Candidate only. NOT applied to production by this mission.
--
-- Reuses, never duplicates, the M11A reciprocal session authority:
--   game_sessions / game_session_items / game_session_sides /
--   game_session_answers, save_game_session_answer,
--   complete_game_session_side, mark_game_session_reveal_seen,
--   get_game_session and the M11A.1 lock-free private.m11a_actor().
-- Every row stays keyed by couple + stable relationship role, so a legitimate
-- claim_us_role re-pair keeps sessions, answers, receipts, predictions,
-- weekly history and couple questions without any transfer.
--
-- Additive and forward-only: new tables/columns/functions, widened checks,
-- replaced function bodies with unchanged signatures. No row is deleted and
-- M11A / M11A.1 migration files are untouched.
--
-- Read RPCs (get_game_v2_home, get_weekly_question_state, the replaced
-- list_couple_questions / list_game_sessions / private.m11a_session_state)
-- take no row locks: PostgREST runs STABLE functions READ ONLY (M11A.1).

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Time authority. Server clock only; the client never sends a date.
-- ---------------------------------------------------------------------------

-- Single seam for "now" so boundary tests can pin the instant.
create function private.game_v2_clock()
returns timestamptz language sql stable set search_path = '' as $$ select now() $$;

-- Monday (Europe/Rome) of the week containing the instant. Turn change is
-- Monday 00:00 Europe/Rome, DST included, because the truncation happens on
-- the Rome wall-clock timestamp.
create function private.game_v2_week_start(at_time timestamptz)
returns date language sql stable set search_path = '' as $$
  select date_trunc('week', at_time at time zone 'Europe/Rome')::date;
$$;

-- Explicit stable anchor: week of Monday 2026-09-28 -> francesco,
-- 2026-10-05 -> beatrice, alternating forever. A missed week does not roll
-- over: the role is a pure function of the week.
create function private.game_v2_weekly_role(week_start date)
returns text language sql immutable set search_path = '' as $$
  select case when ((((week_start - date '2026-09-28') / 7) % 2) + 2) % 2 = 0
    then 'francesco' else 'beatrice' end;
$$;

create function private.game_v2_partner_role(target_role text)
returns text language sql immutable set search_path = '' as $$
  select case target_role when 'francesco' then 'beatrice' when 'beatrice' then 'francesco' end;
$$;

-- Same labels the client already uses for the two stable roles.
create function private.game_v2_role_label(target_role text)
returns text language sql immutable set search_path = '' as $$
  select case target_role when 'francesco' then 'Francesco' when 'beatrice' then 'Bea' end;
$$;

create function private.game_v2_families()
returns text[] language sql immutable set search_path = '' as $$
  select array['scopritevi', 'confrontatevi', 'ridete', 'quanto_mi_conosci', 'rivivete', 'e_se']::text[];
$$;

revoke all on function private.game_v2_clock() from public, anon, authenticated;
revoke all on function private.game_v2_week_start(timestamptz) from public, anon, authenticated;
revoke all on function private.game_v2_weekly_role(date) from public, anon, authenticated;
revoke all on function private.game_v2_partner_role(text) from public, anon, authenticated;
revoke all on function private.game_v2_role_label(text) from public, anon, authenticated;
revoke all on function private.game_v2_families() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Editorial authority: cooldown classes + curated catalog.
-- ---------------------------------------------------------------------------

-- Centralized anti-repeat tuning. Days since the item was last materialized
-- in a round of the same couple:
--   item_days   exact fingerprint (same prompt, same source object)
--   recipe_days same recipe on any source object
--   source_days same source object through any recipe
--   topic_days  same topic (soft: lowers the score, never blocks)
create table public.game_v2_cooldowns (
  cooldown_class text primary key check (cooldown_class ~ '^[a-z_]+$'),
  item_days integer not null check (item_days >= 0),
  recipe_days integer not null check (recipe_days >= 0),
  source_days integer not null check (source_days >= 0),
  topic_days integer not null check (topic_days >= 0),
  note text not null
);

insert into public.game_v2_cooldowns (cooldown_class, item_days, recipe_days, source_days, topic_days, note) values
  ('light', 30, 30, 0, 3, 'Prompt leggeri: tornano dopo circa un mese.'),
  ('standard', 60, 60, 0, 5, 'Prompt di media profondità: due mesi di riposo.'),
  ('deep', 120, 120, 0, 10, 'Domande profonde: quattro mesi prima di riproporle.'),
  ('custom', 180, 0, 180, 5, 'Domande scritte da voi: una volta giocate riposano sei mesi.'),
  ('context', 180, 7, 30, 5, 'Ricette su un vostro contesto: stessa ricetta+oggetto dopo sei mesi, stesso oggetto dopo un mese.'),
  ('longitudinal', 365, 60, 365, 14, 'Riproposta intenzionale di una risposta già rivelata: al massimo una volta l''anno per risposta.');

create table public.game_v2_catalog (
  id text primary key check (id ~ '^[a-z_]+-[0-9]{3}$'),
  version integer not null default 1 check (version > 0),
  family text not null check (family = any (private.game_v2_families())),
  source_type text not null default 'curated' check (source_type = 'curated'),
  mechanic text not null check (mechanic in ('reciprocal', 'prediction')),
  answer_kind text not null check (answer_kind in ('open', 'choice')),
  question_text text not null check (char_length(btrim(question_text)) between 12 and 240),
  predict_text text check (predict_text is null or char_length(btrim(predict_text)) between 12 and 240),
  options jsonb not null default '[]'::jsonb,
  depth smallint not null check (depth between 1 and 3),
  topic text not null check (topic ~ '^[a-z_]+$'),
  cooldown_class text not null references public.game_v2_cooldowns(cooldown_class),
  longitudinal boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (split_part(id, '-', 1) = family),
  check (case when jsonb_typeof(options) = 'array' then
    (answer_kind = 'open' and jsonb_array_length(options) = 0) or
    (answer_kind = 'choice' and jsonb_array_length(options) between 2 and 4)
    else false end),
  -- Prediction is only objectively comparable on a choice; the predictor's
  -- wording must name the subject.
  check (mechanic = 'reciprocal' and predict_text is null
      or mechanic = 'prediction' and answer_kind = 'choice' and family = 'quanto_mi_conosci'
         and predict_text like '%{subject}%'),
  check (mechanic = 'prediction' or family <> 'quanto_mi_conosci')
);

comment on table public.game_v2_catalog is
  'M11B curated Game V2 prompts. Source of truth: supabase/game-v2/catalog/*.json (generated seed). Retire a prompt with active=false; bump version for a new wording in a new migration. Server-only.';

alter table public.game_v2_cooldowns enable row level security;
alter table public.game_v2_cooldowns force row level security;
alter table public.game_v2_catalog enable row level security;
alter table public.game_v2_catalog force row level security;
revoke all on public.game_v2_cooldowns, public.game_v2_catalog from public, anon, authenticated;

-- game-v2-catalog:begin (generated by scripts/build-game-v2-catalog-sql.mjs from supabase/game-v2/catalog; do not edit by hand)
insert into public.game_v2_catalog (id, version, family, source_type, mechanic, answer_kind, question_text, predict_text, options, depth, topic, cooldown_class, longitudinal) values
  ('confrontatevi-001', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Se avessimo una domenica completamente libera e nessun impegno, cosa vorresti davvero che facessimo?', null, '["Non uscire di casa fino a sera","Partire presto per un posto nuovo","Cucinare qualcosa di lungo e complicato","Vedere gente e rientrare tardi"]'::jsonb, 1, 'domenica_libera', 'light', false),
  ('confrontatevi-002', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Abbiamo tre giorni completamente liberi: preferiresti scoprire un posto nuovo che nessuno dei due conosce o tornare in un posto che per noi significa già qualcosa?', null, '["Un posto nuovo per entrambi","Un posto che è già nostro"]'::jsonb, 2, 'posto_nuovo_o_nostro', 'standard', false),
  ('confrontatevi-003', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Se dovessimo proteggere una sola abitudine nostra anche durante un periodo molto impegnato, quale sceglieresti?', null, '[]'::jsonb, 3, 'abitudine_da_proteggere', 'deep', true),
  ('confrontatevi-004', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Dopo una discussione, cosa ti aiuta davvero a tornare vicini?', null, '["Parlarne subito, anche se è scomodo","Un po’ di spazio, poi parlarne","Un gesto prima delle parole","Ridere di qualcosa e ripartire"]'::jsonb, 3, 'riavvicinarsi', 'deep', false),
  ('confrontatevi-005', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Qualcuno ci regala una serata a sorpresa. Cosa speri che abbia scelto per noi?', null, '["Qualcosa che non abbiamo mai fatto","Il nostro posto di sempre","Una cosa semplice fatta benissimo"]'::jsonb, 1, 'serata_regalata', 'light', false),
  ('confrontatevi-006', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Cosa rende speciale, per te, una giornata normale tra noi?', null, '[]'::jsonb, 2, 'giornata_normale', 'standard', true),
  ('confrontatevi-007', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Se potessimo vivere un anno in un’altra città, cosa cercheresti per prima cosa?', null, '["La natura a due passi","Una città viva fino a tardi","Un posto lento dove conoscere tutti","Non importa dove, basta cambiare ritmo"]'::jsonb, 2, 'un_anno_altrove', 'standard', false),
  ('confrontatevi-008', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quando uno dei due arriva a sera senza energie, cosa dovrebbe fare l’altro?', null, '["Prendere in mano la serata senza chiedere","Chiedere cosa serve davvero","Lasciare spazio e silenzio","Portarci fuori a cambiare aria"]'::jsonb, 2, 'stanchezza_dell_altro', 'standard', false),
  ('confrontatevi-009', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Qual è il regalo che ti emoziona di più: quello che desideravi da tempo o quello a cui non avevi mai pensato?', null, '["Quello che desideravo da tempo","Quello a cui non avevo mai pensato"]'::jsonb, 1, 'regalo_migliore', 'light', false),
  ('confrontatevi-010', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Tra dieci anni, cosa vorresti che fosse ancora esattamente uguale tra noi?', null, '[]'::jsonb, 3, 'restare_uguale', 'deep', true),
  ('e_se-001', 1, 'e_se', 'curated', 'reciprocal', 'choice', 'Abbiamo un weekend libero ma possiamo scegliere una sola cosa: fare finalmente qualcosa che rimandiamo da mesi oppure partire senza programmare quasi nulla. Cosa scegli?', null, '["La cosa che rimandiamo da mesi","Partire senza programma"]'::jsonb, 2, 'weekend_una_scelta', 'standard', false),
  ('e_se-002', 1, 'e_se', 'curated', 'reciprocal', 'open', 'Se potessimo vivere sei mesi in un posto dove non conosciamo nessuno, cosa speri che scopriremmo di noi?', null, '[]'::jsonb, 3, 'sei_mesi_altrove', 'deep', false),
  ('e_se-003', 1, 'e_se', 'curated', 'reciprocal', 'open', 'Se tra un anno ci guardassimo indietro, quale piccola cosa vorresti che avessimo iniziato a fare adesso?', null, '[]'::jsonb, 2, 'piccolo_inizio', 'standard', true),
  ('e_se-004', 1, 'e_se', 'curated', 'reciprocal', 'choice', 'Arriva una somma che basta per un solo grande cambiamento. Quale scegli?', null, '["Una casa diversa","Un anno sabbatico insieme","Un progetto tutto nostro","Metterla da parte e dormire tranquilli"]'::jsonb, 2, 'grande_cambiamento', 'standard', false),
  ('e_se-005', 1, 'e_se', 'curated', 'reciprocal', 'open', 'Se potessi fare una sola domanda a noi due tra vent’anni, cosa chiederesti?', null, '[]'::jsonb, 3, 'noi_tra_vent_anni', 'deep', false),
  ('e_se-006', 1, 'e_se', 'curated', 'reciprocal', 'choice', 'Per un mese intero possiamo tenere una sola regola nuova in casa. Quale?', null, '["Niente telefoni a cena","Una sera a settimana decide solo uno dei due","Colazione insieme ogni giorno","Una cosa nuova ogni weekend"]'::jsonb, 1, 'regola_nuova', 'light', false),
  ('e_se-007', 1, 'e_se', 'curated', 'reciprocal', 'open', 'Se scrivessimo tre cose da fare insieme prima della fine dell’anno, qual è la prima che metteresti in lista?', null, '[]'::jsonb, 1, 'lista_di_fine_anno', 'light', false),
  ('e_se-008', 1, 'e_se', 'curated', 'reciprocal', 'choice', 'Ci propongono di scambiarci le vite quotidiane per una settimana. Come la prendi?', null, '["Accetto subito, voglio vedere com’è","Solo se posso tenere il mio letto","Preparo un manuale d’istruzioni","Scappo: la tua agenda mi spaventa"]'::jsonb, 1, 'scambio_di_vite', 'light', false),
  ('e_se-009', 1, 'e_se', 'curated', 'reciprocal', 'open', 'Se potessi regalarci un superpotere di coppia, come leggerci nel pensiero o non discutere mai sulla cena, quale sceglieresti?', null, '[]'::jsonb, 1, 'superpotere_di_coppia', 'light', false),
  ('e_se-010', 1, 'e_se', 'curated', 'reciprocal', 'open', 'C’è un sogno che hai messo da parte e che, se dipendesse solo da noi due, vorresti riprendere?', null, '[]'::jsonb, 3, 'sogno_da_riprendere', 'deep', true),
  ('quanto_mi_conosci-001', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando hai avuto una giornata pesante, cosa preferisci davvero da me nei primi dieci minuti?', 'Quando {subject} ha avuto una giornata pesante, cosa preferisce davvero da te nei primi dieci minuti?', '["Un abbraccio senza domande","Sfogarmi mentre mi ascolti","Un po’ di silenzio e di spazio","Qualcosa che mi distragga"]'::jsonb, 3, 'giornata_pesante', 'deep', false),
  ('quanto_mi_conosci-002', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Se avessi un pomeriggio libero solo per te, come lo useresti davvero?', 'Se {subject} avesse un pomeriggio libero solo per sé, come lo userebbe davvero?', '["Dormire senza sveglia","Camminare senza una meta","Riprendere una passione messa da parte","Vedere qualcuno che non vedo da tempo"]'::jsonb, 1, 'pomeriggio_per_se', 'light', false),
  ('quanto_mi_conosci-003', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Cosa ti mette più in difficoltà quando ricevi un regalo?', 'Cosa mette più in difficoltà {subject} quando riceve un regalo?', '["Aprirlo davanti a tutti","Non sapere come ricambiare","Far capire quanto mi piace","Niente, adoro i regali"]'::jsonb, 2, 'ricevere_regali', 'standard', false),
  ('quanto_mi_conosci-004', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'In un viaggio, qual è la parte che ti dà più gioia?', 'In un viaggio, qual è la parte che dà più gioia a {subject}?', '["Prepararlo nei dettagli","Il momento della partenza","Perdermi senza programma","Raccontarlo al ritorno"]'::jsonb, 1, 'gioia_del_viaggio', 'light', false),
  ('quanto_mi_conosci-005', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando qualcosa ti preoccupa, qual è il primo segnale che si vede da fuori?', 'Quando qualcosa preoccupa {subject}, qual è il primo segnale che si vede da fuori?', '["Dormo male","Parlo meno del solito","Mi metto a sistemare cose","Scherzo più del solito"]'::jsonb, 2, 'segnali_di_preoccupazione', 'standard', false),
  ('quanto_mi_conosci-006', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale di queste frasi vorresti sentirti dire più spesso?', 'Quale di queste frasi {subject} vorrebbe sentirsi dire più spesso?', '["«Ci penso io»","«Com’è andata davvero?»","«Ti ho pensato oggi»","«Andiamo?»"]'::jsonb, 2, 'frase_da_sentire', 'standard', false),
  ('quanto_mi_conosci-007', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Se potessi imparare una cosa da zero, senza nessuna fatica, quale sceglieresti?', 'Se {subject} potesse imparare una cosa da zero, senza nessuna fatica, quale sceglierebbe?', '["Suonare uno strumento","Parlare una lingua nuova","Cucinare davvero bene","Disegnare o dipingere"]'::jsonb, 1, 'imparare_da_zero', 'light', false),
  ('quanto_mi_conosci-008', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Cosa ti ricarica di più dopo una settimana piena?', 'Cosa ricarica di più {subject} dopo una settimana piena?', '["Una serata con gli amici","Una giornata senza piani","Fare qualcosa di fisico","Una cena solo noi due"]'::jsonb, 1, 'ricaricarsi', 'light', false),
  ('quanto_mi_conosci-009', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quando ti arrabbi con me, cosa vorresti che facessi per prima cosa?', 'Quando {subject} si arrabbia con te, cosa vorrebbe che facessi per prima cosa?', '["Chiedermi cosa è successo","Darmi un po’ di tempo","Abbracciarmi anche se resisto","Farmi ridere"]'::jsonb, 3, 'quando_mi_arrabbio', 'deep', false),
  ('quanto_mi_conosci-010', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Qual è la tua reazione istintiva davanti a un imprevisto?', 'Qual è la reazione istintiva di {subject} davanti a un imprevisto?', '["Preparo subito un piano B","Mi innervosisco, poi mi passa","Chiedo aiuto","Lo prendo come un’avventura"]'::jsonb, 2, 'imprevisti', 'standard', false),
  ('quanto_mi_conosci-011', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Di cosa hai più bisogno quando stai per affrontare qualcosa di importante?', 'Di cosa ha più bisogno {subject} quando sta per affrontare qualcosa di importante?', '["Sentirmi dire che andrà bene","Prepararmi senza distrazioni","Parlarne fino allo sfinimento","Non pensarci fino all’ultimo"]'::jsonb, 3, 'prima_di_una_prova', 'deep', false),
  ('quanto_mi_conosci-012', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale complimento ti fa più piacere ricevere?', 'Quale complimento fa più piacere a {subject}?', '["Su quello che ho costruito","Su come tratto le persone","Sul mio aspetto","Sul mio senso dell’umorismo"]'::jsonb, 2, 'complimento_preferito', 'standard', false),
  ('ridete-001', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Dobbiamo aprire un ristorante insieme. Chi dei due verrebbe licenziato per primo, e perché?', null, '[]'::jsonb, 1, 'ristorante', 'light', false),
  ('ridete-002', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Dobbiamo partecipare a un reality insieme. Quale sarebbe il motivo della nostra prima litigata in diretta?', null, '[]'::jsonb, 1, 'reality', 'light', false),
  ('ridete-003', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Siamo chiusi in una stanza della fuga e mancano due minuti. Chi dei due sta già dando la colpa all’altro?', null, '["{francesco}","{beatrice}","Tutti e due, a turno"]'::jsonb, 1, 'stanza_della_fuga', 'light', false),
  ('ridete-004', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Se la nostra storia diventasse un film, quale sarebbe la frase sulla locandina?', null, '[]'::jsonb, 1, 'film_su_noi', 'light', false),
  ('ridete-005', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Naufraghiamo su un’isola deserta. Chi dei due sopravvive più a lungo, e solo per testardaggine?', null, '["{francesco}","{beatrice}","Nessuno: litighiamo per l’unica noce di cocco"]'::jsonb, 1, 'isola_deserta', 'light', false),
  ('ridete-006', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Qual è la cosa più piccola e assurda che mi hai visto prendere terribilmente sul serio?', null, '[]'::jsonb, 1, 'piccole_manie', 'light', false),
  ('ridete-007', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Formiamo una band. Come si chiama, e qual è il titolo del nostro primo disco?', null, '[]'::jsonb, 1, 'band', 'light', false),
  ('ridete-008', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Chi dei due si farebbe scoprire per primo mentre organizza una festa a sorpresa per l’altro?', null, '["{francesco}","{beatrice}","Nessuno: siamo spie perfette"]'::jsonb, 1, 'festa_a_sorpresa', 'light', false),
  ('ridete-009', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Un documentario sugli animali racconta la mia routine del mattino. Cosa dice la voce narrante?', null, '[]'::jsonb, 1, 'documentario', 'light', false),
  ('ridete-010', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Ci ritroviamo senza telefono e senza soldi in una città sconosciuta. Qual è il tuo primo istinto?', null, '["Chiedere aiuto al primo sorriso","Camminare finché non riconosco qualcosa","Trasformarlo subito in un’avventura","Sedermi e aspettare che ci pensi tu"]'::jsonb, 1, 'citta_sconosciuta', 'light', false),
  ('rivivete-001', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è un giorno qualunque tra noi che rivivresti volentieri, proprio perché non aveva niente di speciale?', null, '[]'::jsonb, 2, 'giorno_qualunque', 'standard', false),
  ('rivivete-002', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è la prima cosa di me che ti è rimasta impressa, prima ancora di conoscermi bene?', null, '[]'::jsonb, 2, 'prima_impressione', 'standard', false),
  ('rivivete-003', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'C’è stato un momento in cui hai capito che tra noi stava diventando una cosa seria? Cosa stavamo facendo?', null, '[]'::jsonb, 3, 'diventare_seri', 'deep', false),
  ('rivivete-004', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale nostra frase, battuta o parola inventata useresti per spiegare noi due a qualcuno?', null, '[]'::jsonb, 1, 'lessico_nostro', 'light', false),
  ('rivivete-005', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Se potessi rivivere una sola serata passata insieme, quale sceglieresti, e cambieresti qualcosa?', null, '[]'::jsonb, 2, 'serata_da_rivivere', 'standard', false),
  ('rivivete-006', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è una volta in cui ho fatto qualcosa che proprio non ti aspettavi da me?', null, '[]'::jsonb, 2, 'sorprese_ricevute', 'standard', false),
  ('rivivete-007', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Pensando all’inizio di noi, cosa ti manca di più di quel periodo?', null, '["L’emozione di ogni messaggio","Non sapere ancora tutto dell’altro","Il tempo che sembrava infinito","Niente: preferisco noi adesso"]'::jsonb, 2, 'il_nostro_inizio', 'standard', false),
  ('rivivete-008', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è un luogo che ormai non riesci più a vedere senza pensare a noi?', null, '[]'::jsonb, 1, 'luoghi_nostri', 'light', false),
  ('scopritevi-001', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'C’è qualcosa che faccio per te che probabilmente considero insignificante, ma che per te conta molto più di quanto penso?', null, '[]'::jsonb, 3, 'piccoli_gesti', 'deep', true),
  ('scopritevi-002', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è una parte di te che pensi io abbia capito bene solo a metà?', null, '[]'::jsonb, 3, 'essere_capiti', 'deep', true),
  ('scopritevi-003', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'C’è qualcosa su cui hai cambiato idea nell’ultimo anno e che forse io continuo ad attribuire alla vecchia versione di te?', null, '[]'::jsonb, 3, 'cambiamento', 'deep', true),
  ('scopritevi-004', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è una cosa che ti riesce bene e che secondo te nessuno nota davvero?', null, '[]'::jsonb, 2, 'talenti_nascosti', 'standard', false),
  ('scopritevi-005', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale paura dell’infanzia oggi ti fa sorridere, e quale invece non se n’è mai andata del tutto?', null, '[]'::jsonb, 2, 'infanzia', 'standard', false),
  ('scopritevi-006', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quando ti senti davvero a casa, cosa c’è intorno a te: persone, rumori, odori, luce?', null, '[]'::jsonb, 1, 'sentirsi_a_casa', 'light', false),
  ('scopritevi-007', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è un complimento che ti è rimasto in testa per anni, e chi te l’aveva fatto?', null, '[]'::jsonb, 2, 'complimenti_rimasti', 'standard', false),
  ('scopritevi-008', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è una piccola abitudine che hai quando nessuno ti vede e che non mi hai mai raccontato?', null, '[]'::jsonb, 1, 'abitudini_segrete', 'light', false),
  ('scopritevi-009', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'In quale momento della settimana ti riconosci di più, e in quale invece ti senti un po’ fuori posto?', null, '[]'::jsonb, 2, 'riconoscersi', 'standard', true),
  ('scopritevi-010', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è una domanda che vorresti che ti facessi più spesso?', null, '[]'::jsonb, 2, 'essere_visti', 'standard', true),
  ('scopritevi-011', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Quando ricevi una bella notizia, qual è la prima cosa che ti viene da fare?', null, '["Dirla subito a qualcuno","Tenermela un po’ per me","Festeggiarla con qualcosa di concreto","Pensare già a cosa viene dopo"]'::jsonb, 1, 'belle_notizie', 'light', false),
  ('scopritevi-012', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Quale di questi gesti ti arriva più dritto al cuore?', null, '["Una parola detta al momento giusto","Un gesto pratico che mi alleggerisce la giornata","Tempo senza telefono, solo per noi","Una sorpresa piccola ma pensata"]'::jsonb, 2, 'linguaggio_affetto', 'standard', false)
on conflict (id) do nothing;
-- game-v2-catalog:end

-- ---------------------------------------------------------------------------
-- 3. Couple questions become classifiable; weekly origin.
-- ---------------------------------------------------------------------------

alter table public.couple_questions add column origin text not null default 'library';
alter table public.couple_questions add column week_start date;
alter table public.couple_questions add column families text[];

-- Existing M11A questions keep their content; they get the families their
-- format already fits (open -> Scopritevi; choice -> Scopritevi + Confrontatevi).
update public.couple_questions
  set families = case when answer_kind = 'choice'
    then array['scopritevi', 'confrontatevi']::text[] else array['scopritevi']::text[] end
  where families is null;

alter table public.couple_questions alter column families set not null;
alter table public.couple_questions alter column families set default array['scopritevi']::text[];
alter table public.couple_questions add constraint couple_questions_origin_check
  check (origin in ('library', 'weekly'));
alter table public.couple_questions add constraint couple_questions_weekly_shape_check
  check ((origin = 'library' and week_start is null)
      or (origin = 'weekly' and week_start is not null and extract(isodow from week_start) = 1
          and author_role = private.game_v2_weekly_role(week_start)));
alter table public.couple_questions add constraint couple_questions_families_check
  check (cardinality(families) between 1 and 6 and families <@ private.game_v2_families()
    and ('quanto_mi_conosci' <> all (families) or answer_kind = 'choice'));

-- One weekly question per couple per week, whoever tries.
create unique index couple_questions_weekly_key
  on public.couple_questions (couple_id, week_start) where origin = 'weekly';

-- ---------------------------------------------------------------------------
-- 4. Sessions and immutable item snapshots.
-- ---------------------------------------------------------------------------

alter table public.game_sessions add column engine_version smallint not null default 1;
alter table public.game_sessions add column subject_heavy_role text;
alter table public.game_sessions add constraint game_sessions_engine_version_check
  check (engine_version in (1, 2));
alter table public.game_sessions add constraint game_sessions_subject_heavy_role_check
  check (subject_heavy_role is null or subject_heavy_role in ('francesco', 'beatrice'));
alter table public.game_sessions drop constraint game_sessions_content_source_check;
alter table public.game_sessions add constraint game_sessions_content_source_check
  check (content_source in ('curated', 'partner_knowledge', 'couple_custom', 'us_context', 'mixed'));
alter table public.game_sessions add constraint game_sessions_v2_family_check
  check (engine_version = 1 or game_family = 'per_voi' or game_family = any (private.game_v2_families()));

-- At most one open Game V2 round per couple and mode: a second tap, the
-- partner tapping at the same instant or a retry all resume the same round.
create unique index game_sessions_v2_open_key
  on public.game_sessions (couple_id, game_family) where engine_version = 2 and completed_at is null;

alter table public.game_session_items add column mechanic text not null default 'reciprocal';
alter table public.game_session_items add column subject_role text;
alter table public.game_session_items add column predict_text text;
alter table public.game_session_items add column family text;
alter table public.game_session_items add column source_type text;
alter table public.game_session_items add column source_ref text;
alter table public.game_session_items add column recipe_id text;
alter table public.game_session_items add column recipe_version integer;
alter table public.game_session_items add column topic text;
alter table public.game_session_items add column perspective text;
alter table public.game_session_items add column depth smallint;
alter table public.game_session_items add column fingerprint text;
alter table public.game_session_items add column context jsonb not null default '{}'::jsonb;

alter table public.game_session_items add constraint game_session_items_mechanic_check
  check (mechanic = 'reciprocal' and subject_role is null and predict_text is null
      or mechanic = 'prediction' and answer_kind = 'choice' and subject_role in ('francesco', 'beatrice')
         and char_length(btrim(predict_text)) between 1 and 300);
alter table public.game_session_items add constraint game_session_items_family_check
  check (family is null or family = any (private.game_v2_families()));
alter table public.game_session_items add constraint game_session_items_context_check
  check (jsonb_typeof(context) = 'object');

create index game_session_items_source_question_idx on public.game_session_items (source_question_id)
  where source_question_id is not null;

-- Historical immutability: nothing rewrites a played snapshot, not even a
-- future server function by mistake.
create function private.game_v2_items_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'game session items are immutable';
end;
$$;
revoke all on function private.game_v2_items_immutable() from public, anon, authenticated;
create trigger game_session_items_immutable before update on public.game_session_items
  for each row execute function private.game_v2_items_immutable();

-- ---------------------------------------------------------------------------
-- 5. Reveal-safe state (replaces the M11A body; same signature).
-- ---------------------------------------------------------------------------

-- The ONLY place partner answer fields leave the database. Before both sides
-- complete they are SQL NULL, prediction match included. Prediction items
-- show each person the prompt of their own role: the subject answers about
-- themselves, the predictor answers "what did they choose?".
create or replace function private.m11a_session_state(target_session_id uuid, current_couple uuid, caller_role text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'couple_id', s.couple_id, 'game_family', s.game_family,
    'content_source', s.content_source, 'started_by_role', s.started_by_role,
    'started_at', s.started_at, 'completed_at', s.completed_at,
    'engine_version', s.engine_version, 'subject_heavy_role', s.subject_heavy_role,
    'my_role', caller_role,
    'my_complete', mine.completed_at is not null, 'my_completed_at', mine.completed_at,
    'partner_complete', partner.completed_at is not null, 'partner_completed_at', partner.completed_at,
    'reveal_ready', s.completed_at is not null, 'my_reveal_seen_at', mine.reveal_seen_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'question_text', i.question_text,
        'answer_kind', i.answer_kind, 'options', i.options,
        'source_question_id', i.source_question_id, 'source_version', i.source_version,
        'mechanic', i.mechanic, 'family', coalesce(i.family, s.game_family),
        'subject_role', i.subject_role, 'predict_text', i.predict_text,
        'my_item_role', case when i.mechanic <> 'prediction' then 'mutual'
          when i.subject_role = caller_role then 'subject' else 'predictor' end,
        'my_prompt', case when i.mechanic = 'prediction' and i.subject_role <> caller_role
          then i.predict_text else i.question_text end,
        'source_type', i.source_type, 'depth', i.depth, 'context', i.context,
        'my_answer_text', a.answer_text, 'my_answer_index', a.answer_index,
        'partner_answer_text', case when s.completed_at is not null then pa.answer_text end,
        'partner_answer_index', case when s.completed_at is not null then pa.answer_index end,
        'prediction_matched', case when s.completed_at is not null and i.mechanic = 'prediction'
          and a.answer_index is not null and pa.answer_index is not null
          then a.answer_index = pa.answer_index end
      ) order by i.position) from public.game_session_items i
      left join public.game_session_answers a on a.item_id = i.id and a.actor_role = caller_role
      left join public.game_session_answers pa on pa.item_id = i.id and pa.actor_role <> caller_role
      where i.session_id = s.id
    ), '[]'::jsonb)
  )
  from public.game_sessions s
  join public.game_session_sides mine on mine.session_id = s.id and mine.actor_role = caller_role
  join public.game_session_sides partner on partner.session_id = s.id and partner.actor_role <> caller_role
  where s.id = target_session_id and s.couple_id = current_couple;
$$;
revoke all on function private.m11a_session_state(uuid, uuid, text) from public, anon, authenticated;

create function private.game_v2_session_summary(target_session_id uuid, current_couple uuid, caller_role text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'game_family', s.game_family, 'engine_version', s.engine_version,
    'started_by_role', s.started_by_role, 'started_at', s.started_at, 'completed_at', s.completed_at,
    'my_complete', mine.completed_at is not null,
    'partner_complete', partner.completed_at is not null,
    'reveal_ready', s.completed_at is not null,
    'my_reveal_seen_at', mine.reveal_seen_at,
    'item_count', (select count(*) from public.game_session_items i where i.session_id = s.id),
    'my_answered_count', (select count(*) from public.game_session_items i
      join public.game_session_answers a on a.item_id = i.id and a.actor_role = caller_role
      where i.session_id = s.id))
  from public.game_sessions s
  join public.game_session_sides mine on mine.session_id = s.id and mine.actor_role = caller_role
  join public.game_session_sides partner on partner.session_id = s.id and partner.actor_role <> caller_role
  where s.id = target_session_id and s.couple_id = current_couple;
$$;
revoke all on function private.game_v2_session_summary(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Sealed weekly questions and the couple library.
-- ---------------------------------------------------------------------------

-- A weekly question stays sealed for the non-author until a session contains
-- it: that is the moment it first appears in gameplay.
create function private.game_v2_question_sealed(target_question_id uuid, question_origin text,
  question_author text, caller_role text)
returns boolean language sql stable set search_path = '' as $$
  select question_origin = 'weekly' and question_author <> caller_role
    and not exists (select 1 from public.game_session_items i where i.source_question_id = target_question_id);
$$;
revoke all on function private.game_v2_question_sealed(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.list_couple_questions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor record; result jsonb;
begin
  select * into actor from private.m11a_actor();
  select coalesce(jsonb_agg(
      case when private.game_v2_question_sealed(q.id, q.origin, q.author_role, actor.caller_role)
        then jsonb_build_object('id', q.id, 'sealed', true, 'origin', q.origin,
          'author_role', q.author_role, 'week_start', q.week_start, 'created_at', q.created_at)
        else private.m11a_question_json(q) || jsonb_build_object('sealed', false, 'origin', q.origin,
          'week_start', q.week_start, 'families', to_jsonb(q.families))
      end order by q.created_at desc, q.id desc), '[]'::jsonb)
    into result from public.couple_questions q
    where q.couple_id = actor.caller_couple and q.archived_at is null;
  return result;
end;
$$;

-- Library list stays read-only and lock-free; adds the Game V2 fields.
create or replace function public.list_game_sessions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor record; result jsonb;
begin
  select * into actor from private.m11a_actor();
  select coalesce(jsonb_agg(row_data.data order by row_data.started_at desc, row_data.id desc), '[]'::jsonb)
    into result from (
      select s.id, s.started_at, private.game_v2_session_summary(s.id, actor.caller_couple, actor.caller_role)
        || jsonb_build_object('content_source', s.content_source, 'question_preview', first_item.question_text) data
      from public.game_sessions s
      left join lateral (select i.question_text from public.game_session_items i
        where i.session_id = s.id order by i.position limit 1) first_item on true
      where s.couple_id = actor.caller_couple
      order by s.started_at desc, s.id desc limit 50
    ) row_data;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Weekly question ("Domanda della settimana").
-- ---------------------------------------------------------------------------

create function private.game_v2_valid_families(raw_families text[], target_kind text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare cleaned text[];
begin
  if raw_families is null or cardinality(raw_families) = 0 then
    raise exception using errcode = '22023', message = 'invalid families';
  end if;
  select coalesce(array_agg(f order by array_position(private.game_v2_families(), f)), '{}')
    into cleaned from (select distinct unnest(raw_families) f) x;
  if not cleaned <@ private.game_v2_families() or cardinality(cleaned) = 0 then
    raise exception using errcode = '22023', message = 'invalid families';
  end if;
  if 'quanto_mi_conosci' = any (cleaned) and target_kind <> 'choice' then
    raise exception using errcode = '22023', message = 'prediction needs choices';
  end if;
  return cleaned;
end;
$$;
revoke all on function private.game_v2_valid_families(text[], text) from public, anon, authenticated;

-- The author sees their own question; the partner only knows one exists.
create function private.game_v2_weekly_state(current_couple uuid, caller_role text, at_time timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  with w as (
    select private.game_v2_week_start(at_time) as week_start
  ), q as (
    select cq.* from public.couple_questions cq, w
    where cq.couple_id = current_couple and cq.origin = 'weekly' and cq.week_start = w.week_start
  )
  select jsonb_build_object(
    'week_start', w.week_start,
    'next_unlock', w.week_start + 7,
    'assigned_role', private.game_v2_weekly_role(w.week_start),
    'next_role', private.game_v2_weekly_role(w.week_start + 7),
    'my_turn', private.game_v2_weekly_role(w.week_start) = caller_role,
    'created', q.id is not null,
    'created_by_me', q.id is not null and q.author_role = caller_role,
    'partner_left_question', q.id is not null and q.author_role <> caller_role,
    'created_at', q.created_at,
    'my_question', case when q.author_role = caller_role then jsonb_build_object(
      'id', q.id, 'question_text', q.question_text, 'answer_kind', q.answer_kind,
      'options', q.options, 'families', to_jsonb(q.families), 'archived', q.archived_at is not null) end
  ) from w left join q on true;
$$;
revoke all on function private.game_v2_weekly_state(uuid, text, timestamptz) from public, anon, authenticated;

create function public.get_weekly_question_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor record;
begin
  select * into actor from private.m11a_actor();
  return private.game_v2_weekly_state(actor.caller_couple, actor.caller_role, private.game_v2_clock());
end;
$$;

-- The only creation path for new couple questions. Assigned role and week are
-- derived server-side; a retry with the same request id returns the original
-- result even if it arrives after the Monday boundary.
create function public.create_weekly_question(request_id uuid, question_text text, answer_kind text,
  options jsonb, families text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; normalized jsonb; cleaned_families text[]; week date; existing public.couple_questions%rowtype;
  at_time timestamptz := private.game_v2_clock();
begin
  select * into actor from private.m11a_actor_locked();
  if request_id is null then raise exception using errcode = '22023', message = 'request id required'; end if;
  normalized := private.m11a_valid_options(answer_kind, question_text, options);
  cleaned_families := private.game_v2_valid_families(families, answer_kind);
  -- Serialize every weekly write of the couple (double taps, both partners,
  -- a retry racing its original); the partial unique index stays the final
  -- authority.
  perform pg_advisory_xact_lock(hashtextextended('game_v2_weekly:' || actor.caller_couple::text, 0));

  select * into existing from public.couple_questions q
    where q.couple_id = actor.caller_couple and q.author_role = actor.caller_role
      and q.create_request_id = create_weekly_question.request_id;
  if existing.id is not null then
    if existing.origin <> 'weekly' or existing.question_text <> btrim(create_weekly_question.question_text)
      or existing.answer_kind <> create_weekly_question.answer_kind or existing.options <> normalized
      or existing.families <> cleaned_families then
      raise exception using errcode = '22023', message = 'request already used';
    end if;
    return private.game_v2_weekly_state(actor.caller_couple, actor.caller_role, at_time)
      || jsonb_build_object('question_id', existing.id, 'replayed', true);
  end if;

  week := private.game_v2_week_start(at_time);
  if private.game_v2_weekly_role(week) <> actor.caller_role then
    raise exception using errcode = '42501', message = 'not your turn';
  end if;
  if exists (select 1 from public.couple_questions q
      where q.couple_id = actor.caller_couple and q.origin = 'weekly' and q.week_start = week) then
    raise exception using errcode = '23505', message = 'weekly question already created';
  end if;
  insert into public.couple_questions(couple_id, author_role, create_request_id, question_text,
    answer_kind, options, origin, week_start, families)
  values (actor.caller_couple, actor.caller_role, create_weekly_question.request_id,
    btrim(create_weekly_question.question_text), create_weekly_question.answer_kind, normalized,
    'weekly', week, cleaned_families)
  returning * into existing;
  return private.game_v2_weekly_state(actor.caller_couple, actor.caller_role, at_time)
    || jsonb_build_object('question_id', existing.id, 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Per voi / family round selector (deterministic).
-- ---------------------------------------------------------------------------

create type private.game_v2_candidate as (
  candidate_key text,
  family text,
  mechanic text,
  answer_kind text,
  question_text text,
  predict_text text,
  options jsonb,
  depth smallint,
  topic text,
  source_type text,
  source_ref text,
  recipe_id text,
  recipe_version integer,
  source_question_id uuid,
  source_version integer,
  context jsonb,
  cooldown_class text,
  base_score integer,
  score integer,
  cooled boolean,
  last_played timestamptz
);

-- Explicit US-context adapters plug in here (M11C). M11B has none: no
-- personalization is faked before the adapters exist.
create function private.game_v2_context_candidates(target_couple uuid, target_family text, at_time timestamptz)
returns setof private.game_v2_candidate language sql stable set search_path = '' as $$
  select null::private.game_v2_candidate where false;
$$;

create function private.game_v2_candidates(target_couple uuid, target_family text, at_time timestamptz)
returns setof private.game_v2_candidate language sql stable set search_path = '' as $$
  select ('catalog:' || c.id), c.family, c.mechanic, c.answer_kind, c.question_text, c.predict_text,
    c.options, c.depth, c.topic, 'curated', c.id, c.id, c.version, null::uuid, null::integer,
    '{}'::jsonb, c.cooldown_class, 50 + 3 * (c.depth - 1), null::integer, null::boolean, null::timestamptz
  from public.game_v2_catalog c
  where c.active and c.source_type = 'curated' and (target_family = 'per_voi' or c.family = target_family)
  union all
  -- Couple-authored questions (weekly and M11A library). Unplayed ones are
  -- the most authentic content available and rank first.
  select ('custom:' || q.id::text), fam.family,
    case when fam.family = 'quanto_mi_conosci' then 'prediction' else 'reciprocal' end,
    q.answer_kind, q.question_text,
    case when fam.family = 'quanto_mi_conosci' then q.question_text end,
    q.options, 2::smallint, ('custom_' || replace(q.id::text, '-', '_')), 'couple_custom', q.id::text,
    null::text, null::integer, q.id, q.version,
    jsonb_build_object('author_role', q.author_role, 'origin', q.origin),
    'custom',
    case when played.at is not null then 35 when q.origin = 'weekly' then 95 else 85 end,
    null::integer, null::boolean, null::timestamptz
  from public.couple_questions q
  cross join lateral (select case when target_family = 'per_voi' then q.families[1] else target_family end as family) fam
  left join lateral (select max(s.started_at) as at from public.game_session_items i
    join public.game_sessions s on s.id = i.session_id where i.source_question_id = q.id) played on true
  where q.couple_id = target_couple and q.archived_at is null
    and (target_family = 'per_voi' or target_family = any (q.families))
    and (fam.family <> 'quanto_mi_conosci' or q.answer_kind = 'choice')
  union all
  select * from private.game_v2_context_candidates(target_couple, target_family, at_time);
$$;

-- Scores every candidate against the couple's Game V2 history. Deterministic:
-- the tie-break jitter is a hash of couple, candidate and round ordinal, so
-- equal content rotates across rounds without depending on random().
create function private.game_v2_scored_candidates(target_couple uuid, target_family text, at_time timestamptz,
  round_ordinal integer)
returns setof private.game_v2_candidate language sql stable set search_path = '' as $$
  with hist as (
    select i.fingerprint, i.recipe_id, i.source_type, i.source_ref, i.topic, s.started_at
    from public.game_session_items i join public.game_sessions s on s.id = i.session_id
    where s.couple_id = target_couple and s.engine_version = 2
  )
  select c.candidate_key, c.family, c.mechanic, c.answer_kind, c.question_text, c.predict_text, c.options,
    c.depth, c.topic, c.source_type, c.source_ref, c.recipe_id, c.recipe_version, c.source_question_id,
    c.source_version, c.context, c.cooldown_class, c.base_score,
    c.base_score
      + (('x' || substr(md5(target_couple::text || ':' || c.candidate_key || ':' || round_ordinal::text), 1, 2))::bit(8)::integer % 12)
      - case when h.last_topic > at_time - make_interval(days => cd.topic_days) then 15 else 0 end,
    coalesce(h.last_exact > at_time - make_interval(days => cd.item_days), false)
      or coalesce(c.recipe_id is not null and h.last_recipe > at_time - make_interval(days => cd.recipe_days), false)
      or coalesce(h.last_source > at_time - make_interval(days => cd.source_days), false),
    greatest(h.last_exact, h.last_recipe, h.last_source)
  from private.game_v2_candidates(target_couple, target_family, at_time) c
  join public.game_v2_cooldowns cd on cd.cooldown_class = c.cooldown_class
  cross join lateral (
    select max(hist.started_at) filter (where hist.fingerprint = c.candidate_key) as last_exact,
      max(hist.started_at) filter (where c.recipe_id is not null and hist.recipe_id = c.recipe_id) as last_recipe,
      max(hist.started_at) filter (where hist.source_type = c.source_type and hist.source_ref = c.source_ref) as last_source,
      max(hist.started_at) filter (where hist.topic = c.topic) as last_topic
    from hist
  ) h;
$$;

-- Five items. Pass 0 seeds the round (Per voi: one unplayed couple question
-- and one prediction when eligible; every round: one light opener). Pass 1
-- fills by quality under every cooldown and diversity rule; pass 2 relaxes
-- cooldowns (least recently played first); pass 3 relaxes diversity, so a
-- round is always possible while the curated fallback exists.
-- Quality beats source quotas: caps only stop one source or depth crowding
-- the round, nothing forces a fixed mix.
create function private.game_v2_select_items(target_couple uuid, target_family text, at_time timestamptz,
  round_ordinal integer)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  picked jsonb := '[]'::jsonb; keys text[] := '{}'; fams text[] := '{}'; topics text[] := '{}';
  sources text[] := '{}'; n_custom integer := 0; n_context integer := 0; n_pred integer := 0;
  n_deep integer := 0; n_light integer := 0;
  pass integer; seed integer; r private.game_v2_candidate;
  per_voi boolean := target_family = 'per_voi';
  fam_cap integer := case when target_family = 'per_voi' then 2 else 5 end;
begin
  for pass in 0..3 loop
    for seed in 1..3 loop
      exit when jsonb_array_length(picked) >= 5;
      continue when pass > 0 and seed > 1;
      continue when pass = 0 and not per_voi and seed < 3;
      for r in
        select * from private.game_v2_scored_candidates(target_couple, target_family, at_time, round_ordinal) c
        where (pass >= 2 or not c.cooled)
          and (pass <> 0 or (seed = 1 and c.source_type = 'couple_custom' and c.base_score >= 85)
                          or (seed = 2 and c.mechanic = 'prediction')
                          or (seed = 3 and c.depth = 1))
        order by case when pass >= 2 then c.last_played end asc nulls first, c.score desc, c.candidate_key
      loop
        exit when jsonb_array_length(picked) >= 5;
        continue when r.candidate_key = any (keys);
        continue when r.source_type <> 'curated' and (r.source_type || ':' || r.source_ref) = any (sources);
        continue when per_voi and r.mechanic = 'prediction' and n_pred >= 2;
        continue when per_voi and r.source_type = 'couple_custom' and n_custom >= 2;
        continue when per_voi and r.source_type not in ('curated', 'couple_custom') and n_context >= 2;
        if pass < 3 then
          continue when r.topic = any (topics);
          continue when (select count(*) from unnest(fams) f where f = r.family) >= fam_cap;
          continue when r.depth = 3 and n_deep >= 2;
          continue when r.depth = 1 and n_light >= 2;
        end if;
        picked := picked || jsonb_build_array(to_jsonb(r));
        keys := keys || r.candidate_key; fams := fams || r.family; topics := topics || r.topic;
        sources := sources || (r.source_type || ':' || r.source_ref);
        n_custom := n_custom + (r.source_type = 'couple_custom')::integer;
        n_context := n_context + (r.source_type not in ('curated', 'couple_custom'))::integer;
        n_pred := n_pred + (r.mechanic = 'prediction')::integer;
        n_deep := n_deep + (r.depth = 3)::integer;
        n_light := n_light + (r.depth = 1)::integer;
        exit when pass = 0;
      end loop;
    end loop;
  end loop;
  -- Lighter opening, meaningful middle, strongest later.
  return coalesce((select jsonb_agg(e order by (e->>'depth')::integer, (e->>'score')::integer, e->>'candidate_key')
    from jsonb_array_elements(picked) e), '[]'::jsonb);
end;
$$;

create function private.game_v2_render(template text, subject text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(template, '{subject}', coalesce(private.game_v2_role_label(subject), '{subject}')),
    '{francesco}', 'Francesco'), '{beatrice}', 'Bea');
$$;

create function private.game_v2_render_options(raw jsonb, subject text)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(private.game_v2_render(o.value, subject)) order by o.ordinality), '[]'::jsonb)
  from jsonb_array_elements_text(raw) with ordinality o;
$$;

revoke all on function private.game_v2_context_candidates(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.game_v2_candidates(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.game_v2_scored_candidates(uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function private.game_v2_select_items(uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function private.game_v2_render(text, text) from public, anon, authenticated;
revoke all on function private.game_v2_render_options(jsonb, text) from public, anon, authenticated;

-- Starts (or resumes) a five-question round. Couple, role, week and content
-- are all derived server-side; the client only names the mode and a request
-- id. Prediction subjects follow a deterministic 3/2 split whose heavier role
-- alternates across the couple's prediction rounds.
create function public.start_game_round(target_family text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; sid uuid; existing_family text; at_time timestamptz := private.game_v2_clock();
  ordinal integer; heavy text; items jsonb; e jsonb; pos integer := 0; pred integer := 0; subject text;
  sources text[]; source_kind text;
begin
  select * into actor from private.m11a_actor_locked();
  if request_id is null then raise exception using errcode = '22023', message = 'request id required'; end if;
  if target_family is null or not (target_family = 'per_voi' or target_family = any (private.game_v2_families())) then
    raise exception using errcode = '22023', message = 'invalid family';
  end if;

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
  -- A retry that raced its original resolves to the same round; so does the
  -- partner (or a second device) opening the same mode at the same instant.
  select s.id into sid from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.started_by_role = actor.caller_role
      and s.create_request_id = start_game_round.request_id and s.game_family = target_family;
  if sid is not null then
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', true);
  end if;
  select s.id into sid from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.game_family = target_family
      and s.completed_at is null;
  if sid is not null then
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', true);
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
  select array_agg(distinct x->>'source_type') into sources from jsonb_array_elements(items) x;
  source_kind := case when sources = array['curated'] then 'curated'
    when sources = array['couple_custom'] then 'couple_custom' else 'mixed' end;

  insert into public.game_sessions(couple_id, game_family, content_source, started_by_role, create_request_id,
    engine_version, subject_heavy_role)
  values (actor.caller_couple, target_family, source_kind, actor.caller_role, start_game_round.request_id, 2,
    case when exists (select 1 from jsonb_array_elements(items) x where x->>'mechanic' = 'prediction') then heavy end)
  returning id into sid;

  for e in select value from jsonb_array_elements(items) loop
    pos := pos + 1;
    subject := null;
    if e->>'mechanic' = 'prediction' then
      subject := case when pred % 2 = 0 then heavy else private.game_v2_partner_role(heavy) end;
      pred := pred + 1;
    end if;
    insert into public.game_session_items(session_id, position, source_question_id, source_version,
      question_text, answer_kind, options, mechanic, subject_role, predict_text, family, source_type,
      source_ref, recipe_id, recipe_version, topic, perspective, depth, fingerprint, context)
    values (sid, pos, (e->>'source_question_id')::uuid, (e->>'source_version')::integer,
      private.game_v2_render(e->>'question_text', subject), e->>'answer_kind',
      private.game_v2_render_options(e->'options', subject), e->>'mechanic', subject,
      case when subject is not null then private.game_v2_render(e->>'predict_text', subject) end,
      e->>'family', e->>'source_type', e->>'source_ref', e->>'recipe_id', (e->>'recipe_version')::integer,
      e->>'topic', coalesce('subject:' || subject, 'mutual'), (e->>'depth')::smallint, e->>'candidate_key',
      coalesce(e->'context', '{}'::jsonb));
  end loop;
  insert into public.game_session_sides(session_id, actor_role) values (sid, 'francesco'), (sid, 'beatrice');
  return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Gioca home (read-only).
-- ---------------------------------------------------------------------------

create function public.get_game_v2_home()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor record; open_rounds jsonb; recent jsonb; per_voi jsonb; at_time timestamptz := private.game_v2_clock();
begin
  select * into actor from private.m11a_actor();
  select coalesce(jsonb_agg(private.game_v2_session_summary(s.id, actor.caller_couple, actor.caller_role)
      order by s.started_at desc), '[]'::jsonb)
    into open_rounds from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.completed_at is null;
  select coalesce(jsonb_agg(x.summary order by x.completed_at desc), '[]'::jsonb) into recent from (
    select s.completed_at, private.game_v2_session_summary(s.id, actor.caller_couple, actor.caller_role) summary
    from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.completed_at is not null
    order by s.completed_at desc limit 6) x;
  -- Per voi control: restrained personal state, never a counter.
  select case
      when r.id is null then jsonb_build_object('state', 'idle')
      when r.completed_at is not null then jsonb_build_object('state', 'reveal_ready', 'session_id', r.id)
      when r.my_done then jsonb_build_object('state', 'waiting', 'session_id', r.id)
      when r.partner_done or r.started_by_role <> actor.caller_role then jsonb_build_object('state', 'pending', 'session_id', r.id)
      else jsonb_build_object('state', 'in_progress', 'session_id', r.id) end
    into per_voi
    from (select null::integer) seed
    left join lateral (
      select s.id, s.completed_at, s.started_by_role, mine.completed_at is not null my_done,
        partner.completed_at is not null partner_done
      from public.game_sessions s
      join public.game_session_sides mine on mine.session_id = s.id and mine.actor_role = actor.caller_role
      join public.game_session_sides partner on partner.session_id = s.id and partner.actor_role <> actor.caller_role
      where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.game_family = 'per_voi'
        and (s.completed_at is null or mine.reveal_seen_at is null)
      order by (s.completed_at is null) desc, s.started_at desc limit 1
    ) r on true;
  return jsonb_build_object(
    'my_role', actor.caller_role,
    'partner_role', private.game_v2_partner_role(actor.caller_role),
    'weekly', private.game_v2_weekly_state(actor.caller_couple, actor.caller_role, at_time),
    'per_voi', per_voi,
    'open_rounds', open_rounds,
    'recent', recent);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Public authority.
-- ---------------------------------------------------------------------------

-- Unrestricted creation would bypass the once-per-week, assigned-role
-- contract; the weekly RPC is now the only creation path. Single-question
-- sessions are replaced by rounds (and would unseal a weekly question on
-- demand). Existing questions and sessions stay readable and playable.
revoke execute on function public.create_couple_question(uuid, text, text, jsonb) from authenticated;
revoke execute on function public.start_custom_game_session(uuid, uuid) from authenticated;

revoke all on function public.get_weekly_question_state() from public, anon;
revoke all on function public.create_weekly_question(uuid, text, text, jsonb, text[]) from public, anon;
revoke all on function public.start_game_round(text, uuid) from public, anon;
revoke all on function public.get_game_v2_home() from public, anon;
grant execute on function public.get_weekly_question_state() to authenticated;
grant execute on function public.create_weekly_question(uuid, text, text, jsonb, text[]) to authenticated;
grant execute on function public.start_game_round(text, uuid) to authenticated;
grant execute on function public.get_game_v2_home() to authenticated;
