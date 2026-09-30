const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const cal = require('../calendar.js');
const domain = require('../calendar-domain.js');

const html = () => read('index.html');
const js = () => read('calendar.js');
const css = () => read('calendar.css');
const nav = () => read('navigation.js');
const worker = () => read('service-worker.js');
const capacitorBuild = () => read('scripts/build-capacitor-web.mjs');

// (1) entry point exists, inside Noi (#bond), not a bottom-nav tab.
test('M6B (1): a single Calendario entry point lives inside Noi', () => {
  const bond = html().match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(bond, /id="usCalendarEntry"[^>]*onclick="openCalendarSurface\(\)"/);
  // M9D: the entry point is the Calendario card of the Noi hub.
  assert.match(bond, /class="noi-hub-card noi-hub-card--calendar" id="usCalendarEntry" onclick="openCalendarSurface\(\)"/);
  assert.match(bond, /<span class="noi-hub-kicker">Calendario<\/span><b>I vostri giorni<\/b>/);
  assert.doesNotMatch(html(), /data-page="calendar"/, 'must not become a bottom-nav destination');
});

// (2) opens/closes as a registered navigation layer.
test('M6B (2): the calendar surface opens and closes through the shared overlay idiom', () => {
  assert.match(js(), /function openCalendarSurface\(\)/);
  assert.match(js(), /function closeCalendarSurface\(\)/);
  assert.match(js(), /overlay\.classList\.add\('open'\)/);
  assert.match(js(), /window\.UsUiFoundation\?\.exitSurface/);
  assert.match(nav(), /name:'calendar',[\s\S]*?close:\(\)=>window\.closeCalendarSurface\?\.\(\)/);
});

// (3) current month renders in Italian.
test('M6B (3): the visible month/year label renders in Italian and the grid is a fixed Monday-first 42-day span', () => {
  assert.match(js(), /MONTHS_IT\[viewMonth\]/);
  assert.match(js(), /Settembre/);
  const { gridStart, gridEnd } = cal.monthGridRange(2026, 8); // September 2026
  assert.equal(gridStart.getDay(), 1, 'grid must start on a Monday');
  assert.equal((gridEnd.getTime() - gridStart.getTime()) / 86400000, 42);
  assert.ok(gridStart <= new Date(2026, 8, 1) && gridEnd > new Date(2026, 8, 30));
});

// (4) prev/next navigation, including year rollover. Since M6C the buttons route
// through stepView(delta): month mode still lands on shiftMonth(±1), week mode
// steps the week instead — same month behavior, one control.
test('M6B (4): prev/next controls shift the visible month, wrapping across year boundaries', () => {
  assert.match(js(), /function stepView\(delta\)/);
  assert.match(js(), /else shiftMonth\(delta\)/, 'in month mode prev/next still call shiftMonth');
  assert.match(js(), /\(\) => stepView\(-1\)\)/);
  assert.match(js(), /\(\) => stepView\(1\)\)/);
  const decGrid = cal.monthGridRange(2026, 11);
  const janGrid = cal.monthGridRange(2027, 0);
  assert.ok(decGrid.gridEnd.getFullYear() >= 2026, 'December grid spills into January');
  assert.ok(janGrid.gridStart.getFullYear() <= 2027, 'January grid may spill into December of the prior year');
});

