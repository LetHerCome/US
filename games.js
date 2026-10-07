// US Game V2 — Gioca: Per voi, six modes, Swipe, the weekly couple question,
// sealed couple rounds, prediction and reveal. Server RPCs are the only
// authority: couple, role, week, content and reveal are never decided here.
// Partner answers are rendered only from a reveal-ready server state and are
// never written to local storage.
(() => {
'use strict';
if (window.USGameV2) return;

const FAMILIES = [
  { id: 'scopritevi', name: 'Scopritevi', icon: 'binoculars' },
  { id: 'confrontatevi', name: 'Confrontatevi', icon: 'arrows-left-right' },
  { id: 'ridete', name: 'Ridete', icon: 'smiley' },
  { id: 'quanto_mi_conosci', name: 'Quanto mi conosci?', icon: 'eye' },
  { id: 'rivivete', name: 'Rivivete', icon: 'clock-counter-clockwise' },
  { id: 'e_se', name: 'E se…?', icon: 'signpost' },
];
const FAMILY = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
const PER_VOI = { id: 'per_voi', name: 'Per voi', icon: 'sparkle' };
const SWIPE = { id: 'swipe', name: 'Swipe', icon: 'cards-three' };
const byId = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const myRole = () => window.usProfile?.role || null;
const label = (role) => {
  if (role && role === myRole()) return window.usProfile?.display_name || 'Tu';
  return window.UsCoupleContext?.nameForRole?.(role, 'La tua persona') || 'La tua persona';
};
const partnerRole = () => (myRole() === 'francesco' ? 'beatrice' : 'francesco');
const partnerName = () => window.UsCoupleContext?.partnerName?.() || label(partnerRole());
const familyName = (id) => (id === 'per_voi' ? PER_VOI.name : id === 'swipe' ? SWIPE.name : FAMILY[id]?.name || 'Gioca');
const icon = (name) => `<span class="us-gv2-icon" data-gv2-icon="${esc(name)}" aria-hidden="true"></span>`;
const uuid = () => window.crypto.randomUUID();
const romeDate = (iso, opts) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('it-IT', { timeZone: 'UTC', ...opts }) : '');
const mondayLabel = (iso) => romeDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });

let home = null;
let current = null;      // server state of the open round
let view = 'hub';        // hub | play | waiting | reveal | weekly
let index = 0;           // item being answered
const drafts = new Map(); // item id -> unsaved local draft (memory only)
let busy = false;
let loadSeq = 0;
let weeklyRequestId = null;
const startRequestIds = new Map();

// ---------------------------------------------------------------- status copy

// A round's state in as few words as the tile can carry.
function roundStatus(row) {
  if (!row) return null;
  if (row.reveal_ready) return row.my_reveal_seen_at ? { text: 'Rivedi', tone: 'seen' } : { text: 'Risposte pronte', tone: 'ready' };
  if (row.my_complete) return { text: `Aspetti ${partnerName()}`, tone: 'waiting' };
  if (row.partner_complete) return { text: 'Tocca a te', tone: 'turn' };
  if (row.my_answered_count > 0) return { text: `${row.my_answered_count} di ${row.item_count}`, tone: 'progress' };
  if (row.started_by_role && row.started_by_role !== myRole()) return { text: 'Tocca a te', tone: 'turn' };
  return { text: 'Da giocare', tone: 'progress' };
}

function perVoiCopy() {
  const state = home?.per_voi?.state || 'idle';
  const row = (home?.open_rounds || []).concat(home?.recent || []).find((r) => r.id === home?.per_voi?.session_id);
  switch (state) {
    case 'reveal_ready': return { line: 'Risposte pronte ♡', cta: 'Scopri' };
    case 'waiting': return { line: `Aspettiamo ${partnerName()}`, cta: 'Apri' };
    case 'pending': return { line: row?.partner_complete ? `${partnerName()} ha già risposto` : `${partnerName()} ha iniziato`, cta: 'Rispondi' };
    case 'in_progress': return { line: 'A metà', cta: 'Continua' };
    case 'played': return { line: 'Giocato questa settimana', cta: 'Rivedi' };
    default: return { line: '5 domande scelte per voi', cta: 'Inizia' };
  }
}

// ---------------------------------------------------------------- top control

function renderTop() {
  const button = byId('usPerVoiTop');
  if (!button) return;
  const state = home?.per_voi?.state || 'idle';
  const attention = state === 'pending' || state === 'reveal_ready';
  button.dataset.gv2State = state;
  button.dataset.usAttention = attention ? 'on' : 'off';
  const labels = {
    idle: 'Per voi: una partita preparata per voi',
    in_progress: 'Per voi: riprendi la partita',
    pending: 'Per voi: tocca a te',
    waiting: `Per voi: aspettiamo ${partnerName()}`,
    reveal_ready: 'Per voi: le vostre risposte sono pronte',
    played: 'Per voi: giocato questa settimana, il prossimo arriva lunedì',
  };
  button.setAttribute('aria-label', labels[state] || labels.idle);
  button.classList.remove('is-loading');
  button.removeAttribute('aria-busy');
}

// ---------------------------------------------------------------- weekly rhythm

// M11F: the server counts the week's rounds (1 Per voi + 2 free choice) and
// refuses a fourth; the client only reads that state and never decides it.
const allowance = () => home?.allowance || null;
const freeLeft = () => { const a = allowance(); return a ? Math.max(0, a.free_limit - a.free_used) : 2; };
const playedThisWeek = (family) => allowance()?.families?.[family] || null;
const EXHAUSTED = 'Nuovi giochi lunedì.';

// Show what the couple can still play, not the inverse "used / limit" count.
// "3 di 3" looked like three games were available even when the week was spent.
function rhythmStrip() {
  const a = allowance();
  if (!a) return '';
  const used = Math.min(a.used, a.limit);
  const remaining = Math.max(0, a.limit - used);
  const dots = Array.from({ length: a.limit }, (_, i) => `<i data-on="${i < used ? 'true' : 'false'}"></i>`).join('');
  const done = remaining === 0;
  const remainingLabel = remaining === 1 ? '1 rimasto' : `${remaining} rimasti`;
  return `<div class="us-gv2-rhythm" data-gv2-rhythm="${done ? 'done' : 'open'}" role="group" aria-label="Questa settimana: ${esc(`${remainingLabel} da giocare`)}">
    <span class="us-gv2-kicker">QUESTA SETTIMANA</span>
    <span class="us-gv2-rhythm-row"><span class="us-gv2-rhythm-dots" aria-hidden="true">${dots}</span><b>${remainingLabel}</b></span>
  </div>`;
}

