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

// Ownership must be readable without colour. Personal markers come from the
// real profile name; shared entries use the couple mark. Legacy role tokens
// decide lanes only and never leak into the label shown to people.
function ownerMarkFor(lane, displayName) {
  if (lane === 'shared') return '♡';
  return String(displayName || '').trim().charAt(0).toLocaleUpperCase('it-IT') || '·';
}
function ownerNameFor(lane, displayName) {
  return lane === 'shared' ? 'Insieme' : (displayName || 'La tua persona');
}
function spokenTime(iso) {
  const d = new Date(iso);
  return d.getMinutes() === 0 ? String(d.getHours()) : `${d.getHours()}:${pad2(d.getMinutes())}`;
}
// Accessibility uses the real profile display name, never a legacy role token
// or a colour-only distinction.
function entryAriaLabel({ title, lane, displayName, entry }) {
  const when = entry.is_all_day ? 'tutto il giorno' : `ore ${spokenTime(entry.starts_at)}`;
  return `${title}, ${ownerNameFor(lane, displayName)}, ${when}`;
}
// Month cell: distinct owners only. Personal initials sort deterministically;
// the shared-couple mark stays last.
function monthCellMarks(marks, maxChips = 3) {
  const distinct = [...new Set(marks)].sort((a, b) => {
    if (a === '♡') return 1;
    if (b === '♡') return -1;
    return String(a).localeCompare(String(b), 'it');
  });
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
// Notification copy always uses the requester's real profile display name.
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
  monthGridRange, windowForGrid, weekRangeFor, weekWindowFor, mondayOfISO, partitionDayBusy, tempoWindowLabel,
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

let viewYear = null;
let viewMonth = null;
let selectedDate = null;
let entries = [];
let profiles = [];
let profilesById = new Map();
let loadToken = 0;
let loading = false;
let lastError = false;
let calendarKind = 'personal';
let calendarMode = 'month'; // 'month' | 'week'
let weekStartISO = null;    // Monday of the visible week
let editingFormEntry = null;
// M6D — righe calendar_reminders della coppia: lette per il dettaglio. M9C: il
// form rapido non le configura più e non le tocca mai (restano come sono).
let editingEntryReminders = [];
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

function ensureInitialMonth() {
  if (viewYear != null) return;
  const n = new Date();
  viewYear = n.getFullYear();
  viewMonth = n.getMonth();
  weekStartISO = mondayOfISO(todayISO());
}
// The window the current view needs — one shared contract for month and week.
function visibleWindow() {
  ensureInitialMonth();
  if (calendarMode === 'week') return weekWindowFor(weekStartISO);
  const { gridStart, gridEnd } = monthGridRange(viewYear, viewMonth);
  return windowForGrid(gridStart, gridEnd);
}
function sortedProfiles() { return [...profiles].sort((a, b) => roleRank(a.role) - roleRank(b.role)); }
function profileById(id) { return profilesById.get(id) || null; }
function profileName(id) { return profileById(id)?.display_name || 'La tua persona'; }
function profileRole(id) { return profileById(id)?.role || ''; }
function entryLaneRole(entry) { return entryLaneRoleFor(entry, profileRole(entry.owner_id)); }
function laneClass(role) { return role === 'shared' ? 'shared' : (role === ROLE_ORDER[0] ? 'a' : (role === ROLE_ORDER[1] ? 'b' : 'other')); }

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
  if (!window.usProfile) return;
  const { data, error } = await sb.from('profiles').select('id,display_name,role').eq('couple_id', window.usProfile.couple_id);
  if (error) { console.warn('[US Calendar] profiles', error); return; }
  profiles = data || [];
  profilesById = new Map(profiles.map((p) => [p.id, p]));
}

