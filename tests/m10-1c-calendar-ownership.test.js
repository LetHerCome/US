// M10.1C — Calendar readability: ownership is TEXT (F / B / F+B) derived from
// the existing lane authority, the month grid stays compact, and the selected
// day renders the real agenda under the grid. calendar.js runs in a vm with a
// minimal DOM; the test hook is injected here, never shipped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const calSrc = read('calendar.js');
const html = read('index.html');
const css = read('calendar.css');
const cal = require('../calendar.js');

const FR = { id: 'f-id', display_name: 'Francesco', role: 'francesco', couple_id: 'c1' };
const BE = { id: 'b-id', display_name: 'Beatrice', role: 'beatrice', couple_id: 'c1' };
const TODAY = '2026-09-30';
const at = (h, m = 0, day = 30) => new Date(2026, 8, day, h, m).toISOString();
let seq = 0;
const timed = (owner, type, h, title, extra = {}) => ({ id: `e${++seq}`, couple_id: 'c1', entry_type: type, owner_id: type === 'shared' ? null : owner, created_by: owner, title, description: null, location: extra.location ?? null, is_all_day: false, starts_at: at(h, extra.m || 0, extra.day || 30), ends_at: at(h + 1, extra.m || 0, extra.day || 30), start_date: null, end_date: null });
const allDay = (owner, type, title, day = 30) => ({ id: `e${++seq}`, couple_id: 'c1', entry_type: type, owner_id: type === 'shared' ? null : owner, created_by: owner, title, description: null, location: null, is_all_day: true, starts_at: null, ends_at: null, start_date: `2026-09-${day}`, end_date: `2026-09-${day}` });

function makeDom() {
  const els = new Map();
  const make = (id) => {
    const classes = new Set(); const attrs = {};
    const el = {
      id, hidden: false, textContent: '', dataset: {}, value: '', checked: false,
      classList: { add: (...n) => n.forEach((x) => classes.add(x)), remove: (...n) => n.forEach((x) => classes.delete(x)), contains: (n) => classes.has(n), toggle: (n, f) => { if (f === undefined ? !classes.has(n) : f) classes.add(n); else classes.delete(n); } },
      setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null,
      addEventListener() {}, focus() {}, scrollIntoView() {},
      querySelectorAll(sel) {
        if (sel !== '[data-entry-id]') return [];
        // Same buttons on every call for the same markup, so handlers survive.
        if (el._cacheKey === el.innerHTML) return el._cache;
        el._cacheKey = el.innerHTML;
        el._cache = [...String(el.innerHTML || '').matchAll(/data-entry-id="([^"]+)"/g)].map((m) => {
          const handlers = [];
          return { dataset: { entryId: m[1] }, addEventListener: (type, fn) => handlers.push(fn), click: () => handlers.forEach((fn) => fn()) };
        });
        return el._cache;
      },
      innerHTML: ''
    };
    return el;
  };
  return { get: (id) => { if (!els.has(id)) els.set(id, make(id)); return els.get(id); } };
}

function load({ role = 'francesco', profiles = [BE, FR], entries = [], selected = TODAY, mode = 'month' } = {}) {
  const dom = makeDom();
  const window = { usProfile: role === 'francesco' ? FR : BE };
  const context = vm.createContext({
    console: { info() {}, warn() {} }, window, Date, Intl, Map, Set, Promise, setTimeout: () => 0, clearTimeout() {},
    document: { getElementById: (id) => dom.get(id), addEventListener() {}, body: dom.get('body') },
    sb: {}, toast() {}, confirm: () => true, navigator: { onLine: true }, matchMedia: () => ({ matches: false })
  });
  vm.runInContext(read('calendar-domain.js'), context);
  context.UsCalendarDomain = window.UsCalendarDomain;
  const hook = "window.__t={renderSelectedDay,renderDayCell,renderWeekDay,renderEventRow,renderLegend,ownerMarkOf,openDetail,ensureSelectedDate,set:(s)=>{entries=s.entries;profiles=s.profiles;profilesById=new Map(s.profiles.map((p)=>[p.id,p]));selectedDate=s.selectedDate;calendarMode=s.mode;viewYear=2026;viewMonth=8;},get:()=>({selectedDate,detailEntry})};\n";
  const marker = "console.info('[US Calendar] calendario condiviso attivo');";
  assert.ok(calSrc.includes(marker));
  vm.runInContext(calSrc.replace(marker, hook + marker), context);
  window.__t.set({ entries, profiles, selectedDate: selected, mode });
  return { t: window.__t, dom, window, context };
}
const dayCell = (h, dateISO, list) => { const d = new Date(2026, 8, Number(dateISO.slice(8))); return h.t.renderDayCell(d, dateISO, true, list); };

