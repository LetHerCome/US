// Lavagna V1 (founder, 03/11/2026): one board per couple, drawn with a finger
// by both. Every stroke is saved when the finger lifts (vector points, already
// simplified by the app); the server writes who drew it and when. Undo takes
// back your own last stroke, «Pulisci» empties the board for both, and the
// board row tells the partner what went (Realtime cannot filter deletions).
// Leaving the couple or deleting the account keeps the drawing, without
// author. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_lavagna_v1\.sql$/.test(f));

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const svc = (sql, p = []) => h.as(db, null, sql, p, 'service_role');
const line = (n = 3, x = 100, y = 200) => Array.from({ length: n }, (_, i) => [(x + i * 10) % 1000, (y + i * 5) % 1600]).flat();
const draw = (user, couple, { tool = 'pen', color = 'rosa', width = 1, points = line() } = {}) =>
  h.as(db, user, 'insert into public.lavagna_strokes(couple_id, tool, color, width, points) values ($1,$2,$3,$4,$5::smallint[]) returning id r',
    [couple, tool, color, width, `{${points.join(',')}}`]);
const strokes = (user) => h.as(db, user, "select coalesce(json_agg(json_build_object('id', id, 'color', color, 'by', author_id) order by created_at, id), '[]'::json) r from public.lavagna_strokes");
const board = async (couple) => (await q('select revision, cleared_at, removed from public.lavagna_boards where couple_id = $1', [couple]))[0];

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2026-02-02'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed, both tables are in the realtime publication, the export knows the strokes', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_lavagna_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const pub = await q("select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like 'lavagna_%' order by 1");
  assert.deepEqual(pub.map((r) => r.tablename), ['lavagna_boards', 'lavagna_strokes']);
  const core = fs.readFileSync(path.join(__dirname, '../supabase/functions/_shared/s3-2-export-core.mjs'), 'utf8');
  assert.match(core, /\['lavagna_strokes','author_id','id,couple_id,author_id,tool,color,width,points,created_at',true\]/);
});

test('both draw on the one board of the couple; the server says who and when', async () => {
  const a = await draw(h.F, h.A, { color: 'lilla', width: 2 });
  const b = await draw(h.B, h.A, { tool: 'eraser', color: null });
  const seen = await strokes(h.B);
  assert.deepEqual(seen.map((s) => s.id), [a, b], 'in the order they were drawn');
  assert.deepEqual(seen.map((s) => s.by), [h.F, h.B]);
  // What the app sends never decides the author or the time.
  const forged = await h.as(db, h.F, "insert into public.lavagna_strokes(couple_id, color, points, author_id, created_at) values ($1,'ambra','{1,2}',$2,'2020-01-01') returning author_id::text || ' ' || (created_at > now() - interval '1 minute')::text r", [h.A, h.B]);
  assert.equal(forged, `${h.F} true`);
  // A stroke is never changed afterwards: no update for the app.
  await assert.rejects(h.as(db, h.F, "update public.lavagna_strokes set color = 'latte' where id = $1 returning id r", [a]), /permission denied/);
});

test('the other couple never sees, draws on or wipes this board', async () => {
  const a = await draw(h.F, h.A);
  assert.deepEqual(await strokes(h.U1), []);
  await assert.rejects(draw(h.U1, h.A), /row-level security/);
  await h.as(db, h.U1, 'delete from public.lavagna_strokes where id = $1', [a]);
  assert.equal(await h.as(db, h.U1, 'select public.lavagna_clear() r'), 0);
  assert.deepEqual((await strokes(h.F)).map((s) => s.id), [a]);
  assert.equal(await board(h.A), undefined, 'nothing moved on this board');
  await assert.rejects(h.as(db, null, 'select count(*) r from public.lavagna_strokes', [], 'anon'), /permission denied/);
  await assert.rejects(h.as(db, null, 'select count(*) r from public.lavagna_boards', [], 'anon'), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'insert into public.lavagna_boards(couple_id) values ($1)', [h.A]), /permission denied/);
});

test('limits: four colours, two widths, the eraser has no colour, simplified points in bounds', async () => {
  for (const color of ['rosa', 'lilla', 'ambra', 'latte']) assert.ok(await draw(h.F, h.A, { color }), color);
  for (const [tool, color] of [['pen', 'verde'], ['pen', null], ['eraser', 'rosa'], ['matita', 'rosa']]) {
    await assert.rejects(draw(h.F, h.A, { tool, color }), /check/, `${tool} ${color}`);
  }
  await assert.rejects(draw(h.F, h.A, { width: 3 }), /check/);
  assert.ok(await draw(h.F, h.A, { points: [500, 800] }), 'a dot is one point');
  assert.ok(await draw(h.F, h.A, { points: [0, 0, 1000, 1600] }), 'the corners of the board');
  for (const [label, points] of [['empty', []], ['odd', [1, 2, 3]], ['x out', [1001, 5]], ['y out', [5, 1601]], ['negative', [-1, 5]], ['too many', line(601)]]) {
    await assert.rejects(draw(h.F, h.A, { points }), /check|malformed/, label);
  }
  assert.ok(await draw(h.F, h.A, { points: line(600) }), '600 points is the most');
  await assert.rejects(h.as(db, h.F, "insert into public.lavagna_strokes(couple_id, color, points) values ($1,'rosa','{{1,2},{3,4}}') returning id r", [h.A]), /check/, 'one dimension');
  await assert.rejects(h.as(db, h.F, "insert into public.lavagna_strokes(couple_id, color, points) values ($1,'rosa','{1,null}') returning id r", [h.A]), /check/, 'no holes');
});

