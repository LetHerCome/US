(() => {
'use strict';
if (window.__usHomeCleanupInstalled) return;
window.__usHomeCleanupInstalled = true;

const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function partnerName() {
  return window.UsIdentity?.current().partnerName || 'La tua persona';
}
window.addEventListener('us-identity-change', () => paintDailyInGioca());

function dailyModel() {
  const question = window.todayQuestion;
  const state = window.todayState;
  if (!question?.id || !question?.question || !state) return null;
  if (state.both_answered) {
    const seen = Boolean(window.todayRevealMeta?.my_reveal_seen_at);
    return { questionId: question.id, question: question.question, state: 'reveal', meta: seen ? 'Risposte viste · puoi rileggerle' : 'Le vostre risposte sono pronte', cta: seen ? 'Rivedi' : 'Scopri', nudge: !seen };
  }
  if (state.my_answer != null) {
    return { questionId: question.id, question: question.question, state: 'waiting', meta: `Hai risposto · aspettiamo ${partnerName()}`, cta: 'Apri', nudge: false };
  }
  if (state.partner_has_answer) {
    return { questionId: question.id, question: question.question, state: 'answer', meta: `${partnerName()} ha già risposto · tocca a te`, cta: 'Rispondi', nudge: true };
  }
  return { questionId: question.id, question: question.question, state: 'answer', meta: 'Una domanda per voi oggi', cta: 'Rispondi', nudge: true };
}

function dailyMarkup(model) {
  if (!model) return '';
  return `<button type="button" class="us-gv2-daily" data-us-daily-entry data-daily-state="${esc(model.state)}" aria-label="Domanda del giorno: ${esc(model.question)}. ${esc(model.cta)}"><span class="us-gv2-daily-mark" aria-hidden="true"></span><span class="us-gv2-daily-copy"><small>DOMANDA DI OGGI</small><b>${esc(model.question)}</b><span class="us-gv2-daily-state">${esc(model.meta)}</span></span><span class="us-gv2-daily-cta">${esc(model.cta)}</span></button>`;
}

function dailySignature(model) {
  return model ? `${model.questionId}:${model.state}:${model.cta}:${model.meta}` : '';
}
function paintDailyInGioca() {
  const hub = $('quizHub');
  if (!hub) return;
  const model = dailyModel();
  const existing = hub.querySelector?.('[data-us-daily-entry]');
  if (!model || hub.classList.contains('hidden')) { existing?.remove?.(); return; }
  const signature = dailySignature(model);
  if (existing?.dataset?.usDailySignature === signature) return;
  existing?.remove?.();
  // V3: the daily question sits right after Per voi (its slot), else after the head.
  const head = hub.querySelector?.('.us-gv2-daily-slot') || hub.querySelector?.('.us-gv2-head');
  if (!head) return;
  head.insertAdjacentHTML('afterend', dailyMarkup(model).replace('data-us-daily-entry', `data-us-daily-entry data-us-daily-signature="${esc(signature)}"`));
}

const nudgeSeen = new Set();
let nudgeTimer = 0;
function paintDailyNudge({ force = false } = {}) {
  const root = $('usDailyNudge');
  if (!root) return;
  const model = dailyModel();
  if (!model?.nudge) {
    root.hidden = true;
    return;
  }
  const signature = `${model.questionId}:${model.state}:${model.cta}`;
  if (!force && nudgeSeen.has(signature)) return;
  nudgeSeen.add(signature);
  root.innerHTML = `<span class="us-daily-nudge-copy"><small>DOMANDA DI OGGI</small><b>${esc(model.meta)}</b></span><span class="us-daily-nudge-cta">${esc(model.cta)} ›</span>`;
  root.hidden = false;
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    root.hidden = true;
  }, 6500);
}

function syncDailySurfaces(options) {
  paintDailyInGioca();
  paintDailyNudge(options);
}

function openDailyInGioca() {
  const active = document.querySelector('.page.active')?.id;
  if (active !== 'quiz') window.openQuizHub?.({ motionCommit: true });
  setTimeout(() => originalOpenToday?.(), active === 'quiz' ? 0 : 90);
}

const originalOpenToday = window.openToday;
if (typeof originalOpenToday === 'function') window.openToday = openDailyInGioca;

const originalHydrateToday = window.hydrateToday;
if (typeof originalHydrateToday === 'function') {
  window.hydrateToday = async (...args) => {
    const value = await originalHydrateToday(...args);
    syncDailySurfaces();
    return value;
  };
}

$('usDailyNudge')?.addEventListener('click', () => openDailyInGioca());
$('quizHub')?.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-us-daily-entry]')) {
    event.preventDefault();
    openDailyInGioca();
  }
});

const todaySheet = $('today');
if (todaySheet && typeof MutationObserver === 'function') {
  let dailyQueued = false;
  new MutationObserver(() => {
    if (dailyQueued) return;
    dailyQueued = true;
    queueMicrotask(() => { dailyQueued = false; syncDailySurfaces(); });
  }).observe(todaySheet, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
}

const quizHub = $('quizHub');
if (quizHub && typeof MutationObserver === 'function') {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; paintDailyInGioca(); });
  }).observe(quizHub, { childList: true, subtree: false });
}

const bond = $('bond');
if (bond && typeof MutationObserver === 'function') {
  new MutationObserver(() => {
    if (bond.classList.contains('active')) window.refreshNoiWeekBoard?.();
  }).observe(bond, { attributes: true, attributeFilter: ['class'] });
}
window.addEventListener('online', () => {
  if ($('bond')?.classList.contains('active')) window.refreshNoiWeekBoard?.();
});
document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-noi-week-board-open]')) setTimeout(() => window.refreshNoiWeekBoard?.(), 250);
});

window.UsDailyQuestionHub = Object.freeze({ model: dailyModel, paint: syncDailySurfaces, open: openDailyInGioca });
syncDailySurfaces();
if ($('bond')?.classList.contains('active')) window.refreshNoiWeekBoard?.();
})();
