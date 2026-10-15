// Sintonia — the events loophole (audit 2026-10-14, problem 5; founder
// decision 7), on a real embedded PostgreSQL (PGlite) rebuilt from
// supabase/baseline (the F2A.1 production capture). "base" is production
// today; "head" adds 20261014210000_sintonia_event_xp_guard.sql on top.
// Nothing here reaches a remote database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { ROOT } = require('../scripts/supabase-baseline/evidence.cjs');
const { rebuild } = require('../scripts/supabase-baseline/rebuild.cjs');

const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const FILE = '20261014210000_sintonia_event_xp_guard.sql';
const GUARD = fs.readFileSync(path.join(MIGRATIONS, FILE), 'utf8');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let base;
let head;
test.before(async () => {
  [base, head] = await Promise.all([rebuild(), rebuild()]);
  await head.exec(GUARD);
});
test.after(async () => {
  await base?.close();
  await head?.close();
});

// ------------------------------------------------------------------ helpers

const shift = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const romeToday = async (db) => (await db.query("select to_char((now() at time zone 'Europe/Rome')::date, 'YYYY-MM-DD') as d")).rows[0].d;

async function couple(db) {
  const w = { c: randomUUID(), f: randomUUID(), b: randomUUID() };
  await db.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false)', [w.f, `${w.f}@example.test`]);
  await db.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false)', [w.b, `${w.b}@example.test`]);
  await db.query("insert into public.couples (id, name) values ($1, 'US.')", [w.c]);
  await db.query("insert into public.profiles (id, display_name, couple_id, role) values ($1, 'Francesco', $2, 'francesco')", [w.f, w.c]);
  await db.query("insert into public.profiles (id, display_name, couple_id, role) values ($1, 'Beatrice', $2, 'beatrice')", [w.b, w.c]);
  return w;
}

// An event of couple w dated `date`, created `createdDaysAgo` Rome days ago
// (noon Rome), or now when 0. Written as the database owner: since the guard
// migration clients cannot choose created_at any more.
async function event(db, w, { date, createdDaysAgo = 0, yearly = false, title = 'Cena insieme' }) {
  const id = randomUUID();
  const created = createdDaysAgo === 0
    ? 'now()'
    : `(((now() at time zone 'Europe/Rome')::date - ${Number(createdDaysAgo)})::timestamp + time '12:00') at time zone 'Europe/Rome'`;
  await db.query(`insert into public.shared_events (id, couple_id, created_by, title, event_date, recurs_yearly, created_at)
    values ($1, $2, $3, $4, $5::date, $6, ${created})`, [id, w.c, w.f, title, date, yearly]);
  return id;
}

// Runs one statement as `uid` with the authenticated role, like PostgREST.
async function as(db, uid, sql, params = []) {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
    await db.exec('set local role authenticated');
    const res = await db.query(sql, params);
    await db.exec('commit');
    return res.rows;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}
const complete = async (db, uid, eventId, date) =>
  (await as(db, uid, 'select public.complete_shared_event($1::uuid, $2::date) as r', [eventId, date]))[0].r;

const xpOf = async (db, c) => (await db.query('select bond_xp from public.couples where id = $1', [c])).rows[0].bond_xp;
const completionsOf = async (db, c) => (await db.query(`select event_id, to_char(occurrence_date, 'YYYY-MM-DD') as day, completed_by, xp_awarded
  from public.shared_event_completions where couple_id = $1 order by completed_at, occurrence_date`, [c])).rows;
const activityOf = async (db, c) => (await db.query(`select actor_id, payload from public.activity
  where couple_id = $1 and type = 'shared_event_completed' order by created_at, id`, [c])).rows;
const ledgerOf = async (db, c) => (await db.query(`select source_key, xp_awarded, counts_rhythm from public.progression_events
  where couple_id = $1 and source_kind = 'event' order by created_at`, [c])).rows;

// ------------------------------------------------------------------ planned events earn as before

