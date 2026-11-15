-- Text review of the database copy (founder, 14/11/2026;
-- docs/missions/revisione-testi.md, sections Q, G and S as approved).
--
-- About 4,900 texts were read. Only these rows change:
--
-- * Daily Question bank (Q1–Q27): plurals that guessed the couple's gender
--   («persi», «famosi», «miliardari»), questions that read wrong on the day
--   they come out (Monday, Friday) or assume living together, «vivere un
--   evento», small rewordings. English follows only where the Italian now
--   means something else (the week ahead, last week, the hugs, «oggi» → «in
--   questi giorni», the weekend, the childhood dream, the new habit). Days
--   already materialized in the future take the new text; days already shown
--   keep the text people answered.
-- * Game V2 catalog (G1–G60): options that did not answer the question,
--   masculine forms in options and in plurals about the couple, long or
--   inflated cards, «Qual è una cosa che…» calques, filler «davvero». When a
--   question has a prediction, the prediction follows. Same id, version + 1.
-- * Recipe calendar_upcoming-001 (S18): no more «il 8», «il 11». Version + 1.
-- * Swipe V1 (S19–S26): options in the first person, so the result does not
--   change person; small rewordings. Version + 1.
-- * Weekly challenges and missions (S1–S17): three challenges that need to
--   be together (the hug, the hidden message, the perfect day) move from mode
--   any to near, so couples apart (and couples who have not answered «Come vi
--   vedete» yet) no longer get them; masculine plurals; short titles that say
--   what the long one says. Challenges already created for a week
--   (couple_weekly_challenges) keep their copy of the title.
-- * Sintonia rewards (S27–S35): the Ti penso hearts are seen by who receives
--   them, «messi insieme», the names the Oggi gallery already uses,
--   «Controlli» (developer jargon) becomes «Selezioni», typographic ’.
--   These rows have no English columns: English comes from i18n-en.js.
-- * The duplicated daily questions (section X) stay active, as decided.
-- * Only updates: nothing is inserted or deleted. Re-applying this migration
--   changes nothing (every update runs only when the text differs).

-- ---------------------------------------------------------------- Q
update public.daily_question_templates as t
set question = v.question,
    question_en = coalesce(v.question_en, t.question_en)
from (values
  ('ricordi-40', 'Ricordi una volta in cui abbiamo perso la strada? Dov’eravamo?', null::text),
  ('gioco-31', 'Se diventassimo celebri per una sciocchezza, quale sarebbe?', null),
  ('gioco-43', 'Con un miliardo per un giorno, qual è la prima cosa assurda che compreremmo?', null),
  ('desideri-15', 'Senza limiti di spesa, cosa mi regaleresti?', null),
  ('noi_adesso-24', 'Cosa vorresti che sapessi della settimana che ti aspetta?', 'What would you like me to know about the week ahead of you?'),
  ('noi_adesso-52', 'Che voto daresti alla settimana scorsa, e cosa farebbe salire questa di un punto?', 'What score would you give last week, and what would push this one up a point?'),
  ('vicinanza-16', 'Qual è il tuo abbraccio preferito: all’arrivo, alla partenza o prima di dormire?', 'What’s your favorite hug: when we meet, when we say goodbye or right before sleep?'),
  ('desideri-06', 'A quale concerto, spettacolo o evento vorresti andare con me?', null),
  ('desideri-37', 'A quale festa di paese o sagra ti piacerebbe andare insieme?', null),
  ('desideri-49', 'Quale serata elegante ti piacerebbe passare con me?', null),
  ('profonda-21', 'Quale promessa mai detta mantieni ogni giorno con me?', null),
  ('desideri-25', 'Quale piccolo desiderio potremmo realizzare entro un mese?', null),
  ('desideri-46', 'Tra dieci anni, quale regalo vorresti farci?', null),
  ('noi_adesso-11', 'Quale piccola abitudine vorresti che prendessimo questa settimana?', 'What little habit would you like us to pick up this week?'),
  ('noi_adesso-22', 'Quale pensiero ti porti dietro dal weekend?', 'What thought from the weekend is still with you?'),
  ('noi_adesso-38', 'C’è qualcosa che ti pesa un po’ in questi giorni?', null),
  ('noi_adesso-51', 'Cosa vorresti fare stasera, senza nessun impegno?', null),
  ('noi_adesso-27', 'Cosa ti ha fatto sorridere in questi giorni, anche solo per un attimo?', 'What has made you smile lately, even just for a moment?'),
  ('noi_adesso-36', 'Quale piccola vittoria di questi giorni vuoi raccontarmi?', 'What small win from the last few days do you want to tell me about?'),
  ('noi_adesso-41', 'Cosa ti ha fatto pensare a me in questi giorni?', 'What has made you think of me lately?'),
  ('profonda-30', 'C’è un sogno d’infanzia che si è avverato, anche in modo inaspettato?', 'Is there a childhood dream of yours that came true, even in an unexpected way?'),
  ('profonda-36', 'Quale qualità speri che io abbia preso un po’ da te?', null),
  ('profonda-44', 'Cosa vorresti fare di più, con meno pensieri?', null),
  ('ricordi-33', 'Quale insegnante ricordi ancora con affetto, e per cosa?', null),
  ('ricordi-42', 'Quale amicizia d’infanzia vorresti ritrovare, anche solo per un caffè?', null),
  ('vicinanza-19', 'Quale piccola sorpresa ti renderebbe felice questo weekend?', 'What little surprise would make you happy this weekend?'),
  ('vicinanza-25', 'Qual è la cosa più romantica, per te, in un giorno qualsiasi?', null),
  ('vicinanza-38', 'Come ti piace di più la mia voce: quando rido, quando sussurro o quando racconto?', null),
  ('vicinanza-51', 'Quando vado via, quale mio modo di salutarti ti piace di più?', null)
) as v(id, question, question_en)
where t.id = v.id
  and (t.question, t.question_en) is distinct from (v.question, coalesce(v.question_en, t.question_en));

