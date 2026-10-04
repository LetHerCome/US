// M10C — Domanda del giorno: push di SISTEMA quando nasce la domanda del nuovo
// giorno Europe/Rome. Il core gira con un admin Supabase finto; il worker
// Edge Function reale gira sotto Node (esbuild + doppi npm:/jsr:); la
// migration gira su Postgres embedded (pglite) insieme alla migration M9E.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness.js');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const loadCore = () => import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/daily-question-push-core.mjs')).href);
const MIGRATION = 'supabase/migrations_history/20260930061045_m10c_daily_question_push.sql';
const M9E = 'supabase/migrations_history/20260930045233_m9e_daily_question_engine.sql';

const COUPLE = 'couple-1';
const F = 'francesco-id';
const B = 'beatrice-id';
const Q1 = { id: 'q-2026-10-05', question_date: '2026-10-05', question: 'Quale momento della giornata vorresti passare più spesso con me?' };
const Q2 = { id: 'q-2026-10-06', question_date: '2026-10-06', question: 'Qual è la parola italiana che ti piace di più?' };
const AT = (iso) => new Date(iso);
const MON_10_ROME = AT('2026-10-05T08:00:00Z'); // 10:00 CEST
const TUE_10_ROME = AT('2026-10-06T08:00:00Z');
const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });

function world({ questions = [Q1], answers = [], preferences = [], subscriptions = [sub('s-fra', F), sub('s-bea', B)], extraProfiles = [], errors } = {}) {
  return createFakeAdmin({
    tables: {
      profiles: [{ id: F, couple_id: COUPLE, display_name: 'Francesco' }, { id: B, couple_id: COUPLE, display_name: 'Beatrice' }, ...extraProfiles],
      daily_questions: questions,
      daily_answers: answers,
      notification_preferences: preferences,
      push_subscriptions: subscriptions,
      push_event_log: [],
    },
    rpc: { get_internal_vapid_private_key: 'vapid-private', get_internal_daily_question_push_cron_key: 'cron-key-ok' },
    errors,
  });
}
async function run(admin, now, webpush = createFakeWebPush(), extra = {}) {
  const { dispatchDailyQuestionPush } = await loadCore();
  const result = await dispatchDailyQuestionPush(admin, { now, sendNotification: webpush.sendNotification.bind(webpush), ...extra });
  return { result, webpush };
}

test('M10C: nuova domanda del giorno → entrambi i membri ricevono UNA push di sistema verso Today', async () => {
  const admin = world();
  const { result, webpush } = await run(admin, MON_10_ROME);
  assert.equal(result.day, '2026-10-05');
  assert.equal(result.questionId, Q1.id);
  assert.equal(result.delivered, 2);
  assert.deepEqual(webpush.sent.map((s) => s.endpoint).sort(), ['https://push.example/s-bea', 'https://push.example/s-fra']);
  for (const { payload, options } of webpush.sent) {
    assert.deepEqual(payload, {
      title: 'US. · Domanda del giorno',
      body: "C'è una nuova domanda per voi.",
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `daily-question-${Q1.id}`,
      target: 'today',
      url: '/?open=today&from=push',
    });
    assert.equal(options.urgency, 'normal');
    assert.equal(options.TTL, 60 * 60 * 12);
  }
  // Notifica di sistema: nessun mittente finto nel log di dedupe.
  const claims = admin.db.push_event_log;
  assert.deepEqual(claims.map((row) => row.dedupe_key).sort(), [`daily-question:${Q1.id}:${B}`, `daily-question:${Q1.id}:${F}`]);
  assert.ok(claims.every((row) => row.sender_id === null && row.event_type === 'daily_question' && row.couple_id === COUPLE));
});

