// M12A — Oggi arbitration: at most one primary item and one quiet item, deterministically.
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

test('arbitration: pure function picks the lowest rank per slot, ties broken by id', () => {
  const { api } = build({});
  assert.deepEqual(plain(api.arbitrateOggi([
    { id: 'b', slot: 'primary', rank: 20 }, { id: 'a', slot: 'primary', rank: 20 }, { id: 'c', slot: 'primary', rank: 30 },
    { id: 'q2', slot: 'quiet', rank: 30 }, { id: 'q1', slot: 'quiet', rank: 10 }
  ])), { primary: 'a', quiet: 'q1' });
  assert.deepEqual(plain(api.arbitrateOggi([])), { primary: null, quiet: null });
  assert.deepEqual(plain(api.arbitrateOggi([{ id: 'x', slot: 'nonsense', rank: 1 }, { id: 'y', slot: 'primary', rank: NaN }, null])), { primary: null, quiet: null });
});

test('arbitration: a Ti penso beats the Daily Question, which beats nothing; the event stays quiet', () => {
  const think = build({ priority: 'received_ready', daily: 'answer', calendar: true, push: true });
  think.api.applyOggiArbitration();
  assert.deepEqual(slotOf(think.elements), {
    usTodayPriorityRegion: 'primary', usOggiCalendarWidget: 'quiet', usDailyRitual: 'suppressed', usDailyRevealLink: null, pushOptInCard: 'suppressed'
  });

  const dailyOnly = build({ daily: 'answer', push: true });
  dailyOnly.api.applyOggiArbitration();
  assert.equal(slotOf(dailyOnly.elements).usDailyRitual, 'primary');
  assert.equal(slotOf(dailyOnly.elements).pushOptInCard, 'quiet', 'push opt-in fills the quiet slot only when nothing else does');
});

test('arbitration: an event is informational (quiet) and never displaces the Daily Question', () => {
  const s = build({ priority: 'couple_context', daily: 'answer', calendar: true, revealLink: true, push: true });
  s.api.applyOggiArbitration();
  assert.deepEqual(slotOf(s.elements), {
    usTodayPriorityRegion: 'quiet', usOggiCalendarWidget: 'suppressed', usDailyRitual: 'primary', usDailyRevealLink: 'suppressed', pushOptInCard: 'suppressed'
  });
});

test('arbitration: partner already answered outranks a fresh question; errors rank last', () => {
  const s = build({ daily: 'invited' });
  assert.equal(s.api.collectOggiCandidates()[0].rank, 40);
  assert.equal(build({ daily: 'answer' }).api.collectOggiCandidates()[0].rank, 50);
  assert.equal(build({ daily: 'error' }).api.collectOggiCandidates()[0].rank, 60);
  const reveal = build({ priority: 'answers_ready', daily: 'invited' });
  reveal.api.applyOggiArbitration();
  assert.equal(slotOf(reveal.elements).usTodayPriorityRegion, 'primary');
  assert.equal(slotOf(reveal.elements).usDailyRitual, 'suppressed');
});

test('arbitration: exhaustively, never more than one primary and one quiet surface', () => {
  const priorities = [null, 'received_ready', 'answers_ready', 'waiting_for_me', 'couple_context'];
  const dailies = [null, 'invited', 'answer', 'error'];
  let cases = 0;
  for (const priority of priorities) for (const daily of dailies) for (let flags = 0; flags < 8; flags += 1) {
    const state = { priority, daily, calendar: Boolean(flags & 1), revealLink: Boolean(flags & 2), push: Boolean(flags & 4) };
    const s = build(state);
    const winner = s.api.applyOggiArbitration();
    const slots = slotOf(s.elements);
    const visible = Object.entries(slots).filter(([, slot]) => slot === 'primary' || slot === 'quiet');
    assert.ok(visible.filter(([, slot]) => slot === 'primary').length <= 1, JSON.stringify(state));
    assert.ok(visible.filter(([, slot]) => slot === 'quiet').length <= 1, JSON.stringify(state));
    // Everything that exists is either shown in a slot or only suppressed, never lost.
    for (const [id, el] of Object.entries(s.elements)) assert.equal(slots[id] === null, el.hidden, `${id} ${JSON.stringify(state)}`);
    // Deterministic: a second pass gives the same answer.
    assert.deepEqual(plain(s.api.applyOggiArbitration()), plain(winner));
    cases += 1;
  }
  assert.equal(cases, 5 * 4 * 8);
});

test('arbitration is wired to the hero, suppressed surfaces are only hidden, distance does not count', () => {
  assert.match(app, /new MutationObserver\(schedule\)\.observe\(hero,\{subtree:true,childList:true,attributes:true,attributeFilter:\['hidden','data-state'\]\}\)/);
  assert.match(read('styles.css'), /\[data-us-oggi-slot="suppressed"\]\{display:none!important\}/);
  assert.doesNotMatch(source, /distanceWidget/);
  assert.match(source, /US_OGGI_SURFACES=Object\.freeze\(\['usTodayPriorityRegion','usOggiCalendarWidget','usDailyRitual','usDailyRevealLink','pushOptInCard'\]\)/);
});
