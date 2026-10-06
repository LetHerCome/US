import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT = path.resolve(ROOT, 'dist', 'cloudflare-pages');
const EXPECTED_OUTPUT = path.join(ROOT, 'dist', 'cloudflare-pages');

if (OUTPUT !== EXPECTED_OUTPUT || !OUTPUT.startsWith(`${ROOT}${path.sep}`)) {
  throw new Error(`Unsafe Cloudflare Pages output path: ${OUTPUT}`);
}

const RUNTIME_FILES = [
  'index.html',
  'auth-storage.js',
  'app.js',
  'stories.js',
  'stories.css',
  'styles.css',
  'ui-foundation.css',
  'ui-foundation.js',
  'platform.js',
  'app-lock.js',
  'app-lock.css',
  'notifications.js',
  'widgets.js',
  'widget-hub.js',
  'widget-hub.css',
  'fix4.css',
  'fix4.js',
  'fastboot2.js',
  'events.css',
  'events.js',
  'moments-albums.css',
  'moments-albums.js',
  'navigation.js',
  'games.css',
  'games.js',
  'progression.css',
  'progression.js',
  'countdown.css',
  'countdown.js',
  'pet.css',
  'pet.js',
  'home-cleanup.js',
  'settings.css',
  'settings.js',
  'identity.css',
  'identity.js',
  'settings2.css',
  'polish4.css',
  'polish4.js',
  'left-for-you.css',
  'left-for-you.js',
  'calendar-domain.js',
  'calendar.css',
  'calendar.js',
  'state-system.css',
  'auth-first-run.css',
  'auth-first-run.js',
  'manifest.webmanifest',
  'service-worker.js',
  'version.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon-32.png',
  'favicon.svg'
];

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

for (const relative of RUNTIME_FILES) {
  const source = path.join(ROOT, relative);
  if (!(await stat(source).catch(() => null))?.isFile()) {
    throw new Error(`Missing web runtime asset: ${relative}`);
  }
  const destination = path.join(OUTPUT, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

await cp(path.join(ROOT, 'assets'), path.join(OUTPUT, 'assets'), { recursive: true });
await cp(path.join(ROOT, 'cloudflare', '_headers'), path.join(OUTPUT, '_headers'));

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await collectFiles(absolute, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function localReferences(source, type) {
  const expression = type === 'html'
    ? /(?:src|href)=["'](\/(?!\/)[^"'#?]+)(?:[?#][^"']*)?["']/g
    : /url\(["']?(\/(?!\/)[^"')?#]+)(?:[?#][^"')]*)?["']?\)/g;
  return [...source.matchAll(expression)].map((match) => match[1]);
}

const html = await readFile(path.join(OUTPUT, 'index.html'), 'utf8');
const files = await collectFiles(OUTPUT);
const available = new Set(files.map((file) => `/${file}`));
const references = new Set(localReferences(html, 'html'));

for (const file of files.filter((name) => name.endsWith('.css'))) {
  const css = await readFile(path.join(OUTPUT, ...file.split('/')), 'utf8');
  localReferences(css, 'css').forEach((reference) => references.add(reference));
}

for (const reference of references) {
  if (!available.has(reference)) throw new Error(`Missing Cloudflare staged asset reference: ${reference}`);
}

const forbiddenRoots = ['android', 'docs', 'native-plugins', 'scripts', 'supabase', 'tests'];
for (const root of forbiddenRoots) {
  if (files.some((file) => file === root || file.startsWith(`${root}/`))) {
    throw new Error(`Forbidden source content leaked into Cloudflare bundle: ${root}`);
  }
}

for (const forbiddenFile of ['package.json', 'package-lock.json', 'AGENTS.md', '.gitignore', '.vercelignore']) {
  if (files.includes(forbiddenFile)) {
    throw new Error(`Forbidden repository file leaked into Cloudflare bundle: ${forbiddenFile}`);
  }
}

console.log(`Cloudflare Pages bundle: ${files.length} files -> dist/cloudflare-pages`);
