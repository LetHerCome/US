// Piccolezze prima del rilascio (27/11/2026): the reward texts of 26/11 take
// the typographic apostrophe of the text review. Whole repository chain on a
// disposable Postgres (PGlite); re-applying the migration changes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { database } = require('./helpers/mc2-db');

const FILE = '20261127130000_premi_apostrofi.sql';
const SQL = () => fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations', FILE), 'utf8');
// Every row the three migrations of 26/11 write.
const IDS = ['oggi_theme_moonlight', 'oggi_effect_snow', 'oggi_theme_seasonal', 'oggi_effect_dandelions',
  'oggi_effect_leaves', 'oggi_effect_shooting', 'oggi_effect_lanterns', 'oggi_effect_memories',
  'effect_pulse', 'effect_constellation', 'effect_duo', 'frame_aurora', 'ring_orbit', 'frame_chrome', 'oggi_theme_golden'];
const MIGRATIONS = ['20261126000000_premi_oggi_effetti.sql', '20261126010000_premi_simbolo.sql', '20261126020000_premi_temi_countdown.sql'];

test('premi del 26/11: the migration names every row they write, and nothing else', () => {
  const dir = path.join(__dirname, '..', 'supabase/migrations');
  const written = new Set(MIGRATIONS.flatMap((f) => [...fs.readFileSync(path.join(dir, f), 'utf8')
    .matchAll(/^\s*\('([a-z_]+)',\s+\d+,/gm)].map((m) => m[1])));
  assert.deepEqual([...written].sort(), [...IDS].sort());
  const named = [...SQL().match(/where id in \(([\s\S]*?)\)/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(named.sort(), [...IDS].sort());
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('premi del 26/11: no straight apostrophe left after the chain, and re-applying changes nothing', async () => {
  const db = await database();
  try {
    const read = async () => (await db.query(
      'select id, title, description from public.progression_reward_catalog where id = any($1) order by id', [IDS])).rows;
    const rows = await read();
    assert.equal(rows.length, IDS.length);
    const straight = rows.filter((r) => /'/.test(r.title) || /'/.test(r.description)).map((r) => r.id);
    assert.deepEqual(straight, []);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(byId.oggi_theme_golden.title, 'Ora d’oro');
    assert.match(byId.oggi_theme_seasonal.description, /^Oggi cambia con l’anno: i ciliegi in fiore/);
    assert.match(byId.oggi_effect_leaves.description, /^Foglie d’acero e d’autunno ondeggiano/);
    assert.match(byId.frame_aurora.description, /e sotto quello dell’altra persona\.$/);
    // Every active reward of the catalog reads the same way.
    const active = (await db.query("select id from public.progression_reward_catalog where active and (strpos(title, '''') > 0 or strpos(description, '''') > 0)")).rows;
    assert.deepEqual(active, []);
    const result = await db.exec(SQL());
    assert.equal(result.at(-1).affectedRows, 0);
    assert.deepEqual(await read(), rows);
  } finally {
    await db.close();
  }
});
