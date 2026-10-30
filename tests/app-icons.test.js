// App icons (Premi Sintonia V2, 29/10/2026): Notte (13), Oro (18) and Neon
// (US Plus, 7) next to the usual icon, picked on this phone. Each icon is a
// launcher activity-alias of the app; exactly one is enabled. The default one
// keeps the old launcher name .MainActivity, so the icon already on a home
// screen survives the update; the real screen is now UsActivity.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const ICONS = { night: 'LauncherNight', gold: 'LauncherGold', neon: 'LauncherNeon' };

test('the manifest: the screen opens no launcher itself, four aliases do, only the usual one starts enabled', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const activity = /<activity\b[^>]*android:name="\.UsActivity"[\s\S]*?<\/activity>/.exec(manifest)?.[0];
  assert.ok(activity, 'UsActivity');
  assert.doesNotMatch(activity, /android\.intent\.category\.LAUNCHER/, 'the launcher entries are the aliases');
  assert.match(activity, /android:host="\$\{usInviteHost\}" android:path="\/invito"/, 'App Links stay on the screen');
  const aliases = [...manifest.matchAll(/<activity-alias\b([\s\S]*?)<\/activity-alias>/g)].map((m) => m[1]);
  assert.equal(aliases.length, 4);
  const attr = (a, name) => new RegExp(`android:${name}="([^"]+)"`).exec(a)?.[1];
  assert.deepEqual(aliases.map((a) => [attr(a, 'name'), attr(a, 'enabled'), attr(a, 'targetActivity')]), [
    ['.MainActivity', 'true', '.UsActivity'], ['.LauncherNight', 'false', '.UsActivity'], ['.LauncherGold', 'false', '.UsActivity'], ['.LauncherNeon', 'false', '.UsActivity']
  ]);
  for (const a of aliases) assert.match(a, /android\.intent\.action\.MAIN[\s\S]*android\.intent\.category\.LAUNCHER/);
  for (const [id, alias] of Object.entries(ICONS)) {
    const a = aliases.find((x) => attr(x, 'name') === `.${alias}`);
    assert.equal(attr(a, 'icon'), `@mipmap/ic_launcher_${id}`);
    const xml = read(`android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_${id}.xml`);
    assert.match(xml, new RegExp(`<background android:drawable="@drawable/us_launcher_bg_${id}"/>`));
    assert.match(xml, new RegExp(`<foreground android:drawable="@drawable/us_launcher_fg_${id}"/>`));
    for (const part of ['fg', 'bg']) assert.ok(fs.statSync(path.join(ROOT, `android/app/src/main/res/drawable-nodpi/us_launcher_${part}_${id}.webp`)).size < 32 * 1024);
  }
});

test('the plugin switches among a closed list, enabling the new entry before the others go off', () => {
  const java = read('native-plugins/us-app-icon/android/src/main/java/com/usapp/appicon/UsAppIconPlugin.java');
  assert.match(java, /@CapacitorPlugin\(name = "UsAppIcon"\)/);
  assert.match(java, /static final String\[\] IDS = \{ "us", "night", "gold", "neon" \};/);
  assert.match(java, /static final String\[\] ALIASES = \{ "\.MainActivity", "\.LauncherNight", "\.LauncherGold", "\.LauncherNeon" \};/);
  const set = java.slice(java.indexOf('public void set('));
  assert.ok(set.indexOf('COMPONENT_ENABLED_STATE_ENABLED') < set.indexOf('COMPONENT_ENABLED_STATE_DISABLED'), 'never zero launchers');
  assert.match(set, /DONT_KILL_APP/);
  assert.match(read('package.json'), /"@us\/app-icon": "file:native-plugins\/us-app-icon"/);
  assert.match(read('android/capacitor.settings.gradle'), /include ':us-app-icon'/);
  assert.match(read('android/app/capacitor.build.gradle'), /implementation project\(':us-app-icon'\)/);
});

test('the Play bundle check opens only the screen and the icon entries', async () => {
  const { APP_ICON_ALIASES } = await import('../scripts/validate-android-bundle.mjs');
  assert.deepEqual(APP_ICON_ALIASES, ['com.usapp.us.MainActivity', 'com.usapp.us.LauncherNight', 'com.usapp.us.LauncherGold', 'com.usapp.us.LauncherNeon']);
});

test('in the collection: a group of its own, chosen on this phone; Android is told only when the icon changes', () => {
  const p = read('progression.js');
  assert.match(p, /app_icon: \{ pref: 'app_icon', label: 'Icona dell’app'/);
  assert.match(p, /app_icon: \{ id: 'us', title: 'US', description: 'L’icona di sempre\.' \}/);
  assert.match(p, /syncAppIcon\(value\('app_icon'\)\);/);
  assert.match(p, /\.then\(\(current\) => \(current\?\.icon === name \? null : plugin\.set\(\{ icon: name \}\)\)\)/);
  for (const id of ['us', ...Object.keys(ICONS)]) assert.ok(fs.existsSync(path.join(ROOT, `assets/derived/rewards/us-app-icon-${id}-v1.webp`)), id);
});
