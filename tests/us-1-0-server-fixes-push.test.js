// US 1.0 server fixes (audit scope B): the real Edge Functions and shared
// push cores under Node, with in-memory doubles (no network, no Supabase).
//   R2  delete-moment: only the creator deletes a memory.
//   A11/N7 monthiversary-job: month-end starts, no points in the text, Eventi.
//   G11 game pushes name the game; O7 Ti penso reaction named; N5 mission
//   title; A6 "Risposte pronte" only to the partner; O2 daily_reaction;
//   A2 partner_joined; O3 evening reminder; every copy in the recipient's
//   language (profiles.locale, null = Italian).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness.js');

const ROOT = path.resolve(__dirname, '..');
const shared = (file) => import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared', file)).href);
const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COUPLE = UUID(900);
const F = UUID(1);
const B = UUID(2);
const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const FORBIDDEN_IT = /\bToday\b|\bBond\b|\bXP\b|\bquest\b/i;

// ------------------------------------------------------------ catalogue

test('catalogue: Italian copy never says Today, Bond, XP or quest; English follows the recipient locale', async () => {
  const core = await shared('notification-core.mjs');
  assert.ok(core.NOTIFICATION_TARGETS.includes('events'), 'Eventi is an allow-listed target');
  const args = { senderName: 'Bea', messageId: UUID(5), questionId: UUID(6), questId: UUID(7), itemId: UUID(8), sessionId: UUID(9),
    tag: 'game-waiting:x', entryId: UUID(10), reminderId: 'r1', body: 'Cena', title: 'Auguri', reaction: 'heart', gameName: 'Ridete',
    questTitle: 'Cena a lume di candela', kind: 'monthiversary', months: 13 };
  for (const type of core.NOTIFICATION_TYPES) {
    if (type === 'calendar_reminder') continue; // reminders are off until 1.1 (N8)
    const it = core.buildNotification(type, args);
    assert.doesNotMatch(`${it.title} ${it.body}`, FORBIDDEN_IT, `${type} (it)`);
    assert.deepEqual(core.buildNotification(type, { ...args, locale: null }), it, `${type}: null locale = Italian`);
    const en = core.buildNotification(type, { ...args, locale: 'en' });
    assert.equal(en.target, it.target, type);
    assert.equal(en.tag, it.tag, type);
    if (!['calendar_reminder'].includes(type) && it.body !== 'Cena') assert.notEqual(en.body, it.body, `${type}: English copy exists`);
  }
  const en = (type, extra = {}) => core.buildNotification(type, { ...args, ...extra, locale: 'en' });
  assert.equal(en('daily_question').title, 'US. · Question of the day');
  assert.equal(en('quest_confirmed').title, 'US. · Missions');
  assert.equal(en('think_reaction').title, 'US. · Thinking of you');
  assert.equal(en('left_for_you').body, 'Bea left something for you ♡');
  assert.equal(en('game_waiting', { gameName: 'This or that' }).body, 'Bea finished This or that: your turn');
});

test('catalogue: reactions are named, never "angry"; the anniversary copy has no points and opens Eventi', async () => {
  const { buildNotification } = await shared('notification-core.mjs');
  const think = (reaction, locale) => buildNotification('think_reaction', { senderName: 'Bea', messageId: UUID(5), reaction, locale }).body;
  assert.equal(think('heart'), 'Bea ti manda un cuore ♥');
  assert.equal(think('hug'), 'Bea ti manda un abbraccio');
  assert.equal(think('miss_you'), 'Bea: mi manchi');
  assert.equal(think('hug', 'en'), 'Bea sends you a hug');
  const daily = (reaction, locale) => buildNotification('daily_reaction', { senderName: 'Bea', questionId: UUID(6), reaction, locale }).body;
  assert.equal(daily('heart'), 'Bea ha messo ♥ alla tua risposta');
  assert.equal(daily('cry'), 'Bea: mi hai commosso');
  assert.equal(daily('cry', 'en'), 'Bea: you moved me');
  assert.doesNotMatch(daily('angry'), /arrabbiat|angry/i);
  const rel = (kind, months, locale) => buildNotification('relationship', { kind, months, tag: 'relationship-2027-02-28', locale });
  assert.deepEqual([rel('monthiversary', 1).title, rel('monthiversary', 1).body, rel('monthiversary', 1).target], ['US. · Mesiversario ♡', 'Oggi è un mese insieme', 'events']);
  assert.equal(rel('monthiversary', 13).body, 'Oggi sono 13 mesi insieme');
  assert.deepEqual([rel('anniversary', 24).title, rel('anniversary', 24).body], ['US. · Anniversario ♡', 'Oggi sono 2 anni insieme']);
  assert.equal(rel('anniversary', 12, 'en').body, 'One year together today');
  assert.equal(buildNotification('partner_joined', { senderName: 'Bea' }).body, 'Bea ha accettato l’invito: il vostro spazio è pronto');
});

