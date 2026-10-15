// Native Notifications V1 — the one US notification domain.
//
// Pure/injectable (like the other *-core.mjs): runs unchanged under Deno (Edge
// Functions) and Node (tests, with fake admin and transports).
//
// A producer validates the event (actor, recipient, couple) and the content
// preference, builds ONE canonical notification with buildNotification() and
// hands it to deliverNotification(). Transports only serialize it:
//
//   * Web Push  → the payload the service worker already reads (unchanged keys);
//   * FCM v1    → Android (native-push-transport.mjs);
//   * APNs      → iOS     (native-push-transport.mjs).
//
// Dedupe stays LOGICAL: the dispatcher claims the event key in push_event_log
// once, then fans out to every device of every transport inside that claim.
// Transports never claim keys, so Web Push can never "use up" an event before
// the native transport sees it (and vice versa). Delivered to 0 devices → the
// key is released, so a later retry can still deliver.

export const NOTIFICATION_SCHEMA_VERSION = 1;

// Allow-listed navigation targets. A payload can only name one of these; the
// app maps each to a surface. There is no URL in the contract.
// US 1.0: 'events' opens Eventi (mesiversario / anniversario).
export const NOTIFICATION_TARGETS = Object.freeze(['home', 'today', 'think', 'left_for_you', 'quiz', 'bond', 'calendar', 'events']);
export const NOTIFICATION_CHANNELS = Object.freeze(['partner', 'reminders']);
export const NOTIFICATION_CATEGORIES = Object.freeze(['think']);
// US 1.0: the copy follows the RECIPIENT's profiles.locale; anything but 'en'
// (null = not chosen yet, a missing column, a failed read) is Italian.
export const NOTIFICATION_LOCALES = Object.freeze(['it', 'en']);
export const normalizeLocale = (value) => (value === 'en' ? 'en' : 'it');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^[a-z0-9:_-]{1,96}$/i;
const HOURS_12 = 60 * 60 * 12;
const name = (value, en = false) => value || (en ? 'Your person' : 'La tua persona');
const pick = (en, it, english) => (en ? english : it);
const own = (map, key) => (typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null);

// US 1.0 copy rules: Italian with no "Today", "Bond", "XP" or "quest"; US
// English with the app glossary (Thinking of you, Left for you, Question of
// the day, Missions, Sync, This or that). Android shows its own generic text
// (FCM data-only, #187): this copy reaches Web Push and iOS only.
const DAILY_TITLE = (en) => pick(en, 'US. · La domanda di oggi', 'US. · Question of the day');
const THINK_REACTION_COPY = Object.freeze({
  heart: (n, en) => pick(en, `${n} ti manda un cuore ♥`, `${n} sends you a heart ♥`),
  hug: (n, en) => pick(en, `${n} ti manda un abbraccio`, `${n} sends you a hug`),
  miss_you: (n, en) => pick(en, `${n}: mi manchi`, `${n}: I miss you`),
});
const DAILY_REACTION_COPY = Object.freeze({
  heart: (n, en) => pick(en, `${n} ha messo ♥ alla tua risposta`, `${n} left a ♥ on your answer`),
  cry: (n, en) => pick(en, `${n}: mi hai commosso`, `${n}: you moved me`),
});
function relationshipCopy(a, en) {
  const months = Number(a.months);
  if (a.kind === 'anniversary') {
    const years = Math.round(months / 12);
    return {
      title: pick(en, 'US. · Anniversario ♡', 'US. · Anniversary ♡'),
      body: years === 1 ? pick(en, 'Oggi è un anno insieme', 'One year together today') : pick(en, `Oggi sono ${years} anni insieme`, `${years} years together today`),
    };
  }
  if (a.kind === 'monthiversary') {
    return {
      title: pick(en, 'US. · Mesiversario ♡', 'US. · Monthiversary ♡'),
      body: months === 1 ? pick(en, 'Oggi è un mese insieme', 'One month together today') : pick(en, `Oggi sono ${months} mesi insieme`, `${months} months together today`),
    };
  }
  return { title: a.title, body: a.body };
}

