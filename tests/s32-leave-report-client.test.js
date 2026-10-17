const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const api = require('../account-deletion.js');

function fakeClient({ error = null, token = 'fresh-token', rpcResult = { data: { status: 'received' }, error: null } } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async signInWithPassword(args) {
        calls.push(['signIn', args]);
        return error ? { data: { user: null, session: null }, error } : { data: { session: { access_token: token } }, error: null };
      }
    },
    async rpc(fn, args) {
      calls.push(['rpc', fn, args]);
      if (rpcResult instanceof Error) throw rpcResult;
      return rpcResult;
    }
  };
}
const fakeFetch = (calls, status, body) => async (url, init) => {
  calls.push(['fetch', url, init]);
  return { status, json: async () => body };
};

test('leave: needs a password and the exact word ESCI', () => {
  assert.equal(api.LEAVE_WORD, 'ESCI');
  assert.equal(api.canLeave({ password: 'pw', confirm: ' ESCI ' }), true);
  for (const confirm of ['esci', 'Esci', 'ELIMINA', 'ESC', '', undefined]) {
    assert.equal(api.canLeave({ password: 'pw', confirm }), false, String(confirm));
  }
  assert.equal(api.canLeave({ password: '', confirm: 'ESCI' }), false);
});

test('leave: fresh password sign-in, then leave-couple with the new token, channel app', async () => {
  const client = fakeClient();
  const result = await api.reauthenticateAndLeave({
    client, email: 'a@b.it', password: 'pw', supabaseUrl: 'https://x.supabase.co/', apiKey: 'pk',
    fetchImpl: fakeFetch(client.calls, 200, { status: 'left' })
  });
  assert.deepEqual(client.calls.map((c) => c[0]), ['signIn', 'fetch']);
  const [, url, init] = client.calls[1];
  assert.equal(url, 'https://x.supabase.co/functions/v1/leave-couple');
  assert.equal(init.headers.Authorization, 'Bearer fresh-token');
  assert.deepEqual(JSON.parse(init.body), { confirm: 'ESCI', channel: 'app' });
  assert.doesNotMatch(init.body, /pw/);
  assert.deepEqual(result, { kind: 'left', done: true });
});

test('leave: wrong password never reaches the Edge function', async () => {
  const client = fakeClient({ error: { status: 400, name: 'AuthApiError' } });
  const result = await api.reauthenticateAndLeave({ client, email: 'a@b.it', password: 'pw', supabaseUrl: 'u', apiKey: 'k', fetchImpl: fakeFetch(client.calls, 200, {}) });
  assert.deepEqual(result, { kind: 'wrong_password', done: false });
  assert.deepEqual(client.calls.map((c) => c[0]), ['signIn']);
  assert.equal(api.leaveMessage(result.kind), 'Password non corretta. Riprova.');
});

test('leave: every server answer maps to one outcome and one message', () => {
  const cases = [
    [200, {}, 'left', true, 'Lo spazio di coppia è chiuso. Il tuo account resta attivo.'],
    [202, {}, 'left_pending_cleanup', true, /ultimi file/],
    [409, { error: 'not_in_couple' }, 'not_in_couple', true, /Non fai più parte/],
    [401, { error: 'reauth_required' }, 'reauth_required', false, /di nuovo la password/],
    [400, { error: 'confirm_required' }, 'leave_confirm_required', false, 'Scrivi ESCI per confermare.'],
    [503, { error: 'leave_disabled' }, 'leave_disabled', false, /non ancora disponibile, scrivi a moonee\.team@gmail\.com/],
    [500, { error: 'leave_failed' }, 'leave_failed', false, 'Uscita non riuscita: non è cambiato nulla. Riprova tra poco.'],
  ];
  for (const [status, body, kind, done, text] of cases) {
    assert.deepEqual(api.leaveOutcome(status, body), { kind, done }, String(status));
    const message = api.leaveMessage(kind);
    if (text instanceof RegExp) assert.match(message, text); else assert.equal(message, text);
  }
});

test('report: categories, validation and the RPC call', async () => {
  assert.deepEqual(api.REPORT_CATEGORIES.map((c) => c.key), ['content', 'person', 'minor_safety', 'app_problem']);
  assert.equal(api.canReport({ category: 'content', details: '  ' }), false);
  assert.equal(api.canReport({ category: 'spam', details: 'x' }), false);
  assert.equal(api.canReport({ category: 'content', details: 'x'.repeat(api.REPORT_MAX_LENGTH + 1) }), false);
  const client = fakeClient();
  assert.deepEqual(await api.submitReport({ client, category: 'person', details: '  mi minaccia  ' }), { kind: 'received', done: true });
  assert.deepEqual(client.calls, [['rpc', 'submit_user_report', { p_category: 'person', p_details: 'mi minaccia' }]]);
  assert.deepEqual(await api.submitReport({ client, category: 'person', details: '' }), { kind: 'invalid', done: false });
  assert.equal(client.calls.length, 1);
});

