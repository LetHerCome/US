const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const file = (relative) => path.join(root, relative);
const read = (relative) => fs.readFileSync(file(relative), 'utf8');
const scripts = 'integrations/widgets/scriptable';

function executeCredentialFailurePolicy(source) {
  const signature = 'function handleCredentialFailure(error) {';
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, 'Scriptable credential-failure policy missing');
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(end > start, 'could not isolate credential-failure policy');
  const calls = [];
  const sandbox = {
    clearCredentials() { calls.push('credentials'); },
    purgeCachedPrivateData() { calls.push('cache'); }
  };
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.policy = handleCredentialFailure;`, sandbox);
  return { calls, policy: sandbox.policy };
}

function executeScriptFunctions(source, definitions, sandbox) {
  const snippets = definitions.map(([signature, name]) => {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `${name} missing`);
    const end = source.indexOf('\n}', start) + 2;
    assert.ok(end > start, `could not isolate ${name}`);
    return source.slice(start, end);
  });
  const bindings = definitions.map(([, name]) => `${name}: ${name}`).join(',');
  vm.runInNewContext(`${snippets.join('\n')}\nglobalThis.__functions = {${bindings}};`, sandbox);
  return sandbox.__functions;
}

test('401 credential failures purge private cache; network/5xx failures preserve it', () => {
  const ti = read(`${scripts}/US-Ti-Penso.js`);
  const noi = read(`${scripts}/US-Noi.js`);
  for (const source of [ti, noi]) {
    const harness = executeCredentialFailurePolicy(source);
    assert.equal(harness.policy({ status: 401 }), true);
    assert.deepEqual(harness.calls, ['credentials', 'cache']);
    harness.calls.length = 0;
    assert.equal(harness.policy({ status: 0 }), false);
    assert.equal(harness.policy({ status: 503 }), false);
    assert.deepEqual(harness.calls, []);
    assert.match(source, /handleCredentialFailure\(error\)/);
    assert.match(source, /function purgeCachedPrivateData\(\)/);
  }
});

test('401 cache purge removes Noi state/photo and Ti partner metadata but preserves nonprivate send time', () => {
  const extractFunction = (source, signature, globalName, sandbox) => {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `${signature} missing`);
    const end = source.indexOf('\n}', start) + 2;
    vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.__fn = ${globalName};`, sandbox);
  };
  const removed = [];
  const noi = read(`${scripts}/US-Noi.js`);
  const noiSandbox = {
    statePath: 'state.json',
    photoPath: 'home-photo.jpg',
    fm: { fileExists: () => true, remove: (path) => removed.push(path) }
  };
  extractFunction(noi, 'function purgeCachedPrivateData() {', 'purgeCachedPrivateData', noiSandbox);
  noiSandbox.__fn();
  assert.deepEqual(removed, ['state.json', 'home-photo.jpg']);

  const ti = read(`${scripts}/US-Ti-Penso.js`);
  let persisted;
  const tiSandbox = {
    readLocalState: () => ({ partnerName: 'Beatrice', lastSentAt: '2026-09-24T12:00:00.000Z', pendingActionId: 'retry-id' }),
    mergeLocalState: (current, updates) => Object.assign({}, current, updates),
    writeLocalState: (value) => { persisted = value; }
  };
  extractFunction(ti, 'function purgeCachedPrivateData() {', 'purgeCachedPrivateData', tiSandbox);
  tiSandbox.__fn();
  assert.equal(persisted.partnerName, '');
  assert.equal(persisted.pendingActionId, '');
  assert.equal(persisted.lastSentAt, '2026-09-24T12:00:00.000Z');
});

