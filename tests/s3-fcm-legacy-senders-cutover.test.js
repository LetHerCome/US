// S3 release guard: enumerate EVERY Edge entrypoint able to deliver native FCM.
// This is source/contract verification only. It cannot assert what is deployed
// to Supabase: the release owner must inspect the eight live function bundles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const DIRECT_SENDERS = Object.freeze([
  'send-web-push',
  'calendar-reminders-worker',
  'daily-question-push-worker',
  'left-for-you-push-worker',
  'game-v2-push',
  'game-v2-push-worker',
  'monthiversary-job',
]);
const INDIRECT_SENDERS = Object.freeze(['widget-think-send']);
const ALL_SENDERS = Object.freeze([...DIRECT_SENDERS, ...INDIRECT_SENDERS]);
const SHARED_TRANSPORT = 'supabase/functions/_shared/native-push-transport.mjs';

test('all eight known production native FCM entrypoints are covered by cutover inventory', () => {
  assert.equal(ALL_SENDERS.length, 8);
  assert.equal(new Set(ALL_SENDERS).size, 8);
  for (const slug of DIRECT_SENDERS) {
    const code = read('supabase/functions/' + slug + '/index.ts');
    assert.match(code, /_shared\/native-push-env\.ts/, slug + ': must import safe native sender');
    assert.match(code, /nativeTransport/, slug + ': must actually reference native dispatcher');
    assert.doesNotMatch(code, /fcm\.googleapis\.com|firebase\.messaging.*\/messages:send/i, slug + ': direct Firebase bypass');
  }
  const widget = read('supabase/functions/widget-think-send/index.ts');
  assert.match(widget, /_shared\/think-web-push\.ts/);
  const helper = read('supabase/functions/_shared/think-web-push.ts');
  assert.match(helper, /_shared|\.\/native-push-env\.ts/);
  assert.match(helper, /nativeTransport/);
  assert.doesNotMatch(widget, /fcm\.googleapis\.com|firebase\.messaging.*\/messages:send/i);
});

test('FCM v2 sender cannot request automatic Android notification rendering', async () => {
  const { fcmMessage } = await import(pathToFileURL(path.join(root, SHARED_TRANSPORT)).href);
  const uuid = 'b39b16d2-724f-4b30-a310-87ea55b0cd90';
  const sensitive = 'NEVER_EXPOSE_PRIVATE_SENDER_OR_EVENT';
  const payload = fcmMessage({
    title: sensitive,
    body: sensitive,
    tag: sensitive,
    type: 'think',
    target: 'today',
    urgency: 'normal',
    ttl: 86400,
  }, { token: 'fake-token-not-for-delivery', installation_id: uuid });
  assert.deepEqual(Object.keys(payload), ['message']);
  assert.deepEqual(Object.keys(payload.message).sort(), ['android','data','token']);
  assert.equal(Object.hasOwn(payload.message, 'notification'), false);
  assert.equal(Object.hasOwn(payload.message.android, 'notification'), false);
  // 16/10/2026: one allow-listed kind; the private copy above never travels.
  assert.deepEqual(payload.message.data, { v: '2', installation: uuid, k: 'think' });
  assert.doesNotMatch(JSON.stringify(payload), /NEVER_EXPOSE_PRIVATE_SENDER_OR_EVENT/);
  assert.equal(payload.message.android.collapse_key, 'us-private-notice');
});

test('native delivery cannot silently restore legacy Firebase notification payloads', () => {
  const transport = read(SHARED_TRANSPORT);
  assert.match(transport, /data: kind \? \{ v: '2', installation, k: kind \} : \{ v: '2', installation \},/);
  assert.doesNotMatch(transport, /message:\s*\{\s*token[^]*?notification:\s*\{/,
    'A message.notification causes Android OS to auto-display before the owner gate');
  const ownerGate = read('android/app/src/main/java/com/usapp/us/UsGuardedMessagingService.java');
  assert.match(ownerGate, /message\.getNotification\(\) != null/);
  assert.match(ownerGate, /UsPushOwnerGate\.accepts\(this, data\.get\("installation"\)\)/);
  assert.match(ownerGate, /UsPushOwnerGate\.postIfCurrent/);
  // This onMessageReceived check protects v2 DATA messages; it cannot
  // prevent legacy notification-type messages from auto-rendering by Android.
});

test('Web Push dispatch stays separate from native FCM; no subscription wipe on cutover', () => {
  const core = read('supabase/functions/_shared/notification-core.mjs');
  assert.match(core, /webPushPayload/);
  assert.match(core, /admin\.from\('push_subscriptions'\)/);
  assert.match(core, /admin\.from\('device_push_tokens'\)/);
  assert.match(core, /native\.send\(device, notification\)/);
  assert.doesNotMatch(core, /(?:delete|truncate)\s+(?:from\s+)?push_subscriptions/i);
});
