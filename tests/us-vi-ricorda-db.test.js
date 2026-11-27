// US vi ricorda (founder, 25/11/2026; docs/product/2026-11-25-us-vi-ricorda.md):
// the day's line of each person, planned from what both already see. Rules
// only: birthdays to the other one, the anniversary, months and hundreds of
// days, a year ago (to one of the two, by turns), first times, a question to
// get to know you; one a day, never twice, «Non dirmelo più» and the switch.
// Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_us_vi_ricorda_v1\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const plan = (day) => q('select private.us_ricorda_plan_couple($1, $2::date)', [h.A, day]);
const lines = async (day) => q('select recipient_id as who, kind, speaker, slot, vars from public.us_battute where couple_id = $1 and day = $2::date order by recipient_id', [h.A, day]);
const lineOf = async (user, day) => (await lines(day)).find((l) => l.who === user) || null;
let n = 0;
const moment = (by, date, place = null, createdAt = null) => q(
  "insert into public.moments(couple_id, created_by, storage_path, moment_date, place_label, place_lat, place_lon, place_source, created_at) values ($1, $2, $3, $4::date, $5, case when $5::text is null then null else 45.4 end, case when $5::text is null then null else 11.9 end, case when $5::text is null then null else 'search' end, coalesce($6::timestamptz, now())) returning id",
  [h.A, by, `c/${by}/m${++n}.webp`, date, place, createdAt]).then((r) => r[0].id);
const birthday = (by, name, date) => q("insert into public.shared_events(couple_id, created_by, title, event_date, recurs_yearly) values ($1, $2, 'Compleanno di ' || $3, $4::date, true)", [h.A, by, name, date]);

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed; each person reads only their own lines; the app writes nothing directly', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_us_vi_ricorda_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  await birthday(h.B, 'Beatrice', '2000-12-02');
  await plan('2026-11-25');
  assert.equal((await h.as(db, h.F, 'select count(*)::int r from public.us_battute')), 1);
  assert.equal((await h.as(db, h.B, "select count(*)::int r from public.us_battute where kind = 'compleanno'")), 0, 'the birthday line is not hers');
  await assert.rejects(h.as(db, h.F, "insert into public.us_battute(couple_id, recipient_id, day, kind, ref_key) values ($1, $2, '2026-11-26', 'traguardo', 'x') returning id r", [h.A, h.F]), /permission denied/);
  await assert.rejects(h.as(db, h.U1, 'select private.us_ricorda_plan_couple($1, current_date) r', [h.A]), /permission denied/);
});

test('birthdays: 7 days before, the day before and the day, only to the other one', async () => {
  await birthday(h.B, 'Beatrice', '2000-12-02');
  for (const [day, days] of [['2026-11-25', 7], ['2026-12-01', 1], ['2026-12-02', 0]]) {
    await plan(day);
    const f = await lineOf(h.F, day);
    assert.deepEqual([f.kind, f.speaker, f.slot, f.vars.name, f.vars.days], ['compleanno', 'me', 'mattina', 'Beatrice', days], day);
    assert.notEqual((await lineOf(h.B, day))?.kind, 'compleanno', `${day}: never to her`);
  }
  await plan('2026-11-26');
  assert.notEqual((await lineOf(h.F, '2026-11-26'))?.kind, 'compleanno', 'six days before: nothing');
  // Across the year: a birthday on 3 January is seen from late December.
  await birthday(h.F, 'Francesco', '1999-01-03');
  await plan('2026-12-27');
  const b = await lineOf(h.B, '2026-12-27');
  assert.deepEqual([b.kind, b.vars.name, b.vars.days], ['compleanno', 'Francesco', 7]);
});

test('the anniversary a week before to each, on the day together; months and hundreds of days', async () => {
  // started_on 2026-04-21 (seed).
  await plan('2027-04-14');
  for (const who of [h.F, h.B]) {
    const l = await lineOf(who, '2027-04-14');
    assert.deepEqual([l.kind, l.speaker, l.vars.years, l.vars.days], ['anniversario', 'me', 1, 7]);
  }
  await plan('2027-04-21');
  assert.deepEqual([(await lineOf(h.F, '2027-04-21')).kind, (await lineOf(h.F, '2027-04-21')).speaker], ['anniversario', 'both']);
  await plan('2026-07-21');
  const m = await lineOf(h.B, '2026-07-21');
  assert.deepEqual([m.kind, m.speaker, m.vars.months], ['mesiversario', 'both', 3]);
  await plan('2026-07-30');
  const d = await lineOf(h.F, '2026-07-30');
  assert.deepEqual([d.kind, d.vars.days], ['giorni', 100]);
});

