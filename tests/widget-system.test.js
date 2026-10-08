// US Native Widget System V1: the JS state system (widgets.js), the platform
// bridge contract (platform.js) and static guarantees of the Android plugin
// that a Gradle-less CI cannot otherwise check (resources, manifest, privacy).
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const OWNER = 'a'.repeat(64);
const TOKEN = 'A'.repeat(43);

function loadPlatform(runtime = null) {
  const sandbox = { console: { warn() {} }, navigator: {} };
  if (runtime) sandbox.UsCapacitorRuntime = runtime;
  sandbox.window = sandbox;
  vm.runInContext(read('platform.js'), vm.createContext(sandbox), { filename: 'platform.js' });
  return sandbox.UsPlatform;
}

function nativePlatform(plugin) {
  return loadPlatform({
    isNativePlatform: () => true,
    isPluginAvailable: (name) => name === 'UsWidgetBridge',
    registerPlugin: () => plugin
  });
}

function loadWidgets({
  native = true,
  credential = 'missing',
  nativeSnapshot = null,
  issueResult = { token: TOKEN, expiresAt: '2027-01-01T00:00:00.000Z' },
  storeCredentialResult = true,
  countdownState = null,
  launchUrl = null
} = {}) {
  const events = [];
  const listeners = {};
  let appUrlOpen;
  let urlListeners = 0;
  const counts = { issue: 0, revoke: 0 };
  const platform = {
    isNative: native,
    hasWidgetBridge: () => native,
    activateWidgetAccount: async (ownerHash) => { events.push(['activate', ownerHash]); return { credential }; },
    readWidgetSnapshot: async () => nativeSnapshot,
    writeWidgetSnapshot: async (snapshot) => { events.push(['snapshot', JSON.parse(JSON.stringify(snapshot))]); return true; },
    writeWidgetPhoto: async () => true,
    clearWidgets: async () => { events.push(['clear']); return true; },
    getWidgetDeviceIdentity: async () => ({ deviceId: '5a86d7aa-37d8-48ed-9122-a8f42d80ff9e' }),
    storeWidgetActionCredential: async (ownerHash, token) => { events.push(['credential', ownerHash, token]); return storeCredentialResult; },
    clearWidgetActionCredential: async () => events.push(['credential-clear']),
    getNativeLaunchUrl: async () => launchUrl,
    listenForNativeAppUrl(handler) { urlListeners += 1; appUrlOpen = handler; return Promise.resolve({ remove() {} }); },
    listenForWidgetPinned: () => Promise.resolve(null),
    getInstalledWidgets: async () => ({ installed: { think: 1 }, pinSupported: true, vendor: 'xiaomi' }),
    requestWidgetPin: async (kind) => { events.push(['pin', kind]); return { supported: true, requested: true }; }
  };
  const sandbox = {
    console: { warn() {} },
    crypto: webcrypto,
    TextEncoder,
    URL,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    UsPlatform: platform,
    USCountdown: { widgetState: () => countdownState },
    go(page) { events.push(['go', page]); },
    UsWidgetCredentialApi: {
      issue: async (hash) => { counts.issue += 1; events.push(['issue', hash]); return issueResult; },
      revoke: async (hash) => { counts.revoke += 1; events.push(['revoke', hash]); return true; }
    },
    UsWidgetDataApi: {
      couple: async () => ({ names: ['Francesco', 'Beatrice'], startedOn: '2026-04-21' }),
      latestPhoto: async () => null
    },
    document: { hidden: false, addEventListener() {} },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((handler) => handler(event)); },
    // The delayed photo sync (2.5 s) is exercised separately; short timers run normally.
    setTimeout: (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms)),
    clearTimeout
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(read('widgets.js'), context, { filename: 'widgets.js' });
  return {
    sandbox,
    widgets: context.UsWidgets,
    emitUrl: (url) => appUrlOpen?.({ url }),
    events,
    counts,
    get urlListeners() { return urlListeners; },
    snapshots: () => events.filter((event) => event[0] === 'snapshot').map((event) => event[1]),
    setCountdown(next) { countdownState = next; }
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 160));
test('D5 old widget clear cannot wipe an account activated during revocation',async()=>{
  const harness=loadWidgets({credential:'ready'});
  await harness.widgets.authReady({id:'old',couple_id:'a'});
  let release;const revoked=new Promise(r=>{release=r;});
  harness.sandbox.UsWidgetCredentialApi.revoke=()=>revoked;
  const clearing=harness.widgets.clear();
  await harness.widgets.authReady({id:'new',couple_id:'b'});
  release(true);await clearing;await settle();
  assert.equal(harness.widgets.view().ready,true);
  assert.equal(harness.events.some(event=>event[0]==='clear'),false);
});

