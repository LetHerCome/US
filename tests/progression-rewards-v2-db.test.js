const test = require('node:test');
const assert = require('node:assert/strict');
const { readMigration, fresh, asUser, state, equip } = require('./helpers/progression-db');

const V2 = 'supabase/migrations_history/20261003090000_progression_rewards_v2.sql';
const CATEGORIES = ['frame', 'theme', 'accent', 'effect', 'badge', 'sticker', 'ring'];
const LEGACY = [['frame_glow', 2], ['theme_rose', 3], ['frame_aurora', 4], ['theme_midnight', 5], ['effect_pulse', 6]];
const xpForLevel = (level) => { let xp = 0; for (let n = 1; n < level; n += 1) xp += 200 + (n - 1) * 150; return xp; };

test('Rewards V2: catalog has at least 20 active rewards across all seven valid slots', async () => {
  const { db } = await fresh();
  const rows = (await db.query('select id,category,level_required,token,sort_order,active from public.progression_reward_catalog order by sort_order')).rows;
  const active = rows.filter((r) => r.active);
  assert.ok(active.length >= 20, `only ${active.length} active rewards`);
  assert.equal(active.length, 27);
  assert.deepEqual([...new Set(active.map((r) => r.category))].sort(), [...CATEGORIES].sort());
  for (const category of CATEGORIES) assert.ok(active.filter((r) => r.category === category).length >= 3, `${category} needs a real ladder`);
  for (const r of active) assert.equal(r.token, r.id, 'token mirrors id so CSS hooks stay stable');
  const sorted = [...active].sort((a, b) => a.level_required - b.level_required || a.sort_order - b.sort_order);
  assert.deepEqual(active.map((r) => r.id), sorted.map((r) => r.id), 'sort order follows the level ladder');
  await assert.rejects(db.query("insert into public.progression_reward_catalog(id,level_required,category,title,description,token,sort_order) values ('x',1,'coin','x','x','x',1)"), /check constraint/);
});

test('Rewards V2: legacy reward ids keep their levels, so unlock history stays valid', async () => {
  const { db } = await fresh();
  const rows = (await db.query('select id,level_required from public.progression_reward_catalog')).rows;
  const byId = new Map(rows.map((r) => [r.id, r.level_required]));
  for (const [id, level] of LEGACY) assert.equal(byId.get(id), level);
});

test('Rewards V2: XP curve is unchanged and unlocks follow progression levels', async () => {
  const { db, c } = await fresh();
  for (const [xp, level] of [[0, 1], [199, 1], [200, 2], [549, 2], [550, 3], [1050, 4], [1700, 5], [2500, 6], [16450, 15]]) {
    assert.equal((await db.query('select private.progression_level($1) l', [xp])).rows[0].l, level);
  }
  await db.query('update public.couples set bond_xp=$2 where id=$1', [c, xpForLevel(4)]);
  const unlocked = (await db.query('select u.reward_id, r.level_required from public.couple_reward_unlocks u join public.progression_reward_catalog r on r.id=u.reward_id where u.couple_id=$1', [c])).rows;
  assert.ok(unlocked.every((r) => r.level_required <= 4));
  assert.deepEqual(unlocked.map((r) => r.reward_id).sort(), ['accent_cherry', 'badge_day_one', 'frame_aurora', 'frame_glow', 'ring_halo', 'sticker_ours', 'theme_rose']);
});

test('Rewards V2: upgrading a couple keeps old unlocks/views/equips and announces only the new pieces', async () => {
  const { db, c, f, b } = await fresh({ upTo: 2 });
  await db.query('update public.couples set bond_xp=1085 where id=$1', [c]);
  await asUser(db, f, () => db.query("select public.ack_progression_unlock('frame_glow'), public.ack_progression_unlock('theme_rose'), public.ack_progression_unlock('frame_aurora')"));
  await equip(db, f, 'frame_aurora');
  const before = (await db.query('select reward_id, unlocked_at from public.couple_reward_unlocks where couple_id=$1 order by reward_id', [c])).rows;

  await db.exec(readMigration(V2));

  const s = await state(db, f);
  const after = (await db.query('select reward_id, unlocked_at from public.couple_reward_unlocks where couple_id=$1 order by reward_id', [c])).rows;
  for (const row of before) {
    const same = after.find((r) => r.reward_id === row.reward_id);
    assert.equal(String(same.unlocked_at), String(row.unlocked_at), 'existing unlock timestamps are never rewritten');
  }
  assert.equal(s.preferences.frame_reward_id, 'frame_aurora');
  assert.equal(s.rewards.find((r) => r.id === 'frame_aurora').equipped, true);
  assert.deepEqual(s.pending_unlocks.map((r) => r.id), ['badge_day_one', 'sticker_ours', 'accent_cherry', 'ring_halo']);
  assert.deepEqual((await state(db, b)).pending_unlocks.map((r) => r.id), ['badge_day_one', 'frame_glow', 'sticker_ours', 'theme_rose', 'accent_cherry', 'frame_aurora', 'ring_halo']);
  assert.equal(s.level, 4);
  assert.equal(s.next_reward.id, 'theme_midnight');
});

