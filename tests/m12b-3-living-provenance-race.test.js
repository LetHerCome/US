// M12B.3 — concurrent link requests against a REAL PostgreSQL server
// (concurrent psql sessions, real lock waits): an embedded single-connection
// engine cannot interleave sessions. Same harness as the Game V2 race tests.
// Skipped, with the reason, when no local PostgreSQL server can be run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SKIP, startServer, asUser, waitFor } = require('./helpers/game-v2-pg');
const { EVENTS_FIXTURE, M12B3 } = require('./helpers/m12b-3-events-fixture');
const { ROOT } = require('./helpers/game-v2-db');

const uuid = () => crypto.randomUUID();
let pg;
test.before(() => {
  if (SKIP) return;
  pg = startServer(54333);
  pg.sql(EVENTS_FIXTURE);
  for (const f of [M12B3.provenance, M12B3.history]) pg.sql(fs.readFileSync(path.join(ROOT, f), 'utf8'));
});
test.after(() => { pg?.stop(); });

function world() {
  const c = uuid(); const f = uuid(); const b = uuid(); const ev = uuid();
  pg.sql(`insert into public.couples(id) values ('${c}');
    insert into public.profiles(id, couple_id, role) values ('${f}','${c}','francesco'),('${b}','${c}','beatrice');
    insert into public.shared_events(id, couple_id, title, event_date) values ('${ev}','${c}','Weekend Roma','2026-05-16');`);
  const done = pg.sql(`${asUser(f)} select public.complete_shared_event('${ev}', '2026-05-16')->>'id';`).split('\n').pop();
  const moment = (uid) => {
    const m = uuid();
    pg.sql(`insert into public.moments(id, couple_id, created_by, storage_path, caption) values ('${m}','${c}','${uid}','p/${m}.jpg','Foto')`);
    return m;
  };
  return { c, f, b, ev, done, moment };
}
const linkSql = (m, ref) => `select public.link_moment_to_source('${m}', 'shared_event_completion', '${ref}')->>'status';`;
const count = (c) => Number(pg.sql(`select count(*) from public.living_provenance where couple_id = '${c}'`));

test('R1 — the same link requested twice at once: one row, the second waits and returns existing', { skip: SKIP }, async () => {
  const w = world(); const m = w.moment(w.f);
  const one = pg.session(); const two = pg.session();
  one.send(`${asUser(w.f)} begin; ${linkSql(m, w.done)}`);
  await waitFor(() => one.peek().out.includes('linked'), 'first link');
  two.send(`${asUser(w.f)} ${linkSql(m, w.done)}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'second request waiting on the first');
  one.send('commit;');
  const [a, b] = await Promise.all([one.end(), two.end()]);
  assert.match(a.out, /linked/); assert.match(b.out, /existing/);
  assert.equal(a.err + b.err, '');
  assert.equal(count(w.c), 1);
});

test('R2 — both partners keep a different Moment from one completion at once: exactly one wins', { skip: SKIP }, async () => {
  const w = world(); const mf = w.moment(w.f); const mb = w.moment(w.b);
  const one = pg.session(); const two = pg.session();
  one.send(`${asUser(w.f)} begin; ${linkSql(mf, w.done)}`);
  await waitFor(() => one.peek().out.includes('linked'), 'first link');
  two.send(`${asUser(w.b)} ${linkSql(mb, w.done)}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'second partner waiting');
  one.send('commit;');
  const [, b] = await Promise.all([one.end(), two.end()]);
  assert.match(b.err, /living_provenance_source_already_kept/);
  assert.equal(count(w.c), 1);
  assert.equal(pg.sql(`select target_ref from public.living_provenance where couple_id = '${w.c}'`), mf);
});

test('R3 — the Moment is deleted while it is being linked: the delete waits, then removes only the link', { skip: SKIP }, async () => {
  const w = world(); const m = w.moment(w.f);
  const before = pg.sql(`select row_to_json(c)::text from public.shared_event_completions c where id = '${w.done}'`);
  const one = pg.session(); const two = pg.session();
  one.send(`${asUser(w.f)} begin; ${linkSql(m, w.done)}`);
  await waitFor(() => one.peek().out.includes('linked'), 'link in flight');
  two.send(`delete from public.moments where id = '${m}';`);
  await waitFor(() => pg.lockWaiters() >= 1, 'delete waiting on the link');
  one.send('commit;');
  const [a, b] = await Promise.all([one.end(), two.end()]);
  assert.equal(a.err + b.err, '');
  assert.equal(count(w.c), 0, 'the provenance row went with its Moment');
  assert.equal(pg.sql(`select count(*) from public.moments where id = '${m}'`), '0');
  assert.equal(pg.sql(`select row_to_json(c)::text from public.shared_event_completions c where id = '${w.done}'`), before, 'the completion is untouched');
});
