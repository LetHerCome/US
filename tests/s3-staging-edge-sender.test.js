// Static contract for the separately deployed staging-only Edge sender.
// Real Firebase transport & real signed JWT require hardware/end-to-end QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../supabase/functions/s3-staging-send-web-push/index.ts');
const source = fs.readFileSync(file, 'utf8');

test('sender refuses every Supabase project except isolated US-STAGING', () => {
  assert.match(source, /const STAGE_URL = "https:\/\/dugmhngrfkuieeletatb\.supabase\.co"/);
  assert.match(source, /Deno\.env\.get\("SUPABASE_URL"\) !== STAGE_URL/);
  assert.doesNotMatch(source, /iiakdfsxpywdkxravqjh/);
});

test('sender only accepts FCM credential for dedicated staging Firebase project', () => {
  assert.match(source, /const STAGE_FIREBASE_PROJECT = "us-staging-45e0f"/);
  assert.match(source, /provider\.fcm\.projectId !== STAGE_FIREBASE_PROJECT/);
  assert.match(source, /staging_fcm_service_account_missing_or_wrong/);
  assert.match(source, /apns: null/);
});

test('sender fails closed without validated JWT, own coupled profile and exact test request', () => {
  assert.match(source, /admin\.auth\.getUser\(bearer\)/);
  assert.match(source, /if \(authError \|\| !UUID\.test\(userId\)\)/);
  assert.match(source, /Object\.keys\(requestBody\)\.length !== 1 \|\| requestBody\.type !== "test"/);
  assert.match(source, /\.eq\("id", userId\)\.maybeSingle\(\)/);
  assert.match(source, /recipientIds: \[userId\]/);
  assert.match(source, /coupleId: profile\.couple_id/);
  assert.match(source, /s3-self-test:/);
  assert.doesNotMatch(source, /(?:token|target|recipientId)\s*=\s*requestBody/);
  assert.doesNotMatch(source, /console\.log\(/);
});

test('sender uses existing tenant-isolated native dispatcher and generic test notification', () => {
  assert.match(source, /buildNotification\("test"\)/);
  assert.match(source, /deliverNotification\(admin/);
  assert.match(source, /nativePushConfig/);
  assert.match(source, /createNativeTransport/);
  assert.doesNotMatch(source, /message\.notification|android\.notification/);
});