// ---------- platform bridge ----------

test('browser/PWA mantiene il bridge widget come no-op fail-safe', async () => {
  const platform = loadPlatform();
  assert.equal(platform.isNative, false);
  assert.equal(platform.hasWidgetBridge(), false);
  assert.equal(await platform.activateWidgetAccount(OWNER), null);
  assert.equal(await platform.writeWidgetSnapshot({ schemaVersion: 2, ownerHash: OWNER }), false);
  assert.equal(await platform.readWidgetSnapshot(), null);
  assert.equal(await platform.writeWidgetPhoto(OWNER, 'b'.repeat(32), 'AAAA'), false);
  assert.equal(await platform.clearWidgets(), false);
  assert.equal(await platform.getNativeLaunchUrl(), null);
  assert.equal(await platform.listenForNativeAppUrl(() => {}), null);
  assert.equal(await platform.getWidgetDeviceIdentity(), null);
  assert.equal(await platform.storeWidgetActionCredential(OWNER, TOKEN), false);
  assert.equal(await platform.clearWidgetActionCredential(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(await platform.getInstalledWidgets())), { installed: {}, pinSupported: false, vendor: 'web' });
  assert.deepEqual(JSON.parse(JSON.stringify(await platform.requestWidgetPin('think'))), { supported: false, requested: false });
  assert.equal(await platform.openWidgetSettings(), false);
  assert.equal(await platform.listenForWidgetPinned(() => {}), null);

  const pwa = loadWidgets({ native: false });
  assert.equal(pwa.widgets.isAvailable(), false);
  assert.equal(await pwa.widgets.authReady({ id: 'user-1' }), false);
  assert.equal(pwa.urlListeners, 0);
  assert.equal(pwa.events.length, 0);
});

test('snapshot v2 è allow-list: niente token, URL, id raw o stringhe di controllo', async () => {
  const calls = [];
  const platform = nativePlatform({ writeSnapshot: async (payload) => calls.push(payload) });
  await platform.writeWidgetSnapshot({
    schemaVersion: 2,
    ownerHash: OWNER,
    updatedAt: '2026-10-06T10:00:00.000Z',
    think: { partnerName: 'Bea\u0000trice', lastReceivedAt: '2026-10-06T09:00:00+02:00', lastSentAt: 'ieri', lastAnsweredAt: '', token: 'x' },
    couple: { names: ['Francesco', 'Beatrice', 'Terzo'], startedOn: '2026-04-21', frame: '../evil', userId: 'raw' },
    countdown: { active: true, kind: 'clock', title: 'Viaggio', target: '2026-12-01T18:30:00.000Z', style: 'neon' },
    photo: { state: 'ready', key: 'https://example.test/a.jpg', url: 'https://example.test/a.jpg', takenOn: '2026-10-01' },
    accessToken: 'secret', refreshToken: 'secret', supabaseUrl: 'secret', supabaseKey: 'secret'
  });
  const sent = calls[0].snapshot;
  const serialized = JSON.stringify(sent);
  assert.doesNotMatch(serialized, /secret|accessToken|refreshToken|supabase|https?:|userId|"raw"|token/i);
  assert.equal(sent.schemaVersion, 2);
  assert.equal(sent.think.partnerName, 'Bea trice');
  assert.equal(sent.think.lastSentAt, '');
  assert.deepEqual([...sent.couple.names], ['Francesco', 'Beatrice']);
  assert.equal(sent.couple.frame, '');
  assert.equal(sent.countdown.style, 'editorial');
  assert.equal(sent.countdown.kind, 'clock');
  assert.deepEqual({ ...sent.photo }, { state: 'none', key: '', takenOn: '' });
  assert.deepEqual(Object.keys(sent).sort(), ['countdown', 'couple', 'ownerHash', 'photo', 'schemaVersion', 'think', 'updatedAt']);

  assert.equal(await platform.writeWidgetSnapshot({ schemaVersion: 2, ownerHash: 'raw-user-id' }), false, 'owner non hash rifiutato');
});

