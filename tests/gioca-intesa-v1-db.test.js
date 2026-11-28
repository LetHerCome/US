// Gioca più piena (grill del 27/11/2026, D3, D4, D18): get_game_intesa_v1,
// the couple's «intesa» over the last 20 comparable answers, the Rome days of
// this week with a round finished by both, and per game mode the last time
// and the same answers. Counts and dates only. Full repo schema in disposable
// PGlite; nothing here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_gioca_intesa_v1\.sql$/.test(f));

// Thursday 5 November 2026, CET (UTC+1).
const THU = '2026-11-05T09:00:00Z';
const day = (n) => new Date(Date.parse(THU) + n * 864e5).toISOString();

let db;
const setClock = (iso) => db.exec(`create or replace function private.game_v2_clock() returns timestamptz
  language sql stable set search_path = '' as $$ select '${iso}'::timestamptz $$;`);
const intesa = (user) => h.as(db, user, 'select public.get_game_intesa_v1() r');
const startSwipe = (user) => h.as(db, user, 'select public.start_swipe_round($1::uuid) r', [randomUUID()]);
const start = (user, family) => h.as(db, user, 'select public.start_game_round($1::text,$2::uuid) r', [family, randomUUID()]);
// pick(item, i) -> the option index this side chooses (choice items).
async function playSide(user, sid, pick = () => 0) {
  const state = await h.as(db, user, 'select public.get_game_session($1::uuid) r', [sid]);
  for (const [i, item] of state.items.entries()) {
    const choice = item.answer_kind === 'choice';
    await h.as(db, user, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
      [sid, item.id, choice ? null : `Risposta segreta ${item.position}`, choice ? pick(item, i) : null]);
  }
  return h.as(db, user, 'select public.complete_game_session_side($1::uuid) r', [sid]);
}
// complete_game_session_side stamps the real now(); the round is pinned to
// the fake clock so the days and the order follow the scenario.
const playBoth = async (sid, pickF, pickB) => {
  await playSide(h.F, sid, pickF); await playSide(h.B, sid, pickB);
  await db.query('update public.game_sessions set completed_at = private.game_v2_clock() where id = $1', [sid]);
};
const comparableOf = async (sid) => (await db.query(
  "select count(*)::int n from public.game_session_items where session_id = $1 and answer_kind = 'choice' and mechanic = 'reciprocal'", [sid])).rows[0].n;

test.beforeEach(async () => { db = await h.database(); await setClock(THU); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed, defines one read-only SECURITY DEFINER function for authenticated', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_gioca_intesa_v1.sql');
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8').replace(/--[^\n]*/g, '');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from|alter\s+table|create\s+table|insert\s+into|update\s+public\.)/i, 'no schema or row change');
  assert.doesNotMatch(sql, /answer_text/, 'never reads an answer text');
  assert.match(sql, /security definer\s+set search_path to ''/);
  assert.match(sql, /revoke all on function public\.get_game_intesa_v1\(\) from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant execute on function public\.get_game_intesa_v1\(\) to authenticated;/);
  const fn = (await db.query("select p.prosecdef, p.provolatile, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_game_intesa_v1'")).rows[0];
  assert.equal(fn.prosecdef, true);
  assert.equal(fn.provolatile, 's');
  assert.deepEqual(fn.proconfig, ['search_path=""']);
});

test('only a couple member can read it; anon and people without a couple are refused', async () => {
  await assert.rejects(h.as(db, h.ANON, 'select public.get_game_intesa_v1() r', [], 'anon'), /permission denied/);
  await assert.rejects(intesa(h.U1), (e) => e.code === '42501');
  await assert.rejects(intesa(null), (e) => e.code === '42501');
});

test('a new couple: nothing compared, no days, no games', async () => {
  const r = await intesa(h.F);
  assert.deepEqual(r, { compared: 0, same: 0, week_start: '2026-11-02', days: [], families: {} });
});

test('a finished Questo o quello: the same answers, the day, the mode; never a text; the same for both phones', async () => {
  const round = await startSwipe(h.F);
  const n = await comparableOf(round.id);
  assert.ok(n >= 6, `swipe rounds are comparable (${n})`);
  await playBoth(round.id, () => 0, (item, i) => (i < 5 ? 0 : 1));
  const f = await intesa(h.F);
  assert.deepEqual([f.compared, f.same], [n, 5]);
  assert.deepEqual(f.days, ['2026-11-05']);
  assert.deepEqual([f.families.swipe.compared, f.families.swipe.same], [n, 5]);
  assert.ok(Date.parse(f.families.swipe.last_at) > 0);
  const b = await intesa(h.B);
  assert.deepEqual([b.compared, b.same, b.days], [f.compared, f.same, f.days], 'symmetric');
  assert.doesNotMatch(JSON.stringify(f), /Risposta/);
});

test('an open round does not count; only rounds finished by both', async () => {
  const round = await startSwipe(h.F);
  await playSide(h.F, round.id, () => 0);
  const r = await intesa(h.B);
  assert.deepEqual([r.compared, r.same, r.days, r.families], [0, 0, [], {}]);
});

test('only the last 20 comparable answers, newest first', async () => {
  const rounds = [];
  for (const [i, same] of [true, false, false].entries()) {
    await setClock(day(i));
    const round = await startSwipe(i % 2 ? h.B : h.F);
    await playBoth(round.id, () => 0, () => (same ? 0 : 1));
    rounds.push({ id: round.id, n: await comparableOf(round.id) });
  }
  const r = await intesa(h.F);
  const newer = rounds[1].n + rounds[2].n;
  assert.equal(r.compared, Math.min(20, rounds[0].n + newer));
  assert.equal(r.same, Math.max(0, Math.min(rounds[0].n, 20 - newer)), 'the oldest round fills what is left of the twenty');
  assert.equal(r.families.swipe.compared, Math.min(20, rounds[0].n + newer));
});

test('Quanto mi conosci? predictions and free answers stay out of the intesa', async () => {
  const round = await start(h.F, 'quanto_mi_conosci');
  const n = await comparableOf(round.id);
  await playBoth(round.id, () => 0, () => 0);
  const r = await intesa(h.F);
  assert.equal(r.compared, n, 'only reciprocal choice items count');
  assert.ok(r.families.quanto_mi_conosci.last_at);
});

test('the days are this Europe/Rome week only, Monday first', async () => {
  await setClock(day(1)); // Friday 6
  await playBoth((await startSwipe(h.F)).id);
  await setClock('2026-11-08T22:30:00Z'); // Sunday 8, 23:30 in Rome
  await playBoth((await startSwipe(h.B)).id);
  const sunday = await intesa(h.F);
  assert.deepEqual([sunday.week_start, sunday.days], ['2026-11-02', ['2026-11-06', '2026-11-08']]);
  await setClock('2026-11-09T09:00:00Z'); // Monday 9: a new week
  const monday = await intesa(h.F);
  assert.deepEqual([monday.week_start, monday.days], ['2026-11-09', []]);
  assert.ok(monday.compared > 0, 'the intesa keeps the earlier weeks');
});
