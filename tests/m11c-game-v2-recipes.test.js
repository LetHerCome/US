// M11C — editorial contract of the context recipes. Titles come from the
// couple's own lists, so every recipe must read naturally whatever the title
// is (gender, number) and must frame it, never paraphrase it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const M11C = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260930153749_m11c_game_v2_context.sql'), 'utf8');
const load = () => import(path.join(ROOT, 'supabase/game-v2/catalog-contract.mjs'));

test('M11C recipes: the migration seed is exactly the generated JSON source', async () => {
  const c = await load();
  assert.equal(c.extractBlock(M11C, 'game-v2-recipes'), c.recipesSql());
});

test('M11C recipes: every adapter has reviewed recipes, ids are stable and unique', async () => {
  const { recipes, ADAPTERS, FAMILIES } = await load();
  const rows = recipes();
  assert.deepEqual([...new Set(rows.map((r) => r.adapter))].sort(), [...ADAPTERS].sort());
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.equal(new Set(rows.map((r) => r.topic)).size, rows.length, 'one topic per recipe keeps rounds varied');
  for (const r of rows) {
    assert.match(r.id, new RegExp(`^${r.adapter}-\\d{3}$`), r.id);
    assert.match(r.topic, /^ctx_[a-z_]+$/, r.id);
    assert.ok(r.kind_label.length >= 3 && r.kind_label.length <= 40, r.id);
    if (r.adapter === 'longitudinal') {
      assert.equal(r.family, null);
      assert.equal(r.question_text, '{previous_question}');
      assert.equal(r.cooldown_class, 'longitudinal');
      continue;
    }
    assert.ok(FAMILIES.includes(r.family) && r.family !== 'quanto_mi_conosci', `${r.id} family`);
    assert.equal(r.cooldown_class, 'context');
    assert.ok(['open', 'choice'].includes(r.answer_kind));
    if (r.answer_kind === 'choice') assert.ok(r.options.length >= 2 && r.options.length <= 4, r.id);
    else assert.ok(!r.options || r.options.length === 0, r.id);
  }
  assert.ok(rows.length <= 40, 'a small reviewed set, not a generator');
});

test('M11C recipes: titles are framed with «», placeholders are known, wording is title-neutral', async () => {
  const { recipes, PLACEHOLDERS, BANNED_FILLER } = await load();
  for (const r of recipes()) {
    const texts = [r.question_text, r.kind_label, ...(r.options || [])];
    for (const t of texts) {
      assert.doesNotMatch(t, /'/, `${r.id} uses the typographic apostrophe`);
      for (const ph of t.match(/\{[a-z_]+\}/g) || []) assert.ok(PLACEHOLDERS.includes(ph), `${r.id} unknown placeholder ${ph}`);
      for (const banned of BANNED_FILLER) assert.doesNotMatch(t, banned, r.id);
      assert.doesNotMatch(t, /compatibil|percentuale|punteggio|sbagliat/i, r.id);
    }
    if (['da_vivere_idea', 'da_vivere_lived', 'calendar_upcoming', 'calendar_past', 'moment'].includes(r.adapter)) {
      assert.match(r.question_text, /«\{title\}»/, `${r.id} quotes the title`);
      assert.equal((r.question_text.match(/\{title\}/g) || []).length, 1, `${r.id} names it once`);
      // A pronoun pointing at the title would guess its gender or number.
      assert.doesNotMatch(r.question_text, /\b(te la|te lo|come la|come lo|la rifaresti|lo rifaresti|l’hai|lo immagini|la immagini)\b/i, `${r.id} is title-neutral`);
      assert.match(r.question_text, /[?]$/, r.id);
    }
    if (r.adapter === 'calendar_upcoming') assert.doesNotMatch(r.question_text, /\{when\}/, `${r.id} future dates use {date}`);
    if (['calendar_past', 'moment'].includes(r.adapter)) assert.doesNotMatch(r.question_text, /\{date\}/, r.id);
    if (r.adapter === 'conservati') assert.doesNotMatch(r.question_text, /\{/, 'Conservati recipes carry no source text');
  }
});

test('M11C recipes: title sanitizer and Italian date labels', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec('create schema private;');
  const fns = [...M11C.matchAll(/create function private\.game_v2_(clean_title|month_name|when_label|day_label)\([\s\S]*?\$\$;/g)].map((m) => m[0]);
  for (const fn of fns) await db.exec(fn);
  const clean = async (v) => (await db.query('select private.game_v2_clean_title($1) r', [v])).rows[0].r;
  assert.equal(await clean('  Cena\n«da»   Nonna  '), 'Cena da Nonna');
  assert.equal(await clean('“Parigi”'), 'Parigi');
  for (const bad of ['ok', '♥♥♥', 'https://x.it/a', 'www.sito.it', 'prenota su booking.com', 'x'.repeat(61), '', null]) assert.equal(await clean(bad), null, String(bad));
  const when = async (d, at) => (await db.query('select private.game_v2_when_label($1::date, $2::date) r', [d, at])).rows[0].r;
  assert.equal(await when('2026-04-20', '2026-09-30'), 'ad aprile');
  assert.equal(await when('2026-08-02', '2026-09-30'), 'ad agosto');
  assert.equal(await when('2026-03-02', '2026-09-30'), 'a marzo');
  assert.equal(await when('2025-10-02', '2026-09-30'), 'a ottobre 2025');
  assert.equal((await db.query(`select private.game_v2_day_label('2026-10-12') r`)).rows[0].r, '12 ottobre');
});
