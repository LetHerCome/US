// US S3.2: non-executable private Storage media inventory for an album.
// No IO, URLs, signed links, object copies/deletions, or raw paths in output.
'use strict';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const segment=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,179}$/;
const BLOCKED='BLOCKED_STORAGE_AND_PRIVACY_REVIEW';
const failure=code=>Object.freeze({status:BLOCKED,reason:code,executable:false,objectCount:0,departingOwned:0,partnerOwned:0,reviewNeeded:0});
const valid=id=>typeof id==='string'&&uuid.test(id);
function safePath(path,coupleId,ownerId){
 if(typeof path!=='string'||path.length>640||path.length<10||/[\\?#%&\x00-\x1F\x7F]/.test(path))return false;
 const parts=path.split('/');
 if(parts.length<3||parts.length>10||parts[0]!==coupleId||parts[1]!==ownerId)return false;
 return parts.slice(2).every(part=>part!=='.'&&part!=='..'&&segment.test(part));
}
function planPrivateMomentMedia(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))return failure('BAD_OR_UNAUTHORIZED_INPUT');
 const {actorId,partnerId,coupleId,moment,photos}=input;
 if(![actorId,partnerId,coupleId].every(valid)||actorId===partnerId
 || !moment||typeof moment!=='object'||moment.coupleId!==coupleId
 || !valid(moment.id)||!valid(moment.createdBy)
 || moment.createdBy!==actorId
 || !Array.isArray(photos)||photos.length>100)return failure('BAD_OR_UNAUTHORIZED_INPUT');
 const assets=[
  {kind:'momentOriginal',id:moment.id,owner:moment.createdBy,path:moment.storagePath},
  ...(moment.thumbnailPath?[{kind:'momentThumbnail',id:moment.id,owner:moment.createdBy,path:moment.thumbnailPath}]:[])
 ];
 const seenPhotos=new Set();
 for(const photo of photos){
  if(!photo||typeof photo!=='object'||!valid(photo.id)||!valid(photo.createdBy)||!valid(photo.momentId)
   ||photo.momentId!==moment.id||photo.coupleId!==coupleId||seenPhotos.has(photo.id)
   ||![actorId,partnerId].includes(photo.createdBy))return failure('BAD_OR_CROSS_COUPLE_PHOTO');
  seenPhotos.add(photo.id);
  assets.push({kind:'albumPhoto',id:photo.id,owner:photo.createdBy,path:photo.storagePath});
 }
 if(assets.length>102)return failure('TOO_MANY_ASSETS');
 const seenPaths=new Set();
 for(const item of assets){
  if(!safePath(item.path,coupleId,item.owner))return failure('PATH_REQUIRES_MANUAL_REVIEW');
  if(seenPaths.has(item.path))return failure('DUPLICATE_STORAGE_OBJECT');
  seenPaths.add(item.path);
 }
 return Object.freeze({
  status:BLOCKED,
  reason:'OBJECT_BYTES_NOT_VERIFIED_AND_RIGHTS_UNREVIEWED',
  executable:false,
  requiresVerifiedStorageCopy:true,
  requiresPerObjectRightsDecision:true,
  requiresSourceAndDestinationChecksum:true,
  requiresSignedUrlRevocationAndDeviceCacheReview:true,
  requiresPhysicalRetentionCleanup:true,
  objectCount:assets.length,
  departingOwned:assets.filter(a=>a.owner===actorId).length,
  partnerOwned:assets.filter(a=>a.owner===partnerId).length,
  reviewNeeded:assets.length,
  // No path/URL/email/token nor user/couple identifying value.
  assets:Object.freeze(assets.map(a=>Object.freeze({
   kind:a.kind,ownership:a.owner===actorId?'DEPARTING_MEMBER':'REMAINING_MEMBER',
   state:'BLOCKED_PENDING_VERIFIED_MEDIA_TRANSFER'
  })))
 });
}
module.exports=Object.freeze({planPrivateMomentMedia,safePath,BLOCKED});
