// S3 release guard: the Android app and the FCM server transport must speak
// the same data-only v2 protocol, and no code path may put private data into
// an FCM payload. Runs in .github/workflows/fcm-payload-privacy-guard.yml on
// every pull request and every push to main. Source/contract checks only:
// what is deployed to Supabase and what a real phone shows need separate,
// physical evidence (#181).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const load = (file) => import(pathToFileURL(path.join(ROOT, file)).href);
const TRANSPORT = 'supabase/functions/_shared/native-push-transport.mjs';
const CORE = 'supabase/functions/_shared/notification-core.mjs';
const SERVICE = 'android/app/src/main/java/com/usapp/us/UsGuardedMessagingService.java';
const CHANNELS = 'native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushChannels.java';
const INSTALL_A = '1f5bcf2d-2cf9-48d6-b018-9ac99be5a1b8';
const INSTALL_B = '6b2ef2a0-65be-41c1-a1c8-64a5d8e2a174';
const REF = 'eb72e072-728c-476d-83fd-d902b74b3660';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(?:ts|mjs|js)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const javaString = (source, name) => {
  const match = source.match(new RegExp(`static final String ${name} = "([^"]*)";`));
  assert.ok(match, `${name} constant missing`);
  return match[1];
};

// The eight production senders (#181 cutover inventory) plus the staging-only
// QA sender. A new native sender must be added here on purpose, after review.
const NATIVE_SENDERS = Object.freeze([
  'supabase/functions/_shared/native-push-env.ts',
  'supabase/functions/s3-staging-send-web-push/index.ts',
]);

