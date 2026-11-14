// «La cosa di oggi» (founder, 13/11/2026, docs/DECISIONS.md): the server
// counts the gentle streak (a day counts when both did at least one gesture,
// one forgiven day in seven, the record stays) and the first week's steps
// (one a day, after the question; a step done earlier is skipped; 21 days at
// most; 100 Sintonia points once). Full repo schema in disposable PGlite;
// nothing here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_cosa_di_oggi_v1\.sql$/.test(f));
const TODAY = '2026-11-20';
const day = (base, n) => { const d = new Date(`${base}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (d, time = '12:00') => `${d} ${time}:00+01`;
const other = (u) => (u === h.F ? h.B : h.F);
const role = (u) => (u === h.F ? 'francesco' : 'beatrice');

let db;
// Rows written as the service would, with the times the test needs.
async function seed(sql, params = []) {
  await db.exec('begin');
  try {
    await db.exec('set local session_replication_role = replica');
    const r = await db.query(sql, params);
    await db.exec('commit');
    return r.rows;
  } catch (e) { await db.exec('rollback'); throw e; }
}
let q = 0;
const G = {
  daily: (u, ts, question) => seed('insert into public.daily_answers(question_id, user_id, couple_id, answer, created_at, updated_at) values ($1,$2,$3,$4,$5,$5)', [question || h.uid(900 + (++q)), u, h.A, 'sì', ts]),
  think: (u, ts) => seed("insert into public.shared_messages(couple_id, sender_id, recipient_id, kind, body, created_at) values ($1,$2,$3,'think','ti penso',$4)", [h.A, u, other(u), ts]),
  game: async (u, ts) => {
    const [s] = await seed("insert into public.game_sessions(couple_id, game_family, content_source, started_by_role, create_request_id, started_at) values ($1,'quiz','curated',$2,gen_random_uuid(),$3) returning id", [h.A, role(u), ts]);
    await seed('insert into public.game_session_sides(session_id, actor_role, completed_at) values ($1,$2,$3)', [s.id, role(u), ts]);
  },
  moment: (u, ts) => seed("insert into public.moments(couple_id, created_by, storage_path, moment_date, created_at) values ($1,$2,$3,$4::date,$4)", [h.A, u, `${h.A}/${u}/m${++q}.webp`, ts]),
  postit: (u, ts) => seed("insert into public.couple_notes(couple_id, title, created_by, updated_by, created_at, updated_at) values ($1,'Spesa',$2,$2,$3,$3)", [h.A, u, ts]),
  left: (u, ts) => seed("insert into public.left_for_you(couple_id, sender_id, recipient_id, kind, body, created_at) values ($1,$2,$3,'text','ciao',$4)", [h.A, u, other(u), ts]),
  lavagna: (u, ts) => seed("insert into public.lavagna_strokes(couple_id, author_id, tool, color, width, points, created_at) values ($1,$2,'pen','rosa',1,'{10,10,20,20}',$3)", [h.A, u, ts]),
  calendar: (u, ts) => seed("insert into public.calendar_entries(couple_id, entry_type, created_by, title, is_all_day, start_date, end_date, created_at, updated_at) values ($1,'shared',$2,'Cena',true,'2026-12-10','2026-12-10',$3,$3)", [h.A, u, ts]),
};
// Both on the same day (the daily answers on the same question).
const both = async (d, kind = 'think') => { const question = h.uid(700 + (++q)); await G[kind](h.F, at(d, '10:00'), question); await G[kind](h.B, at(d, '21:00'), question); };
const state = (today = TODAY, widget = 'unsupported', user = h.F) =>
  db.query('select private.cosa_di_oggi_state($1,$2,$3::date,$4) r', [h.A, user, today, widget]).then((r) => r.rows[0].r);
// The couple completed on `started` (the second account joined), after the launch.
const newCouple = async (started) => {
  await db.query("update private.feature_launches set launched_at = '2026-11-01 00:00+01' where feature = 'guided_week'");
  await seed('update public.couple_invites set created_at = least(created_at, $2::timestamptz), used_at = $2::timestamptz where couple_id = $1', [h.A, at(started, '09:00')]);
};

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is in the cutoff and keeps its table private', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_cosa_di_oggi_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  assert.match(sql, /alter table private\.feature_launches enable row level security;/);
  assert.match(sql, /revoke all on table private\.feature_launches from public, anon, authenticated, service_role;/);
  assert.match(sql, /revoke all on function private\.cosa_di_oggi_state\(uuid, uuid, date, text\) from public, anon, authenticated, service_role;/);
  assert.match(sql, /revoke all on function public\.cosa_di_oggi\(text\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.cosa_di_oggi\(text\) to authenticated;/);
  assert.ok((sql.match(/^security definer$/gm) || []).length <= (sql.match(/^set search_path = ''$/gm) || []).length);
  assert.match(sql, /create or replace function public\.cosa_di_oggi\(widget text default 'unsupported'\)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''/);
});

test('a day counts only when both did something; today waits until the day is over', async () => {
  await both(day(TODAY, -2));
  await both(day(TODAY, -1), 'daily');
  await G.moment(h.F, at(TODAY));
  let s = await state();
  assert.equal(s.streak, 2);
  assert.deepEqual(s.today, { counted: false, me: true, partner: false, my_think: false });
  assert.deepEqual((await state(TODAY, 'unsupported', h.B)).today, { counted: false, me: false, partner: true, my_think: false });
  await G.lavagna(h.B, at(TODAY, '23:30'));
  s = await state();
  assert.equal(s.streak, 3);
  assert.equal(s.today.counted, true);
  assert.equal(s.record, 3);
});

test('every kind of gesture counts', async () => {
  const kinds = ['daily', 'think', 'game', 'moment', 'postit', 'left', 'lavagna', 'calendar'];
  for (let i = 0; i < kinds.length; i++) await both(day(TODAY, i - kinds.length + 1), kinds[i]);
  assert.equal((await state()).streak, kinds.length);
});

test('one missed day in seven is forgiven, a second one starts again from 1 and the record stays', async () => {
  for (const n of [-8, -7, -5, -4, -3]) await both(day(TODAY, n)); // -6 missed, forgiven
  let s = await state(day(TODAY, -3));
  assert.equal(s.streak, 5);
  s = await state(day(TODAY, -1)); // -2 missed: second miss in seven days
  assert.equal(s.streak, 0);
  assert.equal(s.record, 5);
  await both(day(TODAY, -1));
  await both(TODAY);
  s = await state();
  assert.equal(s.streak, 2);
  assert.equal(s.record, 5);
  assert.equal(s.best_before, 5);
  // Two consecutive missed days break it too.
  s = await state(day(TODAY, 3));
  assert.equal(s.streak, 0);
  // A miss seven days after the forgiven one is forgiven again.
  for (const n of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15]) await both(day(TODAY, n)); // 7 and 14 missed
  s = await state(day(TODAY, 15));
  assert.equal(s.streak, 15);
  assert.equal(s.best_before, 5);
  assert.equal(s.record, 15);
});

test('my Ti penso of today is known (the card offers it until I send one)', async () => {
  await G.think(h.B, at(TODAY));
  assert.equal((await state()).today.my_think, false);
  await G.think(h.F, at(day(TODAY, -1)));
  assert.equal((await state()).today.my_think, false);
  await G.think(h.F, at(TODAY, '08:00'));
  assert.equal((await state()).today.my_think, true);
});

test('no first week for couples completed before the launch', async () => {
  assert.equal((await state()).week, null);
});

test('first week: one step a day, after it is done the next one comes tomorrow', async () => {
  const D1 = '2026-11-14';
  await newCouple(D1);
  let w = (await state(D1)).week;
  assert.equal(w.started_on, D1);
  assert.equal(w.ends_on, day(D1, 20));
  assert.equal(w.total, 6, 'no widget step where the widget does not exist');
  assert.equal(w.current, 'daily');
  assert.equal(w.ready, true);
  assert.equal(w.done, 0);
  await G.daily(h.F, at(D1, '10:00'), h.uid(801));
  assert.equal((await state(D1)).week.current, 'daily', 'the question is a step for both');
  await G.daily(h.B, at(D1, '20:00'), h.uid(801));
  w = (await state(D1)).week;
  assert.deepEqual([w.current, w.ready, w.done, w.done_today], ['think', false, 1, true]);
  w = (await state(day(D1, 1))).week;
  assert.deepEqual([w.current, w.ready, w.done_today], ['think', true, false]);
  await G.think(h.B, at(day(D1, 1)));
  w = (await state(day(D1, 1))).week;
  assert.deepEqual([w.current, w.ready, w.done], ['game', false, 2], 'one of the two is enough');
  // A step already done earlier is skipped: the moment was saved on day 1.
  await G.moment(h.F, at(D1, '11:00'));
  await G.game(h.B, at(day(D1, 2)));
  w = (await state(day(D1, 2))).week;
  assert.deepEqual([w.current, w.ready, w.done], ['calendar', false, 4]);
  assert.deepEqual(w.steps.map((s) => [s.key, s.state]), [['daily', 'done'], ['think', 'done'], ['game', 'done'], ['moment', 'skipped'], ['calendar', 'current'], ['left', 'next']]);
  // A missed day leaves the step there.
  w = (await state(day(D1, 5))).week;
  assert.deepEqual([w.current, w.ready], ['calendar', true]);
});

test('the widget is the last step, on each phone; done or missing it is skipped', async () => {
  const D1 = '2026-11-14';
  await newCouple(D1);
  await both(D1, 'daily');
  for (const [i, k] of ['think', 'game', 'moment', 'calendar', 'left'].entries()) await G[k](h.F, at(day(D1, i + 1)));
  let w = (await state(day(D1, 6), 'todo')).week;
  assert.deepEqual([w.total, w.current, w.ready, w.all_done], [7, 'widget', true, false]);
  w = (await state(day(D1, 5), 'todo')).week;
  assert.deepEqual([w.current, w.ready, w.done_today], ['widget', false, true]);
  w = (await state(day(D1, 6), 'done')).week;
  assert.deepEqual([w.current, w.all_done], [null, true]);
  w = (await state(day(D1, 6), 'unsupported')).week;
  assert.deepEqual([w.total, w.current, w.all_done], [6, null, true]);
});

test('after 21 days the week closes by itself', async () => {
  const D1 = '2026-11-01';
  await newCouple(D1);
  assert.equal((await state(day(D1, 20))).week.current, 'daily');
  assert.equal((await state(day(D1, 21))).week, null);
});

test('the public call: only members, the caller\'s couple, and 100 points once at the end', async () => {
  await assert.rejects(h.as(db, null, "select public.cosa_di_oggi('unsupported') r", [], 'anon'));
  await assert.rejects(h.as(db, h.U1, "select public.cosa_di_oggi('unsupported') r"), /couple membership required/);
  await assert.rejects(h.as(db, h.F, "select public.cosa_di_oggi('maybe') r"), /widget/);
  const today = (await db.query("select ((now() at time zone 'Europe/Rome')::date)::text d")).rows[0].d;
  await newCouple(day(today, -2));
  await db.query("update private.feature_launches set launched_at = now() - interval '10 days' where feature = 'guided_week'");
  const xp = async () => (await db.query('select bond_xp from public.couples where id = $1', [h.A])).rows[0].bond_xp;
  const before = await xp();
  await both(day(today, -2), 'daily');
  for (const k of ['think', 'game', 'moment', 'calendar']) await G[k](h.B, at(day(today, -1)));
  let r = await h.as(db, h.F, "select public.cosa_di_oggi('unsupported') r");
  assert.equal(r.week.all_done, false);
  assert.equal(r.week.finished_on, null);
  assert.equal(await xp(), before);
  await G.left(h.F, at(today, '00:30'));
  r = await h.as(db, h.F, "select public.cosa_di_oggi('unsupported') r");
  assert.deepEqual([r.week.all_done, r.week.finished_on], [true, today]);
  assert.equal(await xp(), before + 100);
  r = await h.as(db, h.B, "select public.cosa_di_oggi('done') r");
  assert.deepEqual([r.week.all_done, r.week.finished_on], [true, today]);
  assert.equal(await xp(), before + 100, 'once per couple');
  const ev = (await db.query("select source_kind, source_key, xp_awarded, counts_rhythm from public.progression_events where couple_id = $1 and source_key = 'guided-week'", [h.A])).rows;
  assert.deepEqual(ev, [{ source_kind: 'milestone', source_key: 'guided-week', xp_awarded: 100, counts_rhythm: false }]);
});

test('a couple with one member has no streak and no week', async () => {
  await seed('update public.profiles set couple_id = null where id = $1', [h.B]);
  const s = await state();
  assert.deepEqual([s.streak, s.record, s.week], [0, 0, null]);
});
