// Widget 6 · Ricordi a pila, Pastello (founder, 02/11/2026, approved board):
// your photos of this day in a past year ("Un anno fa"), or else the newest,
// as a stack of prints that US draws while it is open. The widget adds the
// place, the day and how many photos; the tap opens Ricordi. Never a path or
// a URL in the snapshot: only which memory it is.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

// widgets.js in a sandbox: only the pure pick is exercised here.
function loadWidgets() {
  const window = { addEventListener() {}, dispatchEvent() {}, UsPlatform: null };
  const context = vm.createContext({ window, document: { addEventListener() {} }, console, URL, Date, Promise, setTimeout, clearTimeout, TextEncoder, crypto: globalThis.crypto });
  vm.runInContext(read('widgets.js'), context);
  return window.UsWidgets;
}

const row = (id, date, extra = {}) => ({ id, date, path: `couple/${id}.webp`, place: '', caption: '', ...extra });

test('pick: the photos of this day a year ago, the oldest year first', () => {
  const { memoriesPick } = loadWidgets();
  const rows = [
    row('n1', '2026-10-30', { place: 'Casa' }),
    row('a1', '2025-10-12', { place: 'Lisbona' }), row('a2', '2025-10-12'), row('a3', '2025-10-12'), row('a4', '2025-10-12'),
    row('b1', '2024-10-12', { caption: 'Il primo viaggio' }),
    row('c1', '2025-10-11')
  ];
  const pick = memoriesPick(rows, '2026-10-12');
  assert.equal(pick.anniversary, true);
  assert.equal(pick.label, '2 anni fa');
  assert.equal(pick.date, '2024-10-12');
  assert.equal(pick.title, 'Il primo viaggio');
  assert.equal(pick.count, 1);
  assert.deepEqual(pick.rows.map((r) => r.id), ['b1']);
  const lastYear = memoriesPick(rows.filter((r) => r.id !== 'b1'), '2026-10-12');
  assert.equal(lastYear.label, 'Un anno fa');
  assert.equal(lastYear.title, 'Lisbona');
  assert.equal(lastYear.count, 4);
  assert.deepEqual(lastYear.rows.map((r) => r.id), ['a1', 'a2', 'a3']);
});

test('pick: otherwise the newest three; nothing without photos; never the future', () => {
  const { memoriesPick } = loadWidgets();
  const rows = [row('f', '2026-12-01'), row('n1', '2026-10-30', { caption: 'Cena' }), row('n2', '2026-10-30'), row('n3', '2026-10-01'), row('n4', '2026-09-01')];
  const pick = memoriesPick(rows, '2026-11-02');
  assert.equal(pick.anniversary, false);
  assert.equal(pick.label, 'I più recenti');
  assert.deepEqual(pick.rows.map((r) => r.id), ['n1', 'n2', 'n3']);
  assert.equal(pick.count, 2);
  assert.equal(pick.day, '2026-11-02');
  assert.equal(memoriesPick([], '2026-11-02'), null);
  assert.equal(memoriesPick([row('x', '2026-10-01', { path: '' })], '2026-11-02'), null);
  assert.equal(memoriesPick(rows, 'oggi'), null);
});

test('sync: drawn in the WebView, two pictures to native, Ricordi changes redraw it', () => {
  const widgets = read('widgets.js');
  assert.match(widgets, /const KINDS = Object\.freeze\(\[[^\]]*'memories'[^\]]*\]\);/);
  assert.match(widgets, /memories: 'moments'[,}]/);
  assert.match(widgets, /platform\.writeWidgetNoiPortrait\(owner, small, 'memories'\)/);
  assert.match(widgets, /platform\.writeWidgetNoiPortrait\(owner, wide, 'memories_wide'\)/);
  assert.match(widgets, /canvas\.toBlob\(resolve, 'image\/webp', 0\.9\)/);
  assert.match(widgets, /addEventListener\('us:moments-updated', \(\) => \{ syncMemories\(\{ force: true \}\)/);
  assert.match(widgets, /const MEMORIES_TTL_MS = 6 \* 60 \* 60 \* 1000;/);
  const app = read('app.js');
  const api = app.slice(app.indexOf('  async memories(){'), app.indexOf('  // The exact two profile portraits'));
  assert.match(api, /sb\.from\('moments'\)\.select\(columns\)/);
  assert.match(api, /usGetSignedUrls\(list,US_MEDIA_URL_TTL_S\)/);
  assert.match(api, /\.slice\(0,3\)/);
  const platform = read('platform.js');
  assert.match(platform, /\['pair', 'me', 'partner', 'memories', 'memories_wide'\]\.includes\(slot\)/);
  assert.match(platform, /const WIDGET_KINDS = \[[^\]]*'memories'[^\]]*\];/);
  assert.match(platform, /memories: widgetMemories\(input\?\.memories\)/);
});