// The catalogue: for every logical event, ONE title/body/target/channel/urgency.
// Each entry receives (args, en): en is true when the recipient reads English.
const CATALOGUE = Object.freeze({
  test: (a, en) => ({ title: 'US.', body: pick(en, 'Notifiche attive. US può raggiungerti anche quando è chiusa ♡', 'Notifications are on. US can reach you even when it is closed ♡'), target: 'home', tag: 'us-push-test', channel: 'reminders', urgency: 'normal' }),
  think: (a, en) => ({ title: 'US.', body: Number(a.count) > 1
    ? pick(en, `${name(a.senderName)} ti ha pensato ${Number(a.count)} volte ♡`, `${name(a.senderName, true)} thought of you ${Number(a.count)} times ♡`)
    : pick(en, `${name(a.senderName)} ti sta pensando ♡`, `${name(a.senderName, true)} is thinking of you ♡`), target: 'think', ref: a.messageId, tag: `think-${a.messageId}`, channel: 'partner', urgency: 'high', category: 'think' }),
  // O7: the reaction itself, with the name ("Bea ti manda un abbraccio").
  think_reaction: (a, en) => ({ title: pick(en, 'US. · Ti penso', 'US. · Thinking of you'), body: own(THINK_REACTION_COPY, a.reaction)?.(name(a.senderName, en), en) || pick(en, `${name(a.senderName)} ha reagito al tuo Ti penso`, `${name(a.senderName, true)} reacted to your Thinking of you`), target: 'home', ref: a.messageId, tag: `think-reaction-${a.messageId}`, channel: 'partner', urgency: 'normal' }),
  daily_answer: (a, en) => ({ title: DAILY_TITLE(en), body: pick(en, `${name(a.senderName)} ha risposto. Ora tocca a te.`, `${name(a.senderName, true)} answered. Your turn now.`), target: 'today', ref: a.questionId, tag: `daily-answer-${a.questionId}`, channel: 'partner', urgency: 'normal' }),
  daily_reveal: (a, en) => ({ title: DAILY_TITLE(en), body: pick(en, 'Le vostre risposte sono pronte ♡', 'Your answers are ready ♡'), target: 'today', ref: a.questionId, tag: `daily-reveal-${a.questionId}`, channel: 'partner', urgency: 'normal' }),
  // O2: the partner reacted to MY answer of the Question of the day.
  daily_reaction: (a, en) => ({ title: pick(en, 'US. · Domanda del giorno', 'US. · Question of the day'), body: own(DAILY_REACTION_COPY, a.reaction)?.(name(a.senderName, en), en) || pick(en, `${name(a.senderName)} ha reagito alla tua risposta`, `${name(a.senderName, true)} reacted to your answer`), target: 'today', ref: a.questionId, tag: `daily-reaction-${a.questionId}`, channel: 'partner', urgency: 'normal' }),
  // O3: one evening reminder when the partner already answered and you did not.
  daily_evening: (a, en) => ({ title: DAILY_TITLE(en), body: pick(en, `${name(a.senderName)} ha già risposto alla domanda di oggi. Tocca a te ♡`, `${name(a.senderName, true)} already answered today's question. Your turn ♡`), target: 'today', ref: a.questionId, tag: `daily-evening-${a.questionId}`, channel: 'reminders', urgency: 'normal' }),
  daily_question: (a, en) => ({ title: pick(en, 'US. · Domanda del giorno', 'US. · Question of the day'), body: pick(en, "C'è una nuova domanda per voi.", 'There is a new question for you two.'), target: 'today', ref: a.questionId, tag: `daily-question-${a.questionId}`, channel: 'reminders', urgency: 'normal' }),
  // N5: "Bea ha fatto «titolo». Ora tocca a te", opens Missioni (target bond).
  quest_confirmed: (a, en) => ({ title: pick(en, 'US. · Missioni', 'US. · Missions'), body: a.questTitle ? pick(en, `${name(a.senderName)} ha fatto «${a.questTitle}». Ora tocca a te`, `${name(a.senderName, true)} did “${a.questTitle}”. Your turn now`) : pick(en, `${name(a.senderName)} ha fatto una missione. Ora tocca a te`, `${name(a.senderName, true)} did a mission. Your turn now`), target: 'bond', ref: a.questId, tag: `quest-${a.questId}`, channel: 'partner', urgency: 'normal' }),
  left_for_you: (a, en) => ({ title: 'US.', body: pick(en, `${name(a.senderName)} ti ha lasciato qualcosa ♡`, `${name(a.senderName, true)} left something for you ♡`), target: 'left_for_you', ref: a.itemId, tag: `left-for-you:${a.itemId}`, channel: 'partner', urgency: 'high' }),
  // G11: game pushes name the game ("Bea ha finito Ridete: tocca a te").
  game_waiting: (a, en) => ({ title: pick(en, 'US. · Gioca', 'US. · Play'), body: a.gameName ? pick(en, `${name(a.senderName)} ha finito ${a.gameName}: tocca a te`, `${name(a.senderName, true)} finished ${a.gameName}: your turn`) : pick(en, `${name(a.senderName)} ha giocato: tocca a te`, `${name(a.senderName, true)} played: your turn`), target: 'quiz', ref: a.sessionId, tag: a.tag, channel: 'partner', urgency: 'normal' }),
  game_reveal: (a, en) => ({ title: pick(en, 'US. · Gioca', 'US. · Play'), body: a.gameName ? pick(en, `${a.gameName}: le vostre risposte sono pronte ♡`, `${a.gameName}: your answers are ready ♡`) : pick(en, 'Le vostre risposte sono pronte ♡', 'Your answers are ready ♡'), target: 'quiz', ref: a.sessionId, tag: a.tag, channel: 'partner', urgency: 'normal' }),
  game_weekly_created: (a, en) => ({ title: pick(en, 'US. · Gioca', 'US. · Play'), body: pick(en, `${name(a.senderName)} ha lasciato la domanda della settimana ♡`, `${name(a.senderName, true)} left this week's question ♡`), target: 'quiz', tag: a.tag, channel: 'partner', urgency: 'normal' }),
  game_weekly_turn: (a, en) => ({ title: pick(en, 'US. · Gioca', 'US. · Play'), body: pick(en, 'Questa settimana la domanda per voi la scegli tu.', 'This week you choose the question for you two.'), target: 'quiz', tag: a.tag, channel: 'reminders', urgency: 'normal' }),
  calendar_reminder: (a) => ({ title: 'US. · Calendar', body: a.body, target: 'calendar', ref: a.entryId, tag: `calendar-reminder-${a.reminderId}`, channel: 'reminders', urgency: 'high' }),
  // A11/N7: mesiversario / anniversario, no points in the text, opens Eventi.
  relationship: (a, en) => ({ ...relationshipCopy(a, en), target: a.kind ? 'events' : 'home', tag: a.tag, channel: 'reminders', urgency: 'normal', ttl: 60 * 60 * 24 }),
  // A2: the partner accepted the invite; sent once, to the creator.
  partner_joined: (a, en) => ({ title: 'US.', body: pick(en, `${name(a.senderName)} ha accettato l’invito: il vostro spazio è pronto`, `${name(a.senderName, true)} joined: your space is ready`), target: 'home', tag: 'us-partner-joined', channel: 'partner', urgency: 'normal' }),
});
export const NOTIFICATION_TYPES = Object.freeze(Object.keys(CATALOGUE));

