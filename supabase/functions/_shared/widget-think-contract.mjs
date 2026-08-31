const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
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
  return { token, actionId };
}

export function validDeviceHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