test('planned ahead: amounts are unchanged (25 / 35 / 50 / 60) and the answer is production\'s plus xp_reason', async () => {
  const cases = [
    { lead: 1, yearly: false, xp: 25 },
    { lead: 3, yearly: false, xp: 35 },
    { lead: 8, yearly: false, xp: 50 },
    { lead: 3, yearly: true, xp: 60 },
  ];
  for (const { lead, yearly, xp } of cases) {
    const answers = {};
    for (const [name, db] of [['base', base], ['head', head]]) {
      const today = await romeToday(db);
      const w = await couple(db);
      const ev = await event(db, w, { date: today, createdDaysAgo: lead, yearly });
      answers[name] = await complete(db, w.f, ev, today);
      if (name === 'head') {
        assert.equal(await xpOf(db, w.c), xp, `lead ${lead}${yearly ? ' yearly' : ''}: bond_xp`);
        assert.deepEqual((await completionsOf(db, w.c)).map((r) => r.xp_awarded), [xp], 'completion row keeps the real xp');
        const activity = await activityOf(db, w.c);
        assert.equal(activity.length, 1);
        assert.deepEqual(activity[0].payload, { event_id: ev, title: 'Cena insieme', occurrence_date: today, xp });
        assert.equal(activity[0].actor_id, w.f);
        const ledger = await ledgerOf(db, w.c);
        assert.equal(ledger.length, 1, 'one progression event, as before');
        assert.equal(ledger[0].xp_awarded, xp);
        assert.equal(ledger[0].counts_rhythm, true);
      }
    }
    assert.equal(answers.base.xp_awarded, xp, 'production awards this amount today');
    assert.deepEqual(answers.head, { ...answers.base, xp_reason: 'planned' });
  }
});

// ------------------------------------------------------------------ the loophole

test('same day: the completion is recorded with 0 XP and xp_reason same_day (production gave 25, or 60 yearly)', async () => {
  for (const yearly of [false, true]) {
    const today = await romeToday(head);
    const before = await couple(base);
    const was = await complete(base, before.f, await event(base, before, { date: today, yearly }), today);
    assert.equal(was.xp_awarded, yearly ? 60 : 25, 'the loophole exists in production');

    const w = await couple(head);
    const ev = await event(head, w, { date: today, yearly });
    const xmin = (await head.query('select xmin::text as x from public.couples where id = $1', [w.c])).rows[0].x;
    const r = await complete(head, w.f, ev, today);
    assert.deepEqual(r, { completed: true, already_completed: false, xp_awarded: 0, occurrence_date: today, xp_reason: 'same_day' });
    assert.equal(await xpOf(head, w.c), 0);
    assert.deepEqual((await completionsOf(head, w.c)).map((c) => [c.event_id, c.day, c.completed_by, c.xp_awarded]), [[ev, today, w.f, 0]], 'still recorded');
    assert.deepEqual((await activityOf(head, w.c)).map((a) => a.payload.xp), [0], 'activity row kept, with the real xp');
    assert.deepEqual(await ledgerOf(head, w.c), [], 'no progression event without points');
    assert.equal((await head.query('select xmin::text as x from public.couples where id = $1', [w.c])).rows[0].x, xmin, 'the couples row is not rewritten');
    const progression = (await as(head, w.f, 'select public.get_progression_v1() as r'))[0].r;
    assert.equal(progression.rhythm_today, false, 'a completion without points is not a Ritmo day');
    assert.equal(progression.total_xp, 0);
  }
});

test('occurrence before the creation date: recorded with 0 XP, xp_reason before_creation', async () => {
  const today = await romeToday(head);
  const day = shift(today, -10);
  const before = await couple(base);
  assert.equal((await complete(base, before.f, await event(base, before, { date: day }), day)).xp_awarded, 25);

  const w = await couple(head);
  const ev = await event(head, w, { date: day });
  assert.deepEqual(await complete(head, w.b, ev, day), { completed: true, already_completed: false, xp_awarded: 0, occurrence_date: day, xp_reason: 'before_creation' });
  assert.equal(await xpOf(head, w.c), 0);
  assert.deepEqual((await completionsOf(head, w.c)).map((c) => c.xp_awarded), [0]);
});

