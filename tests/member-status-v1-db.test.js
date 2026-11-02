// Come stai (founder, 02/11/2026). Each member picks how they are from twelve
// states; the partner of the same couple reads it, nobody else does. The
// times are the server's (twelve hours), the words' form is the member's
// choice, and the row goes with the account. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_member_status_v1\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const setStatus = (user, status) => h.as(db, user, 'select public.set_member_status($1) r', [status]);
const setForm = (user, form) => h.as(db, user, 'select public.set_member_form($1) r', [form]);
const seen = (user) => h.as(db, user, 'select user_id, status, form from public.member_status order by user_id');

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed in the cutoff, the export and Realtime', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_member_status_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const core = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/s3-2-export-core.mjs'), 'utf8');
  assert.match(core, /\['member_status','user_id','user_id,couple_id,status,form,set_at,expires_at,updated_at',true\]/);
  const paging = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/s3-2-export-paging.mjs'), 'utf8');
  assert.match(paging, /member_status:'user_id'/);
  assert.equal((await q("select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'member_status'"))[0].n, 1);
  assert.equal((await q("select relrowsecurity on_ from pg_class where oid = 'public.member_status'::regclass"))[0].on_, true);
});

test('a member picks a state for twelve hours; the partner reads it with the form', async () => {
  const saved = await setStatus(h.B, 'innamorato');
  assert.equal(saved.status, 'innamorato');
  assert.ok(Math.abs(Date.now() - Date.parse(saved.set_at)) < 60000, 'server time');
  assert.equal(Date.parse(saved.expires_at) - Date.parse(saved.set_at), 12 * 3600 * 1000);
  assert.deepEqual(Object.keys(saved).sort(), ['expires_at', 'form', 'set_at', 'status']);
  await setForm(h.B, 'f');
  assert.deepEqual(await seen(h.F), [{ user_id: h.B, status: 'innamorato', form: 'f' }]);
  const [row] = await q('select couple_id from public.member_status where user_id = $1', [h.B]);
  assert.equal(row.couple_id, h.A, 'the couple comes from the profile, not from the phone');
  // Taking it away keeps the form and drops the times.
  const cleared = await setStatus(h.B, null);
  assert.deepEqual({ status: cleared.status, form: cleared.form, set_at: cleared.set_at, expires_at: cleared.expires_at }, { status: null, form: 'f', set_at: null, expires_at: null });
  // The form alone, before any state.
  assert.equal((await setForm(h.F, 'm')).status, null);
  await setForm(h.F, null);
  assert.deepEqual(await seen(h.B), [{ user_id: h.F, status: null, form: null }, { user_id: h.B, status: null, form: 'f' }].sort((a, b) => a.user_id.localeCompare(b.user_id)));
});

test('the same state keeps its time; a new one, or one chosen again after it expired, starts again', async () => {
  await setStatus(h.F, 'stanco');
  // As the owner nobody can move the times: the trigger keeps them.
  await h.as(db, h.F, "update public.member_status set set_at = now() - interval '5 days', expires_at = now() + interval '5 days' where user_id = $1", [h.F]);
  const [kept] = await q('select set_at, expires_at from public.member_status where user_id = $1', [h.F]);
  assert.ok(Date.parse(kept.expires_at) - Date.now() <= 12 * 3600 * 1000 + 1000, 'never longer than twelve hours');
  const again = await setStatus(h.F, 'stanco');
  assert.ok(Math.abs(Date.parse(again.set_at) - new Date(kept.set_at).getTime()) < 1000, 'same state still showing: same time');
  const other = await setStatus(h.F, 'felice');
  assert.ok(Date.now() - Date.parse(other.set_at) < 60000);
  // Expired: chosen again, it starts again.
  await q("alter table public.member_status disable trigger member_status_server_time");
  await q("update public.member_status set set_at = now() - interval '13 hours', expires_at = now() - interval '1 hour' where user_id = $1", [h.F]);
  await q("alter table public.member_status enable trigger member_status_server_time");
  const fresh = await setStatus(h.F, 'felice');
  assert.ok(Date.parse(fresh.expires_at) > Date.now() + 11 * 3600 * 1000);
});

test('only the twelve states and two forms; no account or no couple is refused', async () => {
  await assert.rejects(setStatus(h.F, 'arrabbiato'), /status invalid/);
  await assert.rejects(setStatus(h.F, ''), /status invalid/);
  await assert.rejects(setForm(h.F, 'x'), /form invalid/);
  await assert.rejects(setStatus(null, 'felice'), /authentication required/);
  await assert.rejects(setStatus(h.U1, 'felice'), /authentication required/);
  assert.equal((await q('select count(*)::int n from public.member_status'))[0].n, 0);
  for (const s of ['innamorato', 'felice', 'stanco', 'giu', 'nervoso', 'malato', 'festa', 'lavoro', 'studio', 'palestra', 'viaggio', 'tavola']) {
    assert.equal((await setStatus(h.F, s)).status, s);
  }
});

test('only the couple reads it; nobody writes or deletes the partner state', async () => {
  await setStatus(h.F, 'felice');
  await setStatus(h.B, 'lavoro');
  await h.create(db, h.U1, 'Other', '2025-06-01');
  await setStatus(h.U1, 'festa');
  assert.deepEqual((await seen(h.U1)).map((r) => r.user_id), [h.U1]);
  assert.deepEqual((await seen(h.F)).map((r) => r.user_id).sort(), [h.F, h.B].sort());
  await assert.rejects(h.as(db, null, 'select * from public.member_status', [], 'anon'), /permission denied/);
  await assert.rejects(h.as(db, null, "select public.set_member_status('felice') r", [], 'anon'), /permission denied/);
  await h.as(db, h.F, "update public.member_status set status = 'giu' where user_id = $1", [h.B]);
  await h.as(db, h.F, 'delete from public.member_status where user_id = $1', [h.B]);
  assert.equal((await q('select status from public.member_status where user_id = $1', [h.B]))[0].status, 'lavoro');
  await assert.rejects(h.as(db, h.U2, "insert into public.member_status(user_id, couple_id, status) values ($1,$2,'felice')", [h.U2, h.A]), /row-level security/);
  await h.as(db, h.F, 'delete from public.member_status where user_id = $1', [h.F]);
  assert.deepEqual((await seen(h.B)).map((r) => r.user_id), [h.B]);
});

test('the state goes with the account; re-applying the migration changes nothing', async () => {
  await setStatus(h.F, 'viaggio');
  await setStatus(h.B, 'tavola');
  await q('delete from public.profiles where id = $1', [h.B]);
  assert.deepEqual((await q('select user_id from public.member_status')).map((r) => r.user_id), [h.F]);
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  assert.deepEqual((await q('select status from public.member_status')).map((r) => r.status), ['viaggio']);
  assert.equal((await q("select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'member_status'"))[0].n, 1);
});
