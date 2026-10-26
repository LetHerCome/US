// Accesso con Google (25/10/2026): google-auth.js (nonce, the same account on
// re-auth), the 18+ and Terms gate for Google accounts, deletion and leaving
// confirmed with Google. The native plugin is faked; Supabase is faked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const Google = require('../google-auth.js');
const S31 = require('../public-auth.js');
const Deletion = require('../account-deletion.js');

const CLIENT = '123456789012-abcdefghijklmnop0123456789abcdef.apps.googleusercontent.com';
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (sub) => `${b64url({ alg: 'RS256' })}.${b64url({ sub, aud: CLIENT })}.signature`;
const googleUser = (extra = {}) => ({
  id: 'u1', app_metadata: { provider: 'google', providers: ['google'] },
  identities: [{ provider: 'google', identity_data: { sub: 'g-111' } }], user_metadata: {}, ...extra
});

function setup({ sub = 'g-111', pluginError = null, native = true, userId = 'u1' } = {}) {
  const calls = { plugin: [], exchange: [], oauth: [] };
  const plugin = {
    signIn: async (options) => {
      calls.plugin.push(options);
      if (pluginError) throw Object.assign(new Error(pluginError), { code: pluginError });
      return { idToken: idToken(sub) };
    }
  };
  const platform = { isNative: native, isPluginAvailable: (name) => name === 'UsGoogleSignIn', getNativePlugin: () => plugin };
  const auth = {
    signInWithIdToken: async (options) => { calls.exchange.push(options); return { data: { session: { access_token: 'fresh', user: { id: userId } } }, error: null }; },
    signInWithOAuth: async (options) => { calls.oauth.push(options); return { error: null }; }
  };
  const google = Google.create({ auth, platform, crypto: webcrypto, location: { origin: 'https://us-a33.pages.dev' }, clientId: CLIENT });
  return { google, calls };
}

test('the button stays hidden until the Google client is configured and the plugin is there', () => {
  assert.equal(Google.WEB_CLIENT_ID === '' || /\.apps\.googleusercontent\.com$/.test(Google.WEB_CLIENT_ID), true);
  const auth = { signInWithIdToken() {}, signInWithOAuth() {} };
  assert.equal(Google.create({ auth, platform: { isNative: true, isPluginAvailable: () => true, getNativePlugin: () => ({}) }, clientId: '' }).supported(), false);
  assert.equal(Google.create({ auth, platform: { isNative: true, isPluginAvailable: () => false }, clientId: CLIENT }).supported(), false);
  assert.equal(Google.create({ auth, platform: { isNative: false }, clientId: CLIENT }).supported(), true, 'web: Supabase redirect');
});

test('Android: Google gets the hashed nonce, Supabase the raw one', async () => {
  const { google, calls } = setup();
  const result = await google.signIn();
  assert.deepEqual(result, { ok: true, kind: 'signed_in', userId: 'u1' });
  const [{ serverClientId, nonce: hashed }] = calls.plugin;
  const [{ provider, token, nonce: raw }] = calls.exchange;
  assert.equal(serverClientId, CLIENT);
  assert.equal(provider, 'google');
  assert.equal(token, idToken('g-111'));
  assert.match(raw, /^[0-9a-f]{64}$/);
  assert.equal(hashed, await Google.sha256Hex(raw, webcrypto));
  assert.notEqual(hashed, raw);
});

test('closing Google\'s sheet is a choice; other failures are one short kind', async () => {
  assert.deepEqual(await setup({ pluginError: 'cancelled' }).google.signIn(), { ok: false, kind: 'cancelled' });
  assert.deepEqual(await setup({ pluginError: 'no_account' }).google.signIn(), { ok: false, kind: 'no_account' });
  assert.deepEqual(await setup({ pluginError: 'java.lang.Something secret@mail' }).google.signIn(), { ok: false, kind: 'failed' });
});

test('web: Supabase\'s Google redirect back to US', async () => {
  const { google, calls } = setup({ native: false });
  assert.deepEqual(await google.signIn(), { ok: true, kind: 'redirect' });
  assert.deepEqual(calls.oauth, [{ provider: 'google', options: { redirectTo: 'https://us-a33.pages.dev/' } }]);
});

