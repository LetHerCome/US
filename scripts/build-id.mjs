// Production BUILD_ID (audit 27/11/2026). The service worker serves every
// ?v=<BUILD_ID> asset cache-first, so a deploy that changes app.js but keeps
// the BUILD_ID leaves installed phones on the old file. The id used to change
// only when someone ran `npm run build:id` by hand.
//
// build-cloudflare-pages.mjs now stamps <release>-<hash> into the bundle:
// <release> is the id the source carries (set with `npm run build:id`, it
// names the release), <hash> is 10 hex characters of the SHA-256 of every
// file of the bundle before stamping. Same files, same id: a deploy that only
// touches docs or tests keeps the id (no update banner); any runtime change
// gets a new one, in the same four places as scripts/set-build-id.mjs. The
// staging preview keeps its own copy of the stamp (it is tested alone in a
// temp root) and appends -s<commit> to this id.
import { createHash } from 'node:crypto';

export const BUILD_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{7,127}$/i;

export function releaseBase(worker) {
  const base = /const BUILD_ID = "([^"]+)";/.exec(worker)?.[1];
  if (!base) throw Error('service-worker.js is missing BUILD_ID');
  return base;
}

// entries: [relativePath, bytes] for every file of the bundle.
export function bundleHash(entries) {
  const hash = createHash('sha256');
  for (const [file, bytes] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    hash.update(`${file}\0${bytes.length}\0`);
    hash.update(bytes);
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function productionBuildId(worker, hash) {
  if (!/^[a-f0-9]{10,}$/.test(hash || '')) throw Error('Bad bundle hash');
  const id = `${releaseBase(worker)}-${hash.slice(0, 10)}`;
  if (!BUILD_ID_PATTERN.test(id)) throw Error(`Bad BUILD_ID: ${id}`);
  return id;
}

export function stampBuild({ index, worker, manifest }, buildId) {
  if (!BUILD_ID_PATTERN.test(buildId)) throw Error('Bad BUILD_ID');
  if (!/<meta name="us-build" content="[^"]+"\/>/.test(index)) throw Error('index.html is missing the us-build meta');
  if (!/const BUILD_ID = "[^"]+";/.test(worker)) throw Error('service-worker.js is missing BUILD_ID');
  return {
    index: index
      .replace(/<meta name="us-build" content="[^"]+"\/>/, `<meta name="us-build" content="${buildId}"/>`)
      .replace(/\?v=[^"'&\s>]+/g, `?v=${buildId}`),
    worker: worker.replace(/const BUILD_ID = "[^"]+";/, `const BUILD_ID = "${buildId}";`),
    manifest: manifest.replace(/\?v=[^"]+/g, `?v=${buildId}`),
    version: JSON.stringify({ version: buildId }) + '\n',
  };
}
