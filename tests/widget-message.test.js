// Widget 7 · Lasciato per te, Pastello (founder, 02/11/2026, approved board);
// it replaces «Messaggio». The partner's portrait, a white bubble with what
// they left that is still closed ("Ti ha lasciato una foto"), how long ago
// and the rosa envelope; the 4x2 adds "la scopri solo dentro US", "Bea · 10
// min fa" and the "Apri" pill. Only the kind and the time (founder,
// 31/10/2026: "Solo tipo e ora"): never the words, photo or link.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('layouts: the board\'s card, the portrait, the white bubble, the envelope', () => {
  for (const name of ['us_widget_message', 'us_widget_message_medium']) {
    const layout = res(`layout/${name}.xml`);
    assert.match(layout, /android:background="@drawable\/us_widget_pastel_left"/, name);
    for (const id of ['us_message_root', 'us_message_photo', 'us_message_text']) assert.match(layout, new RegExp(`@\\+id/${id}"`), `${name} ${id}`);
    assert.ok(layout.indexOf('us_message_photo') < layout.indexOf('us_message_text'), `${name}: the portrait first`);
    assert.match(layout, /@drawable\/us_widget_pastel_bubble"/, name);
    assert.match(layout, /@drawable\/us_widget_pastel_envelope"/, name);
    assert.match(layout, /android:id="@\+id\/us_message_text"[\s\S]*?android:fontFamily="@font\/us_fraunces"/, name);
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, `${name}: nothing under 11sp`);
    assert.doesNotMatch(layout, /android:text="[^@]/, `${name}: text from strings.xml`);
  }
  assert.match(res('layout/us_widget_message.xml'), /@\+id\/us_message_when"/);
  const medium = res('layout/us_widget_message_medium.xml');
  for (const id of ['us_message_hint', 'us_message_who', 'us_message_open']) assert.match(medium, new RegExp(`@\\+id/${id}"`), id);
  assert.match(medium, /@drawable\/us_widget_pastel_pill_rosa"/);
  assert.match(res('drawable/us_widget_pastel_bubble.xml'), /android:topLeftRadius="4dp"/);
  assert.match(res('drawable/us_widget_pastel_left.xml'), /android:endColor="#FFF6D3F0"[\s\S]*android:startColor="#FFD9CCFF"/);
  assert.match(res('drawable/us_widget_pastel_envelope.xml'), /android:strokeColor="#FFFF7C96"/);
  const preview = res('layout/us_widget_preview_message.xml');
  assert.doesNotMatch(preview, /android:text="[^@]/, 'preview text from strings.xml');
  assert.match(preview, /@color\/us_widget_lilla/, 'no face in the picker');
  const info = res('xml/us_widget_message_info.xml');
  assert.match(info, /android:targetCellWidth="2"[\s\S]*android:targetCellHeight="2"/);
  assert.match(info, /android:previewLayout="@layout\/us_widget_preview_message"/);
  for (const gone of ['us_widget_bubble', 'us_widget_bubble_tail_up', 'us_widget_portrait_lilla', 'us_widget_portrait_empty', 'us_widget_heart_outline']) {
    assert.equal(fs.existsSync(path.join(ROOT, PLUGIN, `res/drawable/${gone}.xml`)), false, gone);
  }
});

test('provider: the envelope opens itself; 2x2 and 4x2; the partner portrait; no network', () => {
  const provider = read(`${JAVA}/UsMessageWidgetProvider.java`);
  assert.match(provider, /UsWidgetModels\.message\(state\.snapshot, state\.now\)/);
  assert.match(provider, /state\.needsUpdateAt\(message\.nextChange\)/);
  assert.match(provider, /UsWidgets\.open\(context, message\.destination, 4601\)/);
  assert.match(provider, /UsWidgets\.avatar\(views, state\.store\.readNoiPortrait\("partner"\), R\.id\.us_message_photo, UsWidgetModels\.personColor\(state\.snapshot, false\)\)/);
  assert.match(provider, /return UsWidgets\.sized\(options, small, medium\);/);
  assert.match(provider, /medium\.setViewVisibility\(R\.id\.us_message_open, message\.empty \? View\.GONE : View\.VISIBLE\);/);
  assert.doesNotMatch(provider, /HttpURLConnection|supabase|fetch\(/i);
  const models = read(`${JAVA}/UsWidgetModels.java`);
  // Only the envelope: the Ti penso has its own widget.
  assert.match(models, /out\.destination = "message\/left";/);
  assert.match(models, /out\.hint = \(noun\.startsWith\("una "\) \? "la" : "lo"\) \+ " scopri solo dentro US";/);
  const widgets = read(`${JAVA}/UsWidgets.java`);
  assert.match(widgets, /static final String\[\] KINDS = \{[^}]*\bMESSAGE\b[^}]*\};/);
  assert.match(widgets, /case MESSAGE: return UsMessageWidgetProvider\.render\(context, state, options\);/);
});

test('contract: kind and time of the closed envelope, on both sides', () => {
  const contract = read(`${JAVA}/UsWidgetContract.java`);
  assert.match(contract, /Pattern LEFT_KIND = Pattern\.compile\("\^\(text\|photo\|audio\|video\|music\)\$"\);/);
  assert.match(contract, /JSONObject left = new JSONObject\(\)\.put\("kind", leftKind\)\.put\("at", leftAt\);/);
  const platform = read('platform.js');
  assert.match(platform, /function widgetLeft\(left = \{\}\)/);
  assert.match(platform, /const WIDGET_KINDS = \[[^\]]*'daily', 'message'[^\]]*\];/);
  // Oggi's unseen rows feed it; the app opens the message through the push path.
  const app = read('app.js');
  assert.match(app, /window\.UsWidgets\?\.publishLeft\?\.\(usOggiLeft\.items\)/);
  assert.match(app, /window\.UsPushNavigation=Object\.freeze\(\{open:\(target\)=>performPushNavigation\(target\)\}\);/);
});

test('hub and strings: «Lasciato per te», with an English copy', () => {
  const hub = read('widget-hub.js');
  assert.match(hub, /\{ kind: 'message', name: 'Lasciato per te', copy: 'Il Lasciato per te ancora chiuso: solo che cosa è e quando\.', shape: 'square' \}/);
  assert.match(hub, /if \(kind === 'message'\) return messagePreview\(\);/);
  const en = read('i18n-en.js');
  assert.match(en, /'Lasciato per te': 'Left for you'/);
  assert.match(en, /'Il Lasciato per te ancora chiuso: solo che cosa è e quando\.'/);
  const strings = res('values/strings.xml');
  assert.match(strings, /<string name="us_widget_message_name">Lasciato per te<\/string>/);
  assert.match(strings, /<string name="us_widget_preview_message">Ti ha lasciato una foto<\/string>/);
});
