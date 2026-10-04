// US 2.0 F2C — Edge & cron source of truth.
//
// Proves, without production access, that:
//   * the F2C migration is the first forward migration after the F2A.2
//     baseline and carries exactly the seven production cron jobs: names,
//     schedules and command bytes from the F2A.1 capture (which the F2C
//     read-only preflight found unchanged in production), with the Edge URL
//     read from vault `us_project_url` instead of a hard-coded project;
//   * baseline + F2C on an empty database gives the production fingerprint,
//     cron included (modulo that URL), and applying it over the existing
//     production cron state updates the seven jobs in place: no duplicate, no
//     new jobid, idempotent; it aborts, changing nothing, when the vault value
//     is missing or wrong, or a job has another owner or a duplicate;
//   * calendar-reminders-worker configures VAPID before any Web Push and
//     before consuming a dedupe key (it never did);
//   * every Web Push producer takes VAPID_SUBJECT from Edge configuration
//     through one helper, fails closed without it, and no VAPID private value
//     is in the repo.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, loadCapture } = require('../scripts/supabase-baseline/evidence.cjs');
const { BASELINE_FILE, BASELINE_VERSION } = require('../scripts/supabase-baseline/migration.cjs');
const { newDb, rebuild, readBaseline, fingerprint } = require('../scripts/supabase-baseline/rebuild.cjs');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');

const MIGRATIONS = 'supabase/migrations';
const F2C_FILE = '20261004110718_f2c_edge_cron_source_of_truth.sql';
const F2C = read(`${MIGRATIONS}/${F2C_FILE}`);
const BASELINE_SQL = read(`${MIGRATIONS}/${BASELINE_FILE}`);
const CAPTURE = loadCapture();
const PREFLIGHT = JSON.parse(read('docs/us-2.0/F2C_PRODUCTION_PREFLIGHT.json'));
const PROJECT_REF = 'iiakdfsxpywdkxravqjh';

// The one F2C change to a captured command: the hard-coded Edge URL becomes
// the vault origin + /functions/v1/<function>.
const HARD_CODED_URL = new RegExp(`'https://${PROJECT_REF}\\.supabase\\.co/functions/v1/([a-z0-9-]+)'`);
const vaultUrl = (fn) => `(select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'us_project_url' limit 1) || '/functions/v1/${fn}'`;
const VAULT_URL = /\(select rtrim\(decrypted_secret, '\/'\) from vault\.decrypted_secrets where name = 'us_project_url' limit 1\) \|\| '\/functions\/v1\/([a-z0-9-]+)'/;
const toProduction = (command) => command.replace(VAULT_URL, (_, fn) => `'https://${PROJECT_REF}.supabase.co/functions/v1/${fn}'`);

const CAPTURED = CAPTURE.f2a1_c09_cron_vault.jobs;
const INTENDED = CAPTURED.map((job) => {
  const edge = job.command.match(HARD_CODED_URL);
  return { name: job.name, schedule: job.schedule, edgeFunction: edge ? edge[1] : null, command: job.command.replace(HARD_CODED_URL, (_, fn) => vaultUrl(fn)) };
});
const EXPECTED_JOBS = [
  ['us-monthiversary-hourly', '5 * * * *', 'monthiversary-job'],
  ['us-widget-scriptable-state-expiry', '* * * * *', null],
  ['us-calendar-reminders-dispatch', '* * * * *', 'calendar-reminders-worker'],
  ['us-left-for-you-push-sweep', '* * * * *', 'left-for-you-push-worker'],
  ['us-daily-question-materialize', '1 * * * *', null],
  ['us-daily-question-push', '*/10 * * * *', 'daily-question-push-worker'],
  ['us-game-v2-push', '*/10 * * * *', 'game-v2-push-worker'],
];

async function freshBaseline() {
  const db = await newDb();
  await db.exec(BASELINE_SQL);
  return db;
}
// Production before F2C: the baseline + the captured cron state (90_cron.sql).
async function productionLike() {
  const db = await freshBaseline();
  await db.exec(readBaseline()['90_cron.sql']);
  return db;
}
const jobs = async (db) => (await db.query('select jobid, jobname, schedule, command, active, username from cron.job order by jobid')).rows;
const provisionUrl = (db, value) => db.query(`select vault.create_secret($1, 'us_project_url')`, [value]);

