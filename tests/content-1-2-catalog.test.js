// US content 1.2 — editorial contract of the drafts in
// supabase/game-v2/content-1-2: the migration carries exactly the generated
// SQL, ids and counts are the planned ones, every prompt has a theme and a
// topic of its own, English in the same shape, the house rules of content
// 1.0 and 1.1 (inclusive Italian, typography, no therapy vocabulary, no
// filler), nothing that ages, and the US Plus share (about 40% of the new
// rows, on every family and theme). The database side is in
// tests/content-1-2-db.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const importRepo = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const load = () => importRepo('supabase/game-v2/content-1-2-contract.mjs');
const loadM11b = () => importRepo('supabase/game-v2/catalog-contract.mjs');
const normalizeEol = (value) => value.replace(/\r\n/g, '\n');
const MIGRATION_FILE = 'supabase/migrations/20261128104908_contenuti_1_2.sql';
const MIGRATION = normalizeEol(fs.readFileSync(path.join(ROOT, MIGRATION_FILE), 'utf8'));
const pad = (family, n) => `${family}-${String(n).padStart(3, '0')}`;
const range = (family, [from, to]) => Array.from({ length: to - from + 1 }, (_, i) => pad(family, from + i));
const TOKENS = (text) => (String(text || '').match(/\{[a-z_]+\}/g) || []).sort();

