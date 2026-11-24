/* Due colori, un Noi — shell motion, the approved mockup's "marea" (core.js go()).
   A tap on the bottom bar: the tab is marked at once (the indicator slides
   with the spring, the icon gives one small bounce),
   the tab colour grows from the tapped button and covers the screen
   (~330 ms visible), the page changes under it, then the colour dissolves
   (360 ms) while the new page's blocks rise in, 50 ms apart. Fluidità 2
   (founder, 24/11/2026, «veloci ma non fluide»): every moving part is
   transform and opacity, so it runs on the compositor and a busy phone
   cannot stop it halfway (the old clip-path circle and hole were repainted
   on the main thread at every frame). The colour sits under the
   bottom bar, as in the mockup. Only taps on the bottom bar
   flood: swipes, back and in-page links keep the instant switch. A second
   tab tap while the colour moves is ignored (mockup: busy). Reduced motion:
   the new page simply fades in (180 ms). Presentation only, the navigation
   itself is still the app's go(). */
(() => {
'use strict';
if (window.__usDueColoriInstalled) return;
window.__usDueColoriInstalled = true;

const doc = document;
const root = doc.documentElement;
const original = window.go;
// Durations in ms. Fluidità 2 (founder, 24/11/2026): «un po' troppo veloci»
// at 300 ms, the colour flashed on in two frames. Now it is seen growing
// from the tab and slows as it arrives. Its edge is soft (founder: «eliminare
// il bordo netto e fare sì che prendesse piano piano la pagina»): the colour
// takes the page little by little; the whole change takes ~0.8 s, and a
// tap during it lands at once (rush).
const COVER_MS = 460;
const REVEAL_MS = 300;
const GROW = 'cubic-bezier(.4,.05,.45,1)';
const GLIDE = 'cubic-bezier(.45,0,.15,1)';
// The new page's blocks rise quickly (founder, 24/11/2026: «lentine»):
// right away, 30 ms apart, 320 ms each.
const STAGGER_DELAY = 0;
const STAGGER_STEP = 30;
const STAGGER_MS = 320;
const FADE_MS = 180;
const BOUNCE_MS = 480;
const OUT = 'cubic-bezier(.2,.8,.2,1)';

function reducedMotion() {
  if (root.dataset.usMotion === 'reduced') return true;
  try { if (window.UsUiFoundation?.isReducedMotion?.()) return true; } catch (_) { /* fall through */ }
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let layer = null;
let run = 0;
let pending = null;
let busy = false;
let entering = null;
// The flood on screen: where it opens from, where it goes, its cover.
let job = null;
// True only while a motion swaps the page (under full colour, or just before
// a sub-page starts to slide): work done now costs no frame of the motion.
let switching = false;

let disc = null;
function floodLayer() {
  if (!layer) {
    layer = doc.createElement('div');
    layer.className = 'us-flood';
    layer.setAttribute('aria-hidden', 'true');
    disc = doc.createElement('i');
    disc.className = 'us-flood-disc';
    layer.appendChild(disc);
    doc.body.appendChild(layer);
  }
  return layer;
}
// The disc is solid to 52 % of its radius, then fades out (due-colori.css).
// It is small (DISC px) and drawn once: the layer always stays in the page,
// transparent while idle, so the phone never redraws a screen-sized circle
// while it grows; the GPU only enlarges it (soft edges hide the scaling).
// Grown, its solid core reaches past the farthest corner from the tap (x2
// the distance, centred on it): the screen is all colour before the disc
// stops growing, so the page changes then, and the change's long frame
// passes while the disc still grows off screen (on the compositor, unseen).
const DISC = 480;
const OVERSIZE = 2;
const COVERED = 0.93; // the farthest corner is 97 % colour by then (the core reaches it at .962): the change is unseen
// Centres the disc on the tap; returns the scale that makes it big enough.
function placeDisc(at) {
  disc.style.left = `${at.x - DISC / 2}px`;
  disc.style.top = `${at.y - DISC / 2}px`;
  return (at.radius * OVERSIZE * 2) / DISC;
}
const flooding = () => Boolean(layer && layer.dataset.on === '1');

// Resolves once the growing disc covers the whole screen (or stops growing).
function covered(animation) {
  return new Promise((resolve) => {
    const check = () => {
      if (animation.playState !== 'running' || animation.playbackRate < 0) { resolve(); return; }
      const p = animation.effect?.getComputedTiming?.().progress;
      if (p == null || p >= COVERED) resolve(); else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

function clear() {
  entering?.classList.remove('us-marea-in');
  entering = null;
  if (!layer) return;
  layer.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  delete layer.dataset.on;
}

// A programmatic go() that arrives while the colour is moving lands at once.
function flushPending() {
  if (!pending) return;
  const { self, args } = pending;
  pending = null;
  switching = true;
  try { original.apply(self, args); } finally { switching = false; }
}

// The tab colour, read once per tab and per look (an Accento changes Noi):
// reading it at the tap would force a style pass in the tap's own frame.
const colors = new Map();
function tabColor(button) {
  const key = `${button.dataset.page}|${root.dataset.usAccent || ''}|${root.dataset.usTheme || ''}|${root.dataset.usMe || ''}|${root.dataset.usPagine || ''}`;
  if (!colors.has(key)) {
    const value = getComputedStyle(button).getPropertyValue('--us-nav-c').trim();
    colors.set(key, value || getComputedStyle(root).getPropertyValue('--us-noi').trim());
  }
  return colors.get(key);
}

// The screen the fixed layers live in (the viewport).
function stageBox() {
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

// Heavy work (a page's hydration, its renders) waits until the colour has
// finished: the reveal is a main-thread clip-path, it must run on an idle
// thread (the mockup's views are already built). Runs at once otherwise.
const afterQueue = [];
function afterMotion(fn) {
  if (typeof fn !== 'function') return;
  if (!busy) { fn(); return; }
  afterQueue.push(fn);
}
function drainAfter() {
  afterQueue.splice(0).forEach((fn) => { try { fn(); } catch (error) { console.warn('[US Due colori] after motion', error); } });
}


// The tab is marked at once, before the colour moves (mockup markTab/placeBlob).
function markNav(button) {
  doc.querySelectorAll('.nav button[data-page]').forEach((b) => {
    const on = b === button;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

function bounce(button) {
  const icon = button.querySelector('.nicon') || button.querySelector('svg');
  if (!icon?.animate) return;
  icon.animate([{ scale: 1 }, { scale: 0.82, offset: 0.3 }, { scale: 1.12, offset: 0.65 }, { scale: 1 }],
    { duration: BOUNCE_MS, easing: 'ease-out' });
}

// The blocks that rise in. An area marks them with [data-s] (as in the
// mockup); until it does, the page's top-level blocks stand in for them.
const STAGGER_FALLBACK = {
  home: '.app>.top,#usCountdownDisplay,#usCountdownEntry,#usOggiCalendarWidget,#distanceWidget,.home-distance-pill,#homeEmptyState,#usOggiDock',
  bond: '#usNoiV2>*,#usNoiSection>*',
  moments: '#moments>.section>*:not(#momentsGrid),#momentsGrid>*',
  quiz: '#usGiocaTabs,#quizHub>*,#usGiocaSintonia>*',
  settings: '#settings>.section>*'
};
function staggerTargets(page) {
  if (!page) return [];
  let list = Array.from(page.querySelectorAll('[data-s]'));
  if (!list.length && STAGGER_FALLBACK[page.id]) list = Array.from(doc.querySelectorAll(STAGGER_FALLBACK[page.id]));
  const sb = stageBox();
  return list
    .map((el) => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ el, box }) => box.height > 0 && box.width > 0 && box.top < sb.y + sb.h && box.bottom > sb.y && !el.hidden)
    .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left)
    .map(({ el }) => el);
}
function stagger(page, delay) {
  staggerTargets(page).forEach((el, i) => {
    if (!el.animate) return;
    el.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }],
      { duration: STAGGER_MS, delay: delay + i * STAGGER_STEP, easing: OUT, fill: 'backwards' });
  });
}

// Where the colour opens from: the tab's centre, on screen.
function origin(button) {
  const sb = stageBox();
  const box = button.getBoundingClientRect();
  const vx = box.left + box.width / 2;
  const x = Math.round(vx - sb.x);
  const y = Math.round(box.top + box.height / 2 - sb.y);
  const w = Math.round(sb.w);
  const h = Math.round(sb.h);
  return { vx, x, y, w, h, radius: Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y))) };
}

async function flood(button, self, id, options) {
  const ticket = ++run;
  busy = true;
  const el = floodLayer();
  // Read everything first (the tap point, the screen, the colour), then
  // write: no forced style pass in the tap.
  const from = doc.querySelector('.page.active')?.id || 'home';
  const at = origin(button);
  const color = tabColor(button);
  clear();
  markNav(button);
  bounce(button);
  el.style.setProperty('--us-flood', color);
  const grown = placeDisc(at);
  el.dataset.on = '1';
  const current = { ticket, id, from, at, button, cover: null };
  job = current;
  pending = { self, args: [id, { ...options, motionCommit: true }] };
  try {
    current.cover = disc.animate([{ transform: 'scale(0.002)' }, { transform: `scale(${grown.toFixed(3)})` }],
      { duration: COVER_MS, easing: GROW, fill: 'both' });
    await covered(current.cover);
  } catch (_) { /* cancelled by a programmatic go() */ }
  if (ticket !== run) return; // a tap took over (rush) or a programmatic go() landed
  // The screen is all colour now: the page changes under it (its own fade
  // is off, the mockup's view opens fully opaque), then the colour
  // dissolves. The fade starts on the frame after the change, so the
  // change's style and layout never eat into it.
  const to = current.id;
  entering = doc.getElementById(to);
  entering?.classList.add('us-marea-in');
  flushPending();
  stagger(doc.getElementById(to), STAGGER_DELAY);
  // The disc may still be growing off screen: it goes on while it dissolves.
  try {
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REVEAL_MS, easing: OUT, fill: 'forwards' }).finished;
  } catch (_) { /* cancelled */ }
  if (ticket === run) { job = null; clear(); busy = false; drainAfter(); }
}