test('recipientLocales: en only for locale en; missing column, row or a failed read = Italian', async () => {
  const { recipientLocales, recipientLocale } = await shared('notification-core.mjs');
  const admin = createFakeAdmin({ tables: { profiles: [{ id: F, locale: 'en' }, { id: B, locale: null }] } });
  assert.deepEqual([...(await recipientLocales(admin, [F, B, 'ghost']))], [[F, 'en'], [B, 'it'], ['ghost', 'it']]);
  const broken = createFakeAdmin({ tables: { profiles: [] }, errors: { profiles: { message: 'column profiles.locale does not exist' } } });
  assert.equal(await recipientLocale(broken, F), 'it');
});

// ------------------------------------------------------------ send-web-push

function sendWorld({ tables = {}, locales = {} } = {}) {
  const admin = createFakeAdmin({
    tables: {
      profiles: [
        { id: F, couple_id: COUPLE, display_name: 'Francesco', role: 'francesco', locale: locales[F] ?? null },
        { id: B, couple_id: COUPLE, display_name: 'Bea', role: 'beatrice', locale: locales[B] ?? null },
      ],
      notification_preferences: [], push_subscriptions: [sub('s-fra', F), sub('s-bea', B)], push_event_log: [],
      ...tables,
    },
    users: { 'jwt-f': { id: F }, 'jwt-b': { id: B } },
    rpc: { get_internal_vapid_private_key: 'vapid-private' },
  });
  const webpush = createFakeWebPush();
  return { admin, webpush };
}
async function sender(world) {
  const edge = await loadEdgeFunction('send-web-push', world);
  return (token, body) => edge.call(new Request('https://x/functions/v1/send-web-push', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }));
}

const Q = UUID(50);
const answers = () => [
  { id: UUID(51), question_id: Q, user_id: F, couple_id: COUPLE, answer: 'SEGRETO-F' },
  { id: UUID(52), question_id: Q, user_id: B, couple_id: COUPLE, answer: 'SEGRETO-B' },
];
const reaction = (role, value) => ({ couple_id: COUPLE, question_id: Q, actor_role: role, reaction: value });