// The same rules as content 1.1: nothing assumes the gender of either partner.
const INCLUSIVE = [
  [/\bchi dei due\b/i, '«chi dei due»'], [/\bl[’']altr[oa]\b/i, '«l’altro/l’altra»'], [/\bentramb[ie]\b/i, '«entrambi»'],
  [/\buno dei due\b/i, '«uno dei due»'], [/\btutti e due\b/i, '«tutti e due»'], [/\bnessuno dei due\b/i, '«nessuno dei due»'],
  [/\bognun[oa]\b/i, '«ognuno/ognuna»'], [/\bper prim[oa]\b(?!\s+(?:cosa|volta)\b)/i, '«per primo/prima» as an adverb'],
  [/\bda sol[oa]\b/i, '«da solo/sola»'], [/\b(?:lui|lei)\b/i, 'lui/lei'],
  [/\b(\w+)[oe] o \1[ae]\b/i, 'doubled gender form («sveglio o sveglia»)'],
  // Masculine plurals about the couple (revisione testi, 14/11/2026) and
  // adjectives that guess who answers.
  [/\b(?:vicini(?! di casa)|lontani|persi|partiti|andati|conosciuti|arrivati|innamorat[oi]|fidanzati|sposati|stanch[oi]|famosi|liberi|tranquilli|divertiti|pensati|messi)\b/i, 'gendered form'],
  [/\b(?:da piccol[oa]|da bambin[oa]|bambino|bambina)\b/i, 'gendered childhood («da piccolo»)'],
];
const THERAPY = /\b(elabor|trauma|confini|tossic|red flag|crisi|litig|tradiment|gelos|sess[ou]|sessual|problem|comunicazione|bisogni|autostima|percorso|crescita personale|mindset|obiettiv|produttiv|feedback|coppia sana|relazione sana|terapi|conflitt)/i;
// Questions read wrong on the day they come out, or once a date has passed.
const AGES = /\b(oggi|ieri|stamattina|stasera|quest[’']anno|anno scorso|settimana scorsa|questa settimana|questo weekend|20\d\d)\b/i;

test('content 1.2: the migration block is exactly the SQL generated from the drafts', async () => {
  const { contentSql, BLOCK, MIGRATION: file } = await load();
  const { extractBlock } = await loadM11b();
  assert.equal(file, MIGRATION_FILE);
  const block = extractBlock(MIGRATION, BLOCK);
  assert.equal(block, normalizeEol(contentSql()), 'run node scripts/build-content-1-2-sql.mjs');
  const code = block.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\b(delete|update|truncate|drop|alter|grant|revoke|create)\b/i.test(code), 'the content block only inserts');
  assert.equal(code.match(/\binsert into\b/gi).length, 2);
  assert.equal(code.match(/on conflict \(id\) do nothing/gi).length, 2);
  // Outside the block: only the plus columns, the three functions, the checks.
  // play_us_answer is copied with the grants it already had.
  const rest = MIGRATION.replace(block, '').replace(/--.*$/gm, '')
    .replace(/^revoke all on function public\.play_us_answer\(uuid, boolean\) from public, anon;$/m, '')
    .replace(/^grant execute on function public\.play_us_answer\(uuid, boolean\) to authenticated;$/m, '');
  assert.ok(!/\b(delete from|truncate|drop table|drop function|grant|revoke)\b/i.test(rest), 'no delete, drop or grant change');
  assert.deepEqual((rest.match(/create or replace function [a-z0-9_.]+/gi) || []).map((s) => s.toLowerCase().split(' ').pop()),
    ['private.game_v2_candidates', 'public.start_swipe_round', 'public.play_us_answer']);
  const cutoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(path.basename(MIGRATION_FILE)));
  assert.ok(cutoff.forward_migrations.includes(path.basename(MIGRATION_FILE)));
});

test('content 1.2: planned ids and counts, at least 30 per playable family', async () => {
  const { drafts, NEW_GAMES, NEW_SWIPE } = await load();
  const d = drafts();
  for (const [family, span] of Object.entries(NEW_GAMES)) {
    const ids = d.games.new.filter((r) => r.id.startsWith(`${family}-`)).map((r) => r.id);
    assert.deepEqual(ids, range(family, span), family);
    assert.ok(ids.length >= 30, `${family}: ${ids.length}`);
  }
  assert.equal(d.games.new.length, Object.values(NEW_GAMES).reduce((n, [a, b]) => n + b - a + 1, 0));
  assert.deepEqual(d.swipe.new.map((r) => r.id), range('swipe', NEW_SWIPE));
  assert.ok(d.swipe.new.length >= 30);
});

test('content 1.2: every row has a theme, and a topic of its own that opens with it', async () => {
  const { drafts, THEMES } = await load();
  const d = drafts();
  const rows = [...d.games.new, ...d.swipe.new];
  for (const r of rows) {
    assert.ok(THEMES.includes(r.tema), `${r.id} theme ${r.tema}`);
    assert.match(r.topic, /^[a-z_]+$/, r.id);
    assert.ok(r.topic.startsWith(`${r.tema}_`) && r.topic.length > r.tema.length + 1, `${r.id} topic ${r.topic}`);
  }
  assert.equal(new Set(d.games.new.map((r) => r.topic)).size, d.games.new.length, 'one topic per prompt');
  assert.equal(new Set(d.swipe.new.map((r) => r.topic)).size, d.swipe.new.length, 'one topic per card');
  // Every theme in every family, and in Questo o quello.
  for (const family of ['quanto_mi_conosci', 'ridete', 'scopritevi', 'confrontatevi', 'rivivete', 'swipe']) {
    const list = family === 'swipe' ? d.swipe.new : d.games.new.filter((r) => r.id.startsWith(`${family}-`));
    assert.deepEqual([...new Set(list.map((r) => r.tema))].sort(), [...THEMES].sort(), family);
  }
});

test('content 1.2: US Plus is about 40% of the new rows, on every family and theme', async () => {
  const { drafts, THEMES } = await load();
  const d = drafts();
  const rows = [...d.games.new, ...d.swipe.new];
  const share = (list) => list.filter((r) => r.plus === true).length / list.length;
  for (const r of rows) assert.equal(typeof r.plus, 'boolean', r.id);
  assert.ok(share(rows) >= 0.35 && share(rows) <= 0.45, `overall ${share(rows)}`);
  for (const family of ['quanto_mi_conosci', 'ridete', 'scopritevi', 'confrontatevi', 'rivivete', 'swipe']) {
    const list = family === 'swipe' ? d.swipe.new : d.games.new.filter((r) => r.id.startsWith(`${family}-`));
    assert.ok(share(list) >= 0.35 && share(list) <= 0.45, `${family} ${share(list)}`);
  }
  for (const tema of THEMES) {
    const list = rows.filter((r) => r.tema === tema);
    assert.ok(share(list) >= 0.25 && share(list) <= 0.55, `${tema} ${share(list)}`);
  }
  // Play Us draws short choice prompts: the free new ones must be there too.
  const short = (r, max) => r.answer_kind === 'choice' && r.question_text.length <= max && !/\{/.test(r.question_text + (r.options || []).join(''));
  const quick = d.games.new.filter((r) => r.mechanic === 'reciprocal' && short(r, 70));
  const know = d.games.new.filter((r) => r.mechanic === 'prediction' && short(r, 80));
  assert.ok(quick.filter((r) => !r.plus).length >= 20 && quick.filter((r) => r.plus).length >= 10, 'Play Us quick prompts');
  assert.ok(know.filter((r) => !r.plus).length >= 15 && know.filter((r) => r.plus).length >= 10, 'Play Us «Quanto mi conosci» prompts');
});

test('content 1.2: English for every row, in the same shape as the Italian', async () => {
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
    options.forEach((o, i) => {
      if (/^\{(francesco|beatrice)\}$/.test(o)) assert.equal(en[i], o, `${r.id} who-would option ${i}`);
      else assert.doesNotMatch(en[i], /\{(francesco|beatrice)\}/, `${r.id} option ${i}`);
    });
  }
  for (const r of d.swipe.new) {
    text(r.question_text_en, r.id);
    assert.equal(r.options_en.length, 2, r.id);
    assert.notEqual(r.options_en[0], r.options_en[1], r.id);
    for (const o of r.options_en) assert.ok(o.trim().length >= 1 && o.length <= 24, `${r.id} English option «${o}»`);
  }
});

test('content 1.2: inclusive Italian, no therapy, nothing that ages, house typography', async () => {
  const { drafts } = await load();
  const d = drafts();
  const texts = [
    ...d.games.new.flatMap((r) => [[r.id, r.question_text], [r.id, r.predict_text], ...(r.options || []).map((o) => [r.id, o])]),
    ...d.swipe.new.flatMap((r) => [[r.id, r.question_text], ...r.options.map((o) => [r.id, o])]),
  ].filter(([, t]) => t);
  const english = [
    ...d.games.new.flatMap((r) => [[r.id, r.question_text_en], [r.id, r.predict_text_en], ...(r.options_en || []).map((o) => [r.id, o])]),
    ...d.swipe.new.flatMap((r) => [[r.id, r.question_text_en], ...r.options_en.map((o) => [r.id, o])]),
  ].filter(([, t]) => t);
  const offenders = [];
  for (const [where, t] of texts) {
    for (const [rule, label] of INCLUSIVE) if (rule.test(t)) offenders.push(`${where} ${label}: «${t}»`);
    if (THERAPY.test(t)) offenders.push(`${where} therapy vocabulary: «${t}»`);
    if (AGES.test(t)) offenders.push(`${where} ages: «${t}»`);
    if (/\/[ao]\b|\(a\)/.test(t)) offenders.push(`${where} o/a slash: «${t}»`);
    if (/["“”]/.test(t)) offenders.push(`${where} Italian quotes are « »: «${t}»`);
    if (/\bqual è una cosa che\b|\bdavvero\b|\bvivere un\b/i.test(t)) offenders.push(`${where} calque or filler: «${t}»`);
  }
  for (const [where, t] of english) if (/[«»]/.test(t)) offenders.push(`${where} English quotes are “ ”: «${t}»`);
  for (const [where, t] of [...texts, ...english]) {
    if (/'/.test(t)) offenders.push(`${where} straight apostrophe: «${t}»`);
    if (/\.\.\./.test(t)) offenders.push(`${where} three dots instead of …: «${t}»`);
    if (/\s{2,}|^\s|\s$/.test(t)) offenders.push(`${where} spacing: «${t}»`);
  }
  assert.deepEqual(offenders, []);
});

test('content 1.2: Game V2 and Questo o quello rules', async () => {
  const { drafts } = await load();
  const { BANNED_FILLER, FAMILIES } = await loadM11b();
  const d = drafts();
  const COOLDOWN = { 1: 'light', 2: 'standard', 3: 'deep' };
  for (const r of d.games.new) {
    assert.ok(FAMILIES.includes(r.id.split('-')[0]) && r.id.split('-')[0] !== 'e_se', `${r.id} visible family`);
    assert.equal(r.cooldown_class, COOLDOWN[r.depth], `${r.id} cooldown follows depth`);
    assert.ok(r.question_text.trim().length >= 20 && r.question_text.length <= 140, `${r.id} short question`);
    assert.match(r.question_text, /[?.]$/, r.id);
    assert.match(r.question_text_en, /[?.]$/, r.id);
    const options = r.options || [];
    if (r.answer_kind === 'open') assert.equal(options.length, 0, r.id);
    else {
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
    assert.doesNotMatch(r.question_text, /\{/, `${r.id} the question stays viewer-neutral`);
    for (const o of options) if (/\{/.test(o)) assert.match(o, /^\{(francesco|beatrice)\}$/, r.id);
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