const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/** The canonical, validated notification for one logical event. Throws on anything off-contract. */
export function buildNotification(type, args = {}) {
  const make = CATALOGUE[type];
  if (!make) throw new Error('notification_type_invalid');
  const raw = make(args, normalizeLocale(args?.locale) === 'en');
  const notification = {
    v: NOTIFICATION_SCHEMA_VERSION,
    type,
    title: clean(raw.title, 80),
    body: clean(raw.body, 180),
    target: raw.target,
    ref: typeof raw.ref === 'string' && UUID.test(raw.ref) ? raw.ref.toLowerCase() : null,
    tag: raw.tag,
    channel: raw.channel,
    category: raw.category || null,
    urgency: raw.urgency === 'high' ? 'high' : 'normal',
    ttl: Number.isInteger(raw.ttl) && raw.ttl > 0 && raw.ttl <= 60 * 60 * 24 * 7 ? raw.ttl : HOURS_12,
    // Native badge semantics are intentionally binary: "US has something new".
    // The client clears it only after the private app is visible and unlocked.
    badge: Number.isInteger(raw.badge) && raw.badge >= 0 ? raw.badge : 1,
  };
  if (!notification.title || !notification.body) throw new Error('notification_copy_missing');
  if (!NOTIFICATION_TARGETS.includes(notification.target)) throw new Error('notification_target_invalid');
  if (typeof notification.tag !== 'string' || !TAG.test(notification.tag)) throw new Error('notification_tag_invalid');
  if (!NOTIFICATION_CHANNELS.includes(notification.channel)) throw new Error('notification_channel_invalid');
  if (notification.category && !NOTIFICATION_CATEGORIES.includes(notification.category)) throw new Error('notification_category_invalid');
  return Object.freeze(notification);
}

/**
 * US 1.0: the language of each recipient (profiles.locale, added by
 * 20261014230000). A missing row, a missing column (Edge deployed before the
 * SQL) or a failed read means Italian: a push is never blocked by the language.
 * @returns Map<userId, 'it'|'en'>
 */
export async function recipientLocales(admin, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const locales = new Map(ids.map((id) => [id, 'it']));
  if (!ids.length) return locales;
  try {
    const { data, error } = await admin.from('profiles').select('id,locale').in('id', ids);
    if (error) return locales;
    for (const row of data || []) if (locales.has(row?.id)) locales.set(row.id, normalizeLocale(row.locale));
  } catch (_) {
    // Italian.
  }
  return locales;
}

export async function recipientLocale(admin, userId) {
  return (await recipientLocales(admin, [userId])).get(userId) || 'it';
}

/** Web Push wire format: exactly the keys service-worker.js has always read. */
export function webPushPayload(notification) {
  return JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: notification.tag,
    target: notification.target,
    url: `/?open=${encodeURIComponent(notification.target)}&from=push`,
  });
}

