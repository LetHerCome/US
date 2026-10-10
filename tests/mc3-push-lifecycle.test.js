const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto').webcrypto;
const app = fs.readFileSync('app.js', 'utf8');
function native() {
  const store = new Map(), calls = [], listeners = {}, order = [];
  let owner = 'A', fail = false;
  const token = 'fcm:' + 'x'.repeat(80);
  const push = { addListener(name, fn) { listeners[name] = fn; }, checkPermissions: async () => ({ receive: 'granted' }), register: async () => { listeners.registration({ value: token }); }, unregister: async () => {}, removeAllDeliveredNotifications: async () => {} };
  let epoch = 'd78f8134-0b1d-4e70-a912-a5443be39b71';
  let rejected = false;
  let boundInstallation = '';
  const bindings = [];
  const support = {
    getStatus: async () => ({ platform: 'android', configured: true, bindingEpoch: epoch }),
    setBadge: async () => {},
    bindPushOwner: async ({ ownerId, installationId, expectedEpoch }) => {
      const bound = !rejected && expectedEpoch === epoch;
      if (bound) boundInstallation = installationId;
      bindings.push({ ownerId, installationId, expectedEpoch, bound });
      return { bound };
    },
    clearPushOwner: async () => {
      order.push('native-owner-clear');
      epoch = crypto.randomUUID();
      boundInstallation = '';
      return { cleared: true };
    }
  };
  const sb = { auth: { getSession: async () => ({data:{session:{user:{id:owner}}}}) }, rpc: async (name, args) => { calls.push({ owner, name, args }); order.push('rpc:'+name); return { data: { removed: true }, error: fail ? new Error('offline') : null }; } };
  const window = { sb, UsPlatform: { isNative: true, isPluginAvailable: () => true, getNativePlugin: name => name === 'PushNotifications' ? push : support } };
  vm.runInNewContext(fs.readFileSync('notifications.js', 'utf8'), { window, sb, document: { hidden: false, addEventListener() {} }, localStorage: { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) }, crypto, setTimeout, clearTimeout });
  return { api: window.UsNotifications, store, calls, order, push, listeners, bindings, native: { bound: () => boundInstallation, reject: value => { rejected = value; } }, switch: id => { owner = id; }, fail: value => { fail = value; } };
}
test('MC3 logout starts revocation before invalidating identity', () => {
  const body = app.slice(app.indexOf('signOut:async()=>{'), app.indexOf('function usInvalidateAuth'));
  assert.ok(body.indexOf('revokeCurrentDevice(') < body.indexOf('usInvalidateAuth('));
});
test('native A→B rotates installation and never reuses unresolved A token', async () => {
  const h = native(); await h.api.authReady({ id: 'A' }); assert.equal((await h.api.enable()).ok, true);
  const installation = h.store.get('us:notifications:v1:installation');
  h.api.signedOut(); h.switch('B'); await h.api.authReady({ id: 'B' });
  assert.notEqual(h.store.get('us:notifications:v1:installation'), installation);
  assert.equal((await h.api.enable()).ok, false);
  assert.equal(h.calls.filter(c => c.owner === 'B').length, 0);
});
test('native gate is bound only after RPC success and cleared on signedOut',async()=>{
  const h=native(); await h.api.authReady({id:'A'});
  assert.equal((await h.api.enable()).ok,true);
  assert.equal(h.bindings.length,1);
  assert.equal(h.native.bound(),h.store.get('us:notifications:v1:installation'));
  h.api.signedOut();
  await h.api.authReady({id:'B'});
  assert.equal(h.native.bound(),'');
});

test('native binding refusal fails closed despite server registration success',async()=>{
  const h=native(); await h.api.authReady({id:'A'});
  h.native.reject(true);
  assert.equal((await h.api.enable()).ok,false);
  assert.equal(h.native.bound(),'');
  assert.equal(h.bindings.length,1);
});

test('disable while offline clears native owner BEFORE RPC and persists A token for retry',async()=>{
  const h=native(); await h.api.authReady({id:'A'});
  assert.equal((await h.api.enable()).ok,true);
  const old=h.store.get('us:notifications:v1:installation');
  h.order.length=0;
  h.fail(true);
  const disabled=await h.api.disable();
  assert.equal(disabled.ok,false,'server offline is not a completed revocation');
  assert.equal(disabled.kind,'pending');
  assert.equal(h.native.bound(),'','native must reject A before returning from disable');
  assert.ok(h.order.indexOf('native-owner-clear')>=0);
  assert.ok(h.order.indexOf('native-owner-clear')<h.order.indexOf('rpc:unregister_native_push_device'));
  assert.equal(h.store.get('us:notifications:v1:enabled:A'),undefined);
  assert.equal(h.store.get('us:notifications:v1:installation'),undefined);
  assert.match(h.store.get('us:notifications:v1:retired'),new RegExp(old));
  await h.api.resume();
  assert.equal(h.native.bound(),'','resume cannot silently rebind A after failed disable');
});

