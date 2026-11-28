const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function functionSource(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `blocco mancante: ${start}`);
  assert.notEqual(to, -1, `fine blocco mancante: ${end}`);
  return source.slice(from, to);
}

function settingsModalHarness() {
  const source = read('settings.js');
  const elements = new Map();
  const document = { activeElement: null };

  class FakeElement {
    constructor(id) {
      this.id = id;
      this.listeners = new Map();
      this.classList = { add() {}, remove() {} };
      this.disabled = false;
      this.textContent = '';
      this.value = '';
    }
    set innerHTML(value) {
      this._innerHTML = value;
      for (const match of value.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const element = new FakeElement(match[1]);
        const inputValue = match[0].match(/\bvalue="([^"]*)"/);
        if (inputValue) element.value = inputValue[1];
        elements.set(element.id, element);
      }
    }
    get innerHTML() { return this._innerHTML || ''; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    emit(type) { return this.listeners.get(type)?.(); }
    focus() { document.activeElement = this; }
    setAttribute() {}
  }

  for (const id of ['usSettingsModalTitle', 'usSettingsModalKicker', 'usSettingsModalBody', 'usSettingsOverlay']) {
    elements.set(id, new FakeElement(id));
  }
  document.getElementById = (id) => elements.get(id) || null;
  document.body = { classList: { add() {}, remove() {} } };

  const events = [];
  const context = vm.createContext({
    console,
    document,
    location: { reload: () => events.push('reload') },
    sb: { auth: { signOut: async () => { events.push('signOut'); return { error: null }; } } },
    settingsSnapshot: { couple: { started_on: '2020-01-01' } },
    settingsModalGeneration: 0,
    scriptableSetupCodeOpen: false,
    scriptableSetupCode: '',
    logoutInFlight: false,
    toast: () => {},
    window: { revokeCurrentDevice: async () => events.push('revoke') }
  });

  vm.runInContext(`
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    ${functionSource(source, 'function openModal(', 'function closeModal(')}
    ${functionSource(source, 'function closeModal(', 'window.closeUsSettingsModal=')}
    ${functionSource(source, 'function formatDate(', 'async function locationState(')}
    ${functionSource(source, 'function relationshipDateModal(', 'function relationshipDateConfirmation(')}
    ${functionSource(source, 'function relationshipDateConfirmation(', 'function homePhotoModal(')}
    ${functionSource(source, 'function logoutConfirmationModal(', 'async function logout(')}
    ${functionSource(source, 'async function logout(', 'async function action(')}
    ${functionSource(source, 'async function action(', 'function boot(){')}
  `, context);

  return { context, document, elements, events };
}

test('Stories sono ritirate: niente runtime, foglio, precache né copia nelle build', () => {
  for (const file of ['stories.js', 'stories.css']) assert.equal(fs.existsSync(path.join(ROOT, file)), false, `${file} is gone`);
  const html = read('index.html');
  assert.doesNotMatch(html, /\/stories\.(?:js|css)/);
  assert.doesNotMatch(read('service-worker.js'), /stories\.(?:js|css)|us-icon-stories-128/);
  for (const script of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) {
    assert.doesNotMatch(read(script), /'stories\.(?:js|css)'/, `${script} does not copy Stories`);
  }
  // The archive of the Stories already shared stays in Settings (settings.js), web only.
  assert.match(html, /data-us-setting="story-archive"/);
  assert.match(read('settings.js'), /function showStoryArchive|showStoryArchive=/);
});

test('Motion 3 legacy e Motion Pass inutilizzato non restano nel runtime', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'motion3.css')), false);
  for (const file of ['index.html', 'service-worker.js', 'settings.css']) {
    const source = read(file);
    assert.doesNotMatch(source, /motion3\.css|us-motion3-|us-swipe-tracking|us-swipe-return/);
  }
  // T1 1.0 — polish4 (and the unused Motion 3.1 rules in it) is gone.
  assert.equal(fs.existsSync(path.join(ROOT, 'polish4.css')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'polish4.js')), false);
});

