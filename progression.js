(() => {
'use strict';
if (window.__usProgressionV1Installed) return;
window.__usProgressionV1Installed = true;

const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const US_SYMBOL = '/assets/derived/runtime/us-symbol-256-v1.png';
let state = null;
let loading = null;
let refreshTimer = null;
let unlockQueue = [];
let unlockIndex = 0;
let unlockBusy = false;

// Rewards V2 — one independent slot per category. The server owns progression,
// catalog and unlock eligibility. What each phone equips is intentionally local
// to that installed PWA, so Francesco and Bea can personalize US independently.
//
// V3 — Oggi themes and Oggi effects are two more slots of this same system
// (`look` slots): their value is a look id from USOggiLook, free looks need no
// reward, the others name the server reward that entitles them. Frames and
// stickers are no longer rewards, and badges/rings lost their visible place
// with Noi V2: those `retired` slots are kept only so stored choices and
// unlock history stay readable; they are never painted nor offered again.
const SLOTS = Object.freeze({
  oggi_theme: { pref: 'oggi_theme', look: 'theme', label: 'Temi di Oggi', place: 'atmosfera, foto e countdown', unlock: 'NUOVO TEMA DI OGGI', where: 'Su Oggi, attorno alla vostra foto' },
  oggi_effect: { pref: 'oggi_effect', look: 'effect', label: 'Effetti di Oggi', place: 'sopra la vostra foto', unlock: 'NUOVO EFFETTO DI OGGI', where: 'Su Oggi, sopra la foto' },
  theme: { pref: 'theme_reward_id', label: 'Atmosfera US', place: 'lo sfondo di tutta US', unlock: 'NUOVA ATMOSFERA', where: 'In tutta US' },
  accent: { pref: 'accent_reward_id', label: 'Accenti', place: 'controlli, progressi, navigazione', unlock: 'NUOVO ACCENTO', where: 'Su controlli, progressi e navigazione' },
  effect: { pref: 'effect_reward_id', label: 'Simbolo US', place: 'il simbolo in alto', unlock: 'NUOVO EFFETTO DEL SIMBOLO', where: 'Sul simbolo US, in alto' },
  frame: { pref: 'frame_reward_id', retired: true, label: 'Cornici', place: 'sulla foto di Oggi', unlock: 'NUOVA CORNICE', where: 'Sulla foto di Oggi' },
  sticker: { pref: 'sticker_reward_id', retired: true, label: 'Adesivi', place: 'su Oggi e sull’ultimo ricordo', unlock: 'NUOVO ADESIVO', where: 'Su Oggi e sull’ultimo ricordo' },
  badge: { pref: 'badge_reward_id', retired: true, label: 'Spille', place: 'tra voi due, in Noi', unlock: 'NUOVA SPILLA', where: 'In Noi, tra i vostri ritratti' },
  ring: { pref: 'ring_reward_id', retired: true, label: 'Anelli', place: 'attorno ai vostri ritratti', unlock: 'NUOVO ANELLO', where: 'In Noi, attorno ai vostri ritratti' }
});
const SLOT_ORDER = Object.keys(SLOTS);
const VISIBLE_SLOTS = SLOT_ORDER.filter((category) => !SLOTS[category].retired);
const LOOK_SLOT = Object.freeze({ theme: 'oggi_theme', effect: 'oggi_effect' });
const COUNTDOWN_PRESENTATION = Object.freeze({ label: 'Stili Countdown', unlock: 'NUOVO STILE COUNTDOWN', where: 'Sul countdown di Oggi' });
const DEVICE_PREFS_VERSION = 2;
const DEVICE_PREFS_PREFIX = 'us:cosmetics:v1:';

function devicePreferenceKey() {
  const profile = window.usProfile;
  if (!profile?.id || !profile?.couple_id) return '';
  return `${DEVICE_PREFS_PREFIX}${profile.couple_id}:${profile.id}`;
}
function emptyDevicePreferences() {
  return SLOT_ORDER.reduce((prefs, category) => {
    prefs[SLOTS[category].pref] = null;
    return prefs;
  }, {});
}
// A look is usable when it is free, or when its entitling reward is unlocked.
function lookEntitled(category, id, rewards) {
  const look = window.USOggiLook?.find?.(SLOTS[category].look, id);
  if (!look) return false;
  if (!look.reward) return true;
  return rewards.some((item) => item.id === look.reward && item.unlocked);
}
function sanitizeDevicePreferences(candidate, next) {
  const prefs = emptyDevicePreferences();
  const rewards = Array.isArray(next?.rewards) ? next.rewards : [];
  for (const category of SLOT_ORDER) {
    const pref = SLOTS[category].pref;
    const id = typeof candidate?.[pref] === 'string' ? candidate[pref] : null;
    if (SLOTS[category].look) {
      if (id && lookEntitled(category, id, rewards)) prefs[pref] = id;
      continue;
    }
    const reward = id ? rewards.find((item) => item.id === id) : null;
    if (reward?.unlocked && reward.category === category) prefs[pref] = reward.id;
  }
  return prefs;
}
function persistDevicePreferences(prefs) {
  const key = devicePreferenceKey();
  if (!key) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      version: DEVICE_PREFS_VERSION,
      couple_id: window.usProfile.couple_id,
      profile_id: window.usProfile.id,
      preferences: prefs
    }));
    return true;
  } catch (error) {
    console.warn('[US Progression] device preferences', error);
    return false;
  }
}
function readDevicePreferences(next) {
  const fresh = sanitizeDevicePreferences({}, next);
  const key = devicePreferenceKey();
  if (!key) return fresh;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (saved?.version === DEVICE_PREFS_VERSION && saved?.preferences) {
      return sanitizeDevicePreferences(saved.preferences, next);
    }
    if (saved?.version === 1 && saved?.preferences) {
      // V1 was introduced with a compatibility seed that copied the old
      // couple-level equipped look onto every phone. Bea's first login happened
      // during that window, so reset that contaminated seed once. Francesco's
      // already-local choices are migrated intact.
      const migrated = window.usProfile?.role === 'beatrice'
        ? fresh
        : sanitizeDevicePreferences(saved.preferences, next);
      persistDevicePreferences(migrated);
      return migrated;
    }
  } catch (error) {
    console.warn('[US Progression] read device preferences', error);
  }
  // A phone with no local cosmetic state starts from the standard US look.
  persistDevicePreferences(fresh);
  return fresh;
}
function applyDevicePreferences(next) {
  if (!next) return next;
  const prefs = readDevicePreferences(next);
  next.preferences = prefs;
  next.rewards = (Array.isArray(next.rewards) ? next.rewards : []).map((reward) => ({
    ...reward,
    equipped: Boolean(reward.unlocked && SLOTS[reward.category] && prefs[SLOTS[reward.category].pref] === reward.id)
  }));
  return next;
}
function setDeviceReward(reward, { ensureEquipped = false } = {}) {
  if (!state || !reward?.unlocked || !SLOTS[reward.category] || SLOTS[reward.category].retired || SLOTS[reward.category].look) return false;
  const pref = SLOTS[reward.category].pref;
  const prefs = { ...emptyDevicePreferences(), ...(state.preferences || {}) };
  const alreadyEquipped = prefs[pref] === reward.id;
  if (ensureEquipped && alreadyEquipped) return true;
  prefs[pref] = alreadyEquipped ? null : reward.id;
  if (!persistDevicePreferences(prefs)) return false;
  state.preferences = prefs;
  state.rewards = state.rewards.map((item) => ({
    ...item,
    equipped: Boolean(item.unlocked && SLOTS[item.category] && prefs[SLOTS[item.category].pref] === item.id)
  }));
  return true;
}

