// Il grande bilanciamento v1 (founder, 28/11/2026, tavola
// https://claude.ai/artifact/SzTShSWnhTgxafLeU75vdw): the curve as a table,
// the points of each source, one reward per level with the wardrobe inside,
// the app icons for US Plus only, and no wave of announcements. The whole
// migration chain on a disposable PGlite (tests/helpers/mc2-db.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_bilanciamento_v1\.sql$/.test(f));
// Where levels 1..26 start (the approved table); after 26, +5000 a level.
const STARTS = [0, 150, 300, 475, 675, 875, 1100, 1350, 1625, 1975, 2375, 2800, 3250, 3750, 4275, 4825, 5425, 6050, 6700, 7400, 8125, 8875, 9675, 12075, 15475, 20075];
const LADDER = [
  [3, 'effect_pulse'], [5, 'frame_aurora'], [6, 'oggi_effect_dandelions'], [8, 'ti_penso_hearts'], [10, 'oggi_theme_golden'],
  [11, 'oggi_effect_snow'], [13, 'effect_duo'], [15, 'ring_orbit'], [16, 'oggi_effect_leaves'], [18, 'oggi_theme_seasonal'],
  [19, 'oggi_effect_shooting'], [21, 'ti_penso_letter'], [22, 'oggi_effect_lanterns'], [23, 'effect_constellation'],
  [24, 'frame_chrome'], [26, 'oggi_effect_memories']
];
const WARDROBE = [[2, 'occhiali'], [4, 'cappello'], [7, 'fiocco'], [9, 'sciarpina'], [12, 'sole'], [14, 'gala'], [17, 'cuffie'], [20, 'coroncina'], [25, 'corona']];

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const xp = async () => (await q('select bond_xp from public.couples where id = $1', [h.A]))[0].bond_xp;
const setXp = (n) => q('update public.couples set bond_xp = $1 where id = $2', [n, h.A]);
const events = (kind) => q('select source_key, xp_awarded from public.progression_events where couple_id = $1 and source_kind = $2 order by created_at, source_key', [h.A, kind]);
const progression = (user = h.F) => h.as(db, user, 'select public.get_progression_v1() r');
let n = 0;

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, comes after Play Us, and is listed in the cutoff', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_bilanciamento_v1.sql');
  assert.ok(FILE > '20261128101816_play_us_punti.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('the levels start at the new table, then one every 5000 points', async () => {
  for (let level = 2; level <= 26; level += 1) {
    const at = STARTS[level - 1];
    const [r] = await q('select private.progression_level($1) l, private.progression_level($2) b, private.progression_level_start($3) s', [at, at - 1, level]);
    assert.deepEqual([r.l, r.b, r.s], [level, level - 1, at], `level ${level} at ${at}`);
  }
  const [r] = await q('select private.progression_level(25074) a, private.progression_level(25075) b, private.progression_level(30075) c, private.progression_level_start(27) s');
  assert.deepEqual([r.a, r.b, r.c, r.s], [26, 27, 28, 25075]);
  const [info] = await q('select private.progression_level_info(1700) i');
  assert.deepEqual(info.i, { total_xp: 1700, level: 9, current_xp: 75, needed_xp: 350, remaining_xp: 275, progress: 75 / 350 });
  await setXp(1700);
  const p = await progression();
  assert.deepEqual([p.level, p.current_xp, p.needed_xp], [9, 75, 350]);
  // The next headline counts its points on the same table.
  assert.equal(p.next_headline.id, 'oggi_theme_golden');
  assert.equal(p.next_headline.xp_needed, STARTS[9] - 1700);
});

test('one reward per level: the ladder and the wardrobe never share a level', async () => {
  const rows = await q(`select id, level_required l, requires_plus p from public.progression_reward_catalog
    where active and category in ('effect','countdown','oggi_effect','oggi_theme','ti_penso','app_icon') order by level_required, id`);
  assert.deepEqual(rows.filter((r) => !r.p).map((r) => [r.l, r.id]), LADDER);
  const levels = [...LADDER, ...WARDROBE].map(([l]) => l).sort((a, b) => a - b);
  assert.deepEqual(levels, Array.from({ length: 25 }, (_, i) => i + 2), 'levels 2..26, one each');
  for (const [level, item] of WARDROBE) {
    await setXp(STARTS[level - 1] - 1);
    assert.ok(!(await h.as(db, h.F, 'select public.my_character_unlocks() r')).includes(item), `${item} not before level ${level}`);
    await setXp(STARTS[level - 1]);
    assert.ok((await h.as(db, h.B, 'select public.my_character_unlocks() r')).includes(item), `${item} at level ${level}`);
  }
});

