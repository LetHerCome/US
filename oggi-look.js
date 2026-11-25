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
// Premi di Oggi (grill D4, D9, D14, 25/11/2026): Sogno pastello, Cinema and
// Il vostro cielo left; whoever had them is back on Originale.
const THEMES = Object.freeze([
  { id: 'original', name: 'Originale', note: 'Il vostro Oggi di sempre, senza aggiunte.', reward: null },
  { id: 'romantic', name: 'Romantico', note: 'Rosa delicato e luce morbida sulla vostra foto.', reward: null },
  { id: 'moonlight', name: 'Chiaro di luna', note: 'Notte blu, stelle e un riflesso di luna.', reward: 'oggi_theme_moonlight', level: 6 },
  { id: 'seasonal', name: 'Stagioni', kicker: 'Stagioni', note: 'Cambia da solo: fiori in primavera, sole d’estate, foglie d’autunno, neve d’inverno.', reward: 'oggi_theme_seasonal', level: 12 }
]);
// Premi di Oggi (grill D3, D8, D14 and the tavola, 25/11/2026): three steps
// that grow with the level, drawn by oggi-fx.js. Stelle luminose, Lucciole,
// Luci sfocate and Aurora left; whoever had them is back on Nessuno.
const EFFECTS = Object.freeze([
  { id: 'none', name: 'Nessuno', note: 'Solo la vostra foto.', reward: null },
  { id: 'hearts', name: 'Cuori', step: 'Base', note: 'Coppie di cuori nei vostri due colori che si cercano salendo e si incontrano.', reward: null },
  { id: 'petals', name: 'Petali', step: 'Base', note: 'Tre forme vere di petalo che girano mentre cadono nel vento.', reward: null },
  { id: 'dandelions', name: 'Soffioni', step: 'Natura', note: 'Semi di tarassaco col loro ombrellino di fili, uno per colore, che salgono piano.', reward: 'oggi_effect_dandelions', level: 4 },
  { id: 'snow', name: 'Neve', step: 'Natura', note: 'Fiocchi disegnati su tre profondità, lontani, a metà e vicini.', reward: 'oggi_effect_snow', level: 7 },
  { id: 'leaves', name: 'Foglie', step: 'Natura', note: 'Foglie d’acero e d’autunno che ondeggiano, si posano e svaniscono.', reward: 'oggi_effect_leaves', level: 10 },
  { id: 'shooting', name: 'Stelle cadenti', step: 'Vostri', note: 'Un cielo che brilla piano e ogni tanto una scia nei vostri colori.', reward: 'oggi_effect_shooting', level: 13 },
  { id: 'lanterns', name: 'Lanterne', step: 'Vostri', note: 'Lanterne di carta che salgono, ognuna con la luce di uno di voi due.', reward: 'oggi_effect_lanterns', level: 16 },
  { id: 'memories', name: 'Ricordi in volo', step: 'Vostri', kicker: 'Il più vostro', note: 'Piccole polaroid delle vostre foto galleggiano dietro il conto, col nastro di chi le ha aggiunte.', reward: 'oggi_effect_memories', level: 20 }
]);
// What the finger does in Foto a fuoco, said once in the preview.
const TOUCH = Object.freeze({
  hearts: 'Tocca un cuore: scoppia. Tocca il vuoto: parte una coppia dal dito.',
  petals: 'Tocca: i petali vicini volano via girando.',
  dandelions: 'Tocca: soffi via i semi vicini e ne liberi altri.',
  snow: 'Tocca: un soffio sul vetro e un po’ di neve fine.',
  leaves: 'Tocca: le foglie vicine saltano e ruzzolano.',
  shooting: 'Tocca: parte una stella. Scorri: la lanci tu.',
  lanterns: 'Tocca: una lanterna parte dal dito. Scorri: fai vento.',
  memories: 'Tocca una polaroid: si apre quel ricordo. Scorri: le lanci.'
});
const CATALOG = { theme: THEMES, effect: EFFECTS };
const DEFAULTS = { theme: 'original', effect: 'none' };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name) => `<span class="us-icon" data-us-icon="${name}" aria-hidden="true"></span>`;
const find = (slot, id) => (CATALOG[slot] || []).find((look) => look.id === id) || null;
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

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
  // Foto a fuoco with an effect on: a tap plays with the effect, so the way
  // back to Oggi is this pill (and the back gesture).
  let exit = hero.querySelector(':scope > .us-oggi-focus-exit');
  if (!exit) {
    exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'us-oggi-focus-exit';
    exit.textContent = 'Torna a Oggi';
    exit.addEventListener('click', (event) => { event.stopPropagation(); window.toggleOggiFocusPhoto?.(); });
    hero.appendChild(exit);
  }
  return { hero, fx: hero.querySelector(':scope > .us-oggi-fx') };
}
let heroFx = null;
function apply(next = {}) {
  const theme = find('theme', next.theme) ? next.theme : DEFAULTS.theme;
  const effect = find('effect', next.effect) ? next.effect : DEFAULTS.effect;
  const root = document.documentElement;
  if (theme === DEFAULTS.theme) delete root.dataset.usOggiTheme; else root.dataset.usOggiTheme = theme;
  if (theme === 'seasonal') root.dataset.usOggiSeason = seasonFor(); else delete root.dataset.usOggiSeason;
  if (effect === DEFAULTS.effect) delete root.dataset.usOggiEffect; else root.dataset.usOggiEffect = effect;
  const layers = ensureLayers();
  if (layers?.fx && (layers.fx.dataset.fx || DEFAULTS.effect) !== effect) {
    layers.fx.dataset.fx = effect;
    if (effect === DEFAULTS.effect) { heroFx?.destroy(); heroFx = null; layers.fx.innerHTML = ''; }
    else if (heroFx && heroFx.canvas.isConnected) heroFx.set(effect);
    else heroFx = window.UsOggiFx?.mount(layers.fx, effect, { hero: true }) || null;
  }
  applied = { theme, effect };
  paintSettings();
  return applied;
}
// Grill D12: the effect shines brighter for a few seconds on a Ti penso
// received, a special day and a new level. Nothing with reduced motion.
function burst() { if (applied.effect !== DEFAULTS.effect) heroFx?.burst(); }

