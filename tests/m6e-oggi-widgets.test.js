const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const cal = require('../calendar.js');
const domain = require('../calendar-domain.js');

const html = () => read('index.html');
const js = () => read('calendar.js');
const appJs = () => read('app.js');

const day = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
const DAY = '2026-09-29'; // a Tuesday
const roleOf = (e) => e.role;

function tempoWindows(entries, dateISO, minDurationMinutes = 30) {
  const partition = cal.partitionDayBusy(entries, dateISO, roleOf);
  const win = cal.windowForGrid(new Date(2026, 8, 29), new Date(2026, 8, 30));
  return domain.computeFreeTogether({
    windowStart: win.windowStartAt,
    windowEnd: win.windowEndAt,
    personABusy: partition.personABusy,
    personBBusy: partition.personBBusy,
    sharedEvents: partition.sharedEvents,
    minDurationMinutes
  });
}

// ---------------------------------------------------------------------------
// Pure fact composition — lives in calendar.js, reuses computeFreeTogether via
// the caller-supplied freeWindows; never reimplements merge/complement.

test('M6E (1): a fully free day composes a free-all-day fact', () => {
  const fact = cal.composeOggiCalendarFact({
    dayStartISO: DAY,
    dayEndISO: '2026-09-30',
    personA: { name: 'Beatrice', entries: [] },
    personB: { name: 'Francesco', entries: [] },
    freeWindows: tempoWindows([], DAY),
    nextTogetherDateISO: null
  });
  assert.equal(fact.type, 'free-all-day');
  assert.equal(fact.dateISO, DAY);
});

test('M6E (2): both partners with events today composes an events fact naming both', () => {
  const entries = [
    { id: 'a', entry_type: 'personal', role: 'francesco', is_all_day: false, starts_at: day(2026, 9, 29, 18, 0), ends_at: day(2026, 9, 29, 19, 0), title: 'Palestra' },
    { id: 'b', entry_type: 'personal', role: 'beatrice', is_all_day: false, starts_at: day(2026, 9, 29, 20, 0), ends_at: day(2026, 9, 29, 22, 0), title: 'Cena' }
  ];
  const fact = cal.composeOggiCalendarFact({
    dayStartISO: DAY,
    dayEndISO: '2026-09-30',
    personA: { name: 'Beatrice', entries: [entries[1]] },
    personB: { name: 'Francesco', entries: [entries[0]] },
    freeWindows: tempoWindows(entries, DAY),
    nextTogetherDateISO: null,
    nowISO: day(2026, 9, 29, 9, 0)
  });
  assert.equal(fact.type, 'events');
  assert.match(fact.detail, /Beatrice/);
  assert.match(fact.detail, /Francesco/);
  assert.match(fact.detail, /Cena/);
  assert.match(fact.detail, /Palestra/);
  assert.deepEqual(fact.rows.map(({ kind, label, value }) => ({ kind, label, value })), [
    { kind: 'person', label: 'Beatrice', value: 'Cena 20:00–22:00' },
    { kind: 'person', label: 'Francesco', value: 'Palestra 18:00–19:00' },
    { kind: 'together', label: 'Insieme', value: '09:00 – 18:00' }
  ]);
});

test('M6E (3): a fully double-booked day with no shared window composes a next-together fact from the forward scan', () => {
  const entries = [
    { id: 'a', entry_type: 'shared', is_all_day: true, start_date: DAY, end_date: DAY, title: 'Tutto il giorno' }
  ];
  const fact = cal.composeOggiCalendarFact({
    dayStartISO: DAY,
    dayEndISO: '2026-09-30',
    personA: { name: 'Beatrice', entries },
    personB: { name: 'Francesco', entries },
    freeWindows: tempoWindows(entries, DAY),
    nextTogetherDateISO: '2026-10-02'
  });
  assert.equal(fact.type, 'next-together');
  assert.equal(fact.dateISO, '2026-10-02');
});