test('i controlli delete restano espliciti e hanno target 44px', () => {
  const app = read('app.js');
  const albums = read('moments-albums.js');
  const albumCss = read('moments-albums.css');
  const styles = read('styles.css');

  assert.match(app, /class="moment-delete"[^>]*aria-label="Elimina ricordo"[^>]*>Elimina<\/button>/);
  assert.doesNotMatch(app, /class="us-overflow-icon"/, 'Ricordi usa un’azione Elimina esplicita, non un overflow ambiguo');
  // Ricordi carousel (e732065): the album deletes the photo on screen through one labelled
  // trash button (with undo), 46px in the gallery.
  assert.match(albums, /class="us-album-current-delete"[^>]*aria-label="Elimina questa foto"[^>]*><span class="us-icon" data-us-icon="trash"/);
  assert.doesNotMatch(albums, /class="us-album-photo-delete"[^>]*>×<\/button>/);
  assert.match(styles, /\.moment-delete\{[^}]*height:44px/s);
  assert.match(albumCss, /\.us-album-photo-delete\{[^}]*width:44px[^}]*height:44px/s);
  assert.match(read('dc-ricordi.css'), /\.us-album-current-delete,\.us-undo-delete-go\)\{width:46px;/);
});

test('Settings riusa il proprio modal al posto dei confirm browser', () => {
  const settings = read('settings.js');
  assert.doesNotMatch(settings, /\bconfirm\s*\(/);
  assert.match(settings, /function logoutConfirmationModal\(/);
  assert.match(settings, /function relationshipDateConfirmation\(/);
  assert.match(settings, /function relationshipDateModal\(valueOverride\)/);
  assert.match(settings, /usCancelRelationshipDate['"]\)\?\.addEventListener\(['"]click['"],\(\)=>relationshipDateModal\(value\)\)/);
});

test('le conferme Settings mantengono il focus e non anticipano il logout', async () => {
  const { context, document, elements, events } = settingsModalHarness();

  context.relationshipDateModal();
  elements.get('usRelationshipDateInput').value = '2024-02-03';
  await elements.get('usSaveRelationshipDate').emit('click');
  assert.equal(document.activeElement?.id, 'usCancelRelationshipDate');
  await elements.get('usCancelRelationshipDate').emit('click');
  assert.equal(elements.get('usRelationshipDateInput').value, '2024-02-03');
  assert.equal(document.activeElement?.id, 'usRelationshipDateInput');

  const logoutOpener = { id: 'logoutOpener' };
  document.activeElement = logoutOpener;
  await context.action('logout');
  assert.deepEqual(events, []);
  assert.equal(document.activeElement, logoutOpener, 'il consumer deve lasciare al foundation la cattura dell’opener');
  await elements.get('usConfirmLogout').emit('click');
  assert.deepEqual(events, ['revoke', 'signOut', 'reload']);
});

test('shell e build restano coerenti per upgrade e offline', () => {
  const worker = read('service-worker.js');
  const html = read('index.html');
  const version = JSON.parse(read('version.json')).version;
  const build = html.match(/meta name="us-build" content="([^"]+)"/)?.[1];

  assert.ok(build);
  assert.equal(build, version);
  assert.ok(worker.includes(`const BUILD_ID = "${build}";`));
  assert.ok(worker.includes('const CACHE_NAME = `${SHELL_CACHE_PREFIX}${BUILD_ID}`;'));
  assert.ok(html.includes(`/settings.js?v=${build}`));
  assert.doesNotMatch(worker, /versioned\("\/stories\.css"\)/);
  assert.doesNotMatch(worker, /"\/motion3\.css"/);
  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
});

test('la pulizia non introduce important nei nuovi target dei controlli', () => {
  const css = read('moments-albums.css');
  const targetRules = [
    css.match(/\.moment-card\.moment-postit \.moment-delete\{[^}]*\}/s)?.[0],
    css.match(/\.us-album-photo-delete\{[^}]*\}/s)?.[0]
  ];
  targetRules.forEach((rule) => assert.ok(rule, 'la regola target deve esistere'));
  assert.doesNotMatch(targetRules.join('\n'), /!important/);
});
