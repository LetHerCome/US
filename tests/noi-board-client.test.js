// Noi nuova, bacheca (founder, 03/11/2026, docs/DECISIONS.md; tavole
// Main.dc.html e Bacheca.dc.html): under the calendar the post-its, written
// and ticked on the page, each on one of four papers with its author at the
// bottom; at most six on Noi, then «Tutti i post-it (n)» opens the whole
// board with the colour filters. On top the fixed «Da vivere» post-it with
// the couple's ideas: ticking one means «vissuta», with the same two-person
// rule as before. The server rules are in couple-notes-color-db.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const N = require('../couple-notes.js');

const note = (id, at, color) => ({ id, title: `n${id}`, body: '', items: [], color, updated_at: `2026-11-0${at}T10:00:00Z` });

test('four papers, yellow when unknown; the paper goes to the server with the note', () => {
  assert.deepEqual([...N.COLORS], ['yellow', 'pink', 'blue', 'green']);
  assert.equal(N.colorOf({ color: 'pink' }), 'pink');
  for (const bad of [undefined, null, '', 'red', 'Pink']) assert.equal(N.colorOf({ color: bad }), 'yellow', String(bad));
  assert.deepEqual(N.payload({ title: 'Spesa', body: '', items: [], color: 'green' }), { title: 'Spesa', body: '', items: [], color: 'green' });
  assert.equal(N.payload({ title: 'Spesa', color: 'viola' }).color, 'yellow');
});

test('on Noi the three newest post-its, six on the full-screen lavagna; the rest behind «Tutti i post-it (n)»', () => {
  const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => note(i, i));
  assert.equal(N.ON_NOI, 3);
  assert.equal(N.ON_BOARD, 6);
  assert.deepEqual(N.boardNotes(nine).shown.map((n) => n.id), [9, 8, 7], 'Noi (Fase B)');
  const board = N.boardNotes(nine, { max: N.ON_BOARD });
  assert.deepEqual(board.shown.map((n) => n.id), [9, 8, 7, 6, 5, 4]);
  assert.equal(board.total, 9);
  assert.equal(board.more, true);
  const few = N.boardNotes(nine.slice(0, 4), { max: N.ON_BOARD });
  assert.equal(few.shown.length, 4);
  assert.equal(few.more, false);
  assert.equal(N.boardNotes(nine, { max: 5 }).shown.length, 5, 'a new post-it being written takes a place');
});

test('the whole board filters by paper', () => {
  const list = [note(1, 1, 'pink'), note(2, 2), note(3, 3, 'pink'), note(4, 4, 'green')];
  assert.deepEqual(N.byColor(list, 'all').map((n) => n.id), [1, 2, 3, 4]);
  assert.deepEqual(N.byColor(list, 'pink').map((n) => n.id), [1, 3]);
  assert.deepEqual(N.byColor(list, 'yellow').map((n) => n.id), [2], 'no colour is yellow');
  assert.deepEqual(N.byColor(list, 'blue'), []);
});

// Noi, Fase B (D4, D12): the post-its sit where they were left on La lavagna;
// the ones never moved take free spots in the order they were written; the
// whole board filters by who wrote it.
test('Fase B: places on the lavagna, the move that is not a change, the filter by author', () => {
  const at = (id, created, place = {}) => ({ id, title: id, body: '', items: [], color: 'yellow', created_by: id.startsWith('m') ? 'me' : 'you', created_at: `2026-11-2${created}T10:00:00Z`, ...place });
  const list = [at('m1', 3), at('y1', 1), at('m2', 2, { board_x: 0.81, board_y: 0.12 }), at('y2', 4)];
  const places = N.placesFor(list);
  assert.deepEqual(places.get('m2'), { x: 0.81, y: 0.12, moved: true });
  assert.deepEqual([places.get('y1'), places.get('m1'), places.get('y2')].map((p) => [p.x, p.y]), N.SPOTS.slice(0, 3).map(([x, y]) => [x, y]), 'oldest first');
  assert.equal(N.placesFor([at('a', 1, { board_x: 3, board_y: -1 })]).get('a').x, 1, 'kept inside the board');
  assert.equal(N.placesFor([at('a', 1, { board_x: 0.5, board_y: null })]).get('a').moved, false, 'half a place is no place');
  assert.deepEqual(N.placePayload(0.12345, 1.4), { board_x: 0.123, board_y: 1 });
  assert.ok(N.sameWords({ title: 'a', body: 'b', items: [], color: 'pink', board_x: 0.1 }, { title: 'a', body: 'b', items: [], color: 'pink', board_x: 0.9 }));
  assert.equal(N.sameWords({ title: 'a' }, { title: 'b' }), false);
  assert.ok(N.missingPlace({ code: '42703', message: 'column couple_notes.board_x does not exist' }));
  assert.equal(N.missingPlace({ code: '42501', message: 'denied' }), false);
  assert.deepEqual(N.byAuthor(list, 'me', 'me').map((n) => n.id), ['m1', 'm2']);
  assert.deepEqual(N.byAuthor(list, 'partner', 'me').map((n) => n.id), ['y1', 'y2']);
  assert.equal(N.byAuthor(list, 'all', 'me').length, 4);
});

test('each post-it leans a little, always the same way', () => {
  const a = N.tilt('0b7c2a4e-1111-4111-8111-111111111111');
  assert.equal(a, N.tilt('0b7c2a4e-1111-4111-8111-111111111111'));
  // Staging, 04/11/2026: at 0° or half a degree they looked straight; the
  // tavola leans them between 1° and 2°, left and right.
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', '123', 'xyz', 'ciao', 'spesa', '0b7c2a4e-2222-4222-8222-222222222222'];
  for (const id of ids) {
    const t = N.tilt(id);
    assert.ok(Math.abs(t) >= 1 && Math.abs(t) <= 2, `${id}: ${t}`);
    assert.match(String(t), /^-?\d(\.\d)?$/, `${id}: ${t} is a clean number of degrees`);
  }
  assert.ok(ids.some((id) => N.tilt(id) < 0) && ids.some((id) => N.tilt(id) > 0), 'left and right');
});