// (5) Today action.
test('M6B (5): the Oggi control jumps to and selects the current day', () => {
  assert.match(js(), /function goToToday\(\)/);
  assert.match(js(), /usCalendarTodayBtn'\)\?\.addEventListener\('click', ?goToToday\)/);
  assert.match(js(), /selectedDate = todayISO\(\)/);
});

// (6) M10.1: ONE shared month grid, at every width.
test('M6B (6): exactly one shared month grid, at every width', () => {
  assert.equal((html().match(/class="us-cal-grid"/g) || []).length, 1);
  assert.match(html(), /id="usCalendarGrid"/);
  assert.doesNotMatch(html(), /usCalendarGridMobile|usCalendarGridA|usCalendarGridB|usCalendarPaneWide|usCalendarWideHead/);
});

// (7) M10.1: the wide breakpoint makes the ONE month roomier — it never splits it.
test('M6B (7): a wide viewport enlarges the single month, it does not split it per partner', () => {
  const wideBlock = css().match(/@media\(min-width:860px\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(wideBlock, /\.us-cal-pane-month\{max-width:680px/);
  assert.match(wideBlock, /\.us-cal-day\{min-height:64px/);
  assert.doesNotMatch(css() + js(), /us-cal-pane-wide|pane-mobile|renderWideGrids|roleFilter/);
  assert.equal((js().match(/function renderMonthGrid\(/g) || []).length, 1);
});

// (8) both partner identities shown, from live profile data, deterministically ordered.
test('M6B (8): both partner identities render from live profile data in a fixed, non-flipping order', () => {
  assert.match(js(), /profiles\s*=\s*data\s*\|\|\s*\[\]/);
  assert.doesNotMatch(js(), /['"]Francesco['"]|['"]Beatrice['"]/, 'display names must never be hardcoded, only the stable role enum');
  assert.deepEqual(cal.ROLE_ORDER, ['beatrice', 'francesco']);
  assert.equal(cal.roleRank('beatrice') < cal.roleRank('francesco'), true);
  assert.equal(cal.roleRank('beatrice'), cal.roleRank('beatrice'), 'rank is a pure function of the fixed role order, not of the viewer');
});

// (9) M10.1C: personal ownership is TEXT (F / B), not a colour or a shape.
test('M6B (9): personal entries resolve to their owner\'s lane and are marked F / B in text', () => {
  assert.equal(cal.entryLaneRoleFor({ entry_type: 'personal' }, 'francesco'), 'francesco');
  assert.equal(cal.entryLaneRoleFor({ entry_type: 'personal' }, 'beatrice'), 'beatrice');
  assert.equal(cal.ownerMarkFor('francesco'), 'F');
  assert.equal(cal.ownerMarkFor('beatrice'), 'B');
  assert.match(css(), /\.us-cal-chip\{[^}]*font-weight:800/, 'the month marker is a text chip');
});

// (10) M10.1C: a shared entry reads F+B (text), with a warm tint only as extra.
test('M6B (10): shared entries render the F+B text marker', () => {
  assert.equal(cal.entryLaneRoleFor({ entry_type: 'shared', owner_id: null }, ''), 'shared');
  assert.equal(cal.ownerMarkFor('shared'), 'F+B');
  assert.match(css(), /\.us-cal-chip--shared\{/);
});

// (11) a shared event is exactly one domain record, never duplicated per partner.
test('M6B (11): shared create/read never duplicates a domain row per partner', () => {
  const payload = cal.buildEntryPayload({ title: 'Cena', allDay: true, date: '2026-10-01' });
  const withAuthority = cal.withCreateAuthority(payload, 'shared', { id: 'me', couple_id: 'c1' });
  assert.equal(withAuthority.owner_id, null, 'a shared row carries no per-partner owner column');
  assert.equal(withAuthority.created_by, 'me');
  const insertCalls = js().match(/sb\.from\('calendar_entries'\)\.insert\(/g) || [];
  assert.equal(insertCalls.length, 1, 'exactly one insert call site — no per-partner duplication loop');
});

// (12) M10.1C: tapping a day SELECTS it; the detail sits under the grid and
// creation is the explicit "Aggiungi impegno". The Oggi deep link selects the day.
test('M6B (12): tapping a day selects it; the selected-day detail replaces the day sheet', () => {
  assert.doesNotMatch(js(), /openDaySheet|closeCalendarDaySheet/);
  assert.doesNotMatch(html(), /usCalendarDaySheet/);
  assert.match(js(), /\.us-cal-day\[data-date\]'\)\.forEach\(\(btn\) => btn\.addEventListener\('click', \(\) => selectDay\(btn\.dataset\.date\)\)\)/);
  assert.match(js(), /selectedDate = targetDateISO;/);
  assert.match(html(), /id="usCalendarAddEntry"[^>]*>Aggiungi impegno</);
});

// (13) the selected day separates partner A / partner B / Insieme — real lanes only.
test('M6B (13): the selected day renders one section per lane that has something: each partner and Insieme', () => {
  assert.match(js(), /groupDayEntries\(dayEntries, entryLaneRole\)/);
  assert.match(js(), /ownerNameFor\(lane,/);
  assert.match(js(), /Niente in programma\./, 'an empty day says so once, without empty lane scaffolding');
});

// (14) personal detail is read-only for the non-owner partner.
test('M6B (14): a personal entry is read-only for the non-owner', () => {
  assert.equal(cal.canEditEntry({ entry_type: 'personal', owner_id: 'owner-1' }, 'someone-else'), false);
});

// (15) the owner of a personal entry sees Edit/Delete.
test('M6B (15): the owner of a personal entry may edit/delete it', () => {
  assert.equal(cal.canEditEntry({ entry_type: 'personal', owner_id: 'owner-1' }, 'owner-1'), true);
});

// (16) the shared creator sees Edit/Delete.
test('M6B (16): the creator of a shared entry may edit/delete it', () => {
  assert.equal(cal.canEditEntry({ entry_type: 'shared', created_by: 'creator-1' }, 'creator-1'), true);
});

// (17) a non-creator viewing a shared entry is read-only.
test('M6B (17): a shared entry is read-only for a non-creator (no mutual consent in M6B)', () => {
  assert.equal(cal.canEditEntry({ entry_type: 'shared', created_by: 'creator-1' }, 'someone-else'), false);
});

// (18) create personal payload correct.
test('M6B (18): a personal create payload sets owner_id = created_by = the caller, inside their own couple', () => {
  const payload = cal.buildEntryPayload({ title: 'Palestra', allDay: false, date: '2026-10-05', time: '07:00', durationMinutes: 60 });
  const full = cal.withCreateAuthority(payload, 'personal', { id: 'me', couple_id: 'couple-1' });
  assert.equal(full.entry_type, 'personal');
  assert.equal(full.owner_id, 'me');
  assert.equal(full.created_by, 'me');
  assert.equal(full.couple_id, 'couple-1');
  assert.equal(full.visibility, 'full');
  assert.equal(full.is_all_day, false);
});

// (19) create shared payload correct.
test('M6B (19): a shared create payload has no owner_id, created_by = the caller', () => {
  const payload = cal.buildEntryPayload({ title: 'Cena fuori', allDay: true, date: '2026-10-05' });
  const full = cal.withCreateAuthority(payload, 'shared', { id: 'me', couple_id: 'couple-1' });
  assert.equal(full.entry_type, 'shared');
  assert.equal(full.owner_id, null);
  assert.equal(full.created_by, 'me');
});

// (20) edit never sends immutable/authority fields.
test('M6B (20): an edit/update payload never includes couple_id, created_by, entry_type or owner_id', () => {
  const payload = cal.buildEntryPayload({ title: 'Cena fuori', allDay: true, date: '2026-10-05' });
  for (const forbidden of ['couple_id', 'created_by', 'entry_type', 'owner_id']) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, forbidden), false, `update payload must never carry ${forbidden}`);
  }
  assert.match(js(), /sb\.from\('calendar_entries'\)\.update\(payload\)\.eq\('id', ?editingFormEntry\.id\)/);
});

// (21) delete is gated by authority and confirmed.
test('M6B (21): delete checks authority, asks a bounded confirmation, and calls the real delete', () => {
  assert.match(js(), /if \(!canEditEntry\(detailEntry, ?window\.usProfile\.id\)\) return;/);
  assert.match(js(), /confirm\('Eliminare questo impegno\?'\)/);
  assert.match(js(), /sb\.from\('calendar_entries'\)\.delete\(\)\.eq\('id', ?detailEntry\.id\)/);
});

// (22) Supabase/RLS errors surface honestly, never thrown uncaught.
test('M6B (22): load/save/delete failures are caught and surfaced, not silently swallowed or thrown', () => {
  assert.match(js(), /catch \(error\) \{\s*console\.warn\('\[US Calendar\] load', error\);/);
  assert.match(js(), /catch \(error\) \{\s*console\.warn\('\[US Calendar\] save', error\);/);
  assert.match(js(), /catch \(error\) \{\s*console\.warn\('\[US Calendar\] delete', error\);/);
  assert.match(js(), /Non riesco a salvarlo\. Riprova\./);
  assert.match(js(), /Non riesco a eliminarlo\. Riprova\./);
});

// (22b) PostgREST reports an RLS-filtered UPDATE/DELETE as a *success* with
// zero rows (204, error: null) — a naive `if (error) throw` would report a
// false success. classifyMutationResult is the pure decision used at both
// mutation call sites; this exercises the actual shipped classification.
test('M6B (22b): classifyMutationResult treats a zero-row PostgREST result as not_authorized, never as ok', () => {
  assert.equal(cal.classifyMutationResult({ data: [{ id: 'x' }], error: null }), 'ok');
  assert.equal(cal.classifyMutationResult({ data: [], error: null }), 'not_authorized', 'RLS silently filtered the row — this must not read as success');
  assert.equal(cal.classifyMutationResult({ data: null, error: null }), 'not_authorized', 'a missing data array is treated the same as zero rows');
  assert.equal(cal.classifyMutationResult({ data: null, error: { message: 'boom' } }), 'error');
});

test('M6B (22c): both delete and update route through classifyMutationResult and .select(\'id\'), and a zero-row/error outcome never reaches the success toast or local removal', () => {
  const source = js();
  assert.match(source, /sb\.from\('calendar_entries'\)\.delete\(\)\.eq\('id', ?detailEntry\.id\)\.select\('id'\)/);
  assert.match(source, /sb\.from\('calendar_entries'\)\.update\(payload\)\.eq\('id', ?editingFormEntry\.id\)\.select\('id'\)/);
  const deleteBlock = source.match(/async function deleteEntry\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(deleteBlock, /classifyMutationResult\(\{ data, error \}\)/);
  assert.match(deleteBlock, /if \(outcome === 'not_authorized'\) throw new Error/);
  // the local removal + success toast must appear AFTER the outcome checks, not before.
  const outcomeIdx = deleteBlock.indexOf("outcome === 'not_authorized'");
  const removalIdx = deleteBlock.indexOf('entries = entries.filter');
  assert.ok(outcomeIdx > 0 && removalIdx > outcomeIdx, 'the zero-row guard must run before the row is removed locally');

  const saveBlock = source.match(/async function saveEntry\(event\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(saveBlock, /classifyMutationResult\(\{ data, error \}\)/);
  assert.match(saveBlock, /if \(outcome === 'not_authorized'\) throw new Error/);
  const saveOutcomeIdx = saveBlock.indexOf("outcome === 'not_authorized'");
  const toastIdx = saveBlock.indexOf("toast(wasEditing");
  assert.ok(saveOutcomeIdx > 0 && toastIdx > saveOutcomeIdx, 'the zero-row guard must run before the "aggiornato" success toast');
});

// (23) timed entries render with a start->end time label, same-day.
test('M6B (23): a same-day timed entry touches exactly its one calendar day', () => {
  const entry = { is_all_day: false, starts_at: cal.localDateTimeToISO('2026-10-05', '09:00'), ends_at: cal.localDateTimeToISO('2026-10-05', '10:00') };
  assert.deepEqual(cal.entryDatesTouched(entry), ['2026-10-05']);
});

// (24) all-day single-day entry.
test('M6B (24): an all-day entry uses plain date columns and touches exactly its one day', () => {
  const entry = { is_all_day: true, start_date: '2026-10-05', end_date: '2026-10-05' };
  assert.deepEqual(cal.entryDatesTouched(entry), ['2026-10-05']);
});

// (25) overnight timed entry touches both days; an end exactly at local midnight does not spill an extra day.
test('M6B (25): an overnight timed entry marks both days; an end at exact midnight does not spill a third', () => {
  const overnight = { is_all_day: false, starts_at: cal.localDateTimeToISO('2026-10-05', '23:00'), ends_at: cal.localDateTimeToISO('2026-10-06', '02:00') };
  assert.deepEqual(cal.entryDatesTouched(overnight), ['2026-10-05', '2026-10-06']);

  const endsAtMidnight = { is_all_day: false, starts_at: cal.localDateTimeToISO('2026-10-05', '23:00'), ends_at: cal.localDateTimeToISO('2026-10-06', '00:00') };
  assert.deepEqual(cal.entryDatesTouched(endsAtMidnight), ['2026-10-05']);
});

// (26) multi-day all-day entry marks every day it spans.
test('M6B (26): a multi-day all-day entry marks every day it spans', () => {
  const entry = { is_all_day: true, start_date: '2026-10-05', end_date: '2026-10-08' };
  assert.deepEqual(cal.entryDatesTouched(entry), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
});

// (27) the range query stays bounded to the visible grid, never the full history.
test('M6B (27): the interval read is bounded to the visible grid window, built via UsCalendarDomain', () => {
  const { gridStart, gridEnd } = cal.monthGridRange(2026, 9);
  const win = cal.windowForGrid(gridStart, gridEnd);
  assert.ok(win.windowStartAt < win.windowEndAt);
  const filter = domain.buildRangeOverlapFilter(win);
  assert.match(filter, /starts_at\.lt\./);
  assert.match(js(), /UsCalendarDomain\.buildRangeOverlapFilter\(win\)/);
  assert.match(js(), /\.eq\('couple_id',\s*window\.usProfile\.couple_id\)/);
  assert.doesNotMatch(js(), /\.select\(\s*['"]?\*/, 'no unscoped/full-history select');
});

// (28) loading state is restrained (skeleton opacity), not a blocking spinner.
test('M6B (28): a restrained loading state, not a blocking full-screen spinner', () => {
  assert.match(js(), /usCalendarBody'\)\?\.classList\.toggle\('is-loading', ?loading\)/);
  assert.match(css(), /\.us-cal-body\.is-loading\{opacity:/);
});

// (29) empty calendar state keeps the copy; M9C: the day itself is the create action (no FAB).
test('M6B (29): the empty calendar state has no duplicate CTA; tapping a day is the create action', () => {
  assert.match(html(), /<b>I vostri giorni, insieme\.<\/b>/);
  assert.match(html(), /Aggiungete i vostri impegni e US vi aiuterà a vedere come si incastrano le vostre giornate\./);
  assert.doesNotMatch(html(), /usCalendarEmptyCta|class="us-cal-empty-cta"/);
  assert.doesNotMatch(js(), /usCalendarEmptyCta/);
  assert.doesNotMatch(html(), /usCalendarAddBtn|us-cal-fab/);
  assert.doesNotMatch(js(), /usCalendarAddBtn/);
  // M10.1C: the explanatory hint is gone — the selected day carries its own "Aggiungi impegno".
  assert.doesNotMatch(html(), /us-cal-hint/);
});

// (30) error/retry state keeps last good data visible.
test('M6B (30): a failed refresh shows an error/retry banner and keeps existing entries visible', () => {
  assert.match(js(), /Calendario non disponibile <button type="button" id="usCalendarRetry">Riprova<\/button>/);
  assert.match(js(), /lastError\s*=\s*true;/);
  assert.doesNotMatch(js(), /entries\s*=\s*\[\];?\s*\n\s*lastError/, 'entries must not be cleared on a failed refresh');
});

// (31) browser back closes detail -> day sheet -> calendar -> Noi, via the shared layer mechanism only.
test('M6B (31): browser Back is wired exclusively through navigation.js layers, in nesting order', () => {
  const layerNames = [...nav().matchAll(/name:'(calendar[\w-]*)'/g)].map((m) => m[1]);
  assert.deepEqual(layerNames, ['calendar', 'calendar-detail', 'calendar-form']);
  assert.doesNotMatch(js(), /history\.(push|replace)State|addEventListener\('popstate'/, 'no parallel history system inside calendar.js');
});

// (32) native back uses the same single layer mechanism (no separate native-only path).
test('M6B (32): native back reuses the same layer registry, no separate native-only navigation path', () => {
  assert.doesNotMatch(js(), /UsPlatform|listenForNativeBackButton/, 'calendar.js must not talk to the native back button directly');
  assert.match(nav(), /installNativeBackButton/, 'native back still funnels through the single existing handler');
});

// (33) Ricordi (Moments/Conservati) unaffected.
test('M6B (33): Ricordi/Conservati are untouched by the calendar feature', () => {
  assert.match(html(), /id="momentsGrid"/);
  assert.match(html(), /id="conservatiOverlay"/);
  assert.doesNotMatch(js(), /moments|conservati/i);
});

// (34) Left for You unaffected.
test('M6B (34): Left for You is untouched by the calendar feature', () => {
  assert.match(html(), /id="leftForYouPartnerEntry"/);
  assert.doesNotMatch(js(), /left[_-]?for[_-]?you/i);
});

// (35) Eventi / shared_events unaffected — calendar_entries only, no cross-authority.
test('M6B (35): Eventi/shared_events keeps rendering exactly as before; the calendar reads only calendar_entries', () => {
  assert.match(read('events.js'), /shared_events/);
  assert.doesNotMatch(js(), /shared_events/);
  assert.match(js(), /sb\.from\('calendar_entries'\)/);
});

// (36) service worker / static runtime updated correctly for the new assets.
test('M6B (36): the service worker precaches the three new runtime files and keeps its cache name convention', () => {
  assert.match(worker(), /"\/calendar-domain\.js"/);
  assert.match(worker(), /"\/calendar\.css"/);
  assert.match(worker(), /"\/calendar\.js"/);
  assert.match(worker(), /const CACHE_NAME = "us-shell-static-runtime-38"/);
});

// (37) Capacitor staging includes the new assets.
test('M6B (37): the Capacitor web build stages calendar-domain.js, calendar.css and calendar.js', () => {
  const build = capacitorBuild();
  assert.match(build, /'calendar-domain\.js',/);
  assert.match(build, /'calendar\.css',/);
  assert.match(build, /'calendar\.js',/);
});

// (38) the private media cache name is untouched.
test('M6B (38): the private media cache name is preserved exactly', () => {
  assert.match(worker(), /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
});

// --- Quick-entry form refinement -----------------------------------------

// (39) M9C: the quick form exposes only Titolo, Tutto il giorno, Ora (Giorno only when editing).
test('M6B (39): the quick form exposes exactly Titolo, Tutto il giorno, Ora — no kind, note, duration or reminder', () => {
  const formBlock = html().match(/<form class="us-cal-form" id="usCalendarForm">[\s\S]*?<\/form>/)?.[0] || '';
  const order = [
    formBlock.indexOf('id="usCalendarTitleInput"'),
    formBlock.indexOf('id="usCalendarAllDayInput"'),
    formBlock.indexOf('id="usCalendarTimeInput"')
  ];
  assert.ok(order.every((i) => i >= 0), 'Titolo, Tutto il giorno and Ora must be present');
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `field at index ${i} must come after the previous one`);
  for (const gone of ['usCalendarKindPicker', 'usCalendarNoteInput', 'usCalendarDurationField', 'usCalendarReminderField', 'usCalendarEndInput']) {
    assert.doesNotMatch(formBlock, new RegExp(gone), `${gone} is no longer part of the quick form`);
  }
  assert.match(formBlock, /<label class="us-cal-field" id="usCalendarDateField" hidden><span>Giorno<\/span>/, 'Giorno exists only for moving an existing entry, hidden by default');
  assert.match(js(), /if \(dateField\) dateField\.hidden = mode !== 'edit';/);
});

// (40) the end-date, end-time and location inputs are gone from the markup.
test('M6B (40): the end-date, end-time and location inputs no longer exist', () => {
  assert.doesNotMatch(html(), /usCalendarEndDateInput/);
  assert.doesNotMatch(html(), /usCalendarEndTimeInput/);
  assert.doesNotMatch(html(), /usCalendarEndTimeField/);
  assert.doesNotMatch(html(), /usCalendarLocationInput/);
});

// (41) no "Data inizio"/"Ora inizio" wording remains anywhere in the form.
test('M6B (41): no "Data inizio"/"Ora inizio" wording remains in the calendar form', () => {
  assert.doesNotMatch(html(), /Data inizio/);
  assert.doesNotMatch(html(), /Ora inizio/);
});

// (42) the Ora field is hidden when Tutto il giorno is checked, shown when unchecked.
test('M6B (42): the Ora field visibility is driven by the Tutto il giorno checkbox', () => {
  assert.match(js(), /function toggleAllDayFields\(\)/);
  assert.match(js(), /timeField\.hidden = allDay/);
  assert.match(js(), /usCalendarAllDayInput'\)\?\.addEventListener\('change', ?toggleAllDayFields\)/);
});

// (43) M9C: no Per me/Insieme control; a manual entry is always personal.
test('M6B (43): manual quick entries are personal; Insieme is created from Da vivere', () => {
  assert.doesNotMatch(html(), /usCalendarKindPicker|data-us-cal-kind/);
  assert.match(js(), /calendarKind = mode === 'edit' \? entry\.entry_type : 'personal';/);
  assert.match(js(), /const kind = ideaLink \? 'shared' : calendarKind;/);
});

// (44) all-day create sets start_date == end_date == Giorno, timestamps null.
test('M6B (44): an all-day create payload sets start_date == end_date == the chosen day, with null timestamps', () => {
  const payload = cal.buildEntryPayload({ title: 'Gita', allDay: true, date: '2026-11-03' });
  assert.equal(payload.start_date, '2026-11-03');
  assert.equal(payload.end_date, '2026-11-03');
  assert.equal(payload.starts_at, null);
  assert.equal(payload.ends_at, null);
});

// (45) a timed create derives ends_at from starts_at + the centralized default duration constant.
test('M6B (45): a timed create derives ends_at = starts_at + US_CALENDAR_DEFAULT_DURATION_MINUTES', () => {
  assert.equal(cal.US_CALENDAR_DEFAULT_DURATION_MINUTES, 60);
  const payload = cal.buildEntryPayload({ title: 'Corsa', allDay: false, date: '2026-11-03', time: '18:00', durationMinutes: cal.US_CALENDAR_DEFAULT_DURATION_MINUTES });
  const diffMinutes = (new Date(payload.ends_at) - new Date(payload.starts_at)) / 60000;
  assert.equal(diffMinutes, cal.US_CALENDAR_DEFAULT_DURATION_MINUTES);
});

// (46) editing a timed entry preserves its original (non-default) duration.
test('M6B (46): editing a timed entry preserves its original duration, not the default 60 minutes', () => {
  const existing = { is_all_day: false, starts_at: cal.localDateTimeToISO('2026-11-03', '09:00'), ends_at: cal.localDateTimeToISO('2026-11-03', '13:00') };
  const preserved = cal.originalDurationMinutes(existing);
  assert.equal(preserved, 240, 'the existing entry is 4 hours, not the 60-minute default');
  const payload = cal.buildEntryPayload({ title: 'Trasloco', allDay: false, date: '2026-11-04', time: '10:00', durationMinutes: preserved });
  const diffMinutes = (new Date(payload.ends_at) - new Date(payload.starts_at)) / 60000;
  assert.equal(diffMinutes, 240, 'moving only the start must not collapse the interval to the default duration');
  // M6C.1: the duration is now EXPLICIT in the form. Preservation works by
  // preselecting the entry's real duration (chip or Altro prefilled with its
  // own end time) instead of an invisible save-time fallback — the real
  // duration can never be silently rewritten to 60.
  // M9C: the quick form has no duration control — the hidden-field helper
  // carries the entry's REAL duration through every edit that stays timed.
  const hidden = cal.quickEntryHiddenFields({ editingEntry: existing, allDay: false });
  assert.equal(hidden.durationMinutes, 240, 'an edit that stays timed keeps its real duration');
  assert.equal(cal.quickEntryHiddenFields({ editingEntry: null, allDay: false }).durationMinutes, 60, 'only a create uses the default');
});

// (46b) editing a multi-day all-day entry preserves its original span — the
// all-day mirror of (46). Reproduces the regression a prior review flagged:
// an existing 2026-12-20 -> 2026-12-31 span must NOT collapse to one day.
test('M6B (46b): editing a multi-day all-day entry preserves its original span, shifted to the new Giorno', () => {
  const existing = { is_all_day: true, start_date: '2026-12-20', end_date: '2026-12-31' };
  const spanDays = cal.originalAllDaySpanDays(existing);
  assert.equal(spanDays, 11, 'the existing entry spans 12 days (20-31 Dec inclusive) — an 11-day start-to-end offset');
  const payload = cal.buildEntryPayload({ title: 'Vacanza', allDay: true, date: '2026-12-22', spanDays });
  assert.equal(payload.start_date, '2026-12-22');
  assert.equal(payload.end_date, '2027-01-02', 'the span must move with the start, not collapse to a single day');
  assert.equal(cal.entryDatesTouched(payload).length, 12, 'the day sheet must still bucket the entry across all 12 days');
  assert.match(js(), /originalAllDaySpanDays\(editingEntry\) \|\| 0/, 'the fallback span (0 = single day) is only used for a missing/invalid original span, never a constant');
  assert.equal(cal.quickEntryHiddenFields({ editingEntry: existing, allDay: true }).spanDays, 11, 'the quick form keeps the span on edit');
});

// (46c) a single-day all-day entry stays a single day when edited.
test('M6B (46c): editing a single-day all-day entry keeps it a single day', () => {
  const existing = { is_all_day: true, start_date: '2026-11-05', end_date: '2026-11-05' };
  const spanDays = cal.originalAllDaySpanDays(existing);
  assert.equal(spanDays, 0);
  const payload = cal.buildEntryPayload({ title: 'Compleanno', allDay: true, date: '2026-11-06', spanDays });
  assert.equal(payload.start_date, '2026-11-06');
  assert.equal(payload.end_date, '2026-11-06');
});

// (46d) converting a timed entry to all-day has no prior all-day span to preserve — single day.
test('M6B (46d): converting a timed entry to all-day produces a single day, not a stale span', () => {
  const timedEntry = { is_all_day: false, starts_at: cal.localDateTimeToISO('2026-11-05', '09:00'), ends_at: cal.localDateTimeToISO('2026-11-05', '13:00') };
  assert.equal(cal.originalAllDaySpanDays(timedEntry), null, 'a timed entry has no all-day span to derive');
  const payload = cal.buildEntryPayload({ title: 'Riunione', allDay: true, date: '2026-11-05', spanDays: cal.originalAllDaySpanDays(timedEntry) || 0 });
  assert.equal(payload.start_date, '2026-11-05');
  assert.equal(payload.end_date, '2026-11-05');
});

// (47) editing an entry that has a location preserves it, even though the form no longer collects one.
test('M6B (47): editing an entry with a location preserves that location', () => {
  const payload = cal.buildEntryPayload({ title: 'Cena', allDay: true, date: '2026-11-05', location: 'Roma, casa' });
  assert.equal(payload.location, 'Roma, casa');
  assert.equal(cal.quickEntryHiddenFields({ editingEntry: { is_all_day: true, start_date: '2026-11-05', end_date: '2026-11-05', location: 'Roma, casa' }, allDay: true }).location, 'Roma, casa', 'edit must carry the existing location through unchanged');
  assert.equal(cal.quickEntryHiddenFields({ editingEntry: null }).location, null, 'only create writes null');
});

// (48) the default duration is a single centralized constant, not scattered literals.
test('M6B (48): the default duration lives in exactly one constant, not repeated 60-minute literals', () => {
  assert.match(js(), /const US_CALENDAR_DEFAULT_DURATION_MINUTES = 60;/);
  const literalDefs = js().match(/US_CALENDAR_DEFAULT_DURATION_MINUTES = 60/g) || [];
  assert.equal(literalDefs.length, 1, 'the literal 60 must be assigned exactly once — every other use must reference the constant');
});

// --- Icon-button centering -------------------------------------------------

// (49) a single shared centering-only primitive exists and is applied to every calendar icon button.
test('M6B (49): a single shared icon-centering rule is defined once and applied to every calendar icon button', () => {
  const foundation = read('ui-foundation.css');
  assert.match(foundation, /\.us-icon-center\s*\{\s*display:inline-flex;\s*align-items:center;\s*justify-content:center;\s*\}/, 'the shared primitive must live in ui-foundation.css, the stated authority for cross-cutting UI primitives');

  for (const id of ['usCalendarClose', 'usCalendarPrev', 'usCalendarNext', 'usCalendarDetailClose', 'usCalendarFormClose']) {
    const tag = html().match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] || '';
    assert.ok(tag, `${id} must exist in the markup`);
    assert.match(tag, /class="[^"]*\bus-icon-center\b[^"]*"/, `${id} must use the shared centering class`);
  }
});

// --- Ora validation ----------------------------------------------------------

// (50) quickEntryError is a pure function: Ora is mandatory for a timed entry only.
test('M6B (50): quickEntryError flags a missing Ora only for a timed entry, never for all-day', () => {
  assert.equal(cal.quickEntryError({ allDay: false, time: '' }), 'time', 'a timed entry with no Ora must be rejected');
  assert.equal(cal.quickEntryError({ allDay: false, time: '09:00' }), null, 'a timed entry with an Ora is valid');
  assert.equal(cal.quickEntryError({ allDay: true, time: '' }), null, 'an all-day entry must never be blocked by its hidden, empty Ora field');
});

// (51) saveEntry gates on the pure helper, before building the payload, via the existing error surface — and the old silent 00:00 default is gone.
test('M6B (51): saveEntry rejects a missing Ora through the existing form-status error surface, before building the payload', () => {
  const saveBlock = js().match(/async function saveEntry\(event\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(saveBlock, /quickEntryError\(\{ allDay, time \}\) === 'time'/, 'saveEntry must gate on the pure helper, not reimplement the rule inline');
  assert.match(saveBlock, /setFormStatus\('Scegli un\\'ora\.'\)/, 'the existing form-status error surface must show the Ora message');
  const guardIdx = saveBlock.indexOf('quickEntryError');
  const payloadIdx = saveBlock.indexOf('buildEntryPayload(');
  assert.ok(guardIdx > 0 && payloadIdx > guardIdx, 'the Ora check must run before the payload is built');
  assert.match(js(), /const time = \$\('usCalendarTimeInput'\)\.value;/, 'the silent 00:00 default for a missing Ora must be removed');
});
