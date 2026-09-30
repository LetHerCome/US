// M11D — Game V2 push: waiting ("tocca a te"), reveal ready, weekly question
// created, weekly turn.
//
// Pure/injectable (like daily-question-push-core.mjs): runs unchanged under
// Deno (game-v2-push = fast path called by the actor's client with an id;
// game-v2-push-worker = cron-only recovery and weekly turn) and under Node
// (tests, with fake admin/sendNotification).
//
// Semantics:
//   * WHAT to send is decided in SQL (public.game_v2_push_for_session,
//     game_v2_push_for_weekly, game_v2_pending_pushes; service role only) from
//     the same tables and clock as Game V2. The caller only supplies an id.
//   * The recipient is resolved from couple + stable role, never from the
//     client; the actor is never notified of their own action.
//   * One logical notification per dedupe key (role-based, see the M11D
//     migration); the key is released when no device received it.
//   * notification_preferences.games=false disables all of them; no row, or a
//     failed read, means enabled (like every other preference).
//   * Payloads carry no question, answer, prediction result or context.
//   * 404/410 remove the subscription.

export const GAME_PUSH_KINDS = ['game_waiting', 'game_reveal', 'game_weekly_created', 'game_weekly_turn'];
export const GAME_PUSH_TTL_SECONDS = 60 * 60 * 12;
export const GAME_PUSH_URGENCY = 'normal';
export const GAME_PUSH_TIMEZONE = 'Europe/Rome';
// The worker never wakes anyone: recovery and the weekly turn go out 9-22
// Europe/Rome. The fast path is immediate, like the Daily Question answers.
export const GAME_PUSH_SEND_START_HOUR = 9;
export const GAME_PUSH_SEND_END_HOUR = 22;

const ROLE_LABEL = { francesco: 'Francesco', beatrice: 'Bea' };
const DEDUPE = {
  game_waiting: /^game-waiting:[0-9a-f-]{36}:(francesco|beatrice)$/,
  game_reveal: /^game-reveal:[0-9a-f-]{36}:(francesco|beatrice)$/,
  game_weekly_created: /^game-weekly-created:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/,
  game_weekly_turn: /^game-weekly-turn:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/,
};

export function gamePushPayload(event, { senderName } = {}) {
  const name = senderName || 'La tua persona';
  const body = {
    game_waiting: `${name} ha risposto. Ora tocca a te.`,
    game_reveal: 'Le vostre risposte sono pronte ♡',
    game_weekly_created: `${name} ha lasciato la domanda della settimana ♡`,
    game_weekly_turn: 'Questa settimana la domanda per voi la scegli tu.',
  }[event.kind];
  return JSON.stringify({
    title: 'US. · Gioca',
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: event.dedupe_key,
    target: 'quiz',
    url: '/?open=quiz&from=push',
  });
}

export function romeHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: GAME_PUSH_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

function validEvent(event) {
  return Boolean(event && GAME_PUSH_KINDS.includes(event.kind) && event.couple_id
    && ['francesco', 'beatrice'].includes(event.recipient_role)
    && event.sender_role !== event.recipient_role
    && DEDUPE[event.kind].test(String(event.dedupe_key || '')));
}

async function releaseClaim(admin, dedupeKey) {
  await admin.from('push_event_log').delete().eq('dedupe_key', dedupeKey);
}

