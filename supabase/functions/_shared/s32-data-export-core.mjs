// US Store 1.0 — copy of a user's data on request (founder decision 8,
// 2026-10-14: by email, prepared by the operator; the in-app button is 1.1).
//
// PURE, dependency-injected module. The operator calls the Edge function
// `export-user-data` with the requester's email; it builds one JSON file in
// the private bucket `us-exports`, with signed links to the user's own media,
// and hands back a signed link to that file. When an email provider is
// configured (us-email.mjs) the link is mailed to the user; otherwise the
// operator receives it and sends it by hand.
//
// Server contract (service_role only): get_internal_operator_key(),
// s32_user_id_by_email(text), s32_export_user_data(uuid).
// Logs carry step names and codes only: never emails, ids, paths or links.

import { exportEmail, isEmailAddress } from './us-email.mjs';

export const MEDIA_BUCKET = 'us-media';
export const EXPORT_BUCKET = 'us-exports';
export const LINK_TTL_SECONDS = 7 * 24 * 3600;
export const SIGN_BATCH_SIZE = 100;
export const MAX_MEDIA = 20000;
export const SUPPORT_EMAIL_FALLBACK = 'privacy@us-app.invalid';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._\/-]{1,300}$/i;
const SAFE_CODE = /^[a-z0-9_.-]{1,64}$/i;
const noop = (_entry) => {};

export function isExportEnabled(env) {
  return env?.US_DATA_EXPORT_ENABLED === 'true';
}

export function isSafeMediaPath(path, userId) {
  return typeof path === 'string' && MEDIA_PATH.test(path) && !path.includes('..') && !path.includes('//')
    && path.split('/')[1] === userId;
}