test('report: server errors map to messages', async () => {
  const run = (rpcResult) => api.submitReport({ client: fakeClient({ rpcResult }), category: 'content', details: 'x' });
  assert.equal((await run({ data: null, error: { message: 'report_rate_limited' } })).kind, 'rate_limited');
  assert.equal((await run({ data: null, error: { message: 'report_details_invalid' } })).kind, 'invalid');
  assert.equal((await run({ data: null, error: { message: 'TypeError: Failed to fetch' } })).kind, 'network');
  assert.equal((await run(new Error('offline'))).kind, 'network');
  assert.equal((await run({ data: null, error: { message: 'permission denied', status: 403 } })).kind, 'failed');
  assert.match(api.reportMessage('received'), /team di US/);
  assert.match(api.reportMessage('received'), /112/);
  assert.match(api.reportMessage('rate_limited'), /moonee\.team@gmail\.com/);
  assert.match(api.reportMessage('failed'), /Segnalazione non inviata/);
});

test('settings: rows, routes and guarded flows', () => {
  const html = read('index.html');
  assert.match(html, /data-us-setting="report">[\s\S]*?Segnala un problema o un contenuto/);
  assert.match(html, /data-us-setting="leave-couple">[\s\S]*?Esci dalla coppia/);
  const settings = read('settings.js');
  assert.match(settings, /if\(name==='leave-couple'\)return leaveCoupleModal\(\);/);
  assert.match(settings, /if\(name==='report'\)return reportModal\(\);/);
  const privacy = settings.slice(settings.indexOf('async function privacyModal'), settings.indexOf('// S3.2 — account deletion'));
  assert.match(privacy, /id="usOpenLeaveCouple">Esci dalla coppia</);
  assert.match(privacy, /Una copia dei tuoi dati/);
  const leave = settings.slice(settings.indexOf('async function leaveCoupleModal'), settings.indexOf('// Segnala un problema'));
  assert.match(leave, /type="password" autocomplete="current-password"/);
  assert.match(leave, /id="usLeaveCoupleSubmit" disabled>/);
  assert.match(leave, /api\.canLeave\(/);
  assert.match(leave, /api\.reauthenticateAndLeave\(/);
  assert.match(leave, /passwordInput\.value=''/);
  assert.match(leave, /window\.revokeCurrentDevice/);
  assert.match(leave, /location\.reload\(\)/);
  // Leaving keeps the account and the session on this phone.
  assert.doesNotMatch(leave, /signOut|deleteUser|UsAppLock/);
  for (const copy of ['Cosa viene eliminato', 'Cosa resta alla tua persona', 'senza il tuo nome', 'Il tuo account resta']) {
    assert.ok(leave.includes(copy), copy);
  }
  const report = settings.slice(settings.indexOf('async function reportModal'), settings.indexOf('function logoutConfirmationModal'));
  assert.match(report, /api\.REPORT_CATEGORIES/);
  assert.match(report, /api\.submitReport\(\{client:sb/);
  assert.match(report, /la tua persona non la vede/);
  assert.match(report, /maxlength="\$\{api\.REPORT_MAX_LENGTH\}"/);
});

test('reports never reach the partner: no client read path exists', () => {
  for (const file of ['app.js', 'settings.js', 'account-deletion.js', 'noi-v2.js']) {
    assert.doesNotMatch(read(file), /from\(['"]user_reports['"]\)/, file);
  }
});

// Staging QA 16/10: the redesign's full-width text-field rule turned the
// Segnala radios into 52px circles and pushed the reasons off the sheet.
test('Segnala reasons: the settings text-field rule skips radios; each reason is a row with a small radio', () => {
  const css = read('dc-settings.css');
  assert.match(css, /#usSettingsModalBody \.us-settings2-field :is\(input:not\(\[type="radio"\]\):not\(\[type="checkbox"\]\),textarea\)\{/);
  assert.doesNotMatch(css, /#usSettingsModalBody \.us-settings2-field :is\(input,textarea\)\{/);
  assert.match(css, /#usSettingsModalBody \.us-report-option\{\s*display:flex;/);
  assert.match(css, /#usSettingsModalBody \.us-report-option input\{flex:0 0 auto;width:20px;height:20px;min-height:0;/);
});
