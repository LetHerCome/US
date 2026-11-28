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
//   APNS_TOPIC                optional, default app.uscouple (the iOS bundle id)
// Missing or malformed → that provider is "not ready" and its devices are
// skipped (fail closed); nothing is guessed.
//
// Every send returns { ok: true } or { ok: false, outcome } where outcome is:
//   invalid-token  the provider says the token is dead → the caller deletes the row
//   transient      429 / 5xx / network / timeout       → token kept
//   config         credentials rejected               → token kept
//   rejected       payload refused                    → token kept

export const APNS_TOPIC_DEFAULT = 'app.uscouple';
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

// S3: data-only FCM. Android must verify the account-bound installation
// before displaying a local notification. FCM carries no private copy,
// content id, account id, target or action; since 16/10/2026 it carries the
// allow-listed event kind below (founder decision), so the phone can say what
// happened. The installation UUID is a random routing value, not an
// authorization secret or hardware identifier.
export const ANDROID_SAFE_COPY = Object.freeze({
  title: 'US.',
  body: 'Apri US per vedere le novità.',
});
const ANDROID_SAFE_TAG = 'us-private-notice';

// Founder decision 16/10/2026: Android notifications say what happened. FCM
// carries ONE allow-listed kind (the event class, never text, names, ids or
// targets); the phone writes the sentence itself, in its language, and only
// after the owner gate accepts the installation. Unknown or missing kind: the
// generic ANDROID_SAFE_COPY. Keep in sync with UsPushNotices.java (tested).
export const ANDROID_NOTICE_KINDS = Object.freeze({
  test: 'test',
  think: 'think',
  think_reaction: 'think_reply',
  daily_answer: 'daily_turn',
  daily_evening: 'daily_turn',
  daily_reveal: 'daily_ready',
  daily_reaction: 'daily_reaction',
  daily_question: 'daily_new',
  quest_confirmed: 'quest',
  left_for_you: 'left_for_you',
  game_waiting: 'game_turn',
  game_reveal: 'game_ready',
  game_weekly_created: 'game_weekly',
  game_weekly_turn: 'game_weekly_turn',
  // Play Us (28/11/2026): the live invite; the phone says it with the partner's name, it opens Gioca.
  play_invite: 'play_invite',
  calendar_reminder: 'calendar',
  relationship: 'anniversary',
  partner_joined: 'partner_joined',
  lavagna: 'lavagna',
  // Noi, Fase B.3: an older app shows the generic line until it knows the kind.
  postit: 'postit',
  // La bacheca, fase 2 (27/11/2026): the phone writes the line, it opens Ricordi.
  bacheca_postit: 'bacheca_postit',
  challenge_new: 'challenge',
  challenge_reminder: 'challenge_reminder',
  challenge_photo: 'challenge_photo',
  // L'invito che si rinnova (27/11/2026).
  invite_reminder: 'invite_reminder',
  // US vi ricorda (27/11/2026): the phone says it with the partner's name it already has.
  ricorda_birthday_week: 'birthday_week',
  ricorda_birthday: 'birthday',
  ricorda_anniversary_week: 'anniversary_week',
  ricorda_year_ago: 'year_ago',
  ricorda_bacheca: 'bacheca',
  // Come stai che conta (27/11/2026): an answer to my Come stai. With a known
  // gesture it travels as its own kind (ANDROID_STATUS_KINDS); this one is the
  // generic «ha risposto al tuo Come stai» for anything else.
  status_response: 'status_reply',
});
// Come stai che conta (27/11/2026, D7/D16): the gesture is an allow-listed
// suffix of the kind, so the phone writes «Bea: Ti mando un abbraccio» itself.
// Never a text, a name or an id: only one of these nine kinds.
export const ANDROID_STATUS_KINDS = Object.freeze({
  abbraccio: 'status_abbraccio',
  riposati: 'status_riposati',
  respira: 'status_respira',
  cuore: 'status_cuore',
  festa: 'status_festa',
  forza: 'status_forza',
  spacca: 'status_spacca',
  buon_viaggio: 'status_buon_viaggio',
  buon_appetito: 'status_buon_appetito',
});
// I cuori (27/11/2026): «Bea ti ha pensato 5 volte». A plural notification
// picks the plural kind. An older app does not know the kind: the generic line.
// Ti penso ×N (27/11/2026, founder: the number is not private): the plural
// kinds alone also carry n, the number of times, digits only, 2..99, and the
// phone says «Bea ti ha pensato 5 volte»; without n, «tante volte». Never a
// name, a text, an id or a target: only that one number, on these kinds only.
export const ANDROID_PLURAL_KINDS = Object.freeze({
  think: 'think_many',
});
const ANDROID_TIMES_KINDS = Object.freeze(Object.values(ANDROID_PLURAL_KINDS));
const androidTimes = (kind, times) => (ANDROID_TIMES_KINDS.includes(kind) && Number.isInteger(times) && times >= 2 && times <= 99 ? String(times) : '');
const INSTALLATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (map, key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '');

