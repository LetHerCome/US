// Compagni V1 client (docs/missions/companions-v1.md): the collection, the
// one-time arrival on Oggi, the device-local choice, and the shell wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const C = require('../companions.js');
const html = read('index.html');
const js = read('companions.js');

test('normalize: the four companions in the order they arrive; at the start nobody; unknown rows ignored', () => {
  assert.deepEqual(C.normalize(null).map((c) => [c.id, c.unlocked]), [['maudit', false], ['owl', false], ['goat', false], ['dragon', false]]);
  const list = C.normalize({ companions: [{ id: 'maudit', unlocked: true }, { id: 'dragon', unlocked: true, unlocked_at: '2026-10-22T10:00:00Z' }, { id: 'unicorn', unlocked: true }, { id: 'goat', unlocked: 'yes' }] });
  assert.deepEqual(list.map((c) => c.unlocked), [true, false, false, true]);
  assert.equal(list.length, 4);
});

test('who sits above the bar: the chosen one while unlocked, else Maudit once arrived, else nobody', () => {
  const none = C.normalize(null);
  const maudit = C.normalize({ companions: [{ id: 'maudit', unlocked: true }] });
  const owl = C.normalize({ companions: [{ id: 'maudit', unlocked: true }, { id: 'owl', unlocked: true }] });
  assert.equal(C.companionFor(none, 'maudit'), 'none', 'a couple below level 3 has nobody');
  assert.equal(C.companionFor(none, 'none'), 'none');
  assert.equal(C.companionFor(maudit, 'none'), 'maudit', 'Maudit appears when it arrives');
  assert.equal(C.companionFor(owl, 'owl'), 'owl');
  assert.equal(C.companionFor(maudit, 'dragon'), 'maudit', 'a locked choice falls back to Maudit');
});

test('Oggi: one arrival at a time, the oldest first, Maudit included, never twice', () => {
  const list = C.normalize({ companions: [
    { id: 'maudit', unlocked: true, unlocked_at: '2026-10-18T10:00:00Z' },
    { id: 'owl', unlocked: true, unlocked_at: '2026-10-20T10:00:00Z' }] });
  const first = C.todayPriority(list, new Set());
  assert.equal(first.id, 'companion:maudit');
  assert.equal(first.title, 'È arrivato Maudit');
  assert.equal(first.category, 'celebration', 'a small celebration; on a monthiversary it waits a day');
  assert.equal(first.action, 'companion');
  assert.equal(C.todayPriority(list, new Set(['maudit'])).title, 'È arrivato il gufetto');
  assert.equal(C.todayPriority(list, new Set(['maudit', 'owl'])), null);
  assert.equal(C.todayPriority(C.normalize(null), new Set()), null, 'nobody yet, nothing to tell');
  assert.equal(C.todayPriority(C.normalize({ companions: [{ id: 'goat', unlocked: true }] }), new Set()).title, 'È arrivata la capretta');
});

test('collection: unlocked ones can be chosen, the chosen one is marked, locked ones show the level that brings them', () => {
  const list = C.normalize({ companions: [{ id: 'maudit', unlocked: true }, { id: 'owl', unlocked: true }] });
  const out = C.renderGrid(list, 'owl');
  assert.match(out, /data-companion="maudit" aria-pressed="false"/);
  assert.match(out, /data-companion="owl" aria-pressed="true"/);
  assert.match(out, /È con te/);
  assert.doesNotMatch(out, /data-companion="goat"|data-companion="dragon"/, 'a locked companion is not a button');
  assert.match(out, /is-locked[\s\S]*Arriva al livello 8 di Sintonia/);
  assert.match(out, /Arriva al livello 11 di Sintonia/);
  assert.match(C.renderGrid(C.normalize(null), 'none'), /Arriva al livello 3 di Sintonia/);
  assert.match(out, /\/assets\/derived\/pet\/us-pet-maudit-awake-v2\.webp/);
  assert.match(out, /\/assets\/derived\/pet\/us-pet-goat-awake-v1\.webp/);
  assert.doesNotMatch(out, /\d+\s*\/\s*\d+|%|punti|XP/i, 'no counts and no progress');
  assert.match(read('companions.css'), /\.us-companion\.is-locked \.us-companion-art img\{filter:brightness\(0\);opacity:\.32\}/, 'a dark silhouette');
});

