// Il vostro mese (founder, 27/11/2026): the pure helpers of mese.js and the
// wiring around it (Ricordi › Carte, Gioca, Back, builds, caches, English,
// the approved images, the native share through the platform boundary).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../mese.js');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the period of a pack: a month, or the golden year', () => {
  const nov = M.period({ kind: 'mese', period_start: '2026-11-01' });
  assert.equal(nov.short, 'Novembre');
  assert.equal(nov.lower, 'novembre');
  assert.equal(nov.titleHTML, '<span>Novembre</span> 2026');
  assert.equal(nov.ring, 'IL VOSTRO MESE · NOVEMBRE 2026 · ');
  assert.equal(nov.stamp, 'Novembre · 2026');
  const year = M.period({ kind: 'anno', period_start: '2026-01-01' });
  assert.equal(year.gold, true);
  assert.equal(year.short, 'L’anno 2026');
  assert.equal(year.titleHTML, 'Il vostro 2026');
});

test('helpers: sizes that fit, counts, what can be shared or pinned', () => {
  assert.equal(M.fit('Mare', 118, 5, 34), 118);
  assert.equal(M.fit('Montagna e lago', 118, 5, 34), 39);
  assert.equal(M.fit('x'.repeat(200), 118, 5, 34), 34, 'never under the minimum');
  assert.equal(M.cardsLabel(1), '1 carta');
  assert.equal(M.cardsLabel(10), '10 carte');
  const cards = [{ k: 'foto', gone: false, pin: { source: 'moment', id: 'm' } }, { k: 'foto', gone: true, pin: { source: 'moment', id: 'x' } }, { k: 'numeri' }, { k: 'qa', pin: { source: 'keepsake', id: 'k' } }];
  assert.equal(M.shareable(cards).length, 3, 'a card gone stays out of the carousel');
  assert.deepEqual(M.pinOf(cards[0]), { source: 'moment', id: 'm' });
  assert.equal(M.pinOf(cards[1]), null, 'a memory no longer there cannot go on the board');
  assert.equal(M.pinOf(cards[2]), null, 'numbers have nothing to pin');
  assert.deepEqual(M.pinOf(cards[3]), { source: 'keepsake', id: 'k' });
  assert.deepEqual(M.normalize({ cards: [{ k: 'foto' }, null, { x: 1 }] }).cards, [{ k: 'foto' }]);
  assert.equal(M.dayLabel('2026-11-09'), '9 novembre');
});