// V3 — choose an Oggi look on this phone. 'original'/'none' store null.
function setDeviceLook(slot, id) {
  const category = LOOK_SLOT[slot];
  if (!category || !devicePreferenceKey()) return false;
  const fallback = window.USOggiLook?.DEFAULTS?.[slot];
  const value = !id || id === fallback ? null : id;
  if (value && !lookEntitled(category, value, state?.rewards || [])) return false;
  const prefs = { ...emptyDevicePreferences(), ...(state?.preferences || earlyPreferences() || {}) };
  prefs[SLOTS[category].pref] = value;
  if (!persistDevicePreferences(prefs)) return false;
  if (state) state.preferences = prefs;
  applyLook(prefs);
  if (state) renderRewards(state);
  window.dispatchEvent(new CustomEvent('us:progression-updated'));
  return true;
}
function applyLook(prefs) {
  window.USOggiLook?.apply?.({ theme: prefs?.oggi_theme || undefined, effect: prefs?.oggi_effect || undefined });
}
// Before the server answers, paint this phone's last Oggi look from storage so
// a restart does not flash the original look; hydrate re-checks entitlement.
function earlyPreferences() {
  const key = devicePreferenceKey();
  if (!key) return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
    return saved?.version === DEVICE_PREFS_VERSION && saved.preferences ? saved.preferences : null;
  } catch (_) { return null; }
}

// Countdown styles are not a second catalog: USCountdown.STYLES names the
// existing reward that entitles each premium style, and only that row decides.
function countdownStyles() {
  const styles = window.USCountdown?.STYLES;
  return Array.isArray(styles) ? styles : [];
}
function countdownStyleFor(reward) {
  return reward?.id ? countdownStyles().find((style) => style.reward === reward.id) || null : null;
}
function countdownPreview(styleId) {
  return window.USCountdown?.previewMarkup?.(styleId) || '';
}

function rewardById(id) {
  return state?.rewards?.find((reward) => reward.id === id) || null;
}
function rewardToken(id) {
  return rewardById(id)?.token || '';
}
function cleanToken(token, prefix) {
  return String(token || '').startsWith(prefix) ? String(token).slice(prefix.length) : '';
}
function slotValue(category, token) {
  return cleanToken(token, `${category}_`).replace(/[^a-z0-9_]/g, '');
}

// ---------- shared cosmetic markup (real UI + previews use the same nodes) ----------
function lookForReward(reward) {
  for (const slot of ['theme', 'effect']) {
    const list = slot === 'theme' ? window.USOggiLook?.THEMES : window.USOggiLook?.EFFECTS;
    const look = Array.isArray(list) ? list.find((item) => item.reward === reward?.id) : null;
    if (look) return { slot, look };
  }
  return null;
}
// How a reward is presented now: an Oggi look, a countdown style (the three
// legacy rewards that entitle one), a visible slot, or not at all.
function presentation(reward) {
  if (!reward) return null;
  const style = countdownStyleFor(reward);
  if (style) return { kind: 'countdown', style, ...COUNTDOWN_PRESENTATION };
  const slot = SLOTS[reward.category];
  if (!slot || slot.retired) return null;
  if (slot.look && !lookForReward(reward)) return null;
  return { kind: reward.category, ...slot };
}
const presented = (reward) => Boolean(presentation(reward));
function previewMarkup(reward) {
  const category = reward?.category;
  if (SLOTS[category]?.look) {
    const found = lookForReward(reward);
    return found ? window.USOggiLook.previewMarkup(found.slot, found.look.id) : '<span class="us-cos-stage"></span>';
  }
  const style = countdownStyleFor(reward);
  if (style && SLOTS[category]?.retired) return `<span class="us-cos-stage us-cos-countdown">${countdownPreview(style.id)}</span>`;
  const value = slotValue(category, reward?.token);
  if (category === 'theme') return `<span class="us-cos-theme" data-theme="${esc(value)}"><i class="us-cos-theme-bar"></i><i class="us-cos-theme-card"></i><i class="us-cos-theme-pill"></i></span>`;
  if (category === 'accent') return `<span class="us-cos-accent" data-accent="${esc(value)}"><i class="us-cos-accent-track"><i></i></i><i class="us-cos-accent-pill"></i><i class="us-cos-accent-nav"><i></i><i></i><i></i></i></span>`;
  if (category === 'effect') return `<span class="us-cos-stage"><span class="us-cos-logo" data-effect="${esc(value)}"><img src="${US_SYMBOL}" alt="" decoding="async" draggable="false"></span></span>`;
  return '<span class="us-cos-stage"></span>';
}