test('O2 daily_reaction: only a stored ♥ or "commosso" of the caller notifies the answer author, once', async () => {
  const world = sendWorld({ tables: { daily_questions: [{ id: Q }], daily_answers: answers(), daily_question_reveal_states: [reaction('beatrice', 'heart')] } });
  const post = await sender(world);
  // Francesco never reacted: refused, nothing sent.
  assert.equal((await post('jwt-f', { type: 'daily_reaction', reference_id: Q })).status, 409);
  assert.equal((await post('jwt-b', { type: 'daily_reaction' })).status, 400);
  const ok = await post('jwt-b', { type: 'daily_reaction', reference_id: Q });
  assert.deepEqual(ok.body, { delivered: 1, failed: 0 });
  assert.deepEqual(world.webpush.sent.map((s) => [s.endpoint, s.payload.title, s.payload.body, s.payload.target]),
    [['https://push.example/s-fra', 'US. · Domanda del giorno', 'Bea ha messo ♥ alla tua risposta', 'today']]);
  assert.doesNotMatch(JSON.stringify(world.webpush.sent), /SEGRETO/);
  assert.deepEqual((await post('jwt-b', { type: 'daily_reaction', reference_id: Q })).body, { delivered: 0, deduplicated: true });
  assert.ok(world.admin.db.push_event_log.some((row) => row.dedupe_key === `daily-reaction:${Q}:${B}` && row.event_type === 'daily_reaction'));

  // "angry" (no longer offered by the app) never notifies; cry does, in the author's language.
  const angry = sendWorld({ tables: { daily_questions: [{ id: Q }], daily_answers: answers(), daily_question_reveal_states: [reaction('beatrice', 'angry')] } });
  assert.equal((await (await sender(angry))('jwt-b', { type: 'daily_reaction', reference_id: Q })).status, 409);
  assert.equal(angry.webpush.sent.length, 0);
  const cry = sendWorld({ locales: { [F]: 'en' }, tables: { daily_questions: [{ id: Q }], daily_answers: answers(), daily_question_reveal_states: [reaction('beatrice', 'cry')] } });
  await (await sender(cry))('jwt-b', { type: 'daily_reaction', reference_id: Q });
  assert.deepEqual(cry.webpush.sent.map((s) => [s.payload.title, s.payload.body]), [['US. · Question of the day', 'Bea: you moved me']]);
  // Another couple's reaction row, or no partner answer: refused. Preference today=false: nothing.
  const foreign = sendWorld({ tables: { daily_answers: answers(), daily_question_reveal_states: [{ ...reaction('beatrice', 'heart'), couple_id: UUID(901) }] } });
  assert.equal((await (await sender(foreign))('jwt-b', { type: 'daily_reaction', reference_id: Q })).status, 409);
  const noAnswer = sendWorld({ tables: { daily_answers: answers().slice(1), daily_question_reveal_states: [reaction('beatrice', 'heart')] } });
  assert.equal((await (await sender(noAnswer))('jwt-b', { type: 'daily_reaction', reference_id: Q })).status, 409);
  const off = sendWorld({ tables: { daily_answers: answers(), daily_question_reveal_states: [reaction('beatrice', 'heart')], notification_preferences: [{ user_id: F, today: false }] } });
  assert.deepEqual((await (await sender(off))('jwt-b', { type: 'daily_reaction', reference_id: Q })).body, { delivered: 0, reason: 'disabled-by-preference' });
});

test('A6 + locale: the reveal reaches only the partner, in the partner\'s language', async () => {
  const world = sendWorld({ locales: { [F]: 'en' }, tables: { daily_questions: [{ id: Q }], daily_answers: answers() } });
  const post = await sender(world);
  assert.deepEqual((await post('jwt-b', { type: 'daily_answer', reference_id: Q })).body, { delivered: 1, failed: 0 });
  assert.deepEqual(world.webpush.sent.map((s) => [s.endpoint, s.payload.title, s.payload.body]),
    [['https://push.example/s-fra', 'US. · Question of the day', 'Your answers are ready ♡']]);
});

test('O7 think_reaction: the push names the reaction the server stored', async () => {
  const MSG = UUID(60);
  const world = sendWorld({ tables: {
    shared_messages: [{ id: MSG, couple_id: COUPLE, sender_id: B, recipient_id: F, kind: 'think' }],
    think_reactions: [{ message_id: MSG, reaction: 'hug' }],
  } });
  const post = await sender(world);
  assert.equal((await post('jwt-f', { type: 'think_reaction', reference_id: MSG, reaction: 'heart' })).status, 403, 'must match the stored reaction');
  await post('jwt-f', { type: 'think_reaction', reference_id: MSG, reaction: 'hug' });
  assert.deepEqual(world.webpush.sent.map((s) => [s.endpoint, s.payload.title, s.payload.body]),
    [['https://push.example/s-bea', 'US. · Ti penso', 'Francesco ti manda un abbraccio']]);
});

