// M12A → redesign D9 — Oggi arbitration: above the nav the Domanda di oggi
// only; the legacy calendar widget and reveal link never take a slot.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const source = app.slice(app.indexOf('function arbitrateOggi('), app.indexOf('window.UsOggi=Object.freeze('));

function build(state) {
  const elements = {};
  for (const id of ['usOggiCalendarWidget', 'usDailyRitual', 'usDailyRevealLink']) {
    elements[id] = { id, hidden: true, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  }
  if (state.daily) { elements.usDailyRitual.hidden = false; elements.usDailyRitual.dataset.state = state.daily; }
  if (state.calendar) elements.usOggiCalendarWidget.hidden = false;
  if (state.revealLink) elements.usDailyRevealLink.hidden = false;
  const sandbox = { document: { getElementById: (id) => elements[id] || null }, String, Number, Array, Object };
  vm.runInNewContext(`${source}\nthis.api={arbitrateOggi,applyOggiArbitration,collectOggiCandidates};`, sandbox);
  return { api: sandbox.api, elements };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const slotOf = (elements) => Object.fromEntries(Object.entries(elements).map(([id, el]) => [id, el.attrs['data-us-oggi-slot'] || null]));

test('arbitration: pure function picks the lowest rank per slot, ties broken by id', () => {
  const { api } = build({});
  assert.deepEqual(plain(api.arbitrateOggi([
    { id: 'b', slot: 'evidence', rank: 20 }, { id: 'a', slot: 'evidence', rank: 20 }, { id: 'c', slot: 'evidence', rank: 30 },
    { id: 'd2', slot: 'daily', rank: 30 }, { id: 'd1', slot: 'daily', rank: 10 }
  ])), { evidence: 'a', daily: 'd1' });
  assert.deepEqual(plain(api.arbitrateOggi([])), { evidence: null, daily: null });
  assert.deepEqual(plain(api.arbitrateOggi([{ id: 'x', slot: 'nonsense', rank: 1 }, { id: 'y', slot: 'evidence', rank: NaN }, null])), { evidence: null, daily: null });
});

test('redesign D9: the Domanda di oggi is the one card; the retired calendar widget and reveal link never take a slot', () => {
  const s = build({ daily: 'waiting', calendar: true, revealLink: true });
  s.api.applyOggiArbitration();
  assert.deepEqual(slotOf(s.elements), { usOggiCalendarWidget: 'suppressed', usDailyRitual: 'daily', usDailyRevealLink: 'suppressed' });
  assert.deepEqual(plain(s.api.collectOggiCandidates()), [{ id: 'usDailyRitual', slot: 'daily', rank: 0 }]);
  const none = build({ calendar: true });
  assert.deepEqual(plain(none.api.applyOggiArbitration()), { evidence: null, daily: null });
  assert.equal(slotOf(none.elements).usOggiCalendarWidget, 'suppressed');
});

test('arbitration: exhaustively, the Domanda di oggi is never pushed away and nothing is lost', () => {
  let cases = 0;
  for (const daily of [null, 'invited', 'answer', 'waiting', 'ready', 'revealed', 'error']) for (let flags = 0; flags < 4; flags += 1) {
    const state = { daily, calendar: Boolean(flags & 1), revealLink: Boolean(flags & 2) };
    const s = build(state);
    const winner = s.api.applyOggiArbitration();
    const slots = slotOf(s.elements);
    assert.equal(Object.values(slots).filter((slot) => slot === 'evidence').length, 0, JSON.stringify(state));
    if (daily) assert.equal(slots.usDailyRitual, 'daily', JSON.stringify(state));
    for (const [id, el] of Object.entries(s.elements)) assert.equal(slots[id] === null, el.hidden, `${id} ${JSON.stringify(state)}`);
    assert.deepEqual(plain(s.api.applyOggiArbitration()), plain(winner), 'deterministic');
    cases += 1;
  }
  assert.equal(cases, 7 * 4);
});

test('arbitration is wired to the hero, suppressed surfaces are only hidden, the cards of suggestions are gone', () => {
  assert.match(app, /new MutationObserver\(schedule\)\.observe\(hero,\{subtree:true,childList:true,attributes:true,attributeFilter:\['hidden','data-state'\]\}\)/);
  assert.match(read('styles.css'), /\[data-us-oggi-slot="suppressed"\]\{display:none!important\}/);
  assert.doesNotMatch(source, /distanceWidget/);
  assert.match(app, /US_OGGI_SURFACES=Object\.freeze\(\['usDailyRitual','usOggiCalendarWidget','usDailyRevealLink'\]\)/);
  assert.doesNotMatch(app, /usTodayPriorityRegion|pushOptInCard|US_OGGI_PRIMARY_RANK|US_OGGI_PUSH_RANK|usTodayPrioritiesKnown/);
});
