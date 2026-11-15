// US Plus, in arrivo: «Avvisatemi» (founder, 13/11/2026). One row per account
// that asked, written only by public.plus_waitlist() for the caller. Full repo
// schema in disposable PGlite; nothing here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_plus_waitlist_v1\.sql$/.test(f));

let db;
const waitlist = (user, join = null) => h.as(db, user, 'select public.plus_waitlist($1::boolean) r', [join]);
const rows = async () => (await db.query('select user_id from private.plus_waitlist order by user_id')).rows.map((r) => r.user_id);

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is in the cutoff and keeps the table private', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_plus_waitlist_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  assert.match(sql, /alter table private\.plus_waitlist enable row level security;/);
  assert.match(sql, /revoke all on table private\.plus_waitlist from public, anon, authenticated, service_role;/);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /grant execute on function public\.plus_waitlist\(boolean\) to authenticated;/);
});

test('join, read, join again, leave: only the caller, one row', async () => {
  assert.deepEqual(await waitlist(h.F), { joined: false });
  assert.deepEqual(await waitlist(h.F, true), { joined: true });
  assert.deepEqual(await waitlist(h.F, true), { joined: true }, 'asking twice keeps one row');
  assert.deepEqual(await waitlist(h.F), { joined: true });
  assert.deepEqual(await waitlist(h.B), { joined: false }, 'the partner has their own answer');
  assert.deepEqual(await rows(), [h.F]);
  assert.deepEqual(await waitlist(h.F, false), { joined: false });
  assert.deepEqual(await rows(), []);
});

test('the row goes with the account', async () => {
  await waitlist(h.B, true);
  await db.query('delete from auth.users where id = $1', [h.B]);
  assert.deepEqual(await rows(), []);
});

test('no anonymous caller and no direct access to the table', async () => {
  await assert.rejects(h.as(db, null, 'select public.plus_waitlist(true) r', [], 'anon'));
  await assert.rejects(h.as(db, h.F, 'select * from private.plus_waitlist'));
  await assert.rejects(h.as(db, h.F, 'insert into private.plus_waitlist(user_id) values ($1)', [h.B]));
});
