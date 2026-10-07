// N3.5 Native Performance & UX Polish — static contract guards.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('N3.5 navigation paints before heavy page hydration', () => {
  const app = read('app.js');
  assert.match(app, /function schedulePageHydration\(id\)/);
  assert.match(app, /requestAnimationFrame\(\(\)=>setTimeout\(/);
  assert.match(app, /schedulePageHydration\(id\);\n}/);
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
  assert.match(app, /compressImageFile\(file,\{maxDimension:1600,quality:\.80\}\)/);
  assert.match(albums, /compressor\(pendingFile,\{maxDimension:1600,quality:\.80\}\)/);
});

test('N3.5 Android does not ship an in-app emoji replacement', () => {
  const app = read('app.js');
  const css = read('styles.css');
  assert.doesNotMatch(app, /installNativeEmojiAssist|usNativeEmojiTrigger|const emojis=/);
  assert.doesNotMatch(css, /us-native-emoji-(trigger|panel)/);
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
  assert.equal(version.version, 'us-native-ux-polish-v1b-20261007-1');
  assert.match(sw, /const BUILD_ID = "us-native-ux-polish-v1b-20261007-1";/);
});


test('N3.5 all local JS/CSS asset query versions match the build marker', () => {
  const html = read('index.html');
  const build = html.match(/name="us-build" content="([^"]+)"/)?.[1];
  assert.ok(build);
  const versions = [...html.matchAll(/(?:src|href)="\/[^"]+\.(?:js|css)\?v=([^"]+)"/g)].map((m) => m[1]);
  assert.ok(versions.length > 10);
  assert.ok(versions.every((value) => value === build), JSON.stringify([...new Set(versions)]));
});