test('Rewards V2: each slot equips independently; re-tapping the equipped reward clears only its slot', async () => {
  const { db, c, f, b } = await fresh();
  await db.query('update public.couples set bond_xp=$2 where id=$1', [c, xpForLevel(6)]);
  let s = await equip(db, f, 'frame_glow');
  s = await equip(db, f, 'theme_rose');
  s = await equip(db, b, 'accent_cherry');
  s = await equip(db, f, 'effect_pulse');
  s = await equip(db, b, 'badge_still_here');
  s = await equip(db, f, 'sticker_ticket');
  s = await equip(db, b, 'ring_halo');
  assert.deepEqual(s.preferences, {
    frame_reward_id: 'frame_glow', theme_reward_id: 'theme_rose', accent_reward_id: 'accent_cherry', effect_reward_id: 'effect_pulse',
    badge_reward_id: 'badge_still_here', sticker_reward_id: 'sticker_ticket', ring_reward_id: 'ring_halo'
  });
  assert.equal(s.rewards.filter((r) => r.equipped).length, 7);

  s = await equip(db, b, 'badge_day_one');
  assert.equal(s.preferences.badge_reward_id, 'badge_day_one', 'same-slot equip swaps');
  assert.equal(s.rewards.find((r) => r.id === 'badge_still_here').equipped, false);

  s = await equip(db, f, 'accent_cherry');
  assert.equal(s.preferences.accent_reward_id, null, 'tapping the equipped reward unequips it');
  assert.equal(s.preferences.frame_reward_id, 'frame_glow');
  assert.equal(s.preferences.ring_reward_id, 'ring_halo');
  assert.equal((await state(db, b)).preferences.accent_reward_id, null, 'cosmetics are shared by the couple');
});

test('Rewards V2: locked, inactive and foreign rewards cannot be equipped', async () => {
  const { db, c, f } = await fresh();
  await db.query('update public.couples set bond_xp=$2 where id=$1', [c, xpForLevel(3)]);
  await assert.rejects(equip(db, f, 'frame_polaroid'), /reward not unlocked/);
  await assert.rejects(equip(db, f, 'ring_gold'), /reward not unlocked/);
  await assert.rejects(equip(db, f, 'not_a_reward'), /reward unavailable/);
  await db.query("update public.progression_reward_catalog set active=false where id='sticker_ours'");
  await assert.rejects(equip(db, f, 'sticker_ours'), /reward unavailable/);
  await assert.rejects(asUser(db, null, () => db.query("select public.equip_progression_reward('badge_day_one')")), /authentication required/);
  const outsider = '00000000-0000-4000-8000-999999999999';
  await db.query("insert into public.profiles(id,couple_id,role) values ($1,null,'x')", [outsider]);
  await assert.rejects(asUser(db, outsider, () => db.query("select public.equip_progression_reward('badge_day_one')")), /couple membership required/);
});

test('Rewards V2: progression tables stay server-only and RPC grants exclude anon', async () => {
  const { db, f } = await fresh();
  for (const table of ['progression_reward_catalog', 'couple_reward_unlocks', 'couple_progression_preferences', 'progression_reward_views', 'progression_events']) {
    await assert.rejects(asUser(db, f, () => db.query(`select * from public.${table}`)), /permission denied|row-level security/, table);
  }
  await assert.rejects(asUser(db, f, () => db.query("update public.couple_progression_preferences set badge_reward_id='badge_chaos'")), /permission denied|row-level security/);
  const sql = readMigration(V2);
  assert.match(sql, /revoke all on function public\.get_progression_v1\(\) from public, anon;/);
  assert.match(sql, /revoke all on function public\.equip_progression_reward\(text\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.equip_progression_reward\(text\) to authenticated;/);
  assert.doesNotMatch(sql, /grant [^;]* to anon|grant [^;]* on public\.(progression|couple_)/i);
  const funcs = (await db.query("select proname, prosecdef from pg_proc where proname in ('get_progression_v1','equip_progression_reward')")).rows;
  assert.ok(funcs.length === 2 && funcs.every((fn) => fn.prosecdef));
});
