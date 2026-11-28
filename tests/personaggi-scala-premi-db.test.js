// Personaggi: the wardrobe on the empty levels of the Sintonia (founder,
// 24/11/2026, «proposta A»). The first five accessories keep their points, the
// last four start levels 8, 11, 14 and 19; what someone wears and is no longer
// unlocked comes off.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_personaggi_scala_premi\.sql$/.test(f));
const points = (xp) => db.query('update public.couples set bond_xp = $1 where id = $2', [xp, h.A]);
const unlocks = (user) => h.as(db, user, 'select public.my_character_unlocks() r');
const wear = (user, head, face) => h.as(db, user, 'select public.set_my_character_look($1, $2) r', [head, face]);
const worn = async (user) => (await db.query('select character_head, character_face from public.profiles where id = $1', [user])).rows[0];
// Level n starts at 200·(n−1) + 150·(n−1)(n−2)/2 points (app.js bondLevelInfo).
const levelStart = (n) => 200 * (n - 1) + 75 * (n - 1) * (n - 2);

// The chain as it stood before il grande bilanciamento (28/11/2026), which
// puts the wardrobe on levels: bilanciamento-v1-db.test.js owns that one.
const UNTIL = '20261128101816_play_us_punti.sql';
let db;
test.beforeEach(async () => { db = await h.database({ until: UNTIL }); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, after the wardrobe, and is listed in the cutoff', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_personaggi_scala_premi.sql');
  assert.ok(FILE > '20261120232852_personaggi_guardaroba.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('the first five keep their points, the last four start levels 8, 11, 14 and 19', async () => {
  assert.deepEqual([8, 11, 14, 19].map(levelStart), [4550, 8750, 14300, 26550]);
  await points(1350);
  assert.deepEqual(await unlocks(h.F), ['cappello', 'fiocco', 'occhiali', 'sciarpina', 'sole']);
  await points(4549);
  assert.ok(!(await unlocks(h.F)).includes('gala'), 'not before level 8');
  for (const [item, xp] of [['gala', 4550], ['cuffie', 8750], ['coroncina', 14300], ['corona', 26550]]) {
    await points(xp - 1);
    assert.ok(!(await unlocks(h.B)).includes(item), `${item} not at ${xp - 1}`);
    await points(xp);
    assert.ok((await unlocks(h.B)).includes(item), `${item} at ${xp}`);
  }
  assert.equal((await unlocks(h.F)).length, 9);
});

test('the server refuses what the new scale has not unlocked yet', async () => {
  await points(3000);
  await assert.rejects(wear(h.F, 'corona', null), /locked/);
  await assert.rejects(wear(h.F, null, 'gala'), /locked/);
  assert.deepEqual(await wear(h.F, 'cappello', 'sole'), { head: 'cappello', face: 'sole', unlocked: ['cappello', 'fiocco', 'occhiali', 'sciarpina', 'sole'] });
});

test('what someone wears and is no longer unlocked comes off; the rest stays', async () => {
  await points(3000);
  await db.query(`update public.profiles set character_head = 'corona', character_face = 'occhiali' where id = $1`, [h.F]);
  await db.query(`update public.profiles set character_head = 'fiocco', character_face = 'gala' where id = $1`, [h.B]);
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  assert.deepEqual(await worn(h.F), { character_head: null, character_face: 'occhiali' });
  assert.deepEqual(await worn(h.B), { character_head: 'fiocco', character_face: null });
  assert.deepEqual(await wear(h.B, 'cappello', null), { head: 'cappello', face: null, unlocked: ['cappello', 'fiocco', 'occhiali', 'sciarpina', 'sole'] });
});
