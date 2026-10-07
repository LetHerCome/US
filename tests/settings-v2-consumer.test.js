const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const css = read('settings2.css');
const settings = read('settings.js');

const page = html.match(/<main id="settings" class="page">[\s\S]*?<\/main>/)?.[0] || '';

test('Settings V2 keeps every existing consumer action exactly once', () => {
  const actions = [
    'profile-photo','notifications','app-lock','feedback','maudit','widgets',
    'relationship-date','home-photo','story-archive','location','distance',
    'optimize-ricordi','privacy','sync-status','logout'
  ];
  for (const action of actions) {
    const count = [...page.matchAll(new RegExp(`data-us-setting="${action}"`, 'g'))].length;
    assert.equal(count, 1, `${action} appears once`);
  }
});

test('Settings V2 uses a consumer hierarchy instead of Tu/Voi technical buckets', () => {
  for (const label of ['Profilo','Questo telefono','Noi','Privacy e dati']) {
    assert.match(page, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(page, /id="usSettingsTuTitle"|id="usSettingsVoiTitle"|SU QUESTO TELEFONO/);
  assert.match(page, /<details class="us-settings-app-details">/);
  assert.match(page, /Versione e sincronizzazione/);
});

test('Settings V2 keeps native/security/runtime hooks intact', () => {
  for (const id of [
    'usSettingsDeviceDot','usNotificationsValue','usAppLockSetting',
    'usAppLockSettingLabel','usAppLockSettingDetail','usFeedbackValue',
    'usMauditSetting','usCoupleIdCard','usCoupleAvatars','usCoupleNames',
    'usTogetherLine','usSettingsBondLevel','usSettingsMomentsCount',
    'usSettingsEventsCount','usRelationshipDateValue','usStoryArchiveValue',
    'usLocationState','usDistanceUnitValue','usOptimizeRicordiSetting',
    'usOptimizeRicordiValue','usSettingsBuild','usSyncValue'
  ]) assert.match(page, new RegExp(`id="${id}"`), id);
});

test('Settings V2 does not expose diagnostics as primary rows', () => {
  const details = page.match(/<details class="us-settings-app-details">[\s\S]*?<\/details>/)?.[0] || '';
  assert.match(details, /data-us-setting="sync-status"/);
  assert.match(details, /id="usSettingsBuild"/);
  const beforeDetails = page.slice(0, page.indexOf('<details class="us-settings-app-details">'));
  assert.doesNotMatch(beforeDetails, /data-us-setting="sync-status"/);
  assert.doesNotMatch(beforeDetails, /id="usSettingsBuild"/);
});

test('Settings V2 logout explains device-local consequence', () => {
  assert.match(page, /Scollega questo telefono/);
  assert.match(page, /Questo rimuove solo l'accesso da questo telefono/);
});

test('Settings V2 styling is scoped to Settings and keeps global sizing untouched', () => {
  const block = css.split('SETTINGS-CONSUMER-V2')[1] || '';
  assert.notEqual(block, '');
  assert.match(block, /#settings \.us-settings-consumer/);
  assert.match(block, /#settings \.us-settings-app-details/);
  assert.doesNotMatch(block, /(?:^|\n)html\s*\{|(?:^|\n)body\s*\{|\.app\s*\{/);
});

test('Settings action router still owns all retained actions', () => {
  for (const action of ['profile-photo','notifications','app-lock','feedback','maudit','relationship-date','home-photo','story-archive','location','distance','optimize-ricordi','privacy','sync-status','logout']) {
    assert.ok(settings.includes(action), `settings.js still references ${action}`);
  }
});

test('Settings V2 build marker is coherent', () => {
  const version = JSON.parse(read('version.json'));
  const sw = read('service-worker.js');
  assert.equal(version.version, 'us-settings-v2-20261007-1');
  assert.match(sw, /const BUILD_ID = "us-settings-v2-20261007-1";/);
  assert.match(html, /<meta name="us-build" content="us-settings-v2-20261007-1"/);
});
