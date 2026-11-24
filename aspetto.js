/* Aspetto: Giorno e Notte (founder, 24/11/2026, tavola «US · Quaderno, giorno
   e notte»: «applica il tema light e quello dark con la possibilità di scelta
   nelle impostazioni»). Giorno is the Quaderno (carta, foglio, inchiostro,
   ceralacca: giorno.css); Notte is the night US already has. The choice is
   per phone (localStorage): Automatico follows the phone's light or dark
   theme (the founder's pick), or Giorno, or Notte. It sets <html
   data-us-luce="giorno|notte">; index.html runs the same few lines before
   the first paint, so the page never flashes the wrong light. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.UsAspetto = api;
})(typeof window !== 'undefined' ? window : null, function (win) {
  'use strict';

  const KEY = 'us:aspetto:v1';
  const CHOICES = Object.freeze(['auto', 'giorno', 'notte']);
  const THEME = Object.freeze({ giorno: '#f3ece1', notte: '#120d11' });

  const read = () => {
    try { const v = win?.localStorage?.getItem(KEY); return CHOICES.includes(v) ? v : 'auto'; } catch (_) { return 'auto'; }
  };
  const dark = () => {
    try { return Boolean(win?.matchMedia?.('(prefers-color-scheme: dark)').matches); } catch (_) { return true; }
  };
  // The light a choice gives right now.
  const luceOf = (choice, isDark) => (choice === 'giorno' || choice === 'notte' ? choice : (isDark ? 'notte' : 'giorno'));

  function apply() {
    const doc = win?.document;
    if (!doc) return null;
    const luce = luceOf(read(), dark());
    const html = doc.documentElement;
    if (html.dataset.usLuce !== luce) html.dataset.usLuce = luce;
    doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME[luce]);
    doc.querySelector('meta[name="color-scheme"]')?.setAttribute('content', luce === 'giorno' ? 'light' : 'dark');
    return luce;
  }

  function set(choice) {
    if (!CHOICES.includes(choice)) return null;
    try { win?.localStorage?.setItem(KEY, choice); } catch (_) { /* this visit only */ }
    const luce = apply();
    try { win?.dispatchEvent?.(new win.CustomEvent('us:aspetto', { detail: { choice, luce } })); } catch (_) { /* old webview */ }
    return luce;
  }

  // Automatico: the phone switching light or dark (often at sunset) follows at once.
  try {
    const query = win?.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => { if (read() === 'auto') apply(); };
    if (query?.addEventListener) query.addEventListener('change', onChange);
    else if (query?.addListener) query.addListener(onChange);
  } catch (_) { /* no media queries */ }
  apply();

  // Profilo › Aspetto: three choices, one checked; a tap applies it at once.
  function paintChoices() {
    const current = read();
    win?.document?.querySelectorAll('[data-us-aspetto]').forEach((button) => {
      button.setAttribute('aria-checked', String(button.dataset.usAspetto === current));
    });
  }
  function bind() {
    const doc = win?.document;
    if (!doc) return;
    paintChoices();
    doc.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-us-aspetto]');
      if (!button) return;
      set(button.dataset.usAspetto);
      paintChoices();
    });
  }
  if (win?.document) {
    if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
  }

  return Object.freeze({ KEY, CHOICES, choice: read, luce: () => luceOf(read(), dark()), luceOf, set, apply });
});
