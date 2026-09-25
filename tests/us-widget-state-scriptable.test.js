const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const source = () => read('supabase/functions/us-widget-state/index.ts');

function loadHelpers(sourceText) {
  function extract(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = sourceText.match(new RegExp(`function ${escaped}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(match, `${name} helper missing`);
    return match[0];
  }
  const sandbox = { daysBetween: () => 42 };
  const selected = [
    extract('isActiveScriptableInstallation'),
    extract('makeScriptableWidgetState')
  ].join('\n').replace(/:\s*(?:any|string|number|boolean)(?:\s*\|\s*null)?/g, '');
  vm.runInNewContext(`${selected}\nglobalThis.__isActive = isActiveScriptableInstallation;\nglobalThis.__buildState = makeScriptableWidgetState;`, sandbox);
  return sandbox;
}

test('us-widget-state local config preserves live verify_jwt=false mode', () => {
  assert.match(read('supabase/config.toml'), /\[functions\.us-widget-state\]\s*verify_jwt\s*=\s*false/);
});

test('expired or revoked Scriptable installation rejects even when widget token row remains unrevoked', () => {
  const code = source();
  const helpers = loadHelpers(code);
  const now = Date.parse('2026-09-25T10:00:00.000Z');
  const tokenRow = { profile_id: 'profile-b', couple_id: 'couple-b' };
  const active = { profile_id: 'profile-b', couple_id: 'couple-b', revoked_at: null, expires_at: '2026-09-25T10:01:00.000Z' };
  const expired = { ...active, expires_at: '2026-09-25T09:59:00.000Z' };
  const revoked = { ...active, revoked_at: '2026-09-25T09:00:00.000Z' };
  assert.equal(helpers.__isActive(active, tokenRow, now), true);
  assert.equal(helpers.__isActive(expired, tokenRow, now), false);
  assert.equal(helpers.__isActive(revoked, tokenRow, now), false);
  assert.equal(helpers.__isActive({ ...active, profile_id: 'profile-a', couple_id: 'couple-a' }, tokenRow, now), false);
  assert.match(code, /widget_scriptable_installations/);
  assert.match(code, /isActiveScriptableInstallation\(scriptableInstallation, tokenRow/);
  assert.match(code, /return json\(\{ error: "invalid_token" \}, 401\)/);
});

test('orphan Scriptable state token returns 401 instead of falling through to legacy data', () => {
  const code = source();
  const match = code.match(/function isOrphanedScriptableToken\([^\n]*\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'orphan Scriptable-token guard missing');
  const jsFunction = match[0].replace(/:\s*any/g, '');
  const sandbox = {};
  vm.runInNewContext(`${jsFunction}\nglobalThis.isOrphan = isOrphanedScriptableToken;`, sandbox);
  assert.equal(sandbox.isOrphan({ device_label: 'Scriptable' }, null), true);
  assert.equal(sandbox.isOrphan({ device_label: 'Scriptable' }, { state_token_hash: 'mapped' }), false);
  assert.equal(sandbox.isOrphan({ device_label: 'Native' }, null), false);
  const guard = code.indexOf('isOrphanedScriptableToken(tokenRow, scriptableInstallation)');
  const lastUsed = code.indexOf('.update({ last_used_at:');
  const legacyBranch = code.indexOf('\n    const today = romeToday();', code.indexOf('if (isScriptableToken) {'));
  assert.ok(guard >= 0 && guard < lastUsed && guard < legacyBranch);
  assert.match(code, /if \(isOrphanedScriptableToken\(tokenRow, scriptableInstallation\)\)\s*return json\(\{ error: "invalid_token" \}, 401\)/);
  assert.match(code, /const isScriptableToken = Boolean\(scriptableInstallation\)/);
});

test('Scriptable expiry rejection occurs before last-used updates, signed photos, and legacy metadata queries', () => {
  const code = source();
  const lookup = code.indexOf('.from("widget_scriptable_installations")');
  const reject = code.indexOf('isActiveScriptableInstallation(scriptableInstallation, tokenRow');
  const lastUsed = code.indexOf('.update({ last_used_at:');
  const signedPhoto = code.indexOf('createSignedUrl');
  const legacyEvents = code.indexOf('.from("shared_events")');
  assert.ok(lookup >= 0 && lookup < reject);
  assert.ok(reject < lastUsed);
  assert.ok(reject < signedPhoto);
  assert.ok(reject < legacyEvents);
});

test('Scriptable payload contains only V1 fields and never inherits unrelated legacy data', () => {
  const helpers = loadHelpers(source());
  const payload = helpers.__buildState(
    '2026-09-25', '2026-09-25T10:00:00.000Z',
    { display_name: 'Francesco', role: 'owner', email: 'private@example.test' },
    { display_name: 'Beatrice', role: 'partner', email: 'private2@example.test' },
    { started_on: '2024-01-01', bond_xp: 900, location: 'private-location' },
    'https://signed.example.test/home.jpg'
  );
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    version: 1,
    generatedAt: '2026-09-25T10:00:00.000Z',
    todayDate: '2026-09-25',
    user: { displayName: 'Francesco', partnerName: 'Beatrice' },
    relationship: { startedOn: '2024-01-01', daysTogether: 42 },
    homePhotoUrl: 'https://signed.example.test/home.jpg'
  });
  assert.doesNotMatch(JSON.stringify(payload), /"(?:role|email|bond|location|nextEvent|today|lastThink|note)"/);
});

test('canonical absence of Home photo is the only null photo result', () => {
  const code = source();
  const match = code.match(/function resolveHomePhotoUrl\([^\n]*\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'photo signing result resolver missing');
  const jsFunction = match[0].replace(/:\s*(?:string|any)(?:\s*\|\s*null)?/g, '');
  const sandbox = {};
  vm.runInNewContext(`${jsFunction}\nglobalThis.resolve = resolveHomePhotoUrl;`, sandbox);
  assert.equal(sandbox.resolve(null, null, null), null);
  assert.equal(sandbox.resolve('', null, null), null);
  assert.equal(sandbox.resolve('home/photo.jpg', { signedUrl: 'https://signed.example.test/home.jpg' }, null), 'https://signed.example.test/home.jpg');
});

test('Home photo signing failure is an error, never an authoritative null', () => {
  const code = source();
  const match = code.match(/function resolveHomePhotoUrl\([^\n]*\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'photo signing result resolver missing');
  const jsFunction = match[0].replace(/:\s*(?:string|any)(?:\s*\|\s*null)?/g, '');
  const sandbox = {};
  vm.runInNewContext(`${jsFunction}\nglobalThis.resolve = resolveHomePhotoUrl;`, sandbox);
  assert.throws(() => sandbox.resolve('home/photo.jpg', null, { message: 'signing failed' }), /home_photo_signing_failed/);
  assert.throws(() => sandbox.resolve('home/photo.jpg', null, null), /home_photo_signing_failed/);
  assert.match(code, /resolveHomePhotoUrl\(couple\.home_photo_path/);
  assert.match(code, /catch \(error\)[\s\S]*return json\(\{ error: "widget_state_failed" \}, 500\)/);
});

test('legacy/native widget token without installation retains the full v3 response on photo signing failure', async () => {
  const code = source();
  const guard = code.indexOf('if (isScriptableToken) {');
  const legacyEvents = code.indexOf('.from("shared_events")');
  const legacyQuestion = code.indexOf('.from("daily_questions")');
  const legacyThink = code.indexOf('.from("shared_messages")');
  const legacyReturn = code.indexOf('nextEvent: nextEvent ?');
  const legacyBranch = code.indexOf('\n    const today = romeToday();', guard);
  assert.ok(guard >= 0 && legacyBranch > guard && legacyEvents > legacyBranch && legacyQuestion > legacyBranch && legacyThink > legacyBranch && legacyReturn > legacyBranch);
  const scriptableBranch = code.slice(guard, legacyBranch);
  assert.match(scriptableBranch, /select\("started_on,home_photo_path"\)/);
  assert.match(scriptableBranch, /select\("id,display_name"\)/);
  assert.doesNotMatch(scriptableBranch, /shared_events|daily_questions|daily_answers|shared_messages|bond_xp/);

  const legacyPhotoStart = code.indexOf('    let homePhotoUrl: string | null = null;', legacyBranch);
  const legacyPhotoEnd = code.indexOf('\n\n    const upcoming', legacyPhotoStart);
  assert.ok(legacyPhotoStart >= 0 && legacyPhotoEnd > legacyPhotoStart, 'legacy v3 photo fallback block missing');
  const legacyPhotoBlock = code.slice(legacyPhotoStart, legacyPhotoEnd).replace('let homePhotoUrl: string | null = null;', 'let homePhotoUrl = null;');
  async function resolveLegacyPhoto(couple, signedResult) {
    let signCalls = 0;
    const sandbox = {
      couple,
      admin: { storage: { from: (bucket) => ({ createSignedUrl: async (path) => {
        assert.equal(bucket, 'us-media');
        signCalls += 1;
        return signedResult;
      } }) } }
    };
    const value = await vm.runInNewContext(`(async()=>{${legacyPhotoBlock}\nreturn homePhotoUrl;})()`, sandbox);
    return { value, signCalls };
  }
  assert.deepEqual(await resolveLegacyPhoto({ home_photo_path: 'home/photo.jpg' }, { data: null, error: { message: 'signing failed' } }), { value: null, signCalls: 1 });
  assert.deepEqual(await resolveLegacyPhoto({ home_photo_path: null }, { data: null, error: null }), { value: null, signCalls: 0 });
  assert.deepEqual(await resolveLegacyPhoto({ home_photo_path: 'home/photo.jpg' }, { data: { signedUrl: 'https://signed.example.test/home.jpg' }, error: null }), { value: 'https://signed.example.test/home.jpg', signCalls: 1 });

  const legacyResponse = code.slice(legacyPhotoEnd, code.indexOf('\n  } catch (error)', legacyPhotoEnd));
  assert.match(legacyResponse, /return json\(\{/);
  assert.match(legacyResponse, /user: \{ displayName: me\.display_name, partnerName: partner\?\.display_name \|\| "Partner", role: me\.role \}/);
  assert.match(legacyResponse, /relationship: \{ startedOn: couple\.started_on, daysTogether: relationshipDays \}/);
  assert.match(legacyResponse, /homePhotoUrl,/);
  assert.match(legacyResponse, /nextEvent: nextEvent \?/);
  assert.match(legacyResponse, /today: \{ state: todayState \}/);
  assert.match(legacyResponse, /lastThink,/);
  assert.match(legacyResponse, /bond\n\s*\}/);
  assert.match(code, /\.from\("widget_tokens"\)[\s\S]*\.eq\("token_hash", tokenHash\)[\s\S]*\.is\("revoked_at", null\)/);
  assert.match(code, /url\.searchParams\.get\("token"\)/);
});
