// Il vostro anno V1 (docs/missions/year-recap-v1.md), on the full repo schema
// in disposable PGlite with two synthetic couples: the period (first year,
// the anniversary itself, 29 February), the counts of the couple's own data
// inside it, no written text in the answer, and the usual authorization.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_year_recap_v1\.sql$/.test(f));

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const recapAt = async (couple, today) => (await q('select private.couple_year_recap($1, $2::date) r', [couple, today]))[0].r;
const setStart = (couple, date) => q('update public.couples set started_on = $2 where id = $1', [couple, date]);
const at = (date) => `${date} 12:00:00+02`;

async function seed(couple, a, b, tag) {
  const moment = (date, n) => q('insert into public.moments(couple_id, created_by, storage_path, thumbnail_path, caption, moment_date, created_at) values ($1,$2,$3,$4,$5,$6::date,$7::timestamptz) returning id',
    [couple, a, `${couple}/${a}/${tag}-${n}.webp`, `${couple}/${a}/derived-thumbnails/${tag}-${n}.webp`, `SEGRETO didascalia ${tag}`, date, at(date)]);
  const ids = [];
  for (const [i, d] of ['2025-12-20', '2026-03-10', '2026-03-12', '2026-03-25', '2026-07-01', '2026-10-21'].entries()) ids.push((await moment(d, i))[0].id);
  await q('insert into public.moment_photos(moment_id, couple_id, created_by, storage_path, position, created_at) values ($1,$2,$3,$4,1,$5::timestamptz),($1,$2,$3,$6,2,$5::timestamptz)',
    [ids[1], couple, b, `${couple}/${b}/album-1.webp`, at('2026-03-10'), `${couple}/${b}/album-2.webp`]);
  for (const [sender, recipient, date] of [[a, b, '2026-02-01'], [a, b, '2026-05-01'], [b, a, '2026-06-01'], [a, b, '2025-09-01']]) {
    await q("insert into public.shared_messages(couple_id, sender_id, recipient_id, kind, body, created_at) values ($1,$2,$3,'think','SEGRETO pensiero',$4::timestamptz)", [couple, sender, recipient, at(date)]);
  }
  for (const [n, date, both] of [[1, '2026-04-02', true], [2, '2026-04-03', false], [3, '2025-12-01', true]]) {
    const qid = (await q("insert into public.daily_questions(question_date, question) values ($1::date, $2) on conflict (question_date) do update set question = excluded.question returning id", [date, `Domanda ${n}`]))[0].id;
    await q("insert into public.daily_answers(question_id, user_id, couple_id, answer) values ($1,$2,$3,'SEGRETO risposta') on conflict do nothing", [qid, a, couple]);
    if (both) await q("insert into public.daily_answers(question_id, user_id, couple_id, answer) values ($1,$2,$3,'SEGRETO risposta') on conflict do nothing", [qid, b, couple]);
  }
  await q("insert into public.left_for_you(couple_id, sender_id, recipient_id, kind, body, created_at) values ($1,$2,$3,'text','SEGRETO lasciato',$4::timestamptz)", [couple, a, b, at('2026-08-08')]);
  const ev = (await q("insert into public.shared_events(couple_id, created_by, title, event_date) values ($1,$2,'SEGRETO evento','2026-09-09') returning id", [couple, a]))[0].id;
  await q("insert into public.shared_event_completions(event_id, couple_id, occurrence_date, completed_by, xp_awarded, completed_at) values ($1,$2,'2026-09-09',$3,0,$4::timestamptz)", [ev, couple, a, at('2026-09-09')]);
  await q("insert into public.game_sessions(couple_id, game_family, content_source, started_by_role, create_request_id, started_at, completed_at, engine_version) values ($1,'ridete','curated','francesco',gen_random_uuid(),$2::timestamptz,$2::timestamptz,2),($1,'ridete','curated','francesco',gen_random_uuid(),$3::timestamptz,null,2)",
    [couple, at('2026-05-05'), at('2026-05-06')]);
  const tpl = (await q('select key, title, category, rarity, xp from public.bond_quest_templates where active order by key limit 1'))[0];
  await q('insert into public.bond_weekly_quests(couple_id, week_start, slot, template_key, title, category, rarity, xp, confirmed_by, completed_at, created_at) values ($1,$2::date,1,$3,$4,$5,$6,$7,array[$8,$9]::uuid[],$10::timestamptz,$10::timestamptz)',
    [couple, '2026-06-15', tpl.key, tpl.title, tpl.category, tpl.rarity, tpl.xp, a, b, at('2026-06-16')]);
}

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2025-06-01'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
  await setStart(h.A, '2024-10-22');
  await seed(h.A, h.F, h.B, 'A');
  await seed(C2, h.U1, h.U2, 'B');
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed in the cutoff and only adds functions', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_year_recap_v1.sql');
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /\b(create table|alter table|insert into|update public|delete from|drop )/i, 'read only');
  assert.ok(sql.includes('revoke all on function public.get_couple_year_recap() from public, anon, authenticated, service_role;'));
  assert.ok(sql.includes('grant execute on function public.get_couple_year_recap() to authenticated;'));
  assert.ok(sql.includes('revoke all on function private.couple_year_recap(uuid, date) from public, anon, authenticated, service_role;'));
});