test('M6E (4): a busy day with no forward slot found falls back to the events fact rather than a false claim', () => {
  const entries = [
    { id: 'a', entry_type: 'shared', is_all_day: true, start_date: DAY, end_date: DAY, title: 'Tutto il giorno' }
  ];
  const fact = cal.composeOggiCalendarFact({
    dayStartISO: DAY,
    dayEndISO: '2026-09-30',
    personA: { name: 'Beatrice', entries },
    personB: { name: 'Francesco', entries },
    freeWindows: tempoWindows(entries, DAY),
    nextTogetherDateISO: null
  });
  assert.equal(fact.type, 'events');
});

test('M6E (5): the fact composer and forward-scan orchestration reuse computeFreeTogether/partitionDayBusy — no reimplementation', () => {
  assert.doesNotMatch(js(), /function (mergeIntervals|complementIntervals|computeFreeTogether)\b/);
  assert.match(js(), /function composeOggiCalendarFact\(/);
  assert.match(js(), /async function getOggiCalendarInsightSource\(/);
  const source = js().match(/async function getOggiCalendarInsightSource\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(source, /partitionDayBusy\(/);
  assert.match(source, /UsCalendarDomain\.computeFreeTogether\(/);
  assert.match(source, /composeOggiCalendarFact\(/);
  // the network read itself is shared with the day/forward-scan helpers below
  // it, reusing buildRangeOverlapFilter + filterEntriesInWindow exactly once.
  assert.match(js(), /function fetchEntriesForRange\(/);
  const fetchSource = js().match(/async function fetchEntriesForRange\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(fetchSource, /UsCalendarDomain\.buildRangeOverlapFilter\(/);
  assert.match(fetchSource, /UsCalendarDomain\.filterEntriesInWindow\(/);
  assert.match(js(), /window\.getOggiCalendarInsightSource\s*=\s*getOggiCalendarInsightSource/);
});

// ---------------------------------------------------------------------------
// openCalendarSurface adapted narrowly: an optional target date opens the
// calendar and lands on that day's sheet; the existing no-arg callers must be
// completely unaffected (structural — behavioral coverage lives in the M6B
// suite already exercising the no-arg path).

test('M6E (6): openCalendarSurface accepts an optional target date and opens straight to that day, without breaking no-arg callers', () => {
  const source = js().match(/async function openCalendarSurface\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(source, /const targetDateISO = arguments\[0\]/);
  assert.match(source, /if \(targetDateISO\)/);
  assert.match(source, /weekStartISO = mondayOfISO\(targetDateISO\)/);
  assert.match(source, /selectedDate = targetDateISO;/);
  // existing zero-arg call site (HTML onclick) stays untouched
  assert.match(html(), /onclick="openCalendarSurface\(\)"/);
});

// ---------------------------------------------------------------------------
// Home/Oggi markup: exactly one new small widget region, inside the hero,
// capped alongside the two pre-existing overlay widgets (distance + push).

test('M6E (7): the Oggi hero gains exactly one new widget region, positioned inside the existing hero', () => {
  const hero = html().match(/<section class="hero home-hero-only" id="homeHero"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(hero, /id="usOggiCalendarWidget"/);
  assert.match(hero, /id="distanceWidget"/, 'the existing distance widget must still be present');
  assert.match(hero, /id="pushOptInCard"/, 'the existing push opt-in card must still be present');
  assert.equal((hero.match(/id="usOggiCalendarWidget"/g) || []).length, 1);
});

test('M6E (8): the widget region is not a fourth bottom-nav destination and does not touch Calendar\'s own markup', () => {
  assert.doesNotMatch(html(), /data-page="oggi-widget"/);
  assert.match(html(), /id="usCalendarOverlay"/, 'the existing calendar overlay markup is untouched');
});

// ---------------------------------------------------------------------------
// Render + Focus Photo behavior — the app.js runtime is small and pure enough
// to run in a vm sandbox with a fake DOM, mirroring the existing M2 harness.

function oggiWidgetRuntimeSource() {
  const source = appJs();
  const start = source.indexOf('function renderOggiCalendarWidget(');
  const end = source.indexOf('async function loginAccount()', start);
  assert.notEqual(start, -1, 'app.js must implement the Oggi widget runtime');
  assert.notEqual(end, -1, 'the Oggi widget runtime must stay a focused block ending before loginAccount');
  return source.slice(start, end);
}

function fakeElement(overrides = {}) {
  const el = {
    hidden: true,
    innerHTML: '',
    className: '',
    attributes: new Set(),
    listeners: new Map(),
    classList: {
      list: new Set(),
      add(c) { this.list.add(c); },
      remove(c) { this.list.delete(c); },
      toggle(c, force) {
        const on = force === undefined ? !this.list.has(c) : force;
        if (on) this.list.add(c); else this.list.delete(c);
        return on;
      },
      contains(c) { return this.list.has(c); }
    },
    setAttribute(name) { this.attributes.add(name); },
    removeAttribute(name) { this.attributes.delete(name); },
    hasAttribute(name) { return this.attributes.has(name); },
    addEventListener(type, fn) { this.listeners.set(type, fn); },
    querySelectorAll() { return []; },
    ...overrides
  };
  return el;
}

function installOggiWidgetRuntime() {
  const hero = fakeElement();
  const widget = fakeElement();
  const distance = fakeElement();
  const pushCard = fakeElement();
  const elements = { homeHero: hero, usOggiCalendarWidget: widget, distanceWidget: distance, pushOptInCard: pushCard };
  const calls = [];
  const window = { openCalendarSurface: (dateISO) => calls.push(['open', dateISO]) };
  const context = vm.createContext({
    console: { warn() {} },
    document: {
      getElementById: (id) => elements[id] || null
    },
    escapeHtml: (v) => String(v),
    window
  });
  vm.runInContext(oggiWidgetRuntimeSource(), context);
  return { hero, widget, distance, pushCard, calls, window: context.window };
}

test('M6E (9): the widget renders a tappable card that carries the fact\'s date, and hides cleanly with no data', () => {
  const rt = installOggiWidgetRuntime();
  rt.window.UsOggiCalendarWidget?.render?.(null);
  assert.equal(rt.widget.hidden, true);
  assert.equal(rt.widget.innerHTML, '');

  rt.window.UsOggiCalendarWidget?.render?.({
    type: 'events',
    title: 'Oggi',
    detail: 'Beatrice: Cena 20:00–22:00',
    rows: [
      { kind: 'person', label: 'Beatrice', value: 'Cena 20:00–22:00' },
      { kind: 'person', label: 'Francesco', value: 'Nessun impegno' },
      { kind: 'together', label: 'Insieme', value: 'dopo le 22:00' }
    ],
    dateISO: '2026-09-29'
  });
  assert.equal(rt.widget.hidden, false);
  assert.match(rt.widget.innerHTML, /data-us-oggi-date="2026-09-29"/);
  assert.match(rt.widget.innerHTML, /us-oggi-card-lines/);
  assert.match(rt.widget.innerHTML, /Beatrice/);
  assert.match(rt.widget.innerHTML, /Francesco/);
  assert.match(rt.widget.innerHTML, /Insieme/);
  assert.match(rt.widget.innerHTML, /Nessun impegno/);
});

test('M6E (10): tapping the rendered widget opens the Calendar on the exact date carried by the fact', () => {
  const rt = installOggiWidgetRuntime();
  rt.window.UsOggiCalendarWidget?.render?.({ type: 'events', title: 'Oggi', detail: 'Cena', dateISO: '2026-10-02' });
  const click = rt.widget.listeners.get('click');
  assert.ok(click, 'the widget container must register a click delegate');
  const button = { dataset: { usOggiDate: '2026-10-02' } };
  click({ target: { closest: (sel) => (sel === '[data-us-oggi-date]' ? button : null) } });
  assert.deepEqual(rt.calls, [['open', '2026-10-02']]);
});

test('M6E (11): a click on the hero background toggles Focus Photo; widget/distance/push taps never toggle it', () => {
  assert.match(oggiWidgetRuntimeSource(), /function oggiIsWidgetTarget\(/);
  assert.match(oggiWidgetRuntimeSource(), /function toggleOggiFocusPhoto\(/);
  assert.match(oggiWidgetRuntimeSource(), /us-oggi-widgets/);
  assert.match(oggiWidgetRuntimeSource(), /home-distance-pill/);
  assert.match(oggiWidgetRuntimeSource(), /push-optin-card/);
});

test('M6E (12): Focus Photo makes the widget layer inert (no pointer/keyboard interaction) and restores it on the second tap', () => {
  const source = oggiWidgetRuntimeSource();
  assert.match(source, /setAttribute\('inert', ?''\)/);
  assert.match(source, /removeAttribute\('inert'\)/);
});

test('M6E (13): styles fade the exact three hero widgets under Focus Photo, and reduced motion drops the transition', () => {
  const css = read('styles.css');
  assert.match(css, /\.us-oggi-focus[^{]*\{[^}]*opacity:0[^}]*pointer-events:none/s);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[^}]*us-oggi[^}]*transition:none/s);
});

test('M6E polish: mobile Oggi widget sits just below the safe-area-aware top bar without changing desktop positioning', () => {
  // M10A: the same offsets now position the Oggi stack that holds the widget.
  const css = read('styles.css');
  assert.match(css, /\.us-oggi-stack\{[^}]*top:calc\(var\(--us-top-chrome-clearance\) \+ 64px\)/);
  const mobile = css.match(/@media\(max-width:600px\)\{[^}]*\.us-oggi-stack\{[^}]*\}\}/)?.[0] || '';
  assert.match(mobile, /top:calc\(var\(--us-top-chrome-height\) \+ 20px\)/);
  assert.match(read('ui-foundation.css'), /--us-safe-top:var\(--safe-area-inset-top,env\(safe-area-inset-top,0px\)\)/);
});

// ---------------------------------------------------------------------------
// P2 accuracy fixes: never advertise a person's already-ended event, and never
// advertise a shared free window (or part of one) that has already elapsed.

test('M6E (14): oggiEventLabel ignores an already-ended event, prefers ongoing/next-upcoming, and reports free when everything is in the past', () => {
  const entries = [
    { id: 'past', is_all_day: false, starts_at: day(2026, 9, 29, 8, 0), ends_at: day(2026, 9, 29, 9, 0), title: 'Colazione' },
    { id: 'next', is_all_day: false, starts_at: day(2026, 9, 29, 18, 0), ends_at: day(2026, 9, 29, 19, 0), title: 'Palestra' }
  ];
  const nowMs = new Date(day(2026, 9, 29, 12, 0)).getTime();
  const label = cal.oggiEventLabel(entries, nowMs);
  assert.match(label, /Palestra/);
  assert.doesNotMatch(label, /Colazione/);

  const allPastMs = new Date(day(2026, 9, 29, 23, 0)).getTime();
  assert.equal(cal.oggiEventLabel([entries[0]], allPastMs), 'Libera');

  // an event currently in progress still wins over a later upcoming one
  const ongoing = [
    { id: 'now', is_all_day: false, starts_at: day(2026, 9, 29, 11, 30), ends_at: day(2026, 9, 29, 12, 30), title: 'Call' },
    { id: 'later', is_all_day: false, starts_at: day(2026, 9, 29, 18, 0), ends_at: day(2026, 9, 29, 19, 0), title: 'Palestra' }
  ];
  assert.match(cal.oggiEventLabel(ongoing, nowMs), /Call/);
});

test('M6E (15): composeOggiCalendarFact never advertises a free window that has already ended, and clips a spanning window\'s start up to now', () => {
  const entries = [{ id: 'x', entry_type: 'personal', role: 'francesco', is_all_day: false, starts_at: day(2026, 9, 29, 7, 0), ends_at: day(2026, 9, 29, 8, 0), title: 'Corsa' }];
  const nowISO = day(2026, 9, 29, 12, 0);

  // a window fully in the past must be discarded — the caller's forward scan wins instead
  const pastOnly = cal.composeOggiCalendarFact({
    dayStartISO: DAY, dayEndISO: '2026-09-30',
    personA: { name: 'Beatrice', entries }, personB: { name: 'Francesco', entries },
    freeWindows: [{ start: day(2026, 9, 29, 8, 0), end: day(2026, 9, 29, 10, 0) }],
    nextTogetherDateISO: '2026-10-02',
    nowISO
  });
  assert.equal(pastOnly.type, 'next-together');
  assert.equal(pastOnly.dateISO, '2026-10-02');

  // a window spanning "now" must be clipped to start at now, never advertising the elapsed part
  const spanning = cal.composeOggiCalendarFact({
    dayStartISO: DAY, dayEndISO: '2026-09-30',
    personA: { name: 'Beatrice', entries }, personB: { name: 'Francesco', entries },
    freeWindows: [{ start: day(2026, 9, 29, 8, 0), end: day(2026, 9, 29, 20, 0) }],
    nextTogetherDateISO: null,
    nowISO
  });
  assert.equal(spanning.type, 'events');
  assert.match(spanning.detail, /12:00 – 20:00/);
  assert.doesNotMatch(spanning.detail, /08:00/);
});

test('M6E (16): the pure clipping helper is reused (not reimplemented) by both the composer and its orchestrator', () => {
  assert.match(js(), /function oggiRemainingWindows\(/);
  assert.match(js(), /oggiEventLabel, composeOggiCalendarFact, oggiRemainingWindows/);
  const composeSrc = js().match(/function composeOggiCalendarFact\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(composeSrc, /oggiRemainingWindows\(/);
  const sourceSrc = js().match(/async function getOggiCalendarInsightSource\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(sourceSrc, /oggiRemainingWindows\(/);
});

// ---------------------------------------------------------------------------
// P1 identity/concurrency: a request bound to a profile/couple that changes
// mid-flight must never surface stale data, and must never leak because the
// profile went null while a request was outstanding.

test('M6E (17): refreshOggiCalendarWidget never renders a result whose profile/couple changed while the request was in flight, and clears the previously-shown card', async () => {
  const widget = fakeElement();
  const elements = { homeHero: fakeElement(), usOggiCalendarWidget: widget, distanceWidget: fakeElement(), pushOptInCard: fakeElement() };
  let resolveFirst;
  const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
  const window = { usProfile: { id: 'me', couple_id: 'couple-A' }, getOggiCalendarInsightSource: () => firstPromise };
  const context = vm.createContext({ console: { warn() {} }, document: { getElementById: (id) => elements[id] || null }, escapeHtml: (v) => String(v), window });
  vm.runInContext(oggiWidgetRuntimeSource(), context);

  // seed an old card as if a prior successful refresh had already rendered it
  context.window.UsOggiCalendarWidget.render({ type: 'events', title: 'Oggi', detail: 'Old card from couple-A', dateISO: '2026-09-29' });
  assert.match(widget.innerHTML, /Old card/);

  const refreshPromise = context.window.refreshOggiCalendarWidget();
  context.window.usProfile = { id: 'other', couple_id: 'couple-B' }; // re-pair/relogin mid-flight
  resolveFirst({ type: 'events', title: 'Oggi', detail: 'Stale data from couple-A', dateISO: '2026-09-29' });
  await refreshPromise;

  assert.doesNotMatch(widget.innerHTML, /Stale data/, 'a request whose identity changed mid-flight must never render');
  assert.doesNotMatch(widget.innerHTML, /Old card/, 'the stale card left from before the identity change must be cleared, not left on screen');
  assert.equal(widget.hidden, true);
});

test('M6E (18): refreshOggiCalendarWidget invalidates any pending request the instant the profile becomes null, and clears a previously-visible card', async () => {
  const widget = fakeElement();
  const elements = { homeHero: fakeElement(), usOggiCalendarWidget: widget, distanceWidget: fakeElement(), pushOptInCard: fakeElement() };
  let resolveFirst;
  const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
  const window = { usProfile: { id: 'me', couple_id: 'couple-A' }, getOggiCalendarInsightSource: () => firstPromise };
  const context = vm.createContext({ console: { warn() {} }, document: { getElementById: (id) => elements[id] || null }, escapeHtml: (v) => String(v), window });
  vm.runInContext(oggiWidgetRuntimeSource(), context);

  // seed a visible card before the logout mid-flight
  context.window.UsOggiCalendarWidget.render({ type: 'events', title: 'Oggi', detail: 'Visible card before logout', dateISO: '2026-09-29' });
  assert.equal(widget.hidden, false);

  const refreshPromise = context.window.refreshOggiCalendarWidget();
  context.window.usProfile = null; // logout mid-flight
  resolveFirst({ type: 'events', title: 'Oggi', detail: 'Should never render', dateISO: '2026-09-29' });
  await refreshPromise;

  assert.doesNotMatch(widget.innerHTML, /Should never render/);
  assert.doesNotMatch(widget.innerHTML, /Visible card before logout/, 'the previously-visible card must be cleared on logout, not left on screen');
  assert.equal(widget.hidden, true);
});

test('M6E (19): getOggiCalendarInsightSource captures the couple id once and never re-reads the mutable global mid-flight', () => {
  const source = js().match(/async function getOggiCalendarInsightSource\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(source, /const profile = window\.usProfile/);
  assert.match(source, /const coupleId = profile\.couple_id/);
  assert.match(source, /sameIdentity\(\)/);
  assert.doesNotMatch(source, /window\.usProfile\.couple_id\)/, 'must use the captured coupleId, not re-read the mutable global');
  const fetchSrc = js().match(/async function fetchEntriesForRange\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(fetchSrc, /function fetchEntriesForRange\(coupleId,/);
  const findSrc = js().match(/async function findNextTogetherDate\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(findSrc, /function findNextTogetherDate\(coupleId,/);
});

// ---------------------------------------------------------------------------
// P2 Calendar open/close race: a generation token makes a date-target open
// cancellation-safe against a subsequent close or newer open.

test('M6E (20): M10.1C — the date target is selected up-front; no stale day-sheet opener remains', () => {
  const source = js();
  assert.doesNotMatch(source, /calendarOpenToken|openDaySheet/);
  const openSrc = source.match(/async function openCalendarSurface\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(openSrc, /selectedDate = targetDateISO;/);
  assert.doesNotMatch(openSrc, /await[^\n]*\n[^\n]*selectedDate = targetDateISO/, 'selection happens before any await');
});

// ---------------------------------------------------------------------------
// P2 accessibility: a keyboard/AT-operable Focus Photo toggle, without adding
// a second visible dashboard control.

test('M6E (21): the hero gains a visually hidden, keyboard-operable Focus Photo toggle with an accessible name and pressed state', () => {
  const hero = html().match(/<section class="hero home-hero-only" id="homeHero"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(hero, /id="usOggiFocusToggle"/);
  assert.match(hero, /<button[^>]*id="usOggiFocusToggle"[^>]*class="us-oggi-focus-toggle"[^>]*aria-pressed="false"[^>]*aria-label="[^"]+"/);
  assert.match(read('styles.css'), /\.us-oggi-focus-toggle\{[^}]*clip:rect\(0,0,0,0\)/);
});

test('M6E (22): the Focus Photo toggle button updates aria-pressed and is excluded from the widget-tap exclusion list, without a second click handler that would double-toggle', () => {
  const source = oggiWidgetRuntimeSource();
  assert.match(source, /usOggiFocusToggle['"]\)\?\.setAttribute\('aria-pressed'/);
  assert.doesNotMatch(source, /usOggiFocusToggle['"]\)\?\.addEventListener\('click'/, 'the toggle button must rely on the single hero click delegate, never a second click listener (that would double-toggle)');
  assert.doesNotMatch(source, /oggiIsWidgetTarget[\s\S]{0,400}usOggiFocusToggle/, 'the toggle button itself must not be excluded from the toggle it triggers');
});