test('«Da vivere»: ideas to live first, each saying who said it was lived; then the last ones lived', () => {
  const snap = {
    loaded: true,
    active: [
      { id: 'a', title: 'Cena sul tetto', status: 'idea', lived_proposed_by: null },
      { id: 'b', title: 'Weekend a Lisbona', status: 'scheduled', lived_proposed_by: 'me' },
      { id: 'c', title: 'Corso di ceramica', status: 'idea', lived_proposed_by: 'you' },
      { id: 'd', title: 'Mostra di Frida', status: 'idea', lived_proposed_by: null }
    ],
    lived: [{ id: 'z', title: 'Picnic', status: 'lived', completed_at: '2026-10-01T10:00:00Z' }, { id: 'y', title: 'Lago', status: 'lived', completed_at: '2026-10-20T10:00:00Z' }]
  };
  const all = N.ideaLines(snap, 'me', { lived: 2 });
  assert.deepEqual(all.lines.map((l) => [l.id, l.state]), [['a', 'todo'], ['b', 'mine'], ['c', 'partner'], ['d', 'todo'], ['y', 'lived'], ['z', 'lived']]);
  assert.equal(all.hidden, 0);
  const page = N.ideaLines(snap, 'me', { limit: 3, lived: 1 });
  assert.deepEqual(page.lines.map((l) => l.id), ['a', 'b', 'c'], 'the page keeps the ideas still to live');
  assert.equal(page.hidden, 3, 'one idea and two lived ones are behind');
  assert.deepEqual(N.ideaLines({ loaded: false }, 'me').lines, []);
});

test('wired into Noi: the board under the calendar, the whole board in its Foglio, the ideas through app.js', () => {
  const html = read('index.html');
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  const board = bond.match(/<section class="us-noi-board" id="usNoiBoard"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(board, /<h2 id="usNoiBoardTitle">La lavagna<\/h2>/);
  assert.match(board, /data-board-new/);
  assert.match(board, /data-lav-board-open/);
  assert.match(board, /<div class="us-noi-lav" id="usNoiLav">\s*<div id="usNoiLavagnaSlot"[^>]*><\/div>\s*<ul class="us-postits is-board" id="usNoiBoardGrid"/, 'the post-its over the drawing');
  assert.match(board, /id="usNoiBoardAll"[^>]*hidden/);
  assert.match(html, /id="usNotesSheet" class="us-notes-overlay us-foglio"[^>]*data-us-modal/);
  assert.match(html, /<h3 id="usNotesTitle">Tutti i post-it<\/h3>/);
  assert.match(html, /<div id="usPostitFocus" class="us-postit-focus" aria-hidden="true" data-us-modal>/);

  const js = read('couple-notes.js');
  assert.ok(js.includes("const COLS_BASE='id,couple_id,title,body,items,color,created_by,updated_by,created_at,updated_at,revision';\nconst COLS=`${COLS_BASE},board_x,board_y`;"));
  assert.ok(js.includes('if(!placeless&&missingPlace(error)){placeless=true;return load();}'), 'a database without the places still reads the post-its');
  assert.match(js, /role="group" aria-label="Filtra per chi l’ha scritto"/);
  assert.ok(js.includes("from('couple_notes').update(place)"), 'a move saves only the place');
  assert.ok(read('lavagna.js').includes('<ul class="us-postits is-board is-big" id="usLavagnaNotes" aria-label="Post-it"></ul>'));
  assert.match(read('navigation.js'), /name:'notes'[\s\S]*?name:'postit',\s*find:\(\)=>document\.getElementById\('usPostitFocus'\)/, 'back closes the post-it in front first');
  assert.match(js, /data-davivere/);
  assert.match(js, /w\.UsDaVivere\?\.markLived\?\./);
  assert.match(js, /w\.UsDaVivere\?\.add\?\./);
  assert.match(js, /addEventListener\('us-ideas-change'/);
  assert.doesNotMatch(js, /\.channel\(|from\('bucket_items'\)|sb\.rpc/, 'no second channel, ideas only through app.js');

  const app = read('app.js');
  assert.match(app, /window\.UsDaVivere=Object\.freeze\(\{linkCalendarEntry:linkNoiIdeaToCalendar,snapshot:noiIdeaSnapshot,hydrate:hydrateNoiIdeas,add:addNoiIdeaFromBoard,markLived:markNoiIdeaLivedFromBoard\}\)/);
  assert.match(app, /window\.dispatchEvent\?\.\(new CustomEvent\('us-ideas-change'\)\)/);
  assert.match(app, /async function confirmNoiIdeaLived\(id\)\{[\s\S]*?sb\.rpc\('confirm_bucket_item_lived',\{p_item_id:id\}\)/);

  const en = read('i18n-en.js');
  // A key is quoted, or a bare word (Bacheca: 'Board').
  for (const it of ['La lavagna', 'Nuovo post-it', 'Tutti i post-it ({n})', 'Disegni, post-it e le vostre idee', 'Insieme · fisso in cima', 'Filtra per chi l’ha scritto', 'Tuoi', 'Non spostato. Riprova.', 'Disegnate qualcosa o lasciate un post-it']) {
    assert.ok(en.includes(`'${it}':`) || en.includes(`\n    ${it}:`), it);
  }
});