test('yearly backfill: every past year before the creation date is recorded with 0 XP (production paid 60 each)', async () => {
  const year = Number((await romeToday(head)).slice(0, 4));
  const years = [year - 4, year - 3, year - 2, year - 1];
  const days = years.map((y) => `${y}-03-15`);

  const before = await couple(base);
  const old = await event(base, before, { date: days[0], yearly: true });
  for (const day of days) await complete(base, before.f, old, day);
  assert.equal(await xpOf(base, before.c), 240, 'production: 60 XP for every past year, in one minute');

  const w = await couple(head);
  const ev = await event(head, w, { date: days[0], yearly: true });
  for (const day of days) {
    assert.deepEqual(await complete(head, w.f, ev, day), { completed: true, already_completed: false, xp_awarded: 0, occurrence_date: day, xp_reason: 'before_creation' }, day);
  }
  assert.equal(await xpOf(head, w.c), 0);
  assert.deepEqual((await completionsOf(head, w.c)).map((c) => [c.day, c.xp_awarded]), days.map((d) => [d, 0]), 'each occurrence is still recorded');
  assert.deepEqual(await ledgerOf(head, w.c), []);
  // A yearly event created years ago keeps earning for occurrences after its creation.
  const planned = await couple(head);
  const anniversary = await event(head, planned, { date: days[0], yearly: true, createdDaysAgo: 2000 });
  assert.equal((await complete(head, planned.f, anniversary, days[3])).xp_awarded, 60);
});

// ------------------------------------------------------------------ one event with points per day

test('daily limit: one completion with points per couple per Rome day, whoever completes; the next day earns again', async () => {
  const today = await romeToday(head);
  const w = await couple(head);
  const ids = [];
  for (let i = 0; i < 4; i += 1) ids.push(await event(head, w, { date: today, createdDaysAgo: 3, title: `Evento ${i + 1}` }));

  assert.equal((await complete(head, w.f, ids[0], today)).xp_reason, 'planned');
  const second = await complete(head, w.b, ids[1], today);
  assert.deepEqual(second, { completed: true, already_completed: false, xp_awarded: 0, occurrence_date: today, xp_reason: 'daily_limit' }, 'the partner\'s second event the same day earns nothing');
  assert.equal(await xpOf(head, w.c), 35);
  assert.deepEqual((await completionsOf(head, w.c)).map((c) => c.xp_awarded), [35, 0]);
  assert.deepEqual((await activityOf(head, w.c)).map((a) => a.payload.xp), [35, 0]);
  assert.equal((await ledgerOf(head, w.c)).length, 1);

  // Another couple is not limited by this one.
  const other = await couple(head);
  assert.equal((await complete(head, other.f, await event(head, other, { date: today, createdDaysAgo: 3 }), today)).xp_awarded, 35);

  // "Tomorrow": the completion with points now dates from 23:59:59 yesterday (Rome).
  await head.query(`update public.shared_event_completions
    set completed_at = (((now() at time zone 'Europe/Rome')::date)::timestamp - interval '1 second') at time zone 'Europe/Rome'
    where event_id = $1`, [ids[0]]);
  assert.deepEqual(await complete(head, w.f, ids[2], today), { completed: true, already_completed: false, xp_awarded: 35, occurrence_date: today, xp_reason: 'planned' }, 'a new day earns again');
  // A completion with points at 00:00:00 Rome already belongs to today.
  await head.query(`update public.shared_event_completions
    set completed_at = ((now() at time zone 'Europe/Rome')::date)::timestamp at time zone 'Europe/Rome'
    where event_id = $1`, [ids[2]]);
  assert.equal((await complete(head, w.b, ids[3], today)).xp_reason, 'daily_limit');
  assert.equal(await xpOf(head, w.c), 70);

  // Production today: no limit at all.
  const before = await couple(base);
  for (let i = 0; i < 3; i += 1) await complete(base, before.f, await event(base, before, { date: today, createdDaysAgo: 3 }), today);
  assert.equal(await xpOf(base, before.c), 105);
});

test('daily limit counts only completions that earned points', async () => {
  const today = await romeToday(head);
  const w = await couple(head);
  assert.equal((await complete(head, w.f, await event(head, w, { date: today }), today)).xp_reason, 'same_day');
  assert.equal((await complete(head, w.f, await event(head, w, { date: shift(today, -2) }), shift(today, -2))).xp_reason, 'before_creation');
  assert.deepEqual(await complete(head, w.b, await event(head, w, { date: today, createdDaysAgo: 9 }), today),
    { completed: true, already_completed: false, xp_awarded: 50, occurrence_date: today, xp_reason: 'planned' });
  // Same-day and backdated completions after the day's points are still same_day / before_creation.
  assert.equal((await complete(head, w.f, await event(head, w, { date: today }), today)).xp_reason, 'same_day');
  assert.equal(await xpOf(head, w.c), 50);
});

