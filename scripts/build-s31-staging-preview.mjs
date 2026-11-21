// Build a browser-only preview pointing solely to US-STAGING.
// Runs AFTER npm run build:cloudflare-pages. Never changes source app.js/index,
// never touches live Cloudflare or generates an Android APK from pre-S3 main.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'dist', 'cloudflare-pages');
const OUT = path.join(ROOT, 'dist', 's31-staging-preview');
const PROD = 'iiakdfsxpywdkxravqjh';
const STAGE = 'dugmhngrfkuieeletatb';
export const APPROVED_BRANCH = 'mission/us-store-s3-1-public-auth-staging-20261011';
export const PLACEHOLDER_HTML = '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
  + '<title>US staging: no preview</title><p>This branch is not a US-STAGING preview.</p>\n';

export function isolateStagingPreview(app, index, publishableKey) {
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey||'')) {
    throw Error('S3.1 staging preview requires valid staging publishable key');
  }
  const replaceOne = (src, search, next) => {
    if (src.split(search).length !== 2) throw Error('S3.1 staging input mismatch');
    return src.replace(search, next);
  };
  app=replaceOne(app, "const SB_URL = 'https://"+PROD+".supabase.co';",
    "const SB_URL = 'https://"+STAGE+".supabase.co';");
  app=app.replace(/^const SB_KEY = 'sb_publishable_[A-Za-z0-9_-]+';$/gm,
    "const SB_KEY = '"+publishableKey+"';");
  if (!app.includes("const SB_KEY = '"+publishableKey+"';"))throw Error('S3.1 publishable key substitution failed');
  app=replaceOne(app,"'sb-"+PROD+"-auth-token'","'sb-"+STAGE+"-auth-token'");
  index=replaceOne(index,'https://'+PROD+'.supabase.co','https://'+STAGE+'.supabase.co');
  index=replaceOne(index,'//'+PROD+'.supabase.co','//'+STAGE+'.supabase.co');
  if (app.includes(PROD) || index.includes(PROD))throw Error('Production backend reference in preview');
  return { app, index };
}

// public-auth.js ships with an empty STAGING_ORIGIN; only this preview turns
// the signup and recovery screens on, by naming US-STAGING exactly once.
export function isolateStagingPublicAuth(src) {
  const search = "const STAGING_ORIGIN = '';";
  if (src.split(search).length !== 2) throw Error('S3.1 public-auth input mismatch');
  return src.replace(search, "const STAGING_ORIGIN = 'https://"+STAGE+".supabase.co';");
}

// The public deletion page (elimina-account.js) only configures itself on the
// production host. The preview names the US-STAGING project and the
// us-staging-s31 Pages host instead, with the publishable key from the
// Cloudflare env (never committed), so #190 can be tested end to end.
export const STAGING_PAGES_HOST = 'us-staging-s31.pages.dev';
export function isolateStagingDeletionPage(src, publishableKey) {
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey||'')) {
    throw Error('S3.2 staging deletion page requires valid staging publishable key');
  }
  const replaceOne = (text, search, next) => {
    if (text.split(search).length !== 2) throw Error('S3.2 staging deletion page input mismatch');
    return text.replace(search, next);
  };
  let out = replaceOne(src, "const PRODUCTION_HOSTS=['us-a33.pages.dev','uscouple.app'];", "const PRODUCTION_HOSTS=['"+STAGING_PAGES_HOST+"'];");
  out = replaceOne(out, "supabaseUrl:'https://"+PROD+".supabase.co',", "supabaseUrl:'https://"+STAGE+".supabase.co',");
  out = out.replace(/apiKey:'sb_publishable_[A-Za-z0-9_-]+'/, "apiKey:'"+publishableKey+"'");
  if (!out.includes("apiKey:'"+publishableKey+"'")) throw Error('S3.2 staging deletion key substitution failed');
  if (out.includes(PROD)) throw Error('Production backend reference in staging deletion page');
  return out;
}

