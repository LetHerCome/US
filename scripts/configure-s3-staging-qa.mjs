// Staging-only build-time rewrite. Never run this against a production build.
// Publishable keys are client-side keys (never a service_role key).
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_PROJECT_REF = 'iiakdfsxpywdkxravqjh';
export const STAGING_PROJECT_REF = 'dugmhngrfkuieeletatb';
export const PRODUCTION_HOST = PRODUCTION_PROJECT_REF + '.supabase.co';
export const STAGING_HOST = STAGING_PROJECT_REF + '.supabase.co';
export const PRODUCTION_APP_ID = 'com.usapp.us';
export const STAGING_APP_ID = 'com.usapp.us.staging';

function replaceExactlyOnce(source, search, replacement, label) {
  const parts = source.split(search);
  if (parts.length !== 2) throw new Error('S3 staging QA: expected exactly one ' + label);
  return parts.join(replacement);
}

export function isolateStagingBuild({ appJs, indexHtml, capacitorJson, publishableKey }) {
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey || '')) {
    throw new Error('S3 staging QA requires an actual staging publishable key, never a service-role key');
  }
  if (!appJs.includes("const SB_URL = 'https://" + PRODUCTION_HOST + "';")) {
    throw new Error('S3 staging QA: unexpected app.js production binding');
  }
  let stagedApp = replaceExactlyOnce(
    appJs, "const SB_URL = 'https://" + PRODUCTION_HOST + "';",
    "const SB_URL = 'https://" + STAGING_HOST + "';", 'production URL');
  const keyDeclaration = /^const SB_KEY = 'sb_publishable_[A-Za-z0-9_-]+';$/gm;
  if ((stagedApp.match(keyDeclaration) || []).length !== 1) {
    throw new Error('S3 staging QA: unknown publishable key declaration');
  }
  stagedApp = stagedApp.replace(keyDeclaration, "const SB_KEY = '" + publishableKey + "';");
  // Native auth-storage fallback must never use production's storage key.
  // Failure to rewrite this silently retained the production project ref.
  stagedApp = replaceExactlyOnce(
    stagedApp,
    "'sb-" + PRODUCTION_PROJECT_REF + "-auth-token'",
    "'sb-" + STAGING_PROJECT_REF + "-auth-token'",
    'production Auth storage fallback');
  const stagedIndex = replaceExactlyOnce(
    indexHtml,
    'https://' + PRODUCTION_HOST, 'https://' + STAGING_HOST,
    'production preconnect');
  const stagedIndex2 = replaceExactlyOnce(
    stagedIndex, '//' + PRODUCTION_HOST, '//' + STAGING_HOST, 'production DNS prefetch');
  const config = JSON.parse(capacitorJson);
  if (config.appId !== PRODUCTION_APP_ID || config.appName !== 'US') {
    throw new Error('S3 staging QA: unexpected Capacitor app identifier');
  }
  config.appId = STAGING_APP_ID;
  config.appName = 'US STAGING';
  const stagedConfig = JSON.stringify(config, null, 2) + '\n';
  if ([stagedApp, stagedIndex2, stagedConfig].some(text => text.includes(PRODUCTION_PROJECT_REF))) {
    throw new Error('S3 staging QA: production Supabase project reference leaked into native build inputs');
  }
  return { appJs: stagedApp, indexHtml: stagedIndex2, capacitorJson: stagedConfig };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.US_STAGING_QA !== 'true') {
    throw new Error('S3 staging QA mutation is disabled unless US_STAGING_QA=true');
  }
  const key = process.env.US_STAGING_SUPABASE_PUBLISHABLE_KEY;
  const paths = ['app.js', 'index.html', 'capacitor.config.json'];
  const [appJs, indexHtml, capacitorJson] = await Promise.all(paths.map(p => readFile(p, 'utf8')));
  const out = isolateStagingBuild({ appJs, indexHtml, capacitorJson, publishableKey: key });
  await Promise.all([
    writeFile(paths[0], out.appJs),
    writeFile(paths[1], out.indexHtml),
    writeFile(paths[2], out.capacitorJson)
  ]);
  process.stdout.write('S3 staging inputs isolated: com.usapp.us.staging -> US-STAGING (no production Supabase host)\n');
}
