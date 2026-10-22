// US content 1.1 — editorial contract of the drafts in
// supabase/game-v2/content-1-1: the migration carries exactly the generated
// SQL, ids and counts are the planned ones, nothing repeats what US already
// has, every row has English in the same shape, and the house rules of
// content 1.0 (inclusive Italian, typography, no therapy vocabulary) hold.
// Then the migration runs on the full schema, twice, and the next Daily
// Question after a used-up cycle is a new one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const importRepo = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const load = () => importRepo('supabase/game-v2/content-1-1-contract.mjs');
const loadPrevious = () => importRepo('supabase/game-v2/content-1-0-contract.mjs');
const loadM11b = () => importRepo('supabase/game-v2/catalog-contract.mjs');
const normalizeEol = (value) => value.replace(/\r\n/g, '\n');
const MIGRATION_FILE = 'supabase/migrations/20261022160549_content_1_1.sql';
const MIGRATION = normalizeEol(fs.readFileSync(path.join(ROOT, MIGRATION_FILE), 'utf8'));
const pad = (family, n, width) => `${family}-${String(n).padStart(width, '0')}`;
const range = (family, [from, to], width = 3) => Array.from({ length: to - from + 1 }, (_, i) => pad(family, from + i, width));
const TOKENS = (text) => (String(text || '').match(/\{[a-z_]+\}/g) || []).sort();
const norm = (q) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (q) => new Set(norm(q).split(' ').filter((w) => w.length > 3));
const similarity = (a, b) => {
  const x = words(a), y = words(b);
  const common = [...x].filter((w) => y.has(w)).length;
  return common / Math.max(1, Math.min(x.size, y.size));
};

// Same inclusive-Italian rule as content 1.0: nothing assumes the gender of either partner.
const INCLUSIVE = [
  [/\bchi dei due\b/i, '«chi dei due»'], [/\bl[’']altr[oa]\b/i, '«l’altro/l’altra»'], [/\bentramb[ie]\b/i, '«entrambi»'],
  [/\buno dei due\b/i, '«uno dei due»'], [/\btutti e due\b/i, '«tutti e due»'], [/\bnessuno dei due\b/i, '«nessuno dei due»'],
  [/\bognun[oa]\b/i, '«ognuno/ognuna»'], [/\bper prim[oa]\b(?!\s+(?:cosa|volta)\b)/i, '«per primo/prima» as an adverb'],
  [/\bda sol[oa]\b/i, '«da solo/sola»'], [/\b(?:lui|lei)\b/i, 'lui/lei'],
  // Doubled forms read as forms, not as a conversation.
  [/\b(\w+)[oe] o \1[ae]\b/i, 'doubled gender form («sveglio o sveglia»)'],
];
const THERAPY = /\b(elabor|trauma|confini|tossic|red flag|crisi|litig|tradiment|gelos|sess[ou]|sessual|problem|comunicazione|bisogni|autostima|percorso|crescita personale|mindset|obiettiv|produttiv|feedback|coppia sana|relazione sana|terapi|conflitt)/i;

test('content 1.1: the migration block is exactly the SQL generated from the drafts', async () => {
  const { contentSql, BLOCK, MIGRATION: file } = await load();
  const { extractBlock } = await loadM11b();
  assert.equal(file, MIGRATION_FILE);
  assert.equal(extractBlock(MIGRATION, BLOCK), normalizeEol(contentSql()), 'run node scripts/build-content-1-1-sql.mjs');
  const code = MIGRATION.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\b(delete|update|truncate|drop|alter|grant|revoke|create)\b/i.test(code), 'insert only');
  assert.equal(code.match(/\binsert into\b/gi).length, 4);
  assert.equal(code.match(/on conflict \((?:id|key)\) do nothing/gi).length, 4);
  const cutoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(path.basename(MIGRATION_FILE)));
  assert.ok(cutoff.forward_migrations.includes(path.basename(MIGRATION_FILE)));
});

test('content 1.1: planned ids and counts, none already used', async () => {
  const { drafts, NEW_GAMES, NEW_SWIPE, DAILY_SEQUENCES, WEEKDAY } = await load();
  const { finalState } = await loadPrevious();
  const d = drafts();
  const before = finalState();
  for (const theme of Object.keys(WEEKDAY)) {
    assert.deepEqual(d.daily.new.filter((r) => r.id.startsWith(`${theme}-`)).map((r) => r.id), range(theme, DAILY_SEQUENCES, 2), theme);
  }
  assert.equal(d.daily.new.length, 182);
  for (const [family, span] of Object.entries(NEW_GAMES)) {
    assert.deepEqual(d.games.new.filter((r) => r.id.startsWith(`${family}-`)).map((r) => r.id), range(family, span), family);
  }
  assert.equal(d.games.new.length, 84);
  assert.deepEqual(d.swipe.new.map((r) => r.id), range('swipe', NEW_SWIPE));
  assert.equal(d.quests.new.length, 16);
  const taken = new Set([...before.daily.map((r) => r.id), ...before.catalog.map((r) => r.id), ...before.swipe.map((r) => r.id), ...before.quests.map((r) => r.key)]);
  for (const id of [...d.daily.new.map((r) => r.id), ...d.games.new.map((r) => r.id), ...d.swipe.new.map((r) => r.id), ...d.quests.new.map((q) => q.key)]) {
    assert.ok(!taken.has(id), `${id} is new`);
  }
  const keys = d.quests.new.map((q) => q.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(d.games.new.map((r) => r.topic)).size, d.games.new.length, 'one topic per prompt');
});

