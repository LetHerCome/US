// Colori a scelta con US Plus (founder, 29/10/2026): the app paints each
// person in their chosen colour on both phones. The whole design reads two
// tokens: --us-rosa (whoever created the couple) and --us-lilla (whoever
// joined); a chosen colour replaces the token of that person.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../person-colors.js');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const F = { id: 'f', role: 'francesco', display_name: 'Francesco', person_color: null };
const B = { id: 'b', role: 'beatrice', display_name: 'Beatrice', person_color: null };

test('the 8 colours match the server, rosa and lilla are the usual ones', () => {
  assert.deepEqual(Object.keys(C.PALETTE), ['rosa', 'lilla', 'cielo', 'salvia', 'oro', 'pesca', 'rubino', 'perla']);
  const sql = read('supabase/migrations/20261029014653_person_colors_plus_v1.sql');
  assert.ok(sql.includes(`check (person_color in (${Object.keys(C.PALETTE).map((k) => `'${k}'`).join(', ')}))`));
  assert.equal(C.PALETTE.rosa, '#ff7c96');
  assert.equal(C.PALETTE.lilla, '#a98bff');
  assert.match(read('ui-foundation.css'), /--us-rosa:#ff7c96;\n\s+--us-lilla:#a98bff;/, 'the same defaults as the design tokens');
  for (const hex of Object.values(C.PALETTE)) assert.match(hex, /^#[0-9a-f]{6}$/);
});

test('each person\'s token takes their chosen colour, or stays the usual one', () => {
  assert.deepEqual(C.coupleColors([F, B]), { rosa: null, lilla: null });
  assert.deepEqual(C.coupleColors([{ ...F, person_color: 'cielo' }, { ...B, person_color: 'rosa' }]), { rosa: '#6fb8ff', lilla: '#ff7c96' });
  assert.deepEqual(C.coupleColors([{ ...F, person_color: 'boh' }]), { rosa: null, lilla: null });
});

test('applied on the page root, and removed back to the design tokens', () => {
  const set = new Map();
  const style = { setProperty: (k, v) => set.set(k, v), removeProperty: (k) => set.delete(k) };
  C.applyCoupleColors([{ ...F, person_color: 'oro' }, B], { style });
  assert.deepEqual([...set], [['--us-rosa', '#f2cf6b']]);
  C.applyCoupleColors([], { style });
  assert.equal(set.size, 0);
});

test('the picker: mine marked, the partner\'s (or their usual one) taken', () => {
  const choices = C.choices([{ ...F, person_color: 'cielo' }, B], 'f');
  assert.equal(choices.length, 8);
  assert.deepEqual(choices.find((c) => c.id === 'cielo'), { id: 'cielo', name: 'Cielo', hex: '#6fb8ff', mine: true, taken: false });
  assert.deepEqual(choices.find((c) => c.id === 'lilla'), { id: 'lilla', name: 'Lilla', hex: '#a98bff', mine: false, taken: true });
  assert.equal(C.choices([F, B], 'f').find((c) => c.id === 'rosa').mine, true, 'no choice yet: the usual one is mine');
  assert.equal(C.nameOf([F, { ...B, person_color: 'salvia' }], 'b'), 'Salvia');
  assert.equal(C.nameOf([F, B], 'b'), 'Lilla');
});

test('wired: profiles carry the colour, the page applies it, Settings changes it with Plus', () => {
  const app = read('app.js');
  assert.match(app, /sb\.from\('profiles'\)\.select\('id,display_name,role,couple_id,person_color'\)\.eq\('couple_id',coupleId\)\.order\('created_at',\{ascending:true\}\)/);
  assert.match(app, /window\.UsPersonColors\?\.applyCoupleColors\?\.\(usCoupleContextState\.profiles\)/);
  const settings = read('settings.js');
  assert.match(settings, /if\(name==='person-color'\)\{if\(!settingsSnapshot\?\.colorsOpen\)return personColorLockedModal\(\);return personColorModal\(\);\}/);
  assert.match(settings, /sb\.rpc\('get_couple_plus'\)/);
  assert.match(settings, /sb\.rpc\('set_my_color',\{p_color:/);
  const html = read('index.html');
  assert.match(html, /data-us-setting="person-color" id="usPersonColorSetting" hidden>/);
  assert.ok(html.indexOf('/person-colors.js?v=') < html.indexOf('<script defer src="/app.js?v='));
  for (const list of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(list), /'person-colors\.js',/, list);
  assert.match(read('service-worker.js'), /versioned\("\/person-colors\.js"\)/);
});

// In beta (US Plus not on sale) the server says the colours are free (colors_free):
// open for everyone (founder, 29/10/2026). The lock below is for when Plus is on sale.
test('in beta the colour is open for everyone: Plus or colors_free', () => {
  assert.match(read('settings.js'), /const colorsOpen=plusActive\|\|plusRes\?\.data\?\.colors_free===true;/);
});

test('without Plus the row is there, locked: it shows that Plus unlocks it, with nothing to buy yet', () => {
  const settings = read('settings.js');
  // Shown once Plus can be read; hidden only when it cannot (server not ready).
  assert.match(settings, /if\(colorRow\)\{colorRow\.hidden=Boolean\(plusRes\?\.error\)\|\|!plusRes\?\.data;colorRow\.dataset\.locked=colorsOpen\?'false':'true';\}/);
  assert.match(settings, /if\(colorValue\)colorValue\.textContent=colorsOpen\?\(window\.UsPersonColors\?\.nameOf\?\.\(profiles,identityProfile\.id\)\|\|''\):'US Plus';/);
  assert.match(settings, /if\(!settingsSnapshot\?\.colorsOpen\)return personColorLockedModal\(\);/);
  const locked = settings.slice(settings.indexOf('function personColorLockedModal'), settings.indexOf('function personColorModal'));
  assert.match(locked, /Si sblocca con US Plus/);
  assert.doesNotMatch(locked, /acquist|compra|prezzo|€|abbonati/i, 'no purchase while Plus is not on sale');
  assert.match(read('index.html'), /<span class="us-setting-value" id="usPersonColorValue"><\/span><span class="us-icon us-person-color-lock" data-us-icon="lock" aria-hidden="true"><\/span>/);
  assert.match(read('dc-settings.css'), /#usPersonColorSetting:not\(\[data-locked="true"\]\) \.us-person-color-lock\{display:none\}/);
});

test('locked colours look locked, and a tap says why', () => {
  const settings = read('settings.js');
  const locked = settings.slice(settings.indexOf('function personColorLockedModal'), settings.indexOf('function personColorModal'));
  assert.match(locked, /<div class="us-setting-choice us-person-colors is-locked">/);
  assert.match(locked, /<button type="button" aria-disabled="true" data-person-color-locked>/);
  assert.match(locked, /querySelectorAll\('\[data-person-color-locked\]'\)\.forEach\(btn=>btn\.addEventListener\('click',\(\)=>toast\('Si sblocca con US Plus'\)\)\)/);
  assert.match(read('dc-settings.css'), /#usSettingsModalBody \.us-person-colors\.is-locked button::before\{display:none\}/);
});