// Every staging deploy gets its own BUILD_ID (founder, 21/11/2026): the
// service worker keeps the shell by BUILD_ID, and the source keeps the one of
// the last production release until the next one, so a phone that had opened
// staging kept the old diario.js after every merge. The preview stamps
// <release>-s<commit> into index.html, service-worker.js, version.json and
// the manifest, the same places as scripts/set-build-id.mjs (kept apart: the
// placeholder test runs this script alone in a temp root).
export function stagingBuildId(worker, commit, now = Date.now()) {
  const base = /const BUILD_ID = "([^"]+)";/.exec(worker)?.[1];
  if (!base) throw Error('service-worker.js is missing BUILD_ID');
  const tag = String(commit || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || now.toString(36);
  return `${base}-s${tag}`.slice(0, 128);
}
export function stampStagingBuild({ index, worker, manifest }, buildId) {
  if (!/^[a-z0-9][a-z0-9._-]{7,127}$/i.test(buildId)) throw Error('Bad staging BUILD_ID');
  if (!/<meta name="us-build" content="[^"]+"\/>/.test(index)) throw Error('index.html is missing the us-build meta');
  return {
    index: index
      .replace(/<meta name="us-build" content="[^"]+"\/>/, `<meta name="us-build" content="${buildId}"/>`)
      .replace(/\?v=[^"'&\s>]+/g, `?v=${buildId}`),
    worker: worker.replace(/const BUILD_ID = "[^"]+";/, `const BUILD_ID = "${buildId}";`),
    manifest: manifest.replace(/\?v=[^"]+/g, `?v=${buildId}`),
    version: JSON.stringify({ version: buildId }) + '\n',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.US_S31_STAGING_PREVIEW !== 'true') throw Error('S3.1 staging preview disabled by default');
  // Dedicated Cloudflare Pages project must target this specific STAGING branch.
  // The project also builds a preview for EVERY other branch: those get a
  // static "not a staging preview" page (no app, no Supabase key, no backend
  // URL) instead of a failed build, so the check stops blocking unrelated PRs.
  if (process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH !== APPROVED_BRANCH) {
    await rm(OUT, { recursive: true, force: true });
    await mkdir(OUT, { recursive: true });
    await writeFile(path.join(OUT, 'index.html'), PLACEHOLDER_HTML, 'utf8');
    process.stdout.write('US-STAGING preview skipped: branch is not the approved staging branch\n');
    process.exit(0);
  }
  const key = process.env.US_STAGING_SUPABASE_PUBLISHABLE_KEY;
  const files = await Promise.all(['app.js','index.html','public-auth.js'].map(f=>readFile(path.join(SOURCE,f),'utf8')));
  const isolated = isolateStagingPreview(files[0],files[1],key);
  const publicAuth = isolateStagingPublicAuth(files[2]);
  await rm(OUT,{recursive:true,force:true});
  await mkdir(OUT,{recursive:true});
  await cp(SOURCE,OUT,{recursive:true});
  await Promise.all([
    writeFile(path.join(OUT,'app.js'),isolated.app,'utf8'),
    writeFile(path.join(OUT,'index.html'),isolated.index,'utf8'),
    writeFile(path.join(OUT,'public-auth.js'),publicAuth,'utf8')
  ]);
  // Optional: the deletion page ships with #190 and later.
  const deletionPage = path.join(SOURCE,'elimina-account.js');
  const hasDeletionPage = await readFile(deletionPage,'utf8').then(text=>text,()=>null);
  if (hasDeletionPage !== null) {
    await writeFile(path.join(OUT,'elimina-account.js'),isolateStagingDeletionPage(hasDeletionPage,key),'utf8');
  }
  const [stIndex, stWorker, stManifest] = await Promise.all(['index.html','service-worker.js','manifest.webmanifest'].map(f=>readFile(path.join(OUT,f),'utf8')));
  const buildId = stagingBuildId(stWorker, process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA);
  const stamped = stampStagingBuild({ index: stIndex, worker: stWorker, manifest: stManifest }, buildId);
  await Promise.all([
    writeFile(path.join(OUT,'index.html'),stamped.index,'utf8'),
    writeFile(path.join(OUT,'service-worker.js'),stamped.worker,'utf8'),
    writeFile(path.join(OUT,'manifest.webmanifest'),stamped.manifest,'utf8'),
    writeFile(path.join(OUT,'version.json'),stamped.version,'utf8')
  ]);
  process.stdout.write(`US-STAGING BUILD_ID -> ${buildId}\n`);
  const output=await readdir(OUT);
  if (!output.includes('public-auth.js')||!output.includes('public-auth.css'))throw Error('S3.1 Auth runtime missing');
  // The build output remains in Actions artifacts: NO automatic Pages publish.
  process.stdout.write('US S3.1 browser-only preview ready (US-STAGING isolated, not deployed)\n');
}
