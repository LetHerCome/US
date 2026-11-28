// I cuori (founder, 27/11/2026, «Uno solo ×N»): one Ti penso per combo, with
// the number of taps. send_think(operation_id, p_taps default 1) on the full
// repo schema in disposable PGlite; nothing here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/mc2-db');

let db;
test.before(async () => { db = await h.database(); });
test.after(async () => { await db?.close(); });

const op = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const send = (user, sql, params) => h.as(db, user, `select row_to_json(t) r from (${sql}) t`, params);
const row = async (id) => (await db.query('select sender_id, recipient_id, kind, think_taps from public.shared_messages where id = $1', [id])).rows[0];

test('the old call (operation_id only) still works and carries 1 tap', async () => {
  const sent = await send(h.F, 'select * from public.send_think($1)', [op(1)]);
  assert.equal(sent.duplicate, false);
  assert.deepEqual(await row(sent.message_id), { sender_id: h.F, recipient_id: h.B, kind: 'think', think_taps: 1 });
  // PostgREST calls it by name, as the apps already out do.
  const named = await send(h.F, 'select * from public.send_think(operation_id => $1)', [op(2)]);
  assert.equal((await row(named.message_id)).think_taps, 1);
});

test('the taps of a combo travel with the Ti penso, clamped to 1..99', async () => {
  const five = await send(h.F, 'select * from public.send_think($1, $2)', [op(10), 5]);
  assert.equal((await row(five.message_id)).think_taps, 5);
  const many = await send(h.B, 'select * from public.send_think(operation_id => $1, p_taps => $2)', [op(11), 400]);
  assert.deepEqual(await row(many.message_id), { sender_id: h.B, recipient_id: h.F, kind: 'think', think_taps: 99 });
  for (const [n, taps] of [[12, 0], [13, -3], [14, null]]) {
    const sent = await send(h.F, 'select * from public.send_think($1, $2)', [op(n), taps]);
    assert.equal((await row(sent.message_id)).think_taps, 1, `p_taps ${taps}`);
  }
});

test('a retry with the same operation_id returns the first Ti penso, untouched', async () => {
  const first = await send(h.F, 'select * from public.send_think($1, $2)', [op(20), 7]);
  const again = await send(h.F, 'select * from public.send_think($1, $2)', [op(20), 3]);
  assert.equal(again.message_id, first.message_id);
  assert.equal(again.duplicate, true);
  assert.equal((await row(first.message_id)).think_taps, 7);
  const count = await db.query('select count(*)::int n from public.shared_messages where think_operation_id = $1', [op(20)]);
  assert.equal(count.rows[0].n, 1, 'never more than one Ti penso per combo');
});

test('only signed-in members: no anon, a pinned search_path, one overload', async () => {
  await assert.rejects(send(null, 'select * from public.send_think($1, $2)', [op(30), 2]), /authentication required|permission denied/);
  await assert.rejects(h.as(db, null, 'select * from public.send_think($1, $2)', [op(31), 2], 'anon'), /permission denied/);
  const fns = (await db.query(`select p.oid::regprocedure::text f, p.prosecdef d, p.proconfig c,
      has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'send_think'`)).rows;
  assert.deepEqual(fns.map((f) => [f.f, f.d, f.anon, f.auth]), [['send_think(uuid,integer)', true, false, true]]);
  assert.ok(fns[0].c.includes('search_path=""'));
});

test('a direct insert is held to 1..99 and to think rows', async () => {
  const insert = (kind, taps) => h.as(db, h.F, `insert into public.shared_messages(couple_id, sender_id, recipient_id, kind, body, think_taps)
    values ($1, $2, $3, $4, 'x', $5) returning think_taps r`, [h.A, h.F, h.B, kind, taps]);
  assert.equal(await insert('think', 4), 4);
  await assert.rejects(insert('think', 100), /shared_messages_think_taps_check/);
  await assert.rejects(insert('think', 0), /shared_messages_think_taps_check/);
  await assert.rejects(insert('normal', 2), /shared_messages_think_taps_check/);
  // Nobody can rewrite the taps afterwards: no UPDATE grant on the table.
  await assert.rejects(h.as(db, h.B, 'update public.shared_messages set think_taps = 50 where recipient_id = $1', [h.B]), /permission denied/);
});
