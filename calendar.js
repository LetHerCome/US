// M6B — Shared Calendar Surface. Consumes public.calendar_entries (M6A) as-is.
// A handful of pure helpers are exported for `require()` under `node --test`
// (no DOM/window there, so the module.exports assignment happens before any
// DOM access and the rest of the file returns early outside a browser).
(() => {
'use strict';

const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const WEEKDAYS_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const WEEKDAY_LONG_IT = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
// Fixed, never re-derived from the viewer's own identity — both partners'
// devices must resolve the same lane/palette for the same person.
const ROLE_ORDER = ['beatrice', 'francesco'];
// The single source of truth for how long a newly-created (or all-day -> timed)
// entry lasts. Editing a timed entry that stays timed preserves its OWN
// original duration instead (see originalDurationMinutes) — this constant is
// only ever a fallback/default, never a forced rewrite of an existing entry.
const US_CALENDAR_DEFAULT_DURATION_MINUTES = 60;

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function parseISODate(value) { const [y, m, d] = String(value).split('-').map(Number); return new Date(y, m - 1, d); }
function todayISO() { const n = new Date(); return isoDate(n.getFullYear(), n.getMonth(), n.getDate()); }

function roleRank(role) { const i = ROLE_ORDER.indexOf(role); return i < 0 ? ROLE_ORDER.length : i; }

// entry_type='shared' has no owner column (never duplicated per-partner); a
// personal entry's lane is simply its owner's stable role.
function entryLaneRoleFor(entry, ownerRole) {
  if (entry.entry_type === 'shared') return 'shared';
  return ownerRole || 'other';
}

// Ownership stays readable without colour: actual initials, Noi = shared.
// Derived ONLY from the existing lane authority
// (entry_type + the owner's stable role) — there is no second ownership field.
const OWNER_MARK_BY_LANE = { shared: 'Noi' };
const OWNER_MARK_ORDER = ['Noi'];
function ownerMarkFor(lane, displayName) {
  if (OWNER_MARK_BY_LANE[lane]) return OWNER_MARK_BY_LANE[lane];
  if (typeof window !== 'undefined' && window.UsIdentity && ROLE_ORDER.includes(lane)) return window.UsIdentity.current().initialForRole(lane);
  return String(displayName || '').trim().charAt(0).toUpperCase() || '·';
}
function ownerNameFor(lane, displayName) {
  return lane === 'shared' ? 'Insieme' : (typeof window !== 'undefined' && window.UsIdentity && ROLE_ORDER.includes(lane) ? window.UsIdentity.current().nameForRole(lane) : displayName || 'La tua persona');
}
function spokenTime(iso) {
  const d = new Date(iso);
  return d.getMinutes() === 0 ? String(d.getHours()) : `${d.getHours()}:${pad2(d.getMinutes())}`;
}
// "Università, Beatrice, ore 9" — ownership by name, never by colour or by the
// bare initial.
function entryAriaLabel({ title, lane, displayName, entry }) {
  const when = entry.is_all_day ? 'tutto il giorno' : `ore ${spokenTime(entry.starts_at)}`;
  return `${title}, ${ownerNameFor(lane, displayName)}, ${when}`;
}
// Month cell: which markers to draw — never a transcript of the day. Distinct
// owners in fixed order (F, B, Noi), the remainder as "+N".
function monthCellMarks(marks, maxChips = 3) {
  const rank = (m) => { const i = OWNER_MARK_ORDER.indexOf(m); return i < 0 ? 0 : 1; };
  const distinct = [...new Set(marks)].sort((a, b) => rank(a) - rank(b));
  const chips = distinct.slice(0, maxChips);
  return { chips, more: Math.max(0, marks.length - chips.length) };
}
// All-day first, then by start; ties by title so the order is stable.
function sortDayEntries(list) {
  return (list || []).slice().sort((a, b) => {
    if (Boolean(a.is_all_day) !== Boolean(b.is_all_day)) return a.is_all_day ? -1 : 1;
    if (!a.is_all_day) {
      const d = new Date(a.starts_at) - new Date(b.starts_at);
      if (d) return d;
    }
    return String(a.title).localeCompare(String(b.title), 'it');
  });
}
// Selected-day sections: only the lanes that really have something (no empty
// scaffolding), personal lanes in the fixed role order, then Insieme, then any
// lane whose owner could not be resolved (never silently dropped).
function groupDayEntries(dayEntries, laneOf) {
  const lanes = new Map();
  for (const e of sortDayEntries(dayEntries)) {
    const lane = laneOf(e);
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane).push(e);
  }
  const rank = (lane) => (lane === 'shared' ? ROLE_ORDER.length : (ROLE_ORDER.includes(lane) ? roleRank(lane) : ROLE_ORDER.length + 1));
  return [...lanes.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([lane, list]) => ({ lane, list }));
}

function localDateFromInstant(iso) { const d = new Date(iso); return isoDate(d.getFullYear(), d.getMonth(), d.getDate()); }

function localDateTimeToISO(dateISO, timeHHMM) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  const [hh, mm] = String(timeHHMM || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).toISOString();
}

