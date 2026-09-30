// M11D — Game V2 push against the real migrations (PGlite) and the real
// Edge Functions (esbuild + doubles). The service-role client used by the
// push core is backed by the same PGlite database, so event authority,
// dedupe, preferences and subscriptions are exercised end to end.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/game-v2-db');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness.js');

const { createDb, couple, setClock, as, readOnly, rpc, id, playSide, startRound, createWeekly } = h;
const ROOT = h.ROOT;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const loadCore = () => import(path.join(ROOT, 'supabase/functions/_shared/game-v2-push-core.mjs'));
const M11D = 'supabase/migrations/20260930170000_m11d_game_v2_push.sql';
const WED = '2026-09-30T10:00:00Z'; // Francesco's week

const PUSH_TABLES = `
  create table public.push_event_log (dedupe_key text primary key, couple_id uuid, sender_id uuid, event_type text,
    created_at timestamptz not null default now());
  create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null,
    endpoint text not null, p256dh text not null, auth_key text not null);`;

// Minimal service-role client over PGlite: the query-builder surface the core uses.
function pgAdmin(db) {
  const calls = [];
  return {
    calls,
    async rpc(name, args = {}) {
      calls.push([name, args]);
      const keys = Object.keys(args || {});
      try {
        const { rows } = await db.query(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) r`, keys.map((k) => args[k]));
        return { data: rows[0]?.r ?? null, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      const where = []; const params = []; let mode = 'select'; let cols = '*'; let payload = null;
      const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
      const run = async () => {
        try {
          if (mode === 'insert') {
            const keys = Object.keys(payload);
            await db.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((k) => payload[k]));
            return { data: null, error: null };
          }
          const clause = where.length ? ` where ${where.join(' and ')}` : '';
          if (mode === 'delete') { await db.query(`delete from public.${table}${clause}`, params); return { data: null, error: null }; }
          const { rows } = await db.query(`select ${cols} from public.${table}${clause}`, params);
          return { data: rows, error: null };
        } catch (error) { return { data: null, error }; }
      };
      const builder = {
        select(c) { if (c) cols = c; return builder; },
        eq(c, v) { add(`${c} = ?`, v); return builder; },
        in(c, v) { add(`${c} = any(?)`, v); return builder; },
        insert(v) { mode = 'insert'; payload = v; return builder; },
        delete() { mode = 'delete'; return builder; },
        async maybeSingle() { const r = await run(); return r.error ? r : { data: r.data?.[0] || null, error: null }; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      return builder;
    },
  };
}

async function world(clock = WED) {
  const db = await createDb();
  await db.exec(PUSH_TABLES);
  const p = await couple(db);
  await setClock(db, clock);
  await db.query(`insert into public.push_subscriptions(user_id, endpoint, p256dh, auth_key) values ($1, 'https://push.example/fra', 'p', 'a'), ($2, 'https://push.example/bea', 'p', 'a')`, [p.f, p.b]);
  const webpush = createFakeWebPush();
  const admin = pgAdmin(db);
  const options = { sendNotification: webpush.sendNotification.bind(webpush), ensureVapid: async () => {} };
  return { db, admin, webpush, options, ...p };
}
const log = async (db) => (await db.query('select dedupe_key, event_type, sender_id from public.push_event_log order by dedupe_key')).rows;

test('M11D waiting then reveal: partner only, once each, role-based dedupe', async () => {
  const w = await world();
  const { dispatchGameSessionPush } = await loadCore();
  const s = await startRound(w.db, w.f, 'per_voi');
  assert.equal((await dispatchGameSessionPush(w.admin, { sessionId: s.id, actorId: w.f, ...w.options })).outcome, 'nothing-to-send', 'no push before finalizing');
  await playSide(w.db, w.f, s.id);
  const first = await dispatchGameSessionPush(w.admin, { sessionId: s.id, actorId: w.f, ...w.options });
  assert.deepEqual([first.kind, first.outcome], ['game_waiting', 'delivered']);
  assert.deepEqual(w.webpush.sent.map((x) => [x.endpoint, x.payload.body]), [['https://push.example/bea', 'Francesco ha risposto. Ora tocca a te.']]);
  assert.equal((await dispatchGameSessionPush(w.admin, { sessionId: s.id, actorId: w.f, ...w.options })).outcome, 'deduplicated');
  await playSide(w.db, w.b, s.id);
  const reveal = await dispatchGameSessionPush(w.admin, { sessionId: s.id, actorId: w.b, ...w.options });
  assert.deepEqual([reveal.kind, reveal.outcome], ['game_reveal', 'delivered']);
  assert.deepEqual(w.webpush.sent.at(-1).endpoint, 'https://push.example/fra', 'the first finisher learns the reveal is ready');
  assert.equal(w.webpush.sent.at(-1).payload.body, 'Le vostre risposte sono pronte ♡');
  assert.equal((await dispatchGameSessionPush(w.admin, { sessionId: s.id, actorId: w.f, ...w.options })).outcome, 'nothing-to-send', 'the first finisher never notifies the second of a reveal they just caused');
  assert.deepEqual((await log(w.db)).map((r) => [r.dedupe_key, r.event_type]), [
    [`game-reveal:${s.id}:francesco`, 'game_reveal'], [`game-waiting:${s.id}:beatrice`, 'game_waiting']]);
  assert.equal(w.webpush.sent.length, 2);
});

test('M11D payloads never carry questions, answers, predictions or context', async () => {
  const w = await world();
  const { dispatchGameSessionPush, dispatchGameWeeklyPush } = await loadCore();
  await w.db.query(`insert into public.bucket_items(couple_id, title, status) values ($1, 'Weekend a Matera', 'idea')`, [w.c]);
  const weekly = await createWeekly(w.db, w.f, { text: 'Qual è la cosa che non mi hai mai chiesto?' });
  const s = await startRound(w.db, w.f, 'quanto_mi_conosci');
  await playSide(w.db, w.f, s.id); await playSide(w.db, w.b, s.id);
  await dispatchGameSessionPush(w.admin, { sessionId: s.id, actorId: w.b, ...w.options });
  await dispatchGameWeeklyPush(w.admin, { questionId: weekly.question_id, actorId: w.f, ...w.options });
  const state = await as(w.db, w.f, () => rpc(w.db, 'select public.get_game_session($1::uuid) r', [s.id]));
  const secrets = ['Qual è la cosa che non mi hai mai chiesto', 'Matera', 'Risposta', 'matched', 'prediction',
    ...state.items.flatMap((i) => [i.question_text, i.predict_text, ...(i.options || [])]).filter(Boolean)];
  assert.equal(w.webpush.sent.length, 2);
  for (const { payload } of w.webpush.sent) {
    assert.deepEqual(Object.keys(payload).sort(), ['badge', 'body', 'icon', 'tag', 'target', 'title', 'url']);
    assert.equal(payload.title, 'US. · Gioca');
    assert.equal(payload.target, 'quiz');
    assert.equal(payload.url, '/?open=quiz&from=push');
    const text = JSON.stringify(payload);
    for (const secret of secrets) assert.ok(!text.includes(secret), `payload leaks ${secret}`);
  }
  assert.equal(w.webpush.sent[1].payload.body, 'Francesco ha lasciato la domanda della settimana ♡');
});

test('M11D preference "games": personal, default on, respected by every event', async () => {
  const w = await world();
  const { dispatchGameSessionPush } = await loadCore();
  const prefs = await as(w.db, w.b, () => rpc(w.db, 'select public.get_notification_preferences() r'));
  assert.equal(prefs.games, true);
  assert.equal(prefs.left_for_you, true, 'existing keys unchanged');
  const off = await as(w.db, w.b, () => rpc(w.db, `select public.set_notification_preference('games', false) r`));
  assert.equal(off.games, false);
  await assert.rejects(as(w.db, w.b, () => rpc(w.db, `select public.set_notification_preference('arcade', false) r`)), /Invalid preference/);
  const s = await startRound(w.db, w.f, 'ridete');
  await playSide(w.db, w.f, s.id);
  assert.equal((await dispatchGameSessionPush(w.admin, { sessionId: s.id, actorId: w.f, ...w.options })).outcome, 'disabled-by-preference');
  assert.deepEqual(await log(w.db), [], 'no key consumed');
  assert.equal(w.webpush.sent.length, 0);
});

test('M11D authority: forged actors, other couples, stale weeks and unfinished sides send nothing', async () => {
  const w = await world();
  const other = await couple(w.db);
  const { dispatchGameSessionPush, dispatchGameWeeklyPush } = await loadCore();
  const s = await startRound(w.db, w.f, 'ridete');
  await playSide(w.db, w.f, s.id);
  for (const actor of [other.f, other.b, w.b, id()]) {
    assert.equal((await dispatchGameSessionPush(w.admin, { sessionId: s.id, actorId: actor, ...w.options })).outcome, 'nothing-to-send', actor);
  }
  const weekly = await createWeekly(w.db, w.f);
  for (const actor of [w.b, other.f]) {
    assert.equal((await dispatchGameWeeklyPush(w.admin, { questionId: weekly.question_id, actorId: actor, ...w.options })).outcome, 'nothing-to-send');
  }
  await setClock(w.db, '2026-10-06T10:00:00Z');
  assert.equal((await dispatchGameWeeklyPush(w.admin, { questionId: weekly.question_id, actorId: w.f, ...w.options })).outcome, 'nothing-to-send', 'last week is not news');
  assert.equal(w.webpush.sent.length, 0);
  // Clients can never ask the event authority directly.
  for (const call of [`select public.game_v2_push_for_session('${s.id}', '${w.f}') r`, `select public.game_v2_push_for_weekly('${weekly.question_id}', '${w.f}') r`,
    'select public.game_v2_pending_pushes() r', 'select public.get_internal_game_v2_push_cron_key() r']) {
    await assert.rejects(as(w.db, w.f, () => rpc(w.db, call)), /permission denied/, call);
  }
  // The authority reads run inside READ ONLY (PostgREST STABLE path).
  await w.db.exec('begin read only');
  try {
    await w.db.query('select public.game_v2_pending_pushes()');
    await w.db.query(`select public.game_v2_push_for_session('${s.id}', '${w.f}')`);
    await w.db.query(`select public.game_v2_push_for_weekly('${weekly.question_id}', '${w.f}')`);
  } finally { await w.db.exec('rollback'); }
});

test('M11D worker: weekly turn once per Rome week, 9-22 only, never once the question exists', async () => {
  const MON_ROME_10 = '2026-10-05T08:00:00Z'; // Bea's week
  const w = await world(MON_ROME_10);
  const { dispatchGameV2PendingPushes } = await loadCore();
  const early = await dispatchGameV2PendingPushes(w.admin, { now: new Date('2026-10-05T05:30:00Z'), ...w.options });
  assert.equal(early.reason, 'outside-window');
  const run = await dispatchGameV2PendingPushes(w.admin, { now: new Date(MON_ROME_10), ...w.options });
  assert.deepEqual(run.events.map((e) => [e.kind, e.outcome]), [['game_weekly_turn', 'delivered']]);
  assert.deepEqual(w.webpush.sent.map((x) => [x.endpoint, x.payload.body]), [['https://push.example/bea', 'Questa settimana la domanda per voi la scegli tu.']]);
  assert.equal((await log(w.db))[0].dedupe_key, `game-weekly-turn:${w.c}:2026-10-05`);
  assert.equal((await log(w.db))[0].sender_id, null, 'a system event has no sender');
  const again = await dispatchGameV2PendingPushes(w.admin, { now: new Date(MON_ROME_10), ...w.options });
  assert.deepEqual(again.events.map((e) => e.outcome), ['deduplicated']);
  // Next week, the question already created by its author: no turn reminder.
  await setClock(w.db, '2026-10-12T08:00:00Z');
  await createWeekly(w.db, w.f);
  await w.db.query(`update public.couple_questions set created_at = '2026-10-12T07:00:00Z' where couple_id = $1 and origin = 'weekly'`, [w.c]);
  const next = await dispatchGameV2PendingPushes(w.admin, { now: new Date('2026-10-12T08:00:00Z'), ...w.options });
  assert.deepEqual(next.events.map((e) => [e.kind, e.outcome]), [['game_weekly_created', 'delivered']], 'the missed "created" is recovered instead');
  assert.equal(w.webpush.sent.at(-1).endpoint, 'https://push.example/bea');
});

test('M11D worker: recovers missed waiting and reveal events, skips seen reveals and survives a re-pair', async () => {
  const w = await world();
  const { dispatchGameV2PendingPushes } = await loadCore();
  const now = new Date(WED);
  const a = await startRound(w.db, w.f, 'ridete');
  await playSide(w.db, w.f, a.id);
  const bRound = await startRound(w.db, w.b, 'e_se');
  await playSide(w.db, w.b, bRound.id); await playSide(w.db, w.f, bRound.id);
  await w.db.query(`update public.game_session_sides set completed_at = $1::timestamptz - interval '10 minutes' where completed_at is not null`, [WED]);
  await w.db.query(`update public.game_session_sides set completed_at = $1::timestamptz - interval '5 minutes' where session_id = $2 and actor_role = 'francesco'`, [WED, bRound.id]);
  await w.db.query(`update public.game_sessions set completed_at = $1::timestamptz - interval '5 minutes' where id = $2`, [WED, bRound.id]);
  const run = await dispatchGameV2PendingPushes(w.admin, { now, ...w.options });
  assert.deepEqual(run.events.map((e) => [e.kind, e.outcome]).sort(), [['game_reveal', 'delivered'], ['game_waiting', 'delivered'], ['game_weekly_turn', 'delivered']]);
  const byKey = Object.fromEntries((await log(w.db)).map((r) => [r.dedupe_key, r]));
  assert.ok(byKey[`game-waiting:${a.id}:beatrice`]);
  assert.ok(byKey[`game-reveal:${bRound.id}:beatrice`], 'Bea finished first');
  // Re-pair: Bea gets a new profile UID; role-based keys keep everything deduplicated.
  const newB = id();
  await w.db.query(`update public.profiles set id = $1 where id = $2`, [newB, w.b]);
  await w.db.query(`update public.push_subscriptions set user_id = $1 where user_id = $2`, [newB, w.b]);
  const after = await dispatchGameV2PendingPushes(w.admin, { now, ...w.options });
  assert.deepEqual(after.events.map((e) => e.outcome), ['deduplicated', 'deduplicated', 'deduplicated']);
  // A reveal already seen is not pushed.
  const c = await startRound(w.db, w.f, 'rivivete');
  await playSide(w.db, w.f, c.id); await playSide(w.db, newB, c.id);
  await as(w.db, w.f, () => rpc(w.db, 'select public.mark_game_session_reveal_seen($1::uuid) r', [c.id]));
  await w.db.query(`update public.game_sessions set completed_at = $1::timestamptz - interval '3 minutes' where id = $2`, [WED, c.id]);
  await w.db.query(`update public.game_session_sides set completed_at = $1::timestamptz - case actor_role when 'francesco' then interval '4 minutes' else interval '3 minutes' end where session_id = $2`, [WED, c.id]);
  const seen = await dispatchGameV2PendingPushes(w.admin, { now, ...w.options });
  assert.ok(!seen.events.some((e) => e.outcome === 'delivered'), JSON.stringify(seen.events));
});

test('M11D migration: dedicated vault key, idempotent cron, service-role grants only', async () => {
  const w = await world();
  const jobs = (await w.db.query(`select jobname, schedule, command from cron.job where jobname = 'us-game-v2-push'`)).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].schedule, '*/10 * * * *');
  assert.match(jobs[0].command, /functions\/v1\/game-v2-push-worker/);
  assert.match(jobs[0].command, /us_game_v2_push_cron_key/);
  assert.equal((await w.db.query(`select count(*)::int n from vault.secrets where name = 'us_game_v2_push_cron_key'`)).rows[0].n, 1);
  const sql = read(M11D);
  assert.match(sql, /if not exists \(select 1 from vault\.secrets where name = 'us_game_v2_push_cron_key'\)/, 'key created once');
  assert.match(sql, /if not exists \(select 1 from cron\.job where jobname = 'us-game-v2-push'\)/, 'job scheduled once');
  assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b|\bdelete from\b/i);
  assert.doesNotMatch(sql, /question_text|answer_text|predict_text|daily_answers|left_for_you\b.*body/i, 'events are built from ids and roles only');
  assert.match(read('supabase/config.toml'), /\[functions\.game-v2-push-worker\]\nverify_jwt = false/);
  assert.match(read('supabase/config.toml'), /\[functions\.game-v2-push\]\nverify_jwt = true/);
  const app = read('app.js');
  const send = app.slice(app.indexOf('async function sendWebPushEvent'), app.indexOf('window.sendWebPushEvent=sendWebPushEvent'));
  assert.match(send, /const endpoint=String\(type\)\.startsWith\('game_'\)\?'game-v2-push':'send-web-push';/, 'one client helper, same auth and keepalive');
  assert.match(send, /keepalive:true/);
  assert.doesNotMatch(read('supabase/functions/send-web-push/index.ts'), /game/, 'send-web-push untouched');
  const settings = read('settings.js');
  assert.match(settings, /preferenceToggle\('games','Gioca',p\.games!==false\)/, 'the preference is reachable in Impostazioni > Notifiche');
  assert.match(settings, /key==='games'\?'Tocca a te, risposte pronte, domanda della settimana'/);
});

test('M11D game-v2-push: game events carry only the reference; actor comes from the JWT', async () => {
  const COUPLE = 'c1';
  const calls = [];
  const admin = createFakeAdmin({
    users: { 'token-fra': { id: 'fra' } },
    tables: {
      profiles: [{ id: 'fra', couple_id: COUPLE, role: 'francesco', display_name: 'Francesco' }, { id: 'bea', couple_id: COUPLE, role: 'beatrice', display_name: 'Beatrice' }],
      notification_preferences: [], push_subscriptions: [{ id: 's1', user_id: 'bea', endpoint: 'https://push.example/bea', p256dh: 'p', auth_key: 'a' }], push_event_log: [],
    },
    rpc: {
      get_internal_vapid_private_key: 'vapid-private',
      game_v2_push_for_session: (args) => { calls.push(args); return { kind: 'game_waiting', couple_id: '00000000-0000-0000-0000-0000000000c1', recipient_role: 'beatrice', sender_role: 'francesco', reference: args.target_session_id, dedupe_key: `game-waiting:${args.target_session_id}:beatrice` }; },
      game_v2_push_for_weekly: () => null,
    },
  });
  // The fake admin filters profiles by couple id string: align the event couple.
  admin.db.profiles.forEach((p) => { p.couple_id = '00000000-0000-0000-0000-0000000000c1'; });
  const webpush = createFakeWebPush();
  const fn = await loadEdgeFunction('game-v2-push', { admin, webpush });
  const post = (body) => fn.call(new Request('https://x/functions/v1/game-v2-push', { method: 'POST', headers: { authorization: 'Bearer token-fra', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await post({ type: 'game_session' })).status, 400);
  assert.equal((await post({ type: 'game_session', reference_id: 'not-a-uuid' })).status, 400);
  const sid = '11111111-2222-3333-4444-555555555555';
  const ok = await post({ type: 'game_session', reference_id: sid, actor_id: 'bea', recipient_role: 'francesco', couple_id: 'evil' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { kind: 'game_waiting', outcome: 'delivered', delivered: 1, failed: 0 });
  assert.deepEqual(calls, [{ target_session_id: sid, actor_id: 'fra' }], 'actor from the verified session, extra fields ignored');
  assert.deepEqual(webpush.sent.map((s) => [s.endpoint, s.payload.body]), [['https://push.example/bea', 'Francesco ha risposto. Ora tocca a te.']]);
  assert.equal((await post({ type: 'think', reference_id: sid })).status, 400, 'only game events');
  assert.equal((await fn.call(new Request('https://x/functions/v1/game-v2-push', { method: 'POST', body: '{}' }))).status, 401);
  const weekly = await post({ type: 'game_weekly', reference_id: sid });
  assert.deepEqual(weekly.body, { kind: null, outcome: 'nothing-to-send', delivered: 0, failed: 0 });
});

test('M11D worker Edge Function: dedicated cron key before any work, aggregates only', async () => {
  const admin = createFakeAdmin({
    tables: { push_event_log: [] },
    rpc: { get_internal_game_v2_push_cron_key: 'cron-ok', get_internal_vapid_private_key: 'vapid', game_v2_pending_pushes: () => [] },
  });
  const fn = await loadEdgeFunction('game-v2-push-worker', { admin, webpush: createFakeWebPush() });
  const call = (headers) => fn.call(new Request('https://x/functions/v1/game-v2-push-worker', { method: 'POST', headers }));
  assert.equal((await call({})).status, 401);
  assert.equal((await call({ 'x-us-cron-key': 'wrong' })).status, 401);
  assert.ok(!admin.log.rpc.includes('game_v2_pending_pushes'), 'no work before authentication');
  const ok = await call({ 'x-us-cron-key': 'cron-ok' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.deepEqual(Object.keys(ok.body).sort(), ['delivered', 'ok', 'outcomes', 'reason']);
  const worker = read('supabase/functions/game-v2-push-worker/index.ts');
  assert.ok(worker.indexOf('cronKey !== expectedKey') < worker.indexOf('dispatchGameV2PendingPushes(admin'));
});
