// Il dominio (founder, 30/10/2026): US lives on https://www.uscouple.app.
// Invites, App Links, Privacy and Terms point there; the old address
// us-a33.pages.dev keeps working, so links already shared still open US.
// The bare uscouple.app is the same site (and may redirect to www).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const OB = require('../onboarding.js');
const CODE = '01JBX4Z7Q8M2N5P6R9S3T4V7W8';

test('the invite link is on www.uscouple.app, also from the old address and the app', () => {
  for (const origin of ['https://www.uscouple.app', 'https://uscouple.app', 'https://us-a33.pages.dev', 'https://localhost', undefined]) {
    assert.equal(OB.inviteLink(CODE, origin), `https://www.uscouple.app/invito#${CODE}`, String(origin));
  }
  assert.equal(OB.inviteLink(CODE, 'https://us-staging-s31.pages.dev'), `https://us-staging-s31.pages.dev/invito#${CODE}`, 'staging stays on staging');
});

test('links on the new and the old address both open the invite', () => {
  for (const host of ['www.uscouple.app', 'uscouple.app', 'us-a33.pages.dev', 'us-staging-s31.pages.dev']) {
    assert.equal(OB.inviteFromLink(`https://${host}/invito#${CODE}`), CODE, host);
  }
  for (const other of ['https://evil.uscouple.app.example/invito#X', 'https://xuscouple.app/invito#X', 'http://www.uscouple.app/invito#X']) {
    assert.equal(OB.inviteFromLink(other.replace('X', CODE)), '', other);
  }
});

test('Android opens US from www.uscouple.app and still from the old address', () => {
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /manifestPlaceholders = \[usInviteHost: "www\.uscouple\.app", usInviteHostOld: "us-a33\.pages\.dev"\]/);
  assert.match(gradle, /manifestPlaceholders = \[usInviteHost: "us-staging-s31\.pages\.dev", usInviteHostOld: "us-staging-s31\.pages\.dev"\]/);
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<data android:scheme="https" android:host="\$\{usInviteHost\}" android:path="\/invito" \/>\s*<data android:scheme="https" android:host="\$\{usInviteHostOld\}" android:path="\/invito" \/>/);
  // One file for every address of the site: the Pages project serves it on all of them.
  assert.ok(read('scripts/build-cloudflare-pages.mjs').includes("'.well-known/assetlinks.json'"));
});

test('Privacy, Terms and the deletion page are on www.uscouple.app', () => {
  global.window = global.window || {};
  const S31 = require('../public-auth.js');
  assert.equal(S31.legalUrl(S31.LEGAL_URLS.privacy), 'https://www.uscouple.app/privacy');
  assert.equal(S31.legalUrl(S31.LEGAL_URLS.terms), 'https://www.uscouple.app/termini');
  assert.match(read('settings.js'), /const legal=page=>`https:\/\/www\.uscouple\.app\/\$\{page\}\$\{en\?'-en':''\}`;/);
  for (const file of ['privacy.html', 'privacy-en.html']) assert.match(read(file), /<a href="\/elimina-account">www\.uscouple\.app\/elimina-account<\/a>/, file);
  assert.doesNotMatch(read('public-auth.js'), /Gmail SMTP/, 'the mails go out through Resend now');
});

test('the deletion page and its server accept the new address, staging never gets production', async () => {
  const page = require('../elimina-account.js');
  for (const host of ['www.uscouple.app', 'uscouple.app', 'us-a33.pages.dev', 'feature-x.us-a33.pages.dev']) assert.ok(page.configForHost(host), host);
  for (const host of ['xuscouple.app', 'uscouple.app.evil.dev', 'evil.dev']) assert.equal(page.configForHost(host), null, host);
  const { DEFAULT_ALLOWED_ORIGINS } = await import('../supabase/functions/_shared/s32-account-deletion-core.mjs');
  for (const origin of ['https://www.uscouple.app', 'https://uscouple.app', 'https://us-a33.pages.dev']) assert.ok(DEFAULT_ALLOWED_ORIGINS.includes(origin), origin);
  const { isolateStagingDeletionPage, STAGING_PAGES_HOST } = await import('../scripts/build-s31-staging-preview.mjs');
  const staged = isolateStagingDeletionPage(read('elimina-account.js'), 'sb_publishable_' + 'TESTONLY'.repeat(4));
  assert.doesNotMatch(staged, /uscouple\.app|us-a33\.pages\.dev/);
  const mod = { exports: {} };
  new Function('module', staged)(mod);
  for (const host of ['www.uscouple.app', 'uscouple.app', 'us-a33.pages.dev']) assert.equal(mod.exports.configForHost(host), null, host);
  assert.ok(mod.exports.configForHost(STAGING_PAGES_HOST));
});