// ---------- Foto a fuoco: the finger plays with the effect ----------
const inFocus = () => Boolean($('homeHero')?.classList.contains('us-oggi-focus'));
const touchActive = () => inFocus() && applied.effect !== DEFAULTS.effect && Boolean(heroFx);
let gesture = null;
function local(event) { const r = heroFx.canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; }
function bindTouch(hero) {
  if (!hero || hero.dataset.usOggiTouch) return;
  hero.dataset.usOggiTouch = '1';
  hero.addEventListener('pointerdown', (event) => {
    if (!touchActive() || event.button > 0 || event.target.closest?.('button,a,input')) return;
    const [x, y] = local(event);
    gesture = { x0: x, y0: y, pts: [[x, y, performance.now()]], moved: false };
    hero.setPointerCapture?.(event.pointerId);
  });
  hero.addEventListener('pointermove', (event) => {
    if (!gesture || !touchActive()) return;
    const [x, y] = local(event);
    gesture.pts.push([x, y, performance.now()]); if (gesture.pts.length > 30) gesture.pts.shift();
    if (!gesture.moved && Math.hypot(x - gesture.x0, y - gesture.y0) > 14) gesture.moved = true;
    if (gesture.moved && heroFx.answersSwipe()) heroFx.drag(x, y);
  });
  hero.addEventListener('pointerup', (event) => {
    if (!gesture || !touchActive()) { gesture = null; return; }
    const [x, y] = local(event), g = gesture; gesture = null;
    if (g.moved && heroFx.answersSwipe()) {
      const a = g.pts[Math.max(0, g.pts.length - 6)], ms = Math.max(16, performance.now() - a[2]);
      heroFx.swipe(g.x0, g.y0, x, y, (x - a[0]) / ms * 1000, (y - a[1]) / ms * 1000);
    } else heroFx.tap(g.x0, g.y0);
  });
  hero.addEventListener('pointercancel', () => { gesture = null; });
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
  if (!paused) { window.UsOggiFx?.wake(); specialDayBurst(); }
}
// Grill D12: on a special day (mesiversario, anniversary, 100, 200… days: the
// characters' festa) the effect shines brighter once, the first time Oggi shows.
function specialDayBurst() {
  if (applied.effect === DEFAULTS.effect) return;
  let festa = false;
  try { festa = window.UsPersonaggi?.reactionOf?.(window.usProfile?.role || '') === 'festa'; } catch (_) { festa = false; }
  if (!festa) return;
  const key = `us:oggi-fx:festa:${new Date().toISOString().slice(0, 10)}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (_) { /* no storage: still once per open */ }
  setTimeout(burst, 900);
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
  const photo = snapshot.photo ? ` style="${esc(`--look-photo:${snapshot.photo}`)}"` : '';
  return `<span class="us-look-phone${compact ? ' is-compact' : ''}" data-oggi-theme="${esc(theme)}"${theme === 'seasonal' ? ` data-oggi-season="${esc(seasonFor())}"` : ''}${photo}>
    <span class="us-look-photo"></span><span class="us-look-shade"></span><span class="us-oggi-tint"></span><span class="us-oggi-deco"></span>
    <span class="us-oggi-fx" data-fx="${esc(effect)}" data-fx-scale="${compact ? '0.55' : '0.9'}"></span>
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
    ? 'Cambia il tema di Oggi: luce, colori e dettagli. La vostra foto non cambia.'
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
  const touch = tab === 'effect' && TOUCH[look.id] ? `<p class="us-look-touch">${esc(TOUCH[look.id])} In Foto a fuoco.</p>` : '';
  const action = s.state === 'locked'
    ? `<button type="button" class="us-look-apply" disabled>${icon('lock-simple')}Si sblocca al livello ${s.level} di Sintonia${s.plus ? ' con US Plus' : ''}</button>`
    : current
      ? `<button type="button" class="us-look-apply is-current" disabled>${icon('check')}In uso su Oggi</button>`
      : `<button type="button" class="us-look-apply primary" data-look-apply="${esc(look.id)}">Usa su Oggi</button>`;
  return `<div class="us-look-detail-stage">${phoneMarkup(theme, effect, heroSnapshot())}</div>
    <div class="us-look-detail-copy">
      <small>${esc(look.kicker || (tab === 'theme' ? 'TEMA DI OGGI' : look.step ? `EFFETTO DI OGGI · ${look.step.toUpperCase()}` : 'EFFETTO DI OGGI'))}</small>
      <h3>${esc(look.name)}</h3><p>${esc(look.note)}</p>
      ${touch}${action}
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
  mountPreviews(body);
  const reset = sheet.querySelector('[data-look-reset]');
  reset.disabled = applied.theme === DEFAULTS.theme && applied.effect === DEFAULTS.effect;
}
function renderDetail() {
  const body = $('usLookDetailBody');
  if (body) { body.innerHTML = detailMarkup(); mountPreviews(body); }
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
// The previews are painted by the same engine as Oggi, so a preview is what lands on Oggi.
function mountPreviews(root) {
  if (!window.UsOggiFx || !root?.querySelectorAll) return;
  for (const el of root.querySelectorAll('.us-oggi-fx[data-fx]')) {
    const id = el.dataset.fx;
    if (id && id !== DEFAULTS.effect && window.UsOggiFx.supports(id)) window.UsOggiFx.mount(el, id, { scale: Number(el.dataset.fxScale) || 0.6 });
  }
}
function refreshOpenSheet() {
  if (!sheet?.classList.contains('open')) return;
  if ($('usLookDetail')?.classList.contains('open')) renderDetail();
  else renderGallery();
}

function boot() {
  ensureLayers();
  bindTouch($('homeHero'));
  syncPause();
  document.addEventListener('visibilitychange', syncPause);
  const home = $('home');
  if (home && typeof MutationObserver === 'function') new MutationObserver(syncPause).observe(home, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('us:progression-updated', refreshOpenSheet);
  // Reduced motion can change while US is open: the effect starts again, still or moving.
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', () => {
    if (heroFx) heroFx.set(applied.effect); else window.UsOggiFx?.wake();
  });
  paintSettings();
}

window.USOggiLook = Object.freeze({
  THEMES, EFFECTS, DEFAULTS,
  find, status, usable, apply, burst, touchActive, mountPreviews,
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