test('US-Noi clears shared-cache data before setup_required and before manual provisioning', async () => {
  const source = read(`${scripts}/US-Noi.js`);
  const events = [];
  const files = new Set(['state.json', 'home-photo.jpg']);
  const sandbox = {
    STATE_KEY: 'state-key', THINK_KEY: 'think-key', DEVICE_KEY: 'device-key',
    statePath: 'state.json', photoPath: 'home-photo.jpg', credentialRejectedThisRun: false,
    Keychain: { contains: () => false, remove() {} },
    fm: {
      fileExists: (path) => files.has(path),
      remove: (path) => { events.push(`remove:${path}`); files.delete(path); }
    },
    requestState: async () => { events.push('request'); throw new Error('unexpected state request'); },
    exchangeSetupCode: async () => { events.push('prompt'); throw new Error('prompt_started'); }
  };
  const functions = executeScriptFunctions(source, [
    ['function hasWidgetCredentials() {', 'hasWidgetCredentials'],
    ['function purgeCachedPrivateData() {', 'purgeCachedPrivateData'],
    ['function handleCredentialFailure(error) {', 'handleCredentialFailure'],
    ['async function ensureCredentials(allowPrompt) {', 'ensureCredentials']
  ], sandbox);

  let error;
  try { await functions.ensureCredentials(false); } catch (caught) { error = caught; events.push(caught.message); }
  assert.equal(error.message, 'setup_required');
  assert.deepEqual(events, ['remove:state.json', 'remove:home-photo.jpg', 'setup_required']);
  assert.equal(files.size, 0);

  events.length = 0;
  files.add('state.json'); files.add('home-photo.jpg');
  error = null;
  try { await functions.ensureCredentials(true); } catch (caught) { error = caught; events.push(caught.message); }
  assert.equal(error.message, 'prompt_started');
  assert.deepEqual(events, ['remove:state.json', 'remove:home-photo.jpg', 'prompt', 'prompt_started']);
  const mainStart = source.indexOf('async function main() {');
  const mainEnd = source.indexOf('  const requestedFamily', mainStart);
  assert.match(source.slice(mainStart, mainEnd), /credentialRejectedThisRun \|\| handleCredentialFailure\(error\) \|\| !hasWidgetCredentials\(\)/);
});

test('US-Ti-Penso clears private partner/retry metadata before setup_required and manual setup', async () => {
  const source = read(`${scripts}/US-Ti-Penso.js`);
  const events = [];
  const initial = { partnerName: 'Beatrice', lastSentAt: '2026-09-24T12:00:00.000Z', pendingActionId: 'retry-id', pendingActionCreatedAt: '2026-09-24T11:00:00.000Z' };
  let persisted = { ...initial };
  class TestAlert {
    constructor() { events.push('prompt'); }
    addTextField() {}
    addAction() {}
    addCancelAction() {}
    async presentAlert() { return -1; }
  }
  const sandbox = {
    STATE_KEY: 'state-key', THINK_KEY: 'think-key', DEVICE_KEY: 'device-key',
    credentialRejectedThisRun: false,
    Keychain: { contains: () => false, remove() {} },
    readLocalState: () => ({ ...persisted }),
    mergeLocalState: (current, changes) => Object.assign({}, current, changes),
    writeLocalState: (next) => { persisted = next; events.push('purge'); },
    Alert: TestAlert
  };
  const functions = executeScriptFunctions(source, [
    ['function hasWidgetCredentials() {', 'hasWidgetCredentials'],
    ['function purgeCachedPrivateData() {', 'purgeCachedPrivateData'],
    ['function handleCredentialFailure(error) {', 'handleCredentialFailure'],
    ['async function provisionIfNeeded(allowPrompt) {', 'provisionIfNeeded']
  ], sandbox);

  let error;
  try { await functions.provisionIfNeeded(false); } catch (caught) { error = caught; events.push(caught.message); }
  assert.equal(error.message, 'setup_required');
  assert.deepEqual(events, ['purge', 'setup_required']);
  assert.equal(persisted.partnerName, '');
  assert.equal(persisted.pendingActionId, '');
  assert.equal(persisted.pendingActionCreatedAt, '');
  assert.equal(persisted.lastSentAt, initial.lastSentAt);

  events.length = 0;
  persisted = { ...initial };
  error = null;
  try { await functions.provisionIfNeeded(true); } catch (caught) { error = caught; events.push(caught.message); }
  assert.equal(error.message, 'setup_cancelled');
  assert.deepEqual(events, ['purge', 'prompt', 'setup_cancelled']);
  assert.equal(persisted.partnerName, '');
  const mainStart = source.indexOf('async function main() {');
  const mainEnd = source.indexOf('  const requestedFamily', mainStart);
  assert.match(source.slice(mainStart, mainEnd), /credentialRejectedThisRun \|\| handleCredentialFailure\(error\) \|\| !hasWidgetCredentials\(\)/);
});

