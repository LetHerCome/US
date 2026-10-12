// US Store S3.3: opt-in read-only real-JWT Storage access check. US-STAGING ONLY.
// No login, account creation, object list/upload/copy/delete, signed links or file persistence.
// Requires four existing synthetic-account JWTs and four existing synthetic Storage objects.
'use strict';
const STAGING='https://dugmhngrfkuieeletatb.supabase.co';
const BUCKET='us-media';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEG=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,179}$/;
const ACTORS=['A1','A2','B1','B2'];
const denyStatus=status=>[400,401,403,404].includes(status);
function stop(reason){throw Error('S33_BLOCKED_'+reason);}
function parseJwt(token){
 if(typeof token!=='string'||token.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))stop('INVALID_JWT');
 let claims;
 try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}
 catch{stop('INVALID_JWT');}
 if(!claims||claims.role!=='authenticated'||!UUID.test(claims.sub||'')
   ||typeof claims.exp!=='number'||claims.exp<=Math.floor(Date.now()/1000)+120)stop('INVALID_JWT_CLAIMS');
 // Parsed claims are only fixture guards. Supabase itself must verify JWT signatures.
 return claims.sub;
}
function validatePath(path,userId){
 if(typeof path!=='string'||path.length>640||/[\\?#%&\x00-\x1F\x7F]/.test(path))stop('UNSAFE_FIXTURE_PATH');
 const parts=path.split('/');
 if(parts.length<4||parts.length>10||!UUID.test(parts[0])||parts[1]!==userId
   ||parts.slice(2).some(s=>s==='.'||s==='..'||!SEG.test(s)))stop('UNSAFE_FIXTURE_PATH');
 return parts[0];
}
function makePlan(input){
 if(!input||input.confirm!=='US_S33_READ_ONLY_STAGE'
   ||typeof input.apikey!=='string'||input.apikey.length<12
   ||input.apikey.startsWith('sb_secret_'))stop('STAGING_CONFIRMATION_OR_KEY_MISSING');
 const accounts={};
 for(const id of ACTORS){
  const conf=input.accounts?.[id];
  if(!conf)stop('FOUR_FIXTURE_IDENTITIES_REQUIRED');
  const sub=parseJwt(conf.jwt),couple=validatePath(conf.path,sub);
  accounts[id]={id,sub,couple,jwt:conf.jwt,path:conf.path};
 }
 if(new Set(ACTORS.map(id=>accounts[id].sub)).size!==4)stop('REUSED_JWT_IDENTITY');
 if(accounts.A1.couple!==accounts.A2.couple||accounts.B1.couple!==accounts.B2.couple
   ||accounts.A1.couple===accounts.B1.couple)stop('INVALID_TWO_COUPLE_FIXTURES');
 if(new Set(ACTORS.map(id=>accounts[id].path)).size!==4)stop('REUSED_FIXTURE_PATH');
 const checks=[];
 for(const viewer of ACTORS)for(const object of ACTORS)
  checks.push({viewer,object,allow:accounts[viewer].couple===accounts[object].couple,type:'jwt'});
 for(const object of ACTORS){
  checks.push({viewer:'ANON',object,allow:false,type:'anonymous'});
  checks.push({viewer:'PUBLIC',object,allow:false,type:'public'});
 }
 return {apikey:input.apikey,accounts,checks};
}
async function runPlan(plan,{fetchImpl=globalThis.fetch,timeoutMs=7000}={}){
 if(typeof fetchImpl!=='function')stop('FETCH_UNAVAILABLE');
 if(!plan||!Array.isArray(plan.checks)||plan.checks.length!==24)stop('INVALID_PLAN');
 let allowCount=0,denyCount=0;
 for(const check of plan.checks){
  const root=check.type==='public'?'public':'authenticated';
  const url=STAGING+'/storage/v1/object/'+root+'/'+BUCKET+'/'+plan.accounts[check.object].path;
  const headers={apikey:plan.apikey,'cache-control':'no-store'};
  if(check.type==='jwt')headers.authorization='Bearer '+plan.accounts[check.viewer].jwt;
  const response=await fetchImpl(url,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(timeoutMs)});
  // No response body is read, logged or persisted, including synthetic object bytes.
  await response.body?.cancel();
  if(check.allow){
   if(response.status!==200)stop('ACCESS_MATRIX_MISMATCH');
   allowCount++;
  }else{
   if(!denyStatus(response.status))stop('ACCESS_MATRIX_MISMATCH');
   denyCount++;
  }
 }
 return Object.freeze({
  status:'S33_READONLY_JWT_MATRIX_PASS',stage:'US-STAGING',
  checked:allowCount+denyCount,expectedAllow:allowCount,expectedDeny:denyCount,
  filesWritten:0,filesDeleted:0,bytesDownloadedToDisk:0,
  deletionEnabled:false,referenceMigrationComplete:false
 });
}
function loadFromEnv(env){
 const accounts={};
 for(const id of ACTORS)accounts[id]={jwt:env['US_S33_'+id+'_JWT'],path:env['US_S33_'+id+'_OBJECT_PATH']};
 return {confirm:env.US_S33_READONLY_CONFIRM,apikey:env.US_S33_STAGING_PUBLISHABLE_KEY,accounts};
}
if(require.main===module){
 // An unset fixture MUST fail. Never claim a real JWT check passed due to skipped tests.
 runPlan(makePlan(loadFromEnv(process.env)))
  .then(result=>process.stdout.write(JSON.stringify(result)+'\n'))
  .catch(()=>{process.stderr.write('S33 live read-only check BLOCKED/FAILED (no secrets or paths printed)\n');process.exitCode=1;});
}
module.exports=Object.freeze({STAGING,BUCKET,ACTORS,makePlan,runPlan,loadFromEnv});
