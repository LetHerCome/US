// US 1.0 content — editorial contract of the founder-approved drafts
// (supabase/game-v2/content-1-0): the migration carries exactly the generated
// SQL, the counts are the approved ones, every active row has English, and the
// whole catalog after the fixes follows the inclusive-Italian rule and the
// typography the M11B, M9E and Swipe tests already hold the content to.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const importRepo = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const load = () => importRepo('supabase/game-v2/content-1-0-contract.mjs');
const loadM11b = () => importRepo('supabase/game-v2/catalog-contract.mjs');
const normalizeEol = (value) => value.replace(/\r\n/g, '\n');
const MIGRATION_FILE = 'supabase/migrations/20261014220000_content_1_0.sql';
const MIGRATION = normalizeEol(fs.readFileSync(path.join(ROOT, MIGRATION_FILE), 'utf8'));

const NEW_RANGES = {
  quanto_mi_conosci: [13, 52], scopritevi: [13, 42], ridete: [11, 40], confrontatevi: [11, 40], rivivete: [9, 28],
};
const FAMILY_TOTALS = { quanto_mi_conosci: 52, scopritevi: 42, ridete: 40, confrontatevi: 40, rivivete: 28, e_se: 10 };
const RETIRED = ['swipe-004', 'swipe-016', 'swipe-019', 'swipe-029', 'swipe-030'];
const id3 = (family, n) => `${family}-${String(n).padStart(3, '0')}`;
const range = (family, [from, to]) => Array.from({ length: to - from + 1 }, (_, i) => id3(family, from + i));

// Inclusive Italian: nothing may assume the gender of either partner.
const INCLUSIVE = [
  [/\bchi dei due\b/i, '«chi dei due»'],
  [/\bl[’']altr[oa]\b/i, '«l’altro/l’altra»'],
  [/\bentramb[ie]\b/i, '«entrambi»'],
  [/\buno dei due\b/i, '«uno dei due»'],
  [/\btutti e due\b/i, '«tutti e due»'],
  [/\bnessuno dei due\b/i, '«nessuno dei due»'],
  [/\bognun[oa]\b/i, '«ognuno/ognuna»'],
  [/\bper prim[oa]\b(?!\s+(?:cosa|volta)\b)/i, '«per primo/prima» as an adverb'],
  [/\bda sol[oa]\b/i, '«da solo/sola»'],
  [/\b(?:lui|lei)\b/i, 'lui/lei'],
];
const TOKENS = (text) => (String(text || '').match(/\{[a-z_]+\}/g) || []).sort();

test('content 1.0: the migration block is exactly the SQL generated from the approved drafts', async () => {
  const { contentSql, BLOCK, MIGRATION: file } = await load();
  const { extractBlock } = await loadM11b();
  assert.equal(file, MIGRATION_FILE);
  assert.equal(extractBlock(MIGRATION, BLOCK), normalizeEol(contentSql()), 'run node scripts/build-content-1-0-sql.mjs');
});

test('content 1.0: the migration comes after every other one and never deletes content', () => {
  const files = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  // Only the US 1.0 language migration, which serves this English per caller,
  // the US 1.0 server fixes (cron job and table privileges, no content) and the
  // S3.2 account deletion worker cron (a job, no content) and the time-neutral
  // wording of three questions (19/10, content only) follow it.
  assert.deepEqual(files.slice(files.indexOf(path.basename(MIGRATION_FILE)) + 1), ['20261014230000_us_1_0_locale_content_en.sql', '20261015000000_us_1_0_server_fixes.sql', '20261017120000_s32_account_deletion_worker_cron.sql', '20261019120000_us_1_0_content_time_neutral.sql']);
  const code = MIGRATION.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(?:table|column|policy|schema)\b/i.test(code), 'nothing is deleted');
  assert.ok(!/\bgrant\b|\bpolicy\b|row level security/i.test(code), 'grants and RLS stay as they are');
  // The only definer function is start_game_round itself, replaced in place.
  assert.equal(code.match(/security definer/gi).length, 1);
  assert.match(code, /CREATE OR REPLACE FUNCTION public\.start_game_round\(target_family text, request_id uuid\)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''/);
  assert.deepEqual([...code.matchAll(/\bdrop function if exists ([\w.]+\([^)]*\))/g)].map((m) => m[1]).sort(), [
    'private.game_v2_render(text, text)', 'private.game_v2_render_options(jsonb, text)', 'private.game_v2_role_label(text)',
  ]);
  assert.ok(!/'Francesco'|'Bea'/.test(MIGRATION.replace(/--.*$/gm, '')), 'no hardcoded partner names');
});

