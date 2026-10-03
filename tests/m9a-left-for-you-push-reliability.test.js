// M9A — Lasciato per te: ogni nuovo item è una notifica logica distinta.
// Il core di dispatch gira qui con un admin Supabase finto (stesse query del
// runtime Deno); la migration gira su Postgres embedded (pglite).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const CORE = path.join(ROOT, 'supabase/functions/_shared/left-for-you-push-core.mjs');
const MIGRATION = 'supabase/migrations/20260929201958_m9a_left_for_you_push_reliability.sql';
const loadCore = () => import(pathToFileURL(CORE).href);

const COUPLE = 'couple-1';
const FRANCESCO = 'francesco-id';
const BEATRICE = 'beatrice-id';

// Admin finto: tabelle in memoria, solo i metodi usati dal core.
function createAdmin({ rows = [], subscriptions = [], preferences = [], preferenceError = null } = {}) {
  const db = {
    left_for_you: rows.map((row) => ({ seen_at: null, ...row })),
    profiles: [
      { id: FRANCESCO, couple_id: COUPLE, display_name: 'Francesco' },
      { id: BEATRICE, couple_id: COUPLE, display_name: 'Beatrice' },
    ],
    notification_preferences: preferences,
    push_subscriptions: subscriptions,
    push_event_log: [],
  };
  const log = { subscriptionLookups: [], deletedSubscriptions: [], claims: [], released: [] };
  const admin = {
    db,
    log,
    from(table) {
      const filters = [];
      let mode = 'select';
      let payload = null;
      const apply = () => (db[table] || []).filter((row) => filters.every((filter) => filter(row)));
      const run = () => {
        if (mode === 'insert') {
          if (table === 'push_event_log' && db.push_event_log.some((row) => row.dedupe_key === payload.dedupe_key)) {
            return { data: null, error: { code: '23505' } };
          }
          db[table].push({ ...payload });
          if (table === 'push_event_log') log.claims.push(payload.dedupe_key);
          return { data: null, error: null };
        }
        if (mode === 'delete') {
          const doomed = apply();
          db[table] = db[table].filter((row) => !doomed.includes(row));
          if (table === 'push_subscriptions') log.deletedSubscriptions.push(...doomed.map((row) => row.id));
          if (table === 'push_event_log') log.released.push(...doomed.map((row) => row.dedupe_key));
          return { data: null, error: null };
        }
        if (table === 'notification_preferences' && preferenceError) return { data: null, error: preferenceError };
        return { data: apply(), error: null };
      };
      const builder = {
        select() { return builder; },
        eq(column, value) {
          filters.push((row) => row[column] === value);
          if (table === 'push_subscriptions' && column === 'user_id' && mode === 'select') log.subscriptionLookups.push(value);
          return builder;
        },
        in(column, values) { filters.push((row) => values.includes(row[column])); return builder; },
        insert(value) { mode = 'insert'; payload = value; return builder; },
        delete() { mode = 'delete'; return builder; },
        async maybeSingle() {
          const result = run();
          if (result.error) return result;
          return { data: result.data[0] || null, error: null };
        },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return builder;
    },
  };
  return admin;
}

function createSender({ failures = {} } = {}) {
  const sent = [];
  const sendNotification = async (subscription, payload, options) => {
    const status = failures[subscription.endpoint];
    if (status) {
      const error = new Error('push failed');
      error.statusCode = status;
      throw error;
    }
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options });
  };
  return { sent, sendNotification };
}

const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const item = (id, sender = FRANCESCO, recipient = BEATRICE) => ({ id, couple_id: COUPLE, sender_id: sender, recipient_id: recipient });

test('M9A: A1 → A2 → A3 sequenziali notificano tutti e tre (nessun dedupe globale)', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({ rows: [item('a1'), item('a2'), item('a3')], subscriptions: [sub('s-bea', BEATRICE)] });
  const { sent, sendNotification } = createSender();
  for (const id of ['a1', 'a2', 'a3']) {
    const result = await dispatchLeftForYouPush(admin, { itemId: id, expectedSenderId: FRANCESCO, sendNotification });
    assert.deepEqual(result, { delivered: 1, failed: 0 }, `item ${id}`);
  }
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((entry) => entry.payload.tag), ['left-for-you:a1', 'left-for-you:a2', 'left-for-you:a3']);
  assert.deepEqual(admin.log.claims, ['left-for-you:a1', 'left-for-you:a2', 'left-for-you:a3']);
  assert.ok(sent.every((entry) => entry.payload.target === 'left_for_you'));
  assert.ok(sent.every((entry) => entry.payload.body === 'Francesco ti ha lasciato qualcosa ♡'));
  assert.ok(sent.every((entry) => entry.options.urgency === 'high'));
});