test('valid credentials preserve US-Noi and Ti Penso offline caches on 503', async () => {
  const noiSource = read(`${scripts}/US-Noi.js`);
  const noiFiles = new Set(['state.json', 'home-photo.jpg']);
  const noiSandbox = {
    STATE_KEY: 'state-key', THINK_KEY: 'think-key', DEVICE_KEY: 'device-key',
    statePath: 'state.json', photoPath: 'home-photo.jpg', credentialRejectedThisRun: false,
    Keychain: { contains: () => true, remove() {} },
    fm: { fileExists: (path) => noiFiles.has(path), remove: (path) => noiFiles.delete(path) },
    requestState: async () => { const error = new Error('service unavailable'); error.status = 503; throw error; }
  };
  const noi = executeScriptFunctions(noiSource, [
    ['function hasWidgetCredentials() {', 'hasWidgetCredentials'],
    ['function purgeCachedPrivateData() {', 'purgeCachedPrivateData'],
    ['function handleCredentialFailure(error) {', 'handleCredentialFailure'],
    ['async function ensureCredentials(allowPrompt) {', 'ensureCredentials']
  ], noiSandbox);
  await assert.rejects(noi.ensureCredentials(false), (error) => error.status === 503);
  assert.deepEqual([...noiFiles].sort(), ['home-photo.jpg', 'state.json']);

  const tiSource = read(`${scripts}/US-Ti-Penso.js`);
  const tiInitial = { partnerName: 'Beatrice', lastSentAt: '2026-09-24T12:00:00.000Z', pendingActionId: 'retry-id', pendingActionCreatedAt: '2026-09-24T11:00:00.000Z' };
  let tiPersisted = { ...tiInitial };
  const tiSandbox = {
    STATE_KEY: 'state-key', THINK_KEY: 'think-key', DEVICE_KEY: 'device-key', credentialRejectedThisRun: false,
    Keychain: { contains: () => true, get: () => 'valid-state-token', remove() {} },
    readLocalState: () => ({ ...tiPersisted }),
    mergeLocalState: (current, changes) => Object.assign({}, current, changes),
    writeLocalState: (next) => { tiPersisted = next; }
  };
  const ti = executeScriptFunctions(tiSource, [
    ['function hasWidgetCredentials() {', 'hasWidgetCredentials'],
    ['function purgeCachedPrivateData() {', 'purgeCachedPrivateData'],
    ['function handleCredentialFailure(error) {', 'handleCredentialFailure'],
    ['async function provisionIfNeeded(allowPrompt) {', 'provisionIfNeeded']
  ], tiSandbox);
  tiSandbox.loadState = async () => { const error = new Error('service unavailable'); error.status = 503; throw error; };
  await assert.rejects(ti.provisionIfNeeded(false), (error) => error.status === 503);
  assert.deepEqual(tiPersisted, tiInitial);
});

test('Scriptable integration contains both widgets and the install guide', () => {
  for (const name of ['US-Ti-Penso.js', 'US-Noi.js', 'README.md']) {
    assert.ok(fs.existsSync(file(`${scripts}/${name}`)), `${name} missing`);
  }
});

test('randomDeviceHash lowercases uppercase UUID output in both widgets', () => {
  const uuid = 'AABBCCDD-EEFF-4011-8222-334455667788';
  for (const name of ['US-Noi.js', 'US-Ti-Penso.js']) {
    const source = read(`${scripts}/${name}`);
    const match = source.match(/function randomDeviceHash\(\) \{[\s\S]*?\n\}/);
    assert.ok(match, `${name} randomDeviceHash missing`);
    let calls = 0;
    const sandbox = { UUID: { string: () => { calls += 1; return uuid; } } };
    vm.runInNewContext(`${match[0]}\nglobalThis.deviceHash = randomDeviceHash;`, sandbox);
    const hash = sandbox.deviceHash();
    assert.equal(calls, 2);
    assert.equal(hash, 'aabbccddeeff40118222334455667788'.repeat(2));
    assert.equal(hash.length, 64);
    assert.match(hash, /^[a-f0-9]{64}$/);
  }
});