// --- Ownership derivation ---------------------------------------------------

test('M10.1C: ownership marks derive from the existing lane authority — F, B, F+B', () => {
  assert.equal(cal.ownerMarkFor(cal.entryLaneRoleFor({ entry_type: 'personal' }, 'francesco')), 'F');
  assert.equal(cal.ownerMarkFor(cal.entryLaneRoleFor({ entry_type: 'personal' }, 'beatrice')), 'B');
  assert.equal(cal.ownerMarkFor(cal.entryLaneRoleFor({ entry_type: 'shared', owner_id: null }, '')), 'F+B');
  assert.equal(cal.ownerMarkFor('other', 'Marta'), 'M', 'an unknown lane falls back to the name initial, never a wrong F/B');
  assert.equal(cal.ownerMarkFor('other', ''), '·');
  assert.doesNotMatch(calSrc, /owner_mark|ownership_field|owner_initial/, 'no second ownership field');
});

test('M10.1C: a personal Francesco event renders F, a personal Beatrice event B, a shared event F+B', () => {
  const h = load({ entries: [timed(FR.id, 'personal', 15, 'Lavoro'), timed(BE.id, 'personal', 9, 'Università'), timed(FR.id, 'shared', 21, 'Cena')] });
  h.t.renderSelectedDay();
  const out = h.dom.get('usCalendarDaySections').innerHTML;
  const row = (title) => out.match(new RegExp(`<button[^>]*data-entry-id="[^"]+" data-owner="([^"]+)"[^>]*>(?:(?!</button>).)*${title}`))?.[1];
  assert.equal(row('Lavoro'), 'F');
  assert.equal(row('Università'), 'B');
  assert.equal(row('Cena'), 'F+B');
});

test('M10.1C: ownership does not depend on colour, profile order or who is looking', () => {
  const entries = [timed(FR.id, 'personal', 15, 'Lavoro'), timed(BE.id, 'personal', 9, 'Università')];
  for (const role of ['francesco', 'beatrice']) {
    for (const profiles of [[BE, FR], [FR, BE]]) {
      const h = load({ role, profiles, entries });
      assert.equal(h.t.ownerMarkOf(entries[0]), 'F');
      assert.equal(h.t.ownerMarkOf(entries[1]), 'B');
    }
  }
  const h = load({ entries });
  h.t.renderSelectedDay();
  const rows = h.dom.get('usCalendarDaySections').innerHTML;
  assert.doesNotMatch(rows, /us-cal-marker|style=/, 'no colour-only marker, no inline colour');
  // The marker is text inside the row; the CSS colour is only an extra tint for the shared chip.
  assert.match(rows, /<span class="us-cal-owner" aria-hidden="true">F<\/span>/);
  assert.match(css, /\.us-cal-owner\{[^}]*font-weight:800/);
});

test('M10.1C: assistive text names the owner, never only the initial', () => {
  const h = load({ entries: [timed(BE.id, 'personal', 9, 'Università'), timed(FR.id, 'shared', 21, 'Cena'), timed(FR.id, 'personal', 15, 'Palestra', { m: 30 }), allDay(FR.id, 'personal', 'Trasferta')] });
  h.t.renderSelectedDay();
  const out = h.dom.get('usCalendarDaySections').innerHTML;
  assert.match(out, /aria-label="Università, Beatrice, ore 9"/);
  assert.match(out, /aria-label="Cena, Insieme, ore 21"/);
  assert.match(out, /aria-label="Palestra, Francesco, ore 15:30"/);
  assert.match(out, /aria-label="Trasferta, Francesco, tutto il giorno"/);
  assert.match(out, /class="us-cal-owner[^"]*" aria-hidden="true"/, 'the initial itself is hidden from AT');
});

