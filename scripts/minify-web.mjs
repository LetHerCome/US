// Minify the published web bundle (audit 05/11/2026, punto 3).
//
// Usage: node scripts/minify-web.mjs <dist directory>
//
// Runs as the LAST step of a web build: the staging preview rewrites exact
// lines of app.js, index.html, public-auth.js and elimina-account.js before
// this step, so it must still find them unminified.
//
// Every .js and .css file at the top level of the bundle (the runtime files
// listed in build-cloudflare-pages.mjs) is minified one by one with esbuild,
// without bundling and without changing the syntax level. In a classic script
// esbuild keeps every top-level name (globals such as usRecoverPrivateImage
// stay callable from inline handlers) and renames only local ones. Assets,
// vendor files and HTML are left as they are.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_OUTPUTS = ['dist/cloudflare-pages', 'dist/s31-staging-preview'].map((dir) => path.join(ROOT, ...dir.split('/')));

export async function minifyWebBundle(directory) {
  const target = path.resolve(directory);
  if (!ALLOWED_OUTPUTS.includes(target)) {
    throw new Error(`minify-web: refusing to rewrite ${target}; only the web build outputs are allowed`);
  }
  const entries = await readdir(target, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(js|css)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!files.includes('app.js') || !files.includes('styles.css')) {
    throw new Error(`minify-web: ${target} does not look like a US web bundle`);
  }
  let before = 0;
  let after = 0;
  for (const name of files) {
    const file = path.join(target, name);
    const source = await readFile(file, 'utf8');
    const { code } = await transform(source, {
      loader: name.endsWith('.css') ? 'css' : 'js',
      minify: true,
      legalComments: 'none',
      charset: 'utf8',
      sourcefile: name,
      logLevel: 'silent'
    });
    if (!code.trim()) throw new Error(`minify-web: ${name} became empty`);
    before += Buffer.byteLength(source);
    after += Buffer.byteLength(code);
    await writeFile(file, code, 'utf8');
  }
  return { files: files.length, before, after };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) throw new Error('minify-web: pass the dist directory');
  const { files, before, after } = await minifyWebBundle(path.resolve(ROOT, directory));
  const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
  console.log(`Web bundle minified: ${files} files, ${kb(before)} -> ${kb(after)}`);
}
