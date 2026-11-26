// US V3 — Oggi themes and background effects.
// One catalog, one renderer: the real Oggi hero and every gallery preview are
// painted by the same markup and the same CSS (oggi-look.css), so a preview is
// exactly what lands on Oggi. Entitlement is the existing Rewards V2 authority
// (USProgression): free looks have no reward; the others name the server
// reward that unlocks them, and are hidden while the server does not know it.
// The choice itself is device-local, stored by USProgression with the other
// cosmetics of this phone. This module never writes to Supabase.
(() => {
'use strict';
if (window.USOggiLook) return;

// O11 (1.0) — Italian names; the seasonal theme speaks of no month.
// Premi di Oggi (grill D4, D9, D14, 25/11/2026): Sogno pastello, Cinema and
// Il vostro cielo left; whoever had them is back on Originale.
// Temi di Oggi (tavola «Temi e countdown di Oggi», approved 26/11/2026):
// Pellicola free, Ora d'oro at 6, Stagioni at 12 drawn again; Romantico and
// Chiaro di luna left, whoever had them is back on Originale.
const THEMES = Object.freeze([
  { id: 'original', name: 'Originale', note: 'Il vostro Oggi di sempre, senza aggiunte.', reward: null },
  { id: 'film', name: 'Pellicola', note: 'Come una foto di una macchinetta usa e getta: grana, una luce che entra di lato e la data stampata.', reward: null },
  { id: 'golden', name: 'Ora d’oro', note: 'La luce calda del tramonto su qualsiasi foto, con un riflesso di sole che si muove piano.', reward: 'oggi_theme_golden', level: 6 },
  { id: 'seasonal', name: 'Stagioni', kicker: 'Stagioni', note: 'Cambia da solo con l’anno: i ciliegi in fiore, il sole e il mare, le castagne e le foglie, il vetro ghiacciato e la neve.', reward: 'oggi_theme_seasonal', level: 12 }
]);
// Premi di Oggi (grill D3, D8, D14 and the tavola, 25/11/2026): three steps
// that grow with the level, drawn by oggi-fx.js. Stelle luminose, Lucciole,
// Luci sfocate and Aurora left; whoever had them is back on Nessuno.
const EFFECTS = Object.freeze([
  { id: 'none', name: 'Nessuno', note: 'Solo la vostra foto.', reward: null },
  { id: 'hearts', name: 'Cuori', step: 'Base', note: 'Coppie di cuori nei vostri due colori che si cercano salendo e si incontrano.', reward: null },
  { id: 'petals', name: 'Petali', step: 'Base', note: 'Tre forme vere di petalo che girano mentre cadono nel vento.', reward: null },
  { id: 'dandelions', name: 'Soffioni', step: 'Natura', note: 'Semi di tarassaco col loro ombrellino di fili, uno per colore, che salgono piano.', reward: 'oggi_effect_dandelions', level: 4 },
  { id: 'snow', name: 'Neve', step: 'Natura', note: 'Fiocchi disegnati su tre profondità, lontani, a metà e vicini.', reward: 'oggi_effect_snow', level: 7 },
  { id: 'leaves', name: 'Foglie', step: 'Natura', note: 'Foglie d’acero e d’autunno che ondeggiano, si posano e svaniscono.', reward: 'oggi_effect_leaves', level: 10 },
  { id: 'shooting', name: 'Stelle cadenti', step: 'Vostri', note: 'Un cielo che brilla piano e ogni tanto una scia nei vostri colori.', reward: 'oggi_effect_shooting', level: 13 },
  { id: 'lanterns', name: 'Lanterne', step: 'Vostri', note: 'Lanterne di carta che salgono, ognuna con la luce di uno di voi due.', reward: 'oggi_effect_lanterns', level: 16 },
  { id: 'memories', name: 'Ricordi in volo', step: 'Vostri', kicker: 'Il più vostro', note: 'Piccole polaroid delle vostre foto galleggiano dietro il conto, col nastro di chi le ha aggiunte.', reward: 'oggi_effect_memories', level: 20 }
]);
// What the finger does in Foto a fuoco, said once in the preview.
const TOUCH = Object.freeze({
  hearts: 'Tocca un cuore: scoppia. Tocca il vuoto: parte una coppia dal dito.',
  petals: 'Tocca: i petali vicini volano via girando.',
  dandelions: 'Tocca: soffi via i semi vicini e ne liberi altri.',
  snow: 'Tocca: un soffio sul vetro e un po’ di neve fine.',
  leaves: 'Tocca: le foglie vicine saltano e ruzzolano.',
  shooting: 'Tocca: parte una stella. Scorri: la lanci tu.',
  lanterns: 'Tocca: una lanterna parte dal dito. Scorri: fai vento.',
  memories: 'Tocca una polaroid: si apre quel ricordo. Scorri: le lanci.'
});
const CATALOG = { theme: THEMES, effect: EFFECTS };
const DEFAULTS = { theme: 'original', effect: 'none' };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name) => `<span class="us-icon" data-us-icon="${name}" aria-hidden="true"></span>`;
const find = (slot, id) => (CATALOG[slot] || []).find((look) => look.id === id) || null;
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// ---------- entitlement (read-only view of the Rewards V2 state) ----------
function rewardFor(look) {
  if (!look?.reward) return null;
  return (window.USProgression?.getState?.()?.rewards || []).find((reward) => reward.id === look.reward) || null;
}
// included | unlocked | locked | unavailable (the server does not offer it yet)
function status(slot, id) {
  const look = find(slot, id);
  if (!look) return { state: 'unavailable' };
  if (!look.reward) return { state: 'included' };
  const reward = rewardFor(look);
  if (!reward) return { state: 'unavailable' };
  if (reward.unlocked) return { state: 'unlocked' };
  return { state: 'locked', level: Number(reward.level_required) || look.level || 0, plus: Boolean(reward.requires_plus) };
}
const usable = (slot, id) => ['included', 'unlocked'].includes(status(slot, id).state);
function visibleLooks(slot) {
  return (CATALOG[slot] || []).filter((look) => status(slot, look.id).state !== 'unavailable');
}

// The season of a Rome day (YYYY-MM-DD, today by default): Tema delle stagioni.
function seasonFor(day) {
  let iso = day;
  if (!iso) { try { iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()); } catch (_) { iso = new Date().toISOString().slice(0, 10); } }
  const month = Number(String(iso).slice(5, 7));
  return month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
}

