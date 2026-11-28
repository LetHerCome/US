// La vostra bacheca (founder, 25/11/2026; grill D1–D27): the couple's board in
// Ricordi, kept by US. Rules only: the first time the couple's story (up to 8),
// then a year ago, milestones, on Monday the memory of the week and something
// kept; 12 things for free; the couple has the last word (fix, move, unpin,
// never again, pin something yourselves). Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_us_bacheca_v1\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const plan = (day) => q('select private.us_bacheca_plan($1, $2::date)', [h.A, day]);
const pins = () => q('select ref_key, reason, source, pinned_by, fixed, pos_x, pos_y from public.us_bacheca_pins where couple_id = $1 order by item_date, created_at', [h.A]);
let n = 0;
const moment = (by, date, { place = null, caption = null, createdAt = null } = {}) => q(
  "insert into public.moments(couple_id, created_by, storage_path, moment_date, caption, place_label, place_lat, place_lon, place_source, created_at) values ($1, $2, $3, $4::date, $5, $6, case when $6::text is null then null else 45.4 end, case when $6::text is null then null else 11.9 end, case when $6::text is null then null else 'search' end, coalesce($7::timestamptz, now())) returning id",
  [h.A, by, `c/${by}/b${++n}.webp`, date, caption, place, createdAt]).then((r) => r[0].id);

test.beforeEach(async () => { db = await h.database(); n = 0; });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed; the couple reads its board; writes only through the functions', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_us_bacheca_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  await moment(h.F, '2026-05-01', { caption: 'Il primo' });
  await plan('2026-11-25');
  assert.equal(await h.as(db, h.B, 'select count(*)::int r from public.us_bacheca_pins'), 1);
  assert.equal(await h.as(db, h.U1, 'select count(*)::int r from public.us_bacheca_pins'), 0, 'another couple sees nothing');
  await assert.rejects(h.as(db, h.F, "insert into public.us_bacheca_pins(couple_id, source, ref_key, reason, item_date) values ($1, 'traguardo', 'x', 'traguardo', current_date) returning id r", [h.A]), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'select private.us_bacheca_plan($1, current_date) r', [h.A]), /permission denied/);
});

test('the first time: the story, up to 8, never a delicate caption; an empty couple waits', async () => {
  await plan('2026-06-01');
  assert.equal((await pins()).length, 0, 'no memories yet: nothing, and the first fill waits');
  await moment(h.F, '2026-04-22', { caption: 'Il primo caffè', place: 'Padova' });
  await moment(h.B, '2026-04-30', { caption: 'Dal medico, tutto ok', place: 'Ospedale' });
  for (let i = 0; i < 9; i += 1) await moment(i % 2 ? h.B : h.F, `2026-0${5 + (i % 5)}-1${i}`, { caption: `Ricordo ${i}`, place: i < 3 ? `Posto ${i}` : null });
  await plan('2026-11-25');
  const board = await pins();
  assert.ok(board.length >= 5 && board.length <= 8, `story size ${board.length}`);
  assert.equal(board[0].reason, 'primo');
  assert.ok(board.some((p) => p.reason === 'prima_volta'));
  assert.ok(board.some((p) => p.reason === 'settimana'));
  assert.ok(board.every((p) => p.pinned_by === null && !p.fixed), 'all by US, nothing fixed');
  const delicate = (await q("select id from public.moments where caption like 'Dal medico%'"))[0].id;
  assert.ok(!board.some((p) => p.ref_key === `moment:${delicate}`), 'the delicate one stays out');
  await plan('2026-11-25');
  assert.equal((await pins()).length, board.length, 'a day is planned once');
});

test('every day: a year ago and milestones; on Monday the memory of the week and something kept', async () => {
  // Every memory has its own upload time: one uploaded «now» would be the memory of
  // the week of 30/11 whenever the test runs between 23 and 29 November 2026.
  await moment(h.F, '2026-04-22', { caption: 'Il primo', createdAt: '2026-04-22T12:00:00Z' });
  await plan('2026-11-20');
  const before = (await pins()).length;
  const yearAgo = await moment(h.B, '2025-11-24', { caption: 'Padova', place: 'Padova', createdAt: '2025-11-24T18:00:00Z' });
  await plan('2026-11-24');
  assert.ok((await pins()).some((p) => p.ref_key === `moment:${yearAgo}` && p.reason === 'un_anno_fa'));
  // The first anniversary (started_on 2026-04-21).
  await plan('2027-04-21');
  assert.ok((await pins()).some((p) => p.ref_key === 'traguardo:anni:1'));
  // Monday 2026-11-30: the memory of the week and a kept letter.
  const week = await moment(h.F, '2026-11-27', { caption: 'Domenica al lago', createdAt: '2026-11-27T10:00:00Z' });
  const item = (await q("insert into public.left_for_you(couple_id, sender_id, recipient_id, kind, body) values ($1, $2, $3, 'text', 'Stasera ti chiamo') returning id", [h.A, h.B, h.F]))[0].id;
  await q("insert into public.conserva_contributions(couple_id, source_item_id, source_sender_id, conserved_by, created_at) values ($1, $2, $3, $4, '2026-11-28T09:00:00Z')", [h.A, item, h.B, h.F]);
  await plan('2026-11-30');
  const board = await pins();
  assert.ok(board.some((p) => p.ref_key === `moment:${week}` && p.reason === 'settimana'));
  assert.ok(board.some((p) => p.source === 'conserva' && p.reason === 'tenuta'));
  assert.ok(board.length > before);
});

