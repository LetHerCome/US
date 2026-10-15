// US S3.2 - disposable in-memory byte-transfer rehearsal, NEVER a Storage adapter.
// No Supabase client, service key, HTTP, filesystem, signed URLs or deletion API.
// A genuine rights issuer, private storage transport and DB reference migration
// must be reviewed separately before any production/staging use.
'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const {planPrivateMomentMedia,safePath,BLOCKED}=require('./s3-2-media-inventory.cjs');

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashKey=key=>hash(Buffer.from(key,'utf8'));
const MAX_OBJECT_BYTES=512*1024;
const MAX_ALBUM_BYTES=5*1024*1024;
const validClock=v=>Number.isFinite(v)&&v>0;
const publicFailure=reason=>Object.freeze({
 status:BLOCKED,reason,executable:false,uploadedToSupabase:false,
 sourceDeleted:false,byteCopyCount:0,partnerReferencesUnchanged:true
});

class SyntheticObjectStore {
 #objects=new Map();
 constructor(fixtures=[]){
  if(!Array.isArray(fixtures)||fixtures.length>120)throw Error('INVALID_SYNTHETIC_FIXTURE');
  for(const row of fixtures){
   if(!row||typeof row.path!=='string'||!(Buffer.isBuffer(row.bytes)||row.bytes instanceof Uint8Array)
    ||this.#objects.has(row.path))throw Error('INVALID_SYNTHETIC_FIXTURE');
   this.#objects.set(row.path,Buffer.from(row.bytes));
  }
 }
 readForTest(path){
  const v=this.#objects.get(path);
  return v?Buffer.from(v):null;
 }
 hasForTest(path){return this.#objects.has(path);}
 countForTest(){return this.#objects.size;}
 // This is an in-memory, copy-on-write commit ONLY. No external adapter.
 commitForTest(working){this.#objects=working;}
 snapshotForTest(){return new Map([...this.#objects].map(([k,v])=>[k,Buffer.from(v)]));}
}

function descriptors(request){
 const {moment,photos}=request;
 return [
  {kind:'momentOriginal',id:moment.id,owner:moment.createdBy,path:moment.storagePath},
  ...(moment.thumbnailPath?[{kind:'momentThumbnail',id:moment.id,owner:moment.createdBy,path:moment.thumbnailPath}]:[]),
  ...photos.map(p=>({kind:'albumPhoto',id:p.id,owner:p.createdBy,path:p.storagePath}))
 ];
}

// A factory for LOCAL SYNTHETIC TEST REVIEWS only: trivially forgeable!
// Its output must NEVER be accepted by an actual authorization/retention API.
function makeSyntheticFixtureReview({path,bytes,retainingUserId,expiresAt,reviewId}={}){
 if(typeof path!=='string'||!(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array))
   throw Error('NOT_A_SYNTHETIC_FIXTURE');
 return Object.freeze({
  fixtureOnly:true,rightsBasis:'SYNTHETIC_QA_NOT_LEGAL_AUTHORIZATION',
  reviewId,retainingUserId,sourcePathHash:hashKey(path),
  sourceSha256:hash(bytes),expiresAt
 });
}

function rehearsePrivateMediaCopy({request,store,reviews,now=Date.now(),fault=null}={}){
 // Only exact in-memory synthetic store supported; reject any supplied
 // object with a production upload/download/copy/remove-like interface.
 if(!(store instanceof SyntheticObjectStore)||Object.getPrototypeOf(store)!==SyntheticObjectStore.prototype)
   return publicFailure('REAL_STORAGE_FORBIDDEN');
 const inventory=planPrivateMomentMedia(request);
 if(inventory.objectCount===0 || !Array.isArray(inventory.assets))
   return publicFailure('INVALID_OR_CROSS_TENANT_INVENTORY');
 if(!validClock(now)||!Array.isArray(reviews)||reviews.length!==inventory.objectCount)
   return publicFailure('REVIEW_NOT_VERIFIED');
 const assets=descriptors(request);
 const uniqueReviews=new Set(),validated=[];
 let totalBytes=0;
 // PREFLIGHT every review and existing object before ANY copy.
 for(let i=0;i<assets.length;i++){
  const asset=assets[i],review=reviews[i];
  if(!safePath(asset.path,request.coupleId,asset.owner)
   ||!review||review.fixtureOnly!==true
   ||review.rightsBasis!=='SYNTHETIC_QA_NOT_LEGAL_AUTHORIZATION'
   ||typeof review.reviewId!=='string'||!/^S32-QA-[A-Za-z0-9-]{1,80}$/.test(review.reviewId)
   ||uniqueReviews.has(review.reviewId)
   ||review.retainingUserId!==request.partnerId
   ||review.sourcePathHash!==hashKey(asset.path)
   ||typeof review.sourceSha256!=='string'||!/^[0-9a-f]{64}$/.test(review.sourceSha256)
   ||!validClock(review.expiresAt)||review.expiresAt<=now){
    return publicFailure('REVIEW_NOT_VERIFIED');
  }
  uniqueReviews.add(review.reviewId);
  const source=store.readForTest(asset.path);
  if(!source)return publicFailure('SOURCE_MISSING');
  if(source.length>MAX_OBJECT_BYTES)return publicFailure('OBJECT_TOO_LARGE');
  totalBytes+=source.length;
  if(totalBytes>MAX_ALBUM_BYTES)return publicFailure('ALBUM_TOO_LARGE');
  if(!timingSafeEqual(Buffer.from(hash(source),'hex'),Buffer.from(review.sourceSha256,'hex')))
   return publicFailure('SOURCE_CHANGED_SINCE_REVIEW');
  const needsCopy=asset.owner===request.actorId;
  const destination=needsCopy?[
    request.coupleId,request.partnerId,'s32-synthetic-reviewed',
    request.moment.id,asset.kind+'-'+asset.id+'.bin'
   ].join('/'):asset.path;
  if(!safePath(destination,request.coupleId,needsCopy?request.partnerId:asset.owner))
   return publicFailure('DESTINATION_INVALID');
  validated.push({asset,source,destination,needsCopy});
 }
 // Simulated atomic transaction over byte maps. Even injected failure
 // cannot mutate the original in-memory store; no originals ever deleted.
 const working=store.snapshotForTest();
 let copies=0,reused=0,partnerFiles=0;
 for(let i=0;i<validated.length;i++){
  const {asset,source,destination,needsCopy}=validated[i];
  if(!needsCopy){
   partnerFiles++;
   continue; // Partner-owned original stays in place: DB FK issue STILL OPEN.
  }
  const existing=working.get(destination);
  if(existing){
   if(!timingSafeEqual(Buffer.from(hash(existing),'hex'),Buffer.from(hash(source),'hex')))
    return publicFailure('DESTINATION_COLLISION');
   reused++;
   continue;
  }
  if(fault?.failAtIndex===i)return publicFailure('INJECTED_TRANSFER_FAILURE');
  const copied=Buffer.from(source);
  if(fault?.corruptAtIndex===i&&copied.length)copied[0]^=0xff;
  working.set(destination,copied);
  const after=working.get(destination);
  if(!after||!timingSafeEqual(Buffer.from(hash(after),'hex'),Buffer.from(hash(source),'hex')))
   return publicFailure('DESTINATION_CHECKSUM_MISMATCH');
  copies++;
 }
 // The ONLY commit is into this synthetic Map. Not even cleanup of originals.
 store.commitForTest(working);
 return Object.freeze({
  status:'SYNTHETIC_COPY_VERIFIED_RELEASE_BLOCKED',
  executable:false,uploadedToSupabase:false,sourceDeleted:false,
  byteCopyCount:copies,alreadyCopiedCount:reused,
  verifiedObjectCount:validated.length,
  partnerOwnedOriginalCount:partnerFiles,
  databaseReferenceMigrationComplete:false,
  signedUrlRevocationComplete:false,
  expiryByteCleanupComplete:false,
  privacyRightsApprovedForRealUsers:false
 });
}
module.exports=Object.freeze({
 SyntheticObjectStore,makeSyntheticFixtureReview,rehearsePrivateMediaCopy
});