// ------------------------------------------------------------ source

test('F2C migration: created by the CLI after the baseline, the only forward migration', () => {
  const files = fs.readdirSync(path.join(ROOT, MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(files, [BASELINE_FILE, F2C_FILE]);
  assert.ok(F2C_FILE.slice(0, 14) > BASELINE_VERSION);
  const cutoff = JSON.parse(read('supabase/baseline/MIGRATION_CUTOFF.json'));
  assert.deepEqual(cutoff.forward_migrations, [F2C_FILE]);
  // 90_cron.sql stays the F2A.1 capture: never part of an executable migration.
  assert.doesNotMatch(BASELINE_SQL, /cron\.schedule/);
  assert.doesNotMatch(F2C, /90_cron\.sql[^\n]*apply|\\i /);
});

test('F2C cron source: exactly the seven production jobs, schedules preserved', () => {
  assert.deepEqual(INTENDED.map((j) => [j.name, j.schedule, j.edgeFunction]), EXPECTED_JOBS);
  // The capture the migration is built from is what production runs today
  // (F2C read-only preflight: same md5 and length for every command).
  assert.deepEqual(PREFLIGHT.cron_jobs.map((j) => [j.jobid, j.jobname, j.schedule, j.active, j.username]), CAPTURED.map((j) => [j.id, j.name, j.schedule, true, 'postgres']));
  for (const job of CAPTURED) {
    const live = PREFLIGHT.cron_jobs.find((j) => j.jobname === job.name);
    assert.equal(live.command_md5, md5(job.command), `${job.name}: production drifted since F2A.1`);
    assert.equal(live.command_length, job.command.length);
  }
  // Every intended command is in the migration verbatim.
  for (const job of INTENDED) assert.ok(F2C.includes(`('${job.name}', '${job.schedule}', $cron$${job.command}$cron$)`), job.name);
  assert.equal((F2C.match(/\$cron\$\)/g) || []).length, 7);
});

test('F2C cron source: no executable migration hard-codes the project URL', () => {
  for (const file of fs.readdirSync(path.join(ROOT, MIGRATIONS))) {
    const sql = read(`${MIGRATIONS}/${file}`);
    assert.doesNotMatch(sql, new RegExp(PROJECT_REF), file);
    assert.doesNotMatch(sql, /https:\/\/[a-z0-9]+\.supabase\.co/, file);
  }
  for (const job of INTENDED) {
    if (job.edgeFunction) assert.equal(job.command.match(VAULT_URL)[1], job.edgeFunction, job.name);
    else assert.equal(job.command, CAPTURED.find((j) => j.name === job.name).command, `${job.name}: no URL, bytes unchanged`);
    assert.equal(toProduction(job.command), CAPTURED.find((j) => j.name === job.name).command, `${job.name}: only the URL changed`);
  }
});

// ------------------------------------------------------------ fresh database

test('F2C fresh database: baseline + F2C schedules the seven jobs once, idempotently', { timeout: 120000 }, async () => {
  const db = await freshBaseline();
  assert.deepEqual(await jobs(db), [], 'the baseline schedules nothing');
  await db.exec(F2C);
  const first = await jobs(db);
  assert.deepEqual(first.map((j) => [j.jobid, j.jobname, j.schedule, j.command, j.active]), INTENDED.map((j, i) => [i + 1, j.name, j.schedule, j.command, true]));
  await db.exec(F2C);
  assert.deepEqual(await jobs(db), first, 're-applying changes nothing');
  await db.close();
});

test('F2C Edge URL: derived from vault us_project_url when the job runs; none without it', { timeout: 120000 }, async () => {
  const db = await freshBaseline();
  await db.exec(F2C);
  await db.exec(`
    create table net.f2c_calls (url text, headers jsonb);
    create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
    returns bigint language plpgsql as $$ begin insert into net.f2c_calls values (url, headers); return 1; end $$;`);
  const edgeJobs = (await jobs(db)).filter((j) => INTENDED.find((i) => i.name === j.jobname).edgeFunction && j.jobname !== 'us-daily-question-push');
  const run = async () => {
    await db.exec('delete from net.f2c_calls');
    for (const job of edgeJobs) await db.exec(job.command);
    return (await db.query('select url, headers from net.f2c_calls')).rows;
  };
  // Not provisioned: no URL, so nothing can be called (pg_net rejects a null URL).
  assert.deepEqual((await run()).map((c) => c.url), edgeJobs.map(() => null));
  await provisionUrl(db, 'https://example-ref.supabase.co/');
  await db.query(`select vault.create_secret('cron-key-test', 'us_monthiversary_cron_key')`);
  const calls = await run();
  assert.deepEqual(calls.map((c) => c.url), edgeJobs.map((j) => `https://example-ref.supabase.co/functions/v1/${INTENDED.find((i) => i.name === j.jobname).edgeFunction}`));
  assert.equal(calls[0].headers['x-us-cron-key'], 'cron-key-test', 'the cron key still comes from its own vault secret');
  // The daily-question push job materialises today's question first; its URL
  // expression is the same one.
  assert.match(INTENDED.find((j) => j.name === 'us-daily-question-push').command, /\) \|\| '\/functions\/v1\/daily-question-push-worker'/);
  await db.close();
});

