const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://us.example.test';
const CURRENT_SHELL = 'us-shell-static-runtime-9';

function readRequiredRuntimeFile(name) {
  const file = path.join(ROOT, name);
  assert.ok(fs.existsSync(file), `${name} deve essere un file runtime del repository`);
  return fs.readFileSync(file, 'utf8');
}

function cacheKey(input) {
  if (typeof input === 'string') return new URL(input, ORIGIN).href;
  return input.url;
}

function createServiceWorkerHarness({ failPrecachePath = null } = {}) {
  const source = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const listeners = new Map();
  const cacheBuckets = new Map();
  const deletedCaches = [];
  const notifications = [];
  const openedWindows = [];
  const clientWindows = [];
  const rawApp = 'window.__rawAppFromRepository = true;\n';
  let skipWaitingCalls = 0;
  let claimCalls = 0;
  let networkAvailable = true;

  const responseFor = (input) => {
    if (!networkAvailable) throw new Error('network offline');
    const url = new URL(cacheKey(input));
    if (url.pathname === failPrecachePath) {
      throw new Error(`precache failed for ${url.pathname}`);
    }
    if (url.pathname === '/app.js') {
      return new Response(rawApp, {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' }
      });
    }
    return new Response(`asset:${url.pathname}`, { status: 200 });
  };

  function bucket(name) {
    if (!cacheBuckets.has(name)) cacheBuckets.set(name, new Map());
    return cacheBuckets.get(name);
  }

  const caches = {
    async open(name) {
      const entries = bucket(name);
      return {
        async addAll(paths) {
          const staged = [];
          for (const item of paths) {
            const request = new Request(new URL(item, ORIGIN));
            staged.push([cacheKey(request), responseFor(request)]);
          }
          for (const [key, response] of staged) entries.set(key, response.clone());
        },
        async match(input) {
          return entries.get(cacheKey(input))?.clone();
        },
        async put(input, response) {
          entries.set(cacheKey(input), response.clone());
        },
        async keys() {
          return [...entries.keys()].map((key) => new Request(key));
        },
        async delete(input) {
          return entries.delete(cacheKey(input));
        }
      };
    },
    async match(input) {
      const key = cacheKey(input);
      for (const entries of cacheBuckets.values()) {
        if (entries.has(key)) return entries.get(key).clone();
      }
      return undefined;
    },
    async keys() {
      return [...cacheBuckets.keys()];
    },
    async delete(name) {
      deletedCaches.push(name);
      return cacheBuckets.delete(name);
    }
  };

  const self = {
    location: { origin: ORIGIN },
    registration: {
      async showNotification(title, options) { notifications.push({ title, options }); }
    },
    clients: {
      async claim() { claimCalls += 1; },
      async matchAll() { return clientWindows; },
      async openWindow(url) { openedWindows.push(url); }
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    async skipWaiting() { skipWaitingCalls += 1; }
  };

  const context = vm.createContext({
    self,
    caches,
    fetch: async (input) => responseFor(input),
    URL,
    Request,
    Response,
    console
  });
  vm.runInContext(source, context, { filename: 'service-worker.js' });

  async function dispatchExtendable(type, fields = {}) {
    const waits = [];
    const event = {
      ...fields,
      waitUntil(promise) { waits.push(Promise.resolve(promise)); }
    };
    listeners.get(type)(event);
    await Promise.all(waits);
  }

  async function dispatchFetch(pathname, init = {}) {
    const waits = [];
    let responsePromise;
    const request = init.mode === 'navigate' || init.destination
      ? {
          url: new URL(pathname, ORIGIN).href,
          method: init.method || 'GET',
          mode: init.mode || 'same-origin',
          destination: init.destination || ''
        }
      : new Request(new URL(pathname, ORIGIN), init);
    listeners.get('fetch')({
      request,
      respondWith(promise) { responsePromise = Promise.resolve(promise); },
      waitUntil(promise) { waits.push(Promise.resolve(promise)); }
    });
    assert.ok(responsePromise, `nessuna risposta SW per ${pathname}`);
    const response = await responsePromise;
    await Promise.all(waits);
    return response;
  }

  return {
    rawApp,
    cacheBuckets,
    deletedCaches,
    notifications,
    openedWindows,
    clientWindows,
    dispatchExtendable,
    dispatchFetch,
    setOnline(value) { networkAvailable = value; },
    get skipWaitingCalls() { return skipWaitingCalls; },
    get claimCalls() { return claimCalls; }
  };
}

function createIndexedDbHarness(initialEntries = []) {
  const records = new Map(initialEntries);
  const opens = [];
  let hasStore = false;

  const db = {
    objectStoreNames: { contains: (name) => hasStore && name === 'sessions' },
    createObjectStore(name) {
      assert.equal(name, 'sessions');
      hasStore = true;
    },
    transaction(name, mode) {
      assert.equal(name, 'sessions');
      const transaction = {
        objectStore() {
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = records.has(key) ? records.get(key) : undefined;
                request.onsuccess?.();
              });
              return request;
            },
            put(value, key) {
              records.set(key, value);
              queueMicrotask(() => transaction.oncomplete?.());
            },
            delete(key) {
              records.delete(key);
              queueMicrotask(() => transaction.oncomplete?.());
            }
          };
        }
      };
      assert.ok(mode === 'readonly' || mode === 'readwrite');
      return transaction;
    }
  };

  return {
    records,
    opens,
    indexedDB: {
      open(name, version) {
        opens.push({ name, version });
        const request = {};
        queueMicrotask(() => {
          request.result = db;
          if (!hasStore) request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      }
    }
  };
}

function createAuthStorageContext({ idbEntries = [], localEntries = [] } = {}) {
  const idb = createIndexedDbHarness(idbEntries);
  const local = new Map(localEntries);
  const sandbox = {
    console: { info() {}, warn() {} },
    navigator: { storage: { persist: async () => true } },
    indexedDB: idb.indexedDB,
    supabase: { createClient() {} },
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, value),
      removeItem: (key) => local.delete(key)
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(readRequiredRuntimeFile('auth-storage.js'), context, {
    filename: 'auth-storage.js'
  });
  return { context, idb, local };
}

function createStoriesContext() {
  const effects = { styles: 0, authListeners: 0, documentListeners: 0, windowListeners: 0 };
  const createElement = () => ({
    id: '',
    textContent: '',
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {},
    addEventListener() {},
    appendChild() {}
  });
  const document = {
    hidden: false,
    body: { style: {}, appendChild() {} },
    head: { appendChild() { effects.styles += 1; } },
    getElementById() { return null; },
    querySelector() { return null; },
    createElement,
    addEventListener() { effects.documentListeners += 1; }
  };
  const sandbox = {
    console: { info() {}, warn() {} },
    document,
    navigator: {},
    localStorage: { getItem: () => null, setItem() {} },
    sb: { auth: { onAuthStateChange() { effects.authListeners += 1; } } },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    addEventListener() { effects.windowListeners += 1; }
  };
  sandbox.window = sandbox;
  return { context: vm.createContext(sandbox), effects };
}

test('/app.js viene servito dal service worker senza trasformazioni', async () => {
  const harness = createServiceWorkerHarness();

  await harness.dispatchExtendable('install');
  const response = await harness.dispatchFetch('/app.js');

  assert.equal(await response.text(), harness.rawApp);
});

test('index carica Supabase, auth storage, app e Stories in questo ordine', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);
  const supabaseIndex = sources.findIndex((src) => src.includes('@supabase/supabase-js'));
  const authIndex = sources.findIndex((src) => src.startsWith('/auth-storage.js'));
  const appIndex = sources.findIndex((src) => src.startsWith('/app.js'));
  const storiesIndex = sources.findIndex((src) => src.startsWith('/stories.js'));
  const firstExistingScriptIndex = sources.findIndex((src) => src.startsWith('/fix4.js'));

  assert.ok(supabaseIndex >= 0, 'script Supabase non trovato');
  assert.deepEqual(
    [authIndex, appIndex, storiesIndex, firstExistingScriptIndex],
    [supabaseIndex + 1, supabaseIndex + 2, supabaseIndex + 3, supabaseIndex + 4]
  );
});