test('O6 Ti penso: one push every 2 minutes per person, the next one counts the ones in between', async () => {
  const MSG = UUID(61);
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const think = (id, ms) => ({ id, couple_id: COUPLE, sender_id: B, recipient_id: F, kind: 'think', created_at: ago(ms) });
  const lastPush = (ms) => ({ dedupe_key: `think:${UUID(66)}`, couple_id: COUPLE, sender_id: B, event_type: 'think', created_at: ago(ms) });
  // A push 30 s ago: this one stays in the app only.
  const soon = sendWorld({ tables: { shared_messages: [think(MSG, 0)], push_event_log: [lastPush(30_000)] } });
  assert.deepEqual((await (await sender(soon))('jwt-b', { type: 'think', reference_id: MSG })).body, { delivered: 0, failed: 0, reason: 'throttled' });
  assert.equal(soon.webpush.sent.length, 0);
  // Last push 5 minutes ago, two more since then plus this one: "3 volte".
  const later = sendWorld({ tables: { shared_messages: [think(UUID(62), 240_000), think(UUID(63), 200_000), think(MSG, 0)], push_event_log: [lastPush(300_000)] } });
  assert.deepEqual((await (await sender(later))('jwt-b', { type: 'think', reference_id: MSG })).body, { delivered: 1, failed: 0 });
  assert.deepEqual(later.webpush.sent.map((s) => [s.endpoint, s.payload.body]), [['https://push.example/s-fra', 'Bea ti ha pensato 3 volte ♡']]);
  // First Ti penso in a while: the usual line, in the recipient's language.
  const first = sendWorld({ locales: { [F]: 'en' }, tables: { shared_messages: [think(UUID(64), 3_600_000), think(MSG, 0)] } });
  await (await sender(first))('jwt-b', { type: 'think', reference_id: MSG });
  assert.deepEqual(first.webpush.sent.map((s) => s.payload.body), ['Bea is thinking of you ♡']);
});

test('N5 quest_confirmed: "ha fatto «titolo». Ora tocca a te", English title from the template, nothing once both confirmed', async () => {
  const QUEST = UUID(70);
  const quest = (confirmed) => ({ id: QUEST, couple_id: COUPLE, title: 'Cena senza telefoni', template_key: 'dinner_no_phones', confirmed_by: confirmed });
  const it = sendWorld({ tables: { bond_weekly_quests: [quest([B])], bond_quest_templates: [{ key: 'dinner_no_phones', title_en: 'Phone-free dinner' }] } });
  await (await sender(it))('jwt-b', { type: 'quest_confirmed', reference_id: QUEST });
  assert.deepEqual(it.webpush.sent.map((s) => [s.endpoint, s.payload.title, s.payload.body, s.payload.target]),
    [['https://push.example/s-fra', 'US. · Missioni', 'Bea ha fatto «Cena senza telefoni». Ora tocca a te', 'bond']]);
  const en = sendWorld({ locales: { [F]: 'en' }, tables: { bond_weekly_quests: [quest([B])], bond_quest_templates: [{ key: 'dinner_no_phones', title_en: 'Phone-free dinner' }] } });
  await (await sender(en))('jwt-b', { type: 'quest_confirmed', reference_id: QUEST });
  assert.deepEqual(en.webpush.sent.map((s) => [s.payload.title, s.payload.body]), [['US. · Missions', 'Bea did “Phone-free dinner”. Your turn now']]);
  const done = sendWorld({ tables: { bond_weekly_quests: [quest([F, B])] } });
  assert.deepEqual((await (await sender(done))('jwt-b', { type: 'quest_confirmed', reference_id: QUEST })).body, { delivered: 0, reason: 'already-confirmed' });
  assert.equal(done.webpush.sent.length, 0);
});