test('F2C rebuild: empty PostgreSQL + supabase/migrations = the production fingerprint, cron included', { timeout: 300000 }, async () => {
  const searchPath = CAPTURE.f2a1_c01_meta.search_path;
  const fromBaseline = await rebuild();
  const expected = await fingerprint(fromBaseline, searchPath);
  await fromBaseline.close();

  const db = await newDb();
  for (const file of [BASELINE_FILE, F2C_FILE]) await db.exec(read(`${MIGRATIONS}/${file}`));
  const got = await fingerprint(db, searchPath);
  await db.close();

  // Cron: the same jobs; each command equals production once the vault URL is
  // read as the production project.
  const asProduction = (list) => list.map((j) => ({ ...j, command: toProduction(j.command) }));
  assert.ok(got.f2a.f2a_11_cron.jobs.every((j) => !new RegExp(PROJECT_REF).test(j.command)));
  assert.deepEqual(asProduction(got.f2a.f2a_11_cron.jobs), expected.f2a.f2a_11_cron.jobs);
  assert.deepEqual(asProduction(got.capture.f2a1_c09_cron_vault.jobs), expected.capture.f2a1_c09_cron_vault.jobs);
  const sortRows = (rows) => [...(rows || [])].map((r) => JSON.stringify(r)).sort();
  for (const [alias, value] of Object.entries(expected.f2a)) if (alias !== 'f2a_11_cron') assert.deepEqual(got.f2a[alias], value, alias);
  for (const [alias, value] of Object.entries(expected.capture)) {
    if (alias === 'f2a1_c09_cron_vault') assert.deepEqual(got.capture[alias].vault, value.vault);
    else if (alias === 'f2a1_c08_realtime_storage') {
      assert.deepEqual(sortRows(got.capture[alias].members), sortRows(value.members));
      assert.deepEqual({ ...got.capture[alias], members: null }, { ...value, members: null });
    } else assert.deepEqual(got.capture[alias], value, alias);
  }
});

// ------------------------------------------------------------ existing production state

test('F2C over production cron: updates the seven jobs in place, no duplicate, idempotent', { timeout: 120000 }, async () => {
  const db = await productionLike();
  const before = await jobs(db);
  assert.equal(before.length, 7);
  await provisionUrl(db, `https://${PROJECT_REF}.supabase.co`);
  await db.exec(F2C);
  const after = await jobs(db);
  assert.deepEqual(after.map((j) => [j.jobid, j.jobname, j.schedule, j.active, j.username]), before.map((j) => [j.jobid, j.jobname, j.schedule, j.active, j.username]), 'same jobs, same ids');
  assert.deepEqual(after.map((j) => j.command), INTENDED.map((j) => j.command));
  await db.exec(F2C);
  assert.deepEqual(await jobs(db), after, 're-applying changes nothing');
  await db.close();
});

