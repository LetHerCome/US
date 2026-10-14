// S3.1 public Auth screens — stage-only until reviewed and authorized.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S31 = require('../public-auth.js');
const read = p => fs.readFileSync(path.resolve(__dirname,'..',p), 'utf8');
const USER_EMAIL = 'someone+test@example.invalid';
const SAMPLE_PASSWORD = 'A-safe-passphrase-17';

const STAGE_URL='https://dugmhngrfkuieeletatb.supabase.co';
// The module exactly as the US-STAGING preview ships it.
async function stagedModule() {
  const {isolateStagingPublicAuth}=await import('../scripts/build-s31-staging-preview.mjs');
  const mod={exports:{}};
  new Function('module','window',isolateStagingPublicAuth(read('public-auth.js')))(mod,undefined);
  return mod.exports;
}

function fakeAuth() {
  const calls=[];
  const auth={
    calls,
    signUp: async x=>{calls.push(['signUp', x]);return {data:{user:{id:'synthetic'},session:null},error:null};},
    resend: async x=>{calls.push(['resend',x]);return {error:null};},
    resetPasswordForEmail: async x=>{calls.push(['resetPasswordForEmail',x]);return {error:null};},
    updateUser: async x=>{calls.push(['updateUser',x]);return {error:null};},
    signOut: async x=>{calls.push(['signOut',x]);return {error:null};},
  };
  return auth;
}

