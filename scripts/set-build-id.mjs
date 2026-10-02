import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const buildId = String(process.argv[2] || '').trim();

if (!/^[a-z0-9][a-z0-9._-]{7,127}$/i.test(buildId)) {
  console.error('Usage: npm run build:id -- <build-id>');
  process.exit(2);
}

const read = async (file) => fs.readFile(path.join(root, file), 'utf8');
const write = async (file, content) => fs.writeFile(path.join(root, file), content);

const indexFile = 'index.html';
const workerFile = 'service-worker.js';
const versionFile = 'version.json';
const manifestFile = 'manifest.webmanifest';

let index = await read(indexFile);
let worker = await read(workerFile);
let manifest = await read(manifestFile);

if (!/<meta name="us-build" content="[^"]+"\/>/.test(index)) {
  throw new Error('index.html is missing the us-build meta');
}
if (!/const BUILD_ID = "[^"]+";/.test(worker)) {
  throw new Error('service-worker.js is missing BUILD_ID');
}

index = index
  .replace(/<meta name="us-build" content="[^"]+"\/>/, `<meta name="us-build" content="${buildId}"/>`)
  .replace(/\?v=[^"'&\s>]+/g, `?v=${buildId}`);

worker = worker.replace(/const BUILD_ID = "[^"]+";/, `const BUILD_ID = "${buildId}";`);
manifest = manifest.replace(/\?v=[^"]+/g, `?v=${buildId}`);

await Promise.all([
  write(indexFile, index),
  write(workerFile, worker),
  write(versionFile, JSON.stringify({ version: buildId }) + '\n'),
  write(manifestFile, manifest),
]);

console.log(`US BUILD_ID -> ${buildId}`);
