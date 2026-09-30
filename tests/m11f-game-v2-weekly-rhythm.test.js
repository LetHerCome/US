// M11F — Game V2 weekly rhythm against the real migrations: 1 Per voi + 2
// free-choice rounds per couple per Europe/Rome week, derived from immutable
// sessions, enforced by start_game_round. PGlite for the domain, a real
// PostgreSQL server for the two-connection races. Nothing touches production.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const h = require('./helpers/game-v2-db');
const { SKIP, CAN_RUN, startServer, asUser } = require('./helpers/game-v2-pg');

const { createDb, couple, setClock, as, rpc, id, playSide, startRound, createWeekly } = h;
const MIGRATION = path.join(h.ROOT, 'supabase/migrations/20260930172615_m11f_game_v2_weekly_rhythm.sql');
const WED = '2026-09-30T10:00:00Z'; // week of Monday 2026-09-28
const SUN_2359 = '2026-10-04T21:59:59Z'; // Sunday 23:59:59 Rome (CEST)
const MON_0000 = '2026-10-04T22:00:00Z'; // Monday 00:00 Rome
const plusDays = (iso, d) => new Date(Date.parse(iso) + d * 864e5).toISOString();

async function world(clock = WED) {
  const db = await createDb();
  const p = await couple(db);
  await setClock(db, clock);
  return { db, ...p };
}
const home = (db, uid) => as(db, uid, () => rpc(db, 'select public.get_game_v2_home() r'));
const count = async (db, c) => (await db.query(`select count(*)::int n from public.game_sessions where couple_id = $1 and engine_version = 2`, [c])).rows[0].n;
const playBoth = async (db, f, b, sid) => { await playSide(db, f, sid); await playSide(db, b, sid); };