// ------------------------------------------------------------------ unchanged paths

test('already completed: the same answer as production, nothing awarded or logged twice', async () => {
  const today = await romeToday(head);
  const keys = {};
  for (const [name, db] of [['base', base], ['head', head]]) {
    const w = await couple(db);
    const ev = await event(db, w, { date: today, createdDaysAgo: 3 });
    const first = await complete(db, w.f, ev, today);
    const again = await complete(db, w.b, ev, today);
    keys[name] = Object.keys(again).sort();
    assert.equal(again.completed, true);
    assert.equal(again.already_completed, true);
    assert.equal(again.xp_awarded, first.xp_awarded);
    const stored = (await db.query("select to_json(completed_at) #>> '{}' as t from public.shared_event_completions where event_id = $1", [ev])).rows[0].t;
    assert.equal(new Date(again.completed_at).getTime(), new Date(stored).getTime());
    assert.equal(await xpOf(db, w.c), 35, `${name}: awarded once`);
    assert.equal((await activityOf(db, w.c)).length, 1);
    assert.equal((await ledgerOf(db, w.c)).length, 1);
  }
  assert.deepEqual(keys.head, keys.base);
  assert.deepEqual(keys.head, ['already_completed', 'completed', 'completed_at', 'xp_awarded']);

  // A completion without points answers the same way, with xp_awarded 0.
  const w = await couple(head);
  const ev = await event(head, w, { date: today });
  await complete(head, w.f, ev, today);
  const again = await complete(head, w.f, ev, today);
  assert.deepEqual(Object.keys(again).sort(), keys.base);
  assert.equal(again.xp_awarded, 0);
  assert.equal((await activityOf(head, w.c)).length, 1);
});

test('another couple still cannot complete it; validations and errors are production\'s', async () => {
  const today = await romeToday(head);
  for (const db of [base, head]) {
    const w = await couple(db);
    const x = await couple(db);
    const ev = await event(db, w, { date: today, createdDaysAgo: 3 });
    await assert.rejects(complete(db, x.f, ev, today), /Event not found/);
    await assert.rejects(complete(db, x.b, ev, today), /Event not found/);
    assert.deepEqual(await completionsOf(db, w.c), []);
    assert.equal(await xpOf(db, w.c), 0);
    assert.equal(await xpOf(db, x.c), 0);
    await assert.rejects(complete(db, null, ev, today), /Authentication required/);
    await assert.rejects(complete(db, w.f, ev, shift(today, 1)), /Event cannot be completed yet/);
    await assert.rejects(complete(db, w.f, ev, null), /Event cannot be completed yet/);
    await assert.rejects(complete(db, w.f, ev, shift(today, -1)), /Invalid occurrence date/);
    const yearly = await event(db, w, { date: shift(today, -400), yearly: true, createdDaysAgo: 500 });
    await assert.rejects(complete(db, w.f, yearly, shift(shift(today, -400), 1)), /Invalid recurring occurrence/);
    const lonely = randomUUID();
    await db.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false)', [lonely, `${lonely}@example.test`]);
    await db.query("insert into public.profiles (id, display_name, couple_id, role) values ($1, 'Solo', null, 'francesco')", [lonely]);
    await assert.rejects(complete(db, lonely, ev, today), /Profile not linked/);
    assert.deepEqual(await completionsOf(db, w.c), [], 'nothing was recorded by the refused calls');
  }
});

// ------------------------------------------------------------------ contract and grants

const fnInfo = async (db, signature) => (await db.query(`select p.prosecdef as definer, p.proconfig as config, p.proacl::text as acl,
    p.proargnames as args, pg_catalog.format_type(p.prorettype, null) as returns, p.oid::regprocedure::text as signature,
    has_function_privilege('anon', p.oid, 'execute') as anon,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
    has_function_privilege('service_role', p.oid, 'execute') as service
  from pg_proc p where p.oid = $1::regprocedure`, [signature])).rows[0];

