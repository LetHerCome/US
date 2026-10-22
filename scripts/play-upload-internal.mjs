// Uploads one signed AAB to the Google Play internal testing track
// (Android Publisher API v3): open an edit, upload the bundle, put it on the
// internal track as a completed release, commit. Run only by the
// "publish-internal" job of android-play-bundle.yml, behind the founder's
// approval in the GitHub environment `play-deploy`.
//
// Never prints the service-account key or the access token.
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const PACKAGE_NAME = 'com.usapp.us';
export const TRACK = 'internal';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';

const b64url = (value) => Buffer.from(value).toString('base64url');

export function parseServiceAccount(text) {
  let account;
  try { account = JSON.parse(String(text || '')); } catch { throw new Error('PLAY_SERVICE_ACCOUNT_JSON non è un JSON valido'); }
  if (account?.type !== 'service_account' || !account.client_email || !account.private_key) {
    throw new Error('PLAY_SERVICE_ACCOUNT_JSON non è la chiave di un account di servizio');
  }
  return { email: account.client_email, key: account.private_key, tokenUri: account.token_uri || 'https://oauth2.googleapis.com/token' };
}

// Signed JWT for the OAuth 2.0 service-account flow (RFC 7523).
export function signedAssertion(account, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.email, scope: SCOPE, aud: account.tokenUri, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.key).toString('base64url')}`;
}

async function call(fetchImpl, url, options, step) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const reason = body?.error?.message || body?.error_description || body?.error || `HTTP ${response.status}`;
    throw new Error(`${step}: ${String(reason).slice(0, 300)}`);
  }
  return body;
}

export async function uploadToInternal({ account, aab, versionName, releaseNotes = '', fetchImpl = fetch, log = console.log }) {
  if (!(aab instanceof Uint8Array) || aab.length < 1024) throw new Error('AAB mancante o vuoto');
  if (!/^\d+\.\d+\.\d+$/.test(String(versionName))) throw new Error('versionName deve essere nel formato x.y.z');

  const token = await call(fetchImpl, account.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedAssertion(account) }).toString()
  }, 'Accesso a Google');
  const auth = { Authorization: `Bearer ${token.access_token}` };

  const edit = await call(fetchImpl, `${API}/${PACKAGE_NAME}/edits`, { method: 'POST', headers: auth }, 'Apertura modifica');
  log(`Modifica Play aperta (${edit.id})`);

  const bundle = await call(fetchImpl, `${UPLOAD}/${PACKAGE_NAME}/edits/${edit.id}/bundles?uploadType=media`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: aab
  }, 'Caricamento AAB');
  const versionCode = String(bundle.versionCode);
  log(`AAB caricato: versionCode ${versionCode}`);

  const release = { name: versionName, versionCodes: [versionCode], status: 'completed' };
  if (releaseNotes.trim()) release.releaseNotes = [{ language: 'it-IT', text: releaseNotes.trim().slice(0, 500) }];
  await call(fetchImpl, `${API}/${PACKAGE_NAME}/edits/${edit.id}/tracks/${TRACK}`, {
    method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ track: TRACK, releases: [release] })
  }, 'Test interno');

  await call(fetchImpl, `${API}/${PACKAGE_NAME}/edits/${edit.id}:commit`, { method: 'POST', headers: auth }, 'Pubblicazione');
  log(`Pubblicata nel test interno: ${versionName} (${versionCode})`);
  return { versionCode, versionName };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const account = parseServiceAccount(process.env.PLAY_SERVICE_ACCOUNT_JSON);
    const aab = new Uint8Array(await readFile(process.argv[2]));
    await uploadToInternal({ account, aab, versionName: process.env.US_ANDROID_VERSION_NAME, releaseNotes: process.env.US_RELEASE_NOTES || '' });
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
