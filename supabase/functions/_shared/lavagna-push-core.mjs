// Lavagna V1 (founder, 03/11/2026): «Bea ha disegnato sulla lavagna».
//
// Pure/injectable (like left-for-you-push-core.mjs): runs unchanged under Deno
// (send-web-push, called by the app after a stroke is saved) and under Node
// (tests, with a fake admin and fake transports).
//
//   * the stroke must be the caller's, on the caller's board, and fresh
//     (drawn in the last 30 minutes): an old id never notifies again;
//   * whoever receives it hears it at most once every 2 hours: the last
//     'lavagna' row in push_event_log from the same person in the same couple
//     (the partner is the only recipient) closes the window;
//   * two strokes saved at the same moment converge on one dedupe key per
//     recipient and 2-hour window, so the race never sends twice;
//   * notification_preferences.lavagna=false switches it off (a missing
//     column, before the SQL, is the default: on);
//   * delivery goes through the shared dispatcher: Web Push and the native
//     apps under one key, released when no device received it.

import { buildNotification, deliverNotification, recipientLocale } from './notification-core.mjs';

export const LAVAGNA_EVENT_TYPE = 'lavagna';
export const LAVAGNA_PUSH_GAP_MS = 2 * 60 * 60 * 1000;
export const LAVAGNA_STROKE_MAX_AGE_MS = 30 * 60 * 1000;

export function lavagnaDedupeKey(recipientId, now = Date.now()) {
  return `lavagna:${recipientId}:${Math.floor(now / LAVAGNA_PUSH_GAP_MS)}`;
}

/**
 * @param admin              service-role client (or a fake)
 * @param options.strokeId   the stroke the caller just saved
 * @param options.sender     the caller's profile {id, couple_id, display_name}
 * @param options.partnerId  the other member of the couple
 * @param options.web        { ensure, send } for Web Push
 * @param options.native     native transport or null
 * @returns {delivered, failed} | {delivered:0, failed:0, reason} | {delivered:0, failed:0, deduplicated:true}
 *          or {forbidden:true} when the stroke is not the caller's
 */
export async function dispatchLavagnaPush(admin, options) {
  const { strokeId, sender, partnerId, web = null, native = null, now = Date.now() } = options || {};
  const { data: stroke, error: strokeError } = await admin.from('lavagna_strokes')
    .select('id,couple_id,author_id,created_at')
    .eq('id', strokeId)
    .maybeSingle();
  if (strokeError) throw strokeError;
  if (!stroke || !sender?.id || stroke.author_id !== sender.id || stroke.couple_id !== sender.couple_id || !partnerId || partnerId === sender.id) {
    return { forbidden: true };
  }
  const drawnAt = Date.parse(stroke.created_at || '');
  if (!Number.isFinite(drawnAt) || now - drawnAt > LAVAGNA_STROKE_MAX_AGE_MS) return { delivered: 0, failed: 0, reason: 'stale' };

  const { data: preference, error: preferenceError } = await admin.from('notification_preferences')
    .select('lavagna')
    .eq('user_id', partnerId)
    .maybeSingle();
  if (!preferenceError && preference && preference.lavagna === false) return { delivered: 0, failed: 0, reason: 'disabled-by-preference' };

  const since = new Date(now - LAVAGNA_PUSH_GAP_MS).toISOString();
  const { data: recent, error: recentError } = await admin.from('push_event_log').select('dedupe_key')
    .eq('event_type', LAVAGNA_EVENT_TYPE).eq('couple_id', stroke.couple_id).eq('sender_id', sender.id)
    .gte('created_at', since)
    .limit(1);
  if (recentError) throw recentError;
  if ((recent || []).length) return { delivered: 0, failed: 0, reason: 'throttled' };

  return deliverNotification(admin, {
    notification: buildNotification('lavagna', { senderName: sender.display_name, strokeId: stroke.id, locale: await recipientLocale(admin, partnerId) }),
    recipientIds: [partnerId],
    coupleId: stroke.couple_id,
    senderId: sender.id,
    dedupeKey: lavagnaDedupeKey(partnerId, now),
    eventType: LAVAGNA_EVENT_TYPE,
    web,
    native,
  });
}