test('the icons Neon, Notte and Oro are US Plus only, out of the ladder', async () => {
  const icons = await q(`select id, level_required l, requires_plus p, headline from public.progression_reward_catalog where category = 'app_icon' and active order by id`);
  assert.deepEqual(icons.map((r) => [r.id, r.l, r.p, r.headline]), [['app_icon_gold', 1, true, false], ['app_icon_neon', 1, true, false], ['app_icon_night', 1, true, false]]);
  await setXp(STARTS[25]);
  let p = await progression();
  assert.deepEqual(['app_icon_neon', 'app_icon_night', 'app_icon_gold'].map((id) => p.rewards.find((r) => r.id === id).unlocked), [false, false, false], 'the top level alone is not enough');
  await q(`insert into public.plus_entitlements(user_id, source, product, status) values ($1, 'manuale', 't', 'active')`, [h.B]);
  await setXp(0);
  p = await progression();
  assert.deepEqual(['app_icon_neon', 'app_icon_night', 'app_icon_gold'].map((id) => p.rewards.find((r) => r.id === id).unlocked), [true, true, true], 'Plus alone is');
});

test('la domanda di oggi gives 15, Ti penso 3 per person and day', async () => {
  const qid = (await q("insert into public.daily_questions(question_date, question, category) values ('2026-11-28', 'Domanda?', 'x') returning id"))[0].id;
  await q('insert into public.daily_answers(question_id, user_id, couple_id, answer) values ($1, $2, $3, $4)', [qid, h.F, h.A, 'sì']);
  assert.equal(await xp(), 0, 'one answer is not enough');
  await q('insert into public.daily_answers(question_id, user_id, couple_id, answer) values ($1, $2, $3, $4)', [qid, h.B, h.A, 'no']);
  assert.deepEqual(await events('daily'), [{ source_key: qid, xp_awarded: 15 }]);
  assert.equal(await xp(), 15);
  const think = (from, to, at) => q("insert into public.shared_messages(couple_id, sender_id, recipient_id, kind, body, created_at) values ($1, $2, $3, 'think', 'ti penso', $4::timestamptz)", [h.A, from, to, at]);
  await think(h.F, h.B, '2026-11-28T09:00:00Z');
  await think(h.F, h.B, '2026-11-28T10:00:00Z');
  await think(h.B, h.F, '2026-11-28T11:00:00Z');
  assert.deepEqual((await events('think')).map((e) => e.xp_awarded), [3, 3], 'once per person and day');
  assert.equal(await xp(), 21);
});

test('partite a turni: 15 the first of the day, 8 the second and third, 0 after', async () => {
  const round = async (at) => {
    const id = (await q("insert into public.game_sessions(couple_id, game_family, content_source, started_by_role, create_request_id, started_at, engine_version) values ($1, 'swipe', 'curated', 'francesco', gen_random_uuid(), $2::timestamptz, 2) returning id", [h.A, at]))[0].id;
    await q('update public.game_sessions set completed_at = $2::timestamptz where id = $1', [id, at]);
    return id;
  };
  for (const at of ['2026-11-28T08:00:00Z', '2026-11-28T09:00:00Z', '2026-11-28T10:00:00Z', '2026-11-28T11:00:00Z', '2026-11-28T12:00:00Z']) await round(at);
  await round('2026-11-29T08:00:00Z');
  assert.deepEqual((await events('game')).map((e) => e.xp_awarded), [15, 8, 8, 0, 0, 15], 'a new Rome day starts again from 15');
  assert.equal(await xp(), 15 + 8 + 8 + 15);
});

test('a photo gives 10 once per person and day', async () => {
  const add = (by) => q('insert into public.moments(couple_id, created_by, storage_path, moment_date) values ($1, $2, $3, current_date)', [h.A, by, `c/${by}/m${++n}.webp`]);
  await add(h.F); await add(h.F); await add(h.B);
  assert.deepEqual((await events('moment')).map((e) => e.xp_awarded), [10, 10]);
  assert.equal(await xp(), 20);
});