test('M9A: retry della STESSA riga non duplica la notifica logica', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({ rows: [item('a1')], subscriptions: [sub('s-bea', BEATRICE)] });
  const { sent, sendNotification } = createSender();
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'a1', sendNotification })).delivered, 1);
  const retry = await dispatchLeftForYouPush(admin, { itemId: 'a1', sendNotification });
  assert.deepEqual(retry, { delivered: 0, failed: 0, deduplicated: true });
  assert.equal(sent.length, 1);
});

test('M9A: simmetrico Francesco → Beatrice e Beatrice → Francesco; il mittente non riceve mai la propria notifica', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({
    rows: [item('f-to-b', FRANCESCO, BEATRICE), item('b-to-f', BEATRICE, FRANCESCO)],
    subscriptions: [sub('s-bea', BEATRICE), sub('s-fra', FRANCESCO)],
  });
  const { sent, sendNotification } = createSender();
  await dispatchLeftForYouPush(admin, { itemId: 'f-to-b', expectedSenderId: FRANCESCO, sendNotification });
  await dispatchLeftForYouPush(admin, { itemId: 'b-to-f', expectedSenderId: BEATRICE, sendNotification });
  assert.deepEqual(admin.log.subscriptionLookups, [BEATRICE, FRANCESCO]);
  assert.deepEqual(sent.map((entry) => entry.endpoint), ['https://push.example/s-bea', 'https://push.example/s-fra']);
  assert.equal(sent[0].payload.body, 'Francesco ti ha lasciato qualcosa ♡');
  assert.equal(sent[1].payload.body, 'Beatrice ti ha lasciato qualcosa ♡');
});

test('M9A: una riga di un altro mittente o fuori coppia non produce push', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({
    rows: [item('a1'), { id: 'foreign', couple_id: 'other-couple', sender_id: FRANCESCO, recipient_id: BEATRICE }, item('self', FRANCESCO, FRANCESCO)],
    subscriptions: [sub('s-bea', BEATRICE), sub('s-fra', FRANCESCO)],
  });
  const { sent, sendNotification } = createSender();
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'a1', expectedSenderId: BEATRICE, sendNotification })).reason, 'forbidden');
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'foreign', sendNotification })).reason, 'invalid-couple');
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'self', sendNotification })).reason, 'invalid-recipient');
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'missing', sendNotification })).reason, 'not-found');
  assert.equal(sent.length, 0);
  assert.deepEqual(admin.log.claims, []);
});

test('M9A: left_for_you=false disattiva la push senza consumare la chiave', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({
    rows: [item('a1')],
    subscriptions: [sub('s-bea', BEATRICE)],
    preferences: [{ user_id: BEATRICE, left_for_you: false }],
  });
  const { sent, sendNotification } = createSender();
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'a1', sendNotification })).reason, 'disabled-by-preference');
  assert.equal(sent.length, 0);
  assert.deepEqual(admin.log.claims, []);
});

test('M9A: preferenza assente o colonna non ancora migrata = attiva (come prima di M9A)', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const missingColumn = createAdmin({ rows: [item('a1')], subscriptions: [sub('s-bea', BEATRICE)], preferenceError: { code: '42703' } });
  const { sent, sendNotification } = createSender();
  assert.equal((await dispatchLeftForYouPush(missingColumn, { itemId: 'a1', sendNotification })).delivered, 1);
  const noRow = createAdmin({ rows: [item('a2')], subscriptions: [sub('s-bea', BEATRICE)], preferences: [{ user_id: BEATRICE, left_for_you: true }] });
  assert.equal((await dispatchLeftForYouPush(noRow, { itemId: 'a2', sendNotification })).delivered, 1);
  assert.equal(sent.length, 2);
});

test('M9A: nessuna subscription → nessun invio e chiave rilasciata, così un retry dopo l’attivazione consegna', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({ rows: [item('a1')] });
  const { sent, sendNotification } = createSender();
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'a1', sendNotification })).reason, 'recipient-not-subscribed');
  assert.deepEqual(admin.log.released, ['left-for-you:a1']);
  assert.equal(admin.db.push_event_log.length, 0);
  admin.db.push_subscriptions.push(sub('s-bea', BEATRICE));
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'a1', sendNotification })).delivered, 1);
  assert.equal(sent.length, 1);
});

