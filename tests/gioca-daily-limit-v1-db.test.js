// Gioca: una partita al giorno (D4 del 28/10/2026, docs/missions/plus-v1-staging.md §1).
// The couple starts one new round per Europe/Rome day, of any mode, Per voi
// and Questo o quello included: 7 a week instead of 1 Per voi + 2 free. Open
// rounds are resumed for free and at most 3 stay open. Full repo schema in
// disposable PGlite; nothing here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_gioca_daily_limit_v1\.sql$/.test(f));

// Thursday 5 November 2026, CET (UTC+1): the Rome day ends at 23:00Z.
const THU = '2026-11-05T09:00:00Z';
const THU_2359 = '2026-11-05T22:59:59Z';
const FRI_0000 = '2026-11-05T23:00:00Z';
const day = (n) => new Date(Date.parse(THU) + n * 864e5).toISOString();

let db;
const setClock = (iso) => db.exec(`create or replace function private.game_v2_clock() returns timestamptz
  language sql stable set search_path = '' as $$ select '${iso}'::timestamptz $$;`);
const start = (user, family, rid = randomUUID()) => h.as(db, user, 'select public.start_game_round($1::text,$2::uuid) r', [family, rid]);
const startSwipe = (user) => h.as(db, user, 'select public.start_swipe_round($1::uuid) r', [randomUUID()]);
const home = (user) => h.as(db, user, 'select public.get_game_v2_home() r');
const rounds = async () => (await db.query(`select count(*)::int n from public.game_sessions where couple_id = $1 and engine_version = 2`, [h.A])).rows[0].n;
const refusedUntil = (resets) => (e) => e.code === 'P0001' && /allowance exhausted|per voi played/.test(e.message) && e.detail === `resets_on=${resets}`;
async function playSide(user, sid) {
  const state = await h.as(db, user, 'select public.get_game_session($1::uuid) r', [sid]);
  for (const item of state.items) {
    const choice = item.answer_kind === 'choice';
    await h.as(db, user, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
      [sid, item.id, choice ? null : `Risposta ${item.position}`, choice ? 0 : null]);
  }
  return h.as(db, user, 'select public.complete_game_session_side($1::uuid) r', [sid]);
}
const playBoth = async (sid) => { await playSide(h.F, sid); await playSide(h.B, sid); };

test.beforeEach(async () => { db = await h.database(); await setClock(THU); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed in the cutoff and only redefines the private budget', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_gioca_daily_limit_v1.sql');
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8').replace(/--[^\n]*/g, '');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from|alter\s+table|create\s+table|update\s+public\.)/i, 'no schema or row change');
  assert.match(sql, /revoke all on function private\.game_v2_week_usage\(uuid, timestamptz\) from public, anon, authenticated, service_role;/);
});

test('one new round a day, of any mode: a second one the same Rome day waits until tomorrow', async () => {
  const allowance = (await home(h.F)).allowance;
  assert.deepEqual([allowance.used, allowance.limit, allowance.period, allowance.resets_on], [0, 1, 'day', '2026-11-06']);

  const first = await start(h.F, 'ridete');
  await playBoth(first.id);
  for (const family of ['scopritevi', 'ridete', 'per_voi']) {
    await assert.rejects(start(h.B, family), refusedUntil('2026-11-06'), family);
  }
  await assert.rejects(startSwipe(h.F), refusedUntil('2026-11-06'), 'Questo o quello counts too');
  const spent = (await home(h.B)).allowance;
  assert.deepEqual([spent.used, spent.limit, spent.free_available, spent.per_voi_available], [1, 1, false, false]);
  assert.equal(await rounds(), 1);
});

test('Per voi spends the day too, and the day after anything is open again', async () => {
  const pv = await start(h.F, 'per_voi');
  await playBoth(pv.id);
  await assert.rejects(start(h.B, 'confrontatevi'), refusedUntil('2026-11-06'));
  await setClock(day(1));
  assert.equal((await start(h.B, 'per_voi')).resumed, false, 'a new Per voi the next day');
});

test('the day turns at midnight Europe/Rome, on the server clock', async () => {
  await setClock(THU_2359);
  await playBoth((await start(h.F, 'ridete')).id);
  await assert.rejects(start(h.F, 'rivivete'), refusedUntil('2026-11-06'), 'still Thursday at 23:59:59 Rome');
  await setClock(FRI_0000);
  const allowance = (await home(h.F)).allowance;
  assert.deepEqual([allowance.used, allowance.resets_on], [0, '2026-11-07']);
  assert.equal((await start(h.F, 'rivivete')).resumed, false);
});

test('seven rounds in seven days: more than the old weekly three', async () => {
  const families = ['per_voi', 'ridete', 'scopritevi', 'confrontatevi', 'rivivete', 'quanto_mi_conosci', 'ridete'];
  for (const [i, family] of families.entries()) {
    await setClock(day(i));
    await playBoth((await start(i % 2 ? h.B : h.F, family)).id);
  }
  assert.equal(await rounds(), 7);
});

test('resuming an open round spends nothing, also from yesterday; replays return the same round', async () => {
  const rid = randomUUID();
  const open = await start(h.F, 'ridete', rid);
  assert.equal((await start(h.B, 'ridete')).id, open.id, 'same mode resumes today');
  assert.equal((await start(h.F, 'ridete', rid)).id, open.id, 'replayed request id');
  await setClock(day(1));
  const resumed = await start(h.B, 'ridete');
  assert.deepEqual([resumed.id, resumed.resumed], [open.id, true]);
  assert.equal((await home(h.F)).allowance.used, 0, 'yesterday\'s round does not spend today');
  await playBoth(open.id);
  assert.equal((await start(h.F, 'scopritevi')).resumed, false, 'today\'s round is still there');
});

test('never more than three open rounds', async () => {
  await start(h.F, 'ridete');
  await setClock(day(1)); await start(h.F, 'scopritevi');
  await setClock(day(2)); await start(h.F, 'rivivete');
  await setClock(day(3));
  await assert.rejects(start(h.B, 'confrontatevi'), (e) => e.code === 'P0001' && /too many open rounds/.test(e.message));
});

test('each couple has its own day', async () => {
  const other = await h.create(db, h.U1, 'Other', '2025-06-01');
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
  await playBoth((await start(h.F, 'ridete')).id);
  assert.equal((await home(h.U1)).allowance.used, 0);
  assert.equal((await start(h.U2, 'ridete')).resumed, false);
  assert.ok(other.couple_id);
});
