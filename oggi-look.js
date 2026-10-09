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

const THEMES = Object.freeze([
  { id: 'original', name: 'US Original', note: 'Il vostro Oggi di sempre, senza aggiunte.', reward: null },
  { id: 'romantic', name: 'Romantic', note: 'Rosa delicato e luce morbida sulla vostra foto.', reward: null },
  { id: 'pastel', name: 'Pastel Dream', note: 'Colori chiari e leggeri, come un acquerello.', reward: null },
  { id: 'cinematic', name: 'Cinematic', note: 'Bande nere, grana e il tempo come titoli di testa.', reward: 'oggi_theme_cinematic', level: 4 },
  { id: 'moonlight', name: 'Moonlight', note: 'Notte blu, stelle e un riflesso di luna.', reward: 'oggi_theme_moonlight', level: 7 },
  { id: 'seasonal', name: 'Autunno', kicker: 'Stagioni', note: 'Ambra, foglie e la luce bassa di ottobre.', reward: 'oggi_theme_seasonal', level: 12 }
]);
const EFFECTS = Object.freeze([
  { id: 'none', name: 'Nessuno', note: 'Solo la vostra foto.', reward: null, count: 0 },
  { id: 'hearts', name: 'Cuori delicati', note: 'Piccoli cuori salgono piano.', reward: null, count: 9 },
  { id: 'stars', name: 'Stelle luminose', note: 'Stelle che brillano a turno.', reward: null, count: 12 },
  { id: 'petals', name: 'Petali fluttuanti', note: 'Petali rosa scendono nel vento.', reward: 'oggi_effect_petals', level: 2, count: 10 },
  { id: 'fireflies', name: 'Lucciole', note: 'Punti di luce calda vagano lenti.', reward: 'oggi_effect_fireflies', level: 6, count: 10 },
  { id: 'bokeh', name: 'Bokeh romantico', note: 'Luci sfocate, come una sera in città.', reward: 'oggi_effect_bokeh', level: 10, count: 7 },
  { id: 'snow', name: 'Neve', note: 'Fiocchi leggeri, mai una bufera.', reward: 'oggi_effect_snow', level: 13, count: 16 }
]);
const CATALOG = { theme: THEMES, effect: EFFECTS };
const DEFAULTS = { theme: 'original', effect: 'none' };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name) => `<span class="us-icon" data-us-icon="${name}" aria-hidden="true"></span>`;
const find = (slot, id) => (CATALOG[slot] || []).find((look) => look.id === id) || null;
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Fewer particles where the phone is modest or the user asked to save data.
function lowPower() {
  const nav = window.navigator || {};
  return Boolean(nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory <= 3) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4));
}

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
  return { state: 'locked', level: Number(reward.level_required) || look.level || 0 };
}
const usable = (slot, id) => ['included', 'unlocked'].includes(status(slot, id).state);
function visibleLooks(slot) {
  return (CATALOG[slot] || []).filter((look) => status(slot, look.id).state !== 'unavailable');
}