test('content 1.0: approved counts per family, ids as given and unique across old and new', async () => {
  const { drafts, finalState, GAME_FILES, NEW_PER_FAMILY, SWIPE_NEW } = await load();
  const { catalog } = await loadM11b();
  const d = drafts();
  for (const family of GAME_FILES) {
    assert.equal(d.games[family].family, family);
    assert.deepEqual(d.games[family].new.map((r) => r.id), range(family, NEW_RANGES[family]), `${family} ids`);
    assert.equal(d.games[family].new.length, NEW_PER_FAMILY[family], `${family} count`);
  }
  assert.equal(Object.values(NEW_PER_FAMILY).reduce((a, b) => a + b, 0), 150);
  assert.deepEqual(d.swipe.new.map((r) => r.id), range('swipe', [33, 72]));
  assert.equal(d.swipe.new.length, SWIPE_NEW);
  assert.deepEqual(d.swipe.retire.map((r) => r.id), RETIRED);

  const old = new Set(catalog().map((r) => r.id));
  const s = finalState();
  assert.equal(new Set(s.catalog.map((r) => r.id)).size, s.catalog.length, 'unique Game V2 ids');
  assert.equal(s.catalog.length, old.size + 150);
  for (const family of GAME_FILES) for (const r of d.games[family].new) assert.ok(!old.has(r.id), `${r.id} is new`);
  for (const [family, total] of Object.entries(FAMILY_TOTALS)) {
    assert.equal(s.catalog.filter((r) => r.family === family).length, total, family);
  }
  assert.equal(new Set(s.swipe.map((r) => r.id)).size, s.swipe.length, 'unique Swipe ids');
  assert.equal(s.swipe.length, 72);
  assert.equal(s.daily.length, 182);
  assert.equal(s.recipes.length, 13);
  assert.equal(s.quests.length, 33);
  // The M11B starter set stays exactly what its historical migration seeded.
  assert.equal(old.size, 62);
});

test('content 1.0: fixes keep the id and move the version on; retired cards stay, inactive', async () => {
  const { drafts, finalState, GAME_FILES } = await load();
  const d = drafts();
  const s = finalState();
  const game = new Map(s.catalog.map((r) => [r.id, r]));
  const fixes = GAME_FILES.flatMap((f) => d.games[f].fixes);
  assert.deepEqual(fixes.map((f) => f.id).sort(), ['confrontatevi-002', 'confrontatevi-008', 'e_se-006', 'ridete-001', 'ridete-003', 'ridete-005', 'ridete-008', 'rivivete-007']);
  for (const fix of fixes) {
    const row = game.get(fix.id);
    assert.equal(row.version, 2, `${fix.id} version`);
    if (fix.question_text) assert.equal(row.question_text, fix.question_text);
    if (fix.options) assert.deepEqual(row.options, fix.options);
  }
  assert.ok(s.catalog.filter((r) => !fixes.some((f) => f.id === r.id)).every((r) => r.version === 1));

  const swipe = new Map(s.swipe.map((r) => [r.id, r]));
  assert.equal(d.swipe.fixes.length, 9);
  for (const fix of d.swipe.fixes) {
    assert.equal(swipe.get(fix.id).version, 2, `${fix.id} version`);
    if (fix.question_text) assert.equal(swipe.get(fix.id).question_text, fix.question_text);
    if (fix.options) assert.deepEqual(swipe.get(fix.id).options, fix.options);
  }
  assert.deepEqual(s.swipe.filter((r) => !r.active).map((r) => r.id), RETIRED);
  assert.equal(s.swipe.filter((r) => r.active).length, 67);

  assert.equal(d.daily.fixes.length, 9);
  for (const fix of d.daily.fixes) assert.equal(s.daily.find((r) => r.id === fix.id).question, fix.question);
  const recipe = s.recipes.find((r) => r.id === 'calendar_past-002');
  assert.equal(recipe.version, 2);
  assert.equal(recipe.question_text, d.overrides.recipe_fixes[0].question);
  assert.equal(d.quests.fixes.length, 10);
  for (const fix of d.quests.fixes) assert.equal(s.quests.find((r) => r.key === fix.key).title, fix.title);
});

