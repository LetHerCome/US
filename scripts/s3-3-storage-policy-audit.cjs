// US S3.3: Storage policy drift audit against a known STAGING baseline.
// Pure, NO network, JWT, Storage, database or modification capabilities.
// Checking all policies matters: permissive RLS policies combine via OR.
'use strict';
const expected = Object.freeze({
 us_media_select_same_couple:'SELECT',
 us_media_insert_own_folder:'INSERT',
 us_media_update_own:'UPDATE',
 us_media_delete_own:'DELETE'
});
// Exact SQL text is intentionally pinned: adding an OR TRUE clause must fail.
// Updating this allowlist requires explicit RLS security review, not just editing the JSON snapshot.
const expectedSql = Object.freeze({
  "us_media_delete_own": {
    "qual": "((bucket_id = 'us-media'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid)) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id)))",
    "with_check": ""
  },
  "us_media_insert_own_folder": {
    "qual": "",
    "with_check": "((bucket_id = 'us-media'::text) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id)) AND ((storage.foldername(name))[2] = ( SELECT (auth.uid())::text AS uid)))"
  },
  "us_media_select_same_couple": {
    "qual": "((bucket_id = 'us-media'::text) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id)))",
    "with_check": ""
  },
  "us_media_update_own": {
    "qual": "((bucket_id = 'us-media'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid)) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id)))",
    "with_check": "((bucket_id = 'us-media'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid)) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id)) AND ((storage.foldername(name))[2] = ( SELECT (auth.uid())::text AS uid)))"
  }
});
const blocked = reason => Object.freeze({status:'S33_STORAGE_POLICY_DRIFT_BLOCKED',reason,releaseReady:false,actualJwtProof:false});
const accepted = () => Object.freeze({status:'S33_STORAGE_POLICY_BASELINE_STABLE_NOT_LIVE_PROOF',policyCount:4,releaseReady:false,actualJwtProof:false});
const normalized = val => typeof val==='string'?val.replace(/\s+/g,' ').trim():'';
const hasFolder = (v,n) => v.includes('storage.foldername(name))['+n+']');
function checkStoragePolicies(policies){
 if(!Array.isArray(policies)||policies.length!==4)return blocked('STORAGE_POLICY_COUNT_CHANGED');
 const seen=new Set();
 for(const p of policies){
  if(!p||typeof p!=='object'||typeof p.policyname!=='string'
     ||!Object.hasOwn(expected,p.policyname)||seen.has(p.policyname))
   return blocked('UNEXPECTED_OR_DUPLICATE_POLICY');
  seen.add(p.policyname);
  if(p.cmd!==expected[p.policyname]||p.roles!=='{authenticated}'||p.permissive!=='PERMISSIVE')
   return blocked('COMMAND_ROLE_OR_MODE_DRIFT');
  const check=normalized(p.with_check),using=normalized(p.qual);
  if(using!==normalized(expectedSql[p.policyname].qual)
   ||check!==normalized(expectedSql[p.policyname].with_check))
   return blocked('POLICY_SQL_TEXT_CHANGED');
  const scope=p.cmd==='INSERT'?check:using;
  if(!scope.includes("bucket_id = 'us-media'::text")
    ||!scope.includes('private.current_couple_id()')
    ||!hasFolder(scope,1))
   return blocked('BUCKET_OR_COUPLE_SCOPING_MISSING');
  if(p.cmd==='SELECT'){
    if(check!=='')return blocked('UNEXPECTED_SELECT_CHECK');
  } else if(p.cmd==='INSERT'){
    if(using!==''||!hasFolder(check,2)||!check.includes('auth.uid()'))
     return blocked('UPLOADER_FOLDER_REQUIRED');
  } else if(p.cmd==='UPDATE'){
    if(!using.includes('owner_id =')||!using.includes('auth.uid()')
       ||!check.includes("bucket_id = 'us-media'::text")
       ||!check.includes('owner_id =')||!check.includes('auth.uid()')
       ||!check.includes('private.current_couple_id()')
       ||!hasFolder(check,1)||!hasFolder(check,2))
     return blocked('UPDATE_OWNER_AND_FOLDER_REQUIRED');
  } else if(p.cmd==='DELETE'){
    if(check!==''||!using.includes('owner_id =')||!using.includes('auth.uid()'))
     return blocked('DELETE_MUST_REQUIRE_OWNER');
  }
 }
 if(seen.size!==4)return blocked('MISSING_REQUIRED_POLICY');
 return accepted();
}
function checkBaselineDocument(snapshot){
 if(!snapshot||snapshot.schemaVersion!==1||snapshot.project!=='dugmhngrfkuieeletatb'
  ||snapshot.environment!=='US-STAGING'||snapshot.readonly!==true)
  return blocked('INVALID_POLICY_BASELINE_DOCUMENT');
 return checkStoragePolicies(snapshot.policies);
}
module.exports=Object.freeze({checkStoragePolicies,checkBaselineDocument});
