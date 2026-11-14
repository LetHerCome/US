// US 2.0 F3A.1 — runtime error capture. The inline guard in index.html is the
// first script of the shell: it must record uncaught errors, failed boot
// scripts and unhandled rejections before anything else can fail, keep the
// record device-local and scrubbed, and never throw itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const KEY = 'us:runtime-errors:v1';

function guardSource() {
  const match = HTML.match(/<!-- us-runtime-errors: start -->\s*<script>([\s\S]*?)<\/script>\s*<!-- us-runtime-errors: end -->/);
  assert.ok(match, 'index.html carries the runtime error guard between its markers');
  return match[1];
}

function boot({ stored = null, lastProfile = null, storageThrows = false } = {}) {
  const local = new Map();
  if (stored !== null) local.set(KEY, stored);
  if (lastProfile) local.set('us:fix4:last-profile', JSON.stringify(lastProfile));
  const listeners = {};
  const timers = [];
  const classes = new Set();
  const storage = {
    getItem: (key) => { if (storageThrows) throw new Error('denied'); return local.has(key) ? local.get(key) : null; },
    setItem: (key, value) => { if (storageThrows) throw new Error('denied'); local.set(key, String(value)); },
    removeItem: (key) => { if (storageThrows) throw new Error('denied'); local.delete(key); }
  };
  const sandbox = {
    localStorage: storage,
    navigator: { onLine: true },
    location: { origin: 'https://us.example', href: 'https://us.example/' },
    document: {
      hidden: false,
      querySelector: (selector) => (selector === 'meta[name="us-build"]' ? { content: 'test-build-1' } : null),
      documentElement: { classList: { contains: (name) => classes.has(name), add: (name) => classes.add(name) } }
    },
    addEventListener: (type, handler, options) => {
      (listeners[type] ||= []).push({ handler, capture: options === true || options?.capture === true });
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    Date,
    JSON,
    Math
  };
  sandbox.window = sandbox;
  vm.runInContext(guardSource(), vm.createContext(sandbox), { filename: 'index.html#us-runtime-errors' });
  const fire = (type, event) => (listeners[type] || []).forEach(({ handler }) => handler(event));
  return { sandbox, local, listeners, timers, classes, fire, api: sandbox.UsRuntimeErrors };
}

const errorEvent = (over = {}) => ({
  message: 'TypeError: Cannot read properties of undefined (reading "id")',
  filename: 'https://us.example/app.js?v=build-9',
  lineno: 120,
  colno: 7,
  target: null,
  ...over
});

test('F3A.1 guard: it is the first script of the shell, before i18n and the Supabase CDN', () => {
  const guardAt = HTML.indexOf('<!-- us-runtime-errors: start -->');
  assert.ok(guardAt > 0);
  const firstScript = HTML.indexOf('<script');
  assert.equal(firstScript, HTML.indexOf('<script>', guardAt), 'no script runs before the guard');
  assert.ok(guardAt < HTML.indexOf('/i18n.js'));
  assert.ok(guardAt < HTML.indexOf('cdn.jsdelivr.net/npm/@supabase/supabase-js'));
});

test('F3A.1 guard: uncaught errors are recorded with build, phase and file name only', () => {
  const { api, fire, listeners, local } = boot();
  assert.ok(listeners.error.some(({ capture }) => capture), 'error listener runs in the capture phase to see failed scripts');
  fire('error', errorEvent());
  const [entry] = api.list();
  assert.equal(entry.kind, 'error');
  assert.equal(entry.source, 'app.js');
  assert.equal(entry.line, 120);
  assert.equal(entry.col, 7);
  assert.equal(entry.build, 'test-build-1');
  assert.equal(entry.phase, 'boot');
  assert.equal(entry.count, 1);
  assert.match(entry.message, /Cannot read properties of undefined/);
  assert.deepEqual(JSON.parse(local.get(KEY)).map((item) => item.kind), ['error']);
});

test('F3A.1 guard: the phase becomes "ready" once auth has resolved', () => {
  const { api, fire, classes } = boot();
  classes.add('us-auth-ready');
  fire('error', errorEvent());
  assert.equal(api.list()[0].phase, 'ready');
});

test('F3A.1 guard: unhandled rejections are recorded; AbortError is noise', () => {
  const { api, fire } = boot();
  fire('unhandledrejection', { reason: { name: 'AbortError', message: 'The user aborted a request.' } });
  assert.equal(api.list().length, 0);
  fire('unhandledrejection', { reason: Object.assign(new Error('JWT expired'), { stack: 'Error: JWT expired\n    at hydrateToday (https://us.example/app.js?v=x:2210:9)' }) });
  fire('unhandledrejection', { reason: 'plain string reason' });
  const entries = api.list();
  assert.deepEqual(entries.map((item) => item.kind), ['rejection', 'rejection']);
  assert.equal(entries[0].message, 'Error: JWT expired');
  assert.equal(entries[0].source, 'app.js');
  assert.equal(entries[0].line, 2210);
  assert.equal(entries[1].message, 'plain string reason');
});

test('F3A.1 guard: a script or stylesheet that fails to load is a "resource" entry; images are ignored', () => {
  const { api, fire } = boot();
  fire('error', { target: { tagName: 'SCRIPT', src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4' } });
  fire('error', { target: { tagName: 'LINK', href: 'https://us.example/games.css?v=build-9' } });
  fire('error', { target: { tagName: 'IMG', src: 'https://x.supabase.co/storage/v1/object/sign/us-media/a/b.webp?token=secret' } });
  const entries = api.list();
  assert.deepEqual(entries.map((item) => [item.kind, item.source]), [
    ['resource', 'cdn.jsdelivr.net/supabase-js@2.112.4'],
    ['resource', 'games.css']
  ]);
  assert.match(entries[0].message, /SCRIPT failed to load/);
});

test('F3A.1 guard: messages are scrubbed of e-mails, ids, tokens and URL queries', () => {
  const { api, fire } = boot();
  fire('error', errorEvent({
    message: 'Error for anna.rossi@example.com couple 0f8fad5b-d9cb-469f-a165-70867728950e token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF_123 at https://x.supabase.co/storage/v1/object/sign/us-media/p.webp?token=SECRETSECRET key sb_secret_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'
  }));
  const { message } = api.list()[0];
  for (const leaked of ['anna.rossi', '0f8fad5b', 'eyJhbGci', 'SECRETSECRET', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345']) {
    assert.ok(!message.includes(leaked), `${leaked} must not survive scrubbing: ${message}`);
  }
  assert.match(message, /<email>/);
  assert.match(message, /<uuid>/);
  assert.match(message, /<jwt>/);
  assert.match(message, /https:\/\/x\.supabase\.co\/…\/p\.webp/);
});

test('F3A.1 guard: repeats are counted, not stored twice; the log is capped at 25', () => {
  const { api, fire } = boot();
  fire('error', errorEvent());
  fire('error', errorEvent());
  assert.equal(api.list().length, 1);
  assert.equal(api.list()[0].count, 2);
  for (let index = 0; index < 40; index += 1) fire('error', errorEvent({ message: `Error number ${index}`, lineno: index }));
  const entries = api.list();
  assert.equal(entries.length, 25);
  assert.equal(entries.at(-1).message, 'Error number 39');
});

test('F3A.1 guard: long messages are truncated', () => {
  const { api, fire } = boot();
  fire('error', errorEvent({ message: 'x'.repeat(2000) }));
  assert.ok(api.list()[0].message.length <= 241);
});

test('F3A.1 guard: browser-extension noise and ResizeObserver warnings are ignored', () => {
  const { api, fire } = boot();
  fire('error', errorEvent({ filename: 'chrome-extension://abc/content.js' }));
  fire('error', errorEvent({ message: 'ResizeObserver loop completed with undelivered notifications.' }));
  assert.equal(api.list().length, 0);
});

test('F3A.1 guard: entries from the previous launch survive a reload; corrupt storage is ignored', () => {
  const previous = JSON.stringify([{ kind: 'error', message: 'old crash', source: 'app.js', line: 1, col: 1, count: 1, first: 1, last: 1, build: 'old', phase: 'boot' }]);
  assert.equal(boot({ stored: previous }).api.list()[0].message, 'old crash');
  assert.equal(boot({ stored: '{not json' }).api.list().length, 0);
  assert.equal(boot({ stored: '{"a":1}' }).api.list().length, 0);
});

test('F3A.1 guard: blocked storage never breaks capture', () => {
  const { api, fire } = boot({ storageThrows: true });
  assert.doesNotThrow(() => fire('error', errorEvent()));
  assert.equal(api.list().length, 1);
  assert.doesNotThrow(() => api.clear());
});

test('F3A.1 guard: a returning device that never reaches auth-ready records a boot timeout with what was missing', () => {
  const { api, timers, sandbox } = boot({ lastProfile: { id: 'p1', couple_id: 'c1' } });
  const deadline = timers.find(({ ms }) => ms === 8000);
  assert.ok(deadline, 'the guard arms an 8 s boot deadline');
  sandbox.sb = {};
  deadline.fn();
  const [entry] = api.list();
  assert.equal(entry.kind, 'boot-timeout');
  assert.match(entry.message, /missing: supabase/);
  assert.ok(!entry.message.includes(' sb'), 'present pieces are not listed as missing');
});

test('F3A.1 guard: no boot timeout once auth is ready, or for a device that was never signed in', () => {
  const ready = boot({ lastProfile: { id: 'p1', couple_id: 'c1' } });
  ready.classes.add('us-auth-ready');
  ready.timers.find(({ ms }) => ms === 8000).fn();
  assert.equal(ready.api.list().length, 0);

  const fresh = boot();
  fresh.timers.filter(({ ms }) => ms === 8000).forEach(({ fn }) => fn());
  assert.equal(fresh.api.list().length, 0);
});

test('F3A.1 guard: note() records handled failures through the same scrubbing', () => {
  const { api } = boot();
  api.note('init-cloud', 'profile fetch failed for 0f8fad5b-d9cb-469f-a165-70867728950e');
  const [entry] = api.list();
  assert.equal(entry.kind, 'init-cloud');
  assert.match(entry.message, /<uuid>/);
});

test('F3A.1 guard: clear() empties memory and storage', () => {
  const { api, fire, local } = boot();
  fire('error', errorEvent());
  api.clear();
  assert.equal(api.list().length, 0);
  assert.ok(!local.has(KEY));
});

test('F3A.1 logout: the private device cleanup also clears the runtime error log', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const cleanup = app.slice(app.indexOf('async function clearPrivateDeviceState'), app.indexOf('async function revokeCurrentDevice'));
  assert.match(cleanup, /UsRuntimeErrors\?\.clear\?\.\(\)/);
});

test('F3A.1 boot: a failed session restore leaves an "auth-restore" note', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const branch = app.slice(app.indexOf("console.warn('[US Auth] session restore unavailable'"));
  assert.match(branch.slice(0, 200), /UsRuntimeErrors\?\.note\?\.\('auth-restore'/);
});
