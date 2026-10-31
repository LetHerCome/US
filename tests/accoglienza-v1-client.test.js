// Accoglienza V1 (docs/missions/accoglienza-v1.md): the one question for the
// couple, asked once on Oggi and changeable in Settings; and the new widget
// «La domanda di oggi» (widgets.js daily, Android provider), never an answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const D = require('../distance.js');
const html = read('index.html');
const js = read('distance.js');
const widgets = read('widgets.js');
const W = 'native-plugins/us-widget-bridge/android/src/main';

test('Oggi asks once: only when the answer is known to be missing and this member has not opened it', () => {
  assert.equal(D.todayPriority({ known: false, mode: null }, false), null, 'not before the couple is read');
  const card = D.todayPriority({ known: true, mode: null }, false);
  assert.deepEqual([card.title, card.detail, card.action, card.category], ['Una domanda per voi', 'Vi vedete spesso o vivete lontani?', 'distance', 'waiting_for_me']);
  assert.equal(D.todayPriority({ known: true, mode: null }, true), null, 'opened once on this phone');
  assert.equal(D.todayPriority({ known: true, mode: 'far' }, false), null, 'answered by either member');
  assert.deepEqual(['near', 'far', null].map(D.settingValue), ['Spesso', 'A distanza', 'Da scegliere']);
});

test('the answer is one column of the couple, written like the name and the date', () => {
  assert.match(js, /sb\.from\('couples'\)\.select\('distance_mode'\)\.eq\('id',w\.usProfile\.couple_id\)\.maybeSingle\(\)/);
  assert.match(js, /sb\.from\('couples'\)\.update\(\{distance_mode:mode\}\)\.eq\('id',w\.usProfile\.couple_id\)/);
  assert.match(js, /if\(!MODES\.includes\(mode\)\|\|saving/, 'only near or far');
  assert.match(js, /w\.UsUiFoundation\?\.done\?\.\(button\);/, 'Fluidità 2: the «fatto!»');
  assert.match(js, /us:distance:v1:asked:\$\{key\(\)\}/, 'asked once per member and couple');
});

test('copy: two plain answers, inclusive Italian, English aligned', () => {
  const sheet = html.match(/<div id="usDistanceSheet"[\s\S]*?<\/section>/)[0];
  assert.match(sheet, /data-distance="near"[^>]*><b>Ci vediamo spesso<\/b>/);
  assert.match(sheet, /data-distance="far"[^>]*><b>Viviamo lontani<\/b>/);
  for (const banned of [/entrambi/i, /tutti e due/i, /ognuno/i, /l['’]altr[oa]/i, /\b\w+[oa]\/[ae]\b/]) assert.doesNotMatch(sheet, banned, String(banned));
  const en = read('i18n-en.js');
  for (const key of ['Come vi vedete?', 'Ci vediamo spesso', 'Viviamo lontani', 'Da scegliere', 'Grazie: le missioni ora sono pensate per voi']) assert.ok(en.includes(`'${key}':`), key);
});

test('shell: Settings row, sheet, native back, Oggi card, reset, precache and both builds', () => {
  assert.match(html, /data-us-setting="together-mode">[\s\S]*?<b>Come vi vedete<\/b>[\s\S]*?id="usDistanceValue"/);
  assert.match(html, /<div id="usDistanceSheet" class="us-distance-overlay" aria-hidden="true" data-us-modal data-us-motion-surface>/);
  assert.match(read('settings.js'), /if\(name==='together-mode'\)return window\.UsDistance\?\.open\?\.\(\);/);
  assert.match(read('navigation.js'), /name:'distance',\n    find:\(\)=>document\.getElementById\('usDistanceSheet'\)/);
  const app = read('app.js');
  assert.match(app, /const distance=window\.UsDistance\?\.todayPriority\?\.\(\);\n  if\(distance\)candidates\.push\(distance\);/);
  assert.match(app, /if\(action==='distance'\)window\.UsDistance\?\.open\?\.\(\);/);
  assert.match(app, /window\.UsDistance\?\.reset\?\.\(\);/);
  assert.match(read('service-worker.js'), /versioned\("\/distance\.css"\),\n  versioned\("\/distance\.js"\),/);
  for (const file of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(file), /'distance\.js',\n\s*'distance\.css',/, file);
});

test('widget «La domanda di oggi»: the question and whose turn it is, never an answer', () => {
  assert.match(widgets, /const KINDS = Object\.freeze\(\['think', 'countdown', 'noi', 'photo', 'daily'[^\]]*\]\);/);
  assert.match(widgets, /const emptyDaily = \(\) => \(\{ date: '', question: '', state: 'none' \}\);/);
  const from = widgets.slice(widgets.indexOf('function dailyFromToday()'), widgets.indexOf('function syncDaily()'));
  assert.match(from, /const turn = state\.both_answered \? 'ready' : state\.my_answer != null \? 'waiting' : state\.partner_has_answer \? 'your_turn' : 'todo';/);
  assert.doesNotMatch(from, /my_answer\)|partner_answer|\.answer\b/, 'the answers never reach the widget');
  assert.match(read('app.js'), /window\.UsWidgets\?\.syncDaily\?\.\(\)\.catch\?\.\(\(\)=>\{\}\);/, 'Oggi tells the widget');
  assert.match(widgets, /if \(link\.kind === 'daily' && window\.usProfile\) setTimeout\(\(\) => window\.openToday\?\.\(\), 120\);/, 'a tap opens the question');
  assert.match(read('widget-hub.js'), /\{ kind: 'daily', name: 'La domanda di oggi',/);
  const manifest = read(`${W}/AndroidManifest.xml`);
  assert.match(manifest, /android:name="com\.usapp\.widget\.UsDailyWidgetProvider"[\s\S]*?android:resource="@xml\/us_widget_daily_info"/);
  const info = read(`${W}/res/xml/us_widget_daily_info.xml`);
  assert.match(info, /android:targetCellWidth="4"/);
  assert.match(info, /android:targetCellHeight="2"/);
  const provider = read(`${W}/java/com/usapp/widget/UsDailyWidgetProvider.java`);
  assert.match(provider, /state\.needsUpdateAt\(UsWidgetModels\.nextRomeMidnight\(state\.now\)\)/, 'turns at midnight in Rome');
  assert.match(read(`${W}/java/com/usapp/widget/UsWidgets.java`), /static final String\[\] KINDS = \{ THINK, COUNTDOWN, NOI, PHOTO, DAILY\b[^}]*\};/);
  const strings = read(`${W}/res/values/strings.xml`);
  assert.doesNotMatch(strings.match(/us_widget_daily[\s\S]*?us_widget_noi_description/)[0], /l\\?['’]altr[oa]|entrambi|ognuno/i);
});