test('a day in the year: from the last anniversary to today, counts of this couple only', async () => {
  const r = await recapAt(h.A, '2026-10-21');
  assert.deepEqual(r.period, { start: '2025-10-22', end: '2026-10-21', full_year: false, first_year: false, years: 1, months: 23 });
  assert.equal(r.days_together, 729);
  assert.equal(r.moments.count, 6);
  assert.equal(r.moments.photos, 8, 'six covers and two album photos');
  assert.deepEqual([r.moments.top_month, r.moments.top_month_count], ['2026-03', 3]);
  assert.equal(r.moments.first.moment_date, '2025-12-20');
  assert.equal(r.moments.last.moment_date, '2026-10-21');
  assert.match(r.moments.first.thumbnail_path, new RegExp(`^${h.A}/`));
  assert.deepEqual(r.think, { total: 3, francesco: 2, beatrice: 1 }, 'the one from before the period is left out');
  assert.deepEqual(r.daily, { answered_together: 2, kept: 0 });
  assert.deepEqual(r.games, { completed: 1 });
  assert.deepEqual(r.missions, { completed: 1 });
  assert.deepEqual(r.events, { lived: 1 });
  assert.deepEqual(r.left_for_you, { count: 1 });
  assert.doesNotMatch(JSON.stringify(r), /SEGRETO/, 'no written text ever');
});

test('the anniversary itself: the full year that just ended', async () => {
  const r = await recapAt(h.A, '2026-10-22');
  assert.equal(r.period.start, '2025-10-22');
  assert.equal(r.period.end, '2026-10-22');
  assert.equal(r.period.full_year, true);
  assert.equal(r.period.years, 2);
  const before = await recapAt(h.A, '2026-10-23');
  assert.equal(before.period.start, '2026-10-22', 'the day after, a new year starts');
  assert.equal(before.period.full_year, false);
  assert.equal(before.moments.count, 0);
});

test('first year and 29 February', async () => {
  await setStart(h.A, '2026-03-01');
  let r = await recapAt(h.A, '2026-10-21');
  assert.deepEqual(r.period, { start: '2026-03-01', end: '2026-10-21', full_year: false, first_year: true, years: 0, months: 7 });
  assert.equal(r.moments.count, 5, 'only since the start of the relationship');
  await setStart(h.A, '2024-02-29');
  r = await recapAt(h.A, '2026-02-28');
  assert.equal(r.period.full_year, true, '28 February is the anniversary in a common year');
  assert.equal(r.period.start, '2025-02-28');
  r = await recapAt(h.A, '2028-02-29');
  assert.equal(r.period.full_year, true);
  assert.equal(r.period.start, '2027-02-28');
});

test('RPC: only for a member of a couple, the couple of the caller, read only', async () => {
  const mine = await h.as(db, h.F, 'select public.get_couple_year_recap() r');
  assert.ok(mine.period && typeof mine.moments.count === 'number');
  const other = await h.as(db, h.U1, 'select public.get_couple_year_recap() r');
  assert.notEqual(JSON.stringify(other.moments.first), JSON.stringify(mine.moments.first));
  await assert.rejects(h.as(db, null, 'select public.get_couple_year_recap() r'), /authentication required/);
  await assert.rejects(h.as(db, h.U3, 'select public.get_couple_year_recap() r'), /couple membership required/);
  await assert.rejects(h.as(db, null, 'select public.get_couple_year_recap() r', [], 'anon'), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'select private.couple_year_recap($1, current_date) r', [h.A]), /permission denied/);
  await db.exec('begin read only');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [h.F]);
    await db.exec('set local role authenticated');
    const r = await db.query('select public.get_couple_year_recap() r');
    assert.ok(r.rows[0].r.period);
  } finally { await db.exec('rollback'); }
});
