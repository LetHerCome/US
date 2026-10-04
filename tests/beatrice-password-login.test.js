const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const app = () => read('app.js');
const settings = () => read('settings.js');

// US 2.0 F1A: the anonymous -> email account upgrade flow (Settings
// "Proteggi il tuo account") was reachable only for an anonymous session with
// a US profile. Anonymous sign-ins are disabled and claim_us_role (the only way
// an anonymous user ever got a profile) is revoked, so the flow is retired.
test('auth: legacy anonymous -> email upgrade flow is retired (F1A)', () => {
  const src = app();
  const s = settings();
  const index = read('index.html');
  for (const [name, code] of [['app.js', src], ['settings.js', s], ['index.html', index]]) {
    assert.doesNotMatch(code, /requestAccountEmailUpgrade|setPasswordFromActiveSession|readPendingAccountUpgrade|clearPendingAccountUpgrade|accountUpgradeModal|resumeAccountUpgradePhase/, name);
    assert.doesNotMatch(code, /us:account-upgrade|ACCOUNT_UPGRADE_|usAccountUpgradeRow|data-us-setting="account-upgrade"|usUpgrade(Email|Password|Status)/, name);
    assert.doesNotMatch(code, /updateUser\(\{\s*email/, name + ': no email change / anonymous upgrade');
    assert.doesNotMatch(code, /is_anonymous/, name + ': no anonymous-session branch');
  }
  assert.doesNotMatch(s, /'account-upgrade'/);
});

test('auth: settings never stores credentials and never signs up, pairs or signs in', () => {
  const s = settings();
  assert.doesNotMatch(s, /localStorage\.setItem\((?!'us:settings:distance-unit')/);
  assert.doesNotMatch(s, /signUp|signInAnonymously|signInWithOtp|claim_us_role|signInWithPassword/);
});

test('auth: Francesco continua a funzionare col login password-only', () => {
  const src = app();
  const index = read('index.html');
  assert.match(src, /sb\.auth\.signInWithPassword\(\{email,password\}\)/);
  assert.doesNotMatch(src, /Sessione Francesco non valida/);
  assert.doesNotMatch(src, /claim_us_role|signInAnonymously|signInWithOtp/);
  assert.doesNotMatch(index, /id="authPair"|id="pairBtn"|id="pairCode"|id="magicLinkBtn"/);
  const s = settings();
  assert.doesNotMatch(s, /c42c0170-10c8-43f8-b08f-c46e97770e6d/);
});

test('auth: l auth non tocca il dominio M5B left_for_you', () => {
  // La history M5B esiste ed è canonical (missioni M5B successive alla auth);
  // il confine valido qui è che il codice auth/produzione non la referenzia.
  const m5b = fs
    .readdirSync(path.join(ROOT, 'supabase', 'migrations_history'))
    .filter((m) => m.includes('left_for_you'));
  assert.ok(m5b.length >= 2, 'la migration history M5B deve restare intatta');
  assert.doesNotMatch(read('index.html'), /left_for_you/);
});

test('auth: front door is email + password only — no pairing and no magic link', () => {
  const index = read('index.html');
  const src = app();

  assert.match(index, /class="auth-step active" id="authLogin"/,
    'login email/password deve essere la porta iniziale');
  assert.doesNotMatch(index, /id="authPair"|id="pairBtn"|id="pairCode"/,
    'il pairing non deve essere una porta utente');
  assert.doesNotMatch(index, /id="magicLinkBtn"|Magic Link/i,
    'nessun Magic Link nel login');
  assert.match(index, /id="loginEmail"[^>]*type="email"/);
  assert.match(index, /id="loginPassword"[^>]*type="password"/);

  assert.match(src, /sb\.auth\.signInWithPassword\(\{email,password\}\)/);
  assert.doesNotMatch(src, /signInWithOtp|sendMagicLinkRecovery|signInAnonymously|claim_us_role/,
    'il front door non deve mantenere percorsi OTP o pairing legacy');
  assert.doesNotMatch(src, /returningDevice\?'authLogin':'authPair'/,
    'un telefono nuovo deve vedere lo stesso login email/password');
  assert.match(src, /if\(!session\)[\s\S]*showAuthStep\('authLogin'\)/);
});
