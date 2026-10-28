// The relationship milestones that fall on `now` (a Europe/Rome day: year,
// month, day) for a couple together since `startedOn` (YYYY-MM-DD), in the
// order the hourly monthiversary-job awards them; the first one is the one
// the couple is told about.
//   - Days together (founder, 29/10/2026): every 100 days, 1000 the biggest
//     prize (more than an anniversary).
//   - Mesiversario / anniversario: a start on the 29th, 30th or 31st counts on
//     the last day of shorter months (the client's rule, events.js addMonthsDay).
export const DAYS_STEP = 100;
export const daysMilestoneXp = (days) => (days % 1000 === 0 ? 300 : 80);

export function dueMilestones(startedOn, now) {
  const [sy, sm, sd] = String(startedOn || '').split('-').map(Number);
  if (!sy || !sm || !sd || !now?.year || !now?.month || !now?.day) return [];
  const due = [];
  const days = Math.round((Date.UTC(now.year, now.month - 1, now.day) - Date.UTC(sy, sm - 1, sd)) / 864e5);
  if (days > 0 && days % DAYS_STEP === 0) due.push({ kind: 'days', days, xp: daysMilestoneXp(days) });
  const lastDay = new Date(Date.UTC(now.year, now.month, 0)).getUTCDate();
  const months = (now.year - sy) * 12 + (now.month - sm);
  if (Math.min(sd, lastDay) === now.day && months > 0) {
    const kind = months % 12 === 0 ? 'anniversary' : 'monthiversary';
    due.push({ kind, months, xp: kind === 'anniversary' ? 200 : 60 });
  }
  return due;
}
