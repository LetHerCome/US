// US Game V2 — Gioca: Per voi, six modes, the weekly couple question,
// five-question rounds, prediction and reveal. Server RPCs are the only
// authority: couple, role, week, content and reveal are never decided here.
// Partner answers are rendered only from a reveal-ready server state and are
// never written to local storage.
(() => {
'use strict';
if (window.USGameV2) return;

const FAMILIES = [
  { id: 'scopritevi', name: 'Scopritevi', line: 'Quello che forse non sapete ancora.', icon: 'binoculars' },
  { id: 'confrontatevi', name: 'Confrontatevi', line: 'Stessa situazione, due sguardi.', icon: 'arrows-left-right' },
  { id: 'ridete', name: 'Ridete', line: 'Scenari assurdi, risposte vere.', icon: 'smiley' },
  { id: 'quanto_mi_conosci', name: 'Quanto mi conosci?', line: 'Uno risponde, l’altro indovina.', icon: 'eye' },
  { id: 'rivivete', name: 'Rivivete', line: 'Lo stesso momento, due memorie.', icon: 'clock-counter-clockwise' },
  { id: 'e_se', name: 'E se…?', line: 'Scelte, futuri, possibilità.', icon: 'signpost' },
];
const FAMILY = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
const PER_VOI = { id: 'per_voi', name: 'Per voi', icon: 'sparkle' };
const byId = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = (role) => (role === 'francesco' ? 'Francesco' : role === 'beatrice' ? 'Bea' : '');
const myRole = () => window.usProfile?.role || null;
const partnerRole = () => (myRole() === 'francesco' ? 'beatrice' : 'francesco');
const partnerName = () => label(partnerRole());
const familyName = (id) => (id === 'per_voi' ? PER_VOI.name : FAMILY[id]?.name || 'Gioca');
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

function roundStatus(row) {
  if (!row) return null;
  if (row.reveal_ready) return row.my_reveal_seen_at ? { text: 'Rivedi le risposte', tone: 'seen' } : { text: 'Le vostre risposte sono pronte ♡', tone: 'ready' };
  if (row.my_complete) return { text: `Hai risposto. Aspettiamo ${partnerName()}.`, tone: 'waiting' };
  if (row.partner_complete) return { text: `${partnerName()} ha già risposto. Tocca a te.`, tone: 'turn' };
  if (row.my_answered_count > 0) return { text: `Sei a ${row.my_answered_count} di ${row.item_count}.`, tone: 'progress' };
  if (row.started_by_role && row.started_by_role !== myRole()) return { text: `${partnerName()} ha iniziato una partita.`, tone: 'turn' };
  return { text: 'Da giocare', tone: 'progress' };
}

function perVoiCopy() {
  const state = home?.per_voi?.state || 'idle';
  const row = (home?.open_rounds || []).concat(home?.recent || []).find((r) => r.id === home?.per_voi?.session_id);
  switch (state) {
    case 'reveal_ready': return { title: 'Le vostre risposte sono pronte ♡', line: 'Scoprite cosa avete risposto.', cta: 'Scopri' };
    case 'waiting': return { title: `Hai risposto. Aspettiamo ${partnerName()}.`, line: 'Le risposte si svelano quando avete finito entrambi.', cta: 'Apri' };
    case 'pending': return { title: row?.partner_complete ? `${partnerName()} ha già risposto` : `${partnerName()} ha iniziato`, line: 'Tocca a te: cinque domande preparate per voi.', cta: 'Rispondi' };
    case 'in_progress': return { title: 'Il vostro Per voi è a metà', line: 'Riprendi quando vuoi.', cta: 'Continua' };
    default: return { title: 'Non scegliete. US ha preparato qualcosa per voi.', line: 'Cinque domande, scelte tra tutto quello che avete.', cta: 'Inizia' };
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
  };
  button.setAttribute('aria-label', labels[state] || labels.idle);
  button.classList.remove('is-loading');
  button.removeAttribute('aria-busy');
}

// ---------------------------------------------------------------- hub

function weeklyCard(w) {
  if (!w) return '';
  const unlock = mondayLabel(w.next_unlock);
  if (w.created_by_me) {
    const q = w.my_question;
    return `<section class="us-gv2-weekly is-locked" aria-label="La domanda della settimana">
      <div class="us-gv2-weekly-head">${icon('lock-simple')}<div><span class="us-gv2-kicker">LA VOSTRA DOMANDA</span><b>Domanda creata</b><small>Si sblocca ${esc(unlock)}</small></div></div>
      ${q ? `<blockquote>${esc(q.question_text)}</blockquote><small class="us-gv2-note">${esc(partnerName())} la scoprirà solo giocando.</small>` : ''}
    </section>`;
  }
  if (w.partner_left_question) {
    return `<section class="us-gv2-weekly is-sealed" aria-label="La domanda della settimana">
      <div class="us-gv2-weekly-head">${icon('feather')}<div><span class="us-gv2-kicker">LA VOSTRA DOMANDA</span><b>${esc(partnerName())} ha lasciato una domanda per voi.</b><small>La troverete in un prossimo Per voi.</small></div></div>
    </section>`;
  }
  if (w.my_turn) {
    return `<section class="us-gv2-weekly is-open" aria-label="La domanda della settimana">
      <div class="us-gv2-weekly-head">${icon('feather')}<div><span class="us-gv2-kicker">LA VOSTRA DOMANDA</span><b>Questa settimana tocca a te.</b><small>Una domanda che solo tu potresti fare. Entrerà nei vostri giochi.</small></div></div>
      <button type="button" class="primary us-gv2-weekly-cta" data-gv2-action="weekly-create">Crea la domanda</button>
    </section>`;
  }
  return `<section class="us-gv2-weekly is-locked" aria-label="La domanda della settimana">
    <div class="us-gv2-weekly-head">${icon('lock-simple')}<div><span class="us-gv2-kicker">LA VOSTRA DOMANDA</span><b>Questa settimana crea ${esc(label(w.assigned_role))}</b><small>${w.next_role === myRole() ? `Da ${esc(unlock)} tocca a te.` : `Si sblocca ${esc(unlock)}`}</small></div></div>
  </section>`;
}

function renderHub() {
  const root = byId('quizHub');
  if (!root) return;
  const pv = perVoiCopy();
  const pvState = home?.per_voi?.state || 'idle';
  const openByFamily = new Map((home?.open_rounds || []).map((r) => [r.game_family, r]));
  const others = (home?.open_rounds || []).filter((r) => r.game_family !== 'per_voi');
  const recent = (home?.recent || []).filter((r) => r.my_reveal_seen_at).slice(0, 4);
  const modeTiles = FAMILIES.map((f) => {
    const open = openByFamily.get(f.id);
    const status = open ? roundStatus(open) : null;
    return `<button type="button" class="us-gv2-mode" data-gv2-family="${f.id}">
      ${icon(f.icon)}<span class="us-gv2-mode-copy"><b>${esc(f.name)}</b><small>${esc(status ? status.text : f.line)}</small></span>
      ${status ? `<i class="us-gv2-dot" data-tone="${esc(status.tone)}" aria-hidden="true"></i>` : ''}
    </button>`;
  }).join('');
  root.innerHTML = `
    <header class="us-gv2-head"><span class="us-gv2-kicker">GIOCA</span><h2>Scopritevi, giocando</h2><p>Cinque domande alla volta. Le risposte restano vostre finché non avete finito entrambi.</p></header>
    <button type="button" class="us-gv2-pervoi us-attention-orbit" data-gv2-action="per-voi" data-gv2-state="${esc(pvState)}" data-us-attention="${pvState === 'pending' || pvState === 'reveal_ready' ? 'on' : 'off'}">
      ${icon('sparkle')}<span class="us-gv2-pervoi-copy"><span class="us-gv2-kicker">PER VOI</span><b>${esc(pv.title)}</b><small>${esc(pv.line)}</small></span><span class="us-gv2-pervoi-cta">${esc(pv.cta)}</span>
    </button>
    ${weeklyCard(home?.weekly)}
    ${others.length ? `<section class="us-gv2-list" aria-label="Partite in corso"><span class="us-gv2-kicker">IN CORSO</span>${others.map((r) => { const s = roundStatus(r); return `<button type="button" class="us-gv2-row" data-gv2-session="${esc(r.id)}"><span><b>${esc(familyName(r.game_family))}</b><small>${esc(s.text)}</small></span><i class="us-gv2-dot" data-tone="${esc(s.tone)}" aria-hidden="true"></i></button>`; }).join('')}</section>` : ''}
    <section class="us-gv2-modes" aria-label="Scegliete voi"><span class="us-gv2-kicker">SCEGLIETE VOI</span><div class="us-gv2-mode-grid">${modeTiles}</div></section>
    ${recent.length ? `<section class="us-gv2-list" aria-label="Rivedi"><span class="us-gv2-kicker">RIVEDI</span>${recent.map((r) => `<button type="button" class="us-gv2-row is-quiet" data-gv2-session="${esc(r.id)}"><span><b>${esc(familyName(r.game_family))}</b><small>${esc(romeDate(String(r.completed_at || '').slice(0, 10), { day: 'numeric', month: 'long' }))}</small></span></button>`).join('')}</section>` : ''}`;
}

function renderHubError() {
  const root = byId('quizHub');
  if (root) root.innerHTML = '<div class="us-gv2-empty">Non riesco a caricare Gioca. <button type="button" data-gv2-action="retry">Riprova</button></div>';
}

async function load() {
  if (!window.usProfile) return null;
  const seq = ++loadSeq;
  try {
    const { data, error } = await sb.rpc('get_game_v2_home');
    if (error) throw error;
    if (seq !== loadSeq) return home;
    home = data || null;
    renderTop();
    if (view === 'hub') renderHub();
    return home;
  } catch (error) {
    console.warn('[US Gioca] home', error);
    renderTop();
    if (view === 'hub' && !home) renderHubError();
    return null;
  }
}

// ---------------------------------------------------------------- panel shell

function panel() { return byId('usGameV2Panel'); }
function showPanel(html) {
  byId('quizHub')?.classList.add('hidden');
  const root = panel();
  if (!root) return null;
  root.classList.remove('hidden');
  root.innerHTML = html;
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
    toast(/not enough content/.test(error?.message || '') ? 'Non ci sono ancora abbastanza domande per questo gioco.' : 'Non riesco ad aprire la partita. Riprova.');
  } finally { busy = false; }
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
    renderReveal();
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

function renderPlay() {
  const item = current?.items?.[index];
  if (!item) return;
  const total = current.items.length;
  const value = answerValue(item);
  const kicker = current.game_family === 'per_voi' ? `PER VOI · ${familyName(item.family).toUpperCase()}` : familyName(current.game_family).toUpperCase();
  const hint = itemHint(item);
  const input = item.answer_kind === 'open'
    ? `<label class="us-gv2-sr" for="usGv2Answer">La tua risposta</label><textarea id="usGv2Answer" maxlength="1000" rows="5" placeholder="Scrivi con calma…">${esc(value ?? '')}</textarea>`
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

function renderWaiting() {
  showPanel(`<article class="us-gv2-waiting">
    <div class="us-gv2-play-top">${backButton()}</div>
    <span class="us-gv2-kicker">${esc(familyName(current.game_family).toUpperCase())}</span>
    <h2>Hai risposto.</h2>
    <p class="us-gv2-lead">Aspettiamo ${esc(partnerName())}. Le risposte si scoprono quando avete finito entrambi.</p>
    <ol class="us-gv2-mine">${current.items.map((i) => `<li><small>${esc(i.my_prompt || i.question_text)}</small><b>${esc(myAnswerText(i))}</b></li>`).join('')}</ol>
    <div class="us-gv2-actions"><button type="button" class="ghost" data-gv2-action="back">Torna a Gioca</button><button type="button" class="primary" data-gv2-action="refresh">Aggiorna</button></div>
  </article>`);
}

// Gendered past participles agree with the object pronoun (it. "l’hai capita").
const agree = (role, stem) => `${stem}${role === 'beatrice' ? 'a' : 'o'}`;
function outcome(item) {
  if (item.mechanic === 'prediction') {
    const matched = item.prediction_matched === true;
    if (item.my_item_role === 'predictor') return matched ? `L’hai ${agree(item.subject_role, 'capit')} al volo ♡` : `Ti ha ${agree(myRole(), 'sorpres')}`;
    return matched ? `Ti ha ${agree(myRole(), 'capit')} al volo ♡` : `L’hai ${agree(partnerRole(), 'sorpres')}`;
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

function renderReveal() {
  const cards = current.items.map((item) => {
    const out = outcome(item);
    const same = item.mechanic === 'prediction' ? item.prediction_matched === true : item.answer_kind === 'choice' && item.my_answer_index === item.partner_answer_index;
    return `<article class="us-gv2-reveal-card" data-gv2-family="${esc(item.family || current.game_family)}">
      <span class="us-gv2-kicker">${esc(familyName(item.family || current.game_family).toUpperCase())}</span>
      ${contextChip(item)}
      <h3>${esc(item.my_prompt || item.question_text)}</h3>
      ${out ? `<span class="us-gv2-outcome" data-same="${same ? 'true' : 'false'}">${esc(out)}</span>` : ''}
      <dl>${revealRows(item).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${previousAnswers(item)}
    </article>`;
  }).join('');
  showPanel(`<article class="us-gv2-reveal">
    <div class="us-gv2-play-top">${backButton()}</div>
    <span class="us-gv2-kicker">LE VOSTRE RISPOSTE</span>
    <h2>${esc(familyName(current.game_family))}</h2>
    <div class="us-gv2-reveal-list">${cards}</div>
    <div class="us-gv2-actions"><button type="button" class="ghost" data-gv2-action="back">Torna a Gioca</button><button type="button" class="primary" data-gv2-action="again" data-gv2-again="${esc(current.game_family)}">Facciamone un altro</button></div>
  </article>`);
}

// ---------------------------------------------------------------- weekly form

function renderWeeklyForm(error = '') {
  const w = home?.weekly;
  view = 'weekly';
  const root = showPanel(`<article class="us-gv2-weekly-form">
    <div class="us-gv2-play-top">${backButton()}</div>
    <span class="us-gv2-kicker">LA DOMANDA DELLA SETTIMANA</span>
    <h2>Scrivi la vostra domanda</h2>
    <p class="us-gv2-lead">Una sola a settimana. ${esc(partnerName())} la scoprirà solo giocando.</p>
    <form id="usGv2WeeklyForm" novalidate>
      <label for="usGv2WeeklyText">La domanda</label>
      <textarea id="usGv2WeeklyText" name="question_text" maxlength="300" rows="3" required placeholder="Qualcosa che solo tu potresti chiedere…"></textarea>
      <fieldset class="us-gv2-segment"><legend>Come si risponde?</legend>
        <label><input type="radio" name="answer_kind" value="open" checked><span>Risposta libera</span></label>
        <label><input type="radio" name="answer_kind" value="choice"><span>Scelta</span></label>
      </fieldset>
      <div id="usGv2WeeklyOptions" class="us-gv2-options" hidden>
        <p>Da 2 a 4 possibilità.</p>
        ${[0, 1, 2, 3].map((i) => `<label class="us-gv2-sr" for="usGv2Option${i}">Opzione ${i + 1}</label><input id="usGv2Option${i}" name="option_${i}" maxlength="120" placeholder="Opzione ${i + 1}${i > 1 ? ' (facoltativa)' : ''}">`).join('')}
      </div>
      <fieldset class="us-gv2-families"><legend>In quali giochi può comparire?</legend>
        ${FAMILIES.map((f) => `<label class="us-gv2-chip"><input type="checkbox" name="families" value="${f.id}" ${f.id === 'scopritevi' ? 'checked' : ''} ${f.id === 'quanto_mi_conosci' ? 'disabled' : ''}><span>${esc(f.name)}</span></label>`).join('')}
        <small id="usGv2PredictionHint">“Quanto mi conosci?” funziona solo con risposte a scelta.</small>
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
  else if (action === 'weekly-create') renderWeeklyForm();
  else if (action === 'back') showHub();
  else if (action === 'prev') { const item = current.items[index]; drafts.set(item.id, readInput(item)); index = Math.max(0, index - 1); renderPlay(); }
  else if (action === 'refresh') refresh();
  else if (action === 'again') startRound(button.dataset.gv2Again || 'per_voi');
  else if (action === 'retry') load();
  else if (button.dataset.gv2Family) startRound(button.dataset.gv2Family);
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
  load, refresh, showHub, openPerVoi, startRound, openSession,
  isOpen: () => view !== 'hub',
  close: showHub,
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
document.addEventListener('visibilitychange', () => { if (!document.hidden && window.usProfile) refresh(); });
setInterval(() => { if (!document.hidden && window.usProfile) refresh(); }, 45000);
})();