function modeStatus(f, open) {
  if (open) return { ...roundStatus(open), state: 'open' };
  if (playedThisWeek(f.id)) return { text: 'Giocato', tone: 'seen', state: 'played' };
  if (allowance() && !freeLeft()) return { text: 'Lunedì', tone: 'locked', state: 'locked' };
  return null;
}

// ---------------------------------------------------------------- hub

const glyph = (name) => `<span class="us-gv2-glyph" aria-hidden="true">${icon(name)}</span>`;

// M12A — the hub card that follows a just-saved weekly question settles in
// once. The flag is 'pending' through the immediate hub render and becomes
// true for the render that follows the fresh server state, which consumes it.
let weeklyJustCreated = false;
function weeklyCard(w) {
  if (!w) return '';
  const unlock = mondayLabel(w.next_unlock);
  const head = (name, title, line) => `<div class="us-gv2-weekly-head">${glyph(name)}<div><span class="us-gv2-kicker">LA VOSTRA DOMANDA</span><b>${esc(title)}</b>${line ? `<small>${esc(line)}</small>` : ''}</div></div>`;
  if (w.created_by_me) {
    const q = w.my_question;
    const settle = weeklyJustCreated === true ? ' is-just-created' : '';
    if (weeklyJustCreated === true) weeklyJustCreated = false;
    return `<section class="us-gv2-weekly is-locked${settle}" aria-label="La domanda della settimana">
      ${head('lock-simple', 'Domanda creata', `Poi tocca a ${partnerName()}, ${unlock}.`)}
      ${q ? `<blockquote>${esc(q.question_text)}</blockquote><small class="us-gv2-note">${esc(partnerName())} la scoprirà giocando.</small>` : ''}
    </section>`;
  }
  if (w.partner_left_question) {
    return `<section class="us-gv2-weekly is-sealed" aria-label="La domanda della settimana">
      ${head('feather', `${partnerName()} ha lasciato una domanda`, 'La troverete giocando.')}
    </section>`;
  }
  if (w.my_turn) {
    return `<section class="us-gv2-weekly is-open" aria-label="La domanda della settimana">
      ${head('feather', 'Tocca a te')}
      <button type="button" class="primary us-gv2-weekly-cta" data-gv2-action="weekly-create">Crea la domanda</button>
    </section>`;
  }
  return `<section class="us-gv2-weekly is-locked" aria-label="La domanda della settimana">
    ${head('lock-simple', `Questa settimana crea ${label(w.assigned_role)}`, w.next_role === myRole() ? `Tocca a te da ${unlock}` : `Cambia ${unlock}`)}
  </section>`;
}

// HUMAN-UI-02 — status filters. Every chip is a plain reading of the
// server's round summaries (open_rounds / recent); nothing is decided here
// and a chip exists only while it has at least one round behind it.
const ROUND_FILTERS = [
  { id: 'turn', label: () => 'Tocca a te', match: (h) => (h?.open_rounds || []).filter((r) => !r.my_complete) },
  { id: 'ready', label: () => 'Risposte pronte', match: (h) => (h?.recent || []).filter((r) => r.reveal_ready && !r.my_reveal_seen_at) },
  { id: 'waiting', label: () => `Aspetti ${partnerName()}`, match: (h) => (h?.open_rounds || []).filter((r) => r.my_complete) },
  { id: 'done', label: () => 'Completati', match: (h) => (h?.recent || []).filter((r) => r.reveal_ready && r.my_reveal_seen_at) },
];
let hubFilter = null;   // view state only (memory), never persisted

function roundFilters(h) {
  return ROUND_FILTERS.map((f) => ({ id: f.id, label: f.label(), rounds: f.match(h) })).filter((f) => f.rounds.length > 0);
}

function roundRow(r) {
  const status = roundStatus(r);
  const when = r.completed_at ? romeDate(String(r.completed_at).slice(0, 10), { day: 'numeric', month: 'long' }) : '';
  return `<button type="button" class="us-gv2-row" data-gv2-session="${esc(r.id)}"><span><b>${esc(familyName(r.game_family))}</b>${when ? `<small>${esc(when)}</small>` : ''}</span>${status ? `<small class="us-gv2-row-state" data-tone="${esc(status.tone)}">${esc(status.text)}</small>` : ''}</button>`;
}

function filterRow(filters) {
  if (!filters.length) return '';
  const chips = filters.map((f) => `<button type="button" class="us-gv2-filter" data-gv2-filter="${f.id}" aria-pressed="${hubFilter === f.id ? 'true' : 'false'}" aria-controls="usGv2FilterList"><span>${esc(f.label)}</span><b>${f.rounds.length}</b></button>`).join('');
  const open = filters.find((f) => f.id === hubFilter);
  return `<div class="us-gv2-filters" role="group" aria-label="Le vostre partite">${chips}</div>
    <div class="us-gv2-filter-list" id="usGv2FilterList" aria-live="polite"${open ? '' : ' hidden'}>${open ? open.rounds.map(roundRow).join('') : ''}</div>`;
}

