// La vostra bacheca (founder, 25/11/2026; grill D1–D27, tavola «US · La vostra
// bacheca»): the board in Ricordi is an endless corkboard kept by US. This file
// replaces the place board of fase 8 (ricordi-bacheca-fase8). Pure layout, the
// post-its, the news for the bubble, the wiring, and the board in the real app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../bacheca.js');
const R = require('../us-ricorda.js');
const { start, pageFor } = require('./helpers/countdown-browser');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const pin = (i, extra = {}) => ({ id: `p${i}`, source: 'moment', source_id: `s${i}`, reason: 'storia', vars: {}, item_date: `202${3 + (i % 3)}-0${1 + (i % 8)}-10`, by_us: true, mine: false, fixed: false, x: null, y: null, created_at: '2026-11-20T10:00:00Z', content: { caption: `R${i}` }, ...extra });

test('layout: along the road in time, two rows; a thing you moved keeps its place', () => {
  const nodes = B.layout([pin(1), pin(2), pin(3, { x: 900, y: 50 })]);
  assert.deepEqual(nodes.map((n) => [n.x, n.y]), [[110, 120], [340, 390], [900, 50]]);
  assert.match(B.roadPath(nodes), /^M\d+ \d+ Q\d+ \d+ \d+ \d+ Q/);
  assert.deepEqual(B.yearMarks(B.layout([pin(1, { item_date: '2023-06-01' }), pin(2, { item_date: '2023-09-01' }), pin(3, { item_date: '2024-01-01' })])).map((m) => m.year), ['2023', '2024']);
  assert.equal(B.shape(pin(1, { source: 'traguardo' })).kind, 'stamp');
  assert.equal(B.shape(pin(1, { source: 'conserva', content: { kind: 'text' } })).kind, 'letter');
  assert.equal(B.shape(pin(1, { source: 'conserva', content: { kind: 'photo' } })).kind, 'polaroid');
  assert.equal(B.shape(pin(1, { source: 'keepsake' })).kind, 'note');
});

test('post-its say why US pinned it; yours have none', () => {
  assert.equal(B.postit(pin(1, { reason: 'primo' })), 'Il vostro primo ricordo');
  assert.equal(B.postit(pin(1, { reason: 'un_anno_fa', vars: { place: 'Padova' } })), 'Un anno fa, a Padova');
  assert.equal(B.postit(pin(1, { reason: 'traguardo', vars: { what: 'anni', count: 2 } })), '2 anni insieme');
  assert.equal(B.postit(pin(1, { reason: 'traguardo', vars: { what: 'ricordi', count: 100 } })), '100 ricordi insieme');
  assert.equal(B.postit(pin(1, { reason: 'scelta', by_us: false, mine: true })), '');
  assert.equal(B.whenLabel('2026-11-24'), 'novembre 2026');
});

test('the bubble: only what US pinned after you last looked, never the first story; it opens the board', () => {
  const pins = [pin(1, { reason: 'primo', created_at: '2026-11-25T08:00:00Z' }), pin(2, { reason: 'un_anno_fa', vars: { place: 'Padova' }, created_at: '2026-11-24T08:00:00Z' }), pin(3, { reason: 'settimana', by_us: false, mine: true, created_at: '2026-11-25T09:00:00Z' })];
  const news = B.newsOf(pins, Date.parse('2026-11-23T00:00:00Z'));
  assert.deepEqual([news.kind, news.vars.reason, news.vars.place, news.slot], ['bacheca', 'un_anno_fa', 'Padova', 'sera']);
  assert.equal(B.newsOf(pins, Date.parse('2026-11-24T09:00:00Z')), null, 'already seen');
  const none = new Set();
  assert.equal(R.choose({ server: { kind: 'compleanno', ref_key: 'x', vars: {} }, tocca: '', introduced: true, mutedKinds: none, bacheca: news }).kind, 'compleanno', 'dates first');
  assert.equal(R.choose({ server: { kind: 'traguardo', ref_key: 'x', vars: {} }, tocca: '', introduced: true, mutedKinds: none, bacheca: news }).kind, 'bacheca');
  assert.match(R.sentence(news, 'Bea'), /Padova/);
  assert.equal(R.action(news, 'Bea').go, 'bacheca');
});

test('wiring: the script, the sheet, Back, caches and builds; the old place board is gone', () => {
  const html = read('index.html');
  assert.match(html, /<script defer src="\/bacheca\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /<div class="ricordi-bacheca" id="ricordiBacheca" aria-label="La vostra bacheca, tenuta da US" hidden><\/div>/);
  assert.match(html, /id="usBachecaSheet" aria-hidden="true" data-us-modal data-us-motion-surface>/);
  for (const act of ['open', 'fix', 'unpin', 'ban']) assert.match(html, new RegExp(`data-ub-act="${act}"`), act);
  assert.match(read('navigation.js'), /name:'bacheca',\s*find:\(\)=>document\.getElementById\('usBachecaSheet'\)/);
  assert.ok(read('service-worker.js').includes('versioned("/bacheca.js")'));
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.ok(read(f).includes("'bacheca.js'"), f);
  const place = read('ricordi-place.js');
  assert.match(place, /if \(next === 'board'\) w\.UsBacheca\?\.show\?\.\(\);/);
  assert.doesNotMatch(place, /boardMarkup|boardLayout|data-board-add|Da appuntare/);
  assert.doesNotMatch(read('dc-ricordi.css'), /\.rb-/);
  assert.match(read('bacheca.js'), /db\(\)\.rpc\('get_bacheca_v1'\)/);
});

test('in the app: the board opens on «Adesso», a thing opens its sheet, «Fissa» calls the server', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await page.waitForFunction(() => window.UsBacheca && window.UsRicordiPlace);
    await page.evaluate(() => {
      window.UsAngolo?.isola?.(false);
      const mk = (i, extra) => ({ id: `p${i}`, source: 'moment', source_id: `s${i}`, reason: 'storia', vars: {}, item_date: `2024-0${i}-10`, by_us: true, mine: false, fixed: false, x: null, y: null, created_at: '2026-11-20T10:00:00Z', content: { path: 'x', caption: `Ricordo ${i}` }, ...extra });
      window.__QA.calls = [];
      window.__QA.rpc.get_bacheca_v1 = async () => ({ data: { limit: 12, plus: false, pins: [mk(1, { reason: 'primo' }), mk(2), mk(3, { reason: 'settimana' })] }, error: null });
      window.__QA.rpc.bacheca_pin_action_v1 = async (args) => { window.__QA.calls.push(args); return { data: true, error: null }; };
      window.usGetSignedUrl = async () => '/icon-512.png';
      window.go('moments', { nav: true });
    });
    await page.click('#moments [data-ricordi-view="board"]');
    await page.waitForSelector('#ricordiBacheca [data-ub-pin="p3"]');
    assert.equal(await page.locator('#ricordiBacheca .ub-count').innerText(), '3 su 12 · gratis');
    assert.equal(await page.locator('#ricordiBacheca .ub-postit').first().innerText(), 'Il vostro primo ricordo');
    const box = await page.locator('[data-ub-pin="p3"]').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('#usBachecaSheet.open');
    assert.equal(await page.locator('#usBachecaSheetTitle').innerText(), 'Ricordo 3');
    await page.click('#usBachecaSheet [data-ub-act="fix"]');
    await page.waitForFunction(() => window.__QA.calls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__QA.calls[0]), { p_pin: 'p3', p_action: 'fix' });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
