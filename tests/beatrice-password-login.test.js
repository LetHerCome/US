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
const resumeFn = () => {
  const src = settings();
  return src.slice(src.indexOf('async function resumeAccountUpgradePhase'), src.indexOf('async function logout()'));
};
const sendHandler = () => {
  const src = settings();
  return src.slice(src.indexOf("$('usSendUpgrade')?.addEventListener"), src.indexOf('async function resumeAccountUpgradePhase'));
};

test('auth: original UID catturato PRIMA dell email upgrade e usato come authority', () => {
  const fn = appAuthBlock().slice(appAuthBlock().indexOf('async function requestAccountEmailUpgrade'));
  const capture = fn.indexOf('const expectedUserId=user.id;');
  const mutation = fn.indexOf('sb.auth.updateUser({email:normalized})');
  const awaitingPersist = fn.indexOf("JSON.stringify({expectedUserId,phase:'awaiting_email_confirmation'})");
  assert.ok(capture > -1, 'expectedUserId catturato prima della mutation');
  assert.ok(awaitingPersist > -1, 'il pending awaiting_email_confirmation è salvato solo dopo il successo');
  assert.ok(mutation > -1);
  assert.ok(capture < mutation && mutation < awaitingPersist, 'cattura UID -> mutation email -> persist awaiting');
  // Metadata non sensibili soltanto: niente email, niente password nel pending.
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
  const handler = sendHandler();
  assert.match(handler, /Controlla la tua email/);
  assert.doesNotMatch(handler, /usUpgradePassword|usSetPassword/,
    'il campo password NON appare subito dopo l invio email');
  assert.doesNotMatch(handler, /updateUser\(\{password/);
  assert.match(handler, /btn\.disabled=true;\s*\/\/ single attempt: no retry path/);
  assert.match(handler, /\/rate\|too many\/i/);
  assert.match(handler, /fallback admin richiesto sullo stesso UID/);
  assert.match(handler, /btn\.hidden=true/);
  assert.doesNotMatch(handler, /riprova|setTimeout[\s\S]*requestAccountEmailUpgrade|retr(y|ies)\s*\(/i);
});

test('auth: rate limit -> admin_fallback_required; generic error -> pending cleared', () => {
  const fn = appAuthBlock().slice(appAuthBlock().indexOf('async function requestAccountEmailUpgrade'));
  assert.match(fn, /if\(\/rate\|too many\/i\.test\(error\.message\|\|''\)\)/);
  assert.match(fn, /JSON\.stringify\(\{expectedUserId,phase:'admin_fallback_required'\}\)/);
  assert.match(fn, /No second email attempt is possible from here/);
  // Generic error: nessun pending sopravvive (niente falso "email inviata").
  const genericBranch = fn.slice(fn.indexOf('// Any other error'), fn.indexOf('try{localStorage', fn.indexOf('// Any other error')));
  assert.doesNotMatch(genericBranch, /localStorage\.setItem/);
  // readPendingAccountUpgrade accetta solo le due phase note.
  const appAuth = appAuthBlock();
  assert.match(appAuth, /ACCOUNT_UPGRADE_PHASES=\['awaiting_email_confirmation','admin_fallback_required'\]/);
  assert.match(appAuth, /!ACCOUNT_UPGRADE_PHASES\.includes\(pending\.phase\)/);
});

test('auth: reopen + pending stesso UID -> email button SEMPRE hidden/disabled (render state)', () => {
  const resume = resumeFn();
  // Il resume, con pending stesso UID, nasconde E disabilita email input e
  // bottone send per entrambe le phase, PRIMA di decidere il messaggio.
  assert.match(resume, /emailInput\.disabled=true;emailInput\.hidden=true;/);
  assert.match(resume, /sendBtn\.disabled=true;sendBtn\.hidden=true;/);
  const hideOrder = resume.indexOf('emailInput.disabled=true') < resume.indexOf("pending.phase==='admin_fallback_required'");
  assert.ok(hideOrder, 'gli elementi email sono disabilitati per ogni phase, non solo per fallback');
  // Il modal non può chiamare requestAccountEmailUpgrade nel resume.
  assert.doesNotMatch(resume, /requestAccountEmailUpgrade/);
});

test('auth: reopen + awaiting -> solo Controlla la tua email; fallback -> messaggio admin', () => {
  const resume = resumeFn();
  assert.match(resume, /pending\.phase==='admin_fallback_required'[\s\S]*?Serve il fallback admin sullo stesso account/);
  assert.match(resume, /else\{\s*\r?\n\s*\$\('usUpgradeStatus'\)\.textContent='Controlla la tua email/);
});

test('auth: confirmed same UID -> password phase direttamente (anche via fallback)', () => {
  const resume = resumeFn();
  // La fase password arriva solo dopo i tre check: UID match (già passato),
  // non anonymous, email confirmed.
  const checks = resume.indexOf('user.is_anonymous||!user.email||!user.email_confirmed_at');
  const passwordRender = resume.indexOf('usUpgradePassword');
  assert.ok(checks > -1 && passwordRender > -1 && checks < passwordRender,
    'niente fase password prima dei check anonymous/confirmed');
  assert.match(resume, /body\.insertAdjacentHTML\('beforeend',`\r?\n\s*<p>Sei entrata dall'email/);
});

test('auth: pending di altro UID -> clear e nessuna password da quel pending', () => {
  const resume = resumeFn();
  assert.match(resume, /user\.id!==pending\.expectedUserId\)\{\s*\r?\n\s*\/\/ Pending state of a different UID: ignore and remove it safely\.\s*\r?\n\s*window\.clearPendingAccountUpgrade\(\);/);
  // Il clear avviene prima di ogni render della fase password.
  assert.ok(resume.indexOf('clearPendingAccountUpgrade') < resume.indexOf('usUpgradePassword'));
});

test('auth: il bottone send non può partire con pending attivo (guard handler)', () => {
  const handler = sendHandler();
  assert.ok(handler.includes('if(window.readPendingAccountUpgrade?.()){'),
    'il guard pending esiste nel handler send');
  assert.ok(handler.includes('Una richiesta di upgrade è già in corso per questo account.'));
  assert.ok(handler.indexOf('if(window.readPendingAccountUpgrade?.())') < handler.indexOf('await window.requestAccountEmailUpgrade'),
    'il guard previene il send prima di qualsiasi chiamata');
  // Nessuna nuova richiesta mentre un pending esiste: nessuna chiamata di invio.
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

test('auth: rate limit -> admin_fallback_required; generic error -> pending cleared', () => {
  const fn = appAuthBlock().slice(appAuthBlock().indexOf('async function requestAccountEmailUpgrade'));
  assert.match(fn, /if\(\/rate\|too many\/i\.test\(error\.message\|\|''\)\)/);
  assert.match(fn, /JSON\.stringify\(\{expectedUserId,phase:'admin_fallback_required'\}\)/);
  assert.match(fn, /No second email attempt is possible from here/);
  const genericBranch = fn.slice(fn.indexOf('// Any other error'), fn.indexOf('try{localStorage', fn.indexOf('// Any other error')));
  assert.doesNotMatch(genericBranch, /localStorage\.setItem/);
  const appAuth = appAuthBlock();
  assert.match(appAuth, /ACCOUNT_UPGRADE_PHASES=\['awaiting_email_confirmation','admin_fallback_required'\]/);
  assert.match(appAuth, /!ACCOUNT_UPGRADE_PHASES\.includes\(pending\.phase\)/);
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
  assert.doesNotMatch(src, /localStorage\.setItem\((?!'us:settings:distance-unit')/);
  assert.doesNotMatch(src, /signUp|signInAnonymously|claim_us_role|signInWithPassword/);
  const fn = appAuthBlock();
  assert.match(fn, /JSON\.stringify\(\{expectedUserId,phase:'awaiting_email_confirmation'\}\)/);
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

test('auth: l auth non tocca il dominio M5B left_for_you', () => {
  // La history M5B esiste ed è canonical (missioni M5B successive alla auth);
  // il confine valido qui è che il codice auth/produzione non la referenzia.
  const m5b = fs
    .readdirSync(path.join(ROOT, 'supabase', 'migrations'))
    .filter((m) => m.includes('left_for_you'));
  assert.ok(m5b.length >= 2, 'la migration history M5B deve restare intatta');
  assert.doesNotMatch(read('index.html'), /left_for_you/);
});