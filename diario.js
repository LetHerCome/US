/* Il diario, ma pulito (founder, 15/11/2026; docs/missions/diario-pulito.md).
   Paints the page of today and «Voi due» from the authorities that already
   exist: the photo of the day (app.js UsOggiPhoto), the question of today
   (window.todayQuestion / todayState, app.js), Sintonia (progression.js,
   bondLevelInfo), the gentle streak (cosa-di-oggi.js) and the last points
   (app.js UsResonance). It owns no data and writes nothing to the server.
   The sentence of the day is built from your own facts with templates we
   wrote: no AI and never a comparison of who does less. */
(function () {
  'use strict';
  const w = typeof window !== 'undefined' ? window : globalThis;
  const d = w.document;
  if (!d) return;
  const $ = (id) => d.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const locale = () => w.UsI18n?.tag || 'it-IT';
  const reduced = () => {
    try { return Boolean(w.UsUiFoundation?.isReducedMotion?.()) || Boolean(w.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  };
  const identity = () => {
    try { return (typeof w.usIdentity === 'function' ? w.usIdentity() : null) || {}; } catch (_) { return {}; }
  };
  const partnerName = () => identity().partnerName || 'la tua persona';
  // Restart a CSS animation on purpose (one class, once).
  function play(el, cls, ms) {
    if (!el || reduced()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el.__dyTimers?.[cls]);
    el.__dyTimers = { ...(el.__dyTimers || {}), [cls]: setTimeout(() => el.classList.remove(cls), ms) };
  }

  // ---------------------------------------------------------------- the two characters
  // A ball for whoever created the couple (role francesco, --us-rosa), a
  // square for whoever joined (role beatrice, --us-lilla). Drawn here so they
  // take the person's colour and can be animated; the same shapes as the studio.
  const ell = (x, y, rx, ry) => `M${x - rx} ${y} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
  // Five shapes (founder, 15/11/2026, mockup v4.1): each person picks one; two
  // may share a shape, never a colour. Without a choice: the ball for whoever
  // created the couple, the square for whoever joined.
  const SHAPES = Object.freeze({
    palla: { body: 'M12 60 a38 36 0 1 0 76 0 a38 36 0 1 0 -76 0 Z', ex: [40, 60], ey: 58, feet: [37, 63], hl: [32, 40] },
    quadrato: { body: 'M36 24 H64 Q86 24 86 46 V72 Q86 94 64 94 H36 Q14 94 14 72 V46 Q14 24 36 24 Z', ex: [40, 60], ey: 56, feet: [36, 64], hl: [32, 40] },
    triangolo: { body: 'M50 16 Q57 16 61 24 L89 81 Q94 94 79 94 H21 Q6 94 11 81 L39 24 Q43 16 50 16 Z', ex: [41, 59], ey: 66, feet: [34, 66], hl: [45, 38] },
    goccia: { body: 'M50 14 C61 30 86 44 86 64 A36 32 0 0 1 14 64 C14 44 39 30 50 14 Z', ex: [40, 60], ey: 62, feet: [37, 63], hl: [38, 44] },
    nuvola: { body: 'M27 52 C17 38 31 24 43 31 C47 18 67 17 71 30 C83 23 97 37 87 51 C97 60 92 93 66 93 H34 C9 93 6 61 27 52 Z', ex: [40, 60], ey: 64, feet: [37, 63], hl: [52, 30] },
  });
  const SHAPE_NAMES = Object.freeze({ palla: 'Tondo', quadrato: 'Quadrato', triangolo: 'Triangolo', goccia: 'Goccia', nuvola: 'Nuvola' });
  // The shape of a role in this couple: the stored choice, or the old look.
  function shapeOf(role) {
    try {
      const prof = (w.UsCoupleContext?.snapshot?.()?.profiles || []).find((x) => x?.role === role);
      if (SHAPES[prof?.character_shape]) return prof.character_shape;
    } catch (_) { /* no context yet */ }
    // Temporary fallback (15/11/2026): while set_my_character_shape is not on
    // the server (migration 20261115183900 written, not applied), Impostazioni
    // keeps MY choice on this phone only (us:character-shape:<userId>) and
    // removes it as soon as the server saves one. Only my own role reads it,
    // and only when the server has no shape for me; the partner never does.
    try {
      const me = w.usProfile;
      if (me?.id && role === (me.role === 'beatrice' ? 'beatrice' : 'francesco')) {
        const local = w.localStorage?.getItem?.(`us:character-shape:${me.id}`);
        if (SHAPES[local]) return local;
      }
    } catch (_) { /* no storage */ }
    return role === 'beatrice' ? 'quadrato' : 'palla';
  }
  const INK = '#14120E';
  // ---------------------------------------------------------------- il guardaroba
  // Personaggi (founder, 20–21/11/2026, grill-me D6–D19, tavola approvata):
  // one thing on the head, one on the face or at the neck; all free. Unlocked
  // by the couple's Sintonia points on thresholds of their own, or by a real
  // moment. The server keeps the outfit (set_my_character_look, migration
  // 20261120232852, staging) and checks the same rule.
  const LOOK_HEAD = Object.freeze(['cappello', 'fiocco', 'cuffie', 'corona', 'coroncina', 'festa', 'cento']);
  const LOOK_FACE = Object.freeze(['occhiali', 'sole', 'sciarpina', 'gala', 'macchinetta']);
  const LOOK_NAMES = Object.freeze({ cappello: 'Cappello', fiocco: 'Fiocco', cuffie: 'Cuffie', corona: 'Corona', coroncina: 'Coroncina', festa: 'Cappello da festa', cento: 'Fascia dei 100', occhiali: 'Occhiali', sole: 'Occhiali da sole', sciarpina: 'Sciarpina', gala: 'Gala', macchinetta: 'Macchinetta' });
  const LOOK_POINTS = Object.freeze({ occhiali: 150, cappello: 400, fiocco: 700, sciarpina: 1000, sole: 1350, gala: 1700, cuffie: 2100, coroncina: 2550, corona: 3000 });
  const LOOK_MOMENTS = Object.freeze({ macchinetta: 'il primo Ricordo', cento: '100 giorni in US', festa: 'il primo anno in US' });
  // Where things sit on each shape: the top of the head [x, y, half width] and the sides [left, right, y].
  const ANCHOR = Object.freeze({ palla: { head: [50, 26, 19], ears: [12, 88, 56] }, quadrato: { head: [50, 25, 19], ears: [14, 86, 54] }, triangolo: { head: [50, 21, 11], ears: [23, 77, 60] }, goccia: { head: [50, 21, 10], ears: [16, 84, 60] }, nuvola: { head: [56, 22, 15], ears: [12, 88, 60] } });
  const lp = (d, fill, sw = 2.6) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
  let clipN = 0;
  // The accessories as on the approved tavola (same strokes as the characters).
  function lookSvg(item, shape) {
    const s = SHAPES[shape], an = ANCHOR[shape];
    if (!s || !an) return '';
    const [x, y, w0] = an.head, [l, r, ey] = an.ears, [a, b] = s.ex, fy = s.ey, neck = s.ey + 21;
    switch (item) {
      case 'cappello': return lp(`M${x - w0 - 3} ${y + 3} Q${x - w0 - 3} ${y - 19} ${x} ${y - 21} Q${x + w0 + 3} ${y - 19} ${x + w0 + 3} ${y + 3} Z`, '#F7B58E') + lp(`M${x - w0 - 5} ${y - 1} H${x + w0 + 5} Q${x + w0 + 8} ${y + 3} ${x + w0 + 5} ${y + 7} H${x - w0 - 5} Q${x - w0 - 8} ${y + 3} ${x - w0 - 5} ${y - 1} Z`, '#E8875C') + lp(ell(x, y - 24, 5.5, 5.5), '#FFF4E6');
      case 'fiocco': { const fx = x + w0 * 0.85, f = y + 3; return lp(`M${fx} ${f} L${fx - 13} ${f - 10} Q${fx - 17} ${f} ${fx - 13} ${f + 10} Z`, '#FF5A7A') + lp(`M${fx} ${f} L${fx + 13} ${f - 10} Q${fx + 17} ${f} ${fx + 13} ${f + 10} Z`, '#FF5A7A') + lp(ell(fx, f, 4.2, 4.2), '#FF8DA2'); }
      case 'cuffie': { const top = y - 9, band = `M${l + 1} ${ey - 6} C${l - 2} ${top - 4} ${r + 2} ${top - 4} ${r - 1} ${ey - 6}`; return `<path d="${band}" fill="none" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/><path d="${band}" fill="none" stroke="#3A3446" stroke-width="3.6" stroke-linecap="round"/>` + lp(`M${l - 6} ${ey - 9} h10 v20 h-10 q-3 -10 0 -20 Z`, '#6FD6C8') + lp(`M${r + 6} ${ey - 9} h-10 v20 h10 q3 -10 0 -20 Z`, '#6FD6C8'); }
      case 'corona': { const w = Math.max(w0, 14); return lp(`M${x - w} ${y + 3} L${x - w - 1} ${y - 14} L${x - w / 2} ${y - 5} L${x} ${y - 19} L${x + w / 2} ${y - 5} L${x + w + 1} ${y - 14} L${x + w} ${y + 3} Z`, '#F3D27A') + lp(ell(x, y - 3, 2.6, 2.6), '#FF5A7A', 1.6) + lp(ell(x - w / 2 - 1, y - 1, 2, 2), '#6F9BFF', 1.4) + lp(ell(x + w / 2 + 1, y - 1, 2, 2), '#6F9BFF', 1.4); }
      case 'coroncina': { const w = Math.max(w0, 13) + 4, pts = [-1, -0.5, 0, 0.5, 1].map((t) => [x + t * w, y + 2 - (1 - t * t) * 7]), cols = ['#FF9FB5', '#FFE07A', '#FFFFFF', '#FFE07A', '#FF9FB5']; return `<path d="M${pts[0][0]} ${pts[0][1]} Q${x} ${y - 9} ${pts[4][0]} ${pts[4][1]}" fill="none" stroke="#5E9E6E" stroke-width="3" stroke-linecap="round"/>` + pts.map(([px, py], i) => `<path d="${[0, 72, 144, 216, 288].map((g) => { const q = (g * Math.PI) / 180; return ell(px + Math.cos(q) * 3.2, py + Math.sin(q) * 3.2, 2.6, 2.6); }).join(' ')}" fill="${cols[i]}" stroke="${INK}" stroke-width="1.3"/>` + lp(ell(px, py, 1.8, 1.8), '#F3B23A', 1)).join(''); }
      case 'festa': { const w = Math.max(w0 * 0.75, 9); return `<g transform="rotate(-12 ${x} ${y})">` + lp(`M${x - w} ${y + 3} L${x} ${y - 25} L${x + w} ${y + 3} Z`, '#A98BFF') + `<path d="M${x - w * 0.62} ${y - 6} L${x + w * 0.35} ${y - 2} M${x - w * 0.3} ${y - 15} L${x + w * 0.15} ${y - 13}" stroke="#FFE07A" stroke-width="2.6" stroke-linecap="round"/>` + lp(ell(x, y - 26, 4, 4), '#FF5A7A') + '</g>'; }
      case 'cento': { const w = Math.max(w0, 13) + 3, arc = `M${x - w} ${y + 3} Q${x} ${y - 7} ${x + w} ${y + 3}`; return `<path d="${arc}" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round"/><path d="${arc}" fill="none" stroke="#F3D27A" stroke-width="3" stroke-linecap="round"/>` + lp(ell(x, y - 7, 10, 8), '#FFFDF9', 2.2) + `<text x="${x}" y="${y - 4.3}" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="8.5" fill="${INK}">100</text>`; }
      case 'occhiali': return lp(`${ell(a, fy, 9.5, 8.5)} ${ell(b, fy, 9.5, 8.5)} M${a + 9.5} ${fy} H${b - 9.5}`, 'rgba(255,255,255,.28)');
      case 'sole': return lp(`M${a - 10} ${fy - 6} H${a + 9} Q${a + 9} ${fy + 8} ${a - 1} ${fy + 8} Q${a - 10} ${fy + 8} ${a - 10} ${fy - 6} Z M${b - 9} ${fy - 6} H${b + 10} Q${b + 10} ${fy + 8} ${b + 1} ${fy + 8} Q${b - 9} ${fy + 8} ${b - 9} ${fy - 6} Z M${a + 9} ${fy - 3} H${b - 9}`, '#231E2C') + `<path d="M${a - 6} ${fy - 2} l4 -2.5 M${b - 5} ${fy - 2} l4 -2.5" stroke="rgba(255,255,255,.7)" stroke-width="1.6" stroke-linecap="round"/>`;
      case 'sciarpina': { const id = `dyc${++clipN}`; return `<defs><clipPath id="${id}"><path d="${s.body}"/></clipPath></defs><g clip-path="url(#${id})"><path d="M0 ${neck - 6} H110 V${neck + 6} H0 Z" fill="#E8604C" stroke="${INK}" stroke-width="2.6"/><path d="M8 ${neck - 1} H100" stroke="#FFE07A" stroke-width="2.4" stroke-dasharray="5 5"/></g>` + lp(`M58 ${neck + 2} L66 ${neck + 17} L58 ${neck + 19} L52 ${neck + 4} Z`, '#E8604C'); }
      case 'gala': { const g = neck - 1; return lp(`M50 ${g} L38 ${g - 7} L38 ${g + 7} Z M50 ${g} L62 ${g - 7} L62 ${g + 7} Z`, '#2B2433') + lp(ell(50, g, 3.4, 3.4), '#4A3F57'); }
      case 'macchinetta': { const m = neck - 2; return `<path d="M42 ${m - 4} L${l + 10} ${fy + 12} M58 ${m - 4} L${r - 10} ${fy + 12}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>` + lp(`M39 ${m - 6} H61 Q63 ${m - 6} 63 ${m - 4} V${m + 8} Q63 ${m + 10} 61 ${m + 10} H39 Q37 ${m + 10} 37 ${m + 8} V${m - 4} Q37 ${m - 6} 39 ${m - 6} Z`, '#FFFDF9', 2.2) + lp(ell(50, m + 2, 4.6, 4.6), '#3A3446', 1.8) + lp(ell(58, m - 2.5, 1.6, 1.6), '#FF5A7A', 1); }
      default: return '';
    }
  }
  // ---------------------------------------------------------------- le reazioni
  // Personaggi, fase 3 (founder, 20/11/2026, D9): a few clear reactions over
  // the face of Come stai, for a few hours, only for things you do for each
  // other, never for what you don't do. The day of your anniversary or
  // mesiversario: festa, both. A Ti penso received in the last 3 hours: heart
  // eyes, mine. The other answered today's question and I haven't seen it
  // yet: their character waves. After 22 and until 6: both sleepy.
  const REACTION_HOURS = 3;
  function reactionOf(role, now = new Date()) {
    const c = couple();
    const started = String(w.UsCoupleContext?.snapshot?.()?.couple?.started_on || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(started);
    if (m) {
      const y = now.getFullYear(), mo = now.getMonth() + 1, day = now.getDate();
      const lastDay = new Date(y, mo, 0).getDate();
      const sameDay = day === Math.min(+m[3], lastDay);
      const after = y * 12 + mo > +m[1] * 12 + +m[2];
      if (sameDay && after) return 'festa';
    }
    if (role === c.myRole) {
      const at = Date.parse(w.usThinkLastReceivedAt || '');
      if (Number.isFinite(at) && now.getTime() - at >= 0 && now.getTime() - at < REACTION_HOURS * 3600e3) return 'cuore';
    }
    if (role === c.partnerRole) {
      const st = w.todayState, q = w.todayQuestion;
      const theirs = Boolean(st?.partner_has_answer || st?.both_answered);
      const seen = st?.my_answer != null && st?.both_answered && !revealUnread(null, q);
      if (q?.id && theirs && !seen) return 'saluta';
    }
    const h = now.getHours();
    if (h >= 22 || h < 6) return 'sera';
    return '';
  }
  function reactionBack(reaction, shape, color) {
    const an = ANCHOR[shape];
    if (reaction === 'festa') return [[6, 30, '#FF5A7A', 20], [94, 26, '#6F9BFF', -25], [2, 70, '#F3D27A', 40], [98, 66, '#8FD49B', -10], [20, 12, '#A98BFF', 15], [82, 10, '#FF9F6E', -30]].map(([cx, cy, cc, r]) => `<rect class="dy-confetto" x="${cx - 3}" y="${cy - 1.6}" width="6" height="3.2" rx="1" fill="${cc}" transform="rotate(${r} ${cx} ${cy})"/>`).join('');
    if (reaction === 'saluta' && an) { const [, er, ey] = an.ears, arm = `M${er - 3} ${ey + 14} Q${er + 8} ${ey + 6} ${er + 11} ${ey - 6}`; return `<g class="dy-wave"><path d="${arm}" fill="none" stroke="${INK}" stroke-width="8.5" stroke-linecap="round"/><path d="${arm}" fill="none" style="stroke:${color}" stroke-width="4.2" stroke-linecap="round"/><path d="${ell(er + 12, ey - 9, 6, 6)}" style="fill:${color}" stroke="${INK}" stroke-width="2.8"/></g><path d="M${er + 20} ${ey - 20} q4 4 3 9 M${er + 24} ${ey - 24} q6 6 4 14" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`; }
    return '';
  }
  function reactionFront(reaction, shape) {
    const s = SHAPES[shape];
    if (reaction !== 'cuore' || !s) return '';
    const [a, b] = s.ex, y = s.ey;
    const heart = (x) => `M${x} ${y + 5} C${x - 9} ${y - 1} ${x - 6} ${y - 9} ${x} ${y - 4} C${x + 6} ${y - 9} ${x + 9} ${y - 1} ${x} ${y + 5} Z`;
    return lp(`${heart(a)} ${heart(b)}`, '#FF4F6F', 1.8) + `<path d="M88 30 C84 27 85 22 88 24.5 C91 22 92 27 88 30 Z" fill="#FF4F6F" stroke="${INK}" stroke-width="1.2"/>`;
  }
  // What a role wears: the profile (both phones). My own choice stays on this
  // phone only while the server cannot keep it yet (no character_head column).
  function lookOf(role) {
    const clean = (v) => ({ head: LOOK_HEAD.includes(v?.head) ? v.head : null, face: LOOK_FACE.includes(v?.face) ? v.face : null });
    try {
      const prof = (w.UsCoupleContext?.snapshot?.()?.profiles || []).find((x) => x?.role === role);
      if (prof && 'character_head' in prof) return clean({ head: prof.character_head, face: prof.character_face });
    } catch (_) { /* no context yet */ }
    try {
      const me = w.usProfile;
      if (me?.id && role === (me.role === 'beatrice' ? 'beatrice' : 'francesco')) return clean(JSON.parse(w.localStorage?.getItem?.(`us:character-look:${me.id}`) || 'null'));
    } catch (_) { /* no storage */ }
    return { head: null, face: null };
  }
  // What the couple has unlocked: the server's answer when it has one, else the
  // same rule here (points, the first Ricordo, the days since the couple began in US).
  let lookUnlocks = null;
  function unlockedLook() {
    if (Array.isArray(lookUnlocks)) return new Set(lookUnlocks);
    const out = new Set();
    const xp = Number(w.USProgression?.getState?.()?.total_xp) || 0;
    for (const [item, need] of Object.entries(LOOK_POINTS)) if (xp >= need) out.add(item);
    if ((w.UsOggiPhoto?.rows?.() || []).length) out.add('macchinetta');
    const born = Date.parse(w.UsCoupleContext?.snapshot?.()?.couple?.created_at || '');
    if (Number.isFinite(born)) { const days = (Date.now() - born) / 864e5; if (days >= 100) out.add('cento'); if (days >= 365) out.add('festa'); }
    return out;
  }
  function refreshLookUnlocks() {
    const client = typeof sb !== 'undefined' ? sb : null;
    if (!client?.rpc || !w.usProfile?.couple_id) return Promise.resolve();
    return Promise.resolve(client.rpc('my_character_unlocks')).then((r) => { if (!r?.error && Array.isArray(r?.data)) lookUnlocks = r.data; }).catch(() => {});
  }
  // Dress my character: the server when it can, else this phone; the partner sees it at the next read.
  async function saveLook(next) {
    const me = w.usProfile;
    if (!me?.id) return false;
    const look = { head: LOOK_HEAD.includes(next.head) ? next.head : null, face: LOOK_FACE.includes(next.face) ? next.face : null };
    const client = typeof sb !== 'undefined' ? sb : null;
    let saved = false, missing = !client?.rpc;
    if (client?.rpc) {
      try {
        const r = await client.rpc('set_my_character_look', { p_head: look.head, p_face: look.face });
        // Saved only when the server answers with the outfit (an older server has no such function).
        if (!r?.error && r?.data && typeof r.data === 'object' && 'head' in r.data) { saved = true; if (Array.isArray(r.data.unlocked)) lookUnlocks = r.data.unlocked; }
        else if (!r?.error) missing = true;
        else if (/locked/.test(String(r.error.message || ''))) { w.toast?.('Questo non è ancora sbloccato'); return false; }
        else missing = /function|schema cache|PGRST202|42883/i.test(`${r.error.code || ''} ${r.error.message || ''}`);
      } catch (_) { missing = true; }
    }
    if (!saved && !missing) { w.toast?.('Non riesco a salvarlo, riprova'); return false; }
    try { if (saved) w.localStorage?.removeItem?.(`us:character-look:${me.id}`); else w.localStorage?.setItem?.(`us:character-look:${me.id}`, JSON.stringify(look)); } catch (_) { /* no storage */ }
    if (saved) await Promise.resolve(w.UsCoupleContext?.hydrate?.()).catch(() => {});
    paintAll();
    return true;
  }
  // The twelve states of Come stai (member-status.js) on four faces.
  const FACE = Object.freeze({ dorme: 'dorme', occhiolino: 'felice', felice: 'felice', festa: 'innamorato', innamorato: 'innamorato', giu: 'giu', malato: 'giu', stanco: 'stanco', nervoso: 'teso', lavoro: 'felice', studio: 'felice', palestra: 'felice', viaggio: 'felice', tavola: 'felice' });
  // How each of you is, by role, from Come stai (12 hours; nothing when not said).
  function moods() {
    const st = w.UsMemberStatus?.widgetState?.();
    const c = couple();
    return { [c.myRole]: st?.me?.status || '', [c.partnerRole]: st?.partner?.status || '' };
  }
  // who: a role ('francesco' | 'beatrice', colour and shape of that person) or
  // { shape, color } for a character that is not (yet) a member (the entrance).
  function character(who, o = {}) {
    const role = typeof who === 'string' ? who : '';
    const shape = SHAPES[o.shape] ? o.shape : SHAPES[who?.shape] ? who.shape : shapeOf(role);
    const color = o.color || who?.color || (role === 'beatrice' ? 'var(--us-lilla)' : 'var(--us-rosa)');
    const s = SHAPES[shape], size = o.size || 56, dx = o.dx || 0, [a, b] = s.ex, y = s.ey, wink = o.mood === 'occhiolino';
    // Come stai (founder, 15/11/2026): the face says how you are; a reaction passes over it for a while.
    const reaction = o.reaction !== undefined ? o.reaction : (o.react && role ? reactionOf(role) : '');
    const face = reaction === 'sera' ? 'dorme' : reaction ? 'felice' : (FACE[o.mood] || 'felice');
    const shut = face === 'stanco' || face === 'innamorato' || face === 'dorme';
    const open = reaction === 'cuore' ? [] : wink ? [a] : shut ? [] : [a, b];
    const lids = shut ? `<path d="${[a, b].map((x) => face === 'dorme' ? `M${x + dx - 5} ${y} Q${x + dx} ${y + 4.5} ${x + dx + 5} ${y}` : face === 'innamorato' ? `M${x + dx - 4.5} ${y + 1} Q${x + dx} ${y - 5} ${x + dx + 4.5} ${y + 1}` : `M${x + dx - 4.5} ${y} Q${x + dx} ${y + 3.5} ${x + dx + 4.5} ${y}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>` : '';
    const brows = face === 'teso' ? `<path d="M${a - 6} ${y - 10} L${a + 4} ${y - 7} M${b + 6} ${y - 10} L${b - 4} ${y - 7}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` : '';
    const big = reaction === 'cuore' || reaction === 'festa';
    const mouth = big ? `M44.5 ${y + 9} Q50 ${y + 17} 55.5 ${y + 9} Z` : face === 'dorme' ? `${ell(50, y + 12, 2.4, 1.9)}` : face === 'giu' ? `M46 ${y + 14} Q50 ${y + 9.5} 54 ${y + 14}` : face === 'teso' || face === 'stanco' ? `M46.5 ${y + 11.5} H53.5` : face === 'innamorato' ? `M44.5 ${y + 9} Q50 ${y + 16.5} 55.5 ${y + 9}` : `M46 ${y + 10} Q50 ${y + 14.5} 54 ${y + 10}`;
    const label = o.label ? ` role="img" aria-label="${esc(o.label)}"` : ' aria-hidden="true"';
    // The outfit: given (the wardrobe's previews), else the role's own.
    const worn = role ? lookOf(role) : { head: null, face: null };
    const head = o.head !== undefined ? o.head : worn.head;
    const faceItem = o.face !== undefined ? o.face : (o.acc === 'occhiali' ? 'occhiali' : worn.face);
    const dress = `${faceItem ? lookSvg(faceItem, shape) : ''}${head ? lookSvg(head, shape) : ''}`;
    return `<svg class="dy-char" viewBox="-4 6 108 100" overflow="visible" width="${size}" height="${Math.round(size * 100 / 108)}"${label} focusable="false">
      ${reactionBack(reaction, shape, color)}<path d="${ell(s.feet[0], 97, 9, 5)} ${ell(s.feet[1], 97, 9, 5)}" style="fill:${color}" stroke="${INK}" stroke-width="3"/>
      <path d="${s.body}" style="fill:${color}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="${ell(s.hl[0], s.hl[1], 8, 5)}" fill="rgba(255,255,255,.55)"/>
      <path d="${ell(a - 8, y + 9, 5, 3)} ${ell(b + 8, y + 9, 5, 3)}" fill="rgba(211,64,42,.3)"/>
      ${open.length ? `<g class="dy-eyes"><path d="${open.map((x) => ell(x + dx, y, 4.4, 5.8)).join(' ')}" fill="${INK}"/><path d="${open.map((x) => ell(x + dx + 1.5, y - 2.3, 1.5, 1.5)).join(' ')}" fill="#fff"/></g>` : ''}${lids}${brows}
      ${wink ? `<path d="M${b - 5} ${y + 1} Q${b} ${y - 4} ${b + 5} ${y + 1}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>` : ''}
      <path d="${mouth}" fill="${big ? '#7A2E3A' : face === 'dorme' ? INK : 'none'}" stroke="${face === 'dorme' && !big ? 'none' : INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>${reactionFront(reaction, shape, color)}
      ${face === 'dorme' ? '<text x="84" y="36" font-family="Figtree,sans-serif" font-weight="800" font-size="19" style="fill:var(--us-ink-100)">z</text><text x="97" y="22" font-family="Figtree,sans-serif" font-weight="800" font-size="13" style="fill:var(--us-ink-100)">z</text>' : ''}
      ${dress}
    </svg>`;
  }
  // The place of someone who has not arrived yet: the same shape, dashed.
  function slot(shape, size, q = true) {
    const s = SHAPES[shape] || SHAPES.quadrato;
    return `<svg class="dy-char dy-slot" viewBox="-4 6 108 100" width="${size}" height="${Math.round(size * 100 / 108)}" aria-hidden="true" focusable="false"><path d="${s.body}" style="fill:var(--us-ink-04);stroke:var(--us-ink-40)" stroke-width="3" stroke-dasharray="7 6" stroke-linejoin="round"/>${q ? `<text x="50" y="${s.ey + 12}" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="30" style="fill:var(--us-ink-40)">?</text>` : ''}</svg>`;
  }
  // Both phones show the same two, in the same order: the creator, then who joined.
  function couple() {
    const me = w.usProfile || {};
    const myRole = me.role === 'beatrice' ? 'beatrice' : 'francesco';
    const id = identity();
    const names = { [myRole]: id.ownName || 'Tu', [myRole === 'beatrice' ? 'francesco' : 'beatrice']: id.partnerName || 'La tua persona' };
    return { myRole, partnerRole: myRole === 'beatrice' ? 'francesco' : 'beatrice', names };
  }
  let winkUntil = 0;
  function paintDuo({ hop = false } = {}) {
    const root = $('dyDuo');
    if (!root) return;
    if (!w.usProfile?.couple_id) { root.innerHTML = ''; return; }
    const c = couple();
    const wink = Date.now() < winkUntil;
    const m = moods();
    // The one who just received my Ti penso winks (the partner's character).
    const ball = character('francesco', { size: 50, dx: 2, mood: wink && c.partnerRole === 'francesco' ? 'occhiolino' : m.francesco, react: !(wink && c.partnerRole === 'francesco') });
    const square = character('beatrice', { size: 54, dx: -2, mood: wink && c.partnerRole === 'beatrice' ? 'occhiolino' : m.beatrice, react: !(wink && c.partnerRole === 'beatrice') });
    root.innerHTML = `<span class="dy-stk" data-dy-char="francesco">${ball}</span><span class="dy-stk" data-dy-char="beatrice" style="animation-delay:.06s">${square}</span>`;
    root.setAttribute('aria-label', `L’angolo di noi: ${c.names.francesco} e ${c.names.beatrice}`);
    if (hop) hopDuo();
  }
  function hopDuo() {
    $('dyDuo')?.querySelectorAll('.dy-stk').forEach((el) => play(el, 'dy-hop', 600));
  }

  // ---------------------------------------------------------------- the title
  function romeParts(now = new Date()) {
    try {
      const f = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
      const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
      return { weekday: parts.weekday || '', day: `${parts.day || ''} ${parts.month || ''}`.trim() };
    } catch (_) { return { weekday: '', day: '' }; }
  }
  const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1) : '');
  function todayISO() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()); } catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function startedOn() {
    try { return w.UsCoupleContext?.snapshot?.()?.couple?.started_on || null; } catch (_) { return null; }
  }
  const dayNumber = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN; };
  function pageNumber() {
    const n = dayNumber(todayISO()) - dayNumber(startedOn());
    return Number.isFinite(n) && n >= 0 ? n + 1 : 0;
  }
  function paintTitle() {
    const p = romeParts();
    const wd = $('dyWeekday'), day = $('dyDay');
    if (wd) wd.textContent = p.weekday ? `${cap(p.weekday)}, ` : '';
    if (day) day.textContent = p.day;
    const n = pageNumber(), line = $('dyPageLine');
    if (line) {
      line.hidden = !n;
      if (n) $('dyPageN').textContent = String(n);
    }
  }

  // ---------------------------------------------------------------- the sentence of the day
  // Templates written by us, filled with your facts. Each has the colour of
  // what it talks about: honey for dates, sky for the distance, the other
  // person's soft colour for what they did, white for the photo itself.
  function monthsBetween(fromISO, toISO) {
    const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fromISO || '')), t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(toISO || ''));
    if (!f || !t) return null;
    let m = (+t[1] - +f[1]) * 12 + (+t[2] - +f[2]);
    if (+t[3] < +f[3]) m -= 1;
    return m;
  }
  const NUM = ['', 'Un', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Otto', 'Nove', 'Dieci', 'Undici', 'Dodici'];
  function yearsWord(n) { return n === 1 ? 'Un anno' : `${NUM[n] || n} anni`; }
  function photoSentences(meta, today) {
    const out = [];
    const date = String(meta?.date || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return out;
    const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
    if (t && m[2] === t[2] && m[3] === t[3] && +t[1] > +m[1]) {
      out.push({ text: `${yearsWord(+t[1] - +m[1])} fa, proprio oggi`, tone: 'miele' });
      return out;
    }
    const days = dayNumber(today) - dayNumber(date);
    if (days === 0) out.push({ text: 'Questa foto è di oggi', tone: 'white' });
    else if (days === 1) out.push({ text: 'Questa foto è di ieri', tone: 'white' });
    else if (days > 1 && days < 31) out.push({ text: `Questa foto è di ${days} giorni fa`, tone: 'white' });
    else if (days >= 31) {
      const months = monthsBetween(date, today);
      if (months >= 12) {
        const y = Math.floor(months / 12);
        out.push({ text: `Questa foto ha ${y === 1 ? 'un anno' : `${y} anni`}`, tone: 'white' });
      } else if (months >= 1) out.push({ text: `Questa foto ha ${months === 1 ? 'un mese' : `${months} mesi`}`, tone: 'white' });
    }
    return out;
  }
  function distanceSentence(next) {
    const pill = $('distanceWidget');
    const value = $('distanceValue')?.textContent?.trim() || '';
    if (!pill || pill.hidden || !/\d/.test(value) || !/km/i.test(value)) return null;
    return { text: next ? `${value} · ${next.title} ${next.when.toLocaleLowerCase(locale())}` : `${value} tra voi`, tone: 'cielo' };
  }
  function nextModel() {
    const button = $('usOggiNext');
    if (!button || button.hidden) return null;
    const when = $('usOggiNextWhen')?.textContent?.trim() || '';
    const title = $('usOggiNextTitle')?.textContent?.trim() || '';
    return when && title ? { when, title } : null;
  }
  function togetherSentence(today) {
    const s = startedOn();
    if (!s) return null;
    // A month together in the next 7 days.
    for (let k = 0; k <= 7; k += 1) {
      const at = new Date((dayNumber(today) + k) * 86400000).toISOString().slice(0, 10);
      const months = monthsBetween(s, at);
      if (months > 0 && at.slice(8) === String(s).slice(8)) {
        const what = months % 12 === 0 ? (months === 12 ? 'un anno' : `${months / 12} anni`) : (months === 1 ? 'un mese' : `${months} mesi`);
        const when = k === 0 ? 'Oggi fate' : k === 1 ? 'Domani fate' : `Tra ${k} giorni fate`;
        return { text: `${when} ${what} insieme`, tone: 'miele' };
      }
    }
    const n = pageNumber();
    const next100 = Math.ceil(n / 100) * 100;
    if (n > 0 && next100 - n <= 7 && next100 - n >= 0) return { text: next100 === n ? `Oggi sono ${n} giorni insieme` : `Tra ${next100 - n} giorni sono ${next100}`, tone: 'miele' };
    return null;
  }
  // Founder, 15/11/2026: an active countdown is the sentence of the day, in
  // place of the others («12 giorni · Padova»). countdown.js stays the authority.
  function countdownSentence(today) {
    const st = w.USCountdown?.widgetState?.();
    if (!st?.active) return null;
    if (st.kind === 'together') {
      const n = dayNumber(today) - dayNumber(st.target);
      return Number.isFinite(n) && n > 0 ? { text: `${n} giorni insieme`, tone: 'miele' } : null;
    }
    const target = String(st.target || '').slice(0, 10);
    const n = dayNumber(target) - dayNumber(today);
    if (!Number.isFinite(n) || n < 0) return null;
    const title = String(st.title || '').trim();
    const when = n === 0 ? 'Oggi' : n === 1 ? 'Domani' : `${n} giorni`;
    return { text: title ? `${when} · ${title}` : when, tone: 'miele', only: true };
  }
  function sentences(meta) {
    const today = todayISO();
    const next = nextModel();
    const list = [];
    // A countdown to a date takes the place of the others; «Insieme da» (the
    // default one) is just one of the sentences.
    const countdown = countdownSentence(today);
    // The photo of the day chosen for this very day years ago says so first.
    const year = photoSentences(meta, today).find((x) => /proprio oggi$/.test(x.text));
    if (countdown?.only) return year ? [year, countdown] : [countdown];
    const together = togetherSentence(today);
    if (together) list.push(together);
    const distance = distanceSentence(next);
    if (distance) list.push(distance);
    else if (next) list.push({ text: `${next.when}: ${next.title}`, tone: 'miele' });
    list.push(...photoSentences(meta, today));
    const author = meta?.author;
    if (author && author !== w.usProfile?.id && list.length < 2) list.push({ text: `Questa l’ha scelta ${partnerName()} per i Ricordi`, tone: 'partner' });
    if (countdown) list.push(countdown);
    return list;
  }
  const TONE = { miele: 'var(--us-miele)', cielo: 'var(--us-cielo)', white: '#FFFFFF', partner: 'var(--us-partner-soft)' };

  // ---------------------------------------------------------------- the photo of the day
  let shownPath = null, photoTurn = 0, loadedFor = null;
  function paintPhoto({ fresh = false } = {}) {
    const button = $('dyPhoto'), img = $('dyPhotoImg'), empty = $('dyPhotoEmpty');
    if (!button || !img) return;
    const now = w.UsOggiPhoto?.current?.() || { url: '', path: '', meta: null };
    const has = Boolean(now.url);
    // Painted from the boot cache: read Ricordi once for its caption and author.
    if (has && !now.meta && loadedFor !== now.path) { loadedFor = now.path; w.UsOggiPhoto?.load?.(); }
    button.hidden = !has && Boolean(w.usProfile);
    button.classList.toggle('has-photo', has);
    if (empty) empty.hidden = has || !w.usProfile;
    if (has && img.getAttribute('src') !== now.url) img.src = now.url;
    img.hidden = !has;
    const model = now.meta && w.UsOggiCaption?.viewModel ? w.UsOggiCaption.viewModel(now.meta) : null;
    const capEl = $('dyPhotoCap'), who = $('dyPhotoWho');
    if (capEl) capEl.textContent = model?.text || '';
    if (who) {
      const mine = model?.who === 'tu', theirs = model?.who === 'partner';
      who.hidden = !(mine || theirs);
      who.style.setProperty('--who', mine ? 'var(--us-tu)' : 'var(--us-partner)');
    }
    button.setAttribute('aria-label', `La foto del giorno${model?.text ? `: ${model.text}` : ''}${model?.meta ? `, ${model.meta}` : ''}. Apri il ricordo`);
    const changed = has && now.path !== shownPath;
    if (changed) { if (shownPath !== null) photoTurn += 1; shownPath = now.path; }
    if ((fresh || changed) && has && shownPath !== null) play(button, 'is-fresh', 520);
    paintFrase(now.meta, { fresh: fresh || changed });
  }
  function paintFrase(meta, { fresh = false } = {}) {
    const el = $('dyFrase');
    if (!el) return;
    const list = sentences(meta);
    const pick = list.length ? list[photoTurn % list.length] : null;
    if (!pick || !$('dyPhoto')?.classList.contains('has-photo')) { el.hidden = true; el.textContent = ''; return; }
    const same = el.textContent === pick.text && !el.hidden;
    el.textContent = pick.text;
    el.style.setProperty('--frase', TONE[pick.tone] || '#fff');
    el.hidden = false;
    if (fresh && !same) play(el, 'is-fresh', 700);
  }

  let photoHeld = false;
  function photoHold() {
    const btn = $('dyPhoto');
    if (!btn) return;
    let timer = 0, start = null;
    const stop = () => { clearTimeout(timer); timer = 0; };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !btn.classList.contains('has-photo')) return;
      start = { x: e.clientX, y: e.clientY };
      stop();
      timer = setTimeout(() => { timer = 0; photoHeld = true; w.UsOggiPhoto?.hide?.(); }, 600);
    });
    btn.addEventListener('pointermove', (e) => { if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!photoHeld && btn.classList.contains('has-photo')) { stop(); photoHeld = true; w.UsOggiPhoto?.hide?.(); } });
  }

  // ---------------------------------------------------------------- the question of today
  let lastQuestion = { id: null, mine: null, both: false, unread: false };
  // Same rule as app.js dailyRevealAccess: the answers stay closed on Oggi
  // until the sheet has shown them (or the notice was put away).
  function revealUnread(source, question) {
    const st = source?.state || w.todayState;
    if (!st?.both_answered) return false;
    const meta = source?.reveal ?? w.todayRevealMeta;
    const ok = meta && meta.question_id === question?.id && (meta.my_reveal_seen_at || meta.my_notice_dismissed_at);
    return !ok;
  }
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  function paintQuestion(source) {
    const card = $('dyQuestion');
    if (!card) return;
    const q = source?.question || w.todayQuestion;
    const st = source?.state || w.todayState;
    const partner = source?.partnerName || partnerName();
    if (source?.status === 'error') {
      card.innerHTML = `<span class="dy-q-kicker">La domanda di oggi</span><span class="dy-q-text">La domanda di oggi non è arrivata.</span><div class="dy-q-foot"><span class="dy-q-hint">Riprova tra un momento.</span><button type="button" class="dy-btn dy-btn-l" data-dy="answer">Riprova</button></div>`;
      card.hidden = false;
      return;
    }
    if (!q?.id || !q.question || !st) { card.hidden = true; return; }
    const mine = st.my_answer != null ? String(st.my_answer) : null;
    const both = Boolean(st.both_answered);
    const unread = both && revealUnread(source, q);
    const theirs = both && !unread && typeof st.partner_answer === 'string' ? st.partner_answer : null;
    // Mockup v4.1: beside each answer, who wrote it, small like a signature;
    // whoever has not answered yet is asleep.
    const c = couple();
    const sign = (role, mood, inner) => `<div class="dy-q-sign"><span class="dy-stk">${character(role, { size: 30, mood })}</span><div class="dy-q-sign-body">${inner}</div></div>`;
    const mineHl = (text) => `<span class="dy-hl" style="--c:var(--us-tu-hl)" translate="no">${esc(text)}</span>`;
    const was = lastQuestion;
    const justRevealed = theirs !== null && was.id === q.id && (was.unread || !was.both || was.mine === null);
    // One page (founder, 20/11/2026): who has answered (or sleeps) and the action on one row.
    const act = (role, mood, text, button) => `<div class="dy-q-sign is-act"><span class="dy-stk">${character(role, { size: 30, mood })}</span><span class="dy-q-hint">${esc(text)}</span>${button || ''}</div>`;
    const btn = (label, ghostBtn) => `<button type="button" class="dy-btn dy-btn-m${ghostBtn ? ' dy-btn-ghost' : ' dy-btn-noi'}" data-dy="answer">${label}</button>`;
    let rows = [];
    if (mine === null) {
      rows = st.partner_has_answer
        ? [act(c.partnerRole, 'felice', `${partner} ha risposto: la sua si apre quando rispondi anche tu`, btn(`Rispondi ${ARROW}`))]
        : [act(c.partnerRole, 'dorme', `${partner} non ha ancora risposto`, btn(`Rispondi ${ARROW}`))];
    } else if (!both) {
      rows = [sign(c.myRole, 'felice', mineHl(mine)), act(c.partnerRole, 'dorme', `Aspettiamo ${partner}`, btn('Modifica', true))];
    } else if (unread) {
      rows = [sign(c.myRole, 'felice', mineHl(mine)), act(c.partnerRole, 'felice', `Anche ${partner} ha risposto`, btn(`Leggi ${ARROW}`))];
    } else {
      rows = [sign(c.myRole, 'felice', mineHl(mine)), sign(c.partnerRole, 'felice', `<span class="${justRevealed && !reduced() ? 'dy-q-unblur' : ''}"><span class="dy-hl" style="--c:var(--us-partner-hl)" translate="no">${esc(theirs || '')}</span></span>`)];
    }
    const answers = `<div class="dy-q-answers">${rows.join('')}</div>`, foot = '';
    const html = `<span class="dy-q-kicker">La domanda di oggi</span><span class="dy-q-text">${esc(q.question)}</span>${answers}${foot}`;
    if (card.__dyHtml !== html || card.hidden) { card.innerHTML = html; card.__dyHtml = html; }
    card.hidden = false;
    lastQuestion = { id: q.id, mine, both, unread };
    // The points go to you two: +10 Sintonia rises towards the characters
    // (private.progression_daily_trigger awards 10 when both answered).
    if (justRevealed) {
      if (!reduced()) {
        const plus = d.createElement('span');
        plus.className = 'dy-plus';
        plus.setAttribute('aria-hidden', 'true');
        plus.textContent = '+10 Sintonia';
        card.appendChild(plus);
        setTimeout(() => plus.remove(), 1800);
      }
      hopDuo();
    }
  }

  // ---------------------------------------------------------------- Ti penso
  const HEART = '<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path fill="#FF5477" d="M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z"/></svg>';
  let toastTimer = 0;
  function notice(html) {
    const el = $('dyToast');
    if (!el) return;
    el.hidden = true;
    void el.offsetWidth;
    el.innerHTML = html;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2050);
  }
  // Returns true when Oggi is on screen and told it (app.js skips its own toast).
  function thinkSent({ name = '', duplicate = false } = {}) {
    if (!$('home')?.classList.contains('active') || !$('dyOggi')) return false;
    const btn = $('thinkButton');
    if (duplicate) { notice(`${HEART}<span>Già inviato</span>`); return true; }
    play(btn, 'dy-pop', 480);
    const fly = $('dyThinkFly');
    if (fly && !reduced()) {
      fly.innerHTML = [[6, 0], [18, 0.1], [28, 0.18]].map(([x, delay]) => `<i style="left:${x}px;animation-delay:${delay}s">${HEART}</i>`).join('');
      setTimeout(() => { fly.innerHTML = ''; }, 1400);
    }
    notice(`${HEART}<span>${esc(`Ti penso inviato a ${name || partnerName()}`)}</span>`);
    winkUntil = Date.now() + 1200;
    paintDuo({ hop: true });
    setTimeout(() => paintDuo(), 1250);
    return true;
  }

  // ---------------------------------------------------------------- Voi due (Sintonia)
  // L'angolo di noi (founder, 20/11/2026, D3–D16): opened from your two
  // characters on Oggi, in place of «Voi due». The two of you dressed, a peek
  // at the other (how they are, what they wear), your wardrobe, the next thing
  // to unlock; the Sintonia and its rewards stay here.
  let peekOpen = false;
  function angoloDuo(c) {
    const st = w.UsMemberStatus?.widgetState?.();
    const one = (role, mine) => `<button type="button" class="dy-angolo-who" ${mine ? 'data-dy="look-top"' : `data-dy="peek" aria-expanded="${peekOpen}"`} aria-label="${esc(mine ? `Tu, ${c.names[role]}` : `${c.names[role]}: come sta e cosa indossa`)}"><span class="dy-stk">${character(role, { size: 92, mood: (mine ? st?.me?.status : st?.partner?.status) || '', react: true })}</span><span class="dy-angolo-name" translate="no">${esc(c.names[role])}</span></button>`;
    const order = c.myRole === 'francesco' ? [[c.myRole, true], [c.partnerRole, false]] : [[c.partnerRole, false], [c.myRole, true]];
    return `<div class="dy-angolo-duo">${order.map(([r, m]) => one(r, m)).join('')}</div>${peekOpen ? peekMarkup(c, st) : ''}`;
  }
  // The peek (D13): how the other is and what they wear; nothing private.
  function peekMarkup(c, st) {
    const api = w.UsMemberStatus, p = st?.partner;
    const word = p?.status && api ? `${api.STATUSES?.find?.((x) => x.key === p.status)?.emoji || ''} ${api.word(p.status, p.form)}` : 'Non l’ha ancora detto';
    const at = Date.parse(p?.at || ''), ago = Number.isFinite(at) && api?.since ? ` · ${api.since(Date.now() - at)}` : '';
    const look = lookOf(c.partnerRole), wears = [look.head, look.face].filter(Boolean).map((k) => LOOK_NAMES[k]);
    return `<div class="dy-peek" role="region" aria-label="${esc(c.names[c.partnerRole])}"><span class="dy-peek-copy"><b translate="no">${esc(c.names[c.partnerRole])}</b><span>Come sta: ${esc(word)}${esc(ago)}</span><span>Indossa: ${esc(wears.length ? wears.join(' e ') : 'niente, per ora')}</span></span><button type="button" class="dy-btn dy-btn-s dy-btn-noi dy-hit" data-dy="think">Ti penso</button></div>`;
  }
  // The wardrobe (D6, D7, D16): one thing on the head, one on the face or at the neck.
  function wardrobeMarkup(c, total) {
    const mine = lookOf(c.myRole), open = unlockedLook();
    const chip = (slot, item) => {
      const on = (slot === 'head' ? mine.head : mine.face) === item;
      const free = item === null || open.has(item);
      const preview = character(c.myRole, { size: 44, head: slot === 'head' ? item : mine.head, face: slot === 'face' ? item : mine.face, reaction: '' });
      const how = item === null ? 'Niente' : LOOK_NAMES[item];
      const lock = free ? '' : (LOOK_POINTS[item] ? `${LOOK_POINTS[item]} punti` : LOOK_MOMENTS[item]);
      return `<button type="button" class="dy-look-chip${free ? '' : ' is-locked'}" data-dy-look="${slot}:${item || ''}" aria-pressed="${on}"${free ? '' : ' aria-disabled="true"'} aria-label="${esc(free ? how : `${how}: si sblocca con ${lock}`)}"><span class="dy-stk">${preview}</span><span class="dy-look-name">${esc(how)}</span>${lock ? `<small>${esc(lock)}</small>` : ''}</button>`;
    };
    const next = Object.entries(LOOK_POINTS).filter(([k]) => !open.has(k)).sort((a, b) => a[1] - b[1])[0];
    let nextRow = '<div class="dy-look-next"><b>Hai sbloccato tutta la serie della Sintonia</b></div>';
    if (next) {
      const prev = Math.max(0, ...Object.values(LOOK_POINTS).filter((v) => v < next[1]));
      const pct = Math.max(0, Math.min(100, Math.round(((total - prev) / Math.max(1, next[1] - prev)) * 100)));
      const left = Math.max(0, next[1] - total);
      nextRow = `<div class="dy-look-next"><span class="dy-stk">${character(c.myRole, { size: 40, head: LOOK_HEAD.includes(next[0]) ? next[0] : mine.head, face: LOOK_FACE.includes(next[0]) ? next[0] : mine.face })}</span><span class="dy-look-next-copy"><b>${esc(`Prossimo: ${LOOK_NAMES[next[0]]}`)}</b><span>${esc(left === 1 ? 'manca 1 punto' : `mancano ${left} punti`)}</span><span class="dy-meter" role="progressbar" aria-label="${esc(`Verso ${LOOK_NAMES[next[0]]}`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span></span></div>`;
    }
    return `<div class="dy-points-title">Il tuo guardaroba</div>
      <div class="dy-look-row"><b class="dy-look-slot">In testa</b><div class="dy-look-chips">${[null, ...LOOK_HEAD].map((k) => chip('head', k)).join('')}</div></div>
      <div class="dy-look-row"><b class="dy-look-slot">Sul viso o al collo</b><div class="dy-look-chips">${[null, ...LOOK_FACE].map((k) => chip('face', k)).join('')}</div></div>
      <div class="dy-look-more"><button type="button" class="dy-btn dy-btn-s dy-btn-ghost" data-dy="shape">Cambia forma</button><button type="button" class="dy-btn dy-btn-s dy-btn-ghost" data-dy="color">Cambia colore</button></div>
      ${nextRow}`;
  }
  function levelOf(total) {
    if (typeof w.bondLevelInfo === 'function') return w.bondLevelInfo(total);
    return { level: 1, current: 0, needed: 200, progress: 0 };
  }
  const daysAgo = (at) => {
    const t = Date.parse(at);
    if (!Number.isFinite(t)) return '';
    const days = Math.round((dayNumber(todayISO()) * 86400000 - new Date(new Date(t).toISOString().slice(0, 10)).getTime()) / 86400000);
    if (days <= 0) return 'oggi';
    if (days === 1) return 'ieri';
    return w.UsResonance?.date?.(at) || '';
  };
  function voiDueMarkup() {
    const st = w.USProgression?.getState?.() || null;
    const total = Number(st?.total_xp) || 0;
    const info = levelOf(total);
    const left = Math.max(0, (Number(info.needed) || 0) - (Number(info.current) || 0));
    const pct = Math.max(0, Math.min(100, Number(info.progress) || 0));
    const streak = Math.max(0, Number(w.UsCosaDiOggi?.state?.streak) || Number(st?.rhythm_days) || 0);
    const todayOn = Boolean(w.UsCosaDiOggi?.state?.today?.counted ?? st?.rhythm_today);
    const filled = Math.min(7, streak);
    const lastOn = todayOn ? 6 : 5;
    const squares = Array.from({ length: 7 }, (_, i) => {
      const on = i <= lastOn && i > lastOn - filled;
      return `<i class="${on ? 'on' : ''}${i === 6 && !todayOn ? ' today' : ''}"></i>`;
    }).join('');
    const nextLevel = info.level + 1;
    const c = couple();
    const entries = (w.UsResonance?.entries?.() || []).slice(0, 3);
    const points = entries.length
      ? entries.map((e) => {
        const what = w.UsResonance?.what?.(e) || { title: '', detail: '' };
        const label = e.kind === 'milestone' ? what.title : (what.detail || what.title);
        return `<div class="dy-point"><b>+${Math.max(0, Number(e.xp) || 0)}</b><span${what.own ? ' translate="no"' : ''}>${esc(label)}</span><small>${esc(daysAgo(e.at))}</small></div>`;
      }).join('')
      : '<div class="dy-points-empty">Le sfide, gli eventi vissuti e i mesiversari arrivano qui.</div>';
    const streakWord = streak === 1 ? '1 giorno di fila' : `${streak} giorni di fila`;
    return `<div class="dy-scrim" data-dy="close"></div>
      <div class="dy-sheet" role="dialog" aria-modal="true" aria-labelledby="dyVoiDueTitle">
        <span class="dy-grab" aria-hidden="true"></span>
        <div class="dy-sheet-head"><h2 class="dy-sheet-title" id="dyVoiDueTitle">L’angolo <em>di noi</em></h2><button type="button" class="dy-ib dy-close" data-dy="close" aria-label="Chiudi"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        ${angoloDuo(c)}
        <div class="dy-angolo-level"><span class="dy-venn-level">Livello ${esc(info.level)}</span></div>
        <div class="dy-meter-head"><span>Sintonia</span><span>${esc(left === 1 ? `1 punto al livello ${nextLevel}` : `${left} punti al livello ${nextLevel}`)}</span></div>
        <div class="dy-meter" role="progressbar" aria-label="Sintonia verso il livello ${nextLevel}" aria-valuemin="0" aria-valuemax="${esc(info.needed)}" aria-valuenow="${esc(info.current)}"><i style="width:${pct}%"></i></div>
        <div class="dy-streak"><span class="dy-streak-copy"><b>${esc(streakWord)}</b><span>Basta una cosa al giorno, insieme</span></span><span class="dy-streak-days" aria-hidden="true">${squares}</span></div>
        ${moodMarkup(c)}
        ${wardrobeMarkup(c, total)}
        <div class="dy-points-title">Gli ultimi punti</div>
        ${points}
        <button type="button" class="dy-btn dy-btn-m dy-btn-ghost dy-sheet-more" data-dy="rewards">I premi che avete</button>
      </div>`;
  }
  // Come stai (founder, 15/11/2026): in «Voi due», on your character's face;
  // the twelve states and their words stay those of member-status.js.
  function moodMarkup(c) {
    const api = w.UsMemberStatus;
    const st = api?.widgetState?.();
    if (!api || st === undefined) return '';
    const word = (p) => (p?.status ? api.word(p.status, p.form) : '');
    const emoji = (p) => api.STATUSES?.find?.((s) => s.key === p?.status)?.emoji || '';
    const ago = (p) => { const at = Date.parse(p?.at || ''); return Number.isFinite(at) ? api.since(Date.now() - at) : ''; };
    const mine = st.me?.status ? `${emoji(st.me)} ${word(st.me)} · ${ago(st.me)}` : 'Non l’hai ancora detto';
    const theirs = st.partner?.status ? `${c.names[c.partnerRole]}: ${emoji(st.partner)} ${word(st.partner)} · ${ago(st.partner)}` : '';
    return `<div class="dy-mood"><span class="dy-stk">${character(c.myRole, { size: 46, mood: st.me?.status || '' })}</span><span class="dy-mood-copy"><b>Come stai</b><span>${esc(mine)}</span>${theirs ? `<span translate="no">${esc(theirs)}</span>` : ''}</span><button type="button" class="dy-btn dy-btn-s dy-btn-ghost dy-hit" data-dy="status">Cambia</button></div>`;
  }
  let opener = null;
  function openVoiDue() {
    const over = $('dyVoiDue');
    if (!over) return;
    opener = d.activeElement;
    over.classList.remove('is-closing');
    over.innerHTML = voiDueMarkup();
    over.hidden = false;
    d.body.classList.add('dy-sheet-open');
    over.querySelector('.dy-close')?.focus?.({ preventScroll: true });
    // Fresh points and streak, then paint again in place (without the entrance).
    Promise.allSettled([w.USProgression?.hydrate?.({ showUnlocks: false }), w.UsResonance?.hydrate?.(), w.UsCosaDiOggi?.refresh?.(), refreshLookUnlocks()]).then(() => paintVoiDue());
    try { w.history?.pushState?.({ ...(w.history.state || {}), usDiarioSheet: true }, ''); } catch (_) { /* no history */ }
  }
  function paintVoiDue() {
    const over = $('dyVoiDue');
    if (!over || over.hidden || over.classList.contains('is-closing')) return;
    const sheet = over.querySelector('.dy-sheet');
    const scroll = sheet?.scrollTop || 0;
    const tmp = d.createElement('div');
    tmp.innerHTML = voiDueMarkup();
    const next = tmp.querySelector('.dy-sheet');
    if (!sheet || !next) return;
    // The second paint keeps everything still: no entrance, same scroll.
    next.style.animation = 'none';
    next.querySelectorAll('.dy-venn circle,.dy-meter i').forEach((el) => { el.style.animation = 'none'; });
    sheet.replaceWith(next);
    next.scrollTop = scroll;
  }
  function closeVoiDue({ fromBack = false } = {}) {
    const over = $('dyVoiDue');
    if (!over || over.hidden) return false;
    const done = () => { over.hidden = true; over.innerHTML = ''; over.classList.remove('is-closing'); d.body.classList.remove('dy-sheet-open'); opener?.focus?.({ preventScroll: true }); };
    if (reduced()) done();
    else { over.classList.add('is-closing'); setTimeout(done, 240); }
    if (!fromBack) { try { if (w.history?.state?.usDiarioSheet) w.history.back(); } catch (_) { /* no history */ } }
    return true;
  }


  // ---------------------------------------------------------------- Ricordi: il vostro diario
  // Founder, 15/11/2026: Ricordi is the diary of your days. A day is its
  // number in italics and what it holds: the photos you added (rounded, with
  // the dot of who added it and the caption in your hand) and the question of
  // the day you both answered. Short quiet stretches between two days are
  // said once («Tre giorni tranquilli»). The filters dim the days of the other.
  let diary = null, diaryWho = 'tutti';
  const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const QUIET = ['', '', 'Due giorni tranquilli', 'Tre giorni tranquilli', 'Quattro giorni tranquilli', 'Cinque giorni tranquilli', 'Sei giorni tranquilli'];
  const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
  const wdShort = (iso) => { try { return new Date(`${iso}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short' }).replace('.', ''); } catch (_) { return ''; } };
  function paintChips() {
    const name = identity().partnerName || '';
    d.querySelectorAll('[data-dy-partner-name]').forEach((el) => { el.textContent = name || 'chi ami'; });
    d.querySelectorAll('#dyRicordiChips [data-dy-who]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dyWho === diaryWho)));
    $('dyDiary')?.setAttribute('data-who', diaryWho);
  }
  function photoMarkup(row, url, big) {
    const me = w.usProfile?.id;
    const who = row.created_by ? (row.created_by === me ? 'var(--us-tu)' : 'var(--us-partner)') : '';
    return `<button type="button" class="dy-pic${big ? ' is-big' : ''}" data-dy-moment="${esc(row.id)}" aria-label="${esc(row.caption || 'Un ricordo')}. Apri"><img src="${esc(url)}" alt="" loading="lazy" decoding="async">${who ? `<span class="dy-pic-who" style="--who:${who}" aria-hidden="true"></span>` : ''}</button>`;
  }
  function questionMarkup(k) {
    const line = (role, text) => (text ? `<span class="dy-dq-a"><span class="dy-hl" style="--c:var(--us-${role === 'francesco' ? 'rosa' : 'lilla'}-hl)" translate="no">${esc(text)}</span></span>` : '');
    return `<div class="dy-dq"><span class="dy-dq-q">${esc(k.question_text || '')}</span>${line('francesco', k.francesco_answer)}${line('beatrice', k.beatrice_answer)}</div>`;
  }
  function paintDiary(data) {
    if (data) diary = data;
    const root = $('dyDiary');
    if (!root || !diary) return;
    paintChips();
    const me = w.usProfile?.id;
    const urls = diary.urls instanceof Map ? diary.urls : new Map();
    const preview = (row) => {
      try { return (typeof w.ricordiPreviewUrl === 'function' ? w.ricordiPreviewUrl(row, urls) : '') || urls.get(row.thumbnail_path) || urls.get(row.storage_path) || ''; }
      catch (_) { return urls.get(row.storage_path) || ''; }
    };
    const days = new Map();
    const day = (iso) => { if (!days.has(iso)) days.set(iso, { iso, photos: [], kept: [] }); return days.get(iso); };
    for (const item of diary.timeline || []) {
      const row = item.moment;
      const iso = isoDay(item.date || row?.moment_date);
      if (row && iso && preview(row)) day(iso).photos.push(row);
    }
    for (const k of diary.kept || []) {
      const iso = isoDay(k.question_date);
      if (iso && (k.francesco_answer || k.beatrice_answer)) day(iso).kept.push(k);
    }
    const list = [...days.values()].sort((a, b) => b.iso.localeCompare(a.iso));
    if (!list.length) {
      const c0 = couple();
      root.innerHTML = `<div class="dy-empty-page"><span class="dy-empty-chars"><span class="dy-stk">${character(c0.myRole, { size: 56, mood: 'giu' })}</span><span class="dy-stk">${character(c0.partnerRole, { size: 60 })}</span></span><b>La prima pagina la scrivete voi</b><button type="button" class="dy-btn dy-btn-m" data-dy="add-moment">Aggiungi un ricordo</button></div>`;
      return;
    }
    const thisYear = todayISO().slice(0, 4);
    const out = [];
    let month = '';
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const key = it.iso.slice(0, 7);
      if (key !== month) {
        month = key;
        const pages = list.filter((x) => x.iso.startsWith(key)).length;
        const y = key.slice(0, 4);
        out.push(`<div class="dy-diary-month"><b>${MONTHS[+key.slice(5, 7) - 1]}</b><span>${y !== thisYear ? `${y} · ` : ''}${pages === 1 ? '1 pagina' : `${pages} pagine`}</span></div>`);
      }
      const authors = new Set(it.photos.map((p) => (p.created_by === me ? 'me' : 'partner')));
      const who = it.kept.length || authors.size !== 1 ? 'both' : [...authors][0];
      const [first, ...rest] = it.photos;
      const caption = String(it.photos.find((p) => String(p.caption || '').trim())?.caption || '').trim();
      const body = [
        first ? photoMarkup(first, preview(first), true) : '',
        rest.length ? `<div class="dy-pics">${rest.slice(0, 4).map((p) => photoMarkup(p, preview(p), false)).join('')}</div>` : '',
        caption ? `<div class="dy-diary-cap" translate="no">${esc(caption)}</div>` : '',
        it.kept.map(questionMarkup).join(''),
      ].join('');
      out.push(`<div class="dy-diary-day" data-who="${who}"><div class="dy-diary-date"><em>${+it.iso.slice(8)}</em><small>${esc(wdShort(it.iso))}</small></div><div class="dy-diary-body">${body}</div></div>`);
      // A short quiet stretch before the next (older) day of the same month.
      const next = list[i + 1];
      if (next && next.iso.slice(0, 7) === key) {
        const gap = dayNumber(it.iso) - dayNumber(next.iso) - 1;
        if (gap >= 2 && gap <= 6) {
          const fromIso = new Date((dayNumber(next.iso) + 1) * 86400000).toISOString().slice(0, 10);
          const toIso = new Date((dayNumber(it.iso) - 1) * 86400000).toISOString().slice(0, 10);
          out.push(`<div class="dy-diary-day is-quiet" data-who="both"><div class="dy-diary-date"><em>${+fromIso.slice(8)}–${+toIso.slice(8)}</em><small>${esc(wdShort(fromIso))}–${esc(wdShort(toIso))}</small></div><div class="dy-diary-body"><span class="dy-diary-quiet">${QUIET[gap]}</span></div></div>`);
        }
      }
    }
    root.innerHTML = out.join('');
  }
  // A photo opens in its album: the album viewer works from the grid card.
  function openMoment(id) {
    const card = [...d.querySelectorAll('#momentsGrid .moment-card[data-moment-id]')].find((c) => c.dataset.momentId === id);
    card?.click?.();
  }

  // ---------------------------------------------------------------- fogli
  // The pieces of the one sheet (mockup v5 «I fogli»), for the feature code
  // that owns each sheet: who did it (their character, small, like a
  // signature) and the stroke icons. Each feature keeps its own data.
  const ICONS = Object.freeze({
    x: 'M6 6l12 12M18 6L6 18', lock: 'M8 11V8.5a4 4 0 0 1 8 0V11 M6.5 11h11v8.5h-11z',
    keep: 'M7 3.5h10v17l-5-3.5-5 3.5z', diary: 'M5.2 4.6l12.4-1.4 1.9 16.4-12.4 1.4z M7 7.2l9.5-1.1 1 8.9-9.5 1.1z',
    text: 'M5 6.5h14 M5 11h14 M5 15.5h9', cam: 'M4 8h4l2-2.5h4L16 8h4v11H4z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    mic: 'M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z M6 11.5a6 6 0 0 0 12 0 M12 17.5v3',
    video: 'M3.5 7h12v10h-12z M15.5 10.5l5-3v9l-5-3',
    music: 'M9 17.5V5.5l10-2v12 M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
    pin: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z M12 11h.01', right: 'M9 5l7 7-7 7', left: 'M15 5l-7 7 7 7',
    arrow: 'M5 12h13M13 6l6 6-6 6', trash: 'M5 7h14 M9.5 7V4.5h5V7 M7 7l1 13h8l1-13', clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z M12 7.5V12l3 2',
    down: 'M12 4v11 M7.5 10.5l4.5 4.5 4.5-4.5 M5 19.5h14', plus: 'M12 5v14M5 12h14', bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z M10 20.5h4',
    note: 'M6 3.5h12v17H6z M9 8h6 M9 11.5h6 M9 15h3', heart: 'M12 20.5C5.5 16 3 12.6 3.6 9.2C4.3 5.4 8.9 4.6 12 8.4C15.1 4.6 19.7 5.4 20.4 9.2C21 12.6 18.5 16 12 20.5Z',
  });
  const icon = (name, cls = 'dy-f-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;
  // who: 'me' | 'partner' | a role.
  const roleOf = (who) => { const c = couple(); return who === 'me' ? c.myRole : who === 'partner' ? c.partnerRole : who; };
  function sign(who, mood, body, size = 30) {
    return `<div class="dy-f-sign"><span class="dy-stk">${character(roleOf(who), { size, mood })}</span>${body}</div>`;
  }
  // The characters a sheet carries in its markup ([data-dy-who="me|partner"],
  // data-dy-size, data-dy-mood), drawn each time the sheet opens.
  function paintPeople(root) {
    root?.querySelectorAll?.('[data-dy-who]').forEach((el) => {
      el.innerHTML = character(roleOf(el.dataset.dyWho), { size: Number(el.dataset.dySize) || 30, mood: el.dataset.dyMood || '' });
    });
  }
  function watchSheets() {
    if (typeof MutationObserver !== 'function' || !d.body) return;
    new MutationObserver((list) => list.forEach((m) => {
      const t = m.target;
      if (t.classList?.contains('dy-foglio') && t.getAttribute('aria-hidden') === 'false') paintPeople(t);
    })).observe(d.body, { attributes: true, attributeFilter: ['aria-hidden'], subtree: true });
  }
  // Drag the handle or the head down to close (founder, 16/11/2026): the sheet
  // follows the finger and, past 110 px or on a quick flick, closes with its
  // own close button, so every feature keeps its own closing.
  function dragToClose() {
    let drag = null;
    const panelOf = (el) => el?.closest?.('.dy-foglio-panel, .dy-over .dy-sheet');
    d.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !e.target.closest?.('.dy-grab, .dy-sheet-head') || e.target.closest('button, a, input, textarea, select')) return;
      const panel = panelOf(e.target);
      if (!panel || panel.scrollTop > 2) return;
      drag = { panel, id: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0 };
    });
    d.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      if (drag.dy > 4) drag.panel.classList.add('is-dragging');
      drag.panel.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { panel, dy, t } = drag;
      drag = null;
      panel.classList.remove('is-dragging');
      const flick = dy > 40 && dy / Math.max(1, e.timeStamp - t) > 0.6;
      if (e.type === 'pointerup' && (dy > 110 || flick)) {
        const close = panel.querySelector('.dy-close, [data-us-modal-close]');
        if (close) {
          close.click();
          // From where the finger left it, down; cleared once it is gone.
          // «Voi due» leaves with its own keyframe, which starts from here.
          if (!panel.classList.contains('dy-sheet')) {
            panel.style.transition = 'transform .2s cubic-bezier(.4,0,1,1)';
            panel.style.transform = 'translateY(100%)';
          }
          setTimeout(() => { panel.style.transition = ''; panel.style.transform = ''; }, 420);
          return;
        }
      }
      panel.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)';
      panel.style.transform = '';
      setTimeout(() => { panel.style.transition = ''; }, 220);
    };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
  }

  // ---------------------------------------------------------------- wiring
  function onClick(event) {
    const t = event.target;
    if (t.closest?.('#dyDuo')) { openVoiDue(); return; }
    if (t.closest?.('#dyPhoto')) {
      // La foto del giorno (20/11/2026): a tap opens its Ricordo; holding it
      // offers «Non mostrarla più in Oggi» (photoHold).
      if (photoHeld) { photoHeld = false; return; }
      w.UsOggiPhoto?.open?.();
      return;
    }
    const act = t.closest?.('[data-dy]')?.dataset?.dy;
    if (act === 'answer') { w.openToday?.(); return; }
    if (act === 'add-moment') { w.UsMomentComposer?.pick?.(); return; }
    const pic = t.closest?.('[data-dy-moment]');
    if (pic) { openMoment(pic.dataset.dyMoment); return; }
    const chip = t.closest?.('#dyRicordiChips [data-dy-who]');
    if (chip) { diaryWho = chip.dataset.dyWho; paintChips(); return; }
    const unlockAct = t.closest?.('[data-dy-unlock]')?.dataset?.dyUnlock;
    if (unlockAct) {
      const item = $('dyUnlock')?.dataset?.item;
      if (item) {
        unlockSeen(item);
        if (unlockAct === 'wear') { const now = lookOf(couple().myRole); saveLook(LOOK_HEAD.includes(item) ? { head: item, face: now.face } : { head: now.head, face: item }); }
        $('dyUnlock')?.remove();
        paintUnlock();
      }
      return;
    }
    if (act === 'close') closeVoiDue();
    if (act === 'peek') { peekOpen = !peekOpen; paintVoiDue(); return; }
    if (act === 'look-top') { $('dyVoiDue')?.querySelector?.('.dy-look-row')?.scrollIntoView?.({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); return; }
    if (act === 'think') { w.sendThinkSignal?.(); return; }
    if (act === 'shape' || act === 'color') { closeVoiDue(); setTimeout(() => w.UsSettingsPage?.action?.(act === 'shape' ? 'character-shape' : 'person-color'), 260); return; }
    const pick = t.closest?.('[data-dy-look]');
    if (pick) {
      if (pick.getAttribute('aria-disabled') === 'true') { w.toast?.(`Si sblocca con ${pick.querySelector('small')?.textContent || 'la Sintonia'}`); return; }
      const [slot, item] = String(pick.dataset.dyLook).split(':');
      const now = lookOf(couple().myRole);
      const next = slot === 'head' ? { head: item || null, face: now.face } : { head: now.head, face: item || null };
      Promise.resolve(saveLook(next)).then(() => paintVoiDue());
      return;
    }
    if (act === 'status') { closeVoiDue(); setTimeout(() => w.UsMemberStatus?.open?.('status'), 260); return; }
    // The collection of Sintonia (equip what you unlocked) until the accessories arrive.
    if (act === 'rewards') { closeVoiDue(); setTimeout(() => w.USNoiV2?.openSintonia?.(), 260); }
  }
  function paintOffline() {
    const more = $('dyMore');
    if (!more) return;
    let card = $('dyOffline');
    if (navigator.onLine !== false || !w.usProfile?.couple_id) { card?.remove(); return; }
    if (!card) { card = d.createElement('div'); card.id = 'dyOffline'; card.className = 'dy-offline'; card.setAttribute('role', 'status'); more.prepend(card); }
    const c = couple();
    card.innerHTML = `<span class="dy-stk">${character(c.myRole, { size: 40, mood: 'dorme' })}</span><span class="dy-stk">${character(c.partnerRole, { size: 44, mood: 'dorme' })}</span><span class="dy-offline-copy">Siete senza rete: quello che fate parte appena torna.</span>`;
  }
  // Personaggi, fase 3 (D16): something new in the wardrobe is shown on Oggi
  // the next time you open it, by your character, with a small festa and
  // «Mettilo». No push. The first time on this phone what is already open
  // counts as seen (no flood); several at once: the newest one, the rest seen.
  const seenKey = () => `us:look:seen:v1:${w.usProfile?.id || ''}`;
  const readSeen = () => { try { const v = JSON.parse(w.localStorage?.getItem?.(seenKey()) || 'null'); return Array.isArray(v) ? new Set(v) : null; } catch (_) { return null; } };
  const writeSeen = (set) => { try { w.localStorage?.setItem?.(seenKey(), JSON.stringify([...set])); } catch (_) { /* no storage */ } };
  function lookReady() { return Array.isArray(lookUnlocks) || Boolean(w.USProgression?.getState?.()); }
  function paintUnlock() {
    const more = $('dyMore');
    if (!more || !w.usProfile?.couple_id || !lookReady()) return;
    const open = unlockedLook();
    let seen = readSeen();
    if (!seen) { writeSeen(open); seen = open; }
    const fresh = [...open].filter((k) => !seen.has(k));
    let card = $('dyUnlock');
    if (!fresh.length) { card?.remove(); return; }
    // The newest: the highest threshold, a moment last.
    const pick = fresh.sort((x, y) => (LOOK_POINTS[y] ?? -1) - (LOOK_POINTS[x] ?? -1))[0];
    if (fresh.length > 1) { const all = new Set(seen); fresh.filter((k) => k !== pick).forEach((k) => all.add(k)); writeSeen(all); }
    const slot = LOOK_HEAD.includes(pick) ? 'head' : 'face';
    const c = couple(), mine = lookOf(c.myRole);
    if (!card) { card = d.createElement('div'); card.id = 'dyUnlock'; card.className = 'dy-unlock'; card.setAttribute('role', 'status'); more.prepend(card); }
    if (card.dataset.item === pick) return;
    card.dataset.item = pick;
    const how = LOOK_POINTS[pick] ? 'con la vostra Sintonia' : `per ${LOOK_MOMENTS[pick]}`;
    card.innerHTML = `<span class="dy-stk dy-unlock-char">${character(c.myRole, { size: 64, head: slot === 'head' ? pick : mine.head, face: slot === 'face' ? pick : mine.face, reaction: 'festa' })}</span><span class="dy-unlock-copy"><b>${esc(`Hai sbloccato: ${LOOK_NAMES[pick]}`)}</b><span>${esc(`Nuovo nel tuo guardaroba, ${how}`)}</span></span><span class="dy-unlock-acts"><button type="button" class="dy-btn dy-btn-s dy-btn-noi" data-dy-unlock="wear">Mettilo</button><button type="button" class="dy-btn dy-btn-s dy-btn-ghost" data-dy-unlock="later">Dopo</button></span>`;
    play(card, 'is-fresh', 700);
  }
  function unlockSeen(item) { const seen = readSeen() || new Set(); seen.add(item); writeSeen(seen); }
  function paintAll() {
    paintMe();
    paintOffline();
    paintUnlock();
    paintTitle();
    paintDuo();
    paintPhoto();
    paintQuestion();
  }
  // The paper is light: dark clock and icons on Android and iOS. Asked again
  // when US comes back, because the launch (splash, edge-to-edge) resets it.
  // Aspetto (founder, 15/11/2026): Automatico (the phone decides), Chiaro or Scuro, on this phone.
  const ASPETTO_KEY = 'us:aspetto';
  const darkQuery = w.matchMedia ? w.matchMedia('(prefers-color-scheme: dark)') : null;
  function aspetto() { try { const v = w.localStorage.getItem(ASPETTO_KEY); return v === 'chiaro' || v === 'scuro' ? v : 'auto'; } catch (_) { return 'auto'; } }
  function isDark() { const a = aspetto(); return a === 'scuro' || (a === 'auto' && Boolean(darkQuery?.matches)); }
  function applyAspetto() {
    const a = aspetto(), html = d.documentElement;
    if (a === 'auto') delete html.dataset.usAspetto; else html.dataset.usAspetto = a;
    d.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#1A1419' : '#FAF7F1');
    d.querySelector('meta[name="color-scheme"]')?.setAttribute('content', a === 'auto' ? 'light dark' : (isDark() ? 'dark' : 'light'));
    lightBars();
    w.dispatchEvent(new Event('us:aspetto-changed'));
  }
  function setAspetto(value) {
    try { if (value === 'chiaro' || value === 'scuro') w.localStorage.setItem(ASPETTO_KEY, value); else w.localStorage.removeItem(ASPETTO_KEY); } catch (_) { /* this load only */ }
    applyAspetto();
  }
  w.UsAspetto = Object.freeze({ get: aspetto, set: setAspetto, isDark });
  // Dark clock and icons on paper, light ones on the paper at night (Capacitor: «DARK» = light content).
  function lightBars() {
    try { const sbp = w.Capacitor?.isNativePlatform?.() && w.Capacitor?.Plugins?.SystemBars; if (sbp?.setStyle) Promise.resolve(sbp.setStyle({ style: isDark() ? 'DARK' : 'LIGHT' })).catch(() => {}); } catch (_) { /* web */ }
  }
  function boot() {
    applyAspetto();
    setTimeout(lightBars, 1200);
    darkQuery?.addEventListener?.('change', () => { if (aspetto() === 'auto') applyAspetto(); });
    d.addEventListener('click', onClick);
    dragToClose();
    watchSheets();
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVoiDue(); });
    w.addEventListener('popstate', () => closeVoiDue({ fromBack: true }));
    w.addEventListener('us:home-photo-changed', () => paintPhoto());
    w.addEventListener('online', paintOffline);
    w.addEventListener('offline', paintOffline);
    w.addEventListener('us:member-status-changed', () => { paintDuo(); paintVoiDue(); });
    w.addEventListener('us:countdown-updated', () => paintFrase(w.UsOggiPhoto?.current?.()?.meta || null));
    w.addEventListener('us-identity-change', () => { shownPath = null; lastQuestion = { id: null, mine: null, both: false, unread: false }; paintAll(); });
    d.addEventListener('visibilitychange', () => { if (d.visibilityState === 'visible') { lightBars(); paintTitle(); paintPhoto(); } });
    // The facts the sentence reads (distance, next commitment) arrive later.
    const watch = ['distanceWidget', 'usOggiNext'].map($).filter(Boolean);
    if (typeof MutationObserver === 'function' && watch.length) {
      const mo = new MutationObserver(() => paintFrase(w.UsOggiPhoto?.current?.()?.meta || null));
      watch.forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true }));
    }
    // The map of Ricordi takes the place of the diary while it is open.
    const map = $('ricordiMap');
    if (map && typeof MutationObserver === 'function') {
      const sync = () => {
        const open = map.hidden === false;
        $('dyDiary')?.toggleAttribute('hidden', open);
        $('dyRicordiChips')?.toggleAttribute('hidden', open);
        $('dyRicordiMap')?.setAttribute('aria-pressed', String(open));
      };
      new MutationObserver(sync).observe(map, { attributes: true, attributeFilter: ['hidden'] });
      sync();
    }
    // The profile and the couple arrive after boot: paint when they do.
    let tries = 0, countdownAsked = false;
    const wait = () => {
      paintAll();
      if ((!w.usProfile?.couple_id || !startedOn()) && tries++ < 40) setTimeout(wait, 500);
      else if (w.usProfile?.couple_id && !countdownAsked) { countdownAsked = true; Promise.resolve(w.USCountdown?.refresh?.()).catch(() => {}); }
    };
    wait();
    // A new day while US stays open.
    setInterval(() => { if (!d.hidden) { paintTitle(); paintDuo(); paintMe(); } }, 60000);
    w.addEventListener('us:think-updated', () => { paintDuo(); paintMe(); });
    w.addEventListener('us:progression-updated', () => paintUnlock());
    Promise.resolve(refreshLookUnlocks()).then(() => paintUnlock());
    goccia();
    heartHold();
    photoHold();
  }

  // ---------------------------------------------------------------- La barra a goccia (founder, 20/11/2026)
  // You, top right on every page: your character, the way to profile and Impostazioni.
  function paintMe() {
    const role = couple().myRole;
    d.querySelectorAll('[data-dy-me]').forEach((el) => { el.innerHTML = character(role, { size: 34, react: true }); });
  }
  // The bar is an svg, measured on the founder's reference video (20/11/2026,
  // frame by frame, straightened, in the points of its 375 pt iPhone, where
  // the bar is 50 like ours): a ball of 54 px
  // in the colour of the bar sits deep in a round cradle (centre 10.5 px under the
  // edge, 8.5 px of gap, soft shoulders), with the icon of the page inside. On a
  // new page (600 ms) the ball sinks in 140 ms, the cradle becomes a deep wave
  // (40 px) that runs fast to the new tab and slows down there, and the ball
  // rises out of it like a drop while the wave closes into a cradle around it;
  // then the icon comes back inside. The icons the wave crosses are cut by it.
  const BALL_R = 27, BALL_DEPTH = 10.5, BALL_GAP = 8.5, CRADLE_FILLET = 21;
  // The wave is steeper in front than behind.
  const WAVE_DEPTH = 39.5, WAVE_SIGMA = 21, WAVE_FRONT = 17, MOVE_MS = 600;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const inOut2 = (v) => (v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2);
  const lerpTable = (tab, p) => { let i = 1; while (i < tab.length - 1 && tab[i][0] < p) i++; const [p0, v0] = tab[i - 1], [p1, v1] = tab[i]; return v0 + (v1 - v0) * clamp01((p - p0) / (p1 - p0)); };
  // Read off the video (p = 0–1 of the move): how far the wave/ball has gone,
  // and how high the top of the ball is (px over the edge; positive = under it).
  const GOCCIA_GO = [[0, 0], [0.055, 0.02], [0.11, 0.058], [0.17, 0.149], [0.22, 0.286], [0.28, 0.41], [0.33, 0.54], [0.39, 0.63], [0.445, 0.7], [0.5, 0.77], [0.557, 0.815], [0.61, 0.86], [0.668, 0.9], [0.723, 0.935], [0.78, 0.955], [0.89, 0.985], [1, 1]];
  const GOCCIA_TOP = [[0, -16.5], [0.055, -10.5], [0.11, 9.5], [0.17, 31.5], [0.24, 53], [0.3, 53], [0.39, 29], [0.445, 16.5], [0.5, 6.5], [0.557, 0], [0.61, -4.5], [0.668, -7.5], [0.723, -10.5], [0.78, -12], [0.835, -13.5], [0.89, -14.5], [0.947, -15.5], [1, -16.5]];
  function gocciaPose(p) {
    const m = p < 0.4 ? inOut2(clamp01((p - 0.03) / 0.17)) : 1 - inOut2(clamp01((p - 0.6) / 0.12));
    const wide = 3 * clamp01((p - 0.33) / 0.17);
    return { f: lerpTable(GOCCIA_GO, p), cy: lerpTable(GOCCIA_TOP, p) + BALL_R, m, a: WAVE_DEPTH, sig: WAVE_SIGMA + wide, front: WAVE_FRONT + wide, dir: 1 };
  }
  // Depth below the edge of the round cradle (radius r + gap, centre BALL_DEPTH
  // under the edge) with soft shoulders where it meets the edge.
  function gocciaCradle(dx) {
    const c = BALL_R + BALL_GAP, f = CRADLE_FILLET, lift = -BALL_DEPTH;
    const s = Math.sqrt(Math.max(0, (c + f) ** 2 - (f + lift) ** 2));
    const a = Math.abs(dx);
    if (a >= s) return 0;
    const tx = s * c / (c + f);
    if (a > tx) return f - Math.sqrt(Math.max(0, f * f - (a - s) ** 2));
    return Math.sqrt(Math.max(0, c * c - a * a)) - lift;
  }
  const gocciaDepth = (dx, pose) => (1 - pose.m) * (pose.c ?? 1) * gocciaCradle(dx) + pose.m * pose.a * Math.exp(-0.5 * (dx / (dx * pose.dir > 0 ? pose.front : pose.sig)) ** 2);
  function goccia() {
    const nav = d.querySelector('.dy-nav'), svg = nav?.querySelector('.dy-nav-bg');
    if (!nav || !svg) return;
    const $ = (s) => svg.querySelectorAll(s);
    const REST = gocciaPose(1);
    const st = { x: null, from: 0, to: 0, t0: 0, p: 1, pose: REST, raf: 0, page: null };
    const up = () => parseFloat(getComputedStyle(nav).getPropertyValue('--dy-nav-svg-up')) || 34;
    const centre = (btn) => { const a = btn.getBoundingClientRect(), b = nav.getBoundingClientRect(); return a.left - b.left + a.width / 2; };
    function draw() {
      const W = nav.clientWidth, U = up(), H = nav.clientHeight + U;
      if (!W) return;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const x = st.x ?? W / 2, pose = st.pose;
      const n = (v) => +v.toFixed(2);
      let top = `M0 ${n(U + gocciaDepth(-x, pose))}`;
      for (let px = 2; px < W; px += 2) top += ` L${px} ${n(U + gocciaDepth(px - x, pose))}`;
      top += ` L${W} ${n(U + gocciaDepth(W - x, pose))}`;
      const body = `${top} L${W} ${H} L0 ${H} Z`;
      $('.dy-nav-edge').forEach((p) => p.setAttribute('d', top));
      $('.dy-nav-fill,.dy-nav-mfill').forEach((p) => p.setAttribute('d', body));
      const mr = svg.querySelector('.dy-nav-mrect');
      if (mr) { mr.setAttribute('x', -20); mr.setAttribute('y', -20); mr.setAttribute('width', W + 40); mr.setAttribute('height', H + 40); }
      // Sunk, the ball is hidden in the bar (same colour); risen, it floats.
      $('.dy-nav-ball,.dy-nav-ball-edge').forEach((c) => { c.setAttribute('cx', n(x)); c.setAttribute('cy', n(U + pose.cy)); c.setAttribute('r', BALL_R); });
      // The wave cuts the icons it crosses (they are part of the bar).
      const nb = nav.getBoundingClientRect();
      const moving = st.raf && st.p < 1;
      nav.querySelectorAll('button[data-page]:not(.active) .dy-nav-icon, .dy-nav .dy-think').forEach((el) => {
        const btn = el.closest('button'), bb = btn.getBoundingClientRect();
        // How deep the wave is under the icon (its middle and its sides).
        const cx = bb.left - nb.left + bb.width / 2, half = Math.min(18, el.getBoundingClientRect().width / 2);
        const dep = pose.m > 0.001 ? Math.max(...[-half, 0, half].map((o) => gocciaDepth(cx + o - x, pose))) : 0;
        let o = 1 - clamp01((dep - 12) / 20);
        // The icon you leave goes down inside the ball, then comes back in its place.
        if (moving && btn === st.prev) {
          if (st.p < 0.2) {
            el.style.translate = `${(x - cx).toFixed(1)}px ${(pose.cy - BALL_DEPTH + ballDy()).toFixed(1)}px`;
            o = 1 - clamp01((st.p - 0.1) / 0.07);
          } else { el.style.translate = ''; o *= clamp01((st.p - 0.3) / 0.15); }
        } else if (el.style.translate) el.style.translate = '';
        el.style.opacity = o < 0.99 ? o.toFixed(2) : '';
      });
      // The icon of the new page rises inside the drop and grows (as in the video).
      nav.querySelectorAll('button[data-page].active .dy-nav-icon').forEach((el) => {
        if (!moving) { el.style.translate = ''; el.style.scale = ''; el.style.opacity = ''; return; }
        const g = clamp01((st.p - 0.47) / 0.33), grow = 1 - (1 - g) ** 2;
        el.style.translate = `${(x - st.to).toFixed(1)}px ${(pose.cy - BALL_DEPTH).toFixed(1)}px`;
        el.style.scale = Math.max(0.01, grow).toFixed(3);
        el.style.opacity = g > 0 ? '1' : '0';
      });
    }
    const ballDy = () => parseFloat(nav.style.getPropertyValue('--dy-ball-dy')) || -16;
    // Where the icon of the page you are on goes: the centre of the ball.
    function place() {
      const any = [...nav.querySelectorAll('button[data-page]:not(.active) .dy-nav-icon')].find((el) => !el.style.translate);
      if (!any) return;
      const a = any.getBoundingClientRect(), b = nav.getBoundingClientRect();
      nav.style.setProperty('--dy-ball-dy', `${(BALL_DEPTH - (a.top - b.top + a.height / 2)).toFixed(1)}px`);
    }
    // Off the four pages (Impostazioni): no page is yours, so the ball sinks
    // and the cradle closes, the bar flat; back on a page, it rises there.
    const AWAY_MS = 280;
    const awayPose = (e) => ({ ...REST, c: 1 - e, cy: REST.cy + (lerpTable(GOCCIA_TOP, 0.3) + BALL_R - REST.cy) * e });
    function stepAway(now) {
      const e = inOut2(clamp01((now - st.t0) / AWAY_MS));
      st.pose = awayPose(e);
      draw();
      st.raf = e < 1 ? requestAnimationFrame(stepAway) : 0;
    }
    function step(now) {
      const p = Math.min(1, (now - st.t0) / MOVE_MS);
      st.p = p; st.pose = gocciaPose(p); st.pose.dir = Math.sign(st.to - st.from) || 1;
      // Rising back from a flat bar: the wave opens instead of appearing at once.
      if (st.rise0) st.pose.a *= clamp01((now - st.rise0) / 160);
      st.x = st.from + (st.to - st.from) * st.pose.f;
      if (p >= 1 && nav.classList.contains('is-moving')) nav.classList.remove('is-moving');
      draw();
      if (p >= 1) { st.x = st.to; st.pose = REST; st.rise0 = 0; draw(); st.raf = 0; return; }
      st.raf = requestAnimationFrame(step);
    }
    function go() {
      const on = nav.querySelector('button[data-page].active');
      place();
      if (!on) {
        if (st.away) return;
        st.away = true; st.page = null; st.rise0 = 0;
        if (nav.classList.contains('is-moving')) nav.classList.remove('is-moving');
        cancelAnimationFrame(st.raf); st.raf = 0; st.p = 1;
        if (st.x == null || reduced()) { st.x ??= nav.clientWidth / 2; st.pose = awayPose(1); draw(); return; }
        st.t0 = performance.now(); st.raf = requestAnimationFrame(stepAway);
        return;
      }
      const t = centre(on), page = on.dataset.page;
      if (st.away) {
        st.away = false; cancelAnimationFrame(st.raf); st.raf = 0;
        st.page = page; st.prev = null; st.x = st.from = st.to = t;
        if (reduced()) { st.p = 1; st.pose = REST; draw(); return; }
        // The ball comes up from the bar under the page, as at the end of a move.
        st.t0 = performance.now() - 0.3 * MOVE_MS; st.rise0 = performance.now();
        if (!nav.classList.contains('is-moving')) nav.classList.add('is-moving');
        st.raf = requestAnimationFrame(step);
        return;
      }
      if (st.x == null || reduced() || page === st.page && !st.raf) {
        cancelAnimationFrame(st.raf); st.raf = 0;
        st.x = st.from = st.to = t; st.p = 1; st.pose = REST; st.page = page;
        if (nav.classList.contains('is-moving')) nav.classList.remove('is-moving'); draw(); return;
      }
      if (page === st.page) return;
      // A second tap while it moves: if the ball is under, slide on from here.
      const under = st.raf && st.p > 0.15 && st.p < 0.6;
      st.prev = nav.querySelector(`button[data-page="${st.page}"]`); st.page = page; st.to = t;
      if (under) {
        // Keep the wave where it is: start from the point that puts it here at p = 0.2.
        const f0 = lerpTable(GOCCIA_GO, 0.2);
        st.from = (st.x - t * f0) / (1 - f0); st.t0 = performance.now() - 0.2 * MOVE_MS;
      } else { st.from = st.x; st.t0 = performance.now(); }
      if (!nav.classList.contains('is-moving')) nav.classList.add('is-moving');
      if (!st.raf) st.raf = requestAnimationFrame(step);
    }
    if (typeof MutationObserver === 'function') new MutationObserver(go).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
    w.addEventListener('resize', () => { st.x = null; st.away = false; go(); });
    go();
  }
  // Ti penso in the middle of the bar: hold it, the heart fills from below and
  // leaves when it is full (650 ms). A quick tap only says how; the keyboard
  // and screen readers (a click with no pointer) send at once.
  const HOLD_MS = 650;
  function heartHold() {
    const btn = $('thinkButton');
    if (!btn || btn.dataset.dyHold) return;
    btn.dataset.dyHold = '1';
    let timer = 0, hinted = 0;
    const stop = () => { clearTimeout(timer); btn.classList.remove('is-filling'); };
    const send = () => Promise.resolve(w.sendThinkSignal?.()).catch(() => false);
    btn.addEventListener('pointerdown', (e) => {
      if (btn.disabled || (e.button != null && e.button > 0)) return;
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* old WebView */ }
      btn.classList.remove('is-full');
      btn.classList.add('is-filling');
      timer = setTimeout(() => {
        btn.classList.remove('is-filling');
        btn.classList.add('is-full');
        send().finally(() => setTimeout(() => btn.classList.remove('is-full'), 900));
      }, HOLD_MS);
    });
    btn.addEventListener('pointerup', () => {
      if (!btn.classList.contains('is-filling')) return;
      stop();
      if (Date.now() - hinted < 4000) return;
      hinted = Date.now();
      const text = 'Tieni premuto il cuore per mandare un Ti penso';
      if ($('home')?.classList.contains('active') && $('dyToast')) notice(`${HEART}<span>${esc(text)}</span>`);
      else w.toast?.(text, { quiet: true });
    });
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => { if (e.detail === 0) send(); });
  }

  w.UsDiario = Object.freeze({ SHAPES: Object.keys(SHAPES), SHAPE_NAMES, shapeOf, slot, paintDiary, paintQuestion, paintVoiDue, thinkSent, openVoiDue, closeVoiDue, character, sentences, paintAll, sign, icon, paintPeople, roles: couple, reactionOf, lookOf, unlockedLook });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