test('M9A: subscription scadute (404/410) vengono rimosse; le altre ricevono comunque', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({ rows: [item('a1'), item('a2')], subscriptions: [sub('stale', BEATRICE), sub('live', BEATRICE)] });
  const { sent, sendNotification } = createSender({ failures: { 'https://push.example/stale': 410 } });
  assert.deepEqual(await dispatchLeftForYouPush(admin, { itemId: 'a1', sendNotification }), { delivered: 1, failed: 1 });
  assert.deepEqual(admin.log.deletedSubscriptions, ['stale']);
  assert.deepEqual(await dispatchLeftForYouPush(admin, { itemId: 'a2', sendNotification }), { delivered: 1, failed: 0 });
  assert.equal(sent.length, 2);

  const allStale = createAdmin({ rows: [item('a3')], subscriptions: [sub('gone', BEATRICE)] });
  const sender404 = createSender({ failures: { 'https://push.example/gone': 404 } });
  assert.deepEqual(await dispatchLeftForYouPush(allStale, { itemId: 'a3', sendNotification: sender404.sendNotification }), { delivered: 0, failed: 1 });
  assert.deepEqual(allStale.log.deletedSubscriptions, ['gone']);
  assert.deepEqual(allStale.log.released, ['left-for-you:a3'], 'nessuna consegna → la chiave torna libera per un retry');
});

test('M9A: VAPID non disponibile non consuma la chiave dedupe', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({ rows: [item('a1')], subscriptions: [sub('s-bea', BEATRICE)] });
  const { sendNotification } = createSender();
  await assert.rejects(dispatchLeftForYouPush(admin, {
    itemId: 'a1',
    sendNotification,
    ensureVapid: async () => { throw new Error('push_configuration_unavailable'); },
  }));
  assert.deepEqual(admin.log.claims, []);
});

test('M9A: il worker non notifica item già aperti', async () => {
  const { dispatchLeftForYouPush } = await loadCore();
  const admin = createAdmin({ rows: [{ ...item('a1'), seen_at: '2026-09-29T10:00:00Z' }], subscriptions: [sub('s-bea', BEATRICE)] });
  const { sent, sendNotification } = createSender();
  assert.equal((await dispatchLeftForYouPush(admin, { itemId: 'a1', skipIfSeen: true, sendNotification })).reason, 'already-seen');
  assert.equal(sent.length, 0);
});

test('M9A: send-web-push valida mittente/coppia/partner e delega al core condiviso', () => {
  const edge = read('supabase/functions/send-web-push/index.ts');
  const block = edge.slice(edge.indexOf('if (type === "left_for_you")'), edge.indexOf('get_internal_vapid_private_key");\n    if (vapidError || !vapidPrivate) return json'));
  assert.match(block, /row\.sender_id !== sender\.id/);
  assert.match(block, /row\.couple_id !== sender\.couple_id/);
  assert.match(block, /row\.recipient_id !== partner\.id/);
  assert.ok(block.indexOf('Invalid left_for_you event') < block.indexOf('dispatchLeftForYouPush(admin'), 'validazione prima del dispatch');
  assert.match(block, /expectedSenderId: sender\.id/);
  assert.match(edge, /from "\.\.\/_shared\/left-for-you-push-core\.mjs"/);
  // I percorsi Ti penso / Today / Bond restano quelli di prima.
  assert.match(edge, /dispatchThinkWebPush/);
  assert.match(edge, /dispatchThinkReactionWebPush/);
  assert.match(edge, /daily-answer:\$\{questionId\}:\$\{sender\.id\}/);
  assert.match(edge, /quest-confirmed:\$\{questId\}:\$\{sender\.id\}/);
});

test('M9A: il worker di recupero è solo cron, usa la stessa chiave e salta ciò che è già notificato', () => {
  const worker = read('supabase/functions/left-for-you-push-worker/index.ts');
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.left-for-you-push-worker\]\nverify_jwt = false/);
  assert.match(worker, /x-us-cron-key/);
  assert.match(worker, /get_internal_left_for_you_push_cron_key/);
  assert.ok(worker.indexOf('cronKey !== expectedKey') < worker.indexOf('.from("left_for_you")'), 'autorizzazione prima di leggere i dati');
  assert.match(worker, /\.is\("seen_at", null\)/);
  assert.match(worker, /GRACE_SECONDS = 45/);
  assert.match(worker, /WINDOW_MINUTES = 15/);
  assert.match(worker, /leftForYouDedupeKey/);
  assert.match(worker, /skipIfSeen: true/);
  assert.doesNotMatch(worker, /SUPABASE_SERVICE_ROLE_KEY|service_role_key/i);
});

