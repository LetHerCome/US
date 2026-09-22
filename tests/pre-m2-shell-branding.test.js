const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const BRAND = 'assets/derived/brand/us-symbol-apk-foreground-v1.png';

test('Settings usa lo stesso opener ricollocato nella root Noi, non nella topbar', () => {
  const html = read('index.html');
  const top = html.match(/<div class="top us-premium-top">[\s\S]*?<\/div>\s*<main id="home"/)?.[0] || '';
  const noi = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';

  assert.doesNotMatch(top, /id="usSettingsEntry"/);
  assert.match(noi, /id="usSettingsEntry"/);
  assert.match(noi, /onclick="go\('settings',\{nav:true\}\)"/);
  assert.match(noi, /us-calendar-btn/);
  assert.doesNotMatch(html, /data-page="settings"/);
});

test('il branding PWA usa il foreground ufficiale già derivato per Android', () => {
  const html = read('index.html');
  const webManifest = JSON.parse(read('manifest.webmanifest'));
  const assetManifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const asset = assetManifest.assets.find((entry) => entry.path === BRAND);
  assert.deepEqual(asset, {
    path: BRAND,
    status: 'APPROVED',
    sha256: 'f71c0cf6cbca172b7833754f6eaa2b4addfab6381a696bdccf070d83ea690868',
    immutable: true,
    purpose: 'Byte-identical Web/PWA derivative of the official Android adaptive foreground',
    usedBy: ['auth-branding', 'home-header-branding', 'settings-branding', 'pwa-install-branding'],
    source: 'android/app/src/main/res/drawable-nodpi/us_adaptive_foreground_v1.png',
    sourceSha256: 'f71c0cf6cbca172b7833754f6eaa2b4addfab6381a696bdccf070d83ea690868',
    operation: 'BYTE_COPY_OFFICIAL_ANDROID_FOREGROUND'
  });
  assert.equal(webManifest.background_color, '#08040E');
  assert.equal(webManifest.theme_color, '#08040E');
  assert.ok(webManifest.icons.every((icon) => icon.src.startsWith(`/${BRAND}`)));
  assert.match(html, new RegExp(`rel="icon"[^>]+href="/${BRAND}`));
  assert.match(html, new RegExp(`rel="apple-touch-icon"[^>]+href="/${BRAND}`));
});

test('il foreground branding web è una copia byte-identica del derivato Android ufficiale', () => {
  const source = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/drawable-nodpi/us_adaptive_foreground_v1.png'));
  const web = fs.readFileSync(path.join(ROOT, BRAND));
  assert.deepEqual(web, source);
});