test('F2C over production cron: aborts and changes nothing without the right us_project_url', { timeout: 120000 }, async () => {
  const db = await productionLike();
  const before = await jobs(db);
  await assert.rejects(db.exec(F2C), /provision vault secret us_project_url/);
  assert.deepEqual(await jobs(db), before);
  await provisionUrl(db, 'https://another-project.supabase.co');
  await assert.rejects(db.exec(F2C), /differs from the URL cron job us-monthiversary-hourly calls today/);
  assert.deepEqual(await jobs(db), before);
  await db.query(`update vault.secrets set secret = 'https://${PROJECT_REF}.supabase.co/functions/v1' where name = 'us_project_url'`);
  await assert.rejects(db.exec(F2C), /malformed value/);
  assert.deepEqual(await jobs(db), before);
  await db.close();
});

test('F2C over production cron: a job of another owner or a duplicate aborts instead of adding one', { timeout: 120000 }, async () => {
  const db = await productionLike();
  await provisionUrl(db, `https://${PROJECT_REF}.supabase.co`);
  await db.query(`update cron.job set username = 'someone_else' where jobname = 'us-game-v2-push'`);
  const foreign = await jobs(db);
  await assert.rejects(db.exec(F2C), /us-game-v2-push is owned by someone_else/);
  assert.deepEqual(await jobs(db), foreign, 'nothing changed, no second job');
  await db.query(`update cron.job set username = current_user where jobname = 'us-game-v2-push'`);
  await db.query(`insert into cron.job (jobname, schedule, command, username) values ('us-game-v2-push', '*/10 * * * *', 'select 1', 'someone_else')`);
  const duplicated = await jobs(db);
  await assert.rejects(db.exec(F2C), /us-game-v2-push exists 2 times/);
  assert.deepEqual(await jobs(db), duplicated);
  await db.close();
});

// ------------------------------------------------------------ calendar-reminders-worker

const VAPID_PUBLIC_KEY = 'BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss';
const cronRequest = (key = 'cron-ok') => new Request('https://edge.test/functions/v1/calendar-reminders-worker', { method: 'POST', headers: { 'x-us-cron-key': key } });

function calendarFixture({ startsInMinutes = 30, vapidPrivate = 'vapid-private-test' } = {}) {
  let admin = null;
  const order = [];
  const rpc = { get_internal_calendar_reminders_cron_key: 'cron-ok' };
  if (vapidPrivate) rpc.get_internal_vapid_private_key = () => { order.push(`vapid:${admin.db.push_event_log.length}`); return vapidPrivate; };
  admin = createFakeAdmin({
    tables: {
      calendar_reminders: [{ id: 'r1', couple_id: 'c1', entry_id: 'e1', recipient_id: 'u2', offset_minutes: 60, requested_by: 'u1', sent_at: null }],
      calendar_entries: [{ id: 'e1', couple_id: 'c1', entry_type: 'shared', title: 'Cena', is_all_day: false, starts_at: new Date(Date.now() + startsInMinutes * 60000).toISOString(), start_date: null }],
      profiles: [{ id: 'u1', display_name: 'Bea' }],
      push_subscriptions: [
        { id: 's1', user_id: 'u2', endpoint: 'https://push.test/live', p256dh: 'p', auth_key: 'a' },
        { id: 's2', user_id: 'u2', endpoint: 'https://push.test/gone', p256dh: 'p', auth_key: 'a' },
      ],
      push_event_log: [],
    },
    rpc,
  });
  // A real push service: an unsigned send is rejected (403), a stale one is 410.
  const webpush = createFakeWebPush({ failures: { 'https://push.test/gone': 410 }, requireVapid: true });
  return { admin, webpush, order };
}

