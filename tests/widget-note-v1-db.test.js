// Widget «Nota» (docs/missions/widget-nota-v1.md): the note widget writes
// only through public.widget_note_internal, called by the Edge widget-note
// with service_role and the hash of the device token. The couple check, the
// author, the time and the revision are the function's: the notes trigger
// lets non-app roles through, so nothing here may rely on it. Full repo
// schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_widget_note_v1\.sql$/.test(f));
const HASH_F = 'f'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_THINK = 'c'.repeat(64);
const HASH_OTHER = 'd'.repeat(64);

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const svc = (sql, p = []) => h.as(db, null, sql, p, 'service_role');
const widget = (hash, op, noteId, payload = {}) =>
  svc('select public.widget_note_internal($1, $2, $3::uuid, $4::jsonb) r', [hash, op, noteId, JSON.stringify(payload)]);
const code = (expected) => (error) => { assert.equal(error.code, expected, error.message); return true; };
const add = (user, couple, title, items = [], body = '') =>
  h.as(db, user, 'insert into public.couple_notes(couple_id, title, body, items) values ($1,$2,$3,$4::jsonb) returning id r', [couple, title, body, JSON.stringify(items)]);
const row = async (id) => (await q('select title, body, items, created_by, updated_by, revision from public.couple_notes where id = $1', [id]))[0];
const token = (profile, couple, hash, scope = 'note:rw', extra = '') => q(
  `insert into public.widget_action_tokens(couple_id, profile_id, device_id_hash, token_hash, scope, expires_at${extra ? ', revoked_at' : ''})
   values ($1, $2, $3, $4, $5, now() + interval '180 days'${extra ? `, ${extra}` : ''})`, [couple, profile, 'e'.repeat(64), hash, scope]);
const ITEMS = [{ id: 'i1', text: 'Latte', done: false }, { id: 'i2', text: 'Pane', done: false }, { id: 'i3', text: 'Fragole', done: true }];

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2026-02-02'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
  await token(h.F, h.A, HASH_F);
  await token(h.B, h.A, HASH_B);
  await token(h.F, h.A, HASH_THINK, 'think:send');
  await token(h.U1, C2, HASH_OTHER);
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed after the notes, only service_role may call it', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_widget_note_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  assert.ok(FILE > '20261031132258_couple_notes_v1.sql');
  const grants = await q(`select grantee from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'widget_note_internal' and privilege_type = 'EXECUTE' order by grantee`);
  assert.deepEqual(grants.map((g) => g.grantee).filter((g) => g !== 'postgres'), ['service_role']);
  const id = await add(h.F, h.A, 'Spesa', ITEMS);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(h.as(db, h.F, 'select public.widget_note_internal($1, $2, $3::uuid, $4::jsonb) r', [HASH_F, 'get', id, '{}'], role), code('42501'), role);
  }
  const definer = await q("select prosecdef from pg_proc where proname = 'widget_note_internal'");
  assert.equal(definer[0].prosecdef, true);
});

test('get: the note of the couple, who touched it last by name, or "me"', async () => {
  const id = await add(h.B, h.A, 'Spesa', ITEMS, 'Per sabato');
  const note = await widget(HASH_F, 'get', id);
  assert.deepEqual({ ...note, updatedAt: undefined }, { id, title: 'Spesa', body: 'Per sabato', items: ITEMS, updatedAt: undefined, revision: 1, byMe: false, byName: 'Beatrice' });
  assert.equal((await widget(HASH_B, 'get', id)).byMe, true);
  assert.equal((await widget(HASH_B, 'get', id)).byName, '');
  assert.equal((await row(id)).revision, 1, 'reading writes nothing');
});

test('toggle: only that item, by the widget person, without losing what the partner wrote meanwhile', async () => {
  const id = await add(h.F, h.A, 'Spesa', ITEMS);
  // Meanwhile Bea renames another item in the app.
  await h.as(db, h.B, "update public.couple_notes set items = jsonb_set(items, '{1,text}', '\"Pane nero\"') where id = $1 returning id r", [id]);
  const note = await widget(HASH_F, 'toggle', id, { item_id: 'i1', done: true });
  assert.equal(note.items[0].done, true);
  assert.equal(note.items[1].text, 'Pane nero', 'the partner\'s edit stays');
  assert.equal(note.items[2].done, true);
  const r = await row(id);
  assert.equal(r.updated_by, h.F); assert.equal(r.created_by, h.F); assert.equal(r.revision, 3);
  assert.equal(note.byMe, true);
  // The same tick again, or an item the partner has just removed: nothing is written.
  await q("update public.widget_action_tokens set last_action_at = now() - interval '1 second'");
  await widget(HASH_F, 'toggle', id, { item_id: 'i1', done: true });
  await q("update public.widget_action_tokens set last_action_at = now() - interval '1 second'");
  await widget(HASH_F, 'toggle', id, { item_id: 'gone', done: true });
  assert.equal((await row(id)).revision, 3);
});

