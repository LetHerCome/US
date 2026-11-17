// iOS TestFlight signing without a registered iPhone (14/11/2026).
//
// Xcode automatic signing archives with a *development* profile, and Apple
// creates one only when the team has at least one registered device. The team
// has none (the founder works on Windows), so the archive failed with
// "Your team has no devices from which to generate a provisioning profile".
//
// Instead, on the macOS runner and through the App Store Connect API:
//   1. revoke what earlier runs left (profiles named "US CI …" and their
//      distribution certificates): Apple allows only a few of them, and a run
//      is long processed by the time the next one starts;
//   2. create an Apple Distribution certificate from a CSR made on the runner
//      (the private key never leaves the runner);
//   3. create an App Store profile for each bundle id with that certificate:
//      the app and, since the widgets (W0, 14/11/2026), its WidgetKit
//      extension app.uscouple.widgets, which needs App Groups on both ids;
//   4. switch only the Release configurations of the App and UsWidgets
//      targets to manual signing with those profiles (in the runner's
//      checkout, never committed).
// App Store profiles need no devices. Nothing is stored in GitHub besides the
// App Store Connect API key that already signs the requests.
//
//   node scripts/ios-asc-signing.mjs prepare <csr.pem> <out-dir> <profile-name>
//   node scripts/ios-asc-signing.mjs pin-project <project.pbxproj> <team-id> <profile-name>
// The extension's profile is "<profile-name> widgets".
// prepare reads ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH from the environment.
import { createPrivateKey, sign } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const API = 'https://api.appstoreconnect.apple.com';
export const BUNDLE_ID = 'app.uscouple';
export const WIDGETS_BUNDLE_ID = 'app.uscouple.widgets';
export const CI_PROFILE_PREFIX = 'US CI ';
export const widgetsProfileName = (profileName) => `${profileName} widgets`;

// What the API cannot do and the founder does once on developer.apple.com
// (docs/missions/ios-store-v1.md §4.4).
const PORTAL_STEPS = 'developer.apple.com › Certificates, Identifiers & Profiles › Identifiers (missione iOS §4.4)';

const b64url = (value) => Buffer.from(value).toString('base64url');

// ES256 JWT for the App Store Connect API (at most 20 minutes).
export function ascToken({ keyId, issuerId, privateKeyPem, now = Math.floor(Date.now() / 1000) }) {
  if (!keyId || !issuerId || !privateKeyPem) throw new Error('Chiave App Store Connect incompleta.');
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey(privateKeyPem), dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

export function client({ token, fetchImpl = fetch }) {
  return async function call(method, url, body) {
    const response = await fetchImpl(url.startsWith('http') ? url : `${API}${url}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (method === 'DELETE' && [404, 409].includes(response.status)) return null; // already gone
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 500);
      try { detail = JSON.parse(text).errors.map((e) => `${e.title}: ${e.detail}`).join(' | '); } catch (_) {}
      throw new Error(`${method} ${url.replace(API, '')} → ${response.status} ${detail}`);
    }
    return text ? JSON.parse(text) : null;
  };
}

// Profiles made by earlier runs and the certificates they point to.
export function staleCiResources(listing) {
  const profiles = (listing?.data || []).filter((p) => String(p.attributes?.name || '').startsWith(CI_PROFILE_PREFIX));
  const certificates = new Set();
  for (const profile of profiles) for (const ref of profile.relationships?.certificates?.data || []) certificates.add(ref.id);
  return { profileIds: profiles.map((p) => p.id), certificateIds: [...certificates] };
}

export async function prepare({ call, csrPem, profileName, bundleIdentifiers = [BUNDLE_ID, WIDGETS_BUNDLE_ID], log = console.log }) {
  if (!profileName.startsWith(CI_PROFILE_PREFIX)) throw new Error(`Il nome del profilo deve iniziare con «${CI_PROFILE_PREFIX}».`);
  const stale = staleCiResources(await call('GET', '/v1/profiles?limit=200&include=certificates'));
  for (const id of stale.profileIds) await call('DELETE', `/v1/profiles/${id}`);
  for (const id of stale.certificateIds) await call('DELETE', `/v1/certificates/${id}`);
  log(`Tolti ${stale.profileIds.length} profili e ${stale.certificateIds.length} certificati delle build precedenti.`);

  // Every bundle id and its App Group first (17/11/2026): a missing one stops
  // the run before a certificate exists, so a failure never leaves one behind.
  const bundles = [];
  for (const bundleIdentifier of bundleIdentifiers) {
    const found = (await call('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleIdentifier)}&limit=200`)).data || [];
    const bundle = found.find((b) => b.attributes?.identifier === bundleIdentifier);
    if (!bundle) throw new Error(`Identificativo ${bundleIdentifier} non trovato nell'account Apple: crealo con App Groups su ${PORTAL_STEPS}.`);
    if (bundleIdentifiers.length > 1) {
      // The widgets share data through the App Group: without it the profile would sign an app that cannot read it.
      // This relationship takes no query parameters (Apple answers 400 to ?limit).
      const capabilities = (await call('GET', `/v1/bundleIds/${bundle.id}/bundleIdCapabilities`))?.data || [];
      if (!capabilities.some((c) => c.attributes?.capabilityType === 'APP_GROUPS')) {
        throw new Error(`App Groups non è attivo su ${bundleIdentifier}: attivalo e scegli group.app.uscouple.shared su ${PORTAL_STEPS}.`);
      }
    }
    bundles.push({ bundleIdentifier, bundle });
  }

  const certificate = (await call('POST', '/v1/certificates', {
    data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csrPem } }
  })).data;

  const profiles = [];
  for (const { bundleIdentifier, bundle } of bundles) {
    const name = bundleIdentifier === bundleIdentifiers[0] ? profileName : widgetsProfileName(profileName);
    const profile = (await call('POST', '/v1/profiles', {
      data: {
        type: 'profiles',
        attributes: { name, profileType: 'IOS_APP_STORE' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: bundle.id } },
          certificates: { data: [{ type: 'certificates', id: certificate.id }] }
        }
      }
    })).data;
    profiles.push({
      bundleIdentifier,
      name,
      content: Buffer.from(profile.attributes.profileContent, 'base64'),
      uuid: profile.attributes.uuid
    });
    log(`Creato il profilo App Store «${name}» per ${bundleIdentifier}.`);
  }
  log(`Creato il certificato di distribuzione ${certificate.id}.`);
  return {
    certificateDer: Buffer.from(certificate.attributes.certificateContent, 'base64'),
    profiles,
    profile: profiles[0].content,
    profileUuid: profiles[0].uuid
  };
}