test('A2 partner_joined: only the joiner of this couple, right after joining, notifies the creator once', async () => {
  const now = new Date().toISOString();
  const invite = (extra = {}) => ({ couple_id: COUPLE, role: 'beatrice', used_by: B, used_at: now, ...extra });
  const world = sendWorld({ tables: { couple_invites: [invite()] } });
  const post = await sender(world);
  assert.equal((await post('jwt-b', { type: 'partner_joined', reference_id: UUID(901) })).status, 403, 'another couple id');
  assert.equal((await post('jwt-f', { type: 'partner_joined', reference_id: COUPLE })).status, 403, 'the creator is not the joiner');
  const ok = await post('jwt-b', { type: 'partner_joined', reference_id: COUPLE });
  assert.deepEqual(ok.body, { delivered: 1, failed: 0 });
  assert.deepEqual(world.webpush.sent.map((s) => [s.endpoint, s.payload.body, s.payload.target]),
    [['https://push.example/s-fra', 'Bea ha accettato l’invito: il vostro spazio è pronto', 'home']]);
  assert.deepEqual((await post('jwt-b', { type: 'partner_joined', reference_id: COUPLE })).body, { delivered: 0, deduplicated: true });
  assert.ok(world.admin.db.push_event_log.some((row) => row.dedupe_key === `partner-joined:${COUPLE}`));

  const stale = sendWorld({ tables: { couple_invites: [invite({ used_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() })] } });
  assert.equal((await (await sender(stale))('jwt-b', { type: 'partner_joined', reference_id: COUPLE })).status, 403, 'an old join (legacy couple) never notifies');
  const english = sendWorld({ locales: { [F]: 'en' }, tables: { couple_invites: [invite()] } });
  await (await sender(english))('jwt-b', { type: 'partner_joined', reference_id: COUPLE });
  assert.equal(english.webpush.sent[0].payload.body, 'Bea joined: your space is ready');
});

// ------------------------------------------------------------ game pushes (G11)

test('G11 game pushes name the game of the round, in the recipient language; other couples never leak a name', async () => {
  const { deliverGamePush, gameName } = await shared('game-v2-push-core.mjs');
  const SID = UUID(80);
  const event = (kind = 'game_waiting', role = 'francesco') => ({ kind, couple_id: COUPLE, sender_role: kind === 'game_waiting' ? 'beatrice' : null,
    recipient_role: role, dedupe_key: `${kind === 'game_waiting' ? 'game-waiting' : 'game-reveal'}:${SID}:${role}` });
  const world = (family, coupleId = COUPLE, locale = null) => {
    const admin = createFakeAdmin({ tables: {
      profiles: [{ id: F, couple_id: COUPLE, role: 'francesco', display_name: 'Francesco', locale }, { id: B, couple_id: COUPLE, role: 'beatrice', display_name: 'Bea' }],
      game_sessions: [{ id: SID, couple_id: coupleId, game_family: family }], push_subscriptions: [sub('s-fra', F)], push_event_log: [],
    } });
    const web = createFakeWebPush();
    return { admin, web, options: { ensureVapid() {}, sendNotification: web.sendNotification.bind(web) } };
  };
  for (const [family, body] of [['ridete', 'Bea ha finito Ridete: tocca a te'], ['quanto_mi_conosci', 'Bea ha finito Quanto mi conosci?: tocca a te'],
    ['e_se', 'Bea ha finito Confrontatevi: tocca a te'], ['swipe', 'Bea ha finito Questo o quello: tocca a te'], ['mystery', 'Bea ha giocato: tocca a te']]) {
    const w = world(family);
    await deliverGamePush(w.admin, event(), w.options);
    assert.deepEqual([w.web.sent[0].payload.title, w.web.sent[0].payload.body], ['US. · Gioca', body], family);
  }
  const reveal = world('scopritevi');
  await deliverGamePush(reveal.admin, event('game_reveal'), reveal.options);
  assert.equal(reveal.web.sent[0].payload.body, 'Scopritevi: le vostre risposte sono pronte ♡');
  const english = world('swipe', COUPLE, 'en');
  await deliverGamePush(english.admin, event(), english.options);
  assert.deepEqual([english.web.sent[0].payload.title, english.web.sent[0].payload.body], ['US. · Play', 'Bea finished This or that: your turn']);
  const foreign = world('ridete', UUID(901));
  await deliverGamePush(foreign.admin, event(), foreign.options);
  assert.equal(foreign.web.sent[0].payload.body, 'Bea ha giocato: tocca a te', 'a round of another couple is never read');
  assert.equal(gameName('constructor', 'it'), null);
});

// ------------------------------------------------------------ evening reminder (O3)

