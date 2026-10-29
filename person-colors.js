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

  const PALETTE = Object.freeze({
    rosa: '#ff7c96', lilla: '#a98bff', cielo: '#6fb8ff', salvia: '#8fd49b',
    oro: '#f2cf6b', pesca: '#ff9f6e', rubino: '#e5484d', perla: '#e8e1f0',
  });
  const NAMES = Object.freeze({
    rosa: 'Rosa', lilla: 'Lilla', cielo: 'Cielo', salvia: 'Salvia',
    oro: 'Oro', pesca: 'Pesca', rubino: 'Rubino', perla: 'Perla',
  });
  const TOKEN = Object.freeze({ francesco: 'rosa', beatrice: 'lilla' });

  const chosen = (profile) => (PALETTE[profile?.person_color] ? profile.person_color : null);
  const effective = (profile) => chosen(profile) || TOKEN[profile?.role] || null;

  function coupleColors(profiles) {
    const out = { rosa: null, lilla: null };
    for (const p of profiles || []) {
      const token = TOKEN[p?.role];
      if (token && chosen(p)) out[token] = PALETTE[p.person_color];
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

  return Object.freeze({ PALETTE, NAMES, coupleColors, applyCoupleColors, choices, nameOf });
});
