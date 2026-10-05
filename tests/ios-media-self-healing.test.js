import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

async function src(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

test('Home photo commits cache state only after a successful image load and retries once fresh', async () => {
  const app = await src('app.js');
  assert.match(app, /function crossfadeHomePhoto\([\s\S]*writeHomeBootCache\([\s\S]*preload\.onload=async\(\)=>\{[\s\S]*apply\(\)/);
  assert.match(app, /preload\.onerror=async\(\)=>\{[\s\S]*usInvalidateSignedUrl\(path\)[\s\S]*usGetSignedUrl\(path,21600,\{force:true\}\)/);
  assert.match(app, /homePhotoPath=''[\s\S]*homePhotoHasPainted=false/);
});

test('avatar e immagini private possono rinnovare il signed URL dopo un errore', async () => {
  const app = await src('app.js');
  assert.match(app, /function usInvalidateSignedUrl\(path\)/);
  assert.match(app, /async function usRecoverPrivateImage\(img,path=''\)/);
  assert.match(app, /function setAvatarImage\([\s\S]*img\.onerror=async\(\)=>\{[\s\S]*force:true/);
  assert.match(app, /data-us-media-path=.*onerror="usRecoverPrivateImage\(this\)"/);
});

test('foreground ripara Home avatar e Ricordi senza richiedere un nuovo login', async () => {
  const app = await src('app.js');
  assert.match(app, /if\(options\.foreground\)hydrateProfileAvatars\(\)\.catch\(\(\)=>\{\}\);[\s\S]*if\(options\.foreground\)hydrateHomePhoto\(false\)\.catch\(\(\)=>\{\}\)/);
  assert.match(app, /hydrateMoments\(\{forceMedia:Boolean\(options\.foreground\)\}\)/);
  assert.match(app, /if\(forceMedia\)mediaPaths\.forEach\(usInvalidateSignedUrl\);[\s\S]*usGetSignedUrls\(\(rows\|\|\[\]\)\.map\(row=>row\.storage_path\),21600\)/);
});

test('Stories Left for You e album hanno recovery media esplicita', async () => {
  const [stories, left, albums] = await Promise.all([
    src('stories.js'),
    src('left-for-you.js'),
    src('moments-albums.js')
  ]);
  assert.match(stories, /usInvalidateSignedUrl\?\.\(story\.media_path\)[\s\S]*force:true/);
  assert.match(left, /data-us-media-path=.*onerror="usRecoverPrivateImage\(this\)"/);
  assert.match(albums, /data-us-media-path=.*onerror="usRecoverPrivateImage\(this\)"/);
});

test('Home Memory dead path uses the actual signedUrl variable', async () => {
  const app = await src('app.js');
  assert.doesNotMatch(app, /signed\.signedUrl/);
  assert.match(app, /card\.dataset\.url=signedUrl;/);
});

test('Service Worker cache writes after install are best effort', async () => {
  const worker = await src('service-worker.js');
  assert.match(worker, /async function usBestEffortCachePut/);
  // The refreshed document is written through one guarded helper (same build only).
  assert.match(worker, /async function usCacheDocumentForThisBuild\(response\) \{[\s\S]*?await cache\.put\("\/index\.html", response\);[\s\S]*?\} catch \(_\) \{/);
  assert.match(worker, /event\.waitUntil\(usCacheDocumentForThisBuild\(response\.clone\(\)\)\)/);
  assert.match(worker, /event\.waitUntil\(usBestEffortCachePut\(CACHE_NAME, request, response\.clone\(\)\)\)/);
});
