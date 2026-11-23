// Widget Foto & Noi (founder, 02/11/2026): the style it had before Pastello
// ("è più carino"), with the photo that changes by itself every hour: Oggi's
// photo of this hour and of the next two, picked the way Oggi picks them.
// Giorni insieme (31/10) joined it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('layout: the photo edge to edge, melting into the theme\'s paper, the days in Fraunces', () => {
  // Foto protagonista (founder, 02/11/2026: "Segue il tema (B)").
  const layout = res('layout/us_widget_photo.xml');
  const provider = read(`${JAVA}/UsPhotoWidgetProvider.java`);
  assert.match(layout, /android:background="@drawable\/us_widget_card"\s+android:clipToOutline="true"/);
  assert.match(layout, /android:id="@\+id\/us_photo_art"[\s\S]*?@drawable\/us_widget_art_photo"/);
  assert.match(layout, /android:id="@\+id\/us_photo_scrim"[\s\S]*?android:src="@drawable\/us_widget_fade"/);
  assert.match(res('drawable/us_widget_fade.xml'), /#F7FFF6EE/, 'cream in Pastello');
  assert.match(res('drawable-night/us_widget_fade.xml'), /#F717111C/, 'the night in Midnight');
  assert.match(layout, /<ImageView\s+android:id="@\+id\/us_photo_days"/);
  assert.match(layout, /<ImageView\s+android:id="@\+id\/us_photo_unit"/);
  assert.ok(provider.includes('UsWidgetArt.serif(views, context, R.id.us_photo_days, days ? Long.toString(couple.days) : "", 40f'));
  assert.ok(provider.includes('"giorni\\ninsieme"'));
  assert.equal(fs.existsSync(path.join(ROOT, PLUGIN, 'res/layout/us_widget_photo_medium.xml')), false, 'one layout for every size, as before');
  assert.match(res('values/strings.xml'), /<string name="us_widget_photo_name">Foto &amp; Noi<\/string>/);
});

test('provider: the slot of this hour, redrawn at the next hour and at Rome midnight; no network', () => {
  const provider = read(`${JAVA}/UsPhotoWidgetProvider.java`);
  assert.match(provider, /UsWidgetModels\.photoSlot\(state\.snapshot, state\.now\)/);
  assert.match(provider, /state\.needsUpdateAt\(slot\.nextChange\);/);
  assert.match(provider, /state\.store\.readPhoto\(slot\.key\)/);
  assert.match(provider, /new RemoteViews\(context\.getPackageName\(\), R\.layout\.us_widget_photo\)/);
  assert.doesNotMatch(provider, /HttpURLConnection|supabase|fetch\(/i);
  // Giorni insieme placed before render Foto & Noi; it is no longer offered.
  assert.match(read(`${JAVA}/UsDaysWidgetProvider.java`), /return UsPhotoWidgetProvider\.render\(context, state, options\);/);
  assert.match(res('xml/us_widget_days_info.xml'), /android:initialLayout="@layout\/us_widget_photo"/);
  assert.doesNotMatch(read('widget-hub.js'), /kind: 'days'/);
  // One widget only (founder, 02/11/2026): the app never offers Giorni insieme again;
  // the class stays, hidden and named Foto & Noi, for the ones already placed.
  assert.doesNotMatch(read('widgets.js'), /'days', 'memories'|days: 'bond'/);
  assert.doesNotMatch(read('platform.js'), /'message', 'days'/);
  assert.match(read(`${PLUGIN}/AndroidManifest.xml`), /UsDaysWidgetProvider"\s+android:exported="false"\s+android:label="@string\/us_widget_photo_name"/);
  assert.match(res('xml/us_widget_days_info.xml'), /android:widgetFeatures="hide_from_picker"/);
  assert.doesNotMatch(res('values/strings.xml'), /Giorni insieme</);
  assert.match(read('widget-hub.js'), /\{ kind: 'photo', name: 'Foto & Noi', copy: '[^']+', shape: 'square' \}/);
});

test('store: up to three photos by key, only the ones the snapshot names, all gone with the account', () => {
  const store = read(`${JAVA}/UsWidgetStore.java`);
  assert.match(store, /new File\(mediaDirectory, "photo-" \+ key \+ "\.jpg"\)/);
  assert.match(store, /prunePhotos\(normalized\.optJSONObject\("photo"\)\);/);
  assert.match(store, /name\.startsWith\("photo-"\) && name\.endsWith\("\.jpg"\)/);
  const contract = read(`${JAVA}/UsWidgetContract.java`);
  assert.match(contract, /i < nextIn\.length\(\) && next\.length\(\) < 2/);
  assert.match(read('platform.js'), /\.slice\(0, 2\)\s*\.map\(\(item\) => \(\{ key: item\.key, takenOn: safeCivilDate\(item\.takenOn\), label: safeText\(item\.label, 60\) \}\)\)/);
});

test('app: the next two hours picked exactly as Oggi picks them, never the photo just shown', () => {
  const app = read('app.js');
  assert.match(app, /function homeRotationPick\(rows,key,avoid\)\{/);
  assert.match(app, /const row=homeRotationPick\(rows,homeRotationKey\(\),homePhotoPath\);/, 'Oggi uses it');
  const upcoming = app.slice(app.indexOf('  async upcomingPhotos(){'), app.indexOf('  async latestPhoto(){'));
  assert.match(upcoming, /homeRotationPick\(rows,homeRotationKey\(new Date\(Date\.now\(\)\+hour\*3600e3\)\),avoid\)/);
  assert.match(upcoming, /avoid=row\.storage_path;/);
  assert.match(upcoming, /usGetSignedUrl\(row\.storage_path,3600\)/);
  // The signed URLs stay in the WebView: native receives bytes and keys.
  const widgets = read('widgets.js');
  assert.match(widgets, /await platform\.writeWidgetPhoto\(owner, nextKey, image\.base64\);/);
  assert.match(widgets, /photo = \{ state: 'ready', key, takenOn: civilDate\(latest\.takenOn\), label: cleanText\(latest\.label, 60\), hour: isoInstant\(latest\.hour\), next \};/);
});
