// Widget 4 · Distanza e batteria, Pastello (founder, 02/11/2026, approved
// board): your two round portraits, the distance the app already computed,
// how old it is and the partner's battery. It replaces Noi and its map: no
// map, never where you are. 2x2 and 4x2; a Noi placed before as 2x1 gets a
// one-row card.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);
const exists = (file) => fs.existsSync(path.join(ROOT, file));

test('layouts: the board\'s card, two portraits, the distance in Fraunces, the battery', () => {
  for (const name of ['us_widget_noi', 'us_widget_noi_small', 'us_widget_noi_medium']) {
    const layout = res(`layout/${name}.xml`);
    assert.match(layout, /android:background="@drawable\/us_widget_pastel_distance"/, name);
    for (const id of ['us_noi_root', 'us_noi_me', 'us_noi_partner', 'us_noi_distance', 'us_noi_battery_icon', 'us_noi_battery']) {
      assert.match(layout, new RegExp(`@\\+id/${id}"`), `${name} ${id}`);
    }
    assert.match(layout, /android:id="@\+id\/us_noi_distance"[\s\S]*?android:fontFamily="@font\/us_fraunces"/, name);
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, `${name}: nothing under 11sp`);
    assert.doesNotMatch(layout, /android:text="[^@]/, `${name}: text from strings.xml`);
  }
  const medium = res('layout/us_widget_noi_medium.xml');
  // Me on the left, the partner on the right; the dotted arc and the heart between.
  assert.ok(medium.indexOf('us_noi_me"') < medium.indexOf('us_noi_partner"'));
  assert.match(medium, /@drawable\/us_widget_pastel_arc/);
  assert.match(medium, /@drawable\/us_widget_pastel_heart/);
  assert.match(medium, /@string\/us_widget_noi_me/);
  for (const id of ['us_noi_partner_name', 'us_noi_caption']) assert.match(medium, new RegExp(`@\\+id/${id}"`), id);
  assert.match(res('layout/us_widget_noi_small.xml'), /@\+id\/us_noi_battery_row"/);
  assert.match(res('drawable/us_widget_pastel_distance.xml'), /android:startColor="#FFFFF4DD"[\s\S]*<corners android:radius="26dp"/);
  assert.match(res('values/strings.xml'), /<string name="us_widget_noi_name">Distanza e batteria<\/string>/);
});

test('no map: the asset, its manifest entry, its attribution and the old layout are gone', () => {
  for (const file of ['res/drawable-nodpi/us_widget_noi_map_v1.webp', 'res/layout/us_widget_noi_map.xml', 'res/drawable/us_widget_dashed_line.xml', 'res/drawable/us_widget_bubble_tail.xml']) {
    assert.equal(exists(`${PLUGIN}/${file}`), false, file);
  }
  assert.equal(JSON.parse(read('assets/ASSET_MANIFEST.json')).assets.some((asset) => /noi_map/.test(asset.path)), false);
  // The Mappa dei Ricordi still uses OpenStreetMap: its attribution stays.
  for (const page of ['privacy.html', 'privacy-en.html']) {
    const text = read(page);
    assert.match(text, /© OpenStreetMap contributors/, page);
    assert.doesNotMatch(text, /widget Noi|Us widget/, page);
  }
  const sources = [read(`${JAVA}/UsNoiWidgetProvider.java`), ...['us_widget_noi', 'us_widget_noi_small', 'us_widget_noi_medium', 'us_widget_preview_noi'].map((name) => res(`layout/${name}.xml`))].join('\n');
  assert.doesNotMatch(sources, /\btiles?\b|maplibre|openfreemap|googleapis|latitude|longitude|HttpURLConnection|fetch\(/i);
});

test('provider: 2x1, 2x2 and 4x2 by size; older phones by the reported size', () => {
  const provider = read(`${JAVA}/UsNoiWidgetProvider.java`);
  assert.match(provider, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.S/);
  assert.match(provider, /sizes\.put\(new SizeF\(110f, 40f\), row\);/);
  assert.match(provider, /sizes\.put\(new SizeF\(110f, 110f\), small\);/);
  assert.match(provider, /sizes\.put\(new SizeF\(UsWidgets\.MEDIUM_MIN_WIDTH_DP, 110f\), medium\);/);
  assert.match(provider, /return height >= 110 \? small : row;/);
  assert.match(read(`${JAVA}/UsWidgets.java`), /case NOI: return UsNoiWidgetProvider\.render\(context, state, options\);/);
  // "aggiornato 10 min fa" and the battery redraw themselves with the shared alarm.
  assert.match(provider, /state\.needsUpdateAt\(couple\.distanceNextChange\);/);
  assert.match(provider, /state\.needsUpdateAt\(couple\.batteryNextChange\);/);
  for (const slot of ['me', 'partner']) assert.match(provider, new RegExp(`readNoiPortrait\\("${slot}"\\)`), slot);
  assert.doesNotMatch(provider, /readNoiPortrait\("pair"\)/);
  assert.match(provider, /UsWidgetModels\.personColor\(state\.snapshot, true\)/);
  assert.match(provider, /UsWidgets\.open\(context, "noi", 4401\)/);
  // "12 km" with a smaller unit, as on the board.
  assert.match(provider, /new RelativeSizeSpan\(0\.47f\)/);
  const info = res('xml/us_widget_noi_info.xml');
  assert.match(info, /android:minWidth="110dp"/, 'the 2x1 placed before stays valid');
  assert.match(info, /android:targetCellWidth="4"[\s\S]*android:targetCellHeight="2"/);
});

test('data: the app hands over the distance, "vicini" and when it was read; never coordinates', () => {
  const app = read('app.js');
  const api = app.slice(app.indexOf('  noiDistance(){'), app.indexOf('  // The exact two profile portraits'));
  assert.match(api, /distanceNear:known&&Boolean\(model\.near\)/);
  assert.match(api, /distanceAt:known&&typeof model\.age==='string'\?model\.age:''/);
  assert.doesNotMatch(api, /lat|lng|lon/i);
  const widgets = read('widgets.js');
  assert.match(widgets, /const distanceAt = isoInstant\(next\?\.distanceAt\);/);
  assert.match(widgets, /couple = \{ \.\.\.couple, distanceText, distanceState, distanceNear, distanceAt \};/);
  const platform = read('platform.js');
  assert.match(platform, /distanceNear: couple\.distanceNear === true,/);
  assert.match(platform, /distanceAt: safeInstant\(couple\.distanceAt\),/);
  const contract = read(`${JAVA}/UsWidgetContract.java`);
  assert.match(contract, /\.put\("distanceNear", coupleIn\.optBoolean\("distanceNear", false\)\)/);
  assert.match(contract, /\.put\("distanceAt", instantText\(coupleIn\.optString\("distanceAt", ""\)\)\)/);
});

test('portraits: one per person, by owner and slot, all wiped with the account', () => {
  const store = read(`${JAVA}/UsWidgetStore.java`);
  assert.match(store, /static final String\[\] PORTRAIT_SLOTS = \{ "pair", "me", "partner"[^}]*\};/);
  assert.match(store, /if \(!validPortraitSlot\(slot\) \|\| !owner\(\)\.equals\(ownerHash\)/);
  assert.match(store, /for \(String slot : PORTRAIT_SLOTS\) \{\s*portraitFile\(slot\)\.delete\(\);\s*portraitMetaFile\(slot\)\.delete\(\);/);
  const widgets = read('widgets.js');
  // The two-person portrait of the old Noi is no longer drawn.
  assert.doesNotMatch(widgets, /composeNoiPortrait|'pair'/);
  const round = widgets.slice(widgets.indexOf('async function composeRoundPortrait'), widgets.indexOf('function clearRoundPreviews'));
  // Pastello (02/11): each person's colour (rosa and lilla, or the one chosen),
  // the initial when there is no photo; "me" is the viewer.
  assert.match(round, /const mine = window\.usProfile\?\.role === 'beatrice' \? 1 : 0;/);
  assert.match(round, /colour\('rosa', '#ff7c96'\)[\s\S]*colour\('lilla', '#a98bff'\)/);
  assert.match(round, /ctx\.fillText\(initial \|\| '·', c, c \+ radius \* 0\.06\);/);
  assert.match(round, /writeWidgetNoiPortrait\(owner, image\.base64, slot\)/);
  assert.match(round, /canvas\.toBlob\(resolve, 'image\/png'\)/);
});

test('picker preview and Impostazioni: generic, the new name', () => {
  const preview = res('layout/us_widget_preview_noi.xml');
  assert.match(preview, /@drawable\/us_widget_pastel_distance/);
  assert.match(preview, /@color\/us_widget_rosa/);
  assert.match(preview, /@color\/us_widget_lilla/);
  assert.doesNotMatch(preview, /android:text="[^@]/);
  assert.match(res('values/strings.xml'), /<string name="us_widget_preview_battery" formatted="false">78%<\/string>/);
  const hub = read('widget-hub.js');
  assert.match(hub, /\{ kind: 'noi', name: 'Distanza e batteria', copy: 'La distanza tra voi e la batteria di chi ami\. Mai dove siete\.', shape: 'wide' \}/);
  assert.match(read('i18n-en.js'), /'Distanza e batteria': 'Distance and battery'/);
});
