// Audit 05/11/2026, punto 4: the code US takes from cdn.jsdelivr.net must carry
// Subresource Integrity, so an altered file never runs with the user's session.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const SUPABASE_TAG = /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@([0-9.]+)\/dist\/umd\/supabase\.js" integrity="(sha384-[A-Za-z0-9+/=]+)" crossorigin="anonymous"><\/script>/;

test('supabase-js: the PWA loads the pinned UMD file with integrity, the same as the deletion page', () => {
  const pin = JSON.parse(read('package.json')).dependencies['@supabase/supabase-js'];
  const app = read('index.html').match(SUPABASE_TAG);
  assert.ok(app, 'index.html: the supabase-js tag has the explicit path, integrity and crossorigin');
  assert.equal(app[1], pin, 'same version as package.json');
  const deletion = read('elimina-account.html').match(SUPABASE_TAG);
  assert.ok(deletion, 'elimina-account.html keeps its integrity');
  assert.equal(deletion[2], app[2], 'one hash for one file');
  assert.equal((read('index.html').match(/cdn\.jsdelivr\.net\/npm\/@supabase/g) || []).length, 1, 'no second, unchecked copy');
});

test('supabase-js: the hash is the one of the file in node_modules (jsDelivr serves the npm file as is)', (t) => {
  const file = path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
  if (!fs.existsSync(file)) return t.skip('node_modules not installed');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'package.json'), 'utf8'));
  assert.equal(pkg.version, JSON.parse(read('package.json')).dependencies['@supabase/supabase-js']);
  const expected = `sha384-${crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64')}`;
  assert.equal(read('index.html').match(SUPABASE_TAG)[2], expected);
});

test('MapLibre: script and stylesheet are injected with integrity and anonymous CORS', () => {
  const source = read('ricordi-place.js');
  assert.match(source, /const MAPLIBRE_JS = 'https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl@5\.24\.0\/dist\/maplibre-gl\.js';/, 'a new version needs new hashes');
  assert.match(source, /const MAPLIBRE_JS_SRI = 'sha256-[A-Za-z0-9+/]{43}=';/);
  assert.match(source, /const MAPLIBRE_CSS_SRI = 'sha256-[A-Za-z0-9+/]{43}=';/);
  assert.match(source, /css\.integrity = MAPLIBRE_CSS_SRI; css\.crossOrigin = 'anonymous';/);
  assert.match(source, /script\.integrity = MAPLIBRE_JS_SRI;[^\n]*script\.crossOrigin = 'anonymous';/);
});

test('native bundle: the whole CDN tag becomes the local copy', () => {
  const script = read('scripts/build-capacitor-web.mjs');
  const swap = script.match(/\.replace\((\/<script defer src="https:[^\n]+\/), '<script defer src="\/vendor\/supabase\.js"><\/script>'\)/);
  assert.ok(swap, 'the swap matches the full tag');
  // eslint-disable-next-line no-eval
  const pattern = eval(swap[1]);
  const tag = read('index.html').match(SUPABASE_TAG)[0];
  assert.equal(tag.replace(pattern, '<script defer src="/vendor/supabase.js"></script>'), '<script defer src="/vendor/supabase.js"></script>');
  assert.match(script, /html\.includes\(sourceCdn\) \|\|/, 'the build fails if the CDN survives');
});
