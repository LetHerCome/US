// La bacheca, fasi 2 e 3 (founder, grill 27/11/2026 D1–D16, tavola approvata):
// your post-its in the thing's sheet and on the board, «Sulla bacheca» in the
// memory, the lens of Ricordi with its results, «Appendi», «fai spazio». Pure
// helpers, the wiring, and the real app with the fake Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../bacheca.js');
const C = require('../ricordi-cerca.js');
const { start, pageFor } = require('./helpers/countdown-browser');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('post-its: US\'s why stays with the thing, 80 characters, the newest of the other person', () => {
  assert.equal(B.whyOf({ by_us: false, reason: 'scelta', why: { reason: 'primo', vars: {} } }), 'Il vostro primo ricordo', 'yours now, US\'s why still shows');
  assert.equal(B.whyOf({ by_us: true, reason: 'primo', why: null }), '', 'the server says there is none');
  assert.equal(B.whyOf({ by_us: true, reason: 'settimana' }), 'Il ricordo della settimana', 'an older server: the pin\'s own reason');
  assert.equal(B.cleanNote('  Il giorno   che\nhai perso  '), 'Il giorno che hai perso');
  assert.equal(B.noteCount('x'.repeat(46)), '46/80');
  const pins = [{ id: 'a', notes: [{ id: 'n1', mine: false, at: '2026-11-26T10:00:00Z' }, { id: 'n2', mine: true, at: '2026-11-27T10:00:00Z' }] }, { id: 'b', notes: [{ id: 'n3', mine: false, at: '2026-11-27T09:00:00Z' }] }];
  assert.deepEqual([B.newestPartnerNote(pins).pin.id, B.newestPartnerNote(pins).note.id], ['b', 'n3']);
  assert.equal(B.newestPartnerNote([]), null);
  assert.equal(B.whenShort(new Date().toISOString()), 'oggi');
  assert.equal(B.titleOf({ source: 'keepsake', content: { question: 'Il posto dove vorresti tornare?' } }), 'Il posto dove vorresti tornare?');
});

test('the lens: month by month, the count, the quick searches of the empty field', () => {
  const groups = C.groupByMonth([{ date: '2025-08-20' }, { date: '2025-08-02' }, { date: '2024-08-12' }]);
  assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [['agosto 2025', 2], ['agosto 2024', 1]]);
  assert.deepEqual([0, 1, 9].map(C.countLabel), ['Nessun ricordo', 'Un ricordo', '9 ricordi']);
  assert.equal(C.criteria({ q: 'm' }), false, 'one letter is not a search');
  assert.equal(C.criteria({ q: 'ma' }), true);
  assert.equal(C.criteria({ q: '', who: 'me' }), true);
  const quick = C.quickSearches({ years: [2026, 2025, 2024, 2023, 2022], places: ['Padova', 'Pescara', 'Sperlonga', 'Vasto'], year_ago: { year: 2025, month: 11, count: 3 } }, 'Bea');
  assert.deepEqual(quick.map((q) => q.label), ['Un anno fa', '2026', '2025', '2024', '2023', 'Padova', 'Pescara', 'Sperlonga', 'Le mie', 'Di Bea']);
  assert.deepEqual(quick[0].set, { year: 2025, month: 11 });
  assert.ok(!C.quickSearches({ years: [], places: [], year_ago: { count: 0 } }, 'Bea').some((q) => q.kind === 'ago'), 'no «Un anno fa» without memories then');
});

