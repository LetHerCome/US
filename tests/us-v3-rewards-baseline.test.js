// US V3 rewards (20261009100419_us_v3_oggi_looks_rewards.sql) reviewed on the
// production baseline (supabase/baseline, the F2A.1 capture) instead of the
// history fixture of us-v3-rewards-db.test.js: every object it touches exists
// there as it expects, it applies cleanly and twice to the same state, nothing
// a couple earned is lost, and on the full migration chain it composes with
// the Sintonia events guard in timestamp order. Embedded PostgreSQL (PGlite);
// nothing here reaches a remote database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { ROOT } = require('../scripts/supabase-baseline/evidence.cjs');
const { rebuild, newDb } = require('../scripts/supabase-baseline/rebuild.cjs');

const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const V3_FILE = '20261009100419_us_v3_oggi_looks_rewards.sql';
const GUARD_FILE = '20261014210000_sintonia_event_xp_guard.sql';
const read = (file) => fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
const V3 = read(V3_FILE);

const COUNTDOWN_REWARDS = ['frame_aurora', 'frame_chrome', 'ring_orbit'];
const OGGI = { oggi_effect_petals: 2, oggi_theme_cinematic: 4, oggi_effect_fireflies: 6, oggi_theme_moonlight: 7, oggi_effect_bokeh: 10, oggi_theme_seasonal: 12, oggi_effect_snow: 13 };
const RETIRED = ['frame', 'sticker', 'badge', 'ring'];

async function couple(db, xp) {
  const w = { c: randomUUID(), f: randomUUID(), b: randomUUID() };
  await db.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false), ($3, $4, false)', [w.f, `${w.f}@example.test`, w.b, `${w.b}@example.test`]);
  await db.query("insert into public.couples (id, name, bond_xp) values ($1, 'US.', $2)", [w.c, xp]);
  await db.query("insert into public.profiles (id, display_name, couple_id, role) values ($1, 'Francesco', $3, 'francesco'), ($2, 'Beatrice', $3, 'beatrice')", [w.f, w.b, w.c]);
  return w;
}
async function as(db, uid, sql, params = []) {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await db.exec('set local role authenticated');
    const res = await db.query(sql, params);
    await db.exec('commit');
    return res.rows;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}
const progression = async (db, uid) => (await as(db, uid, 'select public.get_progression_v1() as s'))[0].s;
const catalog = async (db) => (await db.query('select * from public.progression_reward_catalog order by id')).rows;
const checkDef = async (db) => (await db.query("select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'progression_reward_catalog_category_check'")).rows.map((r) => r.d);
async function snapshot(db, w) {
  const rows = async (sql) => (await db.query(sql, [w.c])).rows;
  return {
    unlocks: await rows('select reward_id, unlocked_at from public.couple_reward_unlocks where couple_id = $1 order by reward_id'),
    views: await rows('select reward_id, profile_id, seen_at from public.progression_reward_views where couple_id = $1 order by reward_id, profile_id'),
    prefs: await rows('select * from public.couple_progression_preferences where couple_id = $1'),
    xp: await rows('select bond_xp from public.couples where id = $1'),
    ledger: await rows('select count(*)::int as n from public.progression_events where couple_id = $1'),
  };
}