test('12 for free: US makes room only with its own unfixed things', async () => {
  await moment(h.F, '2026-04-22', { caption: 'Il primo' });
  await plan('2026-11-01');
  // Fill the board to 12 by hand, some fixed, some yours.
  for (let i = 0; (await pins()).length < 12; i += 1) {
    const id = await moment(h.F, `2026-0${5 + (i % 4)}-0${1 + (i % 8)}`, { caption: `X${i}` });
    await q("insert into public.us_bacheca_pins(couple_id, source, source_id, ref_key, reason, item_date, pinned_by, fixed) values ($1, 'moment', $2::uuid, 'moment:' || $2::text, 'storia', '2026-05-01', $3, $4)", [h.A, id, i < 4 ? h.F : null, i < 8]);
  }
  const yearAgo = await moment(h.B, '2025-12-05', { caption: 'Un anno fa' });
  await plan('2026-12-05');
  const board = await pins();
  assert.equal(board.length, 12, 'still 12');
  assert.ok(board.some((p) => p.ref_key === `moment:${yearAgo}`), 'the year-ago memory went up');
  assert.equal(board.filter((p) => p.pinned_by === h.F).length, 4, 'yours stay');
  // Only fixed things left of US: no room, nothing changes.
  await q('update public.us_bacheca_pins set fixed = true where couple_id = $1', [h.A]);
  await moment(h.B, '2025-12-06', { caption: 'Un altro anno fa' });
  await plan('2026-12-06');
  assert.equal((await pins()).length, 12);
  assert.equal(await h.as(db, h.F, 'select public.bacheca_pin_v1($1, $2) r', ['moment', yearAgo]), 'already');
  const extra = await moment(h.F, '2026-10-10', { caption: 'Extra' });
  assert.equal(await h.as(db, h.F, 'select public.bacheca_pin_v1($1, $2) r', ['moment', extra]), 'full');
});

test('the last word: fix, move (it becomes yours), unpin, never again; pin yourselves', async () => {
  const first = await moment(h.F, '2026-04-22', { caption: 'Il primo' });
  const second = await moment(h.B, '2026-06-02', { caption: 'Il mare', place: 'Rimini' });
  await plan('2026-11-01');
  const get = async () => (await h.as(db, h.B, 'select public.get_bacheca_v1() r'));
  let board = await get();
  assert.equal(board.limit, 12);
  assert.equal(board.plus, false);
  const pinOf = (b, ref) => b.pins.find((p) => `${p.source}:${p.source_id}` === ref);
  const p1 = pinOf(board, `moment:${first}`);
  assert.equal(p1.content.caption, 'Il primo');
  assert.equal(p1.by_us, true);
  assert.equal(await h.as(db, h.B, 'select public.bacheca_pin_action_v1($1, $2) r', [p1.id, 'fix']), true);
  assert.equal(await h.as(db, h.B, 'select public.bacheca_pin_action_v1($1, $2, $3, $4) r', [p1.id, 'move', 120.5, 80]), true);
  board = await get();
  const moved = pinOf(board, `moment:${first}`);
  assert.deepEqual([moved.fixed, moved.mine, moved.by_us, moved.x, moved.y], [true, true, false, 120.5, 80]);
  assert.equal(await h.as(db, h.U1, 'select public.bacheca_pin_action_v1($1, $2) r', [p1.id, 'unpin']), false, 'not from another couple');
  const p2 = pinOf(board, `moment:${second}`);
  assert.equal(await h.as(db, h.F, 'select public.bacheca_pin_action_v1($1, $2) r', [p2.id, 'ban']), true);
  assert.equal(pinOf(await get(), `moment:${second}`), undefined);
  assert.equal((await q("select count(*)::int c from public.us_bacheca_bans where couple_id = $1", [h.A]))[0].c, 1);
  // Banned: US never puts it back; you still can.
  assert.equal(await h.as(db, h.F, 'select public.bacheca_pin_v1($1, $2) r', ['moment', second]), 'pinned');
  const mine = pinOf(await get(), `moment:${second}`);
  assert.deepEqual([mine.reason, mine.fixed, mine.by_us], ['scelta', true, false]);
  // A deleted memory leaves the board.
  await q('delete from public.moments where id = $1', [first]);
  assert.equal(pinOf(await get(), `moment:${first}`), undefined);
  assert.equal(await h.as(db, h.F, 'select public.bacheca_pin_action_v1($1, $2) r', [mine.id, 'unpin']), true);
});