test('save: the whole note, last save wins, within the app limits', async () => {
  const id = await add(h.F, h.A, 'Spesa', ITEMS);
  const note = await widget(HASH_B, 'save', id, { title: '  Valigia  ', body: 'Per Lisbona', items: [{ id: 'v1', text: 'Passaporto', done: false }] });
  assert.equal(note.title, 'Valigia');
  assert.deepEqual(note.items, [{ id: 'v1', text: 'Passaporto', done: false }]);
  const r = await row(id);
  assert.equal(r.updated_by, h.B); assert.equal(r.created_by, h.F); assert.equal(r.revision, 2);
  const again = async (payload) => {
    await q("update public.widget_action_tokens set last_action_at = now() - interval '1 second'");
    return widget(HASH_B, 'save', id, payload);
  };
  await assert.rejects(again({ title: 'x'.repeat(81), body: '', items: [] }), code('22023'));
  await assert.rejects(again({ title: '', body: 'x'.repeat(4001), items: [] }), code('22023'));
  await assert.rejects(again({ title: '', body: '', items: [{ id: 'a', text: 'x', done: 'no' }] }), code('22023'));
  await assert.rejects(again({ title: '  ', body: ' ', items: [] }), code('22023'), 'never an empty note');
  assert.equal((await row(id)).revision, 2);
});

test('refusals: a token that is not a note token of this couple, a person who left, a note of another couple', async () => {
  const id = await add(h.F, h.A, 'Spesa', ITEMS);
  const other = await add(h.U1, C2, 'Loro', ITEMS);
  await assert.rejects(widget('a'.repeat(64), 'get', id), code('28000'), 'unknown token');
  await assert.rejects(widget(HASH_THINK, 'get', id), code('28000'), 'the Ti penso token cannot touch notes');
  await assert.rejects(widget(HASH_F, 'get', other), code('P0002'), 'another couple\'s note looks like no note');
  await assert.rejects(widget(HASH_OTHER, 'get', id), code('P0002'));
  await assert.rejects(widget(HASH_F, 'get', '00000000-0000-4000-8000-000000000000'), code('P0002'));
  await assert.rejects(widget(HASH_F, 'delete', id), code('22023'));
  await q("update public.widget_action_tokens set revoked_at = now() where token_hash = $1", [HASH_B]);
  await assert.rejects(widget(HASH_B, 'get', id), code('28000'), 'revoked');
  await q("update public.widget_action_tokens set expires_at = now() - interval '1 minute' where token_hash = $1", [HASH_OTHER]);
  await assert.rejects(widget(HASH_OTHER, 'get', other), code('28000'), 'expired');
  // Francesco leaves the couple: his widget token stops at once.
  await q('update public.profiles set couple_id = null where id = $1', [h.F]);
  await assert.rejects(widget(HASH_F, 'get', id), code('28000'), 'no longer in the couple');
});

test('a brake on writes, never on reads; the token records its use', async () => {
  const id = await add(h.F, h.A, 'Spesa', ITEMS);
  await widget(HASH_F, 'toggle', id, { item_id: 'i1', done: true });
  await assert.rejects(widget(HASH_F, 'toggle', id, { item_id: 'i2', done: true }), (error) => /rate_limited/.test(error.message));
  assert.ok(await widget(HASH_F, 'get', id), 'reading is never braked');
  const used = (await q('select last_used_at, last_action_at from public.widget_action_tokens where token_hash = $1', [HASH_F]))[0];
  assert.ok(used.last_used_at && used.last_action_at);
});

test('re-applying the migration changes nothing', async () => {
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  const scopes = await q("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'widget_action_tokens_scope_check'");
  assert.match(scopes[0].d, /note:rw/);
});
