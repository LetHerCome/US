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

test('layout: the look of before, the photo edge to edge, the night from below, the days in serif', () => {
  const layout = res('layout/us_widget_photo.xml');
  assert.match(layout, /android:background="@drawable\/us_widget_background"/);
  assert.match(layout, /android:id="@\+id\/us_photo_scrim"[\s\S]*?android:src="@drawable\/us_widget_photo_scrim"/);
  assert.match(layout, /android:id="@\+id\/us_photo_days"[\s\S]*?android:fontFamily="serif"[\s\S]*?android:textSize="34sp"/);
  assert.match(layout, /android:id="@\+id\/us_photo_unit"[\s\S]*?android:textStyle="italic"/);
  assert.match(layout, /@drawable\/us_widget_two_dots/);
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
