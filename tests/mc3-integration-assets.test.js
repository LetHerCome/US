const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('MC3 integration keeps onboarding and current main UI resources in both bundles and atomic worker',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const worker=fs.readFileSync('service-worker.js','utf8');
  for(const asset of ['onboarding.js','onboarding.css','top-chrome.css','modal-center.css','ricordi-carousel.css','ricordi-inline-carousel.css','ricordi-inline-carousel.js']){
    assert.ok(html.includes(`/${asset}?v=`),`${asset} loaded`);
    assert.ok(worker.includes(`versioned("/${asset}")`),`${asset} precached`);
    for(const script of ['scripts/build-cloudflare-pages.mjs','scripts/build-capacitor-web.mjs'])assert.ok(fs.readFileSync(script,'utf8').includes(`'${asset}'`),`${asset} packaged in ${script}`);
  }
  assert.ok(html.indexOf('/onboarding.js?')<html.indexOf('<script defer src="/app.js?'));
  const build=JSON.parse(fs.readFileSync('version.json','utf8')).version;
  assert.ok(html.includes(`name="us-build" content="${build}"`));
  assert.ok(worker.includes(`const BUILD_ID = "${build}";`));
  assert.equal([...html.matchAll(/\?v=([^"'&\s>]+)/g)].some(match=>match[1]!==build),false);
  const manifest=fs.readFileSync('manifest.webmanifest','utf8');
  assert.equal([...manifest.matchAll(/\?v=([^"]+)/g)].some(match=>match[1]!==build),false);
  assert.ok(worker.includes('const MEDIA_CACHE_NAME = "us-private-media-v1";'));
});