test('foto widget passa solo come bytes base64 per owner e key, mai come URL', async () => {
  const calls = [];
  const platform = nativePlatform({ writePhoto: async (payload) => calls.push(payload) });
  assert.equal(await platform.writeWidgetPhoto(OWNER, 'b'.repeat(32), 'https://example.test/a.jpg'), false);
  assert.equal(await platform.writeWidgetPhoto(OWNER, 'b'.repeat(32), 'data:image/jpeg;base64,AAAA'), false);
  assert.equal(await platform.writeWidgetPhoto(OWNER, 'not-a-key', 'AAAA'), false);
  assert.equal(await platform.writeWidgetPhoto('raw-user', 'b'.repeat(32), 'AAAA'), false);
  assert.equal(await platform.writeWidgetPhoto(OWNER, 'b'.repeat(32), 'A'.repeat(2_800_004)), false);
  assert.equal(await platform.writeWidgetPhoto(OWNER, 'b'.repeat(32), '/9j/AAAA'), true);
  assert.equal(calls.length, 1);
});

test('activate riporta lo stato credential e logout usa clearAll', async () => {
  const calls = [];
  const platform = nativePlatform({
    activateAccount: async (payload) => { calls.push(['activate', payload]); return { credential: 'renew', token: 'leak' }; },
    clearAll: async () => calls.push(['clearAll']),
    clearSnapshot: async () => calls.push(['clearSnapshot'])
  });
  assert.deepEqual({ ...(await platform.activateWidgetAccount(OWNER)) }, { credential: 'renew' });
  assert.equal(await platform.activateWidgetAccount('raw'), null);
  assert.equal(await platform.clearWidgets(), true);
  assert.deepEqual(calls.map((call) => call[0]), ['activate', 'clearAll']);
});

// ---------- widgets.js ----------

test('auth ready provisiona la credential device-scoped solo quando manca o va rinnovata', async () => {
  const missing = loadWidgets({ credential: 'missing' });
  await missing.widgets.authReady({ id: 'user-1' });
  assert.equal(missing.counts.issue, 1);
  assert.ok(missing.events.some((event) => event[0] === 'credential' && event[2] === TOKEN));
  assert.match(missing.events.find((event) => event[0] === 'issue')[1], /^[a-f0-9]{64}$/, 'device id solo come hash');

  const ready = loadWidgets({ credential: 'ready' });
  await ready.widgets.authReady({ id: 'user-1' });
  await ready.widgets.authReady({ id: 'user-1' });
  assert.equal(ready.counts.issue, 0, 'nessuna credential nuova a ogni avvio');

  const renew = loadWidgets({ credential: 'renew' });
  await renew.widgets.authReady({ id: 'user-1' });
  assert.equal(renew.counts.issue, 1);
});