test('re-auth: only the same Google account, never a switch to another one', async () => {
  const same = setup();
  assert.deepEqual(await same.google.reauthenticate(googleUser()), { ok: true, accessToken: 'fresh' });
  const other = setup({ sub: 'g-999' });
  assert.deepEqual(await other.google.reauthenticate(googleUser()), { ok: false, kind: 'other_account' });
  assert.equal(other.calls.exchange.length, 0, 'the other account never reaches Supabase');
  assert.deepEqual(await setup({ native: false }).google.reauthenticate(googleUser()), { ok: false, kind: 'unavailable' });
});

test('18+ and the Terms: a Google account ticks them once, recorded like the sign-up', async () => {
  assert.equal(Google.needsTerms(googleUser()), true);
  assert.equal(Google.needsTerms(googleUser({ user_metadata: { terms_accepted_at: '2026-10-25T10:00:00Z' } })), false);
  assert.equal(Google.needsTerms({ app_metadata: { providers: ['email'] }, user_metadata: {} }), false, 'owner-made accounts are not asked');
  assert.equal(Google.hasPassword(googleUser()), false);
  assert.equal(Google.hasPassword({ app_metadata: { providers: ['email', 'google'] } }), true);
  const updates = [];
  const auth = { updateUser: async (value) => { updates.push(value); return { error: null }; } };
  assert.equal((await S31.acceptTerms(auth, { terms: false })).ok, false);
  assert.equal(updates.length, 0);
  assert.deepEqual(await S31.acceptTerms(auth, { terms: true, locale: 'en' }), { ok: true });
  assert.equal(updates[0].data.locale, 'en');
  assert.ok(!Number.isNaN(Date.parse(updates[0].data.terms_accepted_at)));
});

test('app.js: the gate comes before any couple read; the button only where sign-up is open', () => {
  const app = read('app.js');
  const gate = app.indexOf('if(window.UsGoogleAuth?.needsTerms?.(session.user)){');
  assert.ok(gate > 0 && gate < app.indexOf('const result=await usOnboarding.load(session);'));
  assert.match(app, /window\.usGoogleAuth = window\.usS31Auth && window\.UsGoogleAuth\?\.create\?\.\(\{auth:sb\.auth\}\) \|\| null;/);
  // The boot never depends on the sign-up screens (25/10: the browser harness's Auth has no signUp).
  assert.ok(app.includes("catch(error){console.warn('[US Auth] sign-up unavailable',error);return null;}"));
  const html = read('index.html');
  assert.match(html, /<button type="button" class="us-auth-google" id="usGoogleSignIn" hidden>/);
  assert.match(html, /id="usGoogleTermsSubmit" type="submit" disabled>Continua<\/button>/);
  assert.ok(html.indexOf('/google-auth.js?v=') > html.indexOf('/public-auth.js?v=') && html.indexOf('/google-auth.js?v=') < html.indexOf('<script defer src="/app.js?v='));
  assert.match(read('service-worker.js'), /versioned\("\/google-auth\.js"\)/);
});

test('deletion and leaving: a Google account confirms with Google, the same account', async () => {
  assert.equal(Deletion.canSubmit({ confirm: 'ELIMINA', google: true }), true);
  assert.equal(Deletion.canSubmit({ confirm: 'ELIMINA' }), false, 'without Google a password is still needed');
  assert.equal(Deletion.canLeave({ confirm: 'ESCI', google: true }), true);
  const fetches = [];
  const fetchImpl = async (url, init) => { fetches.push([url, init.headers.Authorization]); return { status: 200, json: async () => ({}) }; };
  const user = googleUser();
  const ok = { reauthenticate: async (u) => (u === user ? { ok: true, accessToken: 'fresh' } : { ok: false, kind: 'failed' }) };
  const done = await Deletion.reauthenticateAndDelete({ google: ok, user, channel: 'app', supabaseUrl: 'https://x.supabase.co', apiKey: 'k', fetchImpl });
  assert.equal(done.done, true);
  assert.deepEqual(fetches[0], ['https://x.supabase.co/functions/v1/delete-account', 'Bearer fresh']);
  for (const [kind, expected] of [['cancelled', 'google_cancelled'], ['other_account', 'google_other_account'], ['failed', 'google_failed']]) {
    const result = await Deletion.reauthenticateAndLeave({ google: { reauthenticate: async () => ({ ok: false, kind }) }, user, supabaseUrl: 'https://x.supabase.co', apiKey: 'k', fetchImpl });
    assert.deepEqual(result, { kind: expected, done: false });
    assert.ok(Deletion.leaveMessage(expected).length > 0);
  }
  assert.equal(fetches.length, 1, 'nothing reaches the server without Google');
});
