// Colori gratis in beta (founder, 29/10/2026): while US Plus is not on sale,
// everyone picks a colour, also at the first opening. One switch,
// app_flags.plus_on_sale, ends it the day Plus goes on sale: from then on
// changing colour needs Plus again, and a colour already chosen stays.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_colors_free_in_beta\.sql$/.test(f));
const setColor = (user, color) => h.as(db, user, 'select public.set_my_color($1) r', [color]);
const plus = (user) => h.as(db, user, 'select public.get_couple_plus() r');
const onSale = (on) => db.query(`update public.app_flags set enabled = $1, updated_at = now() where key = 'plus_on_sale'`, [on]);

let db;
test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists and is listed in the cutoff', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_colors_free_in_beta.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('in beta (Plus not on sale) the colour is free for everyone, and the app is told', async () => {
  assert.deepEqual(await plus(h.F), { active: false, by: null, colors_free: true });
  assert.deepEqual(await setColor(h.F, 'cielo'), { color: 'cielo' });
  await assert.rejects(setColor(h.B, 'cielo'), /partner color/, 'never the partner\'s colour');
});

test('the day Plus goes on sale: changing needs Plus again, the colour already chosen stays', async () => {
  await setColor(h.F, 'oro');
  await onSale(true);
  assert.deepEqual(await plus(h.F), { active: false, by: null, colors_free: false });
  await assert.rejects(setColor(h.F, 'pesca'), /plus required/);
  assert.equal((await db.query('select person_color from public.profiles where id = $1', [h.F])).rows[0].person_color, 'oro');
});

test('the switch is the server\'s alone: clients cannot read or write it', async () => {
  await assert.rejects(h.as(db, h.F, 'select * from public.app_flags'), /permission denied/);
  await assert.rejects(h.as(db, h.F, `update public.app_flags set enabled = true`), /permission denied/);
});
