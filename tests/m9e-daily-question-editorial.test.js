// M9E — editorial contract of the curated Daily Question bank (26 weeks, 182).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260930045233_m9e_daily_question_engine.sql'), 'utf8');
const seed = sql.slice(sql.indexOf('insert into public.daily_question_templates'));
const rows = [...seed.matchAll(/^\s+\('([a-z_]+-\d{2})', (\d), (\d+), '([^']+)', '([a-z_]+)'\)[,\n]/gm)]
  .map(([, id, slot, sequence, question, theme]) => ({ id, slot: Number(slot), sequence: Number(sequence), question, theme }));
const FAMILIES = { noi_adesso: 1, scoprirsi: 2, ricordi: 3, desideri: 4, vicinanza: 5, gioco: 6, profonda: 7 };

test('M9E bank: 182 template, 26 per ciascuna delle 7 famiglie, una famiglia per weekday', () => {
  assert.equal(rows.length, 182);
  for (const [theme, slot] of Object.entries(FAMILIES)) {
    const family = rows.filter((r) => r.theme === theme);
    assert.equal(family.length, 26, theme);
    assert.ok(family.every((r) => r.slot === slot), `${theme} lives only on ISO weekday ${slot}`);
    assert.deepEqual(family.map((r) => r.sequence), Array.from({ length: 26 }, (_, i) => i + 1), `${theme} sequence 1..26 in order`);
    assert.deepEqual(family.map((r) => r.id), family.map((r) => `${theme}-${String(r.sequence).padStart(2, '0')}`));
  }
  assert.equal(new Set(rows.map((r) => r.slot)).size, 7);
});

test('M9E bank: nessun duplicato o variante ripetitiva', () => {
  const norm = (q) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(new Set(rows.map((r) => norm(r.question))).size, 182);
  // No two questions share the same first six words (a cheap "variant" detector).
  const openings = rows.map((r) => norm(r.question).split(' ').slice(0, 6).join(' '));
  const dup = openings.filter((o, i) => openings.indexOf(o) !== i);
  assert.deepEqual(dup, []);
});

test('M9E bank: domande chiare, brevi, in italiano tipografico, senza tono da terapia o da manuale', () => {
  const banned = /\b(elabor|trauma|confini|tossic|red flag|crisi|litig|tradiment|gelos|sess[ou]|sessual|problem|comunicazione|bisogni emotivi|autostima|percorso|crescita personale|mindset|obiettiv|produttiv|feedback|coppia sana|relazione sana)/i;
  for (const r of rows) {
    assert.ok(r.question.endsWith('?'), `${r.id} ends with a question mark`);
    assert.ok(r.question.length >= 20 && r.question.length <= 110, `${r.id} length ${r.question.length}`);
    assert.ok((r.question.match(/\?/g) || []).length <= 2, `${r.id} at most two question marks`);
    assert.doesNotMatch(r.question, /'/, `${r.id} uses the typographic apostrophe like the rest of US`);
    assert.doesNotMatch(r.question, banned, `${r.id} avoids therapy/self-help vocabulary`);
    assert.doesNotMatch(r.question, /\b(insieme prima|mettetevi d.accordo|decidete insieme|chiedi all.altr|chiedete)\b/i, `${r.id} needs no coordination before answering`);
    assert.doesNotMatch(r.question, /\/[ao]\b|\(a\)/, `${r.id} has no o/a slash forms`);
  }
});
