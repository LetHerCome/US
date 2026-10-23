// Compagni V1 client (docs/missions/companions-v1.md): the companions among
// the unlockables of Sintonia, the one-time arrival on Oggi, the
// device-local choice, and the shell wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const C = require('../companions.js');
const html = read('index.html');
const js = read('companions.js');
const progression = read('progression.js');

test('normalize: the four companions in the order they arrive; at the start nobody; unknown rows ignored', () => {
  assert.deepEqual(C.normalize(null).map((c) => [c.id, c.unlocked]), [['maudit', false], ['owl', false], ['goat', false], ['dragon', false]]);
  assert.deepEqual(C.CATALOG.map((c) => c.level), [3, 5, 8, 11], 'the levels the server uses');
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

test('Oggi: one arrival at a time, the oldest first, Maudit included, never twice; it opens Sintonia', () => {
  const list = C.normalize({ companions: [
    { id: 'maudit', unlocked: true, unlocked_at: '2026-10-18T10:00:00Z' },
    { id: 'owl', unlocked: true, unlocked_at: '2026-10-20T10:00:00Z' }] });
  const first = C.todayPriority(list, new Set());
  assert.equal(first.id, 'companion:maudit');
  assert.equal(first.title, 'È arrivato Maudit');
  assert.equal(first.detail, 'Un nuovo compagno, in Sintonia');
  assert.equal(first.category, 'celebration', 'a small celebration; on a monthiversary it waits a day');
  assert.equal(first.action, 'companion');
  assert.equal(C.todayPriority(list, new Set(['maudit'])).title, 'È arrivato il gufetto');
  assert.equal(C.todayPriority(list, new Set(['maudit', 'owl'])), null);
  assert.equal(C.todayPriority(C.normalize(null), new Set()), null, 'nobody yet, nothing to tell');
  assert.equal(C.todayPriority(C.normalize({ companions: [{ id: 'goat', unlocked: true }] }), new Set()).title, 'È arrivata la capretta');
  assert.match(js, /w\.USNoiV2\?\.openSintonia\?\.\(\);/);
  assert.match(js, /w\.USProgression\?\.showCategory\?\.\('companion'\)/);
});

test('Sintonia: a Compagni group among I vostri sblocchi, with the level on locked cards', () => {
  assert.match(progression, /const CHIP_ORDER = Object\.freeze\(\[[^\]]*'companion'\]\);/);
  assert.match(progression, /category: 'companion', label: 'Compagni', owned, total: list\.length,/);
  assert.match(progression, /attrs: `data-companion-pick="\$\{esc\(c\.id\)\}"`, cls: 'us-progression-companion',\n    on: c\.unlocked && c\.id === current, locked: !c\.unlocked, level: c\.level,/);
  assert.match(progression, /const companions = companionGroup\(\);\n  if \(companions\) groups\.push\(companions\);/);
  // A tap chooses (the same click authority as every other unlockable); a locked one says its level.
  assert.match(progression, /\[data-look-slot\],\[data-companion-pick\]'\)/);
  assert.match(progression, /ok = Boolean\(window\.UsCompanions\?\.choose\?\.\(data\.companionPick\)\);/);
  assert.match(progression, /window\.toast\?\.\(`Si sblocca al livello \$\{data\.level \|\| ''\} di Sintonia`/);
  assert.match(progression, /COLLECTION_SUB\.companion/);
  assert.match(progression, /window\.addEventListener\?\.\('us:companions-updated', \(\) => \{ renderNext\(state\); renderRewards\(state\); \}\);/);
  assert.match(read('companions.css'), /\.us-progression-reward\.us-progression-companion\.is-locked \.us-progression-companion-art\{filter:brightness\(0\);opacity:\.34\}/, 'a dark silhouette');
});

test('Sintonia: Prossimo sblocco names the companion when its level comes first', () => {
  const renderNext = progression.slice(progression.indexOf('function renderNext('), progression.indexOf('// One tile of the collection'));
  assert.match(renderNext, /if \(companion && \(!rewards\.length \|\| companion\.level < level\)\)/);
  assert.match(renderNext, /Prossimo sblocco · Livello \$\{companion\.level\}/);
  assert.match(renderNext, /root\.dataset\.rewardCat = 'companion'/, 'a tap opens the Compagni group');
});

test('every awake picture Sintonia shows is an approved asset', () => {
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  assert.match(js, /\/assets\/derived\/pet\/us-pet-\$\{id\}-awake-\$\{v\}\.webp/);
  for (const c of C.CATALOG) {
    const file = `assets/derived/pet/us-pet-${c.id}-awake-${c.id === 'maudit' ? 'v2' : 'v1'}.webp`;
    assert.equal(manifest.assets.find((a) => a.path === file)?.status, 'APPROVED', file);
  }
});

test('the choice lives in pet.js on this phone; the server only says what is unlocked', () => {
  assert.match(js, /sb\.rpc\('get_companions_v1'\)/);
  assert.match(js, /function choose\(id\)\{\n    if\(!list\.some\(c=>c\.id===id&&c\.unlocked\)\)return false;/, 'never choose a locked one');
  assert.match(js, /const id=current\(\),next=companionFor\(list,id\);\n    if\(next!==id\)w\.USPet\?\.setCompanion\?\.\(next\);/, 'only a real answer moves the companion');
  assert.match(js, /if\(error\|\|!Array\.isArray\(data\?\.companions\)\)throw/);
  assert.match(js, /us:companions:v1:seen:\$\{key\(\)\}/, 'told once, per member and couple');
  assert.match(js, /if\(now&&now!==level\)/, 'asks again only when the Sintonia level changes');
});

test('copy: inclusive Italian, no therapy or growth words', () => {
  const copy = C.CATALOG.flatMap((c) => [c.name, c.arrived]).join(' ') + ' Un nuovo compagno, in Sintonia Tocca un compagno per tenerlo sopra la barra. Vale solo su questo telefono.';
  for (const banned of [/entrambi/i, /tutti e due/i, /ognuno/i, /da sol[oa]/i, /uno dei due/i, /per prim[oa]/i, /l['’]altr[oa]/i, /\b\w+[oa]\/[ae]\b/, /cresc/i]) {
    assert.doesNotMatch(copy, banned, String(banned));
  }
  const en = read('i18n-en.js');
  for (const key of ['È arrivato Maudit', 'È arrivato il draghetto', 'Un nuovo compagno, in Sintonia', 'Compagni', '{name} · con te sopra la barra', 'Un compagno sopra la barra · mancano {n} XP']) {
    assert.ok(en.includes(`'${key}':`) || en.includes(`${key}:`), key);
  }
});

test('shell: no Noi row or sheet; Oggi arrival, reset on logout, precache and both builds', () => {
  assert.doesNotMatch(html, /noiCompanionsRow|usCompanionsSheet/, 'the companions live in Sintonia');
  assert.doesNotMatch(read('navigation.js'), /usCompanionsSheet/);
  const build = JSON.parse(read('version.json')).version;
  assert.match(html, new RegExp(`src="/companions\\.js\\?v=${build}"`));
  assert.match(html, new RegExp(`href="/companions\\.css\\?v=${build}"`));
  assert.ok(html.indexOf('src="/companions.js') > html.indexOf('src="/pet.js'), 'after pet.js');
  const app = read('app.js');
  assert.match(app, /window\.UsCompanions\?\.reset\?\.\(\);/);
  assert.match(app, /const companion=window\.UsCompanions\?\.todayPriority\?\.\(\);\n  if\(companion\)candidates\.push\(companion\);/);
  assert.match(app, /if\(action==='companion'\)window\.UsCompanions\?\.open\?\.\(\);/);
  assert.match(read('service-worker.js'), /versioned\("\/companions\.css"\),\n  versioned\("\/companions\.js"\),/);
  for (const file of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(file), /'companions\.js',\n\s*'companions\.css',/, file);
});
