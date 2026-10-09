const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');

test('Noi V2: calendar-first overview, full-size day detail, list toggle and retained destinations', () => {
  const html=read('index.html');
  const bond=html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0]||'';
  assert.match(bond, /id="usNoiV2"/);
  assert.ok(bond.indexOf('id="usNoiV2"')<bond.indexOf('id="noiWeekBoard"'));
  for (const id of ['usNoiV2Month','usNoiV2ModeCalendar','usNoiV2ModeList','usNoiV2Content','usNoiV2Detail','usNoiV2First','usNoiV2Today']) {
    assert.match(bond,new RegExp(`id="${id}"`));
  }
  for(const dest of ['lavagna','quest','eventi'])assert.match(bond,new RegExp(`data-noi-open-link="${dest}"`));
  assert.match(bond,/id="noiCoupleDistance"/,'distance data hook is preserved');
  assert.match(bond,/id="noiSectionBar" hidden/,'legacy subview back/navigation still exists');
  assert.match(read('noi-v2.css'),/#bond \.noi-couple-link\{display:none!important\}/);
  assert.match(read('noi-v2.css'),/#bond \.noi-canonical-page\[data-noi-view="hub"\]/);
});

test('Gioca: Sintonia gets a real second tab using the original progression nodes', () => {
  const html=read('index.html');
  const quiz=html.match(/<main id="quiz"[\s\S]*?<\/main>/)?.[0]||'';
  for(const id of ['usGiocaTabGames','usGiocaTabSintonia','usGiocaGames','usGiocaSintonia','quizHub','usGameV2Panel'])assert.match(quiz,new RegExp(`id="${id}"`));
  assert.match(quiz,/role="tablist"/);
  const js=read('noi-v2.js');
  for(const selector of ['.noi-resonance','.us-progression-next','.us-progression-rewards-section','.noi-resonance-history','.noi-resonance-guide'])assert.ok(js.includes(selector),selector);
  assert.match(js,/target\.appendChild\(element\)/,'original DOM nodes move; no duplicated progression state');
  assert.match(js,/window\.USProgression\?\.hydrate\?\./);
  assert.ok(js.includes("document.querySelector('.nav button[data-page=\\\"quiz\\\"]')?.addEventListener('click'"), 'Gioca nav returns to Giochi');
  const nav=html.match(/<nav class="nav us-nav[\s\S]*?<\/nav>/)?.[0]||'';
  assert.equal((nav.match(/data-page=/g)||[]).length,4,'four primary pages remain');
});

test('Noi calendar: reads through current calendar authority, bounded to requested month and identity-safe', () => {
  const js=read('calendar.js');
  assert.match(js,/async function readNoiMonth\(year, month\)/);
  assert.match(js,/fetchEntriesForRange\(viewer\.couple_id,start,end\)/);
  assert.match(js,/window\.usProfile!==viewer/);
  assert.match(js,/window\.USNoiCalendarRead = Object\.freeze\(\{readMonth:readNoiMonth\}\)/);
  assert.doesNotMatch(read('noi-v2.js'),/\.insert\(|\.update\(|\.delete\(|sb\.rpc\(/,'new calendar display never writes');
  const ui=read('noi-v2.js');
  assert.match(ui,/window\.openCalendarSurface\?\.\(selected\)/);
  assert.match(ui,/window\.UsCalendarLinks\?\.openEntry\?\./);
  assert.match(ui,/window\.openEvents\?\.\(\)/);
  assert.match(ui,/new MutationObserver/,'existing Calendar/Events changes refresh Noi after closing');
});

test('Noi assets ship in PWA and native, all release markers agree', () => {
  const html=read('index.html'), worker=read('service-worker.js');
  const version=JSON.parse(read('version.json')).version;
  assert.equal(html.match(/<meta name="us-build" content="([^"]+)"/)?.[1],version);
  assert.equal(worker.match(/const BUILD_ID = "([^"]+)"/)?.[1],version);
  for(const item of ['noi-v2.js','noi-v2.css']){
    assert.match(html,new RegExp(item.replace('.','\\.')));
    assert.ok(worker.includes(`versioned("/${item}")`));
    for(const build of ['scripts/build-cloudflare-pages.mjs','scripts/build-capacitor-web.mjs'])assert.ok(read(build).includes(`'${item}'`),build);
  }
});
