const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function settled(promise,label){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} did not terminate`)),250);})]);}
  finally{clearTimeout(timer);}
}
function harness(stage){
  const gate=deferred(),entered=deferred(),store=new Map(),calls=[];
  const subscription={endpoint:'https://push.example/A',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'key',auth:'auth'}};},unsubscribe:async()=>{calls.push('unsubscribe');return true;}};
  const readSubscription=async()=>{if(stage==='subscription'){entered.resolve();await gate.promise;}return subscription;};
  const context=vm.createContext({window:{usProfile:{id:'A'},UsOnboarding:{mount:()=>({reset(){}})}},document:{getElementById:()=>null,body:{classList:{remove(){}}},documentElement:{classList:{remove(){},add(){}}}},navigator:{userAgent:'test'},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},console:{warn(){}},setTimeout,clearTimeout,usAuthEpoch:1,usAuthUserId:'A',homePhotoRequestId:0,usRealtimeChannel:null,usOnboarding:{reset(){}},clearPrivateDeviceState:async()=>{},resetNoiIdeasForIdentityChange(){},toast(){},refreshWebPushUi:async()=>{},isWebPushSupported:()=>true,isIosDevice:()=>false,isStandaloneUs:()=>true,Notification:{permission:stage==='permission'?'default':'granted',requestPermission:async()=>{entered.resolve();await gate.promise;return 'granted';}},getUsServiceWorkerRegistration:async()=>({pushManager:{getSubscription:readSubscription}}),getCurrentPushSubscription:async()=>subscription,sb:{rpc:async(name)=>{calls.push(name);if(stage==='rpc'&&name==='register_web_push_subscription'){entered.resolve();await gate.promise;}return {error:null};}},sendWebPushEvent:async()=>{},usWithDeadline:promise=>promise});
  const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  vm.runInContext(extract('let usPushUiBusy=','function isIosDevice()')+extract('async function syncPushSubscriptionToSupabase(','async function sendWebPushEvent(')+extract('async function enableWebPush(','window.enableWebPush=')+extract('async function disableWebPush(','window.disableWebPush=')+extract('function usInvalidateAuth(','window.addEventListener(\'us-app-lock-change\''),context);
  return {context,calls,gate,entered,subscription,store};
}
test('B activation cannot become the operation awaited by queued A cleanup',async()=>{
  const h=harness(); h.context.usInvalidateAuth(); h.context.window.usProfile={id:'B'};
  const enabling=h.context.enableWebPush();
  await settled(enabling,'B activation');
  await settled(vm.runInContext('usPushCleanup',h.context),'A cleanup');
});
for(const stage of ['permission','subscription','rpc'])test(`account change releases activation and cleanup during deferred ${stage}`,async()=>{
  const h=harness(stage),enabling=h.context.enableWebPush(); await h.entered.promise;
  h.context.usInvalidateAuth(); h.context.window.usProfile={id:'B'};
  await settled(enabling,`${stage} activation`);
  await settled(vm.runInContext('usPushCleanup',h.context),`${stage} cleanup`);
  h.gate.resolve(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.filter(name=>name==='register_web_push_subscription').length,stage==='rpc'?1:0);
  assert.equal(h.store.has('us:push:subscription:B'),false);
  if(stage==='subscription')assert.ok(h.calls.includes('unsubscribe'));
});