async function loadEntries() {
  if (!window.usProfile) return;
  const win = visibleWindow();
  const token = ++loadToken;
  loading = true;
  renderLoadingState();
  try {
    const filter = UsCalendarDomain.buildRangeOverlapFilter(win);
    const { data, error } = await sb.from('calendar_entries')
      .select('id,couple_id,entry_type,owner_id,created_by,title,description,location,is_all_day,starts_at,ends_at,start_date,end_date,visibility')
      .eq('couple_id', window.usProfile.couple_id)
      .or(filter);
    if (error) throw error;
    if (token !== loadToken) return;
    entries = UsCalendarDomain.filterEntriesInWindow(data || [], win);
    lastError = false;
  } catch (error) {
    console.warn('[US Calendar] load', error);
    if (token !== loadToken) return;
    lastError = true;
  } finally {
    if (token === loadToken) { loading = false; renderCalendar(); }
  }
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

// Weekly board for Noi. This is a compact read-only projection of the existing
// Calendar authority: same RLS-scoped calendar_entries source, no new storage.
const US_NOI_WEEK_BOARD_LIMIT = 3;
function noiBoardClock(entry) {
  if (entry.is_all_day) return 'Tutto il giorno';
  const fmt = (iso) => { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  return `${fmt(entry.starts_at)}–${fmt(entry.ends_at)}`;
}
function noiBoardDayLabel(dateISO, today) {
  if (dateISO === today) return 'OGGI';
  if (dateISO === shiftISODate(today, 1)) return 'DOMANI';
  const d = parseISODate(dateISO);
  return `${WEEKDAYS_IT[(d.getDay() + 6) % 7]} ${d.getDate()}`;
}
async function getNoiWeekBoardSource() {
  const profile = window.usProfile;
  if (!profile) return null;
  const coupleId = profile.couple_id;
  const sameIdentity = () => window.usProfile === profile && window.usProfile?.couple_id === coupleId;
  const today = todayISO();
  const end = shiftISODate(today, 7);
  const [{ data: profileRows, error: profilesError }, weekEntries] = await Promise.all([
    sb.from('profiles').select('id,display_name').eq('couple_id', coupleId),
    fetchEntriesForRange(coupleId, today, end)
  ]);
  if (profilesError) throw profilesError;
  if (!sameIdentity()) return null;
  const names = new Map((profileRows || []).map((p) => [p.id, p.display_name]));
  const rows = [];
  for (const entry of weekEntries || []) {
    const dateISO = entryDatesTouched(entry).find((date) => date >= today && date < end);
    if (!dateISO) continue;
    rows.push({
      id: entry.id,
      dateISO,
      day: noiBoardDayLabel(dateISO, today),
      owner: entry.entry_type === 'shared' ? 'Insieme' : (names.get(entry.owner_id) || 'Impegno'),
      title: entry.title || 'Impegno',
      time: noiBoardClock(entry),
      shared: entry.entry_type === 'shared'
    });
  }
  rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO)
    || String((weekEntries || []).find((e) => e.id === a.id)?.starts_at || '').localeCompare(String((weekEntries || []).find((e) => e.id === b.id)?.starts_at || ''))
    || String(a.id).localeCompare(String(b.id)));
  return { today, rows: rows.slice(0, US_NOI_WEEK_BOARD_LIMIT), total: rows.length };
}
function renderNoiWeekBoard(model) {
  const body = $('noiWeekBoardBody');
  const shell = $('noiWeekBoardOpen');
  if (!body || !shell) return;
  if (!model) {
    body.innerHTML = '<span class="noi-week-board-empty"><b>Calendario non disponibile</b><small>Aprilo per riprovare.</small></span>';
    return;
  }
  shell.dataset.noiWeekDate = model.rows[0]?.dateISO || model.today;
  if (!model.rows.length) {
    body.innerHTML = '<span class="noi-week-board-empty"><b>Settimana libera</b><small>Nessun impegno nei prossimi 7 giorni.</small></span>';
    return;
  }
  const visibleRows = window.innerHeight <= 700 ? model.rows.slice(0, 2) : model.rows;
  body.innerHTML = visibleRows.map((row) => `<span class="noi-week-board-row" data-shared="${row.shared ? 'true' : 'false'}"><span class="noi-week-board-day">${esc(row.day)}</span><span class="noi-week-board-copy"><b>${esc(row.owner)} · ${esc(row.title)}</b><small>${esc(row.time)}</small></span></span>`).join('')
    + (model.total > visibleRows.length ? `<span class="noi-week-board-more">+${model.total - visibleRows.length} altri impegni</span>` : '');
}
let noiWeekBoardRefreshId = 0;
let noiWeekBoardIdentityKey = '';
async function refreshNoiWeekBoard() {
  const refreshId = ++noiWeekBoardRefreshId;
  const body = $('noiWeekBoardBody');
  const shell = $('noiWeekBoardOpen');
  if (!window.usProfile) {
    noiWeekBoardIdentityKey = '';
    if (body) body.innerHTML = '';
    shell?.removeAttribute('data-noi-week-date');
    return;
  }
  const identityKey = `${window.usProfile.id}:${window.usProfile.couple_id}`;
  const identityChanged = Boolean(noiWeekBoardIdentityKey && noiWeekBoardIdentityKey !== identityKey);
  noiWeekBoardIdentityKey = identityKey;
  // Re-entering Noi must not collapse Lavagna back to a loading placeholder:
  // keep the last resolved board visible while the canonical calendar refreshes.
  // Only a real identity change clears stale couple data.
  if (identityChanged && body) {
    body.innerHTML = '<span class="noi-week-board-loading">Carico gli impegni…</span>';
    shell?.removeAttribute('data-noi-week-date');
  }
  try {
    const model = await getNoiWeekBoardSource();
    if (refreshId !== noiWeekBoardRefreshId) return;
    renderNoiWeekBoard(model);
  } catch (error) {
    console.warn('[US Noi] week board', error);
    if (refreshId === noiWeekBoardRefreshId && identityChanged) renderNoiWeekBoard(null);
  }
}
$('noiWeekBoardOpen')?.addEventListener('click', () => {
  const date = $('noiWeekBoardOpen')?.dataset.noiWeekDate || todayISO();
  window.openCalendarSurface?.(date);
});
window.getNoiWeekBoardSource = getNoiWeekBoardSource;
window.refreshNoiWeekBoard = refreshNoiWeekBoard;
window.UsNoiWeekBoard = Object.freeze({ refresh: refreshNoiWeekBoard, render: renderNoiWeekBoard });

