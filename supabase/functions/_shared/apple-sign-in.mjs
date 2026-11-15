// Accedi con Apple — the server side Apple requires (iOS Store V1, 05/11/2026).
//
// App Store rule 5.1.1(v) and TN3194: when an account made with Sign in with
// Apple is deleted, its Apple tokens are revoked through the REST API. Supabase
// Auth does not do it, so US keeps Apple's refresh token server-side:
//   1. right after «Continua con Apple», the app sends the one-time
//      authorization code (valid a few minutes) to an Edge function, which
//      exchanges it at /auth/token and stores the refresh token (service role
//      only, never readable by any client);
//   2. delete-account revokes it at /auth/revoke before the user is deleted.
// If there is no token (an account made before this, a failed exchange), the
// deletion still happens and the user is told how to remove US from
// Settings › Apple ID › Sign in with Apple (TN3194).
//
// Pure/injectable like native-push-transport.mjs: `fetch`, `crypto` and the
// clock are parameters, so it runs under Deno (Edge) and Node (tests).
// Credentials are Edge secrets only:
//   APPLE_TEAM_ID                 10 characters (falls back to APNS_TEAM_ID)
//   APPLE_SIGN_IN_KEY_ID          10 characters, a "Sign in with Apple" key
//   APPLE_SIGN_IN_PRIVATE_KEY     that key's .p8 (PEM)
//   APPLE_SIGN_IN_CLIENT_ID       optional, default app.uscouple (the iOS bundle id)
// Missing or malformed → not configured: nothing is exchanged or revoked.

export const APPLE_AUDIENCE = 'https://appleid.apple.com';
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
export const APPLE_CLIENT_ID_DEFAULT = 'app.uscouple';
// Apple accepts a client secret for up to 6 months; ours lives 5 minutes.
export const CLIENT_SECRET_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 10_000;
const KEY_ID = /^[A-Z0-9]{10}$/;
const CLIENT_ID = /^[A-Za-z0-9.-]{3,155}$/;

function pemBody(pem) {
  if (typeof pem !== 'string') return null;
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const match = normalized.match(/-----BEGIN PRIVATE KEY-----([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----/);
  return match ? match[1].replace(/\s+/g, '') : null;
}

/** Reads the configuration from a getter (Deno.env.get). Never returns secrets in errors. */
export function appleSignInConfig(getEnv) {
  const get = (key) => {
    try { const value = getEnv(key); return typeof value === 'string' ? value.trim() : ''; } catch (_) { return ''; }
  };
  const teamId = get('APPLE_TEAM_ID') || get('APNS_TEAM_ID');
  const keyId = get('APPLE_SIGN_IN_KEY_ID');
  const privateKeyDer = pemBody(get('APPLE_SIGN_IN_PRIVATE_KEY'));
  const clientId = get('APPLE_SIGN_IN_CLIENT_ID') || APPLE_CLIENT_ID_DEFAULT;
  if (!KEY_ID.test(teamId) || !KEY_ID.test(keyId) || !privateKeyDer || !CLIENT_ID.test(clientId)) return null;
  return Object.freeze({ teamId, keyId, privateKeyDer, clientId });
}

const textEncoder = new TextEncoder();
function base64UrlFromBytes(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const base64UrlJson = (value) => base64UrlFromBytes(textEncoder.encode(JSON.stringify(value)));
function bytesFromBase64(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** The ES256 client secret Apple wants for /auth/token and /auth/revoke. */
export async function appleClientSecret(config, { crypto = globalThis.crypto, now = () => Date.now() } = {}) {
  if (!config) throw new Error('apple_sign_in_not_configured');
  const issuedAt = Math.floor(now() / 1000);
  const header = { alg: 'ES256', kid: config.keyId };
  const claims = { iss: config.teamId, iat: issuedAt, exp: issuedAt + CLIENT_SECRET_SECONDS, aud: APPLE_AUDIENCE, sub: config.clientId };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const key = await crypto.subtle.importKey('pkcs8', bytesFromBase64(config.privateKeyDer), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto ECDSA returns the raw r||s form JWS ES256 requires.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, textEncoder.encode(signingInput));
  return `${signingInput}.${base64UrlFromBytes(signature)}`;
}

function form(fields) {
  return Object.entries(fields).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

async function post(fetchImpl, url, body) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      ...(controller ? { signal: controller.signal } : {})
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Exchanges the app's one-time authorization code for Apple's refresh token.
 * { ok: true, refreshToken } or { ok: false, outcome: 'invalid-code' | 'transient' | 'config' }.
 * The refresh token goes only to the service-role table, never back to a client.
 */
export async function exchangeAuthorizationCode(config, code, { fetch: fetchImpl = globalThis.fetch, crypto = globalThis.crypto, now = () => Date.now() } = {}) {
  if (!config) return { ok: false, outcome: 'config' };
  if (typeof code !== 'string' || !/^[A-Za-z0-9._-]{8,2048}$/.test(code)) return { ok: false, outcome: 'invalid-code' };
  let response;
  try {
    const secret = await appleClientSecret(config, { crypto, now });
    response = await post(fetchImpl, APPLE_TOKEN_URL, form({ client_id: config.clientId, client_secret: secret, code, grant_type: 'authorization_code' }));
  } catch (_) {
    return { ok: false, outcome: 'transient' };
  }
  const body = await response.json().catch(() => ({}));
  if (response.ok && typeof body?.refresh_token === 'string' && body.refresh_token) return { ok: true, refreshToken: body.refresh_token };
  if (response.status === 400 && body?.error === 'invalid_grant') return { ok: false, outcome: 'invalid-code' };
  if (response.status === 400 && body?.error === 'invalid_client') return { ok: false, outcome: 'config' };
  return { ok: false, outcome: response.status >= 500 || response.status === 429 ? 'transient' : 'config' };
}

/**
 * Revokes a stored refresh token (account deletion). Apple answers 200 even
 * for a token it no longer knows, so 200 is "done".
 * { ok: true } or { ok: false, outcome: 'transient' | 'config' }.
 */
export async function revokeRefreshToken(config, refreshToken, { fetch: fetchImpl = globalThis.fetch, crypto = globalThis.crypto, now = () => Date.now() } = {}) {
  if (!config) return { ok: false, outcome: 'config' };
  if (typeof refreshToken !== 'string' || !refreshToken) return { ok: true };
  let response;
  try {
    const secret = await appleClientSecret(config, { crypto, now });
    response = await post(fetchImpl, APPLE_REVOKE_URL, form({ client_id: config.clientId, client_secret: secret, token: refreshToken, token_type_hint: 'refresh_token' }));
  } catch (_) {
    return { ok: false, outcome: 'transient' };
  }
  if (response.ok) return { ok: true };
  const body = await response.json().catch(() => ({}));
  if (response.status === 400 && body?.error === 'invalid_client') return { ok: false, outcome: 'config' };
  return { ok: false, outcome: response.status >= 500 || response.status === 429 ? 'transient' : 'config' };
}
