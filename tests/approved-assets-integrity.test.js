const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets', 'ASSET_MANIFEST.json');
const STATUSES = new Set(['APPROVED', 'DRAFT', 'DEPRECATED']);
const SHA256 = /^[a-f0-9]{64}$/;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readManifest(file = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function verifyApprovedAssets(manifest, root) {
  assert.ok(Array.isArray(manifest.assets), 'assets deve essere un array');

  for (const asset of manifest.assets) {
    assert.ok(STATUSES.has(asset.status), `${asset.path}: status non supportato`);
    assert.equal(typeof asset.purpose, 'string', `${asset.path}: purpose obbligatorio`);
    assert.ok(Array.isArray(asset.usedBy), `${asset.path}: usedBy deve essere un array`);
    if (asset.status !== 'APPROVED') continue;

    assert.equal(asset.immutable, true, `${asset.path}: APPROVED richiede immutable: true`);
    assert.match(asset.sha256 || '', SHA256, `${asset.path}: APPROVED richiede uno sha256 valido`);

    const target = path.resolve(root, asset.path);
    assert.ok(target.startsWith(`${root}${path.sep}`), `${asset.path}: path fuori dalla root`);
    assert.ok(fs.existsSync(target), `${asset.path}: asset APPROVED mancante`);
    assert.equal(sha256(target), asset.sha256, `${asset.path}: SHA-256 non corrisponde`);
  }
}

function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'us-approved-assets-'));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('il manifest di authority e gli asset APPROVED correnti superano il gate', () => {
  verifyApprovedAssets(readManifest(), ROOT);
});

test('un asset APPROVED con hash corretto passa il gate', () => withFixture((root) => {
  const asset = path.join(root, 'assets', 'source', 'brand', 'wordmark.svg');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  fs.writeFileSync(asset, '<svg/>');

  assert.doesNotThrow(() => verifyApprovedAssets({
    assets: [{
      path: 'assets/source/brand/wordmark.svg',
      status: 'APPROVED',
      sha256: sha256(asset),
      immutable: true,
      purpose: 'Approved wordmark master',
      usedBy: []
    }]
  }, root));
}));

test('ogni record asset conserva purpose e usedBy nel manifest', () => {
  assert.throws(() => verifyApprovedAssets({
    assets: [{
      path: 'assets/source/ui/draft.svg',
      status: 'DRAFT',
      sha256: null,
      immutable: false
    }]
  }, ROOT), /purpose/);
});

test('un hash alterato o un file mancante fanno fallire solo gli asset APPROVED', () => withFixture((root) => {
  const asset = path.join(root, 'assets', 'source', 'ui', 'approved.svg');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  fs.writeFileSync(asset, '<svg/>');

  const approved = {
    path: 'assets/source/ui/approved.svg',
    status: 'APPROVED',
    sha256: '0'.repeat(64),
    immutable: true,
    purpose: 'Approved icon master',
    usedBy: []
  };
  assert.throws(() => verifyApprovedAssets({ assets: [approved] }, root), /SHA-256 non corrisponde/);
  assert.throws(() => verifyApprovedAssets({
    assets: [{ ...approved, path: 'assets/source/ui/missing.svg' }]
  }, root), /asset APPROVED mancante/);

  assert.doesNotThrow(() => verifyApprovedAssets({
    assets: [
      { ...approved, status: 'DRAFT' },
      { ...approved, status: 'DEPRECATED', path: 'assets/source/ui/missing.svg' }
    ]
  }, root));
}));
