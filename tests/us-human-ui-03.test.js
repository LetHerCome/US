// US-HUMAN-UI-03 — adaptive US Island & edge-to-edge shell.
// Three layers: the static contract (one top shell, same destinations, safe
// areas, release), the island controller driven through a small fake DOM
// (states, notices, queue, outside tap, reduced motion), and the real app in
// headless Chromium (geometry at the physical top edge, real Ti penso /
// Lasciato per te arrivals, outside tap that still reaches the page).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadChromium, startServer, FAKE_SUPABASE } = require('./helpers/oggi-browser');

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const foundationCss = read('ui-foundation.css');
const foundationJs = read('ui-foundation.js');
const island = html.match(/<div class="us-island" id="usIsland"[\s\S]*?<span class="us-island-live"/)?.[0] || '';
const allCss = () => fs.readdirSync(ROOT).filter((f) => f.endsWith('.css')).map(read).join('\n');

// ---------------------------------------------------------------- static contract

test('1. compact: ONE canonical US trigger — a real button with an accessible name', () => {
  assert.ok(island, 'the island exists');
  const triggers = island.match(/<button[^>]*id="usIslandTrigger"[^>]*>/g) || [];
  assert.equal(triggers.length, 1);
  assert.match(triggers[0], /type="button"/);
  assert.match(triggers[0], /aria-label="Apri menu US"/);
  assert.match(triggers[0], /aria-expanded="false"/);
  assert.match(triggers[0], /aria-controls="usIslandShell"/);
  assert.match(island, /id="usIslandTrigger"[^>]*><span class="us-island-mark-art" aria-hidden="true"><img src="\/assets\/derived\/brand\/us-symbol-apk-foreground-v1\.png" alt=""/);
  assert.match(island, /data-us-island="compact"/, 'the island boots compact');
  // Compact shows only the mark: actions and notice are display:none until their state.
  assert.match(foundationCss, /\.us-island-action\{display:none;/);
  assert.match(foundationCss, /\.us-island-notice\{display:none;/);
});

test('2 + 5. expanded exposes the SAME Per voi and Lasciato per te controls, same handlers', () => {
  assert.match(island, /<button type="button" class="us-island-action us-pervoi-top is-loading" id="usPerVoiTop" onclick="window\.USGameV2\?\.openPerVoi\(\)"/);
  assert.match(island, /<button type="button" class="us-island-action us-envelope-control is-loading" id="leftForYouPartnerEntry" onclick="usEnvelopeTap\(\)"/);
  assert.ok(island.indexOf('id="usPerVoiTop"') < island.indexOf('id="usIslandTrigger"'));
  assert.ok(island.indexOf('id="usIslandTrigger"') < island.indexOf('id="leftForYouPartnerEntry"'));
  assert.match(island, />Per voi<\/span>/);
  assert.match(island, />Lascia qualcosa<\/span>/);
  assert.match(foundationCss, /\.us-island\[data-us-island="expanded"\] \.us-island-action\{display:inline-flex;/);
  // Destinations unchanged: Per voi → existing openPerVoi, envelope → existing tap().
  const games = read('games.js');
  assert.match(games, /async function openPerVoi\(\) \{\s*if \(document\.querySelector\('\.page\.active'\)\?\.id !== 'quiz'\) window\.go\?\.\('quiz', \{ nav: true \}\);\s*if \(!home\) await load\(\);\s*const sid = home\?\.per_voi\?\.session_id;\s*if \(sid\) return openSession\(sid\);\s*return startRound\('per_voi'\);\s*\}/);
  const lfy = read('left-for-you.js');
  assert.match(lfy, /function tap\(\) \{\s*if \(!envelopeResolved\) return;\s*if \(unseenCount > 0\) \{ open\(\); return; \}\s*openComposer\(\);\s*\}/);
  assert.match(lfy, /window\.usEnvelopeTap = tap;/);
  // The visible label says what that same tap does.
  assert.match(lfy, /label\.textContent = closed \? 'Lasciato per te' : 'Lascia qualcosa';/);
});

test('3. no duplicate top shell: the old top bar, aurora and its rules are gone', () => {
  assert.doesNotMatch(html, /class="top[ "]|us-premium-top|us-top-brand|us-top-left|top-actions|us-aurora/);
  assert.doesNotMatch(allCss(), /\.top\.us-premium-top|\.us-top-brand|\.top-actions|us-aurora/);
  for (const id of ['usPerVoiTop', 'leftForYouPartnerEntry', 'usIslandTrigger', 'onlineBadge', 'profileAvatarFile']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} exists exactly once`);
  }
  assert.equal((html.match(/class="us-island"/g) || []).length, 1);
  assert.doesNotMatch(foundationJs, /auroraPulse|data-us-aurora/);
  assert.doesNotMatch(read('app.js'), /auroraPulse|querySelector\('\.top'\)/);
});

test('4 + 18. island state is presentation only: memory, never persisted', () => {
  const start = foundationJs.indexOf('HUMAN-UI-03 — US Island');
  const end = foundationJs.indexOf('// M12A — US feedback engine');
  const block = foundationJs.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(block, /localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|\.rpc\(/);
  for (const file of ['app.js', 'games.js', 'left-for-you.js']) {
    const source = read(file);
    for (const m of source.matchAll(/island\?\.notify\?\.\(/g)) {
      const around = source.slice(m.index - 600, m.index + 600);
      assert.doesNotMatch(around, /localStorage|sessionStorage/, `${file}: no storage around the island hook`);
    }
  }
});

test('12 + 14. interactive positioning uses the safe-area top; nothing sits at y=0 unprotected', () => {
  assert.match(foundationCss, /--us-island-top:calc\(var\(--us-safe-top\) \+ 2px\);/);
  assert.match(foundationCss, /\.us-island\{position:fixed;z-index:25;top:var\(--us-island-top\);left:max\(12px,var\(--us-safe-left\)\);right:max\(12px,var\(--us-safe-right\)\);height:var\(--us-island-hit\);/);
  // The safe-area tokens are the existing ones (Capacitor SystemBars vars first, env() second).
  assert.match(foundationCss, /--us-safe-top:var\(--safe-area-inset-top,env\(safe-area-inset-top,0px\)\);/);
  // Pages own their clearance: inset + island row.
  assert.match(read('identity.css'), /#bond,#moments,#quiz\{padding-top:calc\(var\(--us-safe-top\) \+ var\(--us-top-chrome-clearance\)\)/);
  assert.match(read('identity.css'), /#settings\{height:var\(--us-viewport-height\);[^}]*padding-top:calc\(var\(--us-safe-top\) \+ var\(--us-top-chrome-clearance\)\)/);
  assert.match(read('styles.css'), /@media\(max-width:600px\)\{\.us-oggi-stack\{top:calc\(var\(--us-safe-top\) \+ var\(--us-top-chrome-clearance\) \+ 8px\)\}\}/);
  // The only full-width top layer is a non-interactive veil inside the inset.
  assert.match(foundationCss, /\.us-status-veil\{position:fixed;[^}]*top:0;[^}]*pointer-events:none\}/);
  assert.match(html, /<div class="us-status-veil" aria-hidden="true"><\/div>/);
});

test('13. the background paints to the physical top edge', () => {
  assert.match(read('fix4.css'), /\.app\{[^}]*padding-top:0!important;/, '.app no longer reserves a status-bar band');
  assert.match(read('identity.css'), /#home \.home-hero-only\{height:var\(--us-viewport-height\)!important;min-height:0!important\}/);
  assert.match(read('app.js'), /return \{left,width,top:0,bottom:Math\.min\(window\.innerHeight,navTop\)\};/, 'the swipe preview page also starts at y=0');
  assert.match(foundationCss, /body:has\(#home\.page\.active\) \.us-status-veil\{display:none\}/, 'no veil over the Oggi photo');
});

test('15. PWA edge-to-edge configuration stays valid (no cargo-cult meta)', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"\/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"\/>/);
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  // theme-color now matches the manifest and the canvas, so the Android status bar shows no second colour.
  const theme = html.match(/<meta name="theme-color" content="([^"]+)"\/>/)?.[1];
  assert.equal(theme.toLowerCase(), manifest.theme_color.toLowerCase());
  assert.equal(manifest.background_color.toLowerCase(), '#08040e');
  assert.equal((html.match(/name="theme-color"/g) || []).length, 1);
  // Capacitor keeps CSS-driven insets: no native or plugin change.
  assert.deepEqual(JSON.parse(read('capacitor.config.json')).plugins.SystemBars, { insetsHandling: 'css', style: 'DARK', hidden: false });
});

test('11. reduced motion: no width travel, no scale, a quick crossfade instead; no infinite island animation', () => {
  assert.match(foundationCss, /:root\[data-us-motion="reduced"\] \.us-island-shell\{transition:none\}/);
  assert.match(foundationCss, /@media \(prefers-reduced-motion:reduce\)\{\s*\.us-island-shell\{transition:none\}/);
  assert.match(foundationCss, /@keyframes us-island-fade\{from\{opacity:0\}to\{opacity:1\}\}/);
  const block = foundationCss.slice(foundationCss.indexOf('HUMAN-UI-03 — US Island'), foundationCss.indexOf('M12A — Tiles and their destinations'));
  assert.doesNotMatch(block, /infinite/);
  assert.match(foundationCss, /--us-island-morph:280ms;/, 'user-triggered morph inside the 180–320ms range');
});

test('16 + 17. Game RPC list and Quest RPC paths are unchanged', () => {
  const games = read('games.js');
  const rpcs = [...new Set([...games.matchAll(/sb\.rpc\('([a-z_0-9]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(rpcs, ['complete_game_session_side', 'create_weekly_question', 'get_game_session', 'get_game_v2_home', 'mark_game_session_reveal_seen', 'save_game_session_answer', 'start_game_round']);
  const app = read('app.js');
  assert.match(app, /sb\.rpc\('confirm_bond_quest'/);
  assert.match(app, /sb\.rpc\('reroll_bond_quest'/);
  // No backend surface in this change.
  for (const file of ['ui-foundation.js', 'games.js', 'left-for-you.js']) assert.doesNotMatch(read(file).match(/HUMAN-UI-03[\s\S]{0,1600}/)?.[0] || '', /\.rpc\(|\.channel\(|functions\.invoke/);
});

test('19. no new dependency', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@capacitor/android', '@capacitor/app', '@capacitor/core', '@capacitor/haptics', '@supabase/supabase-js', '@us/widget-bridge']);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@capacitor/cli', '@electric-sql/pglite', 'esbuild']);
});

test('20. HUMAN-UI-02 nav dimensions remain intact', () => {
  assert.match(foundationCss, /--us-nav-height:56px;/);
  const id = read('identity.css');
  const block = id.slice(id.indexOf('/* --- M1 APK shell navigation'), id.indexOf('#home #usTodayPriorityRegion[hidden]'));
  assert.match(block, /\.us-nav-premium button\{[\s\S]*?min-width:44px!important;[\s\S]*?min-height:46px!important/);
  assert.match(block, /\.us-nav-icon\{position:relative;display:block;width:24px;height:24px;/);
  assert.doesNotMatch(block, /infinite/);
});

test('notice sources: only existing deterministic arrivals, each with its existing destination', () => {
  const app = read('app.js');
  const think = app.slice(app.indexOf('function handleIncomingThink'), app.indexOf('const usRealtimeRefreshTimers'));
  assert.match(think, /key:`think:\$\{row\.id\}`,icon:'heart',text:`\$\{name\} ti pensa`,actionLabel:'Apri',\s*onAction:\(\)=>window\.openThinkArrival\?\.\(\),/);
  assert.match(think, /if\(!shown\)toast\(`\$\{name\} ti pensa ♡`\);/, 'the toast stays the fallback');
  assert.match(app, /notify\?\.\(\{key:`think-reaction:\$\{signature\}`,icon:'heart',text:`\$\{partnerName\} ha reagito/);
  const lfy = read('left-for-you.js');
  assert.match(lfy, /updateEntry\(pending\.length, \{ arrival: wasResolved \}\);/, 'never the initial load');
  assert.match(lfy, /onAction: \(\) => tap\(\),/);
  const games = read('games.js');
  assert.match(games, /if \(topSeen !== null && attention && topSeen !== state\) announcePerVoi\(state\);/);
  assert.match(games, /if \(document\.querySelector\('\.page\.active'\)\?\.id === 'quiz'\) return false;/, 'no notice while Gioca is already on screen');
  assert.match(games, /onAction: \(\) => openPerVoi\(\),/);
  // Functional/system feedback keeps its own surfaces.
  assert.match(app, /toast\('Non riesco a inviare il segnale'\)/);
  assert.match(read('fix4.js'), /showStatus\('Sei offline\. Riprendo appena torni online\.', 'offline'\)/);
});

// ---------------------------------------------------------------- controller (fake DOM)

class FakeEl {
  constructor(id, cls = '', doc = null) {
    this.id = id; this.className = cls; this.doc = doc; this.attrs = new Map(); this.listeners = new Map(); this.children = []; this.parent = null;
    this.style = {}; this.textContent = ''; this.hidden = false; this.tabIndex = 0; this.width = 0; this.offsetWidth = 0;
    this.classList = { contains: (c) => this.className.split(' ').includes(c), add() {}, remove() {} };
  }
  add(child) { child.parent = this; this.children.push(child); return child; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(t, fn) { (this.listeners.get(t) || this.listeners.set(t, []).get(t)).push(fn); }
  removeEventListener(t, fn) { this.listeners.set(t, (this.listeners.get(t) || []).filter((f) => f !== fn)); }
  dispatch(t, event = {}) { const e = { target: this, preventDefault() { this.defaultPrevented = true; }, ...event }; let n = e.target; const path = []; while (n) { path.push(n); n = n.parent; } for (const node of t === 'click' ? path : [this]) (node.listeners.get(t) || []).forEach((fn) => fn(e)); return e; }
  contains(el) { for (let n = el; n; n = n.parent) if (n === this) return true; return false; }
  closest(sel) { for (let n = this; n; n = n.parent) if (sel.startsWith('.') && n.classList.contains(sel.slice(1))) return n; return null; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => n.children.forEach((c) => { if (sel.startsWith('.') && c.classList.contains(sel.slice(1))) out.push(c); walk(c); }); walk(this); return out; }
  getBoundingClientRect() { return { width: this.width }; }
  focus() { this.doc.activeElement = this; }
}

function islandHarness({ reduced = false, modal = false } = {}) {
  const { createIsland, ISLAND_TIMING } = require('../ui-foundation.js');
  const doc = { hidden: false, activeElement: null, listeners: new Map(), byId: {} };
  doc.getElementById = (id) => doc.byId[id] || null;
  doc.addEventListener = (t, fn) => (doc.listeners.get(t) || doc.listeners.set(t, []).get(t)).push(fn);
  doc.removeEventListener = (t, fn) => doc.listeners.set(t, (doc.listeners.get(t) || []).filter((f) => f !== fn));
  doc.fire = (t, event) => (doc.listeners.get(t) || []).forEach((fn) => fn(event));
  const el = (id, cls) => { const e = new FakeEl(id, cls, doc); if (id) doc.byId[id] = e; return e; };
  const page = el('page', 'page');
  const host = el('usIsland', 'us-island');
  const shell = host.add(el('usIslandShell', 'us-island-shell'));
  const perVoi = shell.add(el('usPerVoiTop', 'us-island-action'));
  const trigger = shell.add(el('usIslandTrigger', 'us-island-mark'));
  const envelope = shell.add(el('leftForYouPartnerEntry', 'us-island-action'));
  const notice = shell.add(el('usIslandNotice', 'us-island-notice'));
  notice.add(el('', 'us-island-notice-icon')); notice.add(el('', 'us-island-notice-text')); notice.add(el('', 'us-island-notice-action'));
  const live = host.add(el('usIslandLive', 'us-island-live'));
  perVoi.setAttribute('data-us-attention', 'off'); envelope.setAttribute('data-us-attention', 'off');
  const timers = [];
  const deps = {
    isReducedMotion: () => reduced, hasOpenModal: () => modal, playOnce: () => true,
    schedule: (fn, ms) => { const t = { fn, ms, done: false }; timers.push(t); return t; },
    cancelSchedule: (t) => { if (t) t.done = true; }
  };
  shell.width = 54;
  const api = createIsland(doc, {}, deps);
  const runTimers = (filter = () => true) => { for (const t of timers.slice()) if (!t.done && filter(t)) { t.done = true; t.fn(); } };
  return { api, doc, host, shell, trigger, perVoi, envelope, notice, live, page, timers, runTimers, ISLAND_TIMING };
}

test('controller: compact ⇄ expanded through the one trigger, aria-expanded follows', () => {
  const h = islandHarness();
  assert.equal(h.api.state(), 'compact');
  assert.equal(h.host.getAttribute('data-us-island'), 'compact');
  h.trigger.dispatch('click');
  assert.equal(h.api.state(), 'expanded');
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(h.trigger.getAttribute('aria-label'), 'Chiudi menu US');
  h.trigger.dispatch('click');
  assert.equal(h.api.state(), 'compact');
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  h.api.destroy();
});

test('6. outside click folds the menu, while a touch-style scroll gesture leaves it expanded', () => {
  const h = islandHarness();
  h.api.expand();

  // A gesture that becomes a scroll starts with pointerdown, moves, scrolls
  // and ends with pointerup. None of those events may collapse the Island.
  const touch = { target: h.page, preventDefault() { throw new Error('never prevented'); } };
  h.doc.fire('pointerdown', touch);
  h.doc.fire('pointermove', touch);
  h.doc.fire('scroll', {});
  h.doc.fire('pointerup', touch);
  assert.equal(h.api.state(), 'expanded', 'touch scrolling alone never collapses the Island');

  // A real outside click collapses during capture but does not consume the
  // click, so the underlying page control still runs normally.
  let prevented = false;
  let pageClicks = 0;
  h.page.addEventListener('click', () => { pageClicks += 1; });
  const outsideClick = { target: h.page, preventDefault() { prevented = true; } };
  h.doc.fire('click', outsideClick);
  h.page.dispatch('click');
  assert.equal(h.api.state(), 'compact');
  assert.equal(prevented, false, 'outside collapse never prevents the underlying click');
  assert.equal(pageClicks, 1, 'the underlying page action still executes');

  assert.ok(!foundationJs.includes("addEventListener('pointerdown', onOutside"), 'outside collapse is not bound to pointerdown');
  assert.ok(foundationJs.includes("addEventListener('click', onOutside, true)"), 'outside collapse waits for a completed click');
  assert.ok(!foundationJs.includes("addEventListener('scroll'"), 'no scroll listener at all');
  h.api.destroy();
});

test('controller: an island action folds the menu after its own handler; Escape folds too', () => {
  const h = islandHarness();
  let ran = 0;
  h.perVoi.addEventListener('click', () => { ran += 1; });
  h.api.expand();
  h.perVoi.dispatch('click');
  assert.equal(ran, 1, 'the existing handler ran');
  assert.equal(h.api.state(), 'compact');
  h.api.expand();
  h.trigger.focus();
  const e = { key: 'Escape', preventDefault() { this.prevented = true; } };
  h.doc.fire('keydown', e);
  assert.equal(h.api.state(), 'compact');
  assert.equal(e.prevented, true);
  assert.equal(h.doc.activeElement, h.trigger, 'focus stays on the island, never trapped or lost');
  h.api.destroy();
});

test('7. a passive notice never navigates; activating it only closes it', () => {
  const h = islandHarness();
  assert.equal(h.api.notify({ key: 'r', icon: 'heart', text: 'Beatrice ha reagito ❤️' }), true);
  assert.equal(h.api.state(), 'notice');
  assert.equal(h.notice.getAttribute('data-us-notice-kind'), 'passive');
  assert.equal(h.notice.tabIndex, -1, 'passive notices do not join the tab order');
  assert.equal(h.doc.activeElement, null, 'no focus stolen');
  assert.equal(h.live.textContent, 'Beatrice ha reagito ❤️', 'announced politely once');
  h.notice.dispatch('click');
  assert.equal(h.api.state(), 'compact');
  h.api.destroy();
});

test('8. an action notice runs its existing destination ONLY on user activation, then folds', async () => {
  const h = islandHarness();
  let opened = 0;
  let resolveAction;
  h.api.notify({ key: 't', icon: 'heart', text: 'Beatrice ti pensa', actionLabel: 'Apri', onAction: () => { opened += 1; return new Promise((r) => { resolveAction = r; }); } });
  assert.equal(h.api.state(), 'action-notice');
  assert.equal(h.notice.getAttribute('aria-label'), 'Beatrice ti pensa. Apri');
  assert.equal(h.notice.tabIndex, 0, 'keyboard reachable');
  assert.equal(opened, 0, 'arrival alone never navigates');
  h.notice.dispatch('click');
  assert.equal(opened, 1);
  assert.equal(h.notice.getAttribute('aria-busy'), 'true');
  h.runTimers();
  assert.equal(h.api.state(), 'action-notice', 'does not collapse before the action completes');
  resolveAction();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.api.state(), 'compact');
  h.api.destroy();
});

test('9. notice lifecycle: dwell → compact; hover/focus holds it; hidden documents wait', () => {
  const h = islandHarness();
  h.api.notify({ key: 'a', text: 'Beatrice ha reagito ❤️' });
  const dwell = h.timers.find((t) => !t.done && t.ms === h.ISLAND_TIMING.notice);
  assert.ok(dwell && dwell.ms >= 3000 && dwell.ms <= 5500, 'readable for ~3–5s');
  h.notice.dispatch('pointerenter');
  assert.equal(dwell.done, true, 'held while the user is on it');
  h.notice.dispatch('pointerleave');
  const hold = h.timers.find((t) => !t.done && t.ms === h.ISLAND_TIMING.hold);
  assert.ok(hold);
  hold.done = true; hold.fn();
  assert.equal(h.api.state(), 'compact');
  assert.equal(h.live.textContent, '');
  h.doc.hidden = true;
  h.runTimers();
  h.api.notify({ key: 'b', text: 'Altro' });
  assert.equal(h.timers.filter((t) => !t.done && t.ms === h.ISLAND_TIMING.notice).length, 0, 'no dwell while hidden');
  h.doc.hidden = false;
  h.doc.fire('visibilitychange');
  assert.equal(h.timers.filter((t) => !t.done && t.ms === h.ISLAND_TIMING.notice).length, 1);
  h.api.destroy();
});

test('10. several notices: one island at a time, bounded latest-valid queue, never during the open menu', () => {
  const h = islandHarness();
  const shown = [];
  const read = () => h.notice.querySelector('.us-island-notice-text').textContent;
  h.api.notify({ key: 'k1', text: 'uno' });
  shown.push(read());
  for (const k of ['k2', 'k3', 'k4', 'k5']) h.api.notify({ key: k, text: k });
  h.api.notify({ key: 'k3', text: 'k3 bis', isValid: () => false });
  assert.equal(h.api.state(), 'notice', 'still one notice on screen');
  const drain = () => { for (let i = 0; i < 12; i += 1) h.runTimers(); };
  for (let i = 0; i < 6; i += 1) { h.runTimers(); if (h.api.state() === 'notice' && read() !== shown[shown.length - 1]) shown.push(read()); }
  drain();
  assert.deepEqual(shown, ['uno', 'k4', 'k5'], 'k2 dropped by the bound, k3 replaced by its invalid copy');
  assert.equal(h.api.state(), 'compact');
  // While the menu is open a notice waits; it appears only after the menu folds.
  h.api.expand();
  h.api.notify({ key: 'w', text: 'dopo' });
  assert.equal(h.api.state(), 'expanded', 'never yanks the open menu');
  h.api.collapse();
  h.runTimers();
  assert.equal(h.api.state(), 'notice');
  h.api.destroy();
});

test('controller: a modal on screen declines the notice (caller keeps its toast)', () => {
  const h = islandHarness({ modal: true });
  assert.equal(h.api.notify({ key: 'x', text: 'Beatrice ti pensa' }), false);
  assert.equal(h.api.state(), 'compact');
  h.api.destroy();
});

test('11. reduced motion: same states, no measured width morph', () => {
  const full = islandHarness();
  full.shell.width = 54;
  const original = full.shell.getBoundingClientRect.bind(full.shell);
  let calls = 0;
  full.shell.getBoundingClientRect = () => { calls += 1; return { width: calls === 1 ? 54 : 290 }; };
  full.api.expand();
  assert.equal(full.shell.style.width, '290px', 'full motion animates between measured widths');
  assert.equal(full.host.getAttribute('data-us-island-motion'), 'grow');
  full.shell.getBoundingClientRect = original;
  full.api.destroy();
  const h = islandHarness({ reduced: true });
  h.api.expand();
  assert.equal(h.api.state(), 'expanded');
  assert.equal(h.shell.style.width, '', 'no width travel');
  h.api.notify({ key: 'n', text: 'ciao' });
  h.api.collapse();
  h.runTimers();
  assert.equal(h.api.state(), 'notice');
  assert.equal(h.shell.style.width, '');
  h.api.destroy();
});

test('controller: the compact island mirrors attention from its own controls, statically', () => {
  const h = islandHarness();
  assert.equal(h.host.getAttribute('data-us-attention'), 'off');
  h.envelope.setAttribute('data-us-attention', 'on');
  h.api.syncAttention();
  assert.equal(h.host.getAttribute('data-us-attention'), 'on');
  assert.equal(h.trigger.getAttribute('aria-label'), 'Apri menu US, c’è qualcosa per te');
  assert.match(foundationCss, /\.us-island\[data-us-attention="on"\]:not\(\[data-us-island="expanded"\]\) \.us-island-mark::after\{opacity:1;transform:none\}/);
  h.api.destroy();
});

// ---------------------------------------------------------------- real app (Chromium)

function world() {
  const F = 'f1', B = 'b1', C = 'c1';
  const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
  return {
    profiles: [{ id: F, display_name: 'Francesco', role: 'francesco', couple_id: C, avatar_path: null }, { id: B, display_name: 'Beatrice', role: 'beatrice', couple_id: C, avatar_path: null }],
    couple_locations: [], moments: [{ id: 'm1', couple_id: C, created_by: F, storage_path: `${C}/${F}/a.webp`, caption: 'Mare', moment_date: '2026-05-01', created_at: ago(60000) }],
    shared_events: [], shared_event_completions: [], relationship_milestones: [], couples: [{ id: C, bond_xp: 340, started_on: null }],
    calendar_entries: [], calendar_reminders: [], bucket_items: [], left_for_you: [], moment_photos: [], bond_weekly_quests: [], stories: [], conserva_contributions: [], shared_messages: [], think_reactions: []
  };
}
// Realtime handlers are captured so a test can deliver an INSERT exactly as Supabase would.
const CAPTURE_REALTIME = FAKE_SUPABASE.replace(
  'channel() { const c = { on() { return c; }, subscribe() { return c; }, unsubscribe() {}, send() {} }; return c; },',
  'channel() { const c = { on(_t, f, cb) { (window.__qaRealtime ||= []).push({ table: f && f.table, cb }); return c; }, subscribe() { return c; }, unsubscribe() {}, send() {} }; return c; },');

async function openApp(browser, base, { width = 390, height = 844, safe = [47, 0, 34, 0], reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (/supabase-js/.test(url)) return route.fulfill({ contentType: 'text/javascript', body: CAPTURE_REALTIME });
    return route.abort();
  });
  await page.addInitScript(({ tables, safe }) => {
    window.__QA = { me: 'f1', tables, rpc: { get_notification_preferences: async () => ({ data: { think: true, today: true, bond: true, relationship: true, left_for_you: true, games: true }, error: null }) } };
    // Same variables Capacitor's SystemBars plugin injects (insetsHandling: css).
    const apply = () => { const r = document.documentElement; if (!r) return false; ['top', 'right', 'bottom', 'left'].forEach((s, i) => r.style.setProperty(`--safe-area-inset-${s}`, `${safe[i]}px`)); return true; };
    if (!apply()) new MutationObserver((_, o) => { if (apply()) o.disconnect(); }).observe(document, { childList: true });
    try { localStorage.clear(); } catch (_) {}
  }, { tables: world(), safe });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.usProfile && document.getElementById('leftForYouPartnerEntry')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 });
  await page.waitForTimeout(900);
  return { ctx, page };
}
const fire = (page, table, row) => page.evaluate(({ table, row }) => (window.__qaRealtime || []).filter((h) => h.table === table).forEach((h) => h.cb({ eventType: 'INSERT', new: row, old: {} })), { table, row });

