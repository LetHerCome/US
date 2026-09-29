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

test('M7D markup: one warm lived action, a quiet waiting line and a discreet memory bridge, all hidden by default', () => {
  assert.match(noi(), /id="noiIdeaDetailLivedWait"[^>]*hidden/);
  assert.match(noi(), /id="noiIdeaDetailLived"[^>]*hidden>L'abbiamo vissuta</);
  assert.match(noi(), /id="noiIdeaDetailMemory"[^>]*hidden/);
  assert.match(noi(), /id="noiIdeaDetailMemoryAdd"[^>]*>Aggiungi un ricordo</);
  assert.doesNotMatch(noi(), /workflow|stato:|step \d/i);
});

test('M7D runtime: lived goes only through the reciprocal RPC — never a direct status/completed write', () => {
  const fn = block().match(/async function markNoiIdeaLived\([\s\S]*?\n\}/)?.[0] || '';
  assert.notEqual(fn, '');
  assert.match(fn, /sb\.rpc\('confirm_bucket_item_lived',\{p_item_id:id\}\)/);
  assert.doesNotMatch(fn, /\.update\(|calendar_entry_id:[^,}]*null|status:'lived'\}\)/);
  assert.match(fn, /phase==='partner'&&btn&&btn\.dataset\.confirm!=='1'/, 'the irreversible final confirmation takes two taps');
  assert.match(fn, /if\(!res\)\{/, 'an empty answer is not a success');
  assert.doesNotMatch(block(), /update\(\{status:'lived'|completed:true/);
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

test('M7D runtime: A proposes and waits, B confirms, only then lived with the Calendar link and the memory bridge', async () => {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, hidden: false, disabled: false, textContent: '', innerHTML: '', value: '', dataset: {}, setAttribute() {}, addEventListener() {}, focus() {}, reset() {} }); return els.get(id); };
  const responses = [];
  const calls = [];
  const builder = () => {
    const b = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'insert', 'maybeSingle', 'is', 'in', 'update']) b[m] = () => b;
    b.then = (ok, ko) => Promise.resolve(responses.shift()).then(ok, ko);
    return b;
  };
  const window = { usProfile: { id: 'u1', couple_id: 'c1', role: 'francesco' } };
  window.window = window;
  const toasts = [];
  const sb = { from: () => builder(), rpc: (name, args) => { calls.push([name, args]); return Promise.resolve(responses.shift()); } };
  const context = { window, document: { getElementById: el, querySelector: () => ({ hidden: false }) }, sb, toast: (m) => toasts.push(m), escapeHtml: (s) => String(s), console, setTimeout: () => 0, go() {} };
  vm.createContext(context);
  vm.runInContext(block(), context);
  const item = { id: 'i1', title: 'Cena al lago', status: 'scheduled', calendar_entry_id: 'e1', completed_at: null, created_at: 'x', lived_proposed_by: null };
  responses.push({ data: [item], error: null });
  await window.hydrateNoiIdeas();
  window.openNoiIdeaDetail('i1');
  assert.equal(el('noiIdeaDetailLived').hidden, false);
  assert.equal(el('noiIdeaDetailLived').textContent, "L'abbiamo vissuta");
  assert.equal(el('noiIdeaDetailLivedWait').hidden, true);
  const click = vm.runInContext('markNoiIdeaLived', context);
  responses.push({ data: { id: 'i1', status: 'scheduled', calendar_entry_id: 'e1', completed_at: null, lived_proposed_by: 'u1' }, error: null });
  await click(); // A proposes (single tap: it is not final)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['confirm_bucket_item_lived', { p_item_id: 'i1' }]]);
  assert.equal(el('noiIdeaDetailLived').hidden, true, 'A cannot finalize alone');
  assert.equal(el('noiIdeaDetailLivedWait').hidden, false);
  assert.equal(el('noiIdeaDetailLivedWait').textContent, 'In attesa della conferma di Beatrice');
  assert.equal(el('noiIdeaDetailMemory').hidden, true);
  assert.match(el('noiIdeaList').innerHTML, /Cena al lago/, 'still not lived');
  assert.deepEqual(toasts, ['Ora manca Beatrice ♡']);

  // The partner opens the same idea: it is their turn.
  window.usProfile = { id: 'u2', couple_id: 'c1', role: 'beatrice' };
  responses.push({ data: [{ ...item, lived_proposed_by: 'u1' }], error: null });
  await window.hydrateNoiIdeas();
  window.openNoiIdeaDetail('i1');
  assert.equal(el('noiIdeaDetailLived').hidden, false);
  assert.equal(el('noiIdeaDetailLived').textContent, "Sì, l'abbiamo vissuta");
  assert.equal(el('noiIdeaDetailLivedWait').textContent, "Francesco dice che l'avete vissuta");
  await click(); // first tap only arms the final confirm
  assert.equal(calls.length, 1);
  responses.push({ data: { id: 'i1', status: 'lived', calendar_entry_id: 'e1', completed_at: '2026-09-29T10:00:00Z', lived_proposed_by: 'u1' }, error: null });
  await click();
  assert.equal(calls.length, 2);
  assert.equal(el('noiIdeaDetailLived').hidden, true);
  assert.equal(el('noiIdeaDetailLivedWait').hidden, true);
  assert.equal(el('noiIdeaDetailMemory').hidden, false);
  assert.equal(el('noiIdeaDetailCalendar').hidden, false, 'the Calendar link survives lived');
  assert.doesNotMatch(el('noiIdeaList').innerHTML, /Cena al lago/);
  assert.match(el('noiIdeaLivedToggle').textContent, /\(1\)/);
  assert.equal(toasts.at(-1), 'Vissuta insieme ♡');
});
