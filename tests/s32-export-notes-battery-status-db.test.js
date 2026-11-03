// The data export prepared on request (Edge export-user-data, D-7) reads
// public.s32_export_user_data: it covers Note condivise, Batteria and Come
// stai too (03/11/2026). Only the person's own rows, never the partner's ids.
// Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/mc2-db');

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const svc = (sql, p = []) => h.as(db, null, sql, p, 'service_role');
const write = (user, title) => h.as(db, user, "insert into public.couple_notes(couple_id, title) values ($1,$2) returning id r", [h.A, title]);

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('the export has the notes the person wrote or edited, their battery and their state; never the partner', async () => {
  await write(h.F, 'Nota_di_F');
  await write(h.B, 'Nota_di_B');
  const shared = await write(h.B, 'Nota_di_B_ritoccata_da_F');
  await h.as(db, h.F, "update public.couple_notes set body = 'aggiunta di F' where id = $1 returning id r", [shared]);
  await h.as(db, h.F, 'select public.report_battery(41,true) r');
  await h.as(db, h.B, 'select public.report_battery(77,false) r');
  await h.as(db, h.F, "select public.set_member_status('felice') r");
  await h.as(db, h.B, "select public.set_member_status('stanco') r");

  const e = await svc('select public.s32_export_user_data($1) r', [h.F]);
  assert.deepEqual(e.created.couple_notes.map((n) => n.title), ['Nota_di_F', 'Nota_di_B_ritoccata_da_F']);
  assert.deepEqual({ level: e.personal.battery.level, charging: e.personal.battery.charging }, { level: 41, charging: true });
  assert.equal(e.personal.member_status.status, 'felice');
  const json = JSON.stringify(e);
  assert.ok(!json.includes(h.B), 'no id of the partner');
  for (const words of ['Nota_di_B"', '"stanco"', ':77']) assert.ok(!json.includes(words), words);

  // Nothing yet: empty list, null rows.
  const other = await svc('select public.s32_export_user_data($1) r', [h.U1]);
  assert.deepEqual(other.created.couple_notes, []);
  assert.equal(other.personal.battery, null);
  assert.equal(other.personal.member_status, null);
});

test('still service_role only', async () => {
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await q("select has_function_privilege($1,'public.s32_export_user_data(uuid)','execute') r", [role]))[0].r, false, role);
  }
  assert.equal((await q("select has_function_privilege('service_role','public.s32_export_user_data(uuid)','execute') r"))[0].r, true);
});
