const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const BRAND_MANIFEST = path.join(ROOT, 'android', 'brand-assets-manifest.json');
const SOURCES = [
  'assets/source/brand/us-symbol-master-v1.png',
  'assets/source/brand/app-icon/us-adaptive-foreground-v1.png',
  'assets/source/brand/app-icon/us-adaptive-background-v1.png',
  'assets/source/brand/splash/us-splash-master-v1.png'
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function runBrandBuild() {
  const result = spawnSync(process.execPath, ['scripts/build-android-brand-assets.mjs'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function runBrandBuildAsync() {
  return new Promise((resolve) => {
    const child = require('node:child_process').spawn(process.execPath, ['scripts/build-android-brand-assets.mjs'], {
      cwd: ROOT,
      stdio: 'pipe'
    });
    child.once('close', (code) => resolve(code));
  });
}

test('la build brand Android crea derivative tracciabili e ripetibili senza alterare i master', () => {
  const before = Object.fromEntries(SOURCES.map((source) => [source, sha256(path.join(ROOT, source))]));
  runBrandBuild();
  const first = JSON.parse(fs.readFileSync(BRAND_MANIFEST, 'utf8'));
  const firstHash = sha256(BRAND_MANIFEST);
  runBrandBuild();
  const second = JSON.parse(fs.readFileSync(BRAND_MANIFEST, 'utf8'));

  assert.deepEqual(second, first);
  assert.equal(sha256(BRAND_MANIFEST), firstHash);
  assert.deepEqual(
    Object.fromEntries(SOURCES.map((source) => [source, sha256(path.join(ROOT, source))])),
    before
  );
  assert.deepEqual(Object.keys(first.sources).sort(), SOURCES.sort());
  first.derivatives.forEach(({ path: relativePath, sha256: expectedHash }) => {
    const derivative = path.join(ROOT, relativePath);
    assert.ok(fs.existsSync(derivative), `derivative mancante: ${relativePath}`);
    assert.equal(sha256(derivative), expectedHash, `hash errato: ${relativePath}`);
  });
});

test('due build brand concorrenti completano senza corrompere le risorse', async () => {
  const results = await Promise.all([runBrandBuildAsync(), runBrandBuildAsync()]);
  assert.deepEqual(results, [0, 0]);
  const manifest = JSON.parse(fs.readFileSync(BRAND_MANIFEST, 'utf8'));
  manifest.derivatives.forEach(({ path: relativePath, sha256: expectedHash }) => {
    assert.equal(sha256(path.join(ROOT, relativePath)), expectedHash);
  });
});

test('launcher e splash Android usano soltanto il nuovo set brand', () => {
  runBrandBuild();
  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const baseStyles = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/styles.xml'), 'utf8');
  const v31Styles = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values-v31/styles.xml'), 'utf8');
  const adaptive = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8');

  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  assert.match(adaptive, /@color\/ic_launcher_background/);
  assert.match(adaptive, /@drawable\/us_adaptive_foreground_v1/);
  assert.match(baseStyles, /@drawable\/us_splash_background/);
  assert.match(v31Styles, /windowSplashScreenAnimatedIcon/);
  assert.match(v31Styles, /@drawable\/us_splash_symbol/);
  assert.match(v31Styles, /postSplashScreenTheme/);
});

test('foreground Android deriva dal master trasparente e il launcher non espone sfondo chiaro', () => {
  runBrandBuild();
  const brand = JSON.parse(fs.readFileSync(BRAND_MANIFEST, 'utf8'));
  const foreground = brand.derivatives.find((entry) => entry.path.endsWith('/us_adaptive_foreground_v1.png'));
  assert.ok(foreground, 'foreground adaptive derivato mancante');
  assert.deepEqual(foreground.sources, ['assets/source/brand/us-symbol-master-v1.png']);
  assert.match(foreground.operation, /FIT_CENTER.*TRANSPARENT/i);

  const colors = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/colors.xml'), 'utf8');
  assert.match(colors, /<color name="ic_launcher_background">#08040E<\/color>/);

  const legacy = brand.derivatives.filter((entry) => /mipmap-[^/]+\/ic_launcher(?:_round)?\.png$/.test(entry.path));
  assert.equal(legacy.length, 10);
  legacy.forEach((entry) => {
    assert.deepEqual(entry.sources, ['assets/source/brand/us-symbol-master-v1.png']);
    assert.match(entry.operation, /DARK_08040E/);
  });
});

test('le risorse base Android hanno una sola authority per type e name', () => {
  const values = path.join(ROOT, 'android/app/src/main/res/values');
  const seen = new Map();

  for (const file of fs.readdirSync(values).filter((name) => name.endsWith('.xml'))) {
    const contents = fs.readFileSync(path.join(values, file), 'utf8');
    for (const match of contents.matchAll(/<([a-z-]+)\s+name="([^"]+)"/g)) {
      const key = `${match[1]}:${match[2]}`;
      assert.equal(seen.has(key), false, `risorsa Android duplicata: ${key} in ${seen.get(key)} e ${file}`);
      seen.set(key, file);
    }
  }
});