test('contract: same signature and argument names, SECURITY DEFINER, pinned search_path, identical grants', async () => {
  for (const signature of ['public.complete_shared_event(uuid,date)', 'private.progression_event_trigger()']) {
    const before = await fnInfo(base, signature);
    const after = await fnInfo(head, signature);
    assert.equal(after.signature, before.signature);
    assert.deepEqual(after.args, before.args, 'PostgREST calls it by argument name');
    assert.equal(after.returns, before.returns);
    assert.equal(after.definer, true);
    assert.deepEqual(after.config, ['search_path=""']);
    assert.equal(after.acl, before.acl, `${signature}: ACL unchanged`);
    for (const role of ['anon', 'authenticated', 'service']) assert.equal(after[role], before[role], `${signature}: ${role}`);
  }
  const rpc = await fnInfo(head, 'public.complete_shared_event(uuid,date)');
  assert.deepEqual([rpc.anon, rpc.authenticated, rpc.service], [false, true, true]);
  assert.deepEqual(rpc.args, ['target_event_id', 'target_occurrence_date']);
  const trigger = await fnInfo(head, 'private.progression_event_trigger()');
  assert.deepEqual([trigger.anon, trigger.authenticated, trigger.service], [false, false, false]);
  const triggers = async (db) => (await db.query(`select tgname, pg_get_triggerdef(oid) as def from pg_trigger
    where tgrelid = 'public.shared_event_completions'::regclass and not tgisinternal order by tgname`)).rows;
  assert.deepEqual(await triggers(head), await triggers(base), 'the same triggers fire on completions');
});

test('events: created_at becomes the server\'s; the app\'s insert keeps working and RLS is unchanged', async () => {
  const today = await romeToday(head);
  const insert = (db, uid, w, extra = {}) => {
    const row = { couple_id: w.c, created_by: uid, title: 'Cena', event_date: today, event_time: null, location: null, note: null, recurs_yearly: false, ...extra };
    const cols = Object.keys(row);
    return as(db, uid, `insert into public.shared_events (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id, created_at`, Object.values(row));
  };
  // Production today: a direct API call can backdate the event and pass any "planned ahead" rule.
  const old = await couple(base);
  const [forged] = await insert(base, old.f, old, { created_at: '2000-01-01T12:00:00Z' });
  assert.equal(new Date(forged.created_at).getUTCFullYear(), 2000);

  const w = await couple(head);
  for (const column of ['created_at', 'updated_at', 'id']) {
    const value = column === 'id' ? randomUUID() : '2000-01-01T12:00:00Z';
    await assert.rejects(insert(head, w.f, w, { [column]: value }), (e) => e.code === '42501', `${column} is not client-writable`);
  }
  const [made] = await insert(head, w.f, w);
  assert.ok(Math.abs(new Date(made.created_at).getTime() - Date.now()) < 60000, 'created_at is the insert time');
  assert.equal((await complete(head, w.f, made.id, today)).xp_reason, 'same_day', 'so an event made today cannot be passed off as planned');
  // RLS still decides the couple and the author.
  const x = await couple(head);
  await assert.rejects(insert(head, x.f, w), /row-level security/);
  await assert.rejects(insert(head, w.f, w, { created_by: w.b }), /row-level security/);
  // anon never had an insert policy; now it has no insert privilege either.
  await head.exec('begin');
  try {
    await head.exec('set local role anon');
    await assert.rejects(head.query(`insert into public.shared_events (couple_id, created_by, title, event_date) values ($1, $2, 'x', $3)`, [w.c, w.f, today]),
      (e) => e.code === '42501' && /permission denied/.test(e.message));
  } finally {
    await head.exec('rollback');
  }
  // Everything else about the table is unchanged.
  const privileges = async (db) => (await db.query(`select r.role, c.column_name,
      has_column_privilege(r.role, 'public.shared_events', c.column_name, 'SELECT') as s,
      has_column_privilege(r.role, 'public.shared_events', c.column_name, 'UPDATE') as u,
      has_column_privilege(r.role, 'public.shared_events', c.column_name, 'INSERT') as i
    from (values ('authenticated'), ('anon'), ('service_role')) r(role)
    cross join information_schema.columns c where c.table_schema = 'public' and c.table_name = 'shared_events'
    order by r.role, c.ordinal_position`)).rows;
  const before = await privileges(base);
  const after = await privileges(head);
  const insertable = ['couple_id', 'created_by', 'title', 'event_date', 'event_time', 'location', 'note', 'recurs_yearly'];
  for (let i = 0; i < before.length; i += 1) {
    const [b, a] = [before[i], after[i]];
    assert.equal(a.s, b.s, `${a.role}.${a.column_name} SELECT`);
    assert.equal(a.u, b.u, `${a.role}.${a.column_name} UPDATE`);
    const expected = a.role === 'service_role' ? b.i : a.role === 'authenticated' && insertable.includes(a.column_name);
    assert.equal(a.i, expected, `${a.role}.${a.column_name} INSERT`);
  }
  const table = async (db, priv) => (await db.query(`select has_table_privilege('authenticated', 'public.shared_events', $1) as t`, [priv])).rows[0].t;
  for (const priv of ['SELECT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) assert.equal(await table(head, priv), await table(base, priv), priv);
});

test('events: the app inserts exactly the columns clients may still write', () => {
  const events = read('events.js');
  // Property names, shorthand ({title}) included; no value contains a comma.
  const names = (list) => list.split(',').map((part) => part.split(':')[0].trim());
  const keys = names(events.match(/const payload=\{([^}]*)\}/)[1]);
  const extra = names(events.match(/from\('shared_events'\)\.insert\(\{\.\.\.payload,([^}]*)\}\)/)[1]);
  const granted = GUARD.match(/grant insert \(([^)]*)\)\s+on table public\.shared_events to authenticated;/)[1].split(/,\s*/);
  assert.deepEqual([...keys, ...extra].sort(), [...granted].sort());
});

