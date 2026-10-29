(() => {
'use strict';
if (window.__usProgressionV1Installed) return;
window.__usProgressionV1Installed = true;
// Ritmo, as in the mockup: the days in a row and the last seven days.
// Set to false to hide the Ritmo block again (one line, nothing else changes).
const SINTONIA_SHOW_RITMO = true;

const $ = (id) => document.getElementById(id);
// A text is written only when it changes (app.js renderBondProgress shares the
// same per-element memory): hydrating again never mutates or relayouts.
const setText = (el, text) => { if (!el || el.__usText === text) return; el.__usText = text; el.textContent = text; };
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
  oggi_theme: { pref: 'oggi_theme', look: 'theme', label: 'Temi di Oggi', place: 'atmosfera, foto e countdown', unlock: 'Nuovo tema di Oggi', where: 'Oggi, attorno alla vostra foto' },
  oggi_effect: { pref: 'oggi_effect', look: 'effect', label: 'Effetti di Oggi', place: 'sopra la vostra foto', unlock: 'Nuovo effetto di Oggi', where: 'Oggi, sopra la vostra foto' },
  theme: { pref: 'theme_reward_id', label: 'Atmosfera', place: 'lo sfondo di tutta US', unlock: 'Nuova atmosfera', where: 'In tutta US' },
  accent: { pref: 'accent_reward_id', label: 'Colore di Noi', place: 'controlli, progressi, navigazione', unlock: 'Nuovo colore di Noi', where: 'Selezioni e progressi, in tutta US' },
  effect: { pref: 'effect_reward_id', label: 'Simbolo US', place: 'il simbolo in alto', unlock: 'Nuovo effetto del simbolo', where: 'Il simbolo in alto su Oggi' },
  frame: { pref: 'frame_reward_id', retired: true, label: 'Cornici', place: 'sulla foto di Oggi', unlock: 'NUOVA CORNICE', where: 'Sulla foto di Oggi' },
  sticker: { pref: 'sticker_reward_id', retired: true, label: 'Adesivi', place: 'su Oggi e sull’ultimo ricordo', unlock: 'NUOVO ADESIVO', where: 'Su Oggi e sull’ultimo ricordo' },
  badge: { pref: 'badge_reward_id', retired: true, label: 'Spille', place: 'tra voi due, in Noi', unlock: 'NUOVA SPILLA', where: 'In Noi, tra i vostri ritratti' },
  ring: { pref: 'ring_reward_id', retired: true, label: 'Anelli', place: 'attorno ai vostri ritratti', unlock: 'NUOVO ANELLO', where: 'In Noi, attorno ai vostri ritratti' }
});
const SLOT_ORDER = Object.keys(SLOTS);
const VISIBLE_SLOTS = SLOT_ORDER.filter((category) => !SLOTS[category].retired);
const LOOK_SLOT = Object.freeze({ theme: 'oggi_theme', effect: 'oggi_effect' });
const COUNTDOWN_PRESENTATION = Object.freeze({ label: 'Countdown', unlock: 'Nuovo stile countdown', where: 'Il countdown di Oggi' });
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
  const look = window.USOggiLook;
  const theme = prefs?.oggi_theme || undefined;
  const effect = prefs?.oggi_effect || undefined;
  // The same look already on Oggi (its layers still there) is not applied again.
  const now = look?.current?.();
  const same = now && now.theme === (theme || look.DEFAULTS?.theme) && now.effect === (effect || look.DEFAULTS?.effect);
  if (same && document.querySelector?.('#homeHero > .us-oggi-tint')) return;
  look?.apply?.({ theme, effect });
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
  // A countdown style reward: category 'countdown' after V3, a retired slot before it.
  if (style && (!SLOTS[category] || SLOTS[category].retired)) return `<span class="us-cos-stage us-cos-countdown">${countdownPreview(style.id)}</span>`;
  const value = slotValue(category, reward?.token);
  if (category === 'theme') return `<span class="us-cos-theme" data-theme="${esc(value)}"><i class="us-cos-theme-bar"></i><i class="us-cos-theme-card"></i><i class="us-cos-theme-pill"></i></span>`;
  if (category === 'accent') return `<span class="us-cos-accent" data-accent="${esc(value)}"><i class="us-cos-accent-track"><i></i></i><i class="us-cos-accent-pill"></i><i class="us-cos-accent-nav"><i></i><i></i><i></i></i></span>`;
  if (category === 'effect') return `<span class="us-cos-stage"><span class="us-cos-logo" data-effect="${esc(value)}"><img src="${US_SYMBOL}" alt="" decoding="async" draggable="false"></span></span>`;
  return '<span class="us-cos-stage"></span>';
}

// ---------- Due colori · the mockup's reward art (sintonia.js preview()) ----------
// The collection, the next unlock and the unlock Momento draw each reward as
// the approved mockup does: a tiny Oggi with the days together for Oggi looks
// (a canvas for the effects), the night and its light for Atmosfere, the two
// circles for Colore di Noi, the US symbol for its effects, the digits for the
// countdown styles. Presentation only: ids come from the real rewards.
const ATM = Object.freeze({ us: ['#0F0B13', 'rgba(217,139,224,.5)'], rose: ['#13070F', 'rgba(255,94,146,.55)'], midnight: ['#060714', 'rgba(119,141,255,.55)'], film: ['#0E0A07', 'rgba(240,166,90,.5)'], blue_hour: ['#050913', 'rgba(91,124,240,.55)'], graphite: ['#0A0A0B', 'rgba(255,255,255,.22)'] });
// Each reward's own colour (the Momento fills the screen with it).
const ITEM_COLOR = Object.freeze({
  theme: { rose: '#FF5E92', midnight: '#778DFF', film: '#F0A65A', blue_hour: '#5B7CF0', graphite: '#C9C3D4' },
  accent: { orchidea: '#D98BE0', cherry: '#F0566C', champagne: '#E6C78E', ice: '#9FD2FF' },
  oggi_theme: { cinematic: '#C06A6A', moonlight: '#5B6CC8', seasonal: '#E0A050' },
  oggi_effect: { petals: '#FF8BA8', fireflies: '#F3B76E', bokeh: '#FF7C96', snow: '#CFE3FF' },
  effect: { pulse: '#FF7C96', constellation: '#A98BFF', shimmer: '#E8E2F0' },
  countdown: { aurora: '#F3B76E', orbit: '#F3B76E', chrome: '#C9C3D4' }
});
// The free look of the three device slots that have no reward row: choosing
// it simply clears the slot on this phone.
const SLOT_DEFAULT = Object.freeze({
  theme: { id: 'us', title: 'Notte', description: 'La notte di US, com’è adesso.' },
  accent: { id: 'orchidea', title: 'Orchidea', description: 'Il colore di Noi, dove i vostri due colori si incontrano.' },
  effect: { id: 'none', title: 'Fermo', description: 'Il simbolo US, senza movimento.' }
});
function itemColor(cat, id) { return ITEM_COLOR[cat]?.[id] || ''; }
// The mockup's item for a reward row: { cat, id } in the preview's terms.
function artItem(reward) {
  const shown = presentation(reward);
  if (shown?.kind === 'countdown') return { cat: 'countdown', id: shown.style.id };
  if (SLOTS[reward?.category]?.look) {
    const found = lookForReward(reward);
    return found ? { cat: reward.category, id: found.look.id } : null;
  }
  return { cat: reward?.category, id: slotValue(reward?.category, reward?.token) };
}
// Days together for the tiny Oggi ("430 giorni" in the mockup), counted by
// calendar days as Oggi counts them (app.js updateTogetherDays).
function daysTogether() {
  try {
    const started = window.UsCoupleContext?.snapshot?.()?.couple?.started_on;
    const [year, month, day] = String(started || '').split('-').map(Number);
    if (!year || !month || !day) return '';
    const now = new Date();
    const days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(year, month - 1, day)) / 86400000);
    return days >= 0 ? String(days) : '';
  } catch (_) { return ''; }
}
function miniCount() {
  const days = daysTogether();
  return days ? `<span class="n">${esc(days)}</span><span class="u">giorni</span>` : '';
}
function artMarkup(item, big = false) {
  if (!item) return '<span class="us-cos-stage"></span>';
  const { cat, id } = item;
  if (cat === 'oggi_theme') return `<span class="mini" data-theme="${esc(id)}">${miniCount()}</span>`;
  if (cat === 'oggi_effect') return `<span class="mini">${id !== 'none' && FX.has(id) ? `<canvas data-fx="${esc(id)}"></canvas>` : ''}${miniCount()}</span>`;
  if (cat === 'theme') {
    const [night, glow] = ATM[id] || ATM.us;
    return `<span class="swatch-pv atm" style="background:radial-gradient(90% 60% at 50% 0%,${glow},transparent 70%),${night}"><span class="ui"><i></i><i></i><i class="pill"></i><i></i></span></span>`;
  }
  if (cat === 'accent') {
    const color = itemColor('accent', id) || ITEM_COLOR.accent.orchidea;
    return `<span class="swatch-pv"><svg viewBox="0 0 58 36" width="${big ? 110 : 64}" aria-hidden="true" focusable="false"><circle cx="20" cy="18" r="15" class="is-a"/><circle cx="38" cy="18" r="15" class="is-b"/><path d="M29 6a15 15 0 0 1 0 24 15 15 0 0 1 0-24z" fill="${color}"/></svg><span class="ui"><i class="acc" style="--c:${color};width:70%"></i></span></span>`;
  }
  if (cat === 'effect') return `<span class="logo-pv"><span class="logo-wrap" data-fx="${esc(id)}"><img class="og-logo" src="${US_SYMBOL}" alt="" decoding="async" draggable="false"><span class="shine"></span><span class="stars"><i style="left:4px;top:10px"></i><i style="right:2px;top:2px;animation-delay:.8s"></i><i style="right:6px;bottom:4px;animation-delay:1.6s"></i></span></span></span>`;
  if (cat === 'countdown') {
    const days = daysTogether() || '0';
    const digits = id === 'signal' ? days.split('').map((d) => `<span>${esc(d)}</span>`).join('') : esc(days);
    return `<span class="cd-pv"><span class="cd" data-style="${esc(id)}"><span class="cdb"><span class="num">${digits}</span><span class="lbl">giorni</span></span></span></span>`;
  }
  return '<span class="us-cos-stage"></span>';
}

