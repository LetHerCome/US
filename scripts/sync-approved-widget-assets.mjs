import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'assets', 'ASSET_MANIFEST.json'), 'utf8'));
const destinationRoot = path.join(ROOT, 'native-plugins', 'us-widget-bridge', 'android', 'src', 'main', 'res', 'drawable-nodpi');
const derivatives = [
  ['assets/source/ui/us-icon-ti-penso-v1.png', 'us_icon_ti_penso_v1.png'],
  ['assets/source/brand/us-wordmark-v1.png', 'us_wordmark_v1.png']
];

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(destinationRoot, { recursive: true });

for (const [sourcePath, destinationName] of derivatives) {
  const entry = manifest.assets.find((asset) => asset.path === sourcePath);
  if (!entry || entry.status !== 'APPROVED' || entry.immutable !== true || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
    throw new Error(`Approved source missing from manifest: ${sourcePath}`);
  }
  const source = path.join(ROOT, ...sourcePath.split('/'));
  const sourceBytes = await readFile(source);
  if (hash(sourceBytes) !== entry.sha256) throw new Error(`Approved source hash mismatch: ${sourcePath}`);
  const destination = path.join(destinationRoot, destinationName);
  await copyFile(source, destination);
  const destinationBytes = await readFile(destination);
  if (hash(destinationBytes) !== entry.sha256) throw new Error(`Derivative hash mismatch: ${destinationName}`);
}

console.log('Approved widget assets synchronized');
