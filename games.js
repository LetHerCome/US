// US Game V2 — Gioca: Per voi, six modes, Swipe, the weekly couple question,
// sealed couple rounds, prediction and reveal. Server RPCs are the only
// authority: couple, role, week, content and reveal are never decided here.
// Partner answers are rendered only from a reveal-ready server state and are
// never written to local storage.
(() => {
'use strict';
if (window.USGameV2) return;

// V3 — each family says in a few words what kind of moment it is.
const FAMILIES = [
  { id: 'scopritevi', name: 'Scopritevi', icon: 'binoculars', kind: 'Domande nuove su di voi' },
  { id: 'confrontatevi', name: 'Confrontatevi', icon: 'arrows-left-right', kind: 'Due punti di vista' },
  { id: 'ridete', name: 'Ridete', icon: 'smiley', kind: 'Leggero e un po’ assurdo' },
  { id: 'quanto_mi_conosci', name: 'Quanto mi conosci?', icon: 'eye', kind: 'Indovina le sue risposte' },
  { id: 'rivivete', name: 'Rivivete', icon: 'clock-counter-clockwise', kind: 'I vostri ricordi, a due voci' },
  // 1.0: E se…? is no longer offered (its questions live in Confrontatevi);
  // the entry stays so old rounds still open with their name and icon.
  { id: 'e_se', name: 'E se…?', icon: 'signpost', kind: 'Scenari, futuri, possibilità', retired: true },
];
const FAMILY = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
const OFFERED = FAMILIES.filter((f) => !f.retired);
const PER_VOI = { id: 'per_voi', name: 'Per voi', icon: 'sparkle' };
const SWIPE = { id: 'swipe', name: 'Questo o quello', icon: 'cards-three' };
const byId = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = (role) => window.UsIdentity?.current().nameForRole(role) || 'La tua persona';
// What the couple wrote (their own questions and options, free answers) is kept as written.
const asWritten = (yes) => (yes ? ' translate="no"' : '');
const coupleWritten = (item) => item?.source_type === 'couple_custom';
const myRole = () => window.usProfile?.role || null;
const partnerRole = () => (myRole() === 'francesco' ? 'beatrice' : 'francesco');
const partnerName = () => window.UsIdentity?.current().partnerName || 'La tua persona';
const familyName = (id) => (id === 'per_voi' ? PER_VOI.name : id === 'swipe' ? SWIPE.name : FAMILY[id]?.name || 'Gioca');
const icon = (name) => `<span class="us-gv2-icon" data-gv2-icon="${esc(name)}" aria-hidden="true"></span>`;
const uuid = () => window.crypto.randomUUID();
const romeDate = (iso, opts) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'), { timeZone: 'UTC', ...opts }) : '');
const mondayLabel = (iso) => romeDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });

let home = null;
let current = null;      // server state of the open round
let view = 'hub';        // hub | play | waiting | reveal | weekly
let index = 0;           // item being answered
const drafts = new Map(); // item id -> unsaved local draft (memory only)
let busy = false;
let loadSeq = 0;
let identityEpoch = 0;
function gameIdentityGuard(){
  const profile=window.usProfile,coupleId=profile?.couple_id,epoch=identityEpoch;
  return ()=>epoch===identityEpoch&&window.usProfile===profile&&window.usProfile?.couple_id===coupleId;
}
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

// The partner's real name when US has it ('' while it is unknown), so a
// sentence can fall back to "la tua persona" instead of a capitalised label.
const knownPartner = () => { const name = partnerName(); return name === 'La tua persona' ? '' : name; };
const ofPartner = () => (knownPartner() ? `di ${knownPartner()}` : 'della tua persona');

// 1.0 — Per voi says when the partner's sealed question is inside. Before the
// round exists that is the server's own rule (an unplayed weekly question
// ranks first in Per voi), so it is said only while no round has started
// since the question was written; once the round exists, only its items decide.
const perVoiPartnerQuestion = new Map(); // session id -> partner question inside
const perVoiChecks = new Set();
const partnerAuthored = (item) => coupleWritten(item) && Boolean(item?.context?.author_role) && item.context.author_role !== myRole();
function rememberPerVoi(state) {
  if (state?.game_family === 'per_voi' && state.id && Array.isArray(state.items)) perVoiPartnerQuestion.set(state.id, state.items.some(partnerAuthored));
}
function perVoiHasPartnerQuestion() {
  const w = home?.weekly;
  if (!w?.partner_left_question) return false;
  const sid = home?.per_voi?.session_id;
  if (sid) return perVoiPartnerQuestion.get(sid) === true;
  const since = Date.parse(w.created_at || '');
  const rounds = (home?.open_rounds || []).concat(home?.recent || []);
  return Number.isFinite(since) && !rounds.some((r) => Date.parse(r.started_at || '') >= since);
}
// One read of a Per voi round this phone has not opened yet, only when the
// partner left a question this week; the answer is kept for the session.
async function checkPerVoiQuestion() {
  const sameIdentity = gameIdentityGuard();
  const sid = home?.per_voi?.session_id;
  const state = home?.per_voi?.state;
  if (!sid || !home?.weekly?.partner_left_question || !['pending', 'in_progress'].includes(state)) return;
  if (perVoiPartnerQuestion.has(sid) || perVoiChecks.has(sid)) return;
  perVoiChecks.add(sid);
  try {
    const { data, error } = await sb.rpc('get_game_session', { target_session_id: sid });
    if (!sameIdentity() || error) return;
    rememberPerVoi(data);
    if (view === 'hub' && perVoiPartnerQuestion.get(sid)) renderHub();
  } catch (error) { console.warn('[US Gioca] per voi', error); }
}

