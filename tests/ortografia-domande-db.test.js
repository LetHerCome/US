// Spelling pass on every active question (founder, 31/10/2026) on a real
// Postgres (PGlite): the whole repository chain. The texts read right, a
// game item changed once gets version + 1 once, future days take the new
// daily text, and re-applying the migration changes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { database } = require('./helpers/mc2-db');

const FILE = '20261031120000_ortografia_domande.sql';
const SQL = () => fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations', FILE), 'utf8');
const rows = async (db, sql) => (await db.query(sql)).rows;
const WRONG = /buon umore|Un’amicizia ti confida|ha lo sguardo perso nel vuoto e chiedi|sembrare che sia ieri|prendercela lenta|meglio del previsto, cosa sarebbe successo/;

async function allItalian(db) {
  return rows(db, `select 'daily ' || id as id, question as t from public.daily_question_templates where active
    union all select 'game ' || id, question_text from public.game_v2_catalog where active
    union all select 'predict ' || id, predict_text from public.game_v2_catalog where active and predict_text is not null
    union all select 'option ' || id, o from public.game_v2_catalog, jsonb_array_elements_text(options) as o where active
    union all select 'recipe ' || id, question_text from public.game_v2_recipes where active and question_text is not null
    union all select 'swipe ' || id, question_text from private.game_swipe_v1_catalog where active`);
}

test('every active question reads right after the spelling pass', async () => {
  const db = await database({ seed: false });
  try {
    for (const row of await allItalian(db)) assert.doesNotMatch(row.t, WRONG, row.id);
    const daily = await rows(db, "select id, question from public.daily_question_templates where active and question like '%«%'");
    assert.deepEqual(daily, [], 'the daily questions quote with “ ”, as all the others');

    const fixed = await rows(db, `select id, question_text, predict_text from public.game_v2_catalog where id in ('quanto_mi_conosci-040','quanto_mi_conosci-070') order by id`);
    assert.equal(fixed[0].predict_text, 'Vedi {subject} con lo sguardo perso nel vuoto e chiedi «a cosa pensi?». Qual è la risposta vera?');
    assert.equal(fixed[1].question_text, 'Qualcuno ti confida un segreto. Quanto resiste?');
    const [option] = await rows(db, "select options->>3 as o from public.game_v2_catalog where id = 'scopritevi-057'");
    assert.equal(option.o, 'Rivedersi come se fosse ieri');
  } finally { await db.close(); }
});

test('the spelling pass bumps a version once and leaves days already shown alone', async () => {
  const db = await database({ seed: false });
  try {
    await db.exec(`insert into public.daily_questions (question_date, question, category, template_id)
      values ('2026-01-05', 'Cosa ti mette di buon umore appena apri gli occhi?', 'scoprirsi', 'scoprirsi-37'),
             ('2099-01-05', 'Cosa ti mette di buon umore appena apri gli occhi?', 'scoprirsi', 'scoprirsi-37');`);
    const versions = async () => rows(db, `select id, version from public.game_v2_catalog where id in ('quanto_mi_conosci-040','quanto_mi_conosci-070','scopritevi-057')
      union all select id, version from public.game_v2_recipes where id = 'calendar_upcoming-002'
      union all select id, version from private.game_swipe_v1_catalog where id = 'swipe-010' order by 1`);
    const before = await versions();
    await db.exec(SQL());
    assert.deepEqual(await versions(), before, 're-applying changes nothing');

    const days = await rows(db, "select question_date::text as d, question from public.daily_questions where template_id = 'scoprirsi-37' order by 1");
    assert.match(days[0].question, /buon umore/, 'a day already shown keeps what people answered');
    assert.equal(days[1].question, 'Cosa ti mette di buonumore appena apri gli occhi?', 'a future day takes the new text');
  } finally { await db.close(); }
});
