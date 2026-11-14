// iOS TestFlight signing without a registered iPhone (scripts/ios-asc-signing.mjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, createVerify } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const load = () => import(pathToFileURL(path.join(ROOT, 'scripts', 'ios-asc-signing.mjs')).href);

test('token ES256 per App Store Connect: firma verificabile, scade entro 20 minuti', async () => {
  const { ascToken } = await load();
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const token = ascToken({ keyId: 'JS8GNYGY56', issuerId: 'issuer', privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), now: 1_800_000_000 });
  const [h, p, s] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'JS8GNYGY56', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { iss: 'issuer', iat: 1_800_000_000, exp: 1_800_001_200, aud: 'appstoreconnect-v1' });
  const ok = createVerify('sha256').update(`${h}.${p}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.equal(ok, true);
});

test('pulizia: solo i profili «US CI …» e i loro certificati', async () => {
  const { staleCiResources } = await load();
  const listing = { data: [
    { id: 'p1', attributes: { name: 'US CI 111' }, relationships: { certificates: { data: [{ id: 'c1' }] } } },
    { id: 'p2', attributes: { name: 'US CI 222' }, relationships: { certificates: { data: [{ id: 'c1' }, { id: 'c2' }] } } },
    { id: 'p3', attributes: { name: 'Un profilo fatto a mano' }, relationships: { certificates: { data: [{ id: 'c9' }] } } }
  ] };
  assert.deepEqual(staleCiResources(listing), { profileIds: ['p1', 'p2'], certificateIds: ['c1', 'c2'] });
  assert.deepEqual(staleCiResources({}), { profileIds: [], certificateIds: [] });
});

test('prepare: pulisce, crea certificato di distribuzione e profilo App Store per app.uscouple', async () => {
  const { prepare } = await load();
  const calls = [];
  const call = async (method, url, body) => {
    calls.push([method, url, body]);
    if (method === 'GET' && url.startsWith('/v1/profiles')) return { data: [{ id: 'old', attributes: { name: 'US CI 1' }, relationships: { certificates: { data: [{ id: 'oldcert' }] } } }] };
    if (method === 'POST' && url === '/v1/certificates') return { data: { id: 'cert1', attributes: { certificateContent: Buffer.from('DER').toString('base64') } } };
    if (method === 'GET' && url.startsWith('/v1/bundleIds')) return { data: [{ id: 'b0', attributes: { identifier: 'app.uscouple.share' } }, { id: 'b1', attributes: { identifier: 'app.uscouple' } }] };
    if (method === 'POST' && url === '/v1/profiles') return { data: { id: 'prof1', attributes: { profileContent: Buffer.from('PROFILE').toString('base64'), uuid: 'UUID-1' } } };
    return null;
  };
  const result = await prepare({ call, csrPem: '-----BEGIN CERTIFICATE REQUEST-----\nX\n-----END CERTIFICATE REQUEST-----\n', profileName: 'US CI 42', log: () => {} });
  assert.deepEqual(calls.map(([m, u]) => `${m} ${u.split('?')[0]}`), [
    'GET /v1/profiles', 'DELETE /v1/profiles/old', 'DELETE /v1/certificates/oldcert',
    'POST /v1/certificates', 'GET /v1/bundleIds', 'POST /v1/profiles'
  ]);
  assert.equal(calls[3][2].data.attributes.certificateType, 'DISTRIBUTION');
  const profileBody = calls[5][2].data;
  assert.equal(profileBody.attributes.profileType, 'IOS_APP_STORE');
  assert.equal(profileBody.relationships.bundleId.data.id, 'b1', 'esattamente app.uscouple, non un prefisso');
  assert.deepEqual(profileBody.relationships.certificates.data, [{ type: 'certificates', id: 'cert1' }]);
  assert.equal(result.certificateDer.toString(), 'DER');
  assert.equal(result.profile.toString(), 'PROFILE');
  assert.equal(result.profileUuid, 'UUID-1');
  await assert.rejects(prepare({ call, csrPem: 'x', profileName: 'Altro', log: () => {} }), /US CI/);
});

test('client: errori leggibili, DELETE di ciò che non c\'è più non blocca', async () => {
  const { client } = await load();
  const fake = (status, body) => async () => ({ ok: status < 300, status, text: async () => body });
  assert.equal(await client({ token: 't', fetchImpl: fake(404, '') })('DELETE', '/v1/certificates/x'), null);
  await assert.rejects(client({ token: 't', fetchImpl: fake(409, JSON.stringify({ errors: [{ title: 'Limite', detail: 'troppi certificati' }] })) })('POST', '/v1/certificates', {}), /409 Limite: troppi certificati/);
});

test('notifiche: sul runner le entitlements passano a production, come il profilo App Store', async () => {
  const { productionPush } = await load();
  const file = fs.readFileSync(path.join(ROOT, 'ios/App/App/App.entitlements'), 'utf8');
  assert.match(file, /<key>aps-environment<\/key>\s*<string>development<\/string>/, 'nel repository resta development');
  const out = productionPush(file);
  assert.match(out, /<key>aps-environment<\/key>\s*<string>production<\/string>/);
  assert.equal(out.replace('<string>production</string>', '<string>development</string>'), file, 'cambia solo quel valore');
  assert.throws(() => productionPush('<plist/>'), /aps-environment/);
});

test('progetto: firma manuale solo nella configurazione Release dell\'app', async () => {
  const { pinManualSigning } = await load();
  const pbx = fs.readFileSync(path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const out = pinManualSigning(pbx, { teamId: 'KW79XL4LBZ', profileName: 'US CI 42' });
  assert.equal((out.match(/CODE_SIGN_STYLE = Manual;/g) || []).length, 1);
  assert.equal((out.match(/CODE_SIGN_STYLE = Automatic;/g) || []).length, (pbx.match(/CODE_SIGN_STYLE = Automatic;/g) || []).length - 1, 'Debug resta automatico');
  assert.match(out, /CODE_SIGN_STYLE = Manual;\n\s+CODE_SIGN_IDENTITY = "Apple Distribution";\n\s+"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]" = "Apple Distribution";\n\s+DEVELOPMENT_TEAM = KW79XL4LBZ;\n\s+PROVISIONING_PROFILE_SPECIFIER = "US CI 42";/);
  const release = out.split('isa = XCBuildConfiguration;').find((b) => b.includes('CODE_SIGN_STYLE = Manual;'));
  assert.match(release, /PRODUCT_BUNDLE_IDENTIFIER = app\.uscouple;/);
  assert.match(release, /name = Release;/);
  assert.throws(() => pinManualSigning(pbx, { teamId: 'bad', profileName: 'US CI 1' }), /Team ID/);
  assert.throws(() => pinManualSigning(out, { teamId: 'KW79XL4LBZ', profileName: 'US CI 1' }), /CODE_SIGN_STYLE/);
});
