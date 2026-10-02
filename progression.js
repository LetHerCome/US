(() => {
'use strict';
if (window.__usProgressionV1Installed) return;
window.__usProgressionV1Installed = true;

const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
let state = null;
let loading = null;
let refreshTimer = null;
let unlockQueue = [];
let unlockIndex = 0;
let unlockBusy = false;

function rewardById(id) {
  return state?.rewards?.find((reward) => reward.id === id) || null;
}
function rewardToken(id) {
  return rewardById(id)?.token || '';
}
function cleanToken(token, prefix) {
  return String(token || '').startsWith(prefix) ? String(token).slice(prefix.length) : '';
}
function applyPreferences(next = state) {
  const root = document.documentElement;
  const hero = $('homeHero');
  const prefs = next?.preferences || {};
  const theme = cleanToken(rewardToken(prefs.theme_reward_id), 'theme_');
  const frame = cleanToken(rewardToken(prefs.frame_reward_id), 'frame_');
  const effect = cleanToken(rewardToken(prefs.effect_reward_id), 'effect_');
  if (theme) root.dataset.usTheme = theme; else delete root.dataset.usTheme;
  if (effect) root.dataset.usEffect = effect; else delete root.dataset.usEffect;
  if (hero) {
    if (frame) hero.dataset.usFrame = frame;
    else delete hero.dataset.usFrame;
  }
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
  root.innerHTML = `<small>PROSSIMO SBLOCCO · LIVELLO ${Number(reward.level_required) || 0}</small><b>${esc(reward.title)}</b><span>${esc(reward.description)}</span>`;
}

function renderRewards(next = state) {
  const root = $('usProgressionRewards');
  if (!root) return;
  const rewards = Array.isArray(next?.rewards) ? next.rewards : [];
  root.innerHTML = rewards.map((reward) => {
    const locked = !reward.unlocked;
    const equipped = Boolean(reward.equipped);
    const label = locked ? `Livello ${reward.level_required}` : equipped ? 'In uso · tocca per togliere' : 'Sbloccato';
    return `<button type="button" class="us-progression-reward ${locked ? 'is-locked' : 'is-unlocked'} ${equipped ? 'is-equipped' : ''}" data-progression-reward="${esc(reward.id)}" ${locked ? 'disabled' : ''} aria-label="${esc(reward.title)} · ${esc(label)}">
      <span class="us-progression-reward-preview" data-reward-token="${esc(reward.token)}" aria-hidden="true"></span>
      <span class="us-progression-reward-copy"><small>${esc(label)}</small><b>${esc(reward.title)}</b><span>${esc(reward.description)}</span></span>
    </button>`;
  }).join('');
}

function render(next = state) {
  if (!next) return;
  window.renderBondProgress?.(Number(next.total_xp) || 0);
  renderRhythm(next);
  renderNext(next);
  renderRewards(next);
  applyPreferences(next);
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
  const preview = $('usProgressionUnlockPreview');
  if (preview) preview.dataset.rewardToken = reward.token || '';
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
async function equipReward(rewardId, { acknowledge = false } = {}) {
  if (unlockBusy || !rewardId) return false;
  unlockBusy = true;
  try {
    const { data, error } = await sb.rpc('equip_progression_reward', { target_reward_id: rewardId });
    if (error) throw error;
    state = data || state;
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
  const ok = await equipReward(reward.id, { acknowledge: true });
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
    state = data || null;
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

window.USProgression = Object.freeze({
  hydrate,
  refreshAfterAction,
  equip: (rewardId) => equipReward(rewardId),
  getState: () => state
});

function boot() {
  if (!window.usProfile || typeof sb === 'undefined') return setTimeout(boot, 250);
  setTimeout(() => hydrate({ showUnlocks: true }), 900);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();