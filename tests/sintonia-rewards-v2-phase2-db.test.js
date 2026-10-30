// Premi Sintonia V2, Fase 2 (founder, 29/10/2026; images approved the same
// day): the rewards that needed pictures. Accessories for the companions
// (levels 9, 12, 19 and the Gala Plus extra at 10), the Ti penso letter (15),
// the app icons Notte (13), Oro (18) and Neon (Plus, 7). Full repo schema in
// disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_sintonia_rewards_v2_phase2\.sql$/.test(f));
const xpFor = (level) => { let t = 0; for (let k = 1; k < level; k += 1) t += 200 + (k - 1) * 150; return t; };
const progression = (user = h.F) => h.as(db, user, 'select public.get_progression_v1() r');
const setLevel = (level) => db.query('update public.couples set bond_xp = $1 where id = $2', [xpFor(level), h.A]);
const reward = (p, id) => p.rewards.find((r) => r.id === id);

let db;
test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists and is listed in the cutoff', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_sintonia_rewards_v2_phase2.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('the Phase 2 rewards sit where the ladder says, with their tokens', async () => {
  const rows = (await db.query(`select id, level_required l, category c, token t, headline hl, requires_plus p from public.progression_reward_catalog
    where id in ('pet_accessory_scarf','pet_accessory_flowers','pet_accessory_crown','pet_accessory_gala','ti_penso_letter','app_icon_night','app_icon_gold','app_icon_neon') order by l`)).rows;
  assert.deepEqual(rows.map((r) => [r.id, r.l, r.c, r.t, r.hl, r.p]), [
    ['app_icon_neon', 7, 'app_icon', 'app_icon_neon', false, true],
    ['pet_accessory_scarf', 9, 'pet_accessory', 'pet_accessory_scarf', true, false],
    ['pet_accessory_gala', 10, 'pet_accessory', 'pet_accessory_gala', false, true],
    ['pet_accessory_flowers', 12, 'pet_accessory', 'pet_accessory_flowers', true, false],
    ['app_icon_night', 13, 'app_icon', 'app_icon_night', true, false],
    ['ti_penso_letter', 15, 'ti_penso', 'ti_penso_letter', true, false],
    ['app_icon_gold', 18, 'app_icon', 'app_icon_gold', true, false],
    ['pet_accessory_crown', 19, 'pet_accessory', 'pet_accessory_crown', true, false]
  ]);
  const plus = (await db.query(`select id, level_required l, headline from public.progression_reward_catalog where active and requires_plus`)).rows;
  assert.ok(plus.every((r) => r.l >= 2 && r.l <= 12 && !r.headline), 'Plus only on levels 2–12, never a free headline');
});

test('Gala and Neon need the level and Plus; the free ones only the level', async () => {
  await setLevel(10);
  let p = await progression();
  assert.equal(reward(p, 'pet_accessory_scarf').unlocked, true);
  assert.deepEqual([reward(p, 'pet_accessory_gala').unlocked, reward(p, 'app_icon_neon').unlocked], [false, false]);
  await db.query(`insert into public.plus_entitlements(user_id, source, product, status) values ($1, 'manuale', 't', 'active')`, [h.B]);
  p = await progression();
  assert.deepEqual([reward(p, 'pet_accessory_gala').unlocked, reward(p, 'app_icon_neon').unlocked], [true, true]);
  assert.equal(reward(p, 'pet_accessory_flowers').unlocked, false, 'level 12 not reached');
});

test('couples already past these levels get them quietly, and the migration can run again', async () => {
  // As in production: the couple reached level 20 before these rewards existed.
  const PHASE2 = `('pet_accessory_scarf','pet_accessory_flowers','pet_accessory_crown','pet_accessory_gala','ti_penso_letter','app_icon_night','app_icon_gold','app_icon_neon')`;
  await db.query(`delete from public.progression_reward_catalog where id in ${PHASE2}`);
  await setLevel(20);
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  const p = await progression();
  assert.equal(reward(p, 'pet_accessory_crown').unlocked, true);
  const pending = (p.pending_unlocks || []).map((u) => u.id || u.reward_id || u);
  for (const id of ['pet_accessory_crown', 'ti_penso_letter', 'app_icon_gold']) assert.ok(!pending.includes(id), `${id} is announced`);
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  assert.equal((await db.query(`select count(*)::int n from public.progression_reward_catalog where id like 'pet_accessory_%'`)).rows[0].n, 4);
});
