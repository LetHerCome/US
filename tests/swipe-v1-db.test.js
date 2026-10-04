const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/game-v2-db');

const { createDb, couple, setClock, as, rpc, id, playSide, startRound } = h;
const MIGRATION = path.join(h.ROOT, 'supabase/migrations_history/20261002190000_swipe_v1.sql');
const WED = '2026-09-30T10:00:00Z';

async function world() {
  const db = await createDb();
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
  const p = await couple(db);
  await setClock(db, WED);
  return { db, ...p };
}

const startSwipe = (db, uid, requestId = id()) =>
  as(db, uid, () => rpc(db, 'select public.start_swipe_round($1::uuid) r', [requestId]));
const get = (db, uid, sid) =>
  as(db, uid, () => rpc(db, 'select public.get_game_session($1::uuid) r', [sid]));
const home = (db, uid) =>
  as(db, uid, () => rpc(db, 'select public.get_game_v2_home() r'));

test('Swipe V1 migration is isolated, server-only and has 32 binary cards', async () => {
  const { db, f } = await world();
  const count = (await db.query('select count(*)::int n from private.game_swipe_v1_catalog')).rows[0].n;
  assert.equal(count, 32);
  const bad = (await db.query(`
    select count(*)::int n
    from private.game_swipe_v1_catalog
    where jsonb_array_length(options) <> 2 or options->>0 = options->>1
  `)).rows[0].n;
  assert.equal(bad, 0);

  await assert.rejects(as(db, f, () => db.query('select * from private.game_swipe_v1_catalog')), /permission denied/);
  await assert.rejects(startRound(db, f, 'swipe'), /invalid family/, 'generic Game V2 family selector must not own Swipe');

  const fn = (await db.query(`
    select p.prosecdef, has_function_privilege('authenticated', 'public.start_swipe_round(uuid)', 'EXECUTE') can_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='start_swipe_round'
  `)).rows[0];
  assert.equal(fn.prosecdef, true);
  assert.equal(fn.can_exec, true);
});

test('Swipe V1 round: exactly 8 shared cards, partner answers sealed until both complete', async () => {
  const { db, f, b } = await world();
  const started = await startSwipe(db, f);
  assert.equal(started.game_family, 'swipe');
  assert.equal(started.engine_version, 2);
  assert.equal(started.items.length, 8);
  assert.ok(started.items.every((item) =>
    item.answer_kind === 'choice' &&
    item.options.length === 2 &&
    item.mechanic === 'reciprocal' &&
    item.context?.swipe_v1 === true
  ));

  const partnerStart = await startSwipe(db, b);
  assert.equal(partnerStart.id, started.id, 'partner resumes the same canonical open Swipe round');
  assert.deepEqual(partnerStart.items.map((x) => x.id), started.items.map((x) => x.id));

  await playSide(db, f, started.id, () => 0);
  const waiting = await get(db, b, started.id);
  assert.equal(waiting.partner_complete, true);
  assert.equal(waiting.reveal_ready, false);
  assert.ok(waiting.items.every((item) => item.partner_answer_index === null), 'Francesco choices stay sealed');

  const done = await playSide(db, b, started.id, (item) => item.position <= 4 ? 0 : 1);
  assert.equal(done.reveal_ready, true);
  assert.ok(done.items.every((item) => Number.isInteger(item.partner_answer_index)));
  assert.equal(done.items.filter((item) => item.my_answer_index === item.partner_answer_index).length, 4);

  const fReveal = await get(db, f, started.id);
  assert.equal(fReveal.items.filter((item) => item.my_answer_index === item.partner_answer_index).length, 4);
});

test('Swipe V1 shares the weekly free-choice budget, is idempotent and avoids immediate repeats', async () => {
  const { db, f, b } = await world();
  const requestId = id();
  const first = await startSwipe(db, f, requestId);
  const retry = await startSwipe(db, f, requestId);
  assert.equal(retry.id, first.id);
  assert.equal(retry.resumed, true);
  assert.equal((await home(db, f)).allowance.free_used, 1);

  await playSide(db, f, first.id, () => 0);
  await playSide(db, b, first.id, () => 1);

  const firstRefs = new Set((await db.query(
    'select source_ref from public.game_session_items where session_id=$1 order by position',
    [first.id]
  )).rows.map((r) => r.source_ref));

  const second = await startSwipe(db, b);
  assert.notEqual(second.id, first.id);
  assert.equal((await home(db, b)).allowance.free_used, 2);
  const secondRefs = (await db.query(
    'select source_ref from public.game_session_items where session_id=$1 order by position',
    [second.id]
  )).rows.map((r) => r.source_ref);
  assert.ok(secondRefs.every((ref) => !firstRefs.has(ref)), 'unseen cards are preferred before repeats');

  await playSide(db, f, second.id, () => 0);
  await playSide(db, b, second.id, () => 0);
  await assert.rejects(startSwipe(db, f), (error) =>
    error.code === 'P0001' && /weekly allowance exhausted/.test(error.message)
  );
});
