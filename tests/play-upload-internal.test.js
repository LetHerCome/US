// Upload to the Play internal track: the API sequence, the guards, and the
// workflow job that runs it behind the founder's approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, createVerify } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const load = () => import(pathToFileURL(path.join(ROOT, 'scripts/play-upload-internal.mjs')).href);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = {
  email: 'us-play@example.iam.gserviceaccount.com',
  key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  tokenUri: 'https://oauth2.googleapis.com/token'
};

function fakeFetch(fail = '') {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method, headers: options.headers || {}, body: options.body });
    const reply = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
    if (fail && url.includes(fail)) return reply(403, { error: { message: 'The caller does not have permission' } });
    if (url === account.tokenUri) return reply(200, { access_token: 'tok' });
    if (url.endsWith('/edits')) return reply(200, { id: 'e1' });
    if (url.includes('/bundles?uploadType=media')) return reply(200, { versionCode: 421243 });
    return reply(200, {});
  };
  return { calls, fetchImpl };
}

test('play upload: signs a valid service-account JWT for the androidpublisher scope', async () => {
  const { signedAssertion } = await load();
  const [header, claims, signature] = signedAssertion(account, 1000).split('.');
  const verify = createVerify('RSA-SHA256');
  verify.update(`${header}.${claims}`);
  assert.ok(verify.verify(publicKey, Buffer.from(signature, 'base64url')));
  const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
  assert.deepEqual(body, { iss: account.email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: account.tokenUri, iat: 1000, exp: 4600 });
});

test('play upload: edit, bundle, internal track as a completed release, commit', async () => {
  const { uploadToInternal } = await load();
  const { calls, fetchImpl } = fakeFetch();
  const result = await uploadToInternal({ account, aab: new Uint8Array(4096), versionName: '1.0.8', releaseNotes: 'Avvio più rapido', fetchImpl, log: () => {} });
  assert.deepEqual(result, { versionCode: '421243', versionName: '1.0.8' });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace(/https:\/\/[^/]+/, '')}`), [
    'POST /token',
    'POST /androidpublisher/v3/applications/com.usapp.us/edits',
    'POST /upload/androidpublisher/v3/applications/com.usapp.us/edits/e1/bundles?uploadType=media',
    'PUT /androidpublisher/v3/applications/com.usapp.us/edits/e1/tracks/internal',
    'POST /androidpublisher/v3/applications/com.usapp.us/edits/e1:commit'
  ]);
  assert.deepEqual(JSON.parse(calls[3].body), {
    track: 'internal',
    releases: [{ name: '1.0.8', versionCodes: ['421243'], status: 'completed', releaseNotes: [{ language: 'it-IT', text: 'Avvio più rapido' }] }]
  });
  assert.equal(calls[1].headers.Authorization, 'Bearer tok');
});

test('play upload: a refusal stops before anything is published, without leaking the key', async () => {
  const { uploadToInternal, parseServiceAccount } = await load();
  const { calls, fetchImpl } = fakeFetch('/tracks/internal');
  await assert.rejects(uploadToInternal({ account, aab: new Uint8Array(4096), versionName: '1.0.8', fetchImpl, log: () => {} }), /Test interno: The caller does not have permission/);
  assert.ok(!calls.some((c) => c.url.endsWith(':commit')));
  await assert.rejects(uploadToInternal({ account, aab: new Uint8Array(10), versionName: '1.0.8', fetchImpl }), /AAB mancante/);
  await assert.rejects(uploadToInternal({ account, aab: new Uint8Array(4096), versionName: 'beta', fetchImpl }), /x\.y\.z/);
  assert.throws(() => parseServiceAccount('{"type":"authorized_user"}'), /account di servizio/);
  assert.throws(() => parseServiceAccount('nope'), /JSON valido/);
  const script = fs.readFileSync(path.join(ROOT, 'scripts/play-upload-internal.mjs'), 'utf8');
  assert.doesNotMatch(script, /log\([^)]*(private_key|access_token|account\.key)/);
});

test('play upload: the workflow job is manual, main only, approved and internal only', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/android-play-bundle.yml'), 'utf8');
  const job = wf.slice(wf.indexOf('  publish-internal:'));
  assert.ok(job.length > 100);
  assert.match(job, /if: github\.event_name == 'workflow_dispatch' && inputs\.signing == 'upload' && inputs\.play_track == 'internal' && github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /environment: play-deploy/);
  assert.match(job, /PLAY_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON \}\}/);
  assert.match(job, /rm -rf "\$RUNNER_TEMP\/aab" candidate/);
  assert.match(wf, /options: \[none, internal\]\n        default: none/);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'scripts/play-upload-internal.mjs'), 'utf8'), /'(production|alpha|beta)'/, 'closed testing and production stay manual');
});

test('play upload: the in-app update priority (0–5) rides on the release; 0 is Play\'s default', async () => {
  const { uploadToInternal } = await load();
  const urgent = fakeFetch();
  await uploadToInternal({ account, aab: new Uint8Array(4096), versionName: '1.3.0', updatePriority: 5, fetchImpl: urgent.fetchImpl, log: () => {} });
  assert.equal(JSON.parse(urgent.calls[3].body).releases[0].inAppUpdatePriority, 5);
  const plain = fakeFetch();
  await uploadToInternal({ account, aab: new Uint8Array(4096), versionName: '1.3.0', updatePriority: '0', fetchImpl: plain.fetchImpl, log: () => {} });
  assert.equal('inAppUpdatePriority' in JSON.parse(plain.calls[3].body).releases[0], false);
  for (const wrong of [6, -1, 2.5, 'alta']) {
    await assert.rejects(uploadToInternal({ account, aab: new Uint8Array(4096), versionName: '1.3.0', updatePriority: wrong, fetchImpl: fakeFetch().fetchImpl, log: () => {} }), /priorità/);
  }
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/android-play-bundle.yml'), 'utf8');
  assert.match(workflow, /update_priority:\n\s+description: '[^']+'\n\s+type: choice\n\s+default: '0'\n\s+options: \['0', '1', '2', '3', '4', '5'\]/);
  assert.match(workflow, /US_UPDATE_PRIORITY: \$\{\{ inputs\.update_priority \}\}/);
});