test('fallimento provisioning non conserva credential; credential non cifrata viene revocata', async () => {
  const failed = loadWidgets({ issueResult: null });
  await failed.widgets.authReady({ id: 'user-1' });
  assert.equal(failed.events.some((event) => event[0] === 'credential'), false);
  assert.ok(failed.events.some((event) => event[0] === 'credential-clear'));

  const unstored = loadWidgets({ storeCredentialResult: false });
  await unstored.widgets.authReady({ id: 'user-1' });
  assert.equal(unstored.counts.issue, 1);
  assert.equal(unstored.counts.revoke, 1);
  assert.ok(unstored.events.some((event) => event[0] === 'credential-clear'));
});

test('logout attende il provisioning, revoca lato server e poi cancella tutto lo stato native', async () => {
  let releaseIssue;
  const pendingIssue = new Promise((resolve) => { releaseIssue = resolve; });
  const harness = loadWidgets({ issueResult: pendingIssue });
  const ready = harness.widgets.authReady({ id: 'user-1' });
  for (const deadline = Date.now() + 2000; harness.counts.issue === 0 && Date.now() < deadline;) await new Promise(setImmediate);
  assert.equal(harness.counts.issue, 1);
  const clearing = harness.widgets.clear();
  await Promise.resolve();
  assert.equal(harness.counts.revoke, 0);
  releaseIssue({ token: TOKEN, expiresAt: '2027-01-01T00:00:00.000Z' });
  await Promise.all([ready, clearing]);
  const names = harness.events.map((event) => event[0]);
  assert.ok(names.indexOf('credential') < names.indexOf('revoke'));
  assert.ok(names.indexOf('revoke') < names.lastIndexOf('clear'));
  assert.equal(harness.widgets.view().ready, false);
  assert.deepEqual([...harness.widgets.view().snapshot.couple.names], []);
});

test('logout con credential già pronta revoca comunque per device hash', async () => {
  const harness = loadWidgets({ credential: 'ready' });
  await harness.widgets.authReady({ id: 'user-1' });
  await harness.widgets.clear();
  assert.equal(harness.counts.revoke, 1);
  assert.match(harness.events.find((event) => event[0] === 'revoke')[1], /^[a-f0-9]{64}$/);
});

test('snapshot isolato per account: owner hash, nessun id raw, nessun dato del vecchio account', async () => {
  const harness = loadWidgets({ credential: 'ready' });
  await harness.widgets.authReady({ id: 'account-one' });
  await harness.widgets.publishThink({ partnerName: 'Prima', lastReceivedAt: '2026-10-06T08:00:00Z', lastSentAt: '' });
  await settle();
  const first = harness.snapshots().at(-1);
  assert.equal(first.schemaVersion, 2);
  assert.match(first.ownerHash, /^[a-f0-9]{64}$/);
  assert.deepEqual([...first.couple.names], ['Francesco', 'Beatrice']);
  assert.equal(first.couple.startedOn, '2026-04-21');

  await harness.widgets.authReady({ id: 'account-two' });
  await harness.widgets.publishThink({ partnerName: 'Seconda', lastReceivedAt: '', lastSentAt: '' });
  await settle();
  const second = harness.snapshots().at(-1);
  assert.notEqual(first.ownerHash, second.ownerHash);
  assert.doesNotMatch(JSON.stringify(harness.snapshots()), /account-one|account-two/);
  assert.doesNotMatch(JSON.stringify(second), /Prima/);
});

