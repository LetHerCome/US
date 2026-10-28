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
  { id: 'scopritevi', name: 'Scopritevi', icon: 'binoculars', kind: 'Quanto vi conoscete' },
  { id: 'confrontatevi', name: 'Confrontatevi', icon: 'arrows-left-right', kind: 'Due punti di vista' },
  { id: 'ridete', name: 'Ridete', icon: 'smiley', kind: 'Leggero e un po’ assurdo' },
  { id: 'quanto_mi_conosci', name: 'Quanto mi conosci?', icon: 'question', kind: 'Chi conosce meglio chi' },
  { id: 'rivivete', name: 'Rivivete', icon: 'images', kind: 'I vostri momenti' },
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
// Round 3 parity: each game's mark is the approved mockup art (gioca body.html,
// copied shape for shape); colours come from the tokens through classes, so
// Noi follows the Accenti like everywhere else.
const GAME_ART = Object.freeze({
  per_voi: '<circle class="f-rosa" cx="17" cy="22" r="12"/><circle class="f-lilla is-screen" cx="27" cy="22" r="12"/>',
  swipe: '<rect class="f-night" x="10" y="9" width="20" height="27" rx="5"/><rect class="f-ambra" x="15" y="7" width="20" height="27" rx="5" transform="rotate(12 25 20)"/>',
  scopritevi: '<circle class="s-menta" cx="15" cy="24" r="8" fill="none" stroke-width="4"/><circle class="s-menta" cx="30" cy="24" r="8" fill="none" stroke-width="4"/><path class="s-menta" d="M20 22h4" stroke-width="4"/>',
  confrontatevi: '<path class="s-noi" d="M8 16h22l-5-5M36 28H14l5 5" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  ridete: '<circle class="f-ambra" cx="22" cy="22" r="14"/><circle class="f-ink" cx="17" cy="19" r="2"/><circle class="f-ink" cx="27" cy="19" r="2"/><path class="s-ink" d="M15 25c3 5 11 5 14 0" fill="none" stroke-width="2.4" stroke-linecap="round"/>',
  quanto_mi_conosci: '<circle class="s-rosa" cx="22" cy="22" r="14" fill="none" stroke-width="4"/><path class="s-rosa" d="M18 18.5a4 4 0 1 1 5.6 3.7c-1 .4-1.6 1.2-1.6 2.3v1" fill="none" stroke-width="3.2" stroke-linecap="round"/><circle class="f-rosa" cx="22" cy="30" r="2"/>',
  rivivete: '<rect class="f-night" x="8" y="12" width="22" height="22" rx="5"/><rect class="f-ambra" x="14" y="8" width="22" height="22" rx="5"/><path class="s-ink" d="M19 23l4-4 3 3 2-2 4 4" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
});
const gameArt = (id) => `<svg class="us-gv2-art" viewBox="0 0 44 44" focusable="false">${GAME_ART[id] || ''}</svg>`;
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
    case 'waiting': return { line: `Aspetti ${partnerName()}`, cta: 'Apri' };
    case 'pending': return { line: row?.partner_complete ? `${partnerName()} ha già risposto` : `${partnerName()} ha iniziato`, cta: 'Rispondi', note };
    case 'in_progress': return { line: 'A metà', cta: 'Continua', note };
    // The day's one game is spent (Per voi or any other mode).
    case 'played': return { line: 'Per oggi avete giocato', cta: home?.per_voi?.session_id ? 'Rivedi' : 'Domani' };
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
    played: 'Per voi: per oggi avete giocato, il prossimo arriva domani',
  };
  button.setAttribute('aria-label', labels[state] || labels.idle);
  button.classList.remove('is-loading');
  button.removeAttribute('aria-busy');
}

// ---------------------------------------------------------------- daily rhythm

// D4 (28/10/2026): the server allows one new round per Europe/Rome day, of
// any mode, and refuses a second; the client only reads that state and never
// decides it. 'families' still names what was played this week.
const allowance = () => home?.allowance || null;
const freeLeft = () => { const a = allowance(); return a ? Math.max(0, a.free_limit - a.free_used) : 1; };
const playedThisWeek = (family) => allowance()?.families?.[family] || null;
const EXHAUSTED = 'Nuovi giochi domani.';

// ---------------------------------------------------------------- the week

