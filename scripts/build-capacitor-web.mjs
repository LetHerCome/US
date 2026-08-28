import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT = path.resolve(ROOT, 'dist', 'capacitor');
const EXPECTED_OUTPUT = path.join(ROOT, 'dist', 'capacitor');

if (OUTPUT !== EXPECTED_OUTPUT || !OUTPUT.startsWith(`${ROOT}${path.sep}`)) {
  throw new Error(`Unsafe Capacitor output path: ${OUTPUT}`);
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
  'settings.css',
  'settings.js',
  'identity.css',
  'identity.js',
  'settings2.css',
  'polish4.css',
  'polish4.js',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon-32.png',
  'favicon.svg'
];

const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const supabaseVersion = packageJson.dependencies?.['@supabase/supabase-js'];
if (!/^\d+\.\d+\.\d+$/.test(supabaseVersion || '')) {
  throw new Error('Supabase JS must use an exact package version');
}

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

for (const relative of RUNTIME_FILES) {
  const source = path.join(ROOT, relative);
  if (!(await stat(source).catch(() => null))?.isFile()) {
    throw new Error(`Missing runtime asset: ${relative}`);
  }
  const destination = path.join(OUTPUT, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

await cp(path.join(ROOT, 'assets'), path.join(OUTPUT, 'assets'), { recursive: true });

const supabaseCandidates = [
  path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
  path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.min.js')
];
let supabaseSource = null;
for (const candidate of supabaseCandidates) {
  if ((await stat(candidate).catch(() => null))?.isFile()) {
    supabaseSource = candidate;
    break;
  }
}
if (!supabaseSource) throw new Error('Supabase UMD bundle not found in node_modules');
await mkdir(path.join(OUTPUT, 'vendor'), { recursive: true });
await cp(supabaseSource, path.join(OUTPUT, 'vendor', 'supabase.js'));

await build({
  entryPoints: [path.join(ROOT, 'native-entry.mjs')],
  outfile: path.join(OUTPUT, 'native-entry.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'silent'
});

const sourceCdn = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${supabaseVersion}`;
const stagedIndexPath = path.join(OUTPUT, 'index.html');
let html = await readFile(stagedIndexPath, 'utf8');
if (!html.includes(sourceCdn)) throw new Error(`index.html does not use Supabase JS ${supabaseVersion}`);
html = html
  .replace(/<link\s+rel=["']manifest["'][^>]*>\s*/i, '')
  .replace(/<link\s+rel=["']preconnect["']\s+href=["']https:\/\/cdn\.jsdelivr\.net["'][^>]*>\s*/i, '')
  .replace(/<link\s+rel=["']dns-prefetch["']\s+href=["']\/\/cdn\.jsdelivr\.net["'][^>]*>\s*/i, '')
  .replace(`${sourceCdn}"></script>`, '/vendor/supabase.js"></script>')
  .replace(
    '<script defer src="/platform.js"></script>',
    '<script defer src="/native-entry.js"></script>\n<script defer src="/platform.js"></script>'
  );
if (!html.includes('src="/native-entry.js"') || html.includes('rel="manifest"')) {
  throw new Error('Native index transformation incomplete');
}
await writeFile(stagedIndexPath, html, 'utf8');

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await collectFiles(absolute, relative));
    else if (entry.isFile() && relative !== 'native-asset-manifest.json') files.push(relative);
  }
  return files;
}

function localReferences(source, type) {
  const expression = type === 'html'
    ? /(?:src|href)=["'](\/(?!\/)[^"'#?]+)(?:[?#][^"']*)?["']/g
    : /url\(["']?(\/(?!\/)[^"')?#]+)(?:[?#][^"')]*)?["']?\)/g;
  return [...source.matchAll(expression)].map((match) => match[1]);
}

const filesBeforeManifest = await collectFiles(OUTPUT);
const available = new Set(filesBeforeManifest.map((file) => `/${file}`));
const references = new Set(localReferences(html, 'html'));
for (const file of filesBeforeManifest.filter((name) => name.endsWith('.css'))) {
  const css = await readFile(path.join(OUTPUT, ...file.split('/')), 'utf8');
  localReferences(css, 'css').forEach((reference) => references.add(reference));
}
for (const reference of references) {
  if (!available.has(reference)) throw new Error(`Missing staged asset reference: ${reference}`);
}

const fileEntries = [];
for (const file of filesBeforeManifest) {
  const bytes = await readFile(path.join(OUTPUT, ...file.split('/')));
  fileEntries.push({
    path: file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  });
}
const bundleHash = createHash('sha256')
  .update(fileEntries.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join(''))
  .digest('hex');
const manifest = { version: 1, bundleHash, files: fileEntries };
await writeFile(
  path.join(OUTPUT, 'native-asset-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

console.log(`Capacitor web bundle: ${fileEntries.length} files · ${bundleHash}`);