function ownerMarkOf(entry) { return ownerMarkFor(entryLaneRole(entry), profileById(entry.owner_id)?.display_name); }
function ownerChip(mark) {
  return `<span class="us-cal-chip${mark === '♡' ? ' us-cal-chip--shared' : ''}" aria-hidden="true">${esc(mark)}</span>`;
}

function renderDayCell(dateObj, dateISO, inMonth, dayEntries) {
  const isToday = dateISO === todayISO();
  const isSelected = dateISO === selectedDate;
  const { chips, more } = monthCellMarks(dayEntries.map(ownerMarkOf));
  const markers = chips.map(ownerChip).join('') + (more > 0 ? `<span class="us-cal-chip-more" aria-hidden="true">+${more}</span>` : '');
  const classes = ['us-cal-day'];
  if (!inMonth) classes.push('is-outside');
  if (isToday) classes.push('is-today');
  if (isSelected) classes.push('is-selected');
  const count = dayEntries.length;
  const owners = [...new Set(dayEntries.map((e) => ownerNameFor(entryLaneRole(e), profileById(e.owner_id)?.display_name)))];
  const label = `${longDayLabel(dateISO)}${count ? ` · ${count === 1 ? '1 impegno' : `${count} impegni`}: ${owners.join(', ')}` : ' · nessun impegno'}`;
  return `<button type="button" class="${classes.join(' ')}" data-date="${dateISO}" aria-label="${esc(label)}" aria-pressed="${isSelected}"${isToday ? ' aria-current="date"' : ''}>
    <span class="us-cal-day-num">${dateObj.getDate()}</span>
    <span class="us-cal-day-markers">${markers}</span>
  </button>`;
}

// M10.1 — ONE shared month at every width. Profile initials and the shared
// couple mark identify ownership; there is no per-partner month or duplicate event.
function renderMonthGrid(dateIndex) {
  const container = $('usCalendarGrid');
  if (!container) return;
  const { gridStart } = monthGridRange(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const dateISO = isoDate(d.getFullYear(), d.getMonth(), d.getDate());
    const inMonth = d.getMonth() === viewMonth && d.getFullYear() === viewYear;
    cells.push(renderDayCell(d, dateISO, inMonth, dateIndex.get(dateISO) || []));
  }
  const weekdayRow = WEEKDAYS_IT.map((w) => `<div class="us-cal-weekday">${w}</div>`).join('');
  container.innerHTML = `<div class="us-cal-weekday-row">${weekdayRow}</div><div class="us-cal-day-grid">${cells.join('')}</div>`;
  // M10.1C — toccare un giorno lo SELEZIONA: il dettaglio sotto la griglia
  // mostra gli impegni reali; creare è "Aggiungi impegno" (o, scegliendo il
  // giorno per un'idea Da vivere, il form collegato).
  container.querySelectorAll('.us-cal-day[data-date]').forEach((btn) => btn.addEventListener('click', () => selectDay(btn.dataset.date)));
}

function renderLegend() {
  const legend = $('usCalendarLegend');
  if (!legend) return;
  const ordered = sortedProfiles();
  const item = (mark, name) => `<span class="us-cal-legend-item">${ownerChip(mark)}${esc(name)}</span>`;
  legend.innerHTML = [
    ...ordered.map((p) => item(ownerMarkFor(p.role, p.display_name), p.display_name)),
    item('♡', 'Insieme')
  ].join('');
}