// The mockup's particle engine for the Oggi effect previews (sintonia.js FX).
// Only canvases on screen draw; nothing runs under reduced motion.
const FX = (() => {
  // The canvases being drawn ({ c, g, kind, ps, on, w, h }).
  let live = [];
  const find = (c) => live.find((s) => s.c === c);
  let raf = 0;
  let seen = null;
  const R = Math.random;
  const heart = (g, x, y, s) => { g.beginPath(); g.moveTo(x, y + s * 0.35); g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.35); g.bezierCurveTo(x - s * 0.5, y + s * 0.7, x, y + s * 0.85, x, y + s); g.bezierCurveTo(x, y + s * 0.85, x + s * 0.5, y + s * 0.7, x + s * 0.5, y + s * 0.35); g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35); g.fill(); };
  const KINDS = {
    hearts: { n: 10, init: (p, w, h, first) => { p.x = R() * w; p.y = first ? R() * h : h + 12; p.s = 6 + R() * 7; p.v = 0.18 + R() * 0.22; p.a = 0.35 + R() * 0.35; p.ph = R() * 6; p.c = R() < 0.6 ? '255,124,150' : '255,179,194'; },
      step: (p, w, h, t) => { p.y -= p.v; p.x += Math.sin(t / 900 + p.ph) * 0.25; if (p.y < -14) Object.assign(p, { y: h + 12, x: R() * w }); },
      draw: (g, p) => { g.fillStyle = `rgba(${p.c},${p.a})`; heart(g, p.x, p.y, p.s); } },
    stars: { n: 38, init: (p, w, h) => { p.x = R() * w; p.y = R() * h * 0.62; p.s = 0.5 + R() * 1.3; p.sp = 0.6 + R() * 1.4; p.ph = R() * 6; },
      step: () => {}, draw: (g, p, t) => { const a = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t / 1000 * p.sp + p.ph)); g.fillStyle = `rgba(255,248,240,${a})`; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill();
        if (p.s > 1.4) { g.strokeStyle = `rgba(255,248,240,${a * 0.6})`; g.lineWidth = 0.6; g.beginPath(); g.moveTo(p.x - p.s * 3, p.y); g.lineTo(p.x + p.s * 3, p.y); g.moveTo(p.x, p.y - p.s * 3); g.lineTo(p.x, p.y + p.s * 3); g.stroke(); } } },
    petals: { n: 14, init: (p, w, h, first) => { p.x = R() * w; p.y = first ? R() * h : -10; p.s = 4 + R() * 4; p.v = 0.35 + R() * 0.5; p.r = R() * 6; p.vr = (R() - 0.5) * 0.03; p.ph = R() * 6; p.c = ['255,170,190', '255,140,165', '255,210,220'][R() * 3 | 0]; },
      step: (p, w, h, t) => { p.y += p.v; p.x += Math.sin(t / 700 + p.ph) * 0.45; p.r += p.vr; if (p.y > h + 12) Object.assign(p, { y: -10, x: R() * w }); },
      draw: (g, p) => { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = `rgba(${p.c},.78)`; g.beginPath(); g.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, 7); g.fill(); g.restore(); } },
    fireflies: { n: 14, add: true, init: (p, w, h) => { p.x = R() * w; p.y = h * 0.25 + R() * h * 0.7; p.a = R() * 6; p.v = 0.18 + R() * 0.22; p.ph = R() * 6; p.s = 1.6 + R() * 1.6; },
      step: (p, w, h) => { p.a += (R() - 0.5) * 0.18; p.x += Math.cos(p.a) * p.v; p.y += Math.sin(p.a) * p.v; if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10; if (p.y < h * 0.15) p.a = 1.57; if (p.y > h) p.a = -1.57; },
      draw: (g, p, t) => { const k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t / 650 + p.ph)), r = p.s * 7; const q = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); q.addColorStop(0, `rgba(255,226,150,${0.9 * k})`); q.addColorStop(0.25, `rgba(255,196,110,${0.35 * k})`); q.addColorStop(1, 'rgba(255,180,90,0)'); g.fillStyle = q; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill(); } },
    bokeh: { n: 9, add: true, init: (p, w, h) => { p.x = R() * w; p.y = R() * h; p.r = 16 + R() * 34; p.vx = (R() - 0.5) * 0.12; p.vy = -0.05 - R() * 0.1; p.ph = R() * 6; p.c = ['255,124,150', '243,183,110', '169,139,255', '255,236,220'][R() * 4 | 0]; },
      step: (p, w, h) => { p.x += p.vx; p.y += p.vy; if (p.y < -p.r) p.y = h + p.r; if (p.x < -p.r) p.x = w + p.r; if (p.x > w + p.r) p.x = -p.r; },
      draw: (g, p, t) => { const a = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t / 1600 + p.ph)); const q = g.createRadialGradient(p.x, p.y, p.r * 0.55, p.x, p.y, p.r); q.addColorStop(0, `rgba(${p.c},${a})`); q.addColorStop(0.85, `rgba(${p.c},${a * 1.4})`); q.addColorStop(1, `rgba(${p.c},0)`); g.fillStyle = q; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); } },
    snow: { n: 46, init: (p, w, h, first) => { p.x = R() * w; p.y = first ? R() * h : -6; p.r = 0.8 + R() * 1.9; p.v = 0.3 + R() * 0.7; p.ph = R() * 6; },
      step: (p, w, h, t) => { p.y += p.v; p.x += Math.sin(t / 1200 + p.ph) * 0.3; if (p.y > h + 6) Object.assign(p, { y: -6, x: R() * w }); },
      draw: (g, p) => { g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); } }
  };
  function size(s) {
    const c = s.c, dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth || c.parentElement?.clientWidth || 100, h = c.clientHeight || c.parentElement?.clientHeight || 100;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); s.g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    s.w = w; s.h = h;
    if (!s.ps.length) {
      const K = KINDS[s.kind];
      const n = Math.max(4, Math.round(K.n * Math.min(1.2, (w * h) / (390 * 700))));
      for (let i = 0; i < n; i++) { const p = {}; K.init(p, w, h, true); s.ps.push(p); }
    }
  }
  function paint(s, t, move) {
    const K = KINDS[s.kind];
    s.g.clearRect(0, 0, s.w, s.h);
    s.g.globalCompositeOperation = K.add ? 'lighter' : 'source-over';
    for (const p of s.ps) { if (move) K.step(p, s.w, s.h, t); K.draw(s.g, p, t); }
  }
  function frame(t) {
    raf = 0;
    let any = false;
    for (const s of live) {
      if (!s.c.isConnected) { stop(s.c); continue; }
      if (!s.on) continue;
      any = true;
      if (!s.w) size(s);
      paint(s, t, true);
    }
    if (any && !reducedMotion()) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && !reducedMotion() && live.some((s) => s.on)) raf = requestAnimationFrame(frame); }
  function watch(c) {
    if (typeof IntersectionObserver !== 'function') { const s = find(c); if (s) s.on = true; return; }
    if (!seen) seen = new IntersectionObserver((entries) => { for (const e of entries) { const s = find(e.target); if (s) { s.on = e.isIntersecting; if (s.on) s.w = 0; } } kick(); });
    seen.observe(c);
  }
  function start(c, kind) {
    stop(c);
    const g = KINDS[kind] && c.getContext?.('2d');
    if (!g) return;
    const s = { c, g, kind, ps: [], on: false, w: 0, h: 0 };
    live.push(s);
    // Measured on its first frame, never right after the markup lands (a
    // read here would force a layout in the middle of a render).
    if (reducedMotion()) { requestAnimationFrame(() => { if (!c.isConnected) return; size(s); paint(s, performance.now(), false); }); return; }
    watch(c);
  }
  function stop(c) { if (!find(c)) return; seen?.unobserve?.(c); live = live.filter((s) => s.c !== c); }
  return { start, has: (kind) => Boolean(KINDS[kind]), kick };
})();
function startCanvases(root) {
  root?.querySelectorAll?.('canvas[data-fx]')?.forEach?.((c) => FX.start(c, c.dataset.fx));
}

