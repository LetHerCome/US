// US 1.0 server fixes migration on a real Postgres (PGlite): the repository
// chain (F2C cron jobs included), then 20261015000000 (twice).
//   N8: us-calendar-reminders-dispatch is unscheduled, nothing else; stored
//       reminders, the other cron jobs and the worker stay.
//   T4: anon keeps nothing but SELECT on profiles (MC2 invariant), nobody but
//       the owner and service_role can TRUNCATE, REFERENCES or TRIGGER, Stories
//       keep exactly what stories.js uses. MC2 and the locale migration still
//       verify after it. A duplicated or foreign-owned cron job aborts first.
// Nothing here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');
const { PLATFORM, as } = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const FILE = '20261015000000_us_1_0_server_fixes.sql';
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8');
const SQL = read(FILE);
const MC2 = fs.readdirSync(DIR).find((f) => /_mc2_couple_invites\.sql$/.test(f));
const LOCALE = '20261014230000_us_1_0_locale_content_en.sql';

const uid = (n) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C1 = uid(101), F = uid(1), B = uid(2);
const SEED = `
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
  ('${F}','f@example.test',now(),false),('${B}','b@example.test',now(),false);
insert into public.couples(id,name,started_on) values ('${C1}','Noi','2026-01-31');
insert into public.profiles(id,display_name,couple_id,role) values ('${F}','Alex','${C1}','francesco'),('${B}','Sam','${C1}','beatrice');
insert into public.calendar_entries(id,couple_id,entry_type,created_by,title,is_all_day,start_date,end_date)
  values ('${uid(201)}','${C1}','shared','${F}','Cena',true,'2026-10-24','2026-10-24');
insert into public.calendar_reminders(id,couple_id,entry_id,recipient_id,offset_minutes,requested_by,created_at)
  values ('${uid(301)}','${C1}','${uid(201)}','${F}',1440,'${F}',now());
insert into public.shared_messages(couple_id,sender_id,recipient_id,kind,body) values ('${C1}','${F}','${B}','think','ciao');`;

async function chain() {
  const db = await newDb();
  try {
    await db.exec(PLATFORM);
    // The account lifecycle (_s32_) redefines get_couple_membership on purpose, so
    // MC2's drift check cannot re-run after it; its own tests chain it after MC2
    // (tests/helpers/mc2-db.js).
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < FILE && !/_s32_/.test(f)).sort()) await db.exec(read(file));
    await db.exec(SEED);
    return db;
  } catch (error) { await db.close(); throw error; }
}
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const jobs = async (db) => (await rows(db, 'select jobname, schedule, command, active from cron.job order by jobid'));
const acl = (db, role) => rows(db, `select c.relname, a.privilege_type from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace cross join lateral pg_catalog.aclexplode(c.relacl) a
  where n.nspname = 'public' and a.grantee = $1::regrole order by 1, 2`, [role]);
const privs = async (db, role, table) => (await acl(db, role)).filter((r) => r.relname === table).map((r) => r.privilege_type).sort();

let db;
let before;
test.before(async () => {
  db = await chain();
  before = { jobs: await jobs(db), anon: await acl(db, 'anon'), authenticated: await acl(db, 'authenticated') };
  await db.exec(SQL);
  await db.exec(SQL); // re-applying changes nothing
});
test.after(async () => { if (db) await db.close(); });

test('N8: only the reminder dispatch job is unscheduled; reminders, the other jobs and the vault key stay', { timeout: 600000 }, async () => {
  assert.ok(before.jobs.some((j) => j.jobname === 'us-calendar-reminders-dispatch'), 'F2C scheduled it');
  const after = await jobs(db);
  assert.deepEqual(after, before.jobs.filter((j) => j.jobname !== 'us-calendar-reminders-dispatch'));
  assert.equal((await rows(db, 'select count(*)::int n from public.calendar_reminders'))[0].n, 1, 'no reminder deleted');
  assert.match(SQL, /perform cron\.unschedule\('us-calendar-reminders-dispatch'\)/);
  assert.doesNotMatch(SQL.replace(/--.*$/gm, ''), /\bdelete\s+from\b|\bdrop\s+(table|function|schema)\b|\btruncate\s+(table\s+)?public/i);
  assert.ok(fs.existsSync(path.join(ROOT, 'supabase/functions/calendar-reminders-worker/index.ts')), 'the worker stays for 1.1');
});

