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
  { id: 'scopritevi', name: 'Scopritevi', icon: 'binoculars', kind: 'Quanto vi conoscete', genre: 'conoscervi' },
  { id: 'confrontatevi', name: 'Confrontatevi', icon: 'arrows-left-right', kind: 'Due punti di vista', genre: 'parlarvi' },
  { id: 'ridete', name: 'Ridete', icon: 'smiley', kind: 'Leggero e un po’ assurdo', genre: 'ridere' },
  { id: 'quanto_mi_conosci', name: 'Quanto mi conosci?', icon: 'question', kind: 'Chi conosce meglio chi', genre: 'conoscervi' },
  { id: 'rivivete', name: 'Rivivete', icon: 'images', kind: 'I vostri momenti', genre: 'ricordare' },
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
const partnerName = () => window.UsIdentity?.current().partnerName || 'La tua persona';
const familyName = (id) => (id === 'per_voi' ? PER_VOI.name : id === 'swipe' ? SWIPE.name : FAMILY[id]?.name || 'Gioca');
const icon = (name) => `<span class="us-gv2-icon" data-gv2-icon="${esc(name)}" aria-hidden="true"></span>`;
// Stile unico (founder, 24/11/2026, tavola «Una mano sola»): each game's mark
// is the two of you playing it, drawn with the characters' hand (thin outline
// in the dark of each colour, the same eyes) and only your two colours plus the
// paper: f-tu/s-tu yours, f-pa/s-pa the other one's (dc-gioca.css).
const GAME_ART = Object.freeze({
  per_voi: '<path class="f-tu s-tu" d="M24 4.5c1.6-2.4 5.4-1.2 5.4 1.7 0 2.6-3.4 4.6-5.4 5.8-2-1.2-5.4-3.2-5.4-5.8 0-2.9 3.8-4.1 5.4-1.7Z" stroke-width="1.6" stroke-linejoin="round"/><circle class="f-tu s-tu" cx="15" cy="30" r="12" stroke-width="2.2"/><rect class="f-pa s-pa" x="24" y="18" width="21" height="24" rx="8" stroke-width="2.2"/><circle class="f-ink" cx="11.5" cy="30" r="1.8"/><circle class="f-ink" cx="18" cy="30" r="1.8"/><circle class="f-ink" cx="31" cy="30" r="1.8"/><circle class="f-ink" cx="38" cy="30" r="1.8"/>',
  swipe: '<rect class="f-tu s-tu" x="6" y="9" width="20" height="28" rx="6" stroke-width="2.2" transform="rotate(-10 16 23)"/><rect class="f-pa s-pa" x="22" y="11" width="20" height="28" rx="6" stroke-width="2.2" transform="rotate(10 32 25)"/><circle class="f-ink" cx="13.5" cy="22" r="1.7"/><circle class="f-ink" cx="19" cy="21" r="1.7"/><circle class="f-ink" cx="29.5" cy="23.5" r="1.7"/><circle class="f-ink" cx="35" cy="24.5" r="1.7"/>',
  scopritevi: '<path class="s-pa" d="M31 31 L42 42" fill="none" stroke-width="5.5" stroke-linecap="round"/><circle class="f-pa s-pa" cx="21" cy="21" r="14" stroke-width="2.2"/><circle class="f-carta s-pa" cx="21" cy="21" r="9.5" stroke-width="1.6"/><circle class="f-ink" cx="17.5" cy="21" r="2"/><circle class="f-ink" cx="24.5" cy="21" r="2"/>',
  confrontatevi: '<path class="f-tu s-tu" d="M12 5h16a7 7 0 0 1 7 7v6a7 7 0 0 1-7 7h-9l-6 5v-5.3A7 7 0 0 1 5 18v-6a7 7 0 0 1 7-7Z" stroke-width="2.2" stroke-linejoin="round"/><path class="f-pa s-pa" d="M36 21h-14a7 7 0 0 0-7 7v5a7 7 0 0 0 7 7h8l6 5v-5.3A7 7 0 0 0 43 33v-5a7 7 0 0 0-7-7Z" stroke-width="2.2" stroke-linejoin="round"/><circle class="f-ink" cx="25" cy="30.5" r="1.7"/><circle class="f-ink" cx="33" cy="30.5" r="1.7"/>',
  ridete: '<circle class="f-tu s-tu" cx="24" cy="25" r="17" stroke-width="2.2"/><path class="s-ink" d="M14 21q3.5-4 7 0M27 21q3.5-4 7 0" fill="none" stroke-width="2.2" stroke-linecap="round"/><path class="f-bocca s-ink" d="M16 27h16a8 8 0 0 1-16 0Z" stroke-width="2" stroke-linejoin="round"/>',
  quanto_mi_conosci: '<rect class="f-pa s-pa" x="5" y="14" width="30" height="30" rx="10" stroke-width="2.2"/><circle class="f-ink" cx="15" cy="29" r="2"/><circle class="f-ink" cx="25" cy="29" r="2"/><circle class="f-tu s-tu" cx="37" cy="12" r="9.5" stroke-width="2.2"/><path class="s-ink" d="M34.3 10.3a2.8 2.8 0 1 1 3.9 2.6c-.7.3-1.1.8-1.1 1.6" fill="none" stroke-width="2" stroke-linecap="round"/><circle class="f-ink" cx="37.1" cy="17.2" r="1.2"/>',
  rivivete: '<g transform="rotate(-6 24 26)"><rect class="f-carta s-carta" x="8" y="7" width="32" height="37" rx="3" stroke-width="2"/><rect class="f-pa" x="12" y="11" width="24" height="22" rx="1.5"/><circle class="f-tu s-tu" cx="19" cy="27" r="6" stroke-width="1.6"/><circle class="f-ink" cx="17.2" cy="27" r="1.1"/><circle class="f-ink" cx="20.8" cy="27" r="1.1"/></g><rect class="f-tu" x="17" y="2.5" width="14" height="6" opacity=".85" transform="rotate(-9 24 5)"/>',
});
const gameArt = (id) => `<svg class="us-gv2-art" viewBox="0 0 48 48" focusable="false">${GAME_ART[id] || ''}</svg>`;
const uuid = () => window.crypto.randomUUID();
const romeDayOf = (at) => { try { const t = new Date(at); return Number.isFinite(t.getTime()) ? t.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) : ''; } catch (_) { return ''; } };
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
  if (row.my_complete) return { text: `Aspetti ${waitingName()}`, tone: 'waiting' };
  if (row.partner_complete) return { text: 'Tocca a te', tone: 'turn' };
  if (row.my_answered_count > 0) return { text: `${row.my_answered_count} di ${row.item_count}`, tone: 'progress' };
  if (row.started_by_role && row.started_by_role !== myRole()) return { text: 'Tocca a te', tone: 'turn' };
  return { text: 'Da giocare', tone: 'progress' };
}