// Manual signing for one target's Release configuration only (the App, then
// UsWidgets): the block that holds that bundle id and is named Release. Package targets keep
// their own settings, so nothing asks them for a profile.
export function pinManualSigning(pbx, { teamId, profileName, bundleIdentifier = BUNDLE_ID }) {
  if (!/^[A-Z0-9]{10}$/.test(teamId)) throw new Error('Team ID non valido.');
  let pinned = 0;
  const out = pbx.replace(/isa = XCBuildConfiguration;[\s\S]*?name = (Debug|Release);/g, (block, name) => {
    if (name !== 'Release' || !block.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${bundleIdentifier};`)) return block;
    if (!block.includes('CODE_SIGN_STYLE = Automatic;')) throw new Error('Configurazione Release senza CODE_SIGN_STYLE = Automatic.');
    pinned += 1;
    return block.replace(/(\n(\s*))CODE_SIGN_STYLE = Automatic;/, (_, nl, indent) => [
      `${nl}CODE_SIGN_STYLE = Manual;`,
      `${nl}CODE_SIGN_IDENTITY = "Apple Distribution";`,
      `${nl}"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";`,
      `${nl}DEVELOPMENT_TEAM = ${teamId};`,
      `${nl}PROVISIONING_PROFILE_SPECIFIER = "${profileName}";`
    ].join(''));
  });
  if (pinned !== 1) throw new Error(`Attesa una sola configurazione Release dell'app, trovate ${pinned}.`);
  return out;
}

// An App Store profile carries aps-environment = production; with manual
// signing the entitlements file must say the same (automatic signing used to
// rewrite it at export). Runner checkout only.
export function productionPush(entitlements) {
  const out = entitlements.replace(/(<key>aps-environment<\/key>\s*<string>)development(<\/string>)/, '$1production$2');
  if (!/<key>aps-environment<\/key>\s*<string>production<\/string>/.test(out)) throw new Error('aps-environment non trovato nelle entitlements.');
  return out;
}

async function main([command, ...args]) {
  if (command === 'prepare') {
    const [csrPath, outDir, profileName] = args;
    const token = ascToken({
      keyId: process.env.ASC_KEY_ID,
      issuerId: process.env.ASC_ISSUER_ID,
      privateKeyPem: await readFile(process.env.ASC_KEY_PATH, 'utf8')
    });
    const result = await prepare({ call: client({ token }), csrPem: await readFile(csrPath, 'utf8'), profileName });
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'distribution.cer'), result.certificateDer);
    // One line per profile: "<uuid> <file>", installed by the workflow.
    const lines = [];
    for (const profile of result.profiles) {
      const fileName = profile.bundleIdentifier === BUNDLE_ID ? 'US_AppStore.mobileprovision' : `US_AppStore_${profile.bundleIdentifier.split('.').pop()}.mobileprovision`;
      await writeFile(path.join(outDir, fileName), profile.content);
      lines.push(`${profile.uuid} ${fileName}`);
    }
    await writeFile(path.join(outDir, 'profiles.txt'), `${lines.join('\n')}\n`);
    await writeFile(path.join(outDir, 'profile-uuid.txt'), `${result.profileUuid}\n`);
    return;
  }
  if (command === 'pin-project') {
    const [pbxPath, teamId, profileName] = args;
    let pbx = pinManualSigning(await readFile(pbxPath, 'utf8'), { teamId, profileName });
    if (pbx.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${WIDGETS_BUNDLE_ID};`)) {
      pbx = pinManualSigning(pbx, { teamId, profileName: widgetsProfileName(profileName), bundleIdentifier: WIDGETS_BUNDLE_ID });
    }
    await writeFile(pbxPath, pbx);
    const entitlementsPath = path.join(path.dirname(path.dirname(pbxPath)), 'App', 'App.entitlements');
    await writeFile(entitlementsPath, productionPush(await readFile(entitlementsPath, 'utf8')));
    console.log(`Firma manuale per la configurazione Release dell'app con «${profileName}».`);
    return;
  }
  throw new Error('Uso: prepare <csr.pem> <out-dir> <profile-name> | pin-project <project.pbxproj> <team-id> <profile-name>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
