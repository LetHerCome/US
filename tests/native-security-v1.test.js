// Native Security V1 — device-local biometric app lock.
// app-lock.js runs in a vm with a fake DOM and a mocked native UsAppLock
// plugin; the native sources and build wiring are checked as contracts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PLUGIN = 'native-plugins/us-app-lock';
const USER = 'f1f1f1f1-0000-4000-8000-000000000001';
const OTHER = 'b2b2b2b2-0000-4000-8000-000000000002';

async function sha256(value) {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('hex');
}

// ---- tiny DOM -------------------------------------------------------------

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...names) { names.forEach((n) => this.set.add(n)); }
  remove(...names) { names.forEach((n) => this.set.delete(n)); }
  contains(name) { return this.set.has(name); }
  toggle(name, force) { const on = force ?? !this.set.has(name); if (on) this.set.add(name); else this.set.delete(name); return on; }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.nodeType = 1;
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = {};
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.focused = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn({})); }
  focus() { this.focused = true; }
}

function makeDom() {
  const ids = ['usAppLock', 'usAppLockTitle', 'usAppLockCopy', 'usAppLockPrimary', 'usAppLockSecondary', 'usAppLockStatus'];
  const nodes = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const app = new FakeElement('app');
  const auth = new FakeElement('authOverlay');
  const body = new FakeElement('body');
  body.children = [nodes.get('usAppLock'), auth, app];
  const html = new FakeElement('html');
  html.classList.add('us-app-lock-pending');
  const docListeners = {};
  const document = {
    readyState: 'complete',
    hidden: false,
    documentElement: html,
    body,
    getElementById: (id) => nodes.get(id) || null,
    addEventListener: (type, fn) => (docListeners[type] ||= []).push(fn),
    removeEventListener: (type, fn) => { docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn); }
  };
  return { document, html, body, app, auth, nodes, docListeners };
}

// ---- mocked native plugin -------------------------------------------------

function nativeStatus({ enabled = false, ownerHash = '', state = enabled ? 'ok' : 'off', locked = enabled, kind = 'fingerprint', reason = 'ok' } = {}) {
  return {
    platform: 'android',
    biometry: { available: reason === 'ok', kind, reason },
    protection: { enabled, ownerHash, state },
    locked,
    graceMs: 60000
  };
}

function nativeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function makePlugin(initial, behaviour = {}) {
  const calls = [];
  const listeners = {};
  let current = initial;
  const plugin = {
    calls,
    listeners,
    get current() { return current; },
    set current(value) { current = value; },
    async getStatus() {
      calls.push(['getStatus']);
      if (behaviour.getStatus) return behaviour.getStatus();
      return current;
    },
    async unlock(options) {
      calls.push(['unlock', options]);
      const next = behaviour.unlock ? await behaviour.unlock(options) : null;
      if (next instanceof Error) throw next;
      current = { ...current, locked: false };
      return current;
    },
    async enable(options) {
      calls.push(['enable', options]);
      const next = behaviour.enable ? await behaviour.enable(options) : null;
      if (next instanceof Error) throw next;
      current = nativeStatus({ enabled: true, ownerHash: options.ownerHash, locked: false, kind: current.biometry.kind });
      return current;
    },
    async disable(options) {
      calls.push(['disable', options]);
      const next = behaviour.disable ? await behaviour.disable(options) : null;
      if (next instanceof Error) throw next;
      current = nativeStatus({ enabled: false, kind: current.biometry.kind });
      return current;
    },
    async reset() {
      calls.push(['reset']);
      current = nativeStatus({ enabled: false, kind: current.biometry.kind });
      return current;
    },
    async releaseCover() { calls.push(['releaseCover']); },
    addListener(name, fn) { listeners[name] = fn; return Promise.resolve({ remove() {} }); }
  };
  return plugin;
}