const DAY = '2026-10-15';
const DQ = { id: 'q-2026-10-15', question_date: DAY };
const at = (iso) => new Date(iso);
function eveningWorld({ answers: rows = [], preferences = [], extraProfiles = [], locale = null } = {}) {
  return createFakeAdmin({
    tables: {
      profiles: [{ id: F, couple_id: COUPLE, display_name: 'Francesco', locale }, { id: B, couple_id: COUPLE, display_name: 'Bea' }, ...extraProfiles],
      daily_questions: [DQ], daily_answers: rows, notification_preferences: preferences,
      push_subscriptions: [sub('s-fra', F), sub('s-bea', B), sub('s-solo', 'solo')], push_event_log: [],
    },
  });
}
const beaAnswered = (iso) => ({ question_id: DQ.id, user_id: B, couple_id: COUPLE, created_at: iso });
async function evening(admin, now) {
  const { dispatchDailyQuestionPush } = await shared('daily-question-push-core.mjs');
  const webpush = createFakeWebPush();
  const result = await dispatchDailyQuestionPush(admin, { now, sendNotification: webpush.sendNotification.bind(webpush) });
  return { result, webpush };
}

test('O3 evening reminder: at 20:30 Rome, once, only to whoever the partner is waiting for', async () => {
  const admin = eveningWorld({ answers: [beaAnswered('2026-10-15T10:00:00Z')] }); // Bea answered at 12:00 CEST
  const early = await evening(admin, at('2026-10-15T18:20:00Z')); // 20:20 CEST
  assert.equal(early.result.evening, undefined, 'not before 20:30');
  admin.db.push_event_log.length = 0;

  const first = await evening(admin, at('2026-10-15T18:30:00Z')); // 20:30 CEST
  assert.deepEqual(first.result.evening.recipients.map((r) => [r.userId, r.outcome]), [[F, 'delivered']]);
  assert.equal(first.result.recipients.find((r) => r.userId === F).outcome, 'evening-reminder', 'no "new question" on top of it');
  assert.equal(first.result.recipients.find((r) => r.userId === B).outcome, 'already-answered');
  const reminder = first.webpush.sent.filter((s) => s.payload.tag === `daily-evening-${DQ.id}`);
  assert.deepEqual(reminder.map((s) => [s.endpoint, s.payload.title, s.payload.body, s.payload.target]),
    [['https://push.example/s-fra', 'US. · La domanda di oggi', 'Bea ha già risposto alla domanda di oggi. Tocca a te ♡', 'today']]);
  const claim = admin.db.push_event_log.find((row) => row.dedupe_key === `daily-evening:${DAY}:${F}`);
  assert.deepEqual([claim.event_type, claim.sender_id, claim.couple_id], ['daily_evening', null, COUPLE]);

  const again = await evening(admin, at('2026-10-15T18:40:00Z'));
  assert.deepEqual(again.result.evening.recipients.map((r) => r.outcome), ['deduplicated']);
  assert.equal(again.webpush.sent.filter((s) => s.payload.tag.startsWith('daily-evening')).length, 0, 'at most once per day');
  const late = await evening(admin, at('2026-10-15T20:00:00Z')); // 22:00 CEST
  assert.equal(late.result.reason, 'outside-window');
});

test('O3 evening reminder: not when the partner answered after 20:30, both answered, today=false, or no partner', async () => {
  const lateAnswer = await evening(eveningWorld({ answers: [beaAnswered('2026-10-15T18:45:00Z')] }), at('2026-10-15T18:50:00Z'));
  assert.deepEqual(lateAnswer.result.evening.recipients, [], 'Bea answered at 20:45: the immediate push already said it');
  const both = await evening(eveningWorld({ answers: [beaAnswered('2026-10-15T10:00:00Z'), { question_id: DQ.id, user_id: F, couple_id: COUPLE, created_at: '2026-10-15T11:00:00Z' }] }), at('2026-10-15T18:30:00Z'));
  assert.deepEqual(both.result.evening.recipients, []);
  const off = await evening(eveningWorld({ answers: [beaAnswered('2026-10-15T10:00:00Z')], preferences: [{ user_id: F, today: false }] }), at('2026-10-15T18:30:00Z'));
  assert.deepEqual(off.result.evening.recipients, []);
  assert.equal(off.webpush.sent.length, 0);
  const solo = await evening(eveningWorld({ extraProfiles: [{ id: 'solo', couple_id: UUID(902), display_name: 'Solo' }] }), at('2026-10-15T18:30:00Z'));
  assert.ok(!solo.result.evening.recipients.some((r) => r.userId === 'solo'), 'a space still waiting for the partner gets no reminder');
  const english = await evening(eveningWorld({ answers: [beaAnswered('2026-10-15T10:00:00Z')], locale: 'en' }), at('2026-10-15T18:30:00Z'));
  assert.deepEqual(english.webpush.sent.map((s) => [s.payload.title, s.payload.body]),
    [['US. · Question of the day', "Bea already answered today's question. Your turn ♡"]]);
});

