import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./build-android-brand-assets.ps1', import.meta.url));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = path.join(root, 'android', '.brand-assets.lock');
const deadline = Date.now() + 30_000;

while (true) {
  try {
    mkdirSync(lock);
    break;
  } catch (error) {
    if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

try {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(lock, { recursive: true, force: true });
}
