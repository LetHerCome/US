// Mappa dei Ricordi (founder, 29/10/2026): place names, rounding and wiring of
// "Dove", the map and the native photo picker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../ricordi-place.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('a place is rounded to about 100 m, has a short name and a known source', () => {
  assert.deepEqual(P.normalize({ lat: 44.494887, lon: 11.342616, label: '  Piazza   Maggiore, Bologna ', source: 'photo' }), { lat: 44.495, lon: 11.343, label: 'Piazza Maggiore, Bologna', source: 'photo' });
  assert.equal(P.normalize({ lat: 45, lon: 9, label: 'Milano', source: 'gps' }).source, 'search');
  assert.equal(P.normalize({ lat: 91, lon: 9, label: 'x' }), null);
  assert.equal(P.normalize({ lat: 0, lon: 0, label: 'Null Island' }), null, 'no GPS, not a place');
  assert.equal(P.normalize({ lat: 45, lon: 9, label: '   ' }), null);
  assert.equal(P.normalize({ lat: 45, lon: 9, label: 'x'.repeat(200) }).label.length, 120);
});

test('the name says the place or the street, then the town, never a house number', () => {
  assert.equal(P.labelFrom({ name: 'Duomo', street: 'Piazza del Duomo', city: 'Milano', country: 'Italia' }), 'Duomo, Milano');
  assert.equal(P.labelFrom({ street: 'Via Roma', housenumber: '12', city: 'Torino' }), 'Via Roma, Torino');
  assert.equal(P.labelFrom({ name: 'Bologna', city: 'Bologna', state: 'Emilia-Romagna' }), 'Bologna');
  assert.equal(P.labelFrom({ name: 'Monte Bianco', state: "Valle d'Aosta", country: 'Italia' }), "Monte Bianco, Valle d'Aosta");
  assert.equal(P.labelFrom({ country: 'Islanda' }), 'Islanda');
});

test('Photon results become places, without doubles', () => {
  const json = { features: [
    { geometry: { coordinates: [9.1885548, 45.4641385] }, properties: { name: 'Duomo', city: 'Milano', state: 'Lombardia', country: 'Italia' } },
    { geometry: { coordinates: [9.1894751, 45.464656] }, properties: { name: 'Duomo', city: 'Milano', state: 'Lombardia', country: 'Italia' } },
    { geometry: { coordinates: [] }, properties: { name: 'Nowhere' } },
  ] };
  assert.deepEqual(P.placesFrom(json), [{ lat: 45.464, lon: 9.189, label: 'Duomo, Milano', source: 'search', detail: 'Lombardia, Italia' }]);
});

test('the map takes the placed Ricordi from their cards: the real photo and the note', () => {
  // A card with an album: the inline carousel puts an empty "peek" image first.
  const card = (data, imgs) => ({ dataset: data, querySelector: (sel) => imgs.find((i) => (sel === '.ricordi-inline-current' ? i.cls === 'ricordi-inline-current' : i.src && i.cls !== 'ricordi-inline-peek')) || null });
  const img = (cls, src) => ({ cls, src, currentSrc: '', getAttribute: (k) => (k === 'src' ? src : null) });
  const points = P.pointsFrom([
    card({ momentId: 'a', placeLat: '44.495', placeLon: '11.343', placeLabel: 'Bologna', placeSource: 'photo', caption: ' La prima  cena ' }, [img('ricordi-inline-peek', ''), img('ricordi-inline-current', 'https://x/a.webp')]),
    card({ momentId: 'c', placeLat: '45.464', placeLon: '9.19', placeLabel: 'Duomo, Milano', caption: '' }, [img('', 'https://x/c.webp')]),
    card({ momentId: 'b' }, []),
  ]);
  assert.deepEqual(points, [
    { id: 'a', lat: 44.495, lon: 11.343, label: 'Bologna', caption: 'La prima cena', thumb: 'https://x/a.webp' },
    { id: 'c', lat: 45.464, lon: 9.19, label: 'Duomo, Milano', caption: '', thumb: 'https://x/c.webp' },
  ]);
});

test('a pin is the photo; close up, the note (or the place) is written small under it', () => {
  const src = read('ricordi-place.js');
  const css = read('ricordi-place.css');
  for (const piece of [
    "const text = props.caption || props.label || '';",
    '<span class="ricordi-map-label" translate="no">',
    "box.classList.toggle('is-near', map.getZoom() >= NEAR_ZOOM)",
    'getClusterLeaves(props.cluster_id, 1, 0)',
  ]) assert.ok(src.includes(piece), piece);
  assert.ok(/\.ricordi-map-label\{[^}]*display:none/.test(css), 'the note is hidden from afar');
  assert.ok(css.includes('.ricordi-map.is-near .ricordi-map-label{display:block}'), 'and shown close up');
});

test('search waits for 3 letters and never asks without them', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({ features: [] }) }; };
  try {
    assert.deepEqual(await P.search('ab'), []);
    assert.equal(calls, 0);
    await P.search('Bologna', { near: { lat: 44.4949, lon: 11.3426 } });
    assert.equal(calls, 1);
  } finally { global.fetch = original; }
});

