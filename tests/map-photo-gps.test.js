// Mappa dei Ricordi, prova tecnica (founder, 29/10/2026, decision D8): before
// building the map, the staging app says whether Android hands the web view a
// photo with its GPS position. The reader is checked here on JPEGs built by
// hand with a known place; nothing is stored, and only staging builds speak.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const source = app.slice(app.indexOf('async function readJpegExifGps('), app.indexOf('// Staging only: the preview site'));
const readJpegExifGps = new Function(`${source}; return readJpegExifGps;`)();

// A JPEG with an EXIF block (little endian): IFD0 → GPS IFD with lat/lon refs and DMS rationals.
function jpegWithGps({ lat, latRef, lon, lonRef }) {
  const tiff = [];
  const u16 = (v) => tiff.push(v & 255, v >> 8);
  const u32 = (v) => tiff.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  tiff.push(0x49, 0x49); u16(42); u32(8); // header, IFD0 at 8
  u16(1); u16(0x8825); u16(4); u32(1); u32(26); u32(0); // IFD0: GPS pointer → 26
  const dmsAt = 26 + 2 + 4 * 12 + 4; // after the GPS IFD
  u16(4);
  u16(1); u16(2); u32(2); tiff.push(latRef.charCodeAt(0), 0, 0, 0);
  u16(2); u16(5); u32(3); u32(dmsAt);
  u16(3); u16(2); u32(2); tiff.push(lonRef.charCodeAt(0), 0, 0, 0);
  u16(4); u16(5); u32(3); u32(dmsAt + 24);
  u32(0);
  for (const [d, m, s] of [lat, lon]) for (const v of [d, m, s * 100]) { u32(v); u32(v === s * 100 ? 100 : 1); }
  const exif = [...Buffer.from('Exif\0\0'), ...tiff];
  const app1 = [0xFF, 0xE1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif];
  return new Blob([Uint8Array.from([0xFF, 0xD8, ...app1, 0xFF, 0xD9])], { type: 'image/jpeg' });
}

test('a photo taken in Rome gives its place, rounded to about 100 m', async () => {
  const file = jpegWithGps({ lat: [41, 54, 10.2], latRef: 'N', lon: [12, 29, 47.6], lonRef: 'E' });
  assert.deepEqual(await readJpegExifGps(file), { lat: 41.903, lon: 12.497 });
});

test('south and west turn negative', async () => {
  const file = jpegWithGps({ lat: [33, 52, 4], latRef: 'S', lon: [151, 12, 26], lonRef: 'W' });
  assert.deepEqual(await readJpegExifGps(file), { lat: -33.868, lon: -151.207 });
});

test('no position, no answer: not a JPEG, no EXIF, or a photo without GPS', async () => {
  assert.equal(await readJpegExifGps(new Blob([Uint8Array.from([0x89, 0x50])], { type: 'image/png' })), null);
  assert.equal(await readJpegExifGps(new Blob([Uint8Array.from([0xFF, 0xD8, 0xFF, 0xD9])], { type: 'image/jpeg' })), null);
});

test('only staging builds say what they found; nothing is saved', () => {
  assert.match(app, /if\(\/\^us-staging\/\.test\(location\.hostname\)\)return true;/);
  assert.match(app, /\/\\\.staging\$\/\.test\(\(await window\.Capacitor\?\.Plugins\?\.App\?\.getInfo\?\.\(\)\)\?\.id\|\|''\)/);
  const pick = app.slice(app.indexOf('// Mappa dei Ricordi, prova tecnica (staging only)'), app.indexOf('// A lived source already knows its day'));
  assert.match(pick, /if\(!staging\|\|token!==pendingMomentPickToken\)return;/);
  assert.doesNotMatch(pick, /sb\.|insert|update|localStorage/, 'the place is only shown');
});
