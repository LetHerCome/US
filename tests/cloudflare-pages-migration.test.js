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

test('Cloudflare Pages is the only production frontend referenced by runtime code', async () => {
  const { execFileSync: run } = await import('node:child_process');
  // Edge Functions are excluded on purpose: their VAPID_SUBJECT is a Web Push
  // sender contact (not a frontend URL) and their source is pinned to the
  // deployed bytes (tests/m10-2-daily-reactions.test.js).
  const tracked = run('git', ['ls-files', '*.js', '*.mjs', '*.html', '*.json', '*.webmanifest'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((file) => file && !file.startsWith('tests/') && !file.startsWith('supabase/') && file !== 'package-lock.json');
  const offenders = [];
  for (const file of tracked) {
    const source = await readFile(path.join(ROOT, file), 'utf8').catch(() => '');
    if (/vercel\.app/i.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'runtime code must not point at the legacy Vercel frontend');
  for (const widget of ['US-Noi.js', 'US-Ti-Penso.js']) {
    const source = await readFile(path.join(ROOT, 'integrations/widgets/scriptable', widget), 'utf8');
    assert.match(source, /const APP_URL = "https:\/\/us-a33\.pages\.dev\/";/, widget);
  }
});