update public.daily_questions as q
set question = t.question
from public.daily_question_templates as t
where q.template_id = t.id
  and t.id in ('ricordi-40', 'gioco-31', 'gioco-43', 'desideri-15', 'noi_adesso-24', 'noi_adesso-52', 'vicinanza-16',
               'desideri-06', 'desideri-37', 'desideri-49', 'profonda-21', 'desideri-25', 'desideri-46', 'noi_adesso-11',
               'noi_adesso-22', 'noi_adesso-38', 'noi_adesso-51', 'noi_adesso-27', 'noi_adesso-36', 'noi_adesso-41',
               'profonda-30', 'profonda-36', 'profonda-44', 'ricordi-33', 'ricordi-42', 'vicinanza-19', 'vicinanza-25',
               'vicinanza-38', 'vicinanza-51')
  and q.question_date > (now() at time zone 'Europe/Rome')::date
  and q.question is distinct from t.question;

-- ---------------------------------------------------------------- G
update public.game_v2_catalog as c
set question_text = coalesce(v.question_text, c.question_text),
    predict_text = coalesce(v.predict_text, c.predict_text),
    options = coalesce(v.options, c.options),
    question_text_en = coalesce(v.question_text_en, c.question_text_en),
    predict_text_en = coalesce(v.predict_text_en, c.predict_text_en),
    version = c.version + 1