test('M10C: il testo della domanda non finisce mai nel payload della lock screen', async () => {
  const { webpush } = await run(world(), MON_10_ROME);
  assert.ok(webpush.sent.length > 0);
  for (const { payload } of webpush.sent) {
    const raw = JSON.stringify(payload);
    assert.doesNotMatch(raw, /Quale momento|passare più spesso/);
    assert.equal(raw.includes(Q1.question), false);
  }
  const core = read('supabase/functions/_shared/daily-question-push-core.mjs');
  const payloadFn = core.slice(core.indexOf('export function dailyQuestionPushPayload'), core.indexOf('export function romeClock'));
  assert.doesNotMatch(payloadFn, /question\.question|questionText|\.question\b/);
  assert.match(core, /\.select\('id,question_date'\)/, 'the worker never even reads the question text');
});

test('M10C: retry e run sovrapposti non duplicano; il giorno dopo si notifica di nuovo', async () => {
  const admin = world({ questions: [Q1, Q2] });
  const webpush = createFakeWebPush();
  await run(admin, MON_10_ROME, webpush);
  const again = await run(admin, AT('2026-10-05T08:10:00Z'), webpush);
  assert.equal(again.result.delivered, 0);
  assert.deepEqual(again.result.recipients.map((r) => r.outcome), ['deduplicated', 'deduplicated']);
  // Two workers racing on the same run: still one logical notification per user.
  await Promise.all([run(admin, MON_10_ROME, webpush), run(admin, MON_10_ROME, webpush)]);
  assert.equal(webpush.sent.length, 2, 'Monday: one per member');

  const tuesday = await run(admin, TUE_10_ROME, webpush);
  assert.equal(tuesday.result.questionId, Q2.id);
  assert.equal(tuesday.result.delivered, 2);
  assert.equal(webpush.sent.length, 4);
  assert.deepEqual(webpush.sent.slice(2).map((s) => s.payload.tag), [`daily-question-${Q2.id}`, `daily-question-${Q2.id}`]);
});

test('M10C: race reale sul claim (stessa chiave inserita fra lettura e insert) → 23505 = deduplicated, nessun invio', async () => {
  const admin = world();
  admin.db.push_event_log.push({ dedupe_key: `daily-question:${Q1.id}:${F}` });
  const originalFrom = admin.from.bind(admin);
  let hidden = true;
  // The pre-read misses the concurrent claim; the unique insert still wins.
  admin.from = (table) => {
    const builder = originalFrom(table);
    if (table !== 'push_event_log' || !hidden) return builder;
    const select = builder.select;
    builder.select = (...args) => { hidden = false; const b = select(...args); b.in = () => b; b.then = (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej); return b; };
    return builder;
  };
  const { result, webpush } = await run(admin, MON_10_ROME);
  assert.equal(result.recipients.find((r) => r.userId === F).outcome, 'deduplicated');
  assert.deepEqual(webpush.sent.map((s) => s.endpoint), ['https://push.example/s-bea']);
});

test('M10C: fallimento totale non brucia la chiave: il run successivo consegna', async () => {
  const admin = world();
  const failing = createFakeWebPush({ failures: { 'https://push.example/s-fra': 500, 'https://push.example/s-bea': 503 } });
  const first = await run(admin, MON_10_ROME, failing);
  assert.equal(first.result.delivered, 0);
  assert.deepEqual(first.result.recipients.map((r) => r.outcome), ['failed', 'failed']);
  assert.equal(admin.db.push_event_log.length, 0, 'claims released');
  assert.equal(admin.db.push_subscriptions.length, 2, '5xx does not remove subscriptions');
  const second = await run(admin, AT('2026-10-05T08:10:00Z'));
  assert.equal(second.result.delivered, 2);
});

