// M9A — Lasciato per te: dispatch web-push per UNA riga di public.left_for_you.
//
// Pure/injectable (come spotify-search-core.mjs): gira invariato sotto Deno
// (send-web-push = percorso veloce chiamato dal mittente, e
// left-for-you-push-worker = rete di sicurezza schedulata) e sotto Node
// (test, con admin/sendNotification finti).
//
// Semantica:
//   * ogni riga left_for_you è una notifica logica distinta: la chiave di
//     dedupe è `left-for-you:<row id>`, quindi l'item A non blocca mai l'item B;
//   * i retry della STESSA riga (client, worker, doppio click) convergono sulla
//     stessa chiave in push_event_log (unique) e non duplicano la notifica;
//   * la chiave viene rilasciata quando nessun device ha ricevuto la push,
//     così un retry successivo può ancora consegnarla;
//   * il destinatario è sempre la riga (recipient_id), mai il mittente;
//   * notification_preferences.left_for_you=false la disattiva;
//   * nessuna subscription → nessun invio; 404/410 → subscription rimossa.

export const LEFT_FOR_YOU_EVENT_TYPE = 'left_for_you';
export const LEFT_FOR_YOU_PUSH_TTL_SECONDS = 60 * 60 * 12;
// Stessa priorità di Ti penso e dei reminder: è una notifica visibile che
// l'utente si aspetta subito (APNs priority 10 / FCM high).
export const LEFT_FOR_YOU_PUSH_URGENCY = 'high';

export function leftForYouDedupeKey(itemId) {
  return `left-for-you:${itemId}`;
}

export function leftForYouPushPayload({ itemId, senderName }) {
  return JSON.stringify({
    title: 'US.',
    // Mai il contenuto dell'item: solo chi l'ha lasciato.
    body: `${senderName || 'La tua persona'} ti ha lasciato qualcosa ♡`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `left-for-you:${itemId}`,
    target: 'left_for_you',
    url: '/?open=left_for_you&from=push',
  });
}

async function releaseClaim(admin, dedupeKey) {
  await admin.from('push_event_log').delete().eq('dedupe_key', dedupeKey);
}

/**
 * @param admin  client Supabase service-role (o finto nei test)
 * @param options.itemId            id della riga left_for_you
 * @param options.expectedSenderId  se presente, la riga deve appartenere a questo mittente
 * @param options.skipIfSeen        il worker non notifica item già aperti
 * @param options.ensureVapid       async () => void, validato PRIMA di consumare la chiave
 * @param options.sendNotification  async (subscription, payload, options) => void
 */
export async function dispatchLeftForYouPush(admin, options) {
  const { itemId, expectedSenderId = null, skipIfSeen = false, ensureVapid, sendNotification } = options || {};
  if (!itemId) return { delivered: 0, failed: 0, reason: 'missing-item' };

  const { data: row, error: rowError } = await admin.from('left_for_you')
    .select('id,couple_id,sender_id,recipient_id,seen_at')
    .eq('id', itemId)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row) return { delivered: 0, failed: 0, reason: 'not-found' };
  if (expectedSenderId && row.sender_id !== expectedSenderId) return { delivered: 0, failed: 0, reason: 'forbidden' };
  if (!row.recipient_id || row.recipient_id === row.sender_id) return { delivered: 0, failed: 0, reason: 'invalid-recipient' };
  if (skipIfSeen && row.seen_at) return { delivered: 0, failed: 0, reason: 'already-seen' };

  // Mittente e destinatario devono essere ancora nella coppia della riga.
  const { data: people, error: peopleError } = await admin.from('profiles')
    .select('id,couple_id,display_name')
    .in('id', [row.sender_id, row.recipient_id]);
  if (peopleError) throw peopleError;
  const byId = new Map((people || []).map((person) => [person.id, person]));
  const sender = byId.get(row.sender_id);
  const recipient = byId.get(row.recipient_id);
  if (!sender || !recipient || sender.couple_id !== row.couple_id || recipient.couple_id !== row.couple_id) {
    return { delivered: 0, failed: 0, reason: 'invalid-couple' };
  }

  // La colonna left_for_you arriva con la migration M5G3: finché non esiste
  // l'errore di select viene trattato come "preferenza di default" (true),
  // esattamente come faceva send-web-push prima di M9A.
  const { data: preference, error: preferenceError } = await admin.from('notification_preferences')
    .select('left_for_you')
    .eq('user_id', row.recipient_id)
    .maybeSingle();
  if (!preferenceError && preference && preference.left_for_you === false) {
    return { delivered: 0, failed: 0, reason: 'disabled-by-preference' };
  }

  if (typeof ensureVapid === 'function') await ensureVapid();

  const dedupeKey = leftForYouDedupeKey(row.id);
  const { error: claimError } = await admin.from('push_event_log').insert({
    dedupe_key: dedupeKey,
    couple_id: row.couple_id,
    sender_id: row.sender_id,
    event_type: LEFT_FOR_YOU_EVENT_TYPE,
  });
  if (claimError?.code === '23505') return { delivered: 0, failed: 0, deduplicated: true };
  if (claimError) throw claimError;

  let subscriptions;
  try {
    const { data, error } = await admin.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth_key')
      .eq('user_id', row.recipient_id);
    if (error) throw error;
    subscriptions = data || [];
  } catch (error) {
    await releaseClaim(admin, dedupeKey);
    throw error;
  }
  if (!subscriptions.length) {
    await releaseClaim(admin, dedupeKey);
    return { delivered: 0, failed: 0, reason: 'recipient-not-subscribed' };
  }

  const payload = leftForYouPushPayload({ itemId: row.id, senderName: sender.display_name });
  let delivered = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      await sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } },
        payload,
        { TTL: LEFT_FOR_YOU_PUSH_TTL_SECONDS, urgency: LEFT_FOR_YOU_PUSH_URGENCY },
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
  if (!delivered) await releaseClaim(admin, dedupeKey);
  return { delivered, failed };
}