from (values
  -- Sense
  ('confrontatevi-007', 'Se potessimo vivere un anno da un’altra parte, cosa cercheresti per prima cosa?', null::text, null::jsonb,
   'If we could live somewhere else for a year, what would you look for first?', null::text),
  ('confrontatevi-041', null, null, '["A sorpresa, mi fido","Insieme, nei dettagli"]', null, null),
  ('scopritevi-003', 'C’è qualcosa su cui hai cambiato idea da quando ci conosciamo, e che forse io non so ancora?', null, null,
   'Is there something you’ve changed your mind about since we met, that maybe I don’t know yet?', null),
  -- Gender in the options
  ('quanto_mi_conosci-066', null, null, '["A mille, si riparte","Normale, è un giorno come un altro","A rilento, non parlatemi","Dipende da com’è andata la domenica"]', null, null),
  ('quanto_mi_conosci-069', null, null, '["Guido io, sempre","Scelgo io la musica","Mappa e snack","Dormo dopo dieci minuti"]', null, null),
  -- Plurals about the couple
  ('confrontatevi-004', 'Dopo una discussione, cosa ti aiuta a fare pace?', null, null, null, null),
  ('e_se-004', null, null, '["Una casa diversa","Un anno sabbatico insieme","Un progetto tutto nostro","Metterla da parte e dormire in pace"]', null, null),
  ('quanto_mi_conosci-074', null, null, '["Un viaggio","Una serata qualunque","Una risata infinita","Un aiuto nel momento giusto"]', null, null),
  ('rivivete-030', null, null, '["{francesco}","{beatrice}","Uno scambio, nello stesso momento","Non lo ricordo proprio"]', null, null),
  ('rivivete-032', null, null, '["{francesco}","{beatrice}","Abbiamo scritto nello stesso momento","Ancora ne discutiamo"]', null, null),
  ('rivivete-034', 'Racconta una nostra serata in cui abbiamo riso come non succedeva da tempo.', null, null, null, null),
  ('rivivete-035', 'C’è un posto visitato insieme che, secondo te, ci ha avvicinato? Cosa è successo lì?', null, null, null, null),
  -- Tone and length
  ('confrontatevi-006', 'Cosa rende bella, per te, una giornata normale tra noi?', null, null, null, null),
  ('e_se-001', 'Un weekend libero e una sola scelta: la cosa che rimandiamo da mesi o partire senza programma?', null, null, null, null),
  ('confrontatevi-002', 'Abbiamo tre giorni liberi: preferiresti un posto che non conosciamo ancora o uno che per noi significa già qualcosa?', null, null, null, null),
  -- Touches: confrontatevi, e_se
  ('confrontatevi-001', 'Se avessimo una domenica senza impegni, cosa vorresti che facessimo?', null, null, null, null),
  ('confrontatevi-015', null, null, '["Arrivare a una decisione comune","Che tu mi capisca, anche senza cambiare idea","Che nessuno ceda solo per stanchezza","Che restiamo gentili, anche a caldo"]', null, null),
  ('confrontatevi-032', 'Una persona molto saggia può darci un solo consiglio sulla nostra coppia. Su cosa lo chiedi?', null, null, null, null),
  ('confrontatevi-046', 'Una sera libera: gli amici di sempre o persone nuove da conoscere?', null, null, null, null),
  -- Touches: quanto_mi_conosci (question and prediction together)
  ('quanto_mi_conosci-016', 'Quando ti fermi e non fai proprio niente, cosa succede?', 'Quando {subject} si ferma e non fa proprio niente, cosa succede?', null,
   'When you stop and do absolutely nothing, what happens?', 'When {subject} stops and does absolutely nothing, what happens?'),
  ('quanto_mi_conosci-024', null, null, '["Me lo godo fino in fondo","Non so dove guardare","Canto anche io, per mimetizzarmi","Una battuta, per spostare l’attenzione"]', null, null),
  ('quanto_mi_conosci-036', 'Devi scrivere un messaggio importante e delicato. Come fai?', '{subject} deve scrivere un messaggio importante e delicato. Come fa?', null, null, null),
  ('quanto_mi_conosci-054', null, null, '["Sempre lo stesso piatto","Il più strano del menù","Quello che prende chi è con me","Chiedo al cameriere"]', null, null),
  ('quanto_mi_conosci-055', null, 'Quale di questi poteri cambierebbe di più la vita quotidiana di {subject}?', null, null, null),
  ('quanto_mi_conosci-061', 'In quale gesto senti più amore, in una giornata qualunque?', 'In quale gesto {subject} sente più amore, in una giornata qualunque?', null, null, null),
  -- Touches: ridete, rivivete, scopritevi
  ('ridete-001', 'Lavoriamo insieme in un ristorante. Chi di noi si farebbe licenziare prima, e perché?', null, null,
   'We work together in a restaurant. Which of us would get fired first, and why?', null),
  ('ridete-003', 'Siamo in un’escape room e mancano due minuti. Chi di noi sta già dando la colpa al resto della squadra?', null, null, null, null),
  ('ridete-010', null, null, '["Chiedere aiuto al primo sorriso","Camminare finché non riconosco qualcosa","Trasformare tutto in un’avventura","Sedermi e aspettare che ci pensi tu"]', null, null),
  ('ridete-053', 'Chi di noi due non resiste e svela il finale?', null, null, null, null),
  ('ridete-055', 'Gara di coppie in TV: come si chiama la nostra squadra, e qual è il grido di battaglia?', null, null, null, null),
  ('rivivete-007', 'Dei nostri primi tempi, cosa ti manca di più?', null, null, null, null),
  ('scopritevi-001', 'C’è qualcosa che faccio per te senza darci peso, e che invece ti importa molto?', null, null, null, null),
  ('scopritevi-038', 'Quando scopri qualcosa che ti piace tantissimo (una canzone, un libro, un posto), cosa ne fai?', null, null, null, null),
  ('scopritevi-047', null, null, '["Tutto programmato, ora per ora","Si decide a colazione","Ozio totale","Voglio vedere tutto, anche a pezzi"]', null, null),
  -- «Qual è un/una…» calques
  ('confrontatevi-033', 'Quale cosa noiosa, fatta con me, diventa quasi divertente?', null, null, null, null),
  ('rivivete-001', 'Quale giorno qualunque tra noi rivivresti volentieri, proprio perché non aveva niente di speciale?', null, null, null, null),
  ('rivivete-006', 'Ricordi una volta in cui ho fatto qualcosa che proprio non ti aspettavi da me?', null, null, null, null),
  ('rivivete-008', 'Quale luogo ormai non riesci più a vedere senza pensare a noi?', null, null, null, null),
  ('rivivete-019', 'Ricordi un piccolo salvataggio tra noi? Chi ha salvato chi, e da cosa?', null, null, null, null),
  ('rivivete-023', 'Ricordi un’attesa tra noi rimasta negli annali, un ritardo o una risposta che non arrivava? Racconta quei minuti come li hai vissuti tu.', null, null, null, null),
  ('scopritevi-002', 'Quale parte di te pensi che io abbia capito solo a metà?', null, null, null, null),
  ('scopritevi-004', 'C’è una cosa che ti riesce bene e che secondo te nessuno nota?', null, null, null, null),
  ('scopritevi-007', 'Quale complimento ti è rimasto in testa per anni, e chi te l’aveva fatto?', null, null, null, null),
  ('scopritevi-008', 'Hai una piccola abitudine, quando nessuno ti vede, che non mi hai mai raccontato?', null, null, null, null),
  ('scopritevi-010', 'Quale domanda vorresti che ti facessi più spesso?', null, null, null, null),
  ('scopritevi-024', 'C’è una piccola decisione, presa anni fa quasi per caso, senza cui oggi la tua vita sarebbe diversa?', null, null, null, null),
  ('scopritevi-031', 'Quale pezzo della tua vita prima di noi vorresti farmi vedere almeno una volta: un posto, una persona, un’abitudine?', null, null, null, null),
  ('scopritevi-032', 'Cosa ti piace davvero di te, ma fai fatica a dire ad alta voce?', null, null, null, null),
  ('scopritevi-033', 'Quale tua marachella di anni fa non hai mai confessato a nessuno?', null, null, null, null),
  ('scopritevi-037', 'Quale torto piccolissimo non hai ancora digerito? Tipo l’ultimo biscotto mangiato da qualcun altro o un libro prestato e mai tornato.', null, null, null, null),
  ('scopritevi-048', 'Cosa hai imparato a fare da grande che ancora ti dà soddisfazione?', null, null, null, null),
  ('scopritevi-055', 'Quale piccola cosa ti emoziona sempre, anche se non lo dai a vedere?', null, null, null, null),
  -- Filler «davvero»
  ('confrontatevi-011', 'Arriva il tuo compleanno. Cosa speri che succeda?', null, null, null, null),
  ('confrontatevi-023', 'Per te, cosa vuol dire passare del tempo insieme?', null, null, null, null),
  ('quanto_mi_conosci-001', 'Quando hai avuto una giornata pesante, cosa preferisci da me nei primi dieci minuti?', 'Quando {subject} ha avuto una giornata pesante, cosa preferisce da te nei primi dieci minuti?', null, null, null),
  ('quanto_mi_conosci-039', 'Quando ti parlo mentre stai facendo un’altra cosa, cosa succede?', 'Quando parli a {subject} mentre sta facendo un’altra cosa, cosa succede?', null, null, null),
  ('quanto_mi_conosci-057', 'Che tipo di vacanza ti ricarica?', 'Che tipo di vacanza ricarica {subject}?', null, null, null)
) as v(id, question_text, predict_text, options, question_text_en, predict_text_en)
where c.id = v.id
  and (c.question_text, c.predict_text, c.options, c.question_text_en, c.predict_text_en)
      is distinct from (coalesce(v.question_text, c.question_text), coalesce(v.predict_text, c.predict_text), coalesce(v.options, c.options),
                        coalesce(v.question_text_en, c.question_text_en), coalesce(v.predict_text_en, c.predict_text_en));

