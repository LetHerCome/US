import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUTPUT = path.join(ROOT, 'dist', 'cloudflare-pages');

async function exists(relative) {
  return Boolean(await stat(path.join(OUTPUT, relative)).catch(() => null));
}

test('Cloudflare Pages bundle is a curated host-agnostic PWA', async () => {
  execFileSync(process.execPath, ['scripts/build-cloudflare-pages.mjs'], {
    cwd: ROOT,
    stdio: 'pipe'
  });

  for (const required of [
    'index.html',
    'app.js',
    'progression.js',
    'progression.css',
    'manifest.webmanifest',
    'service-worker.js',
    'version.json',
    '_headers',
    'assets'
  ]) {
    assert.equal(await exists(required), true, `missing ${required}`);
  }

  for (const forbidden of [
    'package.json',
    'package-lock.json',
    'AGENTS.md',
    'supabase',
    'tests',
    'android',
    'docs',
    'native-plugins'
  ]) {
    assert.equal(await exists(forbidden), false, `must not publish ${forbidden}`);
  }

  const app = await readFile(path.join(OUTPUT, 'app.js'), 'utf8');
  assert.match(app, /emailRedirectTo:location\.origin\+'\/'/);
  assert.doesNotMatch(app, /usfinal\.vercel\.app/i);

  const serviceWorker = await readFile(path.join(OUTPUT, 'service-worker.js'), 'utf8');
  assert.match(serviceWorker, /self\.location\.origin/);

  const headers = await readFile(path.join(OUTPUT, '_headers'), 'utf8');
  assert.match(headers, /\/service-worker\.js[\s\S]*no-cache, no-store/);
  assert.match(headers, /\/version\.json[\s\S]*no-cache, no-store/);
});
