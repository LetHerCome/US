// US V3 — Noi cleanup (icons, calendar, Lavagna), Gioca hierarchy and the
// Sintonia tab that scrolls like every other page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const noiJs = read('noi-v2.js');
const noiCss = read('noi-v2.css');
const worker = read('service-worker.js');
const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
const noi = bond.match(/<section class="us-noi-v2"[\s\S]*?<\/section>\s*\n\s*<section class="noi-week-board"/)?.[0] || '';

// ------------------------------------------------------------------ icons
test('Noi icons: well-formed markup, the approved settings icon, a real list icon', () => {
  assert.ok(noi.length > 1000, 'Noi V2 markup found');
  assert.doesNotMatch(html, /<span class="us-icon"\s+<img/, 'no half-open icon tag (the old grey square)');
  assert.match(noi, /class="us-noi-v2-settings"[^>]*><img class="us-approved-custom-icon" src="\/assets\/derived\/runtime\/us-icon-settings-128-v1\.png"/);
  assert.match(noi, /id="usNoiV2ModeList"[^>]*><span class="us-icon" data-us-icon="list-bullets"/, 'Elenco is a list, not a grid');
  assert.match(noi, /data-noi-open-link="lavagna"[\s\S]*?data-us-icon="chalkboard-simple"/);
});

test('Icons: every data-us-icon used by the shell is mapped to an official Phosphor SVG that is precached', () => {
  const css = ['ui-foundation.css', 'noi-v2.css', 'oggi-look.css', 'styles.css', 'settings2.css'].map(read).join('\n');
  const used = new Set();
  for (const source of [html, noiJs, read('oggi-look.js')]) {
    for (const m of source.matchAll(/data-us-icon="([a-z-]+)"/g)) used.add(m[1]);
    for (const m of source.matchAll(/\bicon\('([a-z-]+)'\)/g)) used.add(m[1]);
  }
  assert.ok(used.size > 15);
  for (const name of used) {
    const rule = css.match(new RegExp(`\\.us-icon\\[data-us-icon="${name}"\\]\\{--us-icon-src:url\\("(\\/assets\\/icons\\/phosphor\\/[a-z-]+\\.svg)"\\)\\}`));
    assert.ok(rule, `${name} has a mapping`);
    assert.ok(fs.existsSync(path.join(ROOT, rule[1].slice(1))), `${rule[1]} exists`);
    assert.ok(worker.includes(`"${rule[1]}"`), `${rule[1]} is precached for offline/native`);
  }
  for (const file of ['list-bullets', 'chalkboard-simple', 'palette']) {
    const svg = read(`assets/icons/phosphor/${file}-regular.svg`);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 256 256" fill="currentColor"><path d="/, `${file} is the untouched Phosphor regular glyph`);
  }
});

