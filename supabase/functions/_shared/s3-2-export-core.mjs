import {EXPORT_PAGE_LIMIT} from './s3-2-export-paging.mjs';
// US Store S3.2 — non-destructive first-stage personal export contract.
//
// PURE module, suitable for Node tests and Deno Edge. No client/DB/Storage
// access. The service layer MUST verify bearer identity and current couple
// membership using a user-scoped RLS Supabase client, never a service_role key.
//
// This is NOT a full Article 15 or data portability fulfillment yet:
// excludes other member's contributions, shared-history dispute handling,
// binary files, and additional feature domains pending legal/data review.

export const EXPORT_VERSION = 1;
export const MAX_ROWS_PER_DOMAIN = EXPORT_PAGE_LIMIT;
export const MAX_RESPONSE_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^(?:[a-z][a-z0-9_]{0,64})$/;
const PRIVATE_MEDIA_FIELDS = new Set(['storage_path','thumbnail_path','media_path','avatar_path']);

// All entries require owner proof and couple equality unless tenant=false.
// Tokens, password hashes, invitations and partner-only contributions never
// appear in these columns. Adding a new domain requires a security review.
const definitions = [
 ['profiles','id','id,couple_id,display_name,role,created_at,avatar_path',true],
 ['moods','user_id','id,couple_id,user_id,mood,note,mood_date,created_at',true],
 ['daily_answers','user_id','id,couple_id,user_id,question_id,answer,created_at,updated_at,server_answered_at',true],
 ['quiz_responses','user_id','id,couple_id,user_id,set_id,question_id,answer_index,created_at,updated_at,week_start',true],
 ['calendar_entries','created_by','id,couple_id,entry_type,owner_id,created_by,title,description,location,is_all_day,starts_at,ends_at,start_date,end_date,created_at,updated_at',true],
 ['moments','created_by','id,couple_id,created_by,storage_path,thumbnail_path,caption,moment_date,created_at,place_lat,place_lon,place_label,place_source',true],
 ['moment_photos','created_by','id,couple_id,moment_id,created_by,storage_path,caption,position,created_at',true],
 ['shared_events','created_by','id,couple_id,created_by,title,event_date,event_time,location,note,recurs_yearly,created_at,updated_at',true],
 ['bucket_items','created_by','id,couple_id,created_by,title,note,status,completed,completed_at,created_at,updated_at',true],
 ['shared_messages','sender_id','id,couple_id,sender_id,recipient_id,kind,title,body,unlock_at,opened_at,created_at',true],
 ['left_for_you','sender_id','id,couple_id,sender_id,recipient_id,kind,body,media_path,created_at',true],
 ['stories','author_id','id,couple_id,author_id,media_path,caption,duration_seconds,created_at,expires_at',true],
 ['notification_preferences','user_id','user_id,think,today,bond,relationship,left_for_you,games,updated_at',false],
];
export const EXPORT_DOMAINS = Object.freeze(definitions.map(([table,owner,cols,tenant])=>{
 const fields=Object.freeze(cols.split(','));
 if(!IDENTIFIER.test(table) || !IDENTIFIER.test(owner) || fields.some(f=>!IDENTIFIER.test(f)))throw new Error('invalid_export_config');
 return Object.freeze({table,owner,tenant,select:cols,fields});
}));
const domainByName = Object.freeze(Object.fromEntries(EXPORT_DOMAINS.map(x=>[x.table,x])));

const fail = code => {
 const err=new Error(code);
 err.code=code;
 return err;
};
const validUuid=value=>typeof value==='string'&&UUID.test(value);
const ownOrSharedAvatar=(key,value)=>{
 // Media paths are never included in the JSON snapshot. The metadata
 // row may be exported, but Storage bytes are an entirely separate,
 // authenticated and rights-reviewed export flow.
 if(PRIVATE_MEDIA_FIELDS.has(key))return undefined;
 return value;
};
const asSafeRecord=(row,def,ownerId,coupleId)=>{
 if(!row||typeof row!=='object'||Array.isArray(row))throw fail('export_record_invalid');
 if(row[def.owner]!==ownerId)throw fail('export_owner_mismatch');
 if(def.tenant&&row.couple_id!==coupleId)throw fail('export_tenant_mismatch');
 const out={};
 for(const key of def.fields){
   if(PRIVATE_MEDIA_FIELDS.has(key))continue;
   if(!Object.prototype.hasOwnProperty.call(row,key))throw fail('export_missing_required_field');
   const value=ownOrSharedAvatar(key,row[key]);
   // primitive/nullable values only; no opaque nested metadata/credentials
   if(value!==null&&!['string','number','boolean'].includes(typeof value))throw fail('export_unexpected_field_type');
   out[key]=value;
 }
 return out;
};

export function buildPersonalExport({ownerId,coupleId,email,profile,rowsByDomain,generatedAt}={}){
 if(!validUuid(ownerId)||!validUuid(coupleId)||!profile||profile.id!==ownerId||profile.couple_id!==coupleId)throw fail('export_identity_invalid');
 if(typeof email!=='string'||email.length>254||!email.includes('@'))throw fail('export_email_invalid');
 if(typeof generatedAt!=='string'||!Number.isFinite(Date.parse(generatedAt)))throw fail('export_timestamp_invalid');
 if(!rowsByDomain||typeof rowsByDomain!=='object'||Array.isArray(rowsByDomain))throw fail('export_domains_missing');
 const data={};
 for(const def of EXPORT_DOMAINS){
  const records=rowsByDomain[def.table];
  if(!Array.isArray(records))throw fail('export_domain_missing');
  if(records.length>MAX_ROWS_PER_DOMAIN)throw fail('export_too_large');
  data[def.table]=records.map(row=>asSafeRecord(row,def,ownerId,coupleId));
 }
 const result={
  schemaVersion:EXPORT_VERSION,
  scope:'SELF_AUTHORED_FIRST_STAGE',
  completeness:'PARTIAL_PENDING_SHARED_RIGHTS_MEDIA_AND_OTHER_DOMAINS',
  generatedAt,
  account:{id:ownerId,email},
  data,
  exclusions:[
   'other_partner_personal_data',
   'partner_authored_or_unreviewed_shared_content',
   'media_binary_and_download_urls',
   'location_precise_history',
   'raw_device_tokens_sessions_invites_passwords',
   'additional_feature_domains_pending_inventory'
  ],
  mediaBinaryIncluded:false,
  executableDeletion:false,
 };
 const json=JSON.stringify(result);
 if(new TextEncoder().encode(json).byteLength>MAX_RESPONSE_BYTES)throw fail('export_too_large');
 return Object.freeze(result);
}

export function classifyExportError(error){
 const code=error?.code;
 return code==='export_too_large'?'EXPORT_TOO_LARGE':
   code==='export_identity_invalid'||code==='export_owner_mismatch'||code==='export_tenant_mismatch'?'NOT_AUTHORIZED':
   'EXPORT_UNAVAILABLE';
}
