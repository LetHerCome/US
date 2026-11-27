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
  // Stile unico (founder, 24/11/2026, tavola «Una mano sola»): the outline is
  // thin and in the dark of the character's own colour, never black; no halo.
  const edge = (color) => `color-mix(in srgb, ${color} 42%, #1a1020)`;

  // Il guardaroba (founder, 20–21/11/2026): one thing on the head, one on the
  // face or at the neck. Drawn here so what is already worn shows; choosing
  // it comes back with «Il vostro angolo» (Fase 4).
  const LOOK_HEAD = Object.freeze(['cappello', 'fiocco', 'cuffie', 'corona', 'coroncina', 'festa', 'cento']);
  const LOOK_FACE = Object.freeze(['occhiali', 'sole', 'sciarpina', 'gala', 'macchinetta']);
  const LOOK_NAMES = Object.freeze({ cappello: 'Cappello', fiocco: 'Fiocco', cuffie: 'Cuffie', corona: 'Corona', coroncina: 'Coroncina', festa: 'Cappello da festa', cento: 'Fascia dei 100', occhiali: 'Occhiali', sole: 'Occhiali da sole', sciarpina: 'Sciarpina', gala: 'Gala', macchinetta: 'Macchinetta' });
  // The thresholds of the couple's Sintonia points (D19, 21/11/2026; the last four
  // start levels 8, 11, 14 and 19 since 24/11/2026, «proposta A»), the same the
  // server checks (migration 20261123231417), and the real moments.
  const LOOK_POINTS = Object.freeze({ occhiali: 150, cappello: 400, fiocco: 700, sciarpina: 1000, sole: 1350, gala: 4550, cuffie: 8750, coroncina: 14300, corona: 26550 });
  const LOOK_MOMENTS = Object.freeze({ macchinetta: 'il primo Ricordo', cento: '100 giorni in US', festa: 'il primo anno in US' });
  // Where things sit on each shape: the top of the head [x, y, half width] and the sides [left, right, y].
  const ANCHOR = Object.freeze({ palla: { head: [50, 26, 19], ears: [12, 88, 56] }, quadrato: { head: [50, 25, 19], ears: [14, 86, 54] }, triangolo: { head: [50, 21, 11], ears: [23, 77, 60] }, goccia: { head: [50, 21, 10], ears: [16, 84, 60] }, nuvola: { head: [56, 22, 15], ears: [12, 88, 60] } });
  // The scarf clips to the body of its shape. The five clips live once in a
  // tiny svg that is always rendered: a clip defined inside a character broke
  // every scarf of that shape when the first character sat in a hidden part of
  // the page (a hidden clipPath is not applied).
  function scarfClips() {
    const d = typeof document !== 'undefined' ? document : null;
    if (!d?.body || d.getElementById('usScarfClips')) return;
    const holder = d.createElementNS?.('http://www.w3.org/2000/svg', 'svg');
    if (!holder) return;
    holder.id = 'usScarfClips';
    holder.setAttribute('width', '0'); holder.setAttribute('height', '0'); holder.setAttribute('aria-hidden', 'true'); holder.setAttribute('focusable', 'false');
    holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    holder.innerHTML = '<defs>' + Object.keys(SHAPES).map((k) => `<clipPath id="usc-${k}"><path d="${SHAPES[k].body}"/></clipPath>`).join('') + '</defs>';
    d.body.appendChild(holder);
  }
  // Premi, fase 4 (25/11/2026): a four-point sparkle for the precious accessories.
  const spark = (sx, sy, r, cls) => `<path class="${cls}" d="M${sx} ${sy - r} L${sx + r * 0.28} ${sy - r * 0.28} L${sx + r} ${sy} L${sx + r * 0.28} ${sy + r * 0.28} L${sx} ${sy + r} L${sx - r * 0.28} ${sy + r * 0.28} L${sx - r} ${sy} L${sx - r * 0.28} ${sy - r * 0.28} Z" fill="#fff"/>`;
  const lp = (p, fill, sw = 2.6) => `<path d="${p}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
  function lookSvg(item, shape) {
    const s = SHAPES[shape], an = ANCHOR[shape];
    if (!s || !an) return '';
    const [x, y, w0] = an.head, [l, r, ey] = an.ears, [a, b] = s.ex, fy = s.ey, neck = s.ey + 21;
    switch (item) {
      case 'cappello': return lp(`M${x - w0 - 3} ${y + 3} Q${x - w0 - 3} ${y - 19} ${x} ${y - 21} Q${x + w0 + 3} ${y - 19} ${x + w0 + 3} ${y + 3} Z`, '#F7B58E') + lp(`M${x - w0 - 5} ${y - 1} H${x + w0 + 5} Q${x + w0 + 8} ${y + 3} ${x + w0 + 5} ${y + 7} H${x - w0 - 5} Q${x - w0 - 8} ${y + 3} ${x - w0 - 5} ${y - 1} Z`, '#E8875C') + lp(ell(x, y - 24, 5.5, 5.5), '#FFF4E6');
      case 'fiocco': { const fx = x + w0 * 0.85, f = y + 3; return lp(`M${fx} ${f} L${fx - 13} ${f - 10} Q${fx - 17} ${f} ${fx - 13} ${f + 10} Z`, '#FF5A7A') + lp(`M${fx} ${f} L${fx + 13} ${f - 10} Q${fx + 17} ${f} ${fx + 13} ${f + 10} Z`, '#FF5A7A') + lp(ell(fx, f, 4.2, 4.2), '#FF8DA2'); }
      case 'cuffie': { const top = y - 9, band = `M${l + 1} ${ey - 6} C${l - 2} ${top - 4} ${r + 2} ${top - 4} ${r - 1} ${ey - 6}`; const note = (nx, ny, c) => `<g class="us-acc-note${c}"><path d="M${nx} ${ny} v-11 l7 -2 v10" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="${ell(nx - 2, ny, 2.6, 2.1)} ${ell(nx + 5, ny - 2, 2.6, 2.1)}" fill="${INK}"/></g>`; return `<path d="${band}" fill="none" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/><path d="${band}" fill="none" stroke="#3A3446" stroke-width="3.6" stroke-linecap="round"/>` + lp(`M${l - 7} ${ey - 10} h12 v22 h-12 q-4 -11 0 -22 Z`, '#6FD6C8') + lp(`M${r + 7} ${ey - 10} h-12 v22 h12 q4 -11 0 -22 Z`, '#6FD6C8') + note(r + 10, ey - 12, '') + note(r + 14, ey - 4, ' n2'); }
      case 'corona': { const k = Math.max(w0, 14) + 2; return lp(`M${x - k} ${y + 4} L${x - k - 2} ${y - 16} L${x - k / 2} ${y - 6} L${x} ${y - 22} L${x + k / 2} ${y - 6} L${x + k + 2} ${y - 16} L${x + k} ${y + 4} Z`, '#F3D27A') + `<path d="M${x - k + 2} ${y} H${x + k - 2}" stroke="#D9A93F" stroke-width="2.4"/>` + lp(ell(x, y - 4, 3.2, 3.2), '#FF5A7A', 1.6) + lp(ell(x - k / 2 - 1, y - 1, 2.5, 2.5), '#6F9BFF', 1.4) + lp(ell(x + k / 2 + 1, y - 1, 2.5, 2.5), '#6F9BFF', 1.4) + [ell(x - k - 2, y - 16, 2, 2), ell(x, y - 22, 2.2, 2.2), ell(x + k + 2, y - 16, 2, 2)].map((d) => lp(d, '#FFF4C8', 1.2)).join('') + spark(x, y - 4, 6, 'us-acc-gem') + spark(x - k / 2 - 1, y - 1, 5, 'us-acc-gem g2') + spark(x + k / 2 + 1, y - 1, 5, 'us-acc-gem g3'); }
      case 'coroncina': { const k = w0 + 6, pts = [-1, -0.5, 0, 0.5, 1].map((t) => [x + t * k, y + 2 - (1 - t * t) * 8]), cols = ['#FF9FB5', '#FFE07A', '#FFFFFF', '#FFE07A', '#FF9FB5']; const flower = (fx, fy2, c, rr) => [0, 1, 2, 3, 4].map((i) => { const an = (i * 72 - 90) * Math.PI / 180; return `<path d="${ell(fx + Math.cos(an) * rr * 0.62, fy2 + Math.sin(an) * rr * 0.62, rr * 0.5, rr * 0.5)}" fill="${c}" stroke="${INK}" stroke-width="1.4"/>`; }).join('') + `<path d="${ell(fx, fy2, rr * 0.34, rr * 0.34)}" fill="#F2B33D" stroke="${INK}" stroke-width="1.2"/>`; return `<g class="us-acc-sway" style="transform-origin:${x}px ${y + 14}px"><path d="M${pts[0][0]} ${pts[0][1]} Q${x} ${y - 11} ${pts[4][0]} ${pts[4][1]}" fill="none" stroke="#5E9E6E" stroke-width="3.2" stroke-linecap="round"/>` + [[-0.75, 1], [0.25, -1], [0.8, 1]].map(([t, sg]) => `<path d="M${x + t * k} ${y - 3 - (1 - t * t) * 6} q${4 * sg} -6 ${9 * sg} -3 q${-4 * sg} 5 ${-9 * sg} 3 Z" fill="#7DBE86" stroke="${INK}" stroke-width="1.2"/>`).join('') + pts.map(([px, py], i) => flower(px, py, cols[i], i === 2 ? 7.5 : 6.5)).join('') + '</g>'; }
      case 'festa': { const k = Math.max(w0 * 0.75, 9); return `<g transform="rotate(-12 ${x} ${y})">` + lp(`M${x - k} ${y + 3} L${x} ${y - 25} L${x + k} ${y + 3} Z`, '#A98BFF') + `<path d="M${x - k * 0.62} ${y - 6} L${x + k * 0.35} ${y - 2} M${x - k * 0.3} ${y - 15} L${x + k * 0.15} ${y - 13}" stroke="#FFE07A" stroke-width="2.6" stroke-linecap="round"/>` + lp(ell(x, y - 26, 4, 4), '#FF5A7A') + '</g>'; }
      case 'cento': { const k = Math.max(w0, 13) + 3, arc = `M${x - k} ${y + 3} Q${x} ${y - 7} ${x + k} ${y + 3}`; return `<path d="${arc}" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round"/><path d="${arc}" fill="none" stroke="#F3D27A" stroke-width="3" stroke-linecap="round"/>` + lp(ell(x, y - 7, 10, 8), '#FFFDF9', 2.2) + `<text x="${x}" y="${y - 4.3}" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="8.5" fill="${INK}">100</text>`; }
      case 'occhiali': return lp(`${ell(a, fy, 10, 9)} ${ell(b, fy, 10, 9)}`, 'rgba(190,225,255,.3)', 2.8) + `<path d="M${a + 10} ${fy - 1} Q50 ${fy - 5} ${b - 10} ${fy - 1}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M${a - 5} ${fy - 3} l4 -3 M${b - 5} ${fy - 3} l4 -3" stroke="rgba(255,255,255,.85)" stroke-width="1.8" stroke-linecap="round"/>`;
      case 'sole': return lp(`M${a - 10} ${fy - 6} H${a + 9} Q${a + 9} ${fy + 8} ${a - 1} ${fy + 8} Q${a - 10} ${fy + 8} ${a - 10} ${fy - 6} Z M${b - 9} ${fy - 6} H${b + 10} Q${b + 10} ${fy + 8} ${b + 1} ${fy + 8} Q${b - 9} ${fy + 8} ${b - 9} ${fy - 6} Z M${a + 9} ${fy - 3} H${b - 9}`, '#231E2C') + `<path d="M${a - 6} ${fy - 2} l4 -2.5 M${b - 5} ${fy - 2} l4 -2.5" stroke="rgba(255,255,255,.7)" stroke-width="1.6" stroke-linecap="round"/>`;
      case 'sciarpina': { scarfClips(); const id = `usc-${shape}`; return `<g clip-path="url(#${id})"><path d="M0 ${neck - 7} Q50 ${neck + 3} 110 ${neck - 7} V${neck + 5} Q50 ${neck + 15} 0 ${neck + 5} Z" fill="#E8604C" stroke="${INK}" stroke-width="2.4"/><path d="M6 ${neck} Q50 ${neck + 9} 104 ${neck}" fill="none" stroke="#FFE07A" stroke-width="2.2" stroke-dasharray="5 5"/></g>` + lp(`M60 ${neck + 4} q6 2 8 9 l-3 14 q-4 2 -7 0 l1 -13 Z`, '#E8604C', 2.2) + lp(`M57 ${neck + 5} q-2 7 -8 18 q3 3 7 1 l5 -16 Z`, '#D9503D', 2.2) + lp(ell(59, neck + 4, 5, 4), '#F07A62', 2.2); }
      case 'gala': { const g = neck + 2; return lp(`M38 ${g - 6} L50 ${g + 4} L44 ${g + 10} Z`, '#FFFDF9', 2) + lp(`M62 ${g - 6} L50 ${g + 4} L56 ${g + 10} Z`, '#FFFDF9', 2) + lp(`M50 ${g + 2} L33 ${g - 8} Q30 ${g + 2} 33 ${g + 12} Z M50 ${g + 2} L67 ${g - 8} Q70 ${g + 2} 67 ${g + 12} Z`, '#2B2433', 2.4) + lp(ell(50, g + 2, 4.6, 4.2), '#4A3F57', 2.2) + `<path d="M36 ${g - 3} l5 3" stroke="rgba(255,255,255,.55)" stroke-width="1.6" stroke-linecap="round"/>` + spark(66, g - 8, 5, 'us-acc-glint'); }
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

  // ---------------------------------------------------------------- le reazioni
  // Personaggi (founder, 20/11/2026, D9; redesign definitivo D9): a few clear
  // reactions over the face of Come stai, only for things you do for each
  // other. The day of your mesiversario or anniversary, or of 100, 200… days
  // together (it was a card on Oggi until fase 5, D9): festa, both. A Ti penso
  // received in the last 3 hours: heart eyes, mine. The other answered today's
  // question and I have not yet: their character waves. From 22 to 6: sleepy.
  const REACTION_HOURS = 3;
  function reactionOf(role, now = new Date()) {
    let started = '';
    try { started = String(w?.UsCoupleContext?.snapshot?.()?.couple?.started_on || ''); } catch (_) { started = ''; }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(started);
    if (m) {
      const yy = now.getFullYear(), mo = now.getMonth() + 1, day = now.getDate();
      const lastDay = new Date(yy, mo, 0).getDate();
      if (day === Math.min(+m[3], lastDay) && yy * 12 + mo > +m[1] * 12 + +m[2]) return 'festa';
      const iso = `${yy}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (w?.UsCalendarDomain?.daysMilestoneOn?.(started, iso)) return 'festa';
    }
    const mine = role === myRole();
    if (mine) {
      const at = Date.parse(w?.usThinkLastReceivedAt || '');
      if (Number.isFinite(at) && now.getTime() - at >= 0 && now.getTime() - at < REACTION_HOURS * 3600e3) return 'cuore';
    } else {
      const st = w?.todayState;
      if (w?.todayQuestion?.id && st?.partner_has_answer && st?.my_answer == null) return 'saluta';
    }
    const h = now.getHours();
    return h >= 22 || h < 6 ? 'sera' : '';
  }
  function reactionBack(reaction, shape, color) {
    const an = ANCHOR[shape];
    if (reaction === 'festa') return [[6, 30, '#FF5A7A', 20], [94, 26, '#6F9BFF', -25], [2, 70, '#F3D27A', 40], [98, 66, '#8FD49B', -10], [20, 12, '#A98BFF', 15], [82, 10, '#FF9F6E', -30]].map(([cx, cy, cc, r]) => `<rect class="us-char-confetto" x="${cx - 3}" y="${cy - 1.6}" width="6" height="3.2" rx="1" fill="${cc}" transform="rotate(${r} ${cx} ${cy})"/>`).join('');
    if (reaction === 'saluta' && an) { const [, er, ey] = an.ears, arm = `M${er - 3} ${ey + 14} Q${er + 8} ${ey + 6} ${er + 11} ${ey - 6}`; return `<g class="us-char-wave"><path d="${arm}" fill="none" stroke="${INK}" stroke-width="8.5" stroke-linecap="round"/><path d="${arm}" fill="none" style="stroke:${color}" stroke-width="4.2" stroke-linecap="round"/><path d="${ell(er + 12, ey - 9, 6, 6)}" style="fill:${color}" stroke="${INK}" stroke-width="2.8"/></g>`; }
    return '';
  }
  function reactionFront(reaction, shape) {
    const s = SHAPES[shape];
    if (reaction !== 'cuore' || !s) return '';
    const [a, b] = s.ex, y = s.ey;
    const heart = (x) => `M${x} ${y + 5} C${x - 9} ${y - 1} ${x - 6} ${y - 9} ${x} ${y - 4} C${x + 6} ${y - 9} ${x + 9} ${y - 1} ${x} ${y + 5} Z`;
    return lp(`${heart(a)} ${heart(b)}`, '#FF4F6F', 1.8);
  }

  // who: a role ('francesco' | 'beatrice') or { shape, color } for a character
  // that is not a member yet (the intro, Fase 7). o.react: the reaction of the
  // moment (reactionOf); o.reaction: a given one.
  function character(who, o = {}) {
    const role = typeof who === 'string' ? who : '';
    const shape = SHAPES[o.shape] ? o.shape : SHAPES[who?.shape] ? who.shape : shapeOf(role);
    const color = o.color || who?.color || colorVar(role);
    const s = SHAPES[shape], size = o.size || 56, [a, b] = s.ex, y = s.ey;
    const reaction = o.reaction !== undefined ? o.reaction : (o.react && role ? reactionOf(role) : '');
    const mood = o.mood !== undefined ? o.mood : (role ? moodOf(role).status : '');
    const face = reaction === 'sera' ? 'dorme' : reaction ? 'felice' : (FACE[mood] || 'felice');
    const shut = face === 'stanco' || face === 'innamorato' || face === 'dorme';
    const open = reaction === 'cuore' || shut ? [] : [a, b];
    const big = reaction === 'cuore' || reaction === 'festa';
    const lids = shut ? `<path d="${[a, b].map((x) => face === 'dorme' ? `M${x - 5} ${y} Q${x} ${y + 4.5} ${x + 5} ${y}` : face === 'innamorato' ? `M${x - 4.5} ${y + 1} Q${x} ${y - 5} ${x + 4.5} ${y + 1}` : `M${x - 4.5} ${y} Q${x} ${y + 3.5} ${x + 4.5} ${y}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>` : '';
    const brows = face === 'teso' ? `<path d="M${a - 6} ${y - 10} L${a + 4} ${y - 7} M${b + 6} ${y - 10} L${b - 4} ${y - 7}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` : '';
    const mouth = big ? `M44.5 ${y + 9} Q50 ${y + 17} 55.5 ${y + 9} Z` : face === 'dorme' ? ell(50, y + 12, 2.4, 1.9) : face === 'giu' ? `M46 ${y + 14} Q50 ${y + 9.5} 54 ${y + 14}` : face === 'teso' || face === 'stanco' ? `M46.5 ${y + 11.5} H53.5` : face === 'innamorato' ? `M44.5 ${y + 9} Q50 ${y + 16.5} 55.5 ${y + 9}` : `M46 ${y + 10} Q50 ${y + 14.5} 54 ${y + 10}`;
    const label = o.label ? ` role="img" aria-label="${esc(o.label)}"` : ' aria-hidden="true"';
    const worn = role ? lookOf(role) : { head: null, face: null };
    const head = o.head !== undefined ? o.head : worn.head;
    const faceItem = o.face !== undefined ? o.face : worn.face;
    const dress = `${faceItem ? lookSvg(faceItem, shape) : ''}${head ? lookSvg(head, shape) : ''}`;
    return `<svg class="us-char${size >= 90 ? ' is-big' : ''}${o.className ? ` ${esc(o.className)}` : ''}"${reaction ? ` data-reaction="${reaction}"` : ''} viewBox="-4 6 108 100" overflow="visible" width="${size}" height="${Math.round(size * 100 / 108)}"${label} focusable="false">`
      + reactionBack(reaction, shape, color)
      + `<path d="${ell(s.feet[0], 97, 9, 5)} ${ell(s.feet[1], 97, 9, 5)}" style="fill:${color};stroke:${edge(color)}" stroke-width="2.4"/>`
      + `<path d="${s.body}" style="fill:${color};stroke:${edge(color)}" stroke-width="2.6" stroke-linejoin="round"/>`
      + `<path d="${ell(s.hl[0], s.hl[1], 8, 5)}" fill="rgba(255,255,255,.5)"/>`
      + `<path d="${ell(a - 8, y + 9, 5, 3)} ${ell(b + 8, y + 9, 5, 3)}" style="fill:${edge(color)}" opacity=".3"/>`
      + (open.length ? `<g class="us-char-eyes"><path d="${open.map((x) => ell(x, y, 4.4, 5.8)).join(' ')}" fill="${INK}"/><path d="${open.map((x) => ell(x + 1.5, y - 2.3, 1.5, 1.5)).join(' ')}" fill="#fff"/></g>` : '')
      + lids + brows
      + `<path d="${mouth}" fill="${big ? '#7A2E3A' : face === 'dorme' ? INK : 'none'}" stroke="${face === 'dorme' && !big ? 'none' : INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + reactionFront(reaction, shape)
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
      el.innerHTML = signedIn ? character(role, { size: 34, react: true }) : '';
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

  // ---------------------------------------------------------------- voi due, in the angolo
  // D2 and D3: the two characters, big, at the top of Il vostro angolo (they left
  // the photo of Oggi for the island, 25/11/2026). Both phones show the same two
  // in the same order: whoever created the couple, then whoever joined. Nothing
  // until the other person is in.
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
      el.innerHTML = ['francesco', 'beatrice'].map((role) => `<span class="us-duo-one">${character(role, { size: big ? 96 : 58, react: true })}${big ? `<span class="us-duo-name" translate="no">${esc(name(role))}</span>` : ''}</span>`).join('');
    });
  }

  // ---------------------------------------------------------------- Il vostro angolo
  // D3: Sintonia is no longer a tab of Gioca. Its blocks (moved into
  // #usGiocaSintonia by noi-v2.js, painted by progression.js) live in this
  // sheet, over the page you are on. The wardrobe comes with fase 4.
  const angolo = () => d?.getElementById('usAngolo');
  // place 'look': straight to the wardrobe (Cambia look, in the Profilo).
  function openAngolo(place = '') {
    const sheet = angolo();
    if (!sheet || !w.usProfile?.couple_id) return false;
    paintDuo();
    paintWardrobe();
    refreshLookUnlocks().then(paintWardrobe);
    // Cambia look (Profilo) opens the Guardaroba; anything else opens Voi.
    showTab(place === 'look' ? 'look' : 'voi', { focus: false });
    setIsola(false);
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

  // ---------------------------------------------------------------- il guardaroba
  // D4 (redesign definitivo) on the rules of 20–21/11/2026 (grill-me D6–D19):
  // one thing on the head, one on the face or at the neck, all free; unlocked
  // by the couple's Sintonia points or by a real moment. The server keeps the
  // outfit and checks the same rule (set_my_character_look, my_character_unlocks,
  // set_my_character_shape: migrations 20261115183900 and 20261120232852).
  const client = () => (typeof sb !== 'undefined' ? sb : null); // eslint-disable-line no-undef
  let lookUnlocks = null;
  const totalPoints = () => Number(w?.USProgression?.getState?.()?.total_xp) || 0;
  function unlockedLook() {
    if (Array.isArray(lookUnlocks)) return new Set(lookUnlocks);
    const out = new Set();
    for (const [item, need] of Object.entries(LOOK_POINTS)) if (totalPoints() >= need) out.add(item);
    return out;
  }
  function refreshLookUnlocks() {
    const db = client();
    if (!db?.rpc || !w.usProfile?.couple_id) return Promise.resolve();
    return Promise.resolve(db.rpc('my_character_unlocks')).then((r) => { if (!r?.error && Array.isArray(r?.data)) lookUnlocks = r.data; }).catch(() => {});
  }
  let saving = false;
  async function saveCharacter(rpc, args) {
    const db = client();
    if (!db?.rpc || saving) return false;
    saving = true;
    try {
      const r = await db.rpc(rpc, args);
      if (r?.error) {
        w.toast?.(/locked/.test(String(r.error.message || '')) ? 'Questo non è ancora sbloccato' : 'Non riesco a salvarlo, riprova');
        return false;
      }
      if (Array.isArray(r?.data?.unlocked)) lookUnlocks = r.data.unlocked;
      await Promise.resolve(w.UsCoupleContext?.hydrate?.()).catch(() => {});
      w.UsFeedback?.selection?.();
      return true;
    } catch (_) {
      w.toast?.('Non riesco a salvarlo, riprova');
      return false;
    } finally {
      saving = false;
      paintAll();
    }
  }
  function wardrobeMarkup() {
    const role = myRole(), mine = lookOf(role), open = unlockedLook(), shapeNow = shapeOf(role);
    const lockOf = (item) => (LOOK_POINTS[item] ? `${LOOK_POINTS[item]} punti` : LOOK_MOMENTS[item] || '');
    const chip = (slot, item) => {
      const on = (slot === 'head' ? mine.head : mine.face) === item;
      const free = item === null || open.has(item);
      const name = item === null ? 'Niente' : LOOK_NAMES[item];
      const lock = free ? '' : lockOf(item);
      const preview = character(role, { size: 44, reaction: '', head: slot === 'head' ? item : mine.head, face: slot === 'face' ? item : mine.face });
      return `<button type="button" class="us-look-chip${free ? '' : ' is-locked'}" data-us-look="${slot}:${item || ''}" aria-pressed="${on}"${free ? '' : ' aria-disabled="true"'} aria-label="${esc(free ? name : `${name}: si sblocca con ${lock}`)}">${preview}<span class="us-look-name">${esc(name)}</span>${lock ? `<small>${esc(lock)}</small>` : ''}</button>`;
    };
    const shapeChip = (shape) => `<button type="button" class="us-look-chip" data-us-shape="${shape}" aria-pressed="${shape === shapeNow}">${character(role, { size: 44, reaction: '', shape })}<span class="us-look-name">${esc(SHAPE_NAMES[shape])}</span></button>`;
    const next = Object.entries(LOOK_POINTS).filter(([item]) => !open.has(item)).sort((x, y) => x[1] - y[1])[0];
    let nextRow = '<p class="us-look-next"><b>Avete sbloccato tutto il guardaroba della Sintonia</b></p>';
    if (next) {
      const prev = Math.max(0, ...Object.values(LOOK_POINTS).filter((v) => v < next[1]));
      const pct = Math.max(0, Math.min(100, Math.round(((totalPoints() - prev) / Math.max(1, next[1] - prev)) * 100)));
      const left = Math.max(0, next[1] - totalPoints());
      nextRow = `<p class="us-look-next"><b>${esc(`Prossimo: ${LOOK_NAMES[next[0]]}`)}</b>${left > 0 ? `<span>${esc(left === 1 ? 'manca 1 punto' : `mancano ${left} punti`)}</span>` : ''}<span class="us-look-meter" role="progressbar" aria-label="${esc(`Verso ${LOOK_NAMES[next[0]]}`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span></p>`;
    }
    return `<h3 class="us-look-title">Il tuo guardaroba</h3>`
      + `<div class="us-look-row"><b>La forma</b><div class="us-look-chips">${Object.keys(SHAPES).map(shapeChip).join('')}</div></div>`
      + `<div class="us-look-row"><b>In testa</b><div class="us-look-chips">${[null, ...LOOK_HEAD].map((k) => chip('head', k)).join('')}</div></div>`
      + `<div class="us-look-row"><b>Sul viso o al collo</b><div class="us-look-chips">${[null, ...LOOK_FACE].map((k) => chip('face', k)).join('')}</div></div>`
      + nextRow;
  }
  function paintWardrobe() {
    const root = d?.getElementById('usAngoloLook');
    if (!root) return;
    if (!w.usProfile?.couple_id) { root.innerHTML = ''; return; }
    const rows = [...root.querySelectorAll('.us-look-chips')].map((row) => row.scrollLeft);
    // The chip with the keyboard focus keeps it across the repaint (a pick, the points growing).
    const had = d.activeElement && root.contains(d.activeElement) ? d.activeElement : null;
    const focusKey = had?.dataset?.usLook !== undefined ? `[data-us-look="${had.dataset.usLook}"]` : had?.dataset?.usShape ? `[data-us-shape="${had.dataset.usShape}"]` : '';
    const html = wardrobeMarkup();
    if (root.__usHtml === html && root.childElementCount) return; // nothing changed: leave it (and the focus) alone
    root.innerHTML = html;
    root.__usHtml = html;
    root.querySelectorAll('.us-look-chips').forEach((row, i) => { row.scrollLeft = rows[i] || 0; });
    if (focusKey) root.querySelector(focusKey)?.focus({ preventScroll: true });
  }
  function pickLook(button) {
    if (button.getAttribute('aria-disabled') === 'true') { w.toast?.(`Si sblocca con ${button.querySelector('small')?.textContent || 'la Sintonia'}`); return; }
    const [slot, item] = String(button.dataset.usLook).split(':');
    const now = lookOf(myRole());
    const next = slot === 'head' ? { head: item || null, face: now.face } : { head: now.head, face: item || null };
    if (next.head === now.head && next.face === now.face) return;
    saveCharacter('set_my_character_look', { p_head: next.head, p_face: next.face });
  }
  function pickShape(button) {
    const shape = button.dataset.usShape;
    if (!SHAPES[shape] || shape === shapeOf(myRole())) return;
    saveCharacter('set_my_character_shape', { p_shape: shape });
  }

  // ---------------------------------------------------------------- the tabs
  // Tavola «US · Oggi e il vostro angolo» (founder, 25/11/2026): Voi,
  // Guardaroba, Premi under the level. Arrow keys move between the tabs.
  const TABS = ['voi', 'look', 'premi'];
  function showTab(name, { focus = true } = {}) {
    const sheet = angolo();
    if (!sheet || !TABS.includes(name)) return;
    sheet.querySelectorAll('[data-angolo-tab]').forEach((tab) => {
      const on = tab.dataset.angoloTab === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus({ preventScroll: true });
    });
    sheet.querySelectorAll('[data-angolo-panel]').forEach((panel) => { panel.hidden = panel.dataset.angoloPanel !== name; });
    sheet.dataset.angoloTab = name;
  }

  // ---------------------------------------------------------------- l'isola
  // Founder, 25/11/2026 (tavola, «Oggi · L'isola»): the US symbol at the top
  // is an island. A tap widens it into «Il vostro angolo · Livello N» and the
  // two characters lean out of it; a second tap opens the angolo; left alone
  // it closes after 6 s. It opens by itself once, the first time, and again
  // when you reach a new level (with a party). Not for a phone without the
  // couple yet: then it is only the symbol.
  const ISOLA_MS = 6000, PEEK_MS = 4200;
  const isola = () => d?.getElementById('usIsola');
  let isolaTimer = 0;
  const paired = () => Boolean(w.usProfile?.couple_id) && ['francesco', 'beatrice'].every((role) => profiles().some((p) => p?.role === role));
  const levelNow = () => Number(w.USProgression?.getState?.()?.level) || 0;
  function paintIsola({ reaction } = {}) {
    const button = isola();
    if (!button) return;
    const on = paired();
    button.hidden = !on;
    if (!on) { setIsola(false); return; }
    const level = levelNow();
    const words = button.querySelector('[data-us-isola-level]');
    if (words) words.textContent = level ? `Livello ${level} · tocca qui` : 'Tocca qui';
    labelIsola();
    const duo = button.querySelector('[data-us-isola-duo]');
    const mine = myRole(), duoRoles = [mine, mine === 'beatrice' ? 'francesco' : 'beatrice'];
    if (duo) duo.innerHTML = duoRoles.map((role) => character(role, { size: 42, ...(reaction ? { reaction } : { react: true }) })).join('');
  }
  function labelIsola() {
    const button = isola(), level = levelNow();
    button?.setAttribute('aria-label', button.getAttribute('aria-expanded') === 'true' ? (level ? `Il vostro angolo, livello ${level}: tocca per entrare` : 'Il vostro angolo: tocca per entrare') : 'US: tocca per Il vostro angolo');
  }
  function setIsola(open, { ms = ISOLA_MS, reaction } = {}) {
    const button = isola();
    clearTimeout(isolaTimer);
    if (!button) return;
    const top = button.closest('.top');
    const was = button.getAttribute('aria-expanded') === 'true';
    if (open && !paired()) open = false;
    // Painted closed first, then opened: the characters rise from below.
    if (open && !was) { paintIsola({ reaction }); void button.offsetWidth; }
    button.setAttribute('aria-expanded', String(open));
    if (top?.dataset) { if (open) top.dataset.usIsola = 'open'; else delete top.dataset.usIsola; }
    if (open) { labelIsola(); isolaTimer = setTimeout(() => setIsola(false), ms); }
    else { hideFumetto(); if (was) paintIsola(); }
  }
  // US vi ricorda (founder, 25/11/2026, D11/D17; tavola «US · US vi ricorda»):
  // the island opens and a speech bubble comes out of the character who
  // speaks, yours (speaker 'me') or both ('both', from between them). A tap
  // on the bubble is onTap, a long press onHold; 8 s and both close.
  const fumetto = () => d?.getElementById('usFumetto');
  let fumettoTap = null, fumettoHold = null, holdTimer = 0, held = false;
  function hideFumetto() {
    const f = fumetto();
    if (!f) return;
    f.removeAttribute('data-open');
    f.hidden = true;
    fumettoTap = null; fumettoHold = null;
  }
  function parla({ text, speaker = 'me', cta = '', reaction, onTap, onHold, ms = 8000 } = {}) {
    const f = fumetto();
    if (!f || !text || !paired()) return false;
    setIsola(true, { ms, reaction: reaction || (speaker === 'both' ? 'cuore' : undefined) });
    if (isola()?.getAttribute('aria-expanded') !== 'true') return false;
    f.querySelector('[data-us-fumetto-text]').textContent = text;
    const hint = f.querySelector('[data-us-fumetto-cta]');
    if (hint) { hint.textContent = cta ? `${cta} ›` : ''; hint.hidden = !cta; }
    f.dataset.speaker = speaker === 'both' ? 'both' : 'me';
    fumettoTap = typeof onTap === 'function' ? onTap : null;
    fumettoHold = typeof onHold === 'function' ? onHold : null;
    f.hidden = false;
    void f.offsetWidth;
    f.setAttribute('data-open', '');
    return true;
  }
  function tapIsola() {
    if (!paired()) return;
    if (isola()?.getAttribute('aria-expanded') === 'true') { setIsola(false); openAngolo(); }
    else { setIsola(true); w.UsFeedback?.selection?.(); }
  }
  // Once, the first time; then at every new level. Only on Oggi, in view,
  // with nothing else open.
  const ISOLA_KEY = () => `us:isola:v1:${w.usProfile?.id || ''}`;
  function readSeen() { try { return JSON.parse(w.localStorage?.getItem(ISOLA_KEY()) || 'null'); } catch (_) { return null; } }
  function writeSeen(level) { try { w.localStorage?.setItem(ISOLA_KEY(), JSON.stringify({ level })); } catch (_) {} }
  let peekTimer = 0;
  // At launch the couple, the level and the first screens arrive in any
  // order: a moment that is not ready yet is tried again, a few times.
  function maybePeek(tries = 0) {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      if (!d || d.hidden || !w.usProfile?.id) return;
      if (!d.getElementById('home')?.classList.contains('active')) return;
      const level = levelNow();
      const busy = !paired() || !level || d.body?.getAttribute?.('data-us-surface') === 'open' || Boolean(w.UsIntro?.active?.());
      if (busy) { if (tries < 12) maybePeek(tries + 1); return; }
      if (isola()?.getAttribute('aria-expanded') === 'true') return;
      const seen = readSeen();
      if (!seen) { writeSeen(level); if (!w.UsRicorda) setIsola(true, { ms: PEEK_MS, reaction: 'cuore' }); return; }
      if (level > (Number(seen.level) || 0)) {
        writeSeen(level);
        const rank = typeof w.bondRankTitle === 'function' ? w.bondRankTitle(level) : '';
        if (!parla({ text: rank ? `Siete al livello ${level}: ${rank}!` : `Siete al livello ${level}!`, speaker: 'both', reaction: 'festa', cta: 'Il vostro angolo', onTap: () => { setIsola(false); openAngolo(); } })) setIsola(true, { ms: PEEK_MS, reaction: 'festa' });
        return;
      }
      if (level < (Number(seen.level) || 0)) writeSeen(level);
    }, 900);
  }

  // Apertura A (25/11/2026): the opening shows your two characters before anything loads,
  // so they are kept here, with their colours resolved (the page has no couple colours yet then).
  function keepLaunchDuo() {
    try {
      if (!w.localStorage || !w.usProfile?.id) return;
      const me = myRole(), them = me === 'beatrice' ? 'francesco' : 'beatrice';
      if (!profileOf(me) || !profileOf(them)) return;
      const css = w.getComputedStyle?.(d.documentElement);
      const solid = (svg) => svg.replace(/var\((--us-[a-z-]+)\)/g, (all, name) => (css?.getPropertyValue(name) || '').trim() || all);
      const duo = { me: solid(character(me, { size: 50, reaction: '', mood: '' })), them: solid(character(them, { size: 50, reaction: '', mood: '' })) };
      w.localStorage.setItem('us:launch-duo:v1', JSON.stringify(duo));
    } catch (_) {}
  }
  const paintAll = () => { paintMe(); paintDuo(); paintWardrobe(); paintIsola(); keepLaunchDuo(); };
  if (d && w.addEventListener) {
    // The couple's profiles arrive after boot, and change with the account.
    w.addEventListener('us-identity-change', () => { paintAll(); maybePeek(); if (!w.usProfile?.couple_id) closeAngolo(); });
    // A Ti penso arrives (heart eyes), the points grow (the wardrobe), the question changes (a wave).
    w.addEventListener('us:think-updated', paintAll);
    w.addEventListener('us:progression-updated', () => { paintWardrobe(); paintIsola(); maybePeek(); });
    d.addEventListener('click', (event) => {
      const target = event.target;
      if (!target?.closest) return;
      if (target.closest('button[data-us-isola]')) { tapIsola(); return; }
      if (target.closest('[data-us-fumetto]')) {
        if (held) { held = false; return; }
        const go = fumettoTap;
        setIsola(false);
        if (go) go();
        return;
      }
      const entry = target.closest('[data-us-angolo]');
      if (entry) { openAngolo(entry.dataset.usAngolo || ''); return; }
      const tab = target.closest('#usAngolo [data-angolo-tab]');
      if (tab) { showTab(tab.dataset.angoloTab); return; }
      if (target.closest('[data-angolo-close]')) { closeAngolo(); return; }
      const look = target.closest('#usAngoloLook [data-us-look]');
      if (look) { pickLook(look); return; }
      const shape = target.closest('#usAngoloLook [data-us-shape]');
      if (shape) pickShape(shape);
    });
    d.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && angolo()?.classList.contains('open')) { closeAngolo(); return; }
      const tab = event.target?.closest?.('#usAngolo [data-angolo-tab]');
      if (tab && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        const at = TABS.indexOf(tab.dataset.angoloTab);
        showTab(TABS[(at + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]);
      }
    });
    // A long press on the bubble: «Non dirmelo più» (D8).
    d.addEventListener('pointerdown', (event) => {
      if (!event.target?.closest?.('[data-us-fumetto]')) return;
      held = false; clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { held = true; const hold = fumettoHold; if (hold) { clearTimeout(isolaTimer); hold(); } }, 600);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) d.addEventListener(type, () => clearTimeout(holdTimer), true);
    // Back on Oggi, back in the app: maybe a new level to show.
    const home = d.getElementById('home');
    if (home && typeof w.MutationObserver === 'function') new w.MutationObserver(() => { if (home.classList.contains('active')) maybePeek(); else setIsola(false); }).observe(home, { attributes: true, attributeFilter: ['class'] });
    d.addEventListener('visibilitychange', () => { if (d.hidden) setIsola(false); else maybePeek(); });
    // The intro held back the island's moment (a new level, the first time): tried again when it closes.
    w.addEventListener('us:intro-done', () => maybePeek());
    const boot = () => {
      paintAll();
      let tries = 0;
      // The island's first time waits for the couple and the level, whichever comes last.
      const wait = () => { paintAll(); maybePeek(); if (!w.usProfile?.couple_id && tries++ < 40) setTimeout(wait, 500); };
      wait();
      // Come stai turns twelve hours old while US stays open; the open angolo keeps its focus.
      setInterval(() => {
        if (d.hidden) return;
        paintMe(); paintIsola();
        if (!angolo()?.classList.contains('open')) { paintDuo(); paintWardrobe(); }
      }, 60000);
    };
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
    w.UsAngolo = Object.freeze({ open: openAngolo, close: closeAngolo, tab: showTab, isola: setIsola, parla });
  }

  return Object.freeze({ SHAPES: Object.keys(SHAPES), SHAPE_NAMES, LOOK_HEAD, LOOK_FACE, LOOK_NAMES, LOOK_POINTS, LOOK_MOMENTS, character, slot, shapeOf, lookOf, colorName, myRole, reactionOf, unlockedLook, paintMe, paintDuo, paintWardrobe });
});