test('M11F migration: next ledger version, additive only, applied migrations untouched', () => {
  const files = fs.readdirSync(path.join(h.ROOT, 'supabase/migrations')).sort();
  assert.equal(files[files.length - 1], path.basename(MIGRATION), 'M11F is the newest migration');
  assert.ok(files.indexOf(path.basename(MIGRATION)) > files.indexOf('20260930153755_m11d_game_v2_push.sql'));
  const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from|alter\s+table|create\s+table|update\s+public\.)/i, 'no schema or row change');
  for (const [, name, header, body] of sql.matchAll(/create (?:or replace )?function ([\w.]+)\(([\s\S]*?)\$\$([\s\S]*?)\$\$/g)) {
    assert.match(header, /set search_path = ''/, `${name} pins search_path`);
    if (/\bstable\b/.test(header)) assert.doesNotMatch(body, /\bfor\s+(share|update)\b|pg_advisory/i, `${name} is STABLE and must not lock`);
  }
  assert.match(sql, /revoke all on function private\.game_v2_week_usage\(uuid, timestamptz\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.start_game_round\(text, uuid\) to authenticated/);
  // The week is the existing Game V2 week, never a second definition.
  assert.match(sql, /private\.game_v2_week_start\(at_time\)/);
  assert.doesNotMatch(sql, /date_trunc|isodow|extract\s*\(\s*week/i);
});

test('M11F allowance: 1 Per voi + 2 free-choice rounds = 3 per week, beyond is rejected server-side', async () => {
  const { db, c, f, b } = await world();
  const empty = (await home(db, f)).allowance;
  assert.deepEqual([empty.used, empty.limit, empty.per_voi_limit, empty.free_limit], [0, 3, 1, 2]);
  assert.equal(empty.week_start, '2026-09-28');
  assert.equal(empty.resets_on, '2026-10-05');

  const pv = await startRound(db, f, 'per_voi');
  await playBoth(db, f, b, pv.id);
  await assert.rejects(startRound(db, b, 'per_voi'), (e) => e.code === 'P0001' && /weekly per voi played/.test(e.message) && /resets_on=2026-10-05/.test(e.detail));

  const q = await startRound(db, b, 'quanto_mi_conosci');
  await playBoth(db, f, b, q.id);
  const r = await startRound(db, f, 'ridete');
  await playBoth(db, f, b, r.id);
  for (const fam of ['scopritevi', 'ridete', 'e_se']) {
    await assert.rejects(startRound(db, fam === 'ridete' ? b : f, fam), (e) => e.code === 'P0001' && /weekly allowance exhausted/.test(e.message), fam);
  }
  await assert.rejects(startRound(db, f, 'per_voi'), /weekly per voi played/);
  assert.equal(await count(db, c), 3, 'never more than 3 new rounds in a week');
  const spent = (await home(db, b)).allowance;
  assert.deepEqual([spent.used, spent.per_voi_available, spent.free_available], [3, false, false]);
  assert.deepEqual(Object.keys(spent.families).sort(), ['per_voi', 'quanto_mi_conosci', 'ridete']);
  assert.equal(spent.families.ridete.session_id, r.id);
});

test('M11F allowance: free choice may repeat a mode; Per voi and free slots are independent', async () => {
  const { db, c, f, b } = await world();
  const one = await startRound(db, f, 'ridete');
  await playBoth(db, f, b, one.id);
  const two = await startRound(db, b, 'ridete');
  assert.notEqual(two.id, one.id, 'a second round of the same mode spends the second free slot');
  await playBoth(db, f, b, two.id);
  await assert.rejects(startRound(db, f, 'rivivete'), /weekly allowance exhausted/);
  const pv = await startRound(db, b, 'per_voi');
  assert.equal(pv.items.length, 5, 'free slots never consume the Per voi slot');
  assert.equal(await count(db, c), 3);
});

test('M11F week authority: Sunday 23:59 vs Monday 00:00 Europe/Rome, DST-safe, server clock only', async () => {
  const { db, f, b } = await world(SUN_2359);
  const pv = await startRound(db, f, 'per_voi');
  await playBoth(db, f, b, pv.id);
  await assert.rejects(startRound(db, f, 'per_voi'), /weekly per voi played/, 'still the same week at 23:59:59');
  await setClock(db, MON_0000);
  const allowance = (await home(db, f)).allowance;
  assert.equal(allowance.week_start, '2026-10-05');
  assert.equal(allowance.used, 0, 'the allowance resets at Monday 00:00 Rome');
  const mondayRound = await startRound(db, b, 'per_voi');
  assert.equal(mondayRound.resumed, false);
  await playBoth(db, f, b, mondayRound.id);

  // Autumn DST: the 169-hour week of Monday 2026-10-19 ends 2026-10-25T23:00Z.
  await setClock(db, '2026-10-25T22:59:59Z');
  const lateSunday = await startRound(db, f, 'per_voi');
  await playBoth(db, f, b, lateSunday.id);
  await assert.rejects(startRound(db, f, 'per_voi'), /weekly per voi played/);
  await setClock(db, '2026-10-25T23:00:00Z');
  assert.equal((await home(db, f)).allowance.week_start, '2026-10-26');
  assert.equal((await startRound(db, f, 'per_voi')).resumed, false);
  // Spring DST: the 167-hour week ending Monday 2027-03-29 00:00 Rome (22:00Z).
  await setClock(db, '2027-03-28T21:59:59Z');
  assert.equal((await home(db, f)).allowance.week_start, '2027-03-22');
  await setClock(db, '2027-03-28T22:00:00Z');
  assert.equal((await home(db, f)).allowance.week_start, '2027-03-29');

  // The client cannot move the week: started_at is the server clock, whatever
  // the database now() says.
  const rows = (await db.query(`select started_at from public.game_sessions order by started_at`)).rows;
  assert.equal(new Date(rows[0].started_at).toISOString(), new Date(SUN_2359).toISOString());
});

test('M11F pending: a round from last week survives Monday, stays playable and spends nothing', async () => {
  const { db, c, f, b } = await world('2026-10-04T18:00:00Z'); // Sunday evening
  const ridete = await startRound(db, f, 'ridete');
  await playSide(db, f, ridete.id);
  await setClock(db, plusDays(MON_0000, 1)); // Tuesday of the new week
  const bHome = await home(db, b);
  assert.ok(bHome.open_rounds.some((r) => r.id === ridete.id), 'still listed as open');
  assert.equal(bHome.allowance.used, 0);
  // Resuming the same mode returns the old round and spends nothing.
  const resumed = await startRound(db, b, 'ridete');
  assert.equal(resumed.id, ridete.id);
  assert.equal(resumed.resumed, true);
  const done = await playSide(db, b, ridete.id);
  assert.equal(done.reveal_ready, true, 'Bea finishes the old round after the boundary');
  const after = (await home(db, f)).allowance;
  assert.deepEqual([after.used, after.free_available, after.per_voi_available], [0, true, true]);
  assert.equal(await count(db, c), 1, 'nothing was deleted or recreated');
});

test('M11F pending: a Per voi left open last week is resumed, then this week still has its own', async () => {
  const { db, f, b } = await world('2026-10-04T18:00:00Z');
  const old = await startRound(db, f, 'per_voi');
  await setClock(db, plusDays(MON_0000, 2));
  const resumed = await startRound(db, b, 'per_voi');
  assert.equal(resumed.id, old.id, 'last week\'s Per voi comes first');
  await playBoth(db, f, b, old.id);
  const fresh = await startRound(db, f, 'per_voi');
  assert.notEqual(fresh.id, old.id, 'the new week\'s Per voi is still available');
});

test('M11F no pending pile: a new round waits while three rounds are open; resuming is always allowed', async () => {
  const { db, c, f, b } = await world('2026-10-01T10:00:00Z');
  const a = await startRound(db, f, 'per_voi');
  const x = await startRound(db, f, 'ridete');
  const y = await startRound(db, f, 'e_se');
  await setClock(db, plusDays(MON_0000, 1)); // new week, fresh allowance
  await assert.rejects(startRound(db, b, 'scopritevi'), (e) => e.code === 'P0001' && /too many open rounds/.test(e.message));
  assert.equal((await startRound(db, b, 'ridete')).id, x.id, 'open modes stay resumable');
  await playBoth(db, f, b, y.id);
  const next = await startRound(db, b, 'scopritevi');
  assert.equal(next.resumed, false, 'finishing one frees room');
  assert.equal(await count(db, c), 4);
  assert.ok(a.id && next.id);
});

test('M11F idempotency: a repeated request id returns the original round, even after the budget is spent or Monday', async () => {
  const { db, c, f, b } = await world();
  const rid = id();
  const first = await startRound(db, f, 'confrontatevi', rid);
  const again = await startRound(db, f, 'confrontatevi', rid);
  assert.equal(again.id, first.id);
  assert.equal(again.resumed, true);
  await playBoth(db, f, b, first.id);
  await playBoth(db, f, b, (await startRound(db, b, 'ridete')).id);
  await assert.rejects(startRound(db, f, 'scopritevi'), /weekly allowance exhausted/);
  assert.equal((await startRound(db, f, 'confrontatevi', rid)).id, first.id, 'replay after the budget is spent');
  await setClock(db, plusDays(MON_0000, 3));
  assert.equal((await startRound(db, f, 'confrontatevi', rid)).id, first.id, 'replay after the week changed');
  assert.equal(await count(db, c), 2);
  // Double Per voi tap: one canonical round.
  const p1 = await startRound(db, f, 'per_voi');
  const p2 = await startRound(db, b, 'per_voi');
  assert.equal(p1.id, p2.id);
});

test('M11F memory: the weekly question spends nothing; history, cooldowns and snapshots survive the week', async () => {
  const { db, c, f, b } = await world();
  const weekly = await createWeekly(db, f, { text: 'Qual è il posto dove ti senti più a casa con me?' });
  assert.equal((await home(db, f)).allowance.used, 0, 'the weekly question is not a round');
  const pv = await startRound(db, f, 'per_voi');
  const snapshot = pv.items.map((i) => i.question_text);
  await playBoth(db, f, b, pv.id);
  const before = (await db.query(`select count(*)::int n from public.game_session_answers`)).rows[0].n;
  await setClock(db, plusDays(WED, 7));
  const next = await startRound(db, b, 'per_voi');
  // Cooldown history is not reset: nothing from last week's round repeats.
  assert.ok(!next.items.some((i) => snapshot.includes(i.question_text)), 'anti-repeat still sees last week');
  assert.equal((await db.query(`select count(*)::int n from public.game_session_answers`)).rows[0].n, before, 'answers kept');
  const old = await as(db, f, () => rpc(db, 'select public.get_game_session($1::uuid) r', [pv.id]));
  assert.deepEqual(old.items.map((i) => i.question_text), snapshot, 'snapshots immutable');
  assert.equal(old.reveal_ready, true);
  const questions = await as(db, f, () => rpc(db, 'select public.list_couple_questions() r'));
  assert.ok(questions.some((q) => q.id === weekly.question_id), 'couple questions remain');
  assert.equal(await count(db, c), 2);
});

test('M11F home: Per voi reads "played" until Monday, then idle again', async () => {
  const { db, f, b } = await world();
  const state = async (uid) => (await home(db, uid)).per_voi;
  const pv = await startRound(db, f, 'per_voi');
  await playBoth(db, f, b, pv.id);
  assert.equal((await state(f)).state, 'reveal_ready');
  await as(db, f, () => rpc(db, 'select public.mark_game_session_reveal_seen($1::uuid) r', [pv.id]));
  const played = await state(f);
  assert.deepEqual([played.state, played.session_id, played.resets_on], ['played', pv.id, '2026-10-05']);
  assert.equal((await state(b)).state, 'reveal_ready', 'personal: Bea has not seen it yet');
  await setClock(db, MON_0000);
  assert.equal((await state(f)).state, 'idle');
  assert.doesNotMatch(JSON.stringify(await home(db, f)), /answer_text|answer_index/);
});

test('M11F security: couple and role come from auth.uid(); no argument can move or bypass the budget', async () => {
  const { db, c, f, b } = await world();
  const other = await couple(db);
  await playBoth(db, f, b, (await startRound(db, f, 'per_voi')).id);
  // Another couple's budget is independent and invisible.
  assert.equal((await home(db, other.f)).allowance.used, 0);
  assert.equal((await startRound(db, other.f, 'per_voi')).resumed, false);
  // Only two arguments exist: mode and request id. No couple, role or date.
  const args = (await db.query(`select pg_get_function_identity_arguments('public.start_game_round(text,uuid)'::regprocedure) a`)).rows[0].a;
  assert.equal(args, 'target_family text, request_id uuid');
  // Private helpers are not callable by clients.
  await assert.rejects(as(db, f, () => rpc(db, `select private.game_v2_week_usage('${c}'::uuid, now()) r`)), /permission denied/);
  // Fresh request ids per tap still cannot open a second Per voi.
  for (let i = 0; i < 3; i += 1) await assert.rejects(startRound(db, i % 2 ? b : f, 'per_voi', id()), /weekly per voi played/);
  // A forged JWT subject that is not a couple member gets nothing.
  await assert.rejects(startRound(db, id(), 'ridete'), /couple membership required|authentication required|profile/);
  assert.equal(await count(db, c), 1);
});

// ------------------------------------------------------------ real PostgreSQL

let pg;
test.before(() => {
  if (!CAN_RUN) return;
  pg = startServer(54361);
  pg.sql(`create or replace function private.game_v2_clock() returns timestamptz language sql stable set search_path = '' as $$ select '2026-09-30T10:00:00Z'::timestamptz $$`);
});
test.after(() => pg?.stop());

const uuid = () => crypto.randomUUID();
function pgCouple() {
  const c = uuid(); const f = uuid(); const b = uuid();
  pg.sql(`insert into public.couples(id) values ('${c}'); insert into public.profiles(id, couple_id, role) values ('${f}','${c}','francesco'),('${b}','${c}','beatrice')`);
  return { c, f, b };
}
const tag = (label, out) => [...out.matchAll(new RegExp(`${label}:([^\\n]*)`, 'g'))].map((m) => m[1]);

test('M11F race: both partners start different modes with one free slot left -> exactly one new round', { skip: SKIP }, async () => {
  const { c, f, b } = pgCouple();
  pg.sql(`${asUser(f)} select public.start_game_round('ridete', '${uuid()}');`);
  const families = ['scopritevi', 'confrontatevi', 'rivivete', 'e_se', 'quanto_mi_conosci', 'scopritevi', 'e_se', 'rivivete'];
  const sessions = families.map((fam, i) => {
    const s = pg.session();
    s.send(`${asUser(i % 2 ? b : f)} select 'S:' || (public.start_game_round('${fam}', '${uuid()}')->>'id');`);
    return s;
  });
  const results = await Promise.all(sessions.map((s) => s.end()));
  const created = new Set(results.flatMap((r) => tag('S', r.out)));
  const errors = results.map((r) => r.err).join('');
  assert.ok(created.size >= 1, 'someone got the last slot');
  assert.match(errors, /weekly allowance exhausted/);
  assert.doesNotMatch(errors, /deadlock/i);
  assert.equal(pg.sql(`select count(*) from public.game_sessions where couple_id = '${c}' and game_family <> 'per_voi'`), '2', 'free rounds never exceed 2');
});

test('M11F race: a burst of Per voi taps and mode taps never exceeds 1 + 2', { skip: SKIP }, async () => {
  const { c, f, b } = pgCouple();
  const plan = ['per_voi', 'ridete', 'per_voi', 'e_se', 'rivivete', 'per_voi', 'scopritevi', 'confrontatevi', 'per_voi', 'ridete'];
  const sessions = plan.map((fam, i) => {
    const s = pg.session();
    s.send(`${asUser(i % 2 ? b : f)} select 'S:' || (public.start_game_round('${fam}', '${uuid()}')->>'id');`);
    return s;
  });
  const results = await Promise.all(sessions.map((s) => s.end()));
  assert.doesNotMatch(results.map((r) => r.err).join(''), /deadlock/i);
  assert.equal(pg.sql(`select count(*) from public.game_sessions where couple_id = '${c}' and game_family = 'per_voi'`), '1');
  assert.equal(pg.sql(`select count(*) from public.game_sessions where couple_id = '${c}' and game_family <> 'per_voi'`), '2');
  const perVoiIds = new Set(results.flatMap((r, i) => (plan[i] === 'per_voi' ? tag('S', r.out) : [])));
  assert.equal(perVoiIds.size, 1, 'every Per voi tap resolves to the one canonical round');
});

test('M11F race: get_game_v2_home with the allowance runs READ ONLY', { skip: SKIP }, () => {
  const { f } = pgCouple();
  const out = pg.sql(`${asUser(f)} begin read only; select 'OK:' || (public.get_game_v2_home()->'allowance'->>'limit'); rollback;`);
  assert.match(out, /OK:3/);
});
