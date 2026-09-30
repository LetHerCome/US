// Shared harness for the M10.2 client tests: the real app.js hydrateToday()
// executed in a vm context with an in-memory reveal server.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const slice = (from, to) => { const a = app.indexOf(from); const b = app.indexOf(to, a); if (!(a >= 0 && b > a)) throw new Error(`${from}…${to}`); return app.slice(a, b); };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const QUESTION = { id: 'q-1', question: 'Cosa ti farebbe partire bene questa settimana?', question_date: '2026-10-05' };
const state = (me, other) => ({ my_answer: me, partner_has_answer: other != null, both_answered: me != null && other != null, partner_answer: me != null && other != null ? other : null });
const meta = (extra = {}) => ({ question_id: 'q-1', both_answered: true, my_reveal_seen_at: null, my_notice_dismissed_at: null, my_reaction: null, partner_reaction: null, ...extra });

function el(extra = {}) {
  return { textContent: '', innerHTML: '', value: '', hidden: false, disabled: false, dataset: {}, className: '',
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } }, ...extra };
}
function installToday({ role = 'francesco', sheetOpen = true, revealMeta, seenResult, reactionResult, dismissResult } = {}) {
  const nodes = { qtext: el(), locked: el(), todayReveal: el(), todaySaveBtn: el(), answer: el(), today: el() };
  if (sheetOpen) nodes.today.classList.add('open');
  const calls = []; const refreshes = []; const toasts = []; const pushes = [];
  const listeners = new Map(); nodes.todayReveal.addEventListener = (t, f) => listeners.set(t, f);
  let currentMeta = revealMeta || meta();
  const sb = {
    rpc: async (name, args) => {
      calls.push([name, args && { ...args }]);
      if (name === 'get_or_create_daily_question') return { data: { ...QUESTION, question_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()) }, error: null };
      if (name === 'get_daily_state') return { data: state('Mia', 'Sua'), error: null };
      if (name === 'get_daily_reveal_meta') return { data: currentMeta, error: null };
      if (name === 'mark_daily_reveal_seen') return seenResult ? seenResult(currentMeta) : { data: (currentMeta = { ...currentMeta, my_reveal_seen_at: '2026-10-05T09:00:00Z' }), error: null };
      if (name === 'set_daily_answer_reaction') return reactionResult ? reactionResult(args, currentMeta) : { data: (currentMeta = { ...currentMeta, my_reaction: args.target_reaction }), error: null };
      if (name === 'dismiss_daily_reveal_notice') return dismissResult ? dismissResult(currentMeta) : { data: (currentMeta = { ...currentMeta, my_notice_dismissed_at: '2026-10-05T09:00:00Z' }), error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  const window = { usProfile: { id: 'f', couple_id: 'c', role }, UsTodayPriority: { refresh: (arg) => refreshes.push(arg), render() {} } };
  const context = vm.createContext({
    console: { warn() {} }, Promise, Intl, Date, Error, Object, setTimeout, window, sb,
    document: { querySelector: (s) => (s === '#today .qtext' ? nodes.qtext : null), getElementById: (id) => nodes[id] || null },
    dailyQuestionOutcomes: { hide() {}, async load() {} },
    updateHomeStatus() {}, escapeHtml: (v) => String(v).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])),
    dailyRitualPartnerName: () => 'Beatrice', localDateISO: () => 'LOCAL', toast: (m) => toasts.push(m),
    refreshTodayPriorities: async () => { refreshes.push('refresh'); },
    sendWebPushEvent: (type, id) => { pushes.push([type, id]); return Promise.resolve(); },
  });
  vm.runInContext(`${slice('// M9E — la domanda di oggi', 'async function updateHomeStatus')}\nwindow.hydrateToday=hydrateToday;`, context);
  return { nodes, calls, refreshes, toasts, pushes, listeners, window, hydrate: () => window.hydrateToday(), currentMeta: () => currentMeta };
}

module.exports = { ROOT, read, app, slice, flush, QUESTION, state, meta, el, installToday };
