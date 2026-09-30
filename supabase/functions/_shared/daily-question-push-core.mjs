// M10C — Domanda del giorno: una push di SISTEMA quando nasce la domanda del
// nuovo giorno (Europe/Rome), anche se nessuno apre US.
//
// Pure/injectable (come left-for-you-push-core.mjs): gira invariato sotto Deno
// (daily-question-push-worker, chiamato SOLO dal cron) e sotto Node (test, con
// admin/sendNotification finti).
//
// Semantica:
//   * una notifica logica per utente per daily_questions.id: la chiave di
//     dedupe è `daily-question:<question id>:<user id>`, quindi retry e run
//     sovrapposti convergono sulla stessa riga di push_event_log (unique) e il
//     giorno dopo, con un nuovo id, si notifica di nuovo;
//   * la chiave viene rilasciata quando nessun device ha ricevuto la push
//     (nessuna subscription, tutti gli invii falliti): un run successivo riprova;
//   * è una notifica di sistema: sender_id = null, nessun mittente finto;
//   * mai il testo della domanda nel payload (lock screen);
//   * notification_preferences.today=false la disattiva; nessuna riga = attiva;
//   * chi ha già risposto alla domanda di oggi non riceve "nuova domanda";
//   * 404/410 → subscription rimossa.

export const DAILY_QUESTION_EVENT_TYPE = 'daily_question';
export const DAILY_QUESTION_PUSH_TTL_SECONDS = 60 * 60 * 12;
// Invito quotidiano, non urgente: stessa priorità della push "Today" delle risposte.
export const DAILY_QUESTION_PUSH_URGENCY = 'normal';
export const DAILY_QUESTION_TIMEZONE = 'Europe/Rome';
// Finestra di invio (ora locale Europe/Rome): la domanda nasce a mezzanotte,
// ma nessuno va svegliato. Prima delle 9 il worker non invia; dopo le 22 non
// ha più senso invitare a rispondere "oggi".
export const DAILY_QUESTION_SEND_START_HOUR = 9;
export const DAILY_QUESTION_SEND_END_HOUR = 22;

export function dailyQuestionDedupeKey(questionId, userId) {
  return `daily-question:${questionId}:${userId}`;
}

export function dailyQuestionPushPayload({ questionId }) {
  return JSON.stringify({
    title: 'US. · Domanda del giorno',
    // Mai il testo della domanda: solo l'invito.
    body: "C'è una nuova domanda per voi.",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `daily-question-${questionId}`,
    target: 'today',
    url: '/?open=today&from=push',
  });
}

// Giorno e ora correnti in Europe/Rome (stessa autorità di
// private.daily_question_day nella migration M9E).
export function romeClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_QUESTION_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

async function releaseClaim(admin, dedupeKey) {
  await admin.from('push_event_log').delete().eq('dedupe_key', dedupeKey);
}

async function deliverToUser(admin, { question, user, ensureVapid, sendNotification }) {
  if (typeof ensureVapid === 'function') await ensureVapid();

  const dedupeKey = dailyQuestionDedupeKey(question.id, user.id);
  const { error: claimError } = await admin.from('push_event_log').insert({
    dedupe_key: dedupeKey,
    couple_id: user.couple_id,
    sender_id: null,
    event_type: DAILY_QUESTION_EVENT_TYPE,
  });
  if (claimError?.code === '23505') return { outcome: 'deduplicated', delivered: 0, failed: 0 };
  if (claimError) throw claimError;

  let subscriptions;
  try {
    const { data, error } = await admin.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth_key')
      .eq('user_id', user.id);
    if (error) throw error;
    subscriptions = data || [];
  } catch (error) {
    await releaseClaim(admin, dedupeKey);
    throw error;
  }
  if (!subscriptions.length) {
    await releaseClaim(admin, dedupeKey);
    return { outcome: 'not-subscribed', delivered: 0, failed: 0 };
  }

  const payload = dailyQuestionPushPayload({ questionId: question.id });
  let delivered = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      await sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } },
        payload,
        { TTL: DAILY_QUESTION_PUSH_TTL_SECONDS, urgency: DAILY_QUESTION_PUSH_URGENCY },
      );
      delivered += 1;
    } catch (error) {
      failed += 1;
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id);
      }
    }
  }
  if (!delivered) {
    await releaseClaim(admin, dedupeKey);
    return { outcome: 'failed', delivered, failed };
  }
  return { outcome: 'delivered', delivered, failed };
}

