// M10A/M10B — Oggi reads top-down (personal priority → today's Calendar →
// Daily Question → passive widgets) and the Daily Question card is a compact
// entry point whose state comes only from get_or_create_daily_question +
// get_daily_state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const app = read('app.js');
const hero = html.match(/<section class="hero home-hero-only" id="homeHero"[\s\S]*?<\/section>/)?.[0] || '';

function installCard() {
  const source = app.slice(app.indexOf('const US_TODAY_PRIORITY_ORDER='), app.indexOf('function localDateISO()'));
  const card = { hidden: true, innerHTML: '', dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const window = { usProfile: { role: 'francesco' }, usBondProfiles: [] };
  const context = vm.createContext({
    console, Promise, window,
    document: { getElementById: (id) => (id === 'usDailyRitual' ? card : null) },
    escapeHtml: (v) => String(v).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])),
    partnerFromProfiles: () => null,
  });
  vm.runInContext(source, context);
  return { api: window.UsDailyRitual, card };
}
const question = { id: 'q-1', question: 'Cosa ti farebbe partire bene questa settimana?', question_date: '2026-10-05' };

test('M10A follow-up: Oggi keeps only the actionable notice outside the retired Calendar/Daily stack', () => {
  const stack = hero.match(/<div class="us-oggi-stack" id="usOggiStack">[\s\S]*?\n {6}<\/div>/)?.[0] || '';
  assert.ok(stack, 'legacy Oggi stack remains mounted for existing authorities');
  assert.equal(stack.indexOf('id="usTodayPriorityRegion"'), -1, 'personal notice no longer lives in the retired stack');
  assert.ok(hero.indexOf('id="usTodayPriorityRegion"') >= 0, 'personal notice remains inside the Home hero');
  assert.ok(hero.indexOf('id="usTodayPriorityRegion"') < hero.indexOf('id="usOggiStack"'), 'notice is structurally separate from the retired stack');
  for (const legacy of ['id="usOggiCalendarWidget"', 'id="usDailyRitual"']) assert.ok(stack.indexOf(legacy) >= 0, `${legacy} remains mounted for its authority`);
  for (const passive of ['id="distanceWidget"', 'id="pushOptInCard"', 'id="homeEmptyState"']) {
    assert.equal(stack.indexOf(passive), -1, `${passive} is not in the retired stack`);
  }
  assert.match(css, /#home #usOggiStack\{height:0!important;[^}]*visibility:hidden!important;[^}]*pointer-events:none!important\}/);
  assert.match(css, /#home #usTodayPriorityRegion\{[\s\S]*?position:fixed!important;[\s\S]*?bottom:calc\(10px \+ var\(--us-safe-bottom\) \+ var\(--us-nav-height\) \+ 12px\)!important;/);
  assert.equal((html.match(/id="usOggiCalendarWidget"/g) || []).length, 1);
  assert.match(app, /const fact=await window\.getOggiCalendarInsightSource\?\.\(\);/);
  assert.match(app, /target\.closest\('#usTodayPriorityRegion,/);
  assert.match(app, /const fadeTargets=\[document\.getElementById\('usTodayPriorityRegion'\),document\.getElementById\('usOggiCalendarWidget'\),document\.getElementById\('usDailyRitual'\)/);
});

test('M10A: gli impegni del Calendario sono informazione, mai attenzione animata', () => {
  const render = app.slice(app.indexOf('function renderOggiCalendarWidget'), app.indexOf("document.getElementById('usOggiCalendarWidget')?.addEventListener"));
  assert.doesNotMatch(render, /us-attention-orbit|usAttention|data-us-attention/);
  assert.doesNotMatch(hero.match(/id="usOggiCalendarWidget"[^>]*>/)[0], /us-attention-orbit|data-us-attention/);
});

test('M10B/M10.1A: stati compatti della card — A da rispondere, D errore; risposto/entrambi nessuna card', () => {
  const { api } = installCard();
  const m = (state) => api.viewModel({ question, state, partnerName: 'Beatrice' });
  const a = m({ my_answer: null, partner_has_answer: false, both_answered: false });
  assert.deepEqual({ state: a.state, kicker: a.kicker, cta: a.cta, status: a.status }, { state: 'answer', kicker: 'Domanda del giorno', cta: 'Rispondi', status: '' });
  const a2 = m({ my_answer: null, partner_has_answer: true, both_answered: false });
  assert.deepEqual({ cta: a2.cta, status: a2.status }, { cta: 'Rispondi', status: '' }, 'partner answered first: same compact copy');
  assert.equal(m({ my_answer: 'Mia', partner_has_answer: false, both_answered: false }), null);
  assert.equal(m({ my_answer: 'Mia', partner_has_answer: true, both_answered: true, partner_answer: 'Sua' }), null);
  const d = api.viewModel({ status: 'error' });
  assert.deepEqual({ state: d.state, cta: d.cta }, { state: 'error', cta: 'Riprova' });
});

test('M10B: la card contiene solo kicker, domanda e un segnale — niente testo esplicativo, niente risposte', () => {
  const { api, card } = installCard();
  const secret = 'RISPOSTA-PARTNER';
  for (const state of [
    { my_answer: null, partner_has_answer: false, both_answered: false },
    { my_answer: null, partner_has_answer: true, both_answered: false, partner_answer: secret },
  ]) {
    api.render(api.viewModel({ question, state, partnerName: 'Beatrice' }));
    const text = card.innerHTML.replace(/<[^>]+>/g, '|').split('|').filter(Boolean);
    assert.equal(text.length, 3, `kicker + question + one signal: ${text.join(' / ')}`);
    assert.equal(text[0], 'Domanda del giorno');
    assert.equal(text[1], question.question);
    assert.doesNotMatch(card.innerHTML + JSON.stringify(card.attrs), new RegExp(secret));
  }
  assert.doesNotMatch(app, /Rispondete entrambi, poi scopritevi|Aspettiamo \$\{name\}|ti aspetta`,cta/);
  assert.match(css, /\.us-daily-ritual-question\{[^}]*-webkit-line-clamp:2/);
});

test('M10B: un errore non mostra mai una risposta finta o modificabile', () => {
  const { api, card } = installCard();
  api.render(api.viewModel({ status: 'error' }));
  assert.equal(card.dataset.state, 'error');
  assert.doesNotMatch(card.innerHTML, /<textarea|<input|contenteditable/);
  assert.match(card.innerHTML, /Riprova/);
});

test('M10A: invito empty-state e opt-in notifiche non si sovrappongono alla colonna Oggi', () => {
  // The empty state is placed in the free band under the stack and sheds its secondary lines when short.
  const layout = app.slice(app.indexOf('function layoutOggiEmptyState'), app.indexOf("if(typeof ResizeObserver==='function')"));
  assert.match(layout, /stack\.getBoundingClientRect\(\)\.bottom/);
  assert.match(layout, /\['distanceWidget','pushOptInCard'\]/);
  assert.match(layout, /classList\.add\('is-compact'\)/);
  assert.match(app, /new ResizeObserver\(\(\)=>layoutOggiEmptyState\(\)\)/);
  assert.match(css, /\.home-empty-state\.is-compact \.home-empty-mark,\.home-empty-state\.is-compact \.home-empty-copy small\{display:none\}/);
  // Ti penso lives in the top shell; the opt-in only needs to clear the ambient distance capsule.
  assert.match(read('identity.css'), /#home \.push-optin-card\{bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 70px\)!important\}/);
});