function loadAppLock({ plugin = null, native = Boolean(plugin), profileId = USER, timeoutMs } = {}) {
  const dom = makeDom();
  const sandbox = {
    console: { warn() {}, info() {} },
    document: dom.document,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    Promise,
    setTimeout,
    clearTimeout,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent: () => true,
    usProfile: profileId ? { id: profileId } : null,
    location: { reloads: 0, reload() { this.reloads += 1; } },
    UsPlatform: {
      isNative: native,
      isPluginAvailable: (name) => Boolean(plugin) && name === 'UsAppLock',
      getNativePlugin: (name) => (plugin && name === 'UsAppLock' ? plugin : null)
    }
  };
  if (timeoutMs) sandbox.__US_APP_LOCK_STATUS_TIMEOUT_MS__ = timeoutMs;
  sandbox.window = sandbox;
  vm.runInContext(read('app-lock.js'), vm.createContext(sandbox), { filename: 'app-lock.js' });
  return { lock: sandbox.UsAppLock, sandbox, ...dom };
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function settle(times = 6) { for (let i = 0; i < times; i += 1) await tick(); }

function hooks(env, { verdict = 'valid', destroy = true } = {}) {
  const order = [];
  env.lock.configure({
    verifySession: async () => { order.push('verify'); return verdict; },
    accountLogin: async () => { order.push('destroy-session'); return destroy; },
    reload: () => order.push('reload')
  });
  return order;
}

// ---- JS domain ------------------------------------------------------------

test('N1 web/PWA: senza plugin nativo il lock non esiste e gate apre subito', async () => {
  const env = loadAppLock({ plugin: null, native: false });
  assert.equal(env.lock.supported(), false);
  assert.equal(await env.lock.gate({ userId: USER }), 'open');
  assert.equal(env.html.classList.contains('us-app-lock-pending'), false, 'nessuno schermo di protezione fuori dalla app nativa');
  assert.deepEqual({ ...(await env.lock.settingState()) }, { visible: false });
});

test('N1 biometria OFF: US si apre come prima, senza prompt', async () => {
  const plugin = makePlugin(nativeStatus({ enabled: false }));
  const env = loadAppLock({ plugin });
  hooks(env);
  assert.equal(await env.lock.gate({ userId: USER }), 'open');
  assert.equal(env.html.classList.contains('us-app-lock-pending'), false);
  assert.equal(env.html.classList.contains('us-app-locked'), false);
  assert.equal(plugin.calls.some(([name]) => name === 'unlock'), false);
});

test('N1 biometria ON: lock prima di qualsiasi contenuto privato, poi sblocco riuscito', async () => {
  const owner = await sha256(USER);
  let releaseUnlock;
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }), {
    unlock: () => new Promise((resolve) => { releaseUnlock = resolve; })
  });
  const env = loadAppLock({ plugin });
  const order = hooks(env);
  assert.equal(env.html.classList.contains('us-app-lock-pending'), true, 'lo shell nativo parte coperto');
  let result = null;
  env.lock.gate({ userId: USER }).then((value) => { result = value; });
  await settle();
  assert.equal(env.html.classList.contains('us-app-locked'), true);
  assert.equal(env.app.getAttribute('inert'), '', 'il contenuto privato non è interagibile');
  assert.equal(env.auth.getAttribute('inert'), '');
  assert.equal(env.nodes.get('usAppLock').getAttribute('inert'), null, 'il lock stesso resta usabile');
  assert.equal(env.nodes.get('usAppLock').dataset.mode, 'locked');
  assert.equal(env.nodes.get('usAppLockPrimary').textContent, 'Sblocca con l’impronta');
  assert.equal(result, null, 'initCloud resta fermo finché non si sblocca');
  assert.equal(env.nodes.get('usAppLockPrimary').disabled, true, 'nessun secondo prompt mentre il primo è aperto');
  assert.equal(env.nodes.get('usAppLockSecondary').disabled, false, 'l’accesso con account resta sempre raggiungibile');
  const unlockCall = plugin.calls.find(([name]) => name === 'unlock');
  assert.ok(unlockCall, 'il prompt parte da solo');
  assert.equal(unlockCall[1].title, 'Sblocca con l’impronta');
  releaseUnlock();
  await settle();
  assert.equal(result, 'open');
  assert.equal(env.html.classList.contains('us-app-locked'), false);
  assert.equal(env.app.getAttribute('inert'), null);
  assert.deepEqual(order, ['verify'], 'la sessione Supabase viene ricontrollata, nessuna uscita');
  assert.ok(plugin.calls.some(([name]) => name === 'releaseCover'));
});