/**
 * Notifica la domanda di OGGI (Europe/Rome) a ogni membro di coppia idoneo.
 * Nessun input dal chiamante oltre all'orologio: domanda e destinatari sono
 * decisi qui, lato server.
 *
 * @param admin  client Supabase service-role (o finto nei test)
 * @param options.now               Date corrente (iniettabile nei test)
 * @param options.ensureVapid       async () => void, validato PRIMA di consumare una chiave
 * @param options.sendNotification  async (subscription, payload, options) => void
 */
export async function dispatchDailyQuestionPush(admin, options) {
  const { now = new Date(), ensureVapid, sendNotification } = options || {};
  const clock = romeClock(now);
  if (clock.hour < DAILY_QUESTION_SEND_START_HOUR || clock.hour >= DAILY_QUESTION_SEND_END_HOUR) {
    return { day: clock.day, reason: 'outside-window', delivered: 0, recipients: [] };
  }

  // La riga viene materializzata dal cron (private.materialize_daily_question)
  // subito prima di chiamare il worker; se manca ancora, riprova il run dopo.
  const { data: question, error: questionError } = await admin.from('daily_questions')
    .select('id,question_date')
    .eq('question_date', clock.day)
    .maybeSingle();
  if (questionError) throw questionError;
  if (!question?.id) return { day: clock.day, reason: 'question-not-ready', delivered: 0, recipients: [] };

  const { data: profiles, error: profilesError } = await admin.from('profiles').select('id,couple_id');
  if (profilesError) throw profilesError;
  const members = (profiles || []).filter((profile) => profile.id && profile.couple_id);
  if (!members.length) return { day: clock.day, questionId: question.id, reason: 'no-members', delivered: 0, recipients: [] };
  const memberIds = members.map((member) => member.id);

  // Preferenza today: riga assente o lettura fallita = attiva (come send-web-push).
  const { data: preferences, error: preferenceError } = await admin.from('notification_preferences')
    .select('user_id,today')
    .in('user_id', memberIds);
  const disabled = new Set(preferenceError ? [] : (preferences || [])
    .filter((preference) => preference.today === false)
    .map((preference) => preference.user_id));

  const { data: answers, error: answersError } = await admin.from('daily_answers')
    .select('user_id')
    .eq('question_id', question.id);
  if (answersError) throw answersError;
  const answered = new Set((answers || []).map((answer) => answer.user_id));

  const { data: logged, error: loggedError } = await admin.from('push_event_log')
    .select('dedupe_key')
    .in('dedupe_key', memberIds.map((id) => dailyQuestionDedupeKey(question.id, id)));
  if (loggedError) throw loggedError;
  const alreadyNotified = new Set((logged || []).map((row) => row.dedupe_key));

  const recipients = [];
  let delivered = 0;
  for (const user of members) {
    if (disabled.has(user.id)) { recipients.push({ userId: user.id, outcome: 'disabled-by-preference' }); continue; }
    if (answered.has(user.id)) { recipients.push({ userId: user.id, outcome: 'already-answered' }); continue; }
    if (alreadyNotified.has(dailyQuestionDedupeKey(question.id, user.id))) { recipients.push({ userId: user.id, outcome: 'deduplicated' }); continue; }
    // Un errore su un utente non blocca l'altro; nessuna chiave resta consumata
    // senza consegna, quindi il run successivo riprova.
    let result;
    try {
      result = await deliverToUser(admin, { question, user, ensureVapid, sendNotification });
    } catch (error) {
      result = { outcome: 'error', delivered: 0, failed: 0, error: error instanceof Error ? error.message : 'unknown' };
    }
    if (result.outcome === 'delivered') delivered += 1;
    recipients.push({ userId: user.id, ...result });
  }
  return { day: clock.day, questionId: question.id, delivered, recipients };
}