// A tab tapped while the colour moves answers at once (founder, 24/11/2026:
// «se cambi velocemente le pagine non reagiscono»): no second flood to wait
// for, the page changes now and the colour still on screen fades out in a
// moment. Tap after tap, each one lands straight away.
const RUSH_MS = 160;
function rush(button, self, id, options) {
  const ticket = ++run;
  busy = true;
  pending = null;
  job = null;
  markNav(button);
  bounce(button);
  entering?.classList.remove('us-marea-in');
  entering = null;
  // Back to the page the colour was leaving (it had not changed yet): it stays
  // as it is, nothing reloads; only the colour goes.
  if (doc.querySelector('.page.active')?.id !== id) {
    switching = true;
    try { original.call(self, id, { ...options, motionCommit: true }); } finally { switching = false; }
  }
  const el = floodLayer();
  const done = () => { if (ticket === run) { clear(); busy = false; drainAfter(); } };
  if (!flooding() || !el.animate) { done(); return; }
  const from = Number(getComputedStyle(el).opacity) || 1;
  el.getAnimations().forEach((animation) => animation.cancel()); // the layer's own fade; the disc stays where it is
  el.animate([{ opacity: from }, { opacity: 0 }], { duration: RUSH_MS, easing: OUT, fill: 'forwards' }).finished.then(done, done);
}

