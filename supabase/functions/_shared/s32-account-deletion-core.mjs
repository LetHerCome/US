// US Store S3.2 — account deletion orchestration (Google Play requirement).
//
// PURE, dependency-injected module: no Deno/npm imports, so it runs both in the
// `delete-account` Edge function and in Node tests with mocked clients.
//
// Server contract (SQL, schema public, EXECUTE granted to service_role only):
//   s32_delete_account_data(p_user uuid, p_channel text) -> jsonb
//     {status:'db_done'|'already_done', mode:'no_couple'|'departed'|'couple_erased',
//      storage_prefix:text|null, keep_paths:text[]}
//   s32_account_deletion_storage_plan(p_user uuid) -> jsonb
//     {storage_prefix, keep_paths, state:'db_done'|'storage_done'|'completed'}
//   s32_mark_account_deletion(p_user uuid, p_state text, p_error text) -> jsonb
//
// Order: global sign-out (best effort) -> DB transaction -> Storage cleanup ->
// auth hard delete -> completed. Auth deletion NEVER runs when Storage cleanup
// failed: the receipt keeps the user at state db_done so a retry
// (finishAccountDeletion) can still find and remove the remaining files.
//
// Logging: only fixed step names, outcomes and short error codes. Never ids,
// emails, JWTs, object paths or raw exception messages.

export const STORAGE_BUCKET = 'us-media';
export const CONFIRM_WORD = 'ELIMINA';
export const REQUEST_CHANNELS = Object.freeze(['app', 'web']);
export const REAUTH_MAX_AGE_SECONDS = 600;
export const REAUTH_FUTURE_SKEW_SECONDS = 60;
export const LIST_PAGE_LIMIT = 1000;
export const REMOVE_BATCH_SIZE = 100;
export const MAX_LISTED_OBJECTS = 50000;
export const BAN_DURATION = '876000h';
export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://us-a33.pages.dev', // production Cloudflare Pages
  'https://localhost',        // Capacitor Android (default androidScheme https)
  'capacitor://localhost',    // Capacitor iOS
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/)?$/i;
const ORIGIN = /^(?:https:\/\/[a-z0-9.-]+(?::\d{1,5})?|capacitor:\/\/localhost|http:\/\/localhost(?::\d{1,5})?)$/i;
const SAFE_CODE = /^[a-z0-9_.-]{1,64}$/i;

export class DeletionError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const noop = (_entry) => {};
const safeCode = (error) => {
  if (!error || typeof error !== 'object') return 'unknown';
  if (typeof error.code === 'string' && SAFE_CODE.test(error.code)) return error.code;
  if (Number.isInteger(error.status)) return `http_${error.status}`;
  return 'unknown';
};

// ---------------------------------------------------------------- request ---

export function isDeletionEnabled(env) {
  return env?.US_ACCOUNT_DELETION_ENABLED === 'true';
}

export function allowedOrigins(extra) {
  const list = new Set(DEFAULT_ALLOWED_ORIGINS);
  for (const raw of String(extra || '').split(',')) {
    const value = raw.trim().replace(/\/+$/, '');
    if (ORIGIN.test(value)) list.add(value);
  }
  return list;
}

// A missing Origin means a non-browser caller (operator tooling); it is still
// subject to JWT + recent password re-authentication. A present Origin must
// be on the allowlist.
export function isOriginAllowed(origin, extra) {
  if (origin === null || origin === undefined) return true;
  return allowedOrigins(extra).has(origin);
}

export function parseDeletionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.confirm !== CONFIRM_WORD) {
    throw new DeletionError('confirm_required', 400);
  }
  if (!REQUEST_CHANNELS.includes(body.channel)) throw new DeletionError('channel_invalid', 400);
  return { channel: body.channel };
}