function renderLoadingState() { $('usCalendarBody')?.classList.toggle('is-loading', loading); }
function renderEmptyState() {
  const empty = $('usCalendarEmpty');
  if (!empty) return;
  // In week mode every day card carries its own state, so the global empty
  // panel belongs to the month view only.
  empty.hidden = !(calendarMode === 'month' && entries.length === 0 && !loading && !lastError);
}
function renderErrorState() {
  const status = $('usCalendarStatus');
  if (!status) return;
  if (lastError) {
    status.hidden = false;
    status.innerHTML = 'Calendario non disponibile <button type="button" id="usCalendarRetry">Riprova</button>';
    $('usCalendarRetry')?.addEventListener('click', loadEntries);
  } else {
    status.hidden = true;
    status.innerHTML = '';
  }
}

// Free-together windows for one day, straight through the existing M6A
// algorithm (computeFreeTogether) — merge, complement and the 30-minute
// threshold all live in calendar-domain.js and are never duplicated here.
function tempoWindowsForDay(dateISO) {
  const win = windowForGrid(parseISODate(dateISO), parseISODate(shiftISODate(dateISO, 1)));
  const partition = partitionDayBusy(entries, dateISO, entryLaneRole);
  const windows = UsCalendarDomain.computeFreeTogether({
    windowStart: win.windowStartAt,
    windowEnd: win.windowEndAt,
    personABusy: partition.personABusy,
    personBBusy: partition.personBBusy,
    sharedEvents: partition.sharedEvents,
    minDurationMinutes: 30
  });
  return { windows, dayStartISO: win.windowStartDate, dayEndISO: win.windowEndDate };
}

// "Tempo insieme" for one day — the same block in the week list and under the
// selected day (the free windows always come from computeFreeTogether).
function renderTempoBlock(dateISO) {
  const { windows, dayStartISO, dayEndISO } = tempoWindowsForDay(dateISO);
  const tempoBody = windows.length
    ? `<ul>${windows.map((w) => `<li>${esc(tempoWindowLabel(w.start, w.end, dayStartISO, dayEndISO))}</li>`).join('')}</ul>`
    : '<p>Nessun momento libero insieme, oggi.</p>';
  return `<div class="us-cal-tempo${windows.length ? '' : ' is-empty'}">
      <span class="us-cal-tempo-heart" aria-hidden="true">♡</span>
      <div class="us-cal-tempo-copy"><b>Tempo insieme</b>${tempoBody}</div>
    </div>`;
}

function renderWeekDay(dateISO, dayEntries, ordered) {
  const d = parseISODate(dateISO);
  const weekday = capitalize(WEEKDAY_LONG_IT[(d.getDay() + 6) % 7]);
  const isToday = dateISO === todayISO();
  const tempo = renderTempoBlock(dateISO);
  const body = dayEntries.length
    ? [
        ...ordered.map((p) => renderDaySection(p.display_name, dayEntries.filter((e) => entryLaneRole(e) === p.role), laneClass(p.role))),
        renderDaySection('Insieme', dayEntries.filter((e) => entryLaneRole(e) === 'shared'), 'shared')
      ].join('')
    : '<p class="us-cal-day-empty">Niente in programma.</p>';
  return `<article class="us-cal-week-day${isToday ? ' is-today' : ''}" data-date="${dateISO}">
    <button type="button" class="us-cal-week-day-head" data-date="${dateISO}" aria-label="${esc(`${weekday} ${d.getDate()} ${MONTHS_IT[d.getMonth()].toLowerCase()} · aggiungi`)}">
      <span class="us-cal-week-day-name">${esc(weekday)}</span><span class="us-cal-week-day-num">${d.getDate()}</span>
    </button>
    <div class="us-cal-week-day-body">${body}</div>
    ${tempo}
  </article>`;
}

// One vertical day-list for every width — no tiny side-by-side timelines.
// Partner lanes reuse the exact day-sheet sections, so the week view reads
// like seven day-sheets stacked.
function renderWeekList() {
  const container = $('usCalendarWeekList');
  if (!container) return;
  const dateIndex = buildDateIndex();
  const ordered = sortedProfiles();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dateISO = shiftISODate(weekStartISO, i);
    days.push(renderWeekDay(dateISO, dateIndex.get(dateISO) || [], ordered));
  }
  container.innerHTML = days.join('');
  container.querySelectorAll('[data-entry-id]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.entryId)));
  // M9C — un impegno apre il suo dettaglio; il resto del giorno crea per quella data.
  container.querySelectorAll('.us-cal-week-day[data-date]').forEach((day) => day.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-entry-id]')) return;
    startCreateForDate(day.dataset.date);
  }));
}

