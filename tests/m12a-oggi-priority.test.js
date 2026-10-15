// M12A → 1.0 — Oggi arbitration: at most one evidence card and the daily card, deterministically.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const source = app.slice(app.indexOf('const US_OGGI_PRIMARY_RANK='), app.indexOf('window.UsOggi=Object.freeze('));

function build(state) {
  const elements = {};
  for (const id of ['usTodayPriorityRegion', 'usOggiCalendarWidget', 'usDailyRitual', 'usDailyRevealLink', 'pushOptInCard']) {
    elements[id] = { id, hidden: true, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  }
  if (state.priority) { elements.usTodayPriorityRegion.hidden = false; }
  if (state.daily) { elements.usDailyRitual.hidden = false; elements.usDailyRitual.dataset.state = state.daily; }
  if (state.calendar) elements.usOggiCalendarWidget.hidden = false;
  if (state.revealLink) elements.usDailyRevealLink.hidden = false;
  if (state.push) elements.pushOptInCard.hidden = false;
  const sandbox = {
    document: { getElementById: (id) => elements[id] || null },
    usTodayPriorityQueue: state.priority ? [{ category: state.priority }] : [],
    String, Number, Array, Object
  };
  vm.runInNewContext(`${source}\nthis.api={arbitrateOggi,applyOggiArbitration,collectOggiCandidates};`, sandbox);
  return { api: sandbox.api, elements };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const slotOf = (elements) => Object.fromEntries(Object.entries(elements).map(([id, el]) => [id, el.attrs['data-us-oggi-slot'] || null]));

// 1.0 — the dock above the nav: at most ONE evidence card (what waits for me,
// otherwise the notifications invite until enabled) and the Domanda di oggi.
test('arbitration: pure function picks the lowest rank per slot, ties broken by id', () => {
  const { api } = build({});
  assert.deepEqual(plain(api.arbitrateOggi([
    { id: 'b', slot: 'evidence', rank: 20 }, { id: 'a', slot: 'evidence', rank: 20 }, { id: 'c', slot: 'evidence', rank: 30 },
    { id: 'd2', slot: 'daily', rank: 30 }, { id: 'd1', slot: 'daily', rank: 10 }
  ])), { evidence: 'a', daily: 'd1' });
  assert.deepEqual(plain(api.arbitrateOggi([])), { evidence: null, daily: null });
  assert.deepEqual(plain(api.arbitrateOggi([{ id: 'x', slot: 'nonsense', rank: 1 }, { id: 'y', slot: 'evidence', rank: NaN }, null])), { evidence: null, daily: null });
});

test('arbitration: a Ti penso takes the evidence card, the Domanda di oggi stays, the invite waits', () => {
  const think = build({ priority: 'received_ready', daily: 'answer', calendar: true, push: true });
  think.api.applyOggiArbitration();
  assert.deepEqual(slotOf(think.elements), {
    usTodayPriorityRegion: 'evidence', usOggiCalendarWidget: 'suppressed', usDailyRitual: 'daily', usDailyRevealLink: null, pushOptInCard: 'suppressed'
  });

  const dailyOnly = build({ daily: 'answer', push: true });
  dailyOnly.api.applyOggiArbitration();
  assert.equal(slotOf(dailyOnly.elements).usDailyRitual, 'daily');
  assert.equal(slotOf(dailyOnly.elements).pushOptInCard, 'evidence', 'O5: the notifications invite is prominent while nothing waits for me');
});

test('arbitration: the retired calendar widget and reveal link never take a slot', () => {
  const s = build({ daily: 'waiting', calendar: true, revealLink: true });
  s.api.applyOggiArbitration();
  assert.deepEqual(slotOf(s.elements), {
    usTodayPriorityRegion: null, usOggiCalendarWidget: 'suppressed', usDailyRitual: 'daily', usDailyRevealLink: 'suppressed', pushOptInCard: null
  });
});

test('arbitration: every priority outranks the notifications invite; Lasciato per te and the mesiversario included', () => {
  for (const category of ['received_ready', 'left_ready', 'answers_ready', 'waiting_for_me', 'celebration']) {
    const s = build({ priority: category, push: true });
    const candidates = s.api.collectOggiCandidates();
    assert.ok(candidates.find((c) => c.id === 'usTodayPriorityRegion').rank < candidates.find((c) => c.id === 'pushOptInCard').rank, category);
    s.api.applyOggiArbitration();
    assert.equal(slotOf(s.elements).pushOptInCard, 'suppressed', category);
  }
});

test('arbitration: exhaustively, never more than one evidence card and one daily card', () => {
  const priorities = [null, 'received_ready', 'left_ready', 'answers_ready', 'waiting_for_me', 'celebration', 'couple_context'];
  const dailies = [null, 'invited', 'answer', 'waiting', 'revealed', 'error'];
  let cases = 0;
  for (const priority of priorities) for (const daily of dailies) for (let flags = 0; flags < 8; flags += 1) {
    const state = { priority, daily, calendar: Boolean(flags & 1), revealLink: Boolean(flags & 2), push: Boolean(flags & 4) };
    const s = build(state);
    const winner = s.api.applyOggiArbitration();
    const slots = slotOf(s.elements);
    const visible = Object.entries(slots).filter(([, slot]) => slot === 'evidence' || slot === 'daily');
    assert.ok(visible.filter(([, slot]) => slot === 'evidence').length <= 1, JSON.stringify(state));
    assert.ok(visible.filter(([, slot]) => slot === 'daily').length <= 1, JSON.stringify(state));
    if (daily) assert.equal(slots.usDailyRitual, 'daily', `the Domanda di oggi is never pushed away ${JSON.stringify(state)}`);
    // Everything that exists is either shown in a slot or only suppressed, never lost.
    for (const [id, el] of Object.entries(s.elements)) assert.equal(slots[id] === null, el.hidden, `${id} ${JSON.stringify(state)}`);
    // Deterministic: a second pass gives the same answer.
    assert.deepEqual(plain(s.api.applyOggiArbitration()), plain(winner));
    cases += 1;
  }
  assert.equal(cases, 7 * 6 * 8);
});

test('arbitration is wired to the hero, suppressed surfaces are only hidden, distance does not count', () => {
  assert.match(app, /new MutationObserver\(schedule\)\.observe\(hero,\{subtree:true,childList:true,attributes:true,attributeFilter:\['hidden','data-state'\]\}\)/);
  assert.match(read('styles.css'), /\[data-us-oggi-slot="suppressed"\]\{display:none!important\}/);
  assert.doesNotMatch(source, /distanceWidget/);
  assert.match(source, /US_OGGI_SURFACES=Object\.freeze\(\['usTodayPriorityRegion','usDailyRitual','pushOptInCard','usOggiCalendarWidget','usDailyRevealLink'\]\)/);
});
