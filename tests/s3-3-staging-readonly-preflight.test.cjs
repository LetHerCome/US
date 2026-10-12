// US S3.3: SQL readiness query must stay aggregate-only and incapable of mutation.
// Static contract test: does not contact or authenticate to Supabase.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../docs/missions/us-store-s3-3-staging-readonly-preflight-20261012.sql'),'utf8');

test('STAGING SQL read-only preflight has one aggregate SELECT and never authorizes erasure',()=>{
 const sql=source.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''").trim();
 assert.match(sql,/^WITH\s+pair_counts\s+AS\s*\(/i);
 assert.match(sql,/\)\s*SELECT\s+[\s\S]*;$/i);
 assert.equal((sql.match(/;/g)||[]).length,1,'exactly one SQL statement');
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT|REVOKE|COPY|EXECUTE|CALL|DO|MERGE|VACUUM|SET|RESET)\b/i);
 assert.match(source,/dugmhngrfkuieeletatb/);
 assert.match(source,/NOT_RUN_REQUIRES_4_INDEPENDENT_JWTS_AND_24_GET_PROOFS/);
 assert.match(source,/false AS deletion_authorized/);
 assert.match(source,/count\(DISTINCT owner_id\)/);
 assert.match(source,/count\(DISTINCT couple_folder\)/);
 assert.match(source,/email_confirmed_at/);
 assert.match(source,/o\.owner_id/);
 assert.match(source,/p\.couple_id::text = split_part/);
 assert.match(source,/storage\.buckets WHERE id = 'us-media' AND public = false/);
 assert.match(source,/unexpected_policies/);
 assert.match(source,/unexpected_roles_or_modes/);
 assert.match(source,/all_storage_object_policies/);
 assert.match(source,/extra_storage_object_policies/);
 assert.match(source,/policy_metadata_matches_expected_shape/);
 assert.doesNotMatch(source,/eyJ[A-Za-z0-9_-]{32,}|sb_secret_[A-Za-z0-9_-]{12,}/);
});
