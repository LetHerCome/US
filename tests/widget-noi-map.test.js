// Widget «Noi» stile mappa (founder, 31/10/2026): from 4x2 the two round
// portraits at the sides, the distance on a dashed path between them, above
// each portrait a bubble with that person's last Ti penso and the time, the
// partner's battery under their portrait. The 2x1 placed before keeps the
// compact card. Never a real map: US promises "mai dove sei".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('layout: portraits at the sides, dashed path with the distance, bubbles, battery under the partner', () => {
  const layout = res('layout/us_widget_noi_map.xml');
  for (const id of ['us_noi_map_root', 'us_noi_me_bubble', 'us_noi_partner_bubble', 'us_noi_me_photo', 'us_noi_partner_photo', 'us_noi_map_distance', 'us_noi_map_caption', 'us_noi_map_battery_row', 'us_noi_map_battery']) {
    assert.match(layout, new RegExp(`@\\+id/${id}"`), id);
  }
  // Me on the left, the partner on the right; the battery row sits at the end.
  assert.ok(layout.indexOf('us_noi_me_photo') < layout.indexOf('us_noi_map_distance'));
  assert.ok(layout.indexOf('us_noi_map_distance') < layout.indexOf('us_noi_partner_photo'));
  assert.match(layout, /android:id="@\+id\/us_noi_map_battery_row"[\s\S]*?android:layout_gravity="end"/);
  assert.match(layout, /@drawable\/us_widget_dashed_line/);
  assert.match(layout, /style="@style\/UsWidgetBubble"/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)sp"/, 'nothing under 11sp');
  assert.match(res('values/styles.xml'), /<style name="UsWidgetBubble">[\s\S]*@drawable\/us_widget_bubble[\s\S]*@color\/us_widget_bg/);
  assert.match(res('drawable/us_widget_dashed_line.xml'), /android:shape="line"[\s\S]*android:dashWidth/);
});

test('never a real map: no tiles, no coordinates, no network in the widget', () => {
  const sources = [res('layout/us_widget_noi_map.xml'), read(`${JAVA}/UsNoiWidgetProvider.java`), res('layout/us_widget_preview_noi.xml')].join('\n');
  assert.doesNotMatch(sources, /\btiles?\b|maplibre|openfreemap|googleapis|latitude|longitude|HttpURLConnection|fetch\(/i);
});

test('provider: Android 12+ picks compact or map by size; older phones by the reported size', () => {
  const provider = read(`${JAVA}/UsNoiWidgetProvider.java`);
  assert.match(provider, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.S/);
  assert.match(provider, /sizes\.put\(new SizeF\(110f, 70f\), compact\);/);
  assert.match(provider, /sizes\.put\(new SizeF\(MAP_MIN_WIDTH_DP, MAP_MIN_HEIGHT_DP\), map\);/);
  assert.match(provider, /return fitsMap\(options\) \? map : compact;/);
  assert.match(read(`${JAVA}/UsWidgets.java`), /case NOI: return UsNoiWidgetProvider\.render\(context, state, options\);/);
  // The bubbles redraw themselves ("10 min fa" → "15 min fa") with the shared alarm.
  assert.match(provider, /UsWidgetModels\.noiBubbles\(state\.snapshot, state\.action, state\.now\)/);
  assert.match(provider, /state\.needsUpdateAt\(bubbles\.nextChange\)/);
  for (const slot of ['pair', 'me', 'partner']) assert.match(provider, new RegExp(`readNoiPortrait\\("${slot}"\\)`), slot);
  // An unknown battery keeps its place, so the two portraits stay level.
  assert.match(provider, /us_noi_map_battery_row, couple\.batteryShown\(\) \? View\.VISIBLE : View\.INVISIBLE/);
  const info = res('xml/us_widget_noi_info.xml');
  assert.match(info, /android:minWidth="110dp"/, 'the 2x1 placed before stays valid');
  assert.match(info, /android:targetCellWidth="4"/);
  assert.match(info, /android:targetCellHeight="2"/);
});

test('portraits: one per person, by owner and slot, all wiped with the account', () => {
  const store = read(`${JAVA}/UsWidgetStore.java`);
  assert.match(store, /static final String\[\] PORTRAIT_SLOTS = \{ "pair", "me", "partner" \};/);
  assert.match(store, /if \(!validPortraitSlot\(slot\) \|\| !owner\(\)\.equals\(ownerHash\)/);
  assert.match(store, /for \(String slot : PORTRAIT_SLOTS\) \{\s*portraitFile\(slot\)\.delete\(\);\s*portraitMetaFile\(slot\)\.delete\(\);/);
  assert.match(read(`${JAVA}/UsWidgetBridgePlugin.java`), /String slot = call\.getString\("slot", "pair"\);/);
  assert.match(read('platform.js'), /!\['pair', 'me', 'partner'\]\.includes\(slot\)/);
  const widgets = read('widgets.js');
  const round = widgets.slice(widgets.indexOf('async function composeRoundPortrait'), widgets.indexOf('function clearRoundPreviews'));
  // The same two colours as the 2x1 card, by role; "me" is the viewer.
  assert.match(round, /const mine = window\.usProfile\?\.role === 'beatrice' \? 1 : 0;/);
  assert.match(round, /const colours = \['#ff7c96', '#a98bff'\];/);
  assert.match(round, /writeWidgetNoiPortrait\(owner, image\.base64, slot\)/);
  assert.match(round, /canvas\.toBlob\(resolve, 'image\/png'\)/);
  assert.match(widgets, /platform\.writeWidgetNoiPortrait\(owner,image\.base64,'pair'\)/);
});

test('picker preview: the map style, generic, every text from strings.xml', () => {
  const preview = res('layout/us_widget_preview_noi.xml');
  assert.match(preview, /@drawable\/us_widget_portrait_rosa/);
  assert.match(preview, /@drawable\/us_widget_portrait_lilla/);
  assert.match(preview, /@string\/us_widget_preview_bubble/);
  assert.doesNotMatch(preview, /android:text="[^@]/);
  assert.match(res('values/strings.xml'), /<string name="us_widget_preview_battery" formatted="false">64%<\/string>/);
});
