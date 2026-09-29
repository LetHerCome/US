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
  assert.doesNotMatch(section, /Metti in calendario|scegli un giorno|schedul/i);
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
  assert.doesNotMatch(block, /living_items|shared_experiences|proposals|localStorage|indexedDB|sb\.rpc\(/);
});

test('M7B runtime: insert rispetta created_by/couple_id/status idea/completed false e non scrive mai completed_at o calendar_entry_id', () => {
  const block = daVivereBlock();
  const insertCall = block.match(/sb\.from\('bucket_items'\)\.insert\(\{[\s\S]*?\}\)/)?.[0] || '';
  assert.notEqual(insertCall, '');
  assert.match(insertCall, /created_by:window\.usProfile\.id/);
  assert.match(insertCall, /couple_id:window\.usProfile\.couple_id/);
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
  const editUpdate = block.match(/sb\.from\('bucket_items'\)\.update\(\{title,note,link_url:link\}\)\.eq\('id',id\)\.eq\('couple_id',window\.usProfile\.couple_id\)\.select\('id'\)\.maybeSingle\(\)/)?.[0] || '';
  assert.notEqual(editUpdate, '');
  assert.doesNotMatch(editUpdate, /status|completed|calendar_entry_id/);
});

test("M7B runtime: archiviare è l'unica update che scrive status, ed è sempre 'archived' esplicito e couple-scoped", () => {
  const block = daVivereBlock();
  const statusWrites = [...block.matchAll(/\.update\(\{[^}]*status\s*:\s*'([a-z]+)'[^}]*\}\)/g)].map((m) => m[1]);
  assert.deepEqual(statusWrites, ['archived']);
  assert.doesNotMatch(block, /status:\s*'(scheduled|lived)'/);
  assert.match(block, /sb\.from\('bucket_items'\)\.update\(\{status:'archived'\}\)\.eq\('id',id\)\.eq\('couple_id',window\.usProfile\.couple_id\)\.select\('id'\)\.maybeSingle\(\)/);
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
  assert.match(block, /noiIdeaStateLabel[\s\S]{0,200}status==='scheduled'\)return 'In calendario'/);
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
  const hydrateFn = daVivereBlock().match(/async function hydrateNoiIdeas\([\s\S]*?\nwindow\.hydrateNoiIdeas=hydrateNoiIdeas;/)?.[0] || '';
  assert.notEqual(hydrateFn, '');
  const guard = hydrateFn.match(/if\(noiIdeaState\.identityKey&&noiIdeaState\.identityKey!==identityKey\)\{[\s\S]*?\}/)?.[0] || '';
  assert.notEqual(guard, '');
  assert.match(guard, /noiIdeaState\.activeItems=\[\]/);
  assert.match(guard, /noiIdeaState\.livedItems=\[\]/);
  assert.match(guard, /closeNoiIdeaDetail\(\)/);
  assert.match(guard, /toggleNoiIdeaQuickForm\(false\)/);
  // The reset must happen before the network request, and identityKey must
  // then be updated to the new identity before the request is issued.
  const resetIndex = hydrateFn.indexOf(guard);
  const identityAssignIndex = hydrateFn.indexOf('noiIdeaState.identityKey=identityKey;');
  const requestIndex = hydrateFn.indexOf("await sb.from('bucket_items')");
  assert.ok(resetIndex >= 0 && identityAssignIndex > resetIndex && requestIndex > identityAssignIndex);
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
  assert.match(block, /Carico le vostre idee/);
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