test('a year ago: a memory, with its place, to one of the two by turns; the other hears something else or nothing', async () => {
  await birthday(h.F, 'Francesco', '1990-06-01');
  await birthday(h.B, 'Beatrice', '1990-06-02');
  const id = await moment(h.F, '2025-11-25', 'Padova');
  await plan('2026-11-25');
  const all = await lines('2026-11-25');
  const yearAgo = all.filter((l) => l.kind === 'un_anno_fa');
  assert.equal(yearAgo.length, 1, 'to one only');
  assert.deepEqual([yearAgo[0].speaker, yearAgo[0].slot, yearAgo[0].vars.place, yearAgo[0].vars.id, yearAgo[0].vars.source], ['both', 'sera', 'Padova', id, 'moment']);
});

test('one line a day, the strongest wins; never the same thing twice; never two questions in a row', async () => {
  await birthday(h.B, 'Beatrice', '2000-12-02');
  // Added a year ago too: created now (the default), it would be a new place the
  // day after the test runs, and the test would depend on the day it runs.
  await moment(h.B, '2025-11-25', 'Padova', '2025-11-25T18:00:00Z');
  await plan('2026-11-25');
  await plan('2026-11-25');
  const f = await lineOf(h.F, '2026-11-25');
  assert.equal(f.kind, 'compleanno', 'the birthday beats a year ago');
  assert.equal((await lines('2026-11-25')).filter((l) => l.who === h.F).length, 1);
  // F has no birthday in US: a question, once, then not the next day.
  await plan('2026-11-27');
  assert.deepEqual([(await lineOf(h.F, '2026-11-27')).kind, (await lineOf(h.F, '2026-11-27')).vars.ask], ['conoscervi', 'compleanno']);
  await plan('2026-11-28');
  assert.equal((await lineOf(h.F, '2026-11-28')), null, 'never two days in a row');
  await plan('2026-11-29');
  assert.equal((await lineOf(h.F, '2026-11-29')), null, 'the same question waits for next month');
});

test('first times and round numbers: a new place, the tenth memory', async () => {
  await birthday(h.F, 'Francesco', '1990-06-01');
  await birthday(h.B, 'Beatrice', '1990-06-02');
  for (let i = 0; i < 9; i++) await moment(h.F, '2026-05-01', 'Pescara', '2026-05-02T10:00:00Z');
  await moment(h.B, '2026-09-18', 'Roma', '2026-09-18T18:00:00+02:00');
  await plan('2026-09-19');
  const l = await lineOf(h.F, '2026-09-19');
  assert.equal(l.kind, 'traguardo');
  assert.ok(['luogo', 'ricordi'].includes(l.vars.what));
  const both = (await lines('2026-09-19')).map((x) => x.vars.what).sort();
  assert.deepEqual(both, ['luogo', 'luogo'], 'the first time in Rome, for both');
});

test('delicate words never become a line; «Non dirmelo più» and the switch', async () => {
  assert.equal((await q("select private.us_ricorda_delicato('Visita dal medico') r"))[0].r, true);
  assert.equal((await q("select private.us_ricorda_delicato('Cena al lago') r"))[0].r, false);
  await birthday(h.B, 'Beatrice', '2000-12-02');
  assert.equal(await h.as(db, h.F, "select public.set_my_battute_mute_v1('compleanno', true) r"), true);
  await plan('2026-11-25');
  assert.notEqual((await lineOf(h.F, '2026-11-25'))?.kind, 'compleanno', 'that kind is off for him');
  assert.equal(await h.as(db, h.F, "select public.set_my_battute_mute_v1('*', true) r"), true);
  const got = await h.as(db, h.F, 'select public.get_my_battuta_v1() r');
  assert.equal(got.muted, true, 'the switch hides everything');
  await h.as(db, h.F, "select public.set_my_battute_mute_v1('*', false) r");
  const back = await h.as(db, h.F, 'select public.get_my_battuta_v1() r');
  assert.equal(back.muted, false);
});

test('get_my_battuta_v1 plans today once and returns the caller\'s line; mark_my_battuta_v1 only on one\'s own', async () => {
  const got = await h.as(db, h.F, 'select public.get_my_battuta_v1() r');
  assert.equal(got.muted, false);
  assert.equal((await q('select count(*)::int c from public.us_battute_planned where couple_id = $1', [h.A]))[0].c, 1);
  await h.as(db, h.B, 'select public.get_my_battuta_v1() r');
  assert.equal((await q('select count(*)::int c from public.us_battute_planned where couple_id = $1', [h.A]))[0].c, 1, 'planned once for the couple');
  const mine = got.battuta;
  if (mine) {
    assert.equal(await h.as(db, h.F, "select public.mark_my_battuta_v1($1, 'done') r", [mine.id]), true);
    assert.equal(await h.as(db, h.B, "select public.mark_my_battuta_v1($1, 'done') r", [mine.id]), false, 'not hers');
  }
  assert.equal(await h.as(db, h.U1, 'select public.get_my_battuta_v1() r') && true, true);
});
