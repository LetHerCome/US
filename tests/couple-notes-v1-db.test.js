// Note condivise V1 (founder, 31/10/2026, D7/D8): notes of the couple in Noi,
// written and ticked by both. The server writes who changed a note and when;
// the other couple sees nothing; leaving the couple or deleting the account
// keeps the notes for the partner, without author. Full repo schema in
// disposable PGlite. Spec: docs/missions/note-condivise-v1.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_couple_notes_v1\.sql$/.test(f));

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const svc = (sql, p = []) => h.as(db, null, sql, p, 'service_role');
const add = (user, couple, title, body = '', items = []) =>
  h.as(db, user, 'insert into public.couple_notes(couple_id, title, body, items) values ($1,$2,$3,$4::jsonb) returning id r', [couple, title, body, JSON.stringify(items)]);
const edit = (user, id, set, p = []) => h.as(db, user, `update public.couple_notes set ${set} where id = $1 returning id r`, [id, ...p]);
const note = async (id) => (await q('select title, body, items, created_by, updated_by, revision from public.couple_notes where id = $1', [id]))[0];
const seen = (user) => h.as(db, user, 'select coalesce(json_agg(title order by title), $$[]$$::json) r from public.couple_notes');

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2026-02-02'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed, in the realtime publication and in the data export', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_couple_notes_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const pub = await q("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couple_notes'");
  assert.equal(pub.length, 1);
  const core = fs.readFileSync(path.join(__dirname, '../supabase/functions/_shared/s3-2-export-core.mjs'), 'utf8');
  assert.match(core, /\['couple_notes','created_by','id,couple_id,created_by,updated_by,title,body,items,created_at,updated_at',true\]/);
});

test('both write, tick and delete the notes of the couple; the server says who and when', async () => {
  const id = await add(h.F, h.A, '  Spesa  ', '', [{ id: 'a', text: 'Latte', done: false }, { id: 'b', text: 'Pane', done: false }]);
  assert.deepEqual(await seen(h.B), ['Spesa'], 'the partner sees it, the title trimmed');
  let n = await note(id);
  assert.equal(n.created_by, h.F); assert.equal(n.updated_by, h.F); assert.equal(n.revision, 1);

  await edit(h.B, id, "items = jsonb_set(items, '{0,done}', 'true')");
  n = await note(id);
  assert.equal(n.items[0].done, true);
  assert.equal(n.updated_by, h.B, 'who ticked it'); assert.equal(n.created_by, h.F); assert.equal(n.revision, 2);

  // What the app sends never decides the author, the revision or the couple.
  await edit(h.B, id, 'created_by = $2, updated_by = $2, revision = 99, body = $3', [h.F, 'ciao']);
  n = await note(id);
  assert.equal(n.created_by, h.F); assert.equal(n.updated_by, h.B); assert.equal(n.revision, 3); assert.equal(n.body, 'ciao');
  await assert.rejects(edit(h.F, id, 'couple_id = $2', [C2]));

  await h.as(db, h.F, 'delete from public.couple_notes where id = $1', [id]);
  assert.deepEqual(await seen(h.B), []);
});

test('the other couple never sees, changes or adds notes of this couple', async () => {
  const id = await add(h.F, h.A, 'Valigia');
  assert.deepEqual(await seen(h.U1), []);
  assert.deepEqual(await edit(h.U1, id, "title = 'preso'"), [], 'no row to update');
  await h.as(db, h.U1, 'delete from public.couple_notes where id = $1', [id]);
  assert.equal((await note(id)).title, 'Valigia');
  await assert.rejects(add(h.U1, h.A, 'Intrusa'), /row-level security/);
  await assert.rejects(h.as(db, null, 'select count(*) r from public.couple_notes', [], 'anon'), /permission denied/);
});

test('limits: no empty notes, short titles, a list of at most 100 well-formed items, 300 notes', async () => {
  await assert.rejects(add(h.F, h.A, '   ', ' '), /check/);
  await assert.rejects(add(h.F, h.A, 'x'.repeat(81)), /check/);
  await assert.rejects(add(h.F, h.A, 'Testo', 'y'.repeat(4001)), /check/);
  const item = (i) => ({ id: `k${i}`, text: `voce ${i}`, done: false });
  assert.ok(await add(h.F, h.A, '', '', [item(1)]), 'a list alone is a note');
  await assert.rejects(add(h.F, h.A, 'Lunga', '', Array.from({ length: 101 }, (_, i) => item(i))), /check/);
  for (const bad of [[{ id: 'a', text: 'x' }], [{ id: 'a', text: 'x', done: 'no' }], [{ id: 'a', text: 'x'.repeat(201), done: false }], ['testo'], [{ id: 'a', text: 'x', done: false, extra: 1 }]]) {
    await assert.rejects(add(h.F, h.A, 'Lista', '', bad), /check/, JSON.stringify(bad));
  }
  await svc(`insert into public.couple_notes(couple_id, title, created_by, updated_by) select $1, 'n' || g, $2, $2 from generate_series(1, 299) g`, [h.A, h.F]);
  await assert.rejects(add(h.B, h.A, 'Una di troppo'), /couple_notes_limit/);
});

test('leaving the couple or deleting the account keeps the notes for the partner, without author', async () => {
  const id = await add(h.F, h.A, 'Film da vedere');
  await edit(h.B, id, "body = 'Il gladiatore'");
  await svc('select public.s32_leave_couple($1,$2) r', [h.B, 'app']);
  let n = await note(id);
  assert.equal(n.title, 'Film da vedere'); assert.equal(n.created_by, h.F); assert.equal(n.updated_by, null);

  const other = await add(h.U1, C2, 'Regali');
  await svc('select public.s32_delete_account_data($1,$2) r', [h.U1, 'app']);
  n = await note(other);
  assert.equal(n.title, 'Regali'); assert.equal(n.created_by, null); assert.equal(n.updated_by, null);
});
