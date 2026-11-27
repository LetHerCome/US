// Ti penso ×N dai widget (founder, 27/11/2026): the taps of a widget burst
// travel with ONE Ti penso. widget_send_think_internal(token_hash, action_id,
// p_taps default 1) on the full repo schema in disposable PGlite; nothing
// here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/mc2-db');

let db;
const TOKEN = 'c'.repeat(64);
test.before(async () => {
  db = await h.database();
  await db.query(`insert into public.widget_action_tokens(couple_id, profile_id, device_id_hash, token_hash, scope, expires_at)
    values ($1, $2, $3, $4, 'think:send', now() + interval '1 day')`, [h.A, h.F, 'd'.repeat(64), TOKEN]);
});
test.after(async () => { await db?.close(); });

const action = (n) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;
// The rate limit (one widget send every 2.5 s) is the credential's: reset it between sends.
const ready = () => db.query('update public.widget_action_tokens set last_action_at = null where token_hash = $1', [TOKEN]);
const send = async (sql, params) => { await ready(); return h.as(db, null, `select row_to_json(t) r from (${sql}) t`, params, 'service_role'); };
const taps = async (id) => (await db.query('select sender_id, recipient_id, kind, think_taps from public.shared_messages where id = $1', [id])).rows[0];

test('the Edge function of before (two named arguments) still sends, with 1 tap', async () => {
  const sent = await send('select * from public.widget_send_think_internal(p_token_hash => $1, p_action_id => $2)', [TOKEN, action(1)]);
  assert.equal(sent.duplicate, false);
  assert.deepEqual(await taps(sent.message_id), { sender_id: h.F, recipient_id: h.B, kind: 'think', think_taps: 1 });
});

test('a burst of taps from the widget is one Ti penso with its taps, clamped to 1..99', async () => {
  const five = await send('select * from public.widget_send_think_internal(p_token_hash => $1, p_action_id => $2, p_taps => $3)', [TOKEN, action(10), 5]);
  assert.equal((await taps(five.message_id)).think_taps, 5);
  for (const [n, given, stored] of [[11, 400, 99], [12, 0, 1], [13, -4, 1], [14, null, 1]]) {
    const sent = await send('select * from public.widget_send_think_internal($1, $2, $3)', [TOKEN, action(n), given]);
    assert.equal((await taps(sent.message_id)).think_taps, stored, `p_taps ${given}`);
  }
});

test('a retry of the same burst (same action id) returns the first Ti penso, untouched', async () => {
  const first = await send('select * from public.widget_send_think_internal($1, $2, $3)', [TOKEN, action(20), 7]);
  const again = await send('select * from public.widget_send_think_internal($1, $2, $3)', [TOKEN, action(20), 2]);
  assert.equal(again.message_id, first.message_id);
  assert.equal(again.duplicate, true);
  assert.equal((await taps(first.message_id)).think_taps, 7);
  const count = await db.query('select count(*)::int n from public.shared_messages where think_operation_id = $1', [action(20)]);
  assert.equal(count.rows[0].n, 1, 'never more than one Ti penso per burst');
});

test('the credential and the rate limit still hold', async () => {
  await assert.rejects(send('select * from public.widget_send_think_internal($1, $2, $3)', ['e'.repeat(64), action(30), 3]), /invalid_widget_credential/);
  await send('select * from public.widget_send_think_internal($1, $2, $3)', [TOKEN, action(31), 3]);
  await assert.rejects(h.as(db, null, 'select row_to_json(t) r from (select * from public.widget_send_think_internal($1, $2, $3)) t', [TOKEN, action(32), 3], 'service_role'), /widget_action_rate_limited/);
});

test('service_role only, a pinned search_path, one overload', async () => {
  await assert.rejects(h.as(db, h.F, 'select * from public.widget_send_think_internal($1, $2, $3)', [TOKEN, action(40), 2]), /permission denied/);
  await assert.rejects(h.as(db, null, 'select * from public.widget_send_think_internal($1, $2, $3)', [TOKEN, action(41), 2], 'anon'), /permission denied/);
  const fns = (await db.query(`select p.oid::regprocedure::text f, p.prosecdef d, p.proconfig c,
      has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
      has_function_privilege('service_role', p.oid, 'EXECUTE') service
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'widget_send_think_internal'`)).rows;
  assert.deepEqual(fns.map((f) => [f.f, f.d, f.anon, f.auth, f.service]), [['widget_send_think_internal(text,uuid,integer)', true, false, false, true]]);
  assert.ok(fns[0].c.includes('search_path=""'));
});