function renderCalendar() {
  if (!$('usCalendarOverlay')?.classList.contains('open')) return;
  ensureInitialMonth();
  const isWeek = calendarMode === 'week';
  $('usCalendarBody')?.classList.toggle('is-week-mode', isWeek);
  const label = $('usCalendarMonthLabel');
  if (label) {
    label.textContent = isWeek
      ? formatDateRangeLabel(weekStartISO, shiftISODate(weekStartISO, 6))
      : `${MONTHS_IT[viewMonth]} ${viewYear}`;
  }
  $('usCalendarPrev')?.setAttribute('aria-label', isWeek ? 'Settimana precedente' : 'Mese precedente');
  $('usCalendarNext')?.setAttribute('aria-label', isWeek ? 'Settimana successiva' : 'Mese successivo');
  if (isWeek) {
    renderWeekList();
  } else {
    ensureSelectedDate();
    const dateIndex = buildDateIndex();
    renderMonthGrid(dateIndex);
  }
  renderSelectedDay();
  renderLegend();
  renderEmptyState();
  renderErrorState();
  renderLoadingState();
}

function entryTimeLabel(entry) {
  if (entry.is_all_day) return 'Tutto il giorno';
  const s = new Date(entry.starts_at);
  const e = new Date(entry.ends_at);
  const fmt = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${fmt(s)} → ${fmt(e)}`;
}

// One event row for every surface (selected day, week list): ownership marker,
// time, title and place. The whole row opens the existing detail/edit flow.
function renderEventRow(e) {
  const lane = entryLaneRole(e);
  const ownerName = profileById(e.owner_id)?.display_name;
  const mark = ownerMarkFor(lane, ownerName);
  const label = entryAriaLabel({ title: e.title, lane, displayName: ownerName, entry: e });
  const place = e.location ? `<small class="us-cal-event-place">${esc(e.location)}</small>` : '';
  return `<button type="button" class="us-cal-event" data-entry-id="${esc(e.id)}" data-owner="${esc(mark)}" aria-label="${esc(label)}"><span class="us-cal-owner${mark === '♡' ? ' us-cal-owner--shared' : ''}" aria-hidden="true">${esc(mark)}</span><span class="us-cal-event-copy"><span class="us-cal-event-time">${esc(entryTimeLabel(e))}</span><b class="us-cal-event-title">${esc(e.title)}</b>${place}</span></button>`;
}

function renderDaySection(label, list, cls) {
  const items = list.length ? sortDayEntries(list).map(renderEventRow).join('') : '<p class="us-cal-day-empty">Niente qui.</p>';
  return `<section class="us-cal-day-section" data-lane="${esc(cls)}"><h4>${esc(label)}</h4>${items}</section>`;
}

// Selected-day detail, under the month grid: only lanes that really have
// something, grouped by person (F / B / Insieme), then "Tempo insieme".
function renderSelectedDay() {
  const panel = $('usCalendarDayDetail');
  if (!panel) return;
  const show = calendarMode === 'month' && Boolean(selectedDate);
  panel.hidden = !show;
  if (!show) return;
  const dayEntries = buildDateIndex().get(selectedDate) || [];
  const title = $('usCalendarDayDetailTitle');
  if (title) title.textContent = longDayLabel(selectedDate);
  const count = $('usCalendarDayDetailCount');
  if (count) count.textContent = dayEntries.length ? (dayEntries.length === 1 ? '1 impegno' : `${dayEntries.length} impegni`) : '';
  const groups = groupDayEntries(dayEntries, entryLaneRole);
  const sections = groups.map(({ lane, list }) => {
    const name = ownerNameFor(lane, profileById(list[0].owner_id)?.display_name);
    const head = `<h4><span class="us-cal-owner us-cal-owner--sm${lane === 'shared' ? ' us-cal-owner--shared' : ''}" aria-hidden="true">${esc(ownerMarkFor(lane, name))}</span>${esc(name)}</h4>`;
    return `<section class="us-cal-day-section" data-lane="${esc(laneClass(lane))}">${head}${list.map(renderEventRow).join('')}</section>`;
  });
  const container = $('usCalendarDaySections');
  if (container) {
    container.innerHTML = sections.length ? sections.join('') : '<p class="us-cal-day-empty">Niente in programma.</p>';
    container.querySelectorAll('[data-entry-id]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.entryId)));
  }
  const tempo = $('usCalendarDayTempo');
  if (tempo) tempo.innerHTML = renderTempoBlock(selectedDate);
}

// Month mode always has a selected day inside the visible grid: today when it
// is visible, otherwise the first of the viewed month.
function ensureSelectedDate() {
  ensureInitialMonth();
  const { gridStart, gridEnd } = monthGridRange(viewYear, viewMonth);
  const lo = isoDate(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate());
  const hi = isoDate(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate());
  if (selectedDate && selectedDate >= lo && selectedDate < hi) return;
  const today = todayISO();
  selectedDate = today >= lo && today < hi && today.slice(0, 7) === isoDate(viewYear, viewMonth, 1).slice(0, 7) ? today : isoDate(viewYear, viewMonth, 1);
}

// Tocco su un giorno: lo seleziona e porta il dettaglio in vista. Solo quando
// si sta scegliendo il giorno per un'idea Da vivere apre subito il form
// collegato (evento Insieme).
function selectDay(dateISO) {
  if (!dateISO) return;
  selectedDate = dateISO;
  renderCalendar();
  if (pendingIdeaPick) { openIdeaForm(pendingIdeaPick, dateISO); return; }
  const panel = $('usCalendarDayDetail');
  if (panel && typeof panel.scrollIntoView === 'function') {
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  }
}

function openDetail(entryId) {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;
  detailEntry = entry;
  const title = $('usCalendarDetailTitle');
  if (title) title.textContent = entry.title;
  const isShared = entry.entry_type === 'shared';
  const identityLabel = isShared ? `Insieme · creato da ${profileName(entry.created_by)}` : `Personale di ${profileName(entry.owner_id)}`;
  const dateLabel = entry.is_all_day
    ? formatDateRangeLabel(entry.start_date, entry.end_date)
    : `${formatDateRangeLabel(localDateFromInstant(entry.starts_at), localDateFromInstant(entry.ends_at))} · ${entryTimeLabel(entry)}`;
  const rows = [`<p class="us-cal-detail-kind">${esc(identityLabel)}</p>`, `<p class="us-cal-detail-date">${esc(dateLabel)}</p>`];
  if (entry.location) rows.push(`<p class="us-cal-detail-location">${esc(entry.location)}</p>`);
  if (entry.description) rows.push(`<p class="us-cal-detail-note">${esc(entry.description)}</p>`);
  const body = $('usCalendarDetailBody');
  if (body) body.innerHTML = rows.join('');
  renderDetailReminders(entry);
  const canEdit = window.usProfile ? canEditEntry(entry, window.usProfile.id) : false;
  const actions = $('usCalendarDetailActions');
  if (actions) actions.hidden = !canEdit;
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
    if (outcome === 'error' && (error?.code === '23001' || error?.code === '23503')) { toast('È collegato a Da vivere: resta nel calendario.'); return; }
    if (outcome === 'error') throw error;
    if (outcome === 'not_authorized') throw new Error('delete matched 0 rows');
    entries = entries.filter((e) => e.id !== detailEntry.id);
    editingEntryReminders = editingEntryReminders.filter((r) => r.entry_id !== detailEntry.id);
    closeCalendarDetailSheet();
    renderCalendar();
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
    ? `<span class="us-cal-form-day-kicker">Già quel giorno</span>${list.map((e) => `<button type="button" class="us-cal-form-day-entry" data-entry-id="${esc(e.id)}" aria-label="${esc(entryAriaLabel({ title: e.title, lane: entryLaneRole(e), displayName: profileById(e.owner_id)?.display_name, entry: e }))}">${ownerChip(ownerMarkOf(e))}<b>${esc(e.title)}</b><small>${esc(entryTimeLabel(e))}</small></button>`).join('')}`
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
  // M9C — il form rapido crea sempre un impegno personale; gli eventi Insieme
  // nascono da Da vivere e restano modificabili col loro tipo.
  calendarKind = mode === 'edit' ? entry.entry_type : 'personal';

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

  const sheet = $('usCalendarFormSheet');
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('usCalendarTitleInput')?.focus({ preventScroll: true }), 80);
}
// M9C — nuova voce per una data (M10.1C: da "Aggiungi impegno" sul giorno
// selezionato o dal giorno della settimana; se si sta scegliendo il giorno per
// un'idea Da vivere, l'evento Insieme collegato).
function startCreateForDate(dateISO) {
  if (!dateISO) return;
  selectedDate = dateISO;
  renderCalendar();
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
    await loadEntries();
    toast(wasEditing ? 'Impegno aggiornato' : (linkedIdea ? 'In calendario' : 'Impegno aggiunto'));
  } catch (error) {
    console.warn('[US Calendar] save', error);
    setFormStatus('Non riesco a salvarlo. Riprova.');
  } finally {
    busy = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

// M6D — reminder dell'entry in editing: caricate una volta per superficie
// aperta, senza limiti di finestra (righe couple-scoped, quantità minuscola).
async function loadEntryReminders() {
  if (!window.usProfile) { editingEntryReminders = []; return; }
  try {
    const { data, error } = await sb.from('calendar_reminders').select('id,entry_id,recipient_id,offset_minutes,requested_by,sent_at');
    if (error) throw error;
    editingEntryReminders = data || [];
  } catch (error) {
    console.warn('[US Calendar] reminders load', error);
    editingEntryReminders = [];
  }
}

// Dettaglio: i reminder dell'entry sono SEMPRE visibili, con il richiedente
// ("il destinatario deve sapere chi lo ha creato") e lo stato.
function renderDetailReminders(entry) {
  const container = $('usCalendarDetailReminders');
  if (!container) return;
  const rows = editingEntryReminders.filter((r) => r.entry_id === entry.id);
  if (!rows.length) { container.innerHTML = ''; return; }
  const offsetLabel = (m) => (m === 1440 ? '1 giorno prima' : m === 60 ? '1 ora prima' : m + ' min prima');
  const items = rows.map((r) => {
    const selfRecipient = r.recipient_id === r.requested_by;
    const who = selfRecipient ? 'Te' : profileName(r.recipient_id);
    const by = selfRecipient ? '' : ' · da ' + profileName(r.requested_by);
    const state = r.sent_at ? 'inviato' : 'programmato';
    return '<p class="us-cal-detail-reminder">' + esc(offsetLabel(r.offset_minutes)) + ' → ' + esc(who) + esc(by) + ' <small>' + state + '</small></p>';
  });
  container.innerHTML = '<h4>Ricordamelo</h4>' + items.join('');
}

function shiftMonth(delta) {
  ensureInitialMonth();
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
  if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
  renderCalendar();
  loadEntries();
}
function setViewSwitch(mode) {
  const month = $('usCalendarViewMonth');
  const week = $('usCalendarViewWeek');
  month?.classList.toggle('is-active', mode === 'month');
  week?.classList.toggle('is-active', mode === 'week');
  month?.setAttribute('aria-pressed', String(mode === 'month'));
  week?.setAttribute('aria-pressed', String(mode === 'week'));
}
function setMode(mode) {
  if (calendarMode === mode) { setViewSwitch(mode); return; }
  calendarMode = mode;
  if (mode === 'week') weekStartISO = mondayOfISO(selectedDate || todayISO());
  setViewSwitch(mode);
  renderCalendar();
  loadEntries();
}
function shiftWeek(delta) {
  weekStartISO = shiftISODate(weekStartISO, delta * 7);
  renderCalendar();
  loadEntries();
}
function stepView(delta) {
  if (calendarMode === 'week') shiftWeek(delta);
  else shiftMonth(delta);
}
function goToToday() {
  const n = new Date();
  viewYear = n.getFullYear();
  viewMonth = n.getMonth();
  selectedDate = todayISO();
  weekStartISO = mondayOfISO(selectedDate);
  renderCalendar();
  loadEntries();
}

// M6E — an optional target date (e.g. from the Oggi calendar widget) lands
// the surface straight on that day/week instead of the current month, with
// that day already selected (M10.1C: the detail sits under the grid, so there
// is no separate day sheet to open); every existing zero-arg caller (HTML
// onclick, navigation.js) is unaffected.
async function openCalendarSurface() {
  const targetDateISO = arguments[0];
  ensureInitialMonth();
  if (targetDateISO) {
    const target = parseISODate(targetDateISO);
    viewYear = target.getFullYear();
    viewMonth = target.getMonth();
    weekStartISO = mondayOfISO(targetDateISO);
    selectedDate = targetDateISO;
  }
  const overlay = $('usCalendarOverlay');
  if (!overlay) return;
  window.UsUiFoundation?.cancelSurfaceExit?.(overlay);
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('us-cal-open');
  renderCalendar();
  if (!window.usProfile) return;
  await loadProfiles();
  await loadEntryReminders();
  await loadEntries();
}
function closeCalendarSurface() {
  const overlay = $('usCalendarOverlay');
  if (!overlay || busy) return;
  const finalize = () => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('us-cal-open');
    closeCalendarDetailSheet();
    closeCalendarFormSheet();
    clearIdeaPick();
    selectedDate = null;
    if ($('bond')?.classList.contains('active')) window.refreshNoiWeekBoard?.();
  };
  if (window.UsUiFoundation?.exitSurface) window.UsUiFoundation.exitSurface(overlay, finalize);
  else finalize();
}

$('usCalendarPrev')?.addEventListener('click', () => stepView(-1));
$('usCalendarNext')?.addEventListener('click', () => stepView(1));
$('usCalendarTodayBtn')?.addEventListener('click', goToToday);
$('usCalendarViewMonth')?.addEventListener('click', () => setMode('month'));
$('usCalendarViewWeek')?.addEventListener('click', () => setMode('week'));
$('usCalendarClose')?.addEventListener('click', closeCalendarSurface);
// M12A — "I nostri eventi" lives here, in its product context, instead of owning the shell.
$('usCalendarEventsLink')?.addEventListener('click', () => {
  if (busy) return;
  closeCalendarSurface();
  // navigation.js consumes the calendar's history entry once it is closed, and
  // that would also close a layer opened in the same tick: open Eventi after.
  const openWhenClosed = (tries = 0) => {
    if ($('usCalendarOverlay')?.classList.contains('open') && tries < 40) { setTimeout(() => openWhenClosed(tries + 1), 40); return; }
    setTimeout(() => window.openEvents?.(), 120);
  };
  openWhenClosed();
});
$('usCalendarBackdrop')?.addEventListener('click', closeCalendarSurface);
$('usCalendarAddEntry')?.addEventListener('click', () => startCreateForDate(selectedDate || todayISO()));
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
$('usCalendarPickCancel')?.addEventListener('click', clearIdeaPick);
$('usCalendarForm')?.addEventListener('submit', saveEntry);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('usCalendarOverlay')?.classList.contains('open')) closeCalendarSurface(); });

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
  await openCalendarSurface();
  if (window.usProfile?.id !== identity.userId || !$('usCalendarOverlay')?.classList.contains('open')) return;
  // M9C — niente date picker: il giorno lo sceglie il calendario.
  pendingIdeaPick = { bucketItemId: idea.id, title: idea.title || '', note: idea.note || null, ...identity };
  const banner = $('usCalendarPickBanner');
  const bannerTitle = $('usCalendarPickTitle');
  if (bannerTitle) bannerTitle.textContent = idea.title || 'la vostra idea';
  if (banner) banner.hidden = false;
}
function clearIdeaPick() {
  pendingIdeaPick = null;
  const banner = $('usCalendarPickBanner');
  if (banner) banner.hidden = true;
}
function openIdeaForm(pick, dateISO) {
  if (window.usProfile?.id !== pick.userId || window.usProfile?.couple_id !== pick.coupleId) { clearIdeaPick(); return; }
  openForm('create', null, dateISO);
  pendingIdeaLink = { bucketItemId: pick.bucketItemId, userId: pick.userId, coupleId: pick.coupleId, note: pick.note };
  calendarKind = 'shared';
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
    .select('id,title,entry_type,is_all_day,starts_at,ends_at,start_date,end_date')
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

async function openCalendarEntry(entryId) {
  if (!entryId || !window.usProfile) return;
  const map = await getCalendarEntriesByIds([entryId]).catch((error) => { console.warn('[US Calendar] open entry', error); return new Map(); });
  const entry = map.get(entryId);
  if (!entry) { toast('Non trovo più questo evento nel calendario.'); return; }
  const dateISO = entry.is_all_day ? entry.start_date : localDateFromInstant(entry.starts_at);
  await openCalendarSurface(dateISO);
  if ($('usCalendarOverlay')?.classList.contains('open')) openDetail(entryId);
}

window.UsCalendarLinks = Object.freeze({ openForIdea: openCalendarForIdea, openEntry: openCalendarEntry, getEntriesByIds: getCalendarEntriesByIds, whenLabel: calendarWhenLabel });
window.openCalendarSurface = openCalendarSurface;
window.closeCalendarSurface = closeCalendarSurface;
window.closeCalendarDetailSheet = closeCalendarDetailSheet;
window.closeCalendarFormSheet = closeCalendarFormSheet;
console.info('[US Calendar] calendario condiviso attivo');
})();
