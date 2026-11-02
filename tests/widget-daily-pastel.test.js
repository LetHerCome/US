// La domanda di oggi, Foto protagonista (founder, 02/11/2026): an illustration,
// the question in Fraunces, who has answered with their small portrait.
// Never an answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('layouts: illustration and grain, the frosted label, the question in Fraunces as a picture', () => {
  for (const [layout, art] of [[res('layout/us_widget_daily.xml'), 'daily_s'], [res('layout/us_widget_daily_medium.xml'), 'daily_m']]) {
    assert.match(layout, /android:background="@drawable\/us_widget_card"\s+android:clipToOutline="true"/);
    assert.ok(layout.includes('@drawable/us_widget_art_' + art + '"'), art);
    assert.match(layout, /android:id="@\+id\/us_daily_pill"[\s\S]*?android:background="@drawable\/us_widget_glass_pill"/);
    assert.match(layout, /<ImageView\s+android:id="@\+id\/us_daily_question"/);
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/);
  }
  assert.match(res('layout/us_widget_daily_medium.xml'), /@\+id\/us_daily_partner[\s\S]*@\+id\/us_daily_me"/);
});

test('provider: who answered with their portrait, the other quieter; never an answer; 2x2 and 4x2', () => {
  const provider = read(`${JAVA}/UsDailyWidgetProvider.java`);
  assert.ok(provider.includes('UsWidgetArt.serif(small, context, R.id.us_daily_question, question, 15.5f'));
  assert.ok(provider.includes('medium.setInt(R.id.us_daily_partner, "setImageAlpha", daily.partnerAnswered() ? 255 : QUIET);'));
  assert.ok(provider.includes('medium.setInt(R.id.us_daily_me, "setImageAlpha", daily.meAnswered() ? 255 : QUIET);'));
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