test('content 1.0: every active row has English, in the same shape as its Italian', async () => {
  const { drafts, finalState } = await load();
  const d = drafts();
  const s = finalState();
  const text = (value, where) => assert.ok(typeof value === 'string' && value.trim().length >= 2, `${where} has English`);
  for (const r of s.catalog) {
    text(r.question_text_en, r.id);
    assert.deepEqual(TOKENS(r.question_text_en), TOKENS(r.question_text), `${r.id} same tokens`);
    if (r.predict_text) {
      text(r.predict_text_en, `${r.id} predictor`);
      assert.match(r.predict_text_en, /\{subject\}/, `${r.id} English predictor names the subject`);
    } else assert.equal(r.predict_text_en, null, `${r.id} no English predictor`);
    assert.equal(r.options_en.length, r.options.length, `${r.id} options one to one`);
    assert.equal(new Set(r.options_en).size, r.options_en.length, `${r.id} distinct English options`);
    r.options.forEach((o, i) => {
      text(r.options_en[i], `${r.id} option ${i}`);
      if (/^\{(francesco|beatrice)\}$/.test(o)) assert.equal(r.options_en[i], o, `${r.id} who-would option ${i}`);
      else assert.doesNotMatch(r.options_en[i], /\{(francesco|beatrice)\}/, `${r.id} option ${i}`);
    });
  }
  for (const r of s.swipe) {
    if (!r.active) {
      assert.equal(r.question_text_en, undefined, `${r.id} retired: the drafts have no English for it`);
      continue;
    }
    text(r.question_text_en, r.id);
    assert.equal(r.options_en.length, 2, `${r.id} two English options`);
    assert.notEqual(r.options_en[0], r.options_en[1], `${r.id} distinct English options`);
    for (const o of r.options_en) assert.ok(o.trim().length >= 1 && o.length <= 24, `${r.id} English option length`);
  }
  const fixEn = new Map(d.daily.fixes.map((f) => [f.id, f.question_en]));
  for (const r of s.daily) {
    text(r.question_en, r.id);
    if (fixEn.has(r.id)) assert.equal(r.question_en, fixEn.get(r.id), `${r.id} fix and bank agree on the English`);
  }
  for (const r of s.recipes) {
    text(r.question_text_en, r.id);
    assert.deepEqual(TOKENS(r.question_text_en), TOKENS(r.question_text), `${r.id} same placeholders`);
  }
  assert.equal(d.overrides.recipe_fixes[0].question_en, s.recipes.find((r) => r.id === 'calendar_past-002').question_text_en);
  for (const r of s.quests) text(r.title_en, r.key);
});

test('content 1.0: inclusive Italian on every active row after the fixes', async () => {
  const { finalState } = await load();
  const s = finalState();
  const texts = [
    ...s.catalog.filter((r) => r.active).flatMap((r) => [[r.id, r.question_text], [r.id, r.predict_text], ...r.options.map((o) => [r.id, o])]),
    ...s.swipe.filter((r) => r.active).flatMap((r) => [[r.id, r.question_text], ...r.options.map((o) => [r.id, o])]),
    ...s.daily.filter((r) => r.active).map((r) => [r.id, r.question]),
    ...s.recipes.filter((r) => r.active).flatMap((r) => [[r.id, r.question_text], ...r.options.map((o) => [r.id, o])]),
    ...s.quests.filter((r) => r.active).map((r) => [r.key, r.title]),
  ].filter(([, t]) => t);
  assert.ok(texts.length > 700);
  const offenders = [];
  for (const [where, t] of texts) for (const [rule, label] of INCLUSIVE) if (rule.test(t)) offenders.push(`${where} ${label}: «${t}»`);
  assert.deepEqual(offenders, []);
});