// ------------------------------------------------------------------ migration hygiene

test('migration: newest, forward-only, idempotent, and leaves existing rows untouched', async () => {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  assert.equal(files[files.length - 1], FILE, 'created after every existing migration');
  assert.match(FILE, /^\d{14}_[a-z0-9_]+\.sql$/);
  const outside = GUARD.replace(/\$function\$[\s\S]*?\$function\$/g, '').replace(/--.*$/gm, '');
  assert.doesNotMatch(outside, /\b(delete|truncate|drop|alter|insert\s+into|update\s+public|create\s+(table|policy|trigger))\b/i, 'no data or shape change outside the two functions');
  assert.equal((outside.match(/create or replace function/gi) || []).length, 2);

  const db = await rebuild();
  try {
    // A couple with history written by today's production function.
    const today = await romeToday(db);
    const w = await couple(db);
    await complete(db, w.f, await event(db, w, { date: today }), today);
    await complete(db, w.b, await event(db, w, { date: shift(today, -5), createdDaysAgo: 30 }), shift(today, -5));
    const snapshot = async () => ({
      xp: await xpOf(db, w.c),
      completions: await completionsOf(db, w.c),
      activity: await activityOf(db, w.c),
      ledger: await ledgerOf(db, w.c),
      events: (await db.query('select id, created_at, updated_at from public.shared_events where couple_id = $1 order by id', [w.c])).rows,
    });
    const shape = async () => (await db.query(`select
        (select pg_get_functiondef('public.complete_shared_event(uuid,date)'::regprocedure)) as rpc,
        (select pg_get_functiondef('private.progression_event_trigger()'::regprocedure)) as trigger,
        (select proacl::text from pg_proc where oid = 'public.complete_shared_event(uuid,date)'::regprocedure) as rpc_acl,
        (select relacl::text from pg_class where oid = 'public.shared_events'::regclass) as table_acl,
        (select string_agg(attname || '=' || coalesce(attacl::text, ''), ',' order by attnum) from pg_attribute
          where attrelid = 'public.shared_events'::regclass and attnum > 0) as column_acl`)).rows[0];
    const before = await snapshot();
    assert.equal(before.xp, 75, 'production paid 25 (same day) + 50 (planned)');
    await db.exec(GUARD);
    const once = await shape();
    assert.deepEqual(await snapshot(), before, 'no existing row is rewritten');
    await db.exec(GUARD);
    assert.deepEqual(await shape(), once, 're-running converges to the same state');
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.close();
  }
});
