// Egress (16/10): the Supabase Free plan went over its 5 GB egress with one
// couple. A private photo downloads again whenever its signed URL changes, so
// the app keeps one URL per photo for a day and reuses it across restarts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');

function signedUrlCache(store = new Map(), now = () => 1_000_000) {
  const start = app.indexOf('const US_SIGNED_URL_CACHE=new Map();');
  const end = app.indexOf('usLoadSignedUrlCache();', start);
  assert.ok(start >= 0 && end > start, 'signed URL cache block is present');
  const context = vm.createContext({
    window: {},
    Date: { now },
    JSON,
    Number,
    Math,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  });
  vm.runInContext(`${app.slice(start, end)}
    globalThis.api={write:usWriteSignedUrlCache,read:usReadSignedUrlCache,load:usLoadSignedUrlCache,cache:US_SIGNED_URL_CACHE,ttl:US_MEDIA_URL_TTL_S,max:US_SIGNED_URL_PERSIST_MAX,key:US_SIGNED_URL_STORAGE_KEY};`, context);
  return { api: context.api, store, window: context.window };
}

test('egress: media signed URLs live a day, one constant shared by every surface', () => {
  const { api, window } = signedUrlCache();
  assert.equal(api.ttl, 86400);
  assert.equal(window.US_MEDIA_URL_TTL_S, 86400);
  assert.match(app, /async function usGetSignedUrl\(path,expiresIn=US_MEDIA_URL_TTL_S,options=\{\}\)/);
  assert.match(app, /async function usGetSignedUrls\(paths,expiresIn=US_MEDIA_URL_TTL_S,options=\{\}\)/);
  for (const file of ['app.js', 'moments-albums.js', 'settings.js', 'ricordi-inline-carousel.js']) {
    assert.doesNotMatch(read(file), /21600/, `${file} has no 6-hour signed URL left`);
  }
});

test('egress: a cold start keeps the newest signed URLs (up to 400), not the first 80 written', () => {
  let t = 1_000_000;
  const { api, store } = signedUrlCache(new Map(), () => t);
  assert.equal(api.max, 400);
  for (let i = 0; i < 450; i += 1) { t += 1000; api.write(`c/u/${i}.webp`, `https://x/${i}`, api.ttl); }
  const saved = JSON.parse(store.get(api.key));
  assert.equal(Object.keys(saved).length, 400);
  assert.ok(saved['c/u/449.webp'], 'the newest URL survives a restart');
  assert.equal(saved['c/u/0.webp'], undefined, 'the oldest ones go first');

  const restarted = signedUrlCache(store, () => t);
  restarted.api.load();
  assert.equal(restarted.api.read('c/u/449.webp'), 'https://x/449', 'same URL after restart: the WebView serves it from disk');
});

test('egress: the hourly Oggi photo never re-signs a photo; a broken URL still heals', () => {
  const fn = app.slice(app.indexOf('async function hydrateHomePhoto('), app.indexOf('window.hydrateHomePhoto=hydrateHomePhoto;'));
  assert.match(fn, /const signedUrl=await usGetSignedUrl\(path,US_MEDIA_URL_TTL_S\);/);
  assert.doesNotMatch(fn, /usGetSignedUrl\([^)]*force/);
  assert.match(app, /preload\.onerror=async\(\)=>\{[\s\S]*usGetSignedUrl\(path,US_MEDIA_URL_TTL_S,\{force:true\}\)/);
});
