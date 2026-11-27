// Come stai che conta (grill del founder del 27/11/2026). Two server rules
// around public.member_status, pure and injectable like the other *-core.mjs
// (Deno in the Edge, Node in the tests with a fake admin):
//
// * D7/D16 — the answer to the other person's Come stai. The phone saved it
//   with respond_member_status (one per state, rate-limited); send-web-push
//   status_response reads it back here, never from the request, and builds
//   ONE push like a Ti penso («Bea: Ti mando un abbraccio»), dedupe
//   status-response:<owner>:<set_at>.
//
// * D11/D19 — respect work and study. While the RECIPIENT's Come stai is
//   lavoro or studio (and not expired), the non-urgent pushes wait: Gioca
//   (game-v2-push and its worker), the evening reminder of the question of
//   the day (daily-question-push-worker) and US vi ricorda
//   (us-ricorda-push-worker). They are skipped WITHOUT claiming their dedupe
//   key, and the workers that already run on a timer try them again; they go
//   out when the state ends or expires (12 hours at most), inside each
//   worker's own daytime window. Ti penso, Lasciato per te, post-it and the
//   answers to Come stai always go.
//   A failed read never holds a push back: no state known = not busy.

import { STATUS_GESTURES } from './notification-core.mjs';

export const QUIET_STATUSES = Object.freeze(['lavoro', 'studio']);
// An answer is pushed only right after it was saved (the phone calls at once).
export const STATUS_RESPONSE_MAX_AGE_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ms = (value) => {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : NaN;
};

/** True when this member_status row says lavoro or studio, still showing at `now`. */
export function isQuietRow(row, now = new Date()) {
  if (!row || !QUIET_STATUSES.includes(row.status)) return false;
  const until = ms(row.expires_at);
  const at = now instanceof Date ? now.getTime() : ms(now);
  return Number.isFinite(until) && Number.isFinite(at) && until > at;
}

/** The recipients (of userIds) who are at work or studying now. Never throws. */
export async function quietRecipients(admin, userIds, now = new Date()) {
  const ids = [...new Set((userIds || []).filter((id) => UUID.test(String(id || ''))))];
  const quiet = new Set();
  if (!ids.length) return quiet;
  try {
    const query = admin.from('member_status').select('user_id,status,expires_at');
    const { data, error } = await (ids.length === 1 ? query.eq('user_id', ids[0]) : query.in('user_id', ids));
    if (error) return quiet;
    for (const row of data || []) if (ids.includes(row?.user_id) && isQuietRow(row, now)) quiet.add(row.user_id);
  } catch (_) {
    // Not known: the push goes.
  }
  return quiet;
}

/** One recipient: is the push to wait? */
export async function isQuiet(admin, userId, now = new Date()) {
  return (await quietRecipients(admin, [userId], now)).has(userId);
}

/**
 * send-web-push status_response: the answer the caller just saved on the
 * partner's state, read back from the server.
 * @returns {{ gesture, setAt, dedupeKey }} or {{ reason }}
 */
export async function statusResponseEvent(admin, { sender, partner, now = new Date() } = {}) {
  if (!sender?.id || !sender.couple_id || !partner?.id) return { reason: 'no-recipient' };
  const { data: row, error } = await admin.from('member_status')
    .select('user_id,couple_id,status,set_at,expires_at,reply_gesture,reply_at')
    .eq('user_id', partner.id).maybeSingle();
  if (error) throw error;
  if (!row || row.couple_id !== sender.couple_id || !row.status || !row.set_at) return { reason: 'no-status' };
  if (!(ms(row.expires_at) > now.getTime())) return { reason: 'no-status' };
  if (!STATUS_GESTURES.includes(row.reply_gesture)) return { reason: 'no-answer' };
  const at = ms(row.reply_at);
  if (!Number.isFinite(at) || now.getTime() - at > STATUS_RESPONSE_MAX_AGE_MS || at - now.getTime() > 60_000) return { reason: 'stale-answer' };
  return { gesture: row.reply_gesture, setAt: row.set_at, dedupeKey: `status-response:${partner.id}:${ms(row.set_at)}` };
}
