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
function buildEntryPayload({ title, description, location, allDay, startDate, endDate, startTime, endTime }) {
  const safeEndDate = endDate || startDate;
  if (allDay) {
    return { title, description: description || null, location: location || null, is_all_day: true, start_date: startDate, end_date: safeEndDate, starts_at: null, ends_at: null };
  }
  return {
    title, description: description || null, location: location || null, is_all_day: false,
    starts_at: localDateTimeToISO(startDate, startTime || '00:00'),
    ends_at: localDateTimeToISO(safeEndDate, endTime || '00:00'),
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
  ROLE_ORDER, roleRank, entryLaneRoleFor, entryDateSpan, entryDatesTouched,
  formatDateRangeLabel, localDateFromInstant, localDateTimeToISO,
  monthGridRange, windowForGrid, buildEntryPayload, withCreateAuthority, canEditEntry,
  classifyMutationResult
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
let editingFormEntry = null;
let detailEntry = null;
let busy = false;

function ensureInitialMonth() {
  if (viewYear != null) return;
  const n = new Date();
  viewYear = n.getFullYear();
  viewMonth = n.getMonth();
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
  const { gridStart, gridEnd } = monthGridRange(viewYear, viewMonth);
  const win = windowForGrid(gridStart, gridEnd);
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
  empty.hidden = !(entries.length === 0 && !loading && !lastError);
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

function renderCalendar() {
  if (!$('usCalendarOverlay')?.classList.contains('open')) return;
  ensureInitialMonth();
  const label = $('usCalendarMonthLabel');
  if (label) label.textContent = `${MONTHS_IT[viewMonth]} ${viewYear}`;
  const dateIndex = buildDateIndex();
  renderMobileGrid(dateIndex);
  renderWideGrids(dateIndex);
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
  const startTimeField = $('usCalendarStartTimeField');
  const endTimeField = $('usCalendarEndTimeField');
  if (startTimeField) startTimeField.hidden = allDay;
  if (endTimeField) endTimeField.hidden = allDay;
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
    $('usCalendarStartDateInput').value = entry.start_date;
    $('usCalendarEndDateInput').value = entry.end_date;
    $('usCalendarStartTimeInput').value = '';
    $('usCalendarEndTimeInput').value = '';
  } else if (entry) {
    const s = new Date(entry.starts_at);
    const e = new Date(entry.ends_at);
    $('usCalendarStartDateInput').value = localDateFromInstant(entry.starts_at);
    $('usCalendarEndDateInput').value = localDateFromInstant(entry.ends_at);
    $('usCalendarStartTimeInput').value = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
    $('usCalendarEndTimeInput').value = `${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
  } else {
    $('usCalendarStartDateInput').value = selectedDate || todayISO();
    $('usCalendarEndDateInput').value = '';
    $('usCalendarStartTimeInput').value = '';
    $('usCalendarEndTimeInput').value = '';
  }
  $('usCalendarLocationInput').value = entry?.location || '';
  $('usCalendarNoteInput').value = entry?.description || '';
  toggleAllDayFields();

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
  const startDate = $('usCalendarStartDateInput').value;
  if (!title || !startDate) return;
  const allDay = $('usCalendarAllDayInput').checked;
  const endDate = $('usCalendarEndDateInput').value || startDate;
  if (endDate < startDate) { setFormStatus('La data di fine non può precedere l’inizio.'); return; }
  const startTime = $('usCalendarStartTimeInput').value || '00:00';
  const endTime = $('usCalendarEndTimeInput').value || '00:00';
  const location = $('usCalendarLocationInput').value.trim();
  const description = $('usCalendarNoteInput').value.trim();

  const payload = buildEntryPayload({ title, description, location, allDay, startDate, endDate, startTime, endTime });
  if (!allDay && new Date(payload.ends_at) <= new Date(payload.starts_at)) { setFormStatus('L’orario di fine deve essere dopo l’inizio.'); return; }

  busy = true;
  const saveBtn = $('usCalendarFormSave');
  if (saveBtn) saveBtn.disabled = true;
  setFormStatus('Salvo…');
  try {
    if (editingFormEntry) {
      const { data, error } = await sb.from('calendar_entries').update(payload).eq('id', editingFormEntry.id).select('id');
      const outcome = classifyMutationResult({ data, error });
      if (outcome === 'error') throw error;
      if (outcome === 'not_authorized') throw new Error('update matched 0 rows');
    } else {
      const result = await sb.from('calendar_entries').insert(withCreateAuthority(payload, calendarKind, window.usProfile));
      if (result.error) throw result.error;
    }
    const wasEditing = Boolean(editingFormEntry);
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

function shiftMonth(delta) {
  ensureInitialMonth();
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
  if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
  renderCalendar();
  loadEntries();
}
function goToToday() {
  const n = new Date();
  viewYear = n.getFullYear();
  viewMonth = n.getMonth();
  selectedDate = todayISO();
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

$('usCalendarPrev')?.addEventListener('click', () => shiftMonth(-1));
$('usCalendarNext')?.addEventListener('click', () => shiftMonth(1));
$('usCalendarTodayBtn')?.addEventListener('click', goToToday);
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
$('usCalendarForm')?.addEventListener('submit', saveEntry);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('usCalendarOverlay')?.classList.contains('open')) closeCalendarSurface(); });

window.openCalendarSurface = openCalendarSurface;
window.closeCalendarSurface = closeCalendarSurface;
window.closeCalendarDaySheet = closeCalendarDaySheet;
window.closeCalendarDetailSheet = closeCalendarDetailSheet;
window.closeCalendarFormSheet = closeCalendarFormSheet;
console.info('[US Calendar] calendario condiviso attivo');
})();