/** Delivers one server-derived event. */
export async function deliverGamePush(admin, event, { ensureVapid, sendNotification } = {}) {
  if (!validEvent(event)) return { outcome: 'invalid-event', delivered: 0, failed: 0 };
  const { data: members, error: membersError } = await admin.from('profiles')
    .select('id,couple_id,role,display_name')
    .eq('couple_id', event.couple_id);
  if (membersError) throw membersError;
  const recipient = (members || []).find((m) => m.role === event.recipient_role);
  const sender = event.sender_role ? (members || []).find((m) => m.role === event.sender_role) : null;
  if (!recipient?.id) return { outcome: 'no-recipient', delivered: 0, failed: 0 };

  const { data: preference, error: preferenceError } = await admin.from('notification_preferences')
    .select('user_id,games')
    .eq('user_id', recipient.id)
    .maybeSingle();
  if (!preferenceError && preference?.games === false) return { outcome: 'disabled-by-preference', delivered: 0, failed: 0 };

  if (typeof ensureVapid === 'function') await ensureVapid();
  const { error: claimError } = await admin.from('push_event_log').insert({
    dedupe_key: event.dedupe_key,
    couple_id: event.couple_id,
    sender_id: sender?.id || null,
    event_type: event.kind,
  });
  if (claimError?.code === '23505') return { outcome: 'deduplicated', delivered: 0, failed: 0 };
  if (claimError) throw claimError;

  let subscriptions;
  try {
    const { data, error } = await admin.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth_key')
      .eq('user_id', recipient.id);
    if (error) throw error;
    subscriptions = data || [];
  } catch (error) {
    await releaseClaim(admin, event.dedupe_key);
    throw error;
  }
  if (!subscriptions.length) {
    await releaseClaim(admin, event.dedupe_key);
    return { outcome: 'not-subscribed', delivered: 0, failed: 0 };
  }

  const payload = gamePushPayload(event, { senderName: sender ? (ROLE_LABEL[sender.role] || sender.display_name) : null });
  let delivered = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      await sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } },
        payload,
        { TTL: GAME_PUSH_TTL_SECONDS, urgency: GAME_PUSH_URGENCY },
      );
      delivered += 1;
    } catch (error) {
      failed += 1;
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', subscription.id);
    }
  }
  if (!delivered) {
    await releaseClaim(admin, event.dedupe_key);
    return { outcome: 'failed', delivered, failed };
  }
  return { outcome: 'delivered', delivered, failed };
}

async function derive(admin, fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw error;
  return data || null;
}

/** Fast path after a finalize: the actor supplies only the session id. */
export async function dispatchGameSessionPush(admin, { sessionId, actorId, ...options } = {}) {
  if (!sessionId || !actorId) return { outcome: 'missing-reference', delivered: 0, failed: 0 };
  const event = await derive(admin, 'game_v2_push_for_session', { target_session_id: sessionId, actor_id: actorId });
  if (!event) return { outcome: 'nothing-to-send', delivered: 0, failed: 0 };
  return { kind: event.kind, ...(await deliverGamePush(admin, event, options)) };
}

/** Fast path after this week's question is created. */
export async function dispatchGameWeeklyPush(admin, { questionId, actorId, ...options } = {}) {
  if (!questionId || !actorId) return { outcome: 'missing-reference', delivered: 0, failed: 0 };
  const event = await derive(admin, 'game_v2_push_for_weekly', { target_question_id: questionId, actor_id: actorId });
  if (!event) return { outcome: 'nothing-to-send', delivered: 0, failed: 0 };
  return { kind: event.kind, ...(await deliverGamePush(admin, event, options)) };
}

/** Cron worker: weekly turn plus recovery of missed fast-path events. */
export async function dispatchGameV2PendingPushes(admin, { now = new Date(), ...options } = {}) {
  const hour = romeHour(now);
  if (hour < GAME_PUSH_SEND_START_HOUR || hour >= GAME_PUSH_SEND_END_HOUR) {
    return { reason: 'outside-window', delivered: 0, events: [] };
  }
  const events = (await derive(admin, 'game_v2_pending_pushes', {})) || [];
  if (!events.length) return { delivered: 0, events: [] };
  const { data: logged, error: loggedError } = await admin.from('push_event_log')
    .select('dedupe_key')
    .in('dedupe_key', events.map((e) => e.dedupe_key));
  if (loggedError) throw loggedError;
  const done = new Set((logged || []).map((row) => row.dedupe_key));
  const results = [];
  let delivered = 0;
  for (const event of events) {
    if (done.has(event.dedupe_key)) { results.push({ kind: event.kind, outcome: 'deduplicated' }); continue; }
    let result;
    try {
      result = await deliverGamePush(admin, event, options);
    } catch (error) {
      result = { outcome: 'error', delivered: 0, failed: 0, error: error instanceof Error ? error.message : 'unknown' };
    }
    if (result.outcome === 'delivered') delivered += 1;
    results.push({ kind: event.kind, ...result });
  }
  return { delivered, events: results };
}
