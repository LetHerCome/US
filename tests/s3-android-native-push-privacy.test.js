// US Store S3 / Android: prevent private text or deep links in OS-rendered FCM.
// This is a partial mitigation, NOT proof of full A -> B delivery isolation.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = (name) => import(path.join(__dirname, '../supabase/functions/_shared', name));
const TOKEN = 'fcm:' + 'Z'.repeat(80);
const REF = 'eb72e072-728c-476d-83fd-d902b74b3660';

test('all FCM catalogue events serialize one generic banner with no private recipient data', async () => {
  const { fcmMessage, ANDROID_SAFE_COPY } = await load('native-push-transport.mjs');
  const { buildNotification, NOTIFICATION_TYPES } = await load('notification-core.mjs');
  for (const type of NOTIFICATION_TYPES) {
    const n = buildNotification(type, {
      senderName: 'PRIVATE_SENDER_BEATRICE',
      messageId: REF, questionId: REF, questId: REF, itemId: REF,
      sessionId: REF, reminderId: 'private-reminder', entryId: REF,
      title: 'PRIVATE_TITLE', body: 'PRIVATE_CALENDAR_TITLE',
      tag: 'private-event-tag',
    });
    const msg = fcmMessage(n, TOKEN).message;
    const wire = JSON.stringify(msg);
    assert.deepEqual(msg.notification, ANDROID_SAFE_COPY, type);
    assert.equal(Object.hasOwn(msg, 'data'), false, type);
    assert.equal(msg.android.notification.channel_id, 'us_partner', type);
    assert.equal(msg.android.notification.tag, 'us-private-notice', type);
    assert.equal(msg.android.collapse_key, 'us-private-notice', type);
    assert.doesNotMatch(wire, /PRIVATE_SENDER_BEATRICE|PRIVATE_TITLE|PRIVATE_CALENDAR_TITLE|private-event-tag|private-reminder|eb72e072|"target"|"ref"|"type"/, type);
  }
});

test('stale A token cannot carry A calendar content or a navigation action into B session', async () => {
  const { fcmMessage } = await load('native-push-transport.mjs');
  const { buildNotification } = await load('notification-core.mjs');
  const oldOwnerA = buildNotification('calendar_reminder', {
    reminderId: 'a-secret', entryId: REF, body: 'A private appointment',
  });
  const newOwnerB = buildNotification('think', {
    senderName: 'B private partner', messageId: REF,
  });
  const a = fcmMessage(oldOwnerA, TOKEN).message;
  const b = fcmMessage(newOwnerB, TOKEN).message;
  assert.deepEqual(a.notification, b.notification, 'OS title/body neutral across owners');
  assert.deepEqual(a.android.notification, b.android.notification);
  assert.equal(Object.hasOwn(a, 'data'), false);
  assert.equal(Object.hasOwn(b, 'data'), false);
  assert.equal(JSON.stringify(a).includes('appointment'), false);
  // This does NOT stop the legacy token from receiving a generic banner!
  // P0 #181 still requires native owner verification before OS display.
});