test('wiring: Ricordi › Carte loads the module when tapped; Back; builds; out of the offline shell', () => {
  const html = read('index.html');
  assert.match(html, /data-ricordi-view="carte" aria-selected="false">Carte<\/button>/);
  assert.match(html, /<div class="ricordi-carte" id="ricordiCarte" aria-label="Le vostre carte" hidden><\/div>/);
  assert.doesNotMatch(html, /src="\/mese\.js/, 'never loaded at start');
  const place = read('ricordi-place.js');
  assert.match(place, /const VIEWS = \['story', 'board', 'map', 'carte'\];/);
  assert.match(place, /script\.src = `\/mese\.js\$\{version\}`/);
  assert.match(place, /link\.href = `\/mese\.css\$\{version\}`/);
  assert.match(place, /w\.usOpenCarte = openCarte;/);
  assert.match(read('navigation.js'), /name:'mese',\s*find:\(\)=>document\.getElementById\('usMese'\),\s*open:el=>el\?\.classList\.contains\('open'\),\s*close:\(\)=>window\.UsMese\?\.back\?\.\(\)/);
  const sw = read('service-worker.js');
  assert.ok(!sw.includes('mese.js') && !sw.includes('/assets/mese/'), 'not precached');
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.ok(read(f).includes("'mese.js',\n  'mese.css'"), f);
  assert.match(read('dc-ricordi.css'), /#moments \.ricordi-views\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test('Gioca: a shortcut to the cards that says when a pack is waiting', () => {
  const games = read('games.js');
  assert.match(games, /\$\{meseRow\(\)\}/);
  assert.match(games, /data-gv2-action="mese"/);
  assert.match(games, /else if \(action === 'mese'\) window\.usOpenCarte\?\.\(mese\.pack \? \{ pack: mese\.pack \} : \{\}\);/);
  assert.match(games, /const note = next \? `È arrivato il vostro \$\{when\}` : '';/);
  assert.match(read('games.css'), /#quiz \.us-gv2-mese\{[^}]*min-height:72px/);
});

test('the module: no storage, no sounds, motion that can be reduced, no Come stai card, the board and the media authorities', () => {
  const src = read('mese.js');
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(src, /AudioContext|UsFeedback\?\.(tap|success|reveal|action)\(/, 'vibration only, never a sound (P8)');
  assert.match(src, /w\.UsPlatform\.haptic\(native, pattern\)/);
  assert.match(src, /UsFeedback\?\.getPreferences\?\.\(\)\?\.haptics === false/, 'the person\'s haptics switch is respected');
  assert.ok((src.match(/reduced\(\)/g) || []).length >= 8, 'reduced motion checked at every movement');
  assert.match(read('mese.css'), /@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(src, /'mood'|Come stai/, 'no «Il vostro Come stai» (no history, D12 of 02/11)');
  for (const k of ['foto', 'qa', 'lettera', 'prima', 'scelta', 'numeri', 'posti', 'intesa']) assert.match(src, new RegExp(`${k}: '`), k);
  assert.match(src, /w\.UsBacheca\.pinThing\(\{ source: pin\.source, id: pin\.id/);
  assert.match(src, /w\.usGetSignedUrls\(imgs\.map/);
  assert.match(src, /fetch\(url, \{ credentials: 'omit', mode: 'cors' \}\)/, 'the photo for the canvas through CORS: a clean canvas');
  assert.match(src, /const W = 1080, H = 1920;/);
  assert.match(src, /'US · uscouple\.app'/);
  assert.match(src, /l\.classList\.add\('hide-answers', 'hide-photos'\);/, 'answers and photos hidden by default (P5)');
  for (const name of ['get_carte_v1', 'get_pacchetto_v1', 'apri_pacchetto_v1']) assert.match(src, new RegExp(`'${name}'`));
});

test('the native share goes through the platform boundary with the official plugins', () => {
  const platform = read('platform.js');
  assert.match(platform, /async function shareNativeFiles\(files, title\) \{/);
  assert.match(platform, /getNativePlugin\('Filesystem'\), share = getNativePlugin\('Share'\)/);
  assert.match(platform, /directory: 'CACHE'/);
  assert.match(platform, /\n    shareNativeFiles,\n/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@capacitor/share'], '8.0.3');
  assert.equal(pkg.dependencies['@capacitor/filesystem'], '8.1.6');
  assert.match(read('android/capacitor.settings.gradle'), /include ':capacitor-share'/);
  assert.match(read('android/capacitor.settings.gradle'), /include ':capacitor-filesystem'/);
  assert.match(read('ios/App/CapApp-SPM/Package.swift'), /\.package\(name: "CapacitorShare", path: "\.\.\/\.\.\/\.\.\/node_modules\/@capacitor\/share"\)/);
  assert.match(read('android/app/src/main/res/xml/file_paths.xml'), /<cache-path name="my_cache_images" path="\." \/>/, 'the cache folder is shared by the FileProvider');
});

test('the approved images: in the manifest, out of the shell, English for every text', () => {
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  for (const f of ['pack-holo', 'pack-gold', 'logo-pink', 'logo-gold', 'retro', 'frame', 'holo', 'paper']) {
    const a = manifest.assets.find((x) => x.path === `assets/mese/${f}.webp`);
    assert.ok(a && a.status === 'APPROVED', f);
  }
  assert.match(read('tests/i18n-coverage.test.js'), /'ricordi-cerca\.js', 'mese\.js'/);
  const en = require('../i18n-en.js');
  for (const key of ['Il vostro mese', 'Le vostre carte', 'Condividi il mese', 'Questo ricordo non c’è più', 'Metti in bacheca', 'Salva come immagine', 'È arrivato il vostro {month}', 'Trascina il dito lungo la linea', 'Apri senza strappare', 'Mostra le foto', 'Mostra le risposte', 'Carte']) assert.ok(en[key], key);
});
