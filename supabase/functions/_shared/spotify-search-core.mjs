// M5H — Spotify track search core. Pure/injectable so it runs unmodified
// under Deno (the deployed edge function) and under Node (tests, with a
// mocked fetch). Never persists tokens; the cache object is caller-owned.

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
export const DEFAULT_MARKET = 'IT';
export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 10; // Spotify's own ceiling for /v1/search
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export class SpotifySearchError extends Error {
  constructor(code, { status = 502, retryAfterSeconds = null } = {}) {
    super(code);
    this.name = 'SpotifySearchError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function normalizeQuery(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length < MIN_QUERY_LENGTH || value.length > MAX_QUERY_LENGTH) {
    throw new SpotifySearchError('invalid_query', { status: 400 });
  }
  return value;
}

export function parseRetryAfterSeconds(headerValue) {
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  return null;
}

// Spotify's 429 body may carry { error: { status, message, reason: "QUOTA_EXCEEDED" } }.
// Any other shape (or no body at all) is ordinary rate limiting, not quota exhaustion.
async function readSpotifyErrorReason(response) {
  try {
    const body = await response.json();
    const reason = body?.error?.reason;
    return typeof reason === 'string' ? reason : null;
  } catch (_) {
    return null;
  }
}

function base64Encode(value) {
  if (typeof btoa === 'function') return btoa(value);
  return Buffer.from(value, 'utf-8').toString('base64');
}

export async function getAccessToken({ clientId, clientSecret, fetchImpl = fetch, cache = {}, now = () => Date.now() }) {
  if (!clientId || !clientSecret) throw new SpotifySearchError('server_configuration_missing', { status: 500 });
  const currentTime = now();
  if (cache.token && cache.expiresAt && cache.expiresAt - TOKEN_EXPIRY_SKEW_MS > currentTime) {
    return cache.token;
  }
  const basic = base64Encode(`${clientId}:${clientSecret}`);
  let response;
  try {
    response = await fetchImpl('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
  } catch (_) {
    throw new SpotifySearchError('upstream_unavailable', { status: 502 });
  }
  if (response.status === 401 || response.status === 403) {
    throw new SpotifySearchError('upstream_auth_failed', { status: 502 });
  }
  if (!response.ok) {
    throw new SpotifySearchError('upstream_unavailable', { status: 502 });
  }
  const payload = await response.json().catch(() => null);
  const token = payload?.access_token;
  const expiresIn = Number(payload?.expires_in);
  if (typeof token !== 'string' || !token || !Number.isFinite(expiresIn)) {
    throw new SpotifySearchError('upstream_unavailable', { status: 502 });
  }
  cache.token = token;
  cache.expiresAt = currentTime + expiresIn * 1000;
  return token;
}

export async function searchSpotifyTracks({ token, query, fetchImpl = fetch, market = DEFAULT_MARKET, limit = DEFAULT_LIMIT }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
  const params = new URLSearchParams({ q: query, type: 'track', market, limit: String(boundedLimit) });
  let response;
  try {
    response = await fetchImpl(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (_) {
    throw new SpotifySearchError('upstream_unavailable', { status: 502 });
  }
  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers?.get?.('Retry-After'));
    const reason = await readSpotifyErrorReason(response);
    const code = reason === 'QUOTA_EXCEEDED' ? 'quota_exceeded' : 'rate_limited';
    throw new SpotifySearchError(code, { status: 429, retryAfterSeconds });
  }
  if (response.status === 401 || response.status === 403) {
    throw new SpotifySearchError('upstream_auth_failed', { status: 502 });
  }
  if (!response.ok) {
    throw new SpotifySearchError('upstream_unavailable', { status: 502 });
  }
  const payload = await response.json().catch(() => null);
  if (!payload) throw new SpotifySearchError('upstream_unavailable', { status: 502 });
  return payload;
}

export function canonicalTrackUrl(id) {
  return `https://open.spotify.com/track/${id}`;
}

export function normalizeTracks(payload, limit = DEFAULT_LIMIT) {
  const items = Array.isArray(payload?.tracks?.items) ? payload.tracks.items : [];
  const tracks = [];
  for (const item of items) {
    if (tracks.length >= limit) break;
    const id = typeof item?.id === 'string' ? item.id : '';
    const title = typeof item?.name === 'string' ? item.name : '';
    if (!id || !title) continue;
    const artist = Array.isArray(item?.artists)
      ? item.artists.map((entry) => (typeof entry?.name === 'string' ? entry.name : '')).filter(Boolean).join(', ')
      : '';
    const album = typeof item?.album?.name === 'string' ? item.album.name : '';
    const images = Array.isArray(item?.album?.images) ? item.album.images : [];
    const imageUrl = typeof images[images.length - 1]?.url === 'string'
      ? images[images.length - 1].url
      : (typeof images[0]?.url === 'string' ? images[0].url : '');
    tracks.push({ id, title, artist, album, imageUrl, spotifyUrl: canonicalTrackUrl(id) });
  }
  return tracks;
}
