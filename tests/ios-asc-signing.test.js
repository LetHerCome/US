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

test('prepare: pulisce, crea un certificato e i profili App Store di app.uscouple e app.uscouple.widgets', async () => {
  const { prepare } = await load();
  const calls = [];
  const call = async (method, url, body) => {
    calls.push([method, url, body]);
    if (method === 'GET' && url.startsWith('/v1/profiles')) return { data: [{ id: 'old', attributes: { name: 'US CI 1' }, relationships: { certificates: { data: [{ id: 'oldcert' }] } } }] };
    if (method === 'POST' && url === '/v1/certificates') return { data: { id: 'cert1', attributes: { certificateContent: Buffer.from('DER').toString('base64') } } };
    if (method === 'GET' && url.startsWith('/v1/bundleIds?')) return { data: [{ id: 'b0', attributes: { identifier: 'app.uscouple.share' } }, { id: 'b1', attributes: { identifier: 'app.uscouple' } }, { id: 'b2', attributes: { identifier: 'app.uscouple.widgets' } }] };
    if (method === 'GET' && /\/v1\/bundleIds\/b[12]\/bundleIdCapabilities/.test(url)) return { data: [{ attributes: { capabilityType: 'PUSH_NOTIFICATIONS' } }, { attributes: { capabilityType: 'APP_GROUPS' } }] };
    if (method === 'POST' && url === '/v1/profiles') {
      const n = calls.filter(([m, u]) => m === 'POST' && u === '/v1/profiles').length;
      return { data: { id: `prof${n}`, attributes: { profileContent: Buffer.from(`PROFILE${n}`).toString('base64'), uuid: `UUID-${n}` } } };
    }
    return null;
  };
  const result = await prepare({ call, csrPem: '-----BEGIN CERTIFICATE REQUEST-----\nX\n-----END CERTIFICATE REQUEST-----\n', profileName: 'US CI 42', log: () => {} });
  assert.deepEqual(calls.map(([m, u]) => `${m} ${u.split('?')[0]}`), [
    'GET /v1/profiles', 'DELETE /v1/profiles/old', 'DELETE /v1/certificates/oldcert',
    'GET /v1/bundleIds', 'GET /v1/bundleIds/b1/bundleIdCapabilities',
    'GET /v1/bundleIds', 'GET /v1/bundleIds/b2/bundleIdCapabilities',
    'POST /v1/certificates', 'POST /v1/profiles', 'POST /v1/profiles'
  ], 'prima gli identificativi, poi il certificato');
  // Apple answers 400 to any query parameter on this relationship (run 44086502501, 17/11/2026).
  for (const [, url] of calls.filter(([, u]) => u.includes('bundleIdCapabilities'))) assert.doesNotMatch(url, /\?/, url);
  assert.equal(calls[7][2].data.attributes.certificateType, 'DISTRIBUTION');
  const appProfile = calls[8][2].data;
  const widgetsProfile = calls[9][2].data;
  assert.equal(appProfile.attributes.profileType, 'IOS_APP_STORE');
  assert.equal(appProfile.attributes.name, 'US CI 42');
  assert.equal(appProfile.relationships.bundleId.data.id, 'b1', 'esattamente app.uscouple, non un prefisso');
  assert.equal(widgetsProfile.attributes.name, 'US CI 42 widgets', 'anche il profilo dei widget inizia con «US CI » e la prossima build lo toglie');
  assert.equal(widgetsProfile.relationships.bundleId.data.id, 'b2');
  assert.deepEqual(widgetsProfile.relationships.certificates.data, [{ type: 'certificates', id: 'cert1' }], 'stesso certificato');
  assert.equal(result.certificateDer.toString(), 'DER');
  assert.deepEqual(result.profiles.map((p) => [p.bundleIdentifier, p.name, p.uuid, p.content.toString()]), [
    ['app.uscouple', 'US CI 42', 'UUID-1', 'PROFILE1'],
    ['app.uscouple.widgets', 'US CI 42 widgets', 'UUID-2', 'PROFILE2']
  ]);
  assert.equal(result.profile.toString(), 'PROFILE1');
  assert.equal(result.profileUuid, 'UUID-1');
  await assert.rejects(prepare({ call, csrPem: 'x', profileName: 'Altro', log: () => {} }), /US CI/);
});