// HUMAN-UI-02 — Per voi is the one hero; the six modes are a horizontal deck
// of small physical cards (the next one peeks from the right); the status
// chips sit between them. Mode IDs, states and actions are unchanged.
function renderHub() {
  const root = byId('quizHub');
  if (!root) return;
  const pv = perVoiCopy();
  const pvState = home?.per_voi?.state || 'idle';
  const openByFamily = new Map((home?.open_rounds || []).map((r) => [r.game_family, r]));
  const filters = roundFilters(home);
  if (hubFilter && !filters.some((f) => f.id === hubFilter)) hubFilter = null;
  const modeTiles = FAMILIES.map((f) => {
    const status = modeStatus(f, openByFamily.get(f.id));
    const locked = status?.state === 'locked';
    const mark = status?.state === 'played' ? icon('check') : locked ? icon('lock-simple') : '';
    return `<button type="button" data-us-tile data-us-feedback="tap" class="us-gv2-mode" data-gv2-family="${f.id}" data-gv2-mode-state="${esc(status?.state || 'ready')}"${locked ? ' aria-disabled="true"' : ''}>
      ${glyph(f.icon)}
      <span class="us-gv2-mode-copy"><b>${esc(f.name)}</b>${status ? `<small class="us-gv2-mode-state">${mark}${esc(status.text)}</small>` : ''}</span>
      ${status && !locked && status.state === 'open' ? `<i class="us-gv2-dot" data-tone="${esc(status.tone)}" aria-hidden="true"></i>` : ''}
    </button>`;
  }).join('');
  const swipeState = modeStatus(SWIPE, openByFamily.get('swipe'));
  const swipeLocked = swipeState?.state === 'locked';
  const swipeMark = swipeState?.state === 'played' ? icon('check') : swipeLocked ? icon('lock-simple') : '';
  const swipeLine = swipeState?.state === 'open' ? swipeState.text
    : swipeState?.state === 'played' ? 'Giocato questa settimana'
    : swipeLocked ? 'Nuove carte lunedì'
    : '8 carte · scegli senza pensarci troppo';
  const swipeCta = swipeState?.state === 'open' ? 'Continua'
    : swipeState?.state === 'played' ? 'Rivedi'
    : swipeLocked ? 'Lunedì' : 'Swipe';
  const invite = !filters.length && pvState === 'idle'
    ? '<p class="us-gv2-entry-note">Scegliete un gioco. Bastano pochi minuti.</p>'
    : '';
  root.innerHTML = `
    <header class="us-gv2-head"><h2 class="us-gv2-sr">Gioca</h2>${rhythmStrip()}</header>
    ${invite}
    ${filterRow(filters)}
    <button type="button" data-us-tile data-us-feedback="tap" class="us-gv2-pervoi us-attention-orbit" data-gv2-action="per-voi" data-gv2-state="${esc(pvState)}" data-us-attention="${pvState === 'pending' || pvState === 'reveal_ready' ? 'on' : 'off'}">
      ${glyph('sparkle').replace('class="us-gv2-glyph"', 'class="us-gv2-glyph" data-us-attention-icon')}<span class="us-gv2-pervoi-copy"><b>Per voi</b><small>${esc(pv.line)}</small></span><span class="us-gv2-pervoi-cta">${esc(pv.cta)}</span>
    </button>
    <button type="button" data-us-tile data-us-feedback="tap" class="us-gv2-swipe-entry" data-gv2-action="swipe" data-gv2-mode-state="${esc(swipeState?.state || 'ready')}"${swipeLocked ? ' aria-disabled="true"' : ''}>
      <span class="us-gv2-swipe-entry-icon">${icon('cards-three')}</span>
      <span class="us-gv2-swipe-entry-copy"><span class="us-gv2-kicker">VELOCE · PRIVATO</span><b>Swipe</b><small>${swipeMark}${esc(swipeLine)}</small></span>
      <span class="us-gv2-swipe-entry-cta">${esc(swipeCta)}</span>
    </button>
    <section class="us-gv2-modes" aria-label="Scegliete voi"><div class="us-gv2-mode-grid us-gv2-deck">${modeTiles}</div></section>
    ${weeklyCard(home?.weekly)}`;
}

function toggleFilter(id) {
  hubFilter = hubFilter === id ? null : id;
  renderHub();
  byId('quizHub')?.querySelector?.(`[data-gv2-filter="${id}"]`)?.focus?.({ preventScroll: true });
}

function renderHubError() {
  const root = byId('quizHub');
  if (root) root.innerHTML = '<div class="us-gv2-empty">Gioca non risponde. <button type="button" data-gv2-action="retry">Riprova</button></div>';
}

async function load() {
  if (!window.usProfile) return null;
  const seq = ++loadSeq;
  try {
    const { data, error } = await sb.rpc('get_game_v2_home');
    if (error) throw error;
    if (seq !== loadSeq) return home;
    home = data || null;
    if (weeklyJustCreated === 'pending') weeklyJustCreated = true;
    renderTop();
    if (view === 'hub') renderHub();
    return home;
  } catch (error) {
    console.warn('[US Gioca] home', error);
    weeklyJustCreated = false;
    renderTop();
    if (view === 'hub' && !home) renderHubError();
    return null;
  }
}

// ---------------------------------------------------------------- panel shell

function panel() { return byId('usGameV2Panel'); }
function showPanel(html) {
  const fromHub = !byId('quizHub')?.classList.contains('hidden');
  byId('quizHub')?.classList.add('hidden');
  const root = panel();
  if (!root) return null;
  root.classList.remove('hidden');
  root.innerHTML = html;
  // M12A — entering a mode from the hub eases the destination in once.
  if (fromHub) window.UsUiFoundation?.playOnce?.(root, 'us-content-enter', 260);
  return root;
}
function showHub() {
  view = 'hub';
  current = null;
  index = 0;
  drafts.clear();
  panel()?.classList.add('hidden');
  if (panel()) panel().innerHTML = '';
  byId('quizHub')?.classList.remove('hidden');
  if (home) renderHub();
  load();
}
const backButton = () => `<button type="button" class="us-gv2-back" data-gv2-action="back">${icon('caret-left')}<span>Gioca</span></button>`;

// ---------------------------------------------------------------- rounds

async function startRound(family) {
  if (busy) return;
  busy = true;
  try {
    const requestId = startRequestIds.get(family) || uuid();
    startRequestIds.set(family, requestId);
    const { data, error } = await sb.rpc('start_game_round', { target_family: family, request_id: requestId });
    if (error) throw error;
    startRequestIds.delete(family);
    await present(data);
  } catch (error) {
    console.warn('[US Gioca] start', error);
    const msg = error?.message || '';
    if (/weekly per voi played|weekly allowance exhausted|too many open rounds/.test(msg)) startRequestIds.delete(family);
    toast(/not enough content/.test(msg) ? 'Non ci sono ancora abbastanza domande per questo gioco.'
      : /weekly per voi played/.test(msg) ? 'Per voi è già giocato. Il prossimo lunedì.'
      : /weekly allowance exhausted/.test(msg) ? EXHAUSTED
      : /too many open rounds/.test(msg) ? 'Prima finite una delle partite in corso.'
      : 'Non riesco ad aprire la partita. Riprova.');
    if (/weekly|too many open rounds/.test(msg)) load();
  } finally { busy = false; }
}