test('avvio a freddo riparte dallo snapshot native dello stesso account, mai di un altro', async () => {
  const ownerOf = async (id) => createHash('sha256').update(id).digest('hex');
  const seed = (ownerHash) => ({
    photoKey: 'c'.repeat(32),
    snapshot: {
      schemaVersion: 2, ownerHash, updatedAt: '',
      think: { partnerName: 'Beatrice', lastReceivedAt: '', lastSentAt: '', lastAnsweredAt: '' },
      couple: { names: ['F', 'B'], startedOn: '2026-04-21', frame: '' },
      countdown: { active: true, kind: 'days', title: 'Mare', target: '2026-12-01', style: 'aurora' },
      photo: { state: 'ready', key: 'c'.repeat(32), takenOn: '2026-10-01' }
    }
  });
  const same = loadWidgets({ credential: 'ready', nativeSnapshot: seed(await ownerOf('user-1')) });
  await same.widgets.authReady({ id: 'user-1' });
  await settle();
  const kept = same.snapshots().at(-1);
  assert.equal(kept.photo.state, 'ready', 'la foto in cache non viene cancellata dal primo write');
  assert.equal(kept.countdown.title, 'Mare', 'il Countdown resta finché Oggi non lo conosce');

  const other = loadWidgets({ credential: 'ready', nativeSnapshot: seed(await ownerOf('someone-else')) });
  await other.widgets.authReady({ id: 'user-1' });
  await settle();
  const fresh = other.snapshots().at(-1);
  assert.equal(fresh.photo.state, 'none');
  assert.equal(fresh.countdown.active, false);
  assert.equal(fresh.think.partnerName, '');
});

test('Countdown widget segue lo stesso Countdown attivo di Oggi', async () => {
  const harness = loadWidgets({ credential: 'ready', countdownState: { active: true, kind: 'clock', title: 'Volo', target: '2026-12-01T18:30:00+01:00', style: 'signal' } });
  await harness.widgets.authReady({ id: 'user-1' });
  await settle();
  assert.deepEqual({ ...harness.snapshots().at(-1).countdown }, { active: true, kind: 'clock', title: 'Volo', target: '2026-12-01T17:30:00.000Z', style: 'signal' });

  harness.setCountdown(null);
  assert.equal(await harness.widgets.syncCountdown(), false, 'stato sconosciuto: nessun write');
  harness.setCountdown({ active: false, style: 'chrome' });
  await harness.widgets.syncCountdown();
  assert.equal(harness.snapshots().at(-1).countdown.active, false);
  harness.setCountdown({ active: true, kind: 'together', title: '', target: '2026-04-21', style: 'orbit' });
  harness.sandbox.dispatchEvent({ type: 'us:countdown-updated' });
  await settle();
  assert.equal(harness.snapshots().at(-1).countdown.kind, 'together');
});

test('deep link widget aprono la destinazione giusta una volta sola e non inviano mai', async () => {
  const harness = loadWidgets({ credential: 'ready' });
  await harness.widgets.authReady({ id: 'user-1' });
  harness.sandbox.usProfile = { id: 'user-1' };
  assert.equal(harness.urlListeners, 1);
  const go = () => harness.events.filter((event) => event[0] === 'go').map((event) => event[1]);
  await harness.emitUrl('us://widget/think');
  await harness.emitUrl('us://widget/think');
  await harness.emitUrl('us://widget/countdown');
  await harness.emitUrl('us://widget/noi');
  await harness.emitUrl('us://widget/photo');
  assert.deepEqual(go(), ['home', 'home', 'bond', 'home']);
  assert.equal(await harness.emitUrl('us://widget/stories'), false);
  assert.equal(await harness.emitUrl('https://evil.test/widget/think'), false);
  await harness.emitUrl('us://widget/think/send');
  assert.equal(harness.counts.issue, 0);
  assert.equal(harness.events.some((event) => event[0] === 'snapshot' && /sent/i.test(JSON.stringify(event[1].think.lastSentAt))), false);
  assert.doesNotMatch(read('widgets.js'), /sendThinkSignal|widget-think-send/);
});