test('stage gate rejects production, lookalike origins and non-Supabase URL',async()=>{
  // Committed source (production web and Android): no US-STAGING reference at all.
  assert.doesNotMatch(read('public-auth.js'),/dugmhngrfkuieeletatb/);
  assert.equal(S31.isStagingEndpoint(STAGE_URL),false);
  const staged=await stagedModule();
  assert.equal(staged.isStagingEndpoint(STAGE_URL),true);
  for(const host of [
    'https://iiakdfsxpywdkxravqjh.supabase.co',
    'https://dugmhngrfkuieeletatb.supabase.co.evil.tld',
    'http://dugmhngrfkuieeletatb.supabase.co',
    'https://evil.tld/dugmhngrfkuieeletatb.supabase.co', ''
  ])assert.equal(staged.isStagingEndpoint(host),false);
  const {isolateStagingPublicAuth}=await import('../scripts/build-s31-staging-preview.mjs');
  assert.throws(()=>isolateStagingPublicAuth(isolateStagingPublicAuth(read('public-auth.js'))),'never apply stage rewrite twice');
  const mounted=S31.mount({auth:fakeAuth(),endpoint:'https://iiakdfsxpywdkxravqjh.supabase.co',
    openStep:()=>{throw Error('production must never mount signup UI');},document:{}});
  assert.equal(mounted,null);
  const app=read('app.js');
  assert.match(app,/UsPublicAuthS31\?\.mount\(/);
  assert.match(app,/endpoint: SB_URL/);
  assert.match(app,/event==='PASSWORD_RECOVERY'/);
  assert.match(app,/if\(window\.usS31Auth\?\.recoveryActive\)/);
});

test('registration validates credentials locally before any provider call',async()=>{
  const auth=fakeAuth(),ctrl=S31.createController({auth});
  assert.equal((await ctrl.register({email:USER_EMAIL,password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD})).ok,false);
  ctrl.navigate('signup');
  assert.equal((await ctrl.register({email:'not-an-email',password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD})).ok,false);
  assert.equal((await ctrl.register({email:USER_EMAIL,password:'short',confirm:'short'})).ok,false);
  assert.equal((await ctrl.register({email:USER_EMAIL,password:SAMPLE_PASSWORD,confirm:'mismatch'})).ok,false);
  assert.equal(auth.calls.length,0);
  assert.equal(S31.passwordValid('a'.repeat(73)),false);
  assert.equal(S31.passwordValid('a'.repeat(10)),true);
});

test('successful register remains unpaired until verified login and never records a password',async()=>{
  const auth=fakeAuth(),states=[],ctrl=S31.createController({auth,onChange:s=>states.push(s)});
  ctrl.navigate('signup');
  const result=await ctrl.register({email:'  SOMEONE+test@example.invalid ',password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD});
  assert.equal(result.ok,true);
  assert.equal(ctrl.state.mode,'verify');
  assert.equal(ctrl.state.kind,'success');
  assert.match(ctrl.state.message,/istruzioni/);
  assert.equal(auth.calls[0][1].email,USER_EMAIL);
  assert.equal(auth.calls[0][1].password,SAMPLE_PASSWORD);
  assert.equal(JSON.stringify(states).includes(SAMPLE_PASSWORD),false);
  await ctrl.resend();
  assert.deepEqual(auth.calls[1],['resend',{type:'signup',email:USER_EMAIL}]);
  ctrl.navigate('login');
  assert.equal((await ctrl.resend()).ok,false);
});

test('duplicate-email provider response is not echoed as an account existence disclosure',async()=>{
  const auth=fakeAuth();
  auth.signUp=async x=>{auth.calls.push(['signUp',x]);return {data:{},error:{code:'user_already_exists',message:'User already registered'}};};
  const ctrl=S31.createController({auth});ctrl.navigate('signup');
  await ctrl.register({email:USER_EMAIL,password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD});
  assert.equal(ctrl.state.message.includes('User already registered'),false);
  assert.equal(ctrl.state.message.includes(USER_EMAIL),false);
  assert.equal(ctrl.state.mode,'verify','duplicate email must not be distinguishable from signup success');
  assert.equal(ctrl.state.kind,'success');
});

test('password recovery missing account receives same neutral message as an existing account',async()=>{
  const auth=fakeAuth();
  auth.resetPasswordForEmail=async()=>({error:{code:'user_not_found',message:'email not found'}});
  const ctrl=S31.createController({auth});
  ctrl.navigate('forgot');
  const result=await ctrl.forgot(USER_EMAIL);
  assert.equal(result.ok,true);
  assert.equal(ctrl.state.kind,'success');
  assert.equal(ctrl.state.message.includes('not found'),false);
});

test('provider disabled email confirmations: explicitly reject immediately authenticated signup',async()=>{
  const auth=fakeAuth();auth.signUp=async()=>({data:{session:{access_token:'synthetic'}},error:null});
  const ctrl=S31.createController({auth});ctrl.navigate('signup');
  const result=await ctrl.register({email:USER_EMAIL,password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD});
  assert.equal(result.ok,false);
  assert.equal(result.kind,'confirmation_required');
  assert.equal(auth.calls[0][0],'signOut');
  assert.equal(ctrl.state.mode,'signup');
});

test('a pending registration is single-flight and cannot commit after account reset',async()=>{
  const auth=fakeAuth();let resolve;
  auth.signUp=()=>new Promise(r=>{resolve=r;});
  const ctrl=S31.createController({auth});ctrl.navigate('signup');
  const attempt=ctrl.register({email:USER_EMAIL,password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD});
  assert.equal((await ctrl.register({email:USER_EMAIL,password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD})).kind,'busy');
  ctrl.reset();
  resolve({data:{session:null,user:{id:'synthetic'}},error:null});
  assert.equal((await attempt).kind,'stale');
  assert.equal(ctrl.state.mode,'login');
});

test('password recovery emails are generic and do not open a private session',async()=>{
  const auth=fakeAuth(),ctrl=S31.createController({auth});ctrl.navigate('forgot');
  const result=await ctrl.forgot(USER_EMAIL);
  assert.equal(result.ok,true);
  assert.deepEqual(auth.calls[0],['resetPasswordForEmail',USER_EMAIL]);
  assert.equal(ctrl.state.mode,'forgot');
  assert.equal(JSON.stringify(ctrl.state).includes(USER_EMAIL),false);
  assert.equal((await ctrl.completeRecovery({password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD})).kind,'recovery_not_authorized');
  assert.equal(auth.calls.filter(x=>x[0]==='updateUser').length,0);
});

test('recovery token must be represented by Supabase PASSWORD_RECOVERY event, then update and sign out',async()=>{
  const auth=fakeAuth(),ctrl=S31.createController({auth});
  ctrl.onRecoverySession();
  assert.equal(ctrl.state.recoveryActive,true);
  assert.equal(ctrl.state.mode,'new-password');
  assert.equal((await ctrl.completeRecovery({password:'x',confirm:'x'})).ok,false);
  assert.equal((await ctrl.completeRecovery({password:SAMPLE_PASSWORD,confirm:'wrong'})).ok,false);
  const result=await ctrl.completeRecovery({password:SAMPLE_PASSWORD,confirm:SAMPLE_PASSWORD});
  assert.equal(result.ok,true);
  assert.deepEqual(auth.calls.map(x=>x[0]),['updateUser','signOut']);
  assert.equal(ctrl.state.recoveryActive,false);
  assert.equal(ctrl.state.mode,'login');
});

test('S3.1 isolated preview switches only browser backend and Auth storage, never production source',async()=>{
  const {isolateStagingPreview} = await import('../scripts/build-s31-staging-preview.mjs');
  const fakeKey='sb_publishable_'+'A'.repeat(36);
  const prodApp=read('app.js'),prodIndex=read('index.html');
  const out=isolateStagingPreview(prodApp,prodIndex,fakeKey);
  assert.equal(out.app.includes("const SB_URL = 'https://dugmhngrfkuieeletatb.supabase.co';"),true);
  assert.equal(out.app.includes("'sb-dugmhngrfkuieeletatb-auth-token'"),true);
  assert.equal(out.app.includes('iiakdfsxpywdkxravqjh'),false);
  assert.equal(out.index.includes('iiakdfsxpywdkxravqjh'),false);
  assert.ok(out.index.includes('dugmhngrfkuieeletatb.supabase.co'));
  assert.ok(prodApp.includes('iiakdfsxpywdkxravqjh'), 'production source is unchanged');
  assert.throws(()=>isolateStagingPreview(prodApp,prodIndex,'service_role_abc'));
  assert.throws(()=>isolateStagingPreview(out.app,out.index,fakeKey),'never apply stage rewrite twice');
});

test('both target build bundles include every new source asset and staged inputs stay isolated',()=>{
  const index=read('index.html'),capacitor=read('scripts/build-capacitor-web.mjs'),web=read('scripts/build-cloudflare-pages.mjs');
  for(const name of ['public-auth.js','public-auth.css']) {
    assert.match(index,new RegExp(name.replace('.','\\.')));
    assert.ok(capacitor.includes("'"+name+"'"),'Capacitor missing '+name);
    assert.ok(web.includes("'"+name+"'"),'Cloudflare missing '+name);
  }
  for(const id of ['usSignup','usVerifyEmail','usForgotPassword','usRecovery','usPublicAuthActions']) {
    assert.ok(index.includes('id="'+id+'"'));
  }
  assert.match(read('app.js'), /const SB_URL = 'https:\/\/iiakdfsxpywdkxravqjh\.supabase\.co'/);
  assert.doesNotMatch(read('public-auth.js'), /service.role|secret.key|localStorage|sessionStorage/i);
});

test('production signup is a single explicit release switch, OFF in committed source',async()=>{
  // Flipping PRODUCTION_SIGNUP_RELEASED is a founder release decision: it must
  // change this assertion together with docs/store/US_S3_1_PRODUCTION_AUTH_RELEASE.md.
  assert.equal(S31.PRODUCTION_SIGNUP_RELEASED,false);
  const prod='https://iiakdfsxpywdkxravqjh.supabase.co',stage='https://dugmhngrfkuieeletatb.supabase.co';
  assert.equal(S31.publicAuthEnabled(prod),false);
  assert.equal(S31.publicAuthEnabled(stage),false,'committed source shows signup nowhere');
  assert.equal((await stagedModule()).publicAuthEnabled(stage),true,'the US-STAGING preview shows it');
  assert.equal(S31.publicAuthEnabled(prod,true),true,'released build shows signup on production');
  for(const host of ['https://iiakdfsxpywdkxravqjh.supabase.co.evil.tld','http://iiakdfsxpywdkxravqjh.supabase.co','https://evil.tld',''])
    assert.equal(S31.publicAuthEnabled(host,true),false);
  assert.equal(S31.publicAuthEnabled(prod,'true'),false,'only a real boolean releases');
  const doc=read('docs/store/US_S3_1_PRODUCTION_AUTH_RELEASE.md');
  assert.match(doc,/PRODUCTION_SIGNUP_RELEASED/);
  assert.match(doc,/enable_signup/);
});

test('password policy is identical in the controller, the forms and the release checklist',()=>{
  assert.equal(S31.PASSWORD_MIN,10);
  assert.equal(S31.PASSWORD_MAX,72);
  assert.equal(S31.passwordValid('a'.repeat(9)),false);
  assert.equal(S31.passwordValid(' '+'a'.repeat(10)),false);
  const index=read('index.html');
  for(const id of ['usSignupPassword','usSignupConfirm','usRecoveryPassword','usRecoveryConfirm']) {
    const tag=index.match(new RegExp('<input[^>]*id="'+id+'"[^>]*>'))?.[0]||'';
    assert.match(tag,/minlength="10"/,id);
    assert.match(tag,/maxlength="72"/,id);
  }
  assert.match(read('docs/store/US_S3_1_PRODUCTION_AUTH_RELEASE.md'),/Minimum password length[^\n]*10/i);
});

test('us-staging-s31 Cloudflare builds of other branches publish only a static placeholder',async()=>{
  const {APPROVED_BRANCH,PLACEHOLDER_HTML}=await import('../scripts/build-s31-staging-preview.mjs');
  assert.equal(APPROVED_BRANCH,'mission/us-store-s3-1-public-auth-staging-20261011');
  assert.doesNotMatch(PLACEHOLDER_HTML,/supabase|sb_publishable|<script/i);
  assert.match(read('scripts/build-s31-staging-preview.mjs'),/CF_PAGES_BRANCH !== APPROVED_BRANCH/);
});