// ---------- Stagioni: what is drawn, still, on the edges of the photo ----------
// Tavola v7 (26/11/2026): spring = Japanese cherry crowns from the top corners
// and petals lying behind the daily question; summer = a sun top right and the
// sea behind the question; autumn = red and gold crowns, chestnuts on the edges
// and a bed of leaves; winter = frost on the top corners and snow. Nothing
// falls (that is what the effects do). Each piece is one SVG image, built once
// per season and painted by the browser as a background: no nodes, no frames.
const SEASON_ART = (() => {
  const cache = {};
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const f = (n) => n.toFixed(1);
  const img = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k).toString(16).padStart(2, '0')).join(''); };
  const petal = (r) => `M0 0C${f(-r * .55)} ${f(-r * .3)} ${f(-r * .62)} ${f(-r * .92)} ${f(-r * .2)} ${f(-r * 1.06)}L0 ${f(-r * .86)}L${f(r * .2)} ${f(-r * 1.06)}C${f(r * .62)} ${f(-r * .92)} ${f(r * .55)} ${f(-r * .3)} 0 0Z`;
  const bloom = (x, y, r, rot, fill, edge) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">${[0, 72, 144, 216, 288].map((a) => `<path d="${petal(r)}" transform="rotate(${a})" fill="${fill}" stroke="${edge}" stroke-width=".35"/>`).join('')}<circle r="${f(r * .28)}" fill="#e0607f"/></g>`;
  const youngLeaf = (x, y, s, rot) => `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})" d="M0 0C3-3 9-3 12 0C9 3 3 3 0 0Z" fill="#8a7a3a" opacity=".85"/>`;
  const looseP = (x, y, s, rot) => `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})" d="M0 0C-3-2-3.4-6-1-7L0-6L1-7C3.4-6 3-2 0 0Z" fill="#ffd9e4" stroke="#eea3b8" stroke-width=".4"/>`;
  const MAPLE = (() => { const p = [[0, -1], [.22, -.55], [.62, -.72], [.5, -.3], [.95, -.18], [.55, .08], [.68, .45], [.22, .3], [.08, .62], [0, .5]]; return [...p, ...p.slice(1, -1).reverse().map(([a, b]) => [-a, b])].map(([a, b]) => `${f(a * 10)} ${f(b * 10)}`).join('L'); })();
  const maple = (x, y, s, rot, fill) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})"><path d="M${MAPLE}Z" fill="${fill}" stroke="rgba(90,30,12,.7)" stroke-width=".7" stroke-linejoin="round"/><path d="M0 9V-8M0-1L5-5M0-1L-5-5" stroke="rgba(90,30,12,.55)" stroke-width=".5" fill="none"/></g>`;
  const oval = (x, y, s, rot, fill) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})"><path d="M-12 0C-6-7 6-7 12 0C6 7-6 7-12 0Z" fill="${fill}" stroke="rgba(90,30,12,.6)" stroke-width=".7"/><path d="M-11 0H11" stroke="rgba(90,30,12,.5)" stroke-width=".5"/></g>`;
  const SOFT = '<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity=".35"/></filter>';
  // A tree crown from the top-left corner (the right one is the same, mirrored, with another seed).
  function crown(kind, s0) {
    seed = s0;
    const rx = 96, ry = 80;
    const spot = (spread) => { const t = rnd() * Math.PI / 2, r = Math.pow(rnd(), .6) * spread; return { x: Math.cos(t) * rx * r, y: Math.sin(t) * ry * r, d: r }; };
    const branch = (p, w) => `<path d="M${p[0]} ${p[1]}Q${p[2]} ${p[3]} ${p[4]} ${p[5]}" fill="none" stroke="#2e2220" stroke-width="${w}" stroke-linecap="round"/>`;
    const pal = kind === 'spring' ? ['#f4a9bf', '#f7bccd', '#fac9d7', '#fdd9e3', '#f29ab3'] : ['#c4472a', '#d8702c', '#e39a36', '#a8352a', '#ebbd47', '#b8562c'];
    const mass = kind === 'spring' ? '#b9667f' : '#6e2a18';
    let out = Array.from({ length: 26 }, () => { const q = spot(.92); return `<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(12 + rnd() * 10)}" fill="${mass}"/>`; }).join('');
    out += branch([-6, 62, 30, 50, 58, 48], 4.2) + branch([-6, 28, 36, 20, 68, 24], 3.4) + branch([22, -6, 28, 28, 36, 54], 2.8);
    const bits = Array.from({ length: kind === 'spring' ? 330 : 260 }, () => spot(1.08)).sort((a, b) => a.d - b.d);
    out += bits.map((q) => {
      const base = pal[Math.floor(rnd() * pal.length)], k = q.d < .55 ? -.32 + q.d * .4 : (q.d - .55) * .5, c = shade(base, k), rot = rnd() * 360;
      if (kind === 'spring') return rnd() < .1 ? youngLeaf(q.x, q.y, .55 + rnd() * .3, rot) : bloom(q.x, q.y, 2.8 + rnd() * 2, rot, c, shade(base, -.25));
      return rnd() < .62 ? maple(q.x, q.y, .5 + rnd() * .32, rot, c) : oval(q.x, q.y, .38 + rnd() * .2, rot, c);
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><defs>${SOFT}</defs><g filter="url(#s)">${out}</g></svg>`;
  }
  function frost() {
    const arm = (len, a, depth) => {
      if (depth > 3 || len < 4) return '';
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
      return `<path d="M0 0L${f(ex)} ${f(ey)}" stroke="rgba(240,248,255,${(0.8 - depth * 0.15).toFixed(2)})" stroke-width="${(1.5 - depth * 0.33).toFixed(2)}" stroke-linecap="round"/>` + [0.35, 0.6, 0.82].map((t) => `<g transform="translate(${f(ex * t)} ${f(ey * t)})">${arm(len * 0.42, a - 0.75, depth + 1)}${arm(len * 0.42, a + 0.75, depth + 1)}</g>`).join('');
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><filter id="g"><feGaussianBlur stdDeviation=".35"/></filter><g filter="url(#g)">${[0.2, 0.62, 1.05, 1.4].map((a) => arm(64, a, 0)).join('')}</g></svg>`;
  }
  function chestnuts() {
    const nut = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-9 4C-10-6-2-11 0-11C2-11 10-6 9 4C6 8-6 8-9 4Z" fill="#7a3f1c" stroke="#3e1c0a" stroke-width="1"/><path d="M-9 4C-6 8 6 8 9 4C6 6-6 6-9 4Z" fill="#d9b48a"/><ellipse cx="-3" cy="-5" rx="3" ry="1.6" fill="rgba(255,255,255,.35)"/></g>`;
    const husk = `<g transform="rotate(-8) scale(1.1)"><path d="M-12 2A12 12 0 0 1 12 2Z" fill="#9aa64a" stroke="#5a6420" stroke-width="1"/>${Array.from({ length: 13 }, (_, i) => { const a = Math.PI + (i / 12) * Math.PI; return `<path d="M${f(Math.cos(a) * 11)} ${f(2 + Math.sin(a) * 11)}l${f(Math.cos(a) * 5)} ${f(Math.sin(a) * 5)}" stroke="#6f7a2a" stroke-width=".9"/>`; }).join('')}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-22 -20 46 40"><defs>${SOFT}</defs><g filter="url(#s)">${husk}${nut(-7, 11, 1, -14)}${nut(14, 10, .9, 18)}</g></svg>`;
  }
  const sun = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><radialGradient id="c"><stop offset="0" stop-color="#fffef4"/><stop offset=".55" stop-color="#fff3b8"/><stop offset="1" stop-color="#ffd76a"/></radialGradient><circle cx="30" cy="30" r="21" fill="url(#c)"/></svg>';
  // What lies behind the daily question: 275 wide, the top edge fades in.
  function ground(season) {
    const W = 275, H = 220;
    if (season === 'spring') { seed = 11; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${Array.from({ length: 130 }, () => looseP(-6 + rnd() * 287, 14 + rnd() * 206, .9 + rnd() * .7, rnd() * 360)).join('')}</svg>`; }
    if (season === 'autumn') {
      seed = 23;
      const colors = ['#c8643b', '#d9a441', '#a8402f', '#d27a3e', '#b84a2a', '#e0b04e', '#8f5a2a'];
      const leaves = Array.from({ length: 190 }, (_, i) => { const x = -10 + rnd() * 295, y = 6 + Math.pow(rnd(), .7) * 214, c = colors[i % colors.length]; return i % 3 ? maple(x, y, 1 + rnd() * .6, rnd() * 360, c) : oval(x, y, .8 + rnd() * .5, rnd() * 360, c); }).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".12" stop-color="#fff"/></linearGradient><mask id="m"><rect width="${W}" height="${H}" fill="url(#v)"/></mask><g mask="url(#m)">${leaves}</g></svg>`;
    }
    if (season === 'summer') {
      const waves = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const y = 26 + i * 22, a = 3 + i * .8; let d = `M-10 ${y}`; for (let x = -10; x < 290; x += 22) d += `q11 ${f(-a)} 22 0`; return `<path d="${d}" fill="none" stroke="rgba(255,255,255,${(0.75 - i * 0.08).toFixed(2)})" stroke-width="${(1.6 - i * .12).toFixed(2)}" stroke-linecap="round"/>`; }).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#57c3d8"/><stop offset=".4" stop-color="#2a8fb5"/><stop offset="1" stop-color="#14527e"/></linearGradient><path d="M-10 16Q60 8 137 14T290 12V230H-10Z" fill="url(#w)" opacity=".92"/><path d="M-10 16Q60 8 137 14T290 12" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2"/>${waves}<path d="M196 22h24M206 30h16M220 26h10" stroke="rgba(255,250,210,.9)" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfe0f5"/></linearGradient><path d="M-10 24C30 12 60 26 100 18C140 10 170 24 210 16C240 10 262 20 290 14V230H-10Z" fill="url(#n)"/><path d="M-10 24C30 12 60 26 100 18C140 10 170 24 210 16C240 10 262 20 290 14" fill="none" stroke="rgba(150,180,220,.6)" stroke-width="1"/></svg>`;
  }
  // The SVGs of a season (built once) and the pixel width each becomes a bitmap at.
  function pieces(season) {
    const crowns = season === 'spring' || season === 'autumn';
    const list = {
      tl: crowns ? [crown(season, season === 'spring' ? 31 : 53), 640] : season === 'winter' ? [frost(), 520] : [sun, 160],
      ground: [ground(season), 1100]
    };
    if (crowns) list.tr = [crown(season, season === 'spring' ? 47 : 71), 640];
    if (season === 'winter') list.tr = list.tl;
    if (season === 'autumn') list.nut = [chestnuts(), 160];
    return Object.fromEntries(Object.entries(list).map(([key, [svg, px]]) => [key, { svg: img(svg), px, url: '' }]));
  }
  // Fluidity (26/11/2026): an SVG of ~2000 petals is re-rasterised at every size it is drawn
  // (the hero, each gallery tile, each Premi tile): opening the gallery cost ~150 ms more on a
  // modest phone. Each piece is drawn once into a bitmap when the phone is idle; until then the
  // SVG shows, then every element on screen switches to the bitmap.
  function rasterize(season, set) {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    for (const [key, piece] of Object.entries(set)) {
      if (piece.url || piece.busy || typeof document.createElement !== 'function') continue;
      piece.busy = true;
      idle(async () => {
        try {
          const image = new Image();
          image.src = piece.svg.slice(5, -2);
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = piece.px;
          canvas.height = Math.round(piece.px * image.naturalHeight / Math.max(1, image.naturalWidth));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (!blob) return;
          piece.url = `url("${URL.createObjectURL(blob)}")`;
          for (const el of document.querySelectorAll(`.us-season-art[data-season="${season}"]>[data-piece="${key}"]`)) el.style.backgroundImage = piece.url;
        } catch (_) { /* the SVG stays: same look, only slower to paint */ } finally { piece.busy = false; }
      });
    }
  }
  function markup(season) {
    const set = cache[season] ||= pieces(season);
    rasterize(season, set);
    const piece = (key, cls) => `<span class="us-season-${cls}" data-piece="${key}" style="background-image:${(set[key].url || set[key].svg).replace(/"/g, '&quot;')}"></span>`;
    const top = season === 'spring' || season === 'autumn' ? piece('tl', 'tl') + piece('tr', 'tr')
      : season === 'winter' ? piece('tl', 'tl is-frost') + piece('tr', 'tr is-frost') : piece('tl', 'sun');
    const sides = season === 'autumn' ? ['l1', 'r1', 'r2'].map((k) => piece('nut', `nut ${k}`)).join('') : '';
    return `<span class="us-season-art" data-season="${season}">${top}${sides}${piece('ground', 'ground')}</span>`;
  }
  return markup;
})();
// Pellicola: today's date stamped like a disposable camera, "26 11 '26" (Rome).
function filmStamp() {
  let iso = '';
  try { iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()); } catch (_) { iso = new Date().toISOString().slice(0, 10); }
  return `${iso.slice(8, 10)} ${iso.slice(5, 7)} ’${iso.slice(2, 4)}`;
}
function decoMarkup(theme) {
  if (theme === 'seasonal') return SEASON_ART(seasonFor());
  if (theme === 'film') return `<span class="us-film-stamp">${esc(filmStamp())}</span>`;
  return '';
}

