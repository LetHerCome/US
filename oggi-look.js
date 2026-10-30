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
const THEMES = Object.freeze([
  { id: 'original', name: 'Originale', note: 'Il vostro Oggi di sempre, senza aggiunte.', reward: null },
  { id: 'romantic', name: 'Romantico', note: 'Rosa delicato e luce morbida sulla vostra foto.', reward: null },
  { id: 'pastel', name: 'Sogno pastello', note: 'Colori chiari e leggeri, come un acquerello.', reward: null },
  { id: 'cinematic', name: 'Cinema', note: 'Bande nere, grana e il tempo come titoli di testa.', reward: 'oggi_theme_cinematic', level: 4 },
  { id: 'moonlight', name: 'Chiaro di luna', note: 'Notte blu, stelle e un riflesso di luna.', reward: 'oggi_theme_moonlight', level: 6 },
  // Premi Sintonia V2 (29/10/2026): the seasonal theme follows the season by itself.
  // Premi Sintonia V2: the headline of level 20, the couple's own sky.
  { id: 'sky', name: 'Il vostro cielo', kicker: 'Leggenda', note: 'Le stelle della sera in cui vi siete messi insieme, sopra la vostra città.', reward: 'sky_ours', level: 20 },
  { id: 'seasonal', name: 'Stagioni', kicker: 'Stagioni', note: 'Cambia da solo: fiori in primavera, sole d’estate, foglie d’autunno, neve d’inverno.', reward: 'oggi_theme_seasonal', level: 10 }
]);
const EFFECTS = Object.freeze([
  { id: 'none', name: 'Nessuno', note: 'Solo la vostra foto.', reward: null, count: 0 },
  { id: 'hearts', name: 'Cuori delicati', note: 'Piccoli cuori salgono piano.', reward: null, count: 9 },
  { id: 'stars', name: 'Stelle luminose', note: 'Stelle che brillano a turno.', reward: null, count: 12 },
  { id: 'petals', name: 'Petali fluttuanti', note: 'Petali rosa scendono nel vento.', reward: 'oggi_effect_petals', level: 2, count: 10 },
  { id: 'fireflies', name: 'Lucciole', note: 'Punti di luce calda vagano lenti.', reward: 'oggi_effect_fireflies', level: 4, count: 10 },
  { id: 'bokeh', name: 'Luci sfocate', note: 'Come le luci di una sera in città.', reward: 'oggi_effect_bokeh', level: 8, count: 7 },
  { id: 'snow', name: 'Neve', note: 'Fiocchi leggeri, mai una bufera.', reward: 'oggi_effect_snow', level: 11, count: 16 },
  // Premi Sintonia V2: the Plus extra of level 4 (the server says it needs Plus).
  { id: 'aurora', name: 'Aurora', note: 'Una luce che danza sopra la vostra foto, come un’aurora boreale.', reward: 'oggi_effect_aurora', level: 4, count: 4 }
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

// ---------- Il vostro cielo (Premi Sintonia V2, livello 20) ----------
// The stars of «Insieme dal» at their hour (22:00 unless they say) over the
// couple's city (sky.js), as the decoration of the theme. The catalogue is
// fetched only when the sky is shown.
let skyStars = null;
let skyLoading = null;
let skyKey = '';
let skyMap = '';
// City and hour chosen on this phone, ahead of the next couple reload.
let skyChosen = null;
function skyContext() {
  const couple = window.UsCoupleContext?.snapshot?.()?.couple || {};
  const level = Number(window.USProgression?.getState?.()?.level) || 20;
  const cityId = skyChosen?.city || couple.sky_city || '';
  const minutes = skyChosen ? skyChosen.minutes : (couple.sky_minutes ?? null);
  return { day: couple.started_on || '', cityId, minutes, level };
}
function loadStars() {
  if (skyStars || skyLoading || !window.UsSky?.loadStars) return skyLoading;
  skyLoading = window.UsSky.loadStars().then((stars) => {
    skyLoading = null;
    skyStars = stars;
    if (skyStars) { apply(applied); refreshOpenSheet(); }
  });
  return skyLoading;
}
// A CSS url() of the map, or '' while the stars load or without a date.
function skyMapUrl() {
  const { day, cityId, minutes, level } = skyContext();
  const city = window.UsSky?.cityById?.(cityId) || window.UsSky?.cityById?.('roma');
  if (!window.UsSky || !day || !city) return '';
  if (!skyStars) { loadStars(); return ''; }
  const key = `${day}|${city.id}|${minutes}|${level}`;
  if (key !== skyKey) {
    const stars = skyStars;
    // Over the photo, never instead of it (founder, 29/10): the overlay variant.
    const svg = window.UsSky.skySvg({ stars, day, city, level, minutes, overlay: true });
    skyMap = svg ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")` : '';
    skyKey = key;
  }
  return skyMap;
}
// The hour can come before the city: it is kept here and saved with the city.
async function setSky(cityId, minutes) {
  if (!window.UsSky?.saveSky) return;
  if (cityId && !(await window.UsSky.saveSky(cityId, minutes))) { $('usLookStatus').textContent = 'Non riesco a salvare il vostro cielo. Riprova.'; return; }
  skyChosen = { city: cityId, minutes };
  skyKey = '';
  apply(applied);
  renderDetail();
}
// «Salva l'immagine»: the map with its title, date, city and hour (sky.js).
function saveSkyPicture() {
  const { day, cityId, minutes, level } = skyContext();
  const city = window.UsSky?.cityById?.(cityId);
  if (!skyStars || !city || !day) return Promise.resolve(false);
  return window.UsSky.savePicture({ stars: skyStars, day, city, level, minutes });
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
  snow: { s: [3, 6.5], d: [9, 17], o: [0.5, 0.95], drift: [-28, 28] },
  aurora: { s: [170, 240], d: [10, 16], o: [0.75, 1], drift: [-40, 40], y: [-8, 18] }
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
  if (theme === 'seasonal') root.dataset.usOggiSeason = seasonFor(); else delete root.dataset.usOggiSeason;
  const map = theme === 'sky' ? skyMapUrl() : '';
  if (map) root.style.setProperty('--oggi-sky-map', map); else root.style?.removeProperty?.('--oggi-sky-map');
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
  if (theme) theme.textContent = find('theme', applied.theme)?.name || 'Originale';
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
  const vars = [snapshot.photo ? `--look-photo:${snapshot.photo}` : '', theme === 'sky' && skyMapUrl() ? `--oggi-sky-map:${skyMapUrl()}` : ''].filter(Boolean).join(';');
  const photo = vars ? ` style="${esc(vars)}"` : '';
  return `<span class="us-look-phone${compact ? ' is-compact' : ''}" data-oggi-theme="${esc(theme)}"${theme === 'seasonal' ? ` data-oggi-season="${esc(seasonFor())}"` : ''}${photo}>
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
  // Il vostro cielo: the city and the hour first («Dove eravate quella sera?»,
  // «A che ora vi siete messi insieme?», 22:00 unless they say), then the picture to keep.
  const sky = tab === 'theme' && look.id === 'sky' && s.state !== 'locked';
  const { cityId, minutes } = sky ? skyContext() : { cityId: '', minutes: null };
  const cities = sky && window.UsSky ? `<label class="us-look-sky-city"><span>Dove eravate quella sera?</span><select id="usSkyCity">${cityId ? '' : '<option value="">Scegli la città</option>'}${window.UsSky.CITIES.map((c) => `<option value="${esc(c.id)}"${c.id === cityId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="us-look-sky-city"><span>A che ora vi siete messi insieme?</span><input type="time" id="usSkyTime" value="${window.UsSky.clock(minutes)}"></label>` : '';
  const save = sky && cityId && skyStars ? '<button type="button" class="us-look-save" data-look-save-sky>Salva l’immagine</button>' : '';
  const action = sky && !cityId
    ? `<button type="button" class="us-look-apply" disabled>Scegli prima la città</button>`
    : s.state === 'locked'
    ? `<button type="button" class="us-look-apply" disabled>${icon('lock-simple')}Si sblocca al livello ${s.level} di Sintonia${s.plus ? ' con US Plus' : ''}</button>`
    : current
      ? `<button type="button" class="us-look-apply is-current" disabled>${icon('check')}In uso su Oggi</button>`
      : `<button type="button" class="us-look-apply primary" data-look-apply="${esc(look.id)}">Usa su Oggi</button>`;
  return `<div class="us-look-detail-stage">${phoneMarkup(theme, effect, heroSnapshot())}</div>
    <div class="us-look-detail-copy">
      <small>${esc(look.kicker || (tab === 'theme' ? 'TEMA DI OGGI' : 'EFFETTO DI OGGI'))}</small>
      <h3>${esc(look.name)}</h3><p>${esc(look.note)}</p>
      ${cities}${action}${save}
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
  sheet.addEventListener('change', (event) => {
    if (event.target?.id !== 'usSkyCity' && event.target?.id !== 'usSkyTime') return;
    const time = /^(\d{2}):(\d{2})/.exec($('usSkyTime')?.value || '');
    setSky($('usSkyCity')?.value || '', time ? Number(time[1]) * 60 + Number(time[2]) : null);
  });
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
  if (target.hasAttribute('data-look-save-sky')) return saveSkyPicture().catch(() => { $('usLookStatus').textContent = 'Non riesco a salvare l’immagine. Riprova.'; });
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
