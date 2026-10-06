const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

test('Countdown widget is a second native provider on the shared US widget bridge', () => {
  const manifest = read('native-plugins/us-widget-bridge/android/src/main/AndroidManifest.xml');
  const bridge = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetBridgePlugin.java');
  const provider = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsCountdownWidgetProvider.java');
  const info = read('native-plugins/us-widget-bridge/android/src/main/res/xml/us_widget_countdown_info.xml');
  assert.match(manifest, /UsCountdownWidgetProvider/);
  assert.match(manifest, /@xml\/us_widget_countdown_info/);
  assert.match(bridge, /UsCountdownWidgetProvider\.updateAll/);
  assert.match(info, /android:targetCellWidth="2"/);
  assert.match(info, /android:updatePeriodMillis="1800000"/);
  assert.match(provider, /Europe\/Rome/);
  assert.match(provider, /setChronometerCountDown/);
  assert.match(provider, /us:\/\/widget\/countdown\/open/);
});

test('native snapshot contract carries semantic Countdown state, not rendered/private data', () => {
  const platform = read('platform.js');
  const store = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetSnapshotStore.java');
  const coordinator = read('ti-penso-widget.js');
  const countdown = read('countdown.js');
  assert.match(platform, /countdown:\s*\{/);
  assert.match(platform, /active: countdown\.active === true/);
  assert.match(store, /put\("countdown", countdown\)/);
  assert.match(store, /mode\.equals\("relationship"\)/);
  assert.match(coordinator, /publishCountdown/);
  assert.match(coordinator, /us:countdown-updated/);
  assert.match(countdown, /api\.widgetState=widgetState/);
  assert.doesNotMatch(JSON.stringify([platform, store]), /accessToken|refreshToken/);
});

test('Countdown widget state distinguishes relationship, civil-day and absolute-clock targets', () => {
  const countdown = read('countdown.js');
  assert.match(countdown, /mode:'relationship',target:state\.started_on/);
  assert.match(countdown, /mode:e\.mode\|\|''/);
  const provider = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsCountdownWidgetProvider.java');
  assert.match(provider, /LocalDate\.now\(ROME\)/);
  assert.match(provider, /Instant\.parse\(target\)/);
  assert.match(provider, /remaining < DAY_MS/);
});

test('tap on Countdown opens the app through the existing native URL bridge', () => {
  const coordinator = read('ti-penso-widget.js');
  assert.match(coordinator, /url\.pathname === '\/countdown\/open'/);
  assert.match(coordinator, /USCountdown\?\.open/);
  assert.match(coordinator, /window\.go === 'function'/);
});

test('Countdown can be pinned directly from the foreground app, bypassing OEM picker discovery', () => {
  const plugin = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetBridgePlugin.java');
  const platform = read('platform.js');
  const countdown = read('countdown.js');
  const html = read('index.html');
  assert.match(plugin, /@PluginMethod\s+public void pinCountdownWidget/);
  assert.match(plugin, /isRequestPinAppWidgetSupported\(\)/);
  assert.match(plugin, /requestPinAppWidget\(provider, null, null\)/);
  assert.match(plugin, /UsCountdownWidgetProvider\.class/);
  assert.match(platform, /async function pinCountdownWidget\(\)/);
  assert.match(countdown, /UsPlatform\.pinCountdownWidget/);
  assert.match(countdown, /UsThinkWidget\?\.syncCountdown/);
  assert.match(html, /id="usCountdownPin"/);
});