test('native: a new provider, 2x2 and 4x2, the label only on the day', () => {
  const provider = read(`${JAVA}/UsMemoriesWidgetProvider.java`);
  assert.match(provider, /return UsWidgets\.sized\(options, small, medium\);/);
  assert.match(provider, /state\.store\.readNoiPortrait\(slot\)/);
  assert.match(provider, /UsWidgets\.open\(context, "memories", 4701\)/);
  assert.doesNotMatch(provider, /HttpURLConnection|supabase|fetch\(/i);
  const widgetsJava = read(`${JAVA}/UsWidgets.java`);
  assert.match(widgetsJava, /static final String\[\] KINDS = \{[^}]*\bMEMORIES\b[^}]*\};/);
  assert.match(widgetsJava, /case MEMORIES: return UsMemoriesWidgetProvider\.render\(context, state, options\);/);
  assert.match(read(`${JAVA}/UsWidgetStore.java`), /PORTRAIT_SLOTS = \{ "pair", "me", "partner", "memories", "memories_wide" \};/);
  const model = read(`${JAVA}/UsWidgetModels.java`);
  assert.match(model, /out\.pill = today \? label : "";/);
  const manifest = read(`${PLUGIN}/AndroidManifest.xml`);
  assert.match(manifest, /<receiver\s+android:name="com\.usapp\.widget\.UsMemoriesWidgetProvider"\s+android:exported="false"/);
  const info = res('xml/us_widget_memories_info.xml');
  assert.match(info, /android:previewLayout="@layout\/us_widget_preview_memories"/);
  assert.match(info, /android:targetCellWidth="2"[\s\S]*android:targetCellHeight="2"/);
  for (const name of ['us_widget_memories', 'us_widget_memories_medium']) {
    const layout = res(`layout/${name}.xml`);
    assert.match(layout, /android:background="@drawable\/us_widget_card"\s+android:clipToOutline="true"/, name);
    for (const id of ['us_mem_root', 'us_mem_art', 'us_mem_grain', 'us_mem_content', 'us_mem_stack', 'us_mem_title', 'us_mem_empty']) assert.match(layout, new RegExp(`@\\+id/${id}"`), `${name} ${id}`);
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, `${name}: nothing under 11sp`);
  }
  // Foto protagonista: in the 2x2 the photo fills the widget and melts into the paper; the day on its own line.
  const small = res('layout/us_widget_memories.xml');
  assert.match(small, /android:id="@\+id\/us_mem_stack"[\s\S]*?android:scaleType="centerCrop"[\s\S]*?@drawable\/us_widget_fade"/);
  assert.ok(small.indexOf('us_mem_date"') < small.indexOf('us_mem_title"'), 'the date above the title, never beside it');
  assert.ok(provider.includes('UsWidgetArt.serif(small, context, R.id.us_mem_title, model.title, 18f, 144, 2'));
  const medium = res('layout/us_widget_memories_medium.xml');
  for (const id of ['us_mem_pill', 'us_mem_line']) assert.match(medium, new RegExp(`@\\+id/${id}"`), id);
  const widgets = read('widgets.js');
  assert.match(widgets, /const STACK_SMALL = \{ width: 176, height: 176, radius: 18, border: 0, cards: \[/);
  assert.match(widgets, /const inset = i === 0 \? layout\.border \* S : 0;/);
  const preview = res('layout/us_widget_preview_memories.xml');
  assert.doesNotMatch(preview, /android:text="[^@]/);
  assert.match(preview, /android:rotation="-9"/);
  assert.match(res('values/strings.xml'), /<string name="us_widget_memories_name">Ricordi a pila<\/string>/);
});

test('hub: listed, square, with an English copy', () => {
  const hub = read('widget-hub.js');
  assert.match(hub, /\{ kind: 'memories', name: 'Ricordi a pila', copy: '[^']+', shape: 'square' \}/);
  assert.match(hub, /if \(kind === 'memories'\) return memoriesPreview\(snapshot\);/);
  assert.match(read('i18n-en.js'), /'Ricordi a pila': 'Memory stack'/);
});