test('F2C calendar-reminders-worker: configures VAPID before Web Push and before the dedupe key', async () => {
  const { admin, webpush, order } = calendarFixture();
  const fn = await loadEdgeFunction('calendar-reminders-worker', { admin, webpush });
  const res = await fn.call(cronRequest());
  // Before F2C the worker never called setVapidDetails: the push service
  // rejected every send (delivered 0, failed 1) and the consumed dedupe key
  // marked the reminder sent on the next run, so it was lost.
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, due: 1, delivered: 1, failed: 0 });
  assert.deepEqual(webpush.vapid, [['mailto:push-test@example.invalid', VAPID_PUBLIC_KEY, 'vapid-private-test']]);
  assert.deepEqual(order, ['vapid:0'], 'VAPID is configured before any dedupe key is consumed');
  // Preserved: payload, dedupe, stale-subscription cleanup, sent_at.
  assert.equal(webpush.sent.length, 1);
  const { payload, options } = webpush.sent[0];
  assert.equal(payload.title, 'US. · Calendar');
  assert.match(payload.body, /^Bea ti ricorda — Cena alle \d\d:\d\d ♡$/);
  assert.equal(payload.tag, 'calendar-reminder-r1');
  assert.deepEqual(options, { TTL: 43200, urgency: 'high' });
  assert.deepEqual(admin.db.push_event_log.map((r) => [r.dedupe_key, r.event_type]), [['calendar-reminder:r1', 'calendar_reminder']]);
  assert.deepEqual(admin.db.push_subscriptions.map((s) => s.id), ['s1'], 'the 410 subscription is removed');
  assert.ok(admin.db.calendar_reminders[0].sent_at);
  // A second run sends nothing again.
  const again = await fn.call(cronRequest());
  assert.deepEqual(again.body, { ok: true, due: 0, delivered: 0, failed: 0 });
  assert.equal(webpush.sent.length, 1);
});

for (const [label, env, vapidPrivate] of [
  ['VAPID private key unavailable', {}, null],
  ['VAPID_SUBJECT not configured', { VAPID_SUBJECT: undefined }, 'vapid-private-test'],
  ['VAPID_SUBJECT not https/mailto', { VAPID_SUBJECT: 'http://us.example' }, 'vapid-private-test'],
]) {
  test(`F2C calendar-reminders-worker: ${label} → 500, no dedupe key consumed, retried later`, async () => {
    const { admin, webpush } = calendarFixture({ vapidPrivate });
    const fn = await loadEdgeFunction('calendar-reminders-worker', { admin, webpush, env });
    const res = await fn.call(cronRequest());
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Reminder dispatch failed' });
    assert.deepEqual(admin.db.push_event_log, []);
    assert.equal(admin.db.calendar_reminders[0].sent_at, null);
    assert.deepEqual(webpush.sent, []);
    assert.deepEqual(webpush.vapid, []);
  });
}

test('F2C calendar-reminders-worker: cron-key auth and the nothing-due path never touch VAPID', async () => {
  const unauthorized = calendarFixture();
  const fn = await loadEdgeFunction('calendar-reminders-worker', unauthorized);
  assert.equal((await fn.call(cronRequest('wrong'))).status, 401);
  assert.ok(!unauthorized.admin.log.rpc.includes('get_internal_vapid_private_key'));
  const notDue = calendarFixture({ startsInMinutes: 600 });
  const later = await loadEdgeFunction('calendar-reminders-worker', notDue);
  assert.deepEqual((await later.call(cronRequest())).body, { ok: true, due: 0, delivered: 0, failed: 0 });
  assert.ok(!notDue.admin.log.rpc.includes('get_internal_vapid_private_key'));
});

// ------------------------------------------------------------ monthiversary-job

async function atRomeNine(fn) {
  const RealDate = Date;
  const fixed = RealDate.parse('2026-10-04T07:30:00Z'); // 09:30 Europe/Rome (CEST)
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}

