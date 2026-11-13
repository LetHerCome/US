// Errori dell'app (09/11/2026): the app sends the errors nobody caught to
// public.report_client_errors, cleaned of anything personal, a few per load,
// only with a session, never in a loop.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const errors = require('../client-errors.js');

const fakeClient = ({ session = { user: { id: 'u' } }, fail = false } = {}) => {
  const calls = [];
  return {
    calls,
    auth: { getSession: async () => ({ data: { session } }) },
    rpc: async (name, args) => { calls.push([name, args]); if (fail) throw new Error('offline'); return { data: 1, error: null }; },
  };
};

test.afterEach(() => errors.configure());

test('messages lose addresses, emails, ids, long numbers, tokens and quoted text', () => {
  assert.equal(errors.clean('Failed at https://www.uscouple.app/invito?x=1#ABCDE12345 for bea@example.com'), 'Failed at www.uscouple.app/invito for <email>');
  assert.equal(errors.clean('row 3f2c9a10-1b2c-4d3e-8f90-123456789abc of 12345678'), 'row <id> of <n>');
  assert.equal(errors.clean('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig and more'), 'Bearer <token> and more');
  assert.equal(errors.clean('Unexpected token \'C\', "Ciao amore mio" is not valid JSON'), 'Unexpected token \'C\', "…" is not valid JSON');
  assert.equal(errors.clean(`  ${'x'.repeat(500)}  `).length, 300);
  assert.equal(errors.fileOf('https://www.uscouple.app/app.js?v=us-staging-20261109-106'), 'app.js');
  assert.equal(errors.fileOf('capacitor://localhost/onboarding.js'), 'onboarding.js');
  assert.deepEqual(errors.firstFrame('TypeError: x\n    at go (https://www.uscouple.app/app.js?v=1:120:7)\n    at y (https://www.uscouple.app/b.js:1:1)'), { file: 'app.js', line: 120, col: 7 });
  assert.deepEqual(errors.firstFrame('go@capacitor://localhost/noi-v2.js:44:2'), { file: 'noi-v2.js', line: 44, col: 2 });
});

test('the same error once with a count; at most 20 per load; noise and extensions are left out', () => {
  errors.configure({ build: 'us-staging-20261109-106', platform: 'android' });
  const first = errors.onError({ message: 'Uncaught TypeError: a', error: Object.assign(new TypeError('a is not a function')), filename: 'https://www.uscouple.app/app.js?v=1', lineno: 9, colno: 4 });
  assert.deepEqual(first, { kind: 'error', message: 'TypeError: a is not a function', source: 'app.js', line: 9, col: 4, build: 'us-staging-20261109-106', platform: 'android', repeats: 1 });
  errors.onError({ message: 'Uncaught TypeError: a', error: new TypeError('a is not a function'), filename: 'https://www.uscouple.app/app.js', lineno: 9, colno: 4 });
  assert.equal(first.repeats, 2);
  assert.equal(errors.onError({ target: {} }), null, 'a picture that does not load');
  assert.equal(errors.onError({ message: 'Script error.' }), null);
  assert.equal(errors.onError({ message: 'ResizeObserver loop completed with undelivered notifications.' }), null);
  assert.equal(errors.onRejection({ reason: new TypeError('Failed to fetch') }), null, 'the network, not a bug');
  assert.equal(errors.onRejection({ reason: Object.assign(new Error('stop'), { name: 'AbortError' }) }), null);
  assert.equal(errors.onError({ message: 'boom', filename: 'chrome-extension://abc/content.js', lineno: 1 }), null);
  for (let i = 0; i < 30; i += 1) errors.record('error', `Error ${i}`, 'app.js', i, 0);
  assert.equal(errors.pendingCount(), errors.PER_LOAD);
});

test('a Supabase error keeps its code and message, never its details', () => {
  errors.configure({ build: 'b', platform: 'web' });
  const entry = errors.onRejection({ reason: { code: '42501', message: 'permission denied for table moments', details: 'Key (id)=(secret) exists' } });
  assert.equal(entry.kind, 'rejection');
  assert.equal(entry.message, '42501: permission denied for table moments');
  assert.equal(errors.onRejection({ reason: { nothing: true } }), null);
});

test('sent only with a session, once, and dropped if the call fails', async () => {
  errors.configure({ build: 'b', platform: 'ios' });
  errors.record('error', 'Error: one', 'app.js', 1, 1);
  assert.equal(await errors.flush(), 0, 'no client yet');
  assert.equal(errors.pendingCount(), 1);

  const nobody = fakeClient({ session: null });
  errors.configure({ build: 'b', platform: 'ios', client: nobody });
  errors.record('error', 'Error: one', 'app.js', 1, 1);
  assert.equal(await errors.flush(), 0, 'signed out: it waits');
  assert.equal(nobody.calls.length, 0);
  assert.equal(errors.pendingCount(), 1);

  const signedIn = fakeClient();
  errors.configure({ build: 'b', platform: 'ios', client: signedIn });
  errors.record('error', 'Error: one', 'app.js', 1, 1);
  errors.record('rejection', 'Error: two', null, null, null);
  assert.equal(await errors.flush(), 2);
  assert.deepEqual(signedIn.calls, [['report_client_errors', { errors: [
    { kind: 'error', message: 'Error: one', source: 'app.js', line: 1, col: 1, build: 'b', platform: 'ios', repeats: 1 },
    { kind: 'rejection', message: 'Error: two', source: null, line: null, col: null, build: 'b', platform: 'ios', repeats: 1 },
  ] }]]);
  assert.equal(errors.pendingCount(), 0);
  errors.record('error', 'Error: one', 'app.js', 1, 1);
  assert.equal(errors.pendingCount(), 0, 'already sent in this load');

  const broken = fakeClient({ fail: true });
  errors.configure({ build: 'b', platform: 'web', client: broken });
  errors.record('error', 'Error: three', 'app.js', 3, 1);
  assert.equal(await errors.flush(), 1);
  assert.equal(errors.pendingCount(), 0, 'dropped, never retried in a loop');
});

test('it is the first deferred script, and every build and the offline cache carry it', () => {
  const html = read('index.html');
  const deferred = [...html.matchAll(/<script defer src="\/([^"?]+)/g)].map((m) => m[1]);
  assert.equal(deferred[0], 'client-errors.js');
  assert.match(read('scripts/build-cloudflare-pages.mjs'), /'client-errors\.js',/);
  assert.match(read('scripts/build-capacitor-web.mjs'), /'client-errors\.js',/);
  assert.match(read('service-worker.js'), /versioned\("\/client-errors\.js"\)/);
  assert.doesNotMatch(read('client-errors.js'), /sentry|crashlytics|bugsnag|fetch\(/i, 'our Supabase only, through the app client');
});
