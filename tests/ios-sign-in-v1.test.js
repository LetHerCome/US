// Accesso su iPhone (founder, 05/11/2026: «Apple e Google»). App Store rule 4.8:
// with Google on the iPhone, Sign in with Apple too. google-auth.js carries both
// (UsGoogleAuth, UsAppleAuth); the native plugins are faked here, Supabase too.
// Windows cannot compile Swift: these checks read the sources, and
// .github/workflows/ios-native.yml compiles and runs the pure Swift checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const Auth = require('../google-auth.js');
const Apple = Auth.apple;

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const appleToken = (sub) => `${b64url({ alg: 'RS256', kid: 'k' })}.${b64url({ iss: 'https://appleid.apple.com', aud: 'com.usapp.us', sub })}.signature`;
const appleUser = (extra = {}) => ({
  id: 'u1', app_metadata: { provider: 'apple', providers: ['apple'] },
  identities: [{ provider: 'apple', identity_data: { sub: '001234.abcdef.1234' } }], user_metadata: {}, ...extra
});

function setup({ sub = '001234.abcdef.1234', pluginError = null, native = true, available = true, name = 'Bea Rossi', userId = 'u1' } = {}) {
  const calls = { plugin: [], exchange: [] };
  const plugin = {
    signIn: async (options) => {
      calls.plugin.push(options);
      if (pluginError) throw Object.assign(new Error(pluginError), { code: pluginError });
      return { idToken: appleToken(sub), authorizationCode: 'c-1', name };
    }
  };
  const platform = { isNative: native, isPluginAvailable: (n) => available && n === 'UsAppleSignIn', getNativePlugin: (n) => (n === 'UsAppleSignIn' ? plugin : null) };
  const auth = {
    signInWithIdToken: async (options) => { calls.exchange.push(options); return { data: { session: { access_token: 'fresh', user: { id: userId } } }, error: null }; }
  };
  return { apple: Apple.create({ auth, platform, crypto: webcrypto }), calls };
}

