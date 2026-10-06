// Native Notifications V1 — native transport: FCM HTTP v1 (Android) and APNs
// token-based HTTP/2 (iOS).
//
// Pure/injectable: `fetch`, `crypto` and the clock are parameters, so it runs
// unchanged under Deno (Edge Functions) and Node (tests with fake providers).
//
// Credentials are Edge secrets only (never the client, Android assets, the iOS
// bundle, Git or logs):
//   FCM_SERVICE_ACCOUNT_JSON  Firebase service account JSON (project_id, client_email, private_key)
//   APNS_KEY_ID               10-character key id of the APNs auth key
//   APNS_TEAM_ID              10-character Apple team id
//   APNS_PRIVATE_KEY          the .p8 auth key (PEM)
//   APNS_TOPIC                optional, default com.usapp.us
// Missing or malformed → that provider is "not ready" and its devices are
// skipped (fail closed); nothing is guessed.
//
// Every send returns { ok: true } or { ok: false, outcome } where outcome is:
//   invalid-token  the provider says the token is dead → the caller deletes the row
//   transient      429 / 5xx / network / timeout       → token kept
//   config         credentials rejected               → token kept
//   rejected       payload refused                    → token kept

export const APNS_TOPIC_DEFAULT = 'com.usapp.us';
export const ANDROID_CHANNELS = Object.freeze({ partner: 'us_partner', reminders: 'us_reminders' });
export const APNS_CATEGORIES = Object.freeze({ think: 'US_THINK' });
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REQUEST_TIMEOUT_MS = 10_000;
const FCM_TOKEN = /^[A-Za-z0-9_:\-]{32,4096}$/;
const APNS_TOKEN = /^[0-9a-f]{64,200}$/;
const APNS_KEY_ID = /^[A-Z0-9]{10}$/;

function pemBody(pem, label) {
  if (typeof pem !== 'string') return null;
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const match = normalized.match(new RegExp(`-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+)-----END ${label}-----`));
  return match ? match[1].replace(/\s+/g, '') : null;
}

/** Reads provider configuration from a getter (Deno.env.get). Never returns secrets in errors. */
export function nativePushConfig(getEnv) {
  const get = (key) => {
    try { const value = getEnv(key); return typeof value === 'string' ? value.trim() : ''; } catch (_) { return ''; }
  };
  let fcm = null;
  const serviceAccount = get('FCM_SERVICE_ACCOUNT_JSON');
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      const keyBody = pemBody(parsed?.private_key, 'PRIVATE KEY');
      if (typeof parsed?.project_id === 'string' && /^[a-z0-9-]{4,64}$/.test(parsed.project_id)
        && typeof parsed?.client_email === 'string' && /^[^@\s]+@[^@\s]+$/.test(parsed.client_email) && keyBody) {
        fcm = { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKeyDer: keyBody };
      }
    } catch (_) { fcm = null; }
  }
  let apns = null;
  const keyId = get('APNS_KEY_ID');
  const teamId = get('APNS_TEAM_ID');
  const apnsKey = pemBody(get('APNS_PRIVATE_KEY'), 'PRIVATE KEY');
  if (APNS_KEY_ID.test(keyId) && APNS_KEY_ID.test(teamId) && apnsKey) {
    const topic = get('APNS_TOPIC') || APNS_TOPIC_DEFAULT;
    if (/^[A-Za-z0-9.-]{3,155}$/.test(topic)) apns = { keyId, teamId, privateKeyDer: apnsKey, topic };
  }
  return { fcm, apns };
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

async function signJwt(crypto, { header, claims, keyDer, algorithm }) {
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const params = algorithm === 'RS256'
    ? { importAlg: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, signAlg: { name: 'RSASSA-PKCS1-v1_5' } }
    : { importAlg: { name: 'ECDSA', namedCurve: 'P-256' }, signAlg: { name: 'ECDSA', hash: 'SHA-256' } };
  const key = await crypto.subtle.importKey('pkcs8', bytesFromBase64(keyDer), params.importAlg, false, ['sign']);
  // WebCrypto ECDSA already returns the raw r||s form that JWS ES256 requires.
  const signature = await crypto.subtle.sign(params.signAlg, key, textEncoder.encode(signingInput));
  return `${signingInput}.${base64UrlFromBytes(signature)}`;
}

