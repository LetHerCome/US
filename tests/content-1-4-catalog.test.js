// US content 1.4 «domande a scelta» — editorial contract of the draft in
// supabase/game-v2/content-1-4: the migration carries exactly the generated
// SQL, the planned prompts per game, 3–4 short options in Italian and
// English, the same house rules as content 1.2/1.3 (inclusive Italian,
// typography, no therapy vocabulary, nothing that ages, no new placeholder)
// and, for the piccante/desideri prompts, the founder's line of content 1.3.
// The database side is in tests/content-1-4-db.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const importRepo = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const load = () => importRepo('supabase/game-v2/content-1-4-contract.mjs');
const loadM11b = () => importRepo('supabase/game-v2/catalog-contract.mjs');
const normalizeEol = (value) => value.replace(/\r\n/g, '\n');
const MIGRATION_FILE = 'supabase/migrations/20261128122730_domande_a_scelta.sql';
const MIGRATION = normalizeEol(fs.readFileSync(path.join(ROOT, MIGRATION_FILE), 'utf8'));
const PLANNED = { ridete: 44, scopritevi: 54, confrontatevi: 14, rivivete: 29 };
const HOT = /^(piccante|desideri)_/;

// The rules of content 1.2 and 1.3.
const INCLUSIVE = [
  [/\bchi dei due\b/i, '«chi dei due»'], [/\bl[’']altr[oa]\b/i, '«l’altro/l’altra»'], [/\bentramb[ie]\b/i, '«entrambi»'],
  [/\buno dei due\b/i, '«uno dei due»'], [/\btutti e due\b/i, '«tutti e due»'], [/\bnessuno dei due\b/i, '«nessuno dei due»'],
  [/\bognun[oa]\b/i, '«ognuno/ognuna»'], [/\bper prim[oa]\b(?!\s+(?:cosa|volta)\b)/i, '«per primo/prima» as an adverb'],
  [/\bda sol[oa]\b/i, '«da solo/sola»'], [/\b(?:lui|lei)\b/i, 'lui/lei'],
  [/\b(\w+)[oe] o \1[ae]\b/i, 'doubled gender form («sveglio o sveglia»)'],
  [/\b(?:vicini(?! di casa)|lontani|persi|partiti|andati|conosciuti|arrivati|innamorat[oi]|fidanzati|sposati|stanch[oi]|famosi|liberi|tranquilli|divertiti|pensati|messi)\b/i, 'gendered form'],
  [/\b(?:eccitat[oaie]|sedott[oaie]|baciat[oaie]|svegli[oe]?|pront[oaie]|abbracciat[oaie]|stretti|nervos[oaie]|imbarazzat[oaie]|attratt[oaie]|sol[ie] soletti)\b/i, 'gendered form of content 1.3'],
  // Options in the first person that would guess who answers.
  [/\b(?:cresciut[oa]|ero piccol[oa]|da piccol[oa]|sono (?:stanc|content|pront|brav))/i, 'first person with a gender'],
];
const THERAPY = /\b(elabor|trauma|confini|tossic|red flag|crisi|litig|tradiment|gelos|sess[ou]|sessual|problem|comunicazione|bisogni|autostima|percorso|crescita personale|mindset|obiettiv|produttiv|feedback|coppia sana|relazione sana|terapi|conflitt)/i;
const AGES = /\b(oggi|ieri|stamattina|stasera|quest[’']anno|anno scorso|settimana scorsa|questa settimana|questo weekend|20\d\d)\b/i;
const AGES_EN = /\b(today|tonight|yesterday|this morning|this year|last year|last week|this week|this weekend|20\d\d)\b/i;
// The founder's line of content 1.3, for the piccante/desideri prompts.
const BANNED_IT = [
  /\bsess[oiu]/i, /\bsexy\b/i, /\bnud[oaie]\b|\bnudit/i, /\bspogli/i, /\borgasm/i, /\beccit/i, /\berotic/i, /\bporn/i,
  /\bper forza\b/i, /\bobblig/i, /\bvin[oi]\b/i, /\bbirr[ae]\b/i, /\balcol/i, /\bubriac/i, /\bcocktail/i, /\bchampagne/i, /\bdrog/i,
  /\bslip\b|\bmutand|\breggiseno|\blingerie\b/i,
];
const BANNED_EN = [
  /\bsex/i, /\bnaked\b|\bnude\b/i, /\bundress/i, /\bstrip/i, /\bhorny\b/i, /\berotic/i, /\bporn/i, /\bhave to\b|\bforced?\b/i,
  /\bwine\b/i, /\bbeer\b/i, /\balcohol/i, /\bdrunk\b|\btipsy\b/i, /\bcocktail/i, /\bchampagne\b/i, /\bdrugs?\b/i,
  /\bunderwear\b|\blingerie\b/i,
];

test('content 1.4: the migration block is exactly the SQL generated from the draft', async () => {
  const { contentSql, BLOCK, MIGRATION: file } = await load();
  const { extractBlock } = await loadM11b();
  assert.equal(file, MIGRATION_FILE);
  const block = extractBlock(MIGRATION, BLOCK);
  assert.equal(block, normalizeEol(contentSql()), 'run node scripts/build-content-1-4-sql.mjs');
  const code = block.replace(/--.*$/gm, '').replace(/\$changes\$[\s\S]*?\$changes\$/g, "''").replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\b(delete|insert|truncate|drop|alter|grant|revoke|create)\b/i.test(code), 'the content block only updates');
  assert.equal(code.match(/\bupdate public\.game_v2_catalog\b/gi).length, 1);
  assert.ok(!/\b(daily_question|couple_questions|game_session|swipe)/i.test(code), 'nothing else is touched');
  assert.equal(MIGRATION.replace(block, '').replace(/--.*$/gm, '').trim(), '', 'outside the block only comments');
  const cutoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(path.basename(MIGRATION_FILE)));
  assert.ok(cutoff.forward_migrations.includes(path.basename(MIGRATION_FILE)));
});

test('content 1.4: planned prompts per game, Rivivete keeps about 25 open', async () => {
  const { drafts, FAMILIES } = await load();
  const d = drafts();
  const ids = d.convert.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'one line per prompt');
  for (const [family, n] of Object.entries(PLANNED)) {
    assert.equal(ids.filter((id) => id.startsWith(`${family}-`)).length, n, family);
  }
  for (const id of ids) assert.ok(FAMILIES.includes(id.split('-')[0]), `${id} family`);
  assert.equal(new Set(d.keep_open).size, d.keep_open.length);
  for (const id of d.keep_open) {
    assert.match(id, /^rivivete-\d{3}$/, id);
    assert.ok(!ids.includes(id), `${id} stays open`);
  }
  // 22 memory details + the 3 longitudinal prompts of Rivivete.
  assert.ok(d.keep_open.length + 3 >= 23 && d.keep_open.length + 3 <= 27, `Rivivete open: ${d.keep_open.length + 3}`);
  for (const r of d.convert) {
    assert.ok(Number.isInteger(r.from.version) && r.from.version >= 1, `${r.id} from version`);
    assert.ok(r.from.question_text && r.from.question_text_en, `${r.id} from wording`);
  }
});

test('content 1.4: 3–4 short options, Italian and English one to one, no placeholder', async () => {
  const { drafts } = await load();
  const { BANNED_FILLER } = await loadM11b();
  for (const r of drafts().convert) {
    for (const [q, lang] of [[r.question_text, 'it'], [r.question_text_en, 'en']]) {
      assert.ok(typeof q === 'string' && q.trim().length >= 20 && q.length <= 140, `${r.id} ${lang} question length`);
      assert.match(q, /[?.]$/, `${r.id} ${lang} question ends`);
      assert.doesNotMatch(q, /\{/, `${r.id} ${lang} no placeholder`);
    }
    assert.ok(r.options.length >= 3 && r.options.length <= 4, `${r.id} 3-4 options`);
    assert.equal(r.options_en.length, r.options.length, `${r.id} English options one to one`);
    for (const list of [r.options, r.options_en]) {
      assert.equal(new Set(list.map((o) => o.toLowerCase())).size, list.length, `${r.id} distinct options`);
      for (const o of list) {
        assert.ok(typeof o === 'string' && o.trim().length > 0, `${r.id} empty option`);
        assert.ok(o.length <= 45, `${r.id} short option «${o}»`);
        assert.doesNotMatch(o, /\{/, `${r.id} no placeholder in «${o}»`);
      }
    }
    for (const o of r.options) assert.ok(o.length <= 40, `${r.id} Italian option within 40: «${o}»`);
    for (const t of [r.question_text, ...r.options]) {
      for (const banned of BANNED_FILLER) assert.doesNotMatch(t, banned, `${r.id} is generic filler`);
      assert.doesNotMatch(t, /compatibil|percentuale|punteggio|sbagliat[oaie] risposta/i, `${r.id} never scores the relationship`);
    }
  }
});

const italian = (d) => d.convert.flatMap((r) => [[r.id, r.question_text], ...r.options.map((o) => [r.id, o])]);
const english = (d) => d.convert.flatMap((r) => [[r.id, r.question_text_en], ...r.options_en.map((o) => [r.id, o])]);

test('content 1.4: inclusive Italian, no therapy, nothing that ages, house typography', async () => {
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
    if ((t.match(/«/g) || []).length !== (t.match(/»/g) || []).length) offenders.push(`${where} unbalanced « »: «${t}»`);
    if ((t.match(/“/g) || []).length !== (t.match(/”/g) || []).length) offenders.push(`${where} unbalanced “ ”: «${t}»`);
  }
  assert.deepEqual(offenders, []);
  // The rules bite.
  for (const t of ['Chi dei due?', 'Siamo arrivati', 'Cosa fai oggi?', 'Dov\'è', 'Una crisi', 'Sono stanco']) {
    assert.ok(INCLUSIVE.some(([rule]) => rule.test(t)) || AGES.test(t) || THERAPY.test(t) || /'/.test(t), t);
  }
});

test('content 1.4: piccante and desideri prompts keep the line of content 1.3', async () => {
  const { drafts } = await load();
  const hot = drafts().convert.filter((r) => HOT.test(r.from.topic));
  assert.ok(hot.length >= 4, `hot prompts: ${hot.length}`);
  const offenders = [];
  for (const r of hot) {
    assert.equal(r.from.plus, true, `${r.id} stays plus`);
    for (const t of [r.question_text, ...r.options]) for (const rule of BANNED_IT) if (rule.test(t)) offenders.push(`${r.id} ${rule}: «${t}»`);
    for (const t of [r.question_text_en, ...r.options_en]) for (const rule of BANNED_EN) if (rule.test(t)) offenders.push(`${r.id} ${rule}: «${t}»`);
  }
  assert.deepEqual(offenders, []);
});