// ---------- applying to the real Oggi hero ----------
let applied = { theme: DEFAULTS.theme, effect: DEFAULTS.effect };
function ensureLayers() {
  const hero = $('homeHero');
  if (!hero) return null;
  let tint = hero.querySelector(':scope > .us-oggi-tint');
  if (!tint) {
    const shade = hero.querySelector(':scope > .home-photo-shade');
    tint = document.createElement('div');
    tint.className = 'us-oggi-tint';
    const deco = document.createElement('div');
    deco.className = 'us-oggi-deco';
    const fx = document.createElement('div');
    fx.className = 'us-oggi-fx';
    for (const node of [tint, deco, fx]) node.setAttribute('aria-hidden', 'true');
    const after = shade?.nextSibling || hero.firstChild;
    hero.insertBefore(fx, after);
    hero.insertBefore(deco, fx);
    hero.insertBefore(tint, deco);
  }
  // Foto a fuoco with an effect on: a tap plays with the effect, so the way
  // back to Oggi is this pill (and the back gesture).
  let exit = hero.querySelector(':scope > .us-oggi-focus-exit');
  if (!exit) {
    exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'us-oggi-focus-exit';
    exit.textContent = 'Torna a Oggi';
    exit.addEventListener('click', (event) => { event.stopPropagation(); window.toggleOggiFocusPhoto?.(); });
    hero.appendChild(exit);
  }
  return { hero, fx: hero.querySelector(':scope > .us-oggi-fx') };
}
let heroFx = null;
function apply(next = {}) {
  const theme = find('theme', next.theme) ? next.theme : DEFAULTS.theme;
  const effect = find('effect', next.effect) ? next.effect : DEFAULTS.effect;
  const root = document.documentElement;
  if (theme === DEFAULTS.theme) delete root.dataset.usOggiTheme; else root.dataset.usOggiTheme = theme;
  if (theme === 'seasonal') root.dataset.usOggiSeason = seasonFor(); else delete root.dataset.usOggiSeason;
  if (effect === DEFAULTS.effect) delete root.dataset.usOggiEffect; else root.dataset.usOggiEffect = effect;
  const layers = ensureLayers();
  const deco = layers?.hero.querySelector(':scope > .us-oggi-deco');
  if (deco) { const html = decoMarkup(theme), sign = `${theme}:${html.length}:${root.dataset.usOggiSeason || ''}`; if (deco.dataset.sign !== sign) { deco.innerHTML = html; deco.dataset.sign = sign; } }
  if (layers?.fx && (layers.fx.dataset.fx || DEFAULTS.effect) !== effect) {
    layers.fx.dataset.fx = effect;
    if (effect === DEFAULTS.effect) { heroFx?.destroy(); heroFx = null; layers.fx.innerHTML = ''; }
    else if (heroFx && heroFx.canvas.isConnected) heroFx.set(effect);
    else heroFx = window.UsOggiFx?.mount(layers.fx, effect, { hero: true }) || null;
  }
  applied = { theme, effect };
  paintSettings();
  return applied;
}
// Grill D12: the effect shines brighter for a few seconds on a Ti penso
// received, a special day and a new level. Nothing with reduced motion.
function burst() { if (applied.effect !== DEFAULTS.effect) heroFx?.burst(); }

