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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.US_S31_STAGING_PREVIEW !== 'true') throw Error('S3.1 staging preview disabled by default');
  const key = process.env.US_STAGING_SUPABASE_PUBLISHABLE_KEY;
  const files = await Promise.all(['app.js','index.html'].map(f=>readFile(path.join(SOURCE,f),'utf8')));
  const isolated = isolateStagingPreview(files[0],files[1],key);
  await rm(OUT,{recursive:true,force:true});
  await mkdir(OUT,{recursive:true});
  await cp(SOURCE,OUT,{recursive:true});
  await Promise.all([
    writeFile(path.join(OUT,'app.js'),isolated.app,'utf8'),
    writeFile(path.join(OUT,'index.html'),isolated.index,'utf8')
  ]);
  const output=await readdir(OUT);
  if (!output.includes('public-auth.js')||!output.includes('public-auth.css'))throw Error('S3.1 Auth runtime missing');
  // The build output remains in Actions artifacts: NO automatic Pages publish.
  process.stdout.write('US S3.1 browser-only preview ready (US-STAGING isolated, not deployed)\n');
}
