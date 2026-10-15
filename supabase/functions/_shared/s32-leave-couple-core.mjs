// US Store 1.0 — leave the couple (founder decision 3, 2026-10-14).
//
// PURE, dependency-injected module like the account deletion core it reuses.
// Leaving closes the couple space exactly as a deletion does (Policy A, D-5
// separation) but keeps the account: no sign-out, no auth deletion.
//
// Server contract (SQL, service_role only):
//   s32_leave_couple(p_user uuid, p_channel text) -> jsonb
//     {status:'db_done'|'already_done', couple_id, mode:'departed'|'couple_erased',
//      state, storage_prefix, keep_paths}
//   s32_couple_departure_plan(p_user uuid, p_couple uuid) -> jsonb (same plan)
//   s32_mark_couple_departure(p_user, p_couple, p_state 'completed'|'failed', p_error)
//   s32_claim_pending_couple_departures(p_limit) -> [{user_id, couple_id}]
//
// Order: DB transaction -> Storage cleanup (everything under the leaver's
// folder except the media the partner keeps; the whole couple folder when the
// last member leaves) -> completed. Logs carry step names and codes only.

import {
  DeletionError, STORAGE_BUCKET, assertRecentPasswordAuth, bearerToken, cleanupStoragePrefix,
  decodeJwtPayload, isOriginAllowed,
} from './s32-account-deletion-core.mjs';

export const LEAVE_WORD = 'ESCI';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_CODE = /^[a-z0-9_.-]{1,64}$/i;
const MODES = new Set(['departed', 'couple_erased']);
const noop = (_entry) => {};

export function isLeaveEnabled(env) {
  return env?.US_LEAVE_COUPLE_ENABLED === 'true';
}

export function parseLeaveBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.confirm !== LEAVE_WORD) {
    throw new DeletionError('confirm_required', 400);
  }
  if (body.channel !== 'app') throw new DeletionError('channel_invalid', 400);
  return { channel: 'app' };
}

const safeCode = (error) => {
  if (!error || typeof error !== 'object') return 'unknown';
  // Our SQL raises snake_case messages (not_in_couple); prefer them to the
  // SQLSTATE so the handler can tell them apart.
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

async function mark(rpc, uid, couple, state, errorCode, log) {
  const { error } = await callRpc(rpc, 's32_mark_couple_departure', { p_user: uid, p_couple: couple, p_state: state, p_error: errorCode ?? null });
  log({ step: `mark_${state}`, outcome: error ? 'error' : 'ok', code: error ?? errorCode });
  return !error;
}

// Storage step and completion; used right after the DB step (with its plan)
// and by the lifecycle worker (plan recomputed from the receipt).
export async function finishCoupleDeparture({ uid, couple, storage, rpc, log = noop, plan = null }) {
  if (!UUID.test(String(uid || '')) || !UUID.test(String(couple || ''))) throw new DeletionError('uid_invalid', 400);
  let current = plan;
  if (!current) {
    const res = await callRpc(rpc, 's32_couple_departure_plan', { p_user: uid, p_couple: couple });
    if (res.error || !res.data) {
      log({ step: 'departure_plan', outcome: 'error', code: res.error });
      return { status: 'pending_cleanup', error: 'departure_plan_failed' };
    }
    current = res.data;
  }
  if (current.state === 'completed') return { status: 'left', resumedFrom: 'completed' };
  if (current.state !== 'db_done' && current.state !== 'storage_done') {
    return { status: 'pending_cleanup', error: 'departure_plan_invalid' };
  }
  try {
    const expected = current.mode === 'couple_erased' ? `${couple}/` : `${couple}/${uid}/`;
    if (!MODES.has(current.mode) || current.storage_prefix !== expected) throw new DeletionError('departure_plan_invalid', 500);
    await cleanupStoragePrefix({ storage, prefix: current.storage_prefix, keepPaths: current.keep_paths, log });
  } catch (error) {
    const code = error instanceof DeletionError ? error.code : 'storage_failed';
    log({ step: 'storage_cleanup', outcome: 'error', code });
    await mark(rpc, uid, couple, 'failed', code, log);
    return { status: 'pending_cleanup', error: code };
  }
  if (!(await mark(rpc, uid, couple, 'completed', null, log))) {
    return { status: 'pending_cleanup', error: 'mark_completed_failed' };
  }
  return { status: 'left', resumedFrom: current.state };
}

export async function handleLeaveCouple({ method, origin, authorization, readBody, env, nowSeconds, createClient, log = noop }) {
  if (!isLeaveEnabled(env)) return { status: 503, body: { error: 'leave_disabled' } };
  if (!isOriginAllowed(origin, env?.US_ALLOWED_ORIGINS)) return { status: 403, body: { error: 'origin_denied' } };
  if (method === 'OPTIONS') return { status: 204, body: null };
  if (method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };

  const jwt = bearerToken(authorization);
  if (!jwt) return { status: 401, body: { error: 'auth_required' } };
  let payload;
  let channel;
  try {
    let body = null;
    try { body = await readBody(); } catch { body = null; }
    ({ channel } = parseLeaveBody(body));
    payload = decodeJwtPayload(jwt);
    // Same bar as deleting the account: leaving cannot be undone.
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

  const rpc = (fn, args) => client.rpc(fn, args);
  const db = await callRpc(rpc, 's32_leave_couple', { p_user: uid, p_channel: channel });
  if (db.error) {
    log({ step: 'leave_data', outcome: 'error', code: db.error });
    if (db.error === 'not_in_couple') return { status: 409, body: { error: 'not_in_couple' } };
    return { status: 500, body: { error: 'leave_failed' } };
  }
  const result = db.data;
  const couple = result?.couple_id;
  if (!UUID.test(String(couple || ''))) {
    log({ step: 'leave_data', outcome: 'unexpected' });
    return { status: 500, body: { error: 'leave_failed' } };
  }
  log({ step: 'leave_data', outcome: 'ok', code: typeof result.status === 'string' && SAFE_CODE.test(result.status) ? result.status : 'unexpected' });
  const plan = result.status === 'db_done' ? result : null;
  const finish = await finishCoupleDeparture({ uid, couple, storage: client.storage.from(STORAGE_BUCKET), rpc, log, plan });
  if (finish.status === 'left') return { status: 200, body: { status: 'left' } };
  return { status: 202, body: { status: 'pending_cleanup' } };
}

// Resumes departures left in pending_cleanup. Called by the lifecycle worker
// after its own authentication; ids come from the private receipts only.
export async function resumeCoupleDepartures({ rpc, storage, limit = 20, log = noop }) {
  const counts = { claimed: 0, left: 0, pending: 0, skipped: 0 };
  const claimed = await callRpc(rpc, 's32_claim_pending_couple_departures', { p_limit: limit });
  if (claimed.error || !Array.isArray(claimed.data)) {
    log({ step: 'departures_claim', outcome: 'error', code: claimed.error });
    return { ...counts, error: 'claim_failed' };
  }
  for (const item of claimed.data) {
    if (!UUID.test(String(item?.user_id || '')) || !UUID.test(String(item?.couple_id || ''))) { counts.skipped++; continue; }
    counts.claimed++;
    let res;
    try {
      res = await finishCoupleDeparture({ uid: item.user_id, couple: item.couple_id, storage, rpc, log });
    } catch {
      res = { status: 'pending_cleanup' };
    }
    if (res.status === 'left') counts.left++;
    else counts.pending++;
  }
  return counts;
}
