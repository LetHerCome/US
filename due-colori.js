/* Due colori, un Noi — shell motion, the approved mockup's "marea" (core.js go()).
   A tap on the bottom bar: the tab is marked at once (the indicator slides
   with the spring, the icon gives one small bounce, Maudit glances at it),
   the tab colour covers the screen from the tapped button (260 ms), the page
   changes under the colour, then the new page opens from the same point
   (340 ms) while its blocks rise in, 50 ms apart. The colour sits under the
   bottom bar and Maudit, as in the mockup. Only taps on the bottom bar
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
// Copied from the mockup (core.js): E.io, E.out, durations in ms. The tide
// itself is quicker than the mockup (founder, 22/10, Fluidità 1): the new
// page shows after ~280 ms instead of ~490 ms, same shape and easing.
const COVER_MS = 260;
const REVEAL_MS = 340;
const STAGGER_DELAY = 160;
const STAGGER_STEP = 50;
const STAGGER_MS = 460;
const FADE_MS = 180;
const BOUNCE_MS = 480;
const IO = 'cubic-bezier(.7,0,.2,1)';
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

function floodLayer() {
  if (!layer) {
    layer = doc.createElement('div');
    layer.className = 'us-flood';
    layer.hidden = true;
    layer.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(layer);
  }
  return layer;
}

function clear() {
  entering?.classList.remove('us-marea-in');
  entering = null;
  if (!layer) return;
  layer.getAnimations().forEach((animation) => animation.cancel());
  layer.hidden = true;
  layer.style.removeProperty('clip-path');
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
  const key = `${button.dataset.page}|${root.dataset.usAccent || ''}|${root.dataset.usTheme || ''}|${root.dataset.usMe || ''}`;
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

const circle = (r, x, y) => `circle(${r}px at ${x}px ${y}px)`;
// The new page opening from the tap point = a growing hole in the colour.
// path() with evenodd keeps the hole a true circle and lets the browser
// interpolate the radius with the mockup's easing (no stepped mask).
function hole(r, x, y, w, h) {
  const R = Math.max(0, r);
  return `path(evenodd, "M0 0H${w}V${h}H0Z M${x - R} ${y}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z")`;
}
let holeSupport = null;
function canHole() {
  if (holeSupport === null) {
    try { holeSupport = Boolean(window.CSS?.supports?.('clip-path', 'path(evenodd, "M0 0H1V1H0Z")')); } catch (_) { holeSupport = false; }
  }
  return holeSupport;
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
  home: '.app>.top,#usCountdownDisplay,#usCountdownEntry,#usOggiCalendarWidget,#distanceWidget,.home-distance-pill,#usTodayPriorityRegion,#pushOptInCard,#homeEmptyState,#usOggiDock',
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
  // Read everything first (the tap point, the screen, the colour, Maudit's
  // place for the glance), then write: no forced style pass in the tap.
  const from = doc.querySelector('.page.active')?.id || 'home';
  const at = origin(button);
  const color = tabColor(button);
  try { window.USPet?.glance?.(at.vx); } catch (_) { /* Maudit is decoration */ }
  clear();
  markNav(button);
  bounce(button);
  el.style.setProperty('--us-flood', color);
  el.hidden = false;
  const current = { ticket, id, from, at, button, back: false, cover: null };
  job = current;
  pending = { self, args: [id, { ...options, motionCommit: true }] };
  try {
    current.cover = el.animate([{ clipPath: circle(0, at.x, at.y) }, { clipPath: circle(at.radius, at.x, at.y) }],
      { duration: COVER_MS, easing: IO, fill: 'forwards' });
    await current.cover.finished;
  } catch (_) { /* cancelled by a programmatic go() */ }
  if (ticket !== run) return;
  if (current.back) { // the tab it left was tapped again: the colour went back
    job = null;
    clear();
    busy = false;
    drainAfter();
    return;
  }
  // The screen is all colour now: the page changes under it (its own fade
  // is off, the mockup's view opens fully opaque), then opens from the tap
  // (from the last tab tapped, if another came while the colour rose).
  // The reveal starts on the frame after the change, so the change's style
  // and layout never eat into it.
  const to = current.id;
  const { x, y, w, h, radius } = current.at;
  entering = doc.getElementById(to);
  entering?.classList.add('us-marea-in');
  flushPending();
  stagger(doc.getElementById(to), STAGGER_DELAY);
  try {
    if (canHole()) {
      await el.animate([{ clipPath: hole(0, x, y, w, h) }, { clipPath: hole(radius, x, y, w, h) }],
        { duration: REVEAL_MS, easing: IO, fill: 'forwards' }).finished;
    } else {
      await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REVEAL_MS, easing: IO, fill: 'forwards' }).finished;
    }
  } catch (_) { /* cancelled */ }
  if (ticket === run) { job = null; clear(); busy = false; drainAfter(); }
}

