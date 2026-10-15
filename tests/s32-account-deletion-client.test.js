const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const deletion = require('../account-deletion.js');
const page = require('../elimina-account.js');

function fakeClient({ error = null, token = 'fresh-token' } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async signInWithPassword(args) {
        calls.push(['signIn', args]);
        return error
          ? { data: { user: null, session: null }, error }
          : { data: { session: { access_token: token } }, error: null };
      }
    }
  };
}
function fakeFetch(calls, status, body) {
  return async (url, init) => {
    calls.push(['fetch', url, init]);
    return { status, json: async () => body };
  };
}

test('confirmation needs a password and the exact word ELIMINA', () => {
  assert.equal(deletion.CONFIRM_WORD, 'ELIMINA');
  assert.equal(deletion.canSubmit({ password: 'secret', confirm: 'ELIMINA' }), true);
  assert.equal(deletion.canSubmit({ password: 'secret', confirm: ' ELIMINA ' }), true);
  for (const confirm of ['elimina', 'Elimina', 'ELIMIN', 'ELIMINA!', '', undefined]) {
    assert.equal(deletion.canSubmit({ password: 'secret', confirm }), false, String(confirm));
  }
  assert.equal(deletion.canSubmit({ password: '', confirm: 'ELIMINA' }), false);
  assert.equal(deletion.canSubmit({ confirm: 'ELIMINA' }), false);
});

test('password sign-in happens before the Edge call, with the fresh token and the channel', async () => {
  for (const channel of ['app', 'web']) {
    const client = fakeClient();
    const result = await deletion.reauthenticateAndDelete({
      client, email: 'a@b.it', password: 'pw', channel,
      supabaseUrl: 'https://x.supabase.co/', apiKey: 'pk', fetchImpl: fakeFetch(client.calls, 200, { status: 'deleted' })
    });
    assert.deepEqual(client.calls.map((c) => c[0]), ['signIn', 'fetch']);
    assert.deepEqual(client.calls[0][1], { email: 'a@b.it', password: 'pw' });
    const [, url, init] = client.calls[1];
    assert.equal(url, 'https://x.supabase.co/functions/v1/delete-account');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer fresh-token');
    assert.equal(init.headers.apikey, 'pk');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { confirm: 'ELIMINA', channel });
    assert.doesNotMatch(init.body, /pw/);
    assert.deepEqual(result, { kind: 'deleted', done: true });
  }
  await assert.rejects(deletion.requestDeletion({ supabaseUrl: 'u', apiKey: 'k', accessToken: 't', channel: 'other', fetchImpl: async () => ({}) }));
});

test('a failed password sign-in never reaches the Edge', async () => {
  const client = fakeClient({ error: { status: 400, name: 'AuthApiError', message: 'Invalid login credentials' } });
  const result = await deletion.reauthenticateAndDelete({
    client, email: 'a@b.it', password: 'wrong', channel: 'app',
    supabaseUrl: 'https://x.supabase.co', apiKey: 'pk', fetchImpl: fakeFetch(client.calls, 200, {})
  });
  assert.deepEqual(client.calls.map((c) => c[0]), ['signIn']);
  assert.equal(result.kind, 'wrong_password');
  const offline = fakeClient({ error: { status: 0, name: 'AuthRetryableFetchError' } });
  assert.equal((await deletion.reauthenticateAndDelete({ client: offline, email: 'a@b.it', password: 'x', channel: 'app', supabaseUrl: 'u', apiKey: 'k', fetchImpl: fakeFetch(offline.calls, 200, {}) })).kind, 'network');
  assert.equal((await deletion.reauthenticateAndDelete({ client: fakeClient(), email: '', password: 'x', channel: 'app' })).kind, 'no_email');
});

