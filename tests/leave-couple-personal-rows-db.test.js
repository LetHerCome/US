// Batteria and Come stai go with the member who leaves the couple (founder,
// 03/11/2026). No extra delete is needed: s32_close_membership deletes the
// leaving member's profile (MC2: no profile = onboarding), and both tables
// cascade from profiles; the last member leaving erases the couple, and both
// cascade from couples too. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/mc2-db');

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const owners = async (table) => (await q(`select user_id from public.${table} order by user_id`)).map((r) => r.user_id);
const leave = async (user) => (await q("select public.s32_leave_couple($1,'app') r", [user]))[0].r;

test.beforeEach(async () => {
  db = await h.database();
  for (const user of [h.F, h.B]) {
    await h.as(db, user, 'select public.report_battery(50,false) r');
    await h.as(db, user, "select public.set_member_status('felice') r");
  }
});
test.afterEach(async () => { await db?.close(); db = null; });

test('who leaves loses the battery and Come stai rows; the partner keeps theirs', async () => {
  const both = [h.F, h.B].sort();
  assert.deepEqual(await owners('couple_batteries'), both);
  assert.deepEqual(await owners('member_status'), both);
  assert.equal((await leave(h.B)).mode, 'departed');
  assert.deepEqual(await owners('couple_batteries'), [h.F]);
  assert.deepEqual(await owners('member_status'), [h.F]);
});

test('the last member leaving erases both', async () => {
  await leave(h.B);
  assert.equal((await leave(h.F)).mode, 'couple_erased');
  assert.deepEqual(await owners('couple_batteries'), []);
  assert.deepEqual(await owners('member_status'), []);
});
