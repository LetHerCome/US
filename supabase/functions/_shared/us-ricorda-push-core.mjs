// Avvisi di US vi ricorda (founder, 27/11/2026). The characters' lines were
// seen only by opening US; the strongest dated ones now reach the phone:
// a birthday in 7 days and on the day, the anniversary in 7 days (10 in
// Rome), «un anno fa» and a memory US hung on the bacheca (18 in Rome).
//
// The server decides (public.us_ricorda_push_due_v1, rules, no AI): who, which
// line, the switch notification_preferences.ricorda, «Non dirmelo più», a line
// already seen. This worker only writes the words (notification-core, in the
// recipient's language) and claims us-ricorda:<user>:<day>, so a person gets
// at most one of these a day whatever the two runs find. Never at night: it
// acts only at the two hours below. Pure and injectable like the other cores.
import { buildNotification, deliverNotification, recipientLocales } from './notification-core.mjs';

export const MORNING_HOUR = 10;
export const EVENING_HOUR = 18;
export const RICORDA_TYPES = Object.freeze(['ricorda_birthday_week', 'ricorda_birthday', 'ricorda_anniversary_week', 'ricorda_year_ago', 'ricorda_bacheca']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function romeHour(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  return Number(parts.find((p) => p.type === 'hour')?.value);
}

// 'mattina', 'sera' or null. `force` ("mattina" / "sera") is for trying it by
// hand on staging, where the crons are off: the caller already holds the key.
export function ricordaSlot(hour, force) {
  if (force === 'mattina' || force === 'sera') return force;
  if (force) return null;
  if (hour === MORNING_HOUR) return 'mattina';
  if (hour === EVENING_HOUR) return 'sera';
  return null;
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** One due row of us_ricorda_push_due_v1 → the canonical notification, or null when off-contract. */
export function ricordaNotification(row, locale) {
  if (!row || !RICORDA_TYPES.includes(row.type)) return null;
  const v = row.vars && typeof row.vars === 'object' ? row.vars : {};
  return buildNotification(row.type, {
    locale,
    name: text(v.name, 40),
    years: Number.isInteger(Number(v.years)) && Number(v.years) > 0 ? Number(v.years) : 1,
    source: ['moment', 'meet', 'idea'].includes(v.source) ? v.source : '',
    place: text(v.place, 60),
    title: text(v.title, 80),
    reason: text(v.reason, 24),
    count: Number.isInteger(Number(v.count)) ? Number(v.count) : 0,
  });
}

export async function runRicordaPushJob(admin, { slot, day = null, web = null, native = null } = {}) {
  const { data, error } = await admin.rpc('us_ricorda_push_due_v1', day ? { p_slot: slot, p_day: day } : { p_slot: slot });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []).filter((row) => UUID.test(String(row?.user_id || '')) && UUID.test(String(row?.couple_id || '')) && DAY.test(String(row?.day || '')));
  const locales = await recipientLocales(admin, rows.map((row) => row.user_id));
  let delivered = 0;
  let skipped = 0;
  for (const row of rows) {
    const notification = ricordaNotification(row, locales.get(row.user_id));
    if (!notification) { skipped += 1; continue; }
    try {
      const result = await deliverNotification(admin, {
        notification,
        recipientIds: [row.user_id],
        coupleId: row.couple_id,
        dedupeKey: `us-ricorda:${row.user_id}:${row.day}`,
        eventType: row.type,
        web,
        native,
      });
      if (result.delivered) delivered += 1; else skipped += 1;
    } catch (error) {
      skipped += 1;
      console.error('us ricorda push', error instanceof Error ? error.message : 'unknown');
    }
  }
  return { ok: true, slot, due: rows.length, delivered, skipped };
}
