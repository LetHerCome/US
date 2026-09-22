const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M3 trasforma Noi nella root canonicale a tre superfici', () => {
  const html = read('index.html');
  const noi = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';

  assert.match(noi, /class="section bond-page noi-canonical-page"/);
  assert.match(noi, /class="noi-resonance"/);
  assert.match(noi, /class="noi-living-section"/);
  assert.match(noi, /class="noi-idea-section"[^>]*hidden/);
  assert.match(noi, /id="bondPageFill"/);
  assert.match(noi, /id="bondQuestList"/);
  assert.match(noi, /id="usSettingsEntry"/);
  assert.match(noi, /id="bondCompletedCount"[^>]*aria-hidden="true"/);
  assert.match(noi, /class="bond-week-note" aria-hidden="true"/);
  assert.doesNotMatch(noi, /Usiamo le attività già presenti in US\.|3 quest completate/);
  assert.doesNotMatch(noi, /bond-badges-section/);
  assert.doesNotMatch(noi, /QUEST SETTIMANALI/);
});

test('M3 mantiene il runtime Bond esistente come fonte dati senza renderizzare una dashboard', () => {
  const app = read('app.js');
  const css = read('styles.css');
  assert.match(app, /function hydrateBond\(\)/);
  assert.match(app, /bond_weekly_quests/);
  assert.match(app, /renderBondProgress\(couple\?\.bond_xp/);
  assert.match(css, /\.noi-canonical-page\{[^}]*overflow:hidden/);
  assert.match(css, /\.noi-living-list \.bond-quest:not\(:first-child\)/);
  assert.match(css, /\.noi-canonical-page \.bond-weekly-head/);
  assert.match(css, /\.noi-canonical-page \.bond-week-note\{visibility:hidden/);
  assert.match(css, /\.noi-resonance-foot #bondCompletedCount\{visibility:hidden/);
});

test('M3 non introduce persistence o authority Da vivere nuova', () => {
  const app = read('app.js');
  const html = read('index.html');
  assert.doesNotMatch(app, /living_items|shared_experiences|proposals/);
  assert.doesNotMatch(html, /Una cosa semplice da aspettare insieme|Le idee contestuali arriveranno qui|IN PREPARAZIONE/);
  assert.match(html, /DA VIVERE/);
});
