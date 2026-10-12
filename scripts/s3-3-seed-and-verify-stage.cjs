// US Store S3.3: explicit opt-in, STAGING-only synthetic Storage fixtures and live GET gate.
// Requires four pre-existing independently approved synthetic QA accounts in two couples.
// Never creates users, changes database records, overwrites/deletes objects, or contacts production.
'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const {STAGING,BUCKET,ACTORS,makePlan,runPlan}=require('./s3-3-storage-jwt-readonly.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{12,}$/;
const FIXTURE_MOMENT='33333333-3333-4333-8333-333333333333';
const PARTNERS=Object.freeze({A1:'A2',A2:'A1',B1:'B2',B2:'B1'});
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxyQAAAAASUVORK5CYII=','base64');
function block(reason){throw Error('S33_SEED_BLOCKED_'+reason);}
function validateConfig(env){
 if(!env||env.US_S33_SEED_CONFIRM!=='US_S33_SYNTHETIC_STAGE_ONLY'
    ||env.US_S33_QA_ATTESTATION!=='FOUR_INDEPENDENT_SYNTHETIC_QA_ACCOUNTS'
    ||typeof env.US_S33_STAGING_PUBLISHABLE_KEY!=='string'
    ||!PUB.test(env.US_S33_STAGING_PUBLISHABLE_KEY))block('EXPLICIT_STAGING_APPROVAL_REQUIRED');
 const accounts={};
 for(const actor of ACTORS){
  const email=env['US_S33_'+actor+'_EMAIL'];
  const password=env['US_S33_'+actor+'_PASSWORD'];
  if(typeof email!=='string'||!/^[-+._a-z0-9]+@[-.a-z0-9]+\.[a-z]{2,}$/i.test(email)
     ||email.length>254||typeof password!=='string'||password.length<8||password.length>2048)
    block('FOUR_PRIVATE_QA_LOGINS_REQUIRED');
  accounts[actor]={email,password};
 }
 if(new Set(ACTORS.map(a=>accounts[a].email.toLowerCase())).size!==4)
   block('QA_EMAIL_IDENTITIES_NOT_DISTINCT');
 return {apikey:env.US_S33_STAGING_PUBLISHABLE_KEY,accounts};
}
function sha(buf){return createHash('sha256').update(buf).digest();}
function equalBytes(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length!==PIXEL.length)return false;
 return timingSafeEqual(sha(bytes),sha(PIXEL));
}
function isCollision(error){
 const status=String(error?.statusCode||error?.status||'');
 const message=String(error?.message||'');
 return (status==='400'||status==='409') && /already exists|duplicate|resource exists/i.test(message);
}
async function verifyFixtureReadback(bucket,path,readbackKind){
 // Both the uploader and their confirmed partner must receive the canonical QA bytes.
 // A successful PUT or HTTP 200 on its own is NOT a byte-integrity proof.
 const prefix=readbackKind==='partner'?'QA_PARTNER_OBJECT':
   readbackKind==='reuse'?'QA_EXISTING_OBJECT':'QA_UPLOADED_OBJECT';
 const existing=await bucket.download(path);
 if(existing?.error||!existing?.data||typeof existing.data.arrayBuffer!=='function')
   block(prefix+'_UNREADABLE');
 // Reject unexpectedly large objects before allocating another buffer when Blob.size exists.
 if(typeof existing.data.size==='number'&&existing.data.size>256)
   block(prefix+'_NOT_IDENTICAL');
 let bytes;
 try{bytes=Buffer.from(await existing.data.arrayBuffer());}
 catch{block(prefix+'_UNREADABLE');}
 if(bytes.length>256||!equalBytes(bytes))block(prefix+'_NOT_IDENTICAL');
}
async function prepareAndVerify(config,{createClientImpl,runPlanImpl=runPlan}={}){
 if(!config||typeof createClientImpl!=='function'||typeof runPlanImpl!=='function')block('RUNNER_MISSING');
 // Fresh local validation even for imported callers; only narrowly shaped credentials.
 const env={US_S33_SEED_CONFIRM:'US_S33_SYNTHETIC_STAGE_ONLY',
  US_S33_QA_ATTESTATION:'FOUR_INDEPENDENT_SYNTHETIC_QA_ACCOUNTS',
  US_S33_STAGING_PUBLISHABLE_KEY:config.apikey};
 for(const actor of ACTORS){
  env['US_S33_'+actor+'_EMAIL']=config.accounts?.[actor]?.email;
  env['US_S33_'+actor+'_PASSWORD']=config.accounts?.[actor]?.password;
 }
 config=validateConfig(env);
 const clients={},accounts={};
 // All four independent Auth identities and RLS-visible memberships MUST validate before any upload.
 for(const actor of ACTORS){
  const client=createClientImpl(STAGING,config.apikey,
   {auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  if(!client?.auth?.signInWithPassword||!client?.auth?.getUser||!client?.from||!client?.storage?.from)
    block('INVALID_CLIENT');
  clients[actor]=client;
  const {data:login,error:loginError}=await client.auth.signInWithPassword(config.accounts[actor]);
  if(loginError||!login?.session?.access_token)block('QA_LOGIN_FAILED');
  const jwt=login.session.access_token;
  const {data:identity,error:whoError}=await client.auth.getUser();
  const user=identity?.user;
  if(whoError||!user||!UUID.test(user.id||'')||!user.email_confirmed_at
     ||String(user.email||'').toLowerCase()!==config.accounts[actor].email.toLowerCase()
     ||login.user?.id!==user.id)block('QA_AUTH_IDENTITY_UNVERIFIED');
  const {data:member,error:memberError}=await client.from('profiles')
    .select('id,couple_id').eq('id',user.id).single();
  if(memberError||member?.id!==user.id||!UUID.test(member.couple_id||''))
    block('QA_COUPLE_MEMBERSHIP_UNVERIFIED');
  const file=BUCKET+'/'+member.couple_id+'/'+user.id+'/moment-albums/'+FIXTURE_MOMENT
    +'/s33-qa-'+actor.toLowerCase()+'-v1.png';
  // Paths are derived exclusively from Auth + RLS membership, never from caller-supplied paths.
  accounts[actor]={jwt,path:file.slice(BUCKET.length+1)};
 }
 const plan=makePlan({confirm:'US_S33_READ_ONLY_STAGE',apikey:config.apikey,accounts});
 let created=0,reused=0,remoteFixtureBytesVerified=0,partnerFixtureBytesVerified=0;
 for(const actor of ACTORS){
  const bucket=clients[actor].storage.from(BUCKET);
  const path=plan.accounts[actor].path;
  const {error}=await bucket.upload(path,Buffer.from(PIXEL),
   {contentType:'image/png',upsert:false,cacheControl:'0'});
  if(!error){
   // A successful PUT is not proof that the object can be read back intact.
   await verifyFixtureReadback(bucket,path,'fresh');
   remoteFixtureBytesVerified++;
   created++;
   continue;
  }
  // Never use upsert. Only an exact synthetic byte-for-byte collision may be reused.
  if(!isCollision(error))block('QA_UPLOAD_DENIED_OR_FAILED');
  await verifyFixtureReadback(bucket,path,'reuse');
  remoteFixtureBytesVerified++;
  reused++;
 }
 if(remoteFixtureBytesVerified!==4)block('REMOTE_SHA256_READBACK_INCOMPLETE');
 // Verify all four files a SECOND time using the actual other member's independent JWT.
 // This proves couple-member GET returns identical bytes, not merely a success code.
 // It is not a copy/transfer test and cannot replace the 24-case isolation matrix.
 for(const actor of ACTORS){
  const partner=PARTNERS[actor];
  if(!partner||plan.accounts[actor].couple!==plan.accounts[partner].couple)
   block('PARTNER_COUPLE_MAPPING_MISMATCH');
  await verifyFixtureReadback(clients[partner].storage.from(BUCKET),
    plan.accounts[actor].path,'partner');
  partnerFixtureBytesVerified++;
 }
 if(partnerFixtureBytesVerified!==4)block('PARTNER_SHA256_READBACK_INCOMPLETE');
 // This uses the original independent 4 Auth / 24 GET-only matrix, not mocked in production.
 const verified=await runPlanImpl(plan);
 if(verified?.status!=='S33_READONLY_JWT_MATRIX_PASS'
    ||verified.checked!==24||verified.authVerified!==4
    ||verified.expectedAllow!==8||verified.expectedDeny!==16)
   block('LIVE_GET_MATRIX_NOT_VERIFIED');
 return Object.freeze({
  status:'S33_STAGE_FIXTURES_AND_READONLY_MATRIX_PASS',
  stage:'US-STAGING',created,reused,remoteFixtureBytesVerified,partnerFixtureBytesVerified,
  authVerified:4,checked:24,
  expectedAllow:8,expectedDeny:16,filesDeleted:0,overwrites:0,
  accountDeletionEnabled:false,productionChanged:false,
  storageOwnerSqlAuditStillRequired:true
 });
}
if(require.main===module){
 // Only opt-in, never in CI. Credentials and JWTs are never printed, written or passed as CLI args.
 try{
  const {createClient}=require('@supabase/supabase-js');
  prepareAndVerify(validateConfig(process.env),{createClientImpl:createClient})
   .then(result=>process.stdout.write(JSON.stringify(result)+'\n'))
   .catch(()=>{process.stderr.write('S33 STAGING fixture+JWT gate BLOCKED/FAILED; no private details printed\n');process.exitCode=1;});
 }catch{
  process.stderr.write('S33 STAGING fixture+JWT gate BLOCKED/FAILED; no private details printed\n');
  process.exitCode=1;
 }
}
module.exports=Object.freeze({validateConfig,prepareAndVerify,equalBytes,isCollision,FIXTURE_MOMENT});