// ---------- Foto a fuoco: the finger plays with the effect ----------
const inFocus = () => Boolean($('homeHero')?.classList.contains('us-oggi-focus'));
const touchActive = () => inFocus() && applied.effect !== DEFAULTS.effect && Boolean(heroFx);
let gesture = null;
function local(event) { const r = heroFx.canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; }
function bindTouch(hero) {
  if (!hero || hero.dataset.usOggiTouch) return;
  hero.dataset.usOggiTouch = '1';
  hero.addEventListener('pointerdown', (event) => {
    if (!touchActive() || event.button > 0 || event.target.closest?.('button,a,input')) return;
    const [x, y] = local(event);
    gesture = { x0: x, y0: y, pts: [[x, y, performance.now()]], moved: false };
    hero.setPointerCapture?.(event.pointerId);
  });
  hero.addEventListener('pointermove', (event) => {
    if (!gesture || !touchActive()) return;
    const [x, y] = local(event);
    gesture.pts.push([x, y, performance.now()]); if (gesture.pts.length > 30) gesture.pts.shift();
    if (!gesture.moved && Math.hypot(x - gesture.x0, y - gesture.y0) > 14) gesture.moved = true;
    if (gesture.moved && heroFx.answersSwipe()) heroFx.drag(x, y);
  });
  hero.addEventListener('pointerup', (event) => {
    if (!gesture || !touchActive()) { gesture = null; return; }
    const [x, y] = local(event), g = gesture; gesture = null;
    if (g.moved && heroFx.answersSwipe()) {
      const a = g.pts[Math.max(0, g.pts.length - 6)], ms = Math.max(16, performance.now() - a[2]);
      heroFx.swipe(g.x0, g.y0, x, y, (x - a[0]) / ms * 1000, (y - a[1]) / ms * 1000);
    } else heroFx.tap(g.x0, g.y0);
  });
  hero.addEventListener('pointercancel', () => { gesture = null; });
}
function paintSettings() {
  const theme = $('usOggiThemeValue');
  if (theme) theme.textContent = find('theme', applied.theme)?.name || 'Originale';
  const effect = $('usOggiEffectValue');
  if (effect) effect.textContent = find('effect', applied.effect)?.name || 'Nessuno';
}
// Animation only while Oggi is on screen and the app is visible.
function syncPause() {
  const home = $('home');
  const paused = document.hidden || !home?.classList.contains('active') || document.documentElement.classList.contains('us-app-locked');
  document.documentElement.classList.toggle('us-oggi-fx-paused', paused);
  if (!paused) { window.UsOggiFx?.wake(); specialDayBurst(); }
}
// Grill D12: on a special day (mesiversario, anniversary, 100, 200… days: the
// characters' festa) the effect shines brighter once, the first time Oggi shows.
function specialDayBurst() {
  if (applied.effect === DEFAULTS.effect) return;
  let festa = false;
  try { festa = window.UsPersonaggi?.reactionOf?.(window.usProfile?.role || '') === 'festa'; } catch (_) { festa = false; }
  if (!festa) return;
  const key = `us:oggi-fx:festa:${new Date().toISOString().slice(0, 10)}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (_) { /* no storage: still once per open */ }
  setTimeout(burst, 900);
}

// ---------- shared preview (gallery tiles and full preview) ----------
function heroSnapshot() {
  const layer = document.querySelector('#homeHero .home-photo-layer.active') || document.querySelector('#homeHero .home-photo-layer');
  const photo = layer ? getComputedStyle(layer).backgroundImage : '';
  const art = $('usCountdownDisplay');
  const visible = art && !art.hidden;
  const text = (selector) => (visible ? art.querySelector(selector)?.textContent?.trim() : '') || '';
  return {
    photo: photo && photo !== 'none' ? photo : '',
    title: text('.us-countdown-title') || 'Insieme da',
    value: text('.us-countdown-number') || '1204',
    unit: text('.us-countdown-unit') || 'giorni'
  };
}
function phoneMarkup(theme, effect, snapshot, { compact = false } = {}) {
  const photo = snapshot.photo ? ` style="${esc(`--look-photo:${snapshot.photo}`)}"` : '';
  return `<span class="us-look-phone${compact ? ' is-compact' : ''}" data-oggi-theme="${esc(theme)}"${theme === 'seasonal' ? ` data-oggi-season="${esc(seasonFor())}"` : ''}${photo}>
    <span class="us-look-photo"></span><span class="us-look-shade"></span><span class="us-oggi-tint"></span><span class="us-oggi-deco">${decoMarkup(theme)}</span>
    <span class="us-oggi-fx" data-fx="${esc(effect)}" data-fx-scale="${compact ? '0.55' : '0.9'}"></span>
    <span class="us-look-chrome"><i></i><b></b><i></i></span>
    <span class="us-look-count" data-countdown-style="editorial"><small>${esc(snapshot.title)}</small><b>${esc(snapshot.value)}</b><em>${esc(snapshot.unit)}</em></span>
    <span class="us-look-card"><small>DOMANDA DI OGGI</small><i></i><i></i></span>
    <span class="us-look-nav"><i></i><i></i><i></i><i></i></span>
  </span>`;
}

// ---------- gallery ----------
let sheet = null;
let tab = 'theme';
let focus = null; // look id shown in the full preview
let returnFocus = null;
function chip(slot, look) {
  const current = applied[slot] === look.id;
  const s = status(slot, look.id);
  if (current) return `<em class="us-look-chip is-current">${icon('check')}In uso</em>`;
  if (s.state === 'locked') return `<em class="us-look-chip is-locked">${icon('lock-simple')}Livello ${s.level}${s.plus ? ' · US Plus' : ''}</em>`;
  if (s.state === 'included') return '<em class="us-look-chip">Incluso</em>';
  return '<em class="us-look-chip">Sbloccato</em>';
}
function tileMarkup(slot, look, snapshot) {
  const s = status(slot, look.id);
  const theme = slot === 'theme' ? look.id : applied.theme;
  const effect = slot === 'effect' ? look.id : 'none';
  return `<button type="button" class="us-look-tile${applied[slot] === look.id ? ' is-current' : ''}${s.state === 'locked' ? ' is-locked' : ''}" data-look-open="${esc(look.id)}" aria-label="${esc(look.name)}: ${esc(s.state === 'locked' ? `si sblocca al livello ${s.level}` : applied[slot] === look.id ? 'in uso' : 'anteprima')}">
    ${phoneMarkup(theme, effect, snapshot, { compact: true })}
    <span class="us-look-tile-copy"><b>${esc(look.name)}</b>${chip(slot, look)}</span>
  </button>`;
}
function galleryMarkup() {
  const snapshot = heroSnapshot();
  const looks = visibleLooks(tab);
  const hidden = (CATALOG[tab] || []).length - looks.length;
  const lead = tab === 'theme'
    ? 'Cambia il tema di Oggi: luce, colori e dettagli. La vostra foto non cambia.'
    : 'Un tocco leggero sopra la foto. Uno alla volta, mai sopra i comandi.';
  return `<p class="us-look-lead">${lead}</p>
    <div class="us-look-grid" data-slot="${tab}">${looks.map((look) => tileMarkup(tab, look, snapshot)).join('')}</div>
    ${hidden ? '<p class="us-look-foot">Altri arrivano crescendo insieme in Sintonia.</p>' : '<p class="us-look-foot">I nuovi si sbloccano crescendo insieme in Sintonia.</p>'}`;
}
function detailMarkup() {
  const look = find(tab, focus);
  if (!look) return '';
  const s = status(tab, look.id);
  const theme = tab === 'theme' ? look.id : applied.theme;
  const effect = tab === 'effect' ? look.id : applied.effect;
  const current = applied[tab] === look.id;
  const touch = tab === 'effect' && TOUCH[look.id] ? `<p class="us-look-touch">${esc(TOUCH[look.id])} In Foto a fuoco.</p>` : '';
  const action = s.state === 'locked'
    ? `<button type="button" class="us-look-apply" disabled>${icon('lock-simple')}Si sblocca al livello ${s.level} di Sintonia${s.plus ? ' con US Plus' : ''}</button>`
    : current
      ? `<button type="button" class="us-look-apply is-current" disabled>${icon('check')}In uso su Oggi</button>`
      : `<button type="button" class="us-look-apply primary" data-look-apply="${esc(look.id)}">Usa su Oggi</button>`;
  return `<div class="us-look-detail-stage">${phoneMarkup(theme, effect, heroSnapshot())}</div>
    <div class="us-look-detail-copy">
      <small>${esc(look.kicker || (tab === 'theme' ? 'TEMA DI OGGI' : look.step ? `EFFETTO DI OGGI · ${look.step.toUpperCase()}` : 'EFFETTO DI OGGI'))}</small>
      <h3>${esc(look.name)}</h3><p>${esc(look.note)}</p>
      ${touch}${action}
    </div>`;
}
function build() {
  if (sheet) return sheet;
  sheet = document.createElement('div');
  sheet.className = 'us-look-overlay';
  sheet.id = 'usLookSheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `<section class="us-look-sheet" role="dialog" aria-modal="true" aria-labelledby="usLookTitle">
      <header class="us-look-head">
        <div class="us-look-head-copy"><span class="us-look-kicker">Solo su questo telefono</span><h2 id="usLookTitle">Personalizza Oggi</h2></div>
        <button type="button" class="us-look-icon-btn" data-look-close aria-label="Chiudi">${icon('x')}</button>
      </header>
      <div class="us-look-tabs" role="tablist" aria-label="Temi ed effetti" data-active="theme">
        <button type="button" role="tab" id="usLookTabTheme" data-look-tab="theme" aria-selected="true">Temi</button>
        <button type="button" role="tab" id="usLookTabEffect" data-look-tab="effect" aria-selected="false">Effetti</button>
      </div>
      <div class="us-look-body" id="usLookBody" role="tabpanel" aria-labelledby="usLookTabTheme"></div>
      <div class="us-look-actions"><button type="button" class="us-look-reset" data-look-reset>Ripristina</button></div>
      <p class="us-look-status" id="usLookStatus" role="status" aria-live="polite"></p>
    </section>
    <section class="us-look-detail" id="usLookDetail" role="dialog" aria-modal="true" aria-labelledby="usLookDetailTitle" aria-hidden="true">
      <header class="us-look-head">
        <button type="button" class="us-look-icon-btn" data-look-back aria-label="Torna alla galleria">${icon('caret-left')}</button>
        <h2 id="usLookDetailTitle">Anteprima</h2><span class="us-look-head-spacer" aria-hidden="true"></span>
      </header>
      <div class="us-look-detail-body" id="usLookDetailBody"></div>
    </section>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', onClick);
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); back(); }
  });
  return sheet;
}
function renderGallery() {
  if (!sheet) return;
  const tabs = sheet.querySelector('.us-look-tabs');
  tabs.dataset.active = tab;
  for (const button of tabs.querySelectorAll('[data-look-tab]')) button.setAttribute('aria-selected', String(button.dataset.lookTab === tab));
  const body = $('usLookBody');
  body.setAttribute('aria-labelledby', tab === 'theme' ? 'usLookTabTheme' : 'usLookTabEffect');
  body.innerHTML = galleryMarkup();
  mountPreviews(body);
  const reset = sheet.querySelector('[data-look-reset]');
  reset.disabled = applied.theme === DEFAULTS.theme && applied.effect === DEFAULTS.effect;
}
function renderDetail() {
  const body = $('usLookDetailBody');
  if (body) { body.innerHTML = detailMarkup(); mountPreviews(body); }
  const title = $('usLookDetailTitle');
  if (title) title.textContent = find(tab, focus)?.name || 'Anteprima';
}
function openGallery({ tab: requested = 'theme', look = null } = {}) {
  build();
  window.USProgression?.hydrate?.({ showUnlocks: false });
  tab = requested === 'effect' ? 'effect' : 'theme';
  returnFocus = document.activeElement;
  $('usLookStatus').textContent = '';
  renderGallery();
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('us-look-open');
  if (look && find(tab, look)) openDetail(look);
  else requestAnimationFrame(() => sheet.querySelector('[data-look-close]')?.focus({ preventScroll: true }));
}
function openDetail(id) {
  focus = id;
  renderDetail();
  const detail = $('usLookDetail');
  detail.classList.add('open');
  detail.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => detail.querySelector('[data-look-back]')?.focus({ preventScroll: true }));
}
function closeDetail() {
  const detail = $('usLookDetail');
  if (!detail?.classList.contains('open')) return false;
  detail.classList.remove('open');
  detail.setAttribute('aria-hidden', 'true');
  $('usLookDetailBody').innerHTML = '';
  const tile = sheet?.querySelector(`[data-look-open="${CSS.escape(focus || '')}"]`);
  focus = null;
  renderGallery();
  (sheet?.querySelector(`[data-look-open="${CSS.escape(tile?.dataset.lookOpen || '')}"]`) || sheet?.querySelector('[data-look-close]'))?.focus({ preventScroll: true });
  return true;
}
function closeGallery() {
  if (!sheet?.classList.contains('open')) return;
  closeDetail();
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('us-look-open');
  $('usLookBody').innerHTML = '';
  returnFocus?.focus?.({ preventScroll: true });
  returnFocus = null;
}
function back() {
  if (!closeDetail()) closeGallery();
}
async function choose(slot, id) {
  if (!usable(slot, id)) return false;
  const ok = await window.USProgression?.setLook?.(slot, id);
  if (!ok) {
    $('usLookStatus').textContent = 'Non riesco a salvarlo ora. Riprova.';
    return false;
  }
  window.UsFeedback?.success?.();
  return true;
}
async function onClick(event) {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  if (target.hasAttribute('data-look-close')) return closeGallery();
  if (target.hasAttribute('data-look-back')) return back();
  if (target.dataset.lookTab) {
    if (target.dataset.lookTab !== tab) { tab = target.dataset.lookTab; renderGallery(); window.UsFeedback?.selection?.(); }
    return;
  }
  if (target.dataset.lookOpen) return openDetail(target.dataset.lookOpen);
  if (target.dataset.lookApply) {
    const ok = await choose(tab, target.dataset.lookApply);
    if (ok) { renderDetail(); $('usLookStatus').textContent = `${find(tab, applied[tab])?.name || ''} è su Oggi.`; }
    return;
  }
  if (target.hasAttribute('data-look-reset')) {
    const okTheme = await window.USProgression?.setLook?.('theme', DEFAULTS.theme);
    const okEffect = await window.USProgression?.setLook?.('effect', DEFAULTS.effect);
    $('usLookStatus').textContent = okTheme && okEffect ? 'Oggi è tornato come in origine.' : 'Non riesco a salvarlo ora. Riprova.';
    renderGallery();
  }
}
// The previews are painted by the same engine as Oggi, so a preview is what lands on Oggi.
function mountPreviews(root) {
  if (!window.UsOggiFx || !root?.querySelectorAll) return;
  for (const el of root.querySelectorAll('.us-oggi-fx[data-fx]')) {
    const id = el.dataset.fx;
    if (id && id !== DEFAULTS.effect && window.UsOggiFx.supports(id)) window.UsOggiFx.mount(el, id, { scale: Number(el.dataset.fxScale) || 0.6 });
  }
}
function refreshOpenSheet() {
  if (!sheet?.classList.contains('open')) return;
  if ($('usLookDetail')?.classList.contains('open')) renderDetail();
  else renderGallery();
}

function boot() {
  ensureLayers();
  bindTouch($('homeHero'));
  syncPause();
  document.addEventListener('visibilitychange', syncPause);
  const home = $('home');
  if (home && typeof MutationObserver === 'function') new MutationObserver(syncPause).observe(home, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('us:progression-updated', refreshOpenSheet);
  // Reduced motion can change while US is open: the effect starts again, still or moving.
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', () => {
    if (heroFx) heroFx.set(applied.effect); else window.UsOggiFx?.wake();
  });
  paintSettings();
}

window.USOggiLook = Object.freeze({
  THEMES, EFFECTS, DEFAULTS,
  find, status, usable, apply, burst, touchActive, mountPreviews,
  current: () => ({ ...applied }),
  previewMarkup: (slot, id) => phoneMarkup(slot === 'theme' ? id : applied.theme, slot === 'effect' ? id : 'none', heroSnapshot(), { compact: true }),
  openGallery, closeGallery, back,
  isOpen: () => Boolean(sheet?.classList.contains('open')),
  isDetailOpen: () => Boolean($('usLookDetail')?.classList.contains('open')),
  reducedMotion
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();
