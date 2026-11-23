// US — colori a scelta (founder, 29/10/2026, docs/DECISIONS.md). With US Plus
// each person picks their colour from 8; both phones show it. The design
// reads two tokens (ui-foundation.css): --us-rosa for whoever created the
// couple (role francesco) and --us-lilla for whoever joined (role beatrice).
// A chosen colour replaces that person's token; none keeps the usual one.
// The server (set_my_color) is the authority: Plus, the 8, never the partner's.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsPersonColors = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Palette of 15/11/2026 (migration 20261115183900): oro, cielo and rubino
  // left for blu, prugna and menta. Kept when staging restarted from main
  // (founder, 23/11/2026, D8): the two colours now drive the whole app.
  const PALETTE = Object.freeze({
    rosa: '#ff7c96', lilla: '#a98bff', blu: '#6f9bff', salvia: '#8fd49b',
    pesca: '#ff9f6e', prugna: '#c98bd6', menta: '#6fd6c8', perla: '#e8e1f0',
  });
  const NAMES = Object.freeze({
    rosa: 'Rosa', lilla: 'Lilla', blu: 'Blu', salvia: 'Salvia',
    pesca: 'Pesca', prugna: 'Prugna', menta: 'Menta', perla: 'Perla',
  });
  // Until the staging migration moves them, the retired names read as the nearest new one.
  const RETIRED = Object.freeze({ cielo: 'blu', rubino: 'prugna', oro: 'pesca' });
  const idOf = (value) => (PALETTE[value] ? value : RETIRED[value] || null);
  const TOKEN = Object.freeze({ francesco: 'rosa', beatrice: 'lilla' });

  const chosen = (profile) => idOf(profile?.person_color);
  const effective = (profile) => chosen(profile) || TOKEN[profile?.role] || null;

  function coupleColors(profiles) {
    const out = { rosa: null, lilla: null };
    for (const p of profiles || []) {
      const token = TOKEN[p?.role];
      if (token && chosen(p)) out[token] = PALETTE[chosen(p)];
    }
    return out;
  }
  // ---------- I colori delle pagine (redesign definitivo, founder 23/11/2026, D7) ----------
  // The four pages are four steps from your colour to the other person's: Oggi
  // yours, Noi a third of the way, Ricordi two thirds, Gioca theirs. Each phone
  // starts from its own. The steps are mixed in OKLCH, so even two opposite
  // colours (blu and pesca) never pass through grey; Noi (what is yours both)
  // is the middle. Every step of every pair of the palette reads at 7:1 or
  // more on the night (#140c14) and under the dark ink of a button
  // (tests/colori-coppia.test.js): the colour itself is the text colour.
  const srgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function oklch(hex) {
    const [r, g, b] = srgb(hex).map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
  }
  function hexOf([L, C, H]) {
    const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    return `#${rgb.map((c) => Math.round(fromLinear(Math.min(1, Math.max(0, c))) * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  // t of the way from a to b, the short way round the hue; a near-grey colour (perla) takes the other's hue.
  function mix(a, b, t) {
    const A = oklch(a), B = oklch(b);
    let ha = A[2], hb = B[2];
    if (A[1] < 0.02) ha = hb;
    if (B[1] < 0.02) hb = ha;
    let dh = hb - ha;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    return hexOf([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, (ha + dh * t + 360) % 360]);
  }
  function pageColors(mine, theirs) {
    return { home: mix(mine, theirs, 0), bond: mix(mine, theirs, 1 / 3), moments: mix(mine, theirs, 2 / 3), quiz: mix(mine, theirs, 1), noi: mix(mine, theirs, 0.5) };
  }
  const PAGE_TOKENS = Object.freeze({ home: '--us-pg-home', bond: '--us-pg-bond', moments: '--us-pg-moments', quiz: '--us-pg-quiz', noi: '--us-noi' });

  // meRole: whose phone this is (the steps start from that person's colour).
  function applyCoupleColors(profiles, target = globalThis.document?.documentElement, meRole = globalThis.usProfile?.role) {
    const style = target?.style;
    if (!style) return;
    const colors = coupleColors(profiles);
    for (const token of ['rosa', 'lilla']) {
      if (colors[token]) style.setProperty(`--us-${token}`, colors[token]);
      else style.removeProperty(`--us-${token}`);
    }
    // The usual rosa and lilla: colori.css already holds their steps, for either phone.
    if (!colors.rosa && !colors.lilla) {
      Object.values(PAGE_TOKENS).forEach((token) => style.removeProperty(token));
      if (target.dataset) delete target.dataset.usPagine;
      return;
    }
    const hex = { francesco: colors.rosa || PALETTE.rosa, beatrice: colors.lilla || PALETTE.lilla };
    const me = meRole === 'beatrice' ? 'beatrice' : 'francesco';
    const steps = pageColors(hex[me], hex[me === 'beatrice' ? 'francesco' : 'beatrice']);
    for (const [page, token] of Object.entries(PAGE_TOKENS)) style.setProperty(token, steps[page]);
    // The bar's colour cache (due-colori.js) keys on this.
    if (target.dataset) target.dataset.usPagine = Object.values(steps).join(' ');
  }
  function choices(profiles, meId) {
    const me = (profiles || []).find((p) => p?.id === meId);
    const partner = (profiles || []).find((p) => p?.id && p.id !== meId);
    const mine = effective(me), theirs = effective(partner);
    return Object.keys(PALETTE).map((id) => ({ id, name: NAMES[id], hex: PALETTE[id], mine: id === mine, taken: id === theirs }));
  }
  const nameOf = (profiles, id) => NAMES[effective((profiles || []).find((p) => p?.id === id))] || '';

  return Object.freeze({ PALETTE, NAMES, RETIRED, idOf, coupleColors, applyCoupleColors, choices, nameOf, mix, pageColors });
});