// A mode tile: resume its open round; a mode already played this week asks
// once before spending a second moment on it; nothing starts once the
// week's free moments are spent (history stays one tap away).
async function startSwipe() {
  if (busy) return;
  busy = true;
  try {
    const requestId = startRequestIds.get('swipe') || uuid();
    startRequestIds.set('swipe', requestId);
    const { data, error } = await sb.rpc('start_swipe_round', { request_id: requestId });
    if (error) throw error;
    startRequestIds.delete('swipe');
    await present(data);
  } catch (error) {
    console.warn('[US Gioca] swipe start', error);
    const msg = error?.message || '';
    if (/weekly allowance exhausted|too many open rounds|not enough swipe content/.test(msg)) startRequestIds.delete('swipe');
    toast(/weekly allowance exhausted/.test(msg) ? EXHAUSTED
      : /too many open rounds/.test(msg) ? 'Prima finite una delle partite in corso.'
      : /not enough swipe content/.test(msg) ? 'Le nuove carte Swipe non sono ancora pronte.'
      : 'Non riesco ad aprire Swipe. Riprova.');
    if (/weekly|too many open rounds/.test(msg)) load();
  } finally { busy = false; }
}

async function chooseSwipe() {
  if (busy) return;
  const open = (home?.open_rounds || []).find((r) => r.game_family === 'swipe');
  if (open) return openSession(open.id);
  const played = playedThisWeek('swipe');
  if (allowance() && !freeLeft()) {
    if (played?.completed) return openSession(played.session_id);
    return toast(EXHAUSTED);
  }
  if (played) {
    const ask = window.UsUiFoundation?.confirm;
    const ok = typeof ask === 'function' ? await ask({
      kicker: 'SWIPE',
      title: 'Avete già fatto Swipe questa settimana',
      body: `Vi resta ${freeLeft() === 1 ? 'un momento' : `${freeLeft()} momenti`} fino a lunedì. Usarlo per altre 8 carte?`,
      confirmLabel: 'Altre 8',
      cancelLabel: 'Non ora',
    }) : true;
    if (!ok) return;
  }
  return startSwipe();
}

async function chooseMode(family) {
  if (busy) return;
  const open = (home?.open_rounds || []).find((r) => r.game_family === family);
  if (open) return openSession(open.id);
  const played = playedThisWeek(family);
  if (allowance() && !freeLeft()) {
    if (played?.completed) return openSession(played.session_id);
    return toast(EXHAUSTED);
  }
  if (played) {
    const ask = window.UsUiFoundation?.confirm;
    const ok = typeof ask === 'function' ? await ask({
      kicker: familyName(family).toUpperCase(),
      title: `Avete già giocato a ${familyName(family)} questa settimana`,
      body: `Vi resta ${freeLeft() === 1 ? 'un momento' : `${freeLeft()} momenti`} fino a lunedì. Usarlo per un’altra partita?`,
      confirmLabel: 'Gioca ancora',
      cancelLabel: 'Non ora',
    }) : true;
    if (!ok) return;
  }
  return startRound(family);
}

async function openSession(id) {
  try {
    const { data, error } = await sb.rpc('get_game_session', { target_session_id: id });
    if (error) throw error;
    await present(data);
  } catch (error) { console.warn('[US Gioca] session', error); toast('Non riesco ad aprire la partita.'); }
}

async function openPerVoi() {
  if (document.querySelector('.page.active')?.id !== 'quiz') window.go?.('quiz', { nav: true });
  if (!home) await load();
  const sid = home?.per_voi?.session_id;
  if (sid) return openSession(sid);
  return startRound('per_voi');
}

async function present(state) {
  if (!state?.id || !Array.isArray(state.items)) throw new Error('invalid game session');
  current = state;
  drafts.clear();
  if (state.reveal_ready) {
    view = 'reveal';
    // M12A — only the FIRST reveal is staged; a revisit shows everything at once.
    // The decoration is CSS-only and never gates the data (all rows are in the DOM).
    const first = !state.my_reveal_seen_at;
    renderReveal({ first });
    if (first) window.UsFeedback?.reveal?.();
    if (!state.my_reveal_seen_at) {
      try {
        const res = await sb.rpc('mark_game_session_reveal_seen', { target_session_id: state.id });
        if (res.error) throw res.error;
        if (res.data?.id === state.id) current = res.data;
      } catch (error) { console.warn('[US Gioca] reveal receipt', error); }
      load();
    }
    return;
  }
  if (state.my_complete) { view = 'waiting'; renderWaiting(); return; }
  view = 'play';
  const firstOpen = state.items.findIndex((i) => i.my_answer_text == null && i.my_answer_index == null);
  index = firstOpen >= 0 ? firstOpen : state.items.length - 1;
  renderPlay();
}

function itemHint(item) {
  if (item.my_item_role === 'predictor') return `Secondo te cosa ha scelto ${label(item.subject_role)}?`;
  if (item.my_item_role === 'subject') return `Su di te · ${partnerName()} proverà a indovinare`;
  return '';
}

function contextChip(item) {
  const c = item.context || {};
  if (!c.kind_label) return '';
  return `<span class="us-gv2-context">${esc(c.kind_label)}</span>`;
}

function answerValue(item) {
  if (drafts.has(item.id)) return drafts.get(item.id);
  return item.answer_kind === 'choice' ? item.my_answer_index : item.my_answer_text;
}

