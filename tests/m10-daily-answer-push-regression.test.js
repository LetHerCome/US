// M10D — the Daily Question ANSWER push stays exactly as it was: it lives in
// send-web-push (not rebuilt, not duplicated by the M10C system push). The real
// Edge Function runs under Node with in-memory doubles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness.js');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const COUPLE = 'couple-1';
const F = 'francesco-id';
const B = 'beatrice-id';
const Q = { id: 'q-1', question_date: '2026-10-05', question: 'Quale momento della giornata vorresti passare più spesso con me?' };
const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const answer = (userId, text) => ({ question_id: Q.id, user_id: userId, couple_id: COUPLE, answer: text });

async function setup({ answers = [], preferences = [], names = { [F]: 'Francesco', [B]: 'Beatrice' } } = {}) {
  const admin = createFakeAdmin({
    tables: {
      profiles: [{ id: F, couple_id: COUPLE, display_name: names[F], role: 'francesco' }, { id: B, couple_id: COUPLE, display_name: names[B], role: 'beatrice' }],
      daily_questions: [Q],
      daily_answers: answers,
      notification_preferences: preferences,
      push_subscriptions: [sub('s-fra', F), sub('s-bea', B)],
      push_event_log: [],
    },
    users: { 'jwt-f': { id: F }, 'jwt-b': { id: B } },
    rpc: { get_internal_vapid_private_key: 'vapid-private' },
  });
  const webpush = createFakeWebPush();
  const edge = await loadEdgeFunction('send-web-push', { admin, webpush });
  const answered = (token) => edge.call(new Request('https://x/functions/v1/send-web-push', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ type: 'daily_answer', reference_id: Q.id }),
  }));
  return { admin, webpush, answered };
}

test('M10D: prima risposta → solo il partner riceve "<Nome> ha risposto. Ora tocca a te."', async () => {
  const { admin, webpush, answered } = await setup({ answers: [answer(F, 'Mia-F')] });
  const response = await answered('jwt-f');
  assert.deepEqual(response, { status: 200, body: { delivered: 1, failed: 0 } });
  assert.deepEqual(webpush.sent.map((s) => s.endpoint), ['https://push.example/s-bea']);
  assert.deepEqual(webpush.sent[0].payload, {
    title: 'US. · Today', body: 'Francesco ha risposto. Ora tocca a te.', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: `daily-answer-${Q.id}`, target: 'today', url: '/?open=today&from=push',
  });
  assert.deepEqual(webpush.sent[0].options, { TTL: 60 * 60 * 12, urgency: 'normal' });
  assert.deepEqual(admin.db.push_event_log.map(({ dedupe_key, sender_id, event_type }) => ({ dedupe_key, sender_id, event_type })),
    [{ dedupe_key: `daily-answer:${Q.id}:${F}`, sender_id: F, event_type: 'daily_answer' }]);
});

test('M10D: simmetrico — Beatrice risponde per prima, avvisa solo Francesco', async () => {
  const { webpush, answered } = await setup({ answers: [answer(B, 'Mia-B')] });
  await answered('jwt-b');
  assert.deepEqual(webpush.sent.map((s) => [s.endpoint, s.payload.body]), [['https://push.example/s-fra', 'Beatrice ha risposto. Ora tocca a te.']]);
});

test('M10D: seconda risposta → entrambi ricevono "Le vostre risposte sono pronte ♡"', async () => {
  const { admin, webpush, answered } = await setup({ answers: [answer(F, 'Mia-F')] });
  await answered('jwt-f');
  admin.db.daily_answers.push(answer(B, 'Mia-B'));
  const response = await answered('jwt-b');
  assert.deepEqual(response.body, { delivered: 2, failed: 0 });
  const reveal = webpush.sent.slice(1);
  assert.deepEqual(reveal.map((s) => s.endpoint).sort(), ['https://push.example/s-bea', 'https://push.example/s-fra']);
  for (const { payload } of reveal) {
    assert.equal(payload.body, 'Le vostre risposte sono pronte ♡');
    assert.equal(payload.title, 'US. · Today');
    assert.equal(payload.tag, `daily-reveal-${Q.id}`);
    assert.equal(payload.target, 'today');
  }
  assert.ok(admin.db.push_event_log.some((row) => row.dedupe_key === `daily-reveal:${COUPLE}:${Q.id}`));
});

test('M10D: dedupe — retry della prima risposta e doppio reveal non duplicano', async () => {
  const { admin, webpush, answered } = await setup({ answers: [answer(F, 'Mia-F')] });
  await answered('jwt-f');
  assert.deepEqual((await answered('jwt-f')).body, { delivered: 0, deduplicated: true });
  admin.db.daily_answers.push(answer(B, 'Mia-B'));
  await answered('jwt-b');
  assert.deepEqual((await answered('jwt-f')).body, { delivered: 0, deduplicated: true }, 'the reveal key is per couple+question');
  assert.deepEqual((await answered('jwt-b')).body, { delivered: 0, deduplicated: true });
  assert.equal(webpush.sent.length, 3);
});

test('M10D: preferenza today=false rispettata; senza riga = attiva', async () => {
  const off = await setup({ answers: [answer(F, 'Mia-F')], preferences: [{ user_id: B, today: false, think: true, bond: true, relationship: true }] });
  assert.deepEqual((await off.answered('jwt-f')).body, { delivered: 0, reason: 'disabled-by-preference' });
  assert.equal(off.webpush.sent.length, 0);
  assert.equal(off.admin.db.push_event_log.length, 0);

  const reveal = await setup({ answers: [answer(F, 'Mia-F'), answer(B, 'Mia-B')], preferences: [{ user_id: F, today: false }] });
  await reveal.answered('jwt-b');
  assert.deepEqual(reveal.webpush.sent.map((s) => s.endpoint), ['https://push.example/s-bea']);
});

test('M10D: privacy — né domanda né risposte nel payload; senza risposta salvata nessuna push', async () => {
  const { webpush, answered } = await setup({ answers: [answer(F, 'Mia-F'), answer(B, 'Mia-B')] });
  await answered('jwt-f');
  const raw = JSON.stringify(webpush.sent);
  assert.doesNotMatch(raw, /Mia-F|Mia-B|Quale momento/);

  const early = await setup();
  assert.equal((await early.answered('jwt-f')).status, 409);
  assert.equal(early.webpush.sent.length, 0);

  const anon = await setup({ answers: [answer(F, 'x')], names: { [F]: null, [B]: 'Beatrice' } });
  await anon.answered('jwt-f');
  assert.equal(anon.webpush.sent[0].payload.body, 'La tua persona ha risposto. Ora tocca a te.');
});

test('M10D: la push delle risposte non è stata ricostruita né duplicata altrove', () => {
  const edge = read('supabase/functions/send-web-push/index.ts');
  assert.equal((edge.match(/type === "daily_answer"/g) || []).length, 1);
  assert.doesNotMatch(edge, /"daily_question"|daily-question/);
  const core = read('supabase/functions/_shared/daily-question-push-core.mjs');
  const worker = read('supabase/functions/daily-question-push-worker/index.ts');
  assert.doesNotMatch(core + worker, /ha risposto|risposte sono pronte|daily-answer|daily-reveal/);
  // The client still triggers the answer push from the saved answer only.
  assert.match(read('app.js'), /sendWebPushEvent\('daily_answer',window\.todayQuestion\.id\)/);
});
