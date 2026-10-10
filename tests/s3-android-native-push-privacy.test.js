// US Store S3: data-only provider payload never auto-renders private or generic
// notifications before a checked native owner binding. Hardware QA still needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = name => import(path.join(__dirname, '../supabase/functions/_shared', name));
const TOKEN = 'fcm:' + 'Z'.repeat(80);
const INSTALL_A = '1f5bcf2d-2cf9-48d6-b018-9ac99be5a1b8';
const INSTALL_B = '6b2ef2a0-65be-41c1-a1c8-64a5d8e2a174';
const REF = 'eb72e072-728c-476d-83fd-d902b74b3660';
const device = installation_id => ({ token: TOKEN, installation_id });

test('FCM for every US event is data-only, owner-routed, no private text, no deep link',async()=>{
 const { fcmMessage }=await load('native-push-transport.mjs');
 const { buildNotification, NOTIFICATION_TYPES }=await load('notification-core.mjs');
 for(const type of NOTIFICATION_TYPES){
  const n=buildNotification(type,{
   senderName:'PRIVATE_SENDER_BEATRICE', messageId:REF,
   questionId:REF, questId:REF, itemId:REF, sessionId:REF,
   reminderId:'private-reminder', entryId:REF,
   title:'PRIVATE_TITLE', body:'PRIVATE_CALENDAR_TITLE', tag:'private-event-tag'
  });
  const msg=fcmMessage(n,device(INSTALL_A)).message;
  const wire=JSON.stringify(msg);
  assert.equal(Object.hasOwn(msg,'notification'),false,type);
  assert.equal(Object.hasOwn(msg.android,'notification'),false,type);
  assert.deepEqual(msg.data,{v:'2',installation:INSTALL_A},type);
  assert.equal(msg.android.collapse_key,'us-private-notice',type);
  assert.doesNotMatch(wire,/PRIVATE_SENDER_BEATRICE|PRIVATE_TITLE|PRIVATE_CALENDAR_TITLE|private-event-tag|private-reminder|eb72e072|"target"|"ref"|"type"|click_action/i,type);
 }
});

test('A and B differ ONLY by routing installation, never by private event copy',async()=>{
 const { fcmMessage }=await load('native-push-transport.mjs');
 const { buildNotification }=await load('notification-core.mjs');
 const a=fcmMessage(buildNotification('calendar_reminder',{reminderId:'a',entryId:REF,body:'A private event'}),device(INSTALL_A)).message;
 const b=fcmMessage(buildNotification('think',{senderName:'B private sender',messageId:REF}),device(INSTALL_B)).message;
 assert.deepEqual(a.data,{v:'2',installation:INSTALL_A});
 assert.deepEqual(b.data,{v:'2',installation:INSTALL_B});
 assert.equal(Object.hasOwn(a,'notification'),false);
 assert.equal(Object.hasOwn(b,'notification'),false);
 assert.equal(JSON.stringify(a).includes('A private event'),false);
 assert.equal(JSON.stringify(b).includes('B private sender'),false);
});

test('invalid/missing installation never produces a deliverable FCM payload',async()=>{
 const { fcmMessage }=await load('native-push-transport.mjs');
 const { buildNotification }=await load('notification-core.mjs');
 const n=buildNotification('test',{});
 for(const id of [null,undefined,'','not-a-uuid',INSTALL_A+';injected']){
  assert.throws(()=>fcmMessage(n,device(id)),/native_installation_missing/);
 }
});

test('Android manifest has exactly one guarded receiver; plain Capacitor service removed',()=>{
 const manifest=fs.readFileSync(path.join(__dirname,'../android/app/src/main/AndroidManifest.xml'),'utf8');
 const service=fs.readFileSync(path.join(__dirname,'../android/app/src/main/java/com/usapp/us/UsGuardedMessagingService.java'),'utf8');
 const gate=fs.readFileSync(path.join(__dirname,'../native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushOwnerGate.java'),'utf8');
 const plugin=fs.readFileSync(path.join(__dirname,'../native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushSupportPlugin.java'),'utf8');
 assert.match(manifest,/MessagingService"\s+tools:node="remove"/);
 assert.match(manifest,/android:name="\.UsGuardedMessagingService"/);
 assert.equal((manifest.match(/com\.google\.firebase\.MESSAGING_EVENT/g)||[]).length,1);
 assert.match(service,/extends MessagingService/);
 assert.match(service,/UsPushOwnerGate\.accepts\(this, data\.get\("installation"\)\)/);
 assert.match(service,/message\.getNotification\(\) != null/);
 assert.match(gate,/getSharedPreferences\(STORE, Context\.MODE_PRIVATE\)/);
 assert.match(gate,/remove\(OWNER\)\.remove\(INSTALLATION\)/);
 assert.match(plugin,/@PluginMethod\s+public void bindPushOwner/);
 assert.match(plugin,/@PluginMethod\s+public void clearPushOwner/);
});

test('Android client registers/clears owner after authenticated server registration',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../notifications.js'),'utf8');
 const registration=js.slice(js.indexOf('async function registerToken('),js.indexOf('async function onRegistration('));
 assert.ok(registration.indexOf("db.rpc('register_native_push_device'")>=0);
 assert.ok(registration.lastIndexOf("await bindNativeOwner(status, installation, owner)") > registration.indexOf("if (error) throw error"));
 assert.match(js,/await retireNativeOwner\(\)/);
 assert.match(js,/function signedOut\(\) \{[\s\S]*?retireNativeOwner\(\)/);
});
