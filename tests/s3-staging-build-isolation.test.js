const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');

async function inputs() {
  const { isolateStagingBuild, PRODUCTION_HOST, STAGING_HOST, STAGING_APP_ID } =
    await import('../scripts/configure-s3-staging-qa.mjs');
  const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const capacitorJson = fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8');
  return { isolateStagingBuild, PRODUCTION_HOST, STAGING_HOST, STAGING_APP_ID, appJs, indexHtml, capacitorJson };
}

const syntheticPublicKey = 'sb_publishable_' + 'T'.repeat(32);

test('S3 native staging asset rewrite changes ALL Supabase origins and uses a separate app ID', async () => {
  const v = await inputs();
  const staged = v.isolateStagingBuild({ ...v, publishableKey: syntheticPublicKey });
  assert.ok(staged.appJs.includes("const SB_URL = 'https://" + v.STAGING_HOST + "';"));
  assert.ok(staged.appJs.includes("const SB_KEY = '" + syntheticPublicKey + "';"));
  assert.equal(staged.indexHtml.includes('https://' + v.STAGING_HOST), true);
  assert.equal(staged.indexHtml.includes('//' + v.STAGING_HOST), true);
  assert.equal(staged.appJs.includes(v.PRODUCTION_HOST), false);
  assert.equal(staged.indexHtml.includes(v.PRODUCTION_HOST), false);
  assert.equal(JSON.parse(staged.capacitorJson).appId, v.STAGING_APP_ID);
  assert.equal(JSON.parse(staged.capacitorJson).appName, 'US STAGING');
  assert.equal(v.appJs.includes(v.PRODUCTION_HOST), true, 'committed PWA stays production-bound');
  assert.equal(JSON.parse(v.capacitorJson).appId, 'com.usapp.us', 'ordinary app unchanged');
});

test('fail closed for absent service_role/unknown keys and unexpected product IDs', async () => {
  const v = await inputs();
  for (const publishableKey of [undefined, '', 'sb_secret_bad', 'service_role_jwt', 'sb_publishable_too-short']) {
    assert.throws(() => v.isolateStagingBuild({ ...v, publishableKey }), /requires an actual staging publishable key/);
  }
  assert.throws(() => v.isolateStagingBuild({
    ...v, appJs: v.appJs.replace(v.PRODUCTION_HOST, 'foreign.example.invalid'),
    publishableKey: syntheticPublicKey
  }), /unexpected app.js production binding/);
  assert.throws(() => v.isolateStagingBuild({
    ...v, capacitorJson: JSON.stringify({ appId: 'com.attacker.other', appName: 'US' }),
    publishableKey: syntheticPublicKey
  }), /unexpected Capacitor app identifier/);
});

test('staging configuration CLI refuses to mutate sources without explicit QA opt-in', () => {
  assert.throws(() => execFileSync(process.execPath,
    ['scripts/configure-s3-staging-qa.mjs'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, US_STAGING_QA: 'false' }, stdio: 'pipe' }),
    /Command failed/);
});

test('Android Gradle uses staging package ONLY under explicit QA flag; original signed workflow never builds S3', () => {
  const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
  const productionWorkflow = fs.readFileSync(path.join(ROOT, '.github/workflows/android-ui-integration-signed.yml'), 'utf8');
  assert.match(gradle, /applicationId "com\.usapp\.us"/);
  assert.match(gradle, /System\.getenv\('US_STAGING_QA'\) == 'true'/);
  assert.match(gradle, /applicationId "com\.usapp\.us\.staging"/);
  assert.doesNotMatch(productionWorkflow, /mission\/us-store-s3-native-push-owner-gate-20261010/);
});

test('staging QA CI has NO fallback to production Firebase or Android app identity', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/s3-staging-android-qa.yml'), 'utf8');
  assert.match(workflow, /US_STAGING_GOOGLE_SERVICES_JSON_B64/);
  assert.match(workflow, /US_STAGING_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(workflow, /US_STAGING_QA: 'true'/);
  assert.match(workflow, /com\.usapp\.us\.staging/);
  assert.doesNotMatch(workflow, /secrets\.ANDROID_GOOGLE_SERVICES_JSON_B64/);
  assert.doesNotMatch(workflow, /application_id=com\.usapp\.us\s*\n/);
  assert.doesNotMatch(workflow, /iiakdfsxpywdkxravqjh/);
});
