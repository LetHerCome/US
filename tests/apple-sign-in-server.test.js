// Accedi con Apple, server side (iOS Store V1, 05/11/2026): Apple's refresh
// token from the app's authorization code, revoked at account deletion
// (App Store 5.1.1(v), TN3194). Apple is faked; the ES256 client secret is
// verified with a real P-256 key generated here.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { webcrypto } = require('node:crypto');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'apple-sign-in.mjs')).href);

async function keyPair() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
}
const env = (values) => (key) => values[key];
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

function fakeApple(responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: Object.fromEntries(new URLSearchParams(init.body)), headers: init.headers });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body ?? {} };
  };
  return { fetch, calls };
}

test('configuration: the Sign in with Apple key, the team and the bundle id, or nothing', async () => {
  const { appleSignInConfig } = await load();
  const { pem } = await keyPair();
  const config = appleSignInConfig(env({ APPLE_TEAM_ID: 'AB12CD34EF', APPLE_SIGN_IN_KEY_ID: 'KEY1234567', APPLE_SIGN_IN_PRIVATE_KEY: pem }));
  assert.equal(config.teamId, 'AB12CD34EF');
  assert.equal(config.clientId, 'com.usapp.us');
  assert.equal(appleSignInConfig(env({ APNS_TEAM_ID: 'AB12CD34EF', APPLE_SIGN_IN_KEY_ID: 'KEY1234567', APPLE_SIGN_IN_PRIVATE_KEY: pem })).teamId, 'AB12CD34EF', 'the APNs team id is the same team');
  assert.equal(appleSignInConfig(env({ APPLE_TEAM_ID: 'AB12CD34EF', APPLE_SIGN_IN_KEY_ID: 'KEY1234567' })), null, 'no key: off');
  assert.equal(appleSignInConfig(env({ APPLE_TEAM_ID: 'short', APPLE_SIGN_IN_KEY_ID: 'KEY1234567', APPLE_SIGN_IN_PRIVATE_KEY: pem })), null);
  assert.equal(appleSignInConfig(() => { throw new Error('no env'); }), null);
});

test('client secret: ES256, kid, team, Apple audience, bundle id, five minutes', async () => {
  const { appleSignInConfig, appleClientSecret } = await load();
  const { pem, publicKey } = await keyPair();
  const config = appleSignInConfig(env({ APPLE_TEAM_ID: 'AB12CD34EF', APPLE_SIGN_IN_KEY_ID: 'KEY1234567', APPLE_SIGN_IN_PRIVATE_KEY: pem.replace(/\n/g, '\\n') }));
  const secret = await appleClientSecret(config, { crypto: webcrypto, now: () => 1_800_000_000_000 });
  const [header, claims, signature] = secret.split('.');
  assert.deepEqual(decode(header), { alg: 'ES256', kid: 'KEY1234567' });
  assert.deepEqual(decode(claims), { iss: 'AB12CD34EF', iat: 1_800_000_000, exp: 1_800_000_300, aud: 'https://appleid.apple.com', sub: 'com.usapp.us' });
  const valid = await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(signature, 'base64url'), Buffer.from(`${header}.${claims}`));
  assert.equal(valid, true, 'signed with the Sign in with Apple key');
  await assert.rejects(appleClientSecret(null), /apple_sign_in_not_configured/);
});

