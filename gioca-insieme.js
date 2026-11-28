/* Gioca più piena (founder, grill del 27/11/2026: D1–D5, D15, D18). The
   choices behind the new blocks of Gioca, as plain functions that own no data
   and touch no page: games.js reads the server and paints.
   - «Voi due»: the intesa of the couple over the last 20 comparable answers
     (get_game_intesa_v1), never a competition (D3, D18);
   - the days played together this week, as dots, with no streak to lose (D4);
   - «Cosa avete scoperto»: two or three short answers from the latest rounds,
     light games first, rotating by day (D2);
   - «Intanto rileggete…»: the latest answer where you differed (D5);
   - the first card of «Oggi per voi» chosen also by your two moods (D15);
   - each game of «Tutti i giochi» with its last time and its same answers.
   Partner answers come only from rounds the server has revealed and are never
   kept anywhere but in the caller's memory. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsGiocaInsieme = api;
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const ZONE = 'Europe/Rome';
  const DAY_MS = 86400000;
  // Under five comparable answers the number would say more about chance than
  // about you: a gentle line instead.
  const MIN_COMPARED = 5;
  const MIN_FAMILY_COMPARED = 4;

  const romeDay = (at) => {
    try {
      const t = at instanceof Date ? at : new Date(at);
      return Number.isFinite(t.getTime()) ? t.toLocaleDateString('en-CA', { timeZone: ZONE }) : '';
    } catch (_) { return ''; }
  };
  const dayNumber = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : NaN;
  };
  const isoOf = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
  const times = (n) => (n === 1 ? '1 volta' : `${n} volte`);
  const tag = () => w?.UsI18n?.tag || 'it-IT';

  // ------------------------------------------------------------ intesa (D3)
  function intesa(data) {
    const compared = Math.max(0, Math.floor(Number(data?.compared) || 0));
    const same = Math.min(compared, Math.max(0, Math.floor(Number(data?.same) || 0)));
    if (compared < MIN_COMPARED) return { ready: false, compared, same, line: 'Giocate qualche partita e qui vedrete la vostra intesa' };
    const line = same === 0 ? `Su ${compared} domande avete scelto sempre in modo diverso` : `Su ${compared} domande avete risposto uguale ${times(same)}`;
    return { ready: true, compared, same, line };
  }

  // ------------------------------------------------------- days together (D4)
  // Seven dots, Monday first, for the Rome week the server names; a dot is on
  // when a round was finished by both that day. Nothing is lost on an empty day.
  function weekDots(weekStart, days, today = romeDay(new Date())) {
    const first = dayNumber(weekStart);
    if (!Number.isFinite(first)) return [];
    const on = new Set((Array.isArray(days) ? days : []).map(String));
    const now = dayNumber(today);
    return Array.from({ length: 7 }, (_, i) => {
      const iso = isoOf(first + i);
      let letter = '', name = '';
      try {
        const at = new Date(`${iso}T12:00:00Z`);
        letter = at.toLocaleDateString(tag(), { weekday: 'narrow', timeZone: 'UTC' });
        name = at.toLocaleDateString(tag(), { weekday: 'long', timeZone: 'UTC' });
      } catch (_) { letter = ''; }
      return { iso, on: on.has(iso), today: first + i === now, future: Number.isFinite(now) && first + i > now, letter, name };
    });
  }
  function weekLine(count) {
    const n = Math.max(0, Number(count) || 0);
    if (!n) return 'Giocate insieme e qui si accende il giorno';
    return n === 1 ? 'Un giorno insieme questa settimana' : `${n} giorni insieme questa settimana`;
  }
  // Without the server's days (an older server): the finished rounds the hub
  // already lists, inside this week.
  function daysFromRecent(recent, weekStart) {
    const first = dayNumber(weekStart);
    if (!Number.isFinite(first)) return [];
    const out = new Set();
    for (const r of Array.isArray(recent) ? recent : []) {
      if (!r?.completed_at) continue;
      const n = dayNumber(romeDay(r.completed_at));
      if (n >= first && n < first + 7) out.add(isoOf(n));
    }
    return [...out].sort();
  }

  // ------------------------------------------------------- discoveries (D2)
  // Light games first; within the same weight, the newest round.
  const WEIGHT = Object.freeze({ ridete: 0, swipe: 0, confrontatevi: 1, scopritevi: 1, per_voi: 1, rivivete: 2, quanto_mi_conosci: 3 });
  const weight = (family) => WEIGHT[family] ?? 2;
  const MAX_CHOICE = 40;
  const MAX_OPEN = 32;
  const optionAt = (item, index) => (index == null ? null : (Array.isArray(item?.options) ? item.options[Number(index)] : null) ?? null);
  // One answer worth bringing back: a choice both of you made (not a guess
  // about the other), or two very short free answers from a light question.
  // Deep questions (depth 3) and questions the couple wrote stay in the reveal.
  function discoveryOf(item, family) {
    if (!item || item.mechanic === 'prediction' || item.source_type === 'couple_custom' || Number(item.depth) >= 3) return null;
    const question = String(item.my_prompt || item.question_text || '').trim();
    if (!question) return null;
    if (item.answer_kind === 'choice') {
      const mine = optionAt(item, item.my_answer_index), theirs = optionAt(item, item.partner_answer_index);
      if (mine == null || theirs == null || String(mine).length > MAX_CHOICE || String(theirs).length > MAX_CHOICE) return null;
      return { question, mine: String(mine), theirs: String(theirs), same: Number(item.my_answer_index) === Number(item.partner_answer_index), kind: 'choice' };
    }
    if (item.answer_kind === 'open' && weight(family) <= 1 && !(Number(item.depth) >= 2)) {
      const mine = String(item.my_answer_text ?? '').trim(), theirs = String(item.partner_answer_text ?? '').trim();
      if (!mine || !theirs || mine.length > MAX_OPEN || theirs.length > MAX_OPEN || /\n/.test(mine + theirs)) return null;
      return { question, mine, theirs, same: false, kind: 'open' };
    }
    return null;
  }
  const revealed = (s) => s && s.reveal_ready === true && Boolean(s.my_reveal_seen_at) && Array.isArray(s.items);
  // The sessions to read for discoveries, from the hub's recent rounds: only
  // the ones you have already opened, so nothing here spoils a reveal.
  function discoverySessions(recent, max = 3) {
    return (Array.isArray(recent) ? recent : [])
      .filter((r) => r?.id && r.reveal_ready && r.my_reveal_seen_at)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => weight(a.r.game_family) - weight(b.r.game_family) || a.i - b.i)
      .slice(0, max)
      .map(({ r }) => r.id);
  }
  // Up to max answers, one per round first, rotating with the Rome day so the
  // same three do not stay there forever.
  function pickDiscoveries(sessions, { day = romeDay(new Date()), max = 3 } = {}) {
    const seed = Math.abs(dayNumber(day) || 0);
    const pools = (Array.isArray(sessions) ? sessions : []).filter(revealed)
      .map((s, i) => ({ s, i, list: s.items.map((it) => discoveryOf(it, s.game_family)).filter(Boolean) }))
      .filter((p) => p.list.length)
      .sort((a, b) => weight(a.s.game_family) - weight(b.s.game_family) || a.i - b.i);
    const out = [];
    for (let round = 0; out.length < max && pools.some((p) => p.list.length > round); round += 1) {
      for (const p of pools) {
        if (out.length >= max || p.list.length <= round) continue;
        const d = p.list[(seed + p.i + round) % p.list.length];
        if (out.some((x) => x.sessionId === p.s.id && x.question === d.question)) continue;
        out.push({ ...d, sessionId: p.s.id, family: p.s.game_family });
      }
    }
    return out;
  }

  // ------------------------------------------- tokens finished: rileggete (D5)
  // The newest answer where you two chose differently (a choice, not a guess).
  function latestDifferent(sessions) {
    const list = (Array.isArray(sessions) ? sessions : []).filter(revealed)
      .slice().sort((a, b) => (Date.parse(b.completed_at || '') || 0) - (Date.parse(a.completed_at || '') || 0));
    for (const s of list) {
      const item = s.items.find((it) => it.answer_kind === 'choice' && it.mechanic !== 'prediction' && it.my_answer_index != null && it.partner_answer_index != null && Number(it.my_answer_index) !== Number(it.partner_answer_index));
      if (item) return { session: s, item };
    }
    return null;
  }

  // -------------------------------------------------- the two moods (D15)
  const HAPPY = new Set(['innamorato', 'felice', 'festa']);
  const LOW = new Set(['giu', 'stanco', 'malato']);
  // One of you down, tired or unwell: a tender game first. Both happy or in
  // love: a game to laugh first. Otherwise today's order.
  function moodLead(mine, theirs) {
    if (LOW.has(mine) || LOW.has(theirs)) return 'tenero';
    if (HAPPY.has(mine) && HAPPY.has(theirs)) return 'ridere';
    return '';
  }
  const MOOD_GAME = Object.freeze({ ridere: 'ridete', tenero: 'rivivete' });
  const MOOD_BADGE = Object.freeze({ ridere: 'Per ridere', tenero: 'Con dolcezza' });
  // The game the moods bring first, then the cards of today in their order.
  function giostraOrder(base, lead) {
    const list = (Array.isArray(base) ? base : []).slice();
    const id = MOOD_GAME[lead];
    if (!id) return list;
    return [id, ...list.filter((x) => x !== id)];
  }

  // ------------------------------------------------ Tutti i giochi, per game
  function lastPlayedLine(at, now = new Date()) {
    if (!at) return '';
    const then = dayNumber(romeDay(at)), today = dayNumber(romeDay(now));
    if (!Number.isFinite(then) || !Number.isFinite(today)) return '';
    const ago = today - then;
    if (ago <= 0) return 'Giocato oggi';
    if (ago === 1) return 'Giocato ieri';
    if (ago < 7) return `Giocato ${ago} giorni fa`;
    let date = '';
    try { date = new Date(`${isoOf(then)}T12:00:00Z`).toLocaleDateString(tag(), { day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch (_) { date = isoOf(then); }
    return `Giocato il ${date}`;
  }
  function sameShare(family) {
    const compared = Number(family?.compared) || 0, same = Number(family?.same) || 0;
    if (compared < MIN_FAMILY_COMPARED) return '';
    return `${Math.round((Math.min(same, compared) / compared) * 100)}% risposte uguali`;
  }

  return Object.freeze({
    MIN_COMPARED, MOOD_GAME, MOOD_BADGE,
    romeDay, intesa, weekDots, weekLine, daysFromRecent,
    discoveryOf, discoverySessions, pickDiscoveries, latestDifferent,
    moodLead, giostraOrder, lastPlayedLine, sameShare,
  });
});