test('N1 annulla e riconoscimento fallito: resta bloccata, nessun accesso', async () => {
  const owner = await sha256(USER);
  const outcomes = [nativeError('cancelled'), nativeError('failed')];
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }), { unlock: () => outcomes.shift() || null });
  const env = loadAppLock({ plugin });
  hooks(env);
  let result = null;
  env.lock.gate({ userId: USER }).then((value) => { result = value; });
  await settle();
  assert.equal(result, null);
  assert.equal(env.lock._state().phase, 'locked');
  assert.equal(env.nodes.get('usAppLockStatus').textContent, '', 'annullare non mostra errori');
  env.nodes.get('usAppLockPrimary').click();
  await settle();
  assert.equal(result, null);
  assert.equal(env.nodes.get('usAppLockStatus').textContent, 'Non riconosciuto. Riprova.');
  env.nodes.get('usAppLockPrimary').click();
  await settle();
  assert.equal(result, 'open');
});

test('N1 lockout temporaneo e permanente: messaggio chiaro e uscita sicura via account', async () => {
  const owner = await sha256(USER);
  const outcomes = [nativeError('lockout'), nativeError('lockout_permanent')];
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }), { unlock: () => outcomes.shift() || null });
  const env = loadAppLock({ plugin });
  hooks(env);
  env.lock.gate({ userId: USER });
  await settle();
  assert.match(env.nodes.get('usAppLockStatus').textContent, /Troppi tentativi/);
  env.nodes.get('usAppLockPrimary').click();
  await settle();
  assert.equal(env.nodes.get('usAppLock').dataset.mode, 'account');
  assert.equal(env.nodes.get('usAppLockPrimary').textContent, 'Accedi con email e password');
  assert.equal(env.nodes.get('usAppLockSecondary').hidden, true);
});

test('N1 fallback "Usa l’accesso con account": prima distrugge la sessione, poi il record, poi login', async () => {
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }), { unlock: () => nativeError('cancelled') });
  const env = loadAppLock({ plugin });
  const order = hooks(env);
  let result = null;
  env.lock.gate({ userId: USER }).then((value) => { result = value; });
  await settle();
  env.nodes.get('usAppLockSecondary').click();
  assert.equal(env.nodes.get('usAppLock').dataset.mode, 'confirm');
  assert.match(env.nodes.get('usAppLockCopy').textContent, /email e password/);
  env.nodes.get('usAppLockSecondary').click();
  assert.equal(env.nodes.get('usAppLock').dataset.mode, 'locked', 'Annulla torna al lock');
  env.nodes.get('usAppLockSecondary').click();
  const resetBefore = plugin.calls.filter(([name]) => name === 'reset').length;
  env.nodes.get('usAppLockPrimary').click();
  await settle();
  assert.equal(resetBefore, 0);
  assert.deepEqual(order.filter((step) => step !== 'verify'), ['destroy-session', 'reload']);
  assert.ok(plugin.calls.some(([name]) => name === 'reset'), 'record di protezione rimosso dopo la sessione');
  assert.equal(result, 'account-login');
});

test('N1 fallback fallito (sessione non distrutta): il record non viene toccato e resta bloccata', async () => {
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }), { unlock: () => nativeError('cancelled') });
  const env = loadAppLock({ plugin });
  const order = hooks(env, { destroy: false });
  env.lock.gate({ userId: USER });
  await settle();
  env.nodes.get('usAppLockSecondary').click();
  env.nodes.get('usAppLockPrimary').click();
  await settle();
  assert.equal(plugin.calls.some(([name]) => name === 'reset'), false);
  assert.equal(order.includes('reload'), false);
  assert.equal(env.lock._state().phase, 'locked');
  assert.match(env.nodes.get('usAppLockStatus').textContent, /Non riesco a uscire/);
});

test('N1 sessione scaduta o revocata: la biometria non resuscita nulla, si va al login', async () => {
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }));
  const env = loadAppLock({ plugin });
  const order = hooks(env, { verdict: 'invalid' });
  let result = null;
  env.lock.gate({ userId: USER }).then((value) => { result = value; });
  await settle(10);
  assert.equal(result, 'account-login');
  assert.ok(order.includes('destroy-session'));
  assert.ok(order.includes('reload'));
  assert.equal(env.html.classList.contains('us-app-locked'), false);
});