// ---------- Due colori · points: +XP, sparks, the bar that grows ----------
// The approved mockup's motion, literally (sintonia.js gainXP, noi.js xpPop
// and questComplete, core.js burst): same keyframes, durations, easings and
// waits. On the page only transform/opacity animate (the bar slides inside
// its track); the two circles follow the mockup's own tween.
const EASE = Object.freeze({ out: 'cubic-bezier(.2,.8,.2,1)', io: 'cubic-bezier(.7,0,.2,1)', spring: 'cubic-bezier(.34,1.56,.64,1)', in: 'cubic-bezier(.4,0,1,1)' });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (n) => (Number(n) || 0).toLocaleString(window.UsI18n?.tag || 'it-IT');
const canAnimate = (el) => typeof el?.animate === 'function' && !reducedMotion();
// "+35 XP · Evento vissuto · Sintonia": rises, holds and leaves (1550 ms).
function xpPop(n, label) {
  const xp = Math.round(Number(n) || 0);
  if (xp <= 0 || typeof document.createElement !== 'function' || !document.body) return false;
  const pop = document.createElement('div');
  pop.className = 'us-xp-pop';
  pop.setAttribute('role', 'status');
  pop.innerHTML = `<b>+${xp} XP</b><small>${esc(label ? `${label} · Sintonia` : 'Sintonia')}</small>`;
  document.body.appendChild(pop);
  const done = () => pop.remove();
  if (!canAnimate(pop)) { setTimeout(done, 1500); return true; }
  const anim = pop.animate([
    { opacity: 0, transform: 'translate(-50%,20px) scale(.8)' },
    { opacity: 1, transform: 'translate(-50%,0) scale(1.06)', offset: 0.25 },
    { opacity: 1, transform: 'translate(-50%,-6px) scale(1)', offset: 0.75 },
    { opacity: 0, transform: 'translate(-50%,-30px) scale(.96)' }
  ], { duration: 1550, easing: EASE.out });
  anim.onfinish = done;
  anim.oncancel = done;
  return true;
}
// Points for something done outside Sintonia (an event lived): the mockup's +XP.
window.usCelebrateXp = (n, label) => xpPop(n, label);
// Sparks from the middle of what was touched (core.js burst).
function burst(el, n = 6) {
  if (!el?.getBoundingClientRect || reducedMotion() || !document.body) return;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const colors = ['var(--us-rosa)', 'var(--us-lilla)', 'var(--us-noi)'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'us-spark';
    s.setAttribute('aria-hidden', 'true');
    s.style.background = colors[i % 3];
    s.style.left = `${r.left + r.width / 2 - 6}px`;
    s.style.top = `${r.top + r.height / 2 - 6}px`;
    document.body.appendChild(s);
    if (typeof s.animate !== 'function') { s.remove(); continue; }
    const a = (i / n) * 6.283 - 1.57;
    const d = 36 + Math.random() * 18;
    const anim = s.animate([
      { transform: 'translate(0px,0px) scale(1)', opacity: 1 },
      { transform: `translate(${(Math.cos(a) * d).toFixed(1)}px,${(Math.sin(a) * d).toFixed(1)}px) scale(.3)`, opacity: 0 }
    ], { duration: 560, easing: EASE.out });
    anim.onfinish = () => s.remove();
    anim.oncancel = () => s.remove();
  }
}

