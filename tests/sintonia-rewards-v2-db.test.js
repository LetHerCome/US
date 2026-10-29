// Premi Sintonia V2, Fase 1 (founder, 29/10/2026, DECISIONS.md «Nuova scala
// dei premi Sintonia», docs/missions/sintonia-premi-v2.md): new levels for
// today's rewards, one headline reward per level, Plus extras that need the
// level AND Plus and stay once taken, and what Noi needs to show the next
// headline with a day estimate. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_sintonia_rewards_v2_phase1\.sql$/.test(f));
const xpFor = (level) => { let t = 0; for (let k = 1; k < level; k += 1) t += 200 + (k - 1) * 150; return t; };
const progression = (user = h.F) => h.as(db, user, 'select public.get_progression_v1() r');
const setLevel = (level) => db.query('update public.couples set bond_xp = $1 where id = $2', [xpFor(level), h.A]);
const reward = (p, id) => p.rewards.find((r) => r.id === id);

let db;
test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists and is listed in the cutoff', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_sintonia_rewards_v2_phase1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('the ladder: today\'s rewards move down, headlines are marked, the top is level 20', async () => {
  const rows = (await db.query(`select id, level_required l, headline, requires_plus p, title from public.progression_reward_catalog where active order by level_required, sort_order`)).rows;
  const at = Object.fromEntries(rows.map((r) => [r.id, r]));
  const expect = { oggi_effect_petals: 2, effect_pulse: 2, theme_rose: 3, accent_cherry: 3, oggi_theme_cinematic: 4, frame_aurora: 4, oggi_effect_fireflies: 4,
    oggi_effect_aurora: 4, ti_penso_hearts: 5, theme_midnight: 5, accent_champagne: 6, oggi_theme_moonlight: 6, theme_film: 7, effect_constellation: 7,
    ring_orbit: 8, oggi_effect_bokeh: 8, theme_blue_hour: 9, accent_ice: 9, oggi_theme_seasonal: 10, frame_chrome: 10, effect_shimmer: 10,
    oggi_effect_snow: 11, theme_graphite: 12, sky_ours: 20 };
  assert.deepEqual(Object.fromEntries(Object.keys(expect).map((id) => [id, at[id]?.l])), expect);
  // Phase 2 (sintonia-rewards-v2-phase2-db.test.js) adds accessories, icons and the letter.
  const phase1 = rows.filter((r) => !/^(pet_accessory_|app_icon_)|^ti_penso_letter$/.test(r.id));
  assert.equal(phase1.length, Object.keys(expect).length, 'only these are active from Phase 1');
  assert.deepEqual(phase1.filter((r) => r.headline).map((r) => r.id), ['oggi_effect_petals', 'oggi_theme_cinematic', 'ti_penso_hearts', 'oggi_theme_seasonal', 'sky_ours']);
  assert.deepEqual(phase1.filter((r) => r.p).map((r) => r.id), ['oggi_effect_aurora'], 'Phase 1 has one Plus extra');
  assert.equal(at.oggi_theme_seasonal.title, 'Tema delle stagioni');
  assert.ok(rows.filter((r) => r.p).every((r) => r.l >= 2 && r.l <= 12 && !r.headline), 'Plus only on levels 2–12, never a free headline');
});

test('a Plus extra needs the level and Plus; once taken it stays after Plus ends', async () => {
  await setLevel(5);
  let p = await progression();
  assert.deepEqual([reward(p, 'oggi_effect_aurora').unlocked, reward(p, 'oggi_effect_aurora').requires_plus], [false, true], 'level 5 without Plus: locked');
  assert.equal(reward(p, 'ti_penso_hearts').unlocked, true);
  await db.query(`insert into public.plus_entitlements(user_id, source, product, status) values ($1, 'manuale', 't', 'active')`, [h.B]);
  p = await progression();
  assert.equal(reward(p, 'oggi_effect_aurora').unlocked, true, 'Plus of the partner is enough');
  await db.query(`update public.plus_entitlements set status = 'expired'`);
  p = await progression();
  assert.equal(reward(p, 'oggi_effect_aurora').unlocked, true, 'stays after Plus ends');
});