test('every server response maps to one outcome and message', async () => {
  const cases = [
    [200, { status: 'deleted' }, 'deleted', true],
    [202, { status: 'pending_cleanup' }, 'pending_cleanup', true],
    [401, { error: 'reauth_required' }, 'reauth_required', false],
    [400, { error: 'confirm_required' }, 'confirm_required', false],
    [503, { error: 'deletion_disabled' }, 'deletion_disabled', false],
    [500, { error: 'deletion_failed' }, 'deletion_failed', false],
    [502, null, 'deletion_failed', false]
  ];
  for (const [status, body, kind, done] of cases) {
    const client = fakeClient();
    const result = await deletion.reauthenticateAndDelete({
      client, email: 'a@b.it', password: 'pw', channel: 'app',
      supabaseUrl: 'https://x.supabase.co', apiKey: 'pk', fetchImpl: fakeFetch(client.calls, status, body)
    });
    assert.deepEqual(result, { kind, done }, String(status));
    assert.ok(deletion.message(kind).length > 0);
  }
  assert.equal(deletion.message('deletion_disabled', 'x@y.invalid'), 'Eliminazione non ancora disponibile, scrivi a x@y.invalid.');
  assert.match(deletion.message('deletion_failed'), /non è stato eliminato nulla/);
  // The app asks only for the password; the public page asks for email and password.
  assert.equal(deletion.message('wrong_password', 'x@y.invalid', 'app'), 'Password non corretta. Riprova.');
  assert.equal(deletion.message('wrong_password', 'x@y.invalid'), 'Email o password non corrette. Riprova.');
  const network = await deletion.requestDeletion({ supabaseUrl: 'u', apiKey: 'k', accessToken: 't', channel: 'web', fetchImpl: async () => { throw new TypeError('offline'); } });
  assert.deepEqual(network, { kind: 'network', done: false });
});

test('support email is the founder address, developer name a TODO, both defined once', () => {
  assert.equal(deletion.US_SUPPORT_EMAIL, 'moonee.team@gmail.com');
  const shared = read('account-deletion.js');
  assert.match(shared, /TODO founder/);
  for (const file of ['settings.js', 'elimina-account.html', 'elimina-account.js', 'app.js', 'index.html']) {
    assert.doesNotMatch(read(file), /moonee\.team@gmail\.com|@us-app/, file);
  }
});

