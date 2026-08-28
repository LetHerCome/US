const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'dist', 'capacitor');
const MANIFEST = path.join(OUTPUT, 'native-asset-manifest.json');

function runStaging() {
  const result = spawnSync(process.execPath, ['scripts/build-capacitor-web.mjs'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

test('Supabase JS usa lo stesso pin esatto nel browser e nel bundle native', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.dependencies['@supabase/supabase-js'];
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.match(html, new RegExp(`@supabase/supabase-js@${version.replaceAll('.', '\\.')}(?:["'/])`));

  runStaging();
  const nativeHtml = fs.readFileSync(path.join(OUTPUT, 'index.html'), 'utf8');
  assert.match(nativeHtml, /src="\/vendor\/supabase\.js"/);
  assert.doesNotMatch(nativeHtml, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/);
  assert.ok(fs.statSync(path.join(OUTPUT, 'vendor', 'supabase.js')).size > 100000);
});

test('staging pulisce stale files e copia soltanto la allowlist native', () => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, 'stale.txt'), 'stale');

  const manifest = runStaging();
  const files = manifest.files.map((entry) => entry.path);

  assert.equal(fs.existsSync(path.join(OUTPUT, 'stale.txt')), false);
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('app.js'));
  assert.ok(files.includes('platform.js'));
  assert.ok(files.includes('native-entry.js'));
  assert.ok(files.includes('vendor/supabase.js'));
  assert.ok(files.some((file) => file.startsWith('assets/')));
  assert.equal(files.includes('service-worker.js'), false);
  assert.equal(files.includes('manifest.webmanifest'), false);
  assert.equal(files.some((file) => file.startsWith('tests/')), false);
  assert.equal(files.some((file) => file.startsWith('_handoff/')), false);
  assert.equal(files.some((file) => file.startsWith('.git/')), false);
});

test('staging ripetuto produce manifest e bundle hash identici', () => {
  const first = runStaging();
  const firstBytes = fs.readFileSync(MANIFEST);
  const second = runStaging();
  const secondBytes = fs.readFileSync(MANIFEST);

  assert.equal(first.bundleHash, second.bundleHash);
  assert.deepEqual(first.files, second.files);
  assert.equal(
    crypto.createHash('sha256').update(firstBytes).digest('hex'),
    crypto.createHash('sha256').update(secondBytes).digest('hex')
  );
});

test('ogni riferimento locale HTML e CSS dello staging punta a un asset presente', () => {
  const manifest = runStaging();
  const staged = new Set(manifest.files.map((entry) => `/${entry.path}`));
  const html = fs.readFileSync(path.join(OUTPUT, 'index.html'), 'utf8');
  const css = manifest.files
    .filter((entry) => entry.path.endsWith('.css'))
    .map((entry) => fs.readFileSync(path.join(OUTPUT, ...entry.path.split('/')), 'utf8'))
    .join('\n');
  const refs = [
    ...html.matchAll(/(?:src|href)=["'](\/(?!\/)[^"'#?]+)(?:[?#][^"']*)?["']/g),
    ...css.matchAll(/url\(["']?(\/(?!\/)[^"')?#]+)(?:[?#][^"')]*)?["']?\)/g)
  ].map((match) => match[1]);

  assert.ok(refs.length > 20, 'fixture deve esercitare il grafo asset reale');
  refs.forEach((reference) => assert.ok(staged.has(reference), `asset mancante: ${reference}`));
});
