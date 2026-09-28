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
  assert.match(bond, /<b>Calendario<\/b><small>I vostri giorni, insieme\.<\/small>/);
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

// (4) prev/next navigation, including year rollover.
test('M6B (4): prev/next controls shift the visible month, wrapping across year boundaries', () => {
  assert.match(js(), /usCalendarPrev'\)\?\.addEventListener\('click', ?\(\) => shiftMonth\(-1\)\)/);
  assert.match(js(), /usCalendarNext'\)\?\.addEventListener\('click', ?\(\) => shiftMonth\(1\)\)/);
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

// (6) mobile single-grid mode.
test('M6B (6): mobile shows exactly one shared month grid', () => {
  assert.match(html(), /id="usCalendarGridMobile"/);
  assert.match(css(), /\.us-cal-pane-wide\{display:none\}/, 'the dual pane must be hidden by default (mobile-first)');
});

// (7) wide dual-calendar mode.
test('M6B (7): a wide viewport switches to two synchronized per-partner calendars', () => {
  assert.match(html(), /id="usCalendarGridA"/);
  assert.match(html(), /id="usCalendarGridB"/);
  const wideBlock = css().match(/@media\(min-width:860px\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(wideBlock, /\.us-cal-pane-mobile\{display:none\}/);
  assert.match(wideBlock, /\.us-cal-pane-wide\{display:grid/);
  assert.match(js(), /renderGridInto\(\$\('usCalendarGridA'\)[\s\S]*?renderGridInto\(\$\('usCalendarGridB'\)/, 'both panes render from the same monthGridRange(viewYear,viewMonth) call, so they stay in sync');
});

// (8) both partner identities shown, from live profile data, deterministically ordered.
test('M6B (8): both partner identities render from live profile data in a fixed, non-flipping order', () => {
  assert.match(js(), /profiles\s*=\s*data\s*\|\|\s*\[\]/);
  assert.doesNotMatch(js(), /['"]Francesco['"]|['"]Beatrice['"]/, 'display names must never be hardcoded, only the stable role enum');
  assert.deepEqual(cal.ROLE_ORDER, ['beatrice', 'francesco']);
  assert.equal(cal.roleRank('beatrice') < cal.roleRank('francesco'), true);
  assert.equal(cal.roleRank('beatrice'), cal.roleRank('beatrice'), 'rank is a pure function of the fixed role order, not of the viewer');
});

// (9) personal markers render with a non-color cue.
test('M6B (9): personal entries resolve to their owner\'s lane, distinguished by shape as well as color', () => {
  assert.equal(cal.entryLaneRoleFor({ entry_type: 'personal' }, 'francesco'), 'francesco');
  assert.equal(cal.entryLaneRoleFor({ entry_type: 'personal' }, 'beatrice'), 'beatrice');
  assert.match(css(), /\.us-cal-marker--a\{[^}]*border-radius:50%/, 'lane A is a round dot');
  assert.match(css(), /\.us-cal-marker--b\{[^}]*border-radius:2px/, 'lane B is a distinct bar shape, not just a different color');
});

// (10) shared marker renders distinctly (heart glyph, not just a third color).
test('M6B (10): shared entries render a distinct heart marker', () => {
  assert.equal(cal.entryLaneRoleFor({ entry_type: 'shared', owner_id: null }, ''), 'shared');
  assert.match(js(), /us-cal-marker--shared[^"]*"[^>]*>♡</);
});

// (11) a shared event is exactly one domain record, never duplicated per partner.
test('M6B (11): shared create/read never duplicates a domain row per partner', () => {
  const payload = cal.buildEntryPayload({ title: 'Cena', allDay: true, startDate: '2026-10-01' });
  const withAuthority = cal.withCreateAuthority(payload, 'shared', { id: 'me', couple_id: 'c1' });
  assert.equal(withAuthority.owner_id, null, 'a shared row carries no per-partner owner column');
  assert.equal(withAuthority.created_by, 'me');
  const insertCalls = js().match(/sb\.from\('calendar_entries'\)\.insert\(/g) || [];
  assert.equal(insertCalls.length, 1, 'exactly one insert call site — no per-partner duplication loop');
});

// (12) day sheet opens on day tap.
test('M6B (12): tapping a day opens the day sheet', () => {
  assert.match(js(), /function openDaySheet\(dateISO\)/);
  assert.match(js(), /addEventListener\('click', ?\(\) => openDaySheet\(btn\.dataset\.date\)\)/);
  assert.match(nav(), /name:'calendar-day',[\s\S]*?close:\(\)=>window\.closeCalendarDaySheet\?\.\(\)/);
});

// (13) day sheet separates partner A / partner B / Insieme.
test('M6B (13): the day sheet renders three separate sections: each partner and Insieme', () => {
  assert.match(js(), /sortedProfiles\(\)\.map\(\(profile\)\s*=>\s*renderDaySection\(/);
  assert.match(js(), /renderDaySection\('Insieme',/);
  assert.match(js(), /Niente qui\./, 'each section has its own quiet empty state');
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
  const payload = cal.buildEntryPayload({ title: 'Palestra', allDay: false, startDate: '2026-10-05', endDate: '2026-10-05', startTime: '07:00', endTime: '08:00' });
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
  const payload = cal.buildEntryPayload({ title: 'Cena fuori', allDay: true, startDate: '2026-10-05' });
  const full = cal.withCreateAuthority(payload, 'shared', { id: 'me', couple_id: 'couple-1' });
  assert.equal(full.entry_type, 'shared');
  assert.equal(full.owner_id, null);
  assert.equal(full.created_by, 'me');
});

// (20) edit never sends immutable/authority fields.
test('M6B (20): an edit/update payload never includes couple_id, created_by, entry_type or owner_id', () => {
  const payload = cal.buildEntryPayload({ title: 'Cena fuori', allDay: true, startDate: '2026-10-05', endDate: '2026-10-06' });
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

// (29) empty calendar state, with the exact copy and a CTA, not a fabricated "no records" message.
test('M6B (29): the empty calendar state uses the specified copy and a single CTA', () => {
  assert.match(html(), /<b>I vostri giorni, insieme\.<\/b>/);
  assert.match(html(), /Aggiungete i vostri impegni e US vi aiuterà a vedere come si incastrano le vostre giornate\./);
  assert.match(html(), /id="usCalendarEmptyCta">Aggiungi impegno</);
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
  assert.deepEqual(layerNames, ['calendar', 'calendar-day', 'calendar-detail', 'calendar-form']);
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
  assert.match(worker(), /const CACHE_NAME = "us-shell-static-runtime-31"/);
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