// ---------- applying the equipped slots to the real UI ----------
// Retired slots (frames, stickers, badges, rings) are never painted again;
// their stored choice stays untouched so nothing is lost or reset.
function clearRetiredCosmetics(root, hero) {
  delete root.dataset.usRing;
  delete root.dataset.usSticker;
  if (hero) delete hero.dataset.usFrame;
  const sticker = $('usHeroSticker');
  if (sticker) { sticker.hidden = true; sticker.innerHTML = ''; }
  const badge = $('usCoupleBadge');
  if (badge) { badge.hidden = true; badge.innerHTML = ''; badge.removeAttribute('aria-label'); }
}
function applyPreferences(next = state) {
  const root = document.documentElement;
  const hero = $('homeHero');
  const prefs = next?.preferences || {};
  const value = (category) => slotValue(category, rewardToken(prefs[SLOTS[category].pref]));
  const theme = value('theme');
  const accent = value('accent');
  const effect = value('effect');
  if (theme) root.dataset.usTheme = theme; else delete root.dataset.usTheme;
  if (accent) root.dataset.usAccent = accent; else delete root.dataset.usAccent;
  if (effect) root.dataset.usEffect = effect; else delete root.dataset.usEffect;
  clearRetiredCosmetics(root, hero);
  applyLook(prefs);
}

// ---------- Due colori · the Sintonia card: two circles, one Noi ----------
// Presentation only. The two person colours never change; the closer the
// couple is to the next level, the more the circles overlap into the Noi lens.
// Numbers come from the existing XP formula (app.js bondLevelInfo).
const reducedMotion = () => document.documentElement?.dataset?.usMotion === 'reduced'
  || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