function renderSwipePlay() {
  const item = current?.items?.[index];
  if (!item || item.answer_kind !== 'choice' || (item.options || []).length !== 2) return;
  const total = current.items.length;
  const left = item.options[0];
  const right = item.options[1];
  const root = showPanel(`<article class="us-gv2-swipe-play">
    <div class="us-gv2-play-top">${backButton()}<span class="us-gv2-count">${index + 1} di ${total}</span></div>
    <div class="us-gv2-swipe-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index + 1}" aria-label="Carta ${index + 1} di ${total}">
      ${Array.from({ length: total }, (_, i) => `<i data-state="${i < index ? 'done' : i === index ? 'now' : 'next'}"></i>`).join('')}
    </div>
    <section class="us-gv2-swipe-stage" aria-label="Carta Swipe">
      <article class="us-gv2-swipe-card" id="usGv2SwipeCard" tabindex="0" aria-label="${esc(item.question_text)}. Freccia sinistra: ${esc(left)}. Freccia destra: ${esc(right)}.">
        <span class="us-gv2-kicker">SWIPE · SCELTA ${index + 1}</span>
        <h2>${esc(item.question_text)}</h2>
        <span class="us-gv2-swipe-stamp is-left" aria-hidden="true">${esc(left)}</span>
        <span class="us-gv2-swipe-stamp is-right" aria-hidden="true">${esc(right)}</span>
        <div class="us-gv2-swipe-card-foot" aria-hidden="true"><span>← ${esc(left)}</span><span>${esc(right)} →</span></div>
      </article>
    </section>
    <div class="us-gv2-swipe-actions" role="group" aria-label="Scegli una risposta">
      <button type="button" data-gv2-swipe-choice="0" aria-label="${esc(left)}"><span aria-hidden="true">←</span><b>${esc(left)}</b></button>
      <button type="button" data-gv2-swipe-choice="1" aria-label="${esc(right)}"><b>${esc(right)}</b><span aria-hidden="true">→</span></button>
    </div>
    <p id="usGv2Error" class="us-gv2-error" role="alert" hidden></p>
    <p class="us-gv2-swipe-note">Trascina la carta oppure usa i due pulsanti. ${partnerName()} non vedrà le tue scelte finché non avrete finito entrambi.</p>
  </article>`);
  bindSwipeGesture(root);
}

function bindSwipeGesture(root) {
  const card = root?.querySelector('#usGv2SwipeCard');
  if (!card) return;
  let pointerId = null;
  let startX = 0;
  let deltaX = 0;
  const reduced = window.UsUiFoundation?.isReducedMotion?.() !== false;

  const paint = (value) => {
    const width = Math.max(1, card.getBoundingClientRect().width);
    deltaX = Math.max(-width * 0.7, Math.min(width * 0.7, value));
    card.dataset.swipeSide = deltaX < -8 ? 'left' : deltaX > 8 ? 'right' : 'none';
    const rotate = reduced ? 0 : deltaX / 22;
    card.style.transform = `translate3d(${deltaX}px,0,0) rotate(${rotate}deg)`;
  };
  const reset = () => {
    deltaX = 0;
    card.dataset.swipeSide = 'none';
    card.style.transform = '';
  };
  const finish = () => {
    const threshold = Math.min(92, Math.max(64, card.getBoundingClientRect().width * 0.22));
    if (Math.abs(deltaX) >= threshold) {
      const choice = deltaX < 0 ? 0 : 1;
      commitSwipeChoice(choice, deltaX < 0 ? 'left' : 'right');
    } else {
      reset();
    }
    pointerId = null;
  };

  card.addEventListener('pointerdown', (event) => {
    if (busy || event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    deltaX = 0;
    card.setPointerCapture?.(pointerId);
    card.classList.add('is-dragging');
  });
  card.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    paint(event.clientX - startX);
  });
  card.addEventListener('pointerup', (event) => {
    if (pointerId !== event.pointerId) return;
    card.classList.remove('is-dragging');
    finish();
  });
  card.addEventListener('pointercancel', () => {
    card.classList.remove('is-dragging');
    pointerId = null;
    reset();
  });
  card.addEventListener('keydown', (event) => {
    if (busy || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    commitSwipeChoice(event.key === 'ArrowLeft' ? 0 : 1, event.key === 'ArrowLeft' ? 'left' : 'right');
  });
}

