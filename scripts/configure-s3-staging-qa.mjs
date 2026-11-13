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

// The widgets send their device token only to the US project of the build
// (UsWidgetEndpoints.java names production): the staging APK points them at
// US-STAGING, so the Play bundle never needs the staging project in its code.
export const WIDGET_ENDPOINTS_PATH = 'native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetEndpoints.java';
export function isolateWidgetEndpoints(javaSource) {
  const quoted = '"' + PRODUCTION_PROJECT_REF + '"';
  const url = '"https://' + PRODUCTION_HOST + '/functions/v1"';
  let staged = replaceExactlyOnce(javaSource, url, '"https://' + STAGING_HOST + '/functions/v1"', 'widget production endpoint');
  staged = replaceExactlyOnce(staged, '{ ' + quoted + ' }', '{ "' + STAGING_PROJECT_REF + '" }', 'widget project list');
  if (staged.includes(PRODUCTION_PROJECT_REF)) throw new Error('S3 staging QA: production Supabase project left in the widget endpoints');
  return staged;
}

// Its unit test (run by the staging APK workflow) checks the same rule for the
// project of this build, so it follows the rewrite.
export const WIDGET_ENDPOINTS_TEST_PATH = 'native-plugins/us-widget-bridge/android/src/test/java/com/usapp/widget/UsWidgetEndpointsTest.java';
export function isolateWidgetEndpointsTest(javaSource) {
  if (!javaSource.includes(PRODUCTION_PROJECT_REF)) throw new Error('S3 staging QA: widget endpoints test does not name production');
  return javaSource.split(PRODUCTION_PROJECT_REF).join(STAGING_PROJECT_REF);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.US_STAGING_QA !== 'true') {
    throw new Error('S3 staging QA mutation is disabled unless US_STAGING_QA=true');
  }
  const key = process.env.US_STAGING_SUPABASE_PUBLISHABLE_KEY;
  const paths = ['app.js', 'index.html', 'capacitor.config.json'];
  const [appJs, indexHtml, capacitorJson] = await Promise.all(paths.map(p => readFile(p, 'utf8')));
  const out = isolateStagingBuild({ appJs, indexHtml, capacitorJson, publishableKey: key });
  const widgetEndpoints = isolateWidgetEndpoints(await readFile(WIDGET_ENDPOINTS_PATH, 'utf8'));
  const widgetEndpointsTest = isolateWidgetEndpointsTest(await readFile(WIDGET_ENDPOINTS_TEST_PATH, 'utf8'));
  await Promise.all([
    writeFile(paths[0], out.appJs),
    writeFile(paths[1], out.indexHtml),
    writeFile(paths[2], out.capacitorJson),
    writeFile(WIDGET_ENDPOINTS_PATH, widgetEndpoints),
    writeFile(WIDGET_ENDPOINTS_TEST_PATH, widgetEndpointsTest)
  ]);
  process.stdout.write('S3 staging inputs isolated: com.usapp.us.staging -> US-STAGING (no production Supabase host)\n');
}
