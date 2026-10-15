/* Due colori, un Noi — shell motion, the approved mockup's "marea" (core.js go()).
   A tap on the bottom bar: the tab is marked at once (the indicator slides
   with the spring, the icon gives one small bounce, Maudit glances at it),
   the tab colour covers the screen from the tapped button (440 ms), the page
   changes under the colour, then the new page opens from the same point
   (560 ms) while its blocks rise in, 50 ms apart. The colour sits under the
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
// Copied from the mockup (core.js): E.io, E.out, durations in ms.
const COVER_MS = 440;
const REVEAL_MS = 560;
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
  original.apply(self, args);
}

function tabColor(button) {
  const value = getComputedStyle(button).getPropertyValue('--us-nav-c').trim();
  return value || getComputedStyle(root).getPropertyValue('--us-noi').trim();
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
  const h = window.innerHeight || 844;
  return list
    .map((el) => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ el, box }) => box.height > 0 && box.width > 0 && box.top < h && box.bottom > 0 && !el.hidden)
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

let busy = false;

async function flood(button, self, id, options) {
  const ticket = ++run;
  busy = true;
  const el = floodLayer();
  const box = button.getBoundingClientRect();
  const x = Math.round(box.left + box.width / 2);
  const y = Math.round(box.top + box.height / 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const radius = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y)));
  clear();
  markNav(button);
  bounce(button);
  try { window.USPet?.glance?.(x); } catch (_) { /* Maudit is decoration */ }
  el.style.setProperty('--us-flood', tabColor(button));
  el.hidden = false;
  const args = [id, { ...options, motionCommit: true }];
  pending = { self, args };
  try {
    await el.animate([{ clipPath: circle(0, x, y) }, { clipPath: circle(radius, x, y) }],
      { duration: COVER_MS, easing: IO, fill: 'forwards' }).finished;
  } catch (_) { /* cancelled by a programmatic go() */ }
  if (ticket !== run) return;
  flushPending();
  stagger(doc.getElementById(id), STAGGER_DELAY);
  try {
    if (canHole()) {
      await el.animate([{ clipPath: hole(0, x, y, w, h) }, { clipPath: hole(radius, x, y, w, h) }],
        { duration: REVEAL_MS, easing: IO, fill: 'forwards' }).finished;
    } else {
      await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REVEAL_MS, easing: IO, fill: 'forwards' }).finished;
    }
  } catch (_) { /* cancelled */ }
  if (ticket === run) { clear(); busy = false; }
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
    if (button && busy) return undefined; // the mockup ignores a tap while the colour moves
    if (pending) { run += 1; clear(); busy = false; flushPending(); }
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
  // The blocks of a page rise in (mockup UP.stagger), e.g. Oggi right after
  // the intro of "Entra in US". Nothing under reduced motion.
  stagger(id, delay = 0) {
    if (reducedMotion()) return;
    stagger(doc.getElementById(id) || doc.querySelector('.page.active'), delay);
  }
});
})();