test('content 1.1: nothing repeats what US already asks, in Italian or English', async () => {
  const { drafts } = await load();
  const { finalState } = await loadPrevious();
  const d = drafts();
  const before = finalState();
  const groups = [
    ['daily', before.daily.map((r) => [r.id, r.question, r.question_en]), d.daily.new.map((r) => [r.id, r.question, r.question_en])],
    ['game', before.catalog.map((r) => [r.id, r.question_text, r.question_text_en]), d.games.new.map((r) => [r.id, r.question_text, r.question_text_en])],
    ['swipe', before.swipe.filter((r) => r.active).map((r) => [r.id, r.question_text, r.question_text_en]), d.swipe.new.map((r) => [r.id, r.question_text, r.question_text_en])],
    ['quest', before.quests.map((r) => [r.key, r.title, r.title_en]), d.quests.new.map((r) => [r.key, r.title, r.title_en])],
  ];
  const clashes = [];
  for (const [label, old, fresh] of groups) {
    const all = [...old, ...fresh];
    for (const lang of [1, 2]) assert.equal(new Set(all.map((r) => norm(r[lang]))).size, all.length, `${label}: no duplicate wording (${lang === 1 ? 'it' : 'en'})`);
    for (const [id, it] of fresh) for (const [otherId, other] of all) {
      if (otherId !== id && similarity(it, other) >= 0.8 && words(it).size >= 4) clashes.push(`${id} ≈ ${otherId}: «${it}» / «${other}»`);
    }
  }
  assert.deepEqual(clashes, [], 'near-duplicates');
});

test('content 1.1: English for every row, in the same shape as the Italian', async () => {
  const { drafts } = await load();
  const d = drafts();
  const text = (value, where) => assert.ok(typeof value === 'string' && value.trim().length >= 2, `${where} has English`);
  for (const r of d.daily.new) { text(r.question_en, r.id); assert.ok(r.question_en.endsWith('?'), r.id); }
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
  for (const q of d.quests.new) text(q.title_en, q.key);
});

