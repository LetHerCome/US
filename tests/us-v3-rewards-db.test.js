// US V3 — the proposed rewards migration on a real Postgres (PGlite):
// Oggi looks become Sintonia rewards, frames/stickers/badges/rings retire,
// countdown styles stay entitled and nothing earned is lost.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fresh, asUser, state, uuid } = require('./helpers/progression-db');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const V3 = read('supabase/migrations/20261009100419_us_v3_oggi_looks_rewards.sql');
const COUNTDOWN = read('supabase/migrations/20261004231911_countdown_oggi_v1.sql');
const OGGI_REWARDS = ['oggi_effect_petals', 'oggi_theme_cinematic', 'oggi_effect_fireflies', 'oggi_theme_moonlight', 'oggi_effect_bokeh', 'oggi_theme_seasonal', 'oggi_effect_snow'];
const RETIRED = ['frame', 'sticker', 'badge', 'ring'];

async function upgraded({ xp = 0 } = {}) {
  const f = await fresh();
  await f.db.exec('alter table public.couples add column started_on date;');
  await f.db.exec(COUNTDOWN);
  await f.db.query('update public.couples set bond_xp=$2 where id=$1', [f.c, xp]);
  return f;
}
const save = (db, u, s, v) => asUser(db, u, () => db.query('select public.save_countdown_oggi_v1($1::jsonb,$2) s', [JSON.stringify(s), v]).then((r) => r.rows[0].s));
const item = (style) => ({ id: uuid(), title: 'Il viaggio', mode: 'days', target: '2027-01-01', style });

test('US V3 rewards: an existing couple keeps every unlock, view, XP and preference row', async () => {
  const { db, c, f } = await upgraded({ xp: 16450 });
  try {
    await state(db, f); // syncs unlocks at level 15
    await asUser(db, f, () => db.query("select public.ack_progression_unlock('frame_glow'), public.ack_progression_unlock('sticker_ours'), public.ack_progression_unlock('frame_aurora')"));
    await asUser(db, f, () => db.query("select public.equip_progression_reward('frame_polaroid')"));
    const snapshot = async () => ({
      unlocks: (await db.query('select reward_id, unlocked_at from public.couple_reward_unlocks where couple_id=$1 order by reward_id', [c])).rows,
      views: (await db.query('select reward_id, profile_id, seen_at from public.progression_reward_views where couple_id=$1 order by reward_id', [c])).rows,
      xp: (await db.query('select bond_xp from public.couples where id=$1', [c])).rows[0].bond_xp,
      prefs: (await db.query('select frame_reward_id from public.couple_progression_preferences where couple_id=$1', [c])).rows
    });
    const before = await snapshot();
    await db.exec(V3);
    await db.exec(V3); // idempotent
    const after = await snapshot();
    assert.deepEqual(after.views, before.views);
    assert.equal(after.xp, before.xp);
    assert.deepEqual(after.prefs, before.prefs, 'legacy couple-level preference row is untouched');
    for (const row of before.unlocks) assert.ok(after.unlocks.some((r) => r.reward_id === row.reward_id && +r.unlocked_at === +row.unlocked_at), `${row.reward_id} unlock is kept`);
  } finally { await db.close(); }
});

test('US V3 rewards: retired categories leave the visible state; Oggi looks and countdown styles take their place', async () => {
  const { db, f } = await upgraded({ xp: 2500 }); // level 6
  try {
    await db.exec(V3);
    const s = await state(db, f);
    const categories = new Set(s.rewards.map((r) => r.category));
    for (const retired of RETIRED) assert.ok(!categories.has(retired), `${retired} is not offered any more`);
    for (const id of OGGI_REWARDS) assert.ok(s.rewards.some((r) => r.id === id), id);
    assert.deepEqual(s.rewards.filter((r) => r.category === 'countdown').map((r) => r.id).sort(), ['frame_aurora', 'frame_chrome', 'ring_orbit']);
    for (const r of s.pending_unlocks) assert.ok(!RETIRED.includes(r.category), `${r.id} is never announced`);
    assert.ok(s.pending_unlocks.some((r) => r.id === 'oggi_effect_petals'), 'new looks within reach are announced');
    assert.ok(!RETIRED.includes(s.next_reward?.category), 'next unlock is never a retired reward');
    const unlocked = s.rewards.filter((r) => r.unlocked).map((r) => r.id);
    assert.ok(unlocked.includes('oggi_theme_cinematic') && unlocked.includes('oggi_effect_fireflies'));
    assert.ok(!unlocked.includes('oggi_theme_moonlight'), 'level 7 look stays locked at level 6');
    const catalog = (await db.query('select title from public.progression_reward_catalog where active')).rows.map((r) => r.title);
    assert.equal(new Set(catalog).size, catalog.length, 'every active reward has its own name');
    assert.doesNotMatch(catalog.join(' ').toLowerCase(), /\bcoin|monet|gettoni|crediti|premium/);
  } finally { await db.close(); }
});

test('US V3 rewards: countdown styles stay server-entitled after the migration', async () => {
  const { db, c, f } = await upgraded({ xp: 0 });
  try {
    await db.exec(V3);
    const e = item('aurora');
    await assert.rejects(save(db, f, { items: [e], active_id: e.id, together_style: 'editorial' }, 0), /countdown_style_locked/);
    await db.query('update public.couples set bond_xp=1050 where id=$1', [c]); // level 4
    assert.equal((await save(db, f, { items: [e], active_id: e.id, together_style: 'editorial' }, 0)).items[0].style, 'aurora');
  } finally { await db.close(); }
});

test('US V3 rewards: no retired reward can be unlocked later, and the category check stays closed', async () => {
  const { db, c, f } = await upgraded({ xp: 0 });
  try {
    await db.exec(V3);
    await db.query('update public.couples set bond_xp=16450 where id=$1', [c]);
    await state(db, f);
    const unlocked = (await db.query('select r.category from public.couple_reward_unlocks u join public.progression_reward_catalog r on r.id=u.reward_id where u.couple_id=$1', [c])).rows.map((r) => r.category);
    for (const retired of RETIRED) assert.ok(!unlocked.includes(retired), `a new couple never earns ${retired}`);
    await assert.rejects(db.query("insert into public.progression_reward_catalog(id,level_required,category,title,description,token,sort_order,active,announce) values ('x',1,'coin','x','x','x',1,true,true)"), /check constraint/);
  } finally { await db.close(); }
});

test('US V3 rewards: the migration is forward-only data work — no grants, policies, functions or deletes', () => {
  const body = V3.replace(/--.*$/gm, '');
  assert.doesNotMatch(body, /\b(grant|revoke|create\s+policy|drop\s+policy|create\s+or\s+replace\s+function|drop\s+table|delete\s+from|truncate)\b/i);
  assert.match(body, /on conflict \(id\) do update/);
  assert.match(body, /drop constraint if exists progression_reward_catalog_category_check/);
});

test('US V3 rewards: client catalog and migration agree on reward ids and levels', () => {
  const look = read('oggi-look.js');
  for (const [, id, level] of V3.matchAll(/\('(oggi_[a-z_]+)',\s+(\d+),/g)) {
    assert.match(look, new RegExp(`reward: '${id}', level: ${level}[,\\s]`), `${id} level ${level}`);
  }
});
