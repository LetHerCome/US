// 19/10/2026 audit: with the phone in English, Delete account, Leave the
// couple and Report stayed in Italian, and a failed sign-in showed Supabase's
// own English error ("Accesso non riuscito: Invalid login credentials").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const I = require(path.join(ROOT, 'i18n.js'));
const dict = I.compile(require(path.join(ROOT, 'i18n-en.js')));
const A = require(path.join(ROOT, 'account-deletion.js'));
const en = (text) => I.lookup(dict, text);

test('english: every delete, leave and report message has its English', () => {
  const kinds = ['deleted', 'pending_cleanup', 'wrong_password', 'reauth_required', 'confirm_required', 'deletion_disabled',
    'network', 'no_email', 'unavailable', 'deletion_failed', 'left', 'left_pending_cleanup', 'not_in_couple',
    'leave_confirm_required', 'leave_disabled', 'leave_failed', 'received', 'rate_limited', 'invalid', 'failed'];
  for (const kind of kinds) {
    for (const text of [A.message(kind, A.US_SUPPORT_EMAIL, 'app'), A.message(kind, A.US_SUPPORT_EMAIL, 'web'), A.leaveMessage(kind), A.reportMessage(kind)]) {
      assert.ok(en(text), text);
    }
  }
  for (const category of A.REPORT_CATEGORIES) assert.ok(en(category.label), category.label);
  assert.equal(en(`Scrivi ${A.CONFIRM_WORD} per confermare`), `Type ${A.CONFIRM_WORD} to confirm`);
  assert.equal(en(`Scrivi ${A.LEAVE_WORD} per confermare`), `Type ${A.LEAVE_WORD} to confirm`);
});

test('english: the text of the delete, leave and report screens has its English', () => {
  const settings = fs.readFileSync(path.join(ROOT, 'settings.js'), 'utf8');
  const start = settings.indexOf('async function accountDeletionModal');
  const end = settings.indexOf('\n}\n', settings.indexOf('async function reportModal'));
  const block = settings.slice(start, end)
    .replace(/\$\{esc\(api\.(CONFIRM_WORD|LEAVE_WORD)\)\}/g, (all, word) => A[word])
    .replace(/\$\{[^{}]*\}/g, '\u0000');
  const missing = new Set();
  for (const lit of block.matchAll(/`([^`]*)`|'((?:[^'\\\n]|\\.)*)'/g)) {
    const body = lit[1] ?? lit[2] ?? '';
    const pieces = body.split(/<[^>]*>|\u0000/);
    for (const attr of body.matchAll(/placeholder="([^"]+)"/g)) pieces.push(attr[1]);
    for (const piece of pieces) {
      const text = piece.replace(/\s+/g, ' ').trim();
      // Italian words only: ids, classes and code never reach the screen.
      if (!/[a-zà-ù]{3,} [a-zà-ù]/i.test(text) && !/^[A-ZÈ][a-zà-ù’]+(…|\.)?$/.test(text)) continue;
      if (/[=;{}()]|^us[A-Z]|^[.[]|^Escape$/.test(text)) continue;
      if (!en(text)) missing.add(text);
    }
  }
  assert.deepEqual([...missing], []);
});

test('sign in: a failed sign-in says what happened in plain words, in both languages', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const source = app.slice(app.indexOf('function loginErrorMessage'), app.indexOf('async function loginAccount'));
  const loginErrorMessage = new Function(`${source}; return loginErrorMessage;`)();
  const cases = [
    [{ message: 'Invalid login credentials', status: 400 }, 'Email o password non corrette. Riprova.'],
    [{ message: 'Email not confirmed', status: 400 }, 'Prima conferma la tua email con il link che ti abbiamo mandato.'],
    [{ message: 'Request rate limit reached', status: 429 }, 'Troppi tentativi. Aspetta qualche minuto e riprova.'],
    [{ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }, 'Non riesco a raggiungere US. Controlla la connessione e riprova.'],
    [{ message: 'Database error querying schema', status: 500 }, 'Accesso non riuscito. Riprova tra poco.']
  ];
  for (const [error, expected] of cases) {
    assert.equal(loginErrorMessage(error), expected);
    assert.ok(en(expected), expected);
  }
  assert.doesNotMatch(app, /'Accesso non riuscito: '\+/, 'Supabase’s own words never reach the screen');
});