function addMinutesToISO(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

// The duration a TIMED entry already has, in minutes — null if the entry is
// missing timestamps, all-day, or its stored interval is zero/negative (a
// malformed row must never silently propagate a bad duration forward).
function originalDurationMinutes(entry) {
  if (!entry || entry.is_all_day || !entry.starts_at || !entry.ends_at) return null;
  const minutes = (new Date(entry.ends_at) - new Date(entry.starts_at)) / 60000;
  return minutes > 0 ? minutes : null;
}

function shiftISODate(dateISO, days) {
  const d = parseISODate(dateISO);
  const shifted = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return isoDate(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

// The span an ALL-DAY entry already covers, in whole days (0 = single day) —
// null if the entry is missing date columns, timed, or its stored span is
// negative (a malformed row must never silently propagate a bad span forward).
function originalAllDaySpanDays(entry) {
  if (!entry || !entry.is_all_day || !entry.start_date || !entry.end_date) return null;
  const days = Math.round((parseISODate(entry.end_date) - parseISODate(entry.start_date)) / 86400000);
  return days >= 0 ? days : null;
}

function eachDateBetween(startISO, endISO) {
  const out = [];
  let cur = parseISODate(startISO);
  const end = parseISODate(endISO);
  while (cur <= end) {
    out.push(isoDate(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}

// Which local calendar day(s) an entry visually touches — used for month/day
// markers only. Distinct from overlapsWindow (calendar-domain.js), which is
// the RLS-scoped read query; this is pure display bucketing.
function entryDateSpan(entry) {
  if (entry.is_all_day) return { start: entry.start_date, end: entry.end_date };
  const start = localDateFromInstant(entry.starts_at);
  const endInstant = new Date(entry.ends_at);
  let end = localDateFromInstant(entry.ends_at);
  // An end exactly at local midnight belongs visually to the previous day
  // (e.g. 23:00 -> 00:00 is a one-hour entry on day 1, not a marker on day 2).
  if (end > start && endInstant.getHours() === 0 && endInstant.getMinutes() === 0 && endInstant.getSeconds() === 0) {
    const prev = new Date(endInstant.getFullYear(), endInstant.getMonth(), endInstant.getDate() - 1);
    end = isoDate(prev.getFullYear(), prev.getMonth(), prev.getDate());
  }
  return { start, end };
}
function entryDatesTouched(entry) {
  const { start, end } = entryDateSpan(entry);
  return eachDateBetween(start, end);
}

// M6C — Week window: Monday-start, 7 days, end exclusive. Reuses windowForGrid
// so the week read satisfies the exact same calendar-domain window contract
// (instant bounds + date bounds) as the month grid read.
function weekRangeFor(weekStartISO) {
  return { startISO: weekStartISO, endISO: shiftISODate(weekStartISO, 7) };
}
function weekWindowFor(weekStartISO) {
  const { startISO, endISO } = weekRangeFor(weekStartISO);
  return windowForGrid(parseISODate(startISO), parseISODate(endISO));
}
function mondayOfISO(dateISO) {
  const d = parseISODate(dateISO);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(monday.getFullYear(), monday.getMonth(), monday.getDate());
}

// Splits one day's entries into per-partner busy intervals (ms, clipped to the
// local day) for computeFreeTogether. ALL-DAY entries occupy whole local days
// by DATE (never by instant — the M6A rule). A shared entry marks BOTH partners
// busy (the domain layer adds it to both lists). An entry whose owner role is
// unknown owner role plays it safe and marks both busy (never silently hides busy time).
// The caller feeds this straight into UsCalendarDomain.computeFreeTogether —
// the merge/complement/min-duration algorithm itself is NOT duplicated here.
function partitionDayBusy(entries, dateISO, roleOf) {
  const win = windowForGrid(parseISODate(dateISO), parseISODate(shiftISODate(dateISO, 1)));
  const ws = new Date(win.windowStartAt).getTime();
  const we = new Date(win.windowEndAt).getTime();
  const personABusy = [];
  const personBBusy = [];
  const sharedEvents = [];
  const push = (e, iv) => {
    if (e.entry_type === 'shared') sharedEvents.push(iv);
    else if (roleOf(e) === ROLE_ORDER[0]) personABusy.push(iv);
    else if (roleOf(e) === ROLE_ORDER[1]) personBBusy.push(iv);
    else { personABusy.push(iv); personBBusy.push(iv); }
  };
  for (const e of entries || []) {
    if (e.is_all_day) {
      if (e.start_date < win.windowEndDate && e.end_date >= win.windowStartDate) push(e, { start: ws, end: we });
      continue;
    }
    const s = new Date(e.starts_at).getTime();
    const en = new Date(e.ends_at).getTime();
    if (s < we && en > ws) push(e, { start: Math.max(s, ws), end: Math.min(en, we) });
  }
  return { personABusy, personBBusy, sharedEvents, dayStartISO: win.windowStartDate, dayEndISO: win.windowEndDate };
}

// "La nostra settimana": an evening is free for you two when you have at
// least three hours free together between 19:00 and 23:00. The busy rules are
// the ones of "Liberi insieme" (partitionDayBusy + computeFreeTogether); a
// couple Event with a time (Eventi) counts as a shared plan of three hours.
const US_FREE_EVENING = Object.freeze({ startHour: 19, endHour: 23, minMinutes: 180, eventMinutes: 180 });
function freeEveningFor(entries, dateISO, roleOf, eventTimes = [], domain = (typeof UsCalendarDomain !== 'undefined' ? UsCalendarDomain : null)) {
  if (!domain || typeof domain.computeFreeTogether !== 'function') return false;
  const d = parseISODate(dateISO);
  const at = (h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0).getTime();
  const partition = partitionDayBusy(entries, dateISO, roleOf);
  const plans = [];
  for (const time of eventTimes || []) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
    if (!match) continue;
    const start = at(Number(match[1]), Number(match[2]));
    plans.push({ start, end: start + US_FREE_EVENING.eventMinutes * 60000 });
  }
  return domain.computeFreeTogether({
    windowStart: at(US_FREE_EVENING.startHour),
    windowEnd: at(US_FREE_EVENING.endHour),
    personABusy: partition.personABusy,
    personBBusy: partition.personBBusy,
    sharedEvents: [...partition.sharedEvents, ...plans],
    minDurationMinutes: US_FREE_EVENING.minMinutes
  }).length > 0;
}

// Human phrasing for one free-together window, in Italian, hour-based:
//   entire day -> "Tutta la giornata"; ends at midnight -> "dopo le H:MM";
//   starts at midnight -> "fino alle H:MM"; otherwise "13:00 – 16:00".
function tempoWindowLabel(startISO, endISO, dayStartISO, dayEndISO) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const fmt = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const dayStartMs = parseISODate(dayStartISO).getTime();
  const dayEndMs = parseISODate(dayEndISO).getTime();
  if (s.getTime() === dayStartMs && e.getTime() === dayEndMs) return 'Tutta la giornata';
  if (e.getTime() === dayEndMs) return `dopo le ${fmt(s)}`;
  if (s.getTime() === dayStartMs) return `fino alle ${fmt(e)}`;
  return `${fmt(s)} – ${fmt(e)}`;
}

function formatDateRangeLabel(startISO, endISO) {
  const fmtOne = (iso) => { const d = parseISODate(iso); return `${d.getDate()} ${MONTHS_IT[d.getMonth()].toLowerCase()}`; };
  return startISO === endISO ? fmtOne(startISO) : `${fmtOne(startISO)} → ${fmtOne(endISO)}`;
}

// Monday-first, fixed 6-week (42-day) grid with spill days from adjoining months.
function monthGridRange(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42);
  return { gridStart, gridEnd };
}

// Mirrors calendar-domain.js's window contract: bounded to the visible grid,
// never the full history.
function windowForGrid(gridStart, gridEnd) {
  return {
    windowStartAt: new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate(), 0, 0, 0).toISOString(),
    windowEndAt: new Date(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate(), 0, 0, 0).toISOString(),
    windowStartDate: isoDate(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate()),
    windowEndDate: isoDate(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate())
  };
}

// Pure payload builder shared by create and edit: never includes
// couple_id/created_by/entry_type/owner_id (those are immutable/authority
// fields — see M6A's BEFORE UPDATE guard trigger).
// `location` must be passed through by the caller unchanged on edit (the form
// no longer collects it) and as null on create — this function never invents
// a default for it, so it can't be the one that erases an existing value.
// `spanDays` mirrors `durationMinutes` for the all-day case: it must come
// from the entry being edited (0 for create, or when there is no prior
// all-day span to preserve), never a constant — otherwise editing a
// multi-day all-day entry would silently truncate it to a single day.
// Fast time entry: accepts "9", "930", "09:30" and returns canonical HH:MM.
// Invalid values stay empty instead of being guessed.
function normalizeQuickTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let h;
  let m;
  const colon = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else {
    const digits = raw.replace(/\D/g, '');
    if (!digits || digits.length > 4) return '';
    if (digits.length <= 2) { h = Number(digits); m = 0; }
    else if (digits.length === 3) { h = Number(digits.slice(0, 1)); m = Number(digits.slice(1)); }
    else { h = Number(digits.slice(0, 2)); m = Number(digits.slice(2)); }
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return '';
  return `${pad2(h)}:${pad2(m)}`;
}

function addClockMinutes(value, minutes = US_CALENDAR_DEFAULT_DURATION_MINUTES) {
  const normalized = normalizeQuickTime(value);
  if (!normalized) return '';
  const [h, m] = normalized.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 1440) return '';
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// Duration from two local clock times. Keep the existing calendar invariant:
// a timed quick entry ends later on the same local day.
function durationMinutesFromTimes(startHHMM, endHHMM) {
  const startValue = normalizeQuickTime(startHHMM);
  const endValue = normalizeQuickTime(endHHMM);
  if (!startValue || !endValue) return null;
  const [sh, sm] = startValue.split(':').map(Number);
  const [eh, em] = endValue.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const diff = end - start;
  return diff > 0 ? diff : null;
}

// M6D — Reminder options. Fixed enum: null = Nessuno, else minutes before.
const REMINDER_OPTIONS = [
  { value: null, label: 'Nessuno' },
  { value: 10, label: '10 min prima' },
  { value: 30, label: '30 min prima' },
  { value: 60, label: '1 ora prima' },
  { value: 1440, label: '1 giorno prima' }
];
// "Ricorda a" — Me sempre; Partner sempre; Entrambi solo per gli shared.
const REMINDER_TARGETS = [
  { value: 'me', label: 'Me' },
  { value: 'partner', label: 'Partner' },
  { value: 'both', label: 'Entrambi' }
];
// "Entrambi" esiste solo per gli eventi Insieme.
function reminderTargetAllowed(target, entryType) {
  return target !== 'both' || entryType === 'shared';
}
// All-day: solo "1 giorno prima" (1440) — 10m/30m/1h non hanno senso per
// una giornata senza ora. Timed: tutti gli offset.
function reminderOffsetAllowed(offsetMinutes, isAllDay) {
  return !isAllDay || offsetMinutes === 1440;
}
// Filtra le opzioni visibili per il tipo di evento.
function reminderOptionsFor(isAllDay) {
  return REMINDER_OPTIONS.filter((o) => o.value == null || reminderOffsetAllowed(o.value, isAllDay));
}
// Righe da scrivere per (entry, target): una riga per destinatario — mai una
// colonna "entrambi". Una riga = un invio. Il partner è risolto dal chiamante
// dai profili reali (mai hardcoding).
function reminderRowsFor({ entryType, target, requesterId, partnerId, offsetMinutes }) {
  if (offsetMinutes == null || !reminderTargetAllowed(target, entryType)) return [];
  const rows = [];
  const push = (recipientId) => { if (recipientId) rows.push(recipientId); };
  if (entryType === 'shared') {
    if (target === 'me') push(requesterId);
    else if (target === 'partner') push(partnerId);
    else { push(requesterId); push(partnerId); }
  } else {
    if (target === 'me') push(requesterId);
    else if (target === 'partner') push(partnerId);
  }
  return rows.map((recipientId) => ({
    recipient_id: recipientId,
    offset_minutes: offsetMinutes
  }));
}
// Copia della notifica: self → "Tra un'ora — Titolo"; partner →
// "Francesco ti ricorda — Cena alle 20:30 ♡" (display name reale dal profilo).
function reminderCopy({ selfRecipient, requesterName, title, startsAt, allDay }) {
  if (selfRecipient) return '— ' + title;
  const hhmm = startsAt ? new Date(startsAt) : null;
  const when = allDay || !hhmm ? '' : ' alle ' + pad2(hhmm.getHours()) + ':' + pad2(hhmm.getMinutes());
  return requesterName + ' ti ricorda — ' + title + when + ' ♡';
}

function buildEntryPayload({ title, description, location, allDay, date, time, durationMinutes, spanDays }) {
  if (allDay) {
    const days = spanDays > 0 ? spanDays : 0;
    return { title, description: description || null, location: location ?? null, is_all_day: true, start_date: date, end_date: shiftISODate(date, days), starts_at: null, ends_at: null };
  }
  const starts_at = localDateTimeToISO(date, time || '00:00');
  const minutes = durationMinutes > 0 ? durationMinutes : US_CALENDAR_DEFAULT_DURATION_MINUTES;
  return {
    title, description: description || null, location: location ?? null, is_all_day: false,
    starts_at, ends_at: addMinutesToISO(starts_at, minutes),
    start_date: null, end_date: null
  };
}

// Only ever called on INSERT (create), never on update.
function withCreateAuthority(payload, kind, profile) {
  return { ...payload, entry_type: kind, couple_id: profile.couple_id, created_by: profile.id, owner_id: kind === 'personal' ? profile.id : null, visibility: 'full' };
}

function canEditEntry(entry, viewerId) {
  return entry.entry_type === 'shared' ? entry.created_by === viewerId : entry.owner_id === viewerId;
}

// A timed entry needs both clock values. The compact text fields avoid the
// platform clock picker; validation remains strict and server timestamps stay canonical.
function quickEntryError({ allDay, startTime, endTime, time }) {
  if (allDay) return null;
  const usesExplicitRange = startTime !== undefined || endTime !== undefined;
  if (!usesExplicitRange) return normalizeQuickTime(time) ? null : 'time';
  const start = normalizeQuickTime(startTime);
  const end = normalizeQuickTime(endTime);
  if (!start) return 'start';
  if (!end) return 'end';
  if (!durationMinutesFromTimes(start, end)) return 'range';
  return null;
}

// 1.0 polish — the quick form collects a fast title, Tutto il giorno and explicit Inizio/Fine. Every
// field it no longer shows is decided here, never zeroed by accident:
// * create: no description (a Da vivere idea may pass its own note), no
//   location, the default duration, a single all-day day;
// * edit: the entry's own description/location travel through unchanged, a
//   timed entry that stays timed keeps its REAL duration, and an all-day
//   entry that stays all-day keeps its own span.
function quickEntryHiddenFields({ editingEntry = null, allDay = false, ideaNote = null } = {}) {
  if (!editingEntry) {
    return {
      description: ideaNote ? String(ideaNote) : null,
      location: null,
      durationMinutes: US_CALENDAR_DEFAULT_DURATION_MINUTES,
      spanDays: 0
    };
  }
  const keepsTimed = !allDay && !editingEntry.is_all_day;
  const keepsAllDay = allDay && editingEntry.is_all_day;
  return {
    description: editingEntry.description ?? null,
    location: editingEntry.location ?? null,
    durationMinutes: keepsTimed ? (originalDurationMinutes(editingEntry) || US_CALENDAR_DEFAULT_DURATION_MINUTES) : US_CALENDAR_DEFAULT_DURATION_MINUTES,
    spanDays: keepsAllDay ? (originalAllDaySpanDays(editingEntry) || 0) : 0
  };
}

// PostgREST reports an RLS-filtered UPDATE/DELETE as a *success* with zero
// affected rows (HTTP 204, error: null) — not as an error. Without chaining
// .select() and checking the returned row count, a mutation the RLS USING
// clause silently dropped (stale authority after a claim_us_role re-pair, or
// a concurrent edit from the other device) would be reported to the user as
// a successful save/delete even though the server changed nothing. The
// couple-scoped SELECT policy always permits reading back the affected rows,
// so an empty array reliably means "nothing was written", never "written but
// hidden from this reader".
function classifyMutationResult({ data, error }) {
  if (error) return 'error';
  if (!data || data.length === 0) return 'not_authorized';
  return 'ok';
}

// M6E — Oggi calendar widget: a single "most useful current-day fact",
// composed from the SAME partitioned busy intervals + computeFreeTogether
// windows the day sheet already uses (never a second algorithm). The caller
// (getOggiCalendarInsightSource) does the fetching/partitioning; this stays a
// pure decision + label function so it is directly unit-testable.
function oggiEventLabel(entries, nowMs) {
  if (!entries || !entries.length) return 'Libera';
  const allDay = entries.find((e) => e.is_all_day);
  if (allDay) return allDay.title;
  const timed = entries.filter((e) => !e.is_all_day).slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const ongoing = timed.find((e) => new Date(e.starts_at).getTime() <= nowMs && new Date(e.ends_at).getTime() > nowMs);
  // Never the earliest event regardless of time — an already-ended event must
  // never be reported as "what's happening": fall through to the next one
  // whose end is still ahead of now, or "Libera" if everything already ended.
  const upcoming = timed.find((e) => new Date(e.ends_at).getTime() > nowMs);
  const chosen = ongoing || upcoming;
  if (!chosen) return 'Libera';
  const fmt = (iso) => { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  return `${chosen.title} ${fmt(chosen.starts_at)}–${fmt(chosen.ends_at)}`;
}

// Drops windows that have already fully elapsed and clips a spanning window's
// start up to now — a card must never advertise free time that is already in
// the past. Shared by the composer (final label) and its orchestrator (the
// decision to forward-scan), so the "is there anything usable left" check is
// never implemented twice.
function oggiRemainingWindows(freeWindows, nowISO) {
  const nowMs = new Date(nowISO).getTime();
  return (freeWindows || [])
    .map((w) => ({ start: Math.max(new Date(w.start).getTime(), nowMs), end: new Date(w.end).getTime() }))
    .filter((w) => w.end > w.start)
    .map((w) => ({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() }));
}

// Three mutually-exclusive fact types, in priority order:
//   1. free-all-day  — neither partner has anything on the calendar today.
//   2. events        — at least one entry today; a shared free window today
//                       (if any) is folded into the same card as a bonus line.
//   3. next-together  — today is fully double-booked with zero shared free
//                       time; nextTogetherDateISO (forward-scanned by the
//                       caller with the exact same day-by-day helper) points
//                       to the next day that does have one. If the scan found
//                       nothing within its horizon, this falls back to (2)
//                       rather than inventing a date.
function oggiPersonSummary(person, nowMs) {
  const value = oggiEventLabel(person.entries, nowMs);
  return { kind: 'person', label: person.name, value: value === 'Libera' ? 'Nessun impegno' : value };
}

function composeOggiCalendarFact({ dayStartISO, dayEndISO, personA, personB, freeWindows = [], nextTogetherDateISO = null, nowISO = new Date().toISOString() }) {
  const nowMs = new Date(nowISO).getTime();
  const hasEntries = (personA.entries.length + personB.entries.length) > 0;
  if (!hasEntries) {
    return {
      type: 'free-all-day',
      title: 'Oggi',
      detail: 'Liberi insieme · Nessun impegno per oggi.',
      rows: [{ kind: 'together', label: 'Insieme', value: 'Liberi tutto il giorno' }],
      dateISO: dayStartISO
    };
  }

  const personRows = [oggiPersonSummary(personA, nowMs), oggiPersonSummary(personB, nowMs)];
  const eventsDetail = `${personA.name}: ${oggiEventLabel(personA.entries, nowMs)} · ${personB.name}: ${oggiEventLabel(personB.entries, nowMs)}`;
  const remainingWindows = oggiRemainingWindows(freeWindows, nowISO);

  if (!remainingWindows.length) {
    if (nextTogetherDateISO) {
      const nextLabel = formatDateRangeLabel(nextTogetherDateISO, nextTogetherDateISO);
      return {
        type: 'next-together',
        title: 'Prossima volta insieme',
        detail: nextLabel,
        rows: [{ kind: 'together', label: 'Insieme', value: nextLabel }],
        dateISO: nextTogetherDateISO
      };
    }
    return { type: 'events', title: 'Oggi', detail: eventsDetail, rows: personRows, dateISO: dayStartISO };
  }

  const biggest = remainingWindows.slice().sort((a, b) => (new Date(b.end) - new Date(b.start)) - (new Date(a.end) - new Date(a.start)))[0];
  const windowLabel = tempoWindowLabel(biggest.start, biggest.end, dayStartISO, dayEndISO);
  return {
    type: 'events',
    title: 'Oggi',
    detail: `${eventsDetail} — Liberi insieme ${windowLabel}`,
    rows: [...personRows, { kind: 'together', label: 'Insieme', value: windowLabel }],
    dateISO: dayStartISO
  };
}

const pureApi = {
  ROLE_ORDER, US_CALENDAR_DEFAULT_DURATION_MINUTES, roleRank, entryLaneRoleFor, entryDateSpan, entryDatesTouched,
  formatDateRangeLabel, localDateFromInstant, localDateTimeToISO, addMinutesToISO, originalDurationMinutes,
  shiftISODate, originalAllDaySpanDays,
  monthGridRange, windowForGrid, weekRangeFor, weekWindowFor, mondayOfISO, partitionDayBusy, US_FREE_EVENING, freeEveningFor, tempoWindowLabel,
  normalizeQuickTime, addClockMinutes, durationMinutesFromTimes, REMINDER_OPTIONS, REMINDER_TARGETS, reminderTargetAllowed, reminderOffsetAllowed, reminderOptionsFor, reminderRowsFor, reminderCopy,
  buildEntryPayload, withCreateAuthority, canEditEntry,
  quickEntryError, quickEntryHiddenFields, classifyMutationResult,
  oggiEventLabel, composeOggiCalendarFact, oggiRemainingWindows,
  ownerMarkFor, ownerNameFor, entryAriaLabel, monthCellMarks, sortDayEntries, groupDayEntries
};
if (typeof module === 'object' && module.exports) Object.assign(module.exports, pureApi);
if (typeof window === 'undefined') return;
if (window.__usCalendarInstalled) return;
window.__usCalendarInstalled = true;

const $ = (id) => document.getElementById(id);
const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Noi is the only calendar on screen (noi-v2.js). This module keeps the read
// authority and the two editor sheets: the day detail and the "+" form.
let selectedDate = null;
let entries = [];
let profiles = [];
let profilesById = new Map();
// The "+" form: "Solo mio" is a personal entry, "Nostro" a shared one (the
// entry_type the table already has). "Data speciale" hands over to Eventi.
let calendarKind = 'personal';
let editingFormEntry = null;
let noiEditorReadSeq = 0;
let formDateISO = null; // M9C — il giorno scelto toccando il calendario
let detailEntry = null;
let busy = false;
// M7C — "Metti in calendario" da Da vivere: il form resta quello del
// Calendario (autorità di data/ora/durata/reminder); questo contesto dice
// solo che la creazione deve nascere shared e collegarsi a UN bucket_item.
let pendingIdeaLink = null;
// M9C — "Metti in calendario" sceglie il giorno dal calendario stesso: finché
// è attivo, toccare un giorno apre il form già shared e collegato all'idea.
let pendingIdeaPick = null;

function profileById(id) { return profilesById.get(id) || null; }
function profileName(id) { const p=profileById(id);return ownerNameFor(p?.role,p?.display_name); }
function profileRole(id) { return profileById(id)?.role || ''; }
function entryLaneRole(entry) { return entryLaneRoleFor(entry, profileRole(entry.owner_id)); }
function buildDateIndex() {
  const map = new Map();
  for (const entry of entries) {
    for (const d of entryDatesTouched(entry)) {
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(entry);
    }
  }
  return map;
}

async function loadProfiles() {
  const viewer=window.usProfile,coupleId=viewer?.couple_id;
  if (!viewer) return;
  const { data, error } = await sb.from('profiles').select('id,display_name,role,couple_id').eq('couple_id', coupleId);
  if(window.usProfile!==viewer||window.usProfile?.couple_id!==coupleId)return;
  if (error) { console.warn('[US Calendar] profiles', error); return; }
  profiles = (data || []).filter(p=>p.couple_id===coupleId);
  profilesById = new Map(profiles.map((p) => [p.id, p]));
}

// NOI V2: share the Calendar read authority without opening or mutating the
// modal's state. The viewer/couple identity is captured before any async work;
// no stale couple payload may be painted after account or pairing changes.
async function readNoiMonth(year, month) {
  const viewer=window.usProfile;
  if(!viewer||!Number.isInteger(year)||!Number.isInteger(month)||month<0||month>11)return null;
  const range=monthGridRange(year,month);
  const start=isoDate(range.gridStart.getFullYear(),range.gridStart.getMonth(),range.gridStart.getDate());
  const end=isoDate(range.gridEnd.getFullYear(),range.gridEnd.getMonth(),range.gridEnd.getDate());
  // Profile labels come only from this couple. Missing profile metadata must
  // never hide calendar entries; use a neutral fallback instead of a fake name.
  const profileRead=async()=>{
    try {
      const {data,error}=await sb.from('profiles').select('id,display_name,role,couple_id').eq('couple_id',viewer.couple_id);
      if(error){console.warn('[US Noi] profile names',error);return [];}
      return (data||[]).filter(p=>p.couple_id===viewer.couple_id);
    }catch(error){console.warn('[US Noi] profile names',error);return [];}
  };
  const [appointments,eventResult,coupleResult,profileRows]=await Promise.all([
    fetchEntriesForRange(viewer.couple_id,start,end),
    sb.from('shared_events').select('id,title,event_date,event_time,recurs_yearly').eq('couple_id',viewer.couple_id),
    sb.from('couples').select('started_on').eq('id',viewer.couple_id).maybeSingle(),
    profileRead()
  ]);
  if(window.usProfile!==viewer||window.usProfile?.couple_id!==viewer.couple_id)return null;
  if(eventResult.error)throw eventResult.error;
  if(coupleResult.error)throw coupleResult.error;
  return {
    appointments:appointments.map(entry=>({...entry,dates:entryDatesTouched(entry)})),
    events:eventResult.data||[],
    profiles:profileRows,
    startedOn:coupleResult.data?.started_on||null
  };
}

// "La nostra settimana": which of these days still have a free evening for
// both of you. Reads nothing: it works on the month readNoiMonth returned.
function noiFreeEvenings({ appointments = [], profiles: people = [], dates = [], eventTimesByDate = {} } = {}) {
  const roleById = new Map((people || []).map((p) => [p.id, p.role]));
  const roleOf = (entry) => entryLaneRoleFor(entry, roleById.get(entry.owner_id));
  return (dates || []).filter((dateISO) => /^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ''))
    && freeEveningFor(appointments, dateISO, roleOf, eventTimesByDate[dateISO] || []));
}

// M6E — Oggi calendar widget data source. A read independent of the shared
// `entries`/`profiles` module state above (so opening this widget can never
// clobber an already-open calendar surface's own data), but built from the
// exact same pieces: buildRangeOverlapFilter + filterEntriesInWindow for the
// read, partitionDayBusy + UsCalendarDomain.computeFreeTogether for the
// availability decision — never a second query/algorithm.
const US_OGGI_NEXT_TOGETHER_HORIZON_DAYS = 7;

async function fetchEntriesForRange(coupleId, startDateISO, endDateISOExclusive) {
  const win = windowForGrid(parseISODate(startDateISO), parseISODate(endDateISOExclusive));
  const filter = UsCalendarDomain.buildRangeOverlapFilter(win);
  const { data, error } = await sb.from('calendar_entries')
    .select('id,couple_id,entry_type,owner_id,title,is_all_day,starts_at,ends_at,start_date,end_date')
    .eq('couple_id', coupleId)
    .or(filter);
  if (error) throw error;
  return UsCalendarDomain.filterEntriesInWindow(data || [], win);
}

function freeTogetherWindowsForDay(entries, dateISO, roleOf) {
  const partition = partitionDayBusy(entries, dateISO, roleOf);
  const win = windowForGrid(parseISODate(dateISO), parseISODate(shiftISODate(dateISO, 1)));
  return UsCalendarDomain.computeFreeTogether({
    windowStart: win.windowStartAt,
    windowEnd: win.windowEndAt,
    personABusy: partition.personABusy,
    personBBusy: partition.personBBusy,
    sharedEvents: partition.sharedEvents,
    minDurationMinutes: 30
  });
}

// Bounded forward scan (one day at a time, one read per day) for the next day
// with any shared free time — only ever invoked when today has none. Takes
// the CAPTURED couple id from the caller, never the mutable global.
async function findNextTogetherDate(coupleId, roleOf, stillCurrent) {
  for (let i = 1; i <= US_OGGI_NEXT_TOGETHER_HORIZON_DAYS; i++) {
    if (!stillCurrent()) return null;
    const dateISO = shiftISODate(todayISO(), i);
    const dayEntries = await fetchEntriesForRange(coupleId, dateISO, shiftISODate(dateISO, 1));
    if (!stillCurrent()) return null;
    if (freeTogetherWindowsForDay(dayEntries, dateISO, roleOf).length) return dateISO;
  }
  return null;
}

// The profile/couple is captured ONCE at the start and reused for every read
// below (never re-read from the mutable window.usProfile mid-flight) — a
// logout or re-pair while this is in flight must never surface the wrong
// couple's names/events. `sameIdentity` is re-checked after every await, and
// again before the final return, so a stale in-flight call resolves to null.
async function getOggiCalendarInsightSource() {
  const profile = window.usProfile;
  if (!profile) return null;
  const coupleId = profile.couple_id;
  const sameIdentity = () => window.usProfile === profile && window.usProfile?.couple_id === coupleId;

  const { data: profileRows, error: profilesError } = await sb.from('profiles').select('id,role,display_name').eq('couple_id', coupleId);
  if (profilesError) { console.warn('[US Calendar] oggi widget profiles', profilesError); return null; }
  if (!sameIdentity()) return null;

  const roleById = new Map((profileRows || []).map((p) => [p.id, p.role]));
  const nameByRole = new Map((profileRows || []).map((p) => [p.role, p.display_name]));
  const roleOf = (entry) => entryLaneRoleFor(entry, roleById.get(entry.owner_id));

  const nowISO = new Date().toISOString();
  const today = todayISO();
  const tomorrow = shiftISODate(today, 1);
  const todayEntries = await fetchEntriesForRange(coupleId, today, tomorrow);
  if (!sameIdentity()) return null;
  const partition = partitionDayBusy(todayEntries, today, roleOf);
  const win = windowForGrid(parseISODate(today), parseISODate(tomorrow));
  const freeWindows = UsCalendarDomain.computeFreeTogether({
    windowStart: win.windowStartAt,
    windowEnd: win.windowEndAt,
    personABusy: partition.personABusy,
    personBBusy: partition.personBBusy,
    sharedEvents: partition.sharedEvents,
    minDurationMinutes: 30
  });

  const personAEntries = todayEntries.filter((e) => e.entry_type === 'shared' || roleOf(e) === ROLE_ORDER[0]);
  const personBEntries = todayEntries.filter((e) => e.entry_type === 'shared' || roleOf(e) === ROLE_ORDER[1]);

  let nextTogetherDateISO = null;
  if (todayEntries.length && !oggiRemainingWindows(freeWindows, nowISO).length) {
    nextTogetherDateISO = await findNextTogetherDate(coupleId, roleOf, sameIdentity);
    if (!sameIdentity()) return null;
  }

  return composeOggiCalendarFact({
    dayStartISO: win.windowStartDate,
    dayEndISO: win.windowEndDate,
    personA: { name: nameByRole.get(ROLE_ORDER[0]) || 'La tua persona', entries: personAEntries },
    personB: { name: nameByRole.get(ROLE_ORDER[1]) || 'La tua persona', entries: personBEntries },
    freeWindows,
    nextTogetherDateISO,
    nowISO
  });
}
window.getOggiCalendarInsightSource = getOggiCalendarInsightSource;

function ownerMarkOf(entry) { return ownerMarkFor(entryLaneRole(entry), profileById(entry.owner_id)?.display_name); }
function ownerChip(mark) {
  return `<span class="us-cal-chip${mark === 'Noi' ? ' us-cal-chip--shared' : ''}" aria-hidden="true">${esc(mark)}</span>`;
}

function entryTimeLabel(entry) {
  if (entry.is_all_day) return 'Tutto il giorno';
  const s = new Date(entry.starts_at);
  const e = new Date(entry.ends_at);
  const fmt = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${fmt(s)} → ${fmt(e)}`;
}

// The detail/editor sheets live at the document root and open directly above
// Noi. Kept as a guard for markup that still nests them somewhere else.
function ensureNoiEditorSheets(){
  if(!document.body?.appendChild)return;
  for(const id of ['usCalendarDetailSheet','usCalendarFormSheet']){
    const sheet=$(id);
    if(sheet&&sheet.parentElement!==document.body)document.body.appendChild(sheet);
  }
}
function openDetail(entryId) {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;
  detailEntry = entry;
  const title = $('usCalendarDetailTitle');
  if (title) title.textContent = entry.title;
  const isShared = entry.entry_type === 'shared';
  const owner = isShared ? 'noi' : entry.owner_id === window.usProfile?.id ? 'tu' : 'partner';
  const identityLabel = isShared ? `Insieme · creato da ${profileName(entry.created_by)}` : `Personale di ${profileName(entry.owner_id)}`;
  // The mockup's .ev-meta: "Mercoledì 14 ottobre · 21:00–23:30", then place and whose.
  const startDay = entry.is_all_day ? entry.start_date : localDateFromInstant(entry.starts_at);
  const endDay = entry.is_all_day ? entry.end_date : localDateFromInstant(entry.ends_at);
  const oneDay = startDay === endDay;
  const hhmm = (value) => { const d = new Date(value); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const dateLabel = entry.is_all_day
    ? (oneDay ? `${longDayLabel(startDay)} · Tutto il giorno` : formatDateRangeLabel(startDay, endDay))
    : oneDay ? `${longDayLabel(startDay)} · ${hhmm(entry.starts_at)}–${hhmm(entry.ends_at)}`
      : `${formatDateRangeLabel(startDay, endDay)} · ${entryTimeLabel(entry)}`;
  const place = entry.location ? `<span class="us-cal-detail-location" translate="no">${esc(entry.location)}</span> · ` : '';
  const rows = [`<div class="us-cal-detail-meta"><span class="us-cal-detail-dot" aria-hidden="true"></span><span><b class="us-cal-detail-date">${esc(dateLabel)}</b><small class="us-cal-detail-kind">${place}${esc(identityLabel)}</small></span></div>`];
  if (entry.description) rows.push(`<p class="us-cal-detail-note" translate="no">${esc(entry.description)}</p>`);
  const body = $('usCalendarDetailBody');
  if (body) body.innerHTML = rows.join('');
  // Due colori: the detail card carries whose it is (mine, theirs, ours).
  if (body?.dataset) body.dataset.owner = owner;
  const sheetEl = $('usCalendarDetailSheet');
  if (sheetEl?.dataset) sheetEl.dataset.owner = owner;
  const kicker = sheetEl?.querySelector?.('.us-cal-sheet-kicker');
  if (kicker) kicker.textContent = isShared ? 'Insieme' : 'Impegno';
  const canEdit = window.usProfile ? canEditEntry(entry, window.usProfile.id) : false;
  const actions = $('usCalendarDetailActions');
  if (actions) actions.hidden = !canEdit;
  ensureNoiEditorSheets();
  const sheet = $('usCalendarDetailSheet');
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
}
function closeCalendarDetailSheet() {
  const sheet = $('usCalendarDetailSheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  detailEntry = null;
}

async function deleteEntry() {
  if (!detailEntry || busy || !window.usProfile) return;
  if (!canEditEntry(detailEntry, window.usProfile.id)) return;
  if (!(await usConfirm({ kicker: 'CALENDARIO', title: 'Eliminare questo impegno?', body: 'Sparirà dal calendario di entrambi.', confirmLabel: 'Elimina', tone: 'danger' }))) return;
  if (!navigator.onLine) { toast('Sei offline. Riprova quando torni online.'); return; }
  busy = true;
  try {
    const { data, error } = await sb.from('calendar_entries').delete().eq('id', detailEntry.id).select('id');
    const outcome = classifyMutationResult({ data, error });
    // M7C — un evento che spiega ancora un'esperienza Da vivere è protetto
    // dalla FK (ON DELETE RESTRICT -> 23001; 23503 se la FK fosse NO ACTION):
    // lo diciamo, invece di un errore generico.
    if (outcome === 'error' && (error?.code === '23001' || error?.code === '23503')) { toast('È collegato a una vostra idea: resta nel calendario.'); return; }
    if (outcome === 'error') throw error;
    if (outcome === 'not_authorized') throw new Error('delete matched 0 rows');
    entries = entries.filter((e) => e.id !== detailEntry.id);
    closeCalendarDetailSheet();
    window.USNoiV2?.refresh?.();
    window.refreshOggiCalendarWidget?.();
    toast('Impegno eliminato');
    window.hydrateNoiIdeas?.();
  } catch (error) {
    console.warn('[US Calendar] delete', error);
    toast('Non riesco a eliminarlo. Riprova.');
  } finally {
    busy = false;
  }
}

function toggleAllDayFields() {
  const allDay = Boolean($('usCalendarAllDayInput')?.checked);
  const timeFields = $('usCalendarTimeFields');
  if (timeFields) timeFields.hidden = allDay;
}
function longDayLabel(dateISO) {
  const d = parseISODate(dateISO);
  return `${capitalize(WEEKDAY_LONG_IT[(d.getDay() + 6) % 7])} ${d.getDate()} ${MONTHS_IT[d.getMonth()].toLowerCase()}`;
}
// M9C — il giorno scelto e ciò che c'è già: ogni impegno resta toccabile e
// apre il suo dettaglio (mai una creazione al suo posto).
function renderFormDay(dateISO, mode) {
  const dayLine = $('usCalendarFormDay');
  if (dayLine) { dayLine.textContent = dateISO ? longDayLabel(dateISO) : ''; dayLine.hidden = mode === 'edit' || !dateISO; }
  const box = $('usCalendarFormDayEntries');
  if (!box) return;
  const list = mode === 'edit' || !dateISO ? [] : (buildDateIndex().get(dateISO) || []);
  box.hidden = !list.length;
  box.innerHTML = list.length
    ? `<span class="us-cal-form-day-kicker">Già quel giorno</span>${list.map((e) => `<button type="button" class="us-cal-form-day-entry" data-entry-id="${esc(e.id)}" aria-label="${esc(entryAriaLabel({ title: e.title, lane: entryLaneRole(e), displayName: profileById(e.owner_id)?.display_name, entry: e }))}">${ownerChip(ownerMarkOf(e))}<b translate="no">${esc(e.title)}</b><small>${esc(entryTimeLabel(e))}</small></button>`).join('')}`
    : '';
  box.querySelectorAll('[data-entry-id]').forEach((btn) => btn.addEventListener('click', () => { closeCalendarFormSheet(); openDetail(btn.dataset.entryId); }));
}
function setFormStatus(msg) { const el = $('usCalendarFormStatus'); if (el) el.textContent = msg; }

const CALENDAR_TITLE_PRESETS = Object.freeze([
  { id: 'usCalendarPresetWork', title: 'Lavoro' },
  { id: 'usCalendarPresetUniversity', title: 'Università' },
  { id: 'usCalendarPresetOut', title: 'Uscita' }
]);
function syncCalendarPresetState() {
  const title = $('usCalendarTitleInput')?.value.trim() || '';
  for (const preset of CALENDAR_TITLE_PRESETS) {
    const button = $(preset.id);
    if (button) button.setAttribute('aria-pressed', String(preset.title === title));
  }
}
function normalizeTimeField(id) {
  const input = $(id);
  if (!input) return '';
  const normalized = normalizeQuickTime(input.value);
  if (normalized) input.value = normalized;
  return normalized;
}
function fillDefaultEndFromStart() {
  const start = normalizeTimeField('usCalendarStartTimeInput');
  const end = $('usCalendarEndTimeInput');
  if (start && end && !String(end.value || '').trim()) end.value = addClockMinutes(start);
}

function setFormKind(kind) {
  calendarKind = kind === 'shared' ? 'shared' : 'personal';
  document.querySelectorAll?.('[data-us-calendar-kind]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.usCalendarKind === calendarKind)));
  const sheet = $('usCalendarFormSheet');
  if (sheet?.dataset) sheet.dataset.kind = calendarKind;
}
// "Data speciale" is an Eventi date: the form hands the day (and what was
// already typed) to Noi, which opens the Eventi editor in its place.
function chooseFormKind(kind) {
  if (editingFormEntry || pendingIdeaLink || busy) return;
  if (kind !== 'event') { setFormKind(kind); return; }
  const open = window.USNoiV2?.addSpecialDate;
  if (typeof open !== 'function') return;
  const date = formDateISO || selectedDate || todayISO();
  const title = $('usCalendarTitleInput')?.value.trim() || '';
  const allDay = Boolean($('usCalendarAllDayInput')?.checked);
  const time = allDay ? '' : normalizeQuickTime($('usCalendarStartTimeInput')?.value);
  closeCalendarFormSheet();
  open({ date, title, time });
}

function openForm(mode, entry, dateISO) {
  pendingIdeaLink = null;
  const context = $('usCalendarFormContext');
  if (context) context.hidden = true;
  const title = $('usCalendarFormTitle');
  if (title) title.textContent = mode === 'edit' ? 'Modifica impegno' : 'Nuovo impegno';
  setFormStatus('');
  const saveBtn = $('usCalendarFormSave');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = mode === 'edit' ? 'Salva modifiche' : 'Salva impegno'; }
  editingFormEntry = mode === 'edit' ? entry : null;
  // N1 — one "+" with three choices. A new entry starts as "Solo mio"; an
  // edited one keeps its own type (entry_type never changes on update).
  setFormKind(mode === 'edit' ? entry.entry_type : 'personal');
  const kindGroup = $('usCalendarKind');
  if (kindGroup) kindGroup.hidden = mode === 'edit';

  $('usCalendarTitleInput').value = entry?.title || '';
  syncCalendarPresetState();
  $('usCalendarAllDayInput').checked = Boolean(entry?.is_all_day);
  const startInput = $('usCalendarStartTimeInput');
  const endInput = $('usCalendarEndTimeInput');
  if (entry?.is_all_day) {
    formDateISO = entry.start_date;
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
  } else if (entry) {
    const start = new Date(entry.starts_at);
    const end = new Date(entry.ends_at);
    formDateISO = localDateFromInstant(entry.starts_at);
    if (startInput) startInput.value = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
    if (endInput) endInput.value = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  } else {
    formDateISO = dateISO || selectedDate || todayISO();
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
  }
  // Giorno resta solo in modifica, per spostare un impegno esistente: in
  // creazione la data è quella toccata sul calendario.
  const dateField = $('usCalendarDateField');
  if (dateField) dateField.hidden = mode !== 'edit';
  $('usCalendarDateInput').value = formDateISO;
  toggleAllDayFields();
  renderFormDay(formDateISO, mode);

  ensureNoiEditorSheets();
  const sheet = $('usCalendarFormSheet');
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('usCalendarTitleInput')?.focus({ preventScroll: true }), 80);
}
// M9C — nuova voce per una data (il "+" di Noi sul giorno selezionato; se si
// sta scegliendo il giorno per un'idea, l'impegno Nostro collegato).
function startCreateForDate(dateISO) {
  if (!dateISO) return;
  selectedDate = dateISO;
  if (pendingIdeaPick) { openIdeaForm(pendingIdeaPick, dateISO); return; }
  openForm('create', null, dateISO);
}
function closeCalendarFormSheet() {
  const sheet = $('usCalendarFormSheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  editingFormEntry = null;
  pendingIdeaLink = null;
}

async function saveEntry(event) {
  event.preventDefault();
  if (busy || !window.usProfile) return;
  if (!navigator.onLine) { toast('Sei offline. Riprova quando torni online.'); return; }
  const title = $('usCalendarTitleInput').value.trim();
  const date = editingFormEntry ? ($('usCalendarDateInput').value || formDateISO) : formDateISO;
  if (!title || !date) return;
  const allDay = $('usCalendarAllDayInput').checked;
  const startTime = allDay ? '' : normalizeTimeField('usCalendarStartTimeInput');
  const endTime = allDay ? '' : normalizeTimeField('usCalendarEndTimeInput');
  const timeError = quickEntryError({ allDay, startTime, endTime });
  if (timeError) {
    setFormStatus(timeError === 'start' ? 'Inserisci l\'ora di inizio.' : timeError === 'end' ? 'Inserisci l\'ora di fine.' : 'Inizio e fine non possono coincidere.');
    return;
  }
  const hidden = quickEntryHiddenFields({
    editingEntry: editingFormEntry,
    allDay,
    ideaNote: pendingIdeaLink ? pendingIdeaLink.note : null
  });
  const durationMinutes = allDay ? hidden.durationMinutes : durationMinutesFromTimes(startTime, endTime);

  const payload = buildEntryPayload({
    title,
    description: hidden.description,
    location: hidden.location,
    allDay,
    date,
    time: startTime,
    durationMinutes,
    spanDays: hidden.spanDays
  });

  busy = true;
  const saveBtn = $('usCalendarFormSave');
  if (saveBtn) saveBtn.disabled = true;
  setFormStatus('Salvo…');
  try {
    let savedId = null; // M6D — id della riga creata (create-only)
    if (editingFormEntry) {
      const { data, error } = await sb.from('calendar_entries').update(payload).eq('id', editingFormEntry.id).select('id');
      const outcome = classifyMutationResult({ data, error });
      if (outcome === 'error') throw error;
      if (outcome === 'not_authorized') throw new Error('update matched 0 rows');
    } else {
      const ideaLink = pendingIdeaLink;
      const kind = ideaLink ? 'shared' : calendarKind;
      const result = await sb.from('calendar_entries').insert(withCreateAuthority(payload, kind, window.usProfile)).select('id');
      if (result.error) throw result.error;
      savedId = Array.isArray(result.data) && result.data[0]?.id ? result.data[0].id : null;
      if (ideaLink) {
        const outcome = await linkCreatedEntryToIdea(ideaLink, savedId);
        if (!outcome.ok) {
          setFormStatus(outcome.reason === 'stale' ? 'Questa idea è già cambiata: niente di nuovo in calendario.' : 'Non riesco a metterla in calendario. Riprova.');
          return;
        }
      }
    }
    const wasEditing = Boolean(editingFormEntry);
    const linkedIdea = !wasEditing && Boolean(pendingIdeaLink);
    // M9C — il form rapido non configura reminder: quelli esistenti restano
    // esattamente come sono (nessuna sync che li cancelli).
    if (linkedIdea) clearIdeaPick();
    closeCalendarFormSheet();
    window.USNoiV2?.refresh?.();
    window.refreshOggiCalendarWidget?.();
    toast(wasEditing ? 'Impegno aggiornato' : (linkedIdea ? 'In calendario' : 'Impegno aggiunto'));
  } catch (error) {
    console.warn('[US Calendar] save', error);
    setFormStatus('Non riesco a salvarlo. Riprova.');
  } finally {
    busy = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

// Noi is the only visible calendar. This entry point stays for notifications,
// the Oggi calendar widget and external links: it opens Noi on that day.
function openCalendarSurface(targetDateISO, options = {}) {
  window.USNoiV2?.openCalendar?.({ date: targetDateISO, mode: options?.mode === 'week' ? 'week' : 'calendar' });
}

$('usCalendarDetailClose')?.addEventListener('click', closeCalendarDetailSheet);
$('usCalendarDetailBackdrop')?.addEventListener('click', closeCalendarDetailSheet);
$('usCalendarDetailEdit')?.addEventListener('click', () => { if (detailEntry) openForm('edit', detailEntry); });
$('usCalendarDetailDelete')?.addEventListener('click', deleteEntry);
$('usCalendarFormClose')?.addEventListener('click', closeCalendarFormSheet);
$('usCalendarFormBackdrop')?.addEventListener('click', closeCalendarFormSheet);
$('usCalendarAllDayInput')?.addEventListener('change', toggleAllDayFields);
for (const preset of CALENDAR_TITLE_PRESETS) {
  $(preset.id)?.addEventListener('click', () => {
    const input = $('usCalendarTitleInput');
    if (!input) return;
    input.value = preset.title;
    syncCalendarPresetState();
    input.focus({ preventScroll: true });
  });
}
$('usCalendarTitleInput')?.addEventListener('input', syncCalendarPresetState);
$('usCalendarStartTimeInput')?.addEventListener('blur', fillDefaultEndFromStart);
$('usCalendarEndTimeInput')?.addEventListener('blur', () => normalizeTimeField('usCalendarEndTimeInput'));
document.querySelectorAll?.('[data-us-calendar-kind]').forEach((btn) => btn.addEventListener('click', () => chooseFormKind(btn.dataset.usCalendarKind)));
$('usCalendarForm')?.addEventListener('submit', saveEntry);

// ===== M7C — Da vivere -> Calendar =====
// Il Calendario resta l'unica autorità di data/ora/durata/reminder: Da vivere
// non ha un suo date picker, apre QUESTO form (sempre shared) e riceve solo
// l'id dell'evento creato. Il collegamento su bucket_items lo scrive Da vivere
// (window.UsDaVivere.linkCalendarEntry): nessuno dei due domini scrive
// le tabelle dell'altro.
async function linkCreatedEntryToIdea(ideaLink, entryId) {
  const sameIdentity = window.usProfile?.id === ideaLink.userId && window.usProfile?.couple_id === ideaLink.coupleId;
  const linker = window.UsDaVivere?.linkCalendarEntry;
  let outcome = { ok: false, reason: 'error' };
  if (entryId && sameIdentity && typeof linker === 'function') {
    try { outcome = await linker(ideaLink.bucketItemId, entryId); } catch (error) { console.warn('[US Calendar] link idea', error); }
  }
  if (outcome?.ok) return { ok: true };
  // Compensazione: l'evento appena creato esiste solo per questa idea. Se il
  // collegamento non è avvenuto (idea già programmata dall'altra persona,
  // archiviata, rete) lo rimuoviamo, così il Calendario non tiene un
  // duplicato scollegato.
  if (entryId) {
    const { error } = await sb.from('calendar_entries').delete().eq('id', entryId).select('id');
    if (error) console.warn('[US Calendar] link rollback', error);
  }
  return { ok: false, reason: outcome?.reason || 'error' };
}

async function openCalendarForIdea(idea) {
  if (!idea?.id || !window.usProfile) return;
  const identity = { userId: window.usProfile.id, coupleId: window.usProfile.couple_id };
  // M9C — niente date picker: il giorno lo sceglie il calendario di Noi.
  if (!window.USNoiV2?.beginIdeaPick) return;
  pendingIdeaPick = { bucketItemId: idea.id, title: idea.title || '', note: idea.note || null, ...identity };
  window.USNoiV2.beginIdeaPick({ title: idea.title || '' });
}
function clearIdeaPick() {
  pendingIdeaPick = null;
  window.USNoiV2?.clearIdeaPick?.();
}
function openIdeaForm(pick, dateISO) {
  if (window.usProfile?.id !== pick.userId || window.usProfile?.couple_id !== pick.coupleId) { clearIdeaPick(); return; }
  openForm('create', null, dateISO);
  pendingIdeaLink = { bucketItemId: pick.bucketItemId, userId: pick.userId, coupleId: pick.coupleId, note: pick.note };
  setFormKind('shared');
  const kindGroup = $('usCalendarKind');
  if (kindGroup) kindGroup.hidden = true;
  const title = $('usCalendarFormTitle');
  if (title) title.textContent = 'Metti in calendario';
  const context = $('usCalendarFormContext');
  if (context) context.hidden = false;
  const saveBtn = $('usCalendarFormSave');
  if (saveBtn) saveBtn.textContent = 'Metti in calendario';
  $('usCalendarTitleInput').value = pick.title;
  syncCalendarPresetState();
}

// Letture minime per mostrare "In calendario · quando" in Da vivere, sempre
// dalla fonte (calendar_entries), mai copiate su bucket_items.
async function getCalendarEntriesByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length || !window.usProfile) return new Map();
  const { data, error } = await sb.from('calendar_entries')
    .select('id,couple_id,entry_type,owner_id,created_by,title,description,location,visibility,is_all_day,starts_at,ends_at,start_date,end_date')
    .eq('couple_id', window.usProfile.couple_id)
    .in('id', unique);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}

function calendarWhenLabel(entry) {
  if (!entry) return '';
  const dateISO = entry.is_all_day ? entry.start_date : localDateFromInstant(entry.starts_at);
  if (!dateISO) return '';
  const d = parseISODate(dateISO);
  const day = `${WEEKDAYS_IT[(d.getDay() + 6) % 7].toLowerCase()} ${d.getDate()} ${MONTHS_IT[d.getMonth()].slice(0, 3).toLowerCase()}`;
  if (entry.is_all_day) return day;
  const s = new Date(entry.starts_at);
  return `${day}, ${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
}

// US V3 — Noi's + opens the existing create form for the chosen day.
async function prepareNoiEntryDate(dateISO){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO||''))||!window.usProfile)return false;
  const profile=window.usProfile,coupleId=profile.couple_id,token=++noiEditorReadSeq;
  const same=()=>token===noiEditorReadSeq&&window.usProfile===profile&&window.usProfile?.couple_id===coupleId;
  try{
    const [dayEntries]=await Promise.all([
      fetchEntriesForRange(coupleId,dateISO,shiftISODate(dateISO,1)),
      loadProfiles()
    ]);
    if(!same())return false;
    entries=dayEntries;
    selectedDate=dateISO;
    ensureNoiEditorSheets();
    return true;
  }catch(error){console.warn('[US Calendar] prepare editor',error);window.toast?.('Calendario non disponibile. Riprova.');return false;}
}
async function createCalendarEntryForDate(dateISO) {
  if (!dateISO || !window.usProfile) return;
  // The plus is instant: render the existing editor first, then hydrate the
  // day's already-saved commitments without ever blocking the user's tap.
  // Noi stays as it is (month or "La nostra settimana") under the form.
  const identity=window.usProfile;
  ensureNoiEditorSheets();
  entries=[];
  selectedDate=dateISO;
  startCreateForDate(dateISO);
  void prepareNoiEntryDate(dateISO).then(ready=>{
    if(!ready||window.usProfile!==identity||formDateISO!==dateISO||editingFormEntry||!$('usCalendarFormSheet')?.classList.contains('open'))return;
    renderFormDay(dateISO,'create');
  });
}