test('N1 offline: una sessione locale ancora valida può aprirsi dopo la biometria', async () => {
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }));
  const env = loadAppLock({ plugin });
  hooks(env, { verdict: 'valid' });
  assert.equal(await env.lock.gate({ userId: USER }), 'open');
});

test('N1 verifica sessione indeterminata: dopo la biometria resta bloccata', async () => {
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }));
  const env = loadAppLock({ plugin });
  hooks(env, { verdict: 'unknown' });
  let result = null;
  env.lock.gate({ userId: USER }).then((value) => { result = value; });
  await settle(10);
  assert.equal(result, null);
  assert.equal(env.lock._state().phase, 'locked');
  assert.equal(env.nodes.get('usAppLock').dataset.mode, 'error');
  assert.equal(env.nodes.get('usAppLockPrimary').textContent, 'Riprova');
});

test('N1 biometria cambiata (nuova impronta / Face ID): solo accesso con account', async () => {
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }), { unlock: () => nativeError('invalidated') });
  const env = loadAppLock({ plugin });
  hooks(env);
  env.lock.gate({ userId: USER });
  await settle();
  assert.equal(env.nodes.get('usAppLock').dataset.mode, 'account');
  assert.match(env.nodes.get('usAppLockCopy').textContent, /biometria di questo telefono è cambiata/);

  const env2 = loadAppLock({ plugin: makePlugin(nativeStatus({ enabled: true, ownerHash: owner, state: 'invalidated' })) });
  hooks(env2);
  env2.lock.gate({ userId: USER });
  await settle();
  assert.equal(env2.nodes.get('usAppLock').dataset.mode, 'account', 'stato già invalidato al boot');
});

test('N1 record nativo corrotto: fail closed con recupero tramite email e password', async () => {
  const plugin = makePlugin({ ...nativeStatus({ enabled: true }), protection: { enabled: true, ownerHash: 'zzz', state: 'ok' } });
  const env = loadAppLock({ plugin });
  const order = hooks(env);
  let result = null;
  env.lock.gate({ userId: USER }).then((value) => { result = value; });
  await settle();
  assert.equal(result, null);
  assert.equal(env.nodes.get('usAppLock').dataset.mode, 'account');
  assert.equal(plugin.calls.some(([name]) => name === 'unlock'), false);
  env.nodes.get('usAppLockPrimary').click();
  await settle();
  assert.deepEqual(order, ['destroy-session', 'reload']);
  assert.equal(result, 'account-login');
});

test('N1 bridge nativo che non risponde: nessuna apertura silenziosa, Riprova o account', async () => {
  let fail = true;
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner, locked: false }), {
    getStatus: () => (fail ? new Promise(() => {}) : plugin.current)
  });
  const env = loadAppLock({ plugin, timeoutMs: 30 });
  hooks(env);
  let result = null;
  env.lock.gate({ userId: USER }).then((value) => { result = value; });
  await tick(60);
  await settle();
  assert.equal(result, null);
  assert.equal(env.nodes.get('usAppLock').dataset.mode, 'error');
  assert.equal(env.nodes.get('usAppLockPrimary').textContent, 'Riprova');
  fail = false;
  env.nodes.get('usAppLockPrimary').click();
  await settle(10);
  assert.equal(result, 'open', 'stato nativo letto: locked=false, nessun nuovo prompt');
});

test('N1 un altro account su questo telefono non eredita la protezione', async () => {
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: await sha256(OTHER) }));
  const env = loadAppLock({ plugin });
  hooks(env);
  assert.equal(await env.lock.gate({ userId: USER }), 'open');
  assert.ok(plugin.calls.some(([name]) => name === 'reset'));
  assert.equal(plugin.calls.some(([name]) => name === 'unlock'), false);
});

test('N1 nessuna sessione (logout/scadenza): protezione rimossa, si vede solo il login', async () => {
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: await sha256(USER) }));
  const env = loadAppLock({ plugin });
  hooks(env);
  await env.lock.signedOut();
  assert.ok(plugin.calls.some(([name]) => name === 'reset'));
  assert.equal(env.html.classList.contains('us-app-lock-pending'), false, 'il login è visibile');
  assert.equal(env.html.classList.contains('us-app-locked'), false);
  assert.equal(plugin.calls.some(([name]) => name === 'unlock'), false);
});

