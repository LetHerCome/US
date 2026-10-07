const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(ROOT,file),'utf8');

test('boot/auth safety: session restore is bounded and password remains the front door',()=>{
  const app=read('app.js');
  const html=read('index.html');
  assert.match(app,/usWithDeadline\(\s*sb\.auth\.getSession\(\)/);
  assert.match(app,/auth session restore timed out/);
  assert.match(app,/sb\.auth\.signInWithPassword\(\{email,password\}\)/);
  assert.match(html,/class="auth-step active" id="authLogin"/);
  assert.match(html,/id="loginEmail"[^>]*type="email"/);
  assert.match(html,/id="loginPassword"[^>]*type="password"/);
});

test('boot/auth safety: login button is always released even when initCloud fails',()=>{
  const app=read('app.js');
  const start=app.indexOf('async function loginAccount()');
  const end=app.indexOf('window.loginAccount=loginAccount;',start);
  assert.ok(start>=0&&end>start,'loginAccount exists');
  const login=app.slice(start,end);
  assert.match(login,/btn\.disabled=true/);
  assert.match(login,/try\s*\{/);
  assert.match(login,/await initCloud\(\)/);
  assert.match(login,/finally\s*\{\s*btn\.disabled=false;\s*\}/);
});

test('boot/auth safety: valid profile resolves auth before background hydration',()=>{
  const app=read('app.js');
  const start=app.indexOf('async function initCloud()');
  const end=app.indexOf('function setAuthStatus',start);
  assert.ok(start>=0&&end>start,'initCloud exists');
  const init=app.slice(start,end);
  assert.match(init,/window\.usProfile = profile/);
  assert.match(init,/classList\.add\('us-auth-ready','us-returning-device'\)/);
  assert.match(init,/window\.dispatchEvent\(new CustomEvent\('us-auth-resolved',\{detail:\{paired:true\}\}\)\)/);
  assert.match(init,/hydrateCloud\(\)\.catch/);
  assert.ok(init.indexOf("classList.add('us-auth-ready','us-returning-device')") < init.indexOf('hydrateCloud().catch'),
    'auth-ready must be resolved before non-critical hydration');
});

test('boot/auth safety: no profile or no session cannot reuse stale tenant state',()=>{
  const app=read('app.js');
  const init=app.slice(app.indexOf('async function initCloud()'),app.indexOf('function setAuthStatus'));
  const clears=(init.match(/window\.UsCoupleContext\?\.clear\?\.\(\)/g)||[]).length;
  assert.ok(clears>=2,'both no-session and no-profile paths clear Couple Context');
});