test('M10C: nessuna subscription → nessun invio e chiave rilasciata; dopo l’attivazione arriva', async () => {
  const admin = world({ subscriptions: [sub('s-fra', F)] });
  const first = await run(admin, MON_10_ROME);
  assert.deepEqual(Object.fromEntries(first.result.recipients.map((r) => [r.userId, r.outcome])), { [F]: 'delivered', [B]: 'not-subscribed' });
  assert.deepEqual(admin.db.push_event_log.map((row) => row.dedupe_key), [`daily-question:${Q1.id}:${F}`]);
  admin.db.push_subscriptions.push(sub('s-bea', B));
  const later = await run(admin, AT('2026-10-05T09:00:00Z'));
  assert.deepEqual(later.webpush.sent.map((s) => s.endpoint), ['https://push.example/s-bea']);
});

test('M10C: subscription 404/410 rimosse, le altre ricevono comunque', async () => {
  const admin = world({ subscriptions: [sub('s-fra-old', F), sub('s-fra', F), sub('s-bea-old', B), sub('s-bea', B)] });
  const webpush = createFakeWebPush({ failures: { 'https://push.example/s-fra-old': 410, 'https://push.example/s-bea-old': 404 } });
  const { result } = await run(admin, MON_10_ROME, webpush);
  assert.equal(result.delivered, 2);
  assert.deepEqual(admin.db.push_subscriptions.map((s) => s.id).sort(), ['s-bea', 's-fra']);
});

test('M10C: notification_preferences.today=false esclude; riga assente o lettura fallita = attiva', async () => {
  const off = world({ preferences: [{ user_id: B, today: false }, { user_id: F, today: true }] });
  const { result, webpush } = await run(off, MON_10_ROME);
  assert.deepEqual(Object.fromEntries(result.recipients.map((r) => [r.userId, r.outcome])), { [F]: 'delivered', [B]: 'disabled-by-preference' });
  assert.deepEqual(webpush.sent.map((s) => s.endpoint), ['https://push.example/s-fra']);
  assert.equal(off.db.push_event_log.some((row) => row.dedupe_key.endsWith(B)), false, 'disabled user key never claimed');

  const broken = world({ errors: { notification_preferences: { message: 'column missing' } } });
  assert.equal((await run(broken, MON_10_ROME)).result.delivered, 2);
});

test('M10C: chi ha già risposto non riceve "nuova domanda"; l’altro sì', async () => {
  const admin = world({ answers: [{ question_id: Q1.id, user_id: F, couple_id: COUPLE, answer: 'segreta' }] });
  const { result, webpush } = await run(admin, MON_10_ROME);
  assert.deepEqual(Object.fromEntries(result.recipients.map((r) => [r.userId, r.outcome])), { [F]: 'already-answered', [B]: 'delivered' });
  assert.deepEqual(webpush.sent.map((s) => s.endpoint), ['https://push.example/s-bea']);
  assert.doesNotMatch(JSON.stringify(webpush.sent), /segreta/);
});

test('M10C: giorno Europe/Rome e finestra 09:00–22:00, anche col cambio d’ora', async () => {
  const { romeClock } = await loadCore();
  assert.deepEqual(romeClock(AT('2026-10-05T22:30:00Z')), { day: '2026-10-06', hour: 0 }, 'CEST: 00:30 is already the next day');
  assert.deepEqual(romeClock(AT('2026-12-01T23:30:00Z')), { day: '2026-12-02', hour: 0 }, 'CET');
  const cases = [
    ['2026-10-05T06:59:00Z', false], ['2026-10-05T07:00:00Z', true], ['2026-10-05T19:59:00Z', true], ['2026-10-05T20:00:00Z', false],
    ['2026-12-01T07:59:00Z', false], ['2026-12-01T08:00:00Z', true],
  ];
  for (const [iso, open] of cases) {
    const questions = [{ ...Q1, question_date: (await loadCore()).romeClock(AT(iso)).day }];
    const { result, webpush } = await run(world({ questions }), AT(iso));
    assert.equal(webpush.sent.length > 0, open, iso);
    if (!open) assert.equal(result.reason, 'outside-window', iso);
  }
});

