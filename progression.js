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
const SLOTS = Object.freeze({
  frame: { pref: 'frame_reward_id', label: 'Cornici', place: 'sulla foto di Oggi', unlock: 'NUOVA CORNICE' },
  sticker: { pref: 'sticker_reward_id', label: 'Adesivi', place: 'su Oggi e sull’ultimo ricordo', unlock: 'NUOVO ADESIVO' },
  badge: { pref: 'badge_reward_id', label: 'Spille', place: 'tra voi due, in Noi', unlock: 'NUOVA SPILLA' },
  ring: { pref: 'ring_reward_id', label: 'Anelli', place: 'attorno ai vostri ritratti', unlock: 'NUOVO ANELLO' },
  theme: { pref: 'theme_reward_id', label: 'Temi', place: 'l’atmosfera di tutta US', unlock: 'NUOVO TEMA' },
  accent: { pref: 'accent_reward_id', label: 'Accenti', place: 'controlli, progressi, navigazione', unlock: 'NUOVO ACCENTO' },
  effect: { pref: 'effect_reward_id', label: 'Effetti', place: 'sul simbolo US', unlock: 'NUOVO EFFETTO' }
});
const SLOT_ORDER = Object.keys(SLOTS);
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
function sanitizeDevicePreferences(candidate, next) {
  const prefs = emptyDevicePreferences();
  const rewards = Array.isArray(next?.rewards) ? next.rewards : [];
  for (const category of SLOT_ORDER) {
    const pref = SLOTS[category].pref;
    const id = typeof candidate?.[pref] === 'string' ? candidate[pref] : null;
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
  if (!state || !reward?.unlocked || !SLOTS[reward.category]) return false;
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
function badgeMarkup(value, title) {
  return `<span class="us-badge" data-badge="${esc(value)}"><span class="us-badge-face">${esc(title)}</span></span>`;
}
function stickerMarkup(value) {
  if (value === 'ours') return '<span class="us-sticker" data-sticker="ours"><span>ours</span></span>';
  if (value === 'ticket') return '<span class="us-sticker" data-sticker="ticket"><small>AMMESSI</small><b>2</b></span>';
  if (value === 'stamp') return `<span class="us-sticker" data-sticker="stamp"><span class="us-sticker-stamp-face"><img src="${US_SYMBOL}" alt="" decoding="async" draggable="false"></span><small>PER DUE</small></span>`;
  return '';
}
function previewMarkup(reward) {
  const category = reward?.category;
  const value = slotValue(category, reward?.token);
  if (category === 'frame') return `<span class="us-cos-photo" data-frame="${esc(value)}"></span>`;
  if (category === 'sticker') return `<span class="us-cos-photo is-sticker">${stickerMarkup(value)}</span>`;
  if (category === 'badge') return `<span class="us-cos-stage">${badgeMarkup(value, reward.title)}</span>`;
  if (category === 'ring') return `<span class="us-cos-stage"><span class="us-cos-avatar" data-ring="${esc(value)}"><span>B</span></span><i class="us-cos-ring-link" data-ring="${esc(value)}"></i><span class="us-cos-avatar" data-ring="${esc(value)}"><span>F</span></span></span>`;
  if (category === 'theme') return `<span class="us-cos-theme" data-theme="${esc(value)}"><i class="us-cos-theme-bar"></i><i class="us-cos-theme-card"></i><i class="us-cos-theme-pill"></i></span>`;
  if (category === 'accent') return `<span class="us-cos-accent" data-accent="${esc(value)}"><i class="us-cos-accent-track"><i></i></i><i class="us-cos-accent-pill"></i><i class="us-cos-accent-nav"><i></i><i></i><i></i></i></span>`;
  if (category === 'effect') return `<span class="us-cos-stage"><span class="us-cos-logo" data-effect="${esc(value)}"><img src="${US_SYMBOL}" alt="" decoding="async" draggable="false"></span></span>`;
  return '<span class="us-cos-stage"></span>';
}

// ---------- applying the equipped slots to the real UI ----------
function paintStickers(value) {
  const markup = value ? stickerMarkup(value) : '';
  const hero = $('usHeroSticker');
  if (hero) {
    if (hero.dataset.sticker !== (value || '')) hero.innerHTML = markup;
    hero.dataset.sticker = value || '';
    hero.hidden = !markup;
  }
  const grid = $('momentsGrid');
  if (!grid) return;
  const first = grid.querySelector('.moment-card[data-moment-id]');
  grid.querySelectorAll('.us-memory-sticker').forEach((node) => {
    if (!markup || node.parentElement !== first || node.dataset.sticker !== value) node.remove();
  });
  if (markup && first && !first.querySelector(':scope > .us-memory-sticker')) {
    first.insertAdjacentHTML('beforeend', `<span class="us-memory-sticker" data-sticker="${esc(value)}" aria-hidden="true">${markup}</span>`);
  }
}
function paintBadge(reward) {
  const host = $('usCoupleBadge');
  if (!host) return;
  const value = reward ? slotValue('badge', reward.token) : '';
  if (!value) { host.hidden = true; host.innerHTML = ''; host.removeAttribute('aria-label'); return; }
  host.innerHTML = badgeMarkup(value, reward.title);
  host.setAttribute('aria-label', `Spilla: ${reward.title}`);
  host.hidden = false;
}
function applyPreferences(next = state) {
  const root = document.documentElement;
  const hero = $('homeHero');
  const prefs = next?.preferences || {};
  const value = (category) => slotValue(category, rewardToken(prefs[SLOTS[category].pref]));
  const theme = value('theme');
  const accent = value('accent');
  const effect = value('effect');
  const ring = value('ring');
  const frame = value('frame');
  const sticker = value('sticker');
  if (theme) root.dataset.usTheme = theme; else delete root.dataset.usTheme;
  if (accent) root.dataset.usAccent = accent; else delete root.dataset.usAccent;
  if (effect) root.dataset.usEffect = effect; else delete root.dataset.usEffect;
  if (ring) root.dataset.usRing = ring; else delete root.dataset.usRing;
  if (sticker) root.dataset.usSticker = sticker; else delete root.dataset.usSticker;
  if (hero) {
    if (frame) hero.dataset.usFrame = frame;
    else delete hero.dataset.usFrame;
  }
  paintBadge(rewardById(prefs.badge_reward_id));
  paintStickers(sticker);
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

function renderNext(next = state) {
  const root = $('usProgressionNext');
  if (!root) return;
  const reward = next?.next_reward;
  if (!reward) {
    root.innerHTML = '<small>PROSSIMO SBLOCCO</small><b>Avete raggiunto tutti gli sblocchi di questa versione</b>';
    return;
  }
  root.innerHTML = `<span class="us-progression-next-preview" aria-hidden="true">${previewMarkup(reward)}</span><span class="us-progression-next-copy"><small>PROSSIMO SBLOCCO · LIVELLO ${Number(reward.level_required) || 0}</small><b>${esc(reward.title)}</b><span>${esc(reward.description)}</span></span>`;
}

function rewardTile(reward) {
  const locked = !reward.unlocked;
  const equipped = Boolean(reward.equipped);
  const status = locked ? `Livello ${reward.level_required}` : equipped ? 'In uso' : 'Sbloccato';
  const label = locked ? `Livello ${reward.level_required}` : equipped ? 'In uso · tocca per togliere' : 'Sbloccato · tocca per usare';
  return `<button type="button" class="us-progression-reward ${locked ? 'is-locked' : 'is-unlocked'} ${equipped ? 'is-equipped' : ''}" data-progression-reward="${esc(reward.id)}" data-category="${esc(reward.category)}" ${locked ? 'disabled' : ''} aria-pressed="${equipped ? 'true' : 'false'}" aria-label="${esc(reward.title)} · ${esc(label)}. ${esc(reward.description)}">
      <span class="us-progression-reward-preview" data-reward-token="${esc(reward.token)}" aria-hidden="true">${previewMarkup(reward)}</span>
      <span class="us-progression-reward-copy"><b>${esc(reward.title)}</b><small>${esc(status)}</small></span>
    </button>`;
}

function renderRewards(next = state) {
  const root = $('usProgressionRewards');
  if (!root) return;
  const rewards = Array.isArray(next?.rewards) ? next.rewards : [];
  const known = rewards.filter((reward) => SLOTS[reward.category]);
  root.innerHTML = SLOT_ORDER.map((category) => {
    const group = known.filter((reward) => reward.category === category);
    if (!group.length) return '';
    const owned = group.filter((reward) => reward.unlocked).length;
    return `<section class="us-reward-group" data-category="${category}" aria-label="${esc(SLOTS[category].label)}">
      <header class="us-reward-group-head"><b>${esc(SLOTS[category].label)}</b><span>${esc(SLOTS[category].place)}</span><em>${owned}/${group.length}</em></header>
      <div class="us-reward-grid">${group.map(rewardTile).join('')}</div>
    </section>`;
  }).join('');
  const count = $('usProgressionRewardsCount');
  if (count) count.textContent = `${known.filter((reward) => reward.unlocked).length} di ${known.length}`;
}

function render(next = state) {
  if (!next) return;
  window.renderBondProgress?.(Number(next.total_xp) || 0);
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
  $('usProgressionUnlockTitle').textContent = reward.title;
  $('usProgressionUnlockDescription').textContent = reward.description;
  const kicker = $('usProgressionUnlockKicker');
  if (kicker) kicker.textContent = SLOTS[reward.category]?.unlock || 'HAI SBLOCCATO';
  const preview = $('usProgressionUnlockPreview');
  if (preview) {
    preview.dataset.rewardToken = reward.token || '';
    preview.dataset.category = reward.category || '';
    preview.innerHTML = previewMarkup(reward);
  }
  const use = $('usProgressionUnlockUse');
  if (use) use.textContent = reward.category === 'effect' ? 'Attivalo ora' : 'Usalo ora';
  $('usProgressionUnlockStatus').textContent = '';
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    root.classList.add('open');
    window.UsFeedback?.success?.();
  });
}
function startUnlockQueue(pending) {
  if (!Array.isArray(pending) || !pending.length || unlockRoot()?.classList.contains('open')) return;
  unlockQueue = pending.slice();
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
  if (!reward) return;
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
    if (showUnlocks) startUnlockQueue(state?.pending_unlocks || []);
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
  const button = event.target.closest?.('[data-progression-reward]');
  if (!button || button.disabled) return;
  const rewardId = button.dataset.progressionReward;
  const ok = await equipReward(rewardId);
  if (ok) {
    window.UsFeedback?.action?.();
    await hydrate({ showUnlocks: false, force: true });
  }
});
$('usProgressionUnlockUse')?.addEventListener('click', useUnlock);
$('usProgressionUnlockLater')?.addEventListener('click', dismissUnlock);

// Ricordi re-renders its grid on every hydrate; keep the sticker on the newest card.
const momentsGrid = $('momentsGrid');
if (momentsGrid && typeof MutationObserver === 'function') {
  new MutationObserver(() => {
    const sticker = document.documentElement.dataset.usSticker || '';
    const first = momentsGrid.querySelector('.moment-card[data-moment-id]');
    const current = momentsGrid.querySelector('.us-memory-sticker');
    if (sticker ? current?.parentElement !== first || current?.dataset.sticker !== sticker : current) paintStickers(sticker);
  }).observe(momentsGrid, { childList: true });
}

window.USProgression = Object.freeze({
  hydrate,
  refreshAfterAction,
  equip: (rewardId) => equipReward(rewardId),
  getState: () => state,
  previewMarkup
});

function boot() {
  if (!window.usProfile || typeof sb === 'undefined') return setTimeout(boot, 250);
  setTimeout(() => hydrate({ showUnlocks: true }), 900);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();
