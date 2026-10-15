'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planPrivateMomentMedia,safePath,BLOCKED}=require('../s3-2-media-inventory.cjs');
const actor='aaaaaaaa-0000-4000-8000-000000000001';
const partner='aaaaaaaa-0000-4000-8000-000000000002';
const couple='11111111-1111-4111-8111-111111111111';
const otherCouple='22222222-2222-4222-8222-222222222222';
const momentId='33333333-3333-4333-8333-333333333333';
const photoId='44444444-4444-4444-8444-444444444444';
const path=(owner,file)=>couple+'/'+owner+'/moment-albums/'+momentId+'/'+file;
const base={
 actorId:actor,partnerId:partner,coupleId:couple,
 moment:{id:momentId,coupleId:couple,createdBy:actor,storagePath:path(actor,'original.webp'),thumbnailPath:path(actor,'thumb.jpg')},
 photos:[{id:photoId,momentId,coupleId:couple,createdBy:partner,storagePath:path(partner,'album-photo.webp')}]
};
test('inventory identifies original thumbnail and survivor-owned carousel photo without IO',()=>{
 const x=planPrivateMomentMedia(base);
 assert.equal(x.status,BLOCKED);
 assert.equal(x.executable,false);
 assert.equal(x.objectCount,3);
 assert.equal(x.departingOwned,2);
 assert.equal(x.partnerOwned,1);
 assert.equal(x.reviewNeeded,3);
 assert.equal(x.requiresVerifiedStorageCopy,true);
 assert.equal(x.requiresPhysicalRetentionCleanup,true);
 assert.deepEqual(x.assets.map(a=>a.kind),['momentOriginal','momentThumbnail','albumPhoto']);
 assert.deepEqual(x.assets.map(a=>a.ownership),['DEPARTING_MEMBER','DEPARTING_MEMBER','REMAINING_MEMBER']);
 assert.ok(x.assets.every(a=>a.state==='BLOCKED_PENDING_VERIFIED_MEDIA_TRANSFER'));
});
test('no media path, identifying folder, URL, tokens or original filename in response',()=>{
 const result=planPrivateMomentMedia(base);
 const serialized=JSON.stringify(result);
 assert.ok(!serialized.includes(couple));
 assert.ok(!serialized.includes(actor));
 assert.ok(!serialized.includes(partner));
 assert.ok(!serialized.includes('original.webp'));
 assert.ok(!serialized.includes('album-photo.webp'));
 assert.ok(!serialized.includes('https://'));
 assert.deepEqual(Object.keys(result.assets[0]),['kind','ownership','state']);
});
test('matches real US nested Storage album format and rejects traversal encodings',()=>{
 assert.equal(safePath(path(actor,'123-456.webp'),couple,actor),true);
 for(const bad of [
  couple+'/'+actor+'/../secret.jpg',
  couple+'/'+actor+'/moment-albums/'+momentId+'/../target.jpg',
  couple+'/'+actor+'/moment-albums//object.jpg',
  couple+'/'+actor+'/folder%2Fescape.jpg',
  couple+'/'+actor+'/folder%2e%2e/file.jpg',
  couple+'/'+actor+'/object?download=true',
  couple+'/'+actor+'/object#frag',
  couple+'/'+actor+'/object\\evil.jpg',
  'https://malicious.example/file.jpg',
  otherCouple+'/'+actor+'/test.webp',
  couple+'/'+partner+'/original.webp'
 ])assert.equal(safePath(bad,couple,actor),false,'invalid path '+bad);
});
test('cross-tenant or wrong uploader path blocks whole plan',()=>{
 for(const bad of [
  {...base,moment:{...base.moment,coupleId:otherCouple}},
  {...base,moment:{...base.moment,createdBy:partner}},
  {...base,moment:{...base.moment,storagePath:otherCouple+'/'+actor+'/file.jpg'}},
  {...base,photos:[{...base.photos[0],coupleId:otherCouple}]},
  {...base,photos:[{...base.photos[0],createdBy:actor}]},
  {...base,photos:[{...base.photos[0],createdBy:'55555555-5555-4555-8555-555555555555'}]},
 ]){
  const x=planPrivateMomentMedia(bad);
  if(bad.photos?.[0]?.createdBy===actor && bad.photos?.[0]?.storagePath===path(partner,'album-photo.webp')){
   assert.equal(x.executable,false);
   assert.equal(x.reason,'PATH_REQUIRES_MANUAL_REVIEW');
  }else{
   assert.equal(x.executable,false);
   assert.equal(x.objectCount,0);
  }
 }
});
test('duplicate IDs or duplicate Storage files are rejected',()=>{
 const photo=base.photos[0];
 for(const photos of [
  [photo,photo],
  [photo,{...photo,id:'66666666-6666-4666-8666-666666666666'}],
 ]){
  const result=planPrivateMomentMedia({...base,photos});
  assert.equal(result.executable,false);
  assert.equal(result.objectCount,0);
 }
});
test('too many photos and malformed inputs return blocked with no partial output',()=>{
 for(const input of [
  null,{}, {...base,photos:null},
  {...base,moment:null},
  {...base,actorId:partner},
  {...base,photos:Array.from({length:101},()=>base.photos[0])},
  {...base,moment:{...base.moment,storagePath:'hello'}}
 ]){
  const x=planPrivateMomentMedia(input);
  assert.equal(x.executable,false);
  assert.equal(x.objectCount,0);
 }
});
test('all valid plans remain blocked including a memory without photos',()=>{
 const r=planPrivateMomentMedia({...base,moment:{...base.moment,thumbnailPath:null},photos:[]});
 assert.equal(r.objectCount,1);
 assert.equal(r.departingOwned,1);
 assert.equal(r.executable,false);
 assert.equal(r.status,BLOCKED);
});