export function bearerToken(authorization) {
  const match = String(authorization || '').match(/^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  return match ? match[1] : '';
}

// Decodes (does NOT verify) the payload. Signature verification is done by the
// gateway (verify_jwt = true) and identity by auth.getUser(jwt).
export function decodeJwtPayload(jwt) {
  const part = String(jwt || '').split('.')[1];
  if (!part) throw new DeletionError('reauth_required', 401);
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || typeof payload !== 'object') throw new Error('not_object');
    return payload;
  } catch {
    throw new DeletionError('reauth_required', 401);
  }
}

// Requires a password authentication performed within maxAgeSeconds.
export function assertRecentPasswordAuth(payload, nowSeconds, maxAgeSeconds = REAUTH_MAX_AGE_SECONDS) {
  const amr = payload?.amr;
  if (!Array.isArray(amr) || !Number.isFinite(nowSeconds)) throw new DeletionError('reauth_required', 401);
  const ok = amr.some((entry) => entry && entry.method === 'password'
    && Number.isFinite(entry.timestamp)
    && entry.timestamp - nowSeconds <= REAUTH_FUTURE_SKEW_SECONDS
    && nowSeconds - entry.timestamp <= maxAgeSeconds);
  if (!ok) throw new DeletionError('reauth_required', 401);
  return true;
}

// ---------------------------------------------------------------- storage ---

export function isValidPrefix(prefix) {
  return typeof prefix === 'string' && PREFIX.test(prefix);
}

export function isSafeObjectName(name, prefix) {
  return typeof name === 'string'
    && isValidPrefix(prefix)
    && name.length > prefix.length
    && name.startsWith(prefix)
    && !name.includes('..')
    && !name.startsWith('/')
    && !name.includes('\\')
    && !name.includes('//')
    && !/[\u0000-\u001f\u007f]/.test(name);
}

