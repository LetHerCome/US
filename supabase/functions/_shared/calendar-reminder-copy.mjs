// Testo della notifica dei promemoria del calendario (calendar-reminders-worker).
// Modulo puro: niente Deno, niente rete, così i test Node lo eseguono davvero.
// Le Edge Function girano in UTC: ora e giorno si leggono sempre nel fuso
// dell'app, mai dall'orologio del server.

export const REMINDER_TIMEZONE = 'Europe/Rome';

export function humanOffset(offsetMinutes) {
  if (offsetMinutes === 1440) return 'Domani';
  if (offsetMinutes === 60) return 'Tra un’ora';
  return `Tra ${offsetMinutes} minuti`;
}

// { date: 'YYYY-MM-DD', time: 'HH:MM' } dell'istante `ms` nel fuso indicato.
function inZone(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function nextDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Se il destinatario è chi ha chiesto il promemoria → «Tra un’ora: Titolo»,
// «Domani alle 20:30: Cena»; se è l'altra persona → «Francesco ti ricorda:
// Cena alle 20:30 ♡», e «…: Cena, domani alle 20:30 ♡» quando l'evento cade
// il giorno dopo (i «1 giorno prima» e quelli di tutto il giorno, la sera prima).
export function reminderBody({ selfRecipient, requesterName, title, allDay, startsAt, startDate, offsetMinutes, nowMs, timeZone = REMINDER_TIMEZONE }) {
  const startMs = allDay ? NaN : Date.parse(startsAt || '');
  const start = Number.isFinite(startMs) ? inZone(startMs, timeZone) : null;
  const at = start ? `alle ${start.time}` : '';
  if (selfRecipient) {
    const lead = humanOffset(offsetMinutes);
    return `${offsetMinutes === 1440 && at ? `${lead} ${at}` : lead}: ${title}`;
  }
  const eventDay = allDay ? String(startDate || '') : start?.date;
  const tomorrow = Boolean(eventDay) && eventDay === nextDay(inZone(nowMs, timeZone).date);
  const when = tomorrow ? `, ${at ? `domani ${at}` : 'domani'}` : at ? ` ${at}` : '';
  return `${requesterName} ti ricorda: ${title}${when} ♡`;
}