test('V3 on the baseline: every object it references exists there, as it expects', async () => {
  const db = await rebuild();
  try {
    const columns = (await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'progression_reward_catalog'")).rows.map((r) => r.column_name);
    for (const column of ['id', 'level_required', 'category', 'title', 'description', 'token', 'sort_order', 'active', 'announce']) assert.ok(columns.includes(column), column);
    const pk = (await db.query("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.progression_reward_catalog'::regclass and contype = 'p'")).rows;
    assert.deepEqual(pk.map((r) => r.d), ['PRIMARY KEY (id)'], 'on conflict (id) has its arbiter');
    assert.equal((await checkDef(db)).length, 1, 'the category check it drops and re-adds exists by that name');
    const rows = await catalog(db);
    assert.equal(rows.length, 27);
    for (const id of COUNTDOWN_REWARDS) assert.ok(rows.some((r) => r.id === id && r.active), `${id} present and active (the DO guard)`);
    for (const id of Object.keys(OGGI)) assert.ok(!rows.some((r) => r.id === id || r.token === id), `${id} is a new id and token`);
    for (const table of ['couple_reward_unlocks', 'progression_reward_views', 'couple_progression_preferences']) {
      const fks = (await db.query(`select confdeltype from pg_constraint where conrelid = 'public.${table}'::regclass and confrelid = 'public.progression_reward_catalog'::regclass`)).rows;
      assert.ok(fks.length > 0, `${table} references the catalog`);
    }
  } finally { await db.close(); }
});

test('V3 on the baseline: applies twice to the same catalog, and nothing a couple earned changes', async () => {
  const db = await rebuild();
  try {
    const high = await couple(db, 16450); // level 15: every baseline reward unlocked
    await progression(db, high.f);
    await as(db, high.f, "select public.ack_progression_unlock('frame_glow'), public.ack_progression_unlock('frame_aurora'), public.equip_progression_reward('frame_polaroid')");
    const mid = await couple(db, 2500); // level 6
    await progression(db, mid.f);
    const before = [await snapshot(db, high), await snapshot(db, mid)];
    assert.equal(before[0].unlocks.length, 27);

    await db.exec(V3);
    const once = await catalog(db);
    const onceCheck = await checkDef(db);
    await db.exec(V3);
    assert.deepEqual(await catalog(db), once, 'a second run converges to the same rows');
    assert.deepEqual(await checkDef(db), onceCheck);
    assert.deepEqual([await snapshot(db, high), await snapshot(db, mid)], before, 'unlocks, views, preferences, XP and ledger are untouched');

    const active = once.filter((r) => r.active);
    assert.equal(once.length, 34);
    assert.equal(active.length, 21);
    assert.deepEqual(once.filter((r) => !r.active).map((r) => r.category).sort(), [...Array(4).fill('badge'), ...Array(4).fill('frame'), ...Array(2).fill('ring'), ...Array(3).fill('sticker')].sort());
    assert.deepEqual(once.filter((r) => r.category === 'countdown').map((r) => [r.id, r.level_required, r.token, r.active]), [['frame_aurora', 4, 'frame_aurora', true], ['frame_chrome', 12, 'frame_chrome', true], ['ring_orbit', 9, 'ring_orbit', true]]);
    for (const [id, level] of Object.entries(OGGI)) assert.ok(once.some((r) => r.id === id && r.level_required === level && r.active && r.announce), id);
    await assert.rejects(db.query("insert into public.progression_reward_catalog (id, level_required, category, title, description, token, sort_order) values ('x', 1, 'coin', 'x', 'x', 'x', 1)"), /check constraint/);

    // What each partner sees next: the looks within reach, never a retired piece.
    const s = await progression(db, high.f);
    for (const list of [s.rewards, s.pending_unlocks]) for (const r of list) assert.ok(!RETIRED.includes(r.category), `${r.id} is not offered`);
    assert.deepEqual(s.pending_unlocks.filter((r) => r.id.startsWith('oggi_')).map((r) => r.id).sort(), Object.keys(OGGI).sort(), 'a level 15 couple is told about all seven looks');
    assert.ok(!s.pending_unlocks.some((r) => r.id === 'frame_aurora'), 'a countdown reward already seen is not announced again');
    assert.equal(s.next_reward, null);
    const after = await snapshot(db, high);
    assert.deepEqual(after.unlocks.filter((r) => !r.reward_id.startsWith('oggi_')), before[0].unlocks, 'old unlocks keep their dates');
    assert.equal(after.unlocks.length, 34, 'only the seven looks are added, nothing retired is unlocked again');
    assert.deepEqual(after.prefs, before[0].prefs);
    const m = await progression(db, mid.b);
    assert.deepEqual(m.pending_unlocks.filter((r) => r.id.startsWith('oggi_')).map((r) => r.id).sort(), ['oggi_effect_fireflies', 'oggi_effect_petals', 'oggi_theme_cinematic']);
    assert.deepEqual([m.next_reward.id, m.next_reward.level_required], ['accent_champagne', 7], 'next is level 7 (by sort order: Champagne, then Moonlight), never a retired piece');
  } finally { await db.close(); }
});

test('V3 and the events guard on the full chain, in timestamp order: same catalog, points still unlock looks and countdown styles', async () => {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.indexOf(V3_FILE) >= 0 && files.indexOf(V3_FILE) < files.indexOf(GUARD_FILE), 'V3 runs before the guard');
  const [chain, reference] = await Promise.all([newDb(), rebuild()]);
  try {
    for (const file of files) await chain.exec(read(file));
    await reference.exec(V3);
    await reference.exec(read(GUARD_FILE));
    assert.deepEqual(await catalog(chain), await catalog(reference), 'the chain and the baseline end with the same catalog');

    const w = await couple(chain, 1030); // level 3, 20 XP from level 4
    const today = (await chain.query("select to_char((now() at time zone 'Europe/Rome')::date, 'YYYY-MM-DD') as d")).rows[0].d;
    const item = { id: randomUUID(), title: 'Il viaggio', mode: 'days', target: '2027-01-01', style: 'aurora' };
    const save = (version) => as(chain, w.f, 'select public.save_countdown_oggi_v1($1::jsonb, $2) as s', [JSON.stringify({ items: [item], active_id: item.id, together_style: 'editorial' }), version]);
    await assert.rejects(save(0), /countdown_style_locked/);

    const ev = async (createdDaysAgo) => {
      const id = randomUUID();
      await chain.query(`insert into public.shared_events (id, couple_id, created_by, title, event_date, created_at)
        values ($1, $2, $3, 'Cena', $4::date, now() - make_interval(days => $5))`, [id, w.c, w.f, today, createdDaysAgo]);
      return id;
    };
    const sameDay = (await as(chain, w.b, 'select public.complete_shared_event($1::uuid, $2::date) as r', [await ev(0), today]))[0].r;
    assert.deepEqual([sameDay.xp_awarded, sameDay.xp_reason], [0, 'same_day']);
    const planned = (await as(chain, w.f, 'select public.complete_shared_event($1::uuid, $2::date) as r', [await ev(3), today]))[0].r;
    assert.deepEqual([planned.xp_awarded, planned.xp_reason], [35, 'planned']);

    const s = await progression(chain, w.b);
    assert.equal(s.level, 4);
    assert.deepEqual(s.pending_unlocks.map((r) => [r.id, r.category]).filter(([id]) => ['frame_aurora', 'oggi_theme_cinematic'].includes(id)).sort(), [['frame_aurora', 'countdown'], ['oggi_theme_cinematic', 'oggi_theme']]);
    assert.equal((await save(0))[0].s.items[0].style, 'aurora', 'the countdown style earned with Sintonia is saved');
  } finally {
    await chain.close();
    await reference.close();
  }
});