// --- Month grid -------------------------------------------------------------

test('M10.1C: the month cell stays compact — day number, owner markers, +N, never event titles', () => {
  const h = load();
  const list = [timed(FR.id, 'personal', 8, 'Riunione molto lunga con titolo enorme'), timed(FR.id, 'personal', 10, 'Call'), timed(BE.id, 'personal', 9, 'Università'), timed(FR.id, 'shared', 21, 'Cena'), timed(BE.id, 'personal', 12, 'Studio')];
  const cell = dayCell(h, TODAY, list);
  assert.match(cell, /class="us-cal-day-num">30</);
  assert.equal((cell.match(/class="us-cal-chip(?: us-cal-chip--shared)?" aria-hidden/g) || []).length, 3, 'F, B and F+B once each');
  assert.match(cell, /aria-hidden="true">F<\/span>/);
  assert.match(cell, /aria-hidden="true">B<\/span>/);
  assert.match(cell, /us-cal-chip--shared" aria-hidden="true">F\+B</);
  assert.match(cell, /us-cal-chip-more" aria-hidden="true">\+2</, '5 events, 3 distinct owners → +2');
  assert.doesNotMatch(cell, /Riunione|Università|Cena|Studio|Call/, 'no titles inside a month cell');
  const only = dayCell(h, TODAY, [timed(FR.id, 'personal', 8, 'A'), timed(FR.id, 'personal', 9, 'B'), timed(FR.id, 'personal', 10, 'C')]);
  assert.equal((only.match(/us-cal-chip"/g) || []).length, 1, 'one owner, one chip');
  assert.match(only, /\+2</);
  assert.equal(cal.monthCellMarks([]).chips.length, 0);
  assert.deepEqual(cal.monthCellMarks(['B', 'F+B', 'F']), { chips: ['F', 'B', 'F+B'], more: 0 }, 'fixed marker order');
});

test('M10.1C: the month cell label lists owners for assistive tech and marks the selected day', () => {
  const h = load();
  const cell = dayCell(h, TODAY, [timed(BE.id, 'personal', 9, 'Università'), timed(FR.id, 'shared', 21, 'Cena')]);
  assert.match(cell, /aria-label="[^"]*2 impegni: Beatrice, Insieme"/);
  assert.match(cell, /aria-pressed="true"/);
  assert.match(cell, /is-selected/);
  const other = dayCell(h, '2026-09-29', []);
  assert.match(other, /nessun impegno/);
  assert.match(other, /aria-pressed="false"/);
});

// --- Selected day -----------------------------------------------------------

test('M10.1C: the selected day renders title, time and owner, one section per lane that has events', () => {
  const h = load({ entries: [timed(BE.id, 'personal', 9, 'Università', { location: 'Aula 3' }), timed(BE.id, 'personal', 18, 'Studio'), timed(FR.id, 'personal', 15, 'Lavoro'), timed(FR.id, 'shared', 21, 'Cena', { location: 'Da Mario' })] });
  h.t.renderSelectedDay();
  const sections = h.dom.get('usCalendarDaySections').innerHTML;
  assert.deepEqual([...sections.matchAll(/<h4>.*?<\/span>([^<]+)<\/h4>/g)].map((m) => m[1]), ['Beatrice', 'Francesco', 'Insieme']);
  for (const needle of ['09:00 → 10:00', 'Università', 'Aula 3', '18:00 → 19:00', '15:00 → 16:00', 'Lavoro', '21:00 → 22:00', 'Cena', 'Da Mario']) assert.ok(sections.includes(needle), needle);
  assert.equal(h.dom.get('usCalendarDayDetailTitle').textContent, 'Mercoledì 30 settembre');
  assert.equal(h.dom.get('usCalendarDayDetailCount').textContent, '4 impegni');
  assert.equal(h.dom.get('usCalendarDayDetail').hidden, false);
});

test('M10.1C: empty lanes are never fabricated; an empty day says so once', () => {
  const only = load({ entries: [timed(FR.id, 'personal', 15, 'Lavoro')] });
  only.t.renderSelectedDay();
  assert.equal((only.dom.get('usCalendarDaySections').innerHTML.match(/<h4>/g) || []).length, 1);
  assert.doesNotMatch(only.dom.get('usCalendarDaySections').innerHTML, /Niente qui|Beatrice|Insieme/);
  const empty = load();
  empty.t.renderSelectedDay();
  assert.match(empty.dom.get('usCalendarDaySections').innerHTML, /Niente in programma\./);
  assert.equal(empty.dom.get('usCalendarDayDetailCount').textContent, '');
});

test('M10.1C: several events stay readable — sorted all-day first then by time, all-day and long titles/places kept whole', () => {
  const long = 'Seminario di storia dell’arte contemporanea con esposizione finale e discussione di gruppo';
  const h = load({ entries: [timed(FR.id, 'personal', 17, 'Palestra'), timed(FR.id, 'personal', 8, 'Riunione'), allDay(FR.id, 'personal', 'Compleanno di Marta'), timed(FR.id, 'personal', 12, long, { location: 'Dipartimento di Lettere, Aula Magna, primo piano' }), timed(BE.id, 'personal', 9, 'Uni'), timed(FR.id, 'shared', 21, 'Cena')] });
  h.t.renderSelectedDay();
  const out = h.dom.get('usCalendarDaySections').innerHTML;
  const francesco = out.split('<section').find((s) => s.includes('>Francesco<'));
  assert.deepEqual([...francesco.matchAll(/us-cal-event-title">([^<]+)</g)].map((m) => m[1]), ['Compleanno di Marta', 'Riunione', long, 'Palestra']);
  assert.match(francesco, /us-cal-event-time">Tutto il giorno</);
  assert.ok(out.includes(long) && out.includes('Dipartimento di Lettere, Aula Magna, primo piano'), 'nothing truncated in the markup');
  assert.match(css, /\.us-cal-event-title\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.us-cal-event\{[^}]*min-height:60px/);
  assert.doesNotMatch(css.match(/\.us-cal-event-title\{[^}]*\}/)[0], /white-space:nowrap|text-overflow/, 'titles wrap, they are not ellipsised');
  assert.deepEqual(cal.sortDayEntries([{ title: 'b', is_all_day: false, starts_at: at(10) }, { title: 'a', is_all_day: true }, { title: 'c', is_all_day: false, starts_at: at(9) }]).map((e) => e.title), ['a', 'c', 'b']);
});

test('M10.1C: tapping an event opens the existing detail → edit flow, never a day-level edit', () => {
  const entry = timed(BE.id, 'personal', 9, 'Università');
  const h = load({ entries: [entry, timed(FR.id, 'personal', 15, 'Lavoro')] });
  h.t.renderSelectedDay();
  const buttons = h.dom.get('usCalendarDaySections').querySelectorAll('[data-entry-id]');
  assert.equal(buttons.length, 2);
  // The month cell only selects; only "Aggiungi impegno" creates.
  assert.match(calSrc, /addEventListener\('click', \(\) => selectDay\(btn\.dataset\.date\)\)/);
  assert.match(calSrc, /\$\('usCalendarAddEntry'\)\?\.addEventListener\('click', \(\) => startCreateForDate\(selectedDate \|\| todayISO\(\)\)\)/);
  buttons.find((b) => b.dataset.entryId === entry.id).click();
  assert.equal(h.t.get().detailEntry.id, entry.id, 'the detail sheet holds that exact event');
  assert.equal(h.dom.get('usCalendarDetailSheet').classList.contains('open'), true);
  assert.match(calSrc, /\$\('usCalendarDetailEdit'\)\?\.addEventListener\('click', \(\) => \{ if \(detailEntry\) openForm\('edit', detailEntry\); \}\)/, 'Modifica goes through the existing edit form');
});

test('M10.1C: "Aggiungi impegno" is the explicit create affordance; no floating +', () => {
  assert.match(html, /<button type="button" class="us-cal-add" id="usCalendarAddEntry">Aggiungi impegno<\/button>/);
  assert.doesNotMatch(html, /usCalendarAddBtn|us-cal-fab/);
  assert.doesNotMatch(calSrc, /us-cal-fab/);
  assert.ok(html.indexOf('id="usCalendarDayDetail"') > html.indexOf('id="usCalendarGrid"'), 'detail sits under the month grid');
  assert.match(css, /\.us-cal-add\{[^}]*min-height:44px/);
});

test('M10.1C/US 1.0: quick create collects presets/title, all-day and explicit start/end; authority is unchanged', () => {
  const form = html.match(/<form class="us-cal-form" id="usCalendarForm">[\s\S]*?<\/form>/)[0];
  const inputs = [...form.matchAll(/<(?:input|textarea|select)[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(inputs, ['usCalendarTitleInput', 'usCalendarDateInput', 'usCalendarAllDayInput', 'usCalendarStartTimeInput', 'usCalendarEndTimeInput'], 'date input is edit-only; timed entries expose a compact range');
  assert.doesNotMatch(form, /Durata|duration|Ricordamelo|reminder|<textarea|Nota/i);
  assert.match(calSrc, /calendarKind = mode === 'edit' \? entry\.entry_type : 'personal';/);
  assert.match(calSrc, /const kind = ideaLink \? 'shared' : calendarKind;/);
  assert.equal(cal.withCreateAuthority({}, 'personal', { id: 'me', couple_id: 'c' }).owner_id, 'me');
  const shared = cal.withCreateAuthority({}, 'shared', { id: 'me', couple_id: 'c' });
  assert.equal(shared.entry_type, 'shared');
  assert.equal(shared.owner_id, null);
});

test('M10.1C: Da vivere still picks the day on the calendar and opens the shared linked form', () => {
  const sel = calSrc.match(/function selectDay\(dateISO\) \{[\s\S]*?\n\}/)[0];
  assert.match(sel, /if \(pendingIdeaPick\) \{ openIdeaForm\(pendingIdeaPick, dateISO\); return; \}/);
  assert.match(calSrc, /calendarKind = 'shared';/);
});

test('M10.1C: month mode always keeps a selected day inside the visible grid (today, else the 1st)', () => {
  const now = new Date();
  const todayInView = now.getFullYear() === 2026 && now.getMonth() === 8;
  const h = load({ selected: null });
  h.t.ensureSelectedDate();
  assert.equal(h.t.get().selectedDate, todayInView ? cal.localDateFromInstant(now.toISOString()) : '2026-09-01');
  const h2 = load({ selected: '2026-09-12' });
  h2.t.ensureSelectedDate();
  assert.equal(h2.t.get().selectedDate, '2026-09-12', 'a selection inside the grid is kept');
  const h3 = load({ selected: '2026-12-25' });
  h3.t.ensureSelectedDate();
  assert.notEqual(h3.t.get().selectedDate, '2026-12-25', 'a stale selection outside the grid is replaced');
  assert.match(h3.t.get().selectedDate, /^2026-09-/);
});

// --- Week view + Tempo insieme ----------------------------------------------

test('M10.1C: the week view uses the same F / B / F+B rows and keeps Tempo insieme', () => {
  const entries = [timed(FR.id, 'personal', 15, 'Lavoro'), timed(BE.id, 'personal', 9, 'Università'), timed(FR.id, 'shared', 21, 'Cena')];
  const h = load({ entries, mode: 'week' });
  const day = h.t.renderWeekDay(TODAY, entries, [BE, FR]);
  assert.match(day, /data-owner="F"/);
  assert.match(day, /data-owner="B"/);
  assert.match(day, /data-owner="F\+B"/);
  assert.match(day, /aria-label="Cena, Insieme, ore 21"/);
  assert.match(day, /class="us-cal-tempo/);
  assert.match(day, /Tempo insieme/);
  assert.match(day, /<section class="us-cal-day-section" data-lane="shared"><h4>Insieme<\/h4>/, 'the week keeps its per-lane sections');
  h.t.renderSelectedDay();
  assert.equal(h.dom.get('usCalendarDayDetail').hidden, true, 'the selected-day detail belongs to the month view only');
});

test('M10.1C: Tempo insieme under the selected day comes from computeFreeTogether, unchanged', () => {
  const h = load({ entries: [timed(BE.id, 'personal', 9, 'Università'), timed(FR.id, 'personal', 15, 'Lavoro')] });
  h.t.renderSelectedDay();
  const tempo = h.dom.get('usCalendarDayTempo').innerHTML;
  assert.match(tempo, /Tempo insieme/);
  assert.match(tempo, /fino alle 09:00/);
  assert.match(tempo, /10:00 – 15:00/);
  assert.match(tempo, /dopo le 16:00/);
  assert.match(calSrc, /UsCalendarDomain\.computeFreeTogether\(/);
  assert.equal((calSrc.match(/function computeFreeTogether/g) || []).length, 0, 'the algorithm is not re-implemented in calendar.js');
});

test('M10.1C: the legend explains the markers in text', () => {
  const h = load();
  h.t.renderLegend();
  const legend = h.dom.get('usCalendarLegend').innerHTML;
  assert.match(legend, />B<\/span>Beatrice/);
  assert.match(legend, />F<\/span>Francesco/);
  assert.match(legend, />F\+B<\/span>Insieme/);
});

test('M10.1C: no calendar backend change — same table, same read filter, no new migration', () => {
  assert.equal((calSrc.match(/sb\.from\('calendar_entries'\)/g) || []).length >= 3, true);
  assert.match(calSrc, /UsCalendarDomain\.buildRangeOverlapFilter\(win\)/);
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations_history'));
  assert.ok(!migrations.some((m) => /m10_1|m101/.test(m)), 'M10.1 adds no migration');
});

// --- M10.1 final correction: ONE shared month at every width ----------------

test('M10.1: one month grid — no per-partner months, no duplicated shared events', () => {
  assert.equal((html.match(/class="us-cal-grid"/g) || []).length, 1);
  assert.doesNotMatch(html, /usCalendarGridA|usCalendarGridB|usCalendarPaneWide|usCalendarWideHead|usCalendarGridMobile/);
  assert.doesNotMatch(calSrc, /renderWideGrids|renderMobileGrid|roleFilter|usCalendarGridA/);
  assert.doesNotMatch(css, /us-cal-pane-wide|us-cal-pane-mobile|us-cal-pane-col|us-cal-pane-head/);
  const monthCalls = calSrc.match(/renderMonthGrid\(dateIndex\);/g) || [];
  assert.equal(monthCalls.length, 1, 'the month is rendered exactly once per refresh');
});

test('M10.1: F, B and F+B coexist in the single month and a shared event is one marker, not two', () => {
  const h = load();
  const shared = timed(FR.id, 'shared', 21, 'Cena');
  const list = [timed(FR.id, 'personal', 15, 'Lavoro'), timed(BE.id, 'personal', 9, 'Università'), shared];
  const cell = dayCell(h, TODAY, list);
  assert.deepEqual([...cell.matchAll(/us-cal-chip(?: us-cal-chip--shared)?" aria-hidden="true">([^<]+)</g)].map((m) => m[1]), ['F', 'B', 'F+B']);
  // A shared event appears once in the day agenda, never in a "Francesco" copy plus a "Beatrice" copy.
  const h2 = load({ entries: list });
  h2.t.renderSelectedDay();
  const out = h2.dom.get('usCalendarDaySections').innerHTML;
  assert.equal((out.match(/Cena/g) || []).length, 2, 'title + aria-label of ONE row');
  assert.equal((out.match(new RegExp(`data-entry-id="${shared.id}"`, 'g')) || []).length, 1);
});

test('M10.1: wide screens make the one month roomier and let the day detail use the width', () => {
  const wide = css.match(/@media\(min-width:860px\)\{[\s\S]*?\n\}/)[0];
  assert.match(wide, /\.us-cal-surface\{width:min\(760px,100%\)/, 'sensible max width for readability');
  assert.match(wide, /\.us-cal-pane-month\{max-width:680px/);
  assert.match(wide, /\.us-cal-day\{min-height:64px/);
  assert.match(wide, /\.us-cal-chip\{height:15px/);
  assert.match(wide, /\.us-cal-day-detail \.us-cal-day-sections\{grid-template-columns:repeat\(auto-fit,minmax\(280px,1fr\)\)/);
  assert.ok(html.indexOf('id="usCalendarDayDetail"') > html.indexOf('id="usCalendarGrid"'), 'detail stays below the month');
});
