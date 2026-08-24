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
    ${functionSource(source, 'async function action(', 'const US_THINK_POSITION_KEY=')}
  `, context);

  return { context, document, elements, events };
}

test('Stories usa CSS statico senza reiniezione runtime', () => {
  const stories = read('stories.js');
  const css = read('stories.css');
  const html = read('index.html');

  assert.match(stories, /window\.__usStoriesV19Installed/);
  assert.doesNotMatch(stories, /function addStyles|createElement\(['"]style['"]\)|usStoriesV19Styles/);
  assert.match(css, /\.us-top-story-ring/);
  assert.match(css, /\.us-story-viewer\.open/);
  assert.match(css, /\.us-camera-viewer/);
  assert.match(html, /<link rel="stylesheet" href="\/stories\.css"\/>/);
});

test('Motion 3 legacy e Motion Pass inutilizzato non restano nel runtime', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'motion3.css')), false);
  for (const file of ['index.html', 'service-worker.js', 'settings.css']) {
    const source = read(file);
    assert.doesNotMatch(source, /motion3\.css|us-motion3-|us-swipe-tracking|us-swipe-return/);
  }
  assert.match(read('polish4.css'), /us-motion31-current/);
  assert.match(read('app.js'), /us-motion31-current/);
});

test('i piccoli controlli delete e overflow hanno target 44px e icone SVG stabili', () => {
  const app = read('app.js');
  const albums = read('moments-albums.js');
  const css = read('moments-albums.css');

  assert.match(app, /class="us-overflow-icon"/);
  assert.match(albums, /class="us-delete-icon"/);
  assert.doesNotMatch(app, /class="moment-delete"[^>]*>×<\/button>/);
  assert.doesNotMatch(albums, /class="us-album-photo-delete"[^>]*>×<\/button>/);
  assert.match(css, /\.moment-delete\{[^}]*width:44px[^}]*height:44px/s);
  assert.match(css, /\.us-album-photo-delete\{[^}]*width:44px[^}]*height:44px/s);
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

test('shell, build e asset Stories restano coerenti per upgrade e offline', () => {
  const worker = read('service-worker.js');
  const html = read('index.html');
  const version = JSON.parse(read('version.json')).version;
  const build = html.match(/meta name="us-build" content="([^"]+)"/)?.[1];

  assert.equal(version, 'static-runtime-20260824-1');
  assert.equal(build, version);
  assert.match(worker, /const CACHE_NAME = "us-shell-static-runtime-3"/);
  assert.match(worker, /"\/stories\.css"/);
  assert.doesNotMatch(worker, /"\/motion3\.css"/);
  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
});

test('la pulizia non introduce important nei nuovi target dei controlli', () => {
  const css = read('moments-albums.css');
  const targetRules = [
    css.match(/\.moment-card\.moment-postit \.moment-delete\{[^}]*\}/s)?.[0],
    css.match(/\.us-overflow-icon\{[^}]*\}/s)?.[0],
    css.match(/\.us-album-photo-delete\{[^}]*\}/s)?.[0],
    css.match(/\.us-delete-icon\{[^}]*\}/s)?.[0]
  ];
  targetRules.forEach((rule) => assert.ok(rule, 'la regola target deve esistere'));
  assert.doesNotMatch(targetRules.join('\n'), /!important/);
});