test('only the shared transport talks to FCM; native senders are an explicit inventory', () => {
  const files = walk('supabase/functions');
  const direct = files.filter((file) => /fcm\.googleapis\.com|\/messages:send|firebase-admin|npm:firebase|googleapis\.com\/fcm/i.test(read(file)));
  assert.deepEqual(direct, [TRANSPORT], 'a second FCM sender could bypass the data-only v2 payload');
  const wiring = files.filter((file) => file !== TRANSPORT && /createNativeTransport|fcmMessage\b/.test(read(file))).sort();
  assert.deepEqual(wiring, [...NATIVE_SENDERS].sort(), 'native transport wired outside the reviewed inventory');
  for (const file of wiring) {
    assert.match(read(file), /from ["']\.{1,2}\/(?:_shared\/)?native-push-transport\.mjs["']/, `${file}: must use the shared v2 transport`);
  }
});

test('every notification type becomes the same opaque v2 packet; nothing private reaches FCM', async () => {
  const { fcmMessage, ANDROID_SAFE_COPY } = await load(TRANSPORT);
  const { buildNotification, NOTIFICATION_TYPES } = await load(CORE);
  const secrets = ['PRIVATE_SENDER_NAME', 'PRIVATE_TITLE', 'PRIVATE_BODY', 'private-tag', 'private-reminder', REF];
  const seen = new Set();
  for (const type of NOTIFICATION_TYPES) {
    const notification = buildNotification(type, {
      senderName: 'PRIVATE_SENDER_NAME', messageId: REF, questionId: REF, questId: REF, itemId: REF, sessionId: REF,
      reminderId: 'private-reminder', entryId: REF, title: 'PRIVATE_TITLE', body: 'PRIVATE_BODY', tag: 'private-tag',
    });
    for (const urgency of ['high', 'normal']) {
      const { message } = fcmMessage({ ...notification, urgency }, { token: 'fcm:' + 'Z'.repeat(80), installation_id: INSTALL_A });
      assert.deepEqual(Object.keys(message).sort(), ['android', 'data', 'token'], type);
      assert.deepEqual(message.data, { v: '2', installation: INSTALL_A }, type);
      assert.deepEqual(Object.keys(message.android).sort(), ['collapse_key', 'priority', 'ttl'], type);
      const wire = JSON.stringify(message);
      for (const secret of secrets) assert.equal(wire.includes(secret), false, `${type}: ${secret} leaked`);
      assert.doesNotMatch(wire, /"(?:notification|title|body|type|target|ref|tag|click_action|image|channel_id|user|couple|sender)"/i, type);
      seen.add(JSON.stringify({ ...message.data, collapse: message.android.collapse_key }));
    }
  }
  assert.equal(seen.size, 1, 'the event class must not be inferable from the packet');
  assert.deepEqual(ANDROID_SAFE_COPY, { title: 'US.', body: 'Apri US per vedere le novità.' });
});

test('Android guarded service and server transport agree on protocol, copy, tag and channel', async () => {
  const { fcmMessage, ANDROID_SAFE_COPY, ANDROID_CHANNELS } = await load(TRANSPORT);
  const service = read(SERVICE);
  const channels = read(CHANNELS);
  const { message } = fcmMessage({ urgency: 'high', ttl: 60 }, { token: 'fcm:' + 'Z'.repeat(80), installation_id: INSTALL_B });
  assert.match(service, new RegExp(`"${message.data.v}"\\.equals\\(data\\.get\\("v"\\)\\)`), 'service accepts exactly the server protocol version');
  assert.match(service, /UsPushOwnerGate\.accepts\(this, data\.get\("installation"\)\)/, 'service routes by the same data key');
  assert.equal(javaString(service, 'TITLE'), ANDROID_SAFE_COPY.title);
  assert.equal(javaString(service, 'BODY'), ANDROID_SAFE_COPY.body);
  assert.equal(javaString(service, 'NOTICE_TAG'), message.android.collapse_key, 'one banner slot per collapse key');
  assert.match(service, /CHANNEL = UsPushChannels\.PARTNER;/);
  assert.match(channels, new RegExp(`PARTNER = "${ANDROID_CHANNELS.partner}"`));
  assert.match(read('android/app/src/main/AndroidManifest.xml'), new RegExp(`default_notification_channel_id"\\s+android:value="${ANDROID_CHANNELS.partner}"`));
});

test('Android service never re-creates the partner channel with different name or importance (audit M-02)', () => {
  const service = read(SERVICE);
  assert.doesNotMatch(service, /new NotificationChannel\(\s*CHANNEL\s*,\s*"/, 'no hard-coded channel spec in the service');
  assert.doesNotMatch(service, /IMPORTANCE_DEFAULT|IMPORTANCE_LOW|IMPORTANCE_MIN/);
  const ensure = service.slice(service.indexOf('private static NotificationChannel ensureChannel('));
  assert.ok(ensure.indexOf('if (existing != null) return existing;') >= 0);
  assert.ok(ensure.indexOf('if (existing != null) return existing;') < ensure.indexOf('createNotificationChannel('), 'create only when missing');
  assert.match(ensure, /UsPushChannels\.ALL/);
  const channels = read(CHANNELS);
  assert.match(channels, /new Channel\(PARTNER, "Dalla tua persona", "[^"]+", IMPORTANCE_HIGH\)/);
});

test('Android service fails closed on legacy, unknown or foreign-installation packets', () => {
  const service = read(SERVICE);
  const body = service.slice(service.indexOf('public void onMessageReceived('), service.indexOf('private void postPrivateSafeNotice('));
  const guard = body.indexOf('if (message.getNotification() != null || !"2".equals(data.get("v"))) return;');
  const owner = body.indexOf('if (!UsPushOwnerGate.accepts(this, data.get("installation"))) return;');
  const forward = body.indexOf('PushNotificationsPlugin.sendRemoteMessage(message)');
  assert.ok(guard >= 0 && owner > guard && forward > owner, 'nothing (banner or JS event) before both checks');
  assert.match(service, /UsPushOwnerGate\.postIfCurrent\(this, installation,/);
  assert.match(service, /setVisibility\(NotificationCompat\.VISIBILITY_PRIVATE\)/);
  assert.doesNotMatch(service, /data\.get\("(?:title|body|type|target|ref|sender|name)"\)/, 'service never renders server-provided text');
});

function loadClient(storage = {}) {
  const store = new Map(Object.entries(storage));
  const events = [];
  const window = {
    UsPlatform: { isNative: true, isPluginAvailable: () => true, getNativePlugin: () => ({ addListener: async () => ({}) }) },
    dispatchEvent: (event) => events.push(event),
    UsFeedback: { attention: () => events.push('haptic') },
  };
  const context = vm.createContext({
    window,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  });
  vm.runInContext(read('notifications.js'), context);
  return { api: window.UsNotifications, events };
}

test('web layer: a v2 packet only counts for THIS installation and never becomes a navigation', () => {
  const { api } = loadClient({ 'us:notifications:v1:installation': INSTALL_A });
  const { isCurrentNotice, parsePayload, intentFromAction } = api._test;
  assert.equal(isCurrentNotice({ v: '2', installation: INSTALL_A }), true);
  assert.equal(isCurrentNotice({ v: '2', installation: INSTALL_A.toUpperCase() }), true);
  for (const bad of [{ v: '2', installation: INSTALL_B }, { v: '2' }, { v: '1', installation: INSTALL_A }, { v: '3', installation: INSTALL_A }, null, 'x']) {
    assert.equal(isCurrentNotice(bad), false, JSON.stringify(bad));
  }
  assert.equal(parsePayload({ v: '2', installation: INSTALL_A }), null, 'v2 carries no target');
  assert.equal(intentFromAction({ actionId: 'tap', notification: { data: { v: '2', installation: INSTALL_A } } }), null);
  const { api: fresh } = loadClient();
  assert.equal(fresh._test.isCurrentNotice({ v: '2', installation: INSTALL_A }), false, 'no installation on this phone');
});
