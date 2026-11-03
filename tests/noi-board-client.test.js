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

test('on Noi at most six post-its, the most recent first; the rest behind «Tutti i post-it (n)»', () => {
  const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => note(i, i));
  const board = N.boardNotes(nine);
  assert.deepEqual(board.shown.map((n) => n.id), [9, 8, 7, 6, 5, 4]);
  assert.equal(board.total, 9);
  assert.equal(board.more, true);
  const few = N.boardNotes(nine.slice(0, 4));
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
  assert.match(board, /<h2 id="usNoiBoardTitle">Bacheca<\/h2>/);
  assert.match(board, /data-board-new/);
  assert.match(board, /<ul class="us-postits" id="usNoiBoardGrid"/);
  assert.match(board, /id="usNoiBoardAll"[^>]*hidden/);
  assert.match(html, /id="usNotesSheet" class="us-notes-overlay us-foglio"[^>]*data-us-modal/);
  assert.match(html, /<h3 id="usNotesTitle">Bacheca<\/h3>/);

  const js = read('couple-notes.js');
  assert.match(js, /const COLS='id,couple_id,title,body,items,color,created_by,updated_by,created_at,updated_at,revision'/);
  assert.match(js, /role="group" aria-label="Filtra per colore"/);
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
  for (const it of ['Bacheca', 'Nuovo post-it', 'Tutti i post-it ({n})', 'Carta gialla', 'Insieme · fisso in cima', 'Le cose senza data: si scrive qui sopra']) {
    assert.ok(en.includes(`'${it}':`) || en.includes(`\n    ${it}:`), it);
  }
});