const levelInfo = (xp) => (typeof window.bondLevelInfo === 'function' ? window.bondLevelInfo(xp) : null);
const rankTitle = (level) => (typeof window.bondRankTitle === 'function' ? window.bondRankTitle(level) : '');
let vennProgress = null;
let vennFrame = 0;
function sintoniaVenn() {
  const card = document.querySelector?.('.noi-resonance');
  if (!card) return null;
  let svg = card.querySelector('.us-sintonia-venn');
  if (!svg) {
    const anchor = card.querySelector('.noi-resonance-top .tiny');
    if (!anchor) return null;
    anchor.insertAdjacentHTML('afterend', '<svg class="us-sintonia-venn" viewBox="0 0 210 120" aria-hidden="true" focusable="false"><circle class="is-a" cy="60" r="50"/><circle class="is-b" cy="60" r="50"/><path class="is-noi"/></svg>');
    svg = card.querySelector('.us-sintonia-venn');
  }
  return svg;
}
function paintLens(svg, p) {
  const R = 50;
  const d = Math.max(0, 86 - 46 * Math.max(0, Math.min(86 / 46, p)));
  const h = Math.sqrt(Math.max(0, R * R - (d / 2) ** 2));
  svg.querySelector('.is-a')?.setAttribute('cx', String(105 - d / 2));
  svg.querySelector('.is-b')?.setAttribute('cx', String(105 + d / 2));
  svg.querySelector('.is-noi')?.setAttribute('d', `M105 ${60 - h}A${R} ${R} 0 0 1 105 ${60 + h}A${R} ${R} 0 0 1 105 ${60 - h}Z`);
}
function renderSintoniaArt(next = state) {
  const svg = sintoniaVenn();
  const info = levelInfo(Number(next?.total_xp) || 0);
  if (!svg || !info) return;
  const to = Math.max(0, Math.min(1, info.current / info.needed));
  const from = vennProgress;
  vennProgress = to;
  window.cancelAnimationFrame?.(vennFrame);
  if (from === null || from === to || reducedMotion() || typeof requestAnimationFrame !== 'function') { paintLens(svg, to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    paintLens(svg, from + (to - from) * (1 - (1 - t) ** 3));
    if (t < 1) vennFrame = requestAnimationFrame(step);
  };
  vennFrame = requestAnimationFrame(step);
}

// ---------- Due colori · the level-up Momento "Orbita" ----------
// The server already returns the couple level; this phone remembers the last
// level it celebrated (a per-device convenience, never progression state).
// A higher level on a later hydrate is the level-up signal: the ring closes,
// the two colours orbit and merge into Noi, the number rolls. Then the
// existing unlock queue takes over. No extra server call.
const LEVEL_SEEN_PREFIX = 'us:sintonia:level-seen:v1:';
let levelMomentOpen = false;
function levelSeenKey() {
  const profile = window.usProfile;
  return profile?.id && profile?.couple_id ? `${LEVEL_SEEN_PREFIX}${profile.couple_id}:${profile.id}` : '';
}
function readSeenLevel() {
  const key = levelSeenKey();
  if (!key) return 0;
  try { return Math.max(0, Number(window.localStorage.getItem(key)) || 0); } catch (_) { return 0; }
}
function writeSeenLevel(level) {
  const key = levelSeenKey();
  if (!key) return false;
  try { window.localStorage.setItem(key, String(level)); return true; } catch (_) { return false; }
}
// true when the celebration took the stage (it hands over to the unlocks).
function celebrateLevelUp(next, pending) {
  const level = Math.floor(Number(next?.level) || 0);
  if (!level || !document.body) return false;
  const seen = readSeenLevel();
  if (!seen || level < seen) { writeSeenLevel(level); return false; }
  if (level === seen || levelMomentOpen || document.hidden || unlockRoot()?.classList?.contains('open')) return false;
  if (!writeSeenLevel(level)) return false;
  showLevelMoment({ from: seen, level, totalXp: Number(next?.total_xp) || 0, unlocks: pending.filter(presented) });
  return true;
}
function showLevelMoment({ from, level, totalXp, unlocks }) {
  const info = levelInfo(totalXp);
  const left = info ? info.needed - info.current : 0;
  const rank = rankTitle(level);
  const fmt = (n) => Number(n).toLocaleString((globalThis.UsI18n?.tag||'it-IT'));
  const dots = Array.from({ length: 12 }, (_, i) => `<circle class="lvx-dot ${i % 2 ? 'is-b' : 'is-a'}" cx="110" cy="110" r="${i % 3 ? 2.6 : 3.6}"/>`).join('');
  const prize = unlocks.length === 1 ? 'Un premio sbloccato' : unlocks.length > 1 ? `${unlocks.length} premi sbloccati` : '';
  const action = unlocks.length === 1 ? 'Scoprilo' : unlocks.length > 1 ? 'Scoprili' : 'Chiudi';
  const root = document.createElement('div');
  root.className = 'us-level-moment';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'usLevelMomentTitle');
  root.innerHTML = `<div class="us-level-moment-body">
    <div class="lvx" aria-hidden="true"><span class="lvx-wash"></span><svg viewBox="0 0 220 220" focusable="false"><circle class="lvx-track" cx="110" cy="110" r="100"/><circle class="lvx-ring" cx="110" cy="110" r="100" pathLength="100"/><circle class="lvx-wave" cx="110" cy="110" r="64"/><g class="lvx-orbit"><circle class="lvx-a" cx="72" cy="110" r="34"/><circle class="lvx-b" cx="148" cy="110" r="34"/></g><circle class="lvx-noi" cx="110" cy="110" r="64"/>${dots}</svg><span class="lvx-num"><span class="lvx-odo"><i>${Math.max(1, from)}</i><i>${level}</i></span></span></div>
    <span class="us-level-moment-kicker">Nuovo livello di Sintonia</span>
    <h2 id="usLevelMomentTitle">Livello <em>${level}</em></h2>
    <p>${esc(rank ? `${rank}. ` : '')}${info ? `${fmt(left)} XP al prossimo livello.` : ''}</p>
    ${prize ? `<span class="us-level-moment-chip">${prize}</span>` : ''}
    <div class="us-level-moment-actions"><button type="button" class="primary" data-us-level-go>${action}</button></div>
  </div>`;
  document.body.appendChild(root);
  levelMomentOpen = true;
  const reduced = reducedMotion();
  const visual = root.querySelector('.lvx');
  const close = () => {
    if (!root.isConnected) return;
    root.removeEventListener('keydown', onKey);
    const done = () => {
      root.remove();
      levelMomentOpen = false;
      if (unlocks.length) startUnlockQueue(unlocks);
      else window.USPet?.react?.('reward');
    };
    if (reduced || typeof root.animate !== 'function') return done();
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'ease-out', fill: 'forwards' }).finished.then(done, done);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  root.addEventListener('keydown', onKey);
  root.querySelector('[data-us-level-go]').addEventListener('click', close);
  const focusLater = (ms) => setTimeout(() => root.querySelector('[data-us-level-go]')?.focus?.({ preventScroll: true }), ms);
  if (reduced || typeof root.animate !== 'function') {
    visual.classList.add('is-done');
    if (!reduced) root.classList.add('is-static');
    window.UsFeedback?.success?.();
    focusLater(0);
    return;
  }
  // The same beats as the approved mockup: 1 the Sintonia ring closes,
  // 2 the two colours orbit closer, 3 they merge into Noi, 4 the number rolls.
  const R1 = 780;
  const M0 = R1 + 640;
  const HOLD = M0 + 480;
  const fromPct = 0.86;
  const fill = { fill: 'both' };
  const io = 'cubic-bezier(.7,0,.2,1)';
  const out = 'cubic-bezier(.2,.8,.2,1)';
  const spring = 'cubic-bezier(.34,1.56,.64,1)';
  const inEase = 'cubic-bezier(.5,0,.9,.45)';
  const q = (selector) => visual.querySelector(selector);
  root.animate([{ clipPath: 'circle(0% at 50% 0%)' }, { clipPath: 'circle(150% at 50% 0%)' }], { duration: 700, easing: io });
  Array.from(root.querySelectorAll('.us-level-moment-body > :not(.lvx)')).forEach((el, i) => {
    el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: HOLD + i * 80, easing: out, fill: 'backwards' });
  });
  q('.lvx-ring').animate([{ strokeDashoffset: 100 - fromPct * 100 }, { strokeDashoffset: 0 }], { duration: R1 - 260, delay: 260, easing: io, ...fill });
  q('.lvx-orbit').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(540deg)' }], { duration: 640, delay: R1, easing: inEase, ...fill });
  q('.lvx-a').animate([{ transform: 'translate(0px,0px) scale(1)', opacity: 1 }, { transform: 'translate(38px,0px) scale(.72)', opacity: 1, offset: 0.92 }, { transform: 'translate(38px,0px) scale(.72)', opacity: 0 }], { duration: 780, delay: R1, easing: inEase, ...fill });
  q('.lvx-b').animate([{ transform: 'translate(0px,0px) scale(1)', opacity: 1 }, { transform: 'translate(-38px,0px) scale(.72)', opacity: 1, offset: 0.92 }, { transform: 'translate(-38px,0px) scale(.72)', opacity: 0 }], { duration: 780, delay: R1, easing: inEase, ...fill });
  q('.lvx-ring').animate([{ opacity: 1, strokeWidth: 4 }, { opacity: 0, strokeWidth: 16 }], { duration: 420, delay: M0, easing: out, ...fill });
  q('.lvx-track').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: M0, ...fill });
  q('.lvx-noi').animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.55 }, { opacity: 1, transform: 'scale(1)' }], { duration: 640, delay: M0, easing: out, ...fill });
  q('.lvx-wave').animate([{ opacity: 0.85, transform: 'scale(.9)', strokeWidth: 8 }, { opacity: 0, transform: 'scale(2.5)', strokeWidth: 1 }], { duration: 820, delay: M0, easing: out, fill: 'forwards' });
  q('.lvx-wash').animate([{ opacity: 0.55, transform: 'scale(0)' }, { opacity: 0, transform: 'scale(24)' }], { duration: 900, delay: M0, easing: out, fill: 'backwards' });
  Array.from(visual.querySelectorAll('.lvx-dot')).forEach((dot, i) => {
    const a = (i / 12) * Math.PI * 2 + 0.25;
    const r = 80 + ((i * 37) % 28);
    dot.animate([{ opacity: 1, transform: 'translate(0px,0px) scale(1)' }, { opacity: 0, transform: `translate(${(Math.cos(a) * r).toFixed(1)}px,${(Math.sin(a) * r).toFixed(1)}px) scale(.4)` }], { duration: 820, delay: M0 + 40, easing: out, fill: 'forwards' });
  });
  q('.lvx-num').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: M0 + 120, ...fill });
  Array.from(visual.querySelectorAll('.lvx-odo i')).forEach((el) => {
    el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 420, delay: M0 + 260, easing: spring, ...fill });
  });
  setTimeout(() => { if (root.isConnected) window.UsFeedback?.success?.(); }, M0);
  focusLater(HOLD + 300);
}

