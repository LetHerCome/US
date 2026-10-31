// Widget «Giorni insieme» (founder, 31/10/2026): the two round portraits side
// by side with a heart between them, under them the big number of days
// together ("182 giorni insieme"). No new data: couple.startedOn already
// travels for Foto & Noi and the Countdown "Insieme da"; Rome civil days,
// counted like the app (countdown.js relationship), turning at midnight.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('layout: two portraits with a heart between, then the big number and the line', () => {
  const layout = res('layout/us_widget_days.xml');
  const order = ['us_days_me_photo', 'us_widget_heart', 'us_days_partner_photo', 'us_days_value', 'us_days_unit'].map((id) => layout.indexOf(id));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'me, heart, partner, number, line');
  assert.ok(order.every((at) => at > 0));
  assert.match(layout, /android:id="@\+id\/us_days_value"[\s\S]*?android:fontFamily="serif"[\s\S]*?android:textSize="40sp"/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)sp"/);
  const preview = res('layout/us_widget_preview_days.xml');
  assert.doesNotMatch(preview, /android:text="[^@]/);
  assert.match(preview, /@drawable\/us_widget_portrait_rosa[\s\S]*@drawable\/us_widget_portrait_lilla/);
  assert.match(res('xml/us_widget_days_info.xml'), /android:targetCellWidth="2"[\s\S]*android:targetCellHeight="2"/);
});

test('provider: the same days as the app, redrawn at Rome midnight, opens Noi, no network', () => {
  const provider = read(`${JAVA}/UsDaysWidgetProvider.java`);
  assert.match(provider, /UsWidgetModels\.days\(state\.snapshot, state\.now\)/);
  assert.match(provider, /state\.needsUpdateAt\(days\.nextChange\)/);
  assert.match(provider, /UsWidgets\.open\(context, "days", 4701\)/);
  assert.match(provider, /readNoiPortrait\("me"\)[\s\S]*readNoiPortrait\("partner"\)/);
  assert.doesNotMatch(provider, /HttpURLConnection|supabase|fetch\(/i);
  const models = read(`${JAVA}/UsWidgetModels.java`);
  assert.match(models, /long days = daysTogether\(UsWidgetContract\.optObject\(snapshot, "couple"\)\.optString\("startedOn", ""\), now\);/);
  // The app counts the same way: today minus the first day.
  assert.match(read('countdown.js'), /function relationship\(started,now=new Date\(\)\)\{\s*const days=todayNumber\(now\)-dayNumber\(started\);/);
  assert.match(read(`${JAVA}/UsWidgets.java`), /case DAYS: return UsDaysWidgetProvider\.render\(context, state\);/);
});

test('wiring: kind, deep link to Noi, pin from Settings, hub tile', () => {
  const widgets = read('widgets.js');
  assert.match(widgets, /const KINDS = Object\.freeze\(\[[^\]]*'days'\]\);/);
  assert.match(widgets, /days: 'bond'/);
  assert.match(read('platform.js'), /const WIDGET_KINDS = \[[^\]]*'days'\];/);
  const hub = read('widget-hub.js');
  assert.match(hub, /\{ kind: 'days', name: 'Giorni insieme', copy: '[^']+', shape: 'square' \}/);
  assert.match(hub, /if \(kind === 'days'\) return daysPreview\(snapshot\);/);
  assert.match(read('i18n-en.js'), /'Le vostre foto e i giorni insieme, che crescono ogni mezzanotte\.': '/);
});