test('setup Edge Function exchanges a short-lived code once for two independent credentials', () => {
  const fn = read('supabase/functions/widget-scriptable-setup/index.ts');
  const config = read('supabase/config.toml');
  const migration = fs.readdirSync(file('supabase/migrations'))
    .filter((name) => name.endsWith('_widget_scriptable_setup.sql'));
  assert.equal(migration.length, 1);
  const sql = read(`supabase/migrations/${migration[0]}`);
  assert.match(config, /\[functions\.widget-scriptable-setup\][\s\S]*verify_jwt\s*=\s*false/);
  assert.match(fn, /auth\.getUser/);
  assert.match(fn, /operation.*issue|issue.*operation/);
  assert.match(fn, /operation.*exchange|exchange.*operation/);
  assert.match(fn, /operation.*revoke|revoke.*operation/);
  assert.match(fn, /stateToken/);
  assert.match(fn, /thinkToken/);
  assert.match(fn, /sha256Hex/);
  assert.match(sql, /widget_scriptable_setup_codes/i);
  assert.match(sql, /widget_scriptable_installations/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /widget_tokens/i);
  assert.match(sql, /widget_action_tokens/i);
  assert.match(sql, /p_action_token_hash,\s*'think:send'/i);
  assert.match(sql, /revoked_at/i);
  assert.match(sql, /expires_at/i);
  assert.match(sql, /security definer[\s\S]*set search_path\s*=\s*''/i);
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*to\s+(?:public|anon|authenticated)/i);
  assert.doesNotMatch(fn, /console\.(?:log|info|warn).*?(?:setupCode|stateToken|thinkToken|token)/i);
});

test('existing Think endpoint remains untouched and the exchange targets the separate token authorities', () => {
  const setup = read('supabase/functions/widget-scriptable-setup/index.ts');
  const migration = fs.readdirSync(file('supabase/migrations')).find((name) => name.endsWith('_widget_scriptable_setup.sql'));
  const sql = read(`supabase/migrations/${migration}`);
  const think = read('supabase/functions/widget-think-send/index.ts');
  const originalThink = require('node:child_process').execFileSync('git', ['show', 'origin/main:supabase/functions/widget-think-send/index.ts'], { cwd: root, encoding: 'utf8' });
  const contract = read('supabase/functions/_shared/widget-think-contract.mjs');
  assert.match(setup, /widget_scriptable_exchange_internal/);
  assert.match(sql, /widget_tokens/i);
  assert.match(sql, /widget_action_tokens/i);
  assert.match(think, /widget_send_think_internal/);
  assert.match(think, /dispatchThinkWebPush/);
  assert.equal(think.replace(/\r\n/g, '\n'), originalThink.replace(/\r\n/g, '\n'));
  assert.match(contract, /query_token_forbidden/);
});

test('setup code is profile/couple-bound, expires in ten minutes, and rejects replay', () => {
  const fn = read('supabase/functions/widget-scriptable-setup/index.ts');
  const sql = read(`supabase/migrations/${fs.readdirSync(file('supabase/migrations')).find((name) => name.endsWith('_widget_scriptable_setup.sql'))}`);
  assert.match(fn, /Date\.now\(\) \+ 10 \* 60 \* 1000/);
  assert.match(sql, /profile\.id = p_profile_id and profile\.couple_id = p_couple_id/);
  assert.match(sql, /code\.consumed_at is null[\s\S]*code\.revoked_at is null[\s\S]*code\.expires_at > now\(\)/i);
  assert.match(sql, /for update[\s\S]*set consumed_at = now\(\)/i);
  assert.match(sql, /pg_advisory_xact_lock/);
});

test('exchange rejects a setup code after the issuing profile moves from couple A to B', () => {
  const migration = fs.readdirSync(file('supabase/migrations')).find((name) => name.endsWith('_widget_scriptable_setup.sql'));
  const sql = read(`supabase/migrations/${migration}`);
  const exchange = sql.slice(sql.indexOf('create or replace function public.widget_scriptable_exchange_internal'), sql.indexOf('create or replace function public.widget_scriptable_revoke_internal'));
  const setupCode = { profile_id: 'profile-1', couple_id: 'couple-a' };
  const currentProfile = { id: 'profile-1', couple_id: setupCode.couple_id };
  currentProfile.couple_id = 'couple-b';
  assert.notEqual(currentProfile.couple_id, setupCode.couple_id);
  assert.equal(currentProfile.couple_id === setupCode.couple_id, false);
  const setupLock = exchange.indexOf('for update');
  const profileLookup = exchange.indexOf('select profile.couple_id', setupLock);
  const profileLock = exchange.indexOf('for update', profileLookup);
  const membershipCheck = exchange.indexOf('current_profile_couple_id is distinct from setup_code.couple_id', profileLock);
  const firstCredentialWrite = exchange.indexOf('insert into public.widget_action_tokens', membershipCheck);
  assert.ok(setupLock >= 0 && profileLookup > setupLock && profileLock > profileLookup && membershipCheck > profileLock && firstCredentialWrite > membershipCheck);
  assert.match(exchange, /select profile\.couple_id\s+into current_profile_couple_id[\s\S]*from public\.profiles as profile[\s\S]*where profile\.id = setup_code\.profile_id[\s\S]*for update/i);
  assert.match(exchange, /if not found or current_profile_couple_id is distinct from setup_code\.couple_id then[\s\S]*widget_profile_not_linked/i);
});

