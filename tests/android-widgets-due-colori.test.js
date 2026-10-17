// Android widgets in "Due colori, un Noi" (16/10): the app's night card,
// latte text, rosa and lilla for the two people, previews that are the same
// for every user. Mockup: docs/design/android-widgets-v3-mockup.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('widgets: the palette is the app tokens (ui-foundation.css)', () => {
  const colors = res('values/colors.xml');
  const css = read('ui-foundation.css');
  const pairs = { us_widget_bg: '0f0b13', us_widget_surface: '17111c', us_widget_text: 'f7efe9', us_widget_rosa: 'ff7c96', us_widget_lilla: 'a98bff', us_widget_orchidea: 'd98be0', us_widget_corallo: 'ff8b7b' };
  for (const [name, hex] of Object.entries(pairs)) {
    assert.match(colors, new RegExp(`<color name="${name}">#FF${hex}</color>`, 'i'), name);
    assert.match(css, new RegExp(`#${hex}`, 'i'), `${hex} is an app token`);
  }
  assert.match(res('drawable/us_widget_background.xml'), /android:startColor="#FF17111C"[\s\S]*<stroke android:width="1dp" android:color="#17F7EFE9"/);
});

test('widgets: picker previews are generic, never a real name, face or photo', () => {
  const previews = ['think', 'noi', 'photo', 'countdown'].map((k) => res(`layout/us_widget_preview_${k}.xml`)).join('\n');
  const strings = res('values/strings.xml');
  for (const text of [previews, strings]) assert.doesNotMatch(text, /Beatrice|Francesco|\bBea\b|\bFra\b/);
  assert.doesNotMatch(previews, /android:text="[^@]/, 'preview text comes from strings.xml');
  assert.match(res('layout/us_widget_preview_photo.xml'), /@drawable\/us_widget_preview_photo_art/);
  assert.match(res('drawable/us_widget_preview_photo_art.xml'), /<gradient/);
  for (const info of ['think', 'noi', 'photo', 'countdown']) {
    const xml = res(`xml/us_widget_${info}_info.xml`);
    assert.match(xml, new RegExp(`android:previewLayout="@layout/us_widget_preview_${info}"`));
    assert.match(xml, new RegExp(`android:previewImage="@drawable/us_widget_preview_${info}"`));
  }
});

test('widgets: preview PNGs keep their size (2x of 168dp, Noi 192x96dp) and are new', () => {
  const size = (k) => { const b = fs.readFileSync(path.join(ROOT, PLUGIN, `res/drawable-nodpi/us_widget_preview_${k}.png`)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(size('think'), [336, 336]);
  assert.deepEqual(size('photo'), [336, 336]);
  assert.deepEqual(size('countdown'), [336, 336]);
  assert.deepEqual(size('noi'), [384, 192]);
});

test('Ti penso: the colour says whose move it is, the name is italic, no tiny type', () => {
  const layout = res('layout/us_widget_think.xml');
  const provider = read(`${JAVA}/UsThinkWidgetProvider.java`);
  const models = read(`${JAVA}/UsWidgetModels.java`);
  assert.match(layout, /@\+id\/us_widget_kicker/);
  assert.match(layout, /android:id="@\+id\/us_widget_message"[\s\S]*?android:fontFamily="serif"[\s\S]*?android:textSize="18sp"/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)sp"/, 'nothing under 11sp');
  assert.match(models, /static final String TONE_PARTNER = "partner";/);
  assert.match(provider, /if \(UsWidgetModels\.TONE_PARTNER\.equals\(tone\)\) return 0xFFFF7C96;/);
  assert.match(provider, /if \(UsWidgetModels\.TONE_ME\.equals\(tone\)\) return 0xFFA98BFF;/);
  assert.match(provider, /new StyleSpan\(Typeface\.ITALIC\)/);
  assert.match(provider, /views\.setInt\(R\.id\.us_widget_heart, "setColorFilter", quiet \? 0xCCF7EFE9 : tone\);/);
  assert.match(provider, /"setBackgroundResource", pillFor\(model\.tone\)/);
});

test('Noi 2x1: night card, orchid label, serif distance, italic line, two-colour portrait', () => {
  const layout = res('layout/us_widget_noi.xml');
  const provider = read(`${JAVA}/UsNoiWidgetProvider.java`);
  const widgets = read('widgets.js');
  assert.match(layout, /android:background="@drawable\/us_widget_background"/);
  assert.doesNotMatch(layout, /us_widget_noi_light_background|#43303D|♡/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)sp"/);
  assert.match(layout, /@drawable\/us_widget_two_dots/);
  assert.match(provider, /R\.string\.us_widget_noi_between/);
  assert.doesNotMatch(provider, /"APRI NOI"|"TRA VOI"|"ULTIMA DISTANZA"/);
  const compose = widgets.slice(widgets.indexOf('async function composeNoiPortrait'), widgets.indexOf('function syncNoiPortrait'));
  assert.match(compose, /const colours = \['#ff7c96', '#a98bff'\];/);
  assert.match(compose, /canvas\.toBlob\(resolve, 'image\/png'\)/, 'transparent, sits on the card');
  assert.match(compose, /globalCompositeOperation = 'destination-out'/);
  assert.doesNotMatch(compose, /no-store/, 'a reused signed URL comes from the HTTP cache');
});

test('Countdown: the base style is the upright serif of Oggi; reward styles keep their look', () => {
  const provider = read(`${JAVA}/UsCountdownWidgetProvider.java`);
  const layout = res('layout/us_widget_countdown.xml');
  assert.match(layout, /@\+id\/us_cd_value_display/);
  assert.match(layout, /@\+id\/us_cd_clock_display/);
  assert.match(provider, /int titleColor = 0xFFFF8B7B;\s*int face = DISPLAY;/);
  for (const style of ['glass', 'orbit']) {
    const block = provider.slice(provider.indexOf(`case "${style}":`), provider.indexOf('break;', provider.indexOf(`case "${style}":`)));
    assert.match(block, /rewardBase\(look\);/, `${style} keeps its pre-1.0 base`);
  }
  assert.match(provider, /private static void rewardBase\(Look look\) \{\s*look\.titleColor = 0xE6FFF8FD;\s*look\.face = LIGHT;/);
});