function renderRhythm(next = state) {
  if (!next) return;
  const days = Math.max(0, Number(next.rhythm_days) || 0);
  const compact = days === 1 ? '1 giorno' : `${days} giorni`;
  const value = $('usProgressionRhythmValue');
  const copy = $('usProgressionRhythmCopy');
  if (value) value.textContent = compact;
  if (copy) copy.textContent = next.rhythm_today
    ? 'Oggi ci siete stati.'
    : days > 0 ? 'Una piccola cosa oggi mantiene il Ritmo.' : 'Fate una piccola cosa insieme per iniziare.';
  const hub = $('noiHubResonanceMeta');
  if (hub) hub.textContent = `Livello ${next.level} · Ritmo ${days}`;
}

// The server's next_reward may be a retired category: pick the next reward
// that is still presented, from the same server rows.
function nextPresentedReward(next) {
  const rewards = Array.isArray(next?.rewards) ? next.rewards : [];
  return rewards
    .filter((reward) => !reward.unlocked && presented(reward))
    .sort((a, b) => (Number(a.level_required) || 0) - (Number(b.level_required) || 0))[0] || null;
}
function presentedTitle(reward) {
  const shown = presentation(reward);
  if (shown?.kind === 'countdown') return `Countdown «${shown.style.name}»`;
  if (SLOTS[reward?.category]?.look) return lookForReward(reward)?.look.name || reward.title;
  return reward?.title || '';
}
function presentedDescription(reward) {
  const shown = presentation(reward);
  if (shown?.kind === 'countdown') return shown.style.note || reward.description;
  if (SLOTS[reward?.category]?.look) return lookForReward(reward)?.look.note || reward.description;
  return reward?.description || '';
}
function renderNext(next = state) {
  const root = $('usProgressionNext');
  if (!root) return;
  const reward = nextPresentedReward(next);
  if (!reward) {
    root.innerHTML = '<small>PROSSIMO SBLOCCO</small><b>Avete raggiunto tutti gli sblocchi di questa versione</b>';
    return;
  }
  const shown = presentation(reward);
  root.innerHTML = `<span class="us-progression-next-preview" aria-hidden="true">${previewMarkup(reward)}</span><span class="us-progression-next-copy"><small>PROSSIMO SBLOCCO · LIVELLO ${Number(reward.level_required) || 0}</small><b>${esc(presentedTitle(reward))}</b><span>${esc(shown?.where ? `${shown.label} · ${presentedDescription(reward)}` : presentedDescription(reward))}</span></span>`;
}

function rewardTile(reward) {
  const locked = !reward.unlocked;
  const equipped = Boolean(reward.equipped);
  const status = locked ? `Livello ${reward.level_required}` : equipped ? 'In uso' : 'Sbloccato';
  const label = locked ? `Livello ${reward.level_required}` : equipped ? 'In uso · tocca per togliere' : 'Sbloccato · tocca per usare';
  return `<button type="button" class="us-progression-reward ${locked ? 'is-locked' : 'is-unlocked'} ${equipped ? 'is-equipped' : ''}" data-progression-reward="${esc(reward.id)}" data-category="${esc(reward.category)}" ${locked ? 'disabled' : ''} aria-pressed="${equipped ? 'true' : 'false'}" aria-label="${esc(reward.title)} · ${esc(label)}. ${esc(reward.description)}">
      <span class="us-progression-reward-preview" data-reward-token="${esc(reward.token)}" aria-hidden="true">${previewMarkup(reward)}${countdownStyleFor(reward) ? '<i class="us-progression-reward-plus">+ Countdown</i>' : ''}</span>
      <span class="us-progression-reward-copy"><b>${esc(reward.title)}</b><small>${esc(status)}</small></span>
    </button>`;
}

