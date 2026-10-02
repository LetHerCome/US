// M12A.1 — canonical US identity in the shell, a more present aurora, and Eventi as a Noi surface.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const topBar = html.match(/<div class="top us-premium-top">[\s\S]*?<\/div>\s*<main id="home"/)?.[0] || '';
const foundation = read('ui-foundation.css');
const CANONICAL = 'assets/derived/brand/us-symbol-apk-foreground-v1.png';

// ---------------------------------------------------------------- TOP BAR

test('top bar: the centre is the canonical identity used by the PWA icon and launcher, not a UI variant', () => {
  assert.match(topBar, new RegExp(`<div class="us-top-brand" role="img" aria-label="US"><img class="us-top-brand-art" src="/${CANONICAL}"`));
  assert.doesNotMatch(html, /us-symbol-ui-crisp-v1/, 'the old UI logo is used nowhere');
  assert.doesNotMatch(read('service-worker.js'), /us-symbol-ui-crisp-v1/);
  const webManifest = JSON.parse(read('manifest.webmanifest'));
  assert.ok(webManifest.icons.some((icon) => icon.src.startsWith(`/${CANONICAL}`)), 'the same asset is a PWA manifest icon');
  assert.match(html, new RegExp(`rel="icon"[^>]+href="/${CANONICAL}`));
  // The approved file is byte-identical to the Android adaptive foreground: never modified.
  assert.deepEqual(fs.readFileSync(path.join(ROOT, CANONICAL)), fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/drawable-nodpi/us_adaptive_foreground_v1.png')));
});

test('top bar: accessible, inert, centred, and still three balanced zones', () => {
  assert.match(topBar, /class="us-top-brand" role="img" aria-label="US"/);
  assert.match(topBar, /class="us-top-brand-art"[^>]*alt="" aria-hidden="true"/);
  const css = read('identity.css');
  assert.match(css, /\.top\.us-premium-top \.us-top-brand\{grid-column:2;[^}]*overflow:hidden;pointer-events:none/);
  assert.match(css, /\.us-top-brand-art\{[^}]*height:58px;width:58px/, 'the square mark is cropped inside the 38px bar slot');
  assert.ok(topBar.indexOf('id="usPerVoiTop"') < topBar.indexOf('us-top-brand') && topBar.indexOf('us-top-brand') < topBar.indexOf('id="leftForYouPartnerEntry"'));
});

// ---------------------------------------------------------------- AURORA

test('aurora: visibility is tunable from two tokens, clearly raised, CSS only', () => {
  const tokens = foundation.match(/--us-aurora-ambient:([\d.]+);--us-aurora-react:([\d.]+)/);
  assert.ok(tokens, 'ambient + reaction visibility tokens exist');
  const [ambient, react] = [Number(tokens[1]), Number(tokens[2])];
  assert.ok(ambient >= 0.5 && ambient <= 0.75, `ambient ${ambient} is visible but not loud`);
  assert.ok(react > ambient && react <= 1, 'the reaction is stronger than the ambient state');
  assert.match(foundation, /opacity:var\(--us-aurora-opacity,var\(--us-aurora-ambient\)\)/);
  assert.match(foundation, /\[data-us-aurora="react"\] \.us-aurora::before\{--us-aurora-opacity:var\(--us-aurora-react\)/);
  assert.match(foundation, /animation:us-aurora-drift 12s ease-in-out infinite alternate/, 'same 12s slow cycle');
  const block = foundation.slice(foundation.indexOf('M12A — Shell aurora'), foundation.indexOf('M12A — Tiles and their destinations'));
  assert.doesNotMatch(block, /filter:|blur\(/, 'still cheap: no filters');
  assert.doesNotMatch(read('ui-foundation.js'), /setInterval|requestAnimationFrame\(.*aurora/i);
});

test('aurora: reduced motion and hidden document behaviour is intact', () => {
  assert.match(foundation, /:root\[data-us-motion="reduced"\] \.us-aurora::before,\s*:root\[data-us-motion="reduced"\] \.us-aurora::after\{animation:none!important/);
  assert.match(foundation, /@media \(prefers-reduced-motion:reduce\)\{\s*\.us-aurora::before,\.us-aurora::after\{animation:none!important/);
  assert.match(foundation, /:root\[data-us-visibility="hidden"\] \.us-aurora::before,\s*:root\[data-us-visibility="hidden"\] \.us-aurora::after\{animation-play-state:paused\}/);
});

// ---------------------------------------------------------------- EVENTI: information architecture

const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';

test('Noi: Eventi is a real tile of the hub, using the existing tile system and Phosphor icon', () => {
  const hub = bond.match(/<nav class="noi-hub" id="noiHub"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.match(hub, /<button type="button" data-us-tile data-us-feedback="tap" class="noi-hub-card noi-hub-card--events" data-noi-open="eventi">/);
  assert.match(hub, /<span class="noi-hub-kicker">Eventi<\/span>/);
  const styles = read('styles.css');
  assert.match(styles, /\.noi-hub-card--events\{--noi-hub-icon:url\("\/assets\/icons\/phosphor\/calendar-heart-regular\.svg"\)/);
  // HUMAN-UI-02 — Eventi is one of the compact rows under the Risonanza hero.
  assert.match(styles, /\.noi-hub-card:not\(\.noi-hub-card--resonance\)\{flex-direction:row;/);
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/phosphor/calendar-heart-regular.svg')));
});

test('Noi: Eventi opens inside the Noi page through the shared section + history layer', () => {
  const app = read('app.js');
  assert.match(app, /const NOI_SECTIONS=\['resonance','da-vivere','quest','eventi'\]/);
  assert.match(app, /if\(view==='eventi'\)window\.hydrateEvents\?\.\(\);/);
  assert.match(read('styles.css'), /#bond \.noi-canonical-page:not\(\[data-noi-view="eventi"\]\)>\.noi-events-section\{display:none!important\}/);
  assert.match(read('navigation.js'), /name:'noi-section',\s*find:\(\)=>document\.getElementById\('noiHub'\),\s*open:el=>Boolean\(el&&el\.hidden\),\s*close:\(\)=>window\.closeNoiSection\?\.\(\)/, 'Back works with no navigation change');
  assert.match(bond, /<section class="noi-events-section" id="noiEventsSection"/);
  assert.match(bond, /<h3 id="noiEventsTitle">Eventi<\/h3>/);
  assert.match(bond, /Le cose che scegliete di vivere insieme\./);
  assert.match(bond, /id="noiEventsAdd" aria-label="Aggiungi un evento"/);
});

test('Calendar stays the planning authority and keeps its Eventi shortcut; the shell has no events control', () => {
  assert.match(html, /id="usCalendarEventsLink"[^>]*aria-label="Apri i nostri eventi"/);
  for (const file of ['calendar.js', 'calendar-domain.js', 'calendar.css']) {
    assert.doesNotMatch(read(file), /noiEvents|hydrateNoiEvents|openEventEditor/, `${file} does not know about the events surface`);
  }
  assert.doesNotMatch(topBar, /usEventsTopEntry|I nostri eventi/);
});

// ---------------------------------------------------------------- EVENTI: surface behaviour (events.js in a vm)

const isoDay = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const stamp = (offset) => new Date(Date.now() + offset * 86400000).toISOString();

function harness({ failLoad = false } = {}) {
  const nodes = {};
  const timers = [];
  const writes = { noiEventsBody: 0 };
  const node = (id) => {
    if (nodes[id]) return nodes[id];
    const listeners = {};
    const open = new Set();
    let inner = '';
    const el = {
      id, textContent: '', hidden: false, dataset: {}, value: '', checked: false, disabled: false, style: {}, listeners, open,
      classList: { add: (c) => open.add(c), remove: (c) => open.delete(c), toggle() {}, contains: (c) => open.has(c) },
      addEventListener: (type, fn) => { listeners[type] = fn; }, querySelectorAll: () => [], querySelector: () => null,
      setAttribute() {}, focus() {}, reset() {}, closest: () => null, contains: () => true
    };
    Object.defineProperty(el, 'innerHTML', { get: () => inner, set: (v) => { inner = v; if (id === 'noiEventsBody') writes.noiEventsBody += 1; } });
    return (nodes[id] = el);
  };
  const row = (id, title, offset, extra = {}) => ({ id, couple_id: 'c', created_by: 'u', title, event_date: isoDay(offset), event_time: null, location: null, note: null, recurs_yearly: false, created_at: stamp(-30), updated_at: stamp(-30), ...extra });
  const tables = {
    shared_events: [
      row('e1', 'Concerto di Elisa', 12, { event_time: '21:00:00', location: 'Roma' }), row('e2', 'Weekend a Matera', 25), row('e3', 'Gita al mare', 33),
      row('e4', 'Cena da Mario', 50, { location: 'Trastevere' }), row('e5', 'Viaggio lontano', 200), row('e6', 'Gita al lago', -3), row('e7', 'Cinema', -20)
    ],
    shared_event_completions: [{ id: 'c1', event_id: 'e7', occurrence_date: isoDay(-20), completed_by: 'u', xp_awarded: 35, completed_at: stamp(-19) }],
    couples: [{ started_on: null }],
    relationship_milestones: []
  };
  const used = new Set();
  const rpcs = [];
  const sb = {
    from(table) {
      used.add(table);
      const result = () => (failLoad ? { data: null, error: new Error('down') } : { data: tables[table], error: null });
      const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: failLoad ? null : (tables[table] || [])[0] || null, error: failLoad ? new Error('down') : null }), then: (res, rej) => Promise.resolve(result()).then(res, rej), insert: () => b, update: () => b, delete: () => b };
      return b;
    },
    rpc: async (name) => { rpcs.push(name); return { data: {}, error: null }; }
  };
  const window = { usProfile: { id: 'u', couple_id: 'c' }, addEventListener() {}, removeEventListener() {} };
  const sandbox = {
    window, document: { getElementById: node, addEventListener() {}, body: { classList: { add() {}, remove() {} } } }, sb, navigator: { onLine: true },
    toast() {}, usConfirm: async () => true, console: { warn() {}, info() {} }, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, location: { href: 'https://us.test/' }, history: { replaceState() {} }, URL, Date, Math, Promise, Number, String, Array, Object, Set, JSON
  };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(read('events.js'), sandbox, { filename: 'events.js' });
  return { window, node, nodes, timers, used, rpcs, writes, tick: () => new Promise((r) => setImmediate(r)) };
}

test('Eventi surface: existing event data renders as PROSSIMI, QUESTO PERIODO and VISSUTI', async () => {
  const h = harness();
  await h.window.hydrateEvents();
  const body = h.node('noiEventsBody').innerHTML;
  const order = ['Prossimi', 'Questo periodo', 'Vissuti'].map((label) => body.indexOf(`>${label}</div>`));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'three sections, in that order');
  const prossimi = body.slice(order[0], order[1]);
  assert.equal((prossimi.match(/class="noi-ev-card[ "]/g) || []).length, 3, 'the next three occurrences');
  for (const title of ['Concerto di Elisa', 'Weekend a Matera', 'Gita al mare']) assert.match(prossimi, new RegExp(title));
  assert.match(prossimi, /Tra 12 giorni/, 'countdown from the existing authority');
  assert.match(prossimi, /data-us-icon="map-pin"/, 'relevant icon (place)');
  const periodo = body.slice(order[1], order[2]);
  assert.match(periodo, /Gita al lago/, 'a past event still to mark is shown as such');
  assert.match(periodo, /Da segnare/);
  assert.match(periodo, /Cena da Mario/, 'nearby events beyond the first three');
  assert.doesNotMatch(periodo, /Viaggio lontano/, 'far-away events are not part of this period');
  const vissuti = body.slice(order[2]);
  assert.match(vissuti, /Cinema/);
  assert.doesNotMatch(vissuti, /Gita al lago/);
});

test('Eventi surface: the Noi hub tile shows the next event; an empty couple gets a quiet state', async () => {
  const h = harness();
  await h.window.hydrateEvents();
  assert.equal(h.node('noiHubEventsTitle').textContent, 'Concerto di Elisa');
  assert.equal(h.node('noiHubEventsMeta').textContent, 'Tra 12 giorni');

  const empty = harness();
  // No events at all.
  const src = read('events.js');
  assert.match(src, /<div class="us-events-empty"><b>Niente in programma<\/b><\/div>/);
  assert.match(src, /title\.textContent='Niente in programma'/);
  assert.ok(empty);
});

test('Eventi surface: identical data does not rewrite the DOM, so the soft entrance never replays', async () => {
  const h = harness();
  await h.window.hydrateEvents();
  const writes = h.writes.noiEventsBody;
  await h.window.hydrateEvents();
  assert.equal(h.writes.noiEventsBody, writes);
});

test('Eventi surface: tapping an event opens the existing editor, and closing it returns to the surface', async () => {
  const h = harness();
  await h.window.hydrateEvents();
  const body = h.node('noiEventsBody');
  const card = { dataset: { id: 'e2', occurrence: isoDay(25) } };
  body.listeners.click({ target: { closest: () => card } });
  assert.ok(h.node('usEventsOverlay').open.has('open'), 'the existing editor sheet opens');
  assert.equal(h.node('usEventTitleInput').value, 'Weekend a Matera', 'it is the existing event editor, filled from the same data');
  assert.equal(h.node('usEventForm').hidden, false);
  // Cancel: the sheet closes by itself (one task later), back on the Noi surface.
  h.window.cancelEventEdit();
  assert.ok(h.node('usEventsOverlay').open.has('open'), 'not in the same tick as the form');
  for (let round = 0; round < 3; round += 1) h.timers.splice(0).forEach((fn) => fn());
  assert.equal(h.node('usEventsOverlay').open.has('open'), false);
});

test('Eventi editor opened from the Calendar shortcut / Oggi keeps its old behaviour (browse stays)', async () => {
  const h = harness();
  await h.window.hydrateEvents();
  await h.window.openEvents();
  h.window.editEvent('e2', isoDay(25));
  h.timers.length = 0;
  h.window.cancelEventEdit();
  assert.equal(h.timers.length, 0, 'no automatic close: the list is shown again');
  assert.ok(h.node('usEventsOverlay').open.has('open'));
  assert.equal(h.node('usEventsBrowse').hidden, false);
});

test('Eventi surface: the add button opens the existing "new event" form', async () => {
  const h = harness();
  await h.window.hydrateEvents();
  h.node('noiEventsAdd').listeners.click();
  assert.equal(h.node('usEventForm').hidden, false);
  assert.equal(h.node('usEventFormTitle').textContent, 'Nuovo evento');
  assert.ok(h.node('usEventsOverlay').open.has('open'));
});

test('Eventi surface: a failed load says so instead of staying on "Carico…"', async () => {
  const h = harness({ failLoad: true });
  await h.window.hydrateEvents();
  assert.match(h.node('noiEventsBody').innerHTML, /Non riesco a caricare gli eventi/);
});

test('no backend impact: only the four existing tables and the existing RPC are touched', async () => {
  const h = harness();
  await h.window.hydrateEvents();
  assert.deepEqual([...h.used].sort(), ['couples', 'relationship_milestones', 'shared_event_completions', 'shared_events']);
  assert.deepEqual(h.rpcs, []);
  const src = read('events.js');
  assert.deepEqual([...new Set([...src.matchAll(/sb\.rpc\('([a-z_]+)'/g)].map((m) => m[1]))], ['complete_shared_event']);
  assert.deepEqual([...new Set([...src.matchAll(/sb\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))].sort(), ['couples', 'relationship_milestones', 'shared_event_completions', 'shared_events']);
});

test('Eventi motion: the tile uses the shared press, the page the shared enter; reduced motion is off', () => {
  const css = read('events.css');
  assert.match(css, /#bond \.noi-canonical-page\[data-noi-view="eventi"\] :is\(\.noi-ev-card,\.noi-ev-row\)\{animation:us-content-enter var\(--us-motion-fast\) var\(--us-ease-enter\)/);
  assert.match(css, /:root\[data-us-motion="reduced"\] :is\(\.noi-ev-card,\.noi-ev-row\)\{animation:none!important\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{:is\(\.noi-ev-card,\.noi-ev-row\)\{animation:none!important/);
  assert.match(read('styles.css'), /\.noi-events-section\)\{animation:us-content-enter/, 'the section itself enters like the other Noi destinations');
  assert.match(foundation, /\[data-us-tile\]:active\{/);
  assert.match(read('ui-foundation.css'), /@keyframes us-content-enter/);
});

test('no new CSS patch layer was introduced', () => {
  const css = fs.readdirSync(ROOT).filter((name) => name.endsWith('.css'));
  assert.ok(!css.some((name) => /motion2|final|new-polish|patch/i.test(name)), css.join(','));
});
