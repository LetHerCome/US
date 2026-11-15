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

  // Il diario, ma pulito (founder, 15/11/2026): one colour, one meaning. Honey
  // is time, sky is distance, the heart red is the Ti penso: oro, cielo and
  // rubino left the person palette for blu, prugna and menta.
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
  function applyCoupleColors(profiles, target = globalThis.document?.documentElement) {
    const style = target?.style;
    if (!style) return;
    const colors = coupleColors(profiles);
    for (const token of ['rosa', 'lilla']) {
      if (colors[token]) style.setProperty(`--us-${token}`, colors[token]);
      else style.removeProperty(`--us-${token}`);
    }
  }
  function choices(profiles, meId) {
    const me = (profiles || []).find((p) => p?.id === meId);
    const partner = (profiles || []).find((p) => p?.id && p.id !== meId);
    const mine = effective(me), theirs = effective(partner);
    return Object.keys(PALETTE).map((id) => ({ id, name: NAMES[id], hex: PALETTE[id], mine: id === mine, taken: id === theirs }));
  }
  const nameOf = (profiles, id) => NAMES[effective((profiles || []).find((p) => p?.id === id))] || '';

  return Object.freeze({ PALETTE, NAMES, RETIRED, idOf, coupleColors, applyCoupleColors, choices, nameOf });
});