// A tab tapped while the colour moves is never lost (the mockup ignored it).
// While the colour rises the flood turns to the new tab: its colour, its
// mark, and the page opens from it; the tab it left turns the colour back.
// Once the page has changed, the new tab starts a flood of its own.
function retarget(button, self, id, options) {
  const current = job;
  if (!current || current.back) return false;
  const el = floodLayer();
  if (pending) {
    if (id === current.id) return true;
    if (id === current.from) {
      current.back = true;
      pending = null; // the page it left never changes
      markNav(button);
      bounce(button);
      try { current.cover?.reverse(); } catch (_) { current.cover?.cancel(); }
      return true;
    }
    const before = getComputedStyle(el).backgroundColor;
    current.id = id;
    current.button = button;
    current.at = origin(button);
    pending.self = self;
    pending.args = [id, { ...options, motionCommit: true }];
    markNav(button);
    bounce(button);
    el.style.setProperty('--us-flood', tabColor(button));
    el.animate?.([{ backgroundColor: before }, { backgroundColor: getComputedStyle(el).backgroundColor }], { duration: 160, easing: OUT });
    return true;
  }
  if (id === current.id) return true;
  run += 1;
  job = null;
  clear();
  busy = false;
  flood(button, self, id, options);
  return true;
}

// ---------- Sub-page: Settings over Noi (mockup UP.push / pop) ----------
// Settings enters from the right (480 ms, E.io) while Noi moves back 24 %
// and darkens (brightness .6 = a 40 % black veil, composited); its blocks
// rise 140 ms + 50 ms apart. Back to Noi (the "Noi" button, the Noi tab,
// Back): Settings leaves to the right (440 ms) and Noi comes forward. The
// page that leaves stays painted where it was, out of the flow, until the
// motion ends; the page that arrives is the live one.
const PUSH_MS = 480;
const POP_MS = 440;
const PUSH_STAGGER = 140;
const PARENT = { settings: 'bond' };
let slideJob = null;
function finishSlide() {
  const job = slideJob;
  if (!job) return;
  slideJob = null;
  job.anims.forEach((animation) => { try { animation.cancel(); } catch (_) { /* gone */ } });
  job.ghost.classList.remove('us-slide-ghost', 'is-under', 'is-over');
  ['--us-ghost-left', '--us-ghost-top', '--us-ghost-width'].forEach((name) => job.ghost.style.removeProperty(name));
  job.live?.classList.remove('us-slide-live', 'is-under', 'is-over');
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
  const timing = { duration: T, easing: IO, fill: 'forwards' };
  const over = push ? live : ghost;
  const under = push ? ghost : live;
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
    if (button && busy && !slideJob && retarget(button, this, id, options)) return undefined;
    if (pending) { run += 1; job = null; clear(); busy = false; flushPending(); drainAfter(); }
    if (slideJob) finishSlide(); // a programmatic go() lands the slide at once
    const sub = id && id !== from && !doc.hidden && !options?.swipe && !options?.motionCommit
      ? (PARENT[id] === from ? 'push' : (PARENT[from] === id ? 'pop' : null))
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

window.UsDueColori = Object.freeze({
  // Tests and other surfaces can ask whether a flood is on screen.
  isFlooding: () => Boolean(layer && !layer.hidden),
  // Run heavy work once the colour between tabs has finished (at once when
  // nothing moves). app.js schedules each page's hydration through it.
  afterMotion,
  // True while a motion swaps the page out of sight of the motion itself
  // (under the full colour, or before a sub-page slides): app.js fills the
  // new page right then, so it opens complete and the motion stays free.
  switching: () => switching,
  // A sub-page step (Settings over Noi, either way): navigation.js lets Back
  // take it through go() so it slides as the mockup's pop().
  isSubPage: (from, to) => Boolean(from && to && (PARENT[to] === from || PARENT[from] === to)),
  // The blocks of a page rise in (mockup UP.stagger), e.g. Oggi right after
  // the intro of "Entra in US". Nothing under reduced motion.
  stagger(id, delay = 0) {
    if (reducedMotion()) return;
    stagger(doc.getElementById(id) || doc.querySelector('.page.active'), delay);
  }
});
})();
