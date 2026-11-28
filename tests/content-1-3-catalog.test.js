// US content 1.3 «hot» — editorial contract of the drafts in
// supabase/game-v2/content-1-3: the migration carries exactly the generated
// SQL, ids and counts are the planned ones, two themes (piccante, desideri)
// with at least 22 rows each on every family and in Questo o quello, every
// row plus, English in the same shape, the house rules of content 1.2
// (inclusive Italian, typography, no therapy vocabulary, nothing that ages)
// and the founder's line for this pack: suggest, never describe — no
// vulgarity, nothing explicit, no intimate body part, no pressure, no
// alcohol or drugs. The database side is in tests/content-1-3-db.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const importRepo = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const load = () => importRepo('supabase/game-v2/content-1-3-contract.mjs');
const loadM11b = () => importRepo('supabase/game-v2/catalog-contract.mjs');
const normalizeEol = (value) => value.replace(/\r\n/g, '\n');
const MIGRATION_FILE = 'supabase/migrations/20261128115152_contenuti_hot.sql';
const MIGRATION = normalizeEol(fs.readFileSync(path.join(ROOT, MIGRATION_FILE), 'utf8'));
const pad = (family, n) => `${family}-${String(n).padStart(3, '0')}`;
const range = (family, [from, to]) => Array.from({ length: to - from + 1 }, (_, i) => pad(family, from + i));
const TOKENS = (text) => (String(text || '').match(/\{[a-z_]+\}/g) || []).sort();
const FAMILIES = ['quanto_mi_conosci', 'ridete', 'scopritevi', 'confrontatevi', 'rivivete', 'swipe'];

