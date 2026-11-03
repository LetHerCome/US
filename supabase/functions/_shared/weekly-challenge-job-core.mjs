// La sfida della settimana — the hourly weekly-challenge-job (founder,
// 03/11/2026). Monday at 9 in Rome: «La sfida della settimana» with its title
// to both. Saturday at 10: a reminder, if it is not done, to whoever has not
// sent a photo yet. Both follow notification_preferences.bond (the switch of
// the challenge in Impostazioni › Notifiche). Pure and injectable like the
// other *-core.mjs: Deno in the Edge, Node in the tests.
import { buildNotification, deliverNotification, recipientLocales } from './notification-core.mjs';

export const MONDAY_HOUR = 9;
export const SATURDAY_HOUR = 10;
const WEEKDAYS = Object.freeze({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 });

export function romeParts(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return { weekday: WEEKDAYS[get('weekday')] || 0, hour: Number(get('hour')) };
}

// 'new', 'reminder' or null. `force` ("monday" / "saturday") is for trying it
// by hand: the caller already holds the cron key.
export function jobKind(parts, force) {
  if (force === 'monday') return 'new';
  if (force === 'saturday') return 'reminder';
  if (force) return null;
  if (parts?.weekday === 1 && parts.hour === MONDAY_HOUR) return 'new';
  if (parts?.weekday === 6 && parts.hour === SATURDAY_HOUR) return 'reminder';
  return null;
}

export async function runWeeklyChallengeJob(admin, { kind, web = null, native = null } = {}) {
  const { data: couples, error: couplesError } = await admin.from('couples').select('id');
  if (couplesError) throw couplesError;
  let told = 0;
  let delivered = 0;
  for (const couple of couples || []) {
    const { data: members, error: membersError } = await admin.from('profiles').select('id').eq('couple_id', couple.id);
    if (membersError) { console.error('weekly challenge members', membersError); continue; }
    let ids = (members || []).map((m) => m.id);
    // A couple of one has nobody to do it with yet.
    if (ids.length < 2) continue;
    const { data: challenge, error } = await admin.rpc('weekly_challenge_for_job', { target_couple_id: couple.id });
    if (error || !challenge?.id) { if (error) console.error('weekly challenge', error); continue; }
    told += 1;
    if (kind === 'reminder') {
      if (challenge.completed) continue;
      const posted = new Set(challenge.posted_by || []);
      ids = ids.filter((id) => !posted.has(id));
    }
    if (!ids.length) continue;
    const { data: prefs } = await admin.from('notification_preferences').select('user_id,bond').in('user_id', ids);
    const prefMap = new Map((prefs || []).map((p) => [p.user_id, p.bond]));
    ids = ids.filter((id) => (prefMap.has(id) ? Boolean(prefMap.get(id)) : true));
    if (!ids.length) continue;
    const locales = await recipientLocales(admin, ids);
    for (const id of ids) {
      const en = locales.get(id) === 'en';
      const type = kind === 'new' ? 'challenge_new' : 'challenge_reminder';
      const notification = buildNotification(type, {
        challengeId: challenge.id,
        title: en ? challenge.title_en : challenge.title,
        shortTitle: en ? challenge.short_title_en : challenge.short_title,
        locale: locales.get(id),
      });
      const result = await deliverNotification(admin, {
        notification, recipientIds: [id], coupleId: couple.id, dedupeKey: `challenge-${kind}:${challenge.id}:${id}`, eventType: type, web, native,
      });
      delivered += result.delivered || 0;
    }
  }
  return { ok: true, kind, couples: told, delivered };
}