-- ---------------------------------------------------------------- S: recipe
update public.game_v2_recipes as r
set question_text = v.question_text, version = r.version + 1
from (values
  ('calendar_upcoming-001', '«{title}», {date}: qual è la parte che aspetti di più?')
) as v(id, question_text)
where r.id = v.id
  and r.question_text is distinct from v.question_text;

-- ---------------------------------------------------------------- S: Swipe V1
update private.game_swipe_v1_catalog as c
set question_text = coalesce(v.question_text, c.question_text),
    options = coalesce(v.options, c.options),
    options_en = coalesce(v.options_en, c.options_en),
    version = c.version + 1
from (values
  ('swipe-001', 'La serata perfetta per noi: fuori casa o sul divano?', null::jsonb, null::jsonb),
  ('swipe-012', 'Ti divertirebbe scegliere a turno una serata a cui non si può dire di no?', null, null),
  ('swipe-026', null, '["Sì","Dipende"]', null),
  ('swipe-027', null, '["Dirci tutto","Avere spazi propri"]', '["Share everything","Keep our own spaces"]'),
  ('swipe-028', 'Ti piacerebbe avere ogni anno una canzone nuova che diventi nostra?', null, null),
  ('swipe-032', 'Se avessimo solo due ore insieme, preferiresti fare qualcosa o non fare assolutamente niente?', null, null),
  ('swipe-033', 'Un mio vocale di cinque minuti: lo ascolti con calma o a velocità doppia?', null, null),
  ('swipe-075', null, '["Decido io","Lascio scegliere"]', null),
  ('swipe-085', null, '["Racconto io","Ascolto"]', null),
  ('swipe-097', null, '["Io ai fornelli","Io a tagliare"]', null)
) as v(id, question_text, options, options_en)
where c.id = v.id
  and (c.question_text, c.options, c.options_en)
      is distinct from (coalesce(v.question_text, c.question_text), coalesce(v.options, c.options), coalesce(v.options_en, c.options_en));