// The same rules as content 1.2: nothing assumes the gender of either partner.
const INCLUSIVE = [
  [/\bchi dei due\b/i, '«chi dei due»'], [/\bl[’']altr[oa]\b/i, '«l’altro/l’altra»'], [/\bentramb[ie]\b/i, '«entrambi»'],
  [/\buno dei due\b/i, '«uno dei due»'], [/\btutti e due\b/i, '«tutti e due»'], [/\bnessuno dei due\b/i, '«nessuno dei due»'],
  [/\bognun[oa]\b/i, '«ognuno/ognuna»'], [/\bper prim[oa]\b(?!\s+(?:cosa|volta)\b)/i, '«per primo/prima» as an adverb'],
  [/\bda sol[oa]\b/i, '«da solo/sola»'], [/\b(?:lui|lei)\b/i, 'lui/lei'],
  [/\b(\w+)[oe] o \1[ae]\b/i, 'doubled gender form («sveglio o sveglia»)'],
  [/\b(?:vicini(?! di casa)|lontani|persi|partiti|andati|conosciuti|arrivati|innamorat[oi]|fidanzati|sposati|stanch[oi]|famosi|liberi|tranquilli|divertiti|pensati|messi)\b/i, 'gendered form'],
  // The words of this pack that would guess who answers.
  [/\b(?:eccitat[oaie]|sedott[oaie]|baciat[oaie]|svegli[oe]?|pront[oaie]|abbracciat[oaie]|stretti|nervos[oaie]|imbarazzat[oaie]|attratt[oaie]|sol[ie] soletti)\b/i, 'gendered form of this pack'],
];
const THERAPY = /\b(elabor|trauma|confini|tossic|red flag|crisi|litig|tradiment|gelos|sess[ou]|sessual|problem|comunicazione|bisogni|autostima|percorso|crescita personale|mindset|obiettiv|produttiv|feedback|coppia sana|relazione sana|terapi|conflitt)/i;
const AGES = /\b(oggi|ieri|stamattina|stasera|quest[’']anno|anno scorso|settimana scorsa|questa settimana|questo weekend|20\d\d)\b/i;
const AGES_EN = /\b(today|tonight|yesterday|this morning|this year|last year|last week|this week|this weekend|20\d\d)\b/i;

// The founder's line (28/11/2026): suggest, never describe. Vulgarity,
// explicit words, intimate body parts, pressure, alcohol and drugs.
const BANNED_IT = [
  /\bsess[oiu]/i, /\bsexy\b/i, /\bscop[aeio]/i, /\bchiav[aeio]/i, /\bfottere|\bfott[aeio]/i, /\btromb[aeio]/i, /\bpomp[aeio]/i,
  /\bnud[oaie]\b|\bnudit/i, /\bspogli/i, /\borgasm/i, /\beccit/i, /\berotic/i, /\bporn/i, /\bpreliminar/i, /\bfare l[’']amore\b/i,
  /\bgod[ei]re\b|\bgodimento/i, /\bvoglios/i, /\barrapat/i, /\bperver/i, /\bfetic/i, /\bsadomaso|\bbdsm\b/i, /\bmanett/i, /\bfrust[ae]\b/i,
  /\bseno\b|\bseni\b|\btett[ae]\b/i, /\bcul[oi]\b/i, /\bnatic/i, /\bchiappe\b/i, /\bpen[ei]\b/i, /\bvagin/i, /\bgenital/i, /\bcapezzol/i,
  /\binguine/i, /\bpube\b|\bpubic/i, /\bcazz/i, /\bfi[cg][ah]\b/i, /\bmerd/i, /\bputtan/i, /\btroi[ae]\b/i, /\bzoccol/i, /\bminchi/i,
  /\bslip\b|\bmutand|\breggiseno|\bperizoma|\blingerie\b|\bbiancheria intima/i,
  /\bper forza\b/i, /\bobblig/i, /\bcostring/i, /\banche se non vuoi\b/i, /\bnon dire di no\b/i,
  /\bvin[oi]\b/i, /\bbirr[ae]\b/i, /\balcol/i, /\bubriac/i, /\bsbronz/i, /\bbrill[oaie]\b/i, /\bcocktail/i, /\bspritz/i, /\bchampagne/i,
  /\bprosecco/i, /\bshot\b/i, /\bdrog/i, /\bcann[ae]\b/i, /\bspinell/i, /\bfumat[ao]\b/i,
];
const BANNED_EN = [
  /\bsex/i, /\bnaked\b|\bnude\b|\bnudity\b/i, /\bundress/i, /\bstrip/i, /\borgasm/i, /\bhorny\b/i, /\baroused?\b|\barousal\b/i, /\berotic/i,
  /\bporn/i, /\bforeplay\b/i, /\bkink/i, /\bfetish/i, /\bbdsm\b|\bhandcuff/i, /\bmake love\b|\bmaking love\b/i, /\bhook ?up\b/i,
  /\bbreasts?\b|\bboob/i, /\btits?\b/i, /\bbutt\b|\bass\b|\bbum\b|\bbuttocks\b/i, /\bdick\b|\bcock\b|\bpenis\b/i, /\bpussy\b|\bvagina/i,
  /\bgenital/i, /\bnipple/i, /\bgroin\b|\bcrotch\b/i, /\bfuck/i, /\bshit/i, /\bbitch/i, /\bslut/i,
  /\bunderwear\b|\blingerie\b|\bpanties\b|\bbra\b|\bthong\b/i,
  /\bhave to\b|\bforced?\b|\beven if you don[’']t want\b/i,
  /\bwine\b/i, /\bbeer\b/i, /\bbooze\b/i, /\balcohol/i, /\bdrunk\b|\btipsy\b/i, /\bcocktail/i, /\bchampagne\b/i, /\bshots?\b/i,
  /\bdrugs?\b/i, /\bweed\b|\bjoint\b|\bhigh\b/i,
];

test('content 1.3: the migration block is exactly the SQL generated from the drafts', async () => {
  const { contentSql, BLOCK, MIGRATION: file } = await load();
  const { extractBlock } = await loadM11b();
  assert.equal(file, MIGRATION_FILE);
  const block = extractBlock(MIGRATION, BLOCK);
  assert.equal(block, normalizeEol(contentSql()), 'run node scripts/build-content-1-3-sql.mjs');
  const code = block.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\b(delete|update|truncate|drop|alter|grant|revoke|create)\b/i.test(code), 'the content block only inserts');
  assert.equal(code.match(/\binsert into\b/gi).length, 2);
  assert.equal(code.match(/on conflict \(id\) do nothing/gi).length, 2);
  // Outside the block: only the two checks.
  const rest = MIGRATION.replace(block, '').replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\b(delete|update|insert|truncate|drop|alter|grant|revoke|create)\b/i.test(rest), 'nothing else changes');
  const cutoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(path.basename(MIGRATION_FILE)));
  assert.ok(cutoff.forward_migrations.includes(path.basename(MIGRATION_FILE)));
});

test('content 1.3: planned ids, every row plus, at least 22 per theme on every family', async () => {
  const { drafts, NEW_GAMES, NEW_SWIPE, THEMES } = await load();
  const d = drafts();
  for (const [family, span] of Object.entries(NEW_GAMES)) {
    assert.deepEqual(d.games.new.filter((r) => r.id.startsWith(`${family}-`)).map((r) => r.id), range(family, span), family);
  }
  assert.equal(d.games.new.length, Object.values(NEW_GAMES).reduce((n, [a, b]) => n + b - a + 1, 0));
  assert.deepEqual(d.swipe.new.map((r) => r.id), range('swipe', NEW_SWIPE));
  const rows = [...d.games.new, ...d.swipe.new];
  for (const r of rows) assert.equal(r.plus, true, `${r.id} is plus`);
  for (const tema of THEMES) {
    const list = rows.filter((r) => r.tema === tema);
    assert.ok(list.length >= 22, `${tema}: ${list.length}`);
    for (const family of FAMILIES) {
      const inFamily = list.filter((r) => r.id.startsWith(`${family}-`));
      assert.ok(inFamily.length >= 2, `${tema} in ${family}: ${inFamily.length}`);
    }
  }
  // Mostly short choice prompts, so Play Us can draw them too.
  const short = (r, max) => r.answer_kind === 'choice' && r.question_text.length <= max && !/\{/.test(r.question_text + (r.options || []).join(''));
  for (const tema of THEMES) {
    const games = d.games.new.filter((r) => r.tema === tema);
    assert.ok(games.filter((r) => r.mechanic === 'reciprocal' && short(r, 70)).length >= 8, `${tema} Play Us quick prompts`);
    assert.ok(games.filter((r) => r.mechanic === 'prediction' && short(r, 80)).length >= 5, `${tema} Play Us «Quanto mi conosci» prompts`);
  }
});

test('content 1.3: every row has a theme, and a topic of its own that opens with it', async () => {
  const { drafts, THEMES } = await load();
  const d = drafts();
  for (const r of [...d.games.new, ...d.swipe.new]) {
    assert.ok(THEMES.includes(r.tema), `${r.id} theme ${r.tema}`);
    assert.match(r.topic, /^[a-z_]+$/, r.id);
    assert.ok(r.topic.startsWith(`${r.tema}_`) && r.topic.length > r.tema.length + 1, `${r.id} topic ${r.topic}`);
  }
  assert.equal(new Set(d.games.new.map((r) => r.topic)).size, d.games.new.length, 'one topic per prompt');
  assert.equal(new Set(d.swipe.new.map((r) => r.topic)).size, d.swipe.new.length, 'one topic per card');
  // The tile in Gioca names the theme in Italian.
  const games = fs.readFileSync(path.join(ROOT, 'games.js'), 'utf8');
  for (const tema of THEMES) assert.match(games, new RegExp(`PLUS_THEMES = Object\\.freeze\\(\\{[^}]*\\b${tema}: '`), `games.js labels ${tema}`);
});

test('content 1.3: English for every row, in the same shape as the Italian', async () => {
  const { drafts } = await load();
  const d = drafts();
  const text = (value, where) => assert.ok(typeof value === 'string' && value.trim().length >= 2, `${where} has English`);
  for (const r of d.games.new) {
    text(r.question_text_en, r.id);
    assert.deepEqual(TOKENS(r.question_text_en), TOKENS(r.question_text), `${r.id} same tokens`);
    if (r.predict_text) { text(r.predict_text_en, r.id); assert.match(r.predict_text_en, /\{subject\}/, r.id); }
    else assert.equal(r.predict_text_en, undefined, r.id);
    const options = r.options || [], en = r.options_en || [];
    assert.equal(en.length, options.length, `${r.id} options one to one`);
    assert.equal(new Set(en).size, en.length, `${r.id} distinct English options`);
    for (const o of en) assert.doesNotMatch(o, /\{/, `${r.id} no token in the options`);
  }
  for (const r of d.swipe.new) {
    text(r.question_text_en, r.id);
    assert.equal(r.options_en.length, 2, r.id);
    assert.notEqual(r.options_en[0], r.options_en[1], r.id);
    for (const o of r.options_en) assert.ok(o.trim().length >= 1 && o.length <= 24, `${r.id} English option «${o}»`);
  }
});

const italian = (d) => [
  ...d.games.new.flatMap((r) => [[r.id, r.question_text], [r.id, r.predict_text], ...(r.options || []).map((o) => [r.id, o])]),
  ...d.swipe.new.flatMap((r) => [[r.id, r.question_text], ...r.options.map((o) => [r.id, o])]),
].filter(([, t]) => t);
const english = (d) => [
  ...d.games.new.flatMap((r) => [[r.id, r.question_text_en], [r.id, r.predict_text_en], ...(r.options_en || []).map((o) => [r.id, o])]),
  ...d.swipe.new.flatMap((r) => [[r.id, r.question_text_en], ...r.options_en.map((o) => [r.id, o])]),
].filter(([, t]) => t);

test('content 1.3: suggest, never describe — no vulgar, explicit, intimate, pressing or alcohol words', async () => {
  const { drafts } = await load();
  const d = drafts();
  const offenders = [];
  for (const [where, t] of italian(d)) for (const rule of BANNED_IT) if (rule.test(t)) offenders.push(`${where} ${rule}: «${t}»`);
  for (const [where, t] of english(d)) for (const rule of BANNED_EN) if (rule.test(t)) offenders.push(`${where} ${rule}: «${t}»`);
  assert.deepEqual(offenders, []);
  // The list bites: one sample per family of words.
  for (const t of ['Ti piace il sesso?', 'Nudi sul divano', 'Un bicchiere di vino', 'Il tuo culo', 'Anche se non vuoi', 'Che cazzo']) {
    assert.ok(BANNED_IT.some((rule) => rule.test(t)), t);
  }
  for (const t of ['Sex on the sofa', 'Naked', 'A glass of wine', 'Your butt', 'Even if you don’t want to', 'What the fuck']) {
    assert.ok(BANNED_EN.some((rule) => rule.test(t)), t);
  }
  for (const t of ['Un bacio sul collo', 'Sotto le coperte', 'A hand on your hip', 'Breakfast in bed']) {
    assert.ok(!BANNED_IT.some((rule) => rule.test(t)) && !BANNED_EN.some((rule) => rule.test(t)), `${t} stays allowed`);
  }
});

test('content 1.3: inclusive Italian, no therapy, nothing that ages, house typography', async () => {
  const { drafts } = await load();
  const d = drafts();
  const offenders = [];
  for (const [where, t] of italian(d)) {
    for (const [rule, label] of INCLUSIVE) if (rule.test(t)) offenders.push(`${where} ${label}: «${t}»`);
    if (THERAPY.test(t)) offenders.push(`${where} therapy vocabulary: «${t}»`);
    if (AGES.test(t)) offenders.push(`${where} ages: «${t}»`);
    if (/\/[ao]\b|\(a\)/.test(t)) offenders.push(`${where} o/a slash: «${t}»`);
    if (/["“”]/.test(t)) offenders.push(`${where} Italian quotes are « »: «${t}»`);
    if (/\bqual è una cosa che\b|\bdavvero\b|\bvivere un\b/i.test(t)) offenders.push(`${where} calque or filler: «${t}»`);
  }
  for (const [where, t] of english(d)) {
    if (/[«»]/.test(t)) offenders.push(`${where} English quotes are “ ”: «${t}»`);
    if (AGES_EN.test(t)) offenders.push(`${where} ages: «${t}»`);
    if (/\b(?:he|she|him|her|his|hers|boyfriend|girlfriend|husband|wife)\b/i.test(t)) offenders.push(`${where} gendered English: «${t}»`);
  }
  for (const [where, t] of [...italian(d), ...english(d)]) {
    if (/'/.test(t)) offenders.push(`${where} straight apostrophe: «${t}»`);
    if (/\.\.\./.test(t)) offenders.push(`${where} three dots instead of …: «${t}»`);
    if (/\s{2,}|^\s|\s$/.test(t)) offenders.push(`${where} spacing: «${t}»`);
  }
  assert.deepEqual(offenders, []);
});

test('content 1.3: Game V2 and Questo o quello rules', async () => {
  const { drafts } = await load();
  const { BANNED_FILLER, FAMILIES: VISIBLE } = await loadM11b();
  const d = drafts();
  const COOLDOWN = { 1: 'light', 2: 'standard', 3: 'deep' };
  for (const r of d.games.new) {
    assert.ok(VISIBLE.includes(r.id.split('-')[0]) && r.id.split('-')[0] !== 'e_se', `${r.id} visible family`);
    assert.equal(r.cooldown_class, COOLDOWN[r.depth], `${r.id} cooldown follows depth`);
    assert.ok(r.question_text.trim().length >= 20 && r.question_text.length <= 140, `${r.id} short question`);
    assert.match(r.question_text, /[?.]$/, r.id);
    assert.match(r.question_text_en, /[?.]$/, r.id);
    const options = r.options || [];
    if (r.answer_kind === 'open') assert.equal(options.length, 0, r.id);
    else {
      assert.equal(r.answer_kind, 'choice', r.id);
      assert.ok(options.length >= 2 && options.length <= 4, `${r.id} 2-4 options`);
      assert.equal(new Set(options).size, options.length, r.id);
      for (const o of options) assert.ok(o.trim().length > 0 && o.length <= 45, `${r.id} short option «${o}»`);
    }
    if (r.id.startsWith('quanto_mi_conosci-')) {
      assert.equal(r.mechanic, 'prediction', r.id);
      assert.equal(r.answer_kind, 'choice', r.id);
      assert.match(r.predict_text, /\{subject\}/, r.id);
      assert.ok(r.predict_text.length >= 12 && r.predict_text.length <= 240, r.id);
    } else {
      assert.equal(r.mechanic, 'reciprocal', r.id);
      assert.equal(r.predict_text, undefined, r.id);
    }
    // No who-would option either: Play Us shows the text as it is.
    for (const t of [r.question_text, ...options]) assert.doesNotMatch(t, /\{/, `${r.id} no token`);
    for (const t of [r.question_text, r.predict_text || '', ...options]) {
      for (const banned of BANNED_FILLER) assert.doesNotMatch(t, banned, `${r.id} is generic filler`);
      assert.doesNotMatch(t, /compatibil|percentuale|punteggio|sbagliat/i, `${r.id} never scores the relationship`);
    }
  }
  for (const r of d.swipe.new) {
    assert.ok(r.question_text.length >= 12 && r.question_text.length <= 140, r.id);
    assert.ok(r.question_text.endsWith('?') && r.question_text_en.endsWith('?'), r.id);
    assert.equal(r.options.length, 2, r.id);
    assert.notEqual(r.options[0], r.options[1], r.id);
    for (const o of r.options) assert.ok(o.trim().length > 0 && o.length <= 28, `${r.id} option «${o}»`);
    for (const banned of BANNED_FILLER) assert.doesNotMatch(r.question_text, banned, `${r.id} is generic filler`);
  }
});
