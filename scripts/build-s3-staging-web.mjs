// Browser-only US-STAGING build of PR #187 for physical push QA (T0–T7).
// Runs AFTER npm run build:cloudflare-pages, in the existing Cloudflare Pages
// project "us-staging-s31" only. Never rewrites source files, never touches
// production: it fails closed if the production Supabase project reference
// survives anywhere in the output.
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'dist', 'cloudflare-pages');
// Output directory configured in the us-staging-s31 Cloudflare project.
const OUT = path.join(ROOT, 'dist', 's31-staging-preview');
const PROD = 'iiakdfsxpywdkxravqjh';
const STAGE = 'dugmhngrfkuieeletatb';
export const APPROVED_BRANCH = 'claude/pr187-notifications-bcyiy6';

function replaceOne(source, search, next, label) {
  if (source.split(search).length !== 2) throw Error('S3 staging web: expected exactly one ' + label);
  return source.replace(search, () => next);
}

export function isolateStagingWeb({ app, index, worker }, publishableKey) {
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey || '')) {
    throw Error('S3 staging web requires the US-STAGING publishable key, never a service-role key');
  }
  app = replaceOne(app, "const SB_URL = 'https://" + PROD + ".supabase.co';",
    "const SB_URL = 'https://" + STAGE + ".supabase.co';", 'production URL');
  const keyDeclaration = /^const SB_KEY = 'sb_publishable_[A-Za-z0-9_-]+';$/gm;
  if ((app.match(keyDeclaration) || []).length !== 1) throw Error('S3 staging web: unknown publishable key declaration');
  app = app.replace(keyDeclaration, () => "const SB_KEY = '" + publishableKey + "';");
  app = replaceOne(app, "'sb-" + PROD + "-auth-token'", "'sb-" + STAGE + "-auth-token'", 'Auth storage fallback');
  index = replaceOne(index, 'https://' + PROD + '.supabase.co', 'https://' + STAGE + '.supabase.co', 'preconnect');
  index = replaceOne(index, '//' + PROD + '.supabase.co', '//' + STAGE + '.supabase.co', 'DNS prefetch');
  index = replaceOne(index, '<title>', '<title>[STAGING] ', 'title');
  worker = replaceOne(worker, '"https://' + PROD + '.supabase.co"', '"https://' + STAGE + '.supabase.co"', 'media cache origin');
  return { app, index, worker };
}

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : [p];
  }));
  return nested.flat();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.US_S3_STAGING_WEB !== 'true') throw Error('S3 staging web build disabled by default');
  if (process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH !== APPROVED_BRANCH) {
    throw Error('S3 staging web: Cloudflare build rejected, not the approved PR #187 QA branch');
  }
  const key = process.env.US_STAGING_SUPABASE_PUBLISHABLE_KEY;
  const names = ['app.js', 'index.html', 'service-worker.js'];
  const [app, index, worker] = await Promise.all(names.map((f) => readFile(path.join(SOURCE, f), 'utf8')));
  const out = isolateStagingWeb({ app, index, worker }, key);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await cp(SOURCE, OUT, { recursive: true });
  await Promise.all([
    writeFile(path.join(OUT, 'app.js'), out.app, 'utf8'),
    writeFile(path.join(OUT, 'index.html'), out.index, 'utf8'),
    writeFile(path.join(OUT, 'service-worker.js'), out.worker, 'utf8'),
  ]);
  for (const file of await filesUnder(OUT)) {
    if ((await stat(file)).size > 5_000_000) continue;
    if ((await readFile(file)).includes(PROD)) {
      await rm(OUT, { recursive: true, force: true });
      throw Error('S3 staging web: production Supabase reference in ' + path.relative(OUT, file));
    }
  }
  process.stdout.write('US S3 staging web ready: US-STAGING only, no production Supabase reference\n');
}