test('code exchange: the refresh token, or a short outcome', async () => {
  const { appleSignInConfig, exchangeAuthorizationCode, APPLE_TOKEN_URL } = await load();
  const { pem } = await keyPair();
  const config = appleSignInConfig(env({ APPLE_TEAM_ID: 'AB12CD34EF', APPLE_SIGN_IN_KEY_ID: 'KEY1234567', APPLE_SIGN_IN_PRIVATE_KEY: pem }));
  const ok = fakeApple([{ status: 200, body: { access_token: 'a', refresh_token: 'r.1.secret', id_token: 'x.y.z' } }]);
  assert.deepEqual(await exchangeAuthorizationCode(config, 'c1234567.abc', { fetch: ok.fetch, crypto: webcrypto }), { ok: true, refreshToken: 'r.1.secret' });
  assert.equal(ok.calls[0].url, APPLE_TOKEN_URL);
  assert.equal(ok.calls[0].body.grant_type, 'authorization_code');
  assert.equal(ok.calls[0].body.client_id, 'com.usapp.us');
  assert.equal(ok.calls[0].body.code, 'c1234567.abc');
  assert.equal(ok.calls[0].body.client_secret.split('.').length, 3);
  assert.equal(ok.calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');

  const used = fakeApple([{ status: 400, body: { error: 'invalid_grant' } }]);
  assert.deepEqual(await exchangeAuthorizationCode(config, 'c1234567.abc', { fetch: used.fetch, crypto: webcrypto }), { ok: false, outcome: 'invalid-code' });
  const down = fakeApple([{ status: 503 }]);
  assert.deepEqual(await exchangeAuthorizationCode(config, 'c1234567.abc', { fetch: down.fetch, crypto: webcrypto }), { ok: false, outcome: 'transient' });
  const offline = fakeApple([new Error('offline')]);
  assert.deepEqual(await exchangeAuthorizationCode(config, 'c1234567.abc', { fetch: offline.fetch, crypto: webcrypto }), { ok: false, outcome: 'transient' });
  const badClient = fakeApple([{ status: 400, body: { error: 'invalid_client' } }]);
  assert.deepEqual(await exchangeAuthorizationCode(config, 'c1234567.abc', { fetch: badClient.fetch, crypto: webcrypto }), { ok: false, outcome: 'config' });
  const never = fakeApple([]);
  assert.deepEqual(await exchangeAuthorizationCode(config, 'bad code!', { fetch: never.fetch, crypto: webcrypto }), { ok: false, outcome: 'invalid-code' });
  assert.deepEqual(await exchangeAuthorizationCode(null, 'c1234567.abc', { fetch: never.fetch }), { ok: false, outcome: 'config' });
  assert.equal(never.calls.length, 0, 'nothing sent without a valid code and configuration');
});

test('revoke at deletion: the refresh token, with token_type_hint; no token = nothing to do', async () => {
  const { appleSignInConfig, revokeRefreshToken, APPLE_REVOKE_URL } = await load();
  const { pem } = await keyPair();
  const config = appleSignInConfig(env({ APPLE_TEAM_ID: 'AB12CD34EF', APPLE_SIGN_IN_KEY_ID: 'KEY1234567', APPLE_SIGN_IN_PRIVATE_KEY: pem }));
  const ok = fakeApple([{ status: 200 }]);
  assert.deepEqual(await revokeRefreshToken(config, 'r.1.secret', { fetch: ok.fetch, crypto: webcrypto }), { ok: true });
  assert.equal(ok.calls[0].url, APPLE_REVOKE_URL);
  assert.deepEqual({ token: ok.calls[0].body.token, hint: ok.calls[0].body.token_type_hint, client: ok.calls[0].body.client_id },
    { token: 'r.1.secret', hint: 'refresh_token', client: 'com.usapp.us' });
  const down = fakeApple([{ status: 500 }]);
  assert.deepEqual(await revokeRefreshToken(config, 'r.1.secret', { fetch: down.fetch, crypto: webcrypto }), { ok: false, outcome: 'transient' });
  const badClient = fakeApple([{ status: 400, body: { error: 'invalid_client' } }]);
  assert.deepEqual(await revokeRefreshToken(config, 'r.1.secret', { fetch: badClient.fetch, crypto: webcrypto }), { ok: false, outcome: 'config' });
  const none = fakeApple([]);
  assert.deepEqual(await revokeRefreshToken(config, '', { fetch: none.fetch }), { ok: true });
  assert.deepEqual(await revokeRefreshToken(null, 'r.1.secret', { fetch: none.fetch }), { ok: false, outcome: 'config' });
  assert.equal(none.calls.length, 0);
});
