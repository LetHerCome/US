// Premi, fase 2 (founder, 25/11/2026: grill D20–D21 and the approved tavola
// «Premi di Oggi»): the Ti penso rewards play when the Ti penso is opened,
// right after its own scene, so they are seen even when it is read later.
//   «Cuori» (level 5): hearts in your two colours come out of the heart eyes of
//   whoever thinks of you; a touch pops one. The reply buttons keep their taps.
//   «Lettera» (level 15): an envelope in their colour, a wax seal with their
//   character; a touch breaks the seal, the flap opens, the sheet comes forward
//   («Ti penso», their name). Another touch puts it away.
// Once per Ti penso; nothing with reduced motion. Never talks to Supabase.
(() => {
'use strict';
if (window.UsThinkReward) return;

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const reduced = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let probe = null;
function rgb(cssColor, fallback) {
  try {
    probe ||= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    probe.clearRect(0, 0, 1, 1); probe.fillStyle = fallback; probe.fillStyle = cssColor || fallback; probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data; return [r, g, b];
  } catch (_) { return [255, 124, 150]; }
}
const css = ([r, g, b]) => `rgb(${r},${g},${b})`;
const ink = (c) => css(c.map((v, i) => Math.round(v + ([26, 16, 32][i] - v) * 0.55)));
function colors() {
  const root = getComputedStyle(document.documentElement);
  return { tu: rgb(root.getPropertyValue('--us-tu').trim(), '#ff7c96'), pa: rgb(root.getPropertyValue('--us-partner').trim(), '#a98bff') };
}
function heart(c, s) {
  c.beginPath(); c.moveTo(0, s * 0.55);
  c.bezierCurveTo(-s * 1.05, -s * 0.05, -s * 0.55, -s * 0.95, 0, -s * 0.36);
  c.bezierCurveTo(s * 0.55, -s * 0.95, s * 1.05, -s * 0.05, 0, s * 0.55); c.closePath();
}

// ---------------- «Cuori» ----------------
function playHearts(root) {
  const sheet = root.querySelector('.think-arrival-sheet') || root;
  const face = root.querySelector('[data-think-them] svg');
  if (!face) return false;
  let canvas = sheet.querySelector(':scope > canvas.us-think-hearts');
  if (!canvas) { canvas = document.createElement('canvas'); canvas.className = 'us-think-hearts'; canvas.setAttribute('aria-hidden', 'true'); sheet.appendChild(canvas); }
  const c = canvas.getContext('2d');
  const box = sheet.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fr = face.getBoundingClientRect();
  // The eyes in the character's own drawing (viewBox -4 6 108 100, eyes at 40/60, ~57).
  const eye = (x) => [fr.left - box.left + (x + 4) / 108 * fr.width, fr.top - box.top + (57 - 6) / 100 * fr.height];
  const eyes = [eye(40), eye(60)];
  const col = colors();
  let hs = [], bits = [], made = 0, last = performance.now(), alive = true;
  const spawn = () => { const [x, y] = eyes[made % 2]; hs.push({ x, y, vx: (made % 2 ? 1 : -1) * rnd(14, 46), vy: -rnd(60, 110), s: rnd(9, 15), col: made % 2 ? 'pa' : 'tu', t: 0, ph: rnd(0, TAU), pop: 0 }); made += 1; };
  const timer = setInterval(() => { spawn(); if (made >= 24) clearInterval(timer); }, 80);
  const onDown = (event) => {
    const x = event.clientX - box.left, y = event.clientY - box.top;
    for (const h of hs) if (!h.pop && Math.hypot(h.x - x, h.y - y) < h.s * 2.4) {
      h.pop = 0.001;
      for (let k = 0; k < 5; k += 1) { const a = rnd(0, TAU), sp = rnd(40, 90); bits.push({ x: h.x, y: h.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, c: col[h.col], t: 0 }); }
    }
  };
  sheet.addEventListener('pointerdown', onDown);
  const stop = () => { alive = false; clearInterval(timer); sheet.removeEventListener('pointerdown', onDown); canvas.remove(); };
  const frame = (now) => {
    if (!alive) return;
    if (!root.classList.contains('open') || !canvas.isConnected) { stop(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const h of hs) { h.t += dt; h.x += (h.vx + Math.sin(h.t * 3 + h.ph) * 14) * dt; h.y += h.vy * dt; h.vx *= Math.exp(-1.2 * dt); h.vy *= Math.exp(-0.35 * dt); if (h.pop) h.pop += dt; }
    hs = hs.filter((h) => h.t < 4.2 && h.y > -30 && (!h.pop || h.pop < 0.35));
    for (const b of bits) { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 80 * dt; }
    bits = bits.filter((b) => b.t < 0.8);
    c.clearRect(0, 0, box.width, box.height);
    for (const h of hs) {
      const sc = Math.min(1, h.t * 3) * (h.pop ? 1 + h.pop * 2 : 1);
      c.save(); c.globalAlpha = (h.pop ? 1 - h.pop / 0.35 : 1) * Math.max(0, Math.min(1, 4.2 - h.t)); c.translate(h.x, h.y); c.scale(sc, sc);
      heart(c, h.s); c.fillStyle = css(col[h.col]); c.fill(); c.lineWidth = 1.2; c.strokeStyle = ink(col[h.col]); c.stroke();
      c.beginPath(); c.ellipse(-h.s * 0.32, -h.s * 0.28, h.s * 0.14, h.s * 0.09, -0.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill();
      c.restore();
    }
    for (const b of bits) { c.save(); c.globalAlpha = Math.max(0, 1 - b.t / 0.8); c.translate(b.x, b.y); heart(c, 2.8); c.fillStyle = css(b.c); c.fill(); c.restore(); }
    if (made < 24 || hs.length || bits.length) requestAnimationFrame(frame); else stop();
  };
  requestAnimationFrame(frame);
  return true;
}

// ---------------- «Lettera» ----------------
const HEART_PATH = 'M11 15 C3 9 6 3 11 7 C16 3 19 9 11 15 Z';
function letterMarkup(name, when, seal, face) {
  return `<div class="us-letter" role="button" tabindex="0" aria-label="Apri la lettera">
    <div class="us-letter-env">
      <svg class="us-letter-back" viewBox="0 0 300 200" aria-hidden="true"><defs><pattern id="usLetterLiner" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" style="fill:var(--env-l)"/><path d="${HEART_PATH}" style="fill:var(--env)" opacity=".6"/></pattern></defs><rect x="2" y="2" width="296" height="196" rx="14" style="fill:var(--env-d)"/><path d="M10 8 L150 116 L290 8 Z" fill="url(#usLetterLiner)"/></svg>
      <div class="us-letter-paper"><span class="us-letter-date">${esc(when)}</span><b class="us-letter-hand">Ti penso</b><span class="us-letter-sign" translate="no">— ${esc(name)}</span><span class="us-letter-face">${face}</span></div>
      <svg class="us-letter-front" viewBox="0 0 300 200" aria-hidden="true"><defs><linearGradient id="usLetterFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--env-l)"/><stop offset="1" style="stop-color:var(--env)"/></linearGradient></defs><path d="M2 14 Q2 3 12 6 L150 126 L288 6 Q298 3 298 14 V184 Q298 198 284 198 H16 Q2 198 2 184 Z" fill="url(#usLetterFront)"/><path d="M6 194 L132 112 M294 194 L168 112" stroke="rgba(0,0,0,.12)" stroke-width="2" stroke-linecap="round"/><path d="M12 6 L150 126 L288 6" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/></svg>
      <svg class="us-letter-flap" viewBox="0 0 300 136" aria-hidden="true"><defs><linearGradient id="usLetterFlap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--env)"/><stop offset="1" style="stop-color:var(--env-l)"/></linearGradient></defs><path d="M2 2 H298 L166 120 Q150 133 134 120 Z" fill="url(#usLetterFlap)" stroke="rgba(0,0,0,.1)" stroke-width="1.5"/></svg>
      <div class="us-letter-seal"><span class="half l"></span><span class="half r"></span><span class="emb">${seal}</span></div>
      <span class="us-letter-heart" style="--x:-30%;--d:0s"></span><span class="us-letter-heart b" style="--x:10%;--d:.25s"></span><span class="us-letter-heart" style="--x:40%;--d:.5s"></span><span class="us-letter-heart b" style="--x:-5%;--d:.8s"></span>
    </div>
    <span class="us-letter-hint">Tocca il sigillo</span>
  </div>`;
}
function playLetter(root, { name, at, them }) {
  const sheet = root.querySelector('.think-arrival-sheet') || root;
  sheet.querySelector(':scope > .us-letter-layer')?.remove();
  const P = window.UsPersonaggi;
  const seal = P?.character ? P.character(them, { size: 40, reaction: '', mood: '', color: '#f7c3b8' }) : '';
  const face = P?.character ? P.character(them, { size: 28, reaction: '', mood: '' }) : '';
  const time = at ? new Date(at) : new Date();
  const when = `oggi alle ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
  const layer = document.createElement('div');
  layer.className = 'us-letter-layer';
  layer.innerHTML = letterMarkup(name, when, seal, face);
  sheet.appendChild(layer);
  const letter = layer.querySelector('.us-letter');
  const col = colors(), mix = (a, b, t) => css(a.map((v, i) => Math.round(v + (b[i] - v) * t)));
  letter.style.setProperty('--env', css(col.pa)); letter.style.setProperty('--env-l', mix(col.pa, [255, 255, 255], 0.45)); letter.style.setProperty('--env-d', mix(col.pa, [26, 16, 32], 0.38));
  letter.style.setProperty('--env-ink', mix(col.pa, [26, 16, 32], 0.45)); letter.style.setProperty('--env-tu', css(col.tu));
  letter.style.setProperty('--heart', `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='3 3 16 13'><path d='${HEART_PATH}'/></svg>`)}")`);
  let timers = [];
  const open = () => {
    if (letter.classList.contains('o1')) return;
    letter.querySelector('.us-letter-hint').hidden = true;
    for (const [cls, t] of [['o1', 0], ['o2', 260], ['o3', 820], ['o4', 1550]]) timers.push(setTimeout(() => letter.classList.add(cls), t));
    letter.setAttribute('aria-label', 'Metti via la lettera');
    window.UsFeedback?.success?.();
  };
  const away = () => { timers.forEach(clearTimeout); layer.classList.add('is-leaving'); setTimeout(() => layer.remove(), 320); };
  const toggle = (event) => { event?.stopPropagation?.(); if (letter.classList.contains('o4')) away(); else open(); };
  letter.addEventListener('click', toggle);
  letter.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(event); } });
  requestAnimationFrame(() => letter.classList.add('arrive'));
  // Closing the Ti penso takes the letter with it.
  const watch = setInterval(() => { if (!root.classList.contains('open') || !layer.isConnected) { clearInterval(watch); layer.remove(); } }, 500);
  setTimeout(() => letter.focus?.({ preventScroll: true }), 950);
  return true;
}

// ---------------- once per Ti penso, after its scene ----------------
const played = new Set();
function play(root, think = {}) {
  const kind = document.documentElement.dataset.usThinkFx;
  if (!root || (kind !== 'hearts' && kind !== 'letter') || reduced()) return false;
  const key = String(think.id || think.created_at || '');
  if (key && played.has(key)) return false;
  if (key) played.add(key);
  const me = window.UsPersonaggi?.myRole?.() === 'beatrice' ? 'beatrice' : 'francesco';
  const them = me === 'beatrice' ? 'francesco' : 'beatrice';
  setTimeout(() => {
    if (!root.classList.contains('open')) return;
    if (kind === 'hearts') playHearts(root);
    else playLetter(root, { name: think.name || 'La tua persona', at: think.created_at, them });
  }, 900);
  return true;
}
window.UsThinkReward = Object.freeze({ play });
})();
