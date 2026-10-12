// S3.2: synthetic byte-copy safety ONLY, not a Supabase Storage integration.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {SyntheticObjectStore,makeSyntheticFixtureReview,rehearsePrivateMediaCopy}
 =require('../s3-2-media-copy-rehearsal.cjs');
const {planPrivateMomentMedia}=require('../s3-2-media-inventory.cjs');
const couple='11111111-1111-4111-8111-111111111111';
const otherCouple='22222222-2222-4222-8222-222222222222';
const actor='aaaaaaaa-0000-4000-8000-000000000001';
const survivor='aaaaaaaa-0000-4000-8000-000000000002';
const momentId='33333333-3333-4333-8333-333333333333';
const photoId='44444444-4444-4444-8444-444444444444';
const FIXED_NOW=1791800000000;
const makePath=(owner,name)=>[couple,owner,'moment-albums',momentId,name].join('/');
const orig=makePath(actor,'source.webp');
const thumb=makePath(actor,'thumb.jpg');
const own=makePath(survivor,'partner-photo.webp');
const payload=Object.freeze({
 actorId:actor,partnerId:survivor,coupleId:couple,
 moment:{id:momentId,coupleId:couple,createdBy:actor,storagePath:orig,thumbnailPath:thumb},
 photos:[{id:photoId,momentId,coupleId:couple,createdBy:survivor,storagePath:own}]
});
const descriptors=[
 {path:orig,bytes:Buffer.from('synthetic SOURCE secret A')},
 {path:thumb,bytes:Buffer.from('synthetic THUMB secret B')},
 {path:own,bytes:Buffer.from('synthetic PARTNER OWNED C')}
];
function seed(){
 const store=new SyntheticObjectStore(descriptors);
 const reviews=descriptors.map((f,i)=>makeSyntheticFixtureReview({
  path:f.path,bytes:f.bytes,retainingUserId:survivor,
  expiresAt:FIXED_NOW+100000,reviewId:'S32-QA-review-'+i
 }));
 return {store,reviews};
}
const run=(p={})=>{
 const {store,reviews}=seed();
 return rehearsePrivateMediaCopy({
   request:payload,store,reviews,now:FIXED_NOW,...p
 });
};
const dest=(kind,id)=>[couple,survivor,'s32-synthetic-reviewed',momentId,kind+'-'+id+'.bin'].join('/');
test('copies 2 actor-owned byte objects with SHA-256 and leaves partner-owned original in place',()=>{
 const {store,reviews}=seed();
 const before=descriptors.map(f=>store.readForTest(f.path));
 const result=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
 assert.equal(result.status,'SYNTHETIC_COPY_VERIFIED_RELEASE_BLOCKED');
 assert.equal(result.executable,false);
 assert.equal(result.uploadedToSupabase,false);
 assert.equal(result.sourceDeleted,false);
 assert.equal(result.byteCopyCount,2);
 assert.equal(result.partnerOwnedOriginalCount,1);
 assert.equal(result.verifiedObjectCount,3);
 assert.equal(result.databaseReferenceMigrationComplete,false);
 assert.equal(result.signedUrlRevocationComplete,false);
 assert.equal(result.expiryByteCleanupComplete,false);
 assert.equal(store.countForTest(),5);
 for(let i=0;i<descriptors.length;i++)assert.deepEqual(store.readForTest(descriptors[i].path),before[i]);
 assert.deepEqual(store.readForTest(dest('momentOriginal',momentId)),before[0]);
 assert.deepEqual(store.readForTest(dest('momentThumbnail',momentId)),before[1]);
 assert.equal(store.hasForTest(dest('albumPhoto',photoId)),false,'partner file is retained, not duplicated');
});
test('identical retry is idempotent and does not overwrite already verified copies',()=>{
 const {store,reviews}=seed();
 const first=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
 const second=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
 assert.equal(first.byteCopyCount,2);
 assert.equal(second.byteCopyCount,0);
 assert.equal(second.alreadyCopiedCount,2);
 assert.equal(store.countForTest(),5);
 assert.deepEqual(store.readForTest(dest('momentOriginal',momentId)),descriptors[0].bytes);
});
test('any missing source fails before first copy and keeps every source intact',()=>{
 const {reviews}=seed();
 const store=new SyntheticObjectStore(descriptors.slice(1));
 const result=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
 assert.equal(result.reason,'SOURCE_MISSING');
 assert.equal(store.countForTest(),2);
 assert.equal(store.hasForTest(dest('momentThumbnail',momentId)),false);
});
test('review must match each exact byte hash, source path, retaining member, and expiry',()=>{
 const variants=[
  (r)=>({...r,expiresAt:FIXED_NOW}),
  (r)=>({...r,retainingUserId:actor}),
  (r)=>({...r,sourcePathHash:'f'.repeat(64)}),
  (r)=>({...r,reviewId:'FAKE'}),
  (r)=>({...r,fixtureOnly:false}),
  (r)=>({...r,rightsBasis:'LEGALLY_APPROVED'}),
 ];
 for(const edit of variants){
  const {store,reviews}=seed();
  reviews[1]=edit(reviews[1]);
  const result=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
  assert.equal(result.reason,'REVIEW_NOT_VERIFIED');
  assert.equal(store.countForTest(),3);
 }
});
test('a modified source after the mock review is detected before copying',()=>{
 const {reviews}=seed();
 const changed=[descriptors[0],{...descriptors[1],bytes:Buffer.from('tampered thumb!')},descriptors[2]];
 const store=new SyntheticObjectStore(changed);
 const r=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
 assert.equal(r.reason,'SOURCE_CHANGED_SINCE_REVIEW');
 assert.equal(store.countForTest(),3);
});
test('injected corruption of copied bytes fails checksum and rolls back the entire batch',()=>{
 const {store,reviews}=seed();
 const r=rehearsePrivateMediaCopy({
   request:payload,store,reviews,now:FIXED_NOW,
   fault:{corruptAtIndex:1}
 });
 assert.equal(r.reason,'DESTINATION_CHECKSUM_MISMATCH');
 assert.equal(store.countForTest(),3);
 assert.equal(store.hasForTest(dest('momentOriginal',momentId)),false);
 assert.deepEqual(store.readForTest(orig),descriptors[0].bytes);
});
test('injected copy failure after first candidate never commits a partial transfer',()=>{
 const {store,reviews}=seed();
 const r=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW,fault:{failAtIndex:1}});
 assert.equal(r.reason,'INJECTED_TRANSFER_FAILURE');
 assert.equal(store.countForTest(),3);
 assert.equal(store.hasForTest(dest('momentOriginal',momentId)),false);
});
test('destination collision with different bytes never overwrites a pre-existing object',()=>{
 const {reviews}=seed();
 const foreignDest=dest('momentOriginal',momentId);
 const existing=Buffer.from('different existing owner data');
 const store=new SyntheticObjectStore([...descriptors,{path:foreignDest,bytes:existing}]);
 const r=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
 assert.equal(r.reason,'DESTINATION_COLLISION');
 assert.deepEqual(store.readForTest(foreignDest),existing);
 assert.equal(store.countForTest(),4);
});
test('a foreign-tenant or forged uploader request can never stage bytes',()=>{
 const {store,reviews}=seed();
 const bads=[
  {...payload,coupleId:otherCouple},
  {...payload,moment:{...payload.moment,coupleId:otherCouple}},
  {...payload,photos:[{...payload.photos[0],createdBy:actor}]}
 ];
 for(const bad of bads){
  const r=rehearsePrivateMediaCopy({request:bad,store,reviews,now:FIXED_NOW});
  assert.equal(r.executable,false);
  assert.equal(r.byteCopyCount,0);
 }
 assert.equal(store.countForTest(),3);
});
test('no external adapter can be supplied, even if it imitates a Storage client',()=>{
 const {reviews}=seed();
 for(const fake of [null,{},new Map(),{upload(){},download(){},remove(){}}]){
  const r=rehearsePrivateMediaCopy({request:payload,store:fake,reviews,now:FIXED_NOW});
  assert.equal(r.reason,'REAL_STORAGE_FORBIDDEN');
  assert.equal(r.uploadedToSupabase,false);
 }
});
test('oversized files are denied without partial transfer',()=>{
 const {reviews}=seed();
 const store=new SyntheticObjectStore([
   {...descriptors[0],bytes:Buffer.alloc(512*1024+1,0x61)},
   descriptors[1],descriptors[2]
 ]);
 const r=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
 assert.equal(r.reason,'OBJECT_TOO_LARGE');
 assert.equal(store.countForTest(),3);
});
test('no path, real user id, raw content, signed URL or secret is returned from rehearsal',()=>{
 const {store,reviews}=seed();
 const out=rehearsePrivateMediaCopy({request:payload,store,reviews,now:FIXED_NOW});
 const text=JSON.stringify(out);
 for(const secret of [couple,actor,survivor,momentId,'source.webp','synthetic SOURCE secret A','https://','/storage/v1/object/sign/'])
  assert.equal(text.includes(secret),false,secret);
 assert.ok(!Object.keys(out).includes('paths'));
 const copySource=fs.readFileSync(path.join(__dirname,'../s3-2-media-copy-rehearsal.cjs'),'utf8');
 assert.doesNotMatch(copySource,/createClient\(|fetch\(|https:\/\/|require\(['"]@supabase|\.storage\.from\(/);
 assert.doesNotMatch(copySource,/\.remove\(|\.delete\(|\.unlink\(/);
 assert.equal(planPrivateMomentMedia(payload).status,'BLOCKED_STORAGE_AND_PRIVACY_REVIEW');
});