// supabase-js `list` returns one level; folders are entries with id === null.
export async function listAllObjects(storage, prefix) {
  const out = [];
  const folders = [prefix.replace(/\/+$/, '')];
  while (folders.length) {
    const folder = folders.shift();
    for (let offset = 0; ; offset += LIST_PAGE_LIMIT) {
      const { data, error } = await storage.list(folder, { limit: LIST_PAGE_LIMIT, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error || !Array.isArray(data)) throw new DeletionError('storage_list_failed', 502);
      for (const entry of data) {
        if (!entry || typeof entry.name !== 'string' || !entry.name) throw new DeletionError('storage_name_invalid', 502);
        const full = `${folder}/${entry.name}`;
        if (entry.id === null || entry.id === undefined) folders.push(full);
        else out.push(full);
        if (out.length + folders.length > MAX_LISTED_OBJECTS) throw new DeletionError('storage_list_too_large', 502);
      }
      if (data.length < LIST_PAGE_LIMIT) break;
    }
  }
  return out;
}

// Returns {removed} or throws DeletionError. Nothing is removed if any listed
// name is unsafe or keep_paths is malformed (fail closed).
export async function cleanupStoragePrefix({ storage, prefix, keepPaths, log = noop }) {
  if (!isValidPrefix(prefix)) throw new DeletionError('storage_prefix_invalid', 500);
  if (!Array.isArray(keepPaths) || keepPaths.some((p) => typeof p !== 'string')) {
    throw new DeletionError('keep_paths_invalid', 500);
  }
  const keep = new Set(keepPaths);
  const all = await listAllObjects(storage, prefix);
  if (all.some((name) => !isSafeObjectName(name, prefix))) throw new DeletionError('storage_name_invalid', 500);
  const toDelete = all.filter((name) => !keep.has(name));
  for (let i = 0; i < toDelete.length; i += REMOVE_BATCH_SIZE) {
    const batch = toDelete.slice(i, i + REMOVE_BATCH_SIZE);
    if (batch.some((name) => !isSafeObjectName(name, prefix) || keep.has(name))) {
      throw new DeletionError('storage_name_invalid', 500);
    }
    const { error } = await storage.remove(batch);
    if (error) throw new DeletionError('storage_remove_failed', 502);
  }
  const remaining = await listAllObjects(storage, prefix);
  if (remaining.some((name) => !keep.has(name))) throw new DeletionError('storage_incomplete', 502);
  log({ step: 'storage_cleanup', outcome: 'ok', count: toDelete.length });
  return { removed: toDelete.length };
}

// ----------------------------------------------------------- orchestration ---

const PLAN_STATES = new Set(['db_done', 'storage_done', 'completed']);

async function callRpc(rpc, fn, args) {
  try {
    const { data, error } = await rpc(fn, args);
    if (error) return { error: safeCode(error) };
    return { data };
  } catch (error) {
    return { error: safeCode(error) };
  }
}

async function markState(rpc, uid, state, errorCode, log) {
  const { error } = await callRpc(rpc, 's32_mark_account_deletion', { p_user: uid, p_state: state, p_error: errorCode ?? null });
  log({ step: `mark_${state}`, outcome: error ? 'error' : 'ok', code: error ?? errorCode });
  return !error;
}

function isUserNotFound(error) {
  return error?.status === 404 || error?.code === 'user_not_found';
}

// Steps 3–5. Used by the Edge handler right after the DB transaction (with the
// plan returned by s32_delete_account_data) and by operator/cron retries
// (without plan: recomputed from the receipt).
//   state db_done      -> storage cleanup, auth delete, completed
//   state storage_done -> auth delete, completed
//   state completed    -> no-op
export async function finishAccountDeletion({ uid, admin, storage, rpc, log = noop, plan = null }) {
  if (!UUID.test(String(uid || ''))) throw new DeletionError('uid_invalid', 400);
  let current = plan;
  if (!current) {
    const res = await callRpc(rpc, 's32_account_deletion_storage_plan', { p_user: uid });
    if (res.error) {
      log({ step: 'storage_plan', outcome: 'error', code: res.error });
      return { status: 'pending_cleanup', error: 'storage_plan_failed' };
    }
    if (!res.data) {
      log({ step: 'storage_plan', outcome: 'missing' });
      return { status: 'no_receipt' };
    }
    current = res.data;
  }
  const state = current.state;
  if (!PLAN_STATES.has(state)) {
    log({ step: 'storage_plan', outcome: 'invalid' });
    return { status: 'pending_cleanup', error: 'storage_plan_invalid' };
  }
  if (state === 'completed') {
    log({ step: 'finish', outcome: 'already_completed' });
    return { status: 'deleted', resumedFrom: 'completed' };
  }

  if (state === 'db_done') {
    if (current.storage_prefix === null || current.storage_prefix === undefined) {
      log({ step: 'storage_cleanup', outcome: 'skipped' });
    } else {
      try {
        await cleanupStoragePrefix({ storage, prefix: current.storage_prefix, keepPaths: current.keep_paths, log });
      } catch (error) {
        const code = error instanceof DeletionError ? error.code : 'storage_failed';
        log({ step: 'storage_cleanup', outcome: 'error', code });
        await markState(rpc, uid, 'failed', code, log);
        return { status: 'pending_cleanup', error: code, resumedFrom: state };
      }
    }
    // A failed mark is tolerated: a retry re-runs the idempotent cleanup.
    await markState(rpc, uid, 'storage_done', null, log);
  }

  let deleteError = null;
  try {
    const { error } = await admin.deleteUser(uid);
    deleteError = error || null;
  } catch (error) {
    deleteError = error || { code: 'unknown' };
  }
  if (deleteError && !isUserNotFound(deleteError)) {
    log({ step: 'auth_delete', outcome: 'error', code: safeCode(deleteError) });
    try {
      const { error } = await admin.updateUserById(uid, { ban_duration: BAN_DURATION });
      log({ step: 'auth_ban', outcome: error ? 'error' : 'ok', code: error ? safeCode(error) : undefined });
    } catch (error) {
      log({ step: 'auth_ban', outcome: 'error', code: safeCode(error) });
    }
    await markState(rpc, uid, 'failed', 'auth_delete_failed', log);
    return { status: 'pending_cleanup', error: 'auth_delete_failed', resumedFrom: state };
  }
  log({ step: 'auth_delete', outcome: deleteError ? 'already_absent' : 'ok' });

  if (!(await markState(rpc, uid, 'completed', null, log))) {
    return { status: 'pending_cleanup', error: 'mark_completed_failed', resumedFrom: state };
  }
  return { status: 'deleted', resumedFrom: state };
}

const MODES = new Set(['no_couple', 'departed', 'couple_erased']);

// Full request flow. `client` is a service-role supabase-js client (created
// lazily, only after all cheap request checks have passed).
// Returns {status, body} — the Edge wrapper adds headers.
export async function handleDeleteAccount({ method, origin, authorization, readBody, env, nowSeconds, createClient, log = noop }) {
  if (!isDeletionEnabled(env)) return { status: 503, body: { error: 'deletion_disabled' } };
  if (!isOriginAllowed(origin, env?.US_ALLOWED_ORIGINS)) return { status: 403, body: { error: 'origin_denied' } };
  if (method === 'OPTIONS') return { status: 204, body: null };
  if (method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };

  const jwt = bearerToken(authorization);
  if (!jwt) return { status: 401, body: { error: 'auth_required' } };

  let channel;
  let payload;
  try {
    let body = null;
    try { body = await readBody(); } catch { body = null; }
    ({ channel } = parseDeletionBody(body));
    payload = decodeJwtPayload(jwt);
    assertRecentPasswordAuth(payload, nowSeconds);
  } catch (error) {
    if (error instanceof DeletionError) return { status: error.status, body: { error: error.code } };
    return { status: 400, body: { error: 'confirm_required' } };
  }

  const client = createClient();
  if (!client) return { status: 500, body: { error: 'server_config' } };

  let uid;
  try {
    const { data, error } = await client.auth.getUser(jwt);
    uid = data?.user?.id;
    if (error || !UUID.test(String(uid || '')) || uid !== payload.sub) {
      log({ step: 'get_user', outcome: 'error' });
      return { status: 401, body: { error: 'invalid_session' } };
    }
  } catch {
    log({ step: 'get_user', outcome: 'error' });
    return { status: 401, body: { error: 'invalid_session' } };
  }
  log({ step: 'get_user', outcome: 'ok' });

  const adminApi = client.auth.admin;
  const rpc = (fn, args) => client.rpc(fn, args);

  // 1. Revoke every session (best effort).
  try {
    const { error } = await adminApi.signOut(jwt, 'global');
    log({ step: 'sign_out', outcome: error ? 'error' : 'ok', code: error ? safeCode(error) : undefined });
  } catch (error) {
    log({ step: 'sign_out', outcome: 'error', code: safeCode(error) });
  }

  // 2. Single DB transaction (separation + personal rows + anonymisation + receipt).
  const db = await callRpc(rpc, 's32_delete_account_data', { p_user: uid, p_channel: channel });
  if (db.error) {
    log({ step: 'delete_data', outcome: 'error', code: db.error });
    return { status: 500, body: { error: 'deletion_failed' } };
  }
  const result = db.data;
  log({ step: 'delete_data', outcome: 'ok', code: typeof result?.status === 'string' && SAFE_CODE.test(result.status) ? result.status : 'unexpected' });

  // Fresh run with a well-formed result: use it directly. Otherwise (retry of
  // an earlier request, or unexpected shape) recompute from the receipt.
  let plan = null;
  if (result?.status === 'db_done' && MODES.has(result.mode)) {
    // keep_paths is passed through untouched: a malformed list fails closed.
    plan = { state: 'db_done', storage_prefix: result.storage_prefix ?? null, keep_paths: result.keep_paths };
  }

  const storage = client.storage.from(STORAGE_BUCKET);
  const finish = await finishAccountDeletion({ uid, admin: adminApi, storage, rpc, log, plan });
  if (finish.status === 'deleted') return { status: 200, body: { status: 'deleted' } };
  return { status: 202, body: { status: 'pending_cleanup' } };
}