test('content 1.1: inclusive Italian, no therapy, house typography', async () => {
  const { drafts } = await load();
  const d = drafts();
  const texts = [
    ...d.daily.new.map((r) => [r.id, r.question]),
    ...d.games.new.flatMap((r) => [[r.id, r.question_text], [r.id, r.predict_text], ...(r.options || []).map((o) => [r.id, o])]),
    ...d.swipe.new.flatMap((r) => [[r.id, r.question_text], ...r.options.map((o) => [r.id, o])]),
    ...d.quests.new.map((q) => [q.key, q.title]),
  ].filter(([, t]) => t);
  const offenders = [];
  for (const [where, t] of texts) {
    for (const [rule, label] of INCLUSIVE) if (rule.test(t)) offenders.push(`${where} ${label}: «${t}»`);
    if (THERAPY.test(t)) offenders.push(`${where} therapy vocabulary: «${t}»`);
    if (/\/[ao]\b|\(a\)/.test(t)) offenders.push(`${where} o/a slash: «${t}»`);
  }
  const english = [
    ...d.daily.new.map((r) => [r.id, r.question_en]),
    ...d.games.new.flatMap((r) => [[r.id, r.question_text_en], [r.id, r.predict_text_en], ...(r.options_en || []).map((o) => [r.id, o])]),
    ...d.swipe.new.flatMap((r) => [[r.id, r.question_text_en], ...r.options_en.map((o) => [r.id, o])]),
    ...d.quests.new.map((q) => [q.key, q.title_en]),
  ].filter(([, t]) => t);
  for (const [where, t] of [...texts, ...english]) {
    if (/'/.test(t)) offenders.push(`${where} straight apostrophe: «${t}»`);
    if (/\.\.\./.test(t)) offenders.push(`${where} three dots instead of …: «${t}»`);
    if (/\s{2,}|^\s|\s$/.test(t)) offenders.push(`${where} spacing: «${t}»`);
  }
  assert.deepEqual(offenders, []);
});

test('content 1.1: Game V2, Swipe, Daily and mission rules', async () => {
  const { drafts, QUEST_XP, QUEST_MODES, QUEST_CATEGORIES } = await load();
  const { BANNED_FILLER, FAMILIES } = await loadM11b();
  const d = drafts();
  const COOLDOWN = { 1: 'light', 2: 'standard', 3: 'deep' };
  for (const r of d.games.new) {
    assert.ok(FAMILIES.includes(r.id.split('-')[0]) && r.id.split('-')[0] !== 'e_se', `${r.id} visible family`);
    assert.equal(r.cooldown_class, COOLDOWN[r.depth], `${r.id} cooldown follows depth`);
    assert.match(r.topic, /^[a-z_]+$/, r.id);
    assert.ok(r.question_text.trim().length >= 20 && r.question_text.length <= 240, `${r.id} length`);
    assert.match(r.question_text, /[?.]$/, r.id);
    assert.match(r.question_text_en, /[?.]$/, r.id);
    const options = r.options || [];
    if (r.answer_kind === 'open') assert.equal(options.length, 0, r.id);
    else {
      assert.ok(options.length >= 2 && options.length <= 4, `${r.id} 2-4 options`);
      assert.equal(new Set(options).size, options.length, r.id);
      for (const o of options) assert.ok(o.length <= 120, r.id);
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
    assert.doesNotMatch(r.question_text, /\{(francesco|beatrice|subject)\}/, `${r.id} the question stays viewer-neutral`);
    for (const o of options) if (/\{(francesco|beatrice)\}/.test(o)) assert.match(o, /^\{(francesco|beatrice)\}$/, r.id);
    for (const t of [r.question_text, r.predict_text || '', ...options]) {
      for (const banned of BANNED_FILLER) assert.doesNotMatch(t, banned, `${r.id} is generic filler`);
      assert.doesNotMatch(t, /compatibil|percentuale|punteggio|sbagliat/i, `${r.id} never scores the relationship`);
    }
  }
  for (const r of d.swipe.new) {
    assert.ok(r.question_text.length >= 12 && r.question_text.length <= 240, r.id);
    assert.ok(r.question_text.endsWith('?') && r.question_text_en.endsWith('?'), r.id);
    assert.equal(r.options.length, 2, r.id);
    assert.notEqual(r.options[0], r.options[1], r.id);
    for (const o of r.options) assert.ok(o.length <= 28, `${r.id} option «${o}»`);
    assert.match(r.topic, /^[a-z_]+$/, r.id);
  }
  for (const r of d.daily.new) {
    assert.ok(r.question.endsWith('?'), r.id);
    assert.ok(r.question.length >= 20 && r.question.length <= 110, `${r.id} length ${r.question.length}`);
    for (const banned of BANNED_FILLER) assert.doesNotMatch(r.question, banned, `${r.id} is generic filler`);
  }
  for (const q of d.quests.new) {
    assert.ok(QUEST_MODES.includes(q.mode) && q.key.startsWith(`${q.mode}-`), q.key);
    assert.ok(QUEST_CATEGORIES.includes(q.category), q.key);
    assert.equal(q.xp, QUEST_XP[q.rarity], `${q.key} xp follows rarity`);
    assert.ok(q.title.endsWith('.') && q.title_en.endsWith('.'), q.key);
    assert.ok(q.title.length >= 20 && q.title.length <= 140, `${q.key} length`);
  }
});

test('content 1.1: applies on the full schema, twice, and the next Daily Question is a new one', async () => {
  const h = require('./helpers/mc2-db');
  const db = await h.database({ seed: false });
  try {
    const n = async (sql) => Number((await db.query(sql)).rows[0].n);
    assert.equal(await n('select count(*) n from public.daily_question_templates where active'), 364);
    assert.equal(await n('select count(*) n from public.game_v2_catalog'), 212 + 84);
    assert.equal(await n('select count(*) n from private.game_swipe_v1_catalog where active'), 67 + 30);
    assert.equal(await n('select count(*) n from public.bond_quest_templates where active'), 33 + 16);
    assert.equal(await n("select count(*) n from public.daily_question_templates where question_en is null or btrim(question_en) = ''"), 0);
    const fingerprint = async () => (await db.query(`select md5(string_agg(x, '|' order by x)) h from (
      select t::text x from public.daily_question_templates t union all select c::text from public.game_v2_catalog c
      union all select s::text from private.game_swipe_v1_catalog s union all select q::text from public.bond_quest_templates q) z`)).rows[0].h;
    const before = await fingerprint();
    await db.exec(MIGRATION);
    assert.equal(await fingerprint(), before, 're-applying changes nothing');

    // A used-up 26-week cycle of Mondays: the next Monday gets a new question.
    const { rows: used } = await db.query("select id, question from public.daily_question_templates where weekday_slot = 1 and sequence <= 26 order by sequence");
    for (const [i, t] of used.entries()) {
      await db.query("insert into public.daily_questions(question_date, question, template_id) values (date '2026-01-05' + $1 * 7, $2, $3)", [i, t.question, t.id]);
    }
    const next = (await db.query("select (private.materialize_daily_question(date '2026-01-05' + 26 * 7)).template_id id")).rows[0].id;
    assert.equal(next, 'noi_adesso-27');
  } finally { await db.close(); }
});