// ---------- particles: deterministic per effect, so a preview matches Oggi ----------
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const RANGES = {
  hearts: { s: [10, 18], d: [13, 21], o: [0.5, 0.85], drift: [-26, 26] },
  stars: { s: [7, 14], d: [3.2, 6.4], o: [0.55, 1], drift: [0, 0], y: [3, 62] },
  petals: { s: [9, 15], d: [11, 18], o: [0.6, 0.9], drift: [-60, 40] },
  fireflies: { s: [3, 5], d: [7, 12], o: [0.55, 0.95], drift: [-30, 30], y: [38, 92] },
  bokeh: { s: [44, 110], d: [16, 26], o: [0.35, 0.7], drift: [-24, 24] },
  snow: { s: [3, 6.5], d: [9, 17], o: [0.5, 0.95], drift: [-28, 28] }
};
function fxMarkup(effect, { scale = 1 } = {}) {
  const look = find('effect', effect);
  const range = RANGES[effect];
  if (!look || !range || !look.count) return '';
  const count = Math.max(3, Math.round(look.count * scale * (lowPower() ? 0.55 : 1)));
  const rand = seeded(effect);
  const pick = ([a, b]) => a + (b - a) * rand();
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const x = ((i + rand() * 0.8) / count) * 100;
    const y = range.y ? pick(range.y) : rand() * 100;
    const d = pick(range.d);
    const style = `--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--s:${pick(range.s).toFixed(1)}px;--d:${d.toFixed(1)}s;--delay:${(-rand() * d).toFixed(1)}s;--o:${pick(range.o).toFixed(2)};--drift:${pick(range.drift).toFixed(0)}px;--r:${Math.round(rand() * 360)}deg`;
    parts.push(`<i style="${style}"></i>`);
  }
  return parts.join('');
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
  return { hero, fx: hero.querySelector(':scope > .us-oggi-fx') };
}
function apply(next = {}) {
  const theme = find('theme', next.theme) ? next.theme : DEFAULTS.theme;
  const effect = find('effect', next.effect) ? next.effect : DEFAULTS.effect;
  const root = document.documentElement;
  if (theme === DEFAULTS.theme) delete root.dataset.usOggiTheme; else root.dataset.usOggiTheme = theme;
  if (effect === DEFAULTS.effect) delete root.dataset.usOggiEffect; else root.dataset.usOggiEffect = effect;
  const layers = ensureLayers();
  if (layers?.fx && (layers.fx.dataset.fx || DEFAULTS.effect) !== effect) {
    layers.fx.dataset.fx = effect;
    layers.fx.innerHTML = effect === DEFAULTS.effect ? '' : fxMarkup(effect);
  }
  applied = { theme, effect };
  paintSettings();
  return applied;
}
function paintSettings() {
  const theme = $('usOggiThemeValue');
  if (theme) theme.textContent = find('theme', applied.theme)?.name || 'US Original';
  const effect = $('usOggiEffectValue');
  if (effect) effect.textContent = find('effect', applied.effect)?.name || 'Nessuno';
}
// Animation only while Oggi is on screen and the app is visible.
function syncPause() {
  const home = $('home');
  const paused = document.hidden || !home?.classList.contains('active') || document.documentElement.classList.contains('us-app-locked');
  document.documentElement.classList.toggle('us-oggi-fx-paused', paused);
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
  const photo = snapshot.photo ? ` style="--look-photo:${esc(snapshot.photo)}"` : '';
  return `<span class="us-look-phone${compact ? ' is-compact' : ''}" data-oggi-theme="${esc(theme)}"${photo}>
    <span class="us-look-photo"></span><span class="us-look-shade"></span><span class="us-oggi-tint"></span><span class="us-oggi-deco"></span>
    <span class="us-oggi-fx" data-fx="${esc(effect)}">${effect === 'none' ? '' : fxMarkup(effect, { scale: compact ? 0.6 : 1 })}</span>
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
  if (s.state === 'locked') return `<em class="us-look-chip is-locked">${icon('lock-simple')}Livello ${s.level}</em>`;
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
    ? 'Cambia l’atmosfera di Oggi: luce, colori e dettagli. La foto resta vostra.'
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
  const action = s.state === 'locked'
    ? `<button type="button" class="us-look-apply" disabled>${icon('lock-simple')}Si sblocca al livello ${s.level} di Sintonia</button>`
    : current
      ? `<button type="button" class="us-look-apply is-current" disabled>${icon('check')}In uso su Oggi</button>`
      : `<button type="button" class="us-look-apply primary" data-look-apply="${esc(look.id)}">Usa su Oggi</button>`;
  return `<div class="us-look-detail-stage">${phoneMarkup(theme, effect, heroSnapshot())}</div>
    <div class="us-look-detail-copy">
      <small>${esc(look.kicker || (tab === 'theme' ? 'TEMA DI OGGI' : 'EFFETTO DI OGGI'))}</small>
      <h3>${esc(look.name)}</h3><p>${esc(look.note)}</p>
      ${action}
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
        <button type="button" class="us-look-icon-btn" data-look-close aria-label="Chiudi">${icon('x')}</button>
        <h2 id="usLookTitle">Personalizza Oggi</h2>
        <button type="button" class="us-look-reset" data-look-reset>Ripristina</button>
      </header>
      <div class="us-look-tabs" role="tablist" aria-label="Temi ed effetti" data-active="theme">
        <button type="button" role="tab" id="usLookTabTheme" data-look-tab="theme" aria-selected="true">Temi</button>
        <button type="button" role="tab" id="usLookTabEffect" data-look-tab="effect" aria-selected="false">Effetti</button>
      </div>
      <div class="us-look-body" id="usLookBody" role="tabpanel" aria-labelledby="usLookTabTheme"></div>
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
  const reset = sheet.querySelector('[data-look-reset]');
  reset.disabled = applied.theme === DEFAULTS.theme && applied.effect === DEFAULTS.effect;
}
function renderDetail() {
  const body = $('usLookDetailBody');
  if (body) body.innerHTML = detailMarkup();
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
function refreshOpenSheet() {
  if (!sheet?.classList.contains('open')) return;
  if ($('usLookDetail')?.classList.contains('open')) renderDetail();
  else renderGallery();
}

function boot() {
  ensureLayers();
  syncPause();
  document.addEventListener('visibilitychange', syncPause);
  const home = $('home');
  if (home && typeof MutationObserver === 'function') new MutationObserver(syncPause).observe(home, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('us:progression-updated', refreshOpenSheet);
  // Reduced motion can change while US is open; particles re-render static.
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', () => {
    const fx = document.querySelector('#homeHero > .us-oggi-fx');
    if (fx) { fx.dataset.fx = ''; apply(applied); }
  });
  paintSettings();
}

window.USOggiLook = Object.freeze({
  THEMES, EFFECTS, DEFAULTS,
  find, status, usable, apply,
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