// ---------- Sub-page: the Profilo over the page you came from (mockup UP.push / pop) ----------
// Settings enters from the right (480 ms, E.io) while Noi moves back 24 %
// and darkens (brightness .6 = a 40 % black veil, composited); its blocks
// rise 140 ms + 50 ms apart. Back to Noi (the "Noi" button, the Noi tab,
// Back): Settings leaves to the right (440 ms) and Noi comes forward. The
// page that leaves stays painted where it was, out of the flow, until the
// motion ends; the page that arrives is the live one.
const PUSH_MS = 480;
const POP_MS = 440;
const PUSH_STAGGER = 140;
// Il Profilo is a sub-page of the four pages (your character is top right on
// each, redesign definitivo D6): it slides in over the page you came from and back.
const TABS = new Set(['home', 'bond', 'moments', 'quiz']);
const subOf = (child, parent) => child === 'settings' && TABS.has(parent);
let slideJob = null;
function finishSlide() {
  const job = slideJob;
  if (!job) return;
  slideJob = null;
  job.anims.forEach((animation) => { try { animation.cancel(); } catch (_) { /* gone */ } });
  job.ghost.classList.remove('us-slide-ghost', 'is-under', 'is-over');
  ['--us-ghost-left', '--us-ghost-top', '--us-ghost-width'].forEach((name) => job.ghost.style.removeProperty(name));
  job.live?.classList.remove('us-slide-live', 'is-under', 'is-over');
  job.ghost.style.removeProperty('--us-slide-top');
  job.live?.style.removeProperty('--us-slide-top');
  job.veil.remove();
  busy = false;
  drainAfter();
}
async function slide(kind, self, id, options) {
  const ghost = doc.querySelector('.page.active');
  const live = doc.getElementById(id);
  if (!ghost || !live) { original.call(self, id, options); return; }
  busy = true;
  // Read first: where the leaving page is now on screen.
  const sb = stageBox();
  const r = ghost.getBoundingClientRect();
  const push = kind === 'push';
  ghost.style.setProperty('--us-ghost-left', `${r.left - sb.x}px`);
  ghost.style.setProperty('--us-ghost-top', `${r.top - sb.y}px`);
  ghost.style.setProperty('--us-ghost-width', `${r.width}px`);
  ghost.classList.add('us-slide-ghost', push ? 'is-under' : 'is-over');
  live.classList.add('us-slide-live', push ? 'is-over' : 'is-under');
  const veil = doc.createElement('div');
  veil.className = 'us-slide-veil';
  veil.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(veil);
  const job = { ghost, live, veil, anims: [] };
  slideJob = job;
  switching = true;
  try { original.call(self, id, { ...options, motionCommit: true }); } finally { switching = false; }
  const W = Math.round(sb.w);
  const back = Math.round(sb.w * -0.24);
  const T = push ? PUSH_MS : POP_MS;
  const timing = { duration: T, easing: GLIDE, fill: 'forwards' };
  const over = push ? live : ghost;
  const under = push ? ghost : live;
  // Its Atmosfera panel lines up with the screen's (due-colori.css).
  over.style.setProperty('--us-slide-top', `${Math.round(over.getBoundingClientRect().top)}px`);
  if (push) stagger(live, PUSH_STAGGER);
  job.anims.push(
    over.animate([{ translate: push ? `${W}px 0` : '0 0' }, { translate: push ? '0 0' : `${W}px 0` }], timing),
    under.animate([{ translate: push ? '0 0' : `${back}px 0` }, { translate: push ? `${back}px 0` : '0 0' }], timing),
    veil.animate([{ opacity: push ? 0 : 0.4 }, { opacity: push ? 0.4 : 0 }], timing)
  );
  try { await Promise.all(job.anims.map((animation) => animation.finished)); } catch (_) { /* cancelled */ }
  if (slideJob === job) finishSlide();
}