-- ---------------------------------------------------------------- S: challenges and missions
update public.bond_quest_templates as t
set title = coalesce(v.title, t.title),
    short_title = coalesce(v.short_title, t.short_title),
    mode = coalesce(v.mode, t.mode),
    title_en = coalesce(v.title_en, t.title_en),
    short_title_en = coalesce(v.short_title_en, t.short_title_en)
from (values
  -- To be done together: near only.
  ('any-hug-twenty', null::text, null::text, 'near'::text, null::text, null::text),
  ('any-hidden-note', 'Nascondetevi a vicenda un piccolo messaggio, da trovare per caso.', null, 'near',
   'Hide a little message for each other, to be found by chance.', null),
  ('any-perfect-day-plan', 'Organizzate metà di una giornata perfetta a testa, senza svelare il programma.', null, 'near', null, null),
  -- Texts and short titles
  ('far-window-morning', 'Appena vi svegliate, fotografate la vista dalla vostra finestra.', null, null, null, null),
  ('near-tourists-at-home', 'Andate in gita nella vostra città per un pomeriggio, foto ricordo comprese.', 'In gita in città', null,
   'Spend an afternoon on a trip around your own city, souvenir photos included.', 'A trip around town'),
  ('far-same-cup', null, 'Colazione alla stessa ora', null, null, 'Breakfast at the same time'),
  ('far-my-street', 'Fotografate la strada sotto casa, come la vedete appena uscite.', 'Sotto casa', null, null, 'Outside your door'),
  ('far-favourite-corner', null, 'L’angolo preferito', null, null, 'The favourite corner'),
  ('far-my-spot-today', null, 'Il posto di oggi', null, null, 'Today’s spot'),
  ('any-intentional-memory', 'Fate insieme una cosa nuova e salvatela con una foto e una nota.', 'Una cosa nuova', null,
   'Do something new together and save it with a photo and a note.', 'Something new'),
  ('far-same-sky', 'Una sera, fotografate il vostro cielo alla stessa ora.', null, null, 'One evening, photograph your sky at the same time.', null),
  ('far-thought-photo', 'Mandatevi la foto di qualcosa che oggi vi ha fatto pensare all’altra persona.', null, null, null, null),
  ('far-comfort-food', 'Scegliete lo stesso tipo di comfort food e mangiatelo insieme in chiamata.', null, null, null, null),
  ('any-future-letter', 'Scrivetevi una lettera da aprire tra un anno e mettetela in un posto sicuro.', 'Lettera da aprire tra un anno', null,
   null, 'A letter to open in a year'),
  ('any-week-photo', 'Fate una foto che racconti la vostra settimana.', null, null, null, null),
  ('near-breakfast', null, 'Colazione o caffè fuori', null, null, 'Breakfast or coffee out'),
  -- Missions (only in the history of the ones done)
  ('any-home-photo', 'Scegliete insieme una nuova foto per Oggi.', null, null, 'Choose a new Today photo together.', null)
) as v(key, title, short_title, mode, title_en, short_title_en)
where t.key = v.key
  and (t.title, t.short_title, t.mode, t.title_en, t.short_title_en)
      is distinct from (coalesce(v.title, t.title), coalesce(v.short_title, t.short_title), coalesce(v.mode, t.mode),
                        coalesce(v.title_en, t.title_en), coalesce(v.short_title_en, t.short_title_en));

