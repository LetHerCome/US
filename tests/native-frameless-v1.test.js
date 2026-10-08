// Frameless V1: platform system bars remain visible while native content
// paints behind them. These checks are platform contracts, not screenshot QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Android: BridgeActivity enables edge-to-edge without hiding status or navigation', () => {
  const activity = read('android/app/src/main/java/com/usapp/us/MainActivity.java');
  assert.match(activity, /extends BridgeActivity/);
  assert.match(activity, /EdgeToEdge\.enable\(this\)/);
  assert.doesNotMatch(activity, /SYSTEM_UI_FLAG_FULLSCREEN|FLAG_FULLSCREEN|SYSTEM_UI_FLAG_HIDE_NAVIGATION/);
});

test('Capacitor 8: CSS safe area insets and visible dark system bars', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.plugins.SystemBars.insetsHandling, 'css');
  assert.equal(config.plugins.SystemBars.initialViewportFitValueHint, 'cover');
  assert.equal(config.plugins.SystemBars.style, 'DARK');
  assert.equal(config.plugins.SystemBars.hidden, false);
  assert.equal(config.ios.contentInset, 'never');
  const html = read('index.html');
  assert.match(html, /viewport-fit=cover/);
});

test('iOS: full viewport behind status bar, no UIKit auto inset; status icons remain visible', () => {
  const bridge = read('ios/App/App/UsBridgeViewController.swift');
  const plist = read('ios/App/App/Info.plist');
  assert.match(bridge, /edgesForExtendedLayout = \[\.all\]/);
  assert.match(bridge, /extendedLayoutIncludesOpaqueBars = true/);
  assert.match(bridge, /scrollView\.contentInsetAdjustmentBehavior = \.never/);
  assert.match(bridge, /launchBackground/);
  assert.match(plist, /<key>UIStatusBarStyle<\/key>\s*<string>UIStatusBarStyleLightContent<\/string>/);
  assert.match(plist, /<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<true\/>/);
});

test('Native CSS: full-bleed Oggi and safe controls, no forced fullscreen', () => {
  const css = read('native-frameless.css');
  const tokens = read('ui-foundation.css');
  const pageStyles = read('styles.css');
  assert.match(css, /html\.us-native #home \{/);
  assert.match(css, /margin-top: calc\(-1 \* var\(--us-safe-top\)\)/);
  assert.match(css, /height: var\(--us-viewport-height, 100dvh\) !important/);
  assert.match(css, /#homeHero:not\(\[data-us-countdown\]\) \.us-oggi-stack/);
  assert.match(css, /#homeHero\[data-us-countdown\]/);
  assert.match(tokens, /--us-safe-top:var\(--safe-area-inset-top,env\(safe-area-inset-top,0px\)\)/);
  assert.match(pageStyles, /\.app\{[^\n]*padding:var\(--us-safe-top\)/);
  assert.doesNotMatch(css, /\bdisplay:\s*none|\bvisibility:\s*hidden|overflow:\s*hidden|position:\s*fixed/);
});

test('Native CSS is staged only in Capacitor, not the shared PWA', () => {
  const nativeBuild = read('scripts/build-capacitor-web.mjs');
  const pwaBuild = read('scripts/build-cloudflare-pages.mjs');
  const html = read('index.html');
  assert.match(nativeBuild, /'native-frameless\.css'/);
  assert.match(nativeBuild, /Native build missing top-chrome\.css anchor/);
  assert.match(nativeBuild, /href="\/native-frameless\.css"/);
  assert.doesNotMatch(pwaBuild, /native-frameless\.css/);
  assert.doesNotMatch(html, /native-frameless\.css/);
  assert.doesNotMatch(read('service-worker.js'), /native-frameless\.css/);
});
