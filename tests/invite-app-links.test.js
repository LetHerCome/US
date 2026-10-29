// Invito con App Links (founder, 29/10/2026): the shared link
// https://us-a33.pages.dev/invito#CODE opens the installed Android app, which
// keeps the code for «Ho un codice d'invito». Without the app the same link
// opens the invite page (invito.html).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const OB = require('../onboarding.js');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const CODE = '01JBX4Z7Q8M2N5P6R9S3T4V7W8';

test('the app recognises only its own invite links', () => {
  assert.equal(OB.inviteFromLink(`https://us-a33.pages.dev/invito#${CODE}`), CODE);
  assert.equal(OB.inviteFromLink({ url: `https://us-a33.pages.dev/invito#${CODE}` }), CODE, 'the appUrlOpen event');
  assert.equal(OB.inviteFromLink(`https://us-staging-s31.pages.dev/invito#${CODE}`), CODE);
  assert.equal(OB.inviteFromLink(`https://us-a33.pages.dev/invito.html#${CODE}`), CODE);
  for (const other of [`https://evil.example/invito#${CODE}`, `http://us-a33.pages.dev/invito#${CODE}`, `https://us-a33.pages.dev/privacy#${CODE}`,
    'us://widget/daily', 'https://us-a33.pages.dev/invito', '', null]) {
    assert.equal(OB.inviteFromLink(other), '', String(other));
  }
});

test('an opened invite link is kept for the join step', () => {
  const m = new Map();
  const session = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  assert.equal(OB.takeInvite({ url: `https://us-a33.pages.dev/invito#${CODE}`, session }), CODE);
  assert.equal(OB.takeInvite({ session }), CODE, 'still there for «Ho un codice d’invito»');
  assert.equal(OB.takeInvite({ url: 'us://widget/daily', session }), CODE, 'another link does not touch it');
});

test('onboarding listens to the links that open the app, cold start included', () => {
  const ob = read('onboarding.js');
  assert.match(ob, /window\.UsPlatform\?\.listenForNativeAppUrl\?\.\(acceptInviteLink\);/);
  assert.match(ob, /Promise\.resolve\(window\.UsPlatform\?\.getNativeLaunchUrl\?\.\(\)\)\.then\(acceptInviteLink\)/);
});

test('the platform hands every opened link to every listener (widgets and invites)', async () => {
  let native = null;
  const sandbox = { console: { warn() {} }, navigator: {} };
  sandbox.UsCapacitorRuntime = {
    isNativePlatform: () => true,
    app: { addListener: (name, fn) => { assert.equal(name, 'appUrlOpen'); native = fn; return { remove() {} }; } },
  };
  sandbox.window = sandbox;
  vm.runInContext(read('platform.js'), vm.createContext(sandbox), { filename: 'platform.js' });
  const seen = [];
  await sandbox.UsPlatform.listenForNativeAppUrl((e) => seen.push(['widgets', e.url]));
  await sandbox.UsPlatform.listenForNativeAppUrl((e) => seen.push(['invite', e.url]));
  native({ url: 'https://us-a33.pages.dev/invito#X' });
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [['widgets', 'https://us-a33.pages.dev/invito#X'], ['invite', 'https://us-a33.pages.dev/invito#X']]);
});

test('Android opens /invito on the US site in the app, verified (App Links)', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<intent-filter android:autoVerify="true">\s*<action android:name="android\.intent\.action\.VIEW" \/>\s*<category android:name="android\.intent\.category\.DEFAULT" \/>\s*<category android:name="android\.intent\.category\.BROWSABLE" \/>\s*<data android:scheme="https" android:host="\$\{usInviteHost\}" android:path="\/invito" \/>\s*<\/intent-filter>/);
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /manifestPlaceholders = \[usInviteHost: "us-a33\.pages\.dev"\]/);
  assert.match(gradle, /manifestPlaceholders = \[usInviteHost: "us-staging-s31\.pages\.dev"\]/);
});

test('the site proves the app is ours: /.well-known/assetlinks.json, published as is', () => {
  const links = JSON.parse(read('.well-known/assetlinks.json'));
  assert.equal(links.length, 1);
  const [entry] = links;
  assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(entry.target.namespace, 'android_app');
  assert.equal(entry.target.package_name, 'com.usapp.us');
  assert.ok(entry.target.sha256_cert_fingerprints.length >= 1);
  for (const print of entry.target.sha256_cert_fingerprints) assert.match(print, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.match(read('scripts/build-cloudflare-pages.mjs'), /'\.well-known\/assetlinks\.json',/);
  assert.match(read('cloudflare/_headers'), /\/\.well-known\/assetlinks\.json\n  Content-Type: application\/json/);
});