test('successful disable retires native owner before server confirms revocation',async()=>{
  const h=native(); await h.api.authReady({id:'A'});
  assert.equal((await h.api.enable()).ok,true);
  h.order.length=0;
  assert.equal((await h.api.disable()).ok,true);
  assert.equal(h.native.bound(),'');
  assert.ok(h.order.indexOf('native-owner-clear')<h.order.indexOf('rpc:unregister_native_push_device'));
});

test('offline native revoke survives B and retries only when A returns', async () => {
  const h = native(); await h.api.authReady({ id: 'A' }); await h.api.enable(); h.fail(true);
  await h.api.revokeDevice(); h.api.signedOut(); h.switch('B'); h.fail(false); await h.api.authReady({ id: 'B' });
  assert.equal(h.calls.filter(c => c.owner === 'B' && c.name === 'unregister_native_push_device').length, 0);
  h.api.signedOut(); h.switch('A'); await h.api.authReady({ id: 'A' });
  assert.equal(h.calls.filter(c => c.owner === 'A' && c.name === 'unregister_native_push_device').length, 2);
});
function web() {
  const store = new Map(), calls = [];
  let owner = 'A', fail = true, unsubscribed = 0;
  const subscription = { endpoint: 'https://push.example/A', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'key', auth: 'auth' } }; }, unsubscribe: async () => { unsubscribed++; return true; } };
  const profile = { id: 'A' };
  const context = vm.createContext({ window: { usProfile: profile }, navigator: { userAgent: 'test' }, localStorage: { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) }, console, sb: { rpc: async (name,args) => { calls.push({ owner,name,args }); return { error: fail ? new Error('offline') : null }; } }, usAuthEpoch: 1, usWithDeadline: p => p, getCurrentPushSubscription: async () => subscription, toast() {}, refreshWebPushUi: async () => {} });
  const extract = (start,end) => app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
  vm.runInContext(extract('let usPushUiBusy=', 'function isIosDevice()') + extract('async function syncPushSubscriptionToSupabase(', 'async function sendWebPushEvent(') + extract('async function disableWebPush(', 'window.disableWebPush='),context);
  return { context, calls, subscription, store, unsubscribed: () => unsubscribed, owner: id => { owner=id; context.window.usProfile={id}; context.usAuthEpoch++; }, fail: value => { fail=value; } };
}
test('Web Push failed logout unsubscribes and quarantines endpoint across A→B and reload', async () => {
  const h=web(); assert.equal(await h.context.disableWebPush({silent:true,refreshUi:false,profileId:'A'}),false);
  assert.equal(h.unsubscribed(),1); h.owner('B'); h.fail(false);
  assert.equal(await h.context.syncPushSubscriptionToSupabase(h.subscription),false);
  assert.equal(h.calls.filter(c=>c.owner==='B').length,0);
  assert.match(h.store.get('us:push:retired:v1'),/https:\/\/push.example\/A/);
  h.owner('A'); assert.equal(await h.context.syncPushSubscriptionToSupabase(h.subscription),true);
  assert.equal(h.calls.filter(c=>c.owner==='A'&&c.name==='remove_web_push_subscription').length,2);
});
test('Web Push account switch cleans locally without revoking under B credentials', async () => {
  const h=web(); h.owner('B');
  await h.context.disableWebPush({silent:true,refreshUi:false,profileId:'A',localOnly:true});
  assert.equal(h.calls.length,0); assert.equal(h.unsubscribed(),1);
  assert.equal(await h.context.syncPushSubscriptionToSupabase(h.subscription),false);
});
test('native cold process keeps offline A retirement quarantined for B', async () => {
  const h=native(); await h.api.authReady({id:'A'}); await h.api.enable(); h.fail(true); await h.api.revokeDevice();
  const fresh=native(); for(const [key,value] of h.store)fresh.store.set(key,value);
  fresh.switch('B'); await fresh.api.authReady({id:'B'});
  assert.equal((await fresh.api.enable()).ok,false);
  assert.equal(fresh.calls.length,0);
});
test('native obsolete authReady cannot restore A after signedOut', async () => {
  const h=native(); const ready=h.api.authReady({id:'A'}); h.api.signedOut(); await ready;
  assert.equal((await h.api.enable()).ok,false); assert.equal(h.calls.length,0);
});
test('Web Push unsubscribe failure blocks the old endpoint for B even after remote deletion', async () => {
  const h=web(); h.fail(false); h.subscription.unsubscribe=async()=>false;
  assert.equal(await h.context.disableWebPush({silent:true,refreshUi:false,profileId:'A'}),false);
  h.owner('B'); assert.equal(await h.context.syncPushSubscriptionToSupabase(h.subscription),false);
  assert.equal(h.calls.filter(c=>c.owner==='B').length,0);
});
test('native registration arriving after A logout cannot register for B', async () => {
  const h=native(); await h.api.authReady({id:'A'});
  let started, release; const start=new Promise(resolve=>started=resolve);
  h.push.register=()=>{started();return new Promise(resolve=>release=resolve);};
  const enabling=h.api.enable(); await start;
  h.api.signedOut(); h.switch('B'); await h.api.authReady({id:'B'});
  h.listeners.registration({value:'fcm:'+ 'y'.repeat(80)}); release();
  assert.equal((await enabling).ok,false); assert.equal(h.calls.length,0);
});

