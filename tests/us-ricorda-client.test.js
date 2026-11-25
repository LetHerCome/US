// US vi ricorda (founder, 25/11/2026): the app writes the characters' line
// from the kind and values the server planned, chooses the strongest of the
// moment (D20), says it only 9–21 and memories from 17 (D12), and every line
// prepares a gesture without sending it (D7). Wiring: the bubble out of the
// island, the sheet, Voi, the switch, the caches and builds.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../us-ricorda.js');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const b = (kind, vars = {}, extra = {}) => ({ kind, vars, ref_key: `${kind}:x`, speaker: 'me', slot: 'mattina', ...extra });

test('sentences: five variants a kind, short, no emoji, never a reproach; the same line keeps its words', () => {
  const samples = [
    b('compleanno', { name: 'Bea', days: 7, date: '2026-12-02' }), b('compleanno', { name: 'Bea', days: 1 }), b('compleanno', { name: 'Bea', days: 0 }),
    b('anniversario', { years: 2, days: 7 }), b('anniversario', { years: 1, days: 0 }), b('mesiversario', { months: 7 }), b('giorni', { days: 300 }),
    b('un_anno_fa', { source: 'moment', place: 'Padova' }), b('un_anno_fa', { source: 'moment' }), b('un_anno_fa', { source: 'meet', title: 'Treno' }), b('un_anno_fa', { source: 'idea', title: 'Cena al lago' }),
    b('traguardo', { what: 'luogo', place: 'Roma' }), b('traguardo', { what: 'ricordi', count: 100 })
  ];
  for (const s of samples) {
    const list = R.lines(s.kind, s.vars, 'Bea');
    assert.equal(list.length, 5, `${s.kind} ${JSON.stringify(s.vars)}: five variants`);
    for (const l of list) {
      assert.ok(l.length <= 92, `${l} (${l.length})`);
      assert.doesNotMatch(l, /\p{Extended_Pictographic}/u, 'no emoji');
      assert.doesNotMatch(l, /da un po'|non hai|ancora niente|dimenticat/i, 'never a reproach');
      assert.ok((l.match(/!/g) || []).length <= 1);
    }
    assert.equal(R.sentence(s, 'Bea'), R.sentence({ ...s }, 'Bea'), 'stable for the same line');
  }
  assert.match(R.sentence(b('compleanno', { name: 'Bea', days: 7, date: '2026-12-02' }), 'Bea'), /Bea/);
  assert.match(R.sentence(b('un_anno_fa', { source: 'moment', place: 'Padova' }), 'Bea'), /Padova|un anno fa/i);
});

test('the moment\'s line: the introduction first, then birthday or anniversary, then «ti aspetta», then the rest', () => {
  const none = new Set();
  assert.equal(R.choose({ server: b('un_anno_fa'), tocca: 'daily', introduced: false, mutedKinds: none }).kind, 'presentazione');
  assert.equal(R.choose({ server: b('compleanno'), tocca: 'daily', introduced: true, mutedKinds: none }).kind, 'compleanno');
  assert.equal(R.choose({ server: b('un_anno_fa'), tocca: 'game', introduced: true, mutedKinds: none }).kind, 'ti_aspetta');
  assert.equal(R.choose({ server: b('un_anno_fa'), tocca: 'game', introduced: true, mutedKinds: new Set(['ti_aspetta']) }).kind, 'un_anno_fa');
  assert.equal(R.choose({ server: null, tocca: '', introduced: true, mutedKinds: none }), null, 'nothing true to say: quiet');
});

test('hours: 9 to 21, memories from 17', () => {
  assert.equal(R.inWindow(b('compleanno'), 8), false);
  assert.equal(R.inWindow(b('compleanno'), 9), true);
  assert.equal(R.inWindow(b('compleanno'), 21), false);
  assert.equal(R.inWindow(b('un_anno_fa', {}, { slot: 'sera' }), 12), false);
  assert.equal(R.inWindow(b('un_anno_fa', {}, { slot: 'sera' }), 18), true);
});

test('every line prepares a gesture; none sends anything', () => {
  assert.deepEqual(R.action(b('un_anno_fa', { source: 'moment', path: 'c/a.webp', place: 'Padova', date: '2025-11-25' }), 'Bea').go, 'lfy-photo');
  assert.equal(R.action(b('un_anno_fa', { source: 'idea', title: 'Cena' }), 'Bea').go, 'lfy');
  assert.equal(R.action(b('compleanno', { name: 'Bea', days: 0 }), 'Bea').label, 'Scrivi a Bea');
  assert.equal(R.action(b('conoscervi', { ask: 'compleanno', name: 'Fra' }), 'Bea').go, 'birthday');
  assert.equal(R.action(b('ti_aspetta', { what: 'game' }), 'Bea').go, 'games');
  const js = read('us-ricorda.js');
  assert.doesNotMatch(js, /\.send\(|sendWebPushEvent|from\('left_for_you'\)|insert\(/, 'it opens composers, it never sends');
  assert.match(js, /client\.rpc\('get_my_battuta_v1'\)/);
});

test('wiring: the bubble out of the island, the sheet, Voi, the switch, back, caches and builds', () => {
  const html = read('index.html');
  assert.match(html, /<\/button><div class="us-fumetto" id="usFumetto" data-speaker="me" hidden><button type="button" class="us-fumetto-body" data-us-fumetto>/);
  assert.match(html, /<div class="us-cal-sheet-overlay us-battuta" id="usBattuta" aria-hidden="true" data-us-modal data-us-motion-surface>/);
  assert.match(html, /<section class="us-angolo-oggi" id="usAngoloOggi" aria-label="Oggi ti ho detto" hidden><\/section>/);
  assert.match(html, /<script defer src="\/us-ricorda\.js\?v=[^"]+"><\/script>/);
  const p = read('personaggi.js');
  assert.match(p, /function parla\(\{ text, speaker = 'me', cta = '', reaction, onTap, onHold, ms = 8000 \} = \{\}\)/);
  assert.match(p, /w\.UsAngolo = Object\.freeze\(\{ open: openAngolo, close: closeAngolo, tab: showTab, isola: setIsola, parla \}\);/);
  assert.ok(read('app.js').includes("if(typeof window!=='undefined')window.dispatchEvent?.(new CustomEvent('us:tocca-a-te',{detail:{daily:Boolean(daily),game:Boolean(game)}}));"));
  assert.match(read('settings.js'), /<b>Le voci dei personaggi<\/b>/);
  assert.match(read('navigation.js'), /name:'battuta',\s*find:\(\)=>document\.getElementById\('usBattuta'\)/);
  assert.ok(read('service-worker.js').includes('versioned("/us-ricorda.js")'));
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.ok(read(f).includes("'us-ricorda.js'"), f);
});
