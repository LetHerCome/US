// La domanda di oggi, Pastello (approved board, 02/11/2026): the question in
// Figtree extra bold on the lilac-to-peach card, who has answered (a dot in
// the 2x2; your portraits and a segment each in the 4x2). Never an answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('layouts: the board\'s card, the white label, the question in Figtree 800', () => {
  for (const layout of [res('layout/us_widget_daily.xml'), res('layout/us_widget_daily_medium.xml')]) {
    assert.match(layout, /android:background="@drawable\/us_widget_pastel_daily"/);
    assert.match(layout, /android:id="@\+id\/us_daily_pill"[\s\S]*?android:background="@drawable\/us_widget_pastel_pill"/);
    assert.match(layout, /android:id="@\+id\/us_daily_question"[\s\S]*?android:fontFamily="@font\/us_figtree"[\s\S]*?android:textFontWeight="800"/);
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/);
  }
  assert.match(res('drawable/us_widget_pastel_daily.xml'), /android:endColor="#FFFFE0D4"[\s\S]*android:startColor="#FFE4D9FF"/);
  assert.match(res('layout/us_widget_daily_medium.xml'), /@\+id\/us_daily_me_done[\s\S]*@\+id\/us_daily_partner_done/);
});

test('provider: who answered in that person\'s colour; never an answer; 2x2 and 4x2', () => {
  const provider = read(`${JAVA}/UsDailyWidgetProvider.java`);
  assert.match(provider, /UsWidgets\.themedColor\(medium, context, R\.id\.us_daily_me_done, "setColorFilter", daily\.meAnswered\(\) \? me : TRACK, daily\.meAnswered\(\) \? me : TRACK_NIGHT\);/);
  assert.match(provider, /UsWidgets\.themedColor\(medium, context, R\.id\.us_daily_partner_done, "setColorFilter", daily\.partnerAnswered\(\) \? them : TRACK, daily\.partnerAnswered\(\) \? them : TRACK_NIGHT\);/);
  assert.match(provider, /case "your_turn": plain = who \+ " ha risposto · "; bold = "tocca a te"; break;/);
  assert.match(provider, /return UsWidgets\.sized\(options, small, medium\);/);
  assert.doesNotMatch(provider, /optString\("(?:answer|partnerAnswer)|HttpURLConnection/);
  assert.match(read(`${JAVA}/UsWidgets.java`), /case DAILY: return UsDailyWidgetProvider\.render\(context, state, options\);/);
});

test('colours: each person\'s, as the app shows them, #rrggbb only, on both sides', () => {
  assert.match(read(`${JAVA}/UsWidgetContract.java`), /COLOR = Pattern\.compile\("\^#\[0-9a-fA-F\]\{6\}\$"\)/);
  assert.match(read('platform.js'), /me: \/\^#\[0-9a-f\]\{6\}\$\/i\.test\(couple\.colors\?\.me \|\| ''\)/);
  assert.match(read('widgets.js'), /const colors=\{me:hex\(people\[mine\]\.colour\),partner:hex\(people\[1-mine\]\.colour\)\};/);
});