test('prepare: senza i passi a mano su developer.apple.com si ferma e dice quali', async () => {
  const { prepare } = await load();
  const posted = [];
  const base = async (method, url) => {
    if (method === 'POST') posted.push(url);
    if (method === 'GET' && url.startsWith('/v1/profiles')) return { data: [] };
    if (method === 'POST' && url === '/v1/certificates') return { data: { id: 'cert1', attributes: { certificateContent: '' } } };
    if (method === 'POST' && url === '/v1/profiles') return { data: { id: 'p', attributes: { profileContent: '', uuid: 'U' } } };
    return null;
  };
  const noWidgetsId = async (method, url, body) => {
    if (method === 'GET' && url.startsWith('/v1/bundleIds?')) return { data: url.includes('widgets') ? [] : [{ id: 'b1', attributes: { identifier: 'app.uscouple' } }] };
    if (method === 'GET' && url.includes('bundleIdCapabilities')) return { data: [{ attributes: { capabilityType: 'APP_GROUPS' } }] };
    return base(method, url, body);
  };
  await assert.rejects(prepare({ call: noWidgetsId, csrPem: 'x', profileName: 'US CI 1', log: () => {} }), /app\.uscouple\.widgets non trovato[\s\S]*§4\.4/);
  const noGroups = async (method, url, body) => {
    if (method === 'GET' && url.startsWith('/v1/bundleIds?')) return { data: [{ id: 'b1', attributes: { identifier: 'app.uscouple' } }] };
    if (method === 'GET' && url.includes('bundleIdCapabilities')) return { data: [{ attributes: { capabilityType: 'PUSH_NOTIFICATIONS' } }] };
    return base(method, url, body);
  };
  await assert.rejects(prepare({ call: noGroups, csrPem: 'x', profileName: 'US CI 1', log: () => {} }), /App Groups non è attivo su app\.uscouple[\s\S]*group\.app\.uscouple\.shared/);
  assert.deepEqual(posted, [], 'nessun certificato né profilo lasciato su Apple quando si ferma');
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

test('progetto: firma manuale solo nelle configurazioni Release dell\'app e dei widget', async () => {
  const { pinManualSigning, widgetsProfileName, WIDGETS_BUNDLE_ID } = await load();
  const pbx = fs.readFileSync(path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const app = pinManualSigning(pbx, { teamId: 'KW79XL4LBZ', profileName: 'US CI 42' });
  const out = pinManualSigning(app, { teamId: 'KW79XL4LBZ', profileName: widgetsProfileName('US CI 42'), bundleIdentifier: WIDGETS_BUNDLE_ID });
  assert.equal((out.match(/CODE_SIGN_STYLE = Manual;/g) || []).length, 2);
  assert.equal((out.match(/CODE_SIGN_STYLE = Automatic;/g) || []).length, (pbx.match(/CODE_SIGN_STYLE = Automatic;/g) || []).length - 2, 'Debug resta automatico');
  assert.match(out, /CODE_SIGN_STYLE = Manual;\n\s+CODE_SIGN_IDENTITY = "Apple Distribution";\n\s+"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]" = "Apple Distribution";\n\s+DEVELOPMENT_TEAM = KW79XL4LBZ;\n\s+PROVISIONING_PROFILE_SPECIFIER = "US CI 42";/);
  const blocks = out.split('isa = XCBuildConfiguration;').filter((b) => b.includes('CODE_SIGN_STYLE = Manual;'));
  assert.match(blocks[0], /PRODUCT_BUNDLE_IDENTIFIER = app\.uscouple;/);
  assert.match(blocks[0], /name = Release;/);
  assert.match(blocks[1], /PRODUCT_BUNDLE_IDENTIFIER = app\.uscouple\.widgets;/);
  assert.match(blocks[1], /PROVISIONING_PROFILE_SPECIFIER = "US CI 42 widgets";/);
  assert.match(blocks[1], /name = Release;/);
  assert.throws(() => pinManualSigning(pbx, { teamId: 'bad', profileName: 'US CI 1' }), /Team ID/);
  assert.throws(() => pinManualSigning(app, { teamId: 'KW79XL4LBZ', profileName: 'US CI 1' }), /CODE_SIGN_STYLE/);
});

test('workflow TestFlight: installa ed esporta con i due profili', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/ios-testflight.yml'), 'utf8');
  assert.match(workflow, /done < "\$SIGN\/profiles\.txt"/);
  assert.match(workflow, /<key>app\.uscouple<\/key><string>\$\{US_SIGN_PROFILE_NAME\}<\/string>/);
  assert.match(workflow, /<key>app\.uscouple\.widgets<\/key><string>\$\{US_SIGN_PROFILE_NAME\} widgets<\/string>/);
});