function monthiversaryFixture() {
  const awards = [];
  const admin = createFakeAdmin({
    tables: {
      couples: [{ id: 'c1', started_on: '2026-01-04' }],
      profiles: [{ id: 'u1', couple_id: 'c1' }],
      notification_preferences: [],
      push_subscriptions: [{ id: 's1', user_id: 'u1', endpoint: 'https://push.test/live', p256dh: 'p', auth_key: 'a' }],
    },
    rpc: {
      get_internal_monthiversary_cron_key: 'cron-ok',
      get_internal_vapid_private_key: 'vapid-private-test',
      award_relationship_milestone: (args) => { awards.push(args); return true; },
    },
  });
  return { admin, awards, webpush: createFakeWebPush({ requireVapid: true }) };
}
const monthiversaryRequest = () => new Request('https://edge.test/functions/v1/monthiversary-job', { method: 'POST', headers: { 'x-us-cron-key': 'cron-ok' } });

test('F2C monthiversary-job: VAPID subject from Edge configuration, otherwise fails before any award', async () => {
  const ok = monthiversaryFixture();
  const fn = await loadEdgeFunction('monthiversary-job', { admin: ok.admin, webpush: ok.webpush, env: { VAPID_SUBJECT: 'https://contact.example' } });
  const res = await atRomeNine(() => fn.call(monthiversaryRequest()));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, awarded: 1, delivered: 1, date: '2026-10-04' });
  assert.deepEqual(ok.webpush.vapid, [['https://contact.example', VAPID_PUBLIC_KEY, 'vapid-private-test']]);
  assert.equal(ok.awards[0].target_months, 9);

  const missing = monthiversaryFixture();
  const failing = await loadEdgeFunction('monthiversary-job', { admin: missing.admin, webpush: missing.webpush, env: { VAPID_SUBJECT: undefined } });
  const failed = await atRomeNine(() => failing.call(monthiversaryRequest()));
  assert.equal(failed.status, 500);
  assert.deepEqual(missing.awards, [], 'no milestone awarded without a push configuration');
  assert.deepEqual(missing.webpush.sent, []);
});

test('F2C monthiversary-job: still cron-only with verify_jwt = false', () => {
  assert.match(read('supabase/config.toml'), /\[functions\.monthiversary-job\]\r?\nverify_jwt = false/);
  assert.match(read('supabase/functions/monthiversary-job/index.ts'), /get_internal_monthiversary_cron_key/);
});

// ------------------------------------------------------------ VAPID_SUBJECT source of truth

const functionSources = () => {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|mjs|js)$/.test(e.name)) out[rel] = read(rel);
    }
  };
  walk('supabase/functions');
  return out;
};