test('same device hash cannot revoke Scriptable credentials owned by another profile/couple', () => {
  const migration = fs.readdirSync(file('supabase/migrations')).find((name) => name.endsWith('_widget_scriptable_setup.sql'));
  const sql = read(`supabase/migrations/${migration}`);
  const exchange = sql.slice(sql.indexOf('create or replace function public.widget_scriptable_exchange_internal'), sql.indexOf('create or replace function public.widget_scriptable_revoke_internal'));
  const installations = [
    { profile: 'profile-a', couple: 'couple-a', device: 'same-device' },
    { profile: 'profile-b', couple: 'couple-b', device: 'same-device' }
  ];
  const revoked = installations.filter((row) =>
    row.profile === 'profile-b' && row.couple === 'couple-b' && row.device === 'same-device'
  );
  assert.deepEqual(revoked.map((row) => row.profile), ['profile-b']);
  assert.match(exchange, /where old_installation\.profile_id = setup_code\.profile_id\s+and old_installation\.couple_id = setup_code\.couple_id\s+and old_installation\.device_id_hash = p_device_id_hash/i);
  assert.match(exchange, /select old_installation\.state_token_hash[\s\S]*old_installation\.profile_id = setup_code\.profile_id[\s\S]*old_installation\.couple_id = setup_code\.couple_id[\s\S]*old_installation\.device_id_hash = p_device_id_hash/i);
  assert.match(exchange, /select old_installation\.action_token_id[\s\S]*old_installation\.profile_id = setup_code\.profile_id[\s\S]*old_installation\.couple_id = setup_code\.couple_id[\s\S]*old_installation\.device_id_hash = p_device_id_hash/i);
});

