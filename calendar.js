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
// M6C.1 — Duration from two local "HH:MM" times, in minutes. null when either
// value is malformed or end <= start (a timed entry must always end after it
// starts — ends_at > starts_at is an invariant, never silently repaired).
function durationMinutesFromTimes(startHHMM, endHHMM) {
  const toMin = (v) => {
    if (!/^\d{1,2}:\d{2}$/.test(String(v || ''))) return NaN;
    const [h, m] = String(v).split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMin(startHHMM);
  const end = toMin(endHHMM);
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

// Ora is mandatory for a TIMED entry, but the field is hidden (and therefore
// empty) whenever Tutto il giorno is on — an all-day entry must never be
// blocked by this check.
function quickEntryError({ allDay, time }) {
  if (!allDay && !time) return 'time';
  return null;
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

const pureApi = {
  ROLE_ORDER, US_CALENDAR_DEFAULT_DURATION_MINUTES, roleRank, entryLaneRoleFor, entryDateSpan, entryDatesTouched,
  formatDateRangeLabel, localDateFromInstant, localDateTimeToISO, addMinutesToISO, originalDurationMinutes,
  shiftISODate, originalAllDaySpanDays,
  monthGridRange, windowForGrid, weekRangeFor, weekWindowFor, mondayOfISO, partitionDayBusy, tempoWindowLabel,
  durationMinutesFromTimes, REMINDER_OPTIONS, REMINDER_TARGETS, reminderTargetAllowed, reminderOffsetAllowed, reminderOptionsFor, reminderRowsFor, reminderCopy,
  buildEntryPayload, withCreateAuthority, canEditEntry,
  quickEntryError, classifyMutationResult
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
let editingOriginalEndHHMM = ''; // M6C.1 — the end time the form was prefilled with
let editingEntryReminders = []; // M6D — righe calendar_reminders dell entry in editing
let formReminderOffset = null;   // null = Nessuno
let formReminderTarget = 'me';
let detailEntry = null;
let busy = false;

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

function markerFor(entry) {
  const role = entryLaneRole(entry);
  const cls = laneClass(role);
  if (role === 'shared') return '<span class="us-cal-marker us-cal-marker--shared" aria-hidden="true">♡</span>';
  return `<span class="us-cal-marker us-cal-marker--${cls}" aria-hidden="true"></span>`;
}

function renderDayCell(dateObj, dateISO, inMonth, dayEntries) {
  const isToday = dateISO === todayISO();
  const isSelected = dateISO === selectedDate;
  const shown = dayEntries.slice(0, 4);
  const overflow = dayEntries.length - shown.length;
  const markers = shown.map(markerFor).join('') + (overflow > 0 ? `<span class="us-cal-marker-more">+${overflow}</span>` : '');
  const classes = ['us-cal-day'];
  if (!inMonth) classes.push('is-outside');
  if (isToday) classes.push('is-today');
  if (isSelected) classes.push('is-selected');
  return `<button type="button" class="${classes.join(' ')}" data-date="${dateISO}" aria-label="${esc(dateISO)}" aria-pressed="${isSelected}">
    <span class="us-cal-day-num">${dateObj.getDate()}</span>
    <span class="us-cal-day-markers">${markers}</span>
  </button>`;
}

function renderGridInto(container, dateIndex, options = {}) {
  if (!container) return;
  const { gridStart } = monthGridRange(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const dateISO = isoDate(d.getFullYear(), d.getMonth(), d.getDate());
    const inMonth = d.getMonth() === viewMonth && d.getFullYear() === viewYear;
    const dayEntries = (dateIndex.get(dateISO) || []).filter((e) => !options.roleFilter || entryLaneRole(e) === 'shared' || entryLaneRole(e) === options.roleFilter);
    cells.push(renderDayCell(d, dateISO, inMonth, dayEntries));
  }
  const weekdayRow = WEEKDAYS_IT.map((w) => `<div class="us-cal-weekday">${w}</div>`).join('');
  container.innerHTML = `<div class="us-cal-weekday-row">${weekdayRow}</div><div class="us-cal-day-grid">${cells.join('')}</div>`;
  container.querySelectorAll('.us-cal-day[data-date]').forEach((btn) => btn.addEventListener('click', () => openDaySheet(btn.dataset.date)));
}

function renderMobileGrid(dateIndex) { renderGridInto($('usCalendarGridMobile'), dateIndex); }
function renderWideGrids(dateIndex) {
  const ordered = sortedProfiles();
  const a = ordered[0];
  const b = ordered[1];
  if ($('usCalendarWideHeadA')) $('usCalendarWideHeadA').textContent = a ? a.display_name : '';
  if ($('usCalendarWideHeadB')) $('usCalendarWideHeadB').textContent = b ? b.display_name : '';
  renderGridInto($('usCalendarGridA'), dateIndex, { roleFilter: a?.role });
  renderGridInto($('usCalendarGridB'), dateIndex, { roleFilter: b?.role });
}

function renderLegend() {
  const legend = $('usCalendarLegend');
  if (!legend) return;
  const ordered = sortedProfiles();
  const a = ordered[0];
  const b = ordered[1];
  legend.innerHTML = [
    a ? `<span class="us-cal-legend-item"><span class="us-cal-marker us-cal-marker--a" aria-hidden="true"></span>${esc(a.display_name)}</span>` : '',
    b ? `<span class="us-cal-legend-item"><span class="us-cal-marker us-cal-marker--b" aria-hidden="true"></span>${esc(b.display_name)}</span>` : '',
    '<span class="us-cal-legend-item"><span class="us-cal-marker us-cal-marker--shared" aria-hidden="true">♡</span>Insieme</span>'
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

function renderWeekDay(dateISO, dayEntries, ordered) {
  const d = parseISODate(dateISO);
  const weekday = capitalize(WEEKDAY_LONG_IT[(d.getDay() + 6) % 7]);
  const isToday = dateISO === todayISO();
  const { windows, dayStartISO, dayEndISO } = tempoWindowsForDay(dateISO);
  const tempoBody = windows.length
    ? `<ul>${windows.map((w) => `<li>${esc(tempoWindowLabel(w.start, w.end, dayStartISO, dayEndISO))}</li>`).join('')}</ul>`
    : '<p>Nessun momento libero insieme, oggi.</p>';
  const tempo = `<div class="us-cal-tempo${windows.length ? '' : ' is-empty'}">
      <span class="us-cal-tempo-heart" aria-hidden="true">♡</span>
      <div class="us-cal-tempo-copy"><b>Tempo insieme</b>${tempoBody}</div>
    </div>`;
  const body = dayEntries.length
    ? [
        ...ordered.map((p) => renderDaySection(p.display_name, dayEntries.filter((e) => entryLaneRole(e) === p.role), laneClass(p.role))),
        renderDaySection('Insieme', dayEntries.filter((e) => entryLaneRole(e) === 'shared'), 'shared')
      ].join('')
    : '<p class="us-cal-day-empty">Niente in programma.</p>';
  return `<article class="us-cal-week-day${isToday ? ' is-today' : ''}">
    <button type="button" class="us-cal-week-day-head" data-date="${dateISO}" aria-label="${esc(`${weekday} ${d.getDate()} ${MONTHS_IT[d.getMonth()].toLowerCase()}`)}">
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
  container.querySelectorAll('.us-cal-week-day-head[data-date]').forEach((btn) => btn.addEventListener('click', () => openDaySheet(btn.dataset.date)));
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
    const dateIndex = buildDateIndex();
    renderMobileGrid(dateIndex);
    renderWideGrids(dateIndex);
  }
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

function renderDaySection(label, list, cls) {
  const items = list.length
    ? list.map((e) => `<button type="button" class="us-cal-day-item" data-entry-id="${esc(e.id)}"><span class="us-cal-day-item-mark us-cal-marker--${cls}" aria-hidden="true"></span><span class="us-cal-day-item-copy"><b>${esc(e.title)}</b><small>${esc(entryTimeLabel(e))}</small></span></button>`).join('')
    : '<p class="us-cal-day-empty">Niente qui.</p>';
  return `<section class="us-cal-day-section"><h4>${esc(label)}</h4>${items}</section>`;
}

function renderDaySections(dateISO) {
  const dayEntries = buildDateIndex().get(dateISO) || [];
  const sections = sortedProfiles().map((profile) => renderDaySection(profile.display_name, dayEntries.filter((e) => entryLaneRole(e) === profile.role), laneClass(profile.role)));
  sections.push(renderDaySection('Insieme', dayEntries.filter((e) => entryLaneRole(e) === 'shared'), 'shared'));
  const container = $('usCalendarDaySections');
  if (!container) return;
  container.innerHTML = sections.join('');
  container.querySelectorAll('[data-entry-id]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.entryId)));
}

function openDaySheet(dateISO) {
  selectedDate = dateISO;
  renderCalendar();
  const d = parseISODate(dateISO);
  const weekday = capitalize(WEEKDAY_LONG_IT[(d.getDay() + 6) % 7]);
  const title = $('usCalendarDayTitle');
  if (title) title.textContent = `${weekday} ${d.getDate()} ${MONTHS_IT[d.getMonth()].toLowerCase()}`;
  renderDaySections(dateISO);
  const sheet = $('usCalendarDaySheet');
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
}
function closeCalendarDaySheet() {
  const sheet = $('usCalendarDaySheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
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
  if (!confirm('Eliminare questo impegno?')) return;
  if (!navigator.onLine) { toast('Sei offline. Riprova quando torni online.'); return; }
  busy = true;
  try {
    const { data, error } = await sb.from('calendar_entries').delete().eq('id', detailEntry.id).select('id');
    const outcome = classifyMutationResult({ data, error });
    if (outcome === 'error') throw error;
    if (outcome === 'not_authorized') throw new Error('delete matched 0 rows');
    entries = entries.filter((e) => e.id !== detailEntry.id);
    editingEntryReminders = editingEntryReminders.filter((r) => r.entry_id !== detailEntry.id);
    closeCalendarDetailSheet();
    renderCalendar();
    if ($('usCalendarDaySheet')?.classList.contains('open') && selectedDate) renderDaySections(selectedDate);
    toast('Impegno eliminato');
  } catch (error) {
    console.warn('[US Calendar] delete', error);
    toast('Non riesco a eliminarlo. Riprova.');
  } finally {
    busy = false;
  }
}

function setKindPicker(kind) {
  $('usCalendarKindPersonal')?.classList.toggle('is-active', kind === 'personal');
  $('usCalendarKindShared')?.classList.toggle('is-active', kind === 'shared');
  $('usCalendarKindPersonal')?.setAttribute('aria-pressed', String(kind === 'personal'));
  $('usCalendarKindShared')?.setAttribute('aria-pressed', String(kind === 'shared'));
}
function toggleAllDayFields() {
  const allDay = Boolean($('usCalendarAllDayInput')?.checked);
  const timeField = $('usCalendarTimeField');
  if (timeField) timeField.hidden = allDay;
  // M6C.1 — a timed duration makes no sense for an all-day entry: the whole
  // duration UI (chips + custom end time) disappears with it.
  const durationField = $('usCalendarDurationField');
  if (durationField) durationField.hidden = allDay;
}
// M6C.1 — Quanto dura? One active chip at a time; Altro reveals the minimal
// end-time control. values: 30 | 60 | 120 | 'custom'.
function setDurationPicker(value) {
  const picker = $('usCalendarDurationPicker');
  if (!picker) return;
  picker.querySelectorAll('button[data-us-cal-duration]').forEach((btn) => {
    const active = String(btn.dataset.usCalDuration) === String(value);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  const endField = $('usCalendarEndField');
  if (endField) endField.hidden = String(value) !== 'custom';
}
function getActiveDurationChoice() {
  const active = $('usCalendarDurationPicker')?.querySelector('button.is-active[data-us-cal-duration]');
  if (!active) return null;
  return active.dataset.usCalDuration === 'custom' ? 'custom' : Number(active.dataset.usCalDuration);
}
// M6D — Ricordamelo: opzioni filtrate per tipo (all-day → solo Nessuno/1 giorno),
// Ricorda a visibile solo con un reminder attivo; Entrambi solo per gli shared.
function setReminderPicker(offsetMinutes) {
  formReminderOffset = offsetMinutes;
  const picker = $('usCalendarReminderPicker');
  if (!picker) return;
  const isAllDay = Boolean($('usCalendarAllDayInput')?.checked);
  picker.querySelectorAll('button[data-us-cal-reminder]').forEach((btn) => {
    const value = btn.dataset.usCalReminder === 'none' ? null : Number(btn.dataset.usCalReminder);
    const visible = reminderOffsetAllowed(value, isAllDay);
    btn.hidden = !visible;
    const active = (value == null ? formReminderOffset == null : formReminderOffset === value);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  // All-day può avere solo Nessuno o 1440: se l'utente passa a all-day con
  // un offset timed selezionato, il reminder cade su Nessuno.
  if (isAllDay && formReminderOffset != null && formReminderOffset !== 1440) {
    formReminderOffset = null;
    picker.querySelectorAll('button[data-us-cal-reminder]').forEach((btn) => {
      const active = btn.dataset.usCalReminder === 'none';
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }
  updateReminderTargetVisibility();
}
function setReminderTarget(target) {
  formReminderTarget = reminderTargetAllowed(target, calendarKind) ? target : 'me';
  const picker = $('usCalendarReminderTargetPicker');
  if (!picker) return;
  picker.querySelectorAll('button[data-us-cal-reminder-target]').forEach((btn) => {
    const active = btn.dataset.usCalReminderTarget === formReminderTarget;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}
function updateReminderTargetVisibility() {
  const wrap = $('usCalendarReminderTargetWrap');
  if (wrap) wrap.hidden = formReminderOffset == null;
  const both = $('usCalendarReminderTargetPicker')?.querySelector('[data-us-cal-reminder-target=both]');
  if (both) both.hidden = calendarKind !== 'shared';
  if (calendarKind !== 'shared' && formReminderTarget === 'both') { formReminderTarget = 'me'; setReminderTarget('me'); }
}
function getActiveReminderOffset() {
  return formReminderOffset;
}
function getActiveReminderTarget() {
  return formReminderOffset == null ? null : formReminderTarget;
}
function setFormStatus(msg) { const el = $('usCalendarFormStatus'); if (el) el.textContent = msg; }

function openForm(mode, entry) {
  const title = $('usCalendarFormTitle');
  if (title) title.textContent = mode === 'edit' ? 'Modifica impegno' : 'Nuovo impegno';
  const picker = $('usCalendarKindPicker');
  if (picker) picker.hidden = mode === 'edit';
  setFormStatus('');
  const saveBtn = $('usCalendarFormSave');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = mode === 'edit' ? 'Salva modifiche' : 'Salva impegno'; }
  editingFormEntry = mode === 'edit' ? entry : null;
  calendarKind = mode === 'edit' ? entry.entry_type : 'personal';
  setKindPicker(calendarKind);

  $('usCalendarTitleInput').value = entry?.title || '';
  $('usCalendarAllDayInput').checked = Boolean(entry?.is_all_day);
  if (entry?.is_all_day) {
    $('usCalendarDateInput').value = entry.start_date;
    $('usCalendarTimeInput').value = '';
  } else if (entry) {
    const s = new Date(entry.starts_at);
    $('usCalendarDateInput').value = localDateFromInstant(entry.starts_at);
    $('usCalendarTimeInput').value = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
  } else {
    $('usCalendarDateInput').value = selectedDate || todayISO();
    $('usCalendarTimeInput').value = '';
  }
  $('usCalendarNoteInput').value = entry?.description || '';
  // M6C.1 — the duration picker opens on the entry's REAL duration when
  // editing a timed entry (chip when it's 30/60/120, Altro with the entry's
  // own end time otherwise); 1 hour is only the default for a NEW entry.
  let durationChoice = US_CALENDAR_DEFAULT_DURATION_MINUTES;
  let durationEnd = '';
  editingOriginalEndHHMM = '';
  if (entry && !entry.is_all_day) {
    const real = originalDurationMinutes(entry);
    if (real === 30 || real === 60 || real === 120) durationChoice = real;
    else {
      durationChoice = 'custom';
      const e = new Date(entry.ends_at);
      durationEnd = `${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
      editingOriginalEndHHMM = durationEnd;
    }
  }
  setDurationPicker(durationChoice);
  $('usCalendarEndInput').value = durationEnd;
  toggleAllDayFields();
  // M6D — prefill del reminder dalle righe esistenti dell'entry (edit):
  // una riga per destinatario; 'both' = due righe stesso offset.
  const entryRows = entry ? editingEntryReminders.filter((r) => r.entry_id === entry.id) : [];
  if (entryRows.length) {
    const meId = window.usProfile ? window.usProfile.id : null;
    const meRows = entryRows.some((r) => r.recipient_id === meId);
    const partnerRows = entryRows.some((r) => r.recipient_id !== meId);
    formReminderOffset = entryRows[0].offset_minutes;
    formReminderTarget = meRows && partnerRows ? 'both' : (meRows ? 'me' : 'partner');
  } else {
    formReminderOffset = null;
    formReminderTarget = 'me';
  }
  setReminderPicker(formReminderOffset);
  setReminderTarget(formReminderTarget);

  const sheet = $('usCalendarFormSheet');
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('usCalendarTitleInput')?.focus({ preventScroll: true }), 80);
}
function closeCalendarFormSheet() {
  const sheet = $('usCalendarFormSheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  editingFormEntry = null;
}

async function saveEntry(event) {
  event.preventDefault();
  if (busy || !window.usProfile) return;
  if (!navigator.onLine) { toast('Sei offline. Riprova quando torni online.'); return; }
  const title = $('usCalendarTitleInput').value.trim();
  const date = $('usCalendarDateInput').value;
  if (!title || !date) return;
  const allDay = $('usCalendarAllDayInput').checked;
  const time = $('usCalendarTimeInput').value;
  if (quickEntryError({ allDay, time }) === 'time') { setFormStatus('Scegli un\'ora.'); return; }
  const description = $('usCalendarNoteInput').value.trim();
  // M6C.1 — the duration is now EXPLICIT for every new timed entry: a chip
  // (30/60/120) or Altro's own end time. The old invisible 60-minute
  // assumption is gone; editing a timed entry that stays timed opens on its
  // REAL duration (see openForm) and keeps it unless the user changes it.
  let durationMinutes;
  if (getActiveDurationChoice() === 'custom') {
    const endTime = $('usCalendarEndInput')?.value;
    if (!endTime) { setFormStatus("Scegli l'orario di fine."); return; }
    // Editing a timed entry whose Fine alle is untouched preserves the entry's
    // REAL duration even if only the start moved (mission rule: an edit never
    // mutates an existing duration silently). A new/edited end recomputes.
    const real = editingFormEntry && !editingFormEntry.is_all_day ? originalDurationMinutes(editingFormEntry) : null;
    durationMinutes = (real && endTime === editingOriginalEndHHMM)
      ? real
      : durationMinutesFromTimes(time, endTime);
    if (!durationMinutes) { setFormStatus("La fine deve essere dopo l'inizio."); return; }
  } else {
    durationMinutes = getActiveDurationChoice() || US_CALENDAR_DEFAULT_DURATION_MINUTES;
  }
  // The form no longer collects a location: an edit must carry the entry's
  // existing value through unchanged, and only a create ever writes null.
  const location = editingFormEntry ? (editingFormEntry.location ?? null) : null;
  // An all-day entry staying all-day keeps its OWN original span, shifted to
  // the chosen Giorno; every other case (create, or timed -> all-day) has no
  // prior all-day span to preserve, so it collapses to a single day.
  const spanDays = allDay && editingFormEntry && editingFormEntry.is_all_day
    ? (originalAllDaySpanDays(editingFormEntry) || 0)
    : 0;

  const payload = buildEntryPayload({ title, description, location, allDay, date, time, durationMinutes, spanDays });

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
      const result = await sb.from('calendar_entries').insert(withCreateAuthority(payload, calendarKind, window.usProfile)).select('id');
      if (result.error) throw result.error;
      savedId = Array.isArray(result.data) && result.data[0]?.id ? result.data[0].id : null;
    }
    const wasEditing = Boolean(editingFormEntry);
    // M6D — sync dei reminder dopo il salvataggio dell'entry:
    // replace-all delle righe non ancora inviate (sent_at is null) con la
    // scelta corrente del form; una riga già inviata non si tocca (storia).
    const savedEntryId = wasEditing ? editingFormEntry.id : savedId;
    if (savedEntryId) await syncEntryReminders(savedEntryId);
    await loadEntryReminders();
    closeCalendarFormSheet();
    await loadEntries();
    if ($('usCalendarDaySheet')?.classList.contains('open') && selectedDate) renderDaySections(selectedDate);
    toast(wasEditing ? 'Impegno aggiornato' : 'Impegno aggiunto');
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

// Replace-all delle righe PENDENTI (sent_at is null) dell'entry con la
// scelta corrente; le righe già inviate restano (storia, no spam).
// Chiave unica (entry_id, recipient_id, offset_minutes) copre le race.
async function syncEntryReminders(entryId) {
  if (!window.usProfile) return;
  const offset = getActiveReminderOffset();
  const existing = editingEntryReminders.filter((r) => r.entry_id === entryId);
  // Rimuovi le pendenti che non corrispondono alla scelta corrente.
  const stale = existing.filter((r) => !r.sent_at && (r.offset_minutes !== offset || !reminderRowsFor({ entryType: calendarKind, target: formReminderTarget, requesterId: window.usProfile.id, partnerId: partnerIdFor(), offsetMinutes: offset }).some((row) => row.recipient_id === r.recipient_id && row.offset_minutes === offset)));
  for (const row of stale) {
    await sb.from('calendar_reminders').delete().eq('id', row.id).select('id');
  }
  // Aggiungi le righe mancanti (mesma scelta nuova, o switch target).
  const wanted = reminderRowsFor({ entryType: calendarKind, target: formReminderTarget, requesterId: window.usProfile.id, partnerId: partnerIdFor(), offsetMinutes: offset });
  const toAdd = wanted.filter((row) => !existing.some((r) => r.recipient_id === row.recipient_id && r.offset_minutes === row.offset_minutes && !r.sent_at));
  if (toAdd.length) {
    await sb.from('calendar_reminders').insert(toAdd.map((row) => ({ ...row, couple_id: window.usProfile.couple_id, entry_id: entryId, requested_by: window.usProfile.id })));
  }
}

// Il partner reale dai profili caricati (mai hardcoding): l'altro profilo
// della coppia rispetto al viewer.
function partnerIdFor() {
  const me = window.usProfile ? window.usProfile.id : null;
  const other = profiles.find((p) => p.id !== me);
  return other ? other.id : null;
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

async function openCalendarSurface() {
  ensureInitialMonth();
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
    closeCalendarDaySheet();
    closeCalendarDetailSheet();
    closeCalendarFormSheet();
    selectedDate = null;
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
$('usCalendarBackdrop')?.addEventListener('click', closeCalendarSurface);
$('usCalendarDayClose')?.addEventListener('click', closeCalendarDaySheet);
$('usCalendarDayBackdrop')?.addEventListener('click', closeCalendarDaySheet);
$('usCalendarDetailClose')?.addEventListener('click', closeCalendarDetailSheet);
$('usCalendarDetailBackdrop')?.addEventListener('click', closeCalendarDetailSheet);
$('usCalendarDetailEdit')?.addEventListener('click', () => { if (detailEntry) openForm('edit', detailEntry); });
$('usCalendarDetailDelete')?.addEventListener('click', deleteEntry);
$('usCalendarFormClose')?.addEventListener('click', closeCalendarFormSheet);
$('usCalendarFormBackdrop')?.addEventListener('click', closeCalendarFormSheet);
$('usCalendarAddBtn')?.addEventListener('click', () => openForm('create', null));
$('usCalendarEmptyCta')?.addEventListener('click', () => openForm('create', null));
$('usCalendarAllDayInput')?.addEventListener('change', toggleAllDayFields);
$('usCalendarKindPersonal')?.addEventListener('click', () => { calendarKind = 'personal'; setKindPicker('personal'); });
$('usCalendarKindShared')?.addEventListener('click', () => { calendarKind = 'shared'; setKindPicker('shared'); });
$('usCalendarReminderPicker')?.querySelectorAll('button[data-us-cal-reminder]').forEach((btn) => btn.addEventListener('click', () => setReminderPicker(btn.dataset.usCalReminder === 'none' ? null : Number(btn.dataset.usCalReminder))));
$('usCalendarReminderTargetPicker')?.querySelectorAll('button[data-us-cal-reminder-target]').forEach((btn) => btn.addEventListener('click', () => setReminderTarget(btn.dataset.usCalReminderTarget)));
$('usCalendarDurationPicker')?.querySelectorAll('button[data-us-cal-duration]').forEach((btn) => btn.addEventListener('click', () => setDurationPicker(btn.dataset.usCalDuration)));
$('usCalendarForm')?.addEventListener('submit', saveEntry);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('usCalendarOverlay')?.classList.contains('open')) closeCalendarSurface(); });

window.openCalendarSurface = openCalendarSurface;
window.closeCalendarSurface = closeCalendarSurface;
window.closeCalendarDaySheet = closeCalendarDaySheet;
window.closeCalendarDetailSheet = closeCalendarDetailSheet;
window.closeCalendarFormSheet = closeCalendarFormSheet;
console.info('[US Calendar] calendario condiviso attivo');
})();