test('composer, upload, read and card carry the place; the staging probe is gone', () => {
  const app = read('app.js');
  const html = read('index.html');
  assert.match(html, /id="momentPlaceField"[\s\S]*Dove · facoltativo[\s\S]*onclick="editMomentPlace\(\)"/);
  assert.match(html, /id="ricordiMapSwitch"[^>]*onclick="UsRicordiPlace\.toggleMap\(\)"/);
  assert.match(html, /<div class="ricordi-map" id="ricordiMap"[^>]*hidden><\/div>/);
  assert.ok(html.indexOf('/moments-albums.js?v=') < html.indexOf('/ricordi-place.js?v='));
  assert.match(app, /place_lat:place\.lat,place_lon:place\.lon,place_label:place\.label,place_source:place\.source/);
  assert.match(app, /const US_MOMENT_PLACE_COLUMNS='place_lat,place_lon,place_label,place_source';/);
  assert.match(app, /result\?\.error\?momentsQuery\(US_MOMENT_COLUMNS\):result/, 'a database without the columns still shows Ricordi');
  assert.match(app, /data-place-lat="\$\{escapeHtml\(row\.place_lat\)\}"/);
  assert.match(app, /if\(!places&&!\(await window\.UsRicordiPlace\?\.photoConsent\?\.\(\)\)\)return;/, 'a browser asks before reading the place');
  assert.doesNotMatch(app, /Prova mappa/);
  assert.doesNotMatch(app, /usIsStagingRuntime/);
  const albums = read('moments-albums.js');
  assert.match(albums, /id="usAlbumPlace"/);
  assert.match(albums, /await window\.UsRicordiPlace\.save\(album\.id,place\)/);
  for (const list of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) {
    assert.match(read(list), /'ricordi-place\.js',/, list);
    assert.match(read(list), /'ricordi-place\.css',/, list);
  }
  assert.match(read('service-worker.js'), /versioned\("\/ricordi-place\.js"\)/);
});

test('the map loads a pinned MapLibre and OpenFreeMap only when it opens; names come from Photon', () => {
  const src = read('ricordi-place.js');
  assert.match(src, /https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl@5\.24\.0\/dist\/maplibre-gl\.js/);
  assert.match(src, /https:\/\/tiles\.openfreemap\.org\/styles\//);
  assert.match(src, /const PHOTON = 'https:\/\/photon\.komoot\.io';/);
  assert.doesNotMatch(read('index.html'), /maplibre/i, 'never loaded with the app');
  assert.doesNotMatch(src, /key=|api_key|access_token/i, 'no key in the client');
});

test('Android: native picker with ACCESS_MEDIA_LOCATION, never READ_MEDIA_IMAGES', () => {
  const java = read('native-plugins/us-photo-place/android/src/main/java/com/usapp/photoplace/UsPhotoPlacePlugin.java');
  assert.match(java, /new Intent\(Intent\.ACTION_OPEN_DOCUMENT\)/);
  assert.match(java, /MediaStore\.setRequireOriginal\(media\)/);
  assert.match(java, /photo\.put\("lat", round3\(place\[0\]\)\)/, 'rounded before it leaves the phone code');
  const manifest = read('native-plugins/us-photo-place/android/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.ACCESS_MEDIA_LOCATION/);
  assert.doesNotMatch(manifest, /uses-permission android:name="android\.permission\.(READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE)"/);
  assert.match(read('package.json'), /"@us\/photo-place": "file:native-plugins\/us-photo-place"/);
  assert.match(read('android/capacitor.settings.gradle'), /project\(':us-photo-place'\)\.projectDir = new File\('\.\.\/native-plugins\/us-photo-place\/android'\)/);
  assert.match(read('android/app/capacitor.build.gradle'), /implementation project\(':us-photo-place'\)/);
  assert.match(read('scripts/validate-android-bundle.mjs'), /'android\.permission\.ACCESS_MEDIA_LOCATION': 'Posizione delle foto/);
});

// Founder, 30/10/2026 (production): on a memory added before 1.3 «Aggiungi il
// posto» fell below the full-screen photo, so it could not be tapped.
test('in the full-screen photo «Dove» has its own row in the foot', () => {
  const css = read('dc-ricordi.css');
  const row = (cls) => Number(css.match(new RegExp(`\\[data-us-galleria\\] \\.${cls}\\{[^}]*?grid-row:(\\d+)`))?.[1]);
  const place = row('us-album-place');
  assert.ok(place > 1 && place < 10, 'the place button sits in the foot of the photo');
  assert.match(css, /#usAlbumCarousel\.us-album-cover-stage\{grid-column:1;grid-row:1\/10;/);
  assert.match(css, /grid-template-rows:minmax\(0,1fr\) repeat\(6,auto\) auto calc/);
  for (const other of ['us-album-title', 'us-album-byline', 'us-album-caption-postit', 'us-album-ask', 'us-album-carousel-status', 'us-album-acts', 'us-album-section'])
    assert.notEqual(row(other), place, other);
});

// Founder, 30/10/2026 (production): the place of a Ricordo added before 1.3
// could not be saved. The app's client is the global `sb` of app.js (a
// const, so never window.sb): set_moment_place must go through it.
test('saving a place uses the app client, the global sb', async () => {
  const calls = [];
  globalThis.sb = { rpc: async (name, args) => { calls.push([name, args]); return { data: { id: 'm1' }, error: null }; } };
  try {
    assert.deepEqual(await P.save('m1', { lat: 44.494887, lon: 11.342616, label: 'Bologna', source: 'search' }), { id: 'm1' });
    assert.deepEqual(calls, [['set_moment_place', { p_moment: 'm1', p_lat: 44.495, p_lon: 11.343, p_label: 'Bologna', p_source: 'search' }]]);
    await P.save('m1', null);
    assert.deepEqual(calls[1][1], { p_moment: 'm1', p_lat: null, p_lon: null, p_label: null, p_source: null }, 'clearing the place');
  } finally { delete globalThis.sb; }
});
