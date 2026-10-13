const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto').webcrypto;
// Model the external server/provider independently: JS cannot revoke delivery
// simply by forgetting an installation or refusing B's registration.
for(const platform of ['android','ios'])test(`${platform}: B token quarantine does not prove A delivery stopped when both revocations fail`,async()=>{
  const store=new Map(),rows=new Map(),listeners={},calls=[];
  const token=platform==='ios'?'a'.repeat(64):'fcm:'+ 'x'.repeat(80);
  let owner='A',offline=false,providerRegistered=false;
  const push={addListener:(name,fn)=>{listeners[name]=fn;},checkPermissions:async()=>({receive:'granted'}),register:async()=>{calls.push('register');providerRegistered=true;listeners.registration({value:token});},unregister:async()=>{calls.push('unregister');if(offline)throw new Error('provider unavailable');providerRegistered=false;},removeAllDeliveredNotifications:async()=>{calls.push('clearDelivered');}};
  // Android (S3, #187): native owner gate + awaited deleteToken via UsPushSupport.
  const gate={epoch:'00000000-0000-4000-8000-000000000001',owner:null,installation:null};
  const support={getStatus:async()=>({platform,configured:true,environment:'production',bindingEpoch:gate.epoch}),setBadge:async()=>{},
    bindPushOwner:async({ownerId,installationId,expectedEpoch})=>{if(expectedEpoch!==gate.epoch)return {bound:false};gate.owner=ownerId;gate.installation=installationId;return {bound:true};},
    clearPushOwner:async()=>{gate.owner=null;gate.installation=null;gate.epoch='00000000-0000-4000-8000-00000000000'+(Number(gate.epoch.slice(-1))+1);return {cleared:true};},
    stopPushTransport:async()=>{calls.push('unregister');if(offline||gate.owner)return {stopped:false};providerRegistered=false;return {stopped:true};}};
  const sb={auth:{getSession:async()=>({data:{session:{user:{id:owner}}}})},rpc:async(name,args)=>{
    if(offline)return {error:new Error('offline')};
    if(name==='register_native_push_device')rows.set(args.target_installation_id,{owner,token:args.target_token});
    if(name==='unregister_native_push_device'&&rows.get(args.target_installation_id)?.owner===owner)rows.delete(args.target_installation_id);
    return {error:null,data:{removed:true}};
  }};
  const window={sb,UsPlatform:{isNative:true,isPluginAvailable:()=>true,getNativePlugin:name=>name==='PushNotifications'?push:support}};
  vm.runInNewContext(fs.readFileSync('notifications.js','utf8'),{window,sb,document:{hidden:false,addEventListener(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},crypto,setTimeout,clearTimeout});
  const api=window.UsNotifications;
  await api.authReady({id:'A'});assert.equal((await api.enable()).ok,true);
  offline=true;await api.revokeDevice();api.signedOut();owner='B';offline=false;await api.authReady({id:'B'});
  assert.equal((await api.enable()).ok,false,'B cannot register unresolved A token');
  // iOS: APNs may hand back the same token, so B never reactivates the
  // provider while A's row is unresolved. Android (#187): once deleteToken()
  // is confirmed B may ask FCM again; if the provider still returned A's
  // token (this worst-case model) registration is refused as retired_token,
  // B is never bound, and the cleared owner gate drops A's packets.
  if(platform==='ios')assert.equal(calls.filter(call=>call==='register').length,1,'B must not reactivate the provider while A retirement is unresolved');
  else assert.equal(gate.owner,null,'B never bound to a token A may still receive');
  assert.ok(calls.includes('unregister'));assert.ok(calls.includes('clearDelivered'));
  assert.equal([...rows.values()].filter(row=>row.owner==='B').length,0);
  assert.equal([...rows.values()].some(row=>row.owner==='A'&&row.token===token)&&providerRegistered,true,'A remains deliverable in the external provider model; no complete isolation claim');
  if(platform==='android')assert.equal(gate.owner,null,'Android: A packets still reach the phone but the native owner gate no longer displays them');
});
