// TestFlight: give an uploaded build to the testers (17/11/2026).
//
// An upload alone reaches nobody outside App Store Connect: the build waits for
// Apple's processing, then must be added to each external group and sent to
// Beta App Review, or Bea never sees it. Through the App Store Connect API:
//   1. wait until the build is processed (VALID);
//   2. optionally write "What to test";
//   3. add it to every group that does not already get every build;
//   4. if a group is external, submit it to Beta App Review (once).
//
//   node scripts/ios-testflight-distribute.mjs <build-number> [what-to-test]
// reads ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH from the environment.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ascToken, client, BUNDLE_ID } from './ios-asc-signing.mjs';

const conflict = (error) => /→ 409 /.test(String(error?.message));

export async function distribute({
  call, buildNumber, whatToTest = '', bundleIdentifier = BUNDLE_ID,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(), timeoutMs = 50 * 60_000, pollMs = 30_000, log = console.log
}) {
  if (!/^\d+$/.test(String(buildNumber))) throw new Error(`Numero di build non valido: ${buildNumber}`);
  const apps = (await call('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleIdentifier)}&limit=10`)).data || [];
  const app = apps.find((a) => a.attributes?.bundleId === bundleIdentifier);
  if (!app) throw new Error(`App ${bundleIdentifier} non trovata in App Store Connect.`);

  const start = now();
  let build;
  for (;;) {
    build = ((await call('GET', `/v1/builds?filter[app]=${app.id}&filter[version]=${buildNumber}&limit=1`)).data || [])[0];
    const state = build?.attributes?.processingState;
    if (state === 'VALID') break;
    if (state === 'FAILED' || state === 'INVALID') throw new Error(`Apple ha scartato la build ${buildNumber} (${state}).`);
    if (now() - start > timeoutMs) throw new Error(`La build ${buildNumber} non è pronta dopo ${Math.round(timeoutMs / 60_000)} minuti (stato: ${state || 'non ancora visibile'}).`);
    log(`Build ${buildNumber}: ${state || 'non ancora visibile'}, riprovo tra ${Math.round(pollMs / 1000)} s.`);
    await wait(pollMs);
  }
  log(`Build ${buildNumber} elaborata da Apple.`);

  // "Cosa provare" is the API's whatsNew. A nicety: it never stops the build reaching the testers.
  if (whatToTest) {
    try {
      const existing = (await call('GET', `/v1/builds/${build.id}/betaBuildLocalizations`))?.data || [];
      if (existing.length) {
        for (const loc of existing) await call('PATCH', `/v1/betaBuildLocalizations/${loc.id}`, { data: { type: 'betaBuildLocalizations', id: loc.id, attributes: { whatsNew: whatToTest } } });
      } else {
        await call('POST', '/v1/betaBuildLocalizations', { data: {
          type: 'betaBuildLocalizations',
          attributes: { locale: app.attributes?.primaryLocale || 'it', whatsNew: whatToTest },
          relationships: { build: { data: { type: 'builds', id: build.id } } }
        } });
      }
      log('Scritto «Cosa provare».');
    } catch (error) {
      log(`::warning::«Cosa provare» non scritto: ${error.message}`);
    }
  }

  const groups = (await call('GET', `/v1/apps/${app.id}/betaGroups?limit=200`)).data || [];
  if (!groups.length) throw new Error('Nessun gruppo TestFlight: creane uno in App Store Connect › TestFlight.');
  let external = 0;
  for (const group of groups) {
    const { name, isInternalGroup, hasAccessToAllBuilds } = group.attributes || {};
    if (isInternalGroup && hasAccessToAllBuilds) { log(`Gruppo interno «${name}»: riceve già tutte le build.`); continue; }
    try {
      await call('POST', `/v1/betaGroups/${group.id}/relationships/builds`, { data: [{ type: 'builds', id: build.id }] });
    } catch (error) {
      if (!conflict(error)) throw error;
    }
    // Only a count: the logs are public, the testers' names and emails never go there.
    const testers = ((await call('GET', `/v1/betaGroups/${group.id}/betaTesters?limit=200`))?.data || []).length;
    log(`Build aggiunta al gruppo ${isInternalGroup ? 'interno' : 'esterno'} «${name}» (${testers} tester).`);
    if (!isInternalGroup) external += 1;
  }

  let review = 'non serve';
  if (external) {
    try {
      await call('POST', '/v1/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } } });
      review = 'inviata';
    } catch (error) {
      if (!conflict(error)) throw error;
      review = 'già inviata';
    }
    const submission = ((await call('GET', `/v1/betaAppReviewSubmissions?filter[build]=${build.id}&limit=1`))?.data || [])[0];
    log(`Verifica beta di Apple: ${review}${submission?.attributes?.betaReviewState ? ` (stato: ${submission.attributes.betaReviewState})` : ''}.`);
  }
  return { buildId: build.id, groups: groups.length, external, review };
}

async function main([buildNumber, whatToTest = '']) {
  const privateKeyPem = await readFile(process.env.ASC_KEY_PATH, 'utf8');
  // A fresh token for every request: the wait for Apple outlasts one token's 20 minutes.
  const call = (...args) => client({ token: ascToken({ keyId: process.env.ASC_KEY_ID, issuerId: process.env.ASC_ISSUER_ID, privateKeyPem }) })(...args);
  await distribute({ call, buildNumber, whatToTest });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
