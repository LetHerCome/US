/* I personaggi di US (redesign definitivo, founder 23/11/2026, D2 e D6;
   docs/missions/redesign-definitivo.md). The two characters as drawn on
   staging (diario.js 39–255, archivio/staging-diario-pulito-20261123), as one
   module that owns no data: shape, colour, outfit and mood come from the
   couple's profiles (UsCoupleContext) and from Come stai (UsMemberStatus).
   Fase 2 paints you top right on the four pages ([data-us-self], the way to the
   Profilo) and your card on top of the Profilo. The reactions, «Il vostro
   angolo» and the wardrobe come with Fase 4. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsPersonaggi = api;
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';
  const d = w && w.document;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const ell = (x, y, rx, ry) => `M${x - rx} ${y} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;

  // Five shapes (founder, 15/11/2026): each person picks one; two may share a
  // shape, never a colour. Without a choice: the ball for whoever created the
  // couple (role francesco), the square for whoever joined (role beatrice).
  const SHAPES = Object.freeze({
    palla: { body: 'M12 60 a38 36 0 1 0 76 0 a38 36 0 1 0 -76 0 Z', ex: [40, 60], ey: 58, feet: [37, 63], hl: [32, 40] },
    quadrato: { body: 'M36 24 H64 Q86 24 86 46 V72 Q86 94 64 94 H36 Q14 94 14 72 V46 Q14 24 36 24 Z', ex: [40, 60], ey: 56, feet: [36, 64], hl: [32, 40] },
    triangolo: { body: 'M50 16 Q57 16 61 24 L89 81 Q94 94 79 94 H21 Q6 94 11 81 L39 24 Q43 16 50 16 Z', ex: [41, 59], ey: 66, feet: [34, 66], hl: [45, 38] },
    goccia: { body: 'M50 14 C61 30 86 44 86 64 A36 32 0 0 1 14 64 C14 44 39 30 50 14 Z', ex: [40, 60], ey: 62, feet: [37, 63], hl: [38, 44] },
    nuvola: { body: 'M27 52 C17 38 31 24 43 31 C47 18 67 17 71 30 C83 23 97 37 87 51 C97 60 92 93 66 93 H34 C9 93 6 61 27 52 Z', ex: [40, 60], ey: 64, feet: [37, 63], hl: [52, 30] },
  });
  const SHAPE_NAMES = Object.freeze({ palla: 'Tondo', quadrato: 'Quadrato', triangolo: 'Triangolo', goccia: 'Goccia', nuvola: 'Nuvola' });
  const INK = '#14120E';

  // Il guardaroba (founder, 20–21/11/2026): one thing on the head, one on the
  // face or at the neck. Drawn here so what is already worn shows; choosing
  // it comes back with «Il vostro angolo» (Fase 4).
  const LOOK_HEAD = Object.freeze(['cappello', 'fiocco', 'cuffie', 'corona', 'coroncina', 'festa', 'cento']);
  const LOOK_FACE = Object.freeze(['occhiali', 'sole', 'sciarpina', 'gala', 'macchinetta']);
  // Where things sit on each shape: the top of the head [x, y, half width] and the sides [left, right, y].
  const ANCHOR = Object.freeze({ palla: { head: [50, 26, 19], ears: [12, 88, 56] }, quadrato: { head: [50, 25, 19], ears: [14, 86, 54] }, triangolo: { head: [50, 21, 11], ears: [23, 77, 60] }, goccia: { head: [50, 21, 10], ears: [16, 84, 60] }, nuvola: { head: [56, 22, 15], ears: [12, 88, 60] } });
  const lp = (p, fill, sw = 2.6) => `<path d="${p}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
  let clipN = 0;
  function lookSvg(item, shape) {
    const s = SHAPES[shape], an = ANCHOR[shape];
    if (!s || !an) return '';
    const [x, y, w0] = an.head, [l, r, ey] = an.ears, [a, b] = s.ex, fy = s.ey, neck = s.ey + 21;
    switch (item) {
      case 'cappello': return lp(`M${x - w0 - 3} ${y + 3} Q${x - w0 - 3} ${y - 19} ${x} ${y - 21} Q${x + w0 + 3} ${y - 19} ${x + w0 + 3} ${y + 3} Z`, '#F7B58E') + lp(`M${x - w0 - 5} ${y - 1} H${x + w0 + 5} Q${x + w0 + 8} ${y + 3} ${x + w0 + 5} ${y + 7} H${x - w0 - 5} Q${x - w0 - 8} ${y + 3} ${x - w0 - 5} ${y - 1} Z`, '#E8875C') + lp(ell(x, y - 24, 5.5, 5.5), '#FFF4E6');
      case 'fiocco': { const fx = x + w0 * 0.85, f = y + 3; return lp(`M${fx} ${f} L${fx - 13} ${f - 10} Q${fx - 17} ${f} ${fx - 13} ${f + 10} Z`, '#FF5A7A') + lp(`M${fx} ${f} L${fx + 13} ${f - 10} Q${fx + 17} ${f} ${fx + 13} ${f + 10} Z`, '#FF5A7A') + lp(ell(fx, f, 4.2, 4.2), '#FF8DA2'); }
      case 'cuffie': { const top = y - 9, band = `M${l + 1} ${ey - 6} C${l - 2} ${top - 4} ${r + 2} ${top - 4} ${r - 1} ${ey - 6}`; return `<path d="${band}" fill="none" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/><path d="${band}" fill="none" stroke="#3A3446" stroke-width="3.6" stroke-linecap="round"/>` + lp(`M${l - 6} ${ey - 9} h10 v20 h-10 q-3 -10 0 -20 Z`, '#6FD6C8') + lp(`M${r + 6} ${ey - 9} h-10 v20 h10 q3 -10 0 -20 Z`, '#6FD6C8'); }
      case 'corona': { const k = Math.max(w0, 14); return lp(`M${x - k} ${y + 3} L${x - k - 1} ${y - 14} L${x - k / 2} ${y - 5} L${x} ${y - 19} L${x + k / 2} ${y - 5} L${x + k + 1} ${y - 14} L${x + k} ${y + 3} Z`, '#F3D27A') + lp(ell(x, y - 3, 2.6, 2.6), '#FF5A7A', 1.6) + lp(ell(x - k / 2 - 1, y - 1, 2, 2), '#6F9BFF', 1.4) + lp(ell(x + k / 2 + 1, y - 1, 2, 2), '#6F9BFF', 1.4); }
      case 'coroncina': { const k = Math.max(w0, 13) + 4, pts = [-1, -0.5, 0, 0.5, 1].map((t) => [x + t * k, y + 2 - (1 - t * t) * 7]), cols = ['#FF9FB5', '#FFE07A', '#FFFFFF', '#FFE07A', '#FF9FB5']; return `<path d="M${pts[0][0]} ${pts[0][1]} Q${x} ${y - 9} ${pts[4][0]} ${pts[4][1]}" fill="none" stroke="#5E9E6E" stroke-width="3" stroke-linecap="round"/>` + pts.map(([px, py], i) => `<path d="${[0, 72, 144, 216, 288].map((g) => { const q = (g * Math.PI) / 180; return ell(px + Math.cos(q) * 3.2, py + Math.sin(q) * 3.2, 2.6, 2.6); }).join(' ')}" fill="${cols[i]}" stroke="${INK}" stroke-width="1.3"/>` + lp(ell(px, py, 1.8, 1.8), '#F3B23A', 1)).join(''); }
      case 'festa': { const k = Math.max(w0 * 0.75, 9); return `<g transform="rotate(-12 ${x} ${y})">` + lp(`M${x - k} ${y + 3} L${x} ${y - 25} L${x + k} ${y + 3} Z`, '#A98BFF') + `<path d="M${x - k * 0.62} ${y - 6} L${x + k * 0.35} ${y - 2} M${x - k * 0.3} ${y - 15} L${x + k * 0.15} ${y - 13}" stroke="#FFE07A" stroke-width="2.6" stroke-linecap="round"/>` + lp(ell(x, y - 26, 4, 4), '#FF5A7A') + '</g>'; }
      case 'cento': { const k = Math.max(w0, 13) + 3, arc = `M${x - k} ${y + 3} Q${x} ${y - 7} ${x + k} ${y + 3}`; return `<path d="${arc}" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round"/><path d="${arc}" fill="none" stroke="#F3D27A" stroke-width="3" stroke-linecap="round"/>` + lp(ell(x, y - 7, 10, 8), '#FFFDF9', 2.2) + `<text x="${x}" y="${y - 4.3}" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="8.5" fill="${INK}">100</text>`; }
      case 'occhiali': return lp(`${ell(a, fy, 9.5, 8.5)} ${ell(b, fy, 9.5, 8.5)} M${a + 9.5} ${fy} H${b - 9.5}`, 'rgba(255,255,255,.28)');
      case 'sole': return lp(`M${a - 10} ${fy - 6} H${a + 9} Q${a + 9} ${fy + 8} ${a - 1} ${fy + 8} Q${a - 10} ${fy + 8} ${a - 10} ${fy - 6} Z M${b - 9} ${fy - 6} H${b + 10} Q${b + 10} ${fy + 8} ${b + 1} ${fy + 8} Q${b - 9} ${fy + 8} ${b - 9} ${fy - 6} Z M${a + 9} ${fy - 3} H${b - 9}`, '#231E2C') + `<path d="M${a - 6} ${fy - 2} l4 -2.5 M${b - 5} ${fy - 2} l4 -2.5" stroke="rgba(255,255,255,.7)" stroke-width="1.6" stroke-linecap="round"/>`;
      case 'sciarpina': { const id = `usc${++clipN}`; return `<defs><clipPath id="${id}"><path d="${s.body}"/></clipPath></defs><g clip-path="url(#${id})"><path d="M0 ${neck - 6} H110 V${neck + 6} H0 Z" fill="#E8604C" stroke="${INK}" stroke-width="2.6"/><path d="M8 ${neck - 1} H100" stroke="#FFE07A" stroke-width="2.4" stroke-dasharray="5 5"/></g>` + lp(`M58 ${neck + 2} L66 ${neck + 17} L58 ${neck + 19} L52 ${neck + 4} Z`, '#E8604C'); }
      case 'gala': { const g = neck - 1; return lp(`M50 ${g} L38 ${g - 7} L38 ${g + 7} Z M50 ${g} L62 ${g - 7} L62 ${g + 7} Z`, '#2B2433') + lp(ell(50, g, 3.4, 3.4), '#4A3F57'); }
      case 'macchinetta': { const m = neck - 2; return `<path d="M42 ${m - 4} L${l + 10} ${fy + 12} M58 ${m - 4} L${r - 10} ${fy + 12}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>` + lp(`M39 ${m - 6} H61 Q63 ${m - 6} 63 ${m - 4} V${m + 8} Q63 ${m + 10} 61 ${m + 10} H39 Q37 ${m + 10} 37 ${m + 8} V${m - 4} Q37 ${m - 6} 39 ${m - 6} Z`, '#FFFDF9', 2.2) + lp(ell(50, m + 2, 4.6, 4.6), '#3A3446', 1.8) + lp(ell(58, m - 2.5, 1.6, 1.6), '#FF5A7A', 1); }
      default: return '';
    }
  }

  // ---------------------------------------------------------------- who is who
  const profiles = () => {
    try { return w?.UsCoupleContext?.snapshot?.()?.profiles || []; } catch (_) { return []; }
  };
  const profileOf = (role) => profiles().find((p) => p?.role === role) || null;
  const roleOf = (profile) => (profile?.role === 'beatrice' ? 'beatrice' : 'francesco');
  function myRole() { return roleOf(w?.usProfile); }
  function shapeOf(role) {
    const own = profileOf(role)?.character_shape;
    return SHAPES[own] ? own : (role === 'beatrice' ? 'quadrato' : 'palla');
  }
  function lookOf(role) {
    const p = profileOf(role);
    return { head: LOOK_HEAD.includes(p?.character_head) ? p.character_head : null, face: LOOK_FACE.includes(p?.character_face) ? p.character_face : null };
  }
  // The person's colour: the token their role paints (person-colors.js puts a
  // chosen colour on it), and its name from the palette.
  const colorVar = (role) => (role === 'beatrice' ? 'var(--us-lilla)' : 'var(--us-rosa)');
  function colorName(role) {
    const colors = w?.UsPersonColors;
    const id = colors?.idOf?.(profileOf(role)?.person_color) || (role === 'beatrice' ? 'lilla' : 'rosa');
    return colors?.NAMES?.[id] || (id === 'lilla' ? 'Lilla' : 'Rosa');
  }
  // How you are, from Come stai (twelve hours; nothing when not said).
  const FACE = Object.freeze({ dorme: 'dorme', occhiolino: 'felice', felice: 'felice', festa: 'innamorato', innamorato: 'innamorato', giu: 'giu', malato: 'giu', stanco: 'stanco', nervoso: 'teso', lavoro: 'felice', studio: 'felice', palestra: 'felice', viaggio: 'felice', tavola: 'felice' });
  function moodOf(role) {
    let st;
    try { st = w?.UsMemberStatus?.widgetState?.(); } catch (_) { st = null; }
    const pick = role === myRole() ? st?.me : st?.partner;
    return { status: pick?.status || '', form: pick?.form || '' };
  }

  // who: a role ('francesco' | 'beatrice') or { shape, color } for a character
  // that is not a member yet (the intro, Fase 7).
  function character(who, o = {}) {
    const role = typeof who === 'string' ? who : '';
    const shape = SHAPES[o.shape] ? o.shape : SHAPES[who?.shape] ? who.shape : shapeOf(role);
    const color = o.color || who?.color || colorVar(role);
    const s = SHAPES[shape], size = o.size || 56, [a, b] = s.ex, y = s.ey;
    const mood = o.mood !== undefined ? o.mood : (role ? moodOf(role).status : '');
    const face = FACE[mood] || 'felice';
    const shut = face === 'stanco' || face === 'innamorato' || face === 'dorme';
    const open = shut ? [] : [a, b];
    const lids = shut ? `<path d="${[a, b].map((x) => face === 'dorme' ? `M${x - 5} ${y} Q${x} ${y + 4.5} ${x + 5} ${y}` : face === 'innamorato' ? `M${x - 4.5} ${y + 1} Q${x} ${y - 5} ${x + 4.5} ${y + 1}` : `M${x - 4.5} ${y} Q${x} ${y + 3.5} ${x + 4.5} ${y}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>` : '';
    const brows = face === 'teso' ? `<path d="M${a - 6} ${y - 10} L${a + 4} ${y - 7} M${b + 6} ${y - 10} L${b - 4} ${y - 7}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` : '';
    const mouth = face === 'dorme' ? ell(50, y + 12, 2.4, 1.9) : face === 'giu' ? `M46 ${y + 14} Q50 ${y + 9.5} 54 ${y + 14}` : face === 'teso' || face === 'stanco' ? `M46.5 ${y + 11.5} H53.5` : face === 'innamorato' ? `M44.5 ${y + 9} Q50 ${y + 16.5} 55.5 ${y + 9}` : `M46 ${y + 10} Q50 ${y + 14.5} 54 ${y + 10}`;
    const label = o.label ? ` role="img" aria-label="${esc(o.label)}"` : ' aria-hidden="true"';
    const worn = role ? lookOf(role) : { head: null, face: null };
    const head = o.head !== undefined ? o.head : worn.head;
    const faceItem = o.face !== undefined ? o.face : worn.face;
    const dress = `${faceItem ? lookSvg(faceItem, shape) : ''}${head ? lookSvg(head, shape) : ''}`;
    return `<svg class="us-char${o.className ? ` ${esc(o.className)}` : ''}" viewBox="-4 6 108 100" overflow="visible" width="${size}" height="${Math.round(size * 100 / 108)}"${label} focusable="false">`
      + `<path d="${ell(s.feet[0], 97, 9, 5)} ${ell(s.feet[1], 97, 9, 5)}" style="fill:${color}" stroke="${INK}" stroke-width="3"/>`
      + `<path d="${s.body}" style="fill:${color}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`
      + `<path d="${ell(s.hl[0], s.hl[1], 8, 5)}" fill="rgba(255,255,255,.55)"/>`
      + `<path d="${ell(a - 8, y + 9, 5, 3)} ${ell(b + 8, y + 9, 5, 3)}" fill="rgba(211,64,42,.3)"/>`
      + (open.length ? `<g class="us-char-eyes"><path d="${open.map((x) => ell(x, y, 4.4, 5.8)).join(' ')}" fill="${INK}"/><path d="${open.map((x) => ell(x + 1.5, y - 2.3, 1.5, 1.5)).join(' ')}" fill="#fff"/></g>` : '')
      + lids + brows
      + `<path d="${mouth}" fill="${face === 'dorme' ? INK : 'none'}" stroke="${face === 'dorme' ? 'none' : INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + (face === 'dorme' ? `<text x="84" y="36" font-family="Figtree,sans-serif" font-weight="800" font-size="19" fill="currentColor">z</text><text x="97" y="22" font-family="Figtree,sans-serif" font-weight="800" font-size="13" fill="currentColor">z</text>` : '')
      + dress
      + '</svg>';
  }
  // The place of someone who has not arrived yet: the same shape, dashed.
  function slot(shape, size, q = true) {
    const s = SHAPES[shape] || SHAPES.quadrato;
    return `<svg class="us-char us-char-slot" viewBox="-4 6 108 100" width="${size}" height="${Math.round(size * 100 / 108)}" aria-hidden="true" focusable="false"><path d="${s.body}" fill="rgba(247,239,233,.04)" stroke="rgba(247,239,233,.4)" stroke-width="3" stroke-dasharray="7 6" stroke-linejoin="round"/>${q ? `<text x="50" y="${s.ey + 12}" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="30" fill="rgba(247,239,233,.4)">?</text>` : ''}</svg>`;
  }

  // ---------------------------------------------------------------- you, top right
  // D6: your character top right on the four pages opens the Profilo, and the
  // Profilo starts with your card (character, name, shape, colour, Come stai).
  function paintMe() {
    if (!d) return;
    const role = myRole();
    const signedIn = Boolean(w.usProfile?.id);
    d.querySelectorAll('[data-us-self]').forEach((el) => {
      el.hidden = !signedIn;
      el.innerHTML = signedIn ? character(role, { size: 34 }) : '';
    });
    const big = d.getElementById('usProfileChar');
    if (big) big.innerHTML = signedIn ? character(role, { size: 96 }) : '';
    let identity = {};
    try { identity = w.UsIdentity?.current?.() || {}; } catch (_) { identity = {}; }
    const name = d.getElementById('usProfileName');
    if (name) name.textContent = identity.ownName || 'Tu';
    const shape = d.getElementById('usProfileShape');
    if (shape) shape.textContent = SHAPE_NAMES[shapeOf(role)];
    const color = d.getElementById('usProfileColor');
    if (color) color.textContent = colorName(role);
    const mood = d.getElementById('usProfileMood');
    if (mood) {
      const now = moodOf(role);
      const said = now.status ? (w.UsMemberStatus?.word?.(now.status, now.form) || '') : '';
      mood.textContent = said ? said.charAt(0).toUpperCase() + said.slice(1) : '';
      mood.hidden = !said;
    }
  }

  // ---------------------------------------------------------------- voi due, on Oggi
  // D2 and D3: the two characters on the photo of Oggi; a tap opens Il vostro
  // angolo. Both phones show the same two in the same order: whoever created
  // the couple, then whoever joined. Nothing until the other person is in.
  function paintDuo() {
    if (!d) return;
    let identity = {};
    try { identity = w.UsIdentity?.current?.() || {}; } catch (_) { identity = {}; }
    const both = ['francesco', 'beatrice'].every((role) => profiles().some((p) => p?.role === role));
    const name = (role) => identity.nameForRole?.(role) || (role === myRole() ? 'Tu' : 'La tua persona');
    d.querySelectorAll('[data-us-duo]').forEach((el) => {
      const big = el.dataset.usDuo === 'big';
      if (!both || !w.usProfile?.id) { el.innerHTML = ''; if (!big) el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = ['francesco', 'beatrice'].map((role) => `<span class="us-duo-one">${character(role, { size: big ? 96 : 58 })}${big ? `<span class="us-duo-name" translate="no">${esc(name(role))}</span>` : ''}</span>`).join('');
    });
  }

  // ---------------------------------------------------------------- Il vostro angolo
  // D3: Sintonia is no longer a tab of Gioca. Its blocks (moved into
  // #usGiocaSintonia by noi-v2.js, painted by progression.js) live in this
  // sheet, over the page you are on. The wardrobe comes with fase 4.
  const angolo = () => d?.getElementById('usAngolo');
  function openAngolo() {
    const sheet = angolo();
    if (!sheet || !w.usProfile?.couple_id) return false;
    paintDuo();
    w.UsUiFoundation?.cancelSurfaceExit?.(sheet);
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('open');
    // What opening the Sintonia tab loaded before: the level, its history, the collection.
    w.hydrateBond?.();
    w.hydrateResonanceHistory?.();
    w.USProgression?.hydrate?.({ showUnlocks: true, force: true });
    return true;
  }
  function closeAngolo() {
    const sheet = angolo();
    if (!sheet?.classList.contains('open')) return;
    const finish = () => { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); };
    sheet.classList.remove('open');
    if (!w.UsUiFoundation?.exitSurface?.(sheet, finish)) finish();
  }

  const paintAll = () => { paintMe(); paintDuo(); };
  if (d && w.addEventListener) {
    // The couple's profiles arrive after boot, and change with the account.
    w.addEventListener('us-identity-change', () => { paintAll(); if (!w.usProfile?.couple_id) closeAngolo(); });
    d.addEventListener('click', (event) => {
      const target = event.target;
      if (!target?.closest) return;
      if (target.closest('[data-us-angolo]')) openAngolo();
      else if (target.closest('[data-angolo-close]')) closeAngolo();
    });
    d.addEventListener('keydown', (event) => { if (event.key === 'Escape' && angolo()?.classList.contains('open')) closeAngolo(); });
    const boot = () => {
      paintAll();
      let tries = 0;
      const wait = () => { paintAll(); if (!w.usProfile?.couple_id && tries++ < 40) setTimeout(wait, 500); };
      wait();
      // Come stai turns twelve hours old while US stays open.
      setInterval(() => { if (!d.hidden) paintAll(); }, 60000);
    };
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
    w.UsAngolo = Object.freeze({ open: openAngolo, close: closeAngolo });
  }

  return Object.freeze({ SHAPES: Object.keys(SHAPES), SHAPE_NAMES, LOOK_HEAD, LOOK_FACE, character, slot, shapeOf, lookOf, colorName, myRole, paintMe, paintDuo });
});