test('M9A: la push parte con keepalive, così sopravvive alla PWA che va in background', () => {
  const app = read('app.js');
  const fn = app.slice(app.indexOf('async function sendWebPushEvent'), app.indexOf('window.sendWebPushEvent=sendWebPushEvent'));
  assert.match(fn, /keepalive:true/);
  const lfy = read('left-for-you.js');
  assert.match(lfy, /if \(inserted\?\.id\) window\.sendWebPushEvent\?\.\('left_for_you', inserted\.id\)/);
});

// ---- Migration su Postgres embedded ----
const FIXTURE_SQL = `
  create role authenticated;
  create role anon;
  create role service_role;
  create schema vault;
  create table vault.secrets (name text primary key, secret text);
  create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(value text, secret_name text) returns uuid language sql as $$
    insert into vault.secrets values (secret_name, value); select gen_random_uuid();
  $$;
  create function public.gen_random_bytes(n integer) returns bytea language sql as $$
    select decode(repeat('ab', n), 'hex');
  $$;
  create schema cron;
  create table cron.job (jobname text primary key, schedule text, command text);
  create function cron.schedule(job_name text, job_schedule text, job_command text) returns bigint language sql as $$
    insert into cron.job values (job_name, job_schedule, job_command); select 1::bigint;
  $$;
  create table public.left_for_you (
    id uuid not null default gen_random_uuid() primary key,
    couple_id uuid not null,
    sender_id uuid not null,
    recipient_id uuid not null,
    kind text not null,
    body text,
    media_path text,
    created_at timestamptz not null default now(),
    seen_at timestamptz,
    constraint left_for_you_media_path_unique unique (media_path)
  );
`;

test('M9A migration: la stessa canzone si può rilasciare più volte, i media caricati restano unici, cron idempotente', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(FIXTURE_SQL);
    const couple = crypto.randomUUID();
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const song = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
    await db.query('insert into public.left_for_you (couple_id, sender_id, recipient_id, kind, media_path) values ($1,$2,$3,$4,$5)', [couple, a, b, 'music', song]);
    await assert.rejects(
      db.query('insert into public.left_for_you (couple_id, sender_id, recipient_id, kind, media_path) values ($1,$2,$3,$4,$5)', [couple, a, b, 'music', song]),
      /duplicate key/,
      'prima di M9A il secondo invio dello stesso brano falliva'
    );

    const sql = read(MIGRATION);
    await db.exec(sql);
    await db.exec(sql); // idempotente

    await db.query('insert into public.left_for_you (couple_id, sender_id, recipient_id, kind, media_path) values ($1,$2,$3,$4,$5)', [couple, a, b, 'music', song]);
    await db.query('insert into public.left_for_you (couple_id, sender_id, recipient_id, kind, media_path) values ($1,$2,$3,$4,$5)', [couple, b, a, 'music', song]);
    const photo = `${couple}/${a}/left/p.jpg`;
    await db.query('insert into public.left_for_you (couple_id, sender_id, recipient_id, kind, media_path) values ($1,$2,$3,$4,$5)', [couple, a, b, 'photo', photo]);
    await assert.rejects(
      db.query('insert into public.left_for_you (couple_id, sender_id, recipient_id, kind, media_path) values ($1,$2,$3,$4,$5)', [couple, a, b, 'photo', photo]),
      /duplicate key/
    );
    const { rows: music } = await db.query("select count(*)::int as n from public.left_for_you where kind = 'music'");
    assert.equal(music[0].n, 3);

    const { rows: jobs } = await db.query('select jobname, schedule, command from cron.job');
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].jobname, 'us-left-for-you-push-sweep');
    assert.equal(jobs[0].schedule, '* * * * *');
    assert.match(jobs[0].command, /functions\/v1\/left-for-you-push-worker/);
    assert.match(jobs[0].command, /us_left_for_you_push_cron_key/);
    const { rows: secrets } = await db.query('select name from vault.secrets');
    assert.deepEqual(secrets.map((row) => row.name), ['us_left_for_you_push_cron_key']);

    const { rows: acl } = await db.query(`
      select has_function_privilege('authenticated', 'public.get_internal_left_for_you_push_cron_key()', 'execute') as auth_exec,
             has_function_privilege('anon', 'public.get_internal_left_for_you_push_cron_key()', 'execute') as anon_exec,
             has_function_privilege('service_role', 'public.get_internal_left_for_you_push_cron_key()', 'execute') as service_exec`);
    assert.deepEqual(acl[0], { auth_exec: false, anon_exec: false, service_exec: true });
  } finally {
    await db.close();
  }
});