test('Foto & Noi follows the painted Oggi hero, not an independent latest-Ricordo query', () => {
  const app = read('app.js');
  const provider = app.slice(app.indexOf('  async latestPhoto(){'), app.indexOf('\n});', app.indexOf('  async latestPhoto(){')));
  assert.match(provider, /homePhotoHasPainted/);
  assert.match(provider, /homePhotoPath/);
  assert.doesNotMatch(provider, /sb\.from\('moments'\)/);
  assert.match(app, /window\.dispatchEvent\(new Event\('us:home-photo-changed'\)\)/);
  assert.match(read('widgets.js'), /addEventListener\('us:home-photo-changed'/);
  assert.doesNotMatch(read('widgets.js'), /addEventListener\('us:moments-updated'/);
  assert.match(read('widget-hub.js'), /La fotografia che vedi su Oggi/);
});

test('Foto & Noi keeps a valid private cache until Oggi finishes painting', async () => {
  const seed = {
    photoKey: 'c'.repeat(32),
    snapshot: {
      schemaVersion: 2,
      ownerHash: createHash('sha256').update('user-1').digest('hex'),
      updatedAt: '2026-10-09T00:00:00Z',
      think: {}, couple: { names: [], startedOn: '', frame: '' }, countdown: {},
      photo: { state: 'ready', key: 'c'.repeat(32), takenOn: '' }
    }
  };
  const h = loadWidgets({ nativeSnapshot: seed, credential: 'ready' });
  await h.widgets.authReady({ id: 'user-1' });
  h.sandbox.UsWidgetDataApi.latestPhoto = async () => undefined; // Oggi is still loading
  await h.widgets.syncPhoto({ force: true });
  assert.equal(h.widgets.view().snapshot.photo.key, 'c'.repeat(32));
  assert.equal(h.widgets.view().snapshot.photo.state, 'ready');
});

test('Ti penso updates its own RemoteViews immediately before the network call', () => {
  const widgets = read(`${JAVA}/UsWidgets.java`);
  const action = read(`${JAVA}/UsThinkWidgetActionReceiver.java`);
  assert.match(widgets, /static void refreshThink\(Context context\)/);
  assert.match(action, /writeAction\("sending", actionId\);\s*\/\/[^\n]*\n\s*UsWidgets\.refreshThink\(app\);/);
  assert.match(action, /UsWidgets\.refreshAll\(app\);\s*pending\.finish\(\)/);
});

test('Hub: pin scrive prima lo stato e passa solo kind validi', async () => {
  const harness = loadWidgets({ credential: 'ready' });
  await harness.widgets.authReady({ id: 'user-1' });
  await settle();
  const before = harness.snapshots().length;
  await harness.widgets.requestPin('noi');
  assert.ok(harness.snapshots().length > before);
  assert.deepEqual(harness.events.findLast((event) => event[0] === 'pin'), ['pin', 'noi']);
  assert.deepEqual({ ...(await harness.widgets.requestPin('stories')) }, { supported: false, requested: false });
  assert.equal((await harness.widgets.installed()).vendor, 'xiaomi');
});

test('app wiring: UsWidgets sostituisce UsThinkWidget, URL firmati restano nella WebView', () => {
  const app = read('app.js');
  const widgets = read('widgets.js');
  assert.doesNotMatch(app, /UsThinkWidget/);
  assert.match(app, /UsWidgets\?\.authReady\?\.\(profile\)/);
  assert.match(app, /UsWidgets\?\.publishThink\?\.\(/);
  assert.match(app, /UsWidgets\?\.clear\?\.\(\)/);
  assert.match(app, /window\.UsWidgetDataApi/);
  assert.match(app, /widget-device-token/);
  assert.doesNotMatch(widgets, /access[_T]?oken|refresh[_T]?oken|supabaseUrl|supabaseKey|getSession/i);
  assert.match(widgets, /credentials: 'omit'/);
  assert.match(widgets, /platform\.writeWidgetPhoto\(owner, key, encoded\.base64\)/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'ti-penso-widget.js')), 'il vecchio coordinatore non deve tornare');
  for (const file of ['index.html', 'service-worker.js', 'scripts/build-capacitor-web.mjs', 'scripts/build-cloudflare-pages.mjs']) {
    assert.doesNotMatch(read(file), /ti-penso-widget\.js/, file);
  }
});

test('Widget Hub vive in Impostazioni, nascosto fuori dall’app native, niente su Oggi', () => {
  const html = read('index.html');
  const hub = read('widget-hub.js');
  assert.match(html, /<button[^>]*data-us-setting="widgets"[^>]*hidden/);
  assert.match(html, /id="usWidgetHub"/);
  assert.match(html, /Home <span>→<\/span> pressione lunga <span>→<\/span> Widget <span>→<\/span> US <span>→<\/span> scegli il widget/);
  assert.match(html, /id="usWidgetHubManual" hidden/);
  assert.match(read('settings.js'), /name==='widgets'[\s\S]{0,80}UsWidgetHub/);
  assert.match(read('navigation.js'), /'widget-hub'/);
  for (const kind of ['think', 'countdown', 'noi', 'photo']) assert.match(hub, new RegExp(`kind: '${kind}'`));
  assert.match(hub, /Aggiungi alla Home/);
  const oggi = html.slice(html.indexOf('id="page-home"'), html.indexOf('id="page-bond"'));
  assert.doesNotMatch(oggi, /usWidgetHub|data-widget-add/);
});

// ---------- Android plugin (static: Gradle is not available in every CI) ----------

test('manifest dichiara 4 provider e i receiver interni, tutti non esportati', () => {
  const manifest = read(`${PLUGIN}/AndroidManifest.xml`);
  for (const provider of ['UsThinkWidgetProvider', 'UsCountdownWidgetProvider', 'UsNoiWidgetProvider', 'UsPhotoWidgetProvider']) {
    const block = manifest.match(new RegExp(`<receiver[^>]*${provider}"[\\s\\S]*?</receiver>`))?.[0] || '';
    assert.match(block, /android:exported="false"/, provider);
    assert.match(block, /APPWIDGET_UPDATE/, provider);
    assert.match(block, /android:resource="@xml\/us_widget_\w+_info"/, provider);
    assert.ok(fs.existsSync(path.join(ROOT, JAVA, `${provider}.java`)), provider);
  }
  assert.equal((manifest.match(/android:exported="true"/g) || []).length, 0);
  assert.match(manifest, /UsWidgetSystemReceiver"\s+android:exported="false"/);
  for (const info of ['think', 'countdown', 'noi', 'photo']) {
    const xml = read(`${PLUGIN}/res/xml/us_widget_${info}_info.xml`);
    assert.match(xml, /android:updatePeriodMillis="3600000"/);
    assert.match(xml, /android:widgetCategory="home_screen"/);
  }
  assert.match(read(`${PLUGIN}/res/xml/us_widget_noi_info.xml`), /android:targetCellHeight="1"/);
  assert.match(read(`${PLUGIN}/res/xml/us_widget_think_info.xml`), /android:targetCellHeight="2"/);
});

test('ogni risorsa e ogni R.* referenziati esistono (regressione aapt senza Gradle)', () => {
  const res = path.join(ROOT, PLUGIN, 'res');
  const files = fs.readdirSync(res, { recursive: true }).map(String);
  const names = (type) => new Set(files.filter((file) => file.split(path.sep)[0].startsWith(type)).map((file) => path.basename(file).replace(/\.(xml|png|webp)$/, '')));
  const strings = new Set([...read(`${PLUGIN}/res/values/strings.xml`).matchAll(/<string name="(\w+)"/g)].map((m) => m[1]));
  const colors = new Set([...read(`${PLUGIN}/res/values/colors.xml`).matchAll(/<color name="(\w+)"/g)].map((m) => m[1]));
  const known = { drawable: names('drawable'), layout: names('layout'), xml: names('xml'), string: strings, color: colors };
  const xmlSources = [`${PLUGIN}/AndroidManifest.xml`, ...files.filter((file) => file.endsWith('.xml')).map((file) => `${PLUGIN}/res/${file}`)];
  const missing = [];
  for (const file of xmlSources) {
    for (const [, type, name] of read(file).matchAll(/@(drawable|layout|xml|string|color)\/(\w+)/g)) {
      if (!known[type].has(name)) missing.push(`${file}: @${type}/${name}`);
    }
  }
  const ids = new Set(xmlSources.flatMap((file) => [...read(file).matchAll(/@\+id\/(\w+)/g)].map((m) => m[1])));
  for (const file of fs.readdirSync(path.join(ROOT, JAVA))) {
    for (const [, type, name] of read(`${JAVA}/${file}`).matchAll(/\bR\.(id|layout|drawable|string|color)\.(\w+)/g)) {
      if (!(type === 'id' ? ids : known[type]).has(name)) missing.push(`${file}: R.${type}.${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('plugin: niente Supabase client o session token, storage privato non-backup, MainActivity invariata', () => {
  const sources = fs.readdirSync(path.join(ROOT, JAVA)).map((file) => read(`${JAVA}/${file}`)).join('\n');
  assert.doesNotMatch(sources, /OkHttp|io\.supabase|createClient|accessToken|refreshToken|access_token|refresh_token/);
  assert.match(read(`${JAVA}/UsWidgetStore.java`), /getNoBackupFilesDir\(\)/);
  assert.match(read(`${JAVA}/UsWidgetStore.java`), /new AtomicFile/);
  assert.match(read(`${JAVA}/UsWidgetCredentialStore.java`), /AndroidKeyStore/);
  assert.ok(!fs.existsSync(path.join(ROOT, JAVA, 'UsWidgetSnapshotStore.java')));
  const appManifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(appManifest, /android:allowBackup="false"/);
  assert.match(appManifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.match(read('android/app/src/main/res/xml/data_extraction_rules.xml'), /<cloud-backup>[\s\S]*<exclude domain="root"/);
  assert.equal(read('android/app/src/main/java/com/usapp/us/MainActivity.java').replace(/\r\n/g, '\n').trim(), 'package com.usapp.us;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}');
});

test('nessun Stories o Scriptable risorge nel layer widget', () => {
  const sources = [
    ...fs.readdirSync(path.join(ROOT, JAVA)).map((file) => read(`${JAVA}/${file}`)),
    read('widgets.js'), read('widget-hub.js')
  ].join('\n');
  assert.doesNotMatch(sources, /stories|scriptable/i);
});

test('derivative widget sono byte-identiche agli APPROVED e il sync è deterministico', () => {
  execFileSync(process.execPath, ['scripts/sync-approved-widget-assets.mjs'], { cwd: ROOT });
  const firstIcon = sha256(`${PLUGIN}/res/drawable-nodpi/us_icon_ti_penso_v1.png`);
  const firstWordmark = sha256(`${PLUGIN}/res/drawable-nodpi/us_wordmark_v1.png`);
  execFileSync(process.execPath, ['scripts/sync-approved-widget-assets.mjs'], { cwd: ROOT });
  assert.equal(firstIcon, sha256('assets/source/ui/us-icon-ti-penso-v1.png'));
  assert.equal(firstWordmark, sha256('assets/source/brand/us-wordmark-v1.png'));
  assert.equal(firstIcon, sha256(`${PLUGIN}/res/drawable-nodpi/us_icon_ti_penso_v1.png`));
  assert.equal(firstWordmark, sha256(`${PLUGIN}/res/drawable-nodpi/us_wordmark_v1.png`));
});

test('Impostazioni native: la riga Stories rimossa dal bundle non rompe l’idratazione', () => {
  const settings = read('settings.js');
  assert.match(settings, /window\.UsPlatform\?\.isNative\?Promise\.resolve\(\{count:0\}\):sb\.from\('stories'\)/);
  assert.match(settings, /const archiveValue=\$\('usStoryArchiveValue'\);if\(archiveValue\)/);
  assert.doesNotMatch(settings, /\$\('usStoryArchiveValue'\)\.textContent/);
  assert.match(read('scripts/build-capacitor-web.mjs'), /data-us-setting=\["'\]story-archive/);
});