// Oggi looks in the collection: the same preview phone as the gallery; a tap
// opens the gallery on that look (preview first, then "Usa su Oggi").
function lookTile(category, look) {
  const slot = SLOTS[category].look;
  const status = window.USOggiLook.status(slot, look.id);
  const current = (window.USOggiLook.current?.()[slot]) === look.id;
  const locked = status.state === 'locked';
  const label = locked ? `Livello ${status.level}` : current ? 'In uso' : status.state === 'included' ? 'Incluso' : 'Sbloccato';
  return `<button type="button" class="us-progression-reward us-progression-look ${locked ? 'is-locked' : 'is-unlocked'} ${current ? 'is-equipped' : ''}" data-look-slot="${slot}" data-look-id="${esc(look.id)}" aria-pressed="${current ? 'true' : 'false'}" aria-label="${esc(look.name)} · ${esc(label)}. Apri l’anteprima">
      <span class="us-progression-reward-preview" aria-hidden="true">${window.USOggiLook.previewMarkup(slot, look.id)}</span>
      <span class="us-progression-reward-copy"><b>${esc(look.name)}</b><small>${esc(label)}</small></span>
    </button>`;
}

function countdownTile(style, next) {
  const reward = style.reward ? (next?.rewards || []).find((item) => item.id === style.reward) : null;
  const unlocked = !style.reward || Boolean(reward?.unlocked);
  const active = unlocked && window.USCountdown?.activeStyle?.() === style.id;
  const status = active ? 'In uso' : !style.reward ? 'Incluso' : unlocked ? 'Sbloccato' : `Con ${reward?.title || style.name} · livello ${style.level}`;
  return `<button type="button" class="us-progression-reward us-progression-countdown-style ${unlocked ? 'is-unlocked' : 'is-locked'} ${active ? 'is-equipped' : ''}" data-countdown-style-select="${esc(style.id)}" ${unlocked ? '' : 'disabled'} aria-pressed="${active ? 'true' : 'false'}" aria-label="Stile Countdown ${esc(style.name)} · ${esc(status)}. ${esc(style.note || '')}">
      <span class="us-progression-reward-preview" aria-hidden="true"><span class="us-cos-stage us-cos-countdown">${countdownPreview(style.id)}</span></span>
      <span class="us-progression-reward-copy"><b>${esc(style.name)}</b><small>${esc(status)}</small></span>
    </button>`;
}
function countdownGroup(next, expanded = false) {
  const styles = countdownStyles();
  if (!styles.length || !window.USCountdown?.previewMarkup) return null;
  const owned = styles.filter((style) => !style.reward || next?.rewards?.some((r) => r.id === style.reward && r.unlocked)).length;
  return {
    category: 'countdown', label: 'Stili Countdown', owned, total: styles.length,
    markup: (open) => `<details class="us-reward-group" data-category="countdown" aria-label="Stili Countdown"${open ? " open" : ""}>
      <summary class="us-reward-group-head"><b>Stili Countdown</b><span>Il vostro tempo su Oggi</span><em>${owned}/${styles.length}</em></summary>
      <div class="us-reward-grid">${styles.map((style) => countdownTile(style, next)).join('')}</div>
    </details>`
  };
}

// Due colori — the collection reads one category at a time: a row of chips
// (name and owned/total) chooses which group is open. The groups stay the
// same native <details>, so nothing is lost without the chips.
let rewardCategory = null;
function renderRewards(next = state) {
  const root = $('usProgressionRewards');
  if (!root) return;
  const rewards = Array.isArray(next?.rewards) ? next.rewards : [];
  // Only rewards with a real, visible destination; countdown-entitling rewards
  // live in the Stili Countdown group, Oggi looks in their own groups.
  const known = rewards.filter((reward) => SLOTS[reward.category] && presented(reward) && presentation(reward).kind === reward.category && !SLOTS[reward.category].look);
  const groups = VISIBLE_SLOTS.map((category) => {
    const slot = SLOTS[category];
    let tiles = '';
    let groupOwned = 0;
    let groupTotal = 0;
    if (slot.look) {
      if (!window.USOggiLook) return null;
      const looks = (slot.look === 'theme' ? window.USOggiLook.THEMES : window.USOggiLook.EFFECTS)
        .filter((look) => window.USOggiLook.status(slot.look, look.id).state !== 'unavailable');
      groupTotal = looks.length;
      groupOwned = looks.filter((look) => window.USOggiLook.usable(slot.look, look.id)).length;
      tiles = looks.map((look) => lookTile(category, look)).join('');
    } else {
      const group = known.filter((reward) => reward.category === category);
      groupTotal = group.length;
      groupOwned = group.filter((reward) => reward.unlocked).length;
      tiles = group.map(rewardTile).join('');
    }
    if (!groupTotal) return null;
    return {
      category, label: slot.label, owned: groupOwned, total: groupTotal,
      markup: (open) => `<details class="us-reward-group" data-category="${category}" aria-label="${esc(slot.label)}"${open ? ' open' : ''}>
      <summary class="us-reward-group-head"><b>${esc(slot.label)}</b><span>${esc(slot.place)}</span><em>${groupOwned}/${groupTotal}</em></summary>
      <div class="us-reward-grid">${tiles}</div>
    </details>`
    };
  }).filter(Boolean);
  const owned = groups.reduce((sum, group) => sum + group.owned, 0);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const countdown = countdownGroup(next);
  if (countdown) groups.push(countdown);
  if (!groups.some((group) => group.category === rewardCategory)) rewardCategory = groups[0]?.category || null;
  const chips = groups.length > 1 ? `<div class="us-reward-cats" role="group" aria-label="Categorie della collezione">${groups.map((group) => `<button type="button" class="us-reward-cat" data-reward-cat="${group.category}" ${group.category === rewardCategory ? 'aria-current="true"' : ''}>${esc(group.label)}<em>${group.owned}/${group.total}</em></button>`).join('')}</div>` : '';
  root.innerHTML = chips + groups.map((group) => group.markup(group.category === rewardCategory)).join('');
  root.dataset.uiGroupsReady = '1';
  const count = $('usProgressionRewardsCount');
  if (count) count.textContent = `${owned} di ${total}`;
}

