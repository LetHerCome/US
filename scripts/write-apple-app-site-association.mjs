// iOS Store V1 (05/11/2026): writes /.well-known/apple-app-site-association,
// the file with which www.uscouple.app vouches for the iPhone app that opens the
// shared invite (https://www.uscouple.app/invito#CODE) — what assetlinks.json
// does for Android. The app side is the entitlement applinks:www.uscouple.app
// (ios/App/App/App.entitlements); onboarding.js already reads the invite URL.
//
// It needs the Apple Team ID, which exists only after the Apple Developer
// account is bought (docs/store/ios/GIORNO_ACQUISTO.md):
//   node scripts/write-apple-app-site-association.mjs ABCDE12345
// then add '.well-known/apple-app-site-association' to RUNTIME_FILES in
// scripts/build-cloudflare-pages.mjs. cloudflare/_headers already serves it
// as application/json (Cloudflare Pages would send a file without extension
// as octet-stream, and iOS would ignore it). Apple's CDN does not follow
// redirects: the file must answer 200 on www.uscouple.app itself.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BUNDLE_ID = 'com.usapp.us';
export const INVITE_PATH = '/invito';
const TEAM_ID = /^[A-Z0-9]{10}$/;

export function appSiteAssociation(teamId) {
  const team = String(teamId || '').trim();
  if (!TEAM_ID.test(team)) throw new Error('Il Team ID Apple ha 10 caratteri: lettere maiuscole e cifre.');
  return {
    applinks: {
      details: [
        {
          appIDs: [`${team}.${BUNDLE_ID}`],
          // Only the invite page; the code travels in the fragment (#CODE).
          components: [{ '/': INVITE_PATH, comment: 'Invito di coppia di US' }]
        }
      ]
    }
  };
}

export async function writeAppSiteAssociation(teamId, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const target = path.join(root, '.well-known', 'apple-app-site-association');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(appSiteAssociation(teamId), null, 2)}\n`, 'utf8');
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const target = await writeAppSiteAssociation(process.argv[2]);
    console.log(`Scritto ${path.relative(process.cwd(), target)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
