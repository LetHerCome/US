// Post-it che sparisce (staging, 04/11/2026): the post-it «ciao» of the test
// couple vanished from the server. Closing an empty post-it used to delete it
// without asking, so any way of closing one whose fields looked empty
// (a Realtime row without its text, say) took it away for both. Now only a
// post-it born in this same opening goes by itself; one that was already on
// the board, emptied by hand, asks «Staccare il post-it?» or stays as it was.
// A Realtime row that comes without its text (Supabase leaves out the values
// over 64 bytes when a change is too big) is never taken as the note: the
// board is read again. The real closing paths: couple-notes-close-browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../couple-notes.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('closing: written, it is saved; empty and never saved, it is dropped', () => {
  assert.equal(N.closeVerdict({ id: 'n1', title: 'ciao', body: '😀🥰🎉', items: [] }), 'save');
  assert.equal(N.closeVerdict({ id: null, title: 'Spesa', body: '', items: [] }, { born: true }), 'save');
  assert.equal(N.closeVerdict({ id: null, title: '', body: '  ', items: [] }, { born: true }), 'drop', 'a new post-it left blank: nothing to keep');
  assert.equal(N.closeVerdict({ id: null, title: '', body: '', items: [{ id: 'a', text: ' ', done: false }] }), 'drop');
});

test('closing an empty post-it: born in this opening it goes by itself, already on the board it asks', () => {
  const empty = { id: 'n1', title: '', body: '', items: [] };
  assert.equal(N.closeVerdict(empty, { born: true }), 'drop', 'written and emptied in the same opening');
  assert.equal(N.closeVerdict(empty), 'ask', 'an existing post-it never goes without asking');
  assert.equal(N.closeVerdict(empty, { born: false }), 'ask');
  assert.equal(N.closeVerdict({ id: 'n1', title: '', body: '', items: [{ id: 'a', text: '', done: true }] }), 'ask');
});

test('a Realtime row is a note only with its title, its text and its list', () => {
  const row = { id: 'n1', couple_id: 'c1', title: 'ciao', body: '😀🥰🎉', items: [], color: 'yellow', revision: 2 };
  assert.equal(N.fullRow(row), true);
  assert.equal(N.fullRow({ ...row, title: '' }), true, 'an empty title is a title');
  for (const key of ['title', 'body', 'items']) {
    const partial = { ...row };
    delete partial[key];
    assert.equal(N.fullRow(partial), false, `without ${key}`);
    assert.equal(N.fullRow({ ...row, [key]: null }), false, `${key} null`);
  }
  assert.equal(N.fullRow(null), false);
});

test('wired: closeEditor asks for an existing empty post-it, the Realtime handler reads again a partial row', () => {
  const js = read('couple-notes.js');
  const close = js.match(/async function closeEditor\([\s\S]*?\n  \}\n/)?.[0] || '';
  assert.match(close, /closeVerdict\(target,\{born:Boolean\(target\.born\)\}\)/);
  assert.match(close, /verdict==='ask'/);
  assert.match(close, /title:'Staccare il post-it\?'/);
  assert.match(close, /cancelLabel:'Tienilo'/);
  assert.doesNotMatch(close, /isEmpty\(target\)&&target\.id/, 'the old silent delete is gone');
  assert.equal((close.match(/removeNote\(target\.id,\{ask:false\}\)/g) || []).length, 2, 'one after «drop», one after the yes');
  assert.match(js, /editing=note\?\{\.\.\.note,items:items\(note\)\.map\(i=>\(\{\.\.\.i\}\)\)\}:\{id:null,title:'',body:'',items:\[\],color:'yellow',revision:0,updated_by:me\(\),born:true\}/, 'only a new post-it is born here');
  const live = js.match(/function onChange\(event\)\{[\s\S]*?\n  \}\n/)?.[0] || '';
  assert.match(live, /if\(row&&!fullRow\(row\)\)\{load\(\);return;\}/);
  assert.doesNotMatch(read('couple-notes.js'), /born:true[^}]*\}[^;]*payload/, 'born never goes to the server');
  assert.deepEqual(Object.keys(N.payload({ title: 'x', born: true })), ['title', 'body', 'items', 'color']);

  const en = read('i18n-en.js');
  for (const it of ['L’hai svuotato: se lo stacchi, sparisce per voi due.', 'Stacca', 'Tienilo']) assert.ok(en.includes(`'${it}':`) || en.includes(`\n    ${it}:`), it);
});