test('build marker HTML e version.json restano allineati', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  const build = html.match(/<meta\s+name=["']us-build["']\s+content=["']([^"']+)["']/i)?.[1];

  assert.ok(build, 'build marker HTML non trovato');
  assert.equal(build, version.version);
});

test('Stories si inizializza una sola volta anche se lo script viene eseguito due volte', () => {
  const source = readRequiredRuntimeFile('stories.js');
  const { context, effects } = createStoriesContext();

  vm.runInContext(source, context, { filename: 'stories-legacy-injected.js' });
  vm.runInContext(source, context, { filename: 'stories.js' });

  assert.equal(context.window.__usStoriesV19Installed, true);
  assert.equal(effects.styles, 0);
  assert.equal(effects.authListeners, 1);
  assert.equal(effects.documentListeners, 2);
});

test('pagina mista: il vecchio wrapper auth può caricare il nuovo runtime senza doppie Stories', () => {
  const authSource = readRequiredRuntimeFile('auth-storage.js');
  const storiesSource = readRequiredRuntimeFile('stories.js');
  const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const clientBlock = appSource.match(/const SB_URL[\s\S]*?(?=const US_SIGNED_URL_CACHE)/)?.[0];
  assert.ok(clientBlock, 'blocco di inizializzazione Supabase non trovato');

  const { context, effects } = createStoriesContext();
  const calls = [];
  const legacyStorage = { getItem() {}, setItem() {}, removeItem() {} };
  context.navigator.storage = { persist: async () => true };
  context.localStorage.removeItem = () => {};
  context.localStorage.setItem = () => {};
  context.indexedDB = createIndexedDbHarness().indexedDB;
  context.supabase = {
    createClient(url, key, options) {
      calls.push({ url, key, options });
      return { auth: { onAuthStateChange() { effects.authListeners += 1; } } };
    }
  };
  context.window.supabase = context.supabase;

  vm.runInContext(authSource, context, { filename: 'auth-storage.js' });
  const originalCreateClient = context.supabase.createClient.bind(context.supabase);
  context.supabase.createClient = (url, key, options = {}) => originalCreateClient(url, key, {
    ...options,
    auth: {
      ...(options.auth || {}),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: legacyStorage
    }
  });

  vm.runInContext(clientBlock, context, { filename: 'app-client.js' });
  vm.runInContext(storiesSource, context, { filename: 'legacy-transformed-stories.js' });
  vm.runInContext(storiesSource, context, { filename: 'stories.js' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.auth.storage, legacyStorage);
  assert.equal(calls[0].options.auth.persistSession, true);
  assert.equal(effects.authListeners, 1);
});

test('auth storage conserva database, store e migra la sessione con expiry maggiore', async () => {
  const key = 'sb-project-auth-token';
  const older = JSON.stringify({ expires_at: 100 });
  const newer = JSON.stringify({ currentSession: { expires_at: 200 } });
  const { context, idb, local } = createAuthStorageContext({
    idbEntries: [[key, older]],
    localEntries: [[key, newer]]
  });

  const value = await context.window.usDurableAuthStorage.getItem(key);

  assert.equal(value, newer);
  assert.equal(idb.records.get(key), newer);
  assert.equal(local.has(key), false);
  assert.deepEqual(idb.opens, [{ name: 'us-pwa-auth', version: 1 }]);
});

test('auth storage conserva il guard quando Supabase non è disponibile', () => {
  const warnings = [];
  const sandbox = {
    console: { info() {}, warn(message) { warnings.push(message); } },
    navigator: {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  vm.runInContext(readRequiredRuntimeFile('auth-storage.js'), context, {
    filename: 'auth-storage.js'
  });

  assert.equal(context.window.usDurableAuthStorage, undefined);
  assert.deepEqual(warnings, ['[US Auth] Supabase non disponibile']);
});

test('auth storage mantiene una sola copia canonica durante setItem e removeItem', async () => {
  const key = 'sb-project-auth-token';
  const value = JSON.stringify({ session: { expires_at: 300 } });
  const { context, idb, local } = createAuthStorageContext({
    localEntries: [[key, 'stale']]
  });

  await context.window.usDurableAuthStorage.setItem(key, value);
  assert.equal(idb.records.get(key), value);
  assert.equal(local.has(key), false);

  local.set(key, value);
  await context.window.usDurableAuthStorage.removeItem(key);
  assert.equal(idb.records.has(key), false);
  assert.equal(local.has(key), false);
});

test('app inizializza Supabase con il nuovo adapter e le opzioni auth precedenti', () => {
  const { context } = createAuthStorageContext();
  const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const clientBlock = appSource.match(/const SB_URL[\s\S]*?(?=const US_SIGNED_URL_CACHE)/)?.[0];
  const calls = [];
  assert.ok(clientBlock, 'blocco di inizializzazione Supabase non trovato');
  context.supabase = {
    createClient(url, key, options) {
      calls.push({ url, key, options });
      return {};
    }
  };
  context.window.supabase = context.supabase;

  vm.runInContext(clientBlock, context, { filename: 'app-client.js' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.auth.storage, context.window.usDurableAuthStorage);
  assert.equal(calls[0].options.auth.persistSession, true);
  assert.equal(calls[0].options.auth.autoRefreshToken, true);
  assert.equal(calls[0].options.auth.detectSessionInUrl, true);
});

test('installazione pulita precachea l’intero runtime statico prima di skipWaiting', async () => {
  const harness = createServiceWorkerHarness();

  await harness.dispatchExtendable('install');

  const shell = harness.cacheBuckets.get(CURRENT_SHELL);
  assert.ok(shell.has(`${ORIGIN}/auth-storage.js`));
  assert.ok(shell.has(`${ORIGIN}/app.js`));
  assert.ok(shell.has(`${ORIGIN}/stories.js`));
  assert.ok(shell.has(`${ORIGIN}/stories.css`));
  assert.ok(shell.has(`${ORIGIN}/ui-foundation.css`));
  assert.ok(shell.has(`${ORIGIN}/ui-foundation.js`));
  assert.equal(harness.skipWaitingCalls, 1);
});

test('upgrade sullo stesso origin elimina la shell legacy ma preserva la cache privata', async () => {
  const harness = createServiceWorkerHarness();
  const privateKey = `${ORIGIN}/__us_media_cache__?path=private%2Fphoto.jpg`;
  harness.cacheBuckets.set('us-shell-static-runtime-6', new Map([
    [`${ORIGIN}/app.js`, new Response('legacy transformed app')]
  ]));
  harness.cacheBuckets.set('us-private-media-v1', new Map([
    [privateKey, new Response('private photo')]
  ]));

  await harness.dispatchExtendable('install');
  await harness.dispatchExtendable('activate');

  assert.equal(harness.cacheBuckets.has('us-shell-static-runtime-6'), false);
  assert.equal(harness.cacheBuckets.has(CURRENT_SHELL), true);
  assert.equal(harness.cacheBuckets.get('us-private-media-v1').has(privateKey), true);
  assert.equal(harness.claimCalls, 1);
});

test('cache privata continua a riusare il media per path con signed URL differenti', async () => {
  const harness = createServiceWorkerHarness();
  const firstUrl = 'https://iiakdfsxpywdkxravqjh.supabase.co/storage/v1/object/sign/us-media/private/photo.jpg?token=one';
  const secondUrl = 'https://iiakdfsxpywdkxravqjh.supabase.co/storage/v1/object/sign/us-media/private/photo.jpg?token=two';

  const first = await harness.dispatchFetch(firstUrl, { destination: 'image' });
  harness.setOnline(false);
  const cached = await harness.dispatchFetch(secondUrl, { destination: 'image' });

  assert.equal(await cached.text(), await first.text());
  assert.equal(harness.cacheBuckets.get('us-private-media-v1').size, 1);
});

test('reload offline usa index e runtime della nuova shell cache', async () => {
  const harness = createServiceWorkerHarness();
  await harness.dispatchExtendable('install');
  await harness.dispatchExtendable('activate');
  harness.setOnline(false);

  const documentResponse = await harness.dispatchFetch('/home', { mode: 'navigate' });
  const appResponse = await harness.dispatchFetch('/app.js');
  const storiesResponse = await harness.dispatchFetch('/stories.js');
  const storiesCssResponse = await harness.dispatchFetch('/stories.css');

  assert.equal(await documentResponse.text(), 'asset:/index.html');
  assert.equal(await appResponse.text(), harness.rawApp);
  assert.equal(await storiesResponse.text(), 'asset:/stories.js');
  assert.equal(await storiesCssResponse.text(), 'asset:/stories.css');
});

test('push e notification click mantengono payload e navigazione esistenti', async () => {
  const harness = createServiceWorkerHarness();
  await harness.dispatchExtendable('push', {
    data: {
      json: () => ({ title: 'US test', body: 'Nuovo messaggio', target: 'today' })
    }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(harness.notifications)), [{
    title: 'US test',
    options: {
      body: 'Nuovo messaggio',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'us-notification',
      renotify: false,
      data: { target: 'today', url: '/?open=home&from=push' }
    }
  }]);

  let closed = 0;
  await harness.dispatchExtendable('notificationclick', {
    notification: {
      data: harness.notifications[0].options.data,
      close() { closed += 1; }
    }
  });

  assert.equal(closed, 1);
  assert.deepEqual(harness.openedWindows, [`${ORIGIN}/?open=home&from=push`]);
});

test('fallimento del precache non chiama skipWaiting e lascia intatta la shell precedente', async () => {
  const harness = createServiceWorkerHarness({ failPrecachePath: '/ui-foundation.js' });
  const legacyEntries = new Map([[`${ORIGIN}/app.js`, new Response('legacy app')]]);
  harness.cacheBuckets.set('us-shell-static-runtime-6', legacyEntries);

  await assert.rejects(harness.dispatchExtendable('install'), /precache failed/);

  assert.equal(harness.skipWaitingCalls, 0);
  assert.equal(harness.cacheBuckets.get('us-shell-static-runtime-6'), legacyEntries);
  assert.equal(harness.deletedCaches.length, 0);
});
