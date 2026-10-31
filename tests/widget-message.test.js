// Widget «Messaggio» (founder, 31/10/2026): the partner's round photo above,
// their last Ti penso or the Lasciato per te still closed in a latte bubble
// with a small heart, how long ago; the tap opens that message in US. Never
// the words, photo or link of a Lasciato per te: only its kind and time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('layout: the partner photo above, the bubble with the heart and the time under it', () => {
  const layout = res('layout/us_widget_message.xml');
  assert.ok(layout.indexOf('us_message_photo') < layout.indexOf('us_message_text'), 'photo above the bubble');
  assert.match(layout, /@drawable\/us_widget_bubble_tail_up/);
  assert.match(layout, /android:background="@drawable\/us_widget_bubble"/);
  assert.match(layout, /android:id="@\+id\/us_message_heart"/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)sp"/, 'nothing under 11sp');
  const preview = res('layout/us_widget_preview_message.xml');
  assert.doesNotMatch(preview, /android:text="[^@]/, 'preview text from strings.xml');
  assert.match(preview, /@drawable\/us_widget_portrait_lilla/, 'no face in the picker');
  const info = res('xml/us_widget_message_info.xml');
  assert.match(info, /android:targetCellWidth="2"[\s\S]*android:targetCellHeight="2"/);
  assert.match(info, /android:previewLayout="@layout\/us_widget_preview_message"/);
});

test('provider: the newest message opens itself; the photo is the partner portrait; no network', () => {
  const provider = read(`${JAVA}/UsMessageWidgetProvider.java`);
  assert.match(provider, /UsWidgetModels\.message\(state\.snapshot, state\.now\)/);
  assert.match(provider, /state\.needsUpdateAt\(message\.nextChange\)/);
  assert.match(provider, /UsWidgets\.open\(context, message\.destination, 4601\)/);
  assert.match(provider, /readNoiPortrait\("partner"\)/);
  assert.doesNotMatch(provider, /HttpURLConnection|supabase|fetch\(/i);
  const models = read(`${JAVA}/UsWidgetModels.java`);
  assert.match(models, /out\.destination = envelope \? "message\/left" : "message\/think";/);
  const widgets = read(`${JAVA}/UsWidgets.java`);
  assert.match(widgets, /static final String\[\] KINDS = \{ THINK, COUNTDOWN, NOI, PHOTO, DAILY, MESSAGE \};/);
  assert.match(widgets, /case MESSAGE: return UsMessageWidgetProvider\.render\(context, state\);/);
});

test('contract: kind and time of the closed envelope, on both sides', () => {
  const contract = read(`${JAVA}/UsWidgetContract.java`);
  assert.match(contract, /Pattern LEFT_KIND = Pattern\.compile\("\^\(text\|photo\|audio\|video\|music\)\$"\);/);
  assert.match(contract, /JSONObject left = new JSONObject\(\)\.put\("kind", leftKind\)\.put\("at", leftAt\);/);
  const platform = read('platform.js');
  assert.match(platform, /function widgetLeft\(left = \{\}\)/);
  assert.match(platform, /const WIDGET_KINDS = \['think', 'countdown', 'noi', 'photo', 'daily', 'message'\];/);
  // Oggi's unseen rows feed it; the app opens the message through the push path.
  const app = read('app.js');
  assert.match(app, /window\.UsWidgets\?\.publishLeft\?\.\(usOggiLeft\.items\)/);
  assert.match(app, /window\.UsPushNavigation=Object\.freeze\(\{open:\(target\)=>performPushNavigation\(target\)\}\);/);
});

test('hub: Messaggio is listed, square, with an English copy', () => {
  const hub = read('widget-hub.js');
  assert.match(hub, /\{ kind: 'message', name: 'Messaggio', copy: '[^']+', shape: 'square' \}/);
  assert.match(hub, /if \(kind === 'message'\) return messagePreview\(\);/);
  const en = read('i18n-en.js');
  assert.match(en, /Messaggio: 'Message'/);
  assert.match(en, /'L’ultimo Ti penso di chi ami, o il suo Lasciato per te ancora chiuso\.'/);
});