test('F2C VAPID_SUBJECT: every Web Push producer reads it through the one helper', () => {
  const sources = functionSources();
  const producers = Object.keys(sources).filter((f) => sources[f].includes('setVapidDetails(')).sort();
  assert.deepEqual(producers, [
    'supabase/functions/_shared/think-web-push.ts',
    'supabase/functions/calendar-reminders-worker/index.ts',
    'supabase/functions/daily-question-push-worker/index.ts',
    'supabase/functions/game-v2-push-worker/index.ts',
    'supabase/functions/game-v2-push/index.ts',
    'supabase/functions/left-for-you-push-worker/index.ts',
    'supabase/functions/monthiversary-job/index.ts',
    'supabase/functions/send-web-push/index.ts',
  ]);
  for (const file of producers) {
    const source = sources[file];
    assert.match(source, /import \{ vapidSubject \} from "\.\.?\/(_shared\/)?web-push-vapid\.mjs";/, file);
    const calls = source.match(/setVapidDetails\((?:[^()]|\([^()]*\))*\)/g);
    // monthiversary-job keeps its recovered, minified layout: compare without spaces.
    for (const call of calls) assert.equal(call.replace(/\s+/g, ''), 'setVapidDetails(vapidSubject(),VAPID_PUBLIC_KEY,vapidPrivateasstring)', file);
    assert.doesNotMatch(source, /VAPID_SUBJECT\s*=/, file);
  }
  // No subject literal anywhere in Edge code: a domain change needs no deploy.
  for (const [file, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /usfinal|vercel\.app|pages\.dev/i, file);
    // The helper validates the scheme; no producer may carry its own subject.
    if (!file.endsWith('_shared/web-push-vapid.mjs')) assert.doesNotMatch(source, /mailto:/i, file);
  }
  // Every function that sends Web Push also configures VAPID (the M6D defect class).
  for (const [file, source] of Object.entries(sources)) {
    if (!/webpush\.sendNotification\(/.test(source)) continue;
    assert.ok(source.includes('setVapidDetails(vapidSubject()'), `${file} sends Web Push without configuring VAPID`);
  }
  // Edge configuration, listed with its consumers.
  const manifest = JSON.parse(read('supabase/SECRETS_MANIFEST.json'));
  const entry = manifest.edge_env.find((v) => v.name === 'VAPID_SUBJECT');
  assert.ok(entry, 'VAPID_SUBJECT is in SECRETS_MANIFEST.json');
  for (const fn of ['calendar-reminders-worker', 'daily-question-push-worker', 'game-v2-push', 'game-v2-push-worker', 'left-for-you-push-worker', 'monthiversary-job', 'send-web-push', 'widget-think-send']) {
    assert.ok(entry.edge_consumers.includes(fn), fn);
  }
});

test('F2C VAPID_SUBJECT helper: https or mailto only, fails closed when unset', async () => {
  const { isValidVapidSubject, vapidSubject } = await import('../supabase/functions/_shared/web-push-vapid.mjs');
  for (const ok of ['https://usfinal.vercel.app', 'https://us-a33.pages.dev/', 'mailto:ops@example.com']) assert.ok(isValidVapidSubject(ok), ok);
  for (const bad of ['', ' ', 'http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://user:pw@example.com', 'mailto:nobody', 'example.com', 'ftp://example.com', ' https://example.com', null, undefined, 42]) {
    assert.ok(!isValidVapidSubject(bad), String(bad));
  }
  const previous = globalThis.Deno;
  try {
    for (const [value, expected] of [['https://contact.example', 'https://contact.example'], ['  mailto:ops@example.com \n', 'mailto:ops@example.com']]) {
      globalThis.Deno = { env: { get: () => value } };
      assert.equal(vapidSubject(), expected);
    }
    for (const value of [undefined, '', 'http://example.com']) {
      globalThis.Deno = { env: { get: () => value } };
      assert.throws(() => vapidSubject(), /^Error: push_configuration_unavailable$/);
    }
  } finally {
    if (previous === undefined) delete globalThis.Deno; else globalThis.Deno = previous;
  }
});

test('F2C secrets: no VAPID private value in the repo, the new names are listed without values', () => {
  const sources = functionSources();
  // A VAPID private key is 43 base64url characters; only the public key (87)
  // may appear, and the private one always comes from the vault RPC.
  const files = { ...sources };
  for (const rel of [`${MIGRATIONS}/${F2C_FILE}`, 'supabase/SECRETS_MANIFEST.json', 'docs/us-2.0/F2C_PRODUCTION_PREFLIGHT.json', 'docs/us-2.0/F2C_EDGE_CRON_SOURCE_OF_TRUTH.md']) files[rel] = read(rel);
  for (const [file, text] of Object.entries(files)) {
    for (const token of text.match(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,46}(?![A-Za-z0-9_-])/g) || []) {
      assert.ok(!(/[A-Z]/.test(token) && /[a-z]/.test(token) && /\d/.test(token)), `${file}: key-shaped value ${token.slice(0, 6)}…`);
    }
    if (file.startsWith('supabase/functions/')) {
      for (const key of text.match(/"B[A-Za-z0-9_-]{86}"/g) || []) assert.equal(key, `"${VAPID_PUBLIC_KEY}"`, `${file}: only the public key`);
      assert.doesNotMatch(text, /console\.[a-z]+\([^)]*vapidPrivate/, `${file}: never logs the private key`);
    }
  }
  const manifest = JSON.parse(read('supabase/SECRETS_MANIFEST.json'));
  const url = manifest.vault.find((v) => v.name === 'us_project_url');
  assert.ok(url && /F2C/.test(url.introduced_by));
  assert.deepEqual(url.read_by_sql, EXPECTED_JOBS.filter((j) => j[2]).map((j) => `cron ${j[0]}`));
  assert.ok(manifest.vault.find((v) => v.name === 'us_web_push_vapid_private').edge_consumers.includes('calendar-reminders-worker'));
});
