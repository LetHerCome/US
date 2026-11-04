// Noi nuova, bacheca (founder, 03/11/2026, docs/DECISIONS.md): every post-it
// has its paper, one of four colours, chosen by whoever writes it. Both
// members change it; the other couple sees nothing; a note written before
// this migration is yellow. The colour travels in the data export too.
// Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_couple_notes_color\.sql$/.test(f));

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const svc = (sql, p = []) => h.as(db, null, sql, p, 'service_role');
const add = (user, couple, title, color) => color === undefined
  ? h.as(db, user, 'insert into public.couple_notes(couple_id, title) values ($1,$2) returning id r', [couple, title])
  : h.as(db, user, 'insert into public.couple_notes(couple_id, title, color) values ($1,$2,$3) returning id r', [couple, title, color]);
const paint = (user, id, color) => h.as(db, user, 'update public.couple_notes set color = $2 where id = $1 returning id r', [id, color]);
const colorOf = async (id) => (await q('select color, updated_by, revision from public.couple_notes where id = $1', [id]))[0];

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2026-02-02'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is new, listed in the cutoff and the colour is in the export columns', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_couple_notes_color.sql');
  assert.ok(FILE > '20261103010817_s32_export_notes_battery_status.sql', 'after the last migration on staging');
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b|\bdelete\s+from\b|\btruncate\b/i, 'no data goes away');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const core = fs.readFileSync(path.join(__dirname, '../supabase/functions/_shared/s3-2-export-core.mjs'), 'utf8');
  assert.match(core, /\['couple_notes','created_by','id,couple_id,created_by,updated_by,title,body,items,color,created_at,updated_at',true\]/);
});

test('a post-it is yellow unless chosen; both members repaint it with one of the four papers', async () => {
  const plain = await add(h.F, h.A, 'Spesa');
  assert.equal((await colorOf(plain)).color, 'yellow', 'yellow by default');
  const pink = await add(h.B, h.A, 'Posti da provare', 'pink');
  assert.equal((await colorOf(pink)).color, 'pink');

  await paint(h.B, plain, 'green');
  const n = await colorOf(plain);
  assert.equal(n.color, 'green');
  assert.equal(n.updated_by, h.B, 'a new paper is a change like any other');
  assert.equal(n.revision, 2);
  await paint(h.F, plain, 'blue');
  assert.equal((await colorOf(plain)).color, 'blue');
});

test('only the four papers: anything else, an empty or a missing colour is refused', async () => {
  const id = await add(h.F, h.A, 'Valigia');
  for (const bad of ['red', 'Yellow', '', ' pink', '#f6e27a']) {
    await assert.rejects(add(h.F, h.A, 'Nuova', bad), /check/, bad);
    await assert.rejects(paint(h.F, id, bad), /check/, bad);
  }
  await assert.rejects(paint(h.F, id, null), /null/);
  assert.equal((await colorOf(id)).color, 'yellow');
});

test('the other couple never repaints a post-it of this couple', async () => {
  const id = await add(h.F, h.A, 'Natale', 'blue');
  assert.deepEqual(await paint(h.U1, id, 'pink'), [], 'no row to update');
  assert.equal((await colorOf(id)).color, 'blue');
  assert.ok(await add(h.U1, C2, 'Loro', 'green'), 'their own post-it, their own paper');
});

test('the data export carries the paper of the post-its the person wrote', async () => {
  await add(h.F, h.A, 'Ricetta', 'pink');
  await add(h.F, h.A, 'Taglie');
  const e = await svc('select public.s32_export_user_data($1) r', [h.F]);
  assert.deepEqual(e.created.couple_notes.map((n) => [n.title, n.color]), [['Ricetta', 'pink'], ['Taglie', 'yellow']]);
});
