// L'invito che si rinnova — the hourly invite-reminder-job (founder,
// 27/11/2026). Whoever created the couple and still waits for the other person
// gets a reminder to send the code again: the day after and three days after
// the couple was made, at 18 in Rome. Only a couple of one; only who turned on
// the notifications (on the waiting screen, «Avvisami quando entra»); the
// relationship switch of Impostazioni › Notifiche is respected when it exists.
// Each reminder once (dedupe key). Pure and injectable like the other
// *-core.mjs: Deno in the Edge, Node in the tests.
import { buildNotification, deliverNotification, recipientLocales } from './notification-core.mjs';

export const REMINDER_HOUR = 18;
export const REMINDER_DAYS = Object.freeze([1, 3]);

const ROME = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
export function romeParts(at = new Date()) {
  const parts = ROME.formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

// Whole Rome days between the couple's creation and now (0 the same day).
export function romeDaysSince(createdAt, now = new Date()) {
  const made = new Date(createdAt);
  if (!Number.isFinite(+made)) return -1;
  const day = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((day(romeParts(now).date) - day(romeParts(made).date)) / 86400000);
}

// True at the hour, or always with force (by hand on staging: the caller holds the cron key).
export function shouldRun(parts, force) {
  return force === true || parts?.hour === REMINDER_HOUR;
}

export async function runInviteReminderJob(admin, { now = new Date(), web = null, native = null } = {}) {
  // Only couples made in the last few days can be on day 1 or day 3.
  const since = new Date(now.getTime() - 5 * 86400000).toISOString();
  const { data: couples, error } = await admin.from('couples').select('id,created_at').gte('created_at', since);
  if (error) throw error;
  let reminded = 0;
  let delivered = 0;
  for (const couple of couples || []) {
    const day = romeDaysSince(couple.created_at, now);
    if (!REMINDER_DAYS.includes(day)) continue;
    const { data: members, error: membersError } = await admin.from('profiles').select('id').eq('couple_id', couple.id);
    if (membersError) { console.error('invite reminder members', membersError); continue; }
    // The other person is in: nothing to remind.
    if ((members || []).length !== 1) continue;
    const id = members[0].id;
    const { data: prefs } = await admin.from('notification_preferences').select('user_id,relationship').eq('user_id', id);
    const pref = (prefs || [])[0];
    if (pref && pref.relationship === false) continue;
    const locales = await recipientLocales(admin, [id]);
    const notification = buildNotification('invite_reminder', { day, tag: `invite-reminder-${day}`, locale: locales.get(id) });
    const result = await deliverNotification(admin, {
      notification, recipientIds: [id], coupleId: couple.id, dedupeKey: `invite-reminder:${couple.id}:${day}`, eventType: 'invite_reminder', web, native,
    });
    reminded += 1;
    delivered += result.delivered || 0;
  }
  return { ok: true, reminded, delivered };
}
