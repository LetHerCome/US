// Traguardi dei giorni insieme (founder, 29/10/2026): the hourly
// monthiversary-job awards every 100 days together (1000: the biggest prize)
// next to the mesiversario, and tells the couple about one of them only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness');

const COUPLE = '00000000-0000-4000-8000-0000000000c1';
const F = '00000000-0000-4000-8000-0000000000f1';
const B = '00000000-0000-4000-8000-0000000000b1';
const sub = (id, user) => ({ id, user_id: user, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });

let core;
test.before(async () => { core = await import('../supabase/functions/_shared/relationship-milestones.mjs'); });

test('which milestones fall on a day: every 100 days, 1000 the biggest prize, then the mesiversario', () => {
  const on = (iso) => { const [year, month, day] = iso.split('-').map(Number); return { year, month, day }; };
  assert.deepEqual(core.dueMilestones('2026-04-21', on('2026-07-30')), [{ kind: 'days', days: 100, xp: 80 }]);
  assert.deepEqual(core.dueMilestones('2026-04-21', on('2029-01-15')), [{ kind: 'days', days: 1000, xp: 300 }]);
  assert.deepEqual(core.dueMilestones('2026-04-21', on('2031-10-12')), [{ kind: 'days', days: 2000, xp: 300 }]);
  assert.ok(core.daysMilestoneXp(1000) > 200, 'more than an anniversary');
  assert.deepEqual(core.dueMilestones('2026-04-21', on('2026-07-31')), [], 'day 101');
  assert.deepEqual(core.dueMilestones('2026-04-21', on('2026-04-21')), [], 'Il nostro giorno is not a milestone');
  // 2026-01-04 → 2026-10-31 is 300 days; 2026-01-04 → 2026-10-04 a mesiversario only.
  assert.deepEqual(core.dueMilestones('2026-01-04', on('2026-10-31')), [{ kind: 'days', days: 300, xp: 80 }]);
  assert.deepEqual(core.dueMilestones('2026-01-04', on('2026-10-04')), [{ kind: 'monthiversary', months: 9, xp: 60 }]);
  // Both on one day (700 days after 1 May 2025 is 1 April 2027): the days first.
  assert.deepEqual(core.dueMilestones('2025-05-01', on('2027-04-01')), [{ kind: 'days', days: 700, xp: 80 }, { kind: 'monthiversary', months: 23, xp: 60 }]);
  assert.deepEqual(core.dueMilestones('2026-01-31', on('2027-02-28')), [{ kind: 'monthiversary', months: 13, xp: 60 }], 'the 31st on the last day of February');
  assert.deepEqual(core.dueMilestones('', on('2026-10-04')), []);
});

async function atInstant(iso, fn) {
  const RealDate = Date;
  const fixed = RealDate.parse(iso);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}
function world(startedOn, locales = {}) {
  const awards = [];
  const admin = createFakeAdmin({
    tables: {
      couples: [{ id: COUPLE, started_on: startedOn }],
      profiles: [{ id: F, couple_id: COUPLE, locale: locales[F] ?? null }, { id: B, couple_id: COUPLE, locale: locales[B] ?? null }],
      notification_preferences: [], push_subscriptions: [sub('s-fra', F), sub('s-bea', B)],
    },
    rpc: {
      get_internal_monthiversary_cron_key: 'cron-ok', get_internal_vapid_private_key: 'vapid-private',
      award_relationship_milestone: (args) => { awards.push(['month', args]); return true; },
      award_relationship_days_milestone: (args) => { awards.push(['days', args]); return true; },
    },
  });
  return { admin, awards, webpush: createFakeWebPush() };
}
async function run(w, iso) {
  const fn = await loadEdgeFunction('monthiversary-job', { admin: w.admin, webpush: w.webpush, env: { VAPID_SUBJECT: 'https://contact.example' } });
  return atInstant(iso, () => fn.call(new Request('https://x/functions/v1/monthiversary-job', { method: 'POST', headers: { 'x-us-cron-key': 'cron-ok' } })));
}

test('1000 days: awarded with the biggest prize and told to both, each in their language', async () => {
  const w = world('2026-04-21', { [B]: 'en' });
  const res = await run(w, '2029-01-15T08:30:00Z'); // 09:30 CET
  assert.deepEqual(res.body, { ok: true, awarded: 1, delivered: 2, date: '2029-01-15' });
  assert.deepEqual(w.awards, [['days', { target_couple_id: COUPLE, target_milestone_date: '2029-01-15', target_days: 1000, target_xp: 300 }]]);
  const byEndpoint = Object.fromEntries(w.webpush.sent.map((s) => [s.endpoint, s.payload]));
  assert.deepEqual([byEndpoint['https://push.example/s-fra'].title, byEndpoint['https://push.example/s-fra'].body, byEndpoint['https://push.example/s-fra'].target],
    ['US. · Mille giorni ♡', 'Oggi sono 1000 giorni insieme', 'events']);
  assert.deepEqual([byEndpoint['https://push.example/s-bea'].title, byEndpoint['https://push.example/s-bea'].body], ['US. · A thousand days ♡', '1000 days together today']);
  assert.doesNotMatch(JSON.stringify(w.webpush.sent), /XP|Bond|\+\d/);
});

test('100 days: its own copy; on a mesiversario too, both awarded and one notification each', async () => {
  const hundred = world('2026-04-21');
  await run(hundred, '2026-07-30T07:30:00Z');
  assert.deepEqual(hundred.webpush.sent.map((s) => [s.payload.title, s.payload.body]), [['US. · 100 giorni ♡', 'Oggi sono 100 giorni insieme'], ['US. · 100 giorni ♡', 'Oggi sono 100 giorni insieme']]);
  // 700 days after 1 May 2025 is 1 April 2027: a mesiversario too.
  const w = world('2025-05-01');
  const res = await run(w, '2027-04-01T07:30:00Z');
  assert.equal(res.body.awarded, 2);
  assert.deepEqual(w.awards.map(([k]) => k), ['days', 'month']);
  assert.equal(w.webpush.sent.length, 2, 'one notification per person, about the days');
  assert.match(w.webpush.sent[0].payload.body, /700 giorni/);
});

test('an ordinary day awards nothing; a days milestone already given is not told again', async () => {
  const quiet = world('2026-04-21');
  assert.equal((await run(quiet, '2026-07-31T07:30:00Z')).body.awarded, 0);
  const replay = createFakeAdmin({
    tables: { couples: [{ id: COUPLE, started_on: '2026-04-21' }], profiles: [{ id: F, couple_id: COUPLE }], notification_preferences: [], push_subscriptions: [sub('s-fra', F)] },
    rpc: { get_internal_monthiversary_cron_key: 'cron-ok', get_internal_vapid_private_key: 'vapid-private', award_relationship_days_milestone: () => false, award_relationship_milestone: () => false },
  });
  const webpush = createFakeWebPush();
  const fn = await loadEdgeFunction('monthiversary-job', { admin: replay, webpush, env: { VAPID_SUBJECT: 'https://contact.example' } });
  const res = await atInstant('2026-07-30T07:30:00Z', () => fn.call(new Request('https://x/functions/v1/monthiversary-job', { method: 'POST', headers: { 'x-us-cron-key': 'cron-ok' } })));
  assert.deepEqual([res.body.awarded, webpush.sent.length], [0, 0]);
});
