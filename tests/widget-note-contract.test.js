// Widget «Nota» (docs/missions/widget-nota-v1.md): the Edge contract.
// The widget writes with its device token (header only, never a Supabase
// session), one operation at a time, within the same limits as the app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const file = (relative) => path.join(ROOT, ...relative.split('/'));
const read = (relative) => fs.readFileSync(file(relative), 'utf8');
const load = () => import(`${pathToFileURL(file('supabase/functions/_shared/widget-note-contract.mjs')).href}?t=${Date.now()}`);

const TOKEN = 'A'.repeat(43);
const NOTE = '5a86d7aa-37d8-48ed-9122-a8f42d80ff9e';
const request = (body, { token = TOKEN, url = 'https://example.test/widget-note', method = 'POST' } = {}) => new Request(url, {
  method,
  headers: { 'x-us-widget-token': token, 'content-type': 'application/json' },
  body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
});

test('get, toggle and save, each with only what it needs', async () => {
  const { parseWidgetNoteRequest } = await load();
  assert.deepEqual(await parseWidgetNoteRequest(request({ op: 'get', noteId: NOTE, extra: 'x' })), { token: TOKEN, op: 'get', noteId: NOTE, payload: {} });
  assert.deepEqual(
    await parseWidgetNoteRequest(request({ op: 'toggle', noteId: NOTE, itemId: 'i1', done: true })),
    { token: TOKEN, op: 'toggle', noteId: NOTE, payload: { item_id: 'i1', done: true } }
  );
  const saved = await parseWidgetNoteRequest(request({
    op: 'save', noteId: NOTE, title: '  Spesa  ', body: 'Per sabato',
    items: [{ id: 'i1', text: 'Latte', done: false, color: 'red' }, { id: 'i2', text: 'Pane', done: true }]
  }));
  assert.deepEqual(saved.payload, { title: 'Spesa', body: 'Per sabato', items: [{ id: 'i1', text: 'Latte', done: false }, { id: 'i2', text: 'Pane', done: true }] });
});

test('the token travels only in the header; method, op and ids are checked', async () => {
  const { parseWidgetNoteRequest } = await load();
  await assert.rejects(parseWidgetNoteRequest(request({ op: 'get', noteId: NOTE }, { url: `https://example.test/widget-note?token=${TOKEN}` })), /query/);
  await assert.rejects(parseWidgetNoteRequest(request({ op: 'get', noteId: NOTE }, { token: 'short' })), /invalid_widget_token/);
  await assert.rejects(parseWidgetNoteRequest(request(null, { method: 'GET' })), /method_not_allowed/);
  await assert.rejects(parseWidgetNoteRequest(request({ op: 'delete', noteId: NOTE })), /invalid_op/);
  await assert.rejects(parseWidgetNoteRequest(request({ op: 'get', noteId: 'nota-1' })), /invalid_note_id/);
  await assert.rejects(parseWidgetNoteRequest(request({ op: 'toggle', noteId: NOTE, itemId: '', done: true })), /invalid_item/);
  await assert.rejects(parseWidgetNoteRequest(request({ op: 'toggle', noteId: NOTE, itemId: 'i1', done: 'yes' })), /invalid_item/);
  await assert.rejects(parseWidgetNoteRequest(request('{not json')), /invalid_body/);
});

test('save keeps the app limits: 80, 4000, 100 items of 200, never empty, 24 KB at most', async () => {
  const { parseWidgetNoteRequest, LIMITS } = await load();
  assert.deepEqual({ ...LIMITS }, { title: 80, body: 4000, items: 100, itemText: 200, itemId: 40, bytes: 24576 });
  const save = (fields) => parseWidgetNoteRequest(request({ op: 'save', noteId: NOTE, title: '', body: '', items: [], ...fields }));
  await assert.rejects(save({ title: 'x'.repeat(81) }), /invalid_note/);
  await assert.rejects(save({ body: 'x'.repeat(4001) }), /invalid_note/);
  await assert.rejects(save({ items: Array.from({ length: 101 }, (_, i) => ({ id: `i${i}`, text: 'x', done: false })) }), /invalid_note/);
  await assert.rejects(save({ items: [{ id: 'i1', text: 'x'.repeat(201), done: false }] }), /invalid_note/);
  await assert.rejects(save({ items: [{ id: 'i1', text: 'a', done: false }, { id: 'i1', text: 'b', done: false }] }), /invalid_note/, 'item ids are unique');
  await assert.rejects(save({ title: '   ', body: ' ' }), /empty_note/);
  await assert.rejects(parseWidgetNoteRequest(request(JSON.stringify({ op: 'save', noteId: NOTE, body: 'x'.repeat(30000) }))), /request_too_large/);
  assert.equal((await save({ items: [{ id: 'i1', text: '', done: false }] })).payload.items.length, 1, 'a list alone is a note');
});

test('errors become statuses without leaking anything', async () => {
  const { widgetNoteStatus } = await load();
  assert.equal(widgetNoteStatus({ code: '28000' }), 401);
  assert.equal(widgetNoteStatus({ code: 'P0002' }), 404);
  assert.equal(widgetNoteStatus({ message: 'widget_action_rate_limited' }), 429);
  assert.equal(widgetNoteStatus({ code: '22023' }), 400);
  assert.equal(widgetNoteStatus({ code: '23514' }), 400, 'a table limit');
  assert.equal(widgetNoteStatus({ code: 'XX000' }), 500);
});

test('token scopes: Ti penso by default, the note scope only by name', async () => {
  const { widgetTokenScope } = await load();
  assert.equal(widgetTokenScope(undefined), 'think:send');
  assert.equal(widgetTokenScope('think:send'), 'think:send');
  assert.equal(widgetTokenScope('note:rw'), 'note:rw');
  assert.equal(widgetTokenScope('admin'), null);
  const provision = read('supabase/functions/widget-device-token/index.ts');
  assert.match(provision, /const scope = widgetTokenScope\(body\?\.scope\);/);
  assert.match(provision, /\.eq\("scope", scope\)/);
  assert.match(provision, /scope,\s*\n\s*expires_at: expiresAt/);
  assert.doesNotMatch(provision, /"think:send"/, 'the scope always comes from the contract');
});

test('the Edge: custom auth, hash only, RPC with the couple check, no logs of content', () => {
  const edge = read('supabase/functions/widget-note/index.ts');
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.widget-note\]\nverify_jwt = false/);
  assert.match(edge, /parseWidgetNoteRequest\(request\)/);
  assert.match(edge, /const tokenHash = await sha256Hex\(token\);/);
  assert.match(edge, /admin\.rpc\("widget_note_internal", \{\s*p_token_hash: tokenHash,\s*p_op: op,\s*p_note_id: noteId,\s*p_payload: payload\s*\}\)/);
  assert.match(edge, /supabaseSecretKey\(\)/);
  assert.doesNotMatch(edge, /console\.(?:log|error)\([^)]*(?:title|body|items|token)\b/);
  assert.doesNotMatch(edge, /searchParams\.get\(["']token/);
});
