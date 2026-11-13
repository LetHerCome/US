// Lavagna V1 in the app (founder, 03/11/2026; boards Main and LavagnaAperta):
// the tile at the top of the Noi bacheca, the board full screen, drawn with a
// finger (pointer events). Every stroke is simplified here and saved when the
// finger lifts; the partner's strokes, undos and «Pulisci» arrive through the
// one Realtime channel; the push goes at most every 2 hours.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const L = require('../lavagna.js');

const line = (n, from = [100, 100], step = [3, 2]) => Array.from({ length: n }, (_, i) => [from[0] + step[0] * i, from[1] + step[1] * i]);
const stroke = (id, points, extra = {}) => ({ id, tool: 'pen', color: 'rosa', width: 1, points, author_id: 'me', created_at: '2026-11-03T10:00:00.000Z', ...extra });

test('pack: a straight line keeps its two ends, corners stay, the board bounds hold', () => {
  assert.deepEqual(L.pack(line(120)), [100, 100, 457, 338]);
  const corner = [...line(41, [100, 100], [5, 0]), ...line(40, [300, 100], [0, 5]).slice(1)];
  assert.deepEqual(L.pack(corner), [100, 100, 300, 100, 300, 295]);
  assert.deepEqual(L.pack([[-20, 1700.4], [1200, -3]]), [0, 1600, 1000, 0], 'clamped and rounded');
  assert.deepEqual(L.pack([[500.4, 800.6], [500.2, 800.9]]), [500, 801], 'a tap is one point');
  assert.equal(L.pack([]), null);
  assert.equal(L.pack([[NaN, 3]]), null);
});

test('pack: a long scribble is simplified to at most 600 points', () => {
  const scribble = Array.from({ length: 5000 }, (_, i) => [500 + 400 * Math.sin(i / 7), 800 + 700 * Math.sin(i / 11 + 1)]);
  const packed = L.pack(scribble);
  assert.ok(packed.length <= 1200 && packed.length >= 200, `${packed.length / 2} points`);
  assert.ok(packed.every((v) => Number.isInteger(v)));
  assert.deepEqual(L.unpack([1, 2, 3, 4]), [[1, 2], [3, 4]]);
});

test('frame: the tile and the widget show the drawing, never closer than half the board', () => {
  assert.deepEqual(L.frame([], 2), { x: 0, y: 0, w: 1000, h: 500 }, 'empty: the top of the board');
  const dot = L.frame([stroke('a', [500, 800])], 1);
  assert.deepEqual(dot, { x: 250, y: 550, w: 500, h: 500 }, 'a dot stays small, in the middle');
  const wide = L.frame([stroke('a', [100, 700, 900, 700])], 1.8);
  assert.ok(Math.abs(wide.w / wide.h - 1.8) < 1e-9);
  assert.ok(wide.x < 100 && wide.x + wide.w > 900, 'the whole stroke is inside');
  // The eraser never makes the frame bigger.
  assert.deepEqual(L.frame([stroke('a', [500, 800]), stroke('b', [0, 0, 1000, 1600], { tool: 'eraser', color: null })], 1), dot);
});

test('ago: the same words as the rest of US', () => {
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  const at = (ms) => new Date(now - ms).toISOString();
  assert.equal(L.ago(at(20_000), now), 'proprio ora');
  assert.equal(L.ago(at(5 * 60_000), now), '5 min fa');
  assert.equal(L.ago(at(65 * 60_000), now), '1 ora fa');
  assert.equal(L.ago(at(3 * 3600_000), now), '3 ore fa');
  assert.equal(L.ago(at(30 * 3600_000), now), '1 giorno fa');
  assert.equal(L.ago(at(4 * 86400_000), now), '4 giorni fa');
  assert.equal(L.ago('', now), '');
});

test('board row: the partner\'s undo removes that stroke, «Pulisci» empties, anything else reloads', () => {
  const list = [stroke('a', [1, 2], { created_at: '2026-11-03T10:00:00Z' }), stroke('b', [1, 2], { created_at: '2026-11-03T10:01:00Z' }), stroke('c', [1, 2], { created_at: '2026-11-03T10:05:00Z' }), stroke('p', [1, 2], { created_at: null, pending: true })];
  const undo = L.applyBoard(list, { revision: 2, removed: ['b'], cleared_at: null }, { revision: 1, clearedAt: '' });
  assert.deepEqual(undo.strokes.map((s) => s.id), ['a', 'c', 'p']);
  assert.equal(undo.reload, false);
  const clean = L.applyBoard(list, { revision: 3, removed: ['a', 'b'], cleared_at: '2026-11-03T10:02:00Z' }, { revision: 2, clearedAt: '' });
  assert.deepEqual(clean.strokes.map((s) => s.id), ['c', 'p'], 'what was drawn after the cleaning stays');
  assert.equal(clean.clearedAt, '2026-11-03T10:02:00Z');
  assert.equal(L.applyBoard(list, { revision: 4, removed: null, cleared_at: null }, { revision: 3, clearedAt: '' }).reload, true, 'more than 200 went: reload');
  assert.equal(L.applyBoard(list, { revision: 3, removed: ['a'], cleared_at: null }, { revision: 3, clearedAt: '' }).strokes.length, 4, 'an old revision changes nothing');
});