test('Plus alone is not enough: the level comes first', async () => {
  await db.query(`insert into public.plus_entitlements(user_id, source, product, status) values ($1, 'manuale', 't', 'active')`, [h.F]);
  await setLevel(3);
  assert.equal(reward(await progression(), 'oggi_effect_aurora').unlocked, false);
});

test('Noi gets the next headline, how many points it needs, and the pace of the last 14 days', async () => {
  await setLevel(5);
  let p = await progression();
  // With Phase 2, the scarf for the companions (level 9) is the next headline after 5.
  assert.equal(p.next_headline.id, 'pet_accessory_scarf');
  assert.equal(p.next_headline.level_required, 9);
  assert.equal(p.next_headline.xp_needed, xpFor(9) - xpFor(5));
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  for (const [n, xp] of [[1, 30], [5, 40], [13, 20], [20, 999]]) {
    await db.query(`insert into public.progression_events(id, couple_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at)
      values (gen_random_uuid(), $1, 'game', $2, $3, true, $4, now())`, [h.A, `k${n}`, xp, day(n)]);
  }
  p = await progression();
  assert.equal(p.xp_last_14_days, 90, 'day 20 is outside the window');
  await setLevel(20);
  assert.equal((await progression()).next_headline, null, 'at the top: nothing next');
});

test('nobody loses a reward, and the migration announces nothing by itself', async () => {
  const ids = (await db.query(`select reward_id from public.couple_reward_unlocks where couple_id = $1`, [h.A])).rows;
  const pending = (await progression()).pending_unlocks;
  assert.ok(Array.isArray(pending));
  assert.ok(ids.length >= 0);
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  assert.match(sql, /insert into public\.progression_reward_views/, 'rewards a couple gets from the new levels are marked as seen');
  assert.doesNotMatch(sql, /delete from public\.couple_reward_unlocks/i, 'nothing is ever taken back');
});

test('Il vostro cielo: the couple picks its city and hour once level 20 is reached; both read them', async () => {
  const setSky = (user, city, minutes) => h.as(db, user, 'select public.set_sky($1, $2) r', [city, minutes]);
  await assert.rejects(setSky(h.F, 'roma', 1320), /sky locked/, 'before level 20');
  await setLevel(20);
  assert.equal(reward(await progression(), 'sky_ours').unlocked, true);
  assert.deepEqual(await setSky(h.F, 'milano', null), { city: 'milano', minutes: null }, 'no hour: the usual 22:00');
  assert.deepEqual(await setSky(h.B, 'roma', 23 * 60 + 30), { city: 'roma', minutes: 1410 }, 'either of the two can change it');
  assert.deepEqual((await h.as(db, h.F, 'select sky_city, sky_minutes from public.couples'))[0], { sky_city: 'roma', sky_minutes: 1410 });
  for (const bad of ['Roma', 'r', 'roma; drop', '', null]) await assert.rejects(setSky(h.F, bad, 1320), /invalid city/, String(bad));
  for (const bad of [-1, 1440, 99999]) await assert.rejects(setSky(h.F, 'roma', bad), /invalid hour/, String(bad));
  await assert.rejects(h.as(db, h.F, `update public.couples set sky_city = 'napoli'`), /permission denied/);
  assert.equal((await db.query(`select count(*)::int n from pg_proc where proname = 'set_sky_city'`)).rows[0].n, 0, 'the first version is gone');
});

test('the Phase 1 migration can run twice on the same database (staging re-apply)', async () => {
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  const rows = (await db.query(`select count(*)::int n from public.progression_reward_catalog where active`)).rows[0].n;
  assert.equal(rows, 32, "24 of Phase 1 and 8 of Phase 2");
  assert.equal((await db.query(`select category from public.progression_reward_catalog where id = 'sky_ours'`)).rows[0].category, 'oggi_theme', 'the sky is a theme of Oggi');
});