test('settings: Privacy e dati opens a guarded deletion flow on the shared module', () => {
  const settings = read('settings.js');
  const privacy = settings.slice(settings.indexOf('function privacyModal'), settings.indexOf('function logoutConfirmationModal'));
  assert.match(privacy, /id="usOpenAccountDeletion">Elimina account</);
  assert.match(privacy, /type="password" autocomplete="current-password"/);
  assert.match(privacy, /id="usAccountDeleteSubmit" disabled>/);
  assert.match(privacy, /api\.canSubmit\(/);
  assert.match(privacy, /role="status" aria-live="polite"/);
  assert.match(privacy, /channel:'app'/);
  assert.match(privacy, /api\.reauthenticateAndDelete\(/);
  assert.match(privacy, /client:sb/);
  assert.match(privacy, /passwordInput\.value=''/);
  for (const copy of ['Cosa viene eliminato', 'Cosa resta alla tua persona', 'definitivo', 'senza il tuo nome', 'Account eliminato']) {
    assert.ok(privacy.includes(copy), copy);
  }
  // Local mirror of logout: device revoke + local sign-out, both best-effort.
  assert.match(privacy, /window\.revokeCurrentDevice/);
  assert.match(privacy, /signOut\(\{scope:'local'\}\)/);
  assert.match(privacy, /location\.reload\(\)/);
  assert.ok(privacy.indexOf("signOut({scope:'local'})") > privacy.indexOf('function signOutLocallyAfterAccountDeletion'));
  // The lifecycle gate keeps forbidding a direct client-side user deletion.
  assert.doesNotMatch(settings, /deleteUser\(|deleteAccount\(/);
  assert.doesNotMatch(settings, /service_role|SERVICE_ROLE/);
});

test('the password is never logged or stored', () => {
  const settings = read('settings.js');
  const flow = settings.slice(settings.indexOf('// S3.2 — account deletion'), settings.indexOf('function logoutConfirmationModal'));
  for (const [name, source] of [['settings flow', flow], ['account-deletion.js', read('account-deletion.js')], ['elimina-account.js', read('elimina-account.js')]]) {
    assert.doesNotMatch(source, /console\.(log|info|warn|error|debug)/, name);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, name);
  }
  assert.match(read('elimina-account.js'), /persistSession:false/);
});

test('public page: standalone, Play sections present, pinned supabase-js with SRI', () => {
  const html = read('elimina-account.html');
  const js = read('elimina-account.js');
  for (const source of [html, js]) {
    assert.doesNotMatch(source, /serviceWorker|service-worker/);
  }
  assert.doesNotMatch(html, /src="\/(app|settings|fastboot2|platform|ui-foundation)\.js/);
  assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1].split('/').pop()), ['supabase.js', 'account-deletion.js', 'elimina-account.js']);
  assert.doesNotMatch(js, /createElement\('script'\)/);
  assert.match(html, /<html lang="it">/);
  assert.match(html, /App: <b>US<\/b>/);
  assert.match(html, /data-us-developer-name/);
  for (const heading of ['Come eliminare l’account dall’app', 'Accedi ed elimina', 'Cosa viene eliminato', 'Cosa resta alla tua persona', 'Tempi e conservazione', 'Copia dei dati o eliminazione via email']) {
    assert.ok(html.includes(heading), heading);
  }
  assert.match(html, /entro 30 giorni/);
  assert.match(html, /12 mesi/);
  assert.match(html, /non usa copie di backup/);
  assert.doesNotMatch(html, /sovrascritt/);
  assert.match(html, /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.112\.4\/dist\/umd\/supabase\.js" integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous"><\/script>/);
  assert.match(html, /<label for="deletePassword">/);
  assert.match(html, /id="deleteStatus" role="status" aria-live="polite"/);
  assert.match(html, /<fieldset id="deleteFieldset" disabled>/);
  assert.match(js, /channel:'web'/);
  assert.match(js, /signOut\(\{scope:'local'\}\)/);
});

test('public page: production keys only on the production Pages host', () => {
  assert.ok(page.configForHost('us-a33.pages.dev'));
  assert.ok(page.configForHost('feature-x.us-a33.pages.dev'));
  for (const host of ['localhost', 'evil.dev', 'us-a33.pages.dev.evil.dev', 'xus-a33.pages.dev', '', undefined]) {
    assert.equal(page.configForHost(host), null, String(host));
  }
  const app = read('app.js');
  const config = page.configForHost('us-a33.pages.dev');
  assert.ok(app.includes(`'${config.supabaseUrl}'`));
  assert.ok(app.includes(`'${config.apiKey}'`));
  const js = read('elimina-account.js');
  assert.match(js, /if\(!config\)\{[\s\S]*?hostNotice[\s\S]*?fieldset\.disabled=true/);
  assert.match(read('elimina-account.html'), /Configurazione non disponibile su questo dominio/);
});

test('build and service worker: page is published and never replaced by the app shell', () => {
  const build = read('scripts/build-cloudflare-pages.mjs');
  for (const file of ['elimina-account.html', 'elimina-account.js', 'account-deletion.js']) {
    assert.ok(build.includes(`'${file}'`), file);
  }
  assert.ok(read('scripts/build-capacitor-web.mjs').includes("'account-deletion.js'"));
  const sw = read('service-worker.js');
  assert.match(sw, /US_STANDALONE_DOCUMENTS = new Set\(\["\/elimina-account", "\/elimina-account\.html"\]\)/);
  const exclusion = sw.indexOf('US_STANDALONE_DOCUMENTS.has(url.pathname)) return;');
  assert.ok(exclusion > 0);
  assert.ok(exclusion < sw.indexOf('// Normal cold launch remains cache-first for speed.'));
});