function perVoiCopy() {
  const state = home?.per_voi?.state || 'idle';
  const row = (home?.open_rounds || []).concat(home?.recent || []).find((r) => r.id === home?.per_voi?.session_id);
  const note = ['idle', 'pending', 'in_progress'].includes(state) && perVoiHasPartnerQuestion() ? `Dentro c’è la domanda ${ofPartner()}` : '';
  switch (state) {
    case 'reveal_ready': return { line: 'Risposte pronte ♡', cta: 'Scopri' };
    case 'waiting': return { line: `Aspettiamo ${partnerName()}`, cta: 'Apri' };
    case 'pending': return { line: row?.partner_complete ? `${partnerName()} ha già risposto` : `${partnerName()} ha iniziato`, cta: 'Rispondi', note };
    case 'in_progress': return { line: 'A metà', cta: 'Continua', note };
    case 'played': return { line: 'Giocato questa settimana', cta: 'Rivedi' };
    default: return { line: '5 domande scelte per voi', cta: 'Inizia', note };
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
  // One word for the weekly unit: giochi.
  const remainingLabel = done ? 'Tutti giocati' : remaining === 1 ? 'Ancora 1 gioco' : `Ancora ${remaining} giochi`;
  return `<div class="us-gv2-rhythm" data-gv2-rhythm="${done ? 'done' : 'open'}" role="group" aria-label="${esc(`Questa settimana: ${remainingLabel.toLowerCase()}`)}">
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
      ${q ? `<blockquote translate="no">${esc(q.question_text)}</blockquote><small class="us-gv2-note">${esc(partnerName())} la scoprirà giocando.</small>` : ''}
    </section>`;
  }
  if (w.partner_left_question) {
    return `<section class="us-gv2-weekly is-sealed" aria-label="La domanda della settimana">
      ${head('feather', `${partnerName()} ha lasciato una domanda`, 'La troverete giocando.')}
    </section>`;
  }
  if (w.my_turn) {
    return `<section class="us-gv2-weekly is-open" aria-label="La domanda della settimana">
      ${head('feather', 'Tocca a te', `Scrivila, sigillala: ${partnerName()} la scopre giocando.`)}
      <button type="button" class="primary us-gv2-weekly-cta" data-gv2-action="weekly-create">Crea la domanda</button>
    </section>`;
  }
  return `<section class="us-gv2-weekly is-locked" aria-label="La domanda della settimana">
    ${head('lock-simple', `Questa settimana crea ${label(w.assigned_role)}`, w.next_role === myRole() ? `Tocca a te da ${unlock}` : `Cambia ${unlock}`)}
  </section>`;
}

// V3 — rounds that need you (or are about to) are shown directly, only
// when they exist; completed rounds stay one tap away at the end. Every row is
// a plain reading of the server's open_rounds / recent summaries.
const continueRounds = (h) => (h?.open_rounds || []).concat((h?.recent || []).filter((r) => r.reveal_ready && !r.my_reveal_seen_at));
const doneRounds = (h) => (h?.recent || []).filter((r) => r.reveal_ready && r.my_reveal_seen_at);
const ROUND_ICON = (family) => (family === 'per_voi' ? PER_VOI.icon : family === 'swipe' ? SWIPE.icon : FAMILY[family]?.icon || 'sparkle');
const TONE_ORDER = { ready: 0, turn: 1, progress: 2, waiting: 3, seen: 4 };

function roundRow(r) {
  const status = roundStatus(r);
  const when = r.completed_at ? romeDate(String(r.completed_at).slice(0, 10), { day: 'numeric', month: 'long' }) : '';
  return `<button type="button" class="us-gv2-row" data-gv2-session="${esc(r.id)}" data-tone="${esc(status?.tone || '')}">${glyph(ROUND_ICON(r.game_family))}<span class="us-gv2-row-copy"><b>${esc(familyName(r.game_family))}</b>${when ? `<small>${esc(when)}</small>` : ''}</span>${status ? `<small class="us-gv2-row-state" data-tone="${esc(status.tone)}">${esc(status.text)}</small>` : ''}</button>`;
}
function continueSection(h) {
  const rounds = continueRounds(h)
    .filter((r) => r.game_family !== 'per_voi' || r.id !== h?.per_voi?.session_id)
    .sort((a, b) => (TONE_ORDER[roundStatus(a)?.tone] ?? 9) - (TONE_ORDER[roundStatus(b)?.tone] ?? 9));
  if (!rounds.length) return '';
  return `<section class="us-gv2-continue" aria-labelledby="usGv2ContinueTitle">
    <h3 class="us-gv2-section-title" id="usGv2ContinueTitle">Da continuare</h3>
    <div class="us-gv2-rows">${rounds.map(roundRow).join('')}</div>
  </section>`;
}
function doneSection(h) {
  const rounds = doneRounds(h);
  if (!rounds.length) return '';
  return `<details class="us-gv2-done"><summary><span>Partite completate</span><b>${rounds.length}</b></summary><div class="us-gv2-rows">${rounds.map(roundRow).join('')}</div></details>`;
}

