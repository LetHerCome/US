// N3.5 Native Performance & UX Polish — static contract guards.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('N3.5 navigation paints before heavy page hydration', () => {
  const app = read('app.js');
  assert.match(app, /function schedulePageHydration\(id,\{force=false\}=\{\}\)/);
  assert.match(app, /requestAnimationFrame\(\(\)=>setTimeout\(/);
  assert.match(app, /schedulePageHydration\(id,\{force:true\}\);\n    return;/);
  assert.match(app, /scrollTo\([\s\S]*?schedulePageHydration\(id\);\n}/);
  assert.doesNotMatch(app, /if\(id==='moments' && window\.usProfile\) hydrateMoments\(\)/);
});

test('N3.5 Ricordi foreground keeps valid media cache and overlaps signing with archive reads', () => {
  const app = read('app.js');
  assert.match(app, /if\(active==='moments'\)\{await hydrateMoments\(\);return;\}/);
  assert.doesNotMatch(app, /hydrateMoments\(\{forceMedia:Boolean\(options\.foreground\)\}\)/);
  assert.match(app, /const signedUrlsPromise=usGetSignedUrls\(mediaPaths,21600\)/);
  assert.match(app, /Promise\.all\(\[profilesPromise,livedPromise,keptPromise,eventsPromise,provenancePromise,signedUrlsPromise\]\)/);
});

test('N3.5 native Ricordi prewarm is bounded and respects data saver', () => {
  const app = read('app.js');
  assert.match(app, /async function usPrewarmNativeMomentMedia\(limit=4\)/);
  assert.match(app, /connection\?\.saveData/);
  assert.match(app, /\.limit\(limit\)/);
  assert.match(app, /fetchPriority='low'/);
});

test('N3.5 new private media paths are long-cache immutable uploads', () => {
  const app = read('app.js');
  const albums = read('moments-albums.js');
  assert.doesNotMatch(app, /cacheControl:'3600'/);
  assert.doesNotMatch(albums, /cacheControl:'3600'/);
  assert.ok((app.match(/cacheControl:'31536000'/g) || []).length >= 2);
  assert.match(albums, /cacheControl:'31536000'/);
});

test('N3.5 Android uses normal text IME hints and ships no in-app emoji substitute', () => {
  const platform = read('platform.js');
  const app = read('app.js');
  const css = read('styles.css');
  assert.match(platform, /classList\?\.add\('us-native'\)/);
  assert.match(platform, /us-native-\$\{platformName\}/);
  assert.match(app, /function normalizeAndroidNaturalTextInputs/);
  assert.match(app, /setAttribute\('inputmode','text'\)/);
  assert.match(app, /setAttribute\('autocorrect','on'\)/);
  assert.match(app, /setAttribute\('spellcheck','true'\)/);
  assert.doesNotMatch(app, /installNativeEmojiAssist|usNativeEmojiTrigger|const emojis=/);
  assert.doesNotMatch(css, /us-native-emoji-trigger|us-native-emoji-panel/);
});

test('N3.5 Ricordi prioritizes above-fold media and quick tab revisits avoid redundant heavy hydration', () => {
  const app = read('app.js');
  assert.match(app, /US_HEAVY_PAGE_HYDRATION_FRESH_MS=15000/);
  assert.match(app, /visiblePhotoIndex\+\+<2/);
  assert.match(app, /fetchpriority="high"/);
  assert.match(app, /loading="\$\{priority\?'eager':'lazy'\}"/);
});

test('N3.5 Android native WebView normalizes only ordinary web-edit text for the IME', () => {
  const webView = read('android/app/src/main/java/com/usapp/us/UsWebView.java');
  const layout = read('android/app/src/main/res/layout/capacitor_bridge_layout_main.xml');
  assert.match(webView, /extends CapacitorWebView/);
  assert.match(webView, /super\.onCreateInputConnection\(outAttrs\)/);
  assert.match(webView, /variation == InputType\.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT/);
  assert.match(webView, /InputType\.TYPE_TEXT_VARIATION_NORMAL/);
  assert.match(webView, /~InputType\.TYPE_TEXT_FLAG_NO_SUGGESTIONS/);
  assert.doesNotMatch(webView, /TYPE_TEXT_VARIATION_PASSWORD\s*==|TYPE_TEXT_VARIATION_EMAIL_ADDRESS\s*==/);
  assert.match(layout, /<com\.usapp\.us\.UsWebView/);
  assert.match(layout, /android:id="@\+id\/webview"/);
});

test('N3.5 native density/render guardrails are scoped to native', () => {
  const css = read('styles.css');
  assert.match(css, /html\.us-native\{/);
  assert.match(css, /text-size-adjust:100%/);
  assert.match(css, /html\.us-native \.moment-grid \.moment-card/);
  assert.match(css, /content-visibility:auto/);
});

test('N3.5 shell build id advances so PWA clients can receive shared performance fixes', () => {
  const sw = read('service-worker.js');
  const version = JSON.parse(read('version.json'));
  assert.equal(version.version, 'us-ricordi-thumbnails-v1-20261007-1');
  assert.match(sw, /const BUILD_ID = "us-ricordi-thumbnails-v1-20261007-1";/);
});