test('N1 ciclo di vita: rientro dopo il periodo di grazia → lock, poi sblocco', async () => {
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner, locked: false }));
  const env = loadAppLock({ plugin });
  const order = hooks(env);
  assert.equal(await env.lock.gate({ userId: USER }), 'open', 'stesso processo già sbloccato: niente prompt');
  assert.equal(plugin.calls.filter(([name]) => name === 'unlock').length, 0);
  plugin.current = { ...plugin.current, locked: true };
  plugin.listeners.lockRequired({ reason: 'background' });
  await settle(10);
  assert.equal(plugin.calls.filter(([name]) => name === 'unlock').length, 1);
  assert.equal(env.html.classList.contains('us-app-locked'), false, 'sbloccata di nuovo dopo il prompt');
  assert.ok(order.includes('verify'));
  assert.ok(plugin.calls.some(([name]) => name === 'releaseCover'));
});

test('N1 ciclo di vita: lockRequired con protezione spenta rilascia solo la copertura', async () => {
  const plugin = makePlugin(nativeStatus({ enabled: false }));
  const env = loadAppLock({ plugin });
  hooks(env);
  await env.lock.gate({ userId: USER });
  plugin.listeners.lockRequired({ reason: 'background' });
  await settle();
  assert.equal(env.html.classList.contains('us-app-locked'), false);
  assert.ok(plugin.calls.some(([name]) => name === 'releaseCover'));
});

test('N1 prompt rimandato finché la app non è visibile', async () => {
  const owner = await sha256(USER);
  const plugin = makePlugin(nativeStatus({ enabled: true, ownerHash: owner }));
  const env = loadAppLock({ plugin });
  hooks(env);
  env.document.hidden = true;
  env.lock.gate({ userId: USER });
  await settle();
  assert.equal(plugin.calls.filter(([name]) => name === 'unlock').length, 0);
  env.document.hidden = false;
  env.docListeners.visibilitychange.forEach((fn) => fn());
  await settle();
  assert.equal(plugin.calls.filter(([name]) => name === 'unlock').length, 1);
});

test('N1 Impostazioni: OFF di default, attivazione con biometria, preferenza solo locale', async () => {
  const plugin = makePlugin(nativeStatus({ enabled: false, kind: 'faceId' }));
  const env = loadAppLock({ plugin });
  const before = await env.lock.settingState();
  assert.deepEqual({ ...before }, { visible: true, enabled: false, available: true, label: 'Proteggi US con Face ID', detail: 'Solo su questo telefono' });
  const result = await env.lock.enable();
  assert.equal(result.ok, true);
  const enableCall = plugin.calls.find(([name]) => name === 'enable');
  assert.equal(enableCall[1].ownerHash, await sha256(USER), 'solo un hash dell’id, mai credenziali');
  assert.deepEqual(Object.keys(enableCall[1]).sort(), ['cancel', 'fallback', 'ownerHash', 'title']);
  assert.equal((await env.lock.settingState()).enabled, true);
  const off = await env.lock.disable();
  assert.equal(off.ok, true);
  assert.ok(plugin.calls.some(([name]) => name === 'disable'), 'disattivare passa dalla verifica nativa');
});

test('N1 Impostazioni: annullare l’attivazione la lascia spenta', async () => {
  const plugin = makePlugin(nativeStatus({ enabled: false }), { enable: () => nativeError('cancelled') });
  const env = loadAppLock({ plugin });
  assert.deepEqual({ ...(await env.lock.enable()) }, { ok: false, code: 'cancelled' });
  assert.equal((await env.lock.settingState()).enabled, false);
});