test('real app: edge-to-edge canvas, island under the inset, notices from real arrivals, outside tap reaches the page', async (t) => {
  const chromium = loadChromium();
  if (!chromium) { t.skip('Playwright/Chromium not available in this environment'); return; }
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
      const { ctx, page } = await openApp(browser, base, { width, height });
      const g = await page.evaluate(() => {
        const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height }; };
        const controls = [...document.querySelectorAll('button, a[href]')].filter((el) => el.getClientRects().length && !el.closest('[aria-hidden="true"], [hidden]') && getComputedStyle(el).visibility !== 'hidden')
          .map((el) => ({ id: el.id || el.className, top: el.getBoundingClientRect().top, h: el.getBoundingClientRect().height })).filter((c) => c.h > 2); // 1px visually-hidden keyboard controls are not touch targets
        return { hero: r('#homeHero'), island: r('#usIsland'), shell: r('#usIslandShell'), trigger: r('#usIslandTrigger'), safe: 47, controls, appPad: getComputedStyle(document.querySelector('.app')).paddingTop };
      });
      assert.ok(g.hero.top <= 0, `${width}: the Oggi canvas starts at the physical top edge (${g.hero.top})`);
      assert.equal(g.appPad, '0px');
      assert.ok(g.island.top >= g.safe, `${width}: island row below the inset`);
      assert.ok(g.trigger.height >= 44 && g.trigger.width >= 44, `${width}: compact target ≥44px`);
      assert.ok(g.shell.width <= 64, `${width}: compact island is logo-sized (${g.shell.width}px)`);
      for (const c of g.controls) assert.ok(c.top >= g.safe - 0.5, `${width}: ${c.id} sits under the status bar (${c.top})`);

      // Expanded fits the width, with Per voi and Lascia qualcosa visible and tappable.
      await page.click('#usIslandTrigger');
      await page.waitForTimeout(450);
      const ex = await page.evaluate(() => ({ state: document.getElementById('usIsland').dataset.usIsland, shell: document.getElementById('usIslandShell').getBoundingClientRect().toJSON(), pv: document.getElementById('usPerVoiTop').getBoundingClientRect().toJSON(), lfy: document.getElementById('leftForYouPartnerEntry').getBoundingClientRect().toJSON(), labels: [...document.querySelectorAll('#usIsland .us-island-label')].map((l) => [l.textContent, l.scrollWidth <= l.clientWidth + 1]) }));
      assert.equal(ex.state, 'expanded');
      assert.ok(ex.shell.left >= 12 && ex.shell.right <= width - 12, `${width}: expanded island fits (${ex.shell.left}-${ex.shell.right})`);
      assert.ok(ex.pv.height >= 44 && ex.lfy.height >= 44);
      assert.deepEqual(ex.labels, [['Per voi', true], ['Lascia qualcosa', true]], 'labels are whole, never truncated');

      // Outside tap: the page under it still gets the tap (the nav navigates) and the island folds.
      await page.click('.nav button[data-page="bond"]');
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ state: document.getElementById('usIsland').dataset.usIsland, active: document.querySelector('.page.active').id }));
      assert.deepEqual(after, { state: 'compact', active: 'bond' });
      const noi = await page.evaluate(() => { const pt = getComputedStyle(document.getElementById('bond')).paddingTop; return { pt, first: document.querySelector('#bond .noi-canonical-page')?.getBoundingClientRect().top }; });
      assert.equal(noi.pt, '95px', 'Noi content starts at inset 47 + 48 island clearance');
      await ctx.close();
    }

    // Real Ti penso arrival → action notice; it never navigates on its own.
    {
      const { ctx, page } = await openApp(browser, base);
      await page.evaluate(() => window.go('moments', { nav: true }));
      await page.waitForTimeout(400);
      const row = { id: 'think-1', kind: 'think', sender_id: 'b1', recipient_id: 'f1', created_at: new Date().toISOString() };
      await page.evaluate((r) => window.__QA.tables.shared_messages.push(r), row); // the server row the app re-reads
      await fire(page, 'shared_messages', row);
      await page.waitForTimeout(500);
      const n = await page.evaluate(() => ({ state: document.getElementById('usIsland').dataset.usIsland, text: document.querySelector('.us-island-notice-text').textContent, label: document.getElementById('usIslandNotice').getAttribute('aria-label'), active: document.querySelector('.page.active').id, toast: document.getElementById('toast').classList.contains('show'), arrival: document.getElementById('thinkArrival').classList.contains('open') }));
      assert.deepEqual(n, { state: 'action-notice', text: 'Beatrice ti pensa', label: 'Beatrice ti pensa. Apri', active: 'moments', toast: false, arrival: false });
      await page.click('#usIslandNotice');
      await page.waitForTimeout(500);
      const opened = await page.evaluate(() => ({ arrival: document.getElementById('thinkArrival').classList.contains('open'), state: document.getElementById('usIsland').dataset.usIsland }));
      assert.deepEqual(opened, { arrival: true, state: 'compact' }, 'only the tap opened the existing Ti penso arrival');
      await ctx.close();
    }

    // Real Lasciato per te arrival → action notice → existing inbox; returns to compact by itself otherwise.
    {
      const { ctx, page } = await openApp(browser, base, { reducedMotion: 'reduce' });
      await page.evaluate(() => { window.__QA.tables.left_for_you.push({ id: 'l9', couple_id: 'c1', sender_id: 'b1', recipient_id: 'f1', kind: 'text', body: 'Ciao ♡', media_path: null, created_at: new Date().toISOString(), seen_at: null }); });
      await fire(page, 'left_for_you', {});
      await page.waitForTimeout(500);
      const n = await page.evaluate(() => ({ state: document.getElementById('usIsland').dataset.usIsland, text: document.querySelector('.us-island-notice-text').textContent, transition: parseFloat(getComputedStyle(document.getElementById('usIslandShell')).transitionDuration) < 0.01, overlay: document.getElementById('leftForYouOverlay').classList.contains('open') }));
      assert.deepEqual(n, { state: 'action-notice', text: 'Qualcosa da Beatrice', transition: true, overlay: false }, 'reduced motion: same state, no width travel');
      await page.waitForFunction(() => document.getElementById('usIsland').dataset.usIsland === 'compact', null, { timeout: 8000 });
      const back = await page.evaluate(() => ({ attention: document.getElementById('usIsland').dataset.usAttention, overlay: document.getElementById('leftForYouOverlay').classList.contains('open') }));
      assert.deepEqual(back, { attention: 'on', overlay: false }, 'the passive outcome is the static cue, never navigation');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