async function timedFetch(fetchImpl, url, init) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    return await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** FCM HTTP v1 message for one Android device. Data values are strings (FCM rule). */
export function fcmMessage(notification, token) {
  return {
    message: {
      token,
      notification: { title: notification.title, body: notification.body },
      data: {
        v: String(notification.v),
        type: notification.type,
        target: notification.target,
        ref: notification.ref || '',
        tag: notification.tag,
      },
      android: {
        priority: notification.urgency === 'high' ? 'HIGH' : 'NORMAL',
        ttl: `${notification.ttl}s`,
        collapse_key: notification.tag.slice(0, 64),
        notification: {
          channel_id: ANDROID_CHANNELS[notification.channel] || ANDROID_CHANNELS.partner,
          tag: notification.tag,
          default_sound: true,
          default_vibrate_timings: true,
        },
      },
    },
  };
}

/** APNs request (headers + body) for one iOS device. No URL, no secret, no content beyond title/body. */
export function apnsRequest(notification, nowMs = Date.now()) {
  const aps = {
    alert: { title: notification.title, body: notification.body },
    sound: 'default',
    'thread-id': notification.channel,
  };
  if (notification.category && APNS_CATEGORIES[notification.category]) aps.category = APNS_CATEGORIES[notification.category];
  if (Number.isInteger(notification.badge) && notification.badge >= 0) aps.badge = notification.badge;
  const headers = {
    'apns-push-type': 'alert',
    'apns-priority': notification.urgency === 'high' ? '10' : '5',
    'apns-expiration': String(Math.floor(nowMs / 1000) + notification.ttl),
  };
  if (new TextEncoder().encode(notification.tag).length <= 64) headers['apns-collapse-id'] = notification.tag;
  return {
    headers,
    body: { aps, us: { v: notification.v, type: notification.type, target: notification.target, ref: notification.ref || '', tag: notification.tag } },
  };
}

export function classifyFcmError(status, body) {
  const error = body?.error || {};
  const codes = [error.status, ...(Array.isArray(error.details) ? error.details.map((d) => d?.errorCode) : [])].filter(Boolean);
  const message = String(error.message || '');
  if (codes.includes('UNREGISTERED') || status === 404) return 'invalid-token';
  if (codes.includes('SENDER_ID_MISMATCH')) return 'invalid-token';
  if ((codes.includes('INVALID_ARGUMENT') || status === 400) && /registration token/i.test(message)) return 'invalid-token';
  if (status === 429 || status >= 500 || codes.includes('QUOTA_EXCEEDED') || codes.includes('UNAVAILABLE') || codes.includes('INTERNAL')) return 'transient';
  if (status === 401 || status === 403 || codes.includes('THIRD_PARTY_AUTH_ERROR') || codes.includes('PERMISSION_DENIED') || codes.includes('UNAUTHENTICATED')) return 'config';
  return 'rejected';
}

