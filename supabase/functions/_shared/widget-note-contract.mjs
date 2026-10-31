// Widget «Nota» (docs/missions/widget-nota-v1.md): what the widget may ask.
// The device token travels only in the X-US-Widget-Token header; one
// operation per request, within the same limits as the app's notes
// (couple_notes_v1). Pure and dependency-free: tested with Node.
export { sha256Hex } from './widget-think-contract.mjs';

export const LIMITS = Object.freeze({ title: 80, body: 4000, items: 100, itemText: 200, itemId: 40, bytes: 24576 });
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPS = Object.freeze(['get', 'toggle', 'save']);
const SCOPES = Object.freeze(['think:send', 'note:rw']);

const validItemId = (value) => typeof value === 'string' && value.length >= 1 && value.length <= LIMITS.itemId;

function noteFields(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : body.title == null ? '' : null;
  const text = typeof body.body === 'string' ? body.body : body.body == null ? '' : null;
  const input = body.items == null ? [] : body.items;
  if (title === null || text === null || !Array.isArray(input)) throw new Error('invalid_note');
  if (title.length > LIMITS.title || text.length > LIMITS.body || input.length > LIMITS.items) throw new Error('invalid_note');
  const seen = new Set();
  const items = input.map((item) => {
    if (!item || typeof item !== 'object' || !validItemId(item.id) || seen.has(item.id)
      || typeof item.text !== 'string' || item.text.length > LIMITS.itemText || typeof item.done !== 'boolean') {
      throw new Error('invalid_note');
    }
    seen.add(item.id);
    return { id: item.id, text: item.text, done: item.done };
  });
  if (!title && !text.trim() && !items.length) throw new Error('empty_note');
  return { title, body: text, items };
}

export async function parseWidgetNoteRequest(request) {
  if (request.method !== 'POST') throw new Error('method_not_allowed');
  if (new URL(request.url).searchParams.has('token')) throw new Error('query_token_forbidden');
  const token = (request.headers.get('x-us-widget-token') || '').trim();
  if (!TOKEN_PATTERN.test(token)) throw new Error('invalid_widget_token');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > LIMITS.bytes) throw new Error('request_too_large');
  let body;
  try { body = JSON.parse(raw); } catch (_) { throw new Error('invalid_body'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_body');
  const op = String(body.op || '');
  if (!OPS.includes(op)) throw new Error('invalid_op');
  const noteId = String(body.noteId || '').toLowerCase();
  if (!UUID_PATTERN.test(noteId)) throw new Error('invalid_note_id');
  if (op === 'get') return { token, op, noteId, payload: {} };
  if (op === 'toggle') {
    if (!validItemId(body.itemId) || typeof body.done !== 'boolean') throw new Error('invalid_item');
    return { token, op, noteId, payload: { item_id: body.itemId, done: body.done } };
  }
  return { token, op, noteId, payload: noteFields(body) };
}

// The RPC's refusals as HTTP statuses: never the reason in detail.
export function widgetNoteStatus(error) {
  const code = String(error?.code || '');
  if (code === '28000') return 401;
  if (code === 'P0002') return 404;
  if (String(error?.message || '').includes('rate_limited')) return 429;
  if (code === '22023' || code === '23514' || code === '22P02') return 400;
  return 500;
}

// widget-device-token: Ti penso unless the note scope is named.
export function widgetTokenScope(value) {
  if (value == null || value === '') return 'think:send';
  return SCOPES.includes(value) ? value : null;
}