// ------------------------------------------------------------------ Lavagna, add, Quest, Eventi
test('Noi links: Lavagna opens the existing Calendar in its Week view; + opens the existing create form', () => {
  assert.match(noiJs, /if\(link==='lavagna'\)\{mode='week';render\(\)/, 'La nostra settimana stays inside Noi');
  assert.match(noiJs, /if\(link==='quest'\|\|link==='eventi'\)window\.openNoiSection\?\.\(link\)/);
  assert.match(noiJs, /window\.UsCalendarLinks\.createForDate\(selected\)/);
  const cal = read('calendar.js');
  assert.match(cal, /const requestedMode = arguments\[1\]\?\.mode;/);
  assert.match(cal, /async function createCalendarEntryForDate\(dateISO\)[\s\S]*?startCreateForDate\(dateISO\)/, 'the existing editor, no second one');
  assert.match(cal, /createForDate: createCalendarEntryForDate/);
  assert.doesNotMatch(noiJs, /\.insert\(|\.update\(|\.delete\(|sb\.rpc\(|sb\.from\(/, 'Noi stays read-only');
});

// ------------------------------------------------------------------ calendar render (vm)
function fakeNode(id) {
  const attrs = {};
  const listeners = {};
  return {
    id, hidden: false, dataset: {}, innerHTML: '', textContent: '',
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }, toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); } },
    setAttribute(n, v) { attrs[n] = String(v); }, getAttribute: (n) => attrs[n] ?? null, removeAttribute(n) { delete attrs[n]; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, emit(type, e) { (listeners[type] || []).forEach((fn) => fn(e)); },
    querySelector: () => null, querySelectorAll: () => [], focus() {}, scrollIntoView() {}
  };
}
async function noiRender({ snapshot, fail = false } = {}) {
  const nodes = new Map();
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, fakeNode(id)); return nodes.get(id); };
  node('bond').classList.add('active');
  const opened = [];
  const window = {
    usProfile: { id: 'f', couple_id: 'c' },
    matchMedia: () => ({ matches: true }),
    USNoiCalendarRead: { readMonth: async () => { if (fail) throw new Error('offline'); return snapshot; } },
    openCalendarSurface: (...args) => opened.push(['calendar', ...args]),
    UsCalendarLinks: { createForDate: (d) => opened.push(['create', d]), openEntry: (id) => opened.push(['entry', id]) },
    openNoiSection: (v) => opened.push(['section', v]),
    addEventListener() {}
  };
  const document = { readyState: 'complete', hidden: false, getElementById: node, querySelector: () => null, addEventListener() {} };
  vm.runInNewContext(noiJs, { window, document, console: { warn() {} }, MutationObserver: class { observe() {} }, Date, Map, Set, Promise, setTimeout });
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r));
  return { node, opened, click: (target) => node('usNoiV2').emit('click', { target: { closest: (sel) => (sel.split(',').some((s) => target.matches(s.trim())) ? target : null) } }) };
}
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = ymd(now);

test('Noi calendar: only the weeks the month spans, today selected, one dot per kind, items in time order', async () => {
  const later = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 1, 28), 12);
  const snapshot = {
    startedOn: `2022-${pad(now.getMonth() + 1)}-${pad(Math.min(now.getDate(), 28))}`,
    events: [{ id: 'e1', title: 'Cena', event_date: todayIso, event_time: '20:30:00' }],
    appointments: [
      { id: 'a2', title: 'Palestra', is_all_day: false, starts_at: `${todayIso}T18:00:00`, dates: [todayIso] },
      { id: 'a3', title: 'Lago', is_all_day: true, dates: [ymd(later)] }
    ]
  };
  const { node } = await noiRender({ snapshot });
  const grid = node('usNoiV2Content').innerHTML;
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) / 7);
  assert.match(grid, new RegExp(`data-weeks="${weeks}"`));
  assert.equal((grid.match(/class="us-noi-v2-(?:day|blank)[" ]/g) || []).length, weeks * 7, 'no empty sixth row');
  const today = grid.match(new RegExp(`<button[^>]*data-noi-day="${todayIso}"[\\s\\S]*?<\\/button>`))?.[0] || '';
  assert.match(today, /is-selected/);
  assert.match(today, /aria-current="date"/);
  assert.match(today, /<i data-kind="relationship"><\/i><i data-kind="event"><\/i><i data-kind="calendar"><\/i>/, 'one mark per kind, in a stable order');
  const detail = node('usNoiV2Detail').innerHTML;
  assert.match(detail, /<small>OGGI<\/small>/);
  const titles = [...detail.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['Il nostro giorno', 'Palestra', 'Cena'], 'anniversary first, then by time');
  assert.equal(node('usNoiV2Today').hidden, true, '"Torna a oggi" only when you are elsewhere');
});