function render(next = state) {
  if (!next) return;
  window.renderBondProgress?.(Number(next.total_xp) || 0);
  renderSintoniaArt(next);
  renderRhythm(next);
  renderNext(next);
  renderRewards(next);
  applyPreferences(next);
  window.dispatchEvent(new CustomEvent('us:progression-updated'));
}

function unlockRoot() { return $('usProgressionUnlock'); }
function hideUnlock() {
  const root = unlockRoot();
  if (!root) return;
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'true');
}
function paintUnlock() {
  const reward = unlockQueue[unlockIndex];
  const root = unlockRoot();
  if (!root || !reward) { hideUnlock(); return; }
  $('usProgressionUnlockCount').textContent = unlockQueue.length > 1 ? `${unlockIndex + 1} di ${unlockQueue.length}` : '';
  const shown = presentation(reward);
  $('usProgressionUnlockTitle').textContent = presentedTitle(reward);
  $('usProgressionUnlockDescription').textContent = presentedDescription(reward);
  const kicker = $('usProgressionUnlockKicker');
  if (kicker) kicker.textContent = shown?.unlock || 'HAI SBLOCCATO';
  root.dataset.category = shown?.kind || reward.category || '';
  root.dataset.rewardToken = reward.token || '';
  const place = $('usProgressionUnlockPlace');
  if (place) {
    place.textContent = shown?.where || '';
    place.hidden = !place.textContent;
  }
  const extra = $('usProgressionUnlockExtra');
  if (extra) {
    const style = shown?.kind === 'countdown' ? null : countdownStyleFor(reward);
    const art = style ? countdownPreview(style.id) : '';
    extra.innerHTML = style ? `<span class="us-progression-unlock-extra-art" aria-hidden="true">${art}</span><span class="us-progression-unlock-extra-copy"><small>IN PIÙ</small><b>Stile Countdown «${esc(style.name)}»</b></span>` : '';
    extra.hidden = !style;
  }
  const preview = $('usProgressionUnlockPreview');
  if (preview) {
    preview.dataset.rewardToken = reward.token || '';
    preview.dataset.category = reward.category || '';
    preview.innerHTML = previewMarkup(reward);
  }
  const use = $('usProgressionUnlockUse');
  if (use) use.textContent = shown?.kind === 'countdown' ? 'Usalo nel countdown' : reward.category === 'effect' || reward.category === 'oggi_effect' ? 'Attivalo ora' : 'Usalo ora';
  $('usProgressionUnlockStatus').textContent = '';
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    root.classList.add('open');
    window.UsFeedback?.success?.();
  });
}
function startUnlockQueue(pending) {
  // A retired reward is never announced: it has nowhere to be used.
  const visible = Array.isArray(pending) ? pending.filter(presented) : [];
  if (!visible.length || unlockRoot()?.classList.contains('open')) return;
  unlockQueue = visible.slice();
  unlockIndex = 0;
  paintUnlock();
}
async function ackReward(rewardId) {
  const { error } = await sb.rpc('ack_progression_unlock', { target_reward_id: rewardId });
  if (error) throw error;
}
async function advanceUnlock() {
  unlockIndex += 1;
  if (unlockIndex < unlockQueue.length) paintUnlock();
  else {
    hideUnlock();
    unlockQueue = [];
    unlockIndex = 0;
    // The moment is over and the shell is visible again: the PET may celebrate.
    window.USPet?.react?.('reward');
    await hydrate({ showUnlocks: false, force: true });
  }
}
async function dismissUnlock() {
  if (unlockBusy) return;
  const reward = unlockQueue[unlockIndex];
  if (!reward) return hideUnlock();
  unlockBusy = true;
  try {
    await ackReward(reward.id);
    await advanceUnlock();
  } catch (error) {
    console.warn('[US Progression] ack unlock', error);
    $('usProgressionUnlockStatus').textContent = 'Non riesco a salvare ora. Riprova.';
  } finally { unlockBusy = false; }
}
async function equipReward(rewardId, { acknowledge = false, ensureEquipped = false } = {}) {
  if (unlockBusy || !rewardId) return false;
  const reward = rewardById(rewardId);
  if (!reward?.unlocked) return false;
  // "Usalo ora" must never toggle an already-equipped reward off.
  if (ensureEquipped && reward.equipped) {
    if (acknowledge) await ackReward(rewardId).catch((error) => console.warn('[US Progression] ack unlock', error));
    return true;
  }
  unlockBusy = true;
  try {
    if (!setDeviceReward(reward, { ensureEquipped })) throw new Error('device_preferences_unavailable');
    render(state);
    if (acknowledge) await ackReward(rewardId);
    return true;
  } catch (error) {
    console.warn('[US Progression] equip', error);
    const status = $('usProgressionUnlockStatus');
    if (status) status.textContent = 'Non riesco ad applicarlo ora. Riprova.';
    return false;
  } finally { unlockBusy = false; }
}
async function useUnlock() {
  const reward = unlockQueue[unlockIndex];
  if (!reward || unlockBusy) return;
  const shown = presentation(reward);
  if (shown?.kind === 'countdown' || SLOTS[reward.category]?.look) {
    unlockBusy = true;
    try {
      let ok = true;
      if (shown.kind === 'countdown') {
        if (window.USCountdown?.hasActive?.()) ok = Boolean(await window.USCountdown?.setStyle?.(shown.style.id));
        else window.toast?.('Lo trovi tra gli stili quando scegli un countdown.');
      } else {
        const found = lookForReward(reward);
        if (!state?.rewards?.some((item) => item.id === reward.id && item.unlocked)) await hydrate({ showUnlocks: false, force: true });
        ok = Boolean(found && setDeviceLook(found.slot, found.look.id));
      }
      if (!ok) throw new Error('look_unavailable');
      await ackReward(reward.id);
    } catch (error) {
      console.warn('[US Progression] use unlock', error);
      $('usProgressionUnlockStatus').textContent = 'Non riesco ad applicarlo ora. Riprova.';
      return;
    } finally { unlockBusy = false; }
    await advanceUnlock();
    return;
  }
  const ok = await equipReward(reward.id, { acknowledge: true, ensureEquipped: true });
  if (ok) await advanceUnlock();
}

