// Text review of the database copy (founder, 14/11/2026; sections Q, G and S
// of docs/missions/revisione-testi.md) on a real Postgres (PGlite): the whole
// repository chain. The new texts are there and none of the old ones is left
// among the active rows, a changed game item gets version + 1 once, future
// days take the new daily text and days already shown keep theirs, the three
// challenges to be done together are near only, the challenges already
// created keep their copy of the title, and re-applying changes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { database } = require('./helpers/mc2-db');

const FILE = '20261113232109_revisione_testi.sql';
const SQL = () => fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations', FILE), 'utf8');
const rows = async (db, sql, params) => (await db.query(sql, params)).rows;

// One fragment for each old text, matching that text only.
const OLD = [
  // Q · Daily Question bank
  /ci siamo persi insieme/, /diventassimo famosi/, /giorno da miliardari/, /farmi un regalo qualsiasi/,
  /della tua settimana, prima che cominci/, /alla tua settimana finora/, /al risveglio, al rientro/,
  /evento vorresti vivere/, /sagra ti piacerebbe vivere/, /vestendoci eleganti/, /promessa silenziosa/,
  /desiderio piccolo/, /fare a noi due/, /ci portassimo dietro/, /dietro da questo weekend/,
  /cosa piccola che ti sta pesando/, /se non ci fosse niente da fare/, /sorridere oggi, anche solo/,
  /vittoria di oggi/, /pensare a me oggi/, /sogno della tua infanzia si è avverato/, /Quale tua qualità speri/,
  /preoccupandoti di meno/, /rimasto nel cuore, e per cosa/, /vorresti rivedere, anche solo per un caffè/,
  /sorpresa ti renderebbe felice questa settimana/, /Cosa c’è di più romantico/, /Quale parte della mia voce/,
  /salutarti che ti piace di più quando vado via/,
  // G · Game V2 catalog
  /un anno in un’altra città, cosa cercheresti/, /^A sorpresa, fidati$/, /attribuire alla vecchia versione/,
  /^Carico, si riparte$/, /^Neutro, è un giorno/, /^Lento, non parlatemi$/, /^Il DJ ufficiale$/, /^Navigatore e snack$/,
  /aiuta davvero a tornare vicini/, /dormire tranquilli/, /in cui ci siamo aiutati/, /Ci siamo scambiati/, /Ci siamo scritti/,
  /ci siamo divertiti come/, /ci ha avvicinati/, /Cosa rende speciale, per te/, /possiamo scegliere una sola cosa/,
  /tre giorni completamente liberi/, /domenica completamente libera/, /gentili, anche nel pieno/, /ci offre un solo consiglio/,
  /i soliti amici di sempre/, /cosa succede dentro di/, /per confondermi/, /delicato\. Come va\?/, /chi è al tavolo/,
  /vita di tutti i giorni di \{subject\}/, /fa sentire più amore/, /Dobbiamo aprire un ristorante/, /stanza della fuga/,
  /Trasformarlo subito/, /svela come va a finire/, /qual è il nostro grido\?/, /all’inizio di noi/, /considero insignificante/,
  /tantissimo, una canzone/, /^Programma ogni ora$/, /speri davvero che succeda/, /vuol dire davvero passare/,
  /preferisc[ei] davvero da/, /cosa succede davvero\?/, /ricarica davvero/,
  // S · recipe, Swipe, challenges and missions, rewards
  /^Di «\{title\}», il \{date\}/,
  /sarebbe più bella fuori casa/, /senza poter dire di no/, /^Dipende troppo$/, /^Dirci quasi tutto$/, /che diventa nostra ogni anno/,
  /preferisci fare qualcosa o non fare/, /lo ascolti tutto o/, /^La lascio a te$/, /^Racconti tu$/, /^Tu ai fornelli$/,
  /^Appena svegli,/, /Fate i turisti/, /^Turisti a casa$/, /^La stessa colazione$/, /^La mia strada$/, /^Il mio angolo preferito$/,
  /^Il mio posto di oggi$/, /ricordo intenzionale/, /^Un ricordo voluto$/, /strada di casa/, /cielo stasera/, /pensare a chi la riceve/,
  /in call\./, /salvatela in un posto sicuro/, /per tra un anno/, /questa settimana di voi/, /^Colazione fuori$/, /foto Home per US/,
  /Nascondete un piccolo messaggio/, /Organizzate a turno metà/,
  /^Cinematic$/, /^Moonlight$/, /^Bokeh romantico$/, /^Tema delle stagioni$/, /all[’']altro arriva/, /vi siete messi insieme/,
  /il tempo diventa materia/, /sere speciali/, /[Cc]ontrolli/, /ogni pochi secondi/, /^Icona d'oro$/, /^Ti penso animato$/, /^Ti penso «lettera»$/,
];
// The game cards no longer open with the «Qual è un/una…» calque (the daily bank keeps its own).
const OLD_GAME = /^Qual è un/;

// Same inclusive-Italian rule as the content 1.0 and 1.1 catalog tests, plus
// the masculine plurals this review took out.
const INCLUSIVE = [
  /\bchi dei due\b/i, /\bl[’']altr[oa]\b/i, /\bentramb[ie]\b/i, /\buno dei due\b/i, /\btutti e due\b/i, /\bnessuno dei due\b/i,
  /\bognun[oa]\b/i, /\bda sol[oa]\b/i, /\b(?:lui|lei)\b/i,
  /\b(?:persi|famosi|miliardari|svegli|turisti|messi|divertiti|avvicinati|tranquilli|aiutati|scambiati|scritti|vicini)\b/i,
];

const CHANGED = {
  daily: ['ricordi-40', 'gioco-31', 'gioco-43', 'desideri-15', 'noi_adesso-24', 'noi_adesso-52', 'vicinanza-16', 'desideri-06',
    'desideri-37', 'desideri-49', 'profonda-21', 'desideri-25', 'desideri-46', 'noi_adesso-11', 'noi_adesso-22', 'noi_adesso-38',
    'noi_adesso-51', 'noi_adesso-27', 'noi_adesso-36', 'noi_adesso-41', 'profonda-30', 'profonda-36', 'profonda-44', 'ricordi-33',
    'ricordi-42', 'vicinanza-19', 'vicinanza-25', 'vicinanza-38', 'vicinanza-51'],
  game: ['confrontatevi-001', 'confrontatevi-002', 'confrontatevi-004', 'confrontatevi-006', 'confrontatevi-007', 'confrontatevi-011',
    'confrontatevi-015', 'confrontatevi-023', 'confrontatevi-032', 'confrontatevi-033', 'confrontatevi-041', 'confrontatevi-046',
    'e_se-001', 'e_se-004', 'quanto_mi_conosci-001', 'quanto_mi_conosci-016', 'quanto_mi_conosci-024', 'quanto_mi_conosci-036',
    'quanto_mi_conosci-039', 'quanto_mi_conosci-054', 'quanto_mi_conosci-055', 'quanto_mi_conosci-057', 'quanto_mi_conosci-061',
    'quanto_mi_conosci-066', 'quanto_mi_conosci-069', 'quanto_mi_conosci-074', 'ridete-001', 'ridete-003', 'ridete-010', 'ridete-053',
    'ridete-055', 'rivivete-001', 'rivivete-006', 'rivivete-007', 'rivivete-008', 'rivivete-019', 'rivivete-023', 'rivivete-030',
    'rivivete-032', 'rivivete-034', 'rivivete-035', 'scopritevi-001', 'scopritevi-002', 'scopritevi-003', 'scopritevi-004',
    'scopritevi-007', 'scopritevi-008', 'scopritevi-010', 'scopritevi-024', 'scopritevi-031', 'scopritevi-032', 'scopritevi-033',
    'scopritevi-037', 'scopritevi-038', 'scopritevi-047', 'scopritevi-048', 'scopritevi-055'],
  swipe: ['swipe-001', 'swipe-012', 'swipe-026', 'swipe-027', 'swipe-028', 'swipe-032', 'swipe-033', 'swipe-075', 'swipe-085', 'swipe-097'],
  quests: ['any-hug-twenty', 'any-hidden-note', 'any-perfect-day-plan', 'far-window-morning', 'near-tourists-at-home', 'far-same-cup',
    'far-my-street', 'far-favourite-corner', 'far-my-spot-today', 'any-intentional-memory', 'far-same-sky', 'far-thought-photo',
    'far-comfort-food', 'any-future-letter', 'any-week-photo', 'near-breakfast', 'any-home-photo'],
  rewards: ['ti_penso_hearts', 'ti_penso_letter', 'sky_ours', 'oggi_theme_cinematic', 'oggi_theme_moonlight', 'oggi_effect_bokeh',
    'oggi_theme_seasonal', 'frame_chrome', 'pet_accessory_gala', 'accent_cherry', 'accent_champagne', 'accent_ice', 'effect_pulse',
    'app_icon_gold', 'app_icon_neon', 'app_icon_night', 'oggi_effect_aurora', 'theme_blue_hour'],
};
// Game and Swipe items that were already at version 2 before this review.
const WAS_V2 = new Set(['confrontatevi-002', 'ridete-001', 'ridete-003', 'rivivete-007', 'scopritevi-003', 'swipe-026', 'swipe-027']);

async function activeItalian(db) {
  return rows(db, `select 'daily ' || id as id, question as t from public.daily_question_templates where active
    union all select 'game ' || id, question_text from public.game_v2_catalog where active
    union all select 'predict ' || id, predict_text from public.game_v2_catalog where active and predict_text is not null
    union all select 'option ' || id, o from public.game_v2_catalog, jsonb_array_elements_text(options) as o where active
    union all select 'recipe ' || id, question_text from public.game_v2_recipes where active and question_text is not null
    union all select 'swipe ' || id, question_text from private.game_swipe_v1_catalog where active
    union all select 'swipe option ' || id, o from private.game_swipe_v1_catalog, jsonb_array_elements_text(options) as o where active
    union all select 'quest ' || key, title from public.bond_quest_templates where active
    union all select 'quest short ' || key, short_title from public.bond_quest_templates where active and short_title is not null
    union all select 'reward ' || id, title from public.progression_reward_catalog where active
    union all select 'reward text ' || id, description from public.progression_reward_catalog where active`);
}

async function changedTexts(db) {
  return rows(db, `select 'daily ' || id as id, question as t from public.daily_question_templates where id = any($1)
    union all select 'game ' || id, question_text from public.game_v2_catalog where id = any($2)
    union all select 'predict ' || id, predict_text from public.game_v2_catalog where id = any($2) and predict_text is not null
    union all select 'option ' || id, o from public.game_v2_catalog, jsonb_array_elements_text(options) as o where id = any($2)
    union all select 'recipe ' || id, question_text from public.game_v2_recipes where id = 'calendar_upcoming-001'
    union all select 'swipe ' || id, question_text from private.game_swipe_v1_catalog where id = any($3)
    union all select 'swipe option ' || id, o from private.game_swipe_v1_catalog, jsonb_array_elements_text(options) as o where id = any($3)
    union all select 'quest ' || key, title from public.bond_quest_templates where key = any($4)
    union all select 'quest short ' || key, short_title from public.bond_quest_templates where key = any($4) and short_title is not null
    union all select 'reward ' || id, title from public.progression_reward_catalog where id = any($5)
    union all select 'reward text ' || id, description from public.progression_reward_catalog where id = any($5)`,
  [CHANGED.daily, CHANGED.game, CHANGED.swipe, CHANGED.quests, CHANGED.rewards]);
}

const fingerprint = async (db) => (await rows(db, `select md5(string_agg(x, '|' order by x)) h from (
  select t::text x from public.daily_question_templates t union all select q::text from public.daily_questions q
  union all select c::text from public.game_v2_catalog c union all select r::text from public.game_v2_recipes r
  union all select s::text from private.game_swipe_v1_catalog s union all select b::text from public.bond_quest_templates b
  union all select p::text from public.progression_reward_catalog p union all select w::text from public.couple_weekly_challenges w) z`))[0].h;

test('the review: new texts in, no old text left among the active rows, inclusive and typographic', async () => {
  const db = await database({ seed: false });
  try {
    for (const row of await activeItalian(db)) {
      for (const old of OLD) assert.doesNotMatch(row.t, old, row.id);
      if (row.id.startsWith('game ')) assert.doesNotMatch(row.t, OLD_GAME, row.id);
    }
    for (const row of await changedTexts(db)) {
      assert.doesNotMatch(row.t, /'/, `${row.id} typographic apostrophe`);
      for (const rule of INCLUSIVE) assert.doesNotMatch(row.t, rule, `${row.id} inclusive Italian`);
    }
    const daily = Object.fromEntries((await rows(db, 'select id, question, question_en from public.daily_question_templates where id = any($1)', [CHANGED.daily])).map((r) => [r.id, r]));
    assert.equal(Object.keys(daily).length, 29);
    assert.equal(daily['ricordi-40'].question, 'Ricordi una volta in cui abbiamo perso la strada? Dov’eravamo?');
    assert.equal(daily['noi_adesso-36'].question, 'Quale piccola vittoria di questi giorni vuoi raccontarmi?');
    assert.equal(daily['vicinanza-16'].question_en, 'What’s your favorite hug: when we meet, when we say goodbye or right before sleep?');
    assert.equal(daily['gioco-31'].question_en, 'If we became famous for something silly, what would it be?', 'English stays when the sense does');

    const game = Object.fromEntries((await rows(db, 'select * from public.game_v2_catalog where id = any($1)', [CHANGED.game])).map((r) => [r.id, r]));
    assert.equal(game['quanto_mi_conosci-016'].question_text, 'Quando ti fermi e non fai proprio niente, cosa succede?');
    assert.equal(game['quanto_mi_conosci-016'].predict_text, 'Quando {subject} si ferma e non fa proprio niente, cosa succede?', 'the prediction follows its question');
    assert.equal(game['quanto_mi_conosci-061'].predict_text, 'In quale gesto {subject} sente più amore, in una giornata qualunque?');
    assert.deepEqual(game['quanto_mi_conosci-066'].options, ['A mille, si riparte', 'Normale, è un giorno come un altro', 'A rilento, non parlatemi', 'Dipende da com’è andata la domenica']);
    assert.deepEqual(game['rivivete-030'].options.slice(0, 2), ['{francesco}', '{beatrice}'], 'placeholders untouched');
    assert.equal(game['rivivete-023'].question_text, 'Ricordi un’attesa tra noi rimasta negli annali, un ritardo o una risposta che non arrivava? Racconta quei minuti come li hai vissuti tu.');
    assert.equal(game['ridete-001'].question_text_en, 'We work together in a restaurant. Which of us would get fired first, and why?');
    for (const r of Object.values(game)) if (r.predict_text) assert.match(r.predict_text, /\{subject\}/, r.id);

    const [recipe] = await rows(db, "select question_text from public.game_v2_recipes where id = 'calendar_upcoming-001'");
    assert.equal(recipe.question_text, '«{title}», {date}: qual è la parte che aspetti di più?');
    const swipe = Object.fromEntries((await rows(db, 'select id, question_text, options, options_en from private.game_swipe_v1_catalog where id = any($1)', [CHANGED.swipe])).map((r) => [r.id, r]));
    assert.deepEqual(swipe['swipe-085'].options, ['Racconto io', 'Ascolto']);
    assert.deepEqual(swipe['swipe-027'].options_en, ['Share everything', 'Keep our own spaces']);

    const quests = Object.fromEntries((await rows(db, 'select * from public.bond_quest_templates where key = any($1)', [CHANGED.quests])).map((r) => [r.key, r]));
    assert.deepEqual([quests['far-same-cup'].short_title, quests['far-same-cup'].short_title_en], ['Colazione alla stessa ora', 'Breakfast at the same time']);
    assert.deepEqual([quests['near-tourists-at-home'].short_title, quests['any-intentional-memory'].short_title, quests['any-future-letter'].short_title_en],
      ['In gita in città', 'Una cosa nuova', 'A letter to open in a year']);
    assert.equal(quests['any-perfect-day-plan'].title, 'Organizzate metà di una giornata perfetta a testa, senza svelare il programma.');

    const rewards = Object.fromEntries((await rows(db, 'select id, title, description from public.progression_reward_catalog where id = any($1)', [CHANGED.rewards])).map((r) => [r.id, r]));
    assert.deepEqual(['oggi_theme_cinematic', 'oggi_theme_moonlight', 'oggi_effect_bokeh', 'oggi_theme_seasonal', 'app_icon_gold', 'ti_penso_hearts', 'ti_penso_letter'].map((id) => rewards[id].title),
      ['Cinema', 'Chiaro di luna', 'Luci sfocate', 'Stagioni', 'Icona «Oro»', 'Ti penso «Cuori»', 'Ti penso «Lettera»']);
    assert.equal(rewards.ti_penso_hearts.description, 'Quando ricevi un Ti penso, arriva un’esplosione di cuori nei vostri colori.');
    assert.equal(rewards.sky_ours.description, 'Le stelle della sera in cui è iniziata la vostra storia, sopra la vostra città.');
  } finally { await db.close(); }
});

test('the review bumps a version once and re-applying changes nothing', async () => {
  const db = await database({ seed: false });
  try {
    const versions = async () => rows(db, `select id, version from public.game_v2_catalog where id = any($1)
      union all select id, version from public.game_v2_recipes where id = 'calendar_upcoming-001'
      union all select id, version from private.game_swipe_v1_catalog where id = any($2) order by 1`, [CHANGED.game, CHANGED.swipe]);
    const before = await versions();
    assert.equal(before.length, 57 + 1 + 10);
    for (const r of before) assert.equal(r.version, WAS_V2.has(r.id) ? 3 : 2, `${r.id} version + 1, once`);
    const print = await fingerprint(db);
    await db.exec(SQL());
    assert.deepEqual(await versions(), before, 're-applying bumps nothing');
    assert.equal(await fingerprint(db), print, 're-applying changes nothing');
  } finally { await db.close(); }
});

test('a future day takes the new daily text, a day already shown keeps what people answered', async () => {
  const db = await database({ seed: false });
  try {
    await db.exec(`insert into public.daily_questions (question_date, question, template_id)
      values ('2026-01-07', 'Ricordi una volta in cui ci siamo persi insieme? Dov’eravamo?', 'ricordi-40'),
             ('2099-01-07', 'Ricordi una volta in cui ci siamo persi insieme? Dov’eravamo?', 'ricordi-40'),
             ('2099-01-05', 'Cosa ti ha fatto pensare a me oggi?', 'noi_adesso-41');`);
    await db.exec(SQL());
    const days = await rows(db, "select question_date::text as d, question from public.daily_questions order by 1");
    assert.deepEqual(days, [
      { d: '2026-01-07', question: 'Ricordi una volta in cui ci siamo persi insieme? Dov’eravamo?' },
      { d: '2099-01-05', question: 'Cosa ti ha fatto pensare a me in questi giorni?' },
      { d: '2099-01-07', question: 'Ricordi una volta in cui abbiamo perso la strada? Dov’eravamo?' },
    ]);
  } finally { await db.close(); }
});

test('the hug, the hidden message and the perfect day are near only; challenges already created keep their title', async () => {
  const db = await database({ seed: false });
  try {
    const three = ['any-hug-twenty', 'any-hidden-note', 'any-perfect-day-plan'];
    const modes = await rows(db, 'select key, mode, challenge, two_places from public.bond_quest_templates where key = any($1) order by key', [three]);
    assert.deepEqual(modes.map((r) => [r.key, r.mode, r.challenge, r.two_places]), [...three].sort().map((k) => [k, 'near', true, false]));
    // weekly_challenge_pick: near couples still get them, couples not answered yet (any) and apart (far) never.
    const pool = async (mode) => (await rows(db, `select key from public.bond_quest_templates t where t.active and t.challenge
      and case coalesce($1::text, 'any') when 'far' then t.two_places when 'near' then not t.two_places and t.mode in ('near', 'any')
      else not t.two_places and t.mode = 'any' end`, [mode])).map((r) => r.key);
    const near = await pool('near');
    for (const key of three) {
      assert.ok(near.includes(key), key);
      assert.equal((await pool(null)).includes(key), false, `${key} not for a couple who has not answered`);
      assert.equal((await pool('far')).includes(key), false, `${key} not for a couple apart`);
      const [picked] = await rows(db, "select (private.weekly_challenge_pick($1, date '2026-11-16', 'near', 'week', $2, null)).key", [
        '11111111-1111-4111-8111-111111111111', near.filter((k) => k !== key)]);
      assert.equal(picked.key, key, `${key} is picked for a near couple`);
    }
    assert.equal((await pool(null)).length, 7, 'the any pool: ten challenges minus these three');

    const couple = '11111111-1111-4111-8111-111111111111';
    await db.query("insert into public.couples (id, name, started_on) values ($1, 'US.', '2026-04-21')", [couple]);
    await db.query(`insert into public.couple_weekly_challenges (couple_id, week_start, template_key, title, short_title, two_places)
      values ($1, '2026-11-09', 'far-same-sky', 'Fotografate il vostro cielo stasera, alla stessa ora.', 'Lo stesso cielo', true)`, [couple]);
    await db.exec(SQL());
    const [kept] = await rows(db, 'select title from public.couple_weekly_challenges');
    assert.equal(kept.title, 'Fotografate il vostro cielo stasera, alla stessa ora.', 'the week already created keeps its copy');
  } finally { await db.close(); }
});