test('T4: anon keeps only SELECT on profiles; nobody can TRUNCATE; Stories keep what stories.js uses', { timeout: 600000 }, async () => {
  assert.ok(before.anon.some((r) => r.relname === 'shared_messages' && r.privilege_type === 'TRUNCATE'), 'the audited hole existed');
  assert.ok(before.anon.some((r) => r.relname === 'stories' && r.privilege_type === 'INSERT'));
  assert.deepEqual(await acl(db, 'anon'), [{ relname: 'profiles', privilege_type: 'SELECT' }]);
  const authenticated = await acl(db, 'authenticated');
  assert.deepEqual(authenticated.filter((r) => ['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'].includes(r.privilege_type)), []);
  assert.deepEqual(await privs(db, 'authenticated', 'stories'), ['DELETE', 'INSERT', 'SELECT']);
  assert.deepEqual(await privs(db, 'authenticated', 'story_views'), ['INSERT', 'SELECT']);
  // Everything else authenticated had for the app (select/insert/update/delete) is untouched.
  const keep = (list) => list.filter((r) => ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(r.privilege_type)
    && !(r.relname === 'stories' && r.privilege_type === 'UPDATE') && !(r.relname === 'story_views' && ['UPDATE', 'DELETE'].includes(r.privilege_type)));
  assert.deepEqual(keep(authenticated), keep(before.authenticated));
  assert.ok((await privs(db, 'service_role', 'shared_messages')).includes('TRUNCATE'), 'service_role untouched');

  await assert.rejects(as(db, null, 'truncate public.shared_messages', [], 'anon'), /permission denied/);
  await assert.rejects(as(db, F, 'truncate public.shared_messages', [], 'authenticated'), /permission denied/);
  await assert.rejects(as(db, null, 'insert into public.stories(couple_id) values (null)', [], 'anon'), /permission denied/);
  assert.equal((await rows(db, 'select count(*)::int n from public.shared_messages'))[0].n, 1);
  // The app's signed-in paths still work.
  const visible = await as(db, F, 'select count(*)::int as n from public.shared_messages', [], 'authenticated');
  assert.equal(visible[0].n, 1);
  assert.deepEqual(await as(db, null, 'select id from public.profiles', [], 'anon'), [], 'anon reads no profile row (RLS)');
});

test('the founder check in docs/store/US_1_0_LINGUA_E_CONTENUTI_SQL.md gives 0 | 0 | true', { timeout: 600000 }, async () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/store/US_1_0_LINGUA_E_CONTENUTI_SQL.md'), 'utf8');
  assert.ok(doc.split('\n').length <= 30, 'short page for the founder');
  const check = /```sql\n([\s\S]*?)```/.exec(doc)[1];
  assert.deepEqual(await rows(db, check), [{ promemoria_attivi: 0, permessi_anon: 0, lingua_pronta: true }]);
  const order = [...doc.matchAll(/`(\d{14}_[a-z0-9_]+\.sql)`/g)].map((m) => m[1]);
  assert.deepEqual(order, ['20261014220000_content_1_0.sql', '20261014230000_us_1_0_locale_content_en.sql', FILE]);
  for (const file of order) assert.ok(fs.existsSync(path.join(DIR, file)), file);
  for (const fn of [...doc.matchAll(/^- `([a-z0-9-]+)`(?: e `([a-z0-9-]+)`)?/gm)].flatMap((m) => [m[1], m[2]]).filter(Boolean)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'supabase/functions', fn, 'index.ts')), fn);
  }
});

test('MC2 and the locale migration still verify after this file', { timeout: 600000 }, async () => {
  await db.exec(read(MC2));
  await db.exec(read(LOCALE));
  await db.exec(SQL);
  assert.deepEqual(await acl(db, 'anon'), [{ relname: 'profiles', privilege_type: 'SELECT' }]);
});

test('preflight: a duplicated or foreign-owned reminder job aborts before any change', { timeout: 600000 }, async () => {
  const fresh = await chain();
  try {
    await fresh.exec(`insert into cron.job(jobname, schedule, command, username) values ('us-calendar-reminders-dispatch', '* * * * *', 'select 1', 'someone_else')`);
    await assert.rejects(fresh.exec(SQL), /us-calendar-reminders-dispatch exists 2 times/);
    await fresh.exec(`delete from cron.job where username = 'someone_else'`);
    await fresh.exec(`update cron.job set username = 'someone_else' where jobname = 'us-calendar-reminders-dispatch'`);
    await assert.rejects(fresh.exec(SQL), /owned by another role/);
    assert.ok((await acl(fresh, 'anon')).some((r) => r.relname === 'shared_messages' && r.privilege_type === 'TRUNCATE'), 'nothing changed');
    await fresh.exec(`update cron.job set username = current_user where jobname = 'us-calendar-reminders-dispatch'`);
    await fresh.exec(SQL);
    assert.ok(!(await jobs(fresh)).some((j) => j.jobname === 'us-calendar-reminders-dispatch'));
    // Absent job: nothing to do, no error.
    await fresh.exec(SQL);
  } finally { await fresh.close(); }
});
