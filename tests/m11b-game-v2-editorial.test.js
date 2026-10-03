// M11B — editorial contract of the curated Game V2 catalog. A regex cannot
// tell whether a question is emotionally good; these checks keep the source
// reviewable, well-formed, in sync with the migration, and free of the
// obvious generic filler the product explicitly rejects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const M11B = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260930153745_m11b_game_v2_core.sql'), 'utf8');
const load = () => import(pathToFileURL(path.join(ROOT, 'supabase/game-v2/catalog-contract.mjs')).href);

test('M11B catalog: the migration seed is exactly the generated JSON source', async () => {
  const c = await load();
  assert.equal(c.extractBlock(M11B, 'game-v2-catalog'), c.catalogSql());
});

test('M11B catalog: six families, stable unique ids, enough prompts per mode', async () => {
  const { catalog, FAMILIES } = await load();
  const rows = catalog();
  assert.deepEqual([...new Set(rows.map((r) => r.family))].sort(), [...FAMILIES].sort());
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'unique ids');
  for (const r of rows) assert.match(r.id, new RegExp(`^${r.family}-\\d{3}$`), r.id);
  for (const family of FAMILIES) {
    const own = rows.filter((r) => r.family === family);
    assert.ok(own.length >= 8, `${family} has at least 8 prompts (${own.length})`);
    assert.ok(own.some((r) => r.depth === 1), `${family} has a light opener`);
  }
  assert.ok(rows.length <= 120, 'a bounded reviewed starter set, not a giant bank');
});

test('M11B catalog: well-formed formats, options and metadata', async () => {
  const { catalog, COOLDOWN_CLASSES } = await load();
  for (const r of catalog()) {
    assert.ok(['reciprocal', 'prediction'].includes(r.mechanic), r.id);
    assert.ok(['open', 'choice'].includes(r.answer_kind), r.id);
    assert.ok([1, 2, 3].includes(r.depth), r.id);
    assert.match(r.topic, /^[a-z_]+$/, r.id);
    assert.ok(COOLDOWN_CLASSES.includes(r.cooldown_class), r.id);
    assert.ok(r.question_text.trim().length >= 20 && r.question_text.length <= 240, `${r.id} length`);
    assert.match(r.question_text, /[?.]$/, `${r.id} ends like a question`);
    if (r.answer_kind === 'open') assert.ok(!r.options || r.options.length === 0, `${r.id} open has no options`);
    else {
      assert.ok(r.options.length >= 2 && r.options.length <= 4, `${r.id} 2-4 options`);
      assert.equal(new Set(r.options).size, r.options.length, `${r.id} distinct options`);
      for (const o of r.options) assert.ok(o.trim().length >= 1 && o.length <= 120, `${r.id} option length`);
    }
  }
});

test('M11B catalog: prediction is first-class and only where it can be compared', async () => {
  const { catalog } = await load();
  const rows = catalog();
  for (const r of rows) {
    if (r.family === 'quanto_mi_conosci') assert.equal(r.mechanic, 'prediction', `${r.id} Quanto mi conosci is prediction`);
    if (r.mechanic !== 'prediction') { assert.equal(r.predict_text, undefined, `${r.id} no predictor text`); continue; }
    assert.equal(r.answer_kind, 'choice', `${r.id} prediction needs choices`);
    assert.match(r.predict_text, /\{subject\}/, `${r.id} predictor wording names the subject`);
    assert.doesNotMatch(r.question_text, /\{subject\}/, `${r.id} the subject reads a direct question`);
  }
  assert.ok(rows.filter((r) => r.mechanic === 'prediction').length >= 8);
});

test('M11B catalog: Italian typography, placeholders and no generic filler', async () => {
  const { catalog, BANNED_FILLER, PLACEHOLDERS } = await load();
  for (const r of catalog()) {
    const texts = [r.question_text, r.predict_text || '', ...(r.options || [])];
    for (const t of texts) {
      assert.doesNotMatch(t, /'/, `${r.id} uses the typographic apostrophe`);
      assert.doesNotMatch(t, /\/[ao]\b|\(a\)/, `${r.id} has no o/a slash forms`);
      for (const ph of t.match(/\{[a-z_]+\}/g) || []) assert.ok(PLACEHOLDERS.includes(ph), `${r.id} unknown placeholder ${ph}`);
      for (const banned of BANNED_FILLER) assert.doesNotMatch(t, banned, `${r.id} is generic filler`);
      assert.doesNotMatch(t, /compatibil|percentuale|punteggio|sbagliat/i, `${r.id} never scores the relationship`);
    }
    for (const o of r.options || []) if (/\{(francesco|beatrice)\}/.test(o)) assert.match(o, /^\{(francesco|beatrice)\}$/, `${r.id} who-would options are just names`);
    assert.doesNotMatch(r.question_text, /\{(francesco|beatrice)\}/, `${r.id} reciprocal prompts stay viewer-neutral`);
  }
  const norm = (q) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = catalog();
  assert.equal(new Set(rows.map((r) => norm(r.question_text))).size, rows.length, 'no duplicate wording');
});
