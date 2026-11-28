// Il vostro mese (founder, 27/11/2026; grill P1–P8, C1–C6, tavola «Il vostro
// mese» approvata). On the first of the month a pack with the cards of the
// month just ended (on 31 December a golden one with the best of the year):
// tear it, flip the cards one by one, the rare one last; then the fan, the
// cards one at a time, the sharing as a 9:16 carousel. The cards stay in
// Ricordi, «Le vostre carte»: an album a year, 12 places and the golden one.
// The server chooses the cards once for the couple and keeps only references
// (get_carte_v1, get_pacchetto_v1, apri_pacchetto_v1); what they show is read
// now, so a deleted memory turns its card off. Free. Vibration on, no sounds.
// Loaded the first time it is needed (ricordi-place.js), never at start.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.UsMese = api; api.install(); }
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const LOWER = MONTHS.map((m) => m.toLowerCase());
  const FILLERS = new Set(['numeri', 'posti', 'intesa']);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parts = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null; };
  const dayLabel = (iso) => { const p = parts(iso); return p ? `${p.d} ${LOWER[p.m - 1]}` : ''; };

  // Text that never meets the page's translator (SVG, canvas, labels): in the app's language now.
  const T = (text, vars) => (w && typeof w.usT === 'function' ? w.usT(text, vars) : String(text).replace(/\{(\w+)\}/g, (all, k) => (vars && k in vars ? vars[k] : all)));
  // The day for an SVG or a canvas: «9 ottobre».
  const dayText = (iso) => { const p = parts(iso); return p ? `${p.d} ${T(LOWER[p.m - 1])}` : ''; };

  // The period of a pack: «Novembre 2026» / «Il vostro 2026». The HTML keeps
  // the month in its own text, so the page's translator finds it.
  function period(pack) {
    const p = parts(pack?.period_start) || { y: new Date().getFullYear(), m: 1 };
    const gold = pack?.kind === 'anno';
    return {
      gold, year: p.y, month: p.m,
      short: gold ? `L’anno ${p.y}` : MONTHS[p.m - 1],
      lower: gold ? String(p.y) : LOWER[p.m - 1],
      titleHTML: gold ? `Il vostro ${p.y}` : `<span>${MONTHS[p.m - 1]}</span> ${p.y}`,
      ring: gold ? T('IL VOSTRO ANNO · {year} · IL VOSTRO ANNO · ', { year: p.y }) : T('IL VOSTRO MESE · {month} {year} · ', { month: T(MONTHS[p.m - 1]).toUpperCase(), year: p.y }),
      stamp: gold ? String(p.y) : `${T(MONTHS[p.m - 1])} · ${p.y}`
    };
  }
  // A size that keeps a long text inside its place: the base size up to
  // `chars` letters, then smaller, never under `min`.
  function fit(text, base, chars, min) {
    const n = String(text || '').length;
    return n <= chars ? base : Math.max(min, Math.round(base * chars / n));
  }
  const cardsLabel = (n) => (n === 1 ? '1 carta' : `${n} carte`);
  // What the server answers, made safe for the screens: real cards only, the rare one last.
  function normalize(pack) {
    const cards = (Array.isArray(pack?.cards) ? pack.cards : []).filter((c) => c && typeof c.k === 'string');
    return { ...pack, cards };
  }
  // The cards that go into the carousel: the ones still there.
  const shareable = (cards) => (cards || []).filter((c) => !c.gone);
  // Where a card can go on the board (the board's own sources), when it can.
  const pinOf = (card) => (card && !card.gone && card.pin && ['moment', 'conserva', 'keepsake'].includes(card.pin.source) ? card.pin : null);

  // ---- «Dove siete stati»: a real map (founder, 28/11/2026) -------------------
  // The countries of Natural Earth 1:110m (assets/data/mondo-110m-v1.json,
  // scripts/build-mondo-110m.mjs), loaded with this module only, never in the
  // precache. A plain projection (longitudes narrowed by the cosine of the middle
  // latitude), centred and zoomed on the month's places with a margin: from two
  // towns 15 km apart (at least ~550 km across: the 1:110m coast reads as a country) to the
  // other side of the world. The card is 240×360; the places live in MAP.
  const MAP = Object.freeze({ x0: 24, x1: 206, y0: 100, y1: 292 });
  const MIN_SPAN_DEG = 5;
  // The packed rings ([lon, lat] × q, then deltas) as points with their box.
  function decodeWorld(data) {
    const q = Number(data?.q) || 10;
    return (Array.isArray(data?.rings) ? data.rings : []).map((flat) => {
      const pts = [];
      let x = 0, y = 0, a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
      for (let i = 0; i + 1 < flat.length; i += 2) {
        x = i ? x + flat[i] : flat[0];
        y = i ? y + flat[i + 1] : flat[1];
        const lon = x / q, lat = y / q;
        pts.push([lon, lat]);
        if (lon < a) a = lon; if (lat < b) b = lat; if (lon > c) c = lon; if (lat > e) e = lat;
      }
      return { pts, box: [a, b, c, e] };
    });
  }
  const coord = (v, max) => { const n = v === null || v === undefined || v === '' ? NaN : Number(v); return Number.isFinite(n) && Math.abs(n) <= max ? n : null; };
  // Pure: where everything goes on the card. view: the projection (null without
  // coordinates); places in order of day, with x/y (null: no point, listed below).
  function mapLayout(places) {
    const list = (Array.isArray(places) ? places : []).slice(0, 4).map((p) => ({ label: String(p?.label || '').trim().slice(0, 18), nuovo: Boolean(p?.nuovo), lat: coord(p?.lat, 90), lon: coord(p?.lon, 180), x: null, y: null }));
    const geo = list.filter((p) => p.lat !== null && p.lon !== null);
    if (!geo.length) return { view: null, places: list, pins: [], missing: list.map((p) => p.label).filter(Boolean) };
    const lons = geo.map((p) => p.lon), lats = geo.map((p) => p.lat);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const lat0 = (minLat + maxLat) / 2, lonC = (minLon + maxLon) / 2;
    const k = Math.max(0.2, Math.cos(lat0 * Math.PI / 180));
    const spanX = Math.max(MIN_SPAN_DEG, (maxLon - minLon) * k * 1.3), spanY = Math.max(MIN_SPAN_DEG, (maxLat - minLat) * 1.3);
    const s = Math.min((MAP.x1 - MAP.x0) / spanX, (MAP.y1 - MAP.y0) / spanY);
    const cx = (MAP.x0 + MAP.x1) / 2, cy = (MAP.y0 + MAP.y1) / 2;
    const view = { lonC, lat0, k, s, cx, cy };
    const r1 = (v) => Math.round(v * 10) / 10;
    for (const p of geo) { p.x = r1(cx + (p.lon - lonC) * k * s); p.y = r1(cy - (p.lat - lat0) * s); }
    // The names in italics beside their point, never on top of each other.
    const named = geo.filter((p) => p.label).sort((a, b) => a.y - b.y);
    let last = -Infinity, lastNew = false;
    for (const p of named) {
      p.anchor = p.x > 140 ? 'end' : 'start';
      p.lx = r1(p.x + (p.anchor === 'end' ? -9 : 9));
      p.ly = r1(Math.max(p.y + 4, last + (lastNew ? 27 : 16)));
      last = p.ly; lastNew = p.nuovo;
    }
    // The characters as pins: the other person on the first place, me on the last.
    const first = geo[0], end = geo[geo.length - 1];
    let pa = first.x - 17, pb = end.x - 17;
    if (geo.length === 1 || Math.hypot(first.x - end.x, first.y - end.y) < 30) { pa = first.x - 34; pb = end.x; }
    const pins = [{ role: 'other', x: r1(pa), y: r1(first.y - 37) }, { role: 'me', x: r1(pb), y: r1(end.y - 37) }];
    return { view, places: list, pins, missing: list.filter((p) => p.x === null && p.label).map((p) => p.label) };
  }
  // Pure: the countries seen through a view, as one SVG path (the card only).
  function landPath(view, rings) {
    if (!view || !Array.isArray(rings) || !rings.length) return '';
    const { lonC, lat0, k, s, cx, cy } = view;
    const west = lonC - cx / (k * s), east = lonC + (240 - cx) / (k * s), north = lat0 + cy / s, south = lat0 - (360 - cy) / s;
    let out = '';
    for (const { pts, box } of rings) {
      if (box[2] < west || box[0] > east || box[3] < south || box[1] > north) continue;
      let px = NaN, py = NaN, plon = NaN, seg = '';
      for (const [lon, lat] of pts) {
        const x = Math.round((cx + (lon - lonC) * k * s) * 10) / 10, y = Math.round((cy - (lat - lat0) * s) * 10) / 10;
        if (seg && Math.abs(x - px) < 0.5 && Math.abs(y - py) < 0.5) continue;
        // Across the 180th meridian (Russia, Fiji, Antarctica): a new stroke, never a line over the world.
        seg += `${seg && Math.abs(lon - plon) <= 180 ? 'L' : 'M'}${x} ${y}`;
        px = x; py = y; plon = lon;
      }
      out += `${seg}Z`;
    }
    return out;
  }

  if (!w || !w.document) return Object.freeze({ MONTHS, period, fit, cardsLabel, normalize, shareable, pinOf, dayLabel, decodeWorld, mapLayout, landPath, MAP, install() {} });

  const d = w.document;
  const db = () => (typeof w.sb !== 'undefined' && w.sb) || (typeof sb !== 'undefined' ? sb : null); // eslint-disable-line no-undef
  const reduced = () => { try { return w.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  const toast = (text) => { try { w.toast?.(text); } catch (_) {} };
  const myRole = () => (w.usProfile?.role === 'beatrice' ? 'beatrice' : 'francesco');
  const otherRole = () => (myRole() === 'beatrice' ? 'francesco' : 'beatrice');
  const identity = () => { try { return w.UsIdentity?.current?.() || null; } catch (_) { return null; } };
  const partnerName = () => identity()?.partnerName || 'La tua persona';
  const nameOf = (role) => (role === myRole() ? 'Tu' : partnerName());
  // «9 ottobre» with the month in its own text (the translator finds it).
  const dayHTML = (iso) => { const p = parts(iso); return p ? `${p.d} <span>${LOWER[p.m - 1]}</span>` : ''; };
  // «10 carte» on its own, for the same reason.
  const cardsHTML = (n) => `<span>${esc(cardsLabel(n))}</span>`;

  // Vibration only, never a sound (P8): through the platform, when the person keeps haptics on.
  const HAPTIC = { tick: ['selection', [4]], open: ['medium', [12, 40, 20]], flip: ['light', [10]], rare: ['success', [20, 40, 30, 40, 60]], tremble: ['medium', [10, 60, 10, 60, 10]], toss: ['light', [6]], done: ['success', [10, 30, 10]] };
  function buzz(kind) {
    try {
      if (d.hidden || w.UsFeedback?.getPreferences?.()?.haptics === false) return;
      const [native, pattern] = HAPTIC[kind] || HAPTIC.flip;
      if (typeof w.UsPlatform?.haptic === 'function') w.UsPlatform.haptic(native, pattern);
      else w.navigator?.vibrate?.(pattern);
    } catch (_) {}
  }

  const who = (role, size, o = {}) => {
    const svg = role && w.UsPersonaggi?.character ? w.UsPersonaggi.character(role, { size, ...o }) : '';
    return `<span class="who">${svg}</span>`;
  };

  // ---------------------------------------------------------------- one card
  let uid = 0;
  function ring(text, inner, sub) {
    const id = `umr${++uid}`;
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><path id="${id}" d="M50 50 m-37 0 a37 37 0 1 1 74 0 a37 37 0 1 1 -74 0"/></defs><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="50" r="29" fill="none" stroke="currentColor" stroke-width="1"/><text font-family="Figtree, sans-serif" font-size="9.5" font-weight="800" fill="currentColor"><textPath href="#${id}" textLength="226" lengthAdjust="spacing">${esc(text)}</textPath></text><text x="50" y="${sub ? 50 : 55}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-size="${sub ? 14 : 16}" fill="currentColor">${esc(inner)}</text>${sub ? `<text x="50" y="63" text-anchor="middle" font-family="Figtree, sans-serif" font-size="7" font-weight="800" letter-spacing="1.5" fill="currentColor">${esc(sub)}</text>` : ''}</svg>`;
  }
  const TAGS = { foto: 'Una foto', qa: 'La domanda', lettera: 'Lasciato per te', prima: 'Una prima volta', scelta: 'Questo o quello', numeri: 'I vostri numeri', posti: 'Dove siete stati', intesa: 'L’intesa del mese' };
  // The countries, once per session (this module only; never in the precache).
  let world = null, worldLoading = null;
  function loadWorld() {
    if (world) return Promise.resolve(world);
    if (!worldLoading) {
      worldLoading = w.fetch('/assets/data/mondo-110m-v1.json')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`mondo ${r.status}`))))
        .then((data) => { world = decodeWorld(data); repaintMaps(); return world; })
        .catch((e) => { worldLoading = null; throw e; });
    }
    return worldLoading;
  }
  // Maps drawn before the countries arrived get them now.
  function repaintMaps() {
    d.querySelectorAll('.um-card svg[data-um-view]').forEach((svg) => {
      const path = svg.querySelector('[data-um-land]');
      if (!path || path.getAttribute('d')) return;
      try { path.setAttribute('d', landPath(JSON.parse(svg.dataset.umView), world)); } catch (_) { /* a broken view: no countries */ }
    });
  }
  const badgeOf = (card) => {
    const nuovi = Number(card.nuovi) || 0, count = Number(card.count) || (card.places || []).length;
    return nuovi ? (nuovi === 1 ? T('1 posto nuovo') : T('{n} posti nuovi', { n: nuovi })) : (count === 1 ? T('1 posto') : T('{n} posti', { n: count }));
  };
  // The card's map as one SVG (the card, the viewer and the 9:16 canvas): pink sea,
  // cream land, thin borders, the places as points joined in order of day, the
  // names in italics, the stamp. The pins (the characters) are mapLayout().pins.
  function placeMap(card, layout = mapLayout(card.places)) {
    const id = `umm${++uid}`;
    const L = layout;
    const serif = (size, color) => `font-family="Fraunces, Georgia, serif" font-style="italic" font-size="${size}" fill="${color}" stroke="#fbf5ef" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
    const geo = L.places.filter((p) => p.x !== null);
    const land = L.view ? `<path data-um-land="1" d="${world ? landPath(L.view, world) : ''}" fill="#efe1cd" stroke="#a88b7c" stroke-opacity=".55" stroke-width=".6" stroke-linejoin="round"/>` : '';
    const line = geo.length > 1 ? `<path d="M${geo.map((p) => `${p.x} ${p.y}`).join(' L ')}" fill="none" stroke="#b8432f" stroke-width="2.2" stroke-dasharray="1 6" stroke-linecap="round"/>` : '';
    const marks = geo.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#b8432f" stroke="#fff" stroke-width="2"/>`).join('');
    // Without coordinates the names keep the old places of the sheet, without points.
    const spots = [[30, 118], [30, 160], [30, 202], [30, 244]];
    const labels = L.places.filter((p) => p.label && (p.x !== null || !L.view)).map((p, i) => {
      const x = p.x !== null ? p.lx : spots[i][0], y = p.x !== null ? p.ly : spots[i][1], anchor = p.x !== null ? p.anchor : 'start';
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" ${serif(fit(p.label, 15, 11, 10), p.nuovo ? '#b8432f' : '#2c2030')}>${esc(p.label)}</text>${p.nuovo ? `<text x="${x}" y="${y + 11}" text-anchor="${anchor}" font-family="Figtree, sans-serif" font-weight="800" font-size="6.5" letter-spacing="1.5" fill="#b8432f" stroke="#fbf5ef" stroke-width="2.4" paint-order="stroke">${esc(T('LA PRIMA VOLTA'))}</text>` : ''}`;
    }).join('');
    const missing = L.view && L.missing.length ? `<text x="20" y="348" ${serif(10.5, '#75636b')}>${esc(T('Anche: {names}', { names: L.missing.join(', ') }))}</text>` : '';
    const badge = badgeOf(card).toUpperCase();
    const stamp = `<g transform="translate(20 ${L.missing.length && L.view ? 326 : 336}) rotate(-8)"><rect x="0" y="-11" width="${Math.round(badge.length * 6.1 + 14)}" height="17" rx="4" fill="#fbf5ef" fill-opacity=".85" stroke="#b8432f" stroke-width="1.4"/><text x="7" y="1.2" font-family="Figtree, sans-serif" font-weight="800" font-size="7.5" letter-spacing="1.3" fill="#b8432f">${esc(badge)}</text></g>`;
    const view = L.view ? ` data-um-view="${esc(JSON.stringify(L.view))}"` : '';
    return `<svg viewBox="0 0 240 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true"${view}><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf5ef"/><stop offset=".7" stop-color="#fbf5ef" stop-opacity=".85"/><stop offset="1" stop-color="#fbf5ef" stop-opacity="0"/></linearGradient></defs><rect width="240" height="360" fill="#f2dfe6"/>${land}<rect width="240" height="96" fill="url(#${id})"/>${line}${marks}${labels}${missing}${stamp}</svg>`;
  }
  // The numbers: the biggest one in the middle, the other two at the side.
  function numbersOf(card) {
    const all = [['thinks', Number(card.thinks) || 0, 'Ti penso', 'in un mese'], ['games', Number(card.games) || 0, 'Partite', 'giocate'], ['questions', Number(card.questions) || 0, 'Domande', 'a due']];
    const hero = all.slice().sort((a, b) => b[1] - a[1])[0];
    const minis = all.filter((x) => x !== hero).map((x) => [x[1], x[0] === 'thinks' ? 'Ti penso' : x[0] === 'games' ? 'partite' : 'domande a due']);
    return { hero, minis };
  }

  function cardHTML(card, pack, o = {}) {
    const per = period(pack);
    const total = (pack?.cards || []).length || 10;
    const n = String(card.n || 1).padStart(2, '0');
    const me = myRole(), other = otherRole();
    const k = card.k;
    const hd = `<div class="hd"><span class="no">N° ${n}</span><span>${esc(TAGS[k] || '')}</span></div><div class="month">${esc(per.stamp)}</div>`;
    let body = '';
    if (card.gone) body = '';
    else if (k === 'foto') {
      const place = String(card.place || '').trim();
      const day = dayText(card.date || card.day);
      const title = String(card.caption || '').trim() || place || T('Un ricordo');
      const stamp = place ? ring(`${place} · ${day} · ${place} · `.toUpperCase().slice(0, 48), place.slice(0, 11), day.toUpperCase()) : ring(`${day} · ${per.stamp} · `.toUpperCase(), day.split(' ')[0], (day.split(' ')[1] || '').toUpperCase());
      const photo = `<div class="full"><div class="photo">${card.path ? `<img alt="" data-um-path="${esc(card.path)}" decoding="async" draggable="false">` : ''}</div></div>`;
      if (card.rare) body = `${photo}<span class="stamp2">${stamp}</span><div class="rare-seal"><span><b>★</b>RARA</span></div><div class="plate"><b translate="no">${esc(title)}</b><span>Il momento del mese</span></div>`;
      else body = `${photo}<span class="stamp2">${stamp}</span><span class="peek">${who(card.by || me, 70)}</span><p class="ttl2" translate="no" style="font-size:${fit(title, 25, 34, 15)}px">${esc(title)}</p><span class="sub2">${dayHTML(card.date || card.day)}${place && card.caption ? ` · <span translate="no">${esc(place)}</span>` : ''}</span>`;
    } else if (k === 'qa') {
      const longest = Math.max(String(card.mine || '').length, String(card.theirs || '').length);
      body = `<span class="bigq" aria-hidden="true">?</span><p class="q2" style="--q:${fit(card.question, 23, 60, 15)}px">${esc(card.question)}</p><div class="chat" style="--a:${fit('x'.repeat(longest), 13.5, 70, 11)}px"><div class="msg">${who(me, 32)}<p translate="no">${esc(card.mine)}</p></div><div class="msg r">${who(other, 32)}<p translate="no">${esc(card.theirs)}</p></div></div>`;
    } else if (k === 'lettera') {
      const by = card.by || other;
      body = `<span class="quote" aria-hidden="true">“</span><p class="letter" translate="no" style="--q:${fit(card.body, 20, 90, 13)}px">${esc(card.body)}</p><span class="sign">${who(by, 44)}<span>da <span translate="no">${esc(nameOf(by))}</span></span></span>`;
    } else if (k === 'prima') {
      const day = dayText(card.day);
      body = `<span class="seal2">${ring(T('PRIMA VOLTA · PRIMA VOLTA · PRIMA VOLTA · '), day.split(' ')[0] || '', (day.split(' ')[1] || '').toUpperCase())}</span><span class="word3" translate="no" style="--w:${fit(card.title, 44, 10, 18)}px">${esc(card.title)}</span><span class="look">${who(me, 40)}${who(other, 40)}</span><p class="foot3">Una prima volta, segnata in Noi</p>`;
    } else if (k === 'scelta') {
      const g = fit(card.chosen, 118, 5, 34);
      body = `<p class="q2">${esc(card.question)}</p><span class="sit" style="--sit:${64 + Math.round(g * 0.86 * Math.min(3, Math.ceil(String(card.chosen || '').length * g * 0.5 / 250)))}px">${who(me, 48)}${who(other, 48)}</span><span class="giant" style="--g:${g}px">${esc(card.chosen)}</span><span class="strike">${esc(card.other)}</span><span class="both-tag">Tutti e due</span>`;
    } else if (k === 'numeri') {
      const { hero, minis } = numbersOf(card);
      body = `<p class="lab47">${esc(hero[2])}<small>${esc(hero[3])}</small></p><div class="minis">${minis.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div><span class="sit47">${who(me, 58)}</span><span class="giant47" style="--g:${fit(String(hero[1]), 236, 2, 120)}px">${esc(hero[1])}</span>`;
    } else if (k === 'posti') {
      const layout = mapLayout(card.places);
      if (layout.view && !world) loadWorld().catch(() => {});
      const pins = layout.pins.map((p) => `<span class="pin" style="left:${p.x}px;top:${p.y}px">${who(p.role === 'me' ? me : other, 34)}</span>`).join('');
      body = `<div class="map">${placeMap(card, layout)}</div><p class="q2">Dove siete stati</p>${pins}`;
    } else if (k === 'intesa') {
      const same = Number(card.same) || 0, all = Number(card.total) || 0;
      const close = all && same / all >= 0.6;
      body = `<span class="glow4"></span><span class="lead3">In Gioca avete scelto uguale</span><span class="word4">${esc(same)} su ${esc(all)}</span><span class="meta4">${close ? 'Vi conoscete bene' : 'Ancora da scoprire'}</span><span class="bigduo">${who(me, 112, close ? { reaction: 'cuore' } : {})}${who(other, 112, close ? { reaction: 'cuore' } : {})}</span>`;
    }
    const rareBits = card.rare && !card.gone ? `${k === 'foto' ? '' : '<div class="rare-seal"><span><b>★</b>RARA</span></div>'}<div class="goldframe"></div>` : '';
    const gone = card.gone ? '<div class="gone">Questo ricordo non c’è più</div>' : '';
    const back = `<div class="face back"><span class="bk-veil"></span><span class="bk-logo"></span><small class="bk-m">${esc(per.stamp)}</small></div>`;
    const label = card.gone ? T('Carta {n} di {total}: questo ricordo non c’è più', { n: card.n, total }) : T('Carta {n} di {total}: {what}', { n: card.n, total, what: T(card.rare ? 'la carta rara' : (TAGS[k] || 'una carta')) });
    return `<div class="um-card t-${esc(k)}${card.rare ? ' rare' : ''}${card.gone ? ' spenta' : ''}${o.up ? ' up' : ''}" data-um-n="${esc(card.n)}" role="img" aria-label="${esc(label)}"><div class="inner">${back}<div class="face front">${card.rare ? '' : hd}${body}${rareBits}${gone}</div></div></div>`;
  }

  // The photos of what is on screen, signed by the app's own media authority.
  async function paintPhotos(scope) {
    const imgs = [...(scope?.querySelectorAll?.('img[data-um-path]:not([src])') || [])];
    if (!imgs.length) return;
    let urls = new Map();
    try {
      if (typeof w.usGetSignedUrls === 'function') urls = await w.usGetSignedUrls(imgs.map((i) => i.dataset.umPath));
    } catch (_) {}
    for (const img of imgs) {
      const url = urls.get(img.dataset.umPath) || (typeof w.usGetSignedUrl === 'function' ? await w.usGetSignedUrl(img.dataset.umPath).catch(() => null) : null);
      if (!url || img.getAttribute('src')) continue;
      img.onerror = () => { img.onerror = null; w.usRecoverPrivateImage?.(img, img.dataset.umPath); };
      img.src = url;
    }
  }

  // ---------------------------------------------------------------- the overlay
  let el = null;
  const stack = [];
  const state = { pack: null, collection: null, year: null, box: null, idx: 0, opened: false, reelTimer: 0, toss: null };
  function install() {
    if (el || !d.body) return;
    el = d.createElement('div');
    el.id = 'usMese';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<section class="um-layer um-pack-l" data-um-l="pack" role="dialog" aria-modal="true" aria-label="Il vostro mese" hidden></section>'
      + '<section class="um-layer um-sheet-l" data-um-l="sheet" role="dialog" aria-modal="true" aria-label="Le carte del mese" hidden></section>'
      + '<section class="um-layer um-viewer-l" data-um-l="viewer" role="dialog" aria-modal="true" aria-label="Una carta alla volta" hidden></section>'
      + '<section class="um-layer um-share-l hide-answers hide-photos" data-um-l="share" role="dialog" aria-modal="true" aria-label="Condividi il mese" hidden></section>';
    d.body.appendChild(el);
    d.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); back(); }
      if (top() === 'viewer' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
    });
    w.addEventListener('resize', () => { if (isOpen()) fitStage(); });
  }
  const layer = (name) => el?.querySelector(`[data-um-l="${name}"]`);
  const top = () => stack[stack.length - 1] || null;
  const isOpen = () => Boolean(el?.classList.contains('open'));
  function push(name) {
    install();
    if (top() === name) return layer(name);
    const i = stack.indexOf(name);
    if (i >= 0) stack.splice(i, 1);
    stack.push(name);
    for (const s of ['pack', 'sheet', 'viewer', 'share']) { const l = layer(s); if (l) l.hidden = !stack.includes(s); }
    // The order on screen follows the stack.
    stack.forEach((s, k) => { const l = layer(s); if (l) l.style.zIndex = String(k + 1); });
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    d.documentElement.classList.add('us-mese-open');
    return layer(name);
  }
  function pop() {
    const name = stack.pop();
    if (name === 'share') clearInterval(state.reelTimer);
    const l = layer(name); if (l) { l.hidden = true; l.innerHTML = ''; }
    if (!stack.length) close();
    else layer(top())?.querySelector('button')?.focus?.({ preventScroll: true });
  }
  function close() {
    clearInterval(state.reelTimer);
    while (stack.length) { const l = layer(stack.pop()); if (l) { l.hidden = true; l.innerHTML = ''; } }
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    d.documentElement.classList.remove('us-mese-open');
    // The collection may have changed (a pack opened).
    if (state.box?.isConnected) showCollection(state.box, { quiet: true });
  }
  function back() { if (stack.length) pop(); }
  function fitStage() {
    const vw = w.innerWidth || 360, vh = w.innerHeight || 640;
    const s = Math.max(0.78, Math.min(vw / 360, vh / 640, 1.25));
    el?.style.setProperty('--um-fit', s.toFixed(3));
  }

  // ---------------------------------------------------------------- data
  async function rpc(name, args) {
    const client = db();
    if (!client) throw new Error('offline');
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  // With a places card, the countries come with the pack (a failure only leaves the map without them).
  async function loadPack(id) {
    const pack = normalize(await rpc('get_pacchetto_v1', { p_pack: id }));
    if (pack.cards.some((c) => c.k === 'posti' && !c.gone && mapLayout(c.places).view)) await loadWorld().catch(() => null);
    return pack;
  }

  // ---------------------------------------------------------------- 1. the pack
  async function openPack(id) {
    let pack;
    try { pack = await loadPack(id); } catch (e) { console.warn('[US Mese] pack', e); toast('Il pacchetto non si apre: controlla la connessione.'); return; }
    if (!pack?.id || !pack.cards.length) { toast('Questo pacchetto è vuoto.'); return; }
    state.pack = pack; state.opened = false;
    const l = push('pack');
    fitStage();
    paintPackScreen(l);
  }
  function paintPackScreen(l) {
    const pack = state.pack, per = period(pack), me = myRole(), other = otherRole();
    const total = pack.cards.length;
    const whoLine = pack.partner ? `<span class="pk-who">${w.UsPersonaggi?.character?.(other, { size: 22 }) || ''}<span>${pack.partner_opened ? `<span translate="no">${esc(partnerName())}</span> l’ha già aperto` : `<span translate="no">${esc(partnerName())}</span> non l’ha ancora aperto`}</span></span>` : '';
    l.innerHTML = `<button type="button" class="um-close" data-um="close" aria-label="Chiudi">×</button>
      <div class="um-stage">
        <div data-um-part="pack">
          <div class="pk-head"><small>${per.gold ? 'Il vostro anno' : 'Il vostro mese'}</small><b>${per.titleHTML}</b>${whoLine}</div>
          <div class="pack${per.gold ? ' gold' : ''}">
            <div class="body"><div class="crest"><div class="medal"><svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><defs><path id="umPackRing" d="M50 50 m-41 0 a41 41 0 1 1 82 0 a41 41 0 1 1 -82 0"/></defs><circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-width=".8"/><circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" stroke-width=".5"/><text font-family="Figtree, sans-serif" font-size="7" font-weight="800" fill="currentColor"><textPath href="#umPackRing" textLength="252" lengthAdjust="spacing">${esc(per.ring)}</textPath></text></svg><span class="logo"></span><span class="peek-l">${w.UsPersonaggi?.character?.(me, { size: 40 }) || ''}</span><span class="peek-r">${w.UsPersonaggi?.character?.(other, { size: 40 }) || ''}</span></div><b class="month-t" style="font-size:${fit(per.short, 36, 9, 24)}px">${esc(per.short)}</b><span class="meta-t">${per.gold ? `Le ${esc(total)} carte più belle` : `${cardsHTML(total)} · 1 rara`}</span></div></div>
            <div class="strip" data-um="strip" role="slider" tabindex="0" aria-label="Strappa per aprire" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div><span class="cut"></span>
          </div>
          <p class="hint-swipe"><span class="finger"></span>Trascina il dito lungo la linea</p>
          <div class="pk-open"><button class="um-link" type="button" data-um="open">Apri senza strappare</button></div>
        </div>
        <div data-um-part="pile" hidden><p class="count" data-um="count">1 / ${esc(total)}</p><div class="pile" data-um="pile"></div><p class="tap-hint" data-um="hint" aria-live="polite">Tocca la carta per girarla</p></div>
        <div class="finale" data-um-part="finale" hidden></div>
      </div>`;
    bindTear(l);
    l.querySelector('[data-um="close"]').onclick = () => back();
    l.querySelector('[data-um="open"]').onclick = () => openNow(l);
    setTimeout(() => l.querySelector('[data-um="strip"]')?.focus?.({ preventScroll: true }), 60);
  }
  function bindTear(l) {
    const pack = l.querySelector('.pack'), strip = l.querySelector('[data-um="strip"]');
    let tear = null;
    const setP = (p) => { pack.style.setProperty('--p', p.toFixed(3)); strip.setAttribute('aria-valuenow', String(Math.round(p * 100))); };
    const move = (e) => {
      if (!tear) return;
      const p = Math.max(0, Math.min(1, (e.clientX - tear.x0) / tear.w));
      if (p > tear.last) { if (Math.floor(p * 8) > Math.floor(tear.last * 8)) buzz('tick'); tear.last = p; setP(p); }
    };
    strip.onpointerdown = (e) => {
      if (state.opened) return;
      try { strip.setPointerCapture(e.pointerId); } catch (_) {}
      const r = strip.getBoundingClientRect();
      tear = { x0: r.left + r.width * 0.07, w: r.width * 0.86, last: 0 };
      move(e);
    };
    strip.onpointermove = move;
    const release = () => {
      if (!tear) return;
      const p = tear.last; tear = null;
      if (p > 0.82) { openNow(l); return; }
      // Stopped too early: the strip goes back down.
      const t0 = performance.now();
      const down = (t) => { const k = Math.min(1, (t - t0) / 260); setP(p * (1 - k * (2 - k))); if (k < 1) requestAnimationFrame(down); };
      requestAnimationFrame(down);
    };
    strip.onpointerup = release;
    strip.onpointercancel = release;
    strip.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); openNow(l); } };
  }
  async function openNow(l) {
    if (state.opened) return;
    state.opened = true;
    const pack = l.querySelector('.pack'), strip = l.querySelector('[data-um="strip"]');
    pack.style.setProperty('--p', '1');
    buzz('open');
    // Mine, on the server (once): the other person sees that I opened it.
    rpc('apri_pacchetto_v1', { p_pack: state.pack.id }).then(() => { state.pack.opened = true; }).catch((e) => console.warn('[US Mese] open', e));
    const calm = reduced();
    for (const sel of ['.hint-swipe', '.pk-open', '.cut']) { const x = l.querySelector(sel); if (x) x.style.opacity = '0'; }
    const a = strip.animate?.([{ transform: 'translateY(-5px) rotate(-5deg)' }, { transform: 'translate(150px, -140px) rotate(30deg)', opacity: 0 }], { duration: calm ? 1 : 520, easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'forwards' });
    await a?.finished?.catch?.(() => {});
    const b = pack.querySelector('.body').animate?.([{ transform: 'none' }, { transform: 'translateY(60px) scale(.96)', opacity: 0 }], { duration: calm ? 1 : 420, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    l.querySelector('[data-um-part="pile"]').hidden = false;
    buildPile(l);
    if (!calm) l.querySelectorAll('.pile .um-card').forEach((c, i, all) => c.animate?.([{ transform: 'translateY(-120px) scale(.7)', opacity: 0 }, { transform: c.style.transform || 'none', opacity: 1 }], { duration: 520, delay: 80 + (all.length - 1 - i) * 30, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'backwards' }));
    await b?.finished?.catch?.(() => {});
    const part = l.querySelector('[data-um-part="pack"]'); if (part) part.hidden = true;
  }

  // ---------------------------------------------------------------- the pile: flip, then toss
  let pile = [];
  function buildPile(l) {
    const box = l.querySelector('[data-um="pile"]');
    box.innerHTML = state.pack.cards.map((c) => cardHTML(c, state.pack)).join('');
    state.idx = 0;
    pile = [...box.querySelectorAll('.um-card')].map((node, i) => {
      node.classList.add('card');
      node.style.zIndex = String(100 - i);
      const off = Math.min(i, 4);
      node.style.transform = `translate(${off * 1.5}px, ${off * 3}px) rotate(${(i % 2 ? 1 : -1) * off * 0.6}deg)`;
      return { node, data: state.pack.cards[i], flipped: false };
    });
    paintPhotos(box);
    paintCount(l); bindTop(l);
  }
  const paintCount = (l) => { const c = l.querySelector('[data-um="count"]'); if (c) c.textContent = `${Math.min(state.idx + 1, pile.length)} / ${pile.length}`; };
  const hint = (l, text) => { const h = l.querySelector('[data-um="hint"]'); if (h) h.textContent = text; };
  function holo(node, e) {
    const r = node.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * 100, my = (e.clientY - r.top) / r.height * 100;
    const f = node.querySelector('.front');
    if (!f) return;
    f.style.setProperty('--mx', `${mx}%`); f.style.setProperty('--my', `${my}%`);
    f.style.setProperty('--hx', `${100 - mx}%`); f.style.setProperty('--hy', `${100 - my}%`);
    if (!reduced()) node.querySelector('.inner').style.transform = `rotateY(180deg) rotateX(${((my - 50) / -10).toFixed(2)}deg) rotateY(${((mx - 50) / -8).toFixed(2)}deg)`;
  }
  function bindTop(l) {
    const t = pile[state.idx]; if (!t) return;
    const node = t.node;
    node.style.transform = 'none';
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.focus?.({ preventScroll: true });
    if (t.data.rare && !t.flipped) {
      hint(l, 'C’è una carta rara…');
      if (!reduced()) node.animate?.([{ transform: 'rotate(0)' }, { transform: 'rotate(-2deg) scale(1.02)' }, { transform: 'rotate(2deg) scale(1.02)' }, { transform: 'rotate(0)' }], { duration: 420, iterations: 3, delay: 200 });
      if (!reduced()) node.querySelector('.back')?.animate?.([{ boxShadow: '0 0 0 2px #e9c27a, 0 0 0 0 rgba(233,194,122,0)' }, { boxShadow: '0 0 0 2px #e9c27a, 0 0 40px 10px rgba(233,194,122,.6)' }], { duration: 900, iterations: Infinity, direction: 'alternate' });
      buzz('tremble');
    } else hint(l, t.flipped ? 'Tocca o lancia per la prossima' : 'Tocca la carta per girarla');
    let drag = null;
    node.onpointerdown = (e) => { try { node.setPointerCapture(e.pointerId); } catch (_) {} drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; };
    node.onpointermove = (e) => {
      if (t.data.rare && t.flipped) holo(node, e);
      if (!drag || !t.flipped) return;
      drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y;
      if (Math.hypot(drag.dx, drag.dy) > 6) node.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 14}deg)`;
    };
    node.onpointerup = () => {
      const g = drag; drag = null; if (!g) return;
      const dist = Math.hypot(g.dx, g.dy);
      if (!t.flipped) { if (dist < 12) flip(l, t); return; }
      if (dist < 12 || dist > 70) toss(l, t, dist < 12 ? null : g);
      else node.animate?.([{ transform: node.style.transform }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      if (dist >= 12 && dist <= 70) node.style.transform = 'none';
    };
    node.onpointercancel = () => { drag = null; node.style.transform = 'none'; };
    node.onpointerleave = () => { if (t.data.rare && t.flipped && !drag) node.querySelector('.inner').style.transform = 'rotateY(180deg)'; };
    node.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!t.flipped) flip(l, t); else toss(l, t, null); } };
  }
  function flip(l, t) {
    t.flipped = true;
    const inner = t.node.querySelector('.inner'), calm = reduced(), rare = t.data.rare;
    t.node.querySelector('.back')?.getAnimations?.().forEach((a) => a.cancel());
    inner.animate?.([{ transform: 'rotateY(0) translateZ(0)' }, { transform: 'rotateY(90deg) translateZ(40px)', offset: 0.5 }, { transform: 'rotateY(180deg)' }], { duration: calm ? 1 : rare ? 900 : 520, easing: 'cubic-bezier(.3,.1,.2,1)' });
    inner.style.transform = 'rotateY(180deg)';
    buzz(rare ? 'rare' : 'flip');
    if (rare && !calm) goldBurst(l);
    hint(l, rare ? 'Muovi il dito sopra la carta' : 'Tocca o lancia per la prossima');
  }
  function goldBurst(l) {
    const box = l.querySelector('[data-um="pile"]');
    for (let i = 0; i < 26; i += 1) {
      const s = d.createElement('span');
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 140, size = 4 + Math.random() * 5;
      s.style.cssText = `position:absolute;left:-4px;top:170px;width:${size}px;height:${size}px;border-radius:50%;background:${i % 3 ? '#e9c27a' : '#fff0c4'};z-index:200;pointer-events:none`;
      box.appendChild(s);
      const an = s.animate?.([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v}px) scale(.3)`, opacity: 0 }], { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(.1,.7,.3,1)' });
      if (an) an.onfinish = () => s.remove(); else s.remove();
    }
  }
  function toss(l, t, g) {
    const node = t.node, dir = g ? Math.sign(g.dx || 1) : (state.idx % 2 ? 1 : -1);
    const tx = g ? g.dx * 4 : dir * 360, ty = g ? g.dy * 4 - 40 : -80;
    node.onpointerdown = node.onpointermove = node.onpointerup = node.onkeydown = null;
    node.tabIndex = -1;
    buzz('toss');
    const an = node.animate?.([{ transform: node.style.transform || 'none', opacity: 1 }, { transform: `translate(${tx}px, ${ty}px) rotate(${dir * 30}deg)`, opacity: 0 }], { duration: reduced() ? 1 : 420, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
    const hide = () => { node.style.visibility = 'hidden'; };
    if (an) an.onfinish = hide; else hide();
    state.idx += 1; paintCount(l);
    if (state.idx >= pile.length) { setTimeout(() => finale(l), reduced() ? 0 : 380); return; }
    bindTop(l);
  }
  function fan(target, cards, pack, onTap, spread = 50) {
    target.innerHTML = '';
    const n = cards.length;
    cards.forEach((c, i) => {
      const m = d.createElement('button');
      m.type = 'button'; m.className = 'mini';
      m.setAttribute('aria-label', T('Guarda la carta {n}', { n: c.n }));
      m.innerHTML = cardHTML(c, pack, { up: true });
      const ang = n > 1 ? -spread / 2 + spread * (i / (n - 1)) : 0;
      m.style.transform = `rotate(${ang}deg)`; m.style.zIndex = String(i);
      m.onclick = () => onTap(i);
      target.appendChild(m);
      if (!reduced()) m.animate?.([{ transform: 'rotate(0deg) translateY(30px)', opacity: 0 }, { transform: `rotate(${ang}deg)`, opacity: 1 }], { duration: 560, delay: i * 45, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'backwards' });
    });
    paintPhotos(target);
  }
  function finale(l) {
    const pack = state.pack, per = period(pack);
    const part = l.querySelector('[data-um-part="finale"]');
    l.querySelector('[data-um-part="pile"]').hidden = true;
    part.hidden = false;
    part.innerHTML = `<h2>Il vostro ${esc(per.lower)}</h2><p class="sub">${cardsHTML(pack.cards.length)} · nella collezione in Ricordi</p><div class="fan" data-um="fan"></div><p class="fan-hint">Tocca una carta</p>
      <div class="actions"><button class="um-btn main" type="button" data-um="share">Condividi il mese</button><div class="um-row"><button class="um-btn soft" type="button" data-um="album">Collezione</button><button class="um-btn soft" type="button" data-um="again">Riapri</button></div></div>`;
    fan(part.querySelector('[data-um="fan"]'), pack.cards, pack, (i) => openViewer(i));
    buzz('done');
    part.querySelector('[data-um="share"]').onclick = () => openShare();
    part.querySelector('[data-um="album"]').onclick = () => { close(); w.usOpenCarte?.(); };
    part.querySelector('[data-um="again"]').onclick = () => { state.opened = false; paintPackScreen(l); };
    part.querySelector('[data-um="share"]').focus?.({ preventScroll: true });
  }

  // ---------------------------------------------------------------- the month, from the collection
  async function openMonth(id) {
    let pack;
    try { pack = await loadPack(id); } catch (e) { console.warn('[US Mese] month', e); toast('Le carte non si aprono: controlla la connessione.'); return; }
    if (!pack?.id) return;
    state.pack = pack;
    const l = push('sheet');
    fitStage();
    const per = period(pack);
    const sub = !pack.partner ? T('Le vostre carte') : pack.partner_opened ? T('Aperto da tutti e due') : T('Tu l’hai aperto · {name} non ancora', { name: partnerName() });
    const gone = pack.cards.some((c) => c.gone);
    l.innerHTML = `<button type="button" class="um-close" data-um="close" aria-label="Chiudi">×</button><header><b>${per.titleHTML}</b><p>${esc(sub)}${gone ? ` · ${esc(T('una carta è di un ricordo che non c’è più'))}` : ''}</p></header>
      <div class="um-stage"><div class="fan" data-um="fan" style="top:220px"></div><p class="fan-hint" style="top:428px">Tocca una carta</p><div class="actions"><button class="um-btn main" type="button" data-um="share">Condividi il mese</button></div></div>`;
    l.querySelector('[data-um="close"]').onclick = () => back();
    l.querySelector('[data-um="share"]').onclick = () => openShare();
    fan(l.querySelector('[data-um="fan"]'), pack.cards, pack, (i) => openViewer(i), 52);
  }

  // ---------------------------------------------------------------- the viewer, one card at a time
  function openViewer(index) {
    const l = push('viewer');
    state.idx = Math.max(0, Math.min(index, state.pack.cards.length - 1));
    l.innerHTML = `<div class="um-vtop"><span data-um="vcount" aria-live="polite"></span></div><button type="button" class="um-close" data-um="close" aria-label="Chiudi">×</button>
      <div class="um-vstage" data-um="vstage"><button type="button" class="um-vnav prev" data-um="prev" aria-label="Carta precedente">‹</button><div class="um-vbox" data-um="vbox"></div><button type="button" class="um-vnav next" data-um="next" aria-label="Carta successiva">›</button></div>
      <div class="um-vacts" data-um="vacts"></div>`;
    l.querySelector('[data-um="close"]').onclick = () => back();
    l.querySelector('[data-um="prev"]').onclick = () => step(-1);
    l.querySelector('[data-um="next"]').onclick = () => step(1);
    bindSwipe(l);
    paintViewer(l);
    l.querySelector('[data-um="close"]').focus?.({ preventScroll: true });
  }
  function viewerScale(l) {
    const st = l.querySelector('[data-um="vstage"]');
    const W = st?.clientWidth || w.innerWidth || 360, H = st?.clientHeight || (w.innerHeight || 640) - 220;
    return Math.max(0.6, Math.min((W - 72) / 240, (H - 8) / 360, 1.6));
  }
  function paintViewer(l, from = 0) {
    const cards = state.pack.cards, card = cards[state.idx];
    const s = viewerScale(l);
    const box = l.querySelector('[data-um="vbox"]');
    box.style.width = `${Math.round(240 * s)}px`; box.style.height = `${Math.round(360 * s)}px`;
    box.innerHTML = cardHTML(card, state.pack, { up: true });
    const node = box.querySelector('.um-card');
    node.style.transform = `scale(${s.toFixed(3)})`;
    paintPhotos(box);
    l.querySelector('[data-um="vcount"]').textContent = `${state.idx + 1} / ${cards.length}`;
    l.querySelector('[data-um="prev"]').disabled = state.idx === 0;
    l.querySelector('[data-um="next"]').disabled = state.idx === cards.length - 1;
    const pin = pinOf(card);
    const acts = l.querySelector('[data-um="vacts"]');
    acts.innerHTML = card.gone ? '<p class="share-note">Questo ricordo non c’è più</p>'
      : `${pin ? `<button class="um-btn main" type="button" data-um="pin"${card.pinned ? ' disabled' : ''}>${card.pinned ? 'Già in bacheca' : 'Metti in bacheca'}</button>` : ''}<button class="um-btn ${pin ? 'soft' : 'main'}" type="button" data-um="save">Salva come immagine</button>`;
    const pinBtn = acts.querySelector('[data-um="pin"]');
    if (pinBtn) pinBtn.onclick = () => pinCard(card, pinBtn);
    const save = acts.querySelector('[data-um="save"]');
    if (save) save.onclick = () => saveCard(card, save);
    if (from && !reduced()) box.animate?.([{ transform: `translateX(${from * 60}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)' });
  }
  function step(dir) {
    const l = layer('viewer'); if (!l || l.hidden) return;
    const next = state.idx + dir;
    if (next < 0 || next >= state.pack.cards.length) return;
    state.idx = next;
    buzz('tick');
    paintViewer(l, dir);
  }
  function bindSwipe(l) {
    const st = l.querySelector('[data-um="vstage"]');
    let g = null;
    st.onpointerdown = (e) => { if (e.target.closest('button')) return; g = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId }; };
    st.onpointermove = (e) => {
      const card = state.pack.cards[state.idx];
      const node = st.querySelector('.um-card');
      if (card?.rare && !card.gone && node) {
        // The shine follows the finger on the rare card.
        const r = node.getBoundingClientRect();
        const mx = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), my = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
        const f = node.querySelector('.front');
        f?.style.setProperty('--mx', `${mx}%`); f?.style.setProperty('--my', `${my}%`); f?.style.setProperty('--hx', `${100 - mx}%`); f?.style.setProperty('--hy', `${100 - my}%`);
      }
      if (!g) return;
      g.dx = e.clientX - g.x;
      if (Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(e.clientY - g.y)) {
        try { st.setPointerCapture(g.id); } catch (_) {}
        const box = st.querySelector('[data-um="vbox"]');
        box.style.transform = `translateX(${g.dx}px) rotate(${g.dx / 30}deg)`;
      }
    };
    const end = () => {
      if (!g) return;
      const dx = g.dx; g = null;
      const box = st.querySelector('[data-um="vbox"]');
      box.style.transform = '';
      if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
    };
    st.onpointerup = end; st.onpointercancel = end;
  }
  async function pinCard(card, btn) {
    const pin = pinOf(card); if (!pin) return;
    btn.disabled = true;
    let res = 'no';
    try {
      if (w.UsBacheca?.pinThing) res = await w.UsBacheca.pinThing({ source: pin.source, id: pin.id, title: card.caption || TAGS[card.k] });
      else {
        res = await rpc('bacheca_pin_v1', { p_source: pin.source, p_source_id: pin.id });
        toast(res === 'pinned' ? 'Appesa in bacheca ♡' : res === 'already' ? 'È già in bacheca' : res === 'full' ? 'La bacheca è piena: fai spazio dalla bacheca' : 'Non riesco ad appenderla. Riprova.');
      }
    } catch (e) { console.warn('[US Mese] pin', e); toast('Non riesco ad appenderla. Riprova.'); }
    if (res === 'pinned' || res === 'already') { card.pinned = true; btn.textContent = T('Già in bacheca'); return; }
    // A full board: the board opens to make room (bacheca.js), over here.
    if (res === 'full' && w.UsBacheca?.pinThing) { close(); return; }
    btn.disabled = false;
  }

  // ---------------------------------------------------------------- sharing (P5, P6)
  function openShare() {
    const pack = state.pack, per = period(pack);
    const cards = shareable(pack.cards);
    const l = push('share');
    l.classList.add('hide-answers', 'hide-photos');
    const vw = w.innerWidth || 360, vh = w.innerHeight || 640;
    const rw = Math.max(180, Math.min(300, vw - 64, (vh - 330) * 9 / 16));
    l.style.setProperty('--rw', `${Math.round(rw)}px`);
    const me = myRole(), other = otherRole();
    l.innerHTML = `<button type="button" class="um-close" data-um="close" aria-label="Chiudi">×</button><h2>Condividi il mese</h2>
      <div class="reel" data-um="reel" aria-hidden="true"><div class="dots" data-um="dots"></div><div class="slide on cover"><div class="cover"><span class="lg${per.gold ? ' gold' : ''}"></span><span class="duo">${who(me, 56)}${who(other, 56)}</span><b>${per.gold ? `Il nostro ${esc(per.year)}` : `Il nostro<br>${esc(per.lower)}`}</b><span class="cnt">${cardsHTML(cards.length)} · 1 rara</span></div></div>${cards.map((c) => `<div class="slide">${cardHTML(c, pack, { up: true })}</div>`).join('')}<span class="wm" translate="no">US · uscouple.app</span></div>
      <div class="share-ctl">
        <label class="sw"><span>Mostra le foto</span><input type="checkbox" data-um="photos"></label>
        <label class="sw"><span>Mostra le risposte</span><input type="checkbox" data-um="answers"></label>
        <button class="um-btn main" type="button" data-um="go">Condividi su TikTok</button>
        <p class="share-note">${esc(T('{n} immagini 9:16, una per carta più la copertina', { n: cards.length + 1 }))}</p>
      </div>`;
    l.querySelector('[data-um="close"]').onclick = () => back();
    const reel = l.querySelector('[data-um="reel"]');
    const slides = [...reel.querySelectorAll('.slide')];
    l.querySelector('[data-um="dots"]').innerHTML = slides.map(() => '<i></i>').join('');
    paintPhotos(reel);
    let cur = 0;
    const paint = () => { slides.forEach((s, i) => s.classList.toggle('on', i === cur)); [...l.querySelectorAll('[data-um="dots"] i')].forEach((x, i) => x.classList.toggle('done', i <= cur)); };
    paint();
    clearInterval(state.reelTimer);
    state.reelTimer = setInterval(() => { if (!l.isConnected || l.hidden) { clearInterval(state.reelTimer); return; } cur = (cur + 1) % slides.length; paint(); }, 1600);
    l.querySelector('[data-um="photos"]').onchange = (e) => l.classList.toggle('hide-photos', !e.target.checked);
    l.querySelector('[data-um="answers"]').onchange = (e) => l.classList.toggle('hide-answers', !e.target.checked);
    const go = l.querySelector('[data-um="go"]');
    go.onclick = async () => {
      go.disabled = true;
      const label = go.textContent;
      go.textContent = T('Preparo le immagini…');
      try {
        const opts = { photos: l.querySelector('[data-um="photos"]').checked, answers: l.querySelector('[data-um="answers"]').checked };
        const files = await renderShare(pack, cards, opts);
        const out = await shareFiles(files, T('Il nostro {month}', { month: per.lower }));
        if (out === 'downloaded') toast(T('Immagini salvate'));
        if (out === 'unsupported') toast(T('Per condividere le immagini serve la nuova versione di US'));
      } catch (e) { console.warn('[US Mese] share', e); toast('Non riesco a preparare le immagini. Riprova.'); }
      go.disabled = false; go.textContent = label;
    };
  }

  // ---- canvas: 1080×1920, the watermark on every image -------------------
  const W = 1080, H = 1920;
  const imgCache = new Map();
  function loadImg(src) {
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise((resolve) => { const i = new Image(); i.decoding = 'async'; i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
    imgCache.set(src, p);
    return p;
  }
  const cssVar = (name, fallback) => { try { return getComputedStyle(d.documentElement).getPropertyValue(name).trim() || fallback; } catch (_) { return fallback; } };
  function charImg(role, o = {}) {
    if (!w.UsPersonaggi?.character) return Promise.resolve(null);
    const color = cssVar(role === 'beatrice' ? '--us-lilla' : '--us-rosa', role === 'beatrice' ? '#a98bff' : '#ff7c96');
    let svg = w.UsPersonaggi.character(role, { size: 216, color, ...o });
    svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/currentColor/g, '#2c2030');
    return loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  // A private photo for the canvas: fetched by its signed URL into a blob
  // (CORS), so the canvas stays clean; on any failure, no photo.
  async function photoImg(path) {
    if (!path) return null;
    try {
      const url = typeof w.usGetSignedUrl === 'function' ? await w.usGetSignedUrl(path) : null;
      if (!url) return null;
      const res = await fetch(url, { credentials: 'omit', mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
      const obj = URL.createObjectURL(blob);
      const img = await loadImg(obj);
      return img;
    } catch (_) { return null; }
  }
  function rr(ctx, x, y, w2, h2, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w2, y, x + w2, y + h2, r); ctx.arcTo(x + w2, y + h2, x, y + h2, r); ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w2, y, r); ctx.closePath(); }
  function lines(ctx, text, max, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const out = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= max || !line) line = test;
      else { out.push(line); line = word; }
      if (out.length === maxLines) break;
    }
    if (out.length < maxLines && line) out.push(line);
    if (out.length === maxLines && words.join(' ').length > out.join(' ').length) {
      let last = out[maxLines - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
      out[maxLines - 1] = `${last.replace(/\s+$/, '')}…`;
    }
    return out;
  }
  function text(ctx, str, x, y, font, color, o = {}) {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    if (o.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${o.spacing}px`;
    ctx.fillText(str, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  function cover(ctx, img, x, y, w2, h2, hidden) {
    const iw = img.width, ih = img.height, s = Math.max(w2 / iw, h2 / ih);
    const sw = w2 / s, sh = h2 / s, sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    if (!hidden) { ctx.drawImage(img, sx, sy, sw, sh, x, y, w2, h2); return; }
    // Hidden: a tiny copy enlarged, so only the colours remain (works where canvas filters do not).
    const t = d.createElement('canvas'); t.width = 12; t.height = Math.max(8, Math.round(12 * h2 / w2));
    t.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, t.width, t.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(t, x, y, w2, h2);
  }
  function bars(ctx, x, y, w2, n, color) { ctx.fillStyle = color; for (let i = 0; i < n; i += 1) { rr(ctx, x, y + i * 34, w2 * (i === n - 1 ? 0.6 : 1), 18, 9); ctx.fill(); } }
  async function drawCard(ctx, card, pack, x, y, k, opts) {
    const per = period(pack), me = myRole(), other = otherRole();
    const cw = 240 * k, ch = 360 * k, X = (v) => x + v * k, Y = (v) => y + v * k, F = (v) => v * k;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = F(30); ctx.shadowOffsetY = F(14);
    rr(ctx, x, y, cw, ch, F(20)); ctx.fillStyle = '#fbf5ef'; ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, x, y, cw, ch, F(20)); ctx.clip();
    const g = ctx.createRadialGradient(X(36), Y(0), F(10), X(36), Y(0), F(380)); g.addColorStop(0, '#fffaf3'); g.addColorStop(0.55, '#fbf5ef'); g.addColorStop(1, '#f2e6db');
    ctx.fillStyle = g; ctx.fillRect(x, y, cw, ch);
    const kind = card.k;
    const acc = { foto: '#b24a5d', qa: '#5f4fa6', lettera: '#5f4fa6', scelta: '#5f4fa6', prima: '#8a5a10', intesa: '#b24a5d' }[kind] || '#b8432f';
    const serif = (size, italic = true, weight = 400) => `${italic ? 'italic ' : ''}${weight} ${F(size)}px Fraunces, Georgia, serif`;
    const ui = (size, weight = 800) => `${weight} ${F(size)}px Figtree, system-ui, sans-serif`;
    const head = (light) => {
      if (card.rare) return;
      text(ctx, `N° ${String(card.n).padStart(2, '0')}`, X(15), Y(22), ui(8), light ? 'rgba(255,255,255,.88)' : '#75636b', { spacing: F(0.8) });
      text(ctx, T(TAGS[kind] || '').toUpperCase(), X(48), Y(22), ui(8), light ? 'rgba(255,255,255,.88)' : acc, { spacing: F(1.76) });
    };
    const person = async (role, cx, cy, size, o = {}) => { const im = await charImg(role, o); if (im) ctx.drawImage(im, X(cx), Y(cy), F(size), F(size * 100 / 108)); };
    if (kind === 'foto') {
      const img = await photoImg(card.path);
      if (img) cover(ctx, img, x, y, cw, ch, !opts.photos);
      else { const pg = ctx.createLinearGradient(x, y, x + cw, y + ch); pg.addColorStop(0, '#c98aa4'); pg.addColorStop(0.7, '#5b3a6e'); pg.addColorStop(1, '#2b2140'); ctx.fillStyle = pg; ctx.fillRect(x, y, cw, ch); }
      const sh = ctx.createLinearGradient(0, y, 0, y + ch); sh.addColorStop(0, 'rgba(20,10,20,.42)'); sh.addColorStop(0.24, 'rgba(20,10,20,0)'); sh.addColorStop(0.48, 'rgba(20,10,20,0)'); sh.addColorStop(1, 'rgba(20,10,20,.82)');
      ctx.fillStyle = sh; ctx.fillRect(x, y, cw, ch);
      head(true);
      const title = String(card.caption || '').trim() || String(card.place || '').trim() || T('Un ricordo');
      if (!card.rare) {
        ctx.font = serif(fit(title, 25, 34, 15));
        const ls = lines(ctx, title, F(160), 3);
        ls.forEach((ln, i) => text(ctx, ln, X(16), Y(324 - 24 * (ls.length - 1 - i)), serif(fit(title, 25, 34, 15)), '#fff'));
        text(ctx, dayText(card.date || card.day).toUpperCase(), X(16), Y(345), ui(9.5, 700), 'rgba(255,255,255,.78)', { spacing: F(1.1) });
        await person(card.by || me, 178, 296, 70);
      }
    } else if (kind === 'qa') {
      head();
      ctx.font = serif(fit(card.question, 23, 60, 15), false);
      const ls = lines(ctx, card.question, F(196), 4);
      ls.forEach((ln, i) => text(ctx, ln, X(16), Y(card.rare ? 98 : 56) + i * F(fit(card.question, 23, 60, 15) * 1.1), serif(fit(card.question, 23, 60, 15), false), '#2c2030'));
      const bubble = async (role, answer, top, right) => {
        ctx.font = serif(13.5);
        const al = lines(ctx, answer, F(150), 3);
        const bw = F(170), bh = F(16) + al.length * F(17);
        const bx = right ? X(214) - bw - F(38) : X(50);
        ctx.fillStyle = right ? '#ddd6f3' : '#f6d3d8'; rr(ctx, bx, Y(top), bw, bh, F(14)); ctx.fill();
        if (opts.answers) al.forEach((ln, i) => text(ctx, ln, bx + F(11), Y(top) + F(21) + i * F(17), serif(13.5), '#2c2030'));
        else bars(ctx, bx + F(11), Y(top) + F(10), bw - F(22), Math.min(2, al.length), 'rgba(44,32,48,.18)');
        await person(role, right ? 212 : 12, top + 10, 32);
      };
      await bubble(me, card.mine, 228, false);
      await bubble(other, card.theirs, 286, true);
    } else if (kind === 'lettera') {
      head();
      text(ctx, '“', X(14), Y(120), serif(120, true, 600), 'rgba(143,127,208,.22)');
      ctx.font = serif(fit(card.body, 20, 90, 13));
      const ls = lines(ctx, card.body, F(190), 8);
      if (opts.answers) ls.forEach((ln, i) => text(ctx, ln, X(20), Y(76) + i * F(fit(card.body, 20, 90, 13) * 1.22), serif(fit(card.body, 20, 90, 13)), '#2c2030'));
      else bars(ctx, X(20), Y(66), F(190), Math.min(5, ls.length), 'rgba(44,32,48,.16)');
      await person(card.by || other, 18, 300, 44);
      text(ctx, `${T('da')} ${nameOf(card.by || other)}`, X(70), Y(330), serif(15), '#75636b');
    } else if (kind === 'prima') {
      head();
      ctx.save(); ctx.translate(X(120), Y(100)); ctx.rotate(-0.14); ctx.strokeStyle = acc; ctx.lineWidth = F(2.6); ctx.beginPath(); ctx.arc(0, 0, F(61), 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = F(1.3); ctx.beginPath(); ctx.arc(0, 0, F(38), 0, Math.PI * 2); ctx.stroke();
      text(ctx, dayText(card.day), 0, F(6), serif(17), acc, { align: 'center' }); text(ctx, T('PRIMA VOLTA'), 0, F(-44), ui(8), acc, { align: 'center', spacing: F(2) }); ctx.restore();
      const size = fit(card.title, 44, 10, 18);
      ctx.font = serif(size, true, 600);
      const ls = lines(ctx, card.title, F(200), 3);
      ls.forEach((ln, i) => text(ctx, ln, X(120), Y(214) + i * F(size), serif(size, true, 600), acc, { align: 'center' }));
      await person(me, 66, 252, 40); await person(other, 136, 252, 40);
      text(ctx, T('Una prima volta, segnata in Noi'), X(120), Y(340), serif(14), '#75636b', { align: 'center' });
    } else if (kind === 'scelta') {
      head();
      ctx.font = serif(19, false);
      lines(ctx, card.question, F(196), 3).forEach((ln, i) => text(ctx, ln, X(16), Y(56) + i * F(21), serif(19, false), '#2c2030'));
      const gsize = fit(card.chosen, 118, 5, 34);
      await person(me, 44, 150, 48); await person(other, 86, 150, 48);
      if (opts.answers) text(ctx, card.chosen, X(-4), Y(296), serif(gsize, true, 600), acc);
      else bars(ctx, X(16), Y(230), F(170), 2, 'rgba(95,79,166,.2)');
      if (opts.answers) { text(ctx, card.other, X(16), Y(330), serif(17), '#75636b'); ctx.fillStyle = '#b8432f'; ctx.fillRect(X(16), Y(324), Math.min(F(110), ctx.measureText(card.other).width), F(2)); }
      text(ctx, T('Tutti e due').toUpperCase(), X(210), Y(326), ui(8), '#75636b', { align: 'right', spacing: F(1.9) });
    } else if (kind === 'numeri') {
      head();
      const { hero, minis } = numbersOf(card);
      text(ctx, T(hero[2]), X(16), Y(card.rare ? 104 : 60), serif(27), '#2c2030');
      text(ctx, T(hero[3]).toUpperCase(), X(16), Y(card.rare ? 120 : 76), ui(8), '#75636b', { spacing: F(1.9) });
      minis.forEach(([v, lab], i) => { text(ctx, String(v), X(210), Y(card.rare ? 108 : 62) + i * F(48), serif(26, false, 600), '#2c2030', { align: 'right' }); text(ctx, T(lab), X(210), Y(card.rare ? 122 : 76) + i * F(48), ui(9.5, 600), '#75636b', { align: 'right' }); });
      text(ctx, String(hero[1]), X(-14), Y(394), serif(fit(String(hero[1]), 236, 2, 120), false, 600), '#b8432f');
      await person(me, 34, 160, 58);
    } else if (kind === 'posti') {
      const layout = mapLayout(card.places);
      if (layout.view) await loadWorld().catch(() => null);
      const svg = placeMap(card, layout).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" `);
      const map = await loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      if (map) ctx.drawImage(map, x, y, cw, ch);
      head();
      text(ctx, T('Dove siete stati'), X(16), Y(58), serif(25), '#2c2030');
      for (const p of layout.pins) await person(p.role === 'me' ? me : other, p.x, p.y, 34);
    } else if (kind === 'intesa') {
      head();
      const glow = ctx.createRadialGradient(X(120), Y(370), F(10), X(120), Y(370), F(150)); glow.addColorStop(0, 'rgba(255,150,170,.55)'); glow.addColorStop(1, 'rgba(255,150,170,0)');
      ctx.fillStyle = glow; ctx.fillRect(x, y, cw, ch);
      text(ctx, T('In Gioca avete scelto uguale').toUpperCase(), X(16), Y(card.rare ? 92 : 44), ui(8), '#75636b', { spacing: F(1.9) });
      ctx.save(); ctx.translate(X(-6), Y(110)); ctx.rotate(-0.12); text(ctx, `${card.same} ${T('su')} ${card.total}`, 0, 0, serif(54, true, 600), acc); ctx.restore();
      const close = card.total && card.same / card.total >= 0.6;
      text(ctx, T(close ? 'Vi conoscete bene' : 'Ancora da scoprire'), X(210), Y(150), ui(10, 600), '#75636b', { align: 'right' });
      await person(me, 12, 254, 112, close ? { reaction: 'cuore' } : {}); await person(other, 116, 254, 112, close ? { reaction: 'cuore' } : {});
    }
    if (kind !== 'foto' && !card.rare) {
      ctx.save(); ctx.translate(X(226), Y(180)); ctx.rotate(Math.PI / 2); text(ctx, per.stamp.toUpperCase(), 0, 0, ui(7), 'rgba(117,99,107,.8)', { align: 'center', spacing: F(3.5) }); ctx.restore();
    }
    if (card.rare) {
      const frame = await loadImg('/assets/mese/frame.webp');
      if (frame) ctx.drawImage(frame, x, y, cw, ch);
      const seal = ctx.createRadialGradient(X(40), Y(40), F(2), X(47), Y(47), F(26)); seal.addColorStop(0, '#fff6da'); seal.addColorStop(0.7, '#e9c27a');
      ctx.fillStyle = seal; ctx.beginPath(); ctx.arc(X(47), Y(47), F(23), 0, Math.PI * 2); ctx.fill();
      text(ctx, '★', X(47), Y(46), ui(13), '#5a3a08', { align: 'center' });
      text(ctx, T('RARA'), X(47), Y(58), ui(7.5), '#5a3a08', { align: 'center', spacing: F(1) });
      if (kind === 'foto') {
        const pl = ctx.createLinearGradient(X(24), 0, X(216), 0); pl.addColorStop(0, '#ecd29c'); pl.addColorStop(0.5, '#fff3d2'); pl.addColorStop(1, '#e2bd76');
        ctx.fillStyle = pl; rr(ctx, X(24), Y(292), F(192), F(46), F(8)); ctx.fill();
        const title = String(card.caption || '').trim() || String(card.place || '').trim() || T('Un ricordo');
        ctx.font = serif(18, true, 600);
        text(ctx, lines(ctx, title, F(176), 1)[0] || '', X(120), Y(315), serif(18, true, 600), '#4e3207', { align: 'center' });
        text(ctx, T('Il momento del mese').toUpperCase(), X(120), Y(330), ui(7.5), 'rgba(78,50,7,.75)', { align: 'center', spacing: F(1.6) });
      }
    }
    ctx.restore();
  }
  function frameSlide(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#3a1d40'); bg.addColorStop(1, '#1d1020');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  }
  function watermark(ctx) { text(ctx, 'US · uscouple.app', W - 60, H - 64, '800 34px Figtree, system-ui, sans-serif', 'rgba(246,238,230,.78)', { align: 'right', spacing: 3 }); }
  async function fontsReady() {
    try { await Promise.all(['italic 400 40px Fraunces', 'italic 600 40px Fraunces', '400 40px Fraunces', '600 40px Fraunces', '800 20px Figtree', '600 20px Figtree', '700 20px Figtree'].map((f) => d.fonts?.load?.(f))); } catch (_) {}
  }
  const canvasBlob = (canvas) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
  async function renderShare(pack, cards, opts) {
    await fontsReady();
    const per = period(pack), files = [];
    const canvas = d.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    // The cover.
    frameSlide(ctx);
    const logo = await loadImg(per.gold ? '/assets/mese/logo-gold.webp' : '/assets/mese/logo-pink.webp');
    if (logo) ctx.drawImage(logo, W / 2 - 150, 420, 300, 300);
    const a = await charImg(myRole()), b = await charImg(otherRole());
    if (a) ctx.drawImage(a, W / 2 - 250, 780, 240, 222);
    if (b) ctx.drawImage(b, W / 2 + 10, 780, 240, 222);
    text(ctx, T(per.gold ? 'Il nostro {year}' : 'Il nostro', { year: per.year }), W / 2, 1150, 'italic 400 130px Fraunces, Georgia, serif', '#f6eee6', { align: 'center' });
    if (!per.gold) text(ctx, T(per.lower), W / 2, 1290, 'italic 400 130px Fraunces, Georgia, serif', '#f6eee6', { align: 'center' });
    text(ctx, `${T(cardsLabel(cards.length)).toUpperCase()} · ${T('1 RARA')}`, W / 2, 1400, '700 40px Figtree, system-ui, sans-serif', 'rgba(246,238,230,.72)', { align: 'center', spacing: 4 });
    watermark(ctx);
    files.push(new File([await canvasBlob(canvas)], 'us-mese-00.jpg', { type: 'image/jpeg' }));
    for (const [i, card] of cards.entries()) {
      ctx.clearRect(0, 0, W, H);
      frameSlide(ctx);
      await drawCard(ctx, card, pack, 120, 330, 3.5, opts);
      watermark(ctx);
      files.push(new File([await canvasBlob(canvas)], `us-mese-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
    }
    return files;
  }
  // The phone's share sheet: the native one (Share + Filesystem plugins), the
  // browser's with files, or the files downloaded one by one.
  async function shareFiles(files, title) {
    const P = w.UsPlatform;
    if (P?.isNative && typeof P.shareNativeFiles === 'function') {
      const out = await P.shareNativeFiles(files, title);
      if (out) return out;
    }
    if (w.navigator?.canShare?.({ files })) {
      try { await w.navigator.share({ files, title }); } catch (e) { if (e?.name !== 'AbortError') throw e; }
      return 'shared';
    }
    if (P?.isNative) return 'unsupported';
    for (const f of files) {
      const href = URL.createObjectURL(f);
      const a = d.createElement('a'); a.href = href; a.download = f.name; a.rel = 'noopener';
      d.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      await new Promise((r) => setTimeout(r, 160));
    }
    return 'downloaded';
  }
  async function saveCard(card, btn) {
    btn.disabled = true;
    try {
      await fontsReady();
      const canvas = d.createElement('canvas'); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      frameSlide(ctx);
      // On your own phone the card is whole: photo and answers shown.
      await drawCard(ctx, card, state.pack, 120, 330, 3.5, { photos: true, answers: true });
      watermark(ctx);
      const file = new File([await canvasBlob(canvas)], `us-carta-${String(card.n).padStart(2, '0')}.jpg`, { type: 'image/jpeg' });
      const out = await shareFiles([file], T('Una carta del vostro mese'));
      if (out === 'downloaded') toast(T('Salvata come immagine'));
      if (out === 'unsupported') toast(T('Per salvare le immagini serve la nuova versione di US'));
    } catch (e) { console.warn('[US Mese] save', e); toast('Non riesco a salvarla. Riprova.'); }
    btn.disabled = false;
  }

  // ---------------------------------------------------------------- «Le vostre carte», in Ricordi
  async function showCollection(box, o = {}) {
    if (!box) return;
    state.box = box;
    if (!o.quiet && !box.childElementCount) box.innerHTML = '<div class="uc-load">Carico le vostre carte…</div>';
    let data;
    try { data = await rpc('get_carte_v1', { p_year: state.year || null }); } catch (e) {
      console.warn('[US Mese] collection', e);
      if (!o.quiet) box.innerHTML = '<div class="uc-load">Le vostre carte non si aprono: controlla la connessione.</div>';
      return;
    }
    if (!data) { box.innerHTML = '<div class="uc-load">Le carte arrivano quando siete in due.</div>'; return; }
    state.collection = data; state.year = data.year;
    paintCollection(box, data);
  }
  function paintCollection(box, data) {
    const months = data.months || [];
    const years = data.years || [data.year];
    const yi = years.indexOf(data.year);
    const opened = months.filter((m) => m.state === 'opened').length;
    const together = months.filter((m) => ['opened', 'closed', 'empty'].includes(m.state)).length;
    const other = otherRole();
    const slot = (m) => {
      const name = MONTHS[m.month - 1];
      const next = LOWER[m.month % 12];
      if (m.state === 'before') return `<div class="slot before" aria-label="${esc(T('{month}: prima di voi', { month: T(name) }))}"><span class="when">prima di voi</span><span class="lbl">${esc(name)}</span></div>`;
      if (m.state === 'future') return `<div class="slot future"><span class="when"><span>arriva il</span><br><span>1° ${esc(next)}</span></span><span class="lbl">${esc(name)}</span></div>`;
      if (m.state === 'empty') return `<div class="slot empty"><span class="when">nessuna carta</span><span class="lbl">${esc(name)}</span></div>`;
      if (m.state === 'closed') return `<button type="button" class="slot closed" data-uc-open="${esc(m.pack)}" aria-label="${esc(T('{month}: da aprire', { month: T(name) }))}"><span class="new">Da aprire</span><span class="lbl">${esc(name)}</span></button>`;
      const c = m.cover || {};
      const cv = c.k === 'foto' && c.path && !c.gone ? `<img alt="" data-um-path="${esc(c.path)}" decoding="async">` : `<span class="cvk">${esc(T(TAGS[c.k] || 'Le vostre carte'))}</span>`;
      const badge = data.partner && !m.partner_opened ? `<span class="who" title="${esc(T('{name} non l’ha ancora aperto', { name: partnerName() }))}">${w.UsPersonaggi?.character?.(other, { size: 17 }) || ''}</span>` : '';
      return `<button type="button" class="slot opened" data-uc-month="${esc(m.pack)}" aria-label="${esc(T('{month}: le carte del mese', { month: T(name) }))}"><span class="cv">${cv}</span><span class="lbl">${esc(name)}</span>${badge}</button>`;
    };
    const g = data.gold || {};
    const gold = g.state === 'closed' || g.state === 'opened'
      ? `<button type="button" class="uc-gold" data-uc-${g.state === 'closed' ? 'open' : 'month'}="${esc(g.pack)}"><span class="g" aria-hidden="true"></span><span><b>L’anno ${esc(data.year)}</b><span>${g.state === 'closed' ? 'Il pacchetto d’oro è arrivato: le carte più belle dell’anno.' : 'Le carte più belle dell’anno.'}</span></span></button>`
      : `<div class="uc-gold"><span class="g" aria-hidden="true"></span><span><b>L’anno ${esc(data.year)}</b><span>Il pacchetto d’oro arriva il 31 dicembre: le 10 carte più belle dell’anno.</span></span></div>`;
    box.innerHTML = `<div class="uc-year"><div class="uc-yearnav"><button type="button" data-uc-year="-1" aria-label="Anno prima"${yi <= 0 ? ' disabled' : ''}>‹</button><b>${esc(data.year)}</b><button type="button" data-uc-year="1" aria-label="Anno dopo"${yi < 0 || yi >= years.length - 1 ? ' disabled' : ''}>›</button></div><span><span>${esc(together === 1 ? '1 mese insieme' : `${together} mesi insieme`)}</span> · <span>${esc(opened === 1 ? '1 pacchetto aperto' : `${opened} pacchetti aperti`)}</span></span></div>
      <div class="uc-grid">${months.map(slot).join('')}</div>${gold}<p class="uc-note">Un pacchetto non aperto vi aspetta per sempre. Ognuno apre il suo quando vuole.</p>`;
    box.onclick = (e) => {
      const t = e.target.closest?.('[data-uc-open],[data-uc-month],[data-uc-year]');
      if (!t) return;
      if (t.dataset.ucYear) { state.year = years[yi + Number(t.dataset.ucYear)] || data.year; showCollection(box); return; }
      if (t.dataset.ucOpen) openPack(t.dataset.ucOpen);
      else if (t.dataset.ucMonth) openMonth(t.dataset.ucMonth);
    };
    paintPhotos(box);
  }
  // From Gioca or a notice: the latest pack still to open, else the collection.
  async function openLatest() {
    try {
      const data = state.collection || await rpc('get_carte_v1', { p_year: null });
      const next = data?.waiting?.[0];
      if (next?.pack) { openPack(next.pack); return true; }
    } catch (_) {}
    return false;
  }

  return Object.freeze({ MONTHS, period, fit, cardsLabel, normalize, shareable, pinOf, dayLabel, decodeWorld, mapLayout, landPath, MAP, loadWorld, install, showCollection, openPack, openMonth, openViewer: (i) => openViewer(i), openShare: () => openShare(), openLatest, close, back, isOpen, cardHTML, renderShare });
});
