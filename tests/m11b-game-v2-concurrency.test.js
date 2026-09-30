// M11B — real two-connection races on a REAL PostgreSQL server: both
// partners finalizing together, weekly double creation, request-id replay
// racing its original, both partners opening Per voi at the same instant.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { SKIP, CAN_RUN, startServer, asUser, waitFor } = require('./helpers/game-v2-pg');

const uuid = () => crypto.randomUUID();
let pg;
test.before(() => {
  if (!CAN_RUN) return;
  pg = startServer(54351);
  // Francesco's week, whatever day the suite runs.
  pg.sql(`create or replace function private.game_v2_clock() returns timestamptz language sql stable set search_path = '' as $$ select '2026-09-30T10:00:00Z'::timestamptz $$`);
});
test.after(() => pg?.stop());

function couple() {
  const c = uuid(); const f = uuid(); const b = uuid();
  pg.sql(`insert into public.couples(id) values ('${c}'); insert into public.profiles(id, couple_id, role) values ('${f}','${c}','francesco'),('${b}','${c}','beatrice')`);
  return { c, f, b };
}
const as = (uid, body) => pg.sql(`${asUser(uid)} ${body}`).split('\n').filter((l) => !/^\s*$/.test(l)).pop();
const answerAll = (uid, sid) => pg.sql(`${asUser(uid)} do $$ declare it jsonb; begin
  for it in select value from jsonb_array_elements(public.get_game_session('${sid}')->'items') loop
    perform public.save_game_session_answer('${sid}', (it->>'id')::uuid,
      case when it->>'answer_kind' = 'open' then 'risposta' end,
      case when it->>'answer_kind' = 'choice' then 0::smallint end);
  end loop; end $$;`);
const tag = (label, out) => [...out.matchAll(new RegExp(`${label}:([^\\n]*)`, 'g'))].map((m) => m[1]);

test('M11B race: both partners finalize at the same time -> one reveal, completed once', { skip: SKIP }, async () => {
  const { f, b } = couple();
  const sid = as(f, `select public.start_game_round('confrontatevi', '${uuid()}')->>'id';`);
  answerAll(f, sid); answerAll(b, sid);
  const first = pg.session();
  first.send(`${asUser(f)} begin; select 'F:' || (public.complete_game_session_side('${sid}')->>'reveal_ready');`);
  await waitFor(() => /F:/.test(first.peek().out), 'Francesco finalized inside an open transaction');
  const second = pg.session();
  second.send(`${asUser(b)} select 'B:' || (public.complete_game_session_side('${sid}')->>'reveal_ready');`);
  await waitFor(() => pg.lockWaiters() >= 1, 'Bea waiting on the session row lock');
  first.send('commit;');
  const rf = await first.end(); const rb = await second.end();
  assert.equal(rf.err, ''); assert.equal(rb.err, '');
  assert.deepEqual(tag('F', rf.out), ['false'], 'first finalizer still waits for the partner');
  assert.deepEqual(tag('B', rb.out), ['true'], 'second finalizer sees reveal ready');
  assert.equal(pg.sql(`select count(*) from public.game_session_sides where session_id = '${sid}' and completed_at is not null`), '2');
  assert.equal(pg.sql(`select completed_at is not null from public.game_sessions where id = '${sid}'`), 't');
});

test('M11B race: weekly double-click with two request ids creates exactly one question', { skip: SKIP }, async () => {
  const { f } = couple();
  const call = (rid) => `select 'W:' || (public.create_weekly_question('${rid}', 'Cosa ti ha fatto ridere questa settimana?', 'open', '[]'::jsonb, array['scopritevi'])->>'question_id');`;
  const a = pg.session(); const bSession = pg.session();
  a.send(`${asUser(f)} begin; ${call(uuid())}`);
  await waitFor(() => /W:/.test(a.peek().out), 'first creation pending');
  bSession.send(`${asUser(f)} ${call(uuid())}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'second creation waiting');
  a.send('commit;');
  const ra = await a.end(); const rb = await bSession.end();
  assert.equal(ra.err, '');
  assert.match(rb.err, /weekly question already created/);
  assert.equal(pg.sql(`select count(*) from public.couple_questions q join public.profiles p on p.couple_id = q.couple_id where p.id = '${f}' and q.origin = 'weekly'`), '1');
});

test('M11B race: a weekly retry racing its original returns the same question', { skip: SKIP }, async () => {
  const { f } = couple();
  const rid = uuid();
  const call = `select 'W:' || (public.create_weekly_question('${rid}', 'Qual è il gesto che ti è piaciuto di più?', 'open', '[]'::jsonb, array['scopritevi'])->>'question_id');`;
  const a = pg.session(); const r = pg.session();
  a.send(`${asUser(f)} begin; ${call}`);
  await waitFor(() => /W:/.test(a.peek().out), 'original pending');
  r.send(`${asUser(f)} ${call}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'retry waiting');
  a.send('commit;');
  const ra = await a.end(); const rr = await r.end();
  assert.equal(ra.err, ''); assert.equal(rr.err, '');
  assert.deepEqual(tag('W', rr.out), tag('W', ra.out));
});

test('M11B race: 12 simultaneous Per voi taps from both partners open one round', { skip: SKIP }, async () => {
  const { c, f, b } = couple();
  const sessions = Array.from({ length: 12 }, (_, i) => {
    const s = pg.session();
    s.send(`${asUser(i % 2 ? b : f)} select 'S:' || (public.start_game_round('per_voi', '${uuid()}')->>'id');`);
    return s;
  });
  const results = await Promise.all(sessions.map((s) => s.end()));
  assert.equal(results.map((r) => r.err).join(''), '');
  const ids = results.flatMap((r) => tag('S', r.out));
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, 1);
  assert.equal(pg.sql(`select count(*) from public.game_sessions where couple_id = '${c}' and engine_version = 2`), '1');
  assert.equal(pg.sql(`select count(*) from public.game_session_items i join public.game_sessions s on s.id = i.session_id where s.couple_id = '${c}'`), '5');
});

test('M11B race: read RPCs run under a real READ ONLY transaction (PostgREST STABLE path)', { skip: SKIP }, () => {
  const { f } = couple();
  const sid = as(f, `select public.start_game_round('ridete', '${uuid()}')->>'id';`);
  for (const call of ['public.get_game_v2_home()', 'public.get_weekly_question_state()', 'public.list_couple_questions()', 'public.list_game_sessions()', `public.get_game_session('${sid}')`]) {
    const out = pg.sql(`${asUser(f)} begin read only; select 'OK:' || (${call} is not null)::text; rollback;`);
    assert.match(out, /OK:true/, call);
  }
});
