const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const bond = () => read('index.html').match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
const app = () => read('app.js');
const css = () => read('styles.css');

test('M9D (US 1.0): Noi opens on four active cards, in order, with no new bottom tab', () => {
  const hub = bond().match(/<nav class="noi-hub" id="noiHub"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.notEqual(hub, '');
  const kickers = [...hub.matchAll(/<span class="noi-hub-kicker">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(kickers, ['Sintonia', 'Calendario', 'Quest di coppia', 'Eventi']);
  assert.match(hub, /data-noi-open="resonance"/);
  assert.doesNotMatch(hub, /data-noi-open="da-vivere"/);
  assert.match(hub, /data-noi-open="quest"/);
  assert.match(hub, /data-noi-open="eventi"/);
  assert.match(hub, /id="usCalendarEntry" onclick="openCalendarSurface\(\)"/, 'Calendario opens the existing calendar surface');
  assert.match(bond(), /data-noi-view="hub"/);
  assert.match(bond(), /id="noiSectionBar" hidden/);
  const nav = read('index.html').match(/<nav class="nav[^"]*"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.deepEqual([...nav.matchAll(/data-page="([^"]+)"/g)].map((m) => m[1]), ['home', 'bond', 'moments', 'quiz'], 'bottom navigation keeps its four tabs');
});

test('M9D + HUMAN-UI-02: Sintonia keeps the one-hero geometry, other destinations stay compact', () => {
  const s = css();
  assert.match(s, /\.noi-hub\{display:grid;grid-template-columns:minmax\(0,1fr\);/);
  assert.match(s, /\.noi-hub-card--resonance\{min-height:150px;/);
  assert.match(s, /\.noi-hub-card:not\(\.noi-hub-card--resonance\)\{flex-direction:row;[^}]*min-height:64px/);
  for (const icon of ['infinity-regular', 'compass-regular', 'calendar-dots-regular', 'flag-banner-regular', 'caret-left-regular']) {
    assert.match(s, new RegExp(`/assets/icons/phosphor/${icon}\\.svg`));
    const svg = read(`assets/icons/phosphor/${icon}.svg`);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 256 256" fill="currentColor">/, `${icon} is an unmodified Phosphor asset`);
  }
});

test('M9D: each surface shows alone; the hub header yields to a back bar', () => {
  const s = css();
  assert.match(s, /#bond \.noi-canonical-page:not\(\[data-noi-view="hub"\]\)>\.noi-canonical-head\{display:none\}/);
  assert.match(s, /#bond \.noi-canonical-page:not\(\[data-noi-view="resonance"\]\)>\.noi-resonance,#bond \.noi-canonical-page:not\(\[data-noi-view="resonance"\]\)>\.noi-resonance-guide\{display:none!important\}/);
  assert.match(s, /#bond \.noi-canonical-page:not\(\[data-noi-view="quest"\]\)>\.noi-living-section\{display:none!important\}/);
  assert.match(s, /#bond \.noi-canonical-page:not\(\[data-noi-view="da-vivere"\]\)>\.noi-idea-section\{display:none!important\}/);
});

test('M9D: the back path is the shared navigation history (system Back included)', () => {
  const nav = read('navigation.js');
  assert.match(nav, /name:'noi-section',\s*find:\(\)=>document\.getElementById\('noiHub'\),\s*open:el=>Boolean\(el&&el\.hidden\),\s*close:\(\)=>window\.closeNoiSection\?\.\(\)/);
  assert.match(nav, /name:'noi-idea-detail'[\s\S]*?close:\(\)=>window\.closeNoiIdeaDetail\?\.\(\)/);
  assert.ok(nav.indexOf("name:'noi-section'") < nav.indexOf("name:'calendar'"), 'the calendar opened from Da vivere stays above the Noi surface');
  assert.match(app(), /document\.getElementById\('noiSectionBack'\)\?\.addEventListener\('click',closeNoiSection\)/);
  assert.match(app(), /if\(current==='bond'\)window\.closeNoiSection\?\.\(\);/, 'leaving Noi returns it to the hub');
  assert.match(app(), /if\(id==='bond'&&options\.nav\)window\.closeNoiSection\?\.\(\);/, 're-tapping the Noi tab returns to the hub');
  assert.match(app(), /function openNoiIdeaDetail\(id\)\{\s*const item=noiIdeaFindItem\(id\);\s*if\(!item\)return;\s*openNoiSection\('da-vivere'\);/, 'Ricordi deep links land inside Da vivere');
});

test('M9D/Progression V1: Sintonia explains only server-backed meaningful actions', () => {
  const guide = bond().match(/<section class="noi-resonance-guide"[\s\S]*?<\/section>/)?.[0] || '';
  const sources = [...guide.matchAll(/<li><b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(sources, ['Quest ed eventi', 'Domanda del giorno e Gioca', 'Ti penso e Ricordi', 'Mesiversario e anniversario']);
  const migration = read('supabase/migrations_history/20261002181500_us_progression_v1.sql');
  for (const kind of ['quest','event','daily','game','think','moment','milestone']) assert.match(migration, new RegExp(`'${kind}'`), kind);
  assert.match(migration, /progression_award/);
  assert.match(migration, /unique \(couple_id, source_kind, source_key\)/, 'one source cannot farm progression');
  assert.match(app(), /needed=200\+\(level-1\)\*150/, 'level curve stays the existing Bond curve');
  assert.match(app(), /const resTotal=document\.getElementById\('noiResonanceTotal'\);if\(resTotal\)resTotal\.textContent=info\.total/);
  assert.doesNotMatch(app(), /bond_xp\s*[+:]=|update\(\{bond_xp/, 'client never becomes progression authority');
});
test('M9D runtime: hub summaries come from loaded data only; sections open and close', () => {
  const src = app();
  const start = src.indexOf('function renderNoiHubSummary(){');
  const summary = src.slice(start, src.indexOf('\n}\n', start) + 3);
  const hubStart = src.indexOf('// ===== M9D · Noi hub =====');
  const hub = src.slice(hubStart, src.indexOf("document.getElementById('noiHub')?.addEventListener", hubStart));
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, hidden: false, textContent: '', dataset: {}, style: {}, classList: { contains: () => true }, focus() {}, addEventListener() {}, querySelector: () => null }); return els.get(id); };
  const page = { dataset: { noiView: 'hub' } };
  const calls = [];
  const window = { usProfile: { id: 'u1' } };
  const context = {
    window, console,
    document: { getElementById: el, querySelector: (sel) => (sel === '#bond .noi-canonical-page' ? page : null) },
    scrollTo() {},
    noiIdeaState: { loaded: false, error: false, activeItems: [] },
    hydrateNoiIdeas: () => calls.push('hydrate'),
    closeNoiIdeaDetail: () => calls.push('closeDetail'),
    toggleNoiIdeaQuickForm: (open) => calls.push(`quick:${open}`)
  };
  vm.createContext(context);
  vm.runInContext(`${summary}\n${hub}\nthis.renderNoiHubSummary=renderNoiHubSummary;`, context);

  context.renderNoiHubSummary();
  assert.equal(el('noiHubIdeasTitle').textContent, 'Le vostre idee', 'nothing invented before the ideas load');
  assert.equal(el('noiHubQuestTitle').textContent, 'Questa settimana');

  context.noiIdeaState.loaded = true;
  context.noiIdeaState.activeItems = [{ status: 'idea' }, { status: 'scheduled' }, { status: 'idea' }];
  window.usBondQuests = [{ completed_at: 'x' }, { completed_at: null }, { completed_at: null }];
  context.renderNoiHubSummary();
  assert.equal(el('noiHubIdeasTitle').textContent, '3 idee da vivere');
  assert.equal(el('noiHubIdeasMeta').textContent, '1 in calendario');
  assert.equal(el('noiHubQuestTitle').textContent, '1 di 3 completate');
  context.noiIdeaState.activeItems = [];
  window.usBondQuests = [{ completed_at: 'x' }];
  context.renderNoiHubSummary();
  assert.equal(el('noiHubIdeasTitle').textContent, 'Nessuna idea');
  assert.equal(el('noiHubQuestTitle').textContent, 'Tutte completate');

  window.openNoiSection('nope');
  assert.equal(page.dataset.noiView, 'hub', 'unknown sections are ignored');
  context.noiIdeaState.loaded = false;
  window.openNoiSection('da-vivere');
  assert.equal(page.dataset.noiView, 'da-vivere');
  assert.equal(el('noiHub').hidden, true);
  assert.equal(el('noiSectionBar').hidden, false);
  assert.deepEqual(calls, ['hydrate']);
  window.closeNoiSection();
  assert.equal(page.dataset.noiView, 'hub');
  assert.equal(el('noiHub').hidden, false);
  assert.equal(el('noiSectionBar').hidden, true);
  assert.deepEqual(calls, ['hydrate', 'closeDetail', 'quick:false'], 'leaving Da vivere closes its detail and quick form');
  window.closeNoiSection();
  assert.equal(calls.length, 3, 'closing the hub is a no-op');
});
