// M12D — Quest V2: one weekly board over the existing Quest domain.
// The client only derives display state from persisted bond_weekly_state /
// bond_weekly_quests rows and calls the existing RPCs (confirm_bond_quest,
// reroll_bond_quest). It never awards XP, never writes confirmations and
// never touches couples.bond_xp.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = read('app.js'), html = read('index.html'), css = read('styles.css');
function slice(from, to) { const a = app.indexOf(from), b = app.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from}…${to}`); return app.slice(a, b); }
const WEEK_BLOCK = slice("const QUEST_WEEK_TIMEZONE='Europe/Rome';", 'function bondLevelInfo(totalXp=0){');
const QUEST_BLOCK = slice('async function currentQuestMode(){', '\n// ===== M7B');
const SEED_BLOCK = slice('function hashSeed(text){', 'async function currentQuestMode(){');
const BOARD_BLOCK = slice('// ===== M12D · Quest V2', '\n// ===== M7B');

const C = 'c-1', F = 'f-1', B = 'b-1', C2 = 'c-2', F2 = 'f-2';
const PROFILES = { [C]: [{ id: F, display_name: 'Francesco', role: 'francesco' }, { id: B, display_name: 'Beatrice', role: 'beatrice' }], [C2]: [{ id: F2, display_name: 'Altro', role: 'francesco' }] };
const TEMPLATES = [
  { key: 'a', title: 'A', category: 'fun', rarity: 'common', xp: 20, mode: 'near', active: true },
  { key: 'b', title: 'B', category: 'chill', rarity: 'uncommon', xp: 30, mode: 'far', active: true },
  { key: 'c', title: 'C', category: 'connection', rarity: 'rare', xp: 50, mode: 'any', active: true },
  { key: 'd', title: 'D', category: 'memory', rarity: 'epic', xp: 80, mode: 'any', active: true },
  { key: 'e', title: 'E', category: 'surprise', rarity: 'common', xp: 20, mode: 'any', active: true },
  { key: 'f', title: 'F', category: 'adventure', rarity: 'uncommon', xp: 30, mode: 'near', active: true },
];

function el(id) { return { id, innerHTML: '', textContent: '', hidden: false, dataset: {}, style: {}, classList: { contains: () => false }, setAttribute() {}, querySelector: () => null }; }

// A minimal Supabase stand-in: answers reads from in-memory rows scoped by the
// filters the client sends, records every write/RPC so tests can prove what the
// client never does.
function fakeDb(rows) {
  const log = { writes: [], rpc: [], reads: [] };
  const handlers = { confirm_bond_quest: null, reroll_bond_quest: null };
  function from(table) {
    const filters = []; let op = 'select', head = false, payload = null;
    const result = () => {
      if (rows.fail && rows.fail.includes(table) && op === 'select' && !(rows.failOnly && !rows.failOnly(filters))) return { data: null, error: { message: `${table} down` } };
      if (op !== 'select') { log.writes.push({ table, op, payload }); return { data: null, error: null }; }
      log.reads.push({ table, filters: filters.map((f) => f.join(':')) });
      let data = (rows[table] || []).slice();
      for (const [k, c, v] of filters) {
        if (k === 'eq') data = data.filter((r) => r[c] === v);
        if (k === 'lt') data = data.filter((r) => r[c] < v);
        if (k === 'notnull') data = data.filter((r) => r[c] != null);
      }
      return head ? { data: null, count: data.length, error: null } : { data, error: null };
    };
    const b = {
      select(_c, o) { if (o?.head) head = true; return b; },
      eq(c, v) { filters.push(['eq', c, v]); return b; }, lt(c, v) { filters.push(['lt', c, v]); return b; },
      not(c) { filters.push(['notnull', c]); return b; }, order() { return b; }, limit() { return b; },
      insert(p) { op = 'insert'; payload = p; return b; }, update(p) { op = 'update'; payload = p; return b; }, upsert(p) { op = 'upsert'; payload = p; return b; }, delete() { op = 'delete'; return b; },
      maybeSingle() { const r = result(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
      then(res, rej) { return Promise.resolve(result()).then(res, rej); },
    };
    return b;
  }
  const sb = {
    from,
    async rpc(name, args) { log.rpc.push({ name, args }); const h = handlers[name]; return h ? h(args) : { data: null, error: null }; },
  };
  return { sb, log, handlers };
}

function harness({ me = F, couple = C, quests = [], rerolls = 0, history = [], fail = [], distanceKm, failOnly } = {}) {
  const week = '2026-09-28';
  const rows = {
    bond_weekly_state: [{ couple_id: C, week_start: week, rerolls_used: rerolls }],
    bond_weekly_quests: [...quests.map((q) => ({ couple_id: C, week_start: week, confirmed_by: [], completed_at: null, ...q })), ...history],
    bond_quest_templates: TEMPLATES,
    profiles: [...PROFILES[C].map((p) => ({ ...p, couple_id: C })), ...PROFILES[C2].map((p) => ({ ...p, couple_id: C2 }))],
    couples: [{ id: C, bond_xp: 340 }, { id: C2, bond_xp: 10 }],
    couple_locations: [], fail, failOnly,
  };
  const db = fakeDb(rows);
  const els = Object.fromEntries(['bondQuestList', 'questWeekBoard', 'questRecent', 'questRecentList', 'bondCompletedCount', 'bondRerollsLeft', 'bondWeekReset', 'bond'].map((id) => [id, el(id)]));
  const toasts = [], pushes = [], listeners = {};
  const window = { usProfile: { id: me, couple_id: couple, display_name: me === B ? 'Beatrice' : 'Francesco' }, usDistanceKm: distanceKm, addEventListener(t, f) { listeners[t] = f; } };
  const context = vm.createContext({
    window, console: { warn() {}, log() {} }, Intl, Date, Math, Number, String, JSON, Set, Map, Array, Promise, Object,
    document: { getElementById: (id) => els[id] || null, addEventListener() {} },
    sb: db.sb, toast: (t) => toasts.push(t), sendWebPushEvent: (type, id) => { pushes.push([type, id]); return Promise.resolve(); },
    renderNoiHubSummary() {}, renderBondProgress() {}, hydrateBondSummary: async () => {}, distanceKm: () => 10,
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])),
  });
  vm.runInContext(`${WEEK_BLOCK}\n${SEED_BLOCK}\n${QUEST_BLOCK}\nwindow.__t={weekStartISO,hydrateBond,confirmBondQuest,rerollBondQuest,selectInitialQuestTemplates,ensureBondWeek,renderBondQuest};`, context);
  // Pin "today" to Thursday 1 Oct 2026 (week of Mon 28 Sep) for deterministic labels.
  const fixedNow = new Date('2026-10-01T10:00:00Z');
  const realWeek = window.__t.weekStartISO;
  vm.runInContext('weekStartISO=(now)=>window.__weekStart(now);', context);
  window.__weekStart = (now) => realWeek(now || fixedNow);
  const cards = () => [...els.bondQuestList.innerHTML.matchAll(/<article class="bond-quest quest-v2[^"]*" data-quest-id="([^"]+)" data-quest-slot="(\d+)" data-quest-state="([^"]+)" data-quest-reroll="([^"]+)">([\s\S]*?)<\/article>/g)]
    .map((m) => ({ id: m[1], slot: Number(m[2]), state: m[3], reroll: m[4], body: m[5], confirm: (m[5].match(/<button[^>]*class="quest-confirm[^"]*"[^>]*>([^<]*)<\/button>/) || [])[0] || '' }));
  return { window, els, db, toasts, pushes, listeners, rows, cards, api: window.UsQuest, t: window.__t };
}
const q = (slot, extra = {}) => ({ id: `q${slot}`, slot, template_key: ['a', 'c', 'd'][slot - 1], title: `Quest ${slot}`, category: 'fun', rarity: ['common', 'rare', 'epic'][slot - 1], xp: [20, 50, 80][slot - 1], ...extra });
const three = (over = {}) => [q(1, over[1]), q(2, over[2]), q(3, over[3])];

test('M12D: three Quest slots render with explicit states derived from persisted rows', async () => {
  const h = harness({ quests: three({ 1: { confirmed_by: [F] }, 2: { confirmed_by: [B] }, 3: { confirmed_by: [F, B], completed_at: '2026-09-30T10:00:00Z' } }), rerolls: 1 });
  await h.t.hydrateBond();
  const c = h.cards();
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((x) => x.state), ['you-confirmed', 'partner-confirmed', 'completed']);
  assert.match(c[0].confirm, /disabled/); assert.match(c[0].confirm, /Confermata da te/);
  assert.doesNotMatch(c[1].confirm, /disabled/); assert.match(c[1].confirm, /Conferma anche tu/);
  assert.match(c[1].body, /Beatrice ha confermato · manca la tua conferma/);
  assert.match(c[0].body, /Hai confermato · aspettiamo Beatrice/);
  assert.match(c[2].confirm, /disabled/); assert.match(c[2].confirm, /Completata · \+80 XP/);
  assert.match(c[2].body, /Completata insieme · \+80 XP assegnati/);
});

test('M12D: available state and the same rows seen from the partner phone swap actor and partner', async () => {
  const quests = three({ 1: { confirmed_by: [F] } });
  const f = harness({ quests });
  await f.t.hydrateBond();
  assert.deepEqual(f.cards().map((x) => x.state), ['you-confirmed', 'available', 'available']);
  assert.match(f.cards()[1].body, /Si completa quando confermate entrambi/);
  assert.match(f.cards()[1].confirm, /Ho completato questa quest/);
  const b = harness({ me: B, quests });
  await b.t.hydrateBond();
  assert.deepEqual(b.cards().map((x) => x.state), ['partner-confirmed', 'available', 'available']);
  assert.match(b.cards()[0].body, /Francesco ha confermato/);
});

test('M12D: confirmation is never carried by color alone (text, check icon and sr label)', async () => {
  const h = harness({ quests: three({ 1: { confirmed_by: [F] } }) });
  await h.t.hydrateBond();
  const body = h.cards()[0].body;
  assert.match(body, /<li class="quest-person checked">[\s\S]*?Tu[\s\S]*?data-us-icon="check"[\s\S]*?<span class="sr-only">confermato<\/span>/);
  assert.match(body, /<li class="quest-person ">[\s\S]*?Beatrice[\s\S]*?in attesa/);
  assert.match(body, /<ul class="quest-confirmers" aria-label="Conferme">/);
});

test('M12D: weekly header shows week identity, N / 3, rerolls left and a stable reset date', async () => {
  const h = harness({ quests: three({ 3: { confirmed_by: [F, B], completed_at: '2026-09-30T10:00:00Z' } }), rerolls: 1 });
  await h.t.hydrateBond();
  const head = h.els.questWeekBoard.innerHTML;
  assert.equal(h.els.questWeekBoard.hidden, false);
  assert.match(head, /Questa settimana/);
  assert.match(head, /28 set – 4 ott/);
  assert.match(head, /<b>1<\/b><span>\/ 3<\/span><small>completate<\/small>/);
  assert.match(head, /aria-valuenow="1"[^>]*aria-valuetext="1 di 3 completate"|aria-valuemax="3" aria-valuenow="1"/);
  assert.match(head, /data-quest-rerolls="2">[\s\S]*?2 cambi rimasti/);
  assert.match(head, /Nuove quest lunedì 5 ott/);
  assert.doesNotMatch(head, /setInterval|countdown/i);
});

test('M12D: completed Quest stays visible on the board with the XP stored on its row', async () => {
  const h = harness({ quests: three({ 2: { confirmed_by: [F, B], completed_at: '2026-09-30T10:00:00Z', xp: 55 } }) });
  await h.t.hydrateBond();
  const done = h.cards().find((x) => x.slot === 2);
  assert.equal(done.state, 'completed');
  assert.match(done.body, /\+55 XP assegnati/);
  assert.equal(done.reroll, 'locked');
  assert.doesNotMatch(done.body, /class="quest-reroll/, 'a completed Quest offers no reroll at all');
});

test('M12D: confirm calls only the existing RPC with the quest id, renders the server result and never writes XP', async () => {
  const h = harness({ quests: three({ 2: { confirmed_by: [B] } }) });
  await h.t.hydrateBond();
  h.db.handlers.confirm_bond_quest = ({ target_quest_id }) => {
    const row = h.rows.bond_weekly_quests.find((r) => r.id === target_quest_id);
    row.confirmed_by = [...row.confirmed_by, F]; row.completed_at = '2026-10-01T10:00:00Z';
    return { data: { xp_awarded: 50 }, error: null };
  };
  await h.t.confirmBondQuest('q2');
  assert.deepEqual(h.db.log.rpc.map((r) => [r.name, Object.keys(r.args)]), [['confirm_bond_quest', ['target_quest_id']]]);
  assert.equal(h.db.log.rpc[0].args.target_quest_id, 'q2');
  assert.deepEqual(h.db.log.writes.filter((w) => w.table !== 'bond_weekly_state'), [], 'no client write: no XP, no confirmed_by, no completed_at');
  assert.equal(h.rows.couples[0].bond_xp, 340, 'bond_xp is only the server’s to change');
  assert.ok(h.toasts.includes('Quest completata · +50 XP ♡'), 'XP shown is the server-returned award');
  assert.deepEqual(h.pushes, [['quest_confirmed', 'q2']]);
  assert.equal(h.cards()[1].state, 'completed', 'rerendered from the persisted row');
});

test('M12D: rapid double tap and a retry while in flight send exactly one confirmation', async () => {
  const h = harness({ quests: three() });
  await h.t.hydrateBond();
  let release;
  h.db.handlers.confirm_bond_quest = () => new Promise((r) => { release = () => r({ data: { xp_awarded: 0 }, error: null }); });
  const first = h.t.confirmBondQuest('q1');
  const second = h.t.confirmBondQuest('q1');
  await Promise.resolve();
  assert.match(h.cards()[0].confirm, /Confermo…/); assert.match(h.cards()[0].confirm, /disabled/); assert.match(h.cards()[0].confirm, /aria-busy="true"/);
  release(); await first; await second;
  assert.equal(h.db.log.rpc.filter((r) => r.name === 'confirm_bond_quest').length, 1);
  assert.ok(h.toasts.includes('Confermata. Ora tocca all’altra persona ♡'));
});

test('M12D: an already confirmed or completed Quest does not call the RPC again', async () => {
  const h = harness({ quests: three({ 1: { confirmed_by: [F] }, 2: { confirmed_by: [F, B], completed_at: '2026-09-30T10:00:00Z' } }) });
  await h.t.hydrateBond();
  await h.t.confirmBondQuest('q1');
  await h.t.confirmBondQuest('q2');
  assert.equal(h.db.log.rpc.length, 0);
});

test('M12D: confirmation failure keeps the persisted truth and tells the user to retry', async () => {
  const h = harness({ quests: three() });
  await h.t.hydrateBond();
  h.db.handlers.confirm_bond_quest = () => ({ data: null, error: { message: 'network' } });
  await h.t.confirmBondQuest('q1');
  assert.ok(h.toasts.includes('Conferma non riuscita. Riprova.'));
  assert.equal(h.cards()[0].state, 'available');
  assert.doesNotMatch(h.cards()[0].confirm, /Confermo…/);
  assert.deepEqual(h.pushes, [], 'no push for a confirmation that did not persist');
});

test('M12D: reroll respects the board state and weekly budget before calling the RPC', async () => {
  const zero = harness({ quests: three(), rerolls: 3 });
  await zero.t.hydrateBond();
  assert.ok(zero.cards().every((x) => x.reroll === 'locked'));
  assert.match(zero.els.questWeekBoard.innerHTML, /Cambi finiti/);
  assert.match(zero.cards()[0].body, /class="quest-reroll is-locked"[^>]*disabled[^>]*aria-label="Cambi finiti per questa settimana"/);
  await zero.t.rerollBondQuest('q1');
  assert.equal(zero.db.log.rpc.length, 0);
  assert.ok(zero.toasts.includes('Avete finito i cambi di questa settimana'));

  const confirmed = harness({ quests: three({ 1: { confirmed_by: [B] }, 2: { confirmed_by: [F, B], completed_at: '2026-09-30T10:00:00Z' } }) });
  await confirmed.t.hydrateBond();
  assert.match(confirmed.cards()[0].body, /aria-label="Già confermata: non si può più cambiare"/);
  await confirmed.t.rerollBondQuest('q1');
  await confirmed.t.rerollBondQuest('q2');
  assert.equal(confirmed.db.log.rpc.length, 0, 'a confirmed or completed Quest can never be replaced');
});

test('M12D: reroll is deterministic, mode-aware, one at a time, and rerenders from the server', async () => {
  const run = async (me) => {
    const h = harness({ me, quests: three(), rerolls: 1, distanceKm: 10 });
    await h.t.hydrateBond();
    let release;
    h.db.handlers.reroll_bond_quest = ({ target_quest_id, target_template_key }) => new Promise((r) => { release = () => {
      const row = h.rows.bond_weekly_quests.find((x) => x.id === target_quest_id);
      const t = TEMPLATES.find((x) => x.key === target_template_key);
      Object.assign(row, { template_key: t.key, title: t.title, category: t.category, rarity: t.rarity, xp: t.xp });
      h.rows.bond_weekly_state[0].rerolls_used = 2;
      r({ data: { rerolls_used: 2 }, error: null });
    }; });
    const first = h.t.rerollBondQuest('q1');
    const again = h.t.rerollBondQuest('q2');
    for (let i = 0; i < 5 && !release; i++) await new Promise((r) => setImmediate(r));
    release(); await first; await again;
    const calls = h.db.log.rpc.filter((r) => r.name === 'reroll_bond_quest');
    assert.equal(calls.length, 1, 'a second reroll tap waits for the first');
    assert.deepEqual(Object.keys(calls[0].args), ['target_quest_id', 'target_template_key']);
    assert.ok(['e', 'f'].includes(calls[0].args.target_template_key), 'near couple: any/near templates not already on the board');
    assert.ok(h.toasts.includes('Nuova quest · 1 cambio rimasto'));
    assert.match(h.els.questWeekBoard.innerHTML, /1 cambio rimasto/);
    return calls[0].args.target_template_key;
  };
  assert.equal(await run(F), await run(B), 'both phones propose the same replacement');
  assert.doesNotMatch(BOARD_BLOCK, /Math\.random/);
});

test('M12D: server reroll refusal is surfaced and nothing is replaced locally', async () => {
  const h = harness({ quests: three(), rerolls: 2 });
  await h.t.hydrateBond();
  h.db.handlers.reroll_bond_quest = () => ({ data: null, error: { message: 'No rerolls left' } });
  await h.t.rerollBondQuest('q1');
  assert.ok(h.toasts.includes('Avete finito i cambi di questa settimana'));
  assert.equal(h.cards()[0].id, 'q1');
  assert.match(h.cards()[0].body, /Quest 1/);
});

test('M12D: near / far / any selection is unchanged (initial board and reroll pool)', () => {
  const h = harness();
  const pick = (mode) => Array.from(h.t.selectInitialQuestTemplates(TEMPLATES, mode, '2026-09-28', C), (t) => t.key);
  for (const mode of ['near', 'far', 'any']) {
    const keys = pick(mode);
    assert.equal(keys.length, 3);
    assert.equal(new Set(keys).size, 3, 'no duplicate template on one board');
    for (const k of keys) { const m = TEMPLATES.find((t) => t.key === k).mode; assert.ok(m === 'any' || m === mode, `${mode}: ${k}`); }
    assert.deepEqual(pick(mode), keys, 'deterministic per couple and week');
  }
  assert.ok(!pick('any').some((k) => ['a', 'b', 'f'].includes(k)), 'unknown distance falls back to any-only templates');
  for (const mode of ['near', 'far', 'any']) {
    const p = h.api.pickReroll(TEMPLATES, mode, new Set(['c']), 'seed');
    assert.ok(p.mode === 'any' || p.mode === mode); assert.notEqual(p.key, 'c');
  }
  assert.equal(h.api.pickReroll(TEMPLATES, 'any', new Set(['c', 'd', 'e']), 'x'), null);
  assert.match(QUEST_BLOCK, /if\(!rows\|\|rows\.length<2\)return 'any';/, 'location unavailable keeps the any fallback');
});

test('M12D: Quest week is the Europe/Rome Monday, stable through the week, regardless of device time zone', () => {
  const { api } = harness();
  const w = (iso) => api.weekStart(new Date(iso));
  assert.equal(w('2026-09-28T00:30:00+02:00'), '2026-09-28');
  assert.equal(w('2026-10-01T12:00:00Z'), '2026-09-28');
  assert.equal(w('2026-10-04T21:59:00Z'), '2026-09-28', 'Sunday 23:59 in Rome is still this week');
  assert.equal(w('2026-10-04T22:00:00Z'), '2026-10-05', 'Monday 00:00 in Rome starts the next week');
  assert.equal(w('2026-10-04T23:30:00-07:00'), '2026-10-05', 'a phone in another time zone lands on the same Rome week');
  assert.equal(w('2026-10-26T12:00:00Z'), '2026-10-26', 'DST change week');
  assert.equal(api.weekRange('2026-09-28'), '28 set – 4 ott');
  assert.equal(api.nextWeek('2026-09-28'), 'lunedì 5 ott');
});

test('M12D: recent weeks are read-only context from previous weeks, never the current one', async () => {
  const hist = [
    { id: 'p1', couple_id: C, week_start: '2026-09-21', slot: 1, title: 'Vecchia 1', completed_at: '2026-09-22T10:00:00Z' },
    { id: 'p2', couple_id: C, week_start: '2026-09-21', slot: 2, title: 'Vecchia 2', completed_at: null },
    { id: 'p3', couple_id: C, week_start: '2026-09-14', slot: 1, title: 'Più vecchia', completed_at: null },
    { id: 'x1', couple_id: C2, week_start: '2026-09-21', slot: 1, title: 'Altra coppia', completed_at: '2026-09-22T10:00:00Z' },
  ];
  const h = harness({ quests: three(), history: hist });
  await h.t.hydrateBond();
  const list = h.els.questRecentList.innerHTML;
  assert.equal(h.els.questRecent.hidden, false);
  assert.match(list, /21 set – 27 set[\s\S]*?1 \/ 3[\s\S]*?Vecchia 1/);
  assert.match(list, /14 set – 20 set[\s\S]*?0 \/ 3[\s\S]*?Nessuna completata/);
  assert.doesNotMatch(list, /Altra coppia|Quest 1/);
  assert.equal(h.cards().length, 3, 'old rows never enter the weekly board');
  const weeks = h.api.recentWeeks([{ week_start: '2026-09-28', title: 'now', completed_at: 'x' }], '2026-09-28');
  assert.equal(weeks.length, 0);
  const recentRead = h.db.log.reads.find((r) => r.table === 'bond_weekly_quests' && r.filters.some((f) => f.startsWith('lt:week_start')));
  assert.ok(recentRead.filters.includes(`eq:couple_id:${C}`));
});

test('M12D: every Quest read is scoped to the current couple', async () => {
  const h = harness({ quests: three(), history: [{ id: 'x', couple_id: C2, week_start: '2026-09-28', slot: 1, title: 'Intrusa' }] });
  await h.t.hydrateBond();
  for (const r of h.db.log.reads.filter((r) => r.table.startsWith('bond_weekly'))) assert.ok(r.filters.includes(`eq:couple_id:${C}`), JSON.stringify(r));
  assert.doesNotMatch(h.els.bondQuestList.innerHTML, /Intrusa/);
});

test('M12D: identity switch never leaves the previous couple’s confirmations on screen', async () => {
  const h = harness({ quests: three({ 1: { confirmed_by: [B] } }) });
  await h.t.hydrateBond();
  assert.match(h.els.bondQuestList.innerHTML, /Beatrice ha confermato/);
  // Mid-flight switch: the late answer for the old identity is discarded.
  const pending = h.t.hydrateBond();
  h.window.usProfile = { id: F2, couple_id: C2, display_name: 'Altro' };
  await pending;
  await h.t.hydrateBond();
  assert.doesNotMatch(h.els.bondQuestList.innerHTML, /Beatrice/);
  assert.equal(h.cards().length, 0);
  assert.deepEqual(h.window.usBondQuests, []);
});

test('M12D: confirmation answered after an identity switch is not rendered for the new identity', async () => {
  const h = harness({ quests: three() });
  await h.t.hydrateBond();
  let release;
  h.db.handlers.confirm_bond_quest = () => new Promise((r) => { release = () => r({ data: { xp_awarded: 20 }, error: null }); });
  const p = h.t.confirmBondQuest('q1');
  h.window.usProfile = { id: F2, couple_id: C2, display_name: 'Altro' };
  release(); await p;
  assert.deepEqual(h.toasts, []);
  assert.deepEqual(h.pushes, []);
});

test('M12D: network error before first load shows a retry state; after a load it keeps cards and marks them stale', async () => {
  const cold = harness({ quests: three(), fail: ['bond_weekly_quests'], failOnly: (filters) => filters.some((f) => f[1] === 'week_start' && f[0] === 'eq') });
  await cold.t.hydrateBond();
  assert.match(cold.els.bondQuestList.innerHTML, /Quest non disponibili/);
  assert.match(cold.els.bondQuestList.innerHTML, /data-quest-retry/);

  const warm = harness({ quests: three({ 1: { confirmed_by: [B] } }) });
  await warm.t.hydrateBond();
  warm.rows.fail = ['profiles'];
  await warm.t.hydrateBond();
  assert.equal(warm.cards().length, 3);
  assert.match(warm.els.questWeekBoard.innerHTML, /Non aggiornato[\s\S]*?data-quest-retry/);
  warm.rows.fail = [];
  await warm.t.hydrateBond();
  assert.doesNotMatch(warm.els.questWeekBoard.innerHTML, /Non aggiornato/);
});

test('M12D: partial failure of the history read never blocks the weekly board', async () => {
  const h = harness({ quests: three(), fail: ['bond_weekly_quests'], failOnly: (filters) => filters.some((f) => f[0] === 'lt') });
  await h.t.hydrateBond();
  assert.equal(h.cards().length, 3);
  assert.equal(h.els.questRecent.hidden, true);
});

test('M12D: empty week shows a calm empty state with retry, no fake slots', async () => {
  const h = harness({ quests: [] });
  h.rows.bond_quest_templates = [];
  await h.t.hydrateBond();
  assert.equal(h.cards().length, 0);
  assert.match(h.els.bondQuestList.innerHTML, /Le quest della settimana stanno arrivando[\s\S]*?data-quest-retry/);
  assert.match(h.els.questWeekBoard.innerHTML, /0<\/b><span>\/ 3/);
});

test('M12D: week initialization keeps the existing idempotent slot fill and the 23505 tolerance', () => {
  const ensure = slice('async function ensureBondWeek(', '// ===== M12D · Quest V2');
  assert.match(ensure, /if\(\(existing\|\|\[\]\)\.length>=3\)return;/);
  assert.match(ensure, /if\(existingSlots\.has\(slot\)\|\|!t\)continue;/);
  assert.match(ensure, /error\.code!=='23505'/);
  assert.doesNotMatch(ensure, /\.update\(|\.delete\(|\.upsert\(/);
});

test('M12D: no client XP authority, no Quest-only total, no direct writes to confirmation or bond_xp', () => {
  assert.doesNotMatch(app, /from\('couples'\)\.update|bond_xp\s*:/);
  assert.doesNotMatch(BOARD_BLOCK, /from\('bond_weekly_quests'\)\.(update|upsert|delete)|from\('bond_weekly_state'\)\.(update|upsert|delete)/);
  assert.doesNotMatch(BOARD_BLOCK, /[{,]\s*(confirmed_by|completed_at|xp_awarded|bond_xp)\s*:/, 'no object literal that writes these fields');
  assert.doesNotMatch(BOARD_BLOCK, /reduce\([^)]*xp/, 'no summed Quest XP total');
  assert.match(app, /sb\.rpc\('confirm_bond_quest',\{target_quest_id:id\}\)/);
  assert.match(app, /sb\.rpc\('reroll_bond_quest',\{target_quest_id:id,target_template_key:pick\.key\}\)/);
});

test('M12D: one weekly surface inside the existing Quest section; no new page or navigation', () => {
  const section = html.match(/<section class="noi-living-section"[\s\S]*?<\/section>\n      <\/section>|<section class="noi-living-section"[\s\S]*?id="questRecent"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(section, /id="questWeekBoard" class="quest-week" hidden/);
  assert.ok(section.indexOf('questWeekBoard') < section.indexOf('bondQuestList'));
  assert.match(section, /id="questRecent" aria-labelledby="questRecentTitle" hidden/);
  assert.match(app, /if\(view==='quest'&&window\.usProfile\)hydrateBond\(\);/);
  assert.equal((html.match(/data-page="/g) || []).length, (read('index.html').match(/data-page="/g) || []).length);
});

test('M12D: accessibility — 44px actions, focusable retry, reduced motion', () => {
  assert.match(css, /\.quest-reroll\{width:44px;height:44px/);
  assert.match(css, /\.quest-week-retry\{min-height:44px/);
  assert.match(css, /\.quest-confirm\{min-height:44px/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.quest-v2,\.quest-v2 \*\{transition:none!important;animation:none!important\}\}/);
  assert.match(BOARD_BLOCK, /role="progressbar"/);
  assert.match(html, /id="bondQuestList" class="bond-quest-list noi-living-list" aria-live="polite"/);
});

test('M12D: no migration, no Game V2, Daily, Event or Living Archive change from the Quest block', () => {
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort();
  assert.equal(migrations.at(-1), '20261001093123_m12b_4_daily_question_keepsakes.sql');
  assert.doesNotMatch(BOARD_BLOCK, /game_v2|game_sessions|start_game_round|daily_|shared_event|moments|living_provenance|keepsake/i);
});
