const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const AUTH_SOURCE = fs.readFileSync(path.join(ROOT, 'auth-storage.js'), 'utf8');

function createContext({ mode = 'hang', localEntries = [] } = {}) {
  const local = new Map(localEntries);
  const sandbox = {
    console: { info() {}, warn() {} },
    navigator: { storage: { persist: async () => true } },
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, value),
      removeItem: (key) => local.delete(key)
    },
    supabase: { createClient() {} }
  };
  sandbox.window = sandbox;
  sandbox.__US_AUTH_IDB_TIMEOUT_MS__ = 60;
  sandbox.indexedDB = {
    open() {
      const request = {};
      if (mode === 'blocked') queueMicrotask(() => request.onblocked?.());
      return request;
    }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(AUTH_SOURCE, context, { filename: 'auth-storage.js' });
  return { context, local };
}

test('iOS boot hardening: IndexedDB che non risponde ricade su localStorage entro una deadline', async () => {
  const key = 'sb-project-auth-token';
  const fallback = JSON.stringify({ expires_at: 9999999999 });
  const { context } = createContext({ localEntries: [[key, fallback]] });

  const result = await Promise.race([
    context.window.usDurableAuthStorage.getItem(key),
    new Promise((_, reject) => setTimeout(() => reject(new Error('storage hung')), 500))
  ]);

  assert.equal(result, fallback);
});

test('iOS boot hardening: IndexedDB blocked non blocca set/remove e usa il fallback locale', async () => {
  const key = 'sb-project-auth-token';
  const value = JSON.stringify({ expires_at: 9999999999 });
  const { context, local } = createContext({ mode: 'blocked' });

  await context.window.usDurableAuthStorage.setItem(key, value);
  assert.equal(local.get(key), value);

  await context.window.usDurableAuthStorage.removeItem(key);
  assert.equal(local.has(key), false);
});

test('iOS boot hardening: initCloud impone una deadline al ripristino sessione', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /US_AUTH_SESSION_TIMEOUT_MS=3200/);
  assert.match(app, /usWithDeadline\(\s*sb\.auth\.getSession\(\),\s*US_AUTH_SESSION_TIMEOUT_MS/);
  assert.match(app, /usWithDeadline\(\s*sb\.auth\.getSession\(\),\s*1600/);
  assert.match(app, /Non riesco a ripristinare la sessione\. Accedi di nuovo/);
});

test('iOS boot hardening: il fallback HTML non può lasciare il login nascosto per sempre', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /classList\.contains\('us-auth-ready'\)/);
  assert.match(html, /classList\.remove\('us-auth-pending', 'us-returning-device'\)/);
});

test('iOS boot hardening: build id è allineato tra shell, worker, manifest e version marker', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  const build = html.match(/<meta name="us-build" content="([^"]+)"/)?.[1];

  assert.match(build || '', /^us-[a-z0-9-]+-\\d{8}-\\d+$/);
  assert.equal(worker.match(/const BUILD_ID = "([^"]+)"/)?.[1], build);
  assert.ok(manifest.includes(`?v=${build}`), 'manifest assets use the active build id');
  assert.equal(version.version, build);
});
