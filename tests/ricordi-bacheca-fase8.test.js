// Redesign definitivo, fase 8 (founder 23/11/2026, D12): Ricordi opens on the
// polaroids month by month (tape in the colour of who put the photo there,
// the caption and the day written on it); «Bacheca» is the detective board
// laid out like a real map (north up), the places joined by a red string in
// the order you first went there, the Ricordi with no place in «Da
// appuntare». It lays itself out from the cards: no new data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const P = require('../ricordi-place.js');

const item = (id, lat, lon, label, iso) => ({ id, lat, lon, label, iso, caption: id, thumb: '' });

test('places: one per ~100 m, in the order you first went there', () => {
  const places = P.boardPlaces([
    item('a', 45.4071, 11.8741, 'Padova', '2026-03-01'), item('b', 45.40712, 11.87409, '', '2026-01-10'),
    item('c', 41.902, 12.496, 'Roma', '2026-02-02'), item('d', null, null, '', '2026-04-04'),
  ]);
  assert.deepEqual(places.map((p) => [p.label, p.items.map((i) => i.id)]), [['Padova', ['b', 'a']], ['Roma', ['c']]]);
  assert.equal(places[0].first, '2026-01-10');
});

test('the board keeps north up and west on the left, and no tag covers another', () => {
  const places = P.boardPlaces([
    item('pd', 45.407, 11.874, 'Padova', '2026-01-01'), item('ve', 45.437, 12.335, 'Venezia', '2026-02-01'),
    item('rm', 41.902, 12.496, 'Roma', '2026-03-01'), item('pd2', 45.398, 11.876, 'Prato', '2026-04-01'),
  ]);
  const { height, nodes } = P.boardLayout(places, 360);
  const at = (label) => nodes.find((n) => n.place.label === label);
  assert.ok(at('Roma').y > at('Venezia').y, 'Rome is south of Venice');
  assert.ok(at('Padova').x < at('Venezia').x, 'Padua is west of Venice');
  for (const a of nodes) for (const b of nodes) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 149, `${a.place.label} / ${b.place.label}`);
  for (const n of nodes) assert.ok(n.x >= 86 && n.x <= 360 - 86 && n.y >= 86 && n.y < height, n.place.label);
  const string = P.boardString(nodes);
  assert.equal((string.match(/Q/g) || []).length, nodes.length - 1, 'one red thread from place to place');
});

test('the board markup: tags open the map, polaroids open the Ricordo, «Da appuntare» adds the place', () => {
  const html = P.boardMarkup([
    item('a', 45.407, 11.874, 'Padova <b>', '2026-01-01'), item('b', 45.407, 11.874, 'Padova <b>', '2026-02-01'),
    item('c', 41.902, 12.496, 'Roma', '2026-03-01'), item('d', null, null, '', '2026-04-01'),
  ], 360);
  assert.match(html, /class="rb-tag" data-board-lat="45\.407" data-board-lon="11\.874"[^>]*aria-label="Padova &lt;b&gt;: 2 ricordi\. Apri la mappa"/);
  assert.doesNotMatch(html, /<b>Padova <b>/, 'labels are escaped');
  assert.equal((html.match(/class="rb-pol" data-board-moment=/g) || []).length, 3);
  assert.match(html, /<path d="M[^"]+Q[^"]+"\/>/);
  assert.match(html, /<h4 id="rbLooseTitle">Da appuntare<\/h4>[\s\S]*data-board-moment="d"[\s\S]*<button type="button" class="rb-add" data-board-add="d">Aggiungi il posto<\/button>/);
  assert.match(P.boardMarkup([item('d', null, null, '', '2026-04-01')], 360), /Ancora nessun posto sulla bacheca/);
});

test('wired in: the switch, the board, the tape colour, the polaroid look', () => {
  const src = read('ricordi-place.js');
  assert.match(src, /const VIEWS = \['story', 'board', 'map'\];/);
  assert.match(src, /if \(tag\) setView\('map', \{ focus: \{ lat: Number\(tag\.dataset\.boardLat\), lon: Number\(tag\.dataset\.boardLon\) \} \}\);/);
  assert.match(src, /map\.flyTo\(\{ center: \[focus\.lon, focus\.lat\], zoom: 14, essential: true \}\)/);
  assert.match(src, /await save\(id, place\);/);
  assert.doesNotMatch(src.slice(src.indexOf('// ---- La bacheca')), /\.rpc\(|\.from\(|fetch\(/, 'the board reads nothing new');
  assert.match(read('app.js'), /data-moment-by="\$\{row\.created_by===window\.usProfile\?\.id\?'tu':'partner'\}"/);
  const css = read('dc-ricordi.css');
  assert.match(css, /#moments #momentsGrid\.moment-grid\.ricordi-story\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;/);
  assert.match(css, /article\.moment-card\.moment-postit\[data-moment-by="tu"\]::before\{background:color-mix\(in srgb,var\(--us-tu\) 78%,transparent\)/);
  assert.match(css, /\.rb-string path\{fill:none;stroke:#d9435a;/);
  for (const it of ['Raccolta', 'Bacheca', 'Da appuntare', 'Aggiungi il posto', 'Come vedere i Ricordi', 'Bacheca dei Ricordi']) assert.ok(read('i18n-en.js').includes(`'${it}'`) || read('i18n-en.js').includes(`${it}:`), it);
});