test('a board holds at most 1500 strokes', async () => {
  await svc("insert into public.lavagna_strokes(couple_id, author_id, color, points) select $1, $2, 'rosa', '{1,2}' from generate_series(1, 1499)", [h.A, h.F]);
  assert.ok(await draw(h.B, h.A));
  await assert.rejects(draw(h.B, h.A), /lavagna_full/);
  assert.ok(await draw(h.U1, C2), 'another board is not full');
});

test('undo takes back only your own last stroke; the partner learns which one went', async () => {
  const f1 = await draw(h.F, h.A);
  const f2 = await draw(h.F, h.A, { color: 'ambra' });
  const b1 = await draw(h.B, h.A);
  assert.equal(await h.as(db, h.F, 'select public.lavagna_undo() r'), f2, 'not the partner\'s, which is newer');
  assert.deepEqual((await strokes(h.B)).map((s) => s.id), [f1, b1]);
  let s = await board(h.A);
  assert.equal(Number(s.revision), 1); assert.deepEqual(s.removed, [f2]); assert.equal(s.cleared_at, null);
  assert.equal(await h.as(db, h.F, 'select public.lavagna_undo() r'), f1);
  assert.equal(await h.as(db, h.F, "select coalesce(public.lavagna_undo()::text, 'none') r"), 'none', 'nothing of yours left');
  s = await board(h.A);
  assert.equal(Number(s.revision), 2); assert.deepEqual(s.removed, [f1]);
});

test('«Pulisci» empties the board for both; the board says when', async () => {
  await draw(h.F, h.A); await draw(h.B, h.A); await draw(h.B, h.A, { tool: 'eraser', color: null });
  await draw(h.U1, C2);
  assert.equal(await h.as(db, h.B, 'select public.lavagna_clear() r'), 3);
  assert.deepEqual(await strokes(h.F), []);
  assert.equal((await strokes(h.U1)).length, 1, 'the other couple keeps its own');
  const s = await board(h.A);
  assert.ok(s.cleared_at); assert.equal(s.removed.length, 3);
  // The partner sees the board row, the other couple does not.
  assert.equal(await h.as(db, h.F, 'select count(*)::int r from public.lavagna_boards'), 1);
  assert.equal(await h.as(db, h.U1, 'select count(*)::int r from public.lavagna_boards'), 0);
  const after = await draw(h.F, h.A);
  assert.deepEqual((await strokes(h.B)).map((x) => x.id), [after], 'drawing again after cleaning');
});

test('entry points: the app calls undo and clear, never as anon', async () => {
  for (const fn of ['public.lavagna_undo()', 'public.lavagna_clear()']) {
    assert.equal((await q("select has_function_privilege('authenticated',$1,'execute') r", [fn]))[0].r, true, fn);
    assert.equal((await q("select has_function_privilege('anon',$1,'execute') r", [fn]))[0].r, false, fn);
  }
  const defs = await q("select proname, prosecdef from pg_proc where proname in ('lavagna_undo','lavagna_clear','lavagna_strokes_removed') order by 1");
  assert.deepEqual(defs.map((d) => [d.proname, d.prosecdef]), [['lavagna_clear', false], ['lavagna_strokes_removed', true], ['lavagna_undo', false]]);
});

test('leaving the couple or deleting the account keeps the drawing for the partner, without author', async () => {
  const a = await draw(h.F, h.A);
  const b = await draw(h.B, h.A);
  await svc('select public.s32_leave_couple($1,$2) r', [h.B, 'app']);
  const left = await strokes(h.F);
  assert.deepEqual(left.map((s) => [s.id, s.by]), [[a, h.F], [b, null]]);

  const other = await draw(h.U1, C2);
  await svc('select public.s32_delete_account_data($1,$2) r', [h.U1, 'app']);
  assert.deepEqual((await q('select id, author_id from public.lavagna_strokes where couple_id = $1', [C2])).map((r) => [r.id, r.author_id]), [[other, null]]);
  // The last member goes: the whole board goes with the couple, no error.
  await h.as(db, h.F, 'select public.lavagna_undo() r');
  await svc('select public.s32_delete_account_data($1,$2) r', [h.F, 'app']);
  assert.equal((await q('select count(*)::int n from public.lavagna_strokes where couple_id = $1', [h.A]))[0].n, 0);
  assert.equal((await q('select count(*)::int n from public.lavagna_boards where couple_id = $1', [h.A]))[0].n, 0);
});

test('the data export has the strokes the person drew, never the partner\'s', async () => {
  await draw(h.F, h.A, { color: 'latte', points: [10, 20, 30, 40] });
  await draw(h.B, h.A, { color: 'lilla' });
  const e = await svc('select public.s32_export_user_data($1) r', [h.F]);
  assert.deepEqual(e.created.lavagna_strokes.map((s) => [s.tool, s.color, s.width, s.points]), [['pen', 'latte', 1, [10, 20, 30, 40]]]);
  assert.ok(!JSON.stringify(e).includes(h.B), 'no id of the partner');
  assert.deepEqual(e.created.couple_notes, [], 'the notes are still there');
  assert.deepEqual((await svc('select public.s32_export_user_data($1) r', [h.U1])).created.lavagna_strokes, []);
});

test('the board notification can be switched off, on its own', async () => {
  const before = await h.as(db, h.B, 'select public.get_notification_preferences() r');
  assert.equal(before.lavagna, true, 'on by default');
  const after = await h.as(db, h.B, "select public.set_notification_preference('lavagna', false) r");
  assert.deepEqual(after, { ...before, lavagna: false });
  assert.equal((await q('select lavagna from public.notification_preferences where user_id = $1', [h.B]))[0].lavagna, false);
  await assert.rejects(h.as(db, h.B, "select public.set_notification_preference('lavagne', false) r"), /Invalid preference/);
});