async function hydrate({ showUnlocks = true, force = false } = {}) {
  if (!window.usProfile || typeof sb === 'undefined') return null;
  if (loading && !force) return loading;
  const profile = window.usProfile;
  loading = (async () => {
    const { data, error } = await sb.rpc('get_progression_v1');
    if (window.usProfile !== profile) return null;
    if (error) {
      console.warn('[US Progression] hydrate', error);
      return null;
    }
    state = applyDevicePreferences(data || null);
    render(state);
    if (showUnlocks) {
      const pending = Array.isArray(state?.pending_unlocks) ? state.pending_unlocks : [];
      if (!celebrateLevelUp(state, pending)) startUnlockQueue(pending);
    }
    return state;
  })().finally(() => { loading = null; });
  return loading;
}

function refreshAfterAction() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!document.hidden && window.usProfile) hydrate({ showUnlocks: true, force: true });
  }, 260);
}

$('usProgressionRewards')?.addEventListener('click', async (event) => {
  const chip = event.target.closest?.('[data-reward-cat]');
  if (chip?.dataset?.rewardCat) {
    if (chip.dataset.rewardCat === rewardCategory) return;
    rewardCategory = chip.dataset.rewardCat;
    renderRewards(state);
    $('usProgressionRewards')?.querySelector?.('.us-reward-group[open]')?.classList?.add('is-entering');
    window.UsFeedback?.selection?.();
    return;
  }
  const look = event.target.closest?.('[data-look-slot]');
  if (look?.dataset?.lookSlot) {
    window.USOggiLook?.openGallery?.({ tab: look.dataset.lookSlot, look: look.dataset.lookId });
    return;
  }
  const button = event.target.closest?.('[data-progression-reward],[data-countdown-style-select]');
  if (!button || button.disabled) return;
  if (button.dataset?.countdownStyleSelect) {
    if (!window.USCountdown?.hasActive?.()) {
      window.toast?.('Scegli prima un countdown da mostrare in Oggi.');
      return;
    }
    const ok = await window.USCountdown?.setStyle?.(button.dataset.countdownStyleSelect);
    if (ok) {
      window.UsFeedback?.action?.();
      renderRewards(state);
    } else {
      window.toast?.('Non riesco ad applicarlo ora. Riprova.');
    }
    return;
  }
  const rewardId = button.dataset.progressionReward;
  const ok = await equipReward(rewardId);
  if (ok) {
    window.UsFeedback?.action?.();
    await hydrate({ showUnlocks: false, force: true });
  }
});
window.addEventListener?.('us:countdown-updated', () => renderRewards(state));
$('usProgressionUnlockUse')?.addEventListener('click', useUnlock);
$('usProgressionUnlockLater')?.addEventListener('click', dismissUnlock);

window.USProgression = Object.freeze({
  hydrate,
  refreshAfterAction,
  equip: (rewardId) => equipReward(rewardId),
  setLook: async (slot, id) => setDeviceLook(slot, id),
  getState: () => state,
  previewMarkup
});

// A new identity on this phone (login, logout, account switch) starts from its
// own stored look, never from the previous person's cosmetics.
let lookIdentity = null;
function syncIdentityLook() {
  const key = devicePreferenceKey() || null;
  if (key === lookIdentity) return;
  lookIdentity = key;
  if (state && key) state = null;
  if (!key) {
    state = null;
    const root = document.documentElement;
    for (const name of ['usTheme', 'usAccent', 'usEffect', 'usRing', 'usSticker']) delete root.dataset[name];
    applyLook(null);
    return;
  }
  applyLook(earlyPreferences());
}
window.addEventListener?.('us-identity-change', () => {
  const before = lookIdentity;
  syncIdentityLook();
  if (lookIdentity && lookIdentity !== before) setTimeout(() => hydrate({ showUnlocks: true, force: true }), 600);
});

function boot() {
  if (!window.usProfile || typeof sb === 'undefined') return setTimeout(boot, 250);
  syncIdentityLook();
  setTimeout(() => hydrate({ showUnlocks: true }), 900);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();