test('content 1.0: the M11B editorial and typography rules hold for the whole Game V2 catalog', async () => {
  const { finalState } = await load();
  const { COOLDOWN_CLASSES, BANNED_FILLER, PLACEHOLDERS, FAMILIES } = await loadM11b();
  const rows = finalState().catalog;
  assert.ok(rows.length <= 240, 'a bounded reviewed set (M11B starter + the approved 1.0 prompts)');
  for (const r of rows) {
    assert.ok(FAMILIES.includes(r.family) && r.id.startsWith(`${r.family}-`), r.id);
    assert.ok(['reciprocal', 'prediction'].includes(r.mechanic), r.id);
    assert.ok(['open', 'choice'].includes(r.answer_kind), r.id);
    assert.ok([1, 2, 3].includes(r.depth), r.id);
    assert.match(r.topic, /^[a-z_]+$/, r.id);
    assert.ok(COOLDOWN_CLASSES.includes(r.cooldown_class), r.id);
    assert.ok(r.question_text.trim().length >= 20 && r.question_text.length <= 240, `${r.id} length`);
    assert.match(r.question_text, /[?.]$/, `${r.id} ends like a question`);
    assert.match(r.question_text_en, /[?.]$/, `${r.id} English ends like a question`);
    if (r.answer_kind === 'open') assert.equal(r.options.length, 0, `${r.id} open has no options`);
    else {
      assert.ok(r.options.length >= 2 && r.options.length <= 4, `${r.id} 2-4 options`);
      assert.equal(new Set(r.options).size, r.options.length, `${r.id} distinct options`);
      for (const o of r.options) assert.ok(o.trim().length >= 1 && o.length <= 120, `${r.id} option length`);
    }
    if (r.longitudinal) assert.equal(r.answer_kind, 'open', `${r.id} longitudinal prompts are open`);
    if (r.family === 'quanto_mi_conosci') assert.equal(r.mechanic, 'prediction', r.id);
    if (r.mechanic === 'prediction') {
      assert.equal(r.answer_kind, 'choice', r.id);
      assert.match(r.predict_text, /\{subject\}/, r.id);
      assert.doesNotMatch(r.question_text, /\{subject\}/, r.id);
    } else assert.equal(r.predict_text, null, `${r.id} no predictor text`);
    for (const t of [r.question_text, r.predict_text || '', ...r.options, r.question_text_en, r.predict_text_en || '', ...r.options_en]) {
      assert.doesNotMatch(t, /'/, `${r.id} uses the typographic apostrophe`);
      assert.doesNotMatch(t, /\.\.\./, `${r.id} uses the ellipsis character`);
      for (const ph of t.match(/\{[a-z_]+\}/g) || []) assert.ok(PLACEHOLDERS.includes(ph), `${r.id} unknown placeholder ${ph}`);
    }
    for (const t of [r.question_text, r.predict_text || '', ...r.options]) {
      assert.doesNotMatch(t, /\/[ao]\b|\(a\)/, `${r.id} has no o/a slash forms`);
      for (const banned of BANNED_FILLER) assert.doesNotMatch(t, banned, `${r.id} is generic filler`);
      assert.doesNotMatch(t, /compatibil|percentuale|punteggio|sbagliat/i, `${r.id} never scores the relationship`);
    }
    for (const o of r.options) if (/\{(francesco|beatrice)\}/.test(o)) assert.match(o, /^\{(francesco|beatrice)\}$/, `${r.id} who-would options are just names`);
    assert.doesNotMatch(r.question_text, /\{(francesco|beatrice)\}/, `${r.id} reciprocal prompts stay viewer-neutral`);
  }
  const norm = (q) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(new Set(rows.map((r) => norm(r.question_text))).size, rows.length, 'no duplicate wording');
  assert.equal(new Set(rows.map((r) => norm(r.question_text_en))).size, rows.length, 'no duplicate English wording');
});

test('content 1.0: Swipe, Daily, recipe and Quest wording keeps the house typography', async () => {
  const { finalState } = await load();
  const s = finalState();
  for (const r of s.swipe.filter((x) => x.active)) {
    assert.ok(r.question_text.trim().length >= 12 && r.question_text.length <= 240, `${r.id} length`);
    assert.ok(r.question_text.endsWith('?') && r.question_text_en.endsWith('?'), `${r.id} is a question`);
    assert.equal(r.options.length, 2);
    assert.notEqual(r.options[0], r.options[1]);
    assert.match(r.topic, /^[a-z_]+$/);
    for (const t of [r.question_text, ...r.options, r.question_text_en, ...r.options_en]) {
      assert.doesNotMatch(t, /'|\{[a-z_]+\}/, `${r.id} typographic apostrophe, no placeholders`);
    }
    for (const t of [r.question_text, ...r.options]) assert.doesNotMatch(t, /\/[ao]\b|\(a\)/, r.id);
  }
  // The M9E bank rules, on the fixed questions; the whole bank stays free of duplicates.
  const banned = /\b(elabor|trauma|confini|tossic|red flag|crisi|litig|tradiment|gelos|sess[ou]|sessual|problem|comunicazione|bisogni emotivi|autostima|percorso|crescita personale|mindset|obiettiv|produttiv|feedback|coppia sana|relazione sana)/i;
  for (const r of s.daily) {
    assert.ok(r.question.endsWith('?') && r.question_en.endsWith('?'), `${r.id} is a question`);
    assert.ok(r.question.length >= 20 && r.question.length <= 110, `${r.id} length ${r.question.length}`);
    assert.doesNotMatch(r.question, banned, `${r.id} avoids therapy/self-help vocabulary`);
    for (const t of [r.question, r.question_en]) assert.doesNotMatch(t, /'/, `${r.id} typographic apostrophe`);
    assert.doesNotMatch(r.question, /\/[ao]\b|\(a\)/, r.id);
  }
  const norm = (q) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(new Set(s.daily.map((r) => norm(r.question))).size, s.daily.length, 'no duplicate Daily Question');
  for (const r of s.recipes) {
    for (const t of [r.question_text, r.question_text_en]) assert.doesNotMatch(t, /'/, `${r.id} typographic apostrophe`);
    if (r.adapter !== 'longitudinal') assert.ok(r.question_text.length >= 12 && r.question_text.length <= 240, r.id);
  }
  for (const r of s.quests) {
    for (const t of [r.title, r.title_en]) assert.doesNotMatch(t, /'/, `${r.key} typographic apostrophe`);
    assert.doesNotMatch(r.title, /\/[ao]\b|\(a\)/, r.key);
  }
});
