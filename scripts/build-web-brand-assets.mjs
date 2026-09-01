import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
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

const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
  stdio: 'inherit'
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