test('M10C: domanda non ancora materializzata → nessuna chiave consumata, riprova al run dopo', async () => {
  const admin = world({ questions: [] });
  const { result, webpush } = await run(admin, MON_10_ROME);
  assert.equal(result.reason, 'question-not-ready');
  assert.equal(webpush.sent.length, 0);
  assert.equal(admin.db.push_event_log.length, 0);
});

test('M10C: VAPID non disponibile non consuma chiavi; membri senza coppia esclusi', async () => {
  const admin = world({ extraProfiles: [{ id: 'solo-id', couple_id: null, display_name: 'Solo' }] });
  const ensureVapid = async () => { throw new Error('push_configuration_unavailable'); };
  const { result, webpush } = await run(admin, MON_10_ROME, createFakeWebPush(), { ensureVapid });
  assert.deepEqual(result.recipients.map((r) => r.outcome), ['error', 'error']);
  assert.equal(webpush.sent.length, 0);
  assert.equal(admin.db.push_event_log.length, 0);
  const ok = await run(admin, MON_10_ROME);
  assert.equal(ok.result.recipients.length, 2, 'profile without couple is not a recipient');
});

// ---- Worker Edge Function reale ----
async function withClock(iso, fn) {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}
const post = (headers = {}, body = '{}') => new Request('https://example.supabase.co/functions/v1/daily-question-push-worker', { method: 'POST', headers, body });

test('M10C worker: senza chiave cron, con chiave errata o con un JWT utente → 401 prima di leggere dati', async () => {
  for (const headers of [{}, { 'x-us-cron-key': 'guess' }, { authorization: 'Bearer user-jwt' }, { authorization: 'Bearer user-jwt', 'x-us-cron-key': '' }]) {
    const admin = world();
    const webpush = createFakeWebPush();
    const worker = await loadEdgeFunction('daily-question-push-worker', { admin, webpush });
    const response = await worker.call(post(headers));
    assert.equal(response.status, 401, JSON.stringify(headers));
    assert.deepEqual(admin.log.reads, []);
    assert.equal(admin.db.push_event_log.length, 0);
    assert.equal(webpush.sent.length, 0);
  }
  const worker = await loadEdgeFunction('daily-question-push-worker', { admin: world(), webpush: createFakeWebPush() });
  assert.equal((await worker.call(new Request('https://x/', { method: 'GET' }))).status, 405);
});

test('M10C worker: con la chiave cron consegna; il body non può scegliere domanda, destinatari o testo', async () => {
  const admin = world({ questions: [Q1, { id: 'q-other', question_date: '2026-10-07', question: 'Altra' }] });
  const webpush = createFakeWebPush();
  const worker = await loadEdgeFunction('daily-question-push-worker', { admin, webpush });
  const forged = JSON.stringify({ question_id: 'q-other', user_ids: [F], title: 'Fake', body: 'Fake body', sender_id: B });
  const response = await withClock('2026-10-05T08:00:00Z', () => worker.call(post({ 'x-us-cron-key': 'cron-key-ok' }, forged)));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, day: '2026-10-05', reason: null, delivered: 2, outcomes: { delivered: 2 } });
  assert.ok(webpush.sent.every((s) => s.payload.tag === `daily-question-${Q1.id}` && s.payload.title === 'US. · Domanda del giorno'));
  assert.equal(webpush.vapid.length, 1);
  assert.doesNotMatch(JSON.stringify(response.body), /Quale momento|push\.example/);
  const again = await withClock('2026-10-05T08:10:00Z', () => worker.call(post({ 'x-us-cron-key': 'cron-key-ok' })));
  assert.deepEqual(again.body.outcomes, { deduplicated: 2 });
  assert.equal(webpush.sent.length, 2);
});

