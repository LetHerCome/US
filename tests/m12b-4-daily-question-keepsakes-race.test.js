// M12B.4 — concurrent Conserva against a REAL PostgreSQL server (concurrent
// psql sessions, real lock waits): an embedded single-connection engine
// cannot interleave sessions. Same harness as the M12B.3 / Game V2 race tests.
// Skipped, with the reason, when no local PostgreSQL server can be run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SKIP, startServer, asUser, waitFor } = require('./helpers/game-v2-pg');
const { EVENTS_FIXTURE, M12B3 } = require('./helpers/m12b-3-events-fixture');
const { DAILY_FIXTURE, M12B4 } = require('./helpers/m12b-4-daily-fixture');
const { ROOT } = require('./helpers/game-v2-db');

const uuid = () => crypto.randomUUID();
let pg;
test.before(() => {
  if (SKIP) return;
  pg = startServer(54334);
  pg.sql(EVENTS_FIXTURE);
  for (const f of [M12B3.provenance, M12B3.history]) pg.sql(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  pg.sql(DAILY_FIXTURE);
  pg.sql(fs.readFileSync(path.join(ROOT, M12B4), 'utf8'));
});
test.after(() => { pg?.stop(); });

let day = 0;
function world() {
  const c = uuid(); const f = uuid(); const b = uuid();
  const date = new Date(Date.UTC(2026, 9, 1 + (day++))).toISOString().slice(0, 10);
  pg.sql(`insert into public.couples(id) values ('${c}');
    insert into public.profiles(id, couple_id, role) values ('${f}','${c}','francesco'),('${b}','${c}','beatrice');`);
  const q = pg.sql(`insert into public.daily_questions (question_date, question) values ('${date}', 'Domanda ${date}') returning id`).split('\n').pop();
  pg.sql(`insert into public.daily_answers (question_id, user_id, couple_id, answer) values ('${q}','${f}','${c}','F'),('${q}','${b}','${c}','B')`);
  return { c, f, b, q };
}
const keepSql = (q) => `select public.keep_daily_question('${q}')->>'status';`;
const count = (c) => Number(pg.sql(`select count(*) from public.daily_question_keepsakes where couple_id = '${c}'`));

test('R1 — the same partner taps Conserva twice at once: one keepsake, the second waits and returns existing', { skip: SKIP }, async () => {
  const w = world();
  const one = pg.session(); const two = pg.session();
  one.send(`${asUser(w.f)} begin; ${keepSql(w.q)}`);
  await waitFor(() => one.peek().out.includes('kept'), 'first keep');
  two.send(`${asUser(w.f)} ${keepSql(w.q)}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'second keep waiting on the first');
  one.send('commit;');
  const [a, b] = await Promise.all([one.end(), two.end()]);
  assert.match(a.out, /kept/); assert.match(b.out, /existing/);
  assert.equal(a.err + b.err, '');
  assert.equal(count(w.c), 1);
});

test('R2 — both partners keep at the same moment: exactly one keepsake, the first keeper is recorded', { skip: SKIP }, async () => {
  const w = world();
  const one = pg.session(); const two = pg.session();
  one.send(`${asUser(w.b)} begin; ${keepSql(w.q)}`);
  await waitFor(() => one.peek().out.includes('kept'), 'Beatrice keeps');
  two.send(`${asUser(w.f)} ${keepSql(w.q)}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'Francesco waiting');
  one.send('commit;');
  const [a, b] = await Promise.all([one.end(), two.end()]);
  assert.match(a.out, /kept/); assert.match(b.out, /existing/);
  assert.equal(a.err + b.err, '');
  assert.equal(count(w.c), 1);
  assert.equal(pg.sql(`select kept_by_role || '|' || francesco_answer || '|' || beatrice_answer from public.daily_question_keepsakes where couple_id = '${w.c}'`), 'beatrice|F|B');
});

test('R3 — the first keep rolls back: the waiting partner keeps it instead, nothing is lost', { skip: SKIP }, async () => {
  const w = world();
  const one = pg.session(); const two = pg.session();
  one.send(`${asUser(w.f)} begin; ${keepSql(w.q)}`);
  await waitFor(() => one.peek().out.includes('kept'), 'first keep');
  two.send(`${asUser(w.b)} ${keepSql(w.q)}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'second keep waiting');
  one.send('rollback;');
  const [, b] = await Promise.all([one.end(), two.end()]);
  assert.match(b.out, /kept/);
  assert.equal(b.err, '');
  assert.equal(pg.sql(`select kept_by_role from public.daily_question_keepsakes where couple_id = '${w.c}'`), 'beatrice');
});

test('R4 — a burst of eight concurrent keeps from both partners: one row, one "kept", seven "existing"', { skip: SKIP }, async () => {
  const w = world();
  const sessions = Array.from({ length: 8 }, (_, i) => { const s = pg.session(); s.send(`${asUser(i % 2 ? w.b : w.f)} ${keepSql(w.q)}`); return s; });
  const results = await Promise.all(sessions.map((s) => s.end()));
  const statuses = results.map((r) => r.out.trim().split('\n').pop()).sort();
  assert.deepEqual(statuses, ['existing', 'existing', 'existing', 'existing', 'existing', 'existing', 'existing', 'kept']);
  assert.equal(results.map((r) => r.err).join(''), '');
  assert.equal(count(w.c), 1);
});

test('R5 — two couples keep the same day at once: one keepsake each, no cross-couple blocking or leak', { skip: SKIP }, async () => {
  const w1 = world();
  const c2 = uuid(); const f2 = uuid(); const b2 = uuid();
  pg.sql(`insert into public.couples(id) values ('${c2}');
    insert into public.profiles(id, couple_id, role) values ('${f2}','${c2}','francesco'),('${b2}','${c2}','beatrice');
    insert into public.daily_answers (question_id, user_id, couple_id, answer) values ('${w1.q}','${f2}','${c2}','F2'),('${w1.q}','${b2}','${c2}','B2');`);
  const one = pg.session(); const two = pg.session();
  one.send(`${asUser(w1.f)} begin; ${keepSql(w1.q)}`);
  await waitFor(() => one.peek().out.includes('kept'), 'couple 1 keeps (open transaction)');
  two.send(`${asUser(b2)} ${keepSql(w1.q)}`);
  const second = await two.end();
  assert.match(second.out, /kept/, 'couple 2 is not blocked by couple 1');
  one.send('commit;');
  await one.end();
  const rows = pg.sql(`select couple_id || ':' || francesco_answer || beatrice_answer from public.daily_question_keepsakes where question_id = '${w1.q}'`).split('\n').sort();
  assert.deepEqual(rows, [`${w1.c}:FB`, `${c2}:F2B2`].sort());
  assert.equal(pg.sql(`${asUser(f2)} select count(*) from public.daily_question_keepsakes;`).split('\n').pop(), '1');
});
