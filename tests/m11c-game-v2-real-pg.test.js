// M11C — context adapters on a REAL PostgreSQL server: the plpgsql adapters
// run as the PostgREST role inside SECURITY DEFINER, both partners racing a
// context round get one round, and the reads stay READ ONLY compatible.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { SKIP, CAN_RUN, startServer, asUser } = require('./helpers/game-v2-pg');

const uuid = () => crypto.randomUUID();
let pg;
test.before(() => {
  if (!CAN_RUN) return;
  pg = startServer(54352);
  pg.sql(`create or replace function private.game_v2_clock() returns timestamptz language sql stable set search_path = '' as $$ select '2026-09-30T10:00:00Z'::timestamptz $$`);
});
test.after(() => pg?.stop());

test('M11C real PG: two partners open a context round together, reads run READ ONLY', { skip: SKIP }, async () => {
  const c = uuid(); const f = uuid(); const b = uuid();
  pg.sql(`insert into public.couples(id) values ('${c}');
    insert into public.profiles(id, couple_id, role) values ('${f}','${c}','francesco'),('${b}','${c}','beatrice');
    insert into public.bucket_items(couple_id, title, status, completed, completed_at) values ('${c}', 'Cena sul lago', 'lived', true, '2026-08-01T19:00:00Z');
    insert into public.calendar_entries(couple_id, entry_type, created_by, title, starts_at) values ('${c}', 'shared', '${f}', 'Matrimonio di Luca', '2026-04-20T10:00:00Z');
    insert into public.calendar_entries(couple_id, entry_type, owner_id, created_by, title, starts_at) values ('${c}', 'personal', '${b}', '${b}', 'Sorpresa segreta', '2026-05-20T10:00:00Z');
    insert into public.moments(couple_id, created_by, caption, moment_date) values ('${c}', '${f}', 'Tramonto a Trieste', '2026-06-02');`);
  const sessions = [f, b, f, b].map((uid) => {
    const s = pg.session();
    s.send(`${asUser(uid)} select 'S:' || (public.start_game_round('rivivete', '${uuid()}')->>'id');`);
    return s;
  });
  const results = await Promise.all(sessions.map((s) => s.end()));
  assert.equal(results.map((r) => r.err).join(''), '');
  const ids = results.flatMap((r) => [...r.out.matchAll(/S:([^\n]*)/g)].map((m) => m[1]));
  assert.equal(new Set(ids).size, 1);
  const sid = ids[0];
  const texts = pg.sql(`select string_agg(question_text, ' | ' order by position) from public.game_session_items where session_id = '${sid}'`);
  assert.match(texts, /«(Cena sul lago|Matrimonio di Luca|Tramonto a Trieste)»/);
  assert.doesNotMatch(texts, /Sorpresa segreta/);
  const out = pg.sql(`${asUser(b)} begin read only; select 'OK:' || jsonb_array_length(public.get_game_session('${sid}')->'items'); select 'H:' || (public.get_game_v2_home()->'per_voi'->>'state'); rollback;`);
  assert.match(out, /OK:5/);
  assert.match(out, /H:idle/);
});