test('M10C: un client normale non può chiedere la push di sistema (send-web-push la rifiuta, il client non conosce il worker)', async () => {
  const admin = createFakeAdmin({
    tables: { profiles: [{ id: F, couple_id: COUPLE, display_name: 'Francesco' }, { id: B, couple_id: COUPLE, display_name: 'Beatrice' }], daily_questions: [Q1], push_subscriptions: [sub('s-bea', B)], push_event_log: [] },
    users: { 'user-jwt': { id: F } },
    rpc: { get_internal_vapid_private_key: 'vapid-private' },
  });
  const webpush = createFakeWebPush();
  const edge = await loadEdgeFunction('send-web-push', { admin, webpush });
  for (const type of ['daily_question', 'daily-question', 'system']) {
    const response = await edge.call(new Request('https://x/', { method: 'POST', headers: { authorization: 'Bearer user-jwt' }, body: JSON.stringify({ type, reference_id: Q1.id }) }));
    assert.equal(response.status, 400, type);
  }
  assert.equal(webpush.sent.length, 0);

  const clientFiles = ['index.html', ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'))];
  for (const file of clientFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /daily-question-push-worker|daily_question_push_cron_key|x-us-cron-key/, file);
  }
  const worker = read('supabase/functions/daily-question-push-worker/index.ts');
  assert.doesNotMatch(worker, /request\.json|request\.text|searchParams/, 'the worker takes no caller input');
  assert.doesNotMatch(worker, /SUPABASE_SERVICE_ROLE_KEY|service_role_key/i);
  assert.ok(worker.indexOf('cronKey !== expectedKey') < worker.indexOf('dispatchDailyQuestionPush(admin'), 'auth before any work');
  assert.match(read('supabase/config.toml'), /\[functions\.daily-question-push-worker\]\r?\nverify_jwt = false/);
});

// ---- Migration su Postgres embedded ----
const FIXTURE_SQL = `
  create role authenticated; create role anon; create role service_role;
  grant usage on schema public to authenticated, anon, service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema private;
  create schema vault;
  create table vault.secrets (name text primary key, secret text);
  create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(value text, secret_name text) returns uuid language sql as $$
    insert into vault.secrets values (secret_name, value); select gen_random_uuid();
  $$;
  create function public.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat('ab', n), 'hex') $$;
  create schema cron;
  create table cron.job (jobname text primary key, schedule text, command text);
  create function cron.schedule(job_name text, job_schedule text, job_command text) returns bigint language sql as $$
    insert into cron.job values (job_name, job_schedule, job_command); select 1::bigint;
  $$;
  create schema net;
  create table net.calls (url text, headers jsonb, body jsonb);
  create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$
    insert into net.calls values (url, headers, body); select 1::bigint;
  $$;
  create table public.couples (id uuid primary key);
  create table public.profiles (id uuid primary key, couple_id uuid references public.couples(id), role text);
  create table public.daily_questions (id uuid primary key default gen_random_uuid(), question_date date not null unique, question text not null, category text not null default 'daily', created_at timestamptz not null default now());
  alter table public.daily_questions enable row level security;
  grant select on public.daily_questions to authenticated;
  create policy daily_questions_read on public.daily_questions for select to authenticated using (true);
  create table public.daily_answers (id uuid primary key default gen_random_uuid(), question_id uuid not null references public.daily_questions(id), user_id uuid not null, couple_id uuid not null, answer text not null, unique (question_id, user_id));
  alter table public.daily_answers enable row level security;
  grant select, insert, update on public.daily_answers to authenticated;
  create policy daily_answers_select_own on public.daily_answers for select to authenticated using (user_id = auth.uid());
  -- Production shape is unknown to the repo: assume the strictest one.
  create table public.push_event_log (id uuid primary key default gen_random_uuid(), dedupe_key text not null unique, couple_id uuid not null, sender_id uuid not null, event_type text not null, created_at timestamptz not null default now());
  alter table public.push_event_log enable row level security;
`;

