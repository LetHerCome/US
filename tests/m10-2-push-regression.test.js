// M10.2A — the existing daily_answer push is preserved, not rebuilt: the REAL
// send-web-push runs under Node. (m10-daily-answer-push-regression.test.js holds
// the M10D detail; this file pins the M10.2 promises and the "no reaction push" rule.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness.js');

const COUPLE = 'couple-1'; const F = 'francesco-id'; const B = 'beatrice-id';
const Q = { id: 'q-1', question_date: '2026-10-05', question: 'Domanda segretissima?' };
const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const answer = (userId, text) => ({ question_id: Q.id, user_id: userId, couple_id: COUPLE, answer: text });

async function setup({ answers = [], preferences = [] } = {}) {
  const admin = createFakeAdmin({
    tables: {
      profiles: [{ id: F, couple_id: COUPLE, display_name: 'Francesco', role: 'francesco' }, { id: B, couple_id: COUPLE, display_name: 'Beatrice', role: 'beatrice' }],
      daily_questions: [Q], daily_answers: answers, notification_preferences: preferences,
      push_subscriptions: [sub('s-fra', F), sub('s-bea', B)], push_event_log: [],
    },
    users: { 'jwt-f': { id: F }, 'jwt-b': { id: B } },
    rpc: { get_internal_vapid_private_key: 'vapid-private' },
  });
  const webpush = createFakeWebPush();
  const edge = await loadEdgeFunction('send-web-push', { admin, webpush });
  const call = (token, type, reference_id = Q.id) => edge.call(new Request('https://x/functions/v1/send-web-push', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ type, reference_id }),
  }));
  return { admin, webpush, answered: (token) => call(token, 'daily_answer'), call };
}

test('M10.2A: prima risposta → solo il partner; seconda → entrambi con la copy privata su target today', async () => {
  const t = await setup({ answers: [answer(F, 'SEGRETO-F')] });
  await t.answered('jwt-f');
  assert.deepEqual(t.webpush.sent.map((s) => [s.endpoint, s.payload.body]), [['https://push.example/s-bea', 'Francesco ha risposto. Ora tocca a te.']]);

  t.admin.db.daily_answers.push(answer(B, 'SEGRETO-B'));
  const second = await t.answered('jwt-b');
  assert.deepEqual(second.body, { delivered: 2, failed: 0 });
  const reveal = t.webpush.sent.slice(1);
  assert.deepEqual(reveal.map((s) => s.endpoint).sort(), ['https://push.example/s-bea', 'https://push.example/s-fra']);
  for (const { payload } of reveal) {
    assert.equal(payload.title, 'US. · Today');
    assert.equal(payload.body, 'Le vostre risposte sono pronte ♡');
    assert.equal(payload.target, 'today');
    assert.equal(payload.url, '/?open=today&from=push');
  }
  assert.doesNotMatch(JSON.stringify(t.webpush.sent), /SEGRETO|segretissima|cuore|heart|angry|cry|reag/i, 'no question, answer or reaction detail in any payload');
  assert.ok(t.admin.db.push_event_log.some((row) => row.dedupe_key === `daily-reveal:${COUPLE}:${Q.id}`), 'one logical reveal event per couple+question');
});

test('M10.2A: retry non duplica il reveal; today=false rispettato', async () => {
  const t = await setup({ answers: [answer(F, 'a'), answer(B, 'b')] });
  await t.answered('jwt-b');
  const sent = t.webpush.sent.length;
  assert.deepEqual((await t.answered('jwt-b')).body, { delivered: 0, deduplicated: true });
  assert.deepEqual((await t.answered('jwt-f')).body, { delivered: 0, deduplicated: true });
  assert.equal(t.webpush.sent.length, sent);

  const off = await setup({ answers: [answer(F, 'a'), answer(B, 'b')], preferences: [{ user_id: F, today: false }, { user_id: B, today: false }] });
  assert.deepEqual((await off.answered('jwt-b')).body, { delivered: 0, reason: 'disabled-by-preference' });
  assert.equal(off.webpush.sent.length, 0);
});

test('M10.2: nessuna push per reazione, ricevuta o dismiss — nessun tipo evento li accetta', async () => {
  const t = await setup({ answers: [answer(F, 'a'), answer(B, 'b')] });
  for (const type of ['daily_reaction', 'daily_answer_reaction', 'reveal_seen', 'daily_reveal_dismiss']) {
    const response = await t.call('jwt-f', type);
    assert.equal(response.status, 400, type);
  }
  assert.equal(t.webpush.sent.length, 0);
  assert.equal(t.admin.db.push_event_log.length, 0);
});