test('every awake picture the collection shows is an approved asset', () => {
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  for (const c of C.CATALOG) {
    const file = `assets/derived/pet/us-pet-${c.id}-awake-${c.id === 'maudit' ? 'v2' : 'v1'}.webp`;
    assert.equal(manifest.assets.find((a) => a.path === file)?.status, 'APPROVED', file);
  }
});

test('the choice lives in pet.js on this phone; the server only says what is unlocked', () => {
  assert.match(js, /sb\.rpc\('get_companions_v1'\)/);
  assert.match(js, /w\.USPet\?\.setCompanion\?\.\(id\)/);
  assert.match(js, /if\(!list\.some\(c=>c\.id===id&&c\.unlocked\)\)return;/, 'never choose a locked one');
  assert.match(js, /const id=current\(\),next=companionFor\(list,id\);\n    if\(next!==id\)w\.USPet\?\.setCompanion\?\.\(next\);/, 'only a real answer moves the companion');
  assert.match(js, /us:companions:v1:seen:\$\{key\(\)\}/, 'told once, per member and couple');
});

test('copy: inclusive Italian, no therapy or growth words', () => {
  const copy = C.CATALOG.flatMap((c) => [c.name, c.arrived, c.hint]).join(' ') + ' ' + html.match(/<div id="usCompanionsSheet"[\s\S]*?<\/section>/)[0];
  for (const banned of [/entrambi/i, /tutti e due/i, /ognuno/i, /da sol[oa]/i, /uno dei due/i, /per prim[oa]/i, /l['’]altr[oa]/i, /\b\w+[oa]\/[ae]\b/, /cresc/i, /punti\b/i]) {
    assert.doesNotMatch(copy, banned, String(banned));
  }
  const en = read('i18n-en.js');
  for (const key of ['I vostri compagni', 'È arrivato Maudit', 'È arrivato il draghetto', 'Arriva al livello 11 di Sintonia', 'Tocca per sceglierlo']) assert.ok(en.includes(`'${key}':`), key);
});

test('shell: Noi row, sheet, native back, Oggi arrival, reset on logout, precache and both builds', () => {
  assert.match(html, /<button type="button" class="noi-companions-row" id="noiCompanionsRow" aria-haspopup="dialog" hidden>/);
  assert.ok(html.indexOf('id="noiCompanionsRow"') > html.indexOf('id="noiRecapRow"'), 'under Il vostro anno');
  assert.match(html, /<div id="usCompanionsSheet" class="us-companions-overlay" aria-hidden="true" data-us-modal data-us-motion-surface>/);
  assert.match(html, /<ul id="usCompanionsGrid" class="us-companions-grid"><\/ul>/);
  const build = JSON.parse(read('version.json')).version;
  assert.match(html, new RegExp(`src="/companions\\.js\\?v=${build}"`));
  assert.match(html, new RegExp(`href="/companions\\.css\\?v=${build}"`));
  assert.ok(html.indexOf('src="/companions.js') > html.indexOf('src="/pet.js'), 'after pet.js');
  assert.match(read('navigation.js'), /name:'companions',\n    find:\(\)=>document\.getElementById\('usCompanionsSheet'\)/);
  const app = read('app.js');
  assert.match(app, /window\.UsCompanions\?\.reset\?\.\(\);/);
  assert.match(app, /const companion=window\.UsCompanions\?\.todayPriority\?\.\(\);\n  if\(companion\)candidates\.push\(companion\);/);
  assert.match(app, /if\(action==='companion'\)window\.UsCompanions\?\.open\?\.\(\);/);
  assert.match(read('service-worker.js'), /versioned\("\/companions\.css"\),\n  versioned\("\/companions\.js"\),/);
  for (const file of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(file), /'companions\.js',\n\s*'companions\.css',/, file);
});