test('wiring: the lens in the head of Ricordi, the sheets, Back, caches, builds, the memory, English', () => {
  const html = read('index.html');
  // The lens loads its code and styles when first tapped: the search needs the network anyway.
  assert.doesNotMatch(html, /src="\/ricordi-cerca\.js/);
  assert.match(read('bacheca.js'), /const LENS = 'ricordi-cerca';[\s\S]*script\.src = `\/\$\{LENS\}\.js\$\{version\}`/);
  assert.match(read('bacheca.js'), /link\.href = `\/\$\{LENS\}\.css\$\{version\}`/);
  assert.match(html, /data-ricordi-view="map" aria-selected="false">Mappa<\/button><button type="button" role="tab" data-ricordi-view="carte" aria-selected="false">Carte<\/button><\/div><button type="button" class="ricordi-lens" data-ricordi-cerca aria-label="Cerca nei ricordi"/);
  assert.ok(html.indexOf('id="usRicordiCerca"') < html.indexOf('id="usBachecaSheet"'), 'the board\'s sheet opens over the search');
  assert.match(html, /<div class="ub-notes-sec" id="usBachecaNotes"><\/div>/);
  const nav = read('navigation.js');
  assert.match(nav, /name:'ricordi-cerca',\s*find:\(\)=>document\.getElementById\('usRicordiCerca'\)/);
  assert.match(nav, /name:'bacheca-spazio'[\s\S]{0,200}window\.UsBacheca\?\.cancelRoom\?\.\(\)/);
  const sw = read('service-worker.js');
  assert.ok(!sw.includes('ricordi-cerca'), 'out of the offline shell');
  assert.ok(sw.includes('"/assets/icons/phosphor/magnifying-glass-regular.svg"'));
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.ok(read(f).includes("'ricordi-cerca.js',\n  'ricordi-cerca.css'"), f);
  assert.ok(read('ui-foundation.css').includes('.us-icon[data-us-icon="magnifying-glass"]{--us-icon-src:url("/assets/icons/phosphor/magnifying-glass-regular.svg")}'));
  assert.match(read('assets/icons/phosphor/magnifying-glass-regular.svg'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 256 256" fill="currentColor"><path d="/);
  assert.ok(JSON.parse(read('assets/ICON_REGISTRY.json')).icons.some((i) => i.id === 'search' && i.phosphorName === 'MagnifyingGlass'));
  const album = read('moments-albums.js');
  assert.match(album, /<section class="us-album-bacheca" id="usAlbumBacheca" hidden><\/section>/);
  assert.match(album, /window\.UsBacheca\?\.memoryRow\?\.\(board,\{ref:`moment:\$\{id\}`/);
  assert.match(read('tests/i18n-coverage.test.js'), /'bacheca\.js', 'ricordi-cerca\.js'/);
  const cerca = read('ricordi-cerca.js');
  assert.match(cerca, /db\(\)\.rpc\('search_ricordi_v1'/);
  assert.doesNotMatch(cerca, /localStorage|sessionStorage/, 'the words typed are never kept on the phone');
  const css = read('dc-ricordi.css') + read('ricordi-cerca.css');
  for (const sel of ['.ub-row .ub-row-write{min-height:44px', '#usRicordiCerca .rc-chip{display:inline-flex;align-items:center;gap:6px;min-height:44px', '#moments .ricordi-lens{grid-column:2;grid-row:1;display:grid;place-items:center;width:52px;height:52px']) assert.ok(css.includes(sel), sel);
  assert.doesNotMatch(read('dc-ricordi.css'), /#usRicordiCerca \.rc-/, 'the search styles come with the lens');
});

const mk = (i, extra = {}) => ({ id: `p${i}`, ref_key: `moment:s${i}`, source: 'moment', source_id: `s${i}`, reason: 'storia', vars: {}, item_date: `2024-0${i}-10`, by_us: true, mine: false, fixed: false, x: null, y: null, created_at: '2026-11-20T10:00:00Z', why: { reason: 'storia', vars: {} }, notes: [], content: { path: 'x', caption: `Ricordo ${i}` }, ...extra });
// The couple of the fixture, the board given, every call and toast written down.
function prepare(board) {
  window.UsAngolo?.isola?.(false);
  window.__QA.calls = [];
  window.__QA.pushes = [];
  window.__toasts = [];
  const toast = window.toast;
  window.toast = (m) => { window.__toasts.push(m); return toast?.(m); };
  window.sendWebPushEvent = async (type, id) => { window.__QA.pushes.push([type, id]); return {}; };
  window.usGetSignedUrl = async () => '/icon-512.png';
  window.__QA.board = board;
  window.__QA.rpc.get_bacheca_v1 = async () => ({ data: structuredClone(window.__QA.board), error: null });
}
async function app(h, board) {
  const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
  await page.waitForFunction(() => window.UsBacheca && window.UsRicordiPlace);
  await page.evaluate(prepare, board);
  return { page, ctx, errors };
}
async function tap(page, selector) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('in the app: the sheet shows US\'s post-it and the other one\'s; yours is counted, attached, pushed and drawn', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const board = { limit: 12, plus: false, pins: [mk(1, { reason: 'primo', why: { reason: 'primo', vars: {} }, notes: [{ id: 'n-bea', by: 'b1', mine: false, body: 'Torniamo a giugno?', at: '2026-10-03T09:00:00Z' }] }), mk(2), mk(3)] };
    const { page, ctx, errors } = await app(h, board);
    await page.evaluate(() => {
      window.__QA.rpc.bacheca_postit_v1 = async (args) => {
        window.__QA.calls.push(args);
        window.__QA.board.pins[0].notes.push({ id: 'n-me', by: 'f1', mine: true, body: args.p_body, at: new Date().toISOString() });
        window.__QA.board.pins[0].by_us = false;
        return { data: { status: 'saved', id: 'n-me', created: true }, error: null };
      };
      window.go('moments', { nav: true });
    });
    await page.click('#moments [data-ricordi-view="board"]');
    await page.waitForSelector('#ricordiBacheca [data-ub-pin="p1"] .ub-pn');
    assert.equal(await page.locator('[data-ub-pin="p1"] .ub-pn[data-who="you"] .ub-pn-text').innerText(), 'Torniamo a giugno?');
    // Keyboard: the thing opens its sheet with Enter.
    await page.focus('[data-ub-pin="p1"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#usBachecaSheet.open #usBachecaNoteInput');
    const list = await page.locator('#usBachecaSheet .ub-notes-list .ub-pn').allInnerTexts();
    assert.deepEqual(list.map((x) => x.replace(/\s+/g, ' ').trim()), ['Il vostro primo ricordo US', 'Torniamo a giugno? Beatrice · 3 ottobre']);
    assert.equal(await page.locator('#usBachecaSheet [data-ub-note="remove"]').isHidden(), true, 'nothing of yours to take down yet');
    await page.fill('#usBachecaNoteInput', 'Il giorno che hai perso le ciabatte nell\'acqua');
    assert.equal(await page.locator('#usBachecaNoteCount').innerText(), '46/80');
    assert.equal(await page.getAttribute('#usBachecaNoteInput', 'maxlength'), '80');
    const save = await page.locator('#usBachecaSheet [data-ub-note="save"]').boundingBox();
    assert.ok(save.height >= 44, 'a tap target of 44px at least');
    await page.click('#usBachecaSheet [data-ub-note="save"]');
    await page.waitForFunction(() => window.__QA.pushes.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__QA.calls[0]), { p_ref: 'moment:s1', p_body: 'Il giorno che hai perso le ciabatte nell\'acqua' });
    assert.deepEqual(await page.evaluate(() => window.__QA.pushes[0]), ['bacheca_postit', 'n-me']);
    await page.waitForSelector('[data-ub-pin="p1"] .ub-pn[data-who="me"]');
    assert.equal(await page.locator('[data-ub-pin="p1"] .ub-postit').innerText(), 'Il vostro primo ricordo', 'US\'s why stays next to yours');
    assert.ok((await page.evaluate(() => window.__toasts)).includes('Attaccato ♡'));
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});

test('in the app: the memory shows «Sulla bacheca» when it is not pinned, and «Riappendi in bacheca» pins it', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await app(h, { limit: 12, plus: false, pins: [mk(1)] });
    await page.evaluate(() => {
      window.__QA.thing = { ref_key: 'moment:m1', source: 'moment', source_id: 'm1', pin: null, why: { reason: 'primo', vars: {} }, notes: [{ id: 'n-bea', by: 'b1', mine: false, body: 'Torniamo a giugno?', at: '2026-11-26T09:00:00Z' }], count: 1, limit: 12 };
      window.__QA.rpc.get_bacheca_thing_v1 = async (args) => { window.__QA.calls.push(['thing', args]); return { data: structuredClone(window.__QA.thing), error: null }; };
      window.__QA.rpc.bacheca_pin_v1 = async (args) => { window.__QA.calls.push(['pin', args]); window.__QA.thing.pin = { id: 'p9', fixed: true, by_us: false }; window.__QA.board.pins.push({ id: 'p9' }); return { data: 'pinned', error: null }; };
      window.go('moments', { nav: true });
    });
    await page.waitForSelector('#momentsGrid .moment-card[data-moment-id="m1"]');
    await page.evaluate(() => document.querySelector('#momentsGrid .moment-card[data-moment-id="m1"]').click());
    await page.waitForSelector('#usAlbumBacheca.ub-row:not([hidden])');
    assert.match(await page.locator('#usAlbumBacheca .ub-row-kicker').innerText(), /Sulla bacheca/i);
    assert.deepEqual((await page.locator('#usAlbumBacheca .ub-pn p').allInnerTexts()), ['Il vostro primo ricordo', 'Torniamo a giugno?']);
    assert.equal(await page.locator('#usAlbumBacheca .ub-row-say').innerText(), 'Ora non è appesa: i post-it restano qui e tornano con lei se la riappendete.');
    await page.locator('#usAlbumBacheca [data-ub-row="pin"]').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#usAlbumBacheca [data-ub-row="pin"]').innerText(), 'Riappendi in bacheca');
    await page.click('#usAlbumBacheca [data-ub-row="pin"]');
    await page.waitForSelector('#usAlbumBacheca [data-ub-row="see"]');
    assert.deepEqual(await page.evaluate(() => window.__QA.calls.find((c) => c[0] === 'pin')[1]), { p_source: 'moment', p_source_id: 'm1' });
    assert.ok((await page.evaluate(() => window.__toasts)).includes('Appesa in bacheca ♡ · 2 di 12'));
    // «Scrivi il tuo» opens the post-it sheet over the memory.
    await page.click('#usAlbumBacheca [data-ub-row="write"]');
    await page.waitForSelector('#usBachecaSheet.open #usBachecaNoteInput');
    assert.equal(await page.locator('#usBachecaSheet .ub-sheet-actions').isHidden(), true, 'only the post-its, from the memory');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});

test('in the app: the lens searches on the server, shows months and the pin badge; a result opens with «Vedilo in bacheca»', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await app(h, { limit: 12, plus: false, pins: [mk(1), mk(2, { id: 'p-sea', ref_key: 'moment:sea', source_id: 'sea' })] });
    await page.evaluate(() => {
      window.__QA.searches = [];
      const hints = { years: [2026, 2025, 2024], places: ['Padova', 'Pescara', 'Sperlonga', 'Vasto'], year_ago: { year: 2025, month: 11, count: 2 }, pinned: 2, limit: 12 };
      const results = [
        { kind: 'moment', id: 'sea', ref_key: 'moment:sea', date: '2025-08-20', by: 'f1', mine: true, content: { caption: 'Il mare', place: 'Sperlonga', path: 'x' }, pin: 'p-sea' },
        { kind: 'conserva', id: 'cc1', ref_key: 'conserva:cc1', date: '2025-08-02', by: 'b1', mine: false, content: { kind: 'text', body: 'Il mare d’inverno con te' }, pin: null },
        { kind: 'keepsake', id: 'k1', ref_key: 'keepsake:k1', date: '2025-06-20', by: 'f1', mine: true, content: { question: 'Dove vorresti tornare?', francesco: 'Il mare, sempre il mare', beatrice: 'Vasto' }, pin: null },
      ];
      window.__QA.rpc.search_ricordi_v1 = async (args) => { window.__QA.searches.push(args); const any = args.p_query || args.p_year || args.p_place || args.p_who; return { data: { results: any ? results : [], hints }, error: null }; };
      window.__QA.rpc.get_bacheca_thing_v1 = async ({ p_ref }) => ({ data: { ref_key: p_ref, source: p_ref.split(':')[0], source_id: p_ref.split(':')[1], pin: p_ref === 'moment:sea' ? { id: 'p-sea', fixed: false, by_us: true } : null, why: null, notes: [], count: 2, limit: 12 }, error: null });
      window.go('moments', { nav: true });
    });
    await page.waitForSelector('#moments [data-ricordi-cerca]', { state: 'visible' });
    const lens = await page.locator('#moments [data-ricordi-cerca]').boundingBox();
    assert.ok(lens.width >= 44 && lens.height >= 44);
    await page.click('#moments [data-ricordi-cerca]');
    await page.waitForSelector('#usRicordiCerca.open .rc-quick [data-rc-quick]');
    assert.deepEqual(await page.locator('#usRicordiCerca [data-rc-quick]').allInnerTexts(), ['Un anno fa', '2026', '2025', '2024', 'Padova', 'Pescara', 'Sperlonga', 'Le mie', 'Di Beatrice']);
    await page.fill('#usRicordiCercaInput', 'mare');
    await page.waitForSelector('#usRicordiCerca .rc-month');
    assert.deepEqual(await page.evaluate(() => window.__QA.searches.at(-1)), { p_query: 'mare', p_year: null, p_place: null, p_who: null, p_month: null });
    assert.deepEqual(await page.locator('#usRicordiCerca .rc-month-title').allInnerTexts(), ['Agosto 2025', 'Giugno 2025']);
    assert.equal(await page.locator('#usRicordiCerca .rc-count').innerText(), '3 ricordi');
    assert.equal(await page.locator('#usRicordiCerca .rc-pol .rc-pinned').count(), 1, 'the one on the board has its pin');
    assert.equal(await page.locator('#usRicordiCerca .rc-letter').count(), 1);
    assert.equal(await page.locator('#usRicordiCerca .rc-note').count(), 1);
    // A filter: «Le mie».
    await page.click('#usRicordiCerca [data-rc-who="me"]');
    await page.waitForFunction(() => window.__QA.searches.at(-1).p_who === 'me');
    // The result on the board: «Vedilo in bacheca» opens the board on it.
    await page.click('#usRicordiCerca [data-rc-open="0"]');
    await page.waitForSelector('#usRicordiCercaRow [data-ub-row="see"]');
    assert.equal(await page.locator('#usRicordiCerca .rc-detail-count').innerText(), '«mare» · 1 di 3');
    await page.click('#usRicordiCercaRow [data-ub-row="see"]');
    await page.waitForSelector('#ricordiBacheca:not([hidden]) [data-ub-pin="p-sea"].is-focus');
    await page.waitForSelector('#usRicordiCerca[aria-hidden="true"]', { state: 'attached' });
    assert.equal(await page.inputValue('#usRicordiCercaInput'), '', 'nothing typed stays behind');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});

test('in the app: a full board asks what to take down; fixed things cannot be picked; «Stacca e appendi» swaps them', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const pins = Array.from({ length: 12 }, (_, i) => mk(i + 1, { fixed: i < 4, content: { path: 'x', caption: `Ricordo ${i + 1}` } }));
    const { page, ctx, errors } = await app(h, { limit: 12, plus: false, pins });
    await page.evaluate(() => {
      window.__QA.rpc.bacheca_pin_v1 = async (args) => {
        window.__QA.calls.push(args);
        if (!args.p_replace) return { data: 'full', error: null };
        const b = window.__QA.board;
        b.pins = b.pins.filter((p) => p.id !== args.p_replace);
        b.pins.push({ id: 'p-new', ref_key: 'moment:vasto', source: 'moment', source_id: 'vasto', reason: 'scelta', vars: {}, item_date: '2025-06-14', by_us: false, mine: true, fixed: true, x: null, y: null, created_at: new Date().toISOString(), why: null, notes: [], content: { path: 'x', caption: 'Vasto, tramonto' } });
        return { data: 'replaced', error: null };
      };
      window.go('moments', { nav: true });
      window.UsBacheca.pinThing({ source: 'moment', id: 'vasto', title: 'Vasto, tramonto' });
    });
    await page.waitForSelector('#ricordiBacheca.is-room .ub-room-head');
    assert.match(await page.locator('.ub-room-head').innerText(), /La bacheca è piena · 12 di 12[\s\S]*Tocca cosa staccare per appendere «Vasto, tramonto»/);
    assert.equal(await page.getAttribute('[data-ub-pin="p1"]', 'aria-disabled'), 'true', 'a fixed thing is not selectable');
    assert.equal(await page.locator('[data-ub-room="go"]').isDisabled(), true);
    await page.focus('[data-ub-pin="p1"]');
    await page.keyboard.press('Enter');
    assert.equal(await page.getAttribute('[data-ub-pin="p1"]', 'aria-disabled'), 'true');
    assert.equal(await page.locator('#usBachecaSheet.open').count(), 0, 'in fai spazio a thing never opens its sheet');
    await page.focus('[data-ub-pin="p7"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-ub-pin="p7"][aria-pressed="true"] .ub-check');
    assert.match(await page.locator('.ub-room-say').innerText(), /Al posto di «Ricordo 7» va «Vasto, tramonto»/);
    await page.click('[data-ub-room="go"]');
    await page.waitForSelector('#ricordiBacheca:not(.is-room) [data-ub-pin="p-new"]');
    assert.deepEqual(await page.evaluate(() => window.__QA.calls.at(-1)), { p_source: 'moment', p_source_id: 'vasto', p_replace: 'p7' });
    assert.equal(await page.locator('[data-ub-pin="p7"]').count(), 0);
    assert.ok((await page.evaluate(() => window.__toasts)).includes('Appesa in bacheca ♡ · 12 di 12'));
    // «Annulla» leaves everything as it was.
    await page.evaluate(() => window.UsBacheca.pinThing({ source: 'moment', id: 'altro', title: 'Un altro' }));
    await page.waitForSelector('#ricordiBacheca.is-room');
    await page.click('[data-ub-room="cancel"]');
    await page.waitForSelector('#ricordiBacheca:not(.is-room) .ub-controls');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});