test('push: at most once every 2 hours from this phone too; the server decides the rest', () => {
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  assert.equal(L.pushDue(0, now), true);
  assert.equal(L.pushDue(now - 119 * 60_000, now), false);
  assert.equal(L.pushDue(now - 121 * 60_000, now), true);
});

test('colours: the four of the board, and the Pastello forms for the light widget', () => {
  assert.deepEqual(L.COLORS, { rosa: '#ff7c96', lilla: '#a98bff', ambra: '#f3b76e', latte: '#f7efe9' });
  assert.deepEqual(Object.keys(L.PASTEL), ['rosa', 'lilla', 'ambra', 'latte']);
  assert.equal(L.PASTEL.latte, '#1a1020', 'milk becomes ink on cream paper');
  assert.deepEqual(L.LIMITS, { points: 600, strokes: 1500 });
});

test('module: pointer events, one finger, strokes saved on lift with their own id, undo and clear on the server', () => {
  const src = read('lavagna.js');
  for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) assert.ok(src.includes(`'${event}'`), event);
  assert.match(src, /setPointerCapture\(/);
  assert.match(src, /getCoalescedEvents/);
  assert.match(src, /if\(active!==null\)return;/, 'a second finger never draws');
  assert.match(src, /from\('lavagna_strokes'\)\.insert\(\{id:s\.id,couple_id:/);
  assert.match(src, /crypto\?\.randomUUID\?\.\(\)/);
  assert.match(src, /\.rpc\('lavagna_undo'\)/);
  assert.match(src, /\.rpc\('lavagna_clear'\)/);
  assert.match(src, /confirm\?\.\(\{[^}]*tone:'danger'/);
  assert.match(src, /\.range\(from,from\+PAGE-1\)/, 'paged: Supabase answers 1000 rows at most');
  assert.match(src, /sendWebPushEvent\?\.\('lavagna',/);
  assert.match(src, /globalCompositeOperation=s\.tool==='eraser'\?'destination-out':'source-over'/);
  assert.match(read('lavagna.css'), /\.us-lav-canvas\{[^}]*touch-action:none/);
});

test('wiring: the slot in Noi, scripts and styles everywhere, back closes it, Realtime on the one channel', () => {
  const html = read('index.html');
  assert.match(html, /<div id="usNoiLavagnaSlot"/);
  assert.match(html, /<link rel="stylesheet" href="\/lavagna\.css\?v=[^"]+"\/>/);
  assert.match(html, /<script defer src="\/lavagna\.js\?v=[^"]+"><\/script>/);
  const worker = read('service-worker.js');
  for (const file of ['lavagna.js', 'lavagna.css']) {
    assert.ok(worker.includes(`versioned("/${file}")`), `${file} precached`);
    for (const build of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.ok(read(build).includes(`'${file}'`), `${file} in ${build}`);
  }
  assert.match(read('navigation.js'), /find:\(\)=>document\.getElementById\('usLavagna'\),\s*open:el=>el\?\.classList\.contains\('open'\),\s*close:\(\)=>window\.UsLavagna\?\.close\?\.\(\)/);
  const app = read('app.js');
  assert.match(app, /\.on\('postgres_changes',\{event:'INSERT',schema:'public',table:'lavagna_strokes',filter:`couple_id=eq\.\$\{coupleId\}`\},payload=>window\.UsLavagna\?\.onStroke\?\.\(payload\)\)/);
  assert.match(app, /\.on\('postgres_changes',\{event:'\*',schema:'public',table:'lavagna_boards',filter:`couple_id=eq\.\$\{coupleId\}`\},payload=>window\.UsLavagna\?\.onBoard\?\.\(payload\)\)/);
  assert.match(app, /window\.UsLavagna\?\.reset\?\.\(\);/);
  const css = read('ui-foundation.css');
  for (const icon of ['eraser', 'arrow-counter-clockwise']) {
    assert.ok(css.includes(`.us-icon[data-us-icon="${icon}"]{--us-icon-src:url("/assets/icons/phosphor/${icon}-regular.svg")}`), icon);
    assert.ok(worker.includes(`"/assets/icons/phosphor/${icon}-regular.svg"`), `${icon} precached`);
    assert.match(read(`assets/icons/phosphor/${icon}-regular.svg`), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 256 256" fill="currentColor"><path d="/);
  }
});

test('English: every sentence of the board has its translation', () => {
  const en = read('i18n-en.js');
  for (const it of ['Torna a Noi', 'Pulisci', 'Pulire la lavagna?', 'Il disegno sparisce per tutti e due.', 'Ultimo tratto', 'Disegna', 'Apri la lavagna',
    'Rosa', 'Lilla', 'Ambra', 'Latte', 'Tratto sottile', 'Tratto spesso', 'Gomma', 'Annulla l’ultimo tratto', 'Strumenti della lavagna',
    'La lavagna è vuota', 'Disegnate qualcosa: lo vedete tutti e due', 'La lavagna è piena: puliscila per continuare', 'Tratto non salvato. Riprova tra poco.']) {
    assert.ok(en.includes(`'${it.replace(/'/g, "\\'")}':`) || en.includes(`"${it}":`) || new RegExp(`\\n\\s*${it}:`).test(en), it);
  }
});
