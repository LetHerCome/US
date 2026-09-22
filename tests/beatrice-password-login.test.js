const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const app = () => read('app.js');
const settings = () => read('settings.js');
const appAuthBlock = () => {
  const src = app();
  return src.slice(src.indexOf('async function setPasswordFromActiveSession'), src.indexOf('async function sendMagicLinkRecovery'));
};

test('auth: original UID catturato PRIMA dell email upgrade e usato come authority', () => {
  const fn = appAuthBlock().slice(appAuthBlock().indexOf('async function requestAccountEmailUpgrade'));
  const capture = fn.indexOf("ACCOUNT_UPGRADE_KEY,JSON.stringify({expectedUserId:user.id,phase:'awaiting_email_confirmation'})");
  const mutation = fn.indexOf('sb.auth.updateUser({email:normalized})');
  assert.ok(capture > -1, 'il pending state con expectedUserId viene salvato');
  assert.ok(mutation > -1);
  assert.ok(capture < mutation, 'l UID originale è persistato PRIMA della mutazione email');
  // Metadata non sensibili soltanto: niente email, niente password nel pending.
  // Solo expectedUserId e phase: nessun valore di email/password nel pending.
  assert.doesNotMatch(fn, /JSON\.stringify\(\{[^}]*normalized/i);
  assert.doesNotMatch(fn, /localStorage\.setItem\([^)]*(?:@|password)/i);
});

test('auth: la password usa l UID pending originale, non user.id fresco (niente tautologia)', () => {
  const src = settings();
  assert.match(src, /setPasswordFromActiveSession\(\s*document\.getElementById\('usUpgradePassword'\)\.value,pending\.expectedUserId\)/,
    'expectedUserId arriva dal pending state, non dalla stessa sessione');
  assert.doesNotMatch(src, /setPasswordFromActiveSession\([\s\S]*?user\?\.id\)/);
  assert.match(src, /passing the freshly-read session user\.id here would be self-referential/);
});

test('auth: due fasi reali — dopo email sent nessun campo password né updateUser password', () => {
  const src = settings();
  const handler = src.slice(src.indexOf("$('usSendUpgrade')?.addEventListener"), src.indexOf('async function resumeAccountPasswordPhaseIfConfirmed'));
  assert.match(handler, /Controlla la tua email/);
  assert.doesNotMatch(handler, /usUpgradePassword|usSetPassword/,
    'il campo password NON appare subito dopo l invio email');
  assert.doesNotMatch(handler, /updateUser\(\{password/);
  assert.match(handler, /btn\.disabled=true;\s*\/\/ single attempt: no retry path/);
  assert.match(handler, /\/rate\|too many\/i/);
  assert.match(handler, /fallback admin sullo stesso UID/);
  assert.doesNotMatch(handler, /riprova|setTimeout[\s\S]*requestAccountEmailUpgrade|retr(y|ies)\s*\(/i);
});

test('auth: anonymous non può impostare la password (guard dedicato)', () => {
  const fn = appAuthBlock();
  assert.match(fn, /if\(user\.is_anonymous\)throw new Error\('L\\'account deve prima confermare l\\'email\.'\)/);
  assert.match(fn, /if\(!user\.email\|\|!user\.email_confirmed_at\)throw new Error\('L\\'email non è ancora verificata\.'\)/);
  assert.match(fn, /password\.length<6/);
  assert.doesNotMatch(fn, /console\.(log|info|warn|error)\([^)]*password/i);
  assert.doesNotMatch(fn, /localStorage\.setItem\([^)]*password/i);
});

test('auth: confirmed same UID può impostarla; different UID rejected con blocco duro', () => {
  const fn = appAuthBlock();
  assert.match(fn, /if\(user\.id!==expectedUserId\)throw new Error\('Sessione non valida per questo account\.'\)/);
  const src = settings();
  const resume = src.slice(src.indexOf('async function resumeAccountPasswordPhaseIfConfirmed'), src.indexOf('async function logout()'));
  // Pending di altro UID: ignorato e rimosso in sicurezza.
  assert.match(resume, /user\.id!==pending\.expectedUserId[\s\S]*?clearPendingAccountUpgrade\(\)/);
  // Email non ancora verificata: niente fase password.
  assert.match(resume, /user\.is_anonymous\|\|!user\.email\|\|!user\.email_confirmed_at[\s\S]*?Controlla la tua email/);
  // Fase password mostrata solo se UID match + non anonymous + email confirmed.
  const confirmedOrder = resume.indexOf('user.id!==pending.expectedUserId') < resume.indexOf('body.insertAdjacentHTML');
  assert.ok(confirmedOrder);
});

test('auth: pending state eliminato dopo password success; UI Account protetto', () => {
  const src = settings();
  assert.match(src, /await window\.setPasswordFromActiveSession\(\s*document\.getElementById\('usUpgradePassword'\)\.value,pending\.expectedUserId\);\s*\n\s*window\.clearPendingAccountUpgrade\(\);/);
  assert.match(src, /Account protetto ✓/);
});

test('auth: la riga Settings resta visibile con pending upgrade dello stesso UID', () => {
  const src = settings();
  assert.match(src, /pendingMine=pending&&user\?pending\.expectedUserId===user\.id:false/);
  assert.match(src, /upgradeRow\.hidden=!\(Boolean\(user\?\.is_anonymous\)\|\|\(pending&&pendingMine\)\)/);
  const index = read('index.html');
  assert.match(index, /data-us-setting="account-upgrade"[^>]*hidden[^>]*id="usAccountUpgradeRow"/);
});

test('auth: nessuna email/password salvata in storage; niente signUp/claim_us_role in settings', () => {
  const src = settings();
  // Nessun localStorage.setItem legato al flusso upgrade (email/password/pending).
  assert.doesNotMatch(src, /localStorage\.setItem\((?!'us:settings:distance-unit')/);
  assert.doesNotMatch(src, /signUp|signInAnonymously|claim_us_role|signInWithPassword/);
  // Il pending state persista solo expectedUserId e phase.
  const fn = appAuthBlock();
  assert.match(fn, /JSON\.stringify\(\{expectedUserId:user\.id,phase:'awaiting_email_confirmation'\}\)/);
});

test('auth: Francesco continua a funzionare col percorso generalizzato; pairing intatto', () => {
  const src = app();
  assert.match(src, /sb\.auth\.signInWithPassword\(\{email,password\}\)/);
  assert.doesNotMatch(src, /Sessione Francesco non valida/);
  assert.match(src, /window\.setPasswordFromActiveSession=setPasswordFromActiveSession/);
  assert.match(src, /sb\.rpc\('claim_us_role',\{invite_code:code,chosen_role:selectedRole\}\)/);
  assert.equal((src.match(/claim_us_role/g) || []).length, 1);
  assert.equal((src.match(/signInAnonymously/g) || []).length, 1);
  const s = settings();
  assert.doesNotMatch(s, /c42c0170-10c8-43f8-b08f-c46e97770e6d/);
  assert.match(read('index.html'), /id="pairBtn"/);
});

test('auth: nessun tocco alle migration M5B in questa missione', () => {
  // Le migration M5B vivono nel worktree M5B e restano intatte: in questo
  // branch non esistono e nessun file supabase/ è toccato.
  assert.equal(fs.readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter((m) => m.includes('left_for_you')).length, 0);
});