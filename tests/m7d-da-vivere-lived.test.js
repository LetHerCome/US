// M7D — Da vivere lived bridge: idea/scheduled -> lived, link preserved, and
// only a discreet, user-driven path toward Ricordi (no automatic Moment).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const block = () => read('app.js').match(/\/\/ ===== M7B[\s\S]*?\/\/ ===== Ti penso =====/)?.[0] || '';
const noi = () => read('index.html').match(/<section class="noi-idea-section"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || '';

test('M7D markup: one warm lived action and a discreet memory bridge, both hidden by default', () => {
  assert.match(noi(), /id="noiIdeaDetailLived"[^>]*hidden>L'abbiamo vissuta</);
  assert.match(noi(), /id="noiIdeaDetailMemory"[^>]*hidden/);
  assert.match(noi(), /id="noiIdeaDetailMemoryAdd"[^>]*>Aggiungi un ricordo</);
  assert.doesNotMatch(noi(), /workflow|stato:|step \d/i);
});

test('M7D runtime: lived write is idea|scheduled only, couple-scoped, never touches calendar_entry_id', () => {
  const fn = block().match(/async function markNoiIdeaLived\([\s\S]*?\n\}/)?.[0] || '';
  assert.notEqual(fn, '');
  assert.match(fn, /sb\.from\('bucket_items'\)\.update\(\{status:'lived'\}\)\.eq\('id',id\)\.eq\('couple_id',coupleId\)\.in\('status',\['idea','scheduled'\]\)/);
  assert.doesNotMatch(fn.match(/\.update\(\{[^}]*\}\)/)[0], /calendar_entry_id|completed/);
  assert.match(fn, /btn\.dataset\.confirm!=='1'/, 'lived is irreversible: two taps');
  assert.match(fn, /if\(!lived\)\{/, '0 rows (partner already changed it) is not a success');
});

test('M7D runtime: no fake Moment — the bridge only opens the existing composer, Da vivere never writes moments', () => {
  const b = block();
  assert.doesNotMatch(b, /from\('moments'\)|from\('moment_photos'\)|uploadMoment\(|storage\.from/);
  const fn = b.match(/function addNoiIdeaMemory\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(fn, /item\.status!=='lived'/);
  assert.match(fn, /window\.UsMomentComposer\?\.open/);
  const albums = read('moments-albums.js');
  assert.match(albums, /window\.UsMomentComposer = Object\.freeze\(\{\s*open\(\{ caption \} = \{\}\) \{[\s\S]*?if \(input && caption && !input\.value\.trim\(\)\)[\s\S]*?openComposer\(\);/);
});

test('M7D runtime: marking lived moves the idea to "vissute", keeps the Calendar link, shows the memory bridge', async () => {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, hidden: false, disabled: false, textContent: '', innerHTML: '', value: '', dataset: {}, setAttribute() {}, addEventListener() {}, focus() {}, reset() {} }); return els.get(id); };
  const responses = [];
  const writes = [];
  const builder = () => {
    const b = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'insert', 'maybeSingle', 'is', 'in']) b[m] = () => b;
    b.update = (patch) => { writes.push(patch); return b; };
    b.then = (ok, ko) => Promise.resolve(responses.shift()).then(ok, ko);
    return b;
  };
  const window = { usProfile: { id: 'u1', couple_id: 'c1' } };
  window.window = window;
  const toasts = [];
  const context = { window, document: { getElementById: el, querySelector: () => ({ hidden: false }) }, sb: { from: () => builder() }, toast: (m) => toasts.push(m), escapeHtml: (s) => String(s), console, setTimeout: () => 0, go() {} };
  vm.createContext(context);
  vm.runInContext(block(), context);
  responses.push({ data: [{ id: 'i1', title: 'Cena al lago', status: 'scheduled', calendar_entry_id: 'e1', completed_at: null, created_at: 'x' }], error: null });
  await window.hydrateNoiIdeas();
  window.openNoiIdeaDetail('i1');
  assert.equal(el('noiIdeaDetailLived').hidden, false);
  assert.equal(el('noiIdeaDetailMemory').hidden, true);
  const click = context.markNoiIdeaLived || vm.runInContext('markNoiIdeaLived', context);
  await click(); // first tap arms the confirm
  assert.equal(writes.length, 0);
  responses.push({ data: { id: 'i1', status: 'lived', calendar_entry_id: 'e1', completed_at: '2026-09-29T10:00:00Z' }, error: null });
  await click();
  assert.deepEqual({ ...writes[0] }, { status: 'lived' });
  assert.equal(el('noiIdeaDetailLived').hidden, true);
  assert.equal(el('noiIdeaDetailMemory').hidden, false);
  assert.equal(el('noiIdeaDetailCalendar').hidden, false, 'the Calendar link survives lived');
  assert.doesNotMatch(el('noiIdeaList').innerHTML, /Cena al lago/);
  assert.match(el('noiIdeaLivedToggle').textContent, /\(1\)/);
  assert.deepEqual(toasts, ['Vissuta insieme ♡']);
});