test('O3 worker: the same cron run reports the evening outcomes', async () => {
  const admin = eveningWorld({ answers: [beaAnswered('2026-10-15T10:00:00Z')] });
  admin.rpc = async (name) => ({ data: { get_internal_daily_question_push_cron_key: 'cron-ok', get_internal_vapid_private_key: 'vapid' }[name] ?? null, error: null });
  const webpush = createFakeWebPush();
  const fn = await loadEdgeFunction('daily-question-push-worker', { admin, webpush });
  const response = await atInstant('2026-10-15T18:30:00Z', () => fn.call(new Request('https://x/functions/v1/daily-question-push-worker', { method: 'POST', headers: { 'x-us-cron-key': 'cron-ok' } })));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.outcomes, { 'evening-reminder': 1, 'already-answered': 1, 'evening-delivered': 1 });
  assert.equal(response.body.delivered, 1);
});

// ------------------------------------------------------------ monthiversary-job (A11/N7)

async function atInstant(iso, fn) {
  const RealDate = Date;
  const fixed = RealDate.parse(iso);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}
function monthiversaryWorld(startedOn, locales = {}) {
  const awards = [];
  const admin = createFakeAdmin({
    tables: {
      couples: [{ id: COUPLE, started_on: startedOn }],
      profiles: [{ id: F, couple_id: COUPLE, locale: locales[F] ?? null }, { id: B, couple_id: COUPLE, locale: locales[B] ?? null }],
      notification_preferences: [], push_subscriptions: [sub('s-fra', F), sub('s-bea', B)],
    },
    rpc: {
      get_internal_monthiversary_cron_key: 'cron-ok', get_internal_vapid_private_key: 'vapid-private',
      award_relationship_milestone: (args) => { awards.push(args); return true; },
    },
  });
  return { admin, awards, webpush: createFakeWebPush() };
}
async function runMonthiversary(world, iso) {
  const fn = await loadEdgeFunction('monthiversary-job', { admin: world.admin, webpush: world.webpush });
  return atInstant(iso, () => fn.call(new Request('https://x/functions/v1/monthiversary-job', { method: 'POST', headers: { 'x-us-cron-key': 'cron-ok' } })));
}

