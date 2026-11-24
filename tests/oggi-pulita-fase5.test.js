// Redesign definitivo, fase 5 (founder 23/11/2026, D9): Oggi without the cards
// of suggestions. Each real thing has its own place: a Ti penso received →
// heart eyes and a short notice; Lasciato per te → the dot on the envelope;
// the other waiting for me in a game → the dot on Gioca; the mesiversario (and
// 100, 200… days) → the characters' festa; the notifications → the intro, then
// the Profilo. Oggi keeps the photo with the characters, the countdown, the
// row event/distance/Come stai and the Domanda di oggi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const html = read('index.html');
const slice = (from, to) => { const a = app.indexOf(from); const b = app.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from}…${to}`); return app.slice(a, b); };

test('Oggi: the dock is the caption, the row, Voi due and the Domanda di oggi; no cards, no invite', () => {
  const dock = html.match(/<div class="us-oggi-dock[^"]*" id="usOggiDock">[\s\S]*?\n {6}<\/div>/)?.[0] || '';
  assert.ok(dock, 'the dock');
  const ids = [...dock.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]).filter((id) => ['usOggiCaption', 'usOggiRow', 'usDailyRitual', 'usTodayPriorityRegion', 'pushOptInCard'].includes(id));
  assert.deepEqual(ids, ['usOggiCaption', 'usOggiRow', 'usDailyRitual']);
  assert.match(dock, /data-us-angolo data-us-duo/, 'the two characters on the photo');
  for (const id of ['usOggiNext', 'distanceWidget', 'usOggiStatus']) assert.match(dock, new RegExp(`id="${id}"`), `${id} in the row`);
  for (const gone of [/usTodayPriorityRegion/, /pushOptInCard|push-optin/, /us-today-priority/]) {
    assert.doesNotMatch(html, gone);
    assert.doesNotMatch(read('dc-oggi.css'), gone);
  }
  for (const gone of ['composeTodayPriorities', 'renderTodayPriorityItem', 'installTodayNoticeSwipe', 'dismissDailyRevealNotice', 'celebrationTodayPriorityViewModel', 'leftTodayPriorityViewModel', 'thinkTodayPriorityViewModel', 'gameTurnTodayPriorityViewModel']) {
    assert.doesNotMatch(app, new RegExp(gone), gone);
  }
  assert.doesNotMatch(read('due-colori.js'), /usTodayPriorityRegion|pushOptInCard/);
});

function thinkNotice({ profile = { id: 'f' }, stored = {} } = {}) {
  const toasts = [], opened = [];
  const store = { ...stored };
  const window = { usProfile: profile, usBondProfiles: [{ id: 'b', display_name: 'Bea' }] };
  const context = vm.createContext({
    window, Date, String, Number,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    toast: (text, options) => toasts.push({ text, options }),
    partnerFromProfiles: (list) => list[0] || null,
    openThinkArrival: () => opened.push(true),
  });
  vm.runInContext(slice('function usThinkNoticedKey(){', 'function handleIncomingThink(row){'), context);
  return { context, toasts, opened, store };
}

test('a Ti penso received: a short notice with «Apri», once per Ti penso on this phone, within a day', () => {
  const now = Date.parse('2026-11-24T10:00:00Z');
  const t = thinkNotice();
  const row = { id: 't1', created_at: '2026-11-24T09:00:00Z' };
  assert.equal(t.context.noticeIncomingThink(row, { now }), true);
  assert.equal(t.toasts.length, 1);
  assert.equal(t.toasts[0].text, 'Bea ti pensa ♡');
  assert.equal(t.toasts[0].options.action.label, 'Apri');
  t.toasts[0].options.action.onClick();
  assert.equal(t.opened.length, 1, '«Apri» opens the reactions');
  assert.equal(t.context.noticeIncomingThink(row, { now }), false, 'once per Ti penso');
  assert.equal(t.store['us:think:noticed:v1:f'], 't1');
  assert.equal(t.context.noticeIncomingThink({ id: 't2', created_at: '2026-11-24T09:30:00Z' }, { now, name: 'Beatrice' }), true, 'the next one is new');
  assert.equal(t.toasts[1].text, 'Beatrice ti pensa ♡');
  assert.equal(t.context.noticeIncomingThink({ id: 't3', created_at: '2026-11-23T09:00:00Z' }, { now }), false, 'older than a day: the heart history keeps it');
  assert.equal(thinkNotice({ profile: null }).context.noticeIncomingThink(row, { now }), false, 'nobody signed in');
});

test('the notice is wired: live arrival, the first read, never over the sheet a push opens', () => {
  const live = slice('function handleIncomingThink(row){', 'const usRealtimeRefreshTimers=');
  assert.match(live, /usIncomingThink=\{\.\.\.row\};usThinkReactionFinal=null;usThinkReactionInFlight=false;\n  noticeIncomingThink\(row\);/);
  assert.doesNotMatch(live, /UsTodayPriority|toast\(/);
  assert.match(app, /if\(received&&!receivedReaction\)\{usIncomingThink=received;usThinkReactionFinal=null;noticeIncomingThink\(received,\{name:partnerName\}\);\}/);
  assert.match(app, /if\(ref\)usMarkThinkNoticed\(ref\);\n    try\{await hydrateThink\(\);\}/);
  // The heart eyes of Fase 4 stay: the Ti penso of the last 3 hours.
  assert.match(read('personaggi.js'), /if \(Number\.isFinite\(at\) && now\.getTime\(\) - at >= 0 && now\.getTime\(\) - at < REACTION_HOURS \* 3600e3\) return 'cuore';/);
});

function tabs() {
  const make = (page) => ({ page, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } });
  const nav = { home: make('home'), quiz: make('quiz') };
  const context = vm.createContext({ document: { querySelector: (sel) => nav[/data-page="([^"]+)"/.exec(sel)?.[1]] || null } });
  vm.runInContext(slice('function renderToccaATe(', '// ===== M9B'), context);
  return { nav, render: (arg) => context.renderToccaATe(arg) };
}

test('«Tocca a te»: a game lights Gioca, the Domanda di oggi lights Oggi, nothing lights nothing', () => {
  const t = tabs();
  assert.equal(t.render({ game: true }), true);
  assert.deepEqual([t.nav.quiz.attrs['data-us-tocca'], t.nav.quiz.attrs['aria-label']], ['on', 'Gioca, tocca a te']);
  assert.deepEqual([t.nav.home.attrs['data-us-tocca'], t.nav.home.attrs['aria-label']], [undefined, 'Oggi']);
  t.render({ challenge: true });
  assert.equal(t.nav.quiz.attrs['data-us-tocca'], undefined, 'fase 6 (D10): the weekly challenge is hidden, it lights nothing');
  t.render({ daily: true });
  assert.deepEqual([t.nav.home.attrs['data-us-tocca'], t.nav.home.attrs['aria-label']], ['on', 'Oggi, tocca a te']);
  assert.deepEqual([t.nav.quiz.attrs['data-us-tocca'], t.nav.quiz.attrs['aria-label']], [undefined, 'Gioca']);
  assert.equal(t.render(), false);
  assert.equal(t.nav.home.attrs['data-us-tocca'], undefined);
  assert.match(app, /renderToccaATe\(\{daily:Boolean\(dailyState&&dailyState\.my_answer==null&&dailyState\.partner_has_answer\),game:Boolean\(usOggiGameTurn\?\.game\)\}\);/);
  assert.doesNotMatch(app, /UsWeeklyChallenge\?\.todayPriority/);
  assert.match(read('dc-oggi.css'), /\.nav button:is\(\[data-page="home"\],\[data-page="quiz"\]\)\[data-us-tocca="on"\]:not\(\.active\) \.nicon::after\{[\s\S]*?background:var\(--us-partner\);/);
  assert.match(read('i18n-en.js'), /'Gioca, tocca a te': 'Play, your turn',/);
});

test('Lasciato per te: one dot on the envelope, in the colour of who left it', () => {
  const css = read('dc-oggi.css');
  assert.match(css, /#leftForYouPartnerEntry \.beat i:first-child\{display:none\}/);
  assert.match(css, /#leftForYouPartnerEntry \.beat i:last-child\{background:var\(--us-partner\)\}/);
  assert.match(css, /#leftForYouPartnerEntry\[data-us-attention="on"\] \.beat\{display:flex;/);
  // Oggi only reads the unseen rows for the widget now.
  assert.doesNotMatch(slice('async function loadOggiLeftItems(){', '(()=>{'), /refreshTodayPriorities/);
});

function festaOn(startedOn, now) {
  const window = { UsCoupleContext: { snapshot: () => ({ couple: { started_on: startedOn } }) } };
  const context = vm.createContext({ window, Date, Math, Number, String, Object, Array, Set, Map, JSON, RegExp, Intl });
  vm.runInContext(read('calendar-domain.js'), context);
  vm.runInContext(read('personaggi.js'), context);
  return window.UsPersonaggi.reactionOf('francesco', now);
}

test('the mesiversario and every 100 days together: the characters\' festa', () => {
  assert.equal(festaOn('2025-03-24', new Date(2026, 10, 24, 12)), 'festa', 'mesiversario');
  assert.equal(festaOn('2026-08-16', new Date(2026, 10, 24, 12)), 'festa', '100 days');
  assert.equal(festaOn('2025-03-25', new Date(2026, 10, 24, 12)), '', 'an ordinary day');
});

test('the notifications: no card on Oggi; the Profilo has Notifiche with its state, the intro asks', () => {
  const push = slice('async function refreshWebPushUi(){', 'window.refreshWebPushUi=refreshWebPushUi;');
  assert.doesNotMatch(push, /pushOptInCard|pushOptInTitle|card\./);
  assert.match(push, /setPushSettingsState\('inactive','Notifiche non attive','','Attiva'\);/);
  const settings = read('settings.js');
  assert.match(settings, /\['Notifiche',push\.native\?/);
  assert.match(settings, /if\(name==='notifications'\)return notificationsModal\(\);/);
  assert.match(html, /id="usSetupPushVis"/, 'the intro still shows what the notifications are for');
});

test('Risposte pronte and Accoglienza: the Domanda di oggi card says it; the distance question stays in Settings', () => {
  assert.match(app, /if\(access\.unread\)return \{\.\.\.base,kicker:'Risposte pronte',state:'ready',meta:'Le vostre risposte sono pronte',glyph:'noi',cta:'Scopri',attention:false\};/, 'M10E.2: after my answer never the orbit');
  assert.equal(require('../distance.js').todayPriority, undefined);
  assert.match(html, /data-us-setting="together-mode"/);
});