// One status vocabulary for every game card: available, to continue,
// completed this week, or locked until the weekly reset.
function cardState(status) {
  if (!status) return { state: 'ready', text: 'Disponibile', mark: '' };
  if (status.state === 'open') return { state: 'open', text: status.text, mark: '', tone: status.tone };
  if (status.state === 'played') return { state: 'played', text: 'Completato', mark: icon('check') };
  return { state: 'locked', text: 'Da lunedì', mark: icon('lock-simple') };
}
function gameCard({ id, name, iconName, kind, action, extraClass = '', status }) {
  const card = cardState(status);
  const locked = card.state === 'locked';
  const data = action === 'swipe' ? 'data-gv2-action="swipe"' : `data-gv2-family="${id}"`;
  return `<button type="button" data-us-tile data-us-feedback="tap" class="us-gv2-game${extraClass}" ${data} data-gv2-mode-state="${esc(card.state)}"${locked ? ' aria-disabled="true"' : ''} aria-label="${esc(name)}: ${esc(kind)}. ${esc(card.text)}">
      ${glyph(iconName)}
      <span class="us-gv2-game-copy"><b>${esc(name)}</b><small>${esc(kind)}</small></span>
      <em class="us-gv2-game-state" data-state="${esc(card.state)}"${card.tone ? ` data-tone="${esc(card.tone)}"` : ''}>${card.mark}${esc(card.text)}</em>
    </button>`;
}

// Gioca V4: La domanda di oggi leads; the weekly games keep server authority.
function renderHub() {
 const root=byId('quizHub');if(!root)return;
 const pv=perVoiCopy(),pvState=home?.per_voi?.state||'idle';
 const openByFamily=new Map((home?.open_rounds||[]).map(r=>[r.game_family,r]));
 const swipe=gameCard({id:'swipe',name:SWIPE.name,iconName:SWIPE.icon,kind:'8 carte · veloce e privato',action:'swipe',extraClass:' is-swipe',status:modeStatus(SWIPE,openByFamily.get('swipe'))});
 const families=OFFERED.map(f=>gameCard({id:f.id,name:f.name,iconName:f.icon,kind:f.kind,status:modeStatus(f,openByFamily.get(f.id))})).join('');
 const nothingYet=!continueRounds(home).length&&!doneRounds(home).length&&pvState==='idle';
 // 1.0 — when it is your turn to write La vostra domanda, it comes first.
 const weeklyFirst=Boolean(home?.weekly?.my_turn&&!home.weekly.created);
 root.innerHTML=`
  <h2 class="us-gv2-sr">Gioca</h2>
  <div class="us-gv2-daily-slot" data-gv4-daily-slot aria-live="polite"><div class="us-gv4-daily-pending" role="status"><span class="us-gv4-daily-pending-title">La domanda di oggi</span><small>Preparo la domanda di oggi…</small></div></div>
  <header class="us-gv2-head" aria-label="Disponibilità giochi settimanali">${rhythmStrip()}</header>
  ${continueSection(home)}
  ${weeklyFirst?weeklyCard(home.weekly):''}
  <section class="us-gv2-choose" aria-labelledby="usGv2ChooseTitle">
   <div class="us-gv2-section-head"><h3 class="us-gv2-section-title" id="usGv2ChooseTitle">I vostri giochi</h3>${nothingYet?'<small>Bastano pochi minuti.</small>':''}</div>
   <div class="us-gv2-game-grid">
    <button type="button" data-us-tile data-us-feedback="tap" class="us-gv2-pervoi us-attention-orbit" data-gv2-action="per-voi" data-gv2-state="${esc(pvState)}" data-us-attention="${pvState==='pending'||pvState==='reveal_ready'?'on':'off'}">
     ${glyph('sparkle').replace('class="us-gv2-glyph"','class="us-gv2-glyph" data-us-attention-icon')}
     <span class="us-gv2-pervoi-copy"><span class="us-gv2-kicker">PROPOSTO PER VOI</span><b>Per voi</b><small>${esc(pv.line)}</small>${pv.note?`<small class="us-gv2-pervoi-note">${esc(pv.note)}</small>`:''}</span>
     <span class="us-gv2-pervoi-cta">${esc(pv.cta)}</span>
    </button>
    ${swipe}${families}
   </div>
  </section>
  ${weeklyFirst?'':weeklyCard(home?.weekly)}
  ${doneSection(home)}`;
 window.UsDailyQuestionHub?.paintCard?.();
}