test('Apple: shown only where the native plugin is (the iPhone app), never on Android or the web', () => {
  assert.equal(setup().apple.supported(), true);
  assert.equal(setup({ available: false }).apple.supported(), false, 'Android: no UsAppleSignIn plugin');
  assert.equal(setup({ native: false }).apple.supported(), false, 'web');
  assert.equal(Apple.create({ auth: null, platform: { isNative: true, isPluginAvailable: () => true, getNativePlugin: () => ({}) } }).supported(), false);
  // Capability, not platform: no iOS/Android branch in the shared file.
  assert.doesNotMatch(read('google-auth.js'), /platformName\s*===?\s*['"](ios|android)['"]|getPlatform\(\)/);
});

test('Apple: Apple gets the hashed nonce, Supabase the raw one, provider apple', async () => {
  const { apple, calls } = setup();
  assert.deepEqual(await apple.signIn(), { ok: true, kind: 'signed_in', userId: 'u1', name: 'Bea Rossi' });
  const [{ nonce: hashed }] = calls.plugin;
  const [{ provider, token, nonce: raw }] = calls.exchange;
  assert.equal(provider, 'apple');
  assert.equal(token, appleToken('001234.abcdef.1234'));
  assert.match(raw, /^[0-9a-f]{64}$/);
  assert.equal(hashed, await Auth.sha256Hex(raw, webcrypto));
  assert.notEqual(hashed, raw);
  assert.equal(Object.keys(calls.plugin[0]).join(), 'nonce', 'nothing else goes to the plugin');
});

test('Apple: the name of the first sign-in comes back short and on one line, later none', async () => {
  assert.equal((await setup({ name: 'Bea\nRossi' }).apple.signIn()).name, 'Bea Rossi');
  assert.equal((await setup({ name: 'x'.repeat(80) }).apple.signIn()).name.length, 40);
  assert.equal((await setup({ name: '' }).apple.signIn()).name, '');
  assert.equal((await setup({ name: null }).apple.signIn()).name, '', 'no name from the plugin');
});

test('Apple: closing the sheet is a choice; other failures are one short kind', async () => {
  assert.deepEqual(await setup({ pluginError: 'cancelled' }).apple.signIn(), { ok: false, kind: 'cancelled' });
  assert.deepEqual(await setup({ pluginError: 'unavailable' }).apple.signIn(), { ok: false, kind: 'unavailable' });
  assert.deepEqual(await setup({ pluginError: 'invalid_request' }).apple.signIn(), { ok: false, kind: 'failed' });
  assert.deepEqual(await setup({ pluginError: 'NSError secret@privaterelay.appleid.com' }).apple.signIn(), { ok: false, kind: 'failed' });
  assert.deepEqual(await setup({ available: false }).apple.signIn(), { ok: false, kind: 'unavailable' });
});

test('Apple re-auth (delete, leave): only the same Apple account', async () => {
  assert.deepEqual(await setup().apple.reauthenticate(appleUser()), { ok: true, accessToken: 'fresh' });
  assert.deepEqual(await setup({ sub: '009999.other.0000' }).apple.reauthenticate(appleUser()), { ok: false, kind: 'other_account' });
  assert.deepEqual(await setup({ userId: 'u2' }).apple.reauthenticate(appleUser()), { ok: false, kind: 'other_account' });
  const noApple = { ...appleUser(), identities: [] };
  assert.deepEqual(await setup().apple.reauthenticate(noApple), { ok: false, kind: 'failed' });
  // The server already accepts it: an id-token sign-in is amr "oauth".
  assert.match(read('supabase/functions/_shared/s32-account-deletion-core.mjs'), /const REAUTH_METHODS = Object\.freeze\(\['password', 'oauth'\]\);/);
});

test('Apple accounts tick 18+ and the Terms once, like Google accounts', () => {
  assert.equal(Auth.needsTerms(appleUser()), true);
  assert.equal(Auth.needsTerms(appleUser({ user_metadata: { terms_accepted_at: '2026-11-05T10:00:00Z' } })), false);
  assert.equal(Auth.usesApple(appleUser()), true);
  assert.equal(Auth.usesGoogle(appleUser()), false);
  assert.equal(Auth.hasPassword(appleUser()), false, 'no password: deletion is confirmed with Apple');
  assert.equal(Apple.appleSubject(appleUser()), '001234.abcdef.1234');
  assert.equal(Auth.needsTerms({ app_metadata: { providers: ['email'] }, user_metadata: {} }), false, 'email accounts tick the box at sign-up');
  assert.match(read('app.js'), /window\.UsGoogleAuth\?\.needsTerms\?\.\(session\.user\)/, 'the gate in initCloud covers Apple too');
});

test('iOS Google plugin: same JS contract as Android, system browser, PKCE, no secret, no SDK', () => {
  const pkg = JSON.parse(read('native-plugins/us-google-signin/package.json'));
  assert.deepEqual(pkg.capacitor, { android: { src: 'android' }, ios: { src: 'ios' } });
  assert.equal(pkg.dependencies, undefined, 'no Google SDK');
  assert.match(read('native-plugins/us-google-signin/Package.swift'), /name: "UsGoogleSignin"/);
  assert.doesNotMatch(read('native-plugins/us-google-signin/Package.swift'), /GoogleSignIn-iOS|AppAuth/);
  const plugin = read('native-plugins/us-google-signin/ios/Sources/UsGoogleSignInPlugin/UsGoogleSignInPlugin.swift');
  const oauth = read('native-plugins/us-google-signin/ios/Sources/UsGoogleSignInPlugin/UsGoogleOAuth.swift');
  assert.match(plugin, /public let jsName = "UsGoogleSignIn"/);
  assert.match(read('native-plugins/us-google-signin/android/src/main/java/com/usapp/googlesignin/UsGoogleSignInPlugin.java'), /@CapacitorPlugin\(name = "UsGoogleSignIn"\)/);
  assert.match(plugin, /ASWebAuthenticationSession\(url: url, callbackURLScheme: client\.redirectScheme\)/);
  assert.match(plugin, /prefersEphemeralWebBrowserSession = false/);
  assert.match(plugin, /forInfoDictionaryKey: Self\.clientIDKey/);
  assert.match(plugin, /static let clientIDKey = "UsGoogleIOSClientID"/);
  assert.match(oauth, /URLQueryItem\(name: "code_challenge_method", value: "S256"\)/);
  assert.match(oauth, /URLQueryItem\(name: "nonce", value: nonce\)/);
  assert.match(oauth, /value\("state"\) == expectedState/);
  assert.doesNotMatch(plugin + oauth, /client_secret"|clientSecret/);
  assert.doesNotMatch(plugin, /UserDefaults|Keychain|WKWebView/, 'nothing stored, never an embedded web view');
  // Every rejection is a code google-auth.js knows, or becomes "failed".
  const codes = [...plugin.matchAll(/call\.reject\("([a-z_]+)", "([a-z_]+)"\)/g)].map((m) => m[2]);
  assert.ok(codes.length >= 5);
  for (const code of codes) assert.ok(['cancelled', 'not_configured', 'unavailable', 'interrupted', 'invalid_request', 'failed'].includes(code), code);
  const plist = read('ios/App/App/Info.plist');
  const clientId = plist.match(/<key>UsGoogleIOSClientID<\/key>\s*<string>([^<]*)<\/string>/)?.[1];
  assert.ok(clientId === '' || /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId), 'empty until the founder creates the iOS client');
  assert.notEqual(clientId, Auth.WEB_CLIENT_ID, 'the iOS client is not the web client');
});

test('iOS Apple plugin: AuthenticationServices, name and email scopes, the hashed nonce, iPhone only', () => {
  const pkg = JSON.parse(read('native-plugins/us-apple-signin/package.json'));
  assert.equal(pkg.name, '@us/apple-signin');
  assert.deepEqual(pkg.capacitor, { ios: { src: 'ios' } }, 'Android has no Apple plugin');
  assert.equal(JSON.parse(read('package.json')).dependencies['@us/apple-signin'], 'file:native-plugins/us-apple-signin');
  assert.match(read('package-lock.json'), /"node_modules\/@us\/apple-signin": \{\s*"resolved": "native-plugins\/us-apple-signin",\s*"link": true/);
  assert.match(read('native-plugins/us-apple-signin/Package.swift'), /name: "UsAppleSignin"/);
  const plugin = read('native-plugins/us-apple-signin/ios/Sources/UsAppleSignInPlugin/UsAppleSignInPlugin.swift');
  assert.match(plugin, /public let jsName = "UsAppleSignIn"/);
  assert.equal(Apple.PLUGIN, 'UsAppleSignIn');
  assert.match(plugin, /request\.requestedScopes = \[\.fullName, \.email\]/);
  assert.match(plugin, /request\.nonce = nonce/);
  assert.match(plugin, /"authorizationCode": /, 'for the server: Apple refresh token, revoked at deletion');
  assert.doesNotMatch(plugin, /"email"|UserDefaults|Keychain/, 'no email or token kept on the phone');
  const spm = read('ios/App/CapApp-SPM/Package.swift');
  for (const name of ['UsAppleSignin', 'UsGoogleSignin']) {
    assert.match(spm, new RegExp(`\\.product\\(name: "${name}", package: "${name}"\\)`));
  }
  const entitlements = read('ios/App/App/App.entitlements');
  assert.match(entitlements, /<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>\s*<\/array>/);
  assert.equal(fs.existsSync(path.join(ROOT, 'native-plugins', 'us-apple-signin', 'android')), false);
});

test('CI compiles both plugins and runs their pure checks', () => {
  const workflow = read('.github/workflows/ios-native.yml');
  assert.match(workflow, /UsGoogleOAuth\.swift/);
  assert.match(workflow, /UsAppleSignInPolicy\.swift/);
  assert.match(workflow, /grep -q UsAppleSignInPlugin "\$APP\/capacitor\.config\.json"/);
  assert.match(workflow, /grep -q UsGoogleSignInPlugin "\$APP\/capacitor\.config\.json"/);
  assert.match(workflow, /tests\/ios-sign-in-v1\.test\.js/);
  for (const piece of ['native-plugins/us-apple-signin/**', 'native-plugins/us-google-signin/**', 'google-auth.js']) {
    assert.equal(workflow.split(`- '${piece}'`).length - 1, 2, `${piece}: push e pull_request`);
  }
});