// While the card plays a gain it owns its numbers: app.js renderBondProgress
// and this file's render wait, then paint the latest total once it ends.
let gain = null;
const GAIN_SAFETY_MS = 15000;
function holdsCard() {
  if (gain && Date.now() > gain.until) gain = null;
  return Boolean(gain);
}
function holdCard() { gain = { until: Date.now() + GAIN_SAFETY_MS }; }
function releaseCard() { gain = null; }
const sintoniaPanel = () => $('usGiocaSintonia');
function sintoniaVisible() {
  const panel = sintoniaPanel();
  return Boolean(panel && !panel.hidden && $('quiz')?.classList?.contains('active') && !document.hidden);
}
// The bar: a full-width fill that slides inside its rounded track.
function animBar(fromPct, toPct, ms) {
  const bar = $('bondPageFill');
  if (!bar) return Promise.resolve();
  if (!canAnimate(bar)) { bar.style.width = `${toPct}%`; return Promise.resolve(); }
  const shift = (p) => `translateX(${(Math.max(0, Math.min(100, p)) - 100).toFixed(3)}%)`;
  bar.style.width = '100%';
  const anim = bar.animate([{ transform: shift(fromPct) }, { transform: shift(toPct) }], { duration: ms, easing: EASE.out, fill: 'forwards' });
  return anim.finished.then(() => { bar.style.width = `${toPct}%`; anim.cancel(); }, () => { bar.style.width = `${toPct}%`; });
}
// The two circles (sintonia.js tweenLens), from where they are now.
function tweenLens(to, ms, ease = (t) => 1 - (1 - t) ** 3) {
  const svg = sintoniaVenn();
  const from = vennProgress ?? 0;
  window.cancelAnimationFrame?.(vennFrame);
  if (!svg || reducedMotion() || typeof requestAnimationFrame !== 'function') { if (svg) paintLens(svg, to); vennProgress = to; return Promise.resolve(); }
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      vennProgress = from + (to - from) * ease(t);
      paintLens(svg, vennProgress);
      if (t < 1) vennFrame = requestAnimationFrame(step); else resolve();
    };
    vennFrame = requestAnimationFrame(step);
  });
}
// sintonia.js gainXP: inside the level the bar and the circles grow together;
// a new level fills the bar, the circles become one, a bloom, the level
// label springs, then the bar starts again from zero.
async function playGain(fromXp, toXp) {
  const before = levelInfo(fromXp);
  const after = levelInfo(toXp);
  if (!before || !after || toXp <= fromXp) return { levelUp: false };
  const pct = (info) => (info.current / info.needed) * 100;
  // gainXP: on Sintonia the page glides to the card and waits 350 ms first.
  if (sintoniaVisible()) {
    if (window.scrollY > 0) window.scrollTo?.({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    await wait(350);
  }
  const paintCard = (xp) => { releaseCard(); window.renderBondProgress?.(xp); holdCard(); };
  if (after.level === before.level) {
    await Promise.all([animBar(pct(before), pct(after), 700), tweenLens(after.current / after.needed, 700)]);
    paintCard(toXp);
    return { levelUp: false };
  }
  await Promise.all([animBar(pct(before), 100, 650), tweenLens(1, 650)]);
  const line = $('bondLevelXp');
  setText(line, `${fmt(before.needed)} / ${fmt(before.needed)} XP`);
  await tweenLens(86 / 46, 380, (t) => t * t);
  const bloom = sintoniaVenn()?.querySelector?.('.is-bloom');
  if (canAnimate(bloom)) bloom.animate([{ opacity: 0.95, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.9)' }], { duration: 900, easing: EASE.out });
  const label = $('bondResonanceLevel');
  if (canAnimate(label)) label.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 520, easing: EASE.spring });
  paintCard(toXp);
  const bar = $('bondPageFill');
  if (bar) bar.style.width = '100%';
  window.USPet?.react?.('reward');
  window.UsFeedback?.success?.();
  await Promise.all([animBar(100, 0, 10), tweenLens(after.current / after.needed, 900, (t) => 1 - (1 - t) ** 4)]);
  await animBar(0, pct(after), 400);
  return { levelUp: true, from: before.level, level: after.level };
}

// ---------- applying the equipped slots to the real UI ----------
// Retired slots (frames, stickers, badges, rings) are never painted again;
// their stored choice stays untouched so nothing is lost or reset.
function clearRetiredCosmetics(root, hero) {
  delete root.dataset.usRing;
  delete root.dataset.usSticker;
  if (hero) delete hero.dataset.usFrame;
  const sticker = $('usHeroSticker');
  if (sticker && (!sticker.hidden || sticker.innerHTML)) { sticker.hidden = true; sticker.innerHTML = ''; }
  const badge = $('usCoupleBadge');
  if (badge && (!badge.hidden || badge.innerHTML)) { badge.hidden = true; badge.innerHTML = ''; badge.removeAttribute('aria-label'); }
}
// 18/10/2026: the Android launch splash takes the theme colour on the next
// start (native UsSplashTheme, Android 13+). Sent only when it changes.
let splashThemeSent;
function syncSplashTheme(theme) {
  const name = theme || '';
  if (splashThemeSent === name) return;
  const plugin = window.Capacitor?.Plugins?.UsSplashTheme;
  if (!plugin?.set) return;
  splashThemeSent = name;
  Promise.resolve(plugin.set({ theme: name })).then((result) => {
    // The opening animation (index.html) starts from the colour Android will
    // really show next time: the theme on Android 13+, the default otherwise.
    try { window.localStorage.setItem('us:splash-theme:v1', result?.applied ? name : ''); } catch (_) {}
  }).catch(() => { splashThemeSent = undefined; });
}
window.UsSplashThemeSync = syncSplashTheme;
function applyPreferences(next = state) {
  const root = document.documentElement;
  const hero = $('homeHero');
  const prefs = next?.preferences || {};
  const value = (category) => slotValue(category, rewardToken(prefs[SLOTS[category].pref]));
  const theme = value('theme');
  const accent = value('accent');
  const effect = value('effect');
  // A data attribute on <html> restyles the whole page: written only when it changes.
  if (root.dataset.usTheme !== (theme || undefined)) { if (theme) root.dataset.usTheme = theme; else delete root.dataset.usTheme; }
  syncSplashTheme(theme);
  if (root.dataset.usAccent !== (accent || undefined)) { if (accent) root.dataset.usAccent = accent; else delete root.dataset.usAccent; }
  if (root.dataset.usEffect !== (effect || undefined)) { if (effect) root.dataset.usEffect = effect; else delete root.dataset.usEffect; }
  clearRetiredCosmetics(root, hero);
  applyLook(prefs);
}

// ---------- Due colori · the Sintonia card: two circles, one Noi ----------
// Presentation only. The two person colours never change; the closer the
// couple is to the next level, the more the circles overlap into the Noi lens.
// Numbers come from the existing XP formula (app.js bondLevelInfo).
// One media query, kept: the canvases ask on every frame.
let motionQuery = null;
const reducedMotion = () => document.documentElement?.dataset?.usMotion === 'reduced'
  || Boolean((motionQuery ||= window.matchMedia?.('(prefers-reduced-motion: reduce)') || null)?.matches);
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
  const key = d.toFixed(3);
  if (svg.__usLens === key) return;
  svg.__usLens = key;
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
let levelMomentClose = null;
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
// fromPct: how full the ring starts (1 right after the card's bar filled up).
function celebrateLevelUp(next, pending, fromPct = 0.86) {
  const level = Math.floor(Number(next?.level) || 0);
  if (!level || !document.body) return false;
  const seen = readSeenLevel();
  if (!seen || level < seen) { writeSeenLevel(level); return false; }
  if (level === seen || levelMomentOpen || document.hidden || unlockRoot()?.classList?.contains('open')) return false;
  if (!writeSeenLevel(level)) return false;
  showLevelMoment({ from: seen, level, unlocks: pending.filter(presented), fromPct });
  return true;
}
// sintonia.js levelMoment, inside the shared Momento (core.js momento):
// "Livello 6", "Intesa rara. Il prossimo arriva a 950 XP.", "Un premio
// sbloccato", Scoprilo. The beats: 1 the Sintonia ring closes, 2 the two
// colours orbit closer, 3 they merge into Noi, 4 the number rolls.
function showLevelMoment({ from, level, unlocks, fromPct = 0.86 }) {
  const rank = rankTitle(level);
  const info = levelInfo(Number(state?.total_xp) || 0);
  const need = info && info.level === level ? info.needed : 200 + (level - 1) * 150;
  const dots = Array.from({ length: 12 }, (_, i) => `<circle class="lvx-dot ${i % 2 ? 'is-b' : 'is-a'}" cx="110" cy="110" r="${i % 3 ? 2.6 : 3.6}"/>`).join('');
  const chip = unlocks.length === 1 ? 'Un premio sbloccato' : unlocks.length > 1 ? `${unlocks.length} premi sbloccati` : '';
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
    <p>${esc(rank ? `${rank}. Il prossimo arriva a ${fmt(need)} XP.` : `Il prossimo arriva a ${fmt(need)} XP.`)}</p>
    ${chip ? `<span class="us-level-moment-chip"><i></i>${esc(chip)}</span>` : ''}
    <div class="us-level-moment-actions"><button type="button" class="primary" data-us-level-go>${action}</button></div>
  </div>`;
  document.body.appendChild(root);
  levelMomentOpen = true;
  const reduced = reducedMotion();
  const visual = root.querySelector('.lvx');
  // From system Back the rewards come a moment later, once navigation.js has
  // finished unwinding history, so that same Back cannot also close them.
  const close = ({ fromBack = false } = {}) => {
    if (!root.isConnected || root.dataset.closing) return;
    root.dataset.closing = '1';
    root.removeEventListener('keydown', onKey);
    const done = () => {
      root.remove();
      levelMomentOpen = false;
      levelMomentClose = null;
      if (unlocks.length && fromBack) setTimeout(() => startUnlockQueue(unlocks), 120);
      else if (unlocks.length) startUnlockQueue(unlocks);
      else window.USPet?.react?.('reward');
    };
    if (reduced || typeof root.animate !== 'function') return done();
    // core.js closeMoment: the Momento fades in 280 ms.
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: 'forwards' }).finished.then(done, done);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  root.addEventListener('keydown', onKey);
  root.querySelector('[data-us-level-go]').addEventListener('click', () => close());
  // S10 — system Back (navigation.js) does what the button does.
  levelMomentClose = close;
  const focusLater = (ms) => setTimeout(() => root.querySelector('[data-us-level-go]')?.focus?.({ preventScroll: true }), ms);
  if (reduced || typeof root.animate !== 'function') {
    visual.classList.add('is-done');
    if (!reduced) root.classList.add('is-static');
    window.UsFeedback?.success?.();
    focusLater(0);
    return;
  }
  const R1 = fromPct < 1 ? 780 : 420;
  const M0 = R1 + 640;
  const HOLD = M0 + 480;
  const fill = { fill: 'both' };
  const inEase = 'cubic-bezier(.5,0,.9,.45)';
  const q = (selector) => visual.querySelector(selector);
  root.animate([{ clipPath: 'circle(0% at 50% 0%)' }, { clipPath: 'circle(150% at 50% 0%)' }], { duration: 700, easing: EASE.io });
  // As the mockup's Momento: every child rises 14px in 500ms, the visual at
  // 380ms, the words after the hold, 80ms apart (the visual counts as the first).
  Array.from(root.querySelectorAll('.us-level-moment-body > *')).forEach((el, i) => {
    el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: el === visual ? 380 : HOLD + i * 80, easing: EASE.out, fill: 'backwards' });
  });
  const ring = q('.lvx-ring');
  ring.animate([{ strokeDashoffset: 100 - fromPct * 100 }, { strokeDashoffset: 0 }], { duration: Math.max(1, R1 - 260), delay: 260, easing: EASE.io, ...fill });
  q('.lvx-orbit').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(540deg)' }], { duration: 640, delay: R1, easing: inEase, ...fill });
  q('.lvx-a').animate([{ transform: 'translate(0px,0px) scale(1)', opacity: 1 }, { transform: 'translate(38px,0px) scale(.72)', opacity: 1, offset: 0.92 }, { transform: 'translate(38px,0px) scale(.72)', opacity: 0 }], { duration: 780, delay: R1, easing: inEase, ...fill });
  q('.lvx-b').animate([{ transform: 'translate(0px,0px) scale(1)', opacity: 1 }, { transform: 'translate(-38px,0px) scale(.72)', opacity: 1, offset: 0.92 }, { transform: 'translate(-38px,0px) scale(.72)', opacity: 0 }], { duration: 780, delay: R1, easing: inEase, ...fill });
  ring.animate([{ opacity: 1, strokeWidth: 4 }, { opacity: 0, strokeWidth: 16 }], { duration: 420, delay: M0, easing: EASE.out, ...fill });
  q('.lvx-track').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: M0, ...fill });
  q('.lvx-noi').animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.55 }, { opacity: 1, transform: 'scale(1)' }], { duration: 640, delay: M0, easing: EASE.out, ...fill });
  q('.lvx-wave').animate([{ opacity: 0.85, transform: 'scale(.9)', strokeWidth: 8 }, { opacity: 0, transform: 'scale(2.5)', strokeWidth: 1 }], { duration: 820, delay: M0, easing: EASE.out, fill: 'forwards' });
  q('.lvx-wash').animate([{ opacity: 0.55, transform: 'scale(0)' }, { opacity: 0, transform: 'scale(24)' }], { duration: 900, delay: M0, easing: EASE.out, fill: 'backwards' });
  Array.from(visual.querySelectorAll('.lvx-dot')).forEach((dot, i) => {
    const a = (i / 12) * Math.PI * 2 + 0.25;
    const r = 80 + ((i * 37) % 28);
    dot.animate([{ opacity: 1, transform: 'translate(0px,0px) scale(1)' }, { opacity: 0, transform: `translate(${(Math.cos(a) * r).toFixed(1)}px,${(Math.sin(a) * r).toFixed(1)}px) scale(.4)` }], { duration: 820, delay: M0 + 40, easing: EASE.out, fill: 'forwards' });
  });
  q('.lvx-num').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: M0 + 120, ...fill });
  Array.from(visual.querySelectorAll('.lvx-odo i')).forEach((el) => {
    el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 420, delay: M0 + 260, easing: EASE.spring, ...fill });
  });
  setTimeout(() => { if (root.isConnected) window.UsFeedback?.success?.(); }, M0);
  focusLater(HOLD + 300);
}

// Ritmo (sintonia.js .rhythm): the days in a row and the last seven days,
// today last. The server counts the days in a row ending today or yesterday.
function renderRhythm(next = state) {
  if (!next) return;
  const block = $('usProgressionRhythm');
  if (block && block.hidden !== !SINTONIA_SHOW_RITMO) block.hidden = !SINTONIA_SHOW_RITMO;
  const days = Math.max(0, Number(next.rhythm_days) || 0);
  const compact = days === 1 ? '1 giorno' : `${days} giorni`;
  const value = $('usProgressionRhythmValue');
  const copy = $('usProgressionRhythmCopy');
  setText(value, compact);
  setText(copy, next.rhythm_today
    ? 'Oggi ci siete stati.'
    : days > 0 ? 'Una piccola cosa oggi mantiene il Ritmo.' : 'Fate una piccola cosa insieme per iniziare.');
  const segments = Array.from($('usProgressionRhythmDays')?.children || []);
  const last = next.rhythm_today ? segments.length - 1 : segments.length - 2;
  segments.forEach((segment, i) => segment.classList?.toggle?.('on', i <= last && i > last - days));
  const hub = $('noiHubResonanceMeta');
  setText(hub, `Livello ${next.level} · Ritmo ${days}`);
}

// The mockup's category order (sintonia.js CATS): the chips, the next
// unlock's "e …" and the collection all follow it.
const CHIP_ORDER = Object.freeze(['theme', 'accent', 'oggi_theme', 'oggi_effect', 'effect', 'countdown', 'companion']);
const chipRank = (category) => { const i = CHIP_ORDER.indexOf(category); return i < 0 ? CHIP_ORDER.length : i; };
// The server's next_reward may be a retired category: the next unlock is
// read from the same server rows, every presented reward of the next level.
function nextPresentedRewards(next) {
  const rewards = Array.isArray(next?.rewards) ? next.rewards : [];
  const locked = rewards.filter((reward) => !reward.unlocked && presented(reward) && artItem(reward));
  if (!locked.length) return { level: 0, rewards: [] };
  const level = Math.min(...locked.map((reward) => Number(reward.level_required) || 0));
  return {
    level,
    rewards: locked.filter((reward) => (Number(reward.level_required) || 0) === level)
      .sort((a, b) => chipRank(artItem(a).cat) - chipRank(artItem(b).cat))
  };
}
function nextPresentedReward(next) { return nextPresentedRewards(next).rewards[0] || null; }
// The mockup's names: the look, the style or the reward itself.
function presentedTitle(reward) {
  const shown = presentation(reward);
  if (shown?.kind === 'countdown') return shown.style.name;
  if (SLOTS[reward?.category]?.look) return lookForReward(reward)?.look.name || reward.title;
  return reward?.title || '';
}
function presentedDescription(reward) {
  const shown = presentation(reward);
  if (shown?.kind === 'countdown') return shown.style.note || reward.description;
  if (SLOTS[reward?.category]?.look) return lookForReward(reward)?.look.note || reward.description;
  return reward?.description || '';
}
// Points still missing to reach a level (the same curve as app.js bondLevelInfo).
function xpToLevel(total, level) {
  const info = levelInfo(total);
  if (!info || info.level >= level) return 0;
  let low = total;
  let high = total + 1;
  while ((levelInfo(high)?.level || 0) < level && high - total < 1e7) high = total + (high - total) * 2;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if ((levelInfo(mid)?.level || 0) >= level) high = mid; else low = mid;
  }
  return high - total;
}
// Paint only when the markup changed: a hydrate during a transition never
// rebuilds what is already on screen.
function paintHTML(root, markup) {
  if (root.__usMarkup === markup && root.innerHTML) return false;
  root.__usMarkup = markup;
  root.innerHTML = markup;
  return true;
}
// "Prossimo sblocco · Livello 6 / Lucciole / e Respiro · mancano 40 XP".
// The next companion still locked (companions.js), with its level.
function nextCompanion() {
  const list = window.UsCompanions?.list?.() || [];
  return list.find((c) => !c.unlocked) || null;
}
const companionArt = (c) => `<img class="us-progression-companion-art" src="${esc(c.art)}" alt="" draggable="false" decoding="async">`;
function renderNext(next = state) {
  const root = $('usProgressionNext');
  if (!root) return;
  const { level, rewards } = nextPresentedRewards(next);
  const companion = nextCompanion();
  if (companion && (!rewards.length || companion.level < level)) {
    if (root.dataset.rewardCat !== 'companion') root.dataset.rewardCat = 'companion';
    // Level already reached: the companion is on its way (the next read of get_companions_v1).
    const xp = xpToLevel(Number(next?.total_xp) || 0, companion.level);
    const line = xp > 0 ? `Un compagno sopra la barra · mancano ${fmt(xp)} XP` : 'Un compagno sopra la barra';
    paintHTML(root, `<span class="us-progression-next-preview" aria-hidden="true">${companionArt(companion)}</span><span class="us-progression-next-copy"><small>Prossimo sblocco · Livello ${companion.level}</small><b>${esc(companion.name)}</b><span>${esc(line)}</span></span><span class="us-progression-next-chev" aria-hidden="true"></span>`);
    return;
  }
  const first = rewards[0];
  const cat = first ? artItem(first).cat : '';
  if (root.dataset.rewardCat !== cat) root.dataset.rewardCat = cat;
  if (!first) {
    paintHTML(root, '<span class="us-progression-next-copy"><small>Collezione completa</small><b>Avete raggiunto tutti gli sblocchi di questa versione</b></span>');
    return;
  }
  const missing = fmt(xpToLevel(Number(next?.total_xp) || 0, level));
  const second = rewards[1] ? presentedTitle(rewards[1]) : '';
  const line = second ? `e ${second} · mancano ${missing} XP` : `mancano ${missing} XP`;
  if (paintHTML(root, `<span class="us-progression-next-preview" aria-hidden="true">${artMarkup(artItem(first))}</span><span class="us-progression-next-copy"><small>Prossimo sblocco · Livello ${level}</small><b>${esc(presentedTitle(first))}</b><span>${esc(line)}</span></span><span class="us-progression-next-chev" aria-hidden="true"></span>`)) startCanvases(root);
}

// One tile of the collection (sintonia.js tile): the art, the name and
// "In uso" / "Livello 6" / "Sbloccato" / "Incluso".
function tileMarkup({ attrs, cls = '', on, locked, level, free, title, art }) {
  const status = on ? 'In uso' : locked ? `Livello ${level}` : free ? 'Incluso' : 'Sbloccato';
  const label = `${title}${locked ? `, si sblocca al livello ${level}` : on ? ', in uso' : ''}`;
  return `<button type="button" class="us-progression-reward${cls ? ` ${cls}` : ''} ${locked ? 'is-locked' : 'is-unlocked'}${on ? ' is-equipped' : ''}" ${attrs}${locked ? ` data-locked="true" data-level="${esc(level)}"` : ''} aria-pressed="${on ? 'true' : 'false'}" aria-label="${esc(label)}"><span class="us-progression-reward-preview" aria-hidden="true">${art}</span><span class="us-progression-reward-copy"><b>${esc(title)}</b><small>${esc(status)}</small></span></button>`;
}
function rewardTile(reward) {
  return tileMarkup({
    attrs: `data-progression-reward="${esc(reward.id)}" data-category="${esc(reward.category)}"`,
    on: Boolean(reward.equipped), locked: !reward.unlocked, level: reward.level_required,
    title: reward.title, art: artMarkup(artItem(reward))
  });
}
// The free look of a slot (Notte, Orchidea, Fermo): in use when nothing else is.
function defaultTile(category, next) {
  const free = SLOT_DEFAULT[category];
  const on = !(next?.rewards || []).some((reward) => reward.category === category && reward.equipped);
  return tileMarkup({ attrs: `data-progression-default="${category}"`, on, free: true, title: free.title, art: artMarkup({ cat: category, id: free.id }) });
}
// Oggi looks: a tap uses the look on this phone, as for every other reward.
function lookTile(category, look) {
  const slot = SLOTS[category].look;
  const status = window.USOggiLook.status(slot, look.id);
  const current = (window.USOggiLook.current?.()[slot]) === look.id;
  return tileMarkup({
    attrs: `data-look-slot="${slot}" data-look-id="${esc(look.id)}"`, cls: 'us-progression-look',
    on: current, locked: status.state === 'locked', level: status.level, free: status.state === 'included',
    title: look.name, art: artMarkup({ cat: category, id: look.id })
  });
}
function countdownTile(style, next) {
  const reward = style.reward ? (next?.rewards || []).find((item) => item.id === style.reward) : null;
  const unlocked = !style.reward || Boolean(reward?.unlocked);
  return tileMarkup({
    attrs: `data-countdown-style-select="${esc(style.id)}"`, cls: 'us-progression-countdown-style',
    on: unlocked && window.USCountdown?.activeStyle?.() === style.id, locked: !unlocked, level: style.level, free: !style.reward,
    title: style.name, art: artMarkup({ cat: 'countdown', id: style.id })
  });
}
// Founder, 29/10/2026: themes and effects of Oggi live here, not in Settings:
// their groups open the full gallery (previews, the sky's city and hour).
const LOOK_GALLERY = Object.freeze({ oggi_theme: 'theme', oggi_effect: 'effect' });
function groupMarkup({ category, label, place, owned, total, tiles }) {
  const gallery = LOOK_GALLERY[category] ? `<button type="button" class="us-reward-group-gallery" data-look-gallery="${LOOK_GALLERY[category]}">Apri la galleria con le anteprime</button>` : '';
  return (open) => `<details class="us-reward-group" data-category="${category}" aria-label="${esc(label)}"${open ? ' open' : ''}>
      <summary class="us-reward-group-head"><b>${esc(label)}</b><span>${esc(place)}</span><em>${owned}/${total}</em></summary>
      <div class="us-reward-grid">${tiles}</div>${gallery}
    </details>`;
}
function countdownGroup(next) {
  const styles = countdownStyles();
  if (!styles.length || !window.USCountdown?.previewMarkup) return null;
  const owned = styles.filter((style) => !style.reward || next?.rewards?.some((r) => r.id === style.reward && r.unlocked)).length;
  return {
    category: 'countdown', label: COUNTDOWN_PRESENTATION.label, owned, total: styles.length,
    markup: groupMarkup({ category: 'countdown', label: COUNTDOWN_PRESENTATION.label, place: 'Il vostro tempo su Oggi', owned, total: styles.length, tiles: styles.map((style) => countdownTile(style, next)).join('') })
  };
}

// Compagni V1 (companions.js): Maudit, the owl, the goat and the dragon arrive
// with the levels; a tap chooses who sits above the bar on this phone.
function companionGroup() {
  const list = window.UsCompanions?.list?.();
  if (!Array.isArray(list) || !list.length) return null;
  const current = window.UsCompanions?.current?.() || 'none';
  const owned = list.filter((c) => c.unlocked).length;
  const tiles = list.map((c) => tileMarkup({
    attrs: `data-companion-pick="${esc(c.id)}"`, cls: 'us-progression-companion',
    on: c.unlocked && c.id === current, locked: !c.unlocked, level: c.level,
    title: c.name, art: companionArt(c)
  })).join('');
  return {
    category: 'companion', label: 'Compagni', owned, total: list.length,
    markup: groupMarkup({ category: 'companion', label: 'Compagni', place: 'sopra la barra', owned, total: list.length, tiles })
  };
}

// I vostri sblocchi (sintonia.js renderColl): a row of chips (name and
// owned/total) chooses the one category shown; the groups stay the same
// native <details>, so nothing is lost without the chips.
let rewardCategory = null;
const COLLECTION_SUB = Object.freeze({
  device: 'Tocca un premio per usarlo. Vale solo su questo telefono.',
  // The countdown style is saved for the couple (save_countdown_oggi_v1).
  couple: 'Tocca uno stile per usarlo. Vale per tutti e due.',
  companion: 'Tocca un compagno per tenerlo sopra la barra. Vale solo su questo telefono.'
});
function renderRewards(next = state) {
  const root = $('usProgressionRewards');
  if (!root) return;
  const rewards = Array.isArray(next?.rewards) ? next.rewards : [];
  // Only rewards with a real, visible destination; countdown-entitling rewards
  // live in the Countdown group, Oggi looks in their own groups.
  const known = rewards.filter((reward) => SLOTS[reward.category] && presented(reward) && presentation(reward).kind === reward.category && !SLOTS[reward.category].look);
  const groups = VISIBLE_SLOTS.map((category) => {
    const slot = SLOTS[category];
    let tiles = '';
    let owned = 0;
    let total = 0;
    if (slot.look) {
      if (!window.USOggiLook) return null;
      const looks = (slot.look === 'theme' ? window.USOggiLook.THEMES : window.USOggiLook.EFFECTS)
        .filter((look) => window.USOggiLook.status(slot.look, look.id).state !== 'unavailable');
      total = looks.length;
      owned = looks.filter((look) => window.USOggiLook.usable(slot.look, look.id)).length;
      tiles = looks.map((look) => lookTile(category, look)).join('');
    } else {
      const group = known.filter((reward) => reward.category === category);
      if (!group.length) return null;
      total = group.length + 1;
      owned = group.filter((reward) => reward.unlocked).length + 1;
      tiles = defaultTile(category, next) + group.map(rewardTile).join('');
    }
    if (!total) return null;
    return { category, label: slot.label, owned, total, markup: groupMarkup({ category, label: slot.label, place: slot.place, owned, total, tiles }) };
  }).filter(Boolean);
  const countdown = countdownGroup(next);
  if (countdown) groups.push(countdown);
  const companions = companionGroup();
  if (companions) groups.push(companions);
  groups.sort((a, b) => chipRank(a.category) - chipRank(b.category));
  const owned = groups.reduce((sum, group) => sum + group.owned, 0);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  if (!groups.some((group) => group.category === rewardCategory)) rewardCategory = groups[0]?.category || null;
  const chips = groups.length > 1 ? `<div class="us-reward-cats" role="group" aria-label="Categorie">${groups.map((group) => `<button type="button" class="us-reward-cat" data-reward-cat="${group.category}" aria-pressed="${group.category === rewardCategory ? 'true' : 'false'}">${esc(group.label)}<em>${group.owned}/${group.total}</em></button>`).join('')}</div>` : '';
  const markup = chips + groups.map((group) => group.markup(group.category === rewardCategory)).join('');
  // The chip row keeps where it was scrolled (the mockup rebuilds only its chips).
  // Read only when the grid really changes (a read here forces a layout).
  const scrolled = root.__usMarkup !== markup ? root.querySelector?.('.us-reward-cats')?.scrollLeft || 0 : 0;
  if (paintHTML(root, markup)) {
    const row = root.querySelector?.('.us-reward-cats');
    if (row && scrolled) row.scrollLeft = scrolled;
    startCanvases(root);
  }
  if (root.dataset.uiGroupsReady !== '1') root.dataset.uiGroupsReady = '1';
  const count = $('usProgressionRewardsCount');
  setText(count, `${owned} di ${total}`);
  const sub = $('usProgressionRewardsSub');
  setText(sub, rewardCategory === 'countdown' ? COLLECTION_SUB.couple : rewardCategory === 'companion' ? COLLECTION_SUB.companion : COLLECTION_SUB.device);
}

// Painting waits while the card plays a gain; the gain paints at its end.
// What a render paints from. Sintonia hydrates again on every tab switch:
// when nothing it shows has changed, nothing is rebuilt, re-applied or
// re-announced while the panel's entrance plays.
function renderKey(next) {
  try {
    return JSON.stringify([
      window.usProfile?.id || '', next.total_xp, next.level, next.rhythm_days, next.rhythm_today,
      (next.rewards || []).map((reward) => [reward.id, reward.token, reward.unlocked ? 1 : 0, reward.equipped ? 1 : 0, reward.active === false ? 0 : 1]),
      next.preferences || null, window.USOggiLook?.current?.() || null, window.USCountdown?.activeStyle?.() || null, rewardCategory,
      (window.UsCompanions?.list?.() || []).map((c) => [c.id, c.unlocked ? 1 : 0]), window.UsCompanions?.current?.() || ''
    ]);
  } catch (_) { return ''; }
}
let renderedKey = '';
function render(next = state) {
  if (!next) return;
  const key = renderKey(next);
  if (key && key === renderedKey && !holdsCard()) {
    renderedVisible = sintoniaVisible();
    return;
  }
  if (!holdsCard()) {
    window.renderBondProgress?.(Number(next.total_xp) || 0);
    renderSintoniaArt(next);
    renderRhythm(next);
    renderNext(next);
    renderRewards(next);
    renderedVisible = sintoniaVisible();
    renderedKey = key;
  }
  applyPreferences(next);
  window.dispatchEvent(new CustomEvent('us:progression-updated'));
}
let renderedVisible = false;

function unlockRoot() { return $('usProgressionUnlock'); }
function hideUnlock() {
  const root = unlockRoot();
  if (!root) return;
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'true');
}
// core.js momento for one reward (sintonia.js unlockQueue): the reward's
// colour floods from the top in 700 ms, the card drops in turning (820 ms
// after 320 ms) and each line rises 14 px, 80 ms apart from 380 ms.
function openUnlockMotion(root) {
  if (!canAnimate(root)) return;
  root.animate([{ clipPath: 'circle(0% at 50% 0%)' }, { clipPath: 'circle(150% at 50% 0%)' }], { duration: 700, easing: EASE.io });
  const card = root.querySelector('.us-progression-unlock-card');
  // The lines that are there (an empty count or status is not a line).
  const lines = Array.from(card?.children || []).filter((el) => el.classList.contains('us-progression-unlock-stage')
    || (!el.hidden && !el.classList.contains('us-progression-unlock-status') && el.textContent.trim() !== ''));
  lines.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 380 + i * 80, easing: EASE.out, fill: 'backwards' }));
  $('usProgressionUnlockPreview')?.animate?.([
    { transform: 'translateY(-60px) rotate(-8deg)', opacity: 0 },
    { transform: 'translateY(6px) rotate(2deg)', opacity: 1, offset: 0.7 },
    { transform: 'translateY(0) rotate(0)', opacity: 1 }
  ], { duration: 820, delay: 320, easing: EASE.out, fill: 'backwards' });
}
function paintUnlock() {
  const reward = unlockQueue[unlockIndex];
  const root = unlockRoot();
  if (!root || !reward) { hideUnlock(); return; }
  $('usProgressionUnlockCount').textContent = unlockQueue.length > 1 ? `${unlockIndex + 1} di ${unlockQueue.length}` : '';
  const shown = presentation(reward);
  const item = artItem(reward);
  $('usProgressionUnlockTitle').textContent = presentedTitle(reward);
  $('usProgressionUnlockDescription').textContent = presentedDescription(reward);
  const kicker = $('usProgressionUnlockKicker');
  if (kicker) kicker.textContent = shown?.unlock || 'Hai sbloccato';
  root.dataset.category = shown?.kind || reward.category || '';
  root.dataset.rewardToken = reward.token || '';
  // The Momento takes the reward's own colour (the mockup's it.c).
  root.style?.setProperty?.('--mc', itemColor(item?.cat, item?.id) || 'var(--us-noi)');
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
    preview.innerHTML = artMarkup(item, true);
    startCanvases(preview);
  }
  const use = $('usProgressionUnlockUse');
  if (use) use.textContent = shown?.kind === 'countdown' ? 'Usalo nel countdown' : reward.category === 'effect' || reward.category === 'oggi_effect' ? 'Attivalo ora' : 'Usalo ora';
  $('usProgressionUnlockStatus').textContent = '';
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    root.classList.add('open');
    openUnlockMotion(root);
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
// core.js closeMoment: the Momento fades in 280 ms.
async function fadeUnlock() {
  const root = unlockRoot();
  if (!root || root.getAttribute('aria-hidden') !== 'false') return;
  if (!canAnimate(root)) { hideUnlock(); return; }
  const anim = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: 'forwards' });
  await anim.finished.catch(() => {});
  hideUnlock();
  anim.cancel();
}
// The colour flood of a navigation (due-colori.js) has finished.
async function waitFlood(limit = 2500) {
  const start = Date.now();
  await wait(40);
  while (window.UsDueColori?.isFlooding?.() && Date.now() - start < limit) await wait(40);
}
const ON_OGGI = Object.freeze(['oggi_theme', 'oggi_effect', 'effect', 'countdown']);
// After "Usalo ora" the mockup shows where the reward lives (Oggi for the
// Oggi looks, the symbol and the countdown), says it is in use and, after a
// breath, opens the next reward; "Più tardi" opens the next one at once.
async function advanceUnlock({ used = '', oggi = false } = {}) {
  const animated = canAnimate(unlockRoot());
  await fadeUnlock();
  if (used) {
    if (oggi && document.querySelector?.('.page.active')?.id !== 'home' && typeof window.go === 'function') {
      window.go('home', { nav: true });
      if (animated) await waitFlood();
    }
    window.toast?.(`${used} · in uso`, { icon: 'check', quiet: false });
  }
  unlockIndex += 1;
  if (unlockIndex < unlockQueue.length) {
    if (used && animated) await wait(oggi ? 1600 : 700);
    paintUnlock();
    return;
  }
  hideUnlock();
  unlockQueue = [];
  unlockIndex = 0;
  // The moment is over and the shell is visible again: the PET may celebrate.
  window.USPet?.react?.('reward');
  await hydrate({ showUnlocks: false, force: true });
}
async function dismissUnlock() {
  if (unlockBusy) return;
  const reward = unlockQueue[unlockIndex];
  if (!reward) return hideUnlock();
  unlockBusy = true;
  try {
    await ackReward(reward.id);
  } catch (error) {
    console.warn('[US Progression] ack unlock', error);
    $('usProgressionUnlockStatus').textContent = 'Non riesco a salvare ora. Riprova.';
    unlockBusy = false;
    return;
  }
  unlockBusy = false;
  await advanceUnlock();
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
// The free look of a slot (Notte, Orchidea, Fermo): nothing equipped on this phone.
function clearDeviceSlot(category) {
  if (!state || !SLOTS[category] || SLOTS[category].retired || SLOTS[category].look) return false;
  const prefs = { ...emptyDevicePreferences(), ...(state.preferences || {}) };
  prefs[SLOTS[category].pref] = null;
  if (!persistDevicePreferences(prefs)) return false;
  state.preferences = prefs;
  state.rewards = state.rewards.map((item) => ({
    ...item,
    equipped: Boolean(item.unlocked && SLOTS[item.category] && prefs[SLOTS[item.category].pref] === item.id)
  }));
  render(state);
  return true;
}
async function useUnlock() {
  const reward = unlockQueue[unlockIndex];
  if (!reward || unlockBusy) return;
  const shown = presentation(reward);
  const title = presentedTitle(reward);
  const oggi = ON_OGGI.includes(shown?.kind);
  if (shown?.kind === 'countdown' || SLOTS[reward.category]?.look) {
    unlockBusy = true;
    let applied = true;
    try {
      let ok = true;
      if (shown.kind === 'countdown') {
        if (window.USCountdown?.hasActive?.()) ok = Boolean(await window.USCountdown?.setStyle?.(shown.style.id));
        else { applied = false; window.toast?.('Lo trovi tra gli stili quando scegli un countdown.'); }
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
    window.UsFeedback?.action?.();
    await advanceUnlock(applied ? { used: title, oggi } : {});
    return;
  }
  const ok = await equipReward(reward.id, { acknowledge: true, ensureEquipped: true });
  if (!ok) return;
  window.UsFeedback?.action?.();
  await advanceUnlock({ used: title, oggi });
}

// ---------- the gain, in Sintonia (sintonia.js gainXP) ----------
// Points that arrive while Sintonia is on screen grow the card in place; a
// new level then opens the level Momento with the ring already full.
let gainRun = null;
let missionRun = null;
async function finishGain(result, showUnlocks = true) {
  releaseCard();
  render(state);
  if (!showUnlocks) return;
  const pending = Array.isArray(state?.pending_unlocks) ? state.pending_unlocks : [];
  if (result?.levelUp) await wait(450);
  if (!celebrateLevelUp(state, pending, result?.levelUp ? 1 : 0.86)) startUnlockQueue(pending);
}
function startGain(fromXp, { showUnlocks = true } = {}) {
  holdCard();
  gainRun = (async () => {
    const result = await playGain(fromXp, Number(state?.total_xp) || 0);
    await finishGain(result, showUnlocks);
  })().catch((error) => console.warn('[US Progression] gain', error)).finally(() => { releaseCard(); gainRun = null; });
  return gainRun;
}
// noi.js questComplete: the confirmed card sparkles, the sheet closes, the
// colour floods into Gioca, the segment slides to Sintonia, "Missione
// completata · +40 XP ♡", then the card grows. true when it took over.
function missionCompleted({ xp, questId } = {}) {
  const points = Math.round(Number(xp) || 0);
  if (points <= 0 || missionRun || gainRun || !state || !document.body || typeof document.querySelector !== 'function') return false;
  const fromXp = Number(state.total_xp) || 0;
  holdCard();
  const id = String(questId || '').replace(/["\\]/g, '');
  burst(id ? document.querySelector(`#bondQuestList [data-quest-id="${id}"]`) : null, 8);
  window.UsFeedback?.success?.();
  missionRun = (async () => {
    await wait(700);
    window.closeNoiSection?.();
    await wait(280);
    if (document.querySelector('.page.active')?.id !== 'quiz') {
      window.openQuizHub?.({ nav: true });
      await waitFlood();
    }
    const tab = $('usGiocaTabSintonia');
    if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    await wait(500);
    window.toast?.(`Missione completata · +${points} XP ♡`, { icon: 'sparkle', quiet: false });
    await wait(700);
    await hydrate({ showUnlocks: false, force: true });
    const toXp = Math.max(Number(state?.total_xp) || 0, fromXp);
    const result = sintoniaVisible()
      ? await playGain(fromXp, toXp)
      : { levelUp: (levelInfo(toXp)?.level || 0) > (levelInfo(fromXp)?.level || 0) };
    await finishGain(result, true);
  })().catch((error) => console.warn('[US Progression] mission', error)).finally(() => { releaseCard(); missionRun = null; });
  return true;
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
    // Points that arrive while the card is already on screen grow it in place.
    const before = state && renderedVisible && !holdsCard() && !gainRun && !missionRun ? Number(state.total_xp) || 0 : null;
    state = applyDevicePreferences(data || null);
    if (before !== null && (Number(state?.total_xp) || 0) > before && sintoniaVisible()) {
      startGain(before, { showUnlocks });
      return state;
    }
    render(state);
    if (showUnlocks && !holdsCard()) {
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

// The collection: chips switch the category (the grid rises 10 px in 300 ms).
function showCategory(category, { animate = false } = {}) {
  if (!category) return;
  rewardCategory = category;
  renderRewards(state);
  const grid = $('usProgressionRewards')?.querySelector?.('.us-reward-group[open] .us-reward-grid');
  if (animate && canAnimate(grid)) grid.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE.out });
}
// The Italian name of a tile (toasts are translated as whole sentences).
function tileTitle(tile) {
  const data = tile.dataset || {};
  if (data.progressionReward) return rewardById(data.progressionReward)?.title || '';
  if (data.progressionDefault) return SLOT_DEFAULT[data.progressionDefault]?.title || '';
  if (data.countdownStyleSelect) return countdownStyles().find((style) => style.id === data.countdownStyleSelect)?.name || '';
  if (data.companionPick) return (window.UsCompanions?.list?.() || []).find((c) => c.id === data.companionPick)?.name || '';
  if (data.lookSlot) return window.USOggiLook?.find?.(data.lookSlot, data.lookId)?.name || '';
  return '';
}
const tileSelector = (tile) => {
  const data = tile.dataset || {};
  if (data.progressionReward) return `[data-progression-reward="${data.progressionReward}"]`;
  if (data.progressionDefault) return `[data-progression-default="${data.progressionDefault}"]`;
  if (data.countdownStyleSelect) return `[data-countdown-style-select="${data.countdownStyleSelect}"]`;
  if (data.lookSlot) return `[data-look-slot="${data.lookSlot}"][data-look-id="${data.lookId}"]`;
  if (data.companionPick) return `[data-companion-pick="${data.companionPick}"]`;
  return '';
};
$('usProgressionRewards')?.addEventListener('click', async (event) => {
  const chip = event.target.closest?.('[data-reward-cat]');
  if (chip?.dataset?.rewardCat) {
    showCategory(chip.dataset.rewardCat, { animate: true });
    window.UsFeedback?.selection?.();
    return;
  }
  const gallery = event.target.closest?.('[data-look-gallery]');
  if (gallery?.dataset?.lookGallery) { window.USOggiLook?.openGallery?.({ tab: gallery.dataset.lookGallery }); return; }
  const tile = event.target.closest?.('[data-progression-reward],[data-progression-default],[data-countdown-style-select],[data-look-slot],[data-companion-pick]');
  if (!tile || tile.disabled) return;
  const data = tile.dataset || {};
  const title = tileTitle(tile);
  // Locked (the mockup's .rw.is-locked: a real button that presses, its
  // label says the level): when it arrives, and a small shake.
  if (data.locked === 'true') {
    window.toast?.(`Si sblocca al livello ${data.level || ''} di Sintonia`, { quiet: true, icon: 'lock' });
    if (canAnimate(tile)) tile.animate([{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 320 });
    return;
  }
  if (tile.getAttribute?.('aria-pressed') === 'true') {
    window.toast?.(`${title} è già in uso`, { quiet: true });
    return;
  }
  let ok = false;
  let category = '';
  if (data.countdownStyleSelect) {
    category = 'countdown';
    if (!window.USCountdown?.hasActive?.()) {
      window.toast?.('Scegli prima un countdown da mostrare in Oggi.');
      return;
    }
    ok = await window.USCountdown?.setStyle?.(data.countdownStyleSelect);
    if (ok) renderRewards(state);
  } else if (data.lookSlot) {
    // Il vostro cielo needs its city and hour: it opens its own page first.
    if (data.lookSlot === 'theme' && data.lookId === 'sky') { window.USOggiLook?.openGallery?.({ tab: 'theme', look: 'sky' }); return; }
    category = LOOK_SLOT[data.lookSlot] || '';
    ok = setDeviceLook(data.lookSlot, data.lookId);
  } else if (data.progressionDefault) {
    category = data.progressionDefault;
    ok = clearDeviceSlot(category);
  } else if (data.progressionReward) {
    category = rewardById(data.progressionReward)?.category || '';
    ok = await equipReward(data.progressionReward);
  } else if (data.companionPick) {
    category = 'companion';
    ok = Boolean(window.UsCompanions?.choose?.(data.companionPick));
    if (ok) renderRewards(state);
  }
  if (!ok) {
    window.toast?.('Non riesco ad applicarlo ora. Riprova.');
    return;
  }
  const selector = tileSelector(tile);
  burst(selector ? $('usProgressionRewards')?.querySelector?.(selector) : null, 6);
  window.UsFeedback?.action?.();
  if (title) window.toast?.(category === 'companion' ? `${title} · con te sopra la barra` : ON_OGGI.includes(category) ? `${title} · in uso su Oggi` : `${title} · in uso`, { icon: 'check', quiet: false });
  if (data.progressionReward) await hydrate({ showUnlocks: false, force: true });
});
window.addEventListener?.('us:countdown-updated', () => renderRewards(state));
window.addEventListener?.('us:companions-updated', () => { renderNext(state); renderRewards(state); });
$('usProgressionUnlockUse')?.addEventListener('click', useUnlock);
$('usProgressionUnlockLater')?.addEventListener('click', dismissUnlock);
// The next unlock opens its category in the collection.
$('usProgressionNext')?.addEventListener('click', () => {
  const category = $('usProgressionNext')?.dataset?.rewardCat;
  if (!category) return;
  showCategory(category);
  $('usProgressionRewards')?.querySelector?.('.us-reward-group[open] .us-reward-grid')?.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
});
// Ultime crescite and Come cresce la Sintonia open in place (sintonia.js
// .fold): the body fades down 6 px in 280 ms, the caret turns.
document.querySelectorAll?.('[data-sintonia-fold]')?.forEach?.((button) => button.addEventListener('click', () => {
  const section = button.parentElement;
  const body = $(button.getAttribute('aria-controls'));
  const open = section?.dataset?.open !== 'true';
  if (section) section.dataset.open = String(open);
  button.setAttribute('aria-expanded', String(open));
  if (body) body.hidden = !open;
  if (open && canAnimate(body)) body.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE.out });
}));

// S5 — inside "Come cresce la Sintonia" each source opens its own place.
$('usSintoniaGrow')?.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-sintonia-go]')?.dataset?.sintoniaGo;
  if (!target) return;
  if (target === 'daily') window.openToday?.();
  else if (target === 'games') {
    $('usGiocaTabGames')?.click?.();
    window.scrollTo?.({ top: 0, behavior: 'auto' });
  } else if (target === 'quest') {
    window.go?.('bond', { nav: true });
    setTimeout(() => window.openNoiSection?.('quest'), 60);
  } else if (target === 'memory') {
    window.go?.('moments', { nav: true });
    setTimeout(() => window.UsMomentComposer?.open?.(), 60);
  }
});

// S10 — system Back closes the reward window and the level moment exactly
// like their own buttons (navigation.js layers).
function closeUnlock() {
  if (unlockRoot()?.getAttribute('aria-hidden') !== 'false') return false;
  dismissUnlock();
  return true;
}
function closeLevelMoment() {
  if (!levelMomentClose) return false;
  levelMomentClose({ fromBack: true });
  return true;
}

window.USProgression = Object.freeze({
  hydrate,
  refreshAfterAction,
  equip: (rewardId) => equipReward(rewardId),
  setLook: async (slot, id) => setDeviceLook(slot, id),
  getState: () => state,
  closeUnlock,
  closeLevelMoment,
  previewMarkup,
  holdsCard,
  missionCompleted,
  showCategory,
  celebrateXp: xpPop,
  burst
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
    syncSplashTheme('');
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
