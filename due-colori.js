/* Due colori, un Noi — shell motion (approved 2026-10-14).
   "Marea": tapping a tab in the bottom bar floods the screen with that tab's
   colour from the tapped button, the page changes under the colour, then the
   colour opens from the same point and leaves the new page. Only taps on the
   bottom bar flood: swipes, back and in-page links keep the instant switch.
   Reduced motion: no flood at all. Presentation only, the navigation itself
   is still the app's go(). */
(() => {
'use strict';
if (window.__usDueColoriInstalled) return;
window.__usDueColoriInstalled = true;

const doc = document;
const root = doc.documentElement;
const original = window.go;
const COVER_MS = 360;
const REVEAL_MS = 440;
const EASE = 'cubic-bezier(.7,0,.2,1)';

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
  layer.style.removeProperty('mask-image');
  layer.style.removeProperty('-webkit-mask-image');
}

// A tap that arrives while the colour is still moving lands at once.
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

function circle(r, x, y) { return `circle(${r}px at ${x}px ${y}px)`; }

function hole(r, x, y) {
  return `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, #000 ${r + 1}px)`;
}

async function flood(button, self, args) {
  const ticket = ++run;
  const el = floodLayer();
  const box = button.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const radius = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y)));
  clear();
  el.style.setProperty('--us-flood', tabColor(button));
  el.hidden = false;
  pending = { self, args };
  try {
    await el.animate([{ clipPath: circle(0, x, y) }, { clipPath: circle(radius, x, y) }],
      { duration: COVER_MS, easing: EASE, fill: 'forwards' }).finished;
  } catch (_) { /* cancelled by a newer tap */ }
  if (ticket !== run) return;
  flushPending();
  // The colour opens from the same point and leaves the new page.
  const frames = 18;
  const steps = [];
  for (let i = 0; i <= frames; i += 1) {
    const t = i / frames;
    const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const r = Math.round(radius * eased);
    steps.push({ maskImage: hole(r, x, y), WebkitMaskImage: hole(r, x, y), clipPath: circle(radius, x, y) });
  }
  try {
    await el.animate(steps, { duration: REVEAL_MS, easing: 'linear', fill: 'forwards' }).finished;
  } catch (_) { /* cancelled */ }
  if (ticket === run) clear();
}

if (typeof original === 'function') {
  window.go = function usDueColoriGo(id, options = {}) {
    const from = doc.querySelector('.page.active')?.id || 'home';
    const button = options && options.nav && !options.swipe && !options.motionCommit
      ? doc.querySelector(`.us-nav button[data-page="${id}"]`)
      : null;
    if (pending) { run += 1; clear(); flushPending(); }
    if (!button || !id || id === from || reducedMotion() || doc.hidden) {
      return original.apply(this, arguments);
    }
    flood(button, this, arguments);
    return undefined;
  };
}

window.UsDueColori = Object.freeze({
  // Tests and other surfaces can ask whether a flood is on screen.
  isFlooding: () => Boolean(layer && !layer.hidden)
});
})();
