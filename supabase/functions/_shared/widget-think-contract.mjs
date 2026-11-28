const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const WIDGET_THINK_MAX_TAPS = 99;
const ACTION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function parseWidgetThinkRequest(request) {
  if (request.method !== 'POST') throw new Error('method_not_allowed');
  const url = new URL(request.url);
  if (url.searchParams.has('token')) throw new Error('query_token_forbidden');
  const token = (request.headers.get('x-us-widget-token') || '').trim();
  if (!TOKEN_PATTERN.test(token)) throw new Error('invalid_widget_token');
  const body = await request.json().catch(() => ({}));
  const actionId = String(body?.actionId || '').trim();
  if (!ACTION_PATTERN.test(actionId)) throw new Error('invalid_action_id');
  // Ti penso ×N dai widget (27/11/2026): the taps of one burst, 1..99; an
  // older widget sends none and means 1. Anything else is refused, never guessed.
  const taps = body?.taps === undefined || body?.taps === null ? 1 : body.taps;
  if (!Number.isInteger(taps) || taps < 1 || taps > WIDGET_THINK_MAX_TAPS) throw new Error('invalid_taps');
  return { token, actionId, taps };
}

/**
 * The arguments of widget_send_think_internal. One tap travels exactly as
 * before (two named arguments), so a database without the 27/11 migration
 * keeps working; several taps add p_taps.
 */
export function widgetThinkRpcArgs(tokenHash, actionId, taps = 1) {
  const args = { p_token_hash: tokenHash, p_action_id: actionId };
  return Number.isInteger(taps) && taps > 1 ? { ...args, p_taps: Math.min(WIDGET_THINK_MAX_TAPS, taps) } : args;
}

/** PostgREST cannot find the three-argument function: the migration is not applied yet. */
export function missingTapsSignature(error) {
  return error?.code === 'PGRST202' || /p_taps/.test(String(error?.message || ''));
}

export function validDeviceHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