/** Strict data-only FCM v2; device is the authenticated dispatcher DB row. */
export function fcmMessage(notification, device) {
  const installation = String(device?.installation_id || '').toLowerCase();
  if (!INSTALLATION_ID.test(installation)) throw new Error('native_installation_missing');
  const kind = (notification?.plural === true && own(ANDROID_PLURAL_KINDS, notification?.type))
    || (notification?.type === 'status_response' && typeof notification?.gesture === 'string' && own(ANDROID_STATUS_KINDS, notification.gesture))
    || own(ANDROID_NOTICE_KINDS, notification?.type);
  const times = androidTimes(kind, notification?.times);
  const data = kind ? { v: '2', installation, k: kind } : { v: '2', installation };
  if (times) data.n = times;
  return {
    message: {
      token: device.token,
      data,
      android: {
        priority: notification.urgency === 'high' ? 'HIGH' : 'NORMAL',
        ttl: `${notification.ttl}s`,
        collapse_key: ANDROID_SAFE_TAG,
        // Do not add message.notification or android.notification: Firebase
        // auto-renders those in background before native ownership checks.
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

// Widget signals (founder, 27/11/2026): the other person's character changed,
// or they left the couple. Silent: no banner, no sound, no JS event, never a
// notification. v '3' on purpose: an app of before this change accepts only
// v '2' and drops the packet, so it can never show the generic notice for it.
// The look is the one the widget snapshot already holds (UsWidgetContract:
// shape, head, face and two #rrggbb colours); 'clear' carries nothing at all.
// No name, photo, id, text or account identity.
export const WIDGET_SIGNAL_VERSION = '3';
export const WIDGET_SIGNAL_LOOK = Object.freeze({
  shape: /^(palla|quadrato|triangolo|goccia|nuvola)$/,
  head: /^(cappello|fiocco|cuffie|corona|coroncina|festa|cento)$/,
  face: /^(occhiali|sole|sciarpina|gala|macchinetta)$/,
  color: /^#[0-9a-f]{6}$/,
  day: /^#[0-9a-f]{6}$/,
});
const WIDGET_OWNER = /^[a-f0-9]{64}$/;
// Come stai che conta (27/11/2026, D13): the other person's Come stai, as the
// widget snapshot holds it (UsWidgetContract.statusPerson): one of the twelve
// keys, the words' form and the server's two instants. Nothing else.
export const WIDGET_SIGNAL_STATUS = Object.freeze({
  status: /^(innamorato|felice|stanco|giu|nervoso|malato|festa|lavoro|studio|palestra|viaggio|tavola)$/,
  form: /^(m|f)$/,
});
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const isoInstant = (value) => {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return '';
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
};

/** The allow-listed signal: {s:'look', shape, head, face, color, day} (unknown values empty), {s:'status', status, form, at, until} or {s:'clear'}. */
export function widgetSignal(input) {
  if (input?.s === 'clear') return Object.freeze({ s: 'clear' });
  if (input?.s === 'status') {
    const key = typeof input.status === 'string' && WIDGET_SIGNAL_STATUS.status.test(input.status) ? input.status : '';
    const at = key ? isoInstant(input.at) : '';
    const until = key ? isoInstant(input.until) : '';
    const shown = Boolean(key && at && until);
    const form = typeof input.form === 'string' && WIDGET_SIGNAL_STATUS.form.test(input.form) ? input.form : '';
    // No state (or a broken one) travels as "nothing to show", never half a state.
    return Object.freeze({ s: 'status', status: shown ? key : '', form, at: shown ? at : '', until: shown ? until : '' });
  }
  if (input?.s !== 'look') throw new Error('widget_signal_invalid');
  const out = { s: 'look' };
  for (const [key, pattern] of Object.entries(WIDGET_SIGNAL_LOOK)) {
    const value = typeof input[key] === 'string' ? input[key].toLowerCase() : '';
    out[key] = pattern.test(value) ? value : '';
  }
  return Object.freeze(out);
}

/** Data-only FCM v3 for one Android device (same owner gate as v2: the installation). */
export function fcmSignalMessage(signal, device) {
  const installation = String(device?.installation_id || '').toLowerCase();
  if (!INSTALLATION_ID.test(installation)) throw new Error('native_installation_missing');
  const clean = widgetSignal(signal);
  const clear = clean.s === 'clear';
  const status = clean.s === 'status';
  return {
    message: {
      token: device.token,
      data: { v: WIDGET_SIGNAL_VERSION, installation, ...clean },
      android: {
        // Leaving matters more than a new hat: it may wake the phone.
        priority: clear ? 'HIGH' : 'NORMAL',
        // A Come stai lasts twelve hours: never delivered after it is over.
        ttl: clear ? '604800s' : status ? '43200s' : '86400s',
        // A newer look (or Come stai) replaces an older one still waiting.
        collapse_key: clear ? 'us-widget-clear' : status ? 'us-widget-status' : 'us-widget-look',
      },
    },
  };
}

/** APNs background push for the iOS widgets (content-available, no alert). */
export function apnsSignalRequest(signal, ownerHash, nowMs = Date.now()) {
  if (!WIDGET_OWNER.test(String(ownerHash || ''))) throw new Error('widget_owner_missing');
  const clean = widgetSignal(signal);
  const life = clean.s === 'clear' ? 604800 : clean.s === 'status' ? 43200 : 86400;
  return {
    headers: {
      'apns-push-type': 'background',
      // Apple requires priority 5 for background pushes.
      'apns-priority': '5',
      'apns-expiration': String(Math.floor(nowMs / 1000) + life),
      'apns-collapse-id': clean.s === 'clear' ? 'us-widget-clear' : clean.s === 'status' ? 'us-widget-status' : 'us-widget-look',
    },
    body: { aps: { 'content-available': 1 }, us: { v: Number(WIDGET_SIGNAL_VERSION), owner: ownerHash, widget: { ...clean } } },
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

  async function postFcm(device, build) {
    if (!FCM_TOKEN.test(String(device.token || ''))) return { ok: false, outcome: 'invalid-token' };
    // Old rows without a valid installation UUID cannot be routed safely.
    if (!INSTALLATION_ID.test(String(device.installation_id || ''))) return { ok: false, outcome: 'rejected' };
    let accessToken;
    try { accessToken = await fcmAccessToken(); }
    catch (error) { return { ok: false, outcome: error?.outcome || 'transient' }; }
    let response;
    try {
      response = await timedFetch(fetchImpl, `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcm.projectId)}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(build()),
      });
    } catch (_) {
      return { ok: false, outcome: 'transient' };
    }
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) tokenCache.delete(`fcm:${fcm.clientEmail}`);
    return { ok: false, outcome: classifyFcmError(response.status, body) };
  }

  async function postApns(device, build) {
    const token = String(device.token || '');
    if (!APNS_TOKEN.test(token)) return { ok: false, outcome: 'invalid-token' };
    const host = device.apns_environment === 'development' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    let jwt;
    try { jwt = await apnsJwt(); }
    catch (_) { return { ok: false, outcome: 'config' }; }
    const request = build();
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
    if (device?.provider === 'fcm' && device.platform === 'android' && ready('fcm')) return postFcm(device, () => fcmMessage(notification, device));
    if (device?.provider === 'apns' && device.platform === 'ios' && ready('apns')) return postApns(device, () => apnsRequest(notification, now()));
    return { ok: false, outcome: 'config' };
  }

  // Widget signals (27/11/2026): silent, never a banner. iOS only with the
  // widget owner hash of that device's account (see widget-signal-core.mjs).
  async function sendSignal(device, signal, ownerHash = '') {
    if (device?.provider === 'fcm' && device.platform === 'android' && ready('fcm')) return postFcm(device, () => fcmSignalMessage(signal, device));
    if (device?.provider === 'apns' && device.platform === 'ios' && ready('apns') && WIDGET_OWNER.test(String(ownerHash))) {
      return postApns(device, () => apnsSignalRequest(signal, ownerHash, now()));
    }
    return { ok: false, outcome: 'config' };
  }

  return Object.freeze({ ready, send, sendSignal });
}

/** Edge glue: the transport configured from Edge secrets (Deno.env.get). */
export function nativeTransportFromEnv(getEnv, fetchImpl = globalThis.fetch) {
  return createNativeTransport({ config: nativePushConfig(getEnv), fetch: fetchImpl });
}

/** Test-only: forget cached provider tokens. */
export function resetNativeTransportCache() {
  tokenCache.clear();
}
