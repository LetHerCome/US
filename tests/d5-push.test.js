const test=require('node:test');
const assert=require('node:assert/strict');
const {createFakeAdmin,createFakeWebPush}=require('./helpers/edge-function-harness');
test('D5 Game push uses same-tenant display name and preserves dedupe',async()=>{
  const {deliverGamePush}=await import('../supabase/functions/_shared/game-v2-push-core.mjs');
  const event={kind:'game_waiting',couple_id:'b',sender_role:'beatrice',recipient_role:'francesco',dedupe_key:'game-waiting:00000000-0000-4000-8000-000000000001:francesco'};
  const admin=createFakeAdmin({tables:{profiles:[{id:'sam',couple_id:'b',role:'francesco',display_name:'Sam'},{id:'alex',couple_id:'b',role:'beatrice',display_name:'Alex'},{id:'secret',couple_id:'a',role:'beatrice',display_name:'Beatrice'}],push_subscriptions:[{id:'sub',user_id:'sam',endpoint:'https://push.example/sam',p256dh:'test',auth_key:'test'}]}});
  const web=createFakeWebPush();
  const options={ensureVapid(){},sendNotification:web.sendNotification};
  assert.equal((await deliverGamePush(admin,event,options)).delivered,1);
  assert.equal(web.sent[0].payload.body,'Alex ha risposto. Ora tocca a te.');
  assert.equal((await deliverGamePush(admin,event,options)).outcome,'deduplicated');
  assert.equal(web.sent.length,1);
});
for(const [name,expected] of [['Sam','Sam ha risposto. Ora tocca a te.'],['\u0000<>','La tua persona ha risposto. Ora tocca a te.']]){
  test(`D5 native Game push validates sender ${JSON.stringify(name)} and tenant`,async()=>{
    const {deliverGamePush}=await import('../supabase/functions/_shared/game-v2-push-core.mjs');
    const event={kind:'game_waiting',couple_id:'b',sender_role:'francesco',recipient_role:'beatrice',dedupe_key:'game-waiting:00000000-0000-4000-8000-000000000001:beatrice'};
    const admin=createFakeAdmin({tables:{profiles:[{id:'alex',couple_id:'b',role:'beatrice',display_name:'Alex'},{id:'sam',couple_id:'b',role:'francesco',display_name:name}],device_push_tokens:[{id:'fcm',user_id:'alex',couple_id:'b',provider:'fcm'},{id:'apns',user_id:'alex',couple_id:'b',provider:'apns'},{id:'foreign',user_id:'alex',couple_id:'a',provider:'fcm'}]}});
    const sent=[];
    const native={ready:()=>true,send:async(device,notification)=>{sent.push({device,notification});return {ok:true};}};
    assert.equal((await deliverGamePush(admin,event,{native})).delivered,2);
    assert.deepEqual(sent.map(x=>x.device.id),['fcm','apns']);
    for(const x of sent){assert.equal(x.notification.body,expected);assert.equal(x.notification.target,'quiz');}
    assert.equal((await deliverGamePush(admin,event,{native})).outcome,'deduplicated');
    assert.equal(sent.length,2);
  });
}