test('Scriptable installation tracks shared expiry and state cleanup leaves legacy widget tokens unchanged', () => {
  const migration = fs.readdirSync(file('supabase/migrations')).find((name) => name.endsWith('_widget_scriptable_setup.sql'));
  const sql = read(`supabase/migrations/${migration}`);
  const setup = read('supabase/functions/widget-scriptable-setup/index.ts');
  assert.match(sql, /action_expiry timestamptz := now\(\) \+ interval '180 days'/);
  assert.match(sql, /action_token_id, expires_at/);
  assert.match(sql, /cron\.schedule\(/);
  assert.match(sql, /state_token\.token_hash = installation\.state_token_hash/);
  assert.match(sql, /installation\.expires_at <= now\(\)/);
  assert.match(setup, /\.gt\("expires_at", now\)/);
  assert.match(sql, /Legacy\/native widget_tokens without a Scriptable installation remain unbounded and unchanged/);
});

test('raw setup and permanent tokens stay out of database columns/logs; revocation is Scriptable-scoped', () => {
  const fn = read('supabase/functions/widget-scriptable-setup/index.ts');
  const sql = read(`supabase/migrations/${fs.readdirSync(file('supabase/migrations')).find((name) => name.endsWith('_widget_scriptable_setup.sql'))}`);
  assert.match(fn, /p_state_token_hash: await sha256Hex\(stateToken\)/);
  assert.match(fn, /p_action_token_hash: await sha256Hex\(thinkToken\)/);
  assert.match(fn, /return json\(\{ stateToken, thinkToken, expiresAt:/);
  assert.doesNotMatch(sql, /\b(?:raw_token|state_token|think_token)\s+text\b/i);
  assert.doesNotMatch(fn, /console\.(?:log|info|warn).*?(?:setupCode|stateToken|thinkToken|token)/i);
  assert.match(sql, /update public\.widget_tokens[\s\S]*select installation\.state_token_hash/i);
  assert.match(sql, /update public\.widget_action_tokens[\s\S]*select installation\.action_token_id/i);
  assert.doesNotMatch(sql, /update public\.widget_action_tokens[\s\S]{0,250}where action_token\.profile_id\s*=\s*p_profile_id/i);
  assert.doesNotMatch(read('supabase/functions/widget-device-token/index.ts'), /widget_tokens/);
});

test('Ti Penso uses only the action token, action URL contains no credential, and success follows sent:true', () => {
  const source = read(`${scripts}/US-Ti-Penso.js`);
  assert.match(source, /US_WIDGET_THINK_TOKEN/);
  assert.match(source, /widget-think-send/);
  assert.match(source, /x-us-widget-token/i);
  assert.match(source, /actionId/);
  assert.match(source, /scriptable:\/\/\/run\/US-Ti-Penso\?action=send/);
  assert.match(source, /result\.sent\s*!==\s*true/);
  assert.match(source, /lastSentAt/);
  assert.doesNotMatch(source, /\?token=|service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test('Noi reads only the state token and canonical relationship/photo fields with offline cache', () => {
  const source = read(`${scripts}/US-Noi.js`);
  assert.match(source, /US_WIDGET_STATE_TOKEN/);
  assert.match(source, /us-widget-state/);
  assert.match(source, /x-us-widget-token/i);
  assert.match(source, /relationship\.daysTogether/);
  assert.match(source, /homePhotoUrl/);
  assert.match(source, /FileManager/);
  assert.match(source, /https:\/\/usfinal\.vercel\.app/);
  assert.doesNotMatch(source, /Keychain\.get\(THINK_KEY\)|widget-think-send|\?token=|service_role/i);
  assert.doesNotMatch(source, /source\?\.bond|source\?\.xp|["']bond["']|["']xp["']/i);
});

test('US-Noi removes cached Home photo only for an authoritative null photo URL', async () => {
  const source = read(`${scripts}/US-Noi.js`);
  const signature = 'async function refreshHomePhoto(url) {';
  const start = source.indexOf(signature);
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start);
  let exists = true;
  const removed = [];
  const sandbox = {
    photoPath: 'home-photo.jpg',
    fm: { fileExists: () => exists, remove: (path) => { removed.push(path); exists = false; } },
    Request: class { constructor() { throw new Error('no download expected'); } }
  };
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.refresh = refreshHomePhoto;`, sandbox);
  await sandbox.refresh(null);
  assert.deepEqual(removed, ['home-photo.jpg']);
  assert.match(source, /const response = await ensureCredentials[\s\S]*await refreshHomePhoto\(response\.homePhotoUrl\)/);
});

test('US-Noi retains cached Home photo when a signed-photo download fails', async () => {
  const source = read(`${scripts}/US-Noi.js`);
  const signature = 'async function refreshHomePhoto(url) {';
  const start = source.indexOf(signature);
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start);
  const removed = [];
  const sandbox = {
    photoPath: 'home-photo.jpg',
    fm: { fileExists: () => true, remove: (path) => removed.push(path), writeImage() { assert.fail('failed download must not replace cached image'); } },
    Request: class { constructor() {} async loadImage() { const error = new Error('HTTP 503'); error.status = 503; throw error; } }
  };
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.refresh = refreshHomePhoto;`, sandbox);
  await sandbox.refresh('https://signed.example.test/home.jpg');
  assert.deepEqual(removed, []);
});

test('PWA Settings exposes one-time setup, active status, copy and revocation', () => {
  assert.match(read('index.html'), /data-us-setting="scriptable-widgets"/);
  const settings = read('settings.js');
  assert.match(settings, /scriptable-widgets/);
  assert.match(settings, /widget-scriptable-setup/);
  assert.match(settings, /operation:'issue'/);
  assert.match(settings, /operation:'status'/);
  assert.match(settings, /operation:'revoke'/);
  assert.match(settings, /per Scriptable, restituisce solo nomi, data e giorni insieme e Foto Home selezionata/);
  assert.match(settings, /\$\{status\.active\?'':'<button type="button" class="primary" id="usScriptableIssue">/);
  assert.match(settings, /Copia il codice/);
  assert.doesNotMatch(settings, /localStorage\.setItem\([^\n]*(?:token|credential)/i);
});

test('late Settings responses cannot write to a closed/replaced widget modal', () => {
  const settings = read('settings.js');
  const signature = 'function isCurrentSettingsModal(generation){';
  const start = settings.indexOf(signature);
  assert.notEqual(start, -1, 'settings modal ownership helper missing');
  const end = settings.indexOf('\n}', start) + 2;
  const sandbox = {
    settingsModalGeneration: 7,
    rootOpen: true,
    $: (id) => id === 'usSettingsOverlay' ? { classList: { contains: (name) => name === 'open' && sandbox.rootOpen } } : null
  };
  vm.runInNewContext(`${settings.slice(start, end)}\nglobalThis.isCurrent = isCurrentSettingsModal;`, sandbox);
  assert.equal(sandbox.isCurrent(7), true);
  assert.equal(sandbox.isCurrent(6), false);
  sandbox.rootOpen = false;
  assert.equal(sandbox.isCurrent(7), false);
  assert.ok((settings.match(/isCurrentSettingsModal\(modalGeneration\)/g) || []).length >= 5);
  assert.match(settings, /const status=await refreshStatus\(\);\s*if\(!isCurrentSettingsModal\(modalGeneration\)\)return;/);
  assert.match(settings, /operation:'issue'\}\}\);\s*if\(!isCurrentSettingsModal\(modalGeneration\)\)return;/);
  assert.match(settings, /await navigator\.clipboard\.writeText\(codeToCopy\);\s*if\(!isCurrentSettingsModal\(modalGeneration\)\)return;/);
  assert.match(settings, /operation:'revoke'\}\}\);\s*if\(!isCurrentSettingsModal\(modalGeneration\)\)return;/);
  assert.match(settings, /function closeModal\(\)[\s\S]*settingsModalGeneration\+=1[\s\S]*if\(scriptableSetupCodeOpen\)/);
  assert.match(settings, /function openModal\([\s\S]*settingsModalGeneration\+=1[\s\S]*scriptableSetupCodeOpen/);
  assert.match(settings, /function openModal\([\s\S]*if\(scriptableSetupCodeOpen\)\{modalBody\.innerHTML='';scriptableSetupCodeOpen=false;\}\s*scriptableSetupCode='';/);
  assert.match(settings, /function closeModal\(\)[\s\S]*if\(scriptableSetupCodeOpen\)\{\$\('usSettingsModalBody'\)\.innerHTML='';scriptableSetupCodeOpen=false;\}\s*scriptableSetupCode='';/);
});

test('README has the exact no-Mac Scriptable installation and revoke steps', () => {
  const readme = read(`${scripts}/README.md`);
  for (const text of [/App Store/i, /No Mac/i, /Small Ti Penso/i, /Medium Ti Penso/i, /Medium Noi/i, /revoc/i]) {
    assert.match(readme, text);
  }
});

test('Scriptable scripts parse as module scripts and require no browser runtime', () => {
  const execFileSync = require('node:child_process').execFileSync;
  for (const name of ['US-Ti-Penso.js', 'US-Noi.js']) {
    const source = read(`${scripts}/${name}`);
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: source, cwd: root, encoding: 'utf8' });
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage)\b|\bfetch\s*\(/i);
    assert.match(source, /ListWidget/);
    assert.match(source, /Request/);
    assert.match(source, /Keychain/);
    assert.ok(source.indexOf('Keychain.set(DEVICE_KEY, deviceIdHash)') < source.indexOf('/functions/v1/widget-scriptable-setup'));
    assert.match(source, /Script\.setWidget\(widget\)/);
    assert.match(source, /presentSmall\(\)/);
    assert.match(source, /presentMedium\(\)/);
    assert.match(source, /Script\.complete\(\)/);
  }
  assert.match(read(`${scripts}/US-Ti-Penso.js`), /args\.queryParameters/);
  assert.match(read(`${scripts}/US-Noi.js`), /FileManager/);
});

test('Scriptable work does not add iOS, Xcode, WidgetKit, Android or Capacitor build changes', () => {
  const changed = require('node:child_process').execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
  assert.doesNotMatch(changed, /^(?:\s?M|\?\?)\s+(?:ios\/|.*WidgetKit|android\/|capacitor\.config)/m);
});
