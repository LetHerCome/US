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

test('M9D / 1.0: Noi opens on its calendar with three destinations, no old hub, no new bottom tab', () => {
  const page = bond();
  // 1.0 (N10): the invisible old Lavagna and hub are gone with their loaders.
  assert.doesNotMatch(page, /id="noiHub"|id="noiWeekBoard"|noi-hub-card/);
  assert.doesNotMatch(read('calendar.js'), /noiWeekBoard|refreshNoiWeekBoard/);
  const links = page.match(/<nav class="us-noi-v2-links"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.deepEqual([...links.matchAll(/data-noi-open-link="([^"]+)"/g)].map((m) => m[1]), ['lavagna', 'quest', 'eventi']);
  assert.deepEqual([...links.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]), ['Lavagna', 'Missioni', 'Eventi']);
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
  // 1.0: the section is open while its bar is shown (the old hub is gone).
  assert.match(nav, /name:'noi-section',\s*find:\(\)=>document\.getElementById\('noiSectionBar'\),\s*open:el=>Boolean\(el&&!el\.hidden\),\s*close:\(\)=>window\.closeNoiSection\?\.\(\)/);
  assert.match(nav, /name:'noi-idea-detail'[\s\S]*?close:\(\)=>window\.closeNoiIdeaDetail\?\.\(\)/);
  assert.ok(nav.indexOf("name:'noi-section'") < nav.indexOf("name:'events'"), 'an Eventi editor opened from the section stays above it');
  assert.ok(nav.indexOf("name:'noi-section'") < nav.indexOf("name:'noi-idea-detail'"), 'an open idea stays above Missioni');
  assert.doesNotMatch(nav, /name:'calendar',/, 'the old full-screen calendar layer is gone');
  assert.match(app(), /document\.getElementById\('noiSectionBack'\)\?\.addEventListener\('click',closeNoiSection\)/);
  assert.match(app(), /if\(current==='bond'\)window\.closeNoiSection\?\.\(\);/, 'leaving Noi returns it to the hub');
  assert.match(app(), /if\(id==='bond'&&options\.nav\)window\.closeNoiSection\?\.\(\);/, 're-tapping the Noi tab returns to the hub');
  // 1.0 (N9): Le vostre idee live inside Missioni; Ricordi deep links land there.
  assert.match(app(), /function openNoiIdeaDetail\(id\)\{\s*const item=noiIdeaFindItem\(id\);\s*if\(!item\)return;\s*openNoiSection\('quest'\);/);
});

test('M9D/Progression V1: Sintonia explains only server-backed meaningful actions', () => {
  // S5 1.0 — one line under the bar replaces the old guide; each source opens its place.
  const grow = bond().match(/<p class="noi-resonance-grow"[\s\S]*?<\/p>/)?.[0] || '';
  const sources = [...grow.matchAll(/data-sintonia-go="([a-z]+)">([^<]+)<\/button>/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(sources, ['daily:la domanda di oggi', 'games:una partita', 'quest:una missione', 'memory:un ricordo']);
  assert.match(grow, /Cresce con le cose che fate insieme:/);
  assert.doesNotMatch(bond(), /noi-resonance-guide/);
  const migration = read('supabase/migrations_history/20261002181500_us_progression_v1.sql');
  for (const kind of ['quest','event','daily','game','think','moment','milestone']) assert.match(migration, new RegExp(`'${kind}'`), kind);
  assert.match(migration, /progression_award/);
  assert.match(migration, /unique \(couple_id, source_kind, source_key\)/, 'one source cannot farm progression');
  assert.match(app(), /needed=200\+\(level-1\)\*150/, 'level curve stays the existing Bond curve');
  assert.match(app(), /const resTotal=document\.getElementById\('noiResonanceTotal'\);if\(resTotal\)resTotal\.textContent=info\.total/);
  assert.doesNotMatch(app(), /bond_xp\s*[+:]=|update\(\{bond_xp/, 'client never becomes progression authority');
});
test('M9D runtime: sections open and close; Le vostre idee open inside Missioni', () => {
  const src = app();
  const hubStart = src.indexOf('// ===== M9D · Noi sections =====');
  const hub = src.slice(hubStart, src.indexOf("document.getElementById('noiSectionBack')?.addEventListener", hubStart));
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, hidden: true, textContent: '', dataset: {}, style: {}, classList: { contains: () => true }, focus() {}, addEventListener() {}, querySelector: () => null }); return els.get(id); };
  const page = { dataset: { noiView: 'hub' } };
  const calls = [];
  const window = { usProfile: { id: 'u1' } };
  const context = {
    window, console,
    document: { getElementById: el, querySelector: (sel) => (sel === '#bond .noi-canonical-page' ? page : null) },
    scrollTo() {},
    noiIdeaState: { loaded: false, error: false, activeItems: [] },
    hydrateBond: () => calls.push('quests'),
    hydrateNoiIdeas: () => calls.push('ideas'),
    closeNoiIdeaDetail: () => calls.push('closeDetail'),
    toggleNoiIdeaQuickForm: (open) => calls.push(`quick:${open}`)
  };
  vm.createContext(context);
  vm.runInContext(hub, context);

  window.openNoiSection('nope');
  assert.equal(page.dataset.noiView, 'hub', 'unknown sections are ignored');
  window.openNoiSection('da-vivere');
  assert.equal(page.dataset.noiView, 'quest', 'the old Da vivere route opens Missioni');
  assert.equal(el('noiSectionBar').hidden, false);
  assert.deepEqual(calls, ['quests', 'ideas'], 'Missioni loads its missions and your ideas');
  window.closeNoiSection();
  assert.equal(page.dataset.noiView, 'hub');
  assert.equal(el('noiSectionBar').hidden, true);
  assert.deepEqual(calls, ['quests', 'ideas', 'closeDetail', 'quick:false'], 'leaving Missioni closes an open idea and the quick form');
  window.closeNoiSection();
  assert.equal(calls.length, 4, 'closing the hub is a no-op');
});