// Same length check first, then every character: no early exit on content.
export function sameSecret(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || !y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const safeCode = (error) => {
  if (!error || typeof error !== 'object') return 'unknown';
  if (typeof error.message === 'string' && /^[a-z0-9_]{1,64}$/.test(error.message)) return error.message;
  if (typeof error.code === 'string' && SAFE_CODE.test(error.code)) return error.code;
  return 'unknown';
};

async function callRpc(rpc, fn, args) {
  try {
    const { data, error } = await rpc(fn, args);
    if (error) return { error: safeCode(error) };
    return { data };
  } catch (error) {
    return { error: safeCode(error) };
  }
}

const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function buildExportDocument({ userId, email, data, media, generatedAt, expiresAt }) {
  return {
    format: 'us-data-export',
    version: 1,
    generated_at: generatedAt,
    links_expire_at: expiresAt,
    account: { user_id: userId, email },
    // User-facing note inside the file (Italian; translated with the app).
    note: 'Questi sono i tuoi dati di US: profilo, risposte, umore, impegni e quello che hai creato nello spazio di coppia. '
      + 'Quello che ha scritto la tua persona non è incluso: sono dati suoi. I link alle foto scadono insieme al link di questo file.',
    data,
    media,
  };
}

export async function handleDataExport({ method, operatorKey, readBody, env, now = () => new Date(), createClient, sendEmail = /** @type {any} */ (null), log = noop }) {
  if (!isExportEnabled(env)) return { status: 503, body: { error: 'export_disabled' } };
  if (method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  const presented = String(operatorKey || '').trim();
  if (!presented) return { status: 401, body: { error: 'unauthorized' } };

  const client = createClient();
  if (!client) return { status: 500, body: { error: 'server_config' } };
  const rpc = (fn, args) => client.rpc(fn, args);
  const key = await callRpc(rpc, 'get_internal_operator_key', undefined);
  if (key.error || typeof key.data !== 'string' || !sameSecret(key.data, presented)) {
    log({ step: 'operator_auth', outcome: 'denied' });
    return { status: 401, body: { error: 'unauthorized' } };
  }

  let body = null;
  try { body = await readBody(); } catch { body = null; }
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!isEmailAddress(email)) return { status: 400, body: { error: 'email_invalid' } };

  const found = await callRpc(rpc, 's32_user_id_by_email', { p_email: email });
  if (found.error) return { status: 500, body: { error: 'lookup_failed' } };
  const userId = found.data;
  if (!UUID.test(String(userId || ''))) return { status: 404, body: { error: 'user_not_found' } };

  const exported = await callRpc(rpc, 's32_export_user_data', { p_user: userId });
  if (exported.error || !exported.data || typeof exported.data !== 'object') {
    log({ step: 'export_data', outcome: 'error', code: exported.error });
    return { status: 500, body: { error: 'export_failed' } };
  }
  const listed = Array.isArray(exported.data.media) ? exported.data.media : [];
  if (listed.length > MAX_MEDIA) {
    log({ step: 'export_media', outcome: 'too_many' });
    return { status: 500, body: { error: 'export_failed' } };
  }
  // Only files in the user's own folder get a link; anything else (an old
  // path layout, a path outside the folder) is left out, never signed.
  const paths = listed.filter((p) => isSafeMediaPath(p, userId));
  const skipped = listed.length - paths.length;
  log({ step: 'export_data', outcome: 'ok', count: paths.length, skipped });

  const generated = now();
  const expiresAt = new Date(generated.getTime() + LINK_TTL_SECONDS * 1000).toISOString();
  const media = [];
  const mediaStorage = client.storage.from(MEDIA_BUCKET);
  for (let i = 0; i < paths.length; i += SIGN_BATCH_SIZE) {
    const batch = paths.slice(i, i + SIGN_BATCH_SIZE);
    let signed;
    try {
      signed = await mediaStorage.createSignedUrls(batch, LINK_TTL_SECONDS);
    } catch {
      signed = { error: { code: 'sign_failed' } };
    }
    if (signed.error || !Array.isArray(signed.data)) {
      log({ step: 'sign_media', outcome: 'error' });
      return { status: 502, body: { error: 'export_failed' } };
    }
    // A file listed in the data but missing in Storage keeps its path, no link.
    for (const path of batch) {
      const entry = signed.data.find((x) => x && x.path === path);
      media.push({ path, url: entry && !entry.error && typeof entry.signedUrl === 'string' ? entry.signedUrl : null });
    }
  }

  const doc = buildExportDocument({ userId, email, data: exported.data, media, generatedAt: generated.toISOString(), expiresAt });
  const exportsStorage = client.storage.from(EXPORT_BUCKET);
  const objectName = `${userId}/${stamp(generated)}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  const uploaded = await exportsStorage.upload(objectName, bytes, { contentType: 'application/json', upsert: false });
  if (uploaded?.error) {
    log({ step: 'upload', outcome: 'error' });
    return { status: 502, body: { error: 'export_failed' } };
  }
  const link = await exportsStorage.createSignedUrl(objectName, LINK_TTL_SECONDS, { download: true });
  if (link?.error || typeof link?.data?.signedUrl !== 'string') {
    log({ step: 'sign_export', outcome: 'error' });
    return { status: 502, body: { error: 'export_failed' } };
  }
  log({ step: 'export_file', outcome: 'ok' });

  const result = { expires_at: expiresAt, media_count: media.length, media_skipped: skipped };
  if (typeof sendEmail === 'function') {
    const message = exportEmail({ link: link.data.signedUrl, expiresAt, supportEmail: env?.US_SUPPORT_EMAIL || SUPPORT_EMAIL_FALLBACK });
    let sent;
    try { sent = await sendEmail({ to: email, ...message }); } catch { sent = { ok: false, code: 'email_failed' }; }
    log({ step: 'email', outcome: sent?.ok ? 'ok' : 'error', code: sent?.ok ? undefined : sent?.code });
    if (sent?.ok) return { status: 200, body: { status: 'sent', ...result } };
  }
  // No provider (or it failed): the operator sends the link by hand.
  return { status: 200, body: { status: 'ready', download_url: link.data.signedUrl, ...result } };
}

// Exports are personal data: removed after the link has expired. Called by
// the lifecycle worker after its own authentication.
export async function purgeExpiredExports({ storage, nowMs, maxAgeMs = LINK_TTL_SECONDS * 1000, log = noop }) {
  let removed = 0;
  const { data: folders, error } = await storage.list('', { limit: 1000 });
  if (error || !Array.isArray(folders)) {
    log({ step: 'exports_purge', outcome: 'error' });
    return { removed, error: 'list_failed' };
  }
  for (const folder of folders) {
    if (!folder || folder.id !== null && folder.id !== undefined || !UUID.test(String(folder.name || ''))) continue;
    const { data: files, error: listError } = await storage.list(folder.name, { limit: 1000 });
    if (listError || !Array.isArray(files)) continue;
    const old = files.filter((f) => f && f.id && typeof f.name === 'string' && /^[0-9TZ]{16}\.json$/.test(f.name)
      && Number.isFinite(Date.parse(f.created_at)) && nowMs - Date.parse(f.created_at) > maxAgeMs)
      .map((f) => `${folder.name}/${f.name}`);
    if (!old.length) continue;
    const { error: removeError } = await storage.remove(old);
    if (!removeError) removed += old.length;
  }
  log({ step: 'exports_purge', outcome: 'ok', count: removed });
  return { removed };
}
