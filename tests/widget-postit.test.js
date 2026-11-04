// Widget Post-it (founder, 04/11/2026; canvas «Widget, sfondi e Ricordi»,
// tavola Main.dc.html): it took the Countdown's place. The newest post-it of
// the board on its paper, its words in Fraunces italic, who wrote it and
// "+2" when there are others; the tap opens the board in Noi.
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

test('layout: the paper, the tape, the words as a picture, who and how many others', () => {
  const layout = res('layout/us_widget_postit.xml');
  assert.match(layout, /android:id="@\+id\/us_postit_root"[\s\S]*?android:background="@drawable\/us_widget_postit_yellow"/);
  assert.match(layout, /@drawable\/us_widget_postit_tape"/);
  assert.match(layout, /<ImageView\s+android:id="@\+id\/us_postit_text"/);
  for (const id of ['us_postit_dot', 'us_postit_by', 'us_postit_more']) assert.ok(layout.includes(`@+id/${id}"`), id);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, 'nothing under 11sp');
  assert.doesNotMatch(layout, /android:text="[^@]/, 'text from strings.xml');
  // The papers of the board (couple-notes.css), the same in both themes.
  for (const [color, hex] of [['yellow', 'F6E27A'], ['pink', 'FFC2CF'], ['blue', 'BFE3F5'], ['green', 'C9ECC0']]) {
    assert.match(res(`drawable/us_widget_postit_${color}.xml`), new RegExp(`#FF${hex}`), color);
    assert.match(read('couple-notes.css'), new RegExp(`data-color="${color}"[^{]*\\{--postit-paper:#${hex}\\}`, 'i'), `${color} is the board's paper`);
  }
  const info = res('xml/us_widget_postit_info.xml');
  assert.match(info, /android:targetCellWidth="2"[\s\S]*android:targetCellHeight="2"/);
  assert.match(info, /android:previewImage="@drawable\/us_widget_preview_postit"/);
});

test('provider: its paper, the words in Fraunces italic and dark ink, opens the board, never the network', () => {
  const provider = read(`${JAVA}/UsPostitWidgetProvider.java`);
  assert.match(provider, /UsWidgets\.open\(context, "postit", 5001\)/);
  assert.match(provider, /views\.setInt\(R\.id\.us_postit_root, "setBackgroundResource", paper\(color\)\);/);
  assert.ok(provider.includes('UsWidgetArt.serif(views, context, R.id.us_postit_text, text, 19f, 140, 4, true, Layout.Alignment.ALIGN_NORMAL, INK, INK);'));
  assert.match(provider, /R\.string\.us_widget_postit_empty/);
  assert.doesNotMatch(provider, /HttpURLConnection|supabase|fetch\(/i);
  const widgets = read(`${JAVA}/UsWidgets.java`);
  assert.match(widgets, /static final String\[\] KINDS = \{ THINK, POSTIT,/);
  assert.match(widgets, /case POSTIT: return UsPostitWidgetProvider\.render\(context, state, options\);/);
  const manifest = read(`${PLUGIN}/AndroidManifest.xml`);
  assert.match(manifest, /<receiver\s+android:name="com\.usapp\.widget\.UsPostitWidgetProvider"\s+android:exported="false"/);
  assert.match(read(`${JAVA}/UsWidgetContract.java`), /Pattern\.compile\("\^\(yellow\|pink\|blue\|green\)\$"\)/);
});

test('the app hands over the newest post-it with words, its paper, who and how many others', () => {
  const notes = read('couple-notes.js');
  assert.match(notes, /function paint\(\)\{[\s\S]*?w\.UsWidgets\?\.syncPostit\?\.\(\)/, 'every repaint of the board refreshes the widget');
  assert.match(notes, /const written=sortNotes\(notes\)\.filter\(n=>!isEmpty\(n\)\);/);
  assert.match(notes, /api\.widgetState=widgetState;/);
  const widgets = read('widgets.js');
  assert.match(widgets, /const KINDS = Object\.freeze\(\['think', 'postit',/);
  assert.match(widgets, /postit: 'bond' \}\);/);
  assert.match(widgets, /if \(placed\?\.installed\?\.postit\) window\.UsCoupleNotes\?\.refresh\?\.\(\);/, 'a placed widget is fresh without opening Noi');
  assert.match(read('platform.js'), /const WIDGET_KINDS = \['think', 'postit',/);
});

test('syncPostit writes once per change and empties itself when the board is empty', async () => {
  const source = read('widgets.js');
  const body = source.match(/  function syncPostit\(\) \{[\s\S]*?\n  \}\n/)[0];
  let state = null;
  let writes = 0;
  const sandbox = {
    window: { UsCoupleNotes: { widgetState: () => state } },
    ownerHash: 'h',
    postit: { state: 'none', text: '', color: '', by: '', more: 0, at: '' },
    emptyPostit: () => ({ state: 'none', text: '', color: '', by: '', more: 0, at: '' }),
    cleanText: (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max),
    isoInstant: (value) => (value ? new Date(value).toISOString() : ''),
    scheduleWrite: () => { writes += 1; return Promise.resolve(true); }
  };
  vm.runInNewContext(`${body}; this.syncPostit = syncPostit; this.read = () => postit;`, sandbox);
  assert.equal(await sandbox.syncPostit(), false, 'board not read yet: nothing written');
  state = { state: 'ready', text: 'comprare il latte', color: 'pink', by: 'me', more: 2, at: '2026-11-04T10:00:00Z' };
  await sandbox.syncPostit();
  await sandbox.syncPostit();
  assert.equal(writes, 1, 'the same post-it twice: one write');
  assert.deepEqual({ ...sandbox.read() }, { state: 'ready', text: 'comprare il latte', color: 'pink', by: 'me', more: 2, at: '2026-11-04T10:00:00.000Z' });
  state = { state: 'none' };
  await sandbox.syncPostit();
  assert.equal(sandbox.read().state, 'none');
  assert.equal(writes, 2);
});