function renderHubError() {
  const root = byId('quizHub');
  if (root) root.innerHTML = '<div class="us-gv2-empty">Gioca non risponde. <button type="button" data-gv2-action="retry">Riprova</button></div>';
}

async function load() {
  const sameIdentity=gameIdentityGuard();
  if (!window.usProfile) return null;
  const seq = ++loadSeq;
  try {
    const { data, error } = await sb.rpc('get_game_v2_home');
    if(!sameIdentity())return false;
    if (error) throw error;
    if (seq !== loadSeq) return home;
    home = data || null;
    if (weeklyJustCreated === 'pending') weeklyJustCreated = true;
    renderTop();
    if (view === 'hub') renderHub();
    checkPerVoiQuestion();
    return home;
  } catch (error) {
    console.warn('[US Gioca] home', error);
    if(!sameIdentity())return false;
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
// Due colori: every round reads as a sheet — its eyebrow on the left, the
// close on the right (still the same "back to the hub" action).
const backButton = () => `<button type="button" class="us-gv2-back" data-gv2-action="back" aria-label="Torna a Gioca">${icon('x')}<span>Gioca</span></button>`;
const sheetTop = (kicker, count = '') => `<div class="us-gv2-play-top"><span class="us-gv2-kicker">${esc(kicker)}${count ? `<span class="us-gv2-count"> · ${esc(count)}</span>` : ''}</span>${backButton()}</div>`;
// The two of you and what you share: rosa, lilla and the Noi lens between.
const VENN = '<span class="us-gv2-venn" aria-hidden="true"><i class="is-a"></i><i class="is-b"></i><i class="is-noi"></i></span>';

// ---------------------------------------------------------------- rounds

async function startRound(family) {
  const sameIdentity=gameIdentityGuard();
  if (busy) return;
  busy = true;
  try {
    const requestId = startRequestIds.get(family) || uuid();
    startRequestIds.set(family, requestId);
    const { data, error } = await sb.rpc('start_game_round', { target_family: family, request_id: requestId });
    if(!sameIdentity())return false;
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
      : /too many open rounds/.test(msg) ? 'Prima finite uno dei giochi in corso.'
      : 'Non riesco ad aprire la partita. Riprova.');
    if (/weekly|too many open rounds/.test(msg)) load();
  } finally { busy = false; }
}

// A mode tile: resume its open round; a mode already played this week asks
// once before spending a second moment on it; nothing starts once the
// week's free moments are spent (history stays one tap away).
async function startSwipe() {
  const sameIdentity=gameIdentityGuard();
  if (busy) return;
  busy = true;
  try {
    const requestId = startRequestIds.get('swipe') || uuid();
    startRequestIds.set('swipe', requestId);
    const { data, error } = await sb.rpc('start_swipe_round', { request_id: requestId });
    if(!sameIdentity())return false;
    if (error) throw error;
    startRequestIds.delete('swipe');
    await present(data);
  } catch (error) {
    console.warn('[US Gioca] swipe start', error);
    const msg = error?.message || '';
    if (/weekly allowance exhausted|too many open rounds|not enough swipe content/.test(msg)) startRequestIds.delete('swipe');
    toast(/weekly allowance exhausted/.test(msg) ? EXHAUSTED
      : /too many open rounds/.test(msg) ? 'Prima finite uno dei giochi in corso.'
      : /not enough swipe content/.test(msg) ? 'Le nuove carte di Questo o quello non sono ancora pronte.'
      : 'Non riesco ad aprire Questo o quello. Riprova.');
    if (/weekly|too many open rounds/.test(msg)) load();
  } finally { busy = false; }
}

// 1.0 — a new round spends one of the week's games for both of you: it is
// always confirmed first, with the real number the server says is left
// (the same count as the "Ancora N giochi" strip).
async function confirmSpend({ family, played, title, confirmLabel }) {
  const a = allowance();
  if (!a) return true;
  const ask = window.UsUiFoundation?.confirm;
  if (typeof ask !== 'function') return true;
  const left = Math.max(1, a.limit - Math.min(a.used, a.limit));
  const name = familyName(family);
  return ask({
    kicker: played ? name.toUpperCase() : 'QUESTA SETTIMANA',
    title: played ? title : name,
    body: left === 1 ? 'Userete l’ultimo gioco di questa settimana.' : `Userete 1 dei ${left} giochi di questa settimana.`,
    confirmLabel: played ? confirmLabel : 'Inizia',
    cancelLabel: 'Non ora',
  });
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
  const ok = await confirmSpend({ family: 'swipe', played, title: 'Avete già fatto Questo o quello questa settimana', confirmLabel: 'Altre 8' });
  if (!ok) return;
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
  const ok = await confirmSpend({ family, played, title: `Avete già giocato a ${familyName(family)} questa settimana`, confirmLabel: 'Gioca ancora' });
  if (!ok) return;
  return startRound(family);
}

async function openSession(id) {
  const sameIdentity=gameIdentityGuard();
  try {
    const { data, error } = await sb.rpc('get_game_session', { target_session_id: id });
    if(!sameIdentity())return false;
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
  const sameIdentity=gameIdentityGuard();
  if (!state?.id || !Array.isArray(state.items)) throw new Error('invalid game session');
  current = state;
  drafts.clear();
  rememberPerVoi(state);
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
        if(!sameIdentity())return false;
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

// 1.0 — a question one of you wrote is signed where it appears. The server
// keeps its author in the round (context.author_role); nothing is guessed.
function authorChip(item) {
  const role = coupleWritten(item) ? item?.context?.author_role : null;
  if (!role) return '';
  const name = label(role);
  const text = role === myRole() ? 'La tua domanda' : name === 'La tua persona' ? 'La domanda della tua persona' : `La domanda di ${name}`;
  return `<span class="us-gv2-context us-gv2-author">${icon('feather')}${esc(text)}</span>`;
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
    ${sheetTop(`${SWIPE.name.toUpperCase()} · SCELTA ${index + 1} DI ${total}`)}
    <div class="us-gv2-swipe-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index + 1}" aria-label="Carta ${index + 1} di ${total}">
      ${Array.from({ length: total }, (_, i) => `<i data-state="${i < index ? 'done' : i === index ? 'now' : 'next'}"></i>`).join('')}
    </div>
    <section class="us-gv2-swipe-stage" aria-label="Carta di ${esc(SWIPE.name)}">
      <article class="us-gv2-swipe-card" id="usGv2SwipeCard" tabindex="0" aria-label="${esc(item.question_text)}. Freccia sinistra: ${esc(left)}. Freccia destra: ${esc(right)}.">
        <h2>${esc(item.question_text)}</h2>
        <span class="us-gv2-swipe-stamp is-left" aria-hidden="true">${esc(left)}</span>
        <span class="us-gv2-swipe-stamp is-right" aria-hidden="true">${esc(right)}</span>
        <div class="us-gv2-swipe-card-foot" aria-hidden="true"><span>← ${esc(left)}</span><span>${esc(right)} →</span></div>
      </article>
    </section>
    <div class="us-gv2-swipe-actions" role="group" aria-label="Scegli una risposta">
      <button type="button" class="ghost" data-gv2-swipe-choice="0" aria-label="${esc(left)}">${icon('caret-left')}<b>${esc(left)}</b></button>
      <button type="button" class="primary" data-gv2-swipe-choice="1" aria-label="${esc(right)}"><b>${esc(right)}</b>${icon('caret-right')}</button>
    </div>
    <p id="usGv2Error" class="us-gv2-error" role="alert" hidden></p>
    <p class="us-gv2-swipe-note">Trascina la carta oppure usa i due pulsanti. ${esc(partnerName())} non vedrà le tue scelte finché non avrete finito entrambi.</p>
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
  const sameIdentity=gameIdentityGuard();
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
    if(!sameIdentity())return false;
    const { data, error } = await sb.rpc('save_game_session_answer', {
      target_session_id: current.id,
      target_item_id: item.id,
      target_answer_text: null,
      target_answer_index: choice
    });
    if(!sameIdentity())return false;
    if (error) throw error;
    current = data;
    window.UsFeedback?.tap?.();

    if (index < current.items.length - 1) {
      index += 1;
      renderSwipePlay();
      return;
    }

    const { data: done, error: completeError } = await sb.rpc('complete_game_session_side', { target_session_id: current.id });
    if(!sameIdentity())return false;
    if (completeError) throw completeError;
    window.sendWebPushEvent?.('game_session', done.id).catch?.(() => {});
    await present(done);
    load();
  } catch (error) {
    if(!sameIdentity())return false;
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
  const key = (i) => 'ABCDEFGH'[i] || String(i + 1);
  const hint = itemHint(item);
  const input = item.answer_kind === 'open'
    ? `<label class="us-gv2-sr" for="usGv2Answer">La tua risposta</label><textarea id="usGv2Answer" maxlength="1000" rows="5" placeholder="Scrivi…">${esc(value ?? '')}</textarea>`
    : `<fieldset class="us-gv2-choices"><legend class="us-gv2-sr">${item.my_item_role === 'predictor' ? 'La tua previsione' : 'La tua scelta'}</legend>${(item.options || []).map((o, i) => `<label class="us-gv2-choice"><input type="radio" name="gv2choice" value="${i}" ${Number(value) === i && value !== null && value !== undefined ? 'checked' : ''}><i class="us-gv2-choice-key" aria-hidden="true">${key(i)}</i><span${asWritten(coupleWritten(item))}>${esc(o)}</span></label>`).join('')}</fieldset>`;
  const last = index === total - 1;
  showPanel(`<article class="us-gv2-play" data-gv2-family="${esc(item.family || current.game_family)}">
    ${sheetTop(kicker, `${index + 1} di ${total}`)}
    <div class="us-gv2-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index + 1}" aria-label="Domanda ${index + 1} di ${total}">${Array.from({ length: total }, (_, i) => `<i data-on="${i <= index ? 'true' : 'false'}"></i>`).join('')}</div>
    ${contextChip(item)}${authorChip(item)}
    ${hint ? `<p class="us-gv2-hint">${esc(hint)}</p>` : ''}
    <h2 class="us-gv2-question"${asWritten(coupleWritten(item))}>${esc(item.my_prompt || item.question_text)}</h2>
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
  const sameIdentity=gameIdentityGuard();
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
  if(!sameIdentity())return false;
  if (error) throw error;
  current = data;
  drafts.delete(item.id);
  return true;
}

async function submitAnswer() {
  const sameIdentity=gameIdentityGuard();
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
    if(!sameIdentity())return false;
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
    ${sheetTop(`${SWIPE.name.toUpperCase()} · SCELTE SIGILLATE`)}
    <h2>Le tue 8 scelte sono dentro.</h2>
    <div class="us-gv2-wait-art">${VENN}</div>
    <p class="us-gv2-lead">Aspettiamo ${esc(partnerName())}. Finché non finisce, le vostre risposte restano separate.</p>
    <ol class="us-gv2-swipe-mine">${current.items.map((item, i) => `<li><span>${i + 1}</span><small>${esc(item.question_text)}</small><b>${esc(myAnswerText(item))}</b></li>`).join('')}</ol>
    <div class="us-gv2-actions"><button type="button" class="ghost" data-gv2-action="back">Torna a Gioca</button><button type="button" class="primary" data-gv2-action="refresh">${icon('arrows-clockwise')}<span>Controlla</span></button></div>
  </article>`);
}

function renderWaiting() {
  if (current?.game_family === 'swipe') return renderSwipeWaiting();
  showPanel(`<article class="us-gv2-waiting">
    ${sheetTop(familyName(current.game_family).toUpperCase())}
    <h2>Hai risposto.</h2>
    <div class="us-gv2-wait-art">${VENN}</div>
    <p class="us-gv2-lead">Aspettiamo ${esc(partnerName())}. Le risposte si scoprono insieme.</p>
    <ol class="us-gv2-mine">${current.items.map((i) => `<li><small${asWritten(coupleWritten(i))}>${esc(i.my_prompt || i.question_text)}</small><b${asWritten(i.answer_kind === 'open' || coupleWritten(i))}>${esc(myAnswerText(i))}</b></li>`).join('')}</ol>
    <div class="us-gv2-actions"><button type="button" class="ghost" data-gv2-action="back">Torna a Gioca</button><button type="button" class="primary" data-gv2-action="refresh">${icon('arrows-clockwise')}<span>Aggiorna</span></button></div>
  </article>`);
}

// Prediction copy works independently of names and legacy slots.
function outcome(item) {
  if (item.mechanic === 'prediction') {
    const matched = item.prediction_matched === true;
    if (item.my_item_role === 'predictor') return matched ? 'Hai indovinato al volo ♡' : 'Una sorpresa per te';
    return matched ? 'Ha indovinato al volo ♡' : 'Una sorpresa per la tua persona';
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
  const written = asWritten(item.answer_kind === 'open' || coupleWritten(item));
  return `<div class="us-gv2-then"><span class="us-gv2-kicker">COSA AVEVATE RISPOSTO</span>
    <dl><div><dt>Tu</dt><dd${written}>${esc(then.my_answer_text ?? '—')}</dd></div><div><dt translate="no">${esc(partnerName())}</dt><dd${written}>${esc(then.partner_answer_text ?? '—')}</dd></div></dl></div>`;
}

// Reveal V5: a short, deliberate comparison instead of one tall card per
// answer. The server remains the only reveal authority. Only exact, revealed
// choice values and explicit prediction_matched are classed as equal/different.
// Open-text answers cannot be judged equal by a string comparison.
function revealKind(item){
  if(item.mechanic==='prediction')return item.prediction_matched===true?'same':item.prediction_matched===false?'different':'open';
  if(item.answer_kind==='choice'&&item.my_answer_index!=null&&item.partner_answer_index!=null)
    return item.my_answer_index===item.partner_answer_index?'same':'different';
  return 'open';
}
function revealAnswerRows(item){
  const [mine,theirs]=revealRows(item);
  const written=asWritten(item.answer_kind==='open'||coupleWritten(item));
  // Outside "Quanto mi conosci?" the second label is the partner's bare name.
  return [mine,theirs].map(([label,value],i)=>`<div><dt${asWritten(i===1&&item.mechanic!=='prediction')}>${esc(label)}</dt><dd${written}>${esc(value)}</dd></div>`).join('');
}
// 1.0 — every answer is visible as soon as the result opens: no group or
// question to unfold first.
function revealCompactItem(item,number,kind){
  const heading=esc(item.my_prompt||item.question_text||'Una domanda');
  const detailLabel=kind==='same'?'Scelte uguali':kind==='different'?'Scelte diverse':'Le risposte';
  return `<li class="us-gv5-reveal-item" data-gv5-kind="${kind}">
    <div class="us-gv5-reveal-q"><span class="us-gv5-reveal-num">${number}</span><span class="us-gv5-reveal-title"${asWritten(coupleWritten(item))}>${heading}</span></div>
    <div class="us-gv5-reveal-answers" aria-label="${detailLabel}" data-gv2-mechanic="${esc(item.mechanic||'')}">${contextChip(item)}${authorChip(item)}<dl>${revealAnswerRows(item)}</dl>
      ${item.mechanic==='prediction'?'<small class="us-gv5-outcome">'+esc(outcome(item))+'</small>':''}
      ${previousAnswers(item)}
    </div>
  </li>`;
}
function revealGroup(items,kind,title,description){
  if(!items.length)return '';
  return `<section class="us-gv5-reveal-group" data-gv5-group="${kind}">
    <h3 class="us-gv5-reveal-group-head"><span><b>${esc(title)}</b><small>${esc(description)}</small></span><strong>${items.length}</strong></h3>
    <ol>${items.map(({item,number})=>revealCompactItem(item,number,kind)).join('')}</ol>
  </section>`;
}
// 1.0 — the result is where the conversation starts: one of the different
// answers (when there is one) with "Ne parlate stasera?", then two gestures
// that already exist: Lasciato per te and Ti penso.
function revealMove(groups){
  const pick=groups.different[0]?.item||null;
  const partner=knownPartner();
  const feature=pick?`<div class="us-gv5-move-pick">
      <p class="us-gv5-move-q"${asWritten(coupleWritten(pick))}>${esc(pick.my_prompt||pick.question_text||'Una domanda')}</p>
      <dl>${revealAnswerRows(pick)}</dl>
    </div>`:'';
  return `<section class="us-gv5-move" aria-labelledby="usGv5MoveTitle">
    <h3 id="usGv5MoveTitle">Ne parlate stasera?</h3>
    ${feature}
    <div class="us-gv5-move-actions">
      <button type="button" class="primary" data-gv2-action="leave-something">${icon('envelope-simple')}<span>${esc(partner?`Lascia qualcosa a ${partner}`:'Lascia qualcosa alla tua persona')}</span></button>
      <button type="button" class="ghost" data-gv2-action="think">${icon('heart-straight')}<span>Ti penso</span></button>
    </div>
  </section>`;
}
// 1.0 — "Quanto mi conosci?": how well you were read, from the server's own
// prediction_matched; your reading of them only when you were never the subject.
function readingLine(items){
  const scored=(role)=>items.filter((i)=>i.mechanic==='prediction'&&i.my_item_role===role&&typeof i.prediction_matched==='boolean');
  const times=(n)=>(n===1?'1 volta':`${n} volte`);
  const partner=knownPartner();
  const read=scored('subject'),mine=scored('predictor');
  const hits=(list)=>list.filter((i)=>i.prediction_matched).length;
  if(read.length)return `${partner||'La tua persona'} ti ha letto ${times(hits(read))} su ${read.length}`;
  if(mine.length)return `Hai letto ${partner||'la tua persona'} ${times(hits(mine))} su ${mine.length}`;
  return '';
}
function renderCompactReveal({first=false}={}){
  const groups={same:[],different:[],open:[]};
  for(const [i,item] of current.items.entries())groups[revealKind(item)].push({item,number:i+1});
  const header=familyName(current.game_family);
  const reading=readingLine(current.items);
  showPanel(`<article class="us-gv2-reveal us-gv5-reveal${first?' is-first-reveal':''}" data-gv5-reveal>
    ${sheetTop('LE VOSTRE SCELTE')}
    <h2>${esc(header)}</h2>
    <div class="us-gv5-summary" aria-label="${groups.same.length} uguali, ${groups.different.length} diverse${groups.open.length?', '+groups.open.length+' risposte libere':''}">
      <span><strong>${groups.same.length}</strong><small>Uguali</small></span>
      <span><strong>${groups.different.length}</strong><small>Diverse</small></span>
      ${groups.open.length?`<span><strong>${groups.open.length}</strong><small>Da leggere</small></span>`:''}
    </div>
    ${revealMove(groups)}
    <div class="us-gv5-reveal-groups">
      ${revealGroup(groups.different,'different','Diverse','Dove avete scelto diversamente')}
      ${revealGroup(groups.same,'same','Uguali','Le vostre scelte in comune')}
      ${revealGroup(groups.open,'open','Risposte','Domande senza confronto automatico')}
    </div>
    ${reading?`<p class="us-gv5-reading">${esc(reading)}</p>`:''}
    <div class="us-gv2-actions is-single"><button type="button" class="ghost" data-gv2-action="back">Torna a Gioca</button></div>
  </article>`);
  // Results must open at the top, never behind Android's status bar after
  // the final swipe/scroll of a long round.
  window.scrollTo?.(0,0);
}
function renderSwipeReveal({first=false}={}){return renderCompactReveal({first});}
function renderReveal({first=false}={}){return renderCompactReveal({first});}

const WEEKLY_MORPH_MS = 480;
const WEEKLY_FAMILIES = Object.freeze(['scopritevi']);

// ---------------------------------------------------------------- weekly form

function renderWeeklyForm(error = '') {
  const w = home?.weekly;
  view = 'weekly';
  const root = showPanel(`<article class="us-gv2-weekly-form">
    ${sheetTop('LA DOMANDA DELLA SETTIMANA')}
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
      <p id="usGv2Error" class="us-gv2-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
      <button type="submit" class="primary us-gv2-submit">Salva la domanda</button>
    </form>
  </article>`);
  if (!root || !w) return;
  const form = root.querySelector('#usGv2WeeklyForm');
  form.addEventListener('input', () => { weeklyRequestId = null; });
  form.addEventListener('change', (event) => {
    if (event.target.name !== 'answer_kind') return;
    root.querySelector('#usGv2WeeklyOptions').hidden = event.target.value !== 'choice';
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
  const sameIdentity=gameIdentityGuard();
  if (busy) return;
  const data = new FormData(form);
  const text = String(data.get('question_text') || '').trim();
  const kind = data.get('answer_kind') === 'choice' ? 'choice' : 'open';
  const raw = [0, 1, 2, 3].map((i) => String(data.get(`option_${i}`) || '').trim());
  const options = kind === 'choice' ? raw.filter(Boolean) : [];
  // 1.0 — no technical "Nei giochi" choice: the question goes where it always
  // went by default (Scopritevi, and so Per voi), and the partner finds it playing.
  const families = WEEKLY_FAMILIES.slice();
  const problem = !text || text.length > 300 ? 'Scrivi una domanda di massimo 300 caratteri.'
    : kind === 'choice' && (!raw[0] || !raw[1] || new Set(options).size !== options.length) ? 'Scrivi almeno due opzioni diverse.' : '';
  if (problem) return showError(problem);
  busy = true;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    weeklyRequestId ||= uuid();
    const { data: state, error } = await sb.rpc('create_weekly_question', { request_id: weeklyRequestId, question_text: text, answer_kind: kind, options, families });
    if(!sameIdentity())return false;
    if (error) throw error;
    weeklyRequestId = null;
    if (home) home.weekly = state;
    if (!state?.replayed) window.sendWebPushEvent?.('game_weekly', state?.question_id || null).catch?.(() => {});
    toast('Domanda salvata ♡');
    window.UsFeedback?.success?.();
    await morphWeeklySaved(button);
    if(!sameIdentity())return false;
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
  const sameIdentity=gameIdentityGuard();
  if (view === 'hub') return load();
  if ((view === 'waiting' || view === 'play') && current?.id) {
    const { data, error } = await sb.rpc('get_game_session', { target_session_id: current.id });
    if(!sameIdentity())return false;
    if (!error && data && (data.reveal_ready !== current.reveal_ready || data.partner_complete !== current.partner_complete)) {
      if (view === 'waiting' || data.reveal_ready) await present(data);
      else current = { ...current, partner_complete: data.partner_complete };
    }
  }
  return load();
}

// Ti penso from a result: the same signal as the top control (app.js).
async function sendThink(button) {
  if (button.disabled || typeof window.sendThinkSignal !== 'function') return;
  button.disabled = true;
  let sent = false;
  try { sent = Boolean(await window.sendThinkSignal()); } catch (error) { console.warn('[US Gioca] think', error); }
  if (!button.isConnected) return;
  if (!sent) { button.disabled = false; return; }
  button.dataset.gv2Sent = 'true';
  const text = button.querySelector('span:last-child');
  if (text) text.textContent = 'Inviato';
}

function onClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.gv2Action;
  if (action === 'per-voi') openPerVoi();
  else if (action === 'swipe') chooseSwipe();
  else if (button.dataset.gv2SwipeChoice != null) commitSwipeChoice(Number(button.dataset.gv2SwipeChoice), 'tap');
  else if (action === 'weekly-create') renderWeeklyForm();
  else if (action === 'leave-something') window.UsLeftForYou?.openComposer?.();
  else if (action === 'think') sendThink(button);
  else if (action === 'back') showHub();
  else if (action === 'prev') { const item = current.items[index]; drafts.set(item.id, readInput(item)); index = Math.max(0, index - 1); renderPlay(); }
  else if (action === 'refresh') refresh();
  else if (action === 'retry') load();
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
window.addEventListener('us-identity-change', (event) => {
  if (!event.detail?.identityKey) {
    identityEpoch++;loadSeq++;current=null;home=null;drafts.clear();view='hub';
    startRequestIds.clear();weeklyRequestId=null;
    panel()?.classList.add('hidden');if(panel())panel().innerHTML='';
    byId('quizHub')?.classList.remove('hidden');
  }
  if(view==='hub')renderHub();
  else if(view==='waiting')renderWaiting();
  else if(view==='reveal')renderReveal();
  else if(view==='play'){
    const item=current?.items?.[index];
    if(item)drafts.set(item.id,readInput(item));
    renderPlay();
  }
  else if(view==='weekly'){
    const label=panel()?.querySelector('.us-gv2-lead');
    if(label)label.textContent=`${partnerName()} la scoprirà solo giocando.`;
  }
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
document.addEventListener('visibilitychange', () => { if (!document.hidden && window.usProfile) refresh(); });
setInterval(() => { if (!document.hidden && window.usProfile) refresh(); }, 45000);
})();
