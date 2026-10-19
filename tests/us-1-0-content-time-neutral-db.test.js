// US 1.0 time-neutral questions (19/10/2026) on a real Postgres (PGlite): the
// repository chain, then 20261019120000 (twice). No catalog text assumes a
// year together; future days take the new text, days already shown keep theirs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');
const { PLATFORM } = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const FILE = '20261019120000_us_1_0_content_time_neutral.sql';
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8');
const SQL = read(FILE);
const ASSUMES_A_YEAR = /ultimo anno|nostro ultimo anno|last year|past year/i;

async function chain() {
  const db = await newDb();
  try {
    await db.exec(PLATFORM);
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < FILE && !/_s32_/.test(f)).sort()) await db.exec(read(file));
    return db;
  } catch (error) { await db.close(); throw error; }
}
const rows = async (db, sql) => (await db.query(sql)).rows;

test('time-neutral questions: nothing in the daily bank or Scopritevi assumes a year together', async () => {
  const db = await chain();
  try {
    await db.exec(`insert into public.daily_questions (question_date, question, category, template_id)
      select d, t.question, 'profonda', t.id from public.daily_question_templates t,
      (values ('2026-01-05'::date), ('2099-01-05'::date)) as x(d) where t.id = 'profonda-03';`);
    const before = await rows(db, "select version from public.game_v2_catalog where id = 'scopritevi-003'");

    await db.exec(SQL);
    await db.exec(SQL);

    const daily = await rows(db, "select id, question, question_en from public.daily_question_templates where id in ('gioco-21','profonda-03','ricordi-26') order by id");
    assert.deepEqual(daily.map((r) => r.id), ['gioco-21', 'profonda-03', 'ricordi-26']);
    assert.doesNotMatch(daily[0].question, /casa nostra/, 'no shared home assumed');
    for (const row of daily) {
      assert.doesNotMatch(row.question, ASSUMES_A_YEAR);
      assert.doesNotMatch(row.question_en, ASSUMES_A_YEAR);
    }
    assert.match(daily[1].question, /da quando stiamo insieme\?$/);

    const days = await rows(db, "select question_date::text as d, question from public.daily_questions where template_id = 'profonda-03' order by 1");
    assert.match(days[0].question, /nell’ultimo anno/, 'a day already shown keeps what people answered');
    assert.equal(days[1].question, daily[1].question, 'a future day takes the new text');

    const game = await rows(db, "select question_text, question_text_en, version from public.game_v2_catalog where id = 'scopritevi-003'");
    assert.doesNotMatch(game[0].question_text, ASSUMES_A_YEAR);
    assert.doesNotMatch(game[0].question_text_en, ASSUMES_A_YEAR);
    assert.equal(game[0].version, before[0].version + 1, 'version + 1 once, not again on re-apply');

    const active = await rows(db, `select question as t from public.daily_question_templates where active
      union all select question_en from public.daily_question_templates where active
      union all select question_text from public.game_v2_catalog where active
      union all select question_text_en from public.game_v2_catalog where active`);
    assert.deepEqual(active.filter((r) => ASSUMES_A_YEAR.test(r.t || '')).map((r) => r.t), []);
  } finally { await db.close(); }
});

test('time-neutral questions: content only — no delete, grant, policy or function', () => {
  const code = SQL.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\bdelete\s+from\b|\btruncate\b|\bdrop\b/i.test(code));
  assert.ok(!/\bgrant\b|\bpolicy\b|\bcreate\b/i.test(code));
});