// Round 3 parity: under the Sfida di oggi, the mockup's seven days of this
// week (Monday first, the Europe/Rome day the daily question uses), today in
// milk. A dot says who was there that day, only from what the app already
// has: a round you both completed that day (get_game_v2_home), and for today
// la domanda di oggi (the state Oggi loaded). Earlier days' daily answers are
// not loaded by the app, so they never show a dot of their own.
const WEEK_ZONE = 'Europe/Rome';
// Intl formatters are slow to build: one of each, kept (per language for the labels).
const weekFormats = new Map();
function weekFormat(key, locale, options) {
  const id = `${key}|${locale}`;
  if (!weekFormats.has(id)) weekFormats.set(id, new Intl.DateTimeFormat(locale, options));
  return weekFormats.get(id);
}
function zoneDay(at) {
  try { return weekFormat('zone', 'en-CA', { timeZone: WEEK_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
  catch (_) { return null; }
}
function weekDays() {
  const today = zoneDay(new Date());
  if (!today) return [];
  const base = new Date(`${today}T12:00:00Z`);
  const back = (base.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime());
    d.setUTCDate(base.getUTCDate() - back + i);
    return { iso: d.toISOString().slice(0, 10), today: i === back };
  });
}
function weekMarks(days) {
  const marks = {};
  const inWeek = new Set(days.map((d) => d.iso));
  for (const r of (home?.recent || []).concat(home?.open_rounds || [])) {
    if (!r?.completed_at) continue;
    const day = zoneDay(new Date(r.completed_at));
    if (inWeek.has(day)) marks[day] = 'noi';
  }
  const today = days.find((d) => d.today)?.iso;
  const q = window.todayQuestion;
  const st = window.todayState;
  if (today && q?.id && st && (!q.question_date || String(q.question_date) === today)) {
    if (st.both_answered) marks[today] = 'noi';
    else if (marks[today] !== 'noi') {
      if (st.my_answer != null) marks[today] = 'tu';
      else if (st.partner_has_answer) marks[today] = 'partner';
    }
  }
  return marks;
}
function weekDayLabel(d, mark) {
  const tag = globalThis.UsI18n?.tag || 'it-IT';
  const date = weekFormat('label', tag, { timeZone: 'UTC', weekday: 'long', day: 'numeric' }).format(new Date(`${d.iso}T12:00:00Z`));
  const who = mark === 'noi' ? 'tutti e due' : mark === 'tu' ? 'solo tu' : mark === 'partner' ? `solo ${partnerName()}` : '';
  return [date, d.today ? 'oggi' : '', who].filter(Boolean).join(' · ');
}
function weekMarkup() {
  const days = weekDays();
  if (!days.length) return '';
  const marks = weekMarks(days);
  const tag = globalThis.UsI18n?.tag || 'it-IT';
  return days.map((d) => {
    const mark = marks[d.iso] || '';
    const letter = weekFormat('letter', tag, { timeZone: 'UTC', weekday: 'narrow' }).format(new Date(`${d.iso}T12:00:00Z`));
    return `<div class="us-gv2-wd${d.today ? ' is-today' : ''}" role="listitem"${d.today ? ' aria-current="date"' : ''} aria-label="${esc(weekDayLabel(d, mark))}"><span aria-hidden="true" translate="no">${esc(letter)}</span><b aria-hidden="true" translate="no">${Number(d.iso.slice(8))}</b><span class="us-gv2-wd-pair" aria-hidden="true">${mark ? `<i data-who="${mark}"></i>` : ''}</span></div>`;
  }).join('');
}
let weekPainted = '';
function weekStrip() {
  weekPainted = weekMarkup();
  return weekPainted ? `<div class="us-gv2-week" id="usGv2Week" data-s role="list" aria-label="Questa settimana">${weekPainted}</div>` : '';
}
// Oggi calls this when la domanda di oggi changes (UsDailyQuestionHub.paint):
// only a real change touches the strip.
function paintWeek() {
  const el = byId('usGv2Week');
  if (!el) return;
  const next = weekMarkup();
  if (next === weekPainted) return;
  weekPainted = next;
  el.innerHTML = next;
}

// The round a tile stands for: the family's open round, or its finished
// round whose answers you have not opened yet.
function tileRound(family) {
  return (home?.open_rounds || []).find((r) => r.game_family === family)
    || (home?.recent || []).find((r) => r.game_family === family && r.reveal_ready && !r.my_reveal_seen_at)
    || null;
}
function modeStatus(f, open) {
  if (open) return { ...roundStatus(open), state: 'open', session: open.id };
  if (playedThisWeek(f.id)) return { text: 'Giocato', tone: 'seen', state: 'played' };
  if (allowance() && !freeLeft()) return { text: 'Domani', tone: 'locked', state: 'locked' };
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
  // The mockup's card: eyebrow, title, one line, then the action.
  const head = (name, title, line) => `<div class="us-gv2-weekly-head" data-gv2-weekly-icon="${esc(name)}"><div><span class="us-gv2-kicker">La vostra domanda</span><b>${esc(title)}</b>${line ? `<small>${esc(line)}</small>` : ''}</div></div>`;
  if (w.created_by_me) {
    const q = w.my_question;
    const settle = weeklyJustCreated === true ? ' is-just-created' : '';
    if (weeklyJustCreated === true) weeklyJustCreated = false;
    return `<section class="us-gv2-weekly is-locked${settle}" data-s aria-label="La domanda della settimana">
      ${head('lock-simple', 'Domanda creata', `Poi tocca a ${partnerName()}, ${unlock}.`)}
      ${q ? `<blockquote translate="no">${esc(q.question_text)}</blockquote><small class="us-gv2-note">${esc(partnerName())} la scoprirà giocando.</small>` : ''}
    </section>`;
  }
  if (w.partner_left_question) {
    return `<section class="us-gv2-weekly is-sealed" data-s aria-label="La domanda della settimana">
      ${head('feather', `${partnerName()} ha lasciato una domanda`, 'La troverete giocando.')}
    </section>`;
  }
  if (w.my_turn) {
    return `<section class="us-gv2-weekly is-open" data-s aria-label="La domanda della settimana">
      ${head('feather', 'Tocca a te', 'Una domanda scritta da voi, per questa settimana.')}
      <button type="button" class="primary us-gv2-weekly-cta" data-us-feedback="tap" data-gv2-action="weekly-create">Crea la domanda</button>
    </section>`;
  }
  return `<section class="us-gv2-weekly is-locked" data-s aria-label="La domanda della settimana">
    ${head('lock-simple', `Questa settimana crea ${label(w.assigned_role)}`, w.next_role === myRole() ? `Tocca a te da ${unlock}` : `Cambia ${unlock}`)}
  </section>`;
}

// V3 — rounds that need you are shown on their game's tile (as the mockup's
// tiles say "Aspetti Beatrice"); only a round no tile stands for (a retired
// family, a second round) keeps a row. Completed rounds stay one tap away at
// the end. Every row is a plain reading of the server's open_rounds / recent.
const continueRounds = (h) => (h?.open_rounds || []).concat((h?.recent || []).filter((r) => r.reveal_ready && !r.my_reveal_seen_at));
const doneRounds = (h) => (h?.recent || []).filter((r) => r.reveal_ready && r.my_reveal_seen_at);
const ROUND_ICON = (family) => (family === 'per_voi' ? PER_VOI.icon : family === 'swipe' ? SWIPE.icon : FAMILY[family]?.icon || 'sparkle');
const TONE_ORDER = { ready: 0, turn: 1, progress: 2, waiting: 3, seen: 4 };

function roundRow(r) {
  const status = roundStatus(r);
  const when = r.completed_at ? romeDate(String(r.completed_at).slice(0, 10), { day: 'numeric', month: 'long' }) : '';
  return `<button type="button" class="us-gv2-row" data-gv2-session="${esc(r.id)}" data-tone="${esc(status?.tone || '')}">${glyph(ROUND_ICON(r.game_family))}<span class="us-gv2-row-copy"><b>${esc(familyName(r.game_family))}</b>${when ? `<small>${esc(when)}</small>` : ''}</span>${status ? `<small class="us-gv2-row-state" data-tone="${esc(status.tone)}">${esc(status.text)}</small>` : ''}</button>`;
}
function continueSection(h, onTiles) {
  const rounds = continueRounds(h)
    .filter((r) => r.game_family !== 'per_voi' || r.id !== h?.per_voi?.session_id)
    .filter((r) => !onTiles.has(r.id))
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

// One status vocabulary for every game card, said where the mockup says it:
// in the card's line, instead of the kind of moment.
function cardState(status) {
  if (!status) return { state: 'ready', text: 'Disponibile' };
  if (status.state === 'open') return { state: 'open', text: status.text, tone: status.tone, session: status.session };
  if (status.state === 'played') return { state: 'played', text: 'Giocato questa settimana' };
  return { state: 'locked', text: 'Da domani' };
}
function gameCard({ id, name, kind, action, extraClass = '', status }) {
  const card = cardState(status);
  const locked = card.state === 'locked';
  const data = action === 'swipe' ? 'data-gv2-action="swipe"' : `data-gv2-family="${id}"`;
  const round = card.session ? ` data-gv2-session="${esc(card.session)}" data-tone="${esc(card.tone || '')}"` : '';
  const line = card.state === 'ready' ? kind : card.text;
  return `<button type="button" data-us-tile data-us-feedback="tap" class="us-gv2-game${extraClass}" ${data} data-gv2-mode-state="${esc(card.state)}"${round}${locked ? ' aria-disabled="true"' : ''} aria-label="${esc(name)}: ${esc(kind)}. ${esc(card.text)}">
      <span class="us-gv2-glyph" aria-hidden="true">${gameArt(id)}</span>
      <span class="us-gv2-game-copy"><b>${esc(name)}</b><small>${esc(line)}</small></span>
    </button>`;
}

// Round 3 parity — the mockup's Giochi, in its order: Sfida di oggi, the
// week, I vostri giochi (Per voi tall, then Questo o quello and the five
// families), then La vostra domanda. The weekly limit stays the server's: it
// is said in the confirm before a new round and on the tiles it locks.
function renderHub() {
 const root=byId('quizHub');if(!root)return;
 const pv=perVoiCopy(),pvState=home?.per_voi?.state||'idle';
 const onTiles=new Set();
 const tileStatus=(f)=>{const r=tileRound(f.id);if(r)onTiles.add(r.id);return modeStatus(f,r);};
 const swipe=gameCard({id:'swipe',name:SWIPE.name,kind:'8 carte · veloce e privato',action:'swipe',extraClass:' is-swipe',status:tileStatus(SWIPE)});
 const families=OFFERED.map(f=>gameCard({id:f.id,name:f.name,kind:f.kind,status:tileStatus(f)})).join('');
 root.innerHTML=`
  <h2 class="us-gv2-sr">Gioca</h2>
  <div class="us-gv2-daily-slot" data-gv4-daily-slot data-s aria-live="polite"><div class="us-gv4-daily-pending" role="status"><span class="us-gv4-daily-pending-title">Sfida di oggi</span><small>Preparo la domanda di oggi…</small></div></div>
  ${weekStrip()}
  <section class="us-gv2-choose" aria-labelledby="usGv2ChooseTitle">
   <div class="us-gv2-section-head" data-s><h3 class="us-gv2-section-title" id="usGv2ChooseTitle">I vostri giochi</h3><small>Bastano pochi minuti</small></div>
   <div class="us-gv2-game-grid" data-s>
    <button type="button" data-us-tile data-us-feedback="tap" class="us-gv2-pervoi us-attention-orbit" data-gv2-action="per-voi" data-gv2-state="${esc(pvState)}" data-us-attention="${pvState==='pending'||pvState==='reveal_ready'?'on':'off'}">
     <span class="us-gv2-glyph" aria-hidden="true" data-us-attention-icon>${gameArt('per_voi')}</span>
     <span class="us-gv2-pervoi-copy"><b>Per voi</b><small>${esc(pv.line)}</small>${pv.note?`<small class="us-gv2-pervoi-note">${esc(pv.note)}</small>`:''}</span>
     <span class="us-gv2-pervoi-cta">${esc(pv.cta)}</span>
    </button>
    ${swipe}${families}
   </div>
  </section>
  ${weeklyCard(home?.weekly)}
  ${continueSection(home,onTiles)}
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
// Parity with the approved mockup: a round is a Foglio over Gioca. The hub
// stays where it is under a scrim; the sheet rises (520 ms, soft spring),
// each step slides its content in from the side (340 ms) while the head
// keeps its place, and closing drops the sheet (280 ms). Reduced motion: no
// movement. Without a real DOM (tests) the panel is rebuilt as one string.
const EASE = Object.freeze({ out: 'cubic-bezier(.2,.8,.2,1)', soft: 'cubic-bezier(.22,1.15,.36,1)', in: 'cubic-bezier(.4,0,1,1)', spring: 'cubic-bezier(.34,1.56,.64,1)' });
const reduced = () => window.UsUiFoundation?.isReducedMotion?.() !== false;
const canAnimate = (el) => Boolean(el && typeof el.animate === 'function' && !reduced());
let closing = null;
const headMarkup = ({ kicker = '', count = '', title = '' } = {}) => `<div class="us-gv2-play-top us-gv2-sh-head"><div class="us-gv2-sh-copy"><span class="us-gv2-kicker">${esc(kicker)}${count ? `<span class="us-gv2-count"> · ${esc(count)}</span>` : ''}</span><h3 class="us-gv2-sh-title"${title ? '' : ' hidden'}>${title}</h3></div>${backButton()}</div>`;
function showPanel(html, head = {}, { dir = 1 } = {}) {
  const root = panel();
  if (!root) return null;
  const tone = head.tone || 'menta';
  const sheet = root.querySelector?.('.us-gv2-sheet');
  const flow = sheet?.querySelector?.('.us-gv2-flow');
  const open = !root.classList.contains('hidden') && flow && !closing;
  if (open) {
    const top = sheet.querySelector('.us-gv2-sh-head');
    if (top) top.outerHTML = headMarkup(head);
    sheet.dataset.gv2Tone = tone;
    sheet.setAttribute('aria-label', head.label || head.kicker || 'Gioca');
    flow.innerHTML = html;
    sheet.scrollTop = 0;
    if (canAnimate(flow)) flow.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 340, easing: EASE.out });
    return root;
  }
  if (closing) { closing.cancel?.(); closing = null; }
  root.classList.remove('hidden');
  root.innerHTML = `<div class="us-gv2-scrim" data-gv2-scrim aria-hidden="true"></div><section class="us-gv2-sheet" role="dialog" aria-modal="true" tabindex="-1" aria-label="${esc(head.label || head.kicker || 'Gioca')}" data-gv2-tone="${esc(tone)}"><span class="us-gv2-handle" aria-hidden="true"></span>${headMarkup(head)}<div class="us-gv2-flow">${html}</div></section>`;
  document.body?.classList?.add('us-gv2-sheet-open');
  const opened = root.querySelector?.('.us-gv2-sheet');
  if (canAnimate(opened)) {
    root.querySelector('.us-gv2-scrim')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    opened.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 520, easing: EASE.soft });
    // As the mockup's flow: the first step slides in too, while the sheet rises.
    opened.querySelector('.us-gv2-flow')?.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 340, easing: EASE.out });
  }
  setTimeout(() => {
    const target = root.querySelector?.('.us-gv2-flow textarea, .us-gv2-flow input:not([type="radio"])') || root.querySelector?.('.us-gv2-sheet');
    try { target?.focus?.({ preventScroll: true }); } catch (_) {}
  }, reduced() ? 0 : 300);
  return root;
}
function clearPanel() {
  const root = panel();
  root?.classList.add('hidden');
  if (root) root.innerHTML = '';
  document.body?.classList?.remove('us-gv2-sheet-open');
}
function closePanel() {
  const root = panel();
  const sheet = root?.querySelector?.('.us-gv2-sheet');
  if (!root || root.classList.contains('hidden')) return clearPanel();
  if (!canAnimate(sheet) || closing) { if (!closing) clearPanel(); return; }
  root.querySelector('.us-gv2-scrim')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
  const run = sheet.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 280, easing: EASE.in, fill: 'forwards' });
  closing = run;
  run.finished.then(() => { if (closing === run) { closing = null; clearPanel(); } }, () => {});
}
function showHub() {
  view = 'hub';
  current = null;
  index = 0;
  drafts.clear();
  closePanel();
  byId('quizHub')?.classList.remove('hidden');
  if (home) renderHub();
  load();
}
// Due colori: every round reads as a sheet — its eyebrow on the left, the
// close on the right (still the same "back to the hub" action).
const backButton = () => `<button type="button" class="us-gv2-back" data-gv2-action="back" aria-label="Torna a Gioca">${icon('x')}<span>Gioca</span></button>`;
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
    // The server keeps the old "weekly" error names for installed clients;
    // the budget they speak of is the day's one game.
    toast(/not enough content/.test(msg) ? 'Non ci sono ancora abbastanza domande per questo gioco.'
      : /weekly per voi played/.test(msg) ? 'Per oggi avete giocato. Domani un’altra partita.'
      : /weekly allowance exhausted/.test(msg) ? EXHAUSTED
      : /too many open rounds/.test(msg) ? 'Prima finite uno dei giochi in corso.'
      : 'Non riesco ad aprire la partita. Riprova.');
    if (/weekly|too many open rounds/.test(msg)) load();
  } finally { busy = false; }
}

// A mode tile: resume its open round; a mode already played this week asks
// once before spending today's game on it; nothing starts once the day's
// game is spent (history stays one tap away).
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

// 1.0 — a new round spends today's game for both of you: it is always
// confirmed first, with the real number the server says is left.
async function confirmSpend({ family, played, title, confirmLabel, again = '' }) {
  const a = allowance();
  if (!a) return true;
  const ask = window.UsUiFoundation?.confirm;
  if (typeof ask !== 'function') return true;
  const left = Math.max(1, a.limit - Math.min(a.used, a.limit));
  const name = familyName(family);
  const spend = left === 1 ? 'Userete il gioco di oggi.' : `Userete 1 dei ${left} giochi di oggi.`;
  return ask({
    kicker: played ? name.toUpperCase() : 'OGGI',
    title: played ? title : name,
    // Played already: the mockup's line, then what it costs today.
    body: played && again ? `${again} ${spend}` : spend,
    confirmLabel: played ? confirmLabel : 'Inizia',
    cancelLabel: 'Non ora',
    icon: played ? 'arrows-clockwise' : 'info',
  });
}

async function chooseSwipe() {
  if (busy) return;
  const open = tileRound('swipe');
  if (open) return openSession(open.id);
  const played = playedThisWeek('swipe');
  if (allowance() && !freeLeft()) {
    if (played?.completed) return openSession(played.session_id);
    return toast(EXHAUSTED);
  }
  const ok = await confirmSpend({ family: 'swipe', played, title: 'Avete già fatto Questo o quello questa settimana', confirmLabel: 'Altre 8', again: 'Volete altre otto carte?' });
  if (!ok) return;
  return startSwipe();
}

async function chooseMode(family) {
  if (busy) return;
  const open = tileRound(family);
  if (open) return openSession(open.id);
  const played = playedThisWeek(family);
  if (allowance() && !freeLeft()) {
    if (played?.completed) return openSession(played.session_id);
    return toast(EXHAUSTED);
  }
  const ok = await confirmSpend({ family, played, title: `Avete già giocato a ${familyName(family)} questa settimana`, confirmLabel: 'Gioca ancora', again: 'Potete fare un’altra partita, con domande nuove.' });
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

function renderSwipePlay({ dir = 1 } = {}) {
  const item = current?.items?.[index];
  if (!item || item.answer_kind !== 'choice' || (item.options || []).length !== 2) return;
  const total = current.items.length;
  const left = item.options[0];
  const right = item.options[1];
  const root = showPanel(`<article class="us-gv2-swipe-play">
    <div class="us-gv2-swipe-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index + 1}" aria-label="Carta ${index + 1} di ${total}">
      ${Array.from({ length: total }, (_, i) => `<i data-state="${i < index ? 'done' : i === index ? 'now' : 'next'}"></i>`).join('')}
    </div>
    <section class="us-gv2-swipe-stage" aria-label="Carta di ${esc(SWIPE.name)}">
      ${index < total - 1 ? `<div class="us-gv2-swipe-card is-back" aria-hidden="true"><h2>${esc(current.items[index + 1]?.question_text || '')}</h2></div>` : ''}
      <article class="us-gv2-swipe-card" id="usGv2SwipeCard" tabindex="0" aria-label="${esc(item.question_text)}. Freccia sinistra: ${esc(left)}. Freccia destra: ${esc(right)}.">
        <h2>${esc(item.question_text)}</h2>
        <span class="us-gv2-swipe-stamp is-left" aria-hidden="true">${esc(left)}</span>
        <span class="us-gv2-swipe-stamp is-right" aria-hidden="true">${esc(right)}</span>
      </article>
    </section>
    <div class="us-gv2-swipe-actions" role="group" aria-label="Scegli una risposta">
      <button type="button" class="ghost" data-gv2-swipe-choice="0" aria-label="${esc(left)}">${icon('caret-left')}<b>${esc(left)}</b></button>
      <button type="button" class="primary" data-gv2-swipe-choice="1" aria-label="${esc(right)}"><b>${esc(right)}</b>${icon('caret-right')}</button>
    </div>
    <p id="usGv2Error" class="us-gv2-error" role="alert" hidden></p>
    <p class="us-gv2-swipe-note">Trascina la carta o tocca una scelta</p>
  </article>`, { kicker: `${SWIPE.name} · scelta ${index + 1} di ${total}`, tone: 'ambra', label: SWIPE.name }, { dir });
  bindSwipeGesture(root);
}

// The mockup's card: it follows the finger and tilts (1° every 14 px), a
// stamp shows the side from 40 px, past 90 px it is a choice, otherwise it
// springs back.
function bindSwipeGesture(root) {
  const card = root?.querySelector('#usGv2SwipeCard');
  if (!card) return;
  let pointerId = null;
  let startX = 0;
  let deltaX = 0;

  const paint = (value) => {
    deltaX = value;
    card.dataset.swipeSide = deltaX < -40 ? 'left' : deltaX > 40 ? 'right' : 'none';
    card.style.transform = `translateX(${deltaX}px) rotate(${reduced() ? 0 : deltaX / 14}deg)`;
  };
  const reset = () => {
    deltaX = 0;
    card.dataset.swipeSide = 'none';
    card.style.transition = 'transform .4s var(--us-ease-spring, cubic-bezier(.34,1.56,.64,1))';
    card.style.transform = '';
  };
  const finish = () => {
    if (Math.abs(deltaX) > 90) {
      const choice = deltaX < 0 ? 0 : 1;
      commitSwipeChoice(choice, 'drag');
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
    card.style.transition = 'none';
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
    // As in the mockup the buttons keep their look while the card flies, and
    // only a dragged card shows its stamp.
    root?.querySelector('.us-gv2-swipe-play')?.classList.add('is-committing');
    if (card) {
      if (direction === 'drag') card.dataset.swipeSide = choice === 0 ? 'left' : 'right';
      card.classList.add('is-committing');
      if (canAnimate(card)) {
        const dx = choice === 0 ? -1 : 1;
        const from = card.style.transform || 'none';
        card.style.transition = 'none';
        await card.animate([{ transform: from }, { transform: `translateX(${dx * 140}%) rotate(${dx * 18}deg)`, opacity: 0 }], { duration: 300, easing: EASE.in, fill: 'forwards' }).finished.catch(() => {});
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
      renderSwipePlay({ dir: 0 });
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
    renderSwipePlay({ dir: 0 });
    showError('Non riesco a salvare questa scelta. Riprova.');
  } finally {
    busy = false;
    panel()?.querySelectorAll('[data-gv2-swipe-choice]').forEach((button) => { button.disabled = false; });
  }
}

function renderPlay({ dir = 1 } = {}) {
  if (current?.game_family === 'swipe') return renderSwipePlay({ dir });
  const item = current?.items?.[index];
  if (!item) return;
  const total = current.items.length;
  const value = answerValue(item);
  const kicker = familyName(current.game_family);
  const key = (i) => 'ABCDEFGH'[i] || String(i + 1);
  const hint = itemHint(item);
  const chosen = item.answer_kind !== 'open' && value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value));
  const input = item.answer_kind === 'open'
    ? `<label class="us-gv2-sr" for="usGv2Answer">La tua risposta</label><textarea id="usGv2Answer" maxlength="1000" rows="3" placeholder="Scrivi…">${esc(value ?? '')}</textarea>`
    : `<fieldset class="us-gv2-choices"><legend class="us-gv2-sr">${item.my_item_role === 'predictor' ? 'La tua previsione' : 'La tua scelta'}</legend>${(item.options || []).map((o, i) => `<label class="us-gv2-choice"><input type="radio" name="gv2choice" value="${i}" ${Number(value) === i && value !== null && value !== undefined ? 'checked' : ''}><i class="us-gv2-choice-key" aria-hidden="true">${key(i)}</i><span${asWritten(coupleWritten(item))}>${esc(o)}</span></label>`).join('')}</fieldset>`;
  const last = index === total - 1;
  showPanel(`<article class="us-gv2-play" data-gv2-family="${esc(item.family || current.game_family)}">
    <div class="us-gv2-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index + 1}" aria-label="Domanda ${index + 1} di ${total}">${Array.from({ length: total }, (_, i) => `<i data-on="${i <= index ? 'true' : 'false'}"></i>`).join('')}</div>
    ${contextChip(item)}${authorChip(item)}
    ${hint ? `<p class="us-gv2-hint">${esc(hint)}</p>` : ''}
    <h2 class="us-gv2-question"${asWritten(coupleWritten(item))}>${esc(item.my_prompt || item.question_text)}</h2>
    <form id="usGv2AnswerForm" novalidate>${input}
      <p id="usGv2Error" class="us-gv2-error" role="alert" hidden></p>
      ${last ? '<p class="us-gv2-note">Dopo la conferma le risposte non si cambiano più.</p>' : ''}
      <div class="us-gv2-actions"><button type="button" class="ghost" data-gv2-action="prev"${index > 0 ? '' : ' disabled'}>Indietro</button><button type="submit" class="primary"${item.answer_kind === 'open' || chosen ? '' : ' disabled'}>${last ? 'Conferma le risposte' : 'Avanti'}</button></div>
    </form>
  </article>`, { kicker, count: `${index + 1} di ${total}`, label: familyName(current.game_family) }, { dir });
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

// The mockup's waiting step: the two circles still apart, who we wait for,
// then the two buttons. Your own sealed answers stay readable below them.
const waitingName = () => knownPartner() || 'la tua persona';
function waitArt(line) {
  return `<div class="us-gv2-wait">${VENN}<b>Aspettiamo ${esc(waitingName())}…</b><small>${esc(line)}</small></div>`;
}
const waitActions = () => `<div class="us-gv2-actions"><button type="button" class="ghost" data-gv2-action="back">Torna a Gioca</button><button type="button" class="primary" data-gv2-action="refresh">${icon('arrows-clockwise')}<span>Aggiorna</span></button></div>`;
// Your own sealed answers stay one tap away, folded under the mockup's buttons.
const mineFold = (list) => `<details class="us-gv2-mine-fold"><summary><span>Le tue risposte</span><b>${current.items.length}</b></summary>${list}</details>`;
function renderSwipeWaiting({ dir = 1 } = {}) {
  showPanel(`<article class="us-gv2-waiting us-gv2-swipe-waiting">
    ${waitArt('Vedrete insieme dove la pensate allo stesso modo.')}
    ${waitActions()}
    ${mineFold(`<ol class="us-gv2-swipe-mine">${current.items.map((item, i) => `<li><span>${i + 1}</span><small>${esc(item.question_text)}</small><b>${esc(myAnswerText(item))}</b></li>`).join('')}</ol>`)}
  </article>`, { kicker: SWIPE.name, title: 'Le tue 8 scelte sono dentro.', tone: 'ambra', label: SWIPE.name }, { dir });
}

function renderWaiting({ dir = 1 } = {}) {
  if (current?.game_family === 'swipe') return renderSwipeWaiting({ dir });
  showPanel(`<article class="us-gv2-waiting">
    ${waitArt('Le risposte si scoprono quando avete risposto voi due.')}
    ${waitActions()}
    ${mineFold(`<ol class="us-gv2-mine">${current.items.map((i) => `<li><small${asWritten(coupleWritten(i))}>${esc(i.my_prompt || i.question_text)}</small><b${asWritten(i.answer_kind === 'open' || coupleWritten(i))}>${esc(myAnswerText(i))}</b></li>`).join('')}</ol>`)}
  </article>`, { kicker: familyName(current.game_family), title: 'Hai risposto.', label: familyName(current.game_family) }, { dir });
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
// question to unfold first. Parity: the mockup's list, in question order,
// each question tagged Uguali / Diverse / Da leggere.
const REVEAL_TAG = Object.freeze({ same: 'Uguali', different: 'Diverse', open: 'Da leggere' });
function revealCompactItem(item,number,kind){
  const heading=esc(item.my_prompt||item.question_text||'Una domanda');
  const detailLabel=kind==='same'?'Scelte uguali':kind==='different'?'Scelte diverse':'Le risposte';
  return `<li class="us-gv5-reveal-item" data-gv5-kind="${kind}" data-gv5-group="${kind}">
    <span class="us-gv5-reveal-tag" data-gv5-tag="${kind}">${REVEAL_TAG[kind]}</span>
    <p class="us-gv5-reveal-title"${asWritten(coupleWritten(item))}><span class="us-gv2-sr">${number}. </span>${heading}</p>
    <div class="us-gv5-reveal-answers" aria-label="${detailLabel}" data-gv2-mechanic="${esc(item.mechanic||'')}">${contextChip(item)}${authorChip(item)}<dl>${revealAnswerRows(item)}</dl>
      ${item.mechanic==='prediction'?'<small class="us-gv5-outcome">'+esc(outcome(item))+'</small>':''}
      ${previousAnswers(item)}
    </div>
  </li>`;
}
// Questo o quello: eight short rows, "Tutti e due" when you chose the same.
function revealSwipeItem(item,number,kind){
  const mine=myAnswerText(item),theirs=partnerAnswerText(item);
  const line=kind==='same'?`Tutti e due: ${esc(mine)}`:`Tu: ${esc(mine)} · <span translate="no">${esc(partnerName())}</span>: ${esc(theirs)}`;
  return `<li class="us-gv5-reveal-item us-gv5-swipe-row" data-gv5-kind="${kind}" data-gv5-group="${kind}"><span class="us-gv5-reveal-title"><span class="us-gv2-sr">${number}. </span>${esc(item.question_text||'Una carta')}</span><small>${line}</small></li>`;
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
function revealHead(groups){
  const compared=groups.same.length+groups.different.length;
  return compared?`${groups.same.length} su ${compared} <em>uguali</em>`:'Da leggere insieme';
}
function renderCompactReveal({first=false,swipe=false}={}){
  const groups={same:[],different:[],open:[]};
  const ordered=[];
  for(const [i,item] of current.items.entries()){const kind=revealKind(item);groups[kind].push({item,number:i+1});ordered.push({item,number:i+1,kind});}
  const reading=readingLine(current.items);
  const row=swipe?revealSwipeItem:revealCompactItem;
  const root=showPanel(`<article class="us-gv2-reveal us-gv5-reveal${swipe?' is-swipe':''}${first?' is-first-reveal':''}" data-gv5-reveal>
    <div class="us-gv5-reveal-groups">
      ${swipe?'':'<p class="us-gv5-reveal-label">Cosa avevate risposto</p>'}
      <ol class="us-gv5-reveal-list">${ordered.map(({item,number,kind})=>row(item,number,kind)).join('')}</ol>
    </div>
    ${reading?`<p class="us-gv5-reading">${esc(reading)}</p>`:''}
    ${revealMove(groups)}
    <div class="us-gv2-actions is-single"><button type="button" class="primary" data-gv2-action="back">Torna a Gioca</button></div>
  </article>`,{kicker:'LE VOSTRE SCELTE',title:revealHead(groups),label:familyName(current.game_family),tone:swipe?'ambra':'menta'});
  // The mockup's reveal: each answer rises in turn (first reveal only).
  if(first&&root)Array.from(root.querySelectorAll?.('.us-gv5-reveal-item')||[]).forEach((el,j)=>{
    if(canAnimate(el))el.animate([{opacity:0,transform:`translateY(${swipe?12:16}px)`},{opacity:1,transform:'none'}],swipe?{duration:360,delay:j*60,easing:EASE.out,fill:'backwards'}:{duration:420,delay:120+j*90,easing:EASE.out,fill:'backwards'});
  });
}
function renderSwipeReveal({first=false}={}){return renderCompactReveal({first,swipe:true});}
function renderReveal({first=false}={}){return current?.game_family==='swipe'?renderSwipeReveal({first}):renderCompactReveal({first});}

const WEEKLY_MORPH_MS = 480;
const WEEKLY_FAMILIES = Object.freeze(['scopritevi']);

// ---------------------------------------------------------------- weekly form

function renderWeeklyForm(error = '') {
  const w = home?.weekly;
  view = 'weekly';
  const root = showPanel(`<article class="us-gv2-weekly-form">
    <p class="us-gv2-lead">${esc(knownPartner() || 'La tua persona')} la troverà in Gioca: risponderete tutti e due.</p>
    <form id="usGv2WeeklyForm" novalidate>
      <label class="us-gv2-sr" for="usGv2WeeklyText">La domanda</label>
      <textarea id="usGv2WeeklyText" name="question_text" maxlength="300" rows="3" required placeholder="Che cosa vuoi chiedere?"></textarea>
      <fieldset class="us-gv2-segment"><legend>Come si risponde?</legend>
        <label><input type="radio" name="answer_kind" value="open" checked><span>Risposta libera</span></label>
        <label><input type="radio" name="answer_kind" value="choice"><span>Scelta</span></label>
      </fieldset>
      <div id="usGv2WeeklyOptions" class="us-gv2-options" hidden>
        ${[0, 1, 2, 3].map((i) => `<label class="us-gv2-sr" for="usGv2Option${i}">Scelta ${i + 1}</label><input id="usGv2Option${i}" name="option_${i}" maxlength="120" placeholder="Scelta ${i + 1}${i > 1 ? ' · facoltativa' : ''}">`).join('')}
      </div>
      <p id="usGv2Error" class="us-gv2-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
      <button type="submit" class="primary us-gv2-submit">Salva la domanda</button>
    </form>
  </article>`, { kicker: 'LA VOSTRA DOMANDA', title: 'Crea la domanda', label: 'Crea la domanda' });
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
  // A tap on the scrim closes the round, as the mockup's sheet.
  if (event.target?.hasAttribute?.('data-gv2-scrim')) { showHub(); return; }
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
  else if (action === 'prev') { const item = current.items[index]; drafts.set(item.id, readInput(item)); index = Math.max(0, index - 1); renderPlay({ dir: -1 }); }
  else if (action === 'refresh') {
    // The mockup's button says it is working while the round is read again.
    const text = button.querySelector?.('span:last-child');
    const before = text?.textContent;
    button.disabled = true;
    if (text) text.textContent = 'Aggiorno…';
    Promise.resolve(refresh()).catch(() => {}).finally(() => { if (button.isConnected) { button.disabled = false; if (text) text.textContent = before; } });
  }
  else if (action === 'retry') load();
  else if (button.dataset.gv2Family) chooseMode(button.dataset.gv2Family);
  else if (button.dataset.gv2Session) openSession(button.dataset.gv2Session);
}

function onSubmit(event) {
  if (event.target.id === 'usGv2AnswerForm') { event.preventDefault(); submitAnswer(); }
  else if (event.target.id === 'usGv2WeeklyForm') { event.preventDefault(); submitWeekly(event.target); }
}

// Giochi / Sintonia, as the mockup's setG: the pill springs across (CSS),
// the panel arrives from its side (24px, 380ms) and Sintonia's blocks rise
// one after the other (16px, 460ms, 50ms apart). noi-v2.js owns the switch;
// this only watches its data-active and draws the motion.
function bindTabMotion() {
  const tabs = byId('usGiocaTabs');
  if (!tabs || tabs.dataset.gv2Motion || typeof MutationObserver !== 'function') return;
  tabs.dataset.gv2Motion = '1';
  let last = tabs.getAttribute('data-active');
  new MutationObserver(() => {
    const now = tabs.getAttribute('data-active');
    if (!now || now === last) return;
    const had = last;
    last = now;
    if (!had) return;
    const show = byId(now === 'sintonia' ? 'usGiocaSintonia' : 'usGiocaGames');
    if (!canAnimate(show)) return;
    show.animate([{ opacity: 0, transform: `translateX(${now === 'sintonia' ? 24 : -24}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE.out });
    if (now !== 'sintonia') return;
    // Only the [hidden] attribute decides (no layout read here: this runs in
    // the tap, right after the panel swap, and a read would force a layout).
    Array.from(show.children).filter((el) => !el.hidden).forEach((el, i) => {
      el.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 460, delay: i * 50, easing: EASE.out, fill: 'backwards' });
    });
  }).observe(tabs, { attributes: true, attributeFilter: ['data-active'] });
}

