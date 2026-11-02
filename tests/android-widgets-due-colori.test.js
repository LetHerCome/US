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
  // Pastello: the board's sunset instead of a photo.
  assert.match(res('layout/us_widget_preview_photo.xml'), /@drawable\/us_widget_pastel_photo_empty/);
  assert.match(res('drawable/us_widget_pastel_photo_empty.xml'), /<gradient/);
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

// Pastello (founder, 02/11/2026): the light theme of the approved board.
test('Ti penso Pastello: the board\'s card, Fraunces and Figtree, the heart button that fills', () => {
  const small = res('layout/us_widget_think.xml');
  const medium = res('layout/us_widget_think_medium.xml');
  const provider = read(`${JAVA}/UsThinkWidgetProvider.java`);
  for (const layout of [small, medium]) {
    assert.match(layout, /android:background="@drawable\/us_widget_pastel_think"/);
    assert.match(layout, /android:id="@\+id\/us_widget_message"[\s\S]*?android:fontFamily="@font\/us_fraunces"/);
    assert.match(layout, /android:fontFamily="@font\/us_figtree"/);
    assert.match(layout, /@drawable\/us_widget_pastel_heart/);
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, 'nothing under 11sp');
  }
  assert.match(res('drawable/us_widget_pastel_think.xml'), /android:endColor="#FFEFE4FF"[\s\S]*android:startColor="#FFFFE3EA"/);
  assert.match(res('values/colors.xml'), /<color name="us_widget_pastel_ink">#FF1A1020<\/color>/);
  assert.match(provider, /views\.setInt\(R\.id\.us_widget_heart_bg, "setColorFilter", model\.done \? ROSA : 0xFFFFFFFF\);/);
  assert.match(provider, /views\.setInt\(R\.id\.us_widget_heart, "setColorFilter", model\.done \? 0xFFFFFFFF : ROSA\);/);
  // The fonts are the app's own, decompressed to TTF for Android.
  for (const font of ['us_font_fraunces.ttf', 'us_font_fraunces_italic.ttf', 'us_font_figtree.ttf']) {
    const bytes = fs.readFileSync(path.join(ROOT, PLUGIN, 'res/font', font));
    assert.equal(bytes.readUInt32BE(0), 0x00010000, font);
  }
  assert.match(res('font/us_fraunces.xml'), /@font\/us_font_fraunces_italic/);
});

// Distanza e batteria (Pastello, 02/11): the round portraits come from the
// HTTP cache like every avatar; tests/widget-distance.test.js has the rest.
test('Distanza e batteria 2x1: the board\'s card, the same round portraits', () => {
  const layout = res('layout/us_widget_noi.xml');
  const widgets = read('widgets.js');
  assert.match(layout, /android:background="@drawable\/us_widget_pastel_distance"/);
  assert.doesNotMatch(layout, /us_widget_background|us_widget_two_dots|♡/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)sp"/);
  const round = widgets.slice(widgets.indexOf('async function composeRoundPortrait'), widgets.indexOf('function clearRoundPreviews'));
  assert.match(round, /canvas\.toBlob\(resolve, 'image\/png'\)/, 'transparent, sits on the card');
  assert.doesNotMatch(round, /no-store/, 'a reused signed URL comes from the HTTP cache');
});

// Countdown Pastello (02/11): one look for every style; tests/widget-countdown.test.js.
test('Countdown: the board\'s card replaces the night card and the reward looks', () => {
  const provider = read(`${JAVA}/UsCountdownWidgetProvider.java`);
  const layout = res('layout/us_widget_countdown.xml');
  assert.match(layout, /android:background="@drawable\/us_widget_pastel_countdown"/);
  assert.match(layout, /android:id="@\+id\/us_cd_value"[\s\S]*?android:fontFamily="@font\/us_fraunces"/);
  assert.doesNotMatch(provider, /rewardBase|us_widget_cd_|Look look/);
  for (const name of ['aurora_bg', 'aurora_glow', 'chrome_tag', 'glass_bg', 'orbit_ring', 'signal_bg', 'signal_tag']) {
    assert.equal(fs.existsSync(path.join(ROOT, PLUGIN, `res/drawable/us_widget_cd_${name}.xml`)), false, name);
  }
});