function fadeIn(id) {
  const page = doc.getElementById(id);
  page?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS });
}

if (typeof original === 'function') {
  window.go = function usDueColoriGo(id, options = {}) {
    const from = doc.querySelector('.page.active')?.id || 'home';
    const button = options && options.nav && !options.swipe && !options.motionCommit
      ? doc.querySelector(`.us-nav button[data-page="${id}"]`)
      : null;
    if (button && busy && !slideJob) { rush(button, this, id, options); return undefined; }
    if (pending) { run += 1; job = null; clear(); busy = false; flushPending(); drainAfter(); }
    if (slideJob) finishSlide(); // a programmatic go() lands the slide at once
    const sub = id && id !== from && !doc.hidden && !options?.swipe && !options?.motionCommit
      ? (subOf(id, from) ? 'push' : (subOf(from, id) ? 'pop' : null))
      : null;
    if (sub) {
      if (reducedMotion()) {
        const result = original.call(this, id, { ...options, motionCommit: true });
        fadeIn(id);
        return result;
      }
      slide(sub, this, id, options);
      return undefined;
    }
    if (!button || !id || id === from || doc.hidden) {
      return original.apply(this, arguments);
    }
    if (reducedMotion()) {
      const result = original.call(this, id, { ...options, motionCommit: true });
      fadeIn(id);
      return result;
    }
    flood(button, this, id, options);
    return undefined;
  };
}

// The colour layer is made (and its small disc drawn) at start, before the
// first tap; the tabs' colours are read in a quiet moment, so the first tap
// does not pay for a style pass either.
function prepare() {
  floodLayer();
  const warm = () => doc.querySelectorAll('.us-nav button[data-page]').forEach((button) => { try { tabColor(button); } catch (_) { /* later */ } });
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 1200);
}
if (doc.body) prepare(); else doc.addEventListener('DOMContentLoaded', prepare, { once: true });

window.UsDueColori = Object.freeze({
  // Tests and other surfaces can ask whether a flood is on screen.
  isFlooding: flooding,
  // Run heavy work once the colour between tabs has finished (at once when
  // nothing moves). app.js schedules each page's hydration through it.
  afterMotion,
  // True while a motion swaps the page out of sight of the motion itself
  // (under the full colour, or before a sub-page slides): app.js fills the
  // new page right then, so it opens complete and the motion stays free.
  switching: () => switching,
  // A sub-page step (the Profilo over a page, either way): navigation.js lets Back
  // take it through go() so it slides as the mockup's pop().
  isSubPage: (from, to) => Boolean(from && to && (subOf(to, from) || subOf(from, to))),
  // The blocks of a page rise in (mockup UP.stagger), e.g. Oggi right after
  // the intro of "Entra in US". Nothing under reduced motion.
  stagger(id, delay = 0) {
    if (reducedMotion()) return;
    stagger(doc.getElementById(id) || doc.querySelector('.page.active'), delay);
  }
});
})();
