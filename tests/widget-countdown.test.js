// Widget 9 · Countdown, Foto protagonista (founder, 02/11/2026): the same
// Countdown chosen on Oggi, always illustrated. "Mancano", the number in
// Fraunces, "giorni / Lisbona" in italic and the 14 ticks of the last two
// weeks; the 4x2 adds "Lisbona · 14 novembre · 4 ore". The final day still
// counts down natively.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('2x2 and 4x2: the sun on the horizon, the frosted label, the number and the italic in Fraunces, 14 ticks', () => {
  for (const [name, art] of [['us_widget_countdown', 'countdown_s'], ['us_widget_countdown_medium', 'countdown_m']]) {
    const layout = res(`layout/${name}.xml`);
    for (const id of ['us_cd_root', 'us_cd_art', 'us_cd_grain', 'us_cd_content', 'us_cd_title', 'us_cd_value', 'us_cd_clock', 'us_cd_line', 'us_cd_empty']) {
      assert.match(layout, new RegExp(`@\\+id/${id}"`), `${name} ${id}`);
    }
    for (let i = 0; i < 14; i++) assert.match(layout, new RegExp(`@\\+id/us_cd_tick_${i}"`), `${name} tick ${i}`);
    assert.ok(layout.includes(`@drawable/us_widget_art_${art}"`), name);
    assert.match(layout, /android:background="@drawable\/us_widget_card"\s+android:clipToOutline="true"/, name);
    assert.match(layout, /android:id="@\+id\/us_cd_title"[\s\S]*?android:background="@drawable\/us_widget_glass_pill"/, name);
    assert.match(layout, /<ImageView\s+android:id="@\+id\/us_cd_value"/, name);
    assert.match(layout, /<Chronometer\s+android:id="@\+id\/us_cd_clock"/, name);
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, `${name}: nothing under 11sp`);
  }
  assert.match(res('layout/us_widget_countdown_medium.xml'), /@\+id\/us_cd_sub"/);
  assert.match(res('values/styles.xml'), /<style name="UsWidgetTick">[\s\S]*@drawable\/us_widget_pastel_tick_off/);
  assert.match(res('drawable/us_widget_pastel_tick_on.xml'), /#FFFF7C96/);
  assert.match(res('drawable/us_widget_pastel_tick_off.xml'), /#292A1630/);
  assert.match(res('drawable-night/us_widget_pastel_tick_off.xml'), /#33F7EFE9/);
});

test('provider: 2x2 and 4x2 by size; the model\'s labels; native count-down in the final day', () => {
  const provider = read(`${JAVA}/UsCountdownWidgetProvider.java`);
  assert.match(provider, /return UsWidgets\.sized\(options, small, medium\);/);
  assert.match(read(`${JAVA}/UsWidgets.java`), /case COUNTDOWN: return UsCountdownWidgetProvider\.render\(context, state, options\);/);
  assert.match(provider, /views\.setTextViewText\(R\.id\.us_cd_title, model\.label\);/);
  assert.ok(provider.includes('UsWidgetArt.serif(small, context, R.id.us_cd_line, model.line.replace(" · ", "\\n"), 15f'));
  assert.ok(provider.includes('String sub = model.headline + (model.sub.isEmpty() ? "" : " · " + model.sub);'));
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
