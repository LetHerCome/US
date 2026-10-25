// Bug 25/10/2026 (second report): «apro l'app, attivo le notifiche, chiudo,
// riapro e mi richiede di nuovo di attivarle». At a cold start supabase-js
// 2.112 announces the stored session with SIGNED_IN (GoTrueClient
// _recoverAndRefresh) while the boot is still waiting for it, so usAuthUserId
// is still empty. The listener in app.js took that for an account change and
// ran usInvalidateAuth(), whose UsNotifications.signedOut() retired this
// phone's registration and its «abilitate» mark on every launch.
// The boot announcement now only restarts the boot: the phone keeps its
// notifications, widgets and boot caches. A real change of account still
// clears them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('sb.auth.onAuthStateChange((event,_session)=>{');
const end = app.indexOf('\n});\n', start) + 5;
const listener = app.slice(start, end);

// Runs the real listener with the shell around it faked.
function run({ event, session, usAuthUserId = '', profile = null }) {
  const calls = [];
  let handler = null;
  const context = {
    sb: { auth: { onAuthStateChange: (cb) => { handler = cb; } } },
    window: { usProfile: profile, usS31Auth: { reset() {}, onRecoverySession: () => false } },
    document: { getElementById: () => ({ classList: { remove() {} } }) },
    usAuthUserId,
    usInvalidateAuth: (options) => calls.push(['invalidate', options || {}]),
    initCloud: () => calls.push(['initCloud']),
    setTimeout: (fn) => fn()
  };
  vm.runInNewContext(listener, context);
  handler(event, session);
  // Plain values (the options object is created inside the vm realm).
  return JSON.parse(JSON.stringify(calls));
}

test('cold start: the SIGNED_IN that announces the stored session keeps this phone\'s notifications', () => {
  const calls = run({ event: 'SIGNED_IN', session: { user: { id: 'A' } } });
  assert.deepEqual(calls.find((c) => c[0] === 'invalidate'), ['invalidate', { keepDevice: true }], 'the boot restarts, the device state stays');
  assert.ok(calls.some((c) => c[0] === 'initCloud'));
});

test('a real change of account or a sign-out still clears the device', () => {
  assert.deepEqual(run({ event: 'SIGNED_IN', session: { user: { id: 'B' } }, usAuthUserId: 'A', profile: { id: 'A' } })[0], ['invalidate', {}]);
  assert.deepEqual(run({ event: 'SIGNED_OUT', session: null, usAuthUserId: 'A', profile: { id: 'A' } })[0], ['invalidate', {}]);
  assert.deepEqual(run({ event: 'SIGNED_IN', session: { user: { id: 'A' } }, usAuthUserId: 'A', profile: { id: 'A' } }), [], 'the same account coming back to the foreground: nothing');
});

test('usInvalidateAuth({keepDevice:true}) restarts the boot without touching notifications, widgets or boot caches', () => {
  const body = app.slice(app.indexOf('function usInvalidateAuth('), app.indexOf("  document.documentElement.classList.add('us-auth-pending');"));
  assert.match(body, /function usInvalidateAuth\(\{revokePush=true,keepDevice=false\}=\{\}\)\{/);
  assert.match(body, /if\(!keepDevice\)clearPrivateDeviceState\(previousId\)\.catch\(\(\)=>\{\}\);/);
  assert.match(body, /if\(!keepDevice\)\{\n\s+window\.UsWidgets\?\.clear\?\.\(\)\.catch\(\(\)=>\{\}\);\n\s+window\.UsNotifications\?\.signedOut\?\.\(\);\n\s+\}/);
});
