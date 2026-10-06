import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./build-web-brand-assets.ps1', import.meta.url));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const derivedRoot = path.join(root, 'assets', 'derived');
const brandRoot = path.join(derivedRoot, 'brand');

// Older revisions wrote coordination state beside shipped assets. Recover those
// bounded legacy artifacts before Capacitor copies assets/derived recursively.
rmSync(path.join(derivedRoot, '.web-brand-assets.lock'), { recursive: true, force: true });
for (const name of readdirSync(brandRoot)) {
  if (/^us-symbol-ui-crisp-v1\.png\.verify-\d+\.tmp$/.test(name)) {
    rmSync(path.join(brandRoot, name), { force: true });
  }
}

// The pixel-level regeneration proof uses System.Drawing (Windows PowerShell).
// Elsewhere (macOS CI for iOS, Linux) verify the committed APPROVED derivative
// and its provenance by hash instead; nothing is regenerated or rewritten.
if (process.platform !== 'win32') {
  const manifest = JSON.parse(readFileSync(path.join(root, 'assets', 'ASSET_MANIFEST.json'), 'utf8'));
  const sha256 = (relative) => createHash('sha256').update(readFileSync(path.join(root, ...relative.split('/')))).digest('hex');
  const entry = (relative) => manifest.assets.find((asset) => asset.path === relative);
  const master = entry('assets/source/brand/us-wordmark-v1.png');
  const derivative = entry('assets/derived/brand/us-symbol-ui-crisp-v1.png');
  for (const item of [master, derivative]) {
    if (!item || item.status !== 'APPROVED' || item.immutable !== true) throw new Error('Approved web brand asset missing from manifest');
    if (sha256(item.path) !== item.sha256) throw new Error(`Approved asset hash mismatch: ${item.path}`);
  }
  if (derivative.source !== master.path || derivative.sourceSha256 !== master.sha256) {
    throw new Error('Approved derivative provenance mismatch: assets/derived/brand/us-symbol-ui-crisp-v1.png');
  }
  console.log('Web brand derivative verified by hash (non-Windows)');
  process.exit(0);
}

const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
  stdio: 'inherit'
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