function boot() {
  bindTabMotion();
  const hub = byId('quizHub');
  const root = panel();
  if (!hub || !root) return;
  if (!hub.dataset.gv2Bound) {
    hub.dataset.gv2Bound = '1';
    hub.addEventListener('click', onClick);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    // A choice enables "Avanti", as in the mockup.
    root.addEventListener('change', (event) => {
      if (event.target?.name !== 'gv2choice') return;
      const submit = root.querySelector('#usGv2AnswerForm button[type="submit"]');
      if (submit && !busy) submit.disabled = false;
      window.UsFeedback?.selection?.();
    });
  }
  if (window.usProfile) load(); else setTimeout(boot, 250);
}

window.USGameV2 = {
  load, refresh, showHub, openPerVoi, startRound, startSwipe, openSession, chooseMode, chooseSwipe, paintWeek,
  isOpen: () => view !== 'hub',
  close: showHub,
};
window.addEventListener('us-identity-change', (event) => {
  if (!event.detail?.identityKey) {
    identityEpoch++;loadSeq++;current=null;home=null;drafts.clear();view='hub';
    startRequestIds.clear();weeklyRequestId=null;
    clearPanel();
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
    if(label)label.textContent=`${knownPartner() || 'La tua persona'} la troverà in Gioca: risponderete tutti e due.`;
  }
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
// On Gioca, app.js refreshes the visible page itself on return; elsewhere the
// Gioca badge can wait until the page on screen has refreshed.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !window.usProfile || byId('quiz')?.classList.contains('active')) return;
  (window.usAfterForeground || ((task) => task()))(() => refresh(), 1400);
});
setInterval(() => { if (!document.hidden && window.usProfile) refresh(); }, 45000);
})();