// The partner's real name when US has it ('' while it is unknown), so a
// sentence can fall back to "la tua persona" instead of a capitalised label.
const knownPartner = () => { const name = partnerName(); return name === 'La tua persona' ? '' : name; };
const ofPartner = () => (knownPartner() ? `di ${knownPartner()}` : 'della tua persona');
// Inside a sentence the fallback is lowercase: «Aspetti la tua persona».
const midName = (name) => (name === 'La tua persona' ? 'la tua persona' : name);

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
    case 'waiting': return { line: `Aspetti ${waitingName()}`, cta: 'Apri' };
    case 'pending': return { line: row?.partner_complete ? `${partnerName()} ha già risposto` : `${partnerName()} ha iniziato`, cta: 'Rispondi', note };
    case 'in_progress': return { line: 'A metà', cta: 'Continua', note };
    // The day's games are spent (Per voi or any other mode).
    case 'played': return { line: 'Per oggi avete giocato', cta: home?.per_voi?.session_id ? 'Rivedi' : 'Domani' };
    default: return { line: '5 domande scelte per voi', cta: 'Inizia', note };
  }
}

// ---------------------------------------------------------------- daily rhythm

// The server counts the new rounds of each Europe/Rome day (any mode; three
// since 1.5, the allowance's free_limit) and refuses one more; the client only
// reads that state and never decides it. 'families' still names what was
// played this week.
const allowance = () => home?.allowance || null;
const freeLeft = () => { const a = allowance(); return a ? Math.max(0, a.free_limit - a.free_used) : 1; };
const playedThisWeek = (family) => allowance()?.families?.[family] || null;
const EXHAUSTED = 'Nuove partite domani.';
// Redesign definitivo, fase 6 (D11, founder 23/11/2026): the day's rounds are
// three big tokens at the top of Gioca, lit while they are still there. At
// zero the card says when they come back (00:00 Europe/Rome on the server's
// resets_on) and only there the US Plus row («In arrivo», «Avvisami»: nothing
// to buy yet). The server still decides; the tokens only read its allowance.
const DAY_ZONE = 'Europe/Rome';
let zoneParts = null;
// The epoch of 00:00 in Europe/Rome on an ISO date (two passes cover the
// summer-time change).
function romeMidnight(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return NaN;
  const want = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  try {
    zoneParts ||= new Intl.DateTimeFormat('en-GB', { timeZone: DAY_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    let at = want;
    for (let i = 0; i < 2; i += 1) {
      const p = Object.fromEntries(zoneParts.formatToParts(at).map((x) => [x.type, x.value]));
      at += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    }
    return at;
  } catch (_) { return want; }
}
// «tra 6 ore e 12 minuti», «tra 1 ora», «tra 40 minuti».
function resetLine(iso, now = Date.now()) {
  const at = romeMidnight(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.ceil((at - now) / 60000);
  if (minutes <= 1) return 'tra poco';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const hours = h === 1 ? '1 ora' : `${h} ore`, mins = m === 1 ? '1 minuto' : `${m} minuti`;
  return `tra ${h && m ? `${hours} e ${mins}` : h ? hours : mins}`;
}
const TOKEN_HEART = icon('heart-straight-fill');
function tokensCard() {
  const a = allowance();
  if (!a) return '';
  const limit = Math.max(1, Number(a.free_limit) || 1);
  const left = Math.min(limit, freeLeft());
  const tokens = Array.from({ length: limit }, (_, i) => (i < left ? `<span class="us-gv2-token is-on" data-gv2-token>${TOKEN_HEART}</span>` : '<span class="us-gv2-token"></span>')).join('');
  const aria = left ? `${left} ${left === 1 ? 'gettone' : 'gettoni'} su ${limit}` : 'Nessun gettone rimasto';
  const title = left ? `Ancora ${left} su ${limit} oggi` : (limit === 1 ? 'Domani un’altra partita' : `Domani altre ${limit}`);
  const line = left ? 'Ogni partita nuova usa un gettone' : resetLine(a.resets_on);
  const plus = !left && window.UsPlusSoon?.open ? '<div class="us-gv2-tokens-plus"><span class="us-gv2-tokens-copy"><b>Partite illimitate con US Plus</b><small>In arrivo</small></span><button type="button" data-us-feedback="tap" data-gv2-action="plus-soon">Avvisami</button></div>' : '';
  return `<section class="us-gv2-tokens" id="usGv2Tokens" data-gv2-left="${left}" data-s aria-label="Le partite di oggi">
    <div class="us-gv2-tokens-row"><span class="us-gv2-token-row" role="img" aria-label="${esc(aria)}">${tokens}</span><span class="us-gv2-tokens-copy" role="status"><b>${esc(title)}</b>${line ? `<small>${esc(line)}</small>` : ''}</span></div>${plus}
  </section>`;
}
// A new round: the last lit token flies into the game (D11), in place of the
// old confirm window before each new round. Motion only: the server spends it,
// and the next read of the hub paints the real number again.
function flyToken(target) {
  const tokens = document.querySelectorAll?.('#usGv2Tokens [data-gv2-token]');
  const token = tokens && tokens[tokens.length - 1];
  if (!token) return;
  token.classList.remove('is-on');
  token.removeAttribute('data-gv2-token');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduce || typeof token.animate !== 'function' || !target?.getBoundingClientRect) return;
  const from = token.getBoundingClientRect(), to = target.getBoundingClientRect();
  const ghost = document.createElement('span');
  ghost.className = 'us-gv2-token is-on is-flying';
  ghost.innerHTML = TOKEN_HEART;
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  document.body.appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const run = ghost.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 56}px) scale(1.15)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px,${dy}px) scale(.4)`, opacity: 0 },
  ], { duration: 640, easing: 'cubic-bezier(.3,.7,.2,1)' });
  run.onfinish = run.oncancel = () => ghost.remove();
}
// The token row painted again from the allowance this phone knows: after a
// spent token, or to light again one that flew for a round the server resumed
// or refused.
function paintTokens() {
  const card = byId('usGv2Tokens');
  if (!card || typeof card.outerHTML !== 'string') return;
  const html = tokensCard();
  if (html) card.outerHTML = html;
}
// The server answered a start (25/11/2026: the token flew but the count stayed
// at 3 until the next read of the hub, and came back lit on closing the round).
// Only a round the server really opened (resumed === false) spends one: the
// count drops now, the hub is read again behind the sheet, and the next read
// is still the authority.
function settleToken(state) {
  const a = allowance();
  if (a && state?.resumed === false) {
    const used = (Number(a.free_used) || 0) + 1;
    const limit = Number(a.free_limit) || 1;
    Object.assign(a, { free_used: used, used, per_voi_used: used, free_available: used < limit, per_voi_available: used < limit, open_count: (Number(a.open_count) || 0) + 1 });
    if (state.game_family) a.families = { ...(a.families || {}), [state.game_family]: { session_id: state.id, completed: false } };
  }
  paintTokens();
}
// A token flies at the tap only when the server can open a round: one left
// and room for another open round.
const canSpend = () => { const a = allowance(); return !a || (freeLeft() > 0 && (Number(a.open_count) || 0) < (Number(a.open_limit) || 3)); };

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
      ${head('lock-simple', 'Domanda creata', `Poi tocca a ${waitingName()}, ${unlock}.`)}
      ${q ? `<blockquote translate="no">${esc(q.question_text)}</blockquote><small class="us-gv2-note">${esc(partnerName())} la scoprirà giocando.</small>` : ''}
    </section>`;
  }
  if (w.partner_left_question) {
    return `<section class="us-gv2-weekly is-sealed" data-s aria-label="La domanda della settimana">
      ${head('feather', `${partnerName()} ha lasciato una domanda`, 'La troverai giocando.')}
    </section>`;
  }
  if (w.my_turn) {
    return `<section class="us-gv2-weekly is-open" data-s aria-label="La domanda della settimana">
      ${head('feather', 'Tocca a te', 'Scrivi tu la domanda di questa settimana.')}
      <button type="button" class="primary us-gv2-weekly-cta" data-us-feedback="tap" data-gv2-action="weekly-create">Crea la domanda</button>
    </section>`;
  }
  return `<section class="us-gv2-weekly is-locked" data-s aria-label="La domanda della settimana">
    ${head('lock-simple', `Questa settimana tocca a ${midName(label(w.assigned_role))}`, w.next_role === myRole() ? `Tocca a te da ${unlock}` : `Si cambia ${unlock}`)}
  </section>`;
}

