// S3.1 public Auth screens — stage-only until reviewed and authorized.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S31 = require('../public-auth.js');
const read = p => fs.readFileSync(path.resolve(__dirname,'..',p), 'utf8');
const USER_EMAIL = 'someone+test@example.invalid';
const SAMPLE_PASSWORD = 'A-safe-passphrase-17';

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

test('stage gate rejects production, lookalike origins and non-Supabase URL',()=>{
  assert.equal(S31.isStagingEndpoint('https://dugmhngrfkuieeletatb.supabase.co'),true);
  for(const host of [
    'https://iiakdfsxpywdkxravqjh.supabase.co',
    'https://dugmhngrfkuieeletatb.supabase.co.evil.tld',
    'http://dugmhngrfkuieeletatb.supabase.co',
    'https://evil.tld/dugmhngrfkuieeletatb.supabase.co', ''
  ])assert.equal(S31.isStagingEndpoint(host),false);
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
