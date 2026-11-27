// Avvisi di US vi ricorda e personaggi sempre aggiornati (founder, 27/11/2026).
// 1. us_ricorda_push_due_v1: the strongest dated lines of US vi ricorda (a
//    birthday in 7 days and on the day, the anniversary in 7 days, «un anno
//    fa») and a memory US hung on the bacheca today become at most one push a
//    person; never a line already seen, a muted kind, the switch off, at night.
// 2. A change of colour, shape or outfit moves couple_sync 'looks' (the open
//    app of the partner hears it over Realtime); nothing else does.
// Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_push_ricorda_personaggio\.sql$/.test(f));
const CRON = fs.readdirSync(DIR).find((f) => /_ricorda_push_cron\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const due = async (slot, day = null) => (await q('select public.us_ricorda_push_due_v1($1, $2::date) r', [slot, day]))[0].r;
const of = (rows, who) => rows.filter((r) => r.user_id === who);
const birthday = (by, name, date) => q("insert into public.shared_events(couple_id, created_by, title, event_date, recurs_yearly) values ($1, $2, 'Compleanno di ' || $3, $4::date, true)", [h.A, by, name, date]);
let n = 0;
const moment = (by, date, place = null, caption = null) => q(
  "insert into public.moments(couple_id, created_by, storage_path, moment_date, caption, place_label, place_lat, place_lon, place_source) values ($1, $2, $3, $4::date, $5, $6, case when $6::text is null then null else 45.4 end, case when $6::text is null then null else 11.9 end, case when $6::text is null then null else 'search' end) returning id",
  [h.A, by, `c/${by}/p${++n}.webp`, date, caption, place]).then((r) => r[0].id);
const romeToday = () => new Date().toLocaleString('en-CA', { timeZone: 'Europe/Rome', hour12: false }).slice(0, 10);
const shift = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const yearAgo = (iso) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;

test.beforeEach(async () => { db = await h.database(); n = 0; });
test.afterEach(async () => { await db?.close(); db = null; });

test('migrations are listed; only service_role lists what is due; the new switch defaults on', async () => {
  assert.ok(FILE && CRON, 'missing the two migrations');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  for (const f of [FILE, CRON]) assert.ok(cutoff.executable_migrations.includes(f) && cutoff.forward_migrations.includes(f), f);
  for (const role of ['anon', 'authenticated']) {
    for (const fn of ['public.us_ricorda_push_due_v1(text, date)', 'public.get_internal_ricorda_push_cron_key()']) {
      assert.equal((await q('select has_function_privilege($1, $2, \'execute\') r', [role, fn]))[0].r, false, `${role} ${fn}`);
    }
  }
  for (const fn of ['us_ricorda_push_due_v1', 'get_internal_ricorda_push_cron_key', 'couple_sync_bump_looks']) {
    const row = (await q('select prosecdef, proconfig from pg_proc where proname = $1', [fn]))[0];
    assert.equal(row.prosecdef, true, fn);
    assert.ok(row.proconfig.some((c) => /^search_path=("")?$/.test(c)), `${fn}: pinned search_path`);
  }
  await assert.rejects(h.as(db, h.F, "select public.us_ricorda_push_due_v1('mattina') r"), /permission denied/);
  const prefs = await h.as(db, h.F, 'select public.get_notification_preferences() r');
  assert.equal(prefs.ricorda, true);
  const off = await h.as(db, h.F, "select public.set_notification_preference('ricorda', false) r");
  assert.equal(off.ricorda, false);
  assert.equal(off.lavagna, true, 'the other switches are untouched');
  await assert.rejects(h.as(db, h.F, "select public.set_notification_preference('nope', false) r"), /Invalid preference/);
  // Only the two daytime slots exist.
  assert.deepEqual(await due('notte'), []);
});

test('morning: a birthday in 7 days and on the day, to the other one only; the anniversary a week before to both', async () => {
  await birthday(h.B, 'Beatrice', '2000-12-02');
  let rows = await due('mattina', '2026-11-25');
  assert.deepEqual(of(rows, h.F).map((r) => [r.type, r.vars.name, r.day]), [['ricorda_birthday_week', 'Beatrice', '2026-11-25']]);
  assert.equal(of(rows, h.B).length, 0, 'the surprise stays a surprise');
  assert.equal((await due('mattina', '2026-12-01')).length, 0, 'the day before stays in the app');
  rows = await due('mattina', '2026-12-02');
  assert.deepEqual(of(rows, h.F).map((r) => r.type), ['ricorda_birthday']);
  // started_on 2026-04-21 (seed): one week before the first anniversary.
  rows = await due('mattina', '2027-04-14');
  assert.deepEqual(rows.map((r) => [r.user_id, r.type, r.vars.years]).sort(), [[h.F, 'ricorda_anniversary_week', 1], [h.B, 'ricorda_anniversary_week', 1]].sort());
  assert.equal((await due('mattina', '2027-04-21')).length, 0, 'the day itself is «Ricorrenze», not this push');
  assert.equal((await due('sera', '2026-11-25')).filter((r) => r.type.startsWith('ricorda_birthday')).length, 0, 'birthdays are a morning line');
});

test('never a seen line, a muted kind, the voices off or the switch off; months and first times stay in the app', async () => {
  await birthday(h.B, 'Beatrice', '2000-12-02');
  await q('select private.us_ricorda_plan_couple($1, $2::date)', [h.A, '2026-11-25']);
  await q("update public.us_battute set seen_at = now() where recipient_id = $1 and day = '2026-11-25'", [h.F]);
  assert.equal((await due('mattina', '2026-11-25')).length, 0, 'already seen in the app');
  await q("insert into public.us_battute_mute(user_id, kind) values ($1, 'compleanno')", [h.F]);
  assert.equal((await due('mattina', '2026-12-02')).length, 0, '«Non dirmelo più»');
  await q("delete from public.us_battute_mute where user_id = $1", [h.F]);
  await q("insert into public.us_battute_mute(user_id, kind) values ($1, '*')", [h.F]);
  assert.equal(of(await due('mattina', '2027-11-25'), h.F).length, 0, '«Le voci dei personaggi» off');
  await q("delete from public.us_battute_mute where user_id = $1", [h.F]);
  await h.as(db, h.F, "select public.set_notification_preference('ricorda', false) r");
  assert.equal(of(await due('mattina', '2028-11-25'), h.F).length, 0, 'the switch off');
  // A month more and 100 days are planned but never pushed (the monthiversary job has them).
  const rows = await due('mattina', '2026-07-21');
  assert.equal(rows.length, 0);
  assert.ok((await q("select 1 from public.us_battute where couple_id = $1 and day = '2026-07-21' and kind = 'mesiversario'", [h.A])).length >= 1, 'the line itself is still planned for the app');
});

test('evening: «un anno fa» first, then the bacheca for the other one; never the first fill', async () => {
  const today = romeToday();
  // The first fill of the bacheca happens on another day, so today's pin is a daily one.
  await moment(h.F, '2025-01-10', null, 'Il primo');
  await q('select private.us_bacheca_plan($1, $2::date)', [h.A, shift(today, -3)]);
  const memory = await moment(h.B, yearAgo(today), 'Padova', 'Al Prato');
  const rows = await due('sera', today);
  assert.equal(rows.length, 2, JSON.stringify(rows));
  const line = rows.find((r) => r.type === 'ricorda_year_ago');
  const board = rows.find((r) => r.type === 'ricorda_bacheca');
  assert.ok(line && board, 'one gets the line, the other the board');
  assert.notEqual(line.user_id, board.user_id);
  assert.deepEqual([line.vars.source, line.vars.place], ['moment', 'Padova']);
  assert.deepEqual([board.vars.reason, board.vars.place], ['un_anno_fa', 'Padova']);
  for (const r of rows) assert.doesNotMatch(JSON.stringify(r.vars), /\.webp|c\//, 'no storage path in a push');
  assert.ok((await q('select 1 from public.us_bacheca_pins where couple_id = $1 and source_id = $2', [h.A, memory])).length === 1);
  // Morning: nothing of the evening.
  assert.equal((await due('mattina', today)).filter((r) => r.type === 'ricorda_year_ago' || r.type === 'ricorda_bacheca').length, 0);
});

test('a couple being filled the first time, or a couple of one, gets no push', async () => {
  const today = romeToday();
  await moment(h.F, yearAgo(today), 'Padova', 'Il primo');
  const rows = await due('sera', today);
  assert.equal(rows.filter((r) => r.type === 'ricorda_bacheca').length, 0, 'the first fill is not news');
  const c = await h.create(db, h.U1, 'Solo', '2026-01-01');
  await q("insert into public.shared_events(couple_id, created_by, title, event_date, recurs_yearly) values ($1, $2, 'Compleanno di Alex', '2000-12-02', true)", [c.couple_id, h.U1]);
  assert.equal(of(await due('mattina', '2026-11-25'), h.U1).length, 0);
});

test('looks: colour, shape and outfit move couple_sync looks; the name or a no-op do not', async () => {
  const revision = async () => (await q("select revision::int r from public.couple_sync where couple_id = $1 and kind = 'looks'", [h.A]))[0]?.r ?? 0;
  assert.equal(await revision(), 0);
  await q("update public.profiles set character_shape = 'goccia' where id = $1", [h.B]);
  assert.equal(await revision(), 1);
  await q("update public.profiles set character_shape = 'goccia' where id = $1", [h.B]);
  assert.equal(await revision(), 1, 'same value: no signal');
  await q("update public.profiles set person_color = 'menta' where id = $1", [h.F]);
  await q("update public.profiles set character_head = 'corona', character_face = 'sole' where id = $1", [h.F]);
  assert.equal(await revision(), 3);
  await q("update public.profiles set display_name = 'Bea' where id = $1", [h.B]);
  assert.equal(await revision(), 3, 'a name is not a look');
  // The partner reads the signal, another couple does not, nobody writes it.
  assert.equal(await h.as(db, h.B, "select count(*)::int r from public.couple_sync where kind = 'looks'"), 1);
  const c = await h.create(db, h.U1, 'Other', '2026-02-02');
  assert.equal(await h.as(db, h.U1, "select count(*)::int r from public.couple_sync where kind = 'looks'"), 0);
  await assert.rejects(h.as(db, h.F, "update public.couple_sync set revision = 99 where kind = 'looks' returning 1 r"), /permission denied/);
  assert.ok(c.couple_id);
  // The app's own RPCs go through the same trigger.
  await h.as(db, h.B, "select public.set_my_character_shape('nuvola') r");
  assert.equal(await revision(), 4);
});