// Rounds that need you. D11: the ones where the other one is waiting (it is
// your turn, or your answers are ready) are «Vi aspetta», at the top; every
// round still shows on its game's tile; only a round no tile stands for and
// that is not waiting for you (a retired family, a second round) keeps a row
// in «Da continuare». Completed rounds stay one tap away at the end. Every
// row is a plain reading of the server's open_rounds / recent.
const continueRounds = (h) => (h?.open_rounds || []).concat((h?.recent || []).filter((r) => r.reveal_ready && !r.my_reveal_seen_at));
const doneRounds = (h) => (h?.recent || []).filter((r) => r.reveal_ready && r.my_reveal_seen_at);
const ROUND_ICON = (family) => (family === 'per_voi' ? PER_VOI.icon : family === 'swipe' ? SWIPE.icon : FAMILY[family]?.icon || 'sparkle');
const TONE_ORDER = { ready: 0, turn: 1, progress: 2, waiting: 3, seen: 4 };
const byTone = (a, b) => (TONE_ORDER[roundStatus(a)?.tone] ?? 9) - (TONE_ORDER[roundStatus(b)?.tone] ?? 9);
const waitsForMe = (r) => ['turn', 'ready'].includes(roundStatus(r)?.tone);

function roundRow(r) {
  const status = roundStatus(r);
  // The day it ended in Rome, not in UTC (a round finished at 00:30 is that day).
  const when = r.completed_at ? romeDate(romeDayOf(r.completed_at), { day: 'numeric', month: 'long' }) : '';
  return `<button type="button" class="us-gv2-row" data-gv2-session="${esc(r.id)}" data-tone="${esc(status?.tone || '')}">${glyph(ROUND_ICON(r.game_family))}<span class="us-gv2-row-copy"><b>${esc(familyName(r.game_family))}</b>${when ? `<small>${esc(when)}</small>` : ''}</span>${status ? `<small class="us-gv2-row-state" data-tone="${esc(status.tone)}">${esc(status.text)}</small>` : ''}</button>`;
}
// «Vi aspetta»: the other one's character, the game, what happened, one action.
function waitingRow(r) {
  const ready = roundStatus(r)?.tone === 'ready';
  const who = knownPartner() || 'L’altra persona';
  const line = ready ? 'Le vostre risposte sono pronte' : r.partner_complete ? `${who} ha giocato, tocca a te` : `${who} ha iniziato, tocca a te`;
  const partnerRole = home?.partner_role || (myRole() === 'beatrice' ? 'francesco' : 'beatrice');
  let face = '';
  try { face = window.UsPersonaggi?.character?.(partnerRole, { size: 46 }) || ''; } catch (_) { face = ''; }
  return `<button type="button" class="us-gv2-aspetta" data-us-feedback="tap" data-gv2-session="${esc(r.id)}" data-tone="${ready ? 'ready' : 'turn'}">
      <span class="us-gv2-aspetta-face" aria-hidden="true">${face || glyph(ROUND_ICON(r.game_family))}</span>
      <span class="us-gv2-aspetta-copy"><b>${esc(familyName(r.game_family))}</b><small>${esc(line)}</small></span>
      <span class="us-gv2-aspetta-cta" aria-hidden="true">${ready ? 'Scopri' : 'Gioca'}</span>
    </button>`;
}
function waitingSection(h) {
  const rounds = continueRounds(h).filter(waitsForMe).sort(byTone);
  if (!rounds.length) return '';
  return `<section class="us-gv2-vi-aspetta" data-s aria-labelledby="usGv2WaitingTitle">
    <h3 class="us-gv2-section-title" id="usGv2WaitingTitle">Vi aspetta</h3>
    <div class="us-gv2-vi-aspetta-rows">${rounds.map(waitingRow).join('')}</div>
  </section>`;
}
function continueSection(h, onTiles) {
  const rounds = continueRounds(h)
    .filter((r) => r.game_family !== 'per_voi' || r.id !== h?.per_voi?.session_id)
    .filter((r) => !onTiles.has(r.id) && !waitsForMe(r))
    .sort(byTone);
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

// D11: every tile says one of three things on its chip — Pronto, Giocato,
// Domani — and its line says the rest (the kind of moment, how far you are,
// whom you are waiting for). The full state stays in the label.
const CHIP_CHECK = icon('check-bold');
function cardState(status) {
  if (!status) return { state: 'ready', chip: 'ready', text: 'Disponibile' };
  if (status.state === 'open') return { state: 'open', chip: status.tone === 'waiting' || status.tone === 'seen' ? 'played' : 'ready', text: status.text, tone: status.tone, session: status.session };
  if (status.state === 'played') return { state: 'played', chip: 'played', text: status.label || 'Giocato questa settimana' };
  return { state: 'locked', chip: 'tomorrow', text: 'Da domani' };
}
const CHIP_TEXT = { ready: 'Pronto', played: 'Giocato', tomorrow: 'Domani' };
// La giostra (25/11/2026, founder: «un carosello o un card swapper per
// rendere la schermata più interattiva»): every game is a big card that says
// what you do in it, how long it is and what its button costs — a new round
// shows the token it spends, a round already open spends nothing.
const GAME_DESC = Object.freeze({
  per_voi: 'Un po’ di tutti i giochi, scelto da US per voi due. Dentro può esserci la domanda della settimana.',
  scopritevi: 'Le cose che ancora non sapete di voi due, una domanda alla volta.',
  confrontatevi: 'La stessa situazione, due risposte: scoprite dove la pensate uguale.',
  ridete: 'Domande leggere e un po’ assurde, per ridere insieme.',
  quanto_mi_conosci: 'Uno risponde su di sé, l’altro prova a indovinare. Poi si scambia.',
  rivivete: 'Domande sui vostri momenti, per ricordarli in due.',
  swipe: 'Una carta, due scelte: trascinala da una parte. Alla fine vedete dove coincidete.',
});
const GAME_META = Object.freeze({ swipe: '8 carte · 2 min' });
const TOKEN_MINI = `<span class="us-gv2-costo" aria-hidden="true"><i>${icon('heart-straight-fill')}</i>1</span>`;
function cardAction(card, id) {
  if (card.state === 'locked') return { text: 'Domani', cost: false };
  if (card.state === 'open') {
    const t = card.tone;
    return { text: t === 'ready' ? 'Scopri' : t === 'turn' ? 'Rispondi' : t === 'waiting' || t === 'seen' ? 'Apri' : 'Continua', cost: false };
  }
  if (card.state === 'played') return id === 'per_voi' && home?.per_voi?.session_id ? { text: 'Rivedi', cost: false } : { text: 'Gioca ancora', cost: true };
  return { text: 'Gioca', cost: true };
}
// big: a card of the giostra (description, length, the button and its cost);
// otherwise the small tile of «Tutti i giochi», as before.
function gameCard({ id, name, kind, action, extraClass = '', status, line: own = '', attrs = '', big = false, badge = '' }) {
  const card = cardState(status);
  const locked = card.state === 'locked';
  const data = action === 'swipe' ? 'data-gv2-action="swipe"' : action === 'per-voi' ? 'data-gv2-action="per-voi"' : `data-gv2-family="${id}"`;
  const round = card.session ? ` data-gv2-session="${esc(card.session)}" data-tone="${esc(card.tone || '')}"` : '';
  const line = own || (card.state === 'ready' ? kind : card.state === 'played' ? 'questa settimana' : locked ? 'torna domani' : card.text);
  const act = cardAction(card, id);
  const first = card.tone === 'ready' || card.tone === 'turn' ? ' data-gv2-first' : '';
  const slide = big ? ` data-gv2-slide="${esc(id)}"${first}` : '';
  const chip = card.chip === 'ready' ? '' : `<span class="us-gv2-stato" aria-hidden="true">${card.chip === 'played' ? CHIP_CHECK : ''}${CHIP_TEXT[card.chip]}</span>`;
  const extra = big ? `
      <span class="us-gv2-carta-desc" aria-hidden="true">${esc(GAME_DESC[id] || '')}</span>
      <span class="us-gv2-carta-foot" aria-hidden="true"><span class="us-gv2-carta-meta">${esc(GAME_META[id] || '5 domande · 3 min')}</span><span class="us-gv2-carta-cta" data-cost="${act.cost}">${esc(act.text)}${act.cost ? TOKEN_MINI : ''}</span></span>` : '';
  return `<button type="button" data-us-tile data-us-feedback="tap" class="us-gv2-game${extraClass}" ${data} data-gv2-mode-state="${esc(card.state)}" data-gv2-chip="${card.chip}"${round}${attrs}${locked ? ' aria-disabled="true"' : ''} aria-label="${esc(name)}: ${esc(kind)}. ${esc(card.text)}"${act.cost ? ' aria-description="Usa un gettone"' : ''}${slide}>
      <span class="us-gv2-game-top">${badge ? `<span class="us-gv2-carta-badge" aria-hidden="true">${esc(badge)}</span>` : ''}<span class="us-gv2-glyph" aria-hidden="true">${gameArt(id)}</span>${chip}</span>
      <span class="us-gv2-game-copy"><b>${esc(name)}</b><small>${esc(line)}</small></span>${extra}
    </button>`;
}

// «Il gioco di oggi» (25/11/2026, founder: «alcuni a carosello e gli altri
// come prima»): one of the question games in the giostra, the same for both
// phones all day (the Rome day of the server's allowance), the next one tomorrow.
function dailyPick() {
  const day = allowance()?.day || new Date().toLocaleDateString('en-CA', { timeZone: DAY_ZONE });
  const n = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
  return OFFERED[((Number.isFinite(n) ? n : 0) % OFFERED.length + OFFERED.length) % OFFERED.length];
}
// So more games never turn «Tutti i giochi» into a heap: past six question
// games, the list splits by kind of moment, each with its own small title.
const GENRES = Object.freeze([
  { id: 'conoscervi', name: 'Per conoscervi' },
  { id: 'parlarvi', name: 'Per parlarvi' },
  { id: 'ridere', name: 'Per ridere' },
  { id: 'ricordare', name: 'Per ricordare' },
]);
const GENRE_SPLIT_AT = 6;
function allGames(tiles) {
  const grid = (list) => `<div class="us-gv2-game-grid" data-s>${list.map((t) => t.html).join('')}</div>`;
  if (tiles.length <= GENRE_SPLIT_AT) return grid(tiles);
  return GENRES.map((g) => {
    const list = tiles.filter((t) => t.genre === g.id);
    return list.length ? `<div class="us-gv2-genre"><h4 class="us-gv2-genre-title">${esc(g.name)}</h4>${grid(list)}</div>` : '';
  }).join('');
}

// The cards ride a horizontal track that snaps each one to the middle; the
// scroll paints how far every card is from the middle (--d, --ad) so the ones
// at the sides shrink and lean, and the dots follow. The card in the middle is
// the one a tap plays; a tap on a side card brings it to the middle first.
let activeSlide = null;
let lastHubHtml = '';
let giostraFrame = 0;
let giostraSizer = null;
const giostraTrack = () => byId('quizHub')?.querySelector?.('.us-gv2-giostra-track') || null;
function paintGiostra() {
  giostraFrame = 0;
  const track = giostraTrack();
  if (!track?.getBoundingClientRect) return;
  const box = track.getBoundingClientRect();
  if (!box.width) return;
  const mid = box.left + box.width / 2;
  const cards = Array.from(track.children);
  let best = null, bestD = Infinity;
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    const d = (r.left + r.width / 2 - mid) / (r.width || 1);
    const k = Math.max(-1.5, Math.min(1.5, d));
    c.style.setProperty('--d', k.toFixed(3));
    c.style.setProperty('--ad', Math.abs(k).toFixed(3));
    if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = c; }
  }
  cards.forEach((c) => { c.dataset.gv2Active = c === best ? 'true' : 'false'; });
  if (best) activeSlide = best.dataset.gv2Slide || activeSlide;
  const at = cards.indexOf(best);
  track.parentElement?.querySelectorAll?.('.us-gv2-giostra-dots i').forEach((dot, i) => { dot.dataset.on = String(i === at); });
}
function centerSlide(card, smooth = true) {
  const track = card?.parentElement;
  if (!track?.scrollTo) return;
  const left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
  track.scrollTo({ left, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
}
// After each paint of the hub (every 45 s too) the card you were on stays in
// the middle; the first time, the card waiting for you, or Per voi.
function settleGiostra() {
  const track = giostraTrack();
  if (!track?.querySelector) return;
  const keep = activeSlide && track.querySelector(`[data-gv2-slide="${activeSlide}"]`);
  const want = keep || track.querySelector('[data-gv2-first]') || track.firstElementChild;
  if (want) centerSlide(want, false);
  paintGiostra();
  // Painted while Gioca was hidden (no width yet): settle again once it shows.
  if (typeof ResizeObserver === 'function') {
    giostraSizer?.disconnect();
    let seen = track.clientWidth;
    giostraSizer = new ResizeObserver(() => {
      if (track.clientWidth === seen) return;
      seen = track.clientWidth;
      const card = (activeSlide && track.querySelector(`[data-gv2-slide="${activeSlide}"]`)) || want;
      if (card) centerSlide(card, false);
      paintGiostra();
    });
    giostraSizer.observe(track);
  }
}
function onGiostraScroll(event) {
  if (!event.target?.classList?.contains('us-gv2-giostra-track')) return;
  if (!giostraFrame) giostraFrame = (window.requestAnimationFrame || setTimeout)(paintGiostra);
}
function giostra(cards) {
  return `<div class="us-gv2-giostra" data-s>
    <div class="us-gv2-giostra-track" role="group" aria-roledescription="carosello" aria-label="I vostri giochi: scorri per sceglierne uno">${cards.join('')}</div>
    <div class="us-gv2-giostra-dots" aria-hidden="true">${cards.map(() => '<i></i>').join('')}</div>
  </div>`;
}
// Per voi is the first tile, in the page's colour: its state is the server's
// per_voi (one line, and the note when the other one's question is inside).
function perVoiStatus(state) {
  const sid = home?.per_voi?.session_id;
  if (state === 'idle') return allowance() && !freeLeft() ? { state: 'locked' } : null;
  if (state === 'played') return { state: 'played', label: 'Per oggi avete giocato' };
  const tone = { pending: 'turn', reveal_ready: 'ready', waiting: 'waiting', in_progress: 'progress' }[state] || 'progress';
  return { state: 'open', text: perVoiCopy().line, tone, session: sid };
}

// Redesign definitivo, fase 6 (D10, D11; the approved tavola «Gioca» and
// «Gioca, gettoni finiti»): the tokens, «Vi aspetta», then I vostri giochi
// (Per voi and the five families, Questo o quello under them), then La vostra
// domanda. No weekly challenge (it is hidden, its data stays), no week strip
// and no Domanda di oggi (Oggi has it).
function renderHub() {
 const root=byId('quizHub');if(!root)return;
 const pv=perVoiCopy(),pvState=home?.per_voi?.state||'idle';
 const onTiles=new Set();
 const tileStatus=(f)=>{const r=tileRound(f.id);if(r)onTiles.add(r.id);return modeStatus(f,r);};
 const spent=Boolean(allowance()&&!freeLeft());
 // The giostra holds the few games in the spotlight: Per voi, the game of the
 // day and Questo o quello; every question game stays a tile below, as before.
 const perVoi=gameCard({id:'per_voi',name:PER_VOI.name,kind:'Una partita preparata apposta',action:'per-voi',extraClass:' is-pervoi',status:perVoiStatus(pvState),line:pvState==='idle'&&spent?'':(pv.note||pv.line),attrs:` data-gv2-state="${esc(pvState)}"`,big:true});
 const swipe=gameCard({id:'swipe',name:SWIPE.name,kind:'8 carte · veloce e privato',action:'swipe',extraClass:' is-swipe',status:tileStatus(SWIPE),big:true});
 const pick=dailyPick();
 const today=gameCard({id:pick.id,name:pick.name,kind:pick.kind,status:tileStatus(pick),big:true,badge:'Il gioco di oggi',extraClass:' is-oggi'});
 const tiles=OFFERED.map(f=>({genre:f.genre,html:gameCard({id:f.id,name:f.name,kind:f.kind,status:tileStatus(f)})}));
 const html=`
  <h2 class="us-gv2-sr">Gioca</h2>
  ${tokensCard()}
  ${waitingSection(home)}
  <section class="us-gv2-choose" aria-labelledby="usGv2ChooseTitle">
   <div class="us-gv2-section-head" data-s><h3 class="us-gv2-section-title" id="usGv2ChooseTitle">Oggi per voi</h3><small>${spent?'tornano domani':'scorri e scegli'}</small></div>
   ${giostra([perVoi,today,swipe])}
  </section>
  <section class="us-gv2-all" aria-labelledby="usGv2AllTitle">
   <div class="us-gv2-section-head" data-s><h3 class="us-gv2-section-title" id="usGv2AllTitle">Tutti i giochi</h3><small>${spent?'tornano domani':'bastano pochi minuti'}</small></div>
   ${allGames(tiles)}
  </section>
  ${weeklyCard(home?.weekly)}
  ${continueSection(home,onTiles)}
  ${doneSection(home)}`;
 // The 45 s refresh paints the same hub again: keep the cards where they are.
 if(html===lastHubHtml&&root.querySelector?.('.us-gv2-giostra'))return void window.UsDailyQuestionHub?.paintCard?.();
 lastHubHtml=html;
 root.innerHTML=html;
 settleGiostra();
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
    if (view === 'hub') renderHub();
    checkPerVoiQuestion();
    return home;
  } catch (error) {
    console.warn('[US Gioca] home', error);
    if(!sameIdentity())return false;
    weeklyJustCreated = false;
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
    settleToken(data);
    await present(data);
    load();
  } catch (error) {
    console.warn('[US Gioca] start', error);
    paintTokens();
    const msg = error?.message || '';
    if (/weekly per voi played|weekly allowance exhausted|too many open rounds/.test(msg)) startRequestIds.delete(family);
    // The server keeps the old "weekly" error names for installed clients;
    // the budget they speak of is the day's games.
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
    settleToken(data);
    await present(data);
    load();
  } catch (error) {
    console.warn('[US Gioca] swipe start', error);
    paintTokens();
    const msg = error?.message || '';
    if (/weekly allowance exhausted|too many open rounds|not enough swipe content/.test(msg)) startRequestIds.delete('swipe');
    toast(/weekly allowance exhausted/.test(msg) ? EXHAUSTED
      : /too many open rounds/.test(msg) ? 'Prima finite uno dei giochi in corso.'
      : /not enough swipe content/.test(msg) ? 'Le nuove carte di Questo o quello non sono ancora pronte.'
      : 'Non riesco ad aprire Questo o quello. Riprova.');
    if (/weekly|too many open rounds/.test(msg)) load();
  } finally { busy = false; }
}

async function chooseSwipe(from) {
  if (busy) return;
  const open = tileRound('swipe');
  if (open) return openSession(open.id);
  const played = playedThisWeek('swipe');
  if (allowance() && !freeLeft()) {
    if (played?.completed) return openSession(played.session_id);
    return toast(EXHAUSTED);
  }
  if (canSpend()) flyToken(from);
  return startSwipe();
}

async function chooseMode(family, from) {
  if (busy) return;
  const open = tileRound(family);
  if (open) return openSession(open.id);
  const played = playedThisWeek(family);
  if (allowance() && !freeLeft()) {
    if (played?.completed) return openSession(played.session_id);
    return toast(EXHAUSTED);
  }
  if (canSpend()) flyToken(from);
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

async function openPerVoi(from) {
  if (document.querySelector('.page.active')?.id !== 'quiz') window.go?.('quiz', { nav: true });
  if (!home) await load();
  const sid = home?.per_voi?.session_id;
  if (sid) return openSession(sid);
  if (busy) return;
  if (canSpend()) flyToken(from);
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
  </article>`, { kicker: SWIPE.name, title: 'Le tue 8 scelte sono salvate.', tone: 'ambra', label: SWIPE.name }, { dir });
}

function renderWaiting({ dir = 1 } = {}) {
  if (current?.game_family === 'swipe') return renderSwipeWaiting({ dir });
  showPanel(`<article class="us-gv2-waiting">
    ${waitArt('Le risposte si svelano quando avete risposto voi due.')}
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
  if(read.length)return `${partner||'La tua persona'} ha indovinato ${times(hits(read))} su ${read.length}`;
  if(mine.length)return `Con ${partner||'la tua persona'} hai indovinato ${times(hits(mine))} su ${mine.length}`;
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
  // La giostra: a finger on a side card brings it to the middle; only the
  // middle one plays. Enter, Space or a screen reader (a click without a
  // pointer, detail 0) play the card they name, wherever it is.
  if (button.dataset.gv2Slide && button.dataset.gv2Active === 'false' && event.detail !== 0) { centerSlide(button); return; }
  const action = button.dataset.gv2Action;
  if (action === 'per-voi') openPerVoi(button);
  else if (action === 'swipe') chooseSwipe(button);
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
  else if (action === 'plus-soon') window.UsPlusSoon?.open?.({ from: 'gioca' });
  else if (button.dataset.gv2Family) chooseMode(button.dataset.gv2Family, button);
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
    // Scroll does not bubble: the track's scroll is caught on the way down.
    hub.addEventListener('scroll', onGiostraScroll, { capture: true, passive: true });
    // A card reached with the keyboard comes to the middle, so Enter plays it.
    hub.addEventListener('focusin', (event) => {
      const card = event.target?.closest?.('[data-gv2-slide]');
      if (card && card.dataset.gv2Active === 'false' && card.matches?.(':focus-visible')) centerSlide(card);
    });
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
  load, refresh, showHub, openPerVoi, startRound, startSwipe, openSession, chooseMode, chooseSwipe,
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
  // Back after a few seconds away (index.html, UsForeground): the badge is still right.
  if (window.UsForeground?.shortAway?.()) return;
  (window.usAfterForeground || ((task) => task()))(() => refresh(), 1400);
});
setInterval(() => { if (!document.hidden && window.usProfile) refresh(); }, 45000);
})();