test('A11/N7 monthiversary: a start on the 31st fires on the last day of shorter months, same award, no points in the text', async () => {
  const feb = monthiversaryWorld('2026-01-31', { [B]: 'en' });
  const res = await runMonthiversary(feb, '2027-02-28T08:30:00Z'); // 09:30 CET, 2027 is not a leap year
  assert.deepEqual(res.body, { ok: true, awarded: 1, delivered: 2, date: '2027-02-28' });
  assert.deepEqual(feb.awards, [{ target_couple_id: COUPLE, target_milestone_date: '2027-02-28', target_months: 13, target_kind: 'monthiversary', target_xp: 60 }]);
  const byEndpoint = Object.fromEntries(feb.webpush.sent.map((s) => [s.endpoint, s.payload]));
  assert.deepEqual([byEndpoint['https://push.example/s-fra'].title, byEndpoint['https://push.example/s-fra'].body, byEndpoint['https://push.example/s-fra'].target],
    ['US. · Mesiversario ♡', 'Oggi sono 13 mesi insieme', 'events']);
  assert.equal(byEndpoint['https://push.example/s-fra'].url, '/?open=events&from=push');
  assert.equal(byEndpoint['https://push.example/s-bea'].body, '13 months together today');
  assert.doesNotMatch(JSON.stringify(feb.webpush.sent), /XP|Bond|\+\d/);

  // 30 April for a start on the 31st; never twice in a 31-day month.
  const april = monthiversaryWorld('2026-01-31');
  assert.equal((await runMonthiversary(april, '2026-04-30T07:30:00Z')).body.awarded, 1);
  assert.equal(april.awards[0].target_months, 3);
  const may30 = monthiversaryWorld('2026-01-31');
  assert.equal((await runMonthiversary(may30, '2026-05-30T07:30:00Z')).body.awarded, 0, 'May has a 31st');
  const may31 = monthiversaryWorld('2026-01-31');
  assert.equal((await runMonthiversary(may31, '2026-05-31T07:30:00Z')).body.awarded, 1);

  // Anniversary on 28 February for a 29 February start; XP 200 unchanged.
  const leap = monthiversaryWorld('2028-02-29');
  await runMonthiversary(leap, '2029-02-28T08:30:00Z');
  assert.deepEqual([leap.awards[0].target_kind, leap.awards[0].target_months, leap.awards[0].target_xp], ['anniversary', 12, 200]);
  assert.deepEqual(leap.webpush.sent.map((s) => s.payload.body), ['Oggi è un anno insieme', 'Oggi è un anno insieme']);

  // Ordinary day-of-month start: unchanged behaviour (fires on that day only).
  const plain = monthiversaryWorld('2026-01-04');
  assert.equal((await runMonthiversary(plain, '2026-10-04T07:30:00Z')).body.awarded, 1);
  assert.equal(plain.awards[0].target_months, 9);
  // 30 October, not 31: day 300 since 4 January is a days milestone (days-together-milestones-job.test.js).
  const plainOther = monthiversaryWorld('2026-01-04');
  assert.equal((await runMonthiversary(plainOther, '2026-10-30T08:30:00Z')).body.awarded, 0);
});

// ------------------------------------------------------------ delete-moment (R2)

test('R2 delete-moment: the partner cannot delete a memory; the creator can, with the same Storage cleanup', async () => {
  const M = UUID(90);
  const world = () => {
    const removed = [];
    const admin = createFakeAdmin({
      tables: {
        profiles: [{ id: F, couple_id: COUPLE }, { id: B, couple_id: COUPLE }],
        moments: [{ id: M, couple_id: COUPLE, created_by: B, storage_path: `${COUPLE}/${B}/m.webp`, thumbnail_path: `${COUPLE}/${B}/m-thumb.webp` }],
        moment_photos: [{ moment_id: M, couple_id: COUPLE, storage_path: `${COUPLE}/${B}/album-1.webp` }],
      },
      users: { 'jwt-f': { id: F }, 'jwt-b': { id: B } },
    });
    admin.storage = { from: (bucket) => ({ remove: async (paths) => { removed.push([bucket, ...paths]); return { error: null }; } }) };
    return { admin, removed };
  };
  const call = async (w, token) => {
    const fn = await loadEdgeFunction('delete-moment', { admin: w.admin, webpush: createFakeWebPush() });
    return fn.call(new Request('https://x/functions/v1/delete-moment', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ moment_id: M }) }));
  };
  const partner = world();
  const denied = await call(partner, 'jwt-f');
  assert.equal(denied.status, 403);
  assert.equal(partner.admin.db.moments.length, 1, 'nothing deleted');
  assert.deepEqual(partner.removed, [], 'no Storage call');
  assert.deepEqual(partner.admin.log.deletes, []);

  const creator = world();
  const ok = await call(creator, 'jwt-b');
  assert.deepEqual(ok, { status: 200, body: { deleted: true, storage_cleanup: true, removed_objects: 3 } });
  assert.equal(creator.admin.db.moments.length, 0);
  assert.deepEqual(creator.removed, [['us-media', `${COUPLE}/${B}/m.webp`, `${COUPLE}/${B}/m-thumb.webp`, `${COUPLE}/${B}/album-1.webp`]]);
});