export function webPushOptions(notification) {
  return { TTL: notification.ttl, urgency: notification.urgency };
}

async function releaseClaim(admin, dedupeKey) {
  if (dedupeKey) await admin.from('push_event_log').delete().eq('dedupe_key', dedupeKey);
}

function nativeReady(native) {
  return Boolean(native && typeof native.ready === 'function' && (native.ready('fcm') || native.ready('apns')));
}

/**
 * Delivers ONE logical notification to every device of the recipients.
 *
 * @param admin                 service-role client (or a fake)
 * @param options.notification  buildNotification(...) result
 * @param options.recipientIds  already authorized + preference-filtered by the producer
 * @param options.coupleId      couple of the event; native rows of another couple are skipped
 * @param options.senderId      push_event_log.sender_id (null for system events)
 * @param options.dedupeKey     logical key (null = no dedupe, e.g. the test notification)
 * @param options.eventType     push_event_log.event_type
 * @param options.web           { ensure?: async () => void, send: async (subscription, payload, options) => void }
 * @param options.native        native transport ({ ready(provider), send(device, notification) }) or null
 * @returns {delivered, failed} | {delivered:0, failed:0, deduplicated:true} | {delivered:0, failed:0, reason}
 */
export async function deliverNotification(admin, options) {
  const { notification, recipientIds = [], coupleId, senderId = null, dedupeKey = null, eventType, web = null, native = null } = options || {};
  const recipients = [...new Set(recipientIds.filter(Boolean))];
  if (!notification || !recipients.length) return { delivered: 0, failed: 0, reason: 'no-recipient' };

  // Configuration first, before any key is consumed (F2C rule). A missing Web
  // Push configuration only blocks the event when no native transport could
  // deliver it instead.
  let webError = null;
  const webEnabled = Boolean(web && typeof web.send === 'function');
  if (webEnabled && typeof web.ensure === 'function') {
    try { await web.ensure(); } catch (error) { webError = error; }
  }
  const nativeEnabled = nativeReady(native);
  if (webError && !nativeEnabled) throw webError;

  if (dedupeKey) {
    const { error: claimError } = await admin.from('push_event_log').insert({
      dedupe_key: dedupeKey,
      couple_id: coupleId,
      sender_id: senderId,
      event_type: eventType,
    });
    if (claimError?.code === '23505') return { delivered: 0, failed: 0, deduplicated: true };
    if (claimError) throw claimError;
  }

  let subscriptions = [];
  let devices = [];
  try {
    if (webEnabled) {
      const query = admin.from('push_subscriptions').select('id,endpoint,p256dh,auth_key');
      const { data, error } = await (recipients.length === 1 ? query.eq('user_id', recipients[0]) : query.in('user_id', recipients));
      if (error) throw error;
      subscriptions = data || [];
    }
    if (nativeEnabled) {
      const { data, error } = await admin.from('device_push_tokens')
        .select('id,user_id,couple_id,installation_id,token,platform,provider,apns_environment')
        .in('user_id', recipients);
      if (error) throw error;
      // A row registered under another couple (re-pair, stale row) never receives this couple's events.
      devices = (data || []).filter((device) => !coupleId || device.couple_id === coupleId);
    }
  } catch (error) {
    await releaseClaim(admin, dedupeKey);
    throw error;
  }

  const webTargets = webError ? [] : subscriptions;
  const nativeTargets = devices.filter((device) => native.ready(device.provider));
  if (!webTargets.length && !nativeTargets.length) {
    await releaseClaim(admin, dedupeKey);
    if (webError && subscriptions.length) throw webError;
    if (devices.length) return { delivered: 0, failed: 0, reason: 'transport-unconfigured' };
    return { delivered: 0, failed: 0, reason: 'recipient-not-subscribed' };
  }

  let delivered = 0;
  let failed = 0;
  if (webTargets.length) {
    const payload = webPushPayload(notification);
    const sendOptions = webPushOptions(notification);
    for (const subscription of webTargets) {
      try {
        await web.send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, payload, sendOptions);
        delivered += 1;
      } catch (error) {
        failed += 1;
        const status = Number(error?.statusCode || 0);
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', subscription.id);
      }
    }
  }
  for (const device of nativeTargets) {
    let result;
    try {
      result = await native.send(device, notification);
    } catch (_) {
      result = { ok: false, outcome: 'transient' };
    }
    if (result?.ok) { delivered += 1; continue; }
    failed += 1;
    // Only a provider verdict on the TOKEN removes it; transient, auth and payload errors keep it.
    if (result?.outcome === 'invalid-token') await admin.from('device_push_tokens').delete().eq('id', device.id);
  }

  if (!delivered) await releaseClaim(admin, dedupeKey);
  return { delivered, failed };
}