test('N1 capability: non supportata nascosta, non configurata spiegata, Android impronta', async () => {
  const unsupported = loadAppLock({ plugin: makePlugin(nativeStatus({ reason: 'unsupported', kind: 'none' })) });
  assert.equal((await unsupported.lock.settingState()).visible, false);
  const notEnrolled = loadAppLock({ plugin: makePlugin(nativeStatus({ reason: 'not_enrolled' })) });
  const state = await notEnrolled.lock.settingState();
  assert.equal(state.visible, true);
  assert.equal(state.available, false);
  assert.match(state.detail, /impostazioni del telefono/);
  const touch = loadAppLock({ plugin: makePlugin(nativeStatus({ kind: 'touchId' })) });
  assert.equal((await touch.lock.settingState()).label, 'Proteggi US con Touch ID');
  assert.equal(touch.lock.labels.unlockLabel('biometric'), 'Sblocca');
  const weird = loadAppLock({ plugin: makePlugin({ biometry: { available: 'yes', kind: '<img>', reason: 'x' }, protection: {} }) });
  const weirdState = await weird.lock.settingState();
  assert.equal(weirdState.available, false, 'valori nativi inattesi = non disponibile');
  assert.equal(weirdState.label, 'Proteggi US con la biometria');
});

test('N1 senza profilo non si può attivare la protezione', async () => {
  const plugin = makePlugin(nativeStatus({ enabled: false }));
  const env = loadAppLock({ plugin, profileId: null });
  assert.deepEqual({ ...(await env.lock.enable()) }, { ok: false, code: 'invalid_argument' });
  assert.equal(plugin.calls.some(([name]) => name === 'enable'), false);
});

// ---- wiring and native contracts -------------------------------------------

test('N1 app.js: gate dopo la sessione e prima di profilo/foto; login senza sessione azzera il lock', () => {
  const app = read('app.js');
  const gate = app.indexOf('window.UsAppLock.gate({userId:session.user.id})');
  const noSession = app.indexOf('if(!session){\n      // No session on this phone');
  const cachedPaint = app.indexOf('if(cachedProfile){\n      resetNoiIdeasForIdentityChange();');
  const profileFetch = app.indexOf(".from('profiles')\n      .select('id,display_name,role,couple_id,avatar_path')");
  assert.ok(gate > 0 && noSession > gate && cachedPaint > noSession && profileFetch > cachedPaint);
  assert.match(app, /await window\.UsAppLock\?\.signedOut\?\.\(\)/);
  assert.match(app, /window\.UsAppLock\?\.configure\?\.\(\{verifySession:usVerifySessionForAppLock,accountLogin:usAppLockAccountLogin\}\)/);
  assert.match(app, /sb\.auth\.getUser\(\)/, 'la sessione viene verificata sul server quando online');
  assert.match(app, /session\.expires_at/, 'anche offline una sessione localmente scaduta non può aprire US');
  assert.match(app, /if\(!navigator\.onLine\)return 'valid'/, 'offline è ammesso solo dopo il controllo locale di scadenza');
  assert.match(app, /sb\.auth\.signOut\(\{scope:'local'\}\)/, 'il fallback non scollega gli altri dispositivi');
  assert.doesNotMatch(app, /signInWithOtp|magiclink|signInWithIdToken/i, 'nessun OTP/magic-link reintrodotto');
  assert.match(app, /signInWithPassword/, 'email + password resta l’accesso');
});

test('N1 settings: riga locale, logout rimuove la protezione solo dopo signOut', () => {
  const settings = read('settings.js');
  const html = read('index.html');
  assert.match(html, /data-us-setting="app-lock" id="usAppLockSetting" role="switch" aria-checked="false" hidden/);
  assert.match(settings, /if\(name==='app-lock'\)return toggleAppLock\(\);/);
  const signOut = settings.indexOf('const {error}=await sb.auth.signOut();');
  const reset = settings.indexOf('await window.UsAppLock?.reset?.()');
  assert.ok(signOut > 0 && reset > signOut);
  assert.doesNotMatch(settings, /app[_-]lock[^\n]*(sb\.from|sb\.rpc)/i, 'mai una preferenza di coppia sul server');
  assert.doesNotMatch(read('app-lock.js'), /localStorage|indexedDB|sessionStorage/, 'nessuno stato di sicurezza in storage web');
});

