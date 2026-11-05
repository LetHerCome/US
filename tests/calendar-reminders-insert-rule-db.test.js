// Audit 05/11/2026, punto 12: the insert rule of calendar_reminders compared
// couple_id with itself, so it never tied the recipient and the entry to the
// reminder's couple. Full repo schema in disposable PGlite. The app has no
// INSERT on the table today; the test grants it only inside this database, to
// prove the rule itself for the day reminders come back.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_calendar_reminders_insert_rule\.sql$/.test(f));

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const entry = async (couple, by, type = 'shared') => (await q(
  "insert into public.calendar_entries(couple_id, entry_type, created_by, owner_id, title, is_all_day, start_date, end_date) values ($1, $2, $3, $4, 'Cena', true, '2026-12-10', '2026-12-10') returning id",
  [couple, type, by, type === 'personal' ? by : null]))[0].id;
const remind = (user, couple, entryId, recipient) => h.as(db, user,
  'insert into public.calendar_reminders(couple_id, entry_id, recipient_id, offset_minutes, requested_by) values ($1, $2, $3, 1440, $4) returning id r',
  [couple, entryId, recipient, user]);

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2026-02-02'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed and the rule now names the reminder row on both sides', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_calendar_reminders_insert_rule.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const rule = (await q("select with_check from pg_policies where schemaname = 'public' and tablename = 'calendar_reminders' and policyname = 'calendar_reminders_insert_couple'"))[0].with_check;
  assert.match(rule, /p\.couple_id = calendar_reminders\.couple_id/);
  assert.match(rule, /e\.couple_id = calendar_reminders\.couple_id/);
  assert.doesNotMatch(rule, /p\.couple_id = p\.couple_id|e\.couple_id = e\.couple_id/);
});

test('today the app still cannot insert reminders at all', async () => {
  const mine = await entry(h.A, h.F);
  await assert.rejects(remind(h.F, h.A, mine, h.B), /permission denied/);
});

test('with INSERT granted, only an entry and a recipient of the same couple pass', async () => {
  // Bringing reminders back also needs the two CHECK functions callable by the
  // app (revoked by F1B), or better an RPC: granted here only to test the rule.
  await q('grant insert on table public.calendar_reminders to authenticated');
  await q('grant execute on function public.calendar_reminder_offset_valid(uuid, integer), public.calendar_reminder_recipient_in_couple(uuid, uuid) to authenticated');
  const shared = await entry(h.A, h.F);
  const theirs = await entry(C2, h.U1);
  const partnerPersonal = await entry(h.A, h.B, 'personal');

  assert.ok(await remind(h.F, h.A, shared, h.B), 'a shared entry of the couple, for the partner');
  assert.ok(await remind(h.F, h.A, shared, h.F), 'or for oneself');
  await assert.rejects(remind(h.F, h.A, theirs, h.B), /row-level security/, 'an entry of the other couple: refused, now by the rule itself');
  await assert.rejects(remind(h.F, h.A, shared, h.U1), /row-level security|check constraint/, 'a recipient of the other couple: refused');
  await assert.rejects(remind(h.F, h.A, partnerPersonal, h.F), /row-level security/, 'the partner\'s personal entry: refused');
  await assert.rejects(remind(h.F, C2, theirs, h.U1), /row-level security|check constraint/, 'a reminder in the other couple: refused');
  assert.equal((await q('select count(*)::int n from public.calendar_reminders'))[0].n, 2);
});