test('M10C migration: cron idempotente che materializza e chiama il worker, chiave solo service_role, sender_id nullable, RLS invariata', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(FIXTURE_SQL);
    await db.exec(read(M9E));
    const couple = crypto.randomUUID();
    const f = crypto.randomUUID();
    await db.query('insert into public.couples values ($1)', [couple]);
    await db.query("insert into public.push_event_log (dedupe_key, couple_id, sender_id, event_type) values ('daily-answer:x', $1, $2, 'daily_answer')", [couple, f]);
    await assert.rejects(db.query("insert into public.push_event_log (dedupe_key, couple_id, sender_id, event_type) values ('daily-question:q:u', $1, null, 'daily_question')", [couple]), /null value/);
    const policiesBefore = (await db.query("select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2")).rows;

    const sql = read(MIGRATION);
    await db.exec(sql);
    await db.exec(sql); // idempotente

    const { rows: jobs } = await db.query("select jobname, schedule, command from cron.job where jobname = 'us-daily-question-push'");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].schedule, '*/10 * * * *');
    assert.match(jobs[0].command, /private\.materialize_daily_question\(private\.daily_question_day\(now\(\)\)\)/);
    assert.match(jobs[0].command, /functions\/v1\/daily-question-push-worker/);
    assert.match(jobs[0].command, /us_daily_question_push_cron_key/);
    assert.match(jobs[0].command, /body := '\{\}'::jsonb/, 'the cron passes no parameters: the worker decides');
    const { rows: secrets } = await db.query("select name from vault.secrets where name like 'us_daily_question%'");
    assert.equal(secrets.length, 1);

    // Running the cron command materializes today even if nobody opened US, then calls the worker.
    await db.exec(jobs[0].command);
    const { rows: today } = await db.query('select count(*)::int as n from public.daily_questions where question_date = private.daily_question_day(now())');
    assert.equal(today[0].n, 1);
    await db.exec(jobs[0].command);
    assert.equal((await db.query('select count(*)::int as n from public.daily_questions')).rows[0].n, 1, 'idempotent materialization');
    const { rows: calls } = await db.query('select url, headers, body from net.calls');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/daily-question-push-worker');
    const key = (await db.query("select secret from vault.secrets where name = 'us_daily_question_push_cron_key'")).rows[0].secret;
    assert.equal(calls[0].headers['x-us-cron-key'], key);
    assert.deepEqual(calls[0].body, {});

    await db.query("insert into public.push_event_log (dedupe_key, couple_id, sender_id, event_type) values ('daily-question:q:u', $1, null, 'daily_question')", [couple]);
    const { rows: log } = await db.query("select sender_id from public.push_event_log where dedupe_key = 'daily-answer:x'");
    assert.equal(log[0].sender_id, f, 'existing rows untouched');

    const { rows: acl } = await db.query(`
      select has_function_privilege('authenticated', 'public.get_internal_daily_question_push_cron_key()', 'execute') as auth_exec,
             has_function_privilege('anon', 'public.get_internal_daily_question_push_cron_key()', 'execute') as anon_exec,
             has_function_privilege('service_role', 'public.get_internal_daily_question_push_cron_key()', 'execute') as service_exec,
             has_table_privilege('authenticated', 'public.daily_question_templates', 'select') as auth_templates,
             has_table_privilege('anon', 'public.daily_answers', 'select') as anon_answers`);
    assert.deepEqual(acl[0], { auth_exec: false, anon_exec: false, service_exec: true, auth_templates: false, anon_answers: false });
    const policiesAfter = (await db.query("select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2")).rows;
    assert.deepEqual(policiesAfter, policiesBefore, 'no RLS policy changed');
  } finally {
    await db.close();
  }
});

test('M10C migration: non tocca reveal authority, risposte storiche o template bank', () => {
  const sql = read(MIGRATION).replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /get_daily_state|daily_question_templates|policy|row level security/i);
  assert.doesNotMatch(sql, /(update|delete from|insert into|alter table)\s+public\.daily_(answers|questions)/i);
  assert.doesNotMatch(sql, /grant[^;]*to\s+(authenticated|anon)/i);
});