-- ---------------------------------------------------------------- S: Sintonia rewards
update public.progression_reward_catalog as r
set title = coalesce(v.title, r.title),
    description = coalesce(v.description, r.description)
from (values
  ('ti_penso_hearts', 'Ti penso «Cuori»', 'Quando ricevi un Ti penso, arriva un’esplosione di cuori nei vostri colori.'),
  ('ti_penso_letter', 'Ti penso «Lettera»', null),
  ('sky_ours', null, 'Le stelle della sera in cui è iniziata la vostra storia, sopra la vostra città.'),
  ('oggi_theme_cinematic', 'Cinema', null),
  ('oggi_theme_moonlight', 'Chiaro di luna', null),
  ('oggi_effect_bokeh', 'Luci sfocate', null),
  ('oggi_theme_seasonal', 'Stagioni', 'Oggi cambia con l’anno: fiori a primavera, luce d’estate, foglie d’autunno, neve d’inverno.'),
  ('frame_chrome', null, 'Uno stile per il countdown di Oggi: cifre lucide come il metallo.'),
  ('pet_accessory_gala', null, 'Papillon o collana di perle, per le serate eleganti del vostro Compagno.'),
  ('accent_cherry', null, 'Selezioni, progressi e navigazione diventano rosso ciliegia.'),
  ('accent_champagne', null, 'Selezioni e progressi in oro chiaro, come una festa a due.'),
  ('accent_ice', null, 'Selezioni in azzurro ghiaccio, nitide e calme.'),
  ('effect_pulse', null, 'Il simbolo US respira piano.'),
  ('app_icon_gold', 'Icona «Oro»', 'L’icona di US in oro, su un fondo prugna.'),
  ('app_icon_neon', null, 'L’icona di US come un’insegna al neon, rosa e lilla.'),
  ('app_icon_night', null, 'L’icona di US in argento lunare, sul blu della notte.'),
  ('oggi_effect_aurora', null, 'Una luce che danza sopra la vostra foto di Oggi, come un’aurora boreale.'),
  ('theme_blue_hour', null, 'Il quarto d’ora dopo il tramonto: un blu freddo che sfuma nella notte.')
) as v(id, title, description)
where r.id = v.id
  and (r.title, r.description) is distinct from (coalesce(v.title, r.title), coalesce(v.description, r.description));