test('N1 HTML/CSS: lo shield copre tutto e il lock sta sopra ogni layer', () => {
  const html = read('index.html');
  const css = read('app-lock.css');
  const body = html.indexOf('<body>');
  assert.ok(html.indexOf('id="usAppLock"') > body && html.indexOf('id="usAppLock"') < html.indexOf('id="authOverlay"'));
  assert.ok(html.indexOf('href="/app-lock.css') < body, 'CSS del lock bloccante nel head');
  assert.ok(html.indexOf('src="/app-lock.js') > html.indexOf('src="/platform.js') && html.indexOf('src="/app-lock.js') < html.indexOf('src="/app.js'));
  assert.match(css, /html\.us-app-lock-pending body > :not\(#usAppLock\),\s*html\.us-app-locked body > :not\(#usAppLock\)\{\s*visibility:hidden!important;/);
  assert.match(read('ui-foundation.css'), /--us-layer-app-lock:2147483000;/);
  const build = read('scripts/build-capacitor-web.mjs');
  assert.match(build, /<html lang="it" class="us-app-lock-pending">/);
  for (const file of ['scripts/build-capacitor-web.mjs', 'scripts/build-cloudflare-pages.mjs']) {
    assert.match(read(file), /'app-lock\.js',\n  'app-lock\.css',/);
  }
  assert.match(read('service-worker.js'), /versioned\("\/app-lock\.js"\),\n  versioned\("\/app-lock\.css"\),/);
});

test('N1 Android: BiometricPrompt forte + Keystore, nessuna API deprecata, identità invariata', () => {
  const dir = `${PLUGIN}/android/src/main/java/com/usapp/applock`;
  const plugin = read(`${dir}/UsAppLockPlugin.java`);
  const store = read(`${dir}/UsAppLockStore.java`);
  assert.match(plugin, /@CapacitorPlugin\(name = "UsAppLock"\)/);
  assert.match(plugin, /BiometricManager\.Authenticators\.BIOMETRIC_STRONG/);
  assert.match(plugin, /new BiometricPrompt\.CryptoObject\(cipher\)/);
  assert.match(plugin, /KeyPermanentlyInvalidatedException/);
  assert.match(plugin, /setRecentsScreenshotEnabled\(!protectedNow\)/);
  assert.doesNotMatch(plugin + store, /FingerprintManager|FLAG_SECURE|EncryptedSharedPreferences|USE_FINGERPRINT/);
  assert.match(store, /"AndroidKeyStore"/);
  assert.match(store, /setUserAuthenticationRequired\(true\)/);
  assert.match(store, /setInvalidatedByBiometricEnrollment\(true\)/);
  assert.match(store, /AUTH_BIOMETRIC_STRONG/);
  assert.doesNotMatch(store, /setUserAuthenticationValidityDurationSeconds/, 'API deprecata evitata');
  assert.doesNotMatch(plugin + store, /refresh_token|access_token|password/i, 'il plugin non tocca credenziali');
  assert.match(read(`${PLUGIN}/android/build.gradle`), /androidx\.biometric:biometric:1\.1\.0/);
  assert.match(read(`${PLUGIN}/android/src/main/AndroidManifest.xml`), /android\.permission\.USE_BIOMETRIC/);
  const app = read('android/app/build.gradle');
  assert.match(app, /applicationId "com\.usapp\.us"/);
  assert.match(app, /namespace = "com\.usapp\.us"/);
  assert.match(read('android/app/src/main/java/com/usapp/us/MainActivity.java'), /public class MainActivity extends BridgeActivity \{\}/);
  assert.match(read('android/capacitor.settings.gradle'), /include ':us-app-lock'\nproject\(':us-app-lock'\)\.projectDir = new File\('\.\.\/native-plugins\/us-app-lock\/android'\)/);
  assert.match(read('android/app/capacitor.build.gradle'), /implementation project\(':us-app-lock'\)/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:allowBackup="false"/);
});

test('N1 Android: la firma permanente e la pipeline di update restano intatte', () => {
  const app = read('android/app/build.gradle');
  assert.match(app, /signingValue\('US_ANDROID_KEYSTORE_PATH', 'storeFile'\)/);
  assert.match(app, /signingConfig signingConfigs\.internal/);
  const release = read('.github/workflows/android-internal-release.yml');
  assert.match(release, /branches: \[main\]/);
  const ci = read('.github/workflows/android-native-ci.yml');
  assert.match(ci, /branches-ignore: \[main\]/);
  assert.doesNotMatch(ci, /secrets\./, 'la CI di validazione non usa segreti');
  assert.doesNotMatch(ci, /US_ANDROID_KEYSTORE|ANDROID_SIGNING|signingConfig|apksigner/);
  assert.match(ci, /testDebugUnitTest assembleDebug assembleRelease/);
  assert.match(ci, /"applicationId": "com\.usapp\.us"/);
});

test('N1 iOS: LocalAuthentication + Keychain solo su questo dispositivo, Face ID dichiarato', () => {
  const dir = `${PLUGIN}/ios/Sources/UsAppLockPlugin`;
  const plugin = read(`${dir}/UsAppLockPlugin.swift`);
  const keychain = read(`${dir}/UsAppLockKeychain.swift`);
  const policy = read(`${dir}/UsAppLockPolicy.swift`);
  assert.match(plugin, /@objc\(UsAppLockPlugin\)/);
  assert.match(plugin, /public let jsName = "UsAppLock"/);
  assert.match(plugin, /\.deviceOwnerAuthenticationWithBiometrics/);
  assert.doesNotMatch(plugin, /\.deviceOwnerAuthentication[^W]/, 'niente codice del telefono come scorciatoia');
  assert.match(plugin, /UIApplication\.didEnterBackgroundNotification/);
  assert.match(plugin, /clock_gettime_nsec_np\(CLOCK_MONOTONIC\)/);
  assert.match(keychain, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/);
  assert.match(keychain, /return \.record\(\.corrupted\)/, 'un item Keychain presente ma illeggibile non può disattivare il lock');
  assert.doesNotMatch(keychain, /kSecAttrSynchronizable/);
  assert.match(policy, /graceMilliseconds: UInt64 = 60_000/);
  for (const source of [plugin, keychain, policy]) {
    assert.doesNotMatch(source, /refresh_token|access_token|auth-token/i);
    assert.doesNotMatch(source, /UserDefaults/, 'nessuna preferenza di sicurezza in chiaro');
  }
  // Capacitor registers every Swift file carrying @objc(Name) as a plugin class.
  assert.doesNotMatch(keychain + policy, /@objc\(/);
  const plist = read('ios/App/App/Info.plist');
  assert.match(plist, /<key>NSFaceIDUsageDescription<\/key>\s*<string>US usa Face ID[^<]+<\/string>/);
  const swiftPackage = read('ios/App/CapApp-SPM/Package.swift');
  assert.match(swiftPackage, /\.package\(name: "UsAppLock", path: "\.\.\/\.\.\/\.\.\/native-plugins\/us-app-lock"\)/);
  assert.match(swiftPackage, /\.product\(name: "UsAppLock", package: "UsAppLock"\)/);
  const pkg = read(`${PLUGIN}/Package.swift`);
  assert.match(pkg, /name: "UsAppLock"/);
  assert.match(pkg, /path: "ios\/Sources\/UsAppLockPlugin"/);
  assert.equal(fs.readdirSync(path.join(ROOT, 'ios/App/App')).filter((name) => name.endsWith('.entitlements')).length, 0, 'il Keychain dell’app non richiede entitlement');
  const workflow = read('.github/workflows/ios-native.yml');
  assert.match(workflow, /swiftc native-plugins\/us-app-lock\/ios\/Sources\/UsAppLockPlugin\/UsAppLockPolicy\.swift/);
});

test('N1 politica condivisa: 60 s di grazia identici su Android, iOS e documentazione', () => {
  assert.match(read(`${PLUGIN}/android/src/main/java/com/usapp/applock/UsAppLockPolicy.java`), /GRACE_MS = 60_000L/);
  assert.match(read(`${PLUGIN}/ios/Sources/UsAppLockPlugin/UsAppLockPolicy.swift`), /graceMilliseconds: UInt64 = 60_000/);
  const doc = read('docs/native/NATIVE_SECURITY_V1.md');
  assert.match(doc, /60 s/);
  assert.match(doc, /email \+ password/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@us/app-lock'], 'file:native-plugins/us-app-lock');
  const plugin = JSON.parse(read(`${PLUGIN}/package.json`));
  assert.deepEqual(Object.keys(plugin.capacitor).sort(), ['android', 'ios']);
});