async function playUs(day) {
  const id = (await q(`insert into public.play_us_sessions(couple_id, day, invited_by, status, step, spent, seed, invite_expires_at)
    values ($1, $2::date, $3, 'playing', 8, true, 7, now()) returning id`, [h.A, day, h.F]))[0].id;
  await q(`insert into public.play_us_moves(session_id, couple_id, user_id, step, kind, slot, payload) values
    ($1, $2, $3, 3, 'edit', 0, jsonb_build_object('path', $5::text)), ($1, $2, $4, 3, 'edit', 0, jsonb_build_object('path', $6::text))`,
  [id, h.A, h.F, h.B, `c/${h.F}/play${++n}.webp`, `c/${h.B}/play${++n}.webp`]);
  await q('select private.play_us_finish($1)', [id]);
  await q("update public.play_us_sessions set status = 'done' where id = $1", [id]); // as play_us_advance does
  return (await q('select moment_id, result from public.play_us_sessions where id = $1', [id]))[0];
}

test('Play Us gives 25 for the first game of the day, 0 after; its memory is not a photo more', async () => {
  // A second game the same day: today the limit is 1 (one index), US Plus may raise it.
  await q('drop index public.play_us_sessions_one_spent_day');
  const first = await playUs('2026-11-28');
  assert.ok(first.moment_id, 'the memory is written');
  assert.equal(first.result.xp, 25);
  assert.equal((await q('select count(*)::int c from public.moments where id = $1', [first.moment_id]))[0].c, 1);
  assert.deepEqual(await events('moment'), [], 'no +10 for the memory of Play Us');
  assert.equal(await xp(), 25);
  const second = await playUs('2026-11-28');
  assert.equal(second.result.xp, 0);
  assert.deepEqual((await events('play_us')).map((e) => e.xp_awarded), [25, 0]);
  assert.equal(await xp(), 25);
  // The inviter's own photo that day still counts.
  await q('insert into public.moments(couple_id, created_by, storage_path, moment_date) values ($1, $2, $3, current_date)', [h.A, h.F, `c/${h.F}/m${++n}.webp`]);
  assert.deepEqual((await events('moment')).map((e) => e.xp_awarded), [10]);
  assert.equal(await xp(), 35);
});

test('Il vostro mese: +20 the first time the couple opens the pack of a month', async () => {
  const pack = (kind, start) => q("insert into public.us_mese_pacchi(couple_id, kind, period_start) values ($1, $2, $3::date) returning id", [h.A, kind, start]).then((r) => r[0].id);
  const october = await pack('mese', '2026-10-01');
  assert.equal((await h.as(db, h.F, 'select public.apri_pacchetto_v1($1) r', [october])).opened, true);
  assert.equal(await xp(), 20);
  await h.as(db, h.B, 'select public.apri_pacchetto_v1($1) r', [october]);
  await h.as(db, h.F, 'select public.apri_pacchetto_v1($1) r', [october]);
  assert.deepEqual(await events('mese'), [{ source_key: october, xp_awarded: 20 }], 'once per pack, whoever opens it');
  const november = await pack('mese', '2026-11-01');
  await h.as(db, h.B, 'select public.apri_pacchetto_v1($1) r', [november]);
  const year = await pack('anno', '2026-01-01');
  await h.as(db, h.B, 'select public.apri_pacchetto_v1($1) r', [year]);
  assert.equal(await xp(), 40, 'the golden pack of the year gives no points');
  // Someone outside the couple: nothing opened, nothing given.
  await h.as(db, h.U1, 'select public.apri_pacchetto_v1($1) r', [november]);
  assert.equal((await events('mese')).length, 2);
  assert.equal(await xp(), 40);
});

test('what the new curve gives at once is already seen; what is no longer unlocked comes off', async () => {
  // A couple at 1100 points, as before the balance pass, wearing the old points' scarf.
  await q('update public.couples set bond_xp = 1100 where id = $1', [h.A]);
  await q("update public.profiles set character_head = 'fiocco', character_face = 'sciarpina' where id = $1", [h.F]);
  await q("update public.progression_reward_catalog set level_required = 20 where id in ('frame_aurora', 'oggi_effect_dandelions')");
  await q("delete from public.couple_reward_unlocks where couple_id = $1 and reward_id in ('frame_aurora', 'oggi_effect_dandelions')", [h.A]);
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  const p = await progression();
  assert.equal(p.level, 7);
  for (const id of ['frame_aurora', 'oggi_effect_dandelions']) {
    assert.equal(p.rewards.find((r) => r.id === id).unlocked, true, `${id} unlocked`);
    assert.ok(!p.pending_unlocks.some((u) => u.id === id), `${id} not announced`);
  }
  const worn = (await q('select character_head, character_face from public.profiles where id = $1', [h.F]))[0];
  assert.deepEqual(worn, { character_head: 'fiocco', character_face: null }, 'the scarf now comes at level 9');
  // Re-applying changes nothing.
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  assert.equal((await progression()).level, 7);
});
