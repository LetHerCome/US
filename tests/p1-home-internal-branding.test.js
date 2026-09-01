const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MASTER = 'assets/source/brand/us-symbol-master-v1.png';
const SOURCE = 'assets/source/brand/us-wordmark-v1.png';
const DERIVATIVE = 'assets/derived/brand/us-symbol-ui-crisp-v1.png';
const LEGACY_LOCK = 'assets/derived/.web-brand-assets.lock';
const MASTER_SHA256 = 'bcbb3f3060edd5cf7218f245e1b56053de2c011ea5244e49f9e5f325269d28fd';
const PHOSPHOR_HEART_REGULAR_PATH = 'M178,40c-20.65,0-38.73,8.88-50,23.89C116.73,48.88,98.65,40,78,40a62.07,62.07,0,0,0-62,62c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,228.66,240,172,240,102A62.07,62.07,0,0,0,178,40ZM128,214.8C109.74,204.16,32,155.69,32,102A46.06,46.06,0,0,1,78,56c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,155.61,146.24,204.15,128,214.8Z';
const PHOSPHOR_HEART_FILL_PATH = 'M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z';
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');

test('P1 usa un monogramma US netto senza glow diffuso e senza alterare i source approvati', () => {
  const approvedDerivativeMtime = fs.statSync(path.join(ROOT, DERIVATIVE)).mtimeMs;
  execFileSync(process.execPath, ['scripts/build-web-brand-assets.mjs'], { cwd: ROOT });
  const firstHash = hash(DERIVATIVE);
  execFileSync(process.execPath, ['scripts/build-web-brand-assets.mjs'], { cwd: ROOT });
  assert.equal(hash(MASTER), MASTER_SHA256);
  assert.equal(hash(SOURCE), 'e8e3007c9ada499e4fc68aa68179d6e4046d21df14351e6c7144bca5d8b28f97');
  assert.ok(fs.existsSync(path.join(ROOT, DERIVATIVE)), 'derivative web mancante');
  assert.equal(hash(DERIVATIVE), firstHash, 'la derivative deve essere deterministica');

  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const derivative = manifest.assets.find((asset) => asset.path === DERIVATIVE);
  assert.ok(derivative, 'derivative non registrata nel manifest');
  assert.equal(derivative.status, 'APPROVED');
  assert.equal(derivative.immutable, true);
  assert.equal(derivative.sha256, hash(DERIVATIVE));
  assert.equal(derivative.source, SOURCE);
  assert.equal(derivative.sourceSha256, hash(SOURCE));
  assert.equal(derivative.operation, 'REMOVE_LOW_ALPHA_GLOW_PRESERVE_US_GEOMETRY');
  assert.equal(
    fs.statSync(path.join(ROOT, DERIVATIVE)).mtimeMs,
    approvedDerivativeMtime,
    'il build deve verificare la derivative APPROVED senza sovrascriverla'
  );
  const alpha = execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.Drawing; $image=[System.Drawing.Bitmap]::FromFile('${path.join(ROOT, DERIVATIVE).replace(/\\/g, '\\\\')}'); try { if($image.GetPixel(0,0).A -ne 0){ exit 1 }; for($y=0;$y -lt $image.Height;$y+=8){ for($x=0;$x -lt $image.Width;$x+=8){ $a=$image.GetPixel($x,$y).A; if($a -gt 0 -and $a -lt 64){ exit 1 } } } } finally { $image.Dispose() }`
  ]);
  assert.equal(alpha.length, 0);
});

test('P1 recupera gli artefatti di verifica interrotti senza copiarli negli asset distribuiti', () => {
  const lockPath = path.join(ROOT, LEGACY_LOCK);
  const strandedCandidate = path.join(ROOT, `${DERIVATIVE}.verify-4242.tmp`);
  fs.mkdirSync(lockPath, { recursive: true });
  fs.writeFileSync(strandedCandidate, 'interrupted verification');

  execFileSync(process.execPath, ['scripts/build-web-brand-assets.mjs'], {
    cwd: ROOT,
    timeout: 10_000
  });

  assert.equal(fs.existsSync(lockPath), false, 'il lock legacy deve essere recuperato');
  assert.equal(fs.existsSync(strandedCandidate), false, 'i candidate legacy non devono entrare negli asset distribuiti');
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, 'assets/derived/brand')).filter((name) => name.includes('.verify-')),
    [],
    'nessun artefatto di verifica deve restare sotto assets/derived'
  );
});

test('P1 integra il monogramma US netto in auth, header e mini-branding', () => {
  const html = read('index.html');
  assert.equal((html.match(/assets\/derived\/brand\/us-symbol-ui-crisp-v1\.png/g) || []).length, 3);
  assert.doesNotMatch(html, /assets\/derived\/brand\/us-symbol-ui-transparent-v1\.png/);
  assert.doesNotMatch(html, /assets\/brand\/us-wordmark-premium\.svg/);
});

test('P1 usa esclusivamente Heart e HeartFill Phosphor per la CTA Ti Penso', () => {
  const html = read('index.html');
  const registry = JSON.parse(read('assets/ICON_REGISTRY.json'));
  const thinkButton = html.match(/<button[^>]+id="thinkButton"[\s\S]*?<\/button>/)?.[0] || '';
  const thinkOff = read('assets/icons/think-off.svg');
  const thinkOn = read('assets/icons/think-on.svg');
  const thinkAuthority = registry.icons.find((icon) => icon.id === 'think-heart');
  const legacyAuthority = registry.icons.find((icon) => icon.id === 'ti-penso');
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const legacyAsset = manifest.assets.find((asset) => asset.path === 'assets/source/ui/us-icon-ti-penso-v1.png');
  assert.doesNotMatch(thinkButton, /us-icon-ti-penso-v1\.png/);
  assert.match(thinkButton, /assets\/icons\/think-off\.svg/);
  assert.match(thinkButton, /assets\/icons\/think-on\.svg/);
  assert.match(thinkOff, /Phosphor Icons Heart,/);
  assert.ok(thinkOff.includes(PHOSPHOR_HEART_REGULAR_PATH), 'OFF deve usare la geometria Heart ufficiale');
  assert.match(thinkOn, /Phosphor Icons HeartFill,/);
  assert.ok(thinkOn.includes(PHOSPHOR_HEART_FILL_PATH), 'ON deve usare la geometria HeartFill ufficiale');
  assert.equal(thinkAuthority?.phosphorName, 'Heart / HeartFill');
  assert.deepEqual(legacyAuthority?.usedBy, ['android-ti-penso-widget']);
  assert.deepEqual(legacyAsset?.usedBy, ['android-ti-penso-widget']);
});

test('P1 precarica il simbolo web e non mantiene la vecchia icona Ti Penso come asset shell', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /"\/assets\/derived\/brand\/us-symbol-ui-crisp-v1\.png"/);
  assert.doesNotMatch(worker, /"\/assets\/derived\/brand\/us-symbol-ui-transparent-v1\.png"/);
  assert.doesNotMatch(worker, /"\/assets\/source\/ui\/us-icon-ti-penso-v1\.png"/);
});