async function createCalendarEntryForIdeaDate(dateISO){
  const pick=pendingIdeaPick;
  if(!pick||!dateISO||window.usProfile?.id!==pick.userId||window.usProfile?.couple_id!==pick.coupleId)return;
  if(!await prepareNoiEntryDate(dateISO))return false;
  openIdeaForm(pick,dateISO);
  clearIdeaPick();
  return true;
}
// From Noi's own calendar the detail opens in place (month or week stays);
// from anywhere else Noi first lands on that day.
async function openCalendarEntry(entryId, { inPlace = false } = {}) {
  if (!entryId || !window.usProfile) return;
  ++noiEditorReadSeq;
  const map = await getCalendarEntriesByIds([entryId]).catch((error) => { console.warn('[US Calendar] open entry', error); return new Map(); });
  const entry = map.get(entryId);
  if (!entry) { toast('Non trovo più questo evento nel calendario.'); return; }
  const dateISO = entry.is_all_day ? entry.start_date : localDateFromInstant(entry.starts_at);
  const profile=window.usProfile;
  if(!inPlace)window.USNoiV2?.openCalendar?.({date:dateISO,mode:'calendar'});
  await loadProfiles();
  if(profile!==window.usProfile)return;
  entries=[entry];
  selectedDate=dateISO;
  openDetail(entryId);
}

window.UsCalendarLinks = Object.freeze({ openForIdea: openCalendarForIdea, createForIdeaDate: createCalendarEntryForIdeaDate, cancelIdeaPick: clearIdeaPick, openEntry: openCalendarEntry, createForDate: createCalendarEntryForDate, getEntriesByIds: getCalendarEntriesByIds, whenLabel: calendarWhenLabel });
window.USNoiCalendarRead = Object.freeze({readMonth:readNoiMonth,freeEvenings:noiFreeEvenings});
window.openCalendarSurface = openCalendarSurface;
window.closeCalendarDetailSheet = closeCalendarDetailSheet;
window.closeCalendarFormSheet = closeCalendarFormSheet;
window.addEventListener?.('us-identity-change', event=>{
  ++noiEditorReadSeq;
  // Close the editor sheets on account/couple switch before any stale user
  // can act, and forget the previous couple's people and entries.
  closeCalendarDetailSheet();
  closeCalendarFormSheet();
  clearIdeaPick();
  if(!event.detail?.identityKey){profiles=[];profilesById.clear();entries=[];selectedDate=null;}
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureNoiEditorSheets,{once:true});else ensureNoiEditorSheets();
console.info('[US Calendar] calendario condiviso attivo');
})();
