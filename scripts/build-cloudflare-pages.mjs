import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetCopyFilter } from './build-asset-filter.mjs';
import { bundleHash, productionBuildId, stampBuild } from './build-id.mjs';

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
  'public-auth.js',
  'google-auth.js',
  'public-auth.css',
  'app.js',
  'onboarding.js',
  'onboarding.css',
  'styles.css',
  'ui-foundation.css',
  'ui-foundation.js',
  'client-errors.js',
  'platform.js',
  'app-update.js',
  'person-colors.js',
  'aspetto.js',
  'personaggi.js',
  'us-ricorda.js',
  'bacheca.js',
  'ricordi-cerca.js',
  'ricordi-cerca.css',
  'mese.js',
  'mese.css',
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
  'ricordi-place.css',
  'ricordi-place.js',
  'partner-battery.js',
  'member-status.js',
  'weekly-challenge.js',
  'cosa-di-oggi.js',
  'navigation.js',
  'games.css',
  'games.js',
  'play-us.css',
  'play-us-maze.js',
  'play-us.js',
  'gioca-insieme.js',
  'progression.css',
  'progression.js',
  'countdown.css',
  'countdown.js',
  'year-recap.js',
  'year-recap.css',
  'couple-notes.js',
  'couple-notes.css',
  'lavagna.js',
  'lavagna.css',
  'distance.js',
  'distance.css',
  'member-status.css',
  'settings.css',
  'settings.js',
  'account-deletion.js',
  'identity.css',
  'top-chrome.css',
  'modal-center.css',
  'ricordi-carousel.css',
  'ricordi-inline-carousel.css',
  'ricordi-inline-carousel.js',
  'identity.js',
  'settings2.css',
  'due-colori.css',
  'dc-oggi.css',
  'dc-noi.css',
  'dc-ricordi.css',
  'dc-gioca.css',
  'dc-popup.css',
  'dc-primo.css',
  'dc-settings.css',
  'struttura.css',
  'colori.css',
  'giorno.css',
  'due-colori.js',
  'i18n.js',
  'i18n-en.js',
  'left-for-you.css',
  'left-for-you.js',
  'calendar-domain.js',
  'calendar.css',
  'calendar.js',
  'noi-v2.js',
  'noi-v2.css',
  'oggi-look.js',
  'oggi-fx.js',
  'intro.js',
  'think-reward.js',
  'oggi-look.css',
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
  'favicon.svg',
  // Public account deletion page (Google Play): standalone, outside the app shell.
  'elimina-account.html',
  'elimina-account.js',
  // Public invite page: the link a partner shares (onboarding.js inviteLink).
  'invito.html',
  'invito.js',
  // App Links: the site vouches for the Android app that opens /invito.
  '.well-known/assetlinks.json',
  '.well-known/apple-app-site-association',
  // Public legal pages (Play listing, sign-up box, Settings › Privacy e dati).
  'legal.css',
  'privacy.html',
  'privacy-en.html',
  'termini.html',
  'termini-en.html'
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

await cp(path.join(ROOT, 'assets'), path.join(OUTPUT, 'assets'), { recursive: true, filter: assetCopyFilter(ROOT) });
await cp(path.join(ROOT, 'cloudflare', '_headers'), path.join(OUTPUT, '_headers'));

// Every bundle carries <release>-<hash of its files> (scripts/build-id.mjs):
// a runtime change always reaches installed phones, a docs-only deploy keeps
// the id. Done before minify, so the hash follows the source bytes.
{
  const bundle = [];
  for (const file of await collectFiles(OUTPUT)) {
    bundle.push([file, await readFile(path.join(OUTPUT, ...file.split('/')))]);
  }
  const read = (file) => readFile(path.join(OUTPUT, file), 'utf8');
  const [index, worker, manifest] = await Promise.all(['index.html', 'service-worker.js', 'manifest.webmanifest'].map(read));
  const buildId = productionBuildId(worker, bundleHash(bundle));
  const stamped = stampBuild({ index, worker, manifest }, buildId);
  await Promise.all([
    writeFile(path.join(OUTPUT, 'index.html'), stamped.index, 'utf8'),
    writeFile(path.join(OUTPUT, 'service-worker.js'), stamped.worker, 'utf8'),
    writeFile(path.join(OUTPUT, 'manifest.webmanifest'), stamped.manifest, 'utf8'),
    writeFile(path.join(OUTPUT, 'version.json'), stamped.version, 'utf8')
  ]);
  console.log(`Cloudflare Pages BUILD_ID -> ${buildId}`);
}

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
