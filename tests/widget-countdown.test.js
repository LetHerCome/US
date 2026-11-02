// Widget 9 · Countdown, Pastello (founder, 02/11/2026, approved board): the
// same Countdown chosen on Oggi. 2x2: "Mancano", the number in Fraunces plum,
// "giorni · Lisbona" and the rosa-to-lilla bar of the last two weeks. 4x2: the
// sky with the night scrim, "Lisbona · 14 novembre", the number with the
// hours, 14 ticks. The final day still counts down natively.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('2x2: label, number, italic line and the bar, as on the board', () => {
  const layout = res('layout/us_widget_countdown.xml');
  for (const id of ['us_cd_root', 'us_cd_content', 'us_cd_title', 'us_cd_value', 'us_cd_clock', 'us_cd_line', 'us_cd_progress', 'us_cd_empty']) {
    assert.match(layout, new RegExp(`@\\+id/${id}"`), id);
  }
  assert.match(layout, /android:id="@\+id\/us_cd_title"[\s\S]*?android:background="@drawable\/us_widget_pastel_pill"/);
  assert.match(layout, /android:id="@\+id\/us_cd_value"[\s\S]*?android:textColor="@color\/us_widget_pastel_plum"/);
  assert.match(layout, /android:id="@\+id\/us_cd_line"[\s\S]*?android:textStyle="italic"/);
  assert.match(layout, /<Chronometer\s+android:id="@\+id\/us_cd_clock"/);
  assert.match(layout, /android:progressDrawable="@drawable\/us_widget_pastel_progress"/);
  assert.match(res('drawable/us_widget_pastel_countdown.xml'), /android:centerColor="#FFEFE4FF"[\s\S]*android:endColor="#FFFFE3EA"[\s\S]*android:startColor="#FFDBEAFF"/);
  assert.match(res('drawable/us_widget_pastel_progress.xml'), /@android:id\/progress[\s\S]*android:endColor="#FFA98BFF"[\s\S]*android:startColor="#FFFF7C96"/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, 'nothing under 11sp');
});

test('4x2: the sky, the headline, the hours and 14 ticks', () => {
  const layout = res('layout/us_widget_countdown_medium.xml');
  for (const id of ['us_cd_root', 'us_cd_content', 'us_cd_title', 'us_cd_value', 'us_cd_clock', 'us_cd_unit_column', 'us_cd_unit', 'us_cd_sub', 'us_cd_empty']) {
    assert.match(layout, new RegExp(`@\\+id/${id}"`), id);
  }
  for (let i = 0; i < 14; i++) assert.match(layout, new RegExp(`@\\+id/us_cd_tick_${i}"`), `tick ${i}`);
  assert.match(layout, /android:background="@drawable\/us_widget_pastel_countdown_sky"/);
  assert.match(res('drawable/us_widget_pastel_countdown_sky.xml'), /android:type="radial"[\s\S]*android:startColor="#B30F0B13"/);
  assert.match(res('values/styles.xml'), /<style name="UsWidgetTick">[\s\S]*@drawable\/us_widget_pastel_tick_off/);
  assert.match(res('drawable/us_widget_pastel_tick_on.xml'), /#F2F7EFE9/);
  assert.match(res('drawable/us_widget_pastel_tick_off.xml'), /#47F7EFE9/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, 'nothing under 11sp');
});

test('provider: 2x2 and 4x2 by size; the model\'s labels; native count-down in the final day', () => {
  const provider = read(`${JAVA}/UsCountdownWidgetProvider.java`);
  assert.match(provider, /return UsWidgets\.sized\(options, small, medium\);/);
  assert.match(read(`${JAVA}/UsWidgets.java`), /case COUNTDOWN: return UsCountdownWidgetProvider\.render\(context, state, options\);/);
  assert.match(provider, /small\.setTextViewText\(R\.id\.us_cd_title, model\.label\);/);
  assert.match(provider, /small\.setProgressBar\(R\.id\.us_cd_progress, 1000, model\.progress, false\);/);
  assert.match(provider, /medium\.setTextViewText\(R\.id\.us_cd_title, model\.headline\);/);
  assert.match(provider, /i < lit \? R\.drawable\.us_widget_pastel_tick_on : R\.drawable\.us_widget_pastel_tick_off/);
  assert.match(provider, /views\.setChronometerCountDown\(R\.id\.us_cd_clock, true\);/);
  assert.match(provider, /UsWidgets\.open\(context, "countdown", 4201\)/);
  const model = read(`${JAVA}/UsWidgetModels.java`);
  assert.match(model, /out\.label = arrived \? "Ci siamo" : "Mancano";/);
  assert.match(model, /out\.headline = day\.isEmpty\(\) \? out\.title : out\.title \+ " · " \+ day;/);
  // Hours only: the widget redraws once an hour, never every minute.
  assert.match(model, /out\.sub = hours == 0 \? "" : hours == 1 \? "1 ora" : hours \+ " ore";/);
  const info = res('xml/us_widget_countdown_info.xml');
  assert.match(info, /android:targetCellWidth="2"[\s\S]*android:targetCellHeight="2"/);
});

test('picker preview: Pastello, generic, every text from strings.xml', () => {
  const preview = res('layout/us_widget_preview_countdown.xml');
  assert.match(preview, /@drawable\/us_widget_pastel_countdown"/);
  assert.match(preview, /@drawable\/us_widget_pastel_progress"/);
  assert.doesNotMatch(preview, /android:text="[^@]/);
  const strings = res('values/strings.xml');
  assert.match(strings, /<string name="us_widget_preview_countdown">Mancano<\/string>/);
  assert.match(strings, /<string name="us_widget_preview_countdown_unit">giorni · Il prossimo viaggio<\/string>/);
});