async function commitSwipeChoice(choice, direction = 'tap') {
  if (busy || !current || current.game_family !== 'swipe') return;
  const item = current.items[index];
  if (!item || !Number.isInteger(choice) || choice < 0 || choice > 1) return;
  busy = true;
  const root = panel();
  const card = root?.querySelector('#usGv2SwipeCard');
  root?.querySelectorAll('[data-gv2-swipe-choice]').forEach((button) => { button.disabled = true; });
  try {
    if (card) {
      card.dataset.swipeSide = choice === 0 ? 'left' : 'right';
      card.classList.add('is-committing');
      if (window.UsUiFoundation?.isReducedMotion?.() === false) {
        card.style.transform = `translate3d(${choice === 0 ? '-115%' : '115%'},0,0) rotate(${choice === 0 ? -9 : 9}deg)`;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    const { data, error } = await sb.rpc('save_game_session_answer', {
      target_session_id: current.id,
      target_item_id: item.id,
      target_answer_text: null,
      target_answer_index: choice
    });
    if (error) throw error;
    current = data;
    window.UsFeedback?.tap?.();

    if (index < current.items.length - 1) {
      index += 1;
      renderSwipePlay();
      return;
    }

    const { data: done, error: completeError } = await sb.rpc('complete_game_session_side', { target_session_id: current.id });
    if (completeError) throw completeError;
    window.sendWebPushEvent?.('game_session', done.id).catch?.(() => {});
    await present(done);
    load();
  } catch (error) {
    console.warn('[US Gioca] swipe answer', error, direction);
    renderSwipePlay();
    showError('Non riesco a salvare questa scelta. Riprova.');
  } finally {
    busy = false;
    panel()?.querySelectorAll('[data-gv2-swipe-choice]').forEach((button) => { button.disabled = false; });
  }
}

function renderPlay() {
  if (current?.game_family === 'swipe') return renderSwipePlay();
  const item = current?.items?.[index];
  if (!item) return;
  const total = current.items.length;
  const value = answerValue(item);
  const kicker = current.game_family === 'per_voi' ? `PER VOI · ${familyName(item.family).toUpperCase()}` : familyName(current.game_family).toUpperCase();
  const hint = itemHint(item);
  const input = item.answer_kind === 'open'
    ? `<label class="us-gv2-sr" for="usGv2Answer">La tua risposta</label><textarea id="usGv2Answer" maxlength="1000" rows="5" placeholder="Scrivi…">${esc(value ?? '')}</textarea>`
    : `<fieldset class="us-gv2-choices"><legend class="us-gv2-sr">${item.my_item_role === 'predictor' ? 'La tua previsione' : 'La tua scelta'}</legend>${(item.options || []).map((o, i) => `<label class="us-gv2-choice"><input type="radio" name="gv2choice" value="${i}" ${Number(value) === i && value !== null && value !== undefined ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</fieldset>`;
  const last = index === total - 1;
  showPanel(`<article class="us-gv2-play" data-gv2-family="${esc(item.family || current.game_family)}">
    <div class="us-gv2-play-top">${backButton()}<span class="us-gv2-count">${index + 1} di ${total}</span></div>
    <div class="us-gv2-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index + 1}" aria-label="Domanda ${index + 1} di ${total}"><i style="width:${((index + 1) / total) * 100}%"></i></div>
    <span class="us-gv2-kicker">${esc(kicker)}</span>
    ${contextChip(item)}
    ${hint ? `<p class="us-gv2-hint">${esc(hint)}</p>` : ''}
    <h2 class="us-gv2-question">${esc(item.my_prompt || item.question_text)}</h2>
    <form id="usGv2AnswerForm" novalidate>${input}
      <p id="usGv2Error" class="us-gv2-error" role="alert" hidden></p>
      <div class="us-gv2-actions">${index > 0 ? '<button type="button" class="ghost" data-gv2-action="prev">Indietro</button>' : '<span></span>'}<button type="submit" class="primary">${last ? 'Conferma le risposte' : 'Avanti'}</button></div>
    </form>
    ${last ? '<p class="us-gv2-note">Dopo la conferma le risposte non si cambiano più.</p>' : ''}
  </article>`);
}

function readInput(item) {
  if (item.answer_kind === 'open') return String(byId('usGv2Answer')?.value ?? '');
  const checked = panel()?.querySelector('input[name="gv2choice"]:checked');
  return checked ? Number(checked.value) : null;
}

function showError(message) {
  const el = byId('usGv2Error');
  if (el) { el.textContent = message; el.hidden = false; }
}

async function saveCurrent() {
  const item = current.items[index];
  const raw = readInput(item);
  drafts.set(item.id, raw);
  const text = item.answer_kind === 'open' ? raw.trim() : null;
  const choice = item.answer_kind === 'choice' ? raw : null;
  if (item.answer_kind === 'open' ? !text || text.length > 1000 : !Number.isInteger(choice)) {
    showError(item.answer_kind === 'open' ? 'Scrivi una risposta, anche breve.' : 'Scegli una risposta.');
    return false;
  }
  if (text === item.my_answer_text && choice === (item.my_answer_index ?? null) && (item.my_answer_text != null || item.my_answer_index != null)) return true;
  const { data, error } = await sb.rpc('save_game_session_answer', { target_session_id: current.id, target_item_id: item.id, target_answer_text: text, target_answer_index: choice });
  if (error) throw error;
  current = data;
  drafts.delete(item.id);
  return true;
}

async function submitAnswer() {
  if (busy || !current) return;
  busy = true;
  const button = panel()?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (!(await saveCurrent())) return;
    if (index < current.items.length - 1) { index += 1; renderPlay(); return; }
    const missing = current.items.findIndex((i) => i.my_answer_text == null && i.my_answer_index == null);
    if (missing >= 0) { index = missing; renderPlay(); showError('Manca ancora questa risposta.'); return; }
    const { data, error } = await sb.rpc('complete_game_session_side', { target_session_id: current.id });
    if (error) throw error;
    window.sendWebPushEvent?.('game_session', data.id).catch?.(() => {});
    await present(data);
    load();
  } catch (error) {
    console.warn('[US Gioca] answer', error);
    showError('Non riesco a salvare la risposta. Riprova.');
  } finally {
    busy = false;
    const again = panel()?.querySelector('button[type="submit"]');
    if (again) again.disabled = false;
  }
}

function myAnswerText(item) {
  return item.answer_kind === 'choice' ? (item.options || [])[Number(item.my_answer_index)] ?? '—' : item.my_answer_text ?? '—';
}
function partnerAnswerText(item) {
  return item.answer_kind === 'choice' ? (item.options || [])[Number(item.partner_answer_index)] ?? '—' : item.partner_answer_text ?? '—';
}

function renderSwipeWaiting() {
  showPanel(`<article class="us-gv2-waiting us-gv2-swipe-waiting">
    <div class="us-gv2-play-top">${backButton()}</div>
    <span class="us-gv2-kicker">SWIPE · SCELTE SIGILLATE</span>
    <h2>Le tue 8 scelte sono dentro.</h2>
    <p class="us-gv2-lead">Aspettiamo ${esc(partnerName())}. Finché non finisce, le vostre risposte restano separate.</p>
    <ol class="us-gv2-swipe-mine">${current.items.map((item, i) => `<li><span>${i + 1}</span><small>${esc(item.question_text)}</small><b>${esc(myAnswerText(item))}</b></li>`).join('')}</ol>
    <div class="us-gv2-actions"><button type="button" class="ghost" data-gv2-action="back">Torna a Gioca</button><button type="button" class="primary" data-gv2-action="refresh">Controlla</button></div>
  </article>`);
}

function renderWaiting() {
  if (current?.game_family === 'swipe') return renderSwipeWaiting();
  showPanel(`<article class="us-gv2-waiting">
    <div class="us-gv2-play-top">${backButton()}</div>
    <span class="us-gv2-kicker">${esc(familyName(current.game_family).toUpperCase())}</span>
    <h2>Hai risposto.</h2>
    <p class="us-gv2-lead">Aspettiamo ${esc(partnerName())}. Le risposte si scoprono insieme.</p>
    <ol class="us-gv2-mine">${current.items.map((i) => `<li><small>${esc(i.my_prompt || i.question_text)}</small><b>${esc(myAnswerText(i))}</b></li>`).join('')}</ol>
    <div class="us-gv2-actions"><button type="button" class="ghost" data-gv2-action="back">Torna a Gioca</button><button type="button" class="primary" data-gv2-action="refresh">Aggiorna</button></div>
  </article>`);
}

function outcome(item) {
  if (item.mechanic === 'prediction') {
    const matched = item.prediction_matched === true;
    if (item.my_item_role === 'predictor') return matched ? 'Ci hai preso al volo ♡' : 'Non te l’aspettavi';
    return matched ? `${partnerName()} ci ha preso al volo ♡` : 'Hai cambiato le carte in tavola';
  }
  if (item.answer_kind === 'choice') return item.my_answer_index === item.partner_answer_index ? 'Uguale ♡' : 'Una sorpresa';
  return '';
}

function revealRows(item) {
  const partner = partnerName();
  if (item.mechanic === 'prediction') {
    if (item.my_item_role === 'predictor') return [['Tu pensavi', myAnswerText(item)], [`${partner} ha scelto`, partnerAnswerText(item)]];
    return [['Hai scelto', myAnswerText(item)], [`${partner} pensava`, partnerAnswerText(item)]];
  }
  return [['Tu', myAnswerText(item)], [partner, partnerAnswerText(item)]];
}

// Longitudinal resurfacing: the earlier answers come from the server only
// once this round is revealed.
function previousAnswers(item) {
  const then = item.previous;
  if (!then) return '';
  return `<div class="us-gv2-then"><span class="us-gv2-kicker">COSA AVEVATE RISPOSTO</span>
    <dl><div><dt>Tu</dt><dd>${esc(then.my_answer_text ?? '—')}</dd></div><div><dt>${esc(partnerName())}</dt><dd>${esc(then.partner_answer_text ?? '—')}</dd></div></dl></div>`;
}

function renderSwipeReveal({ first = false } = {}) {
  const sameCount = current.items.filter((item) => item.my_answer_index === item.partner_answer_index).length;
  const differentCount = current.items.length - sameCount;
  const cards = current.items.map((item, i) => {
    const same = item.my_answer_index === item.partner_answer_index;
    return `<article class="us-gv2-swipe-reveal-card" data-same="${same ? 'true' : 'false'}">
      <div class="us-gv2-swipe-reveal-head"><span>${i + 1}</span><b>${same ? 'Uguale ♡' : 'Diversi qui'}</b></div>
      <h3>${esc(item.question_text)}</h3>
      <dl><div><dt>Tu</dt><dd>${esc(myAnswerText(item))}</dd></div><div><dt>${esc(partnerName())}</dt><dd>${esc(partnerAnswerText(item))}</dd></div></dl>
    </article>`;
  }).join('');
  showPanel(`<article class="us-gv2-reveal us-gv2-swipe-reveal${first ? ' is-first-reveal' : ''}">
    <div class="us-gv2-play-top">${backButton()}</div>
    <span class="us-gv2-kicker">SWIPE · REVEAL</span>
    <div class="us-gv2-swipe-score"><strong>${sameCount}<small>/${current.items.length}</small></strong><span>scelte uguali</span><i aria-hidden="true"></i><b>${differentCount} diverse</b></div>
    <p class="us-gv2-swipe-reveal-copy">Non è un punteggio: è solo la mappa di dove avete scelto la stessa cosa e dove no.</p>
    <div class="us-gv2-swipe-reveal-list">${cards}</div>
    <div class="us-gv2-actions is-single"><button type="button" class="primary" data-gv2-action="back">Torna a Gioca</button></div>
  </article>`);
}

function renderReveal({ first = false } = {}) {
  if (current?.game_family === 'swipe') return renderSwipeReveal({ first });
  const cards = current.items.map((item) => {
    const out = outcome(item);
    const same = item.mechanic === 'prediction' ? item.prediction_matched === true : item.answer_kind === 'choice' && item.my_answer_index === item.partner_answer_index;
    return `<article class="us-gv2-reveal-card" data-gv2-family="${esc(item.family || current.game_family)}" data-gv2-mechanic="${esc(item.mechanic || '')}">
      <i class="us-gv2-lightsplit" aria-hidden="true"></i>
      <span class="us-gv2-kicker">${esc(familyName(item.family || current.game_family).toUpperCase())}</span>
      ${contextChip(item)}
      <h3>${esc(item.my_prompt || item.question_text)}</h3>
      ${out ? `<span class="us-gv2-outcome" data-same="${same ? 'true' : 'false'}">${esc(out)}</span>` : ''}
      <dl>${revealRows(item).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${previousAnswers(item)}
    </article>`;
  }).join('');
  showPanel(`<article class="us-gv2-reveal${first ? ' is-first-reveal' : ''}">
    <div class="us-gv2-play-top">${backButton()}</div>
    <span class="us-gv2-kicker">LE VOSTRE RISPOSTE</span>
    <h2>${esc(familyName(current.game_family))}</h2>
    <div class="us-gv2-reveal-list">${cards}</div>
    <div class="us-gv2-actions is-single"><button type="button" class="primary" data-gv2-action="back">Torna a Gioca</button></div>
  </article>`);
}

const WEEKLY_MORPH_MS = 480;

// ---------------------------------------------------------------- weekly form

function renderWeeklyForm(error = '') {
  const w = home?.weekly;
  view = 'weekly';
  const root = showPanel(`<article class="us-gv2-weekly-form">
    <div class="us-gv2-play-top">${backButton()}</div>
    <span class="us-gv2-kicker">LA DOMANDA DELLA SETTIMANA</span>
    <h2>Crea la domanda</h2>
    <p class="us-gv2-lead">${esc(partnerName())} la scoprirà solo giocando.</p>
    <form id="usGv2WeeklyForm" novalidate>
      <label class="us-gv2-sr" for="usGv2WeeklyText">La domanda</label>
      <textarea id="usGv2WeeklyText" name="question_text" maxlength="300" rows="3" required placeholder="Scrivi la domanda"></textarea>
      <fieldset class="us-gv2-segment"><legend>Come si risponde?</legend>
        <label><input type="radio" name="answer_kind" value="open" checked><span>Risposta libera</span></label>
        <label><input type="radio" name="answer_kind" value="choice"><span>Scelta</span></label>
      </fieldset>
      <div id="usGv2WeeklyOptions" class="us-gv2-options" hidden>
        ${[0, 1, 2, 3].map((i) => `<label class="us-gv2-sr" for="usGv2Option${i}">Opzione ${i + 1}</label><input id="usGv2Option${i}" name="option_${i}" maxlength="120" placeholder="Opzione ${i + 1}${i > 1 ? ' (facoltativa)' : ''}">`).join('')}
      </div>
      <fieldset class="us-gv2-families"><legend>Nei giochi</legend>
        ${FAMILIES.map((f) => `<label class="us-gv2-chip"><input type="checkbox" name="families" value="${f.id}" ${f.id === 'scopritevi' ? 'checked' : ''} ${f.id === 'quanto_mi_conosci' ? 'disabled' : ''}><span>${esc(f.name)}</span></label>`).join('')}
        <small id="usGv2PredictionHint">“Quanto mi conosci?” solo con risposte a scelta.</small>
      </fieldset>
      <p id="usGv2Error" class="us-gv2-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
      <button type="submit" class="primary us-gv2-submit">Salva la domanda</button>
    </form>
  </article>`);
  if (!root || !w) return;
  const form = root.querySelector('#usGv2WeeklyForm');
  form.addEventListener('input', () => { weeklyRequestId = null; });
  form.addEventListener('change', (event) => {
    if (event.target.name !== 'answer_kind') return;
    const choice = event.target.value === 'choice';
    root.querySelector('#usGv2WeeklyOptions').hidden = !choice;
    const qmc = root.querySelector('input[name="families"][value="quanto_mi_conosci"]');
    qmc.disabled = !choice;
    if (!choice) qmc.checked = false;
  });
}

// M12A — server-confirmed only: the button turns into the saved check, then
// the hub shows the locked card. Without the shared motion system (or under
// reduced motion) the change is immediate.
async function morphWeeklySaved(button) {
  if (window.UsUiFoundation?.isReducedMotion?.() !== false) return;
  button.classList.add('is-saved');
  button.innerHTML = `${icon('check')}<span>Domanda salvata</span>`;
  await new Promise((resolve) => setTimeout(resolve, WEEKLY_MORPH_MS));
}

async function submitWeekly(form) {
  if (busy) return;
  const data = new FormData(form);
  const text = String(data.get('question_text') || '').trim();
  const kind = data.get('answer_kind') === 'choice' ? 'choice' : 'open';
  const raw = [0, 1, 2, 3].map((i) => String(data.get(`option_${i}`) || '').trim());
  const options = kind === 'choice' ? raw.filter(Boolean) : [];
  const families = data.getAll('families').map(String);
  const problem = !text || text.length > 300 ? 'Scrivi una domanda di massimo 300 caratteri.'
    : kind === 'choice' && (!raw[0] || !raw[1] || new Set(options).size !== options.length) ? 'Scrivi almeno due opzioni diverse.'
    : !families.length ? 'Scegli almeno un gioco.' : '';
  if (problem) return showError(problem);
  busy = true;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    weeklyRequestId ||= uuid();
    const { data: state, error } = await sb.rpc('create_weekly_question', { request_id: weeklyRequestId, question_text: text, answer_kind: kind, options, families });
    if (error) throw error;
    weeklyRequestId = null;
    if (home) home.weekly = state;
    if (!state?.replayed) window.sendWebPushEvent?.('game_weekly', state?.question_id || null).catch?.(() => {});
    toast('Domanda salvata ♡');
    window.UsFeedback?.success?.();
    await morphWeeklySaved(button);
    weeklyJustCreated = 'pending';
    showHub();
  } catch (error) {
    console.warn('[US Gioca] weekly', error);
    const msg = error?.message || '';
    showError(/not your turn/.test(msg) ? 'Questa settimana non tocca a te.' : /already created/.test(msg) ? 'La domanda di questa settimana c’è già.' : 'Non riesco a salvare la domanda. Riprova.');
  } finally { busy = false; button.disabled = false; }
}

// ---------------------------------------------------------------- wiring

async function refresh() {
  if (view === 'hub') return load();
  if ((view === 'waiting' || view === 'play') && current?.id) {
    const { data, error } = await sb.rpc('get_game_session', { target_session_id: current.id });
    if (!error && data && (data.reveal_ready !== current.reveal_ready || data.partner_complete !== current.partner_complete)) {
      if (view === 'waiting' || data.reveal_ready) await present(data);
      else current = { ...current, partner_complete: data.partner_complete };
    }
  }
  return load();
}

function onClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.gv2Action;
  if (action === 'per-voi') openPerVoi();
  else if (action === 'swipe') chooseSwipe();
  else if (button.dataset.gv2SwipeChoice != null) commitSwipeChoice(Number(button.dataset.gv2SwipeChoice), 'tap');
  else if (action === 'weekly-create') renderWeeklyForm();
  else if (action === 'back') showHub();
  else if (action === 'prev') { const item = current.items[index]; drafts.set(item.id, readInput(item)); index = Math.max(0, index - 1); renderPlay(); }
  else if (action === 'refresh') refresh();
  else if (action === 'retry') load();
  else if (button.dataset.gv2Filter) toggleFilter(button.dataset.gv2Filter);
  else if (button.dataset.gv2Family) chooseMode(button.dataset.gv2Family);
  else if (button.dataset.gv2Session) openSession(button.dataset.gv2Session);
}

function onSubmit(event) {
  if (event.target.id === 'usGv2AnswerForm') { event.preventDefault(); submitAnswer(); }
  else if (event.target.id === 'usGv2WeeklyForm') { event.preventDefault(); submitWeekly(event.target); }
}

function boot() {
  const hub = byId('quizHub');
  const root = panel();
  if (!hub || !root) return;
  if (!hub.dataset.gv2Bound) {
    hub.dataset.gv2Bound = '1';
    hub.addEventListener('click', onClick);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
  }
  if (window.usProfile) load(); else setTimeout(boot, 250);
}

window.USGameV2 = {
  load, refresh, showHub, openPerVoi, startRound, startSwipe, openSession, chooseMode, chooseSwipe,
  isOpen: () => view !== 'hub',
  close: showHub,
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
document.addEventListener('visibilitychange', () => { if (!document.hidden && window.usProfile) refresh(); });
setInterval(() => { if (!document.hidden && window.usProfile) refresh(); }, 45000);
})();