test('Noi calendar: a failed read keeps the grid and offers Riprova; list mode has a real empty state', async () => {
  const { node } = await noiRender({ fail: true });
  const content = node('usNoiV2Content').innerHTML;
  assert.match(content, /role="alert"[\s\S]*data-noi-retry/);
  assert.match(content, /class="us-noi-v2-grid"/, 'the month is still readable');
  assert.equal(node('usNoiV2Content').dataset.state, 'error');
  node('usNoiV2ModeList').emit('click');
  assert.match(node('usNoiV2Content').innerHTML, /Un mese ancora da scrivere[\s\S]*data-noi-add/);
  assert.equal(node('usNoiV2Detail').hidden, true, 'list mode does not repeat the day detail');
});

test('Noi calendar: month change animates once and only without reduced motion', () => {
  assert.match(noiJs, /function playEnter\(container,direction\)\{\n  if\(!direction\|\|reducedMotion\(\)\)return;/);
  assert.match(noiCss, /@keyframes us-noi-month-next\{from\{opacity:\.25;transform:translate3d\(14px,0,0\)\}to\{opacity:1;transform:none\}\}/);
  assert.match(noiCss, /@media\(prefers-reduced-motion:reduce\)\{\s*\.us-noi-v2 \*,#quiz \.us-gioca-tab,#quiz \.us-gioca-tabs::before\{transition:none!important;animation:none!important\}/);
  assert.match(noiCss, /--noi-day-h:clamp\(42px,calc\(\(100svh - 440px\) \/ 7\.4\),56px\)/, 'day rows adapt to small and large Android screens');
  assert.match(noiCss, /#bond \.noi-couple-link\{display:none!important\}/, 'distance stays computed but hidden');
  assert.match(bond, /id="noiCoupleDistance"/);
});

// ------------------------------------------------------------------ Gioca + Sintonia
test('Gioca V4: daily first, week rail, pending actions, bento games and weekly question', () => {
  const games = read('games.js');
  const hub = games.slice(games.indexOf('function renderHub() {'), games.indexOf('function renderHubError() {'));
  const order = ['us-gv2-daily-slot', 'dayRail()', 'us-gv2-head', 'continueSection(home)', 'us-gv2-choose', 'data-gv2-action="per-voi"', 'weeklyCard(home?.weekly)', 'doneSection(home)'];
  const positions = order.map((needle) => hub.indexOf(needle));
  assert.ok(positions.every((p) => p >= 0), JSON.stringify(positions));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(read('home-cleanup.js'), /hub\.querySelector\?\.\('\.us-gv2-daily-slot'\)/);
  assert.match(games, /Scrivila, sigillala: \$\{partnerName\(\)\} la scopre giocando\./, 'write → seal → discover, in one line');
  const pet = read('pet.js');
  assert.match(pet, /selector:'#quizHub \.us-gv2-game\.is-swipe'/, 'the PET still finds its Gioca anchors');
  assert.match(pet, /selector:'#quizHub \.us-gv2-choose'/);
});

test('Sintonia: one premium segmented control, keyboard-friendly, and a page that scrolls', () => {
  assert.match(html, /<div class="us-gioca-tabs" id="usGiocaTabs" data-active="giochi" role="tablist" aria-label="Gioca e Sintonia">/);
  assert.match(noiJs, /\$\('usGiocaTabs'\)\?\.setAttribute\('data-active',giocaTab\)/);
  assert.match(noiJs, /e\.key!=='ArrowLeft'&&e\.key!=='ArrowRight'/);
  assert.match(noiCss, /#quiz \.us-gioca-tabs\[data-active="sintonia"\]::before\{transform:translateX\(100%\)\}/);
  // The nested scroller (max-height + overflow:auto + overscroll contain) swallowed the page scroll.
  assert.match(noiCss, /#quiz \.us-gioca-sintonia \.us-progression-rewards\{max-height:none;overflow:visible;overscroll-behavior:auto;/);
  assert.doesNotMatch(noiCss, /#quiz \.us-gioca-sintonia[^{]*\{[^}]*overflow-y:auto/);
});
