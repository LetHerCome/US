// M7B — Da vivere UI (Noi). Static source assertions in the same style as
// tests/m3-noi-canonical.test.js and tests/m6b-calendar-surface.test.js:
// this repo's convention for UI-contract tests is regex/string matching
// against the real index.html/app.js source, not a DOM harness, since the
// app has no build step and ships these files verbatim.
//
// Scope: M7A already owns and behavior-tests the bucket_items backend
// contract (triggers, RLS, lifecycle whitelist) via pglite. This file only
// asserts that the M7B UI layer talks to bucket_items exclusively, never
// writes a field it isn't allowed to, represents scheduled/lived
// discreetly, supports add/detail/edit/archive with double-submit guards,
// and leaves the four-tab bottom nav / Calendar/Moments surfaces untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = () => read('index.html');
const app = () => read('app.js');
const noiSection = () => html().match(/<section class="noi-idea-section"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || '';
const daVivereBlock = () => app().match(/\/\/ ===== M7B[\s\S]*?\/\/ ===== Ti penso =====/)?.[0] || '';

test('M7B markup: la sezione idee resta hidden nel markup statico (contratto M3) ma ha un contenuto reale', () => {
  const noi = html().match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(noi, /class="noi-idea-section"[^>]*hidden/);
  const section = noiSection();
  assert.notEqual(section, '');
  assert.match(section, /id="noiIdeaBrowse"/);
  assert.match(section, /id="noiIdeaDetail"[^>]*hidden/);
  assert.match(section, /id="noiIdeaList"/);
  assert.match(section, /id="noiIdeaQuickForm"[^>]*hidden/);
});

test('M7B markup: quick-add accetta titolo e nota/link opzionali, senza scheduling UI', () => {
  const section = noiSection();
  assert.match(section, /id="noiIdeaQuickTitle"[^>]*required/);
  assert.match(section, /id="noiIdeaQuickNote"/);
  assert.match(section, /id="noiIdeaQuickLink"[^>]*type="url"/);
  // The quick-add itself never schedules: "Metti in calendario" (M7C) lives
  // only in the detail of an existing idea and delegates to the Calendar form.
  const quickForm = section.match(/<form id="noiIdeaQuickForm"[\s\S]*?<\/form>/)?.[0] || '';
  assert.notEqual(quickForm, '');
  assert.doesNotMatch(quickForm, /Metti in calendario|scegli un giorno|schedul|type="date"|type="time"/i);
});

test('M7B markup: il dettaglio espone titolo/nota/link, salvataggio, archiviazione e back verso Noi', () => {
  const section = noiSection();
  assert.match(section, /id="noiIdeaDetailTitle"/);
  assert.match(section, /id="noiIdeaDetailNote"/);
  assert.match(section, /id="noiIdeaDetailLink"/);
  assert.match(section, /id="noiIdeaDetailSave"/);
  assert.match(section, /id="noiIdeaDetailArchive"/);
  assert.match(section, /id="noiIdeaDetailBack"/);
  assert.match(section, /class="noi-idea-detail-hint"/);
});

test('M7B markup: la rappresentazione di scheduled/lived è discreta (nessun badge vistoso), niente board da task', () => {
  const section = noiSection();
  assert.doesNotMatch(section, /badge|chip|status-pill/i);
  assert.doesNotMatch(section, /checkbox|task-list|todo/i);
});

test('M7B markup: non introduce una nuova destinazione di root/bottom-nav', () => {
  const nav = html().match(/<nav[^>]*class="nav[^"]*"[^>]*>[\s\S]*?<\/nav>/)?.[0] || '';
  assert.notEqual(nav, '');
  const navButtons = [...nav.matchAll(/data-page="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(navButtons, ['home', 'bond', 'moments', 'quiz']);
  assert.doesNotMatch(nav, /vivere|bucket/i);
});

test('M7B runtime: legge e scrive esclusivamente public.bucket_items, nessuna nuova tabella/RPC/persistenza locale', () => {
  const block = daVivereBlock();
  assert.notEqual(block, '');
  const tableRefs = [...block.matchAll(/sb\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.ok(tableRefs.length > 0);
  assert.ok(tableRefs.every((t) => t === 'bucket_items'), `unexpected table reference(s): ${tableRefs.join(',')}`);
  assert.doesNotMatch(block, /living_items|shared_experiences|proposals|localStorage|indexedDB/);
  // M7D: the only RPC is the reciprocal lived confirmation.
  assert.deepEqual([...block.matchAll(/sb\.rpc\('([a-z_]+)'/g)].map((m) => m[1]), ['confirm_bucket_item_lived']);
});

test('M7B runtime: insert rispetta created_by/couple_id/status idea/completed false e non scrive mai completed_at o calendar_entry_id', () => {
  const block = daVivereBlock();
  const insertCall = block.match(/sb\.from\('bucket_items'\)\.insert\(\{[\s\S]*?\}\)/)?.[0] || '';
  assert.notEqual(insertCall, '');
  assert.match(insertCall, /created_by:userId/);
  assert.match(insertCall, /couple_id:coupleId/);
  const addFn = block.match(/async function submitNoiIdeaQuickAdd\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(addFn, /const userId=window\.usProfile\.id,coupleId=window\.usProfile\.couple_id,identityGen=noiIdeaIdentityGen/);
  assert.match(insertCall, /status:'idea'/);
  assert.match(insertCall, /completed:false/);
  assert.doesNotMatch(insertCall, /completed_at/);
  assert.doesNotMatch(insertCall, /calendar_entry_id/);
});

test('M7B runtime: la query attiva/lived esclude sempre gli archiviati e non fa mai un hard delete', () => {
  const block = daVivereBlock();
  assert.match(block, /\.neq\('status','archived'\)/);
  assert.match(block, /activeItems=rows\.filter\(r=>r\.status!=='lived'\)/);
  assert.match(block, /livedItems=rows\.filter\(r=>r\.status==='lived'\)/);
  assert.doesNotMatch(block, /bucket_items'\)\.delete\(/);
});

test("M7B runtime: l'update di modifica tocca solo title/note/link_url, mai lo status o i campi di lifecycle, ed è sempre couple-scoped", () => {
  const block = daVivereBlock();
  const editUpdate = block.match(/sb\.from\('bucket_items'\)\.update\(\{title,note,link_url:link\}\)\.eq\('id',id\)\.eq\('couple_id',coupleId\)\.select\('id'\)\.maybeSingle\(\)/)?.[0] || '';
  assert.notEqual(editUpdate, '');
  assert.match(block.match(/async function submitNoiIdeaDetail\([\s\S]*?\n\}/)?.[0] || '', /identityGen=noiIdeaIdentityGen/);
  assert.doesNotMatch(editUpdate, /status|completed|calendar_entry_id/);
});

test("M7B runtime: archiviare è l'unica update che scrive status, ed è sempre 'archived' esplicito e couple-scoped", () => {
  const block = daVivereBlock();
  const statusWrites = [...block.matchAll(/\.update\(\{[^}]*status\s*:\s*'([a-z]+)'[^}]*\}\)/g)].map((m) => m[1]);
  // M7C adds exactly one other lifecycle write (idea -> scheduled with the
  // Calendar's entry id), asserted in tests/m7c-da-vivere-calendar.test.js;
  // archiving stays the only status write of the M7B edit/detail flows.
  assert.deepEqual(statusWrites.filter((s) => s !== 'scheduled' && s !== 'lived'), ['archived']);
  const editFn = block.match(/async function submitNoiIdeaDetail\([\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(editFn, /status:/);
  assert.match(block, /sb\.from\('bucket_items'\)\.update\(\{status:'archived'\}\)\.eq\('id',id\)\.eq\('couple_id',coupleId\)\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(block.match(/async function archiveNoiIdea\([\s\S]*?\n\}/)?.[0] || '', /identityGen=noiIdeaIdentityGen/);
});

test('M7B runtime: un update/archive senza righe corrispondenti (0 righe RLS-visibili) è trattato come fallimento recuperabile, non come successo', () => {
  const editFn = daVivereBlock().match(/async function submitNoiIdeaDetail\([\s\S]*?\n\}/)?.[0] || '';
  const archiveFn = daVivereBlock().match(/async function archiveNoiIdea\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(editFn, /const \{data:updated,error\}=await sb\.from\('bucket_items'\)\.update\(/);
  assert.match(editFn, /if\(!updated\)throw new Error\('bucket_items_update_no_row'\)/);
  assert.match(archiveFn, /const \{data:archived,error\}=await sb\.from\('bucket_items'\)\.update\(/);
  assert.match(archiveFn, /if\(!archived\)throw new Error\('bucket_items_archive_no_row'\)/);
});

test('M7B runtime: scheduled/lived vengono etichettati in modo naturale e discreto ("In calendario"/"Vissuta"), non in maiuscolo da badge', () => {
  const block = daVivereBlock();
  assert.match(block, /function noiIdeaStateLabel[\s\S]{0,260}status==='scheduled'\)[\s\S]{0,120}'In calendario'/);
  assert.match(block, /status==='lived'\)return 'Vissuta'/);
  assert.match(block, /class="noi-idea-state"/);
  assert.doesNotMatch(block, /return 'IN CALENDARIO'|return 'VISSUTA'/);
});

test('M7B stile: lo stato discreto è tipograficamente silenzioso (peso leggero, niente maiuscolo/letter-spacing da badge)', () => {
  const css = read('styles.css');
  const stateRule = css.match(/\.noi-idea-state\{[^}]*font-weight:500[^}]*\}/) || css.match(/\.noi-idea-state\{[^}]*\}[\s\S]{0,0}/);
  const rules = [...css.matchAll(/\.noi-idea-state\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(rules.length >= 1);
  const tunedRule = rules.find((r) => r.includes('font-weight:500'));
  assert.ok(tunedRule, 'expected a quiet .noi-idea-state override with font-weight:500');
  assert.doesNotMatch(tunedRule, /text-transform:\s*uppercase/);
  assert.doesNotMatch(tunedRule, /font-weight:\s*900/);
  const hintRule = css.match(/\.noi-idea-detail-hint\{([^}]*)\}/)?.[1] || '';
  assert.notEqual(hintRule, '');
  assert.doesNotMatch(hintRule, /text-transform:\s*uppercase/);
  assert.doesNotMatch(hintRule, /font-weight:\s*800|font-weight:\s*900/);
});

test('M7B runtime: hydrateNoiIdeas ignora risposte in-flight superate da un cambio account/coppia o da una chiamata più recente', () => {
  const block = daVivereBlock();
  assert.match(block, /let noiIdeaRequestGen=0/);
  assert.match(block, /const userId=window\.usProfile\.id,coupleId=window\.usProfile\.couple_id/);
  assert.match(block, /const identityKey=`\$\{userId\}\|\$\{coupleId\}`/);
  const hydrateFn = block.match(/async function hydrateNoiIdeas\([\s\S]*?\nwindow\.hydrateNoiIdeas=hydrateNoiIdeas;/)?.[0] || '';
  assert.notEqual(hydrateFn, '');
  // Generation captured before the await, compared after it — a newer call
  // (or a switched identity) must make the older response a no-op.
  assert.match(hydrateFn, /const gen=\+\+noiIdeaRequestGen;[\s\S]*await sb\.from\('bucket_items'\)/);
  assert.match(hydrateFn, /if\(gen!==noiIdeaRequestGen\|\|window\.usProfile\?\.id!==userId\|\|window\.usProfile\?\.couple_id!==coupleId\)return;/);
});

test('M7B runtime: un cambio di identità (account/coppia) svuota le idee e chiude dettaglio/quick-add prima di richiedere i nuovi dati', () => {
  const block=daVivereBlock();
  const resetFn=block.match(/function resetNoiIdeasForIdentityChange\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  const hydrateFn=block.match(/async function hydrateNoiIdeas\([\s\S]*?\nwindow\.hydrateNoiIdeas=hydrateNoiIdeas;/)?.[0]||'';
  assert.notEqual(resetFn,'');
  assert.match(resetFn,/noiIdeaState=\{loaded:false,busy:false,error:false,activeItems:\[\],livedItems:\[\],showLived:false,selectedId:null,identityKey:null,calendarById:new Map\(\)\}/);
  assert.match(resetFn,/noiIdeaRequestGen\+\+/);
  assert.match(resetFn,/closeNoiIdeaDetail\(\)/);
  assert.match(resetFn,/toggleNoiIdeaQuickForm\(false\)/);
  assert.match(resetFn,/noiIdeaList/);
  assert.match(resetFn,/noiIdeaLivedList/);
  assert.match(hydrateFn,/identityKey!==identityKey\)resetNoiIdeasForIdentityChange\(\)/);
  assert.ok(hydrateFn.indexOf('resetNoiIdeasForIdentityChange()')<hydrateFn.indexOf("await sb.from('bucket_items')"));
});

test('M7B runtime: initCloud azzera subito Da vivere prima di null, cached-profile o fresh-profile assignment', () => {
  const initCloud=app().match(/async function initCloud\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.notEqual(initCloud,'');
  assert.doesNotMatch(initCloud,/window\.usProfile\s*=\s*cachedProfile/,'MC3 forbids cached membership authority');
  for(const assignment of ['window.usProfile = null;','window.usProfile = profile;']){
    const at=initCloud.indexOf(assignment);
    assert.ok(at>=0,`expected initCloud assignment ${assignment}`);
    assert.ok(initCloud.lastIndexOf('resetNoiIdeasForIdentityChange();',at)>=0,
      `identity privacy reset must run before ${assignment}`);
  }
});

test('M7B runtime: add/detail/edit/archive hanno tutti una guardia anti-doppio-submit', () => {
  const block = daVivereBlock();
  const addFn = block.match(/async function submitNoiIdeaQuickAdd\([\s\S]*?\n\}/)?.[0] || '';
  const editFn = block.match(/async function submitNoiIdeaDetail\([\s\S]*?\n\}/)?.[0] || '';
  const archiveFn = block.match(/async function archiveNoiIdea\([\s\S]*?\n\}/)?.[0] || '';
  for (const fn of [addFn, editFn, archiveFn]) {
    assert.notEqual(fn, '');
    assert.match(fn, /noiIdeaState\.busy/);
  }
  assert.match(addFn, /noiIdeaState\.busy=true[\s\S]*noiIdeaState\.busy=false/);
  assert.match(editFn, /noiIdeaState\.busy=true[\s\S]*noiIdeaState\.busy=false/);
  assert.match(archiveFn, /noiIdeaState\.busy=true[\s\S]*noiIdeaState\.busy=false/);
});

test('M7B runtime: il link viene validato come http(s) o normalizzato a null, mai persistito grezzo', () => {
  const block = daVivereBlock();
  assert.match(block, /NOI_IDEA_LINK_RE=\/\^https\?:\\\/\\\/\/i/);
  assert.match(block, /function noiIdeaNormalizeLink\(raw\)\{/);
  assert.match(block, /return NOI_IDEA_LINK_RE\.test\(value\)\?value:null/);
});

test('M7B runtime: apre e chiude il dettaglio senza toccare la lista sottostante, back torna al browse (dentro Noi)', () => {
  const block = daVivereBlock();
  assert.match(block, /function openNoiIdeaDetail\(id\)\{[\s\S]*?browse\.hidden=true[\s\S]*?detail\.hidden=false/);
  assert.match(block, /function closeNoiIdeaDetail\(\)\{[\s\S]*?detail\.hidden=true[\s\S]*?browse\.hidden=false/);
});

test('M7B runtime: caricamento/vuoto/errore-con-retry sono tutti gestiti nel rendering della lista attiva', () => {
  const block = daVivereBlock();
  assert.match(block, /<b>Carico…<\/b>/);
  assert.match(block, /Niente in lista/);
  assert.match(block, /Non riesco a caricare le idee/);
  assert.match(block, /onclick="hydrateNoiIdeas\(\)"/);
});

test('M7B runtime: nessuna integrazione con Moments/Ricordi nel blocco Da vivere', () => {
  const block = daVivereBlock();
  assert.doesNotMatch(block, /hydrateMoments|momentsGrid|moment_photos|moments'\)/);
});

test('M7B runtime: hydrateNoiIdeas è collegato alla navigazione verso Noi senza toccare la logica del Calendario', () => {
  const goBlock = app().match(/function go\(id,options=\{\}\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.notEqual(goBlock, '');
  assert.match(goBlock, /hydrateBond\(\);hydrateNoiIdeas\(\)/);
  assert.doesNotMatch(goBlock, /openCalendarSurface|closeCalendarSurface/);
});

// ===========================================================================
// Review-blocker regressions (M7B fix): one canonical "Da vivere" surface,
// and a synchronous, race-proof identity-switch boundary on bucket_items.
// ===========================================================================

const bondMain = () => html().match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
const livingSection = () => bondMain().match(/<section class="noi-living-section"[\s\S]*?<\/section>/)?.[0] || '';

test('M7B fix: la Quest settimanale non si presenta più come una seconda "Da vivere" — è etichettata come compagna distinta e preserva confirm/reroll', () => {
  const living = livingSection();
  assert.notEqual(living, '');
  assert.doesNotMatch(living, /da vivere/i, 'the weekly Quest section must never carry the "Da vivere" label — that is bucket_items\' exclusive surface');
  assert.match(living, /quest di coppia|spunto della settimana/i, 'the Quest section must be relabeled as a distinct "Quest di coppia / spunto della settimana" companion');
  // Runtime/IDs/confirm/reroll logic for Quest must be fully preserved.
  assert.match(living, /id="bondQuestList"/);
  assert.match(app(), /function confirmBondQuest\(id\)\{/);
  assert.match(app(), /function rerollBondQuest\(id\)\{/);
  assert.match(app(), /window\.confirmBondQuest=confirmBondQuest/);
  assert.match(app(), /window\.rerollBondQuest=rerollBondQuest/);
});

test('M7B fix (M9D): Da vivere è una superficie focalizzata del hub Noi, senza scroll di pagina — scorre solo la lista idee', () => {
  const main = bondMain();
  assert.ok(main.indexOf('noi-idea-section') >= 0 && main.indexOf('noi-living-section') >= 0, 'both surfaces must still exist in the Noi markup');
  assert.doesNotMatch(main.match(/<nav class="noi-hub" id="noiHub"[\s\S]*?<\/nav>/)?.[0] || '', /data-noi-open="da-vivere"/, 'Da vivere is no longer advertised in the 1.0 hub');
  const css = read('styles.css');
  assert.match(css, /\.noi-canonical-page\{[^}]*overflow:hidden/);
  assert.doesNotMatch(css, /\.noi-idea-section\s*\{[^}]*overflow-y\s*:\s*auto/i, 'the Da vivere section itself never scrolls as a whole');
  // M7B gate, now scoped to the Da vivere surface: identity.css forces
  // .noi-canonical-page{height:auto!important}, so the fixed height is
  // re-imposed with a more specific !important rule; only the idea list scrolls.
  assert.match(css, /#bond \.noi-canonical-page\[data-noi-view="da-vivere"\]\{height:calc\([^}]*var\(--us-nav-height\)[^}]*\)!important;min-height:0!important;overflow:hidden!important\}/);
  assert.match(css, /\.noi-idea-browse \.noi-idea-list\{[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain/);
  assert.match(css, /#bond \.noi-canonical-page:not\(\[data-noi-view="da-vivere"\]\)>\.noi-idea-section\{display:none!important\}/, 'Da vivere and Quest never compete on one screen');
  assert.match(css, /#bond \.noi-canonical-page:not\(\[data-noi-view="quest"\]\)>\.noi-living-section\{display:none!important\}/);
  assert.match(css, /\.noi-idea-card\{[^}]*color:var\(--text\)/, 'idea titles must retain readable foreground color on the dark card');
});

// ---------------------------------------------------------------------------
// Executable identity-race harness: loads only the M7B source block (as the
// rest of app.js has unrelated top-level DOM wiring this suite doesn't need)
// into a vm sandbox with a minimal fake DOM and a controllable `sb` mock, so
// in-flight request races across an account/couple switch can be driven
// deterministically rather than approximated via regex.

const NOI_IDEA_IDS = [
  'noiIdeaList', 'noiIdeaLivedToggle', 'noiIdeaLivedList', 'noiIdeaQuickForm', 'noiIdeaAddToggle',
  'noiIdeaQuickTitle', 'noiIdeaQuickNote', 'noiIdeaQuickLink', 'noiIdeaQuickExtra', 'noiIdeaQuickMoreToggle',
  'noiIdeaQuickStatus', 'noiIdeaQuickSave', 'noiIdeaQuickCancel',
  'noiIdeaDetailTitle', 'noiIdeaDetailNote', 'noiIdeaDetailLink', 'noiIdeaDetailHint', 'noiIdeaDetailStatus',
  'noiIdeaDetailArchive', 'noiIdeaDetailSave', 'noiIdeaDetailForm', 'noiIdeaDetailBack',
  'noiIdeaBrowse', 'noiIdeaDetail'
];

function makeEl(id) {
  return {
    id, hidden: false, value: '', textContent: '', innerHTML: '', disabled: false, dataset: {},
    _attrs: {}, _listeners: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(evt, cb) { this._listeners[evt] = cb; },
    focus() {}, reset() { this.value = ''; }
  };
}

function makeSbMock() {
  const queue = [];
  function enqueue() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    queue.push({ resolve, reject, promise });
    return queue[queue.length - 1];
  }
  function builder() {
    const b = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'insert', 'update', 'maybeSingle']) b[m] = () => b;
    b.then = (onFulfilled, onRejected) => {
      const next = queue.shift();
      if (!next) throw new Error('sb mock queue exhausted — test issued more sb.from() calls than it enqueued responses for');
      return next.promise.then(onFulfilled, onRejected);
    };
    return b;
  }
  return { sb: { from: () => builder() }, enqueue };
}

function buildNoiIdeaHarness() {
  const els = new Map();
  for (const id of NOI_IDEA_IDS) els.set(id, makeEl(id));
  const section = { hidden: true };
  const document = {
    getElementById(id) { return els.get(id) || null; },
    querySelector(sel) { return sel === '.noi-idea-section' ? section : null; }
  };
  const toastCalls = [];
  const window = { usProfile: null };
  window.window = window;
  const { sb, enqueue } = makeSbMock();
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  // archiveNoiIdea's double-submit confirm arms via a real setTimeout; a fake,
  // never-firing stub keeps the harness deterministic without leaking timers
  // past test end (which node:test reports as post-test async activity).
  const fakeSetTimeout = () => 0;
  const context = { window, document, sb, toast: (msg) => toastCalls.push(msg), escapeHtml, console, setTimeout: fakeSetTimeout };
  vm.createContext(context);
  const block = daVivereBlock();
  assert.notEqual(block, '', 'expected to extract the M7B source block from app.js');
  vm.runInContext(block, context, { filename: 'm7b-block.js' });
  return { window, document, els, section, sb, enqueue, toastCalls };
}

const item = (id, overrides = {}) => ({
  id, title: `title-${id}`, note: null, link_url: null, status: 'idea', calendar_entry_id: null, created_at: '2026-01-01T00:00:00Z', ...overrides
});

test('M7B fix (identity race a): un cambio account/coppia svuota e nasconde SUBITO la lista "vissute" espansa, prima ancora che i nuovi dati arrivino', async () => {
  const h = buildNoiIdeaHarness();
  h.window.usProfile = { id: 'A', couple_id: 'CA' };

  const first = h.enqueue();
  const p1 = h.window.hydrateNoiIdeas();
  first.resolve({ data: [item('lived-1', { status: 'lived' })], error: null });
  await p1;

  // Expand the lived list under identity A.
  h.els.get('noiIdeaLivedToggle')._listeners.click();
  assert.equal(h.els.get('noiIdeaLivedList').hidden, false, 'sanity: lived list is expanded under A');
  assert.match(h.els.get('noiIdeaLivedList').innerHTML, /lived-1/);
  assert.equal(h.els.get('noiIdeaLivedToggle')._attrs['aria-expanded'], 'true');

  // Switch identity to B and start the new hydrate — do NOT resolve it yet.
  h.window.usProfile = { id: 'B', couple_id: 'CB' };
  const second = h.enqueue();
  const p2 = h.window.hydrateNoiIdeas();

  // Before the new request has resolved, B must never see A's expanded lived
  // list still rendered on screen — this must be cleared synchronously.
  assert.equal(h.els.get('noiIdeaLivedList').hidden, true, 'A\'s lived list DOM must be hidden synchronously on identity switch, not left visible until the new fetch resolves');
  assert.doesNotMatch(h.els.get('noiIdeaLivedList').innerHTML, /lived-1/, 'A\'s lived item must not remain in the DOM after switching identity');
  assert.equal(h.els.get('noiIdeaLivedToggle')._attrs['aria-expanded'], 'false', 'the lived toggle aria-expanded must reset synchronously on identity switch');

  second.resolve({ data: [], error: null });
  await p2;
});

test('M7B fix (identity race c — add): un\'aggiunta iniziata sotto A che si risolve dopo il cambio a B non deve comparire/toastare per B', async () => {
  const h = buildNoiIdeaHarness();
  h.window.usProfile = { id: 'A', couple_id: 'CA' };
  const firstHydrate = h.enqueue();
  const hydrateA = h.window.hydrateNoiIdeas();
  firstHydrate.resolve({ data: [], error: null });
  await hydrateA;

  h.els.get('noiIdeaQuickTitle').value = 'Weekend trip';
  const insertCall = h.enqueue();
  const submitPromise = h.els.get('noiIdeaQuickForm')._listeners.submit({ preventDefault() {} });

  // Switch identity to B before A's insert resolves, and hydrate B for real.
  h.window.usProfile = { id: 'B', couple_id: 'CB' };
  const secondHydrate = h.enqueue();
  const hydrateB = h.window.hydrateNoiIdeas();
  secondHydrate.resolve({ data: [], error: null });
  await hydrateB;

  // Now A's stale insert resolves.
  insertCall.resolve({ data: [item('a-item', { title: 'Weekend trip' })], error: null });
  await submitPromise;

  assert.doesNotMatch(h.els.get('noiIdeaList').innerHTML, /Weekend trip|a-item/, 'A\'s stale insert must never render into B\'s active list');
  assert.ok(!h.toastCalls.includes('Idea aggiunta'), 'A\'s stale insert must not toast success once B is the active identity');
});

test('M7B fix (identity race c — edit): una modifica iniziata sotto A che si risolve dopo il cambio a B non deve applicarsi/toastare per B', async () => {
  const h = buildNoiIdeaHarness();
  h.window.usProfile = { id: 'A', couple_id: 'CA' };
  const firstHydrate = h.enqueue();
  const hydrateA = h.window.hydrateNoiIdeas();
  firstHydrate.resolve({ data: [item('edit-1', { title: 'Original title' })], error: null });
  await hydrateA;

  h.window.openNoiIdeaDetail('edit-1');
  h.els.get('noiIdeaDetailTitle').value = 'Edited by A';
  const updateCall = h.enqueue();
  const submitPromise = h.els.get('noiIdeaDetailForm')._listeners.submit({ preventDefault() {} });

  h.window.usProfile = { id: 'B', couple_id: 'CB' };
  const secondHydrate = h.enqueue();
  const hydrateB = h.window.hydrateNoiIdeas();
  secondHydrate.resolve({ data: [], error: null });
  await hydrateB;

  updateCall.resolve({ data: { id: 'edit-1' }, error: null });
  await submitPromise;

  assert.doesNotMatch(h.els.get('noiIdeaList').innerHTML, /Edited by A|edit-1/, 'A\'s stale edit must never render into B\'s active list');
  assert.ok(!h.toastCalls.includes('Idea aggiornata'), 'A\'s stale edit must not toast success once B is the active identity');
});

test('M7B fix (identity race c — archive): un\'archiviazione iniziata sotto A che si risolve dopo il cambio a B non deve finalizzarsi/toastare per B', async () => {
  const h = buildNoiIdeaHarness();
  h.window.usProfile = { id: 'A', couple_id: 'CA' };
  const firstHydrate = h.enqueue();
  const hydrateA = h.window.hydrateNoiIdeas();
  firstHydrate.resolve({ data: [item('arch-1')], error: null });
  await hydrateA;

  h.window.openNoiIdeaDetail('arch-1');
  // First click only arms the confirm state (no network call yet).
  h.els.get('noiIdeaDetailArchive')._listeners.click();
  const archiveCall = h.enqueue();
  const archivePromise = h.els.get('noiIdeaDetailArchive')._listeners.click();

  h.window.usProfile = { id: 'B', couple_id: 'CB' };
  const secondHydrate = h.enqueue();
  const hydrateB = h.window.hydrateNoiIdeas();
  secondHydrate.resolve({ data: [], error: null });
  await hydrateB;

  archiveCall.resolve({ data: { id: 'arch-1' }, error: null });
  await archivePromise;

  assert.ok(!h.toastCalls.includes('Idea archiviata'), 'A\'s stale archive must not toast success once B is the active identity');
});

test('M7B fix (identity race b): B in errore non deve mai essere ripopolato dalla risposta "vissute" tardiva di A', async () => {
  const h = buildNoiIdeaHarness();
  h.window.usProfile = { id: 'A', couple_id: 'CA' };

  // A's initial hydrate: lived data visible and expanded.
  const initial = h.enqueue();
  const pInitial = h.window.hydrateNoiIdeas();
  initial.resolve({ data: [item('lived-a', { status: 'lived' })], error: null });
  await pInitial;

  h.els.get('noiIdeaLivedToggle')._listeners.click();
  assert.equal(h.els.get('noiIdeaLivedList').hidden, false, 'sanity: lived list is expanded under A');
  assert.match(h.els.get('noiIdeaLivedList').innerHTML, /lived-a/);

  // A issues another hydrate that is left pending (e.g. a retry/refresh)
  // before the identity switch happens.
  const stalePending = h.enqueue();
  const pStale = h.window.hydrateNoiIdeas();

  // Switch to B while A's second request is still in flight, and hydrate B.
  h.window.usProfile = { id: 'B', couple_id: 'CB' };
  const bRequest = h.enqueue();
  const pB = h.window.hydrateNoiIdeas();

  // B's own request comes back as a PostgREST-style failure.
  bRequest.resolve({ data: null, error: { message: 'permission denied', code: '42501' } });
  await pB;

  assert.match(h.els.get('noiIdeaList').innerHTML, /Non riesco a caricare le idee/, 'B must see its own error state rendered');
  assert.equal(h.els.get('noiIdeaLivedList').hidden, true, 'B\'s lived list must stay collapsed after its own request fails');
  assert.equal(h.els.get('noiIdeaLivedToggle')._attrs['aria-expanded'], 'false', 'B\'s lived toggle must stay collapsed after its own request fails');

  // A's older, still-pending request now resolves successfully, arriving
  // after B's failure. It must never resurrect either list for B.
  stalePending.resolve({ data: [item('lived-a', { status: 'lived' })], error: null });
  await pStale;

  assert.match(h.els.get('noiIdeaList').innerHTML, /Non riesco a caricare le idee/, 'B\'s error state must survive A\'s late success — never silently replaced');
  assert.doesNotMatch(h.els.get('noiIdeaList').innerHTML, /lived-a/, 'A\'s stale lived item must never repopulate B\'s active list');
  assert.equal(h.els.get('noiIdeaLivedList').hidden, true, 'A\'s stale response must not reopen B\'s lived list');
  assert.doesNotMatch(h.els.get('noiIdeaLivedList').innerHTML, /lived-a/, 'A\'s stale lived item must never repopulate B\'s lived list');
});

test('M7B gate (stale edit): una modifica confermata si applica alla riga corrente anche se un hydrate ha sostituito le liste nel frattempo', async () => {
  const h = buildNoiIdeaHarness();
  h.window.usProfile = { id: 'u1', couple_id: 'c1' };
  const first = h.enqueue();
  const p1 = h.window.hydrateNoiIdeas();
  first.resolve({ data: [item('a')], error: null });
  await p1;
  h.window.openNoiIdeaDetail('a');
  h.els.get('noiIdeaDetailTitle').value = 'nuovo titolo';
  const save = h.enqueue();
  const submit = h.els.get('noiIdeaDetailForm')._listeners.submit({ preventDefault() {} });
  // A hydrate lands while the update is still in flight: arrays are replaced.
  const second = h.enqueue();
  const p2 = h.window.hydrateNoiIdeas();
  second.resolve({ data: [item('a')], error: null });
  await p2;
  save.resolve({ data: { id: 'a' }, error: null });
  await submit;
  assert.match(h.els.get('noiIdeaList').innerHTML, /nuovo titolo/);
});