export function classifyApnsError(status, body) {
  const reason = String(body?.reason || '');
  if (status === 410 || reason === 'Unregistered') return 'invalid-token';
  if (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic') return 'invalid-token';
  if (status === 429 || status >= 500) return 'transient';
  if (status === 403 || status === 401) return 'config';
  return 'rejected';
}

// Provider access tokens live for the isolate (FCM ~1 h, APNs JWT reused up to 50 min).
const tokenCache = new Map();

/**
 * @param config  nativePushConfig(...) result
 * @param fetch   fetch implementation
 * @param crypto  WebCrypto (globalThis.crypto)
 * @param now     () => ms
 */
export function createNativeTransport({ config, fetch: fetchImpl = globalThis.fetch, crypto = globalThis.crypto, now = () => Date.now() } = {}) {
  const fcm = config?.fcm || null;
  const apns = config?.apns || null;

  function ready(provider) {
    if (provider === 'fcm') return Boolean(fcm && typeof fetchImpl === 'function' && crypto?.subtle);
    if (provider === 'apns') return Boolean(apns && typeof fetchImpl === 'function' && crypto?.subtle);
    return false;
  }

  async function fcmAccessToken() {
    const cacheKey = `fcm:${fcm.clientEmail}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt - 60_000 > now()) return cached.value;
    const issuedAt = Math.floor(now() / 1000);
    const assertion = await signJwt(crypto, {
      algorithm: 'RS256',
      header: { alg: 'RS256', typ: 'JWT' },
      claims: { iss: fcm.clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 },
      keyDer: fcm.privateKeyDer,
    });
    const response = await timedFetch(fetchImpl, GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body?.access_token !== 'string') {
      const error = new Error('fcm_auth_failed');
      error.outcome = response.status >= 500 || response.status === 429 ? 'transient' : 'config';
      throw error;
    }
    const lifetime = Math.max(60, Math.min(Number(body.expires_in) || 3600, 3600));
    tokenCache.set(cacheKey, { value: body.access_token, expiresAt: now() + lifetime * 1000 });
    return body.access_token;
  }

  async function apnsJwt() {
    const cacheKey = `apns:${apns.teamId}:${apns.keyId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.value;
    const issuedAt = Math.floor(now() / 1000);
    const value = await signJwt(crypto, {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: apns.keyId },
      claims: { iss: apns.teamId, iat: issuedAt },
      keyDer: apns.privateKeyDer,
    });
    // Apple accepts a provider token for up to 60 min; refresh after 50.
    tokenCache.set(cacheKey, { value, expiresAt: now() + 50 * 60_000 });
    return value;
  }

  async function sendFcm(device, notification) {
    if (!FCM_TOKEN.test(String(device.token || ''))) return { ok: false, outcome: 'invalid-token' };
    let accessToken;
    try { accessToken = await fcmAccessToken(); }
    catch (error) { return { ok: false, outcome: error?.outcome || 'transient' }; }
    let response;
    try {
      response = await timedFetch(fetchImpl, `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcm.projectId)}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(fcmMessage(notification, device.token)),
      });
    } catch (_) {
      return { ok: false, outcome: 'transient' };
    }
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) tokenCache.delete(`fcm:${fcm.clientEmail}`);
    return { ok: false, outcome: classifyFcmError(response.status, body) };
  }

  async function sendApns(device, notification) {
    const token = String(device.token || '');
    if (!APNS_TOKEN.test(token)) return { ok: false, outcome: 'invalid-token' };
    const host = device.apns_environment === 'development' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    let jwt;
    try { jwt = await apnsJwt(); }
    catch (_) { return { ok: false, outcome: 'config' }; }
    const request = apnsRequest(notification, now());
    let response;
    try {
      response = await timedFetch(fetchImpl, `https://${host}/3/device/${token}`, {
        method: 'POST',
        headers: { authorization: `bearer ${jwt}`, 'apns-topic': apns.topic, 'content-type': 'application/json', ...request.headers },
        body: JSON.stringify(request.body),
      });
    } catch (_) {
      return { ok: false, outcome: 'transient' };
    }
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => ({}));
    if (response.status === 403 && /ProviderToken/.test(String(body?.reason || ''))) tokenCache.delete(`apns:${apns.teamId}:${apns.keyId}`);
    return { ok: false, outcome: classifyApnsError(response.status, body) };
  }

  async function send(device, notification) {
    if (device?.provider === 'fcm' && device.platform === 'android' && ready('fcm')) return sendFcm(device, notification);
    if (device?.provider === 'apns' && device.platform === 'ios' && ready('apns')) return sendApns(device, notification);
    return { ok: false, outcome: 'config' };
  }

  return Object.freeze({ ready, send });
}

/** Edge glue: the transport configured from Edge secrets (Deno.env.get). */
export function nativeTransportFromEnv(getEnv, fetchImpl = globalThis.fetch) {
  return createNativeTransport({ config: nativePushConfig(getEnv), fetch: fetchImpl });
}

/** Test-only: forget cached provider tokens. */
export function resetNativeTransportCache() {
  tokenCache.clear();
}
