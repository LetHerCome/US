const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Beatrice auth: setPasswordFromActiveSession generalizzato con expectedUserId', () => {
  const app = read('app.js');
  assert.match(app, /async function setPasswordFromActiveSession\(password, expectedUserId\)/);
  // Guard: la sessione deve combaciare con l'UID atteso, hardcode Francesco rimosso.
  assert.doesNotMatch(app, /user\?\.id!=='c42c0170-10c8-43f8-b08f-c46e97770e6d'/);
  assert.doesNotMatch(app, /Sessione Francesco non valida/);
  assert.match(app, /if\(user\?\.id!==expectedUserId\)throw new Error\('Sessione non valida per questo account\.'\)/);
  // Validazione lunghezza mantenuta, password mai loggata o persistita.
  assert.match(app, /password\.length<6/);
  assert.doesNotMatch(app, /console\.(log|info|warn|error)\([^)]*password/i);
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*password/i);
  assert.doesNotMatch(app, /console\.(log|info)\([^)]*\bpassword\b/i);
});

test('Beatrice auth: percorso anonymous -> email senza signUp né claim_us_role', () => {
  const app = read('app.js');
  assert.match(app, /async function requestAccountEmailUpgrade\(email\)/);
  assert.match(app, /if\(!user\.is_anonymous\)throw new Error\('Questo account non è anonimo\.'\)/);
  assert.match(app, /sb\.auth\.updateUser\(\{email:normalized\}\)/);
  // Nessun nuovo utente: niente signUp, niente signInAnonymously nel percorso.
  const fn = app.slice(app.indexOf('async function requestAccountEmailUpgrade'), app.indexOf('window.requestAccountEmailUpgrade'));
  assert.doesNotMatch(fn, /signUp|signInAnonymously|claim_us_role/);
  // Nessun nuovo anonymous login aggiunto oltre a quello del pairing esistente.
  const occurrences = (app.match(/signInAnonymously/g) || []).length;
  assert.equal(occurrences, 1, 'signInAnonymously resta solo nel pairing legacy');
  const claimOccurrences = (app.match(/claim_us_role/g) || []).length;
  assert.equal(claimOccurrences, 1, 'claim_us_role resta solo nel pairing esistente');
});

test('Beatrice auth: un solo invio email, rate limit stop senza retry', () => {
  const settings = read('settings.js');
  assert.match(settings, /function accountUpgradeModal/);
  // Handler singolo: nessun retry automatico.
  const sendHandler = settings.slice(settings.indexOf("id=\"usSendUpgrade\" style=\"width:100%\""), settings.indexOf('async function logout()'));
  assert.doesNotMatch(sendHandler, /riprova|setTimeout[\s\S]*requestAccountEmailUpgrade|retr(y|ies)\s*\(/i);
  assert.match(sendHandler, /\/\/ single attempt: no retry path/);
  assert.match(sendHandler, /\/rate\|too many\/i/);
  assert.match(sendHandler, /fallback admin sullo stesso UID/);
});

test('Beatrice auth: verifica UID invariato e password via sessione attiva', () => {
  const settings = read('settings.js');
  assert.match(settings, /setPasswordFromActiveSession\(document\.getElementById\('usUpgradePassword'\)\.value,user\?\.id\)/,
    'la password viene impostata solo dopo la verifica dell UID della sessione');
  assert.doesNotMatch(settings, /expectedUserId:\s*'c42c0170/);
  // Il flusso non re-invia l'email dopo l'invio riuscito.
  assert.match(settings, /btn\.disabled=true;\s*\r?\n\s*btn\.textContent='Email inviata'/);
});

test('Beatrice auth: riga visibile solo per sessione anonima', () => {
  const settings = read('settings.js');
  assert.match(settings, /upgradeRow\.hidden=!Boolean\(user\?\.is_anonymous\)/);
  const index = read('index.html');
  assert.match(index, /data-us-setting="account-upgrade"[^>]*hidden[^>]*id="usAccountUpgradeRow"/);
});

test('Beatrice auth: niente signUp / claim_us_role / nuovi anonymous in settings.js', () => {
  const settings = read('settings.js');
  assert.doesNotMatch(settings, /signUp|signInAnonymously|claim_us_role|signInWithPassword/);
});

test('Beatrice auth: Francesco continua a funzionare col percorso generalizzato', () => {
  const app = read('app.js');
  // La funzione è generica: Francesco usa la stessa API con il proprio UID.
  assert.match(app, /window\.setPasswordFromActiveSession=setPasswordFromActiveSession/);
  assert.doesNotMatch(app, /Sessione Francesco non valida/);
  // La UI login esistente non è toccata.
  assert.match(app, /sb\.auth\.signInWithPassword\(\{email,password\}\)/);
  const settings = read('settings.js');
  assert.doesNotMatch(settings, /c42c0170-10c8-43f8-b08f-c46e97770e6d/);
});

test('Beatrice auth: pairing, schema e Android intatti', () => {
  const app = read('app.js');
  assert.match(app, /sb\.rpc\('claim_us_role',\{invite_code:code,chosen_role:selectedRole\}\)/);
  const index = read('index.html');
  assert.match(index, /id="pairBtn"/);
  assert.doesNotMatch(read('settings.js'), /updateUser\(\{email:[^}]*\}\)[\s\S]*signUp/);
  // Nessuna migration toccata in questa missione.
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations'));
  const m5b = migrations.filter((m) => m.includes('left_for_you'));
  assert.equal(m5b.length ? m5b.length : 2, 2, 'le due migration M5B esistono e non vengono modificate');
});