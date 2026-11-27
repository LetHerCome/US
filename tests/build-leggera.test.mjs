// Build più leggera e cache sicura (audit 27/11/2026).
// 1. The production bundle stamps <release>-<hash> by itself (scripts/build-id.mjs):
//    the service worker serves ?v=<BUILD_ID> cache-first, so a runtime change
//    with the old id never reached installed phones.
// 2. Masters, retired approved art and the unloaded star catalogue stay in the
//    repository but are not copied into the APK or the site.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { UNSHIPPED_ASSETS, assetCopyFilter, shipsAsset } from '../scripts/build-asset-filter.mjs';
import { bundleHash, productionBuildId, releaseBase, stampBuild } from '../scripts/build-id.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('build id: <release>-<10 hex of the bundle>, the same for the same files, new for any change', () => {
  const worker = read('service-worker.js');
  const base = releaseBase(worker);
  const files = [['app.js', Buffer.from('a')], ['index.html', Buffer.from('b')]];
  const id = productionBuildId(worker, bundleHash(files));
  assert.match(id, new RegExp(`^${base}-[a-f0-9]{10}$`));
  assert.equal(productionBuildId(worker, bundleHash([...files].reverse())), id, 'order does not matter');
  assert.notEqual(productionBuildId(worker, bundleHash([['app.js', Buffer.from('a2')], files[1]])), id, 'one byte, a new id');
  assert.notEqual(productionBuildId(worker, bundleHash([['app2.js', Buffer.from('a')], files[1]])), id, 'a renamed file, a new id');
  assert.throws(() => productionBuildId(worker, 'nothex'), /hash/);
});

test('build id: stamped in index (meta and every ?v=), worker, manifest and version.json', () => {
  const worker = read('service-worker.js');
  const base = releaseBase(worker);
  const id = `${base}-0123456789`;
  const out = stampBuild({ index: read('index.html'), worker, manifest: read('manifest.webmanifest') }, id);
  assert.match(out.index, new RegExp(`<meta name="us-build" content="${id}"/>`));
  const versions = [...out.index.matchAll(/\?v=([^"'&\s>]+)/g)].map((m) => m[1]);
  assert.ok(versions.length > 40);
  assert.deepEqual([...new Set(versions)], [id]);
  assert.match(out.worker, new RegExp(`const BUILD_ID = "${id}";`));
  assert.deepEqual([...new Set([...out.manifest.matchAll(/\?v=([^"]+)/g)].map((m) => m[1]))], [id]);
  assert.deepEqual(JSON.parse(out.version), { version: id });
  assert.throws(() => stampBuild({ index: '<p>', worker, manifest: '' }, id), /us-build meta/);
});

test('build id: the production build stamps before minify; staging keeps appending -s<commit>', () => {
  const src = read('scripts/build-cloudflare-pages.mjs');
  assert.match(src, /productionBuildId\(worker, bundleHash\(bundle\)\)/);
  assert.ok(src.indexOf('stampBuild(') < src.indexOf("const html = await readFile(path.join(OUTPUT, 'index.html'), 'utf8');"), 'stamped before the reference check');
  assert.match(read('package.json'), /"build:cloudflare-pages": "node scripts\/build-cloudflare-pages\.mjs && node scripts\/minify-web\.mjs dist\/cloudflare-pages"/);
  assert.match(read('scripts/build-s31-staging-preview.mjs'), /return `\$\{base\}-s\$\{tag\}`/);
});

test('assets: masters, retired approved art and the star catalogue are not shipped', () => {
  for (const file of [
    'assets/source', 'assets/source/brand/us-symbol-master-v1.png',
    'assets/derived/pet/us-pet-goat-awake-v1.webp',
    'assets/derived/runtime/us-icon-settings-128-v1.png',
    'assets/derived/runtime/us-icon-stories-128-v1.png',
    'assets/data/stars-bsc5-v1.json'
  ]) assert.equal(shipsAsset(file), false, file);
  for (const file of ['assets', 'assets/derived/runtime/us-symbol-256-v1.png', 'assets/icons/phosphor/house-fill.svg', 'assets/fonts', 'assets/derived/rewards']) {
    assert.equal(shipsAsset(file), true, file);
  }
  const filter = assetCopyFilter(ROOT);
  assert.equal(filter(path.join(ROOT, 'assets', 'source')), false);
  assert.equal(filter(path.join(ROOT, 'assets', 'icons')), true);
  for (const script of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) {
    const src = read(script);
    assert.match(src, /'assets'\), \{ recursive: true, filter: assetCopyFilter\(ROOT\) \}\)/, `${script} filters assets/`);
    assert.doesNotMatch(src, /stars-bsc5/, `${script} does not copy the star catalogue`);
  }
});

test('assets: what is not shipped is approved (kept on purpose) or a master, and the app never asks for it', () => {
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  for (const entry of UNSHIPPED_ASSETS.filter((item) => !item.endsWith('/') && !item.startsWith('assets/data/'))) {
    assert.equal(manifest.assets.find((asset) => asset.path === entry)?.status, 'APPROVED', `${entry} is approved, so it stays in the repository`);
    assert.ok(fs.existsSync(path.join(ROOT, entry)), entry);
  }
  const runtime = fs.readdirSync(ROOT).filter((name) => /\.(js|css|html|webmanifest)$/.test(name) && name !== 'sky.js');
  const offenders = [];
  for (const name of runtime) {
    const source = read(name);
    for (const entry of UNSHIPPED_ASSETS) if (source.includes(entry.replace(/\/$/, ''))) offenders.push(`${name}: ${entry}`);
  }
  assert.deepEqual(offenders, [], 'no runtime file names an asset the builds leave out');
});
