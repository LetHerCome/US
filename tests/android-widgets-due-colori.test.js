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

// Widget Pastello (02/11/2026): every widget's picker preview is its Pastello
// card, both the layout (Android 12+) and the picture many launchers show
// instead (Xiaomi among them). Generic: never a real name, face or photo.
const KINDS = ['think', 'noi', 'photo', 'countdown', 'daily', 'message', 'memories', 'status'];

test('widgets: picker previews are generic, never a real name, face or photo', () => {
  const previews = KINDS.map((k) => res(`layout/us_widget_preview_${k}.xml`)).join('\n');
  const strings = res('values/strings.xml');
  for (const text of [previews, strings]) assert.doesNotMatch(text, /Beatrice|Francesco|\bBea\b|\bFra\b/);
  assert.doesNotMatch(previews, /android:text="[^@]/, 'preview text comes from strings.xml');
  assert.doesNotMatch(previews, /us_widget_background"/, 'no night card left in a preview');
  // Foto & Noi keeps the look it had before Pastello (founder, 02/11/2026): an abstract photo.
  // Foto protagonista: each preview layout shows the same generic picture as previewImage.
  for (const k of KINDS) assert.ok(res(`layout/us_widget_preview_${k}.xml`).includes(`@drawable/us_widget_preview_${k}"`), k);
  for (const info of KINDS) {
    const xml = res(`xml/us_widget_${info}_info.xml`);
    assert.match(xml, new RegExp(`android:previewLayout="@layout/us_widget_preview_${info}"`), info);
    assert.match(xml, new RegExp(`android:previewImage="@drawable/us_widget_preview_${info}"`), info);
  }
  // Giorni insieme is part of Foto & Noi: out of the list, still working where it is.
  assert.match(res('xml/us_widget_days_info.xml'), /android:widgetFeatures="hide_from_picker"/);
});

test('widgets: preview PNGs at 2x (168dp square, 192x96dp Noi, 240x120dp wide); Foto & Noi keeps its picture of before', () => {
  const png = (k) => fs.readFileSync(path.join(ROOT, PLUGIN, `res/drawable-nodpi/us_widget_preview_${k}.png`));
  const size = (k) => { const bytes = png(k); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };
  for (const k of ['think', 'photo', 'countdown', 'message', 'memories']) assert.deepEqual(size(k), [336, 336], k);
  assert.deepEqual(size('noi'), [384, 192]);
  for (const k of ['daily', 'status']) assert.deepEqual(size(k), [480, 240], k);
  for (const k of KINDS) {
    const bytes = png(k);
    assert.equal(bytes[25], 6, `${k}: RGBA, the rounded corners are transparent`);
    assert.ok(bytes.length < 160 * 1024, `${k}: small`);
  }
});

test('widgets: after an app update every widget redraws at once from the saved snapshot', () => {
  const manifest = read(`${PLUGIN}/AndroidManifest.xml`);
  assert.match(manifest, /UsWidgetSystemReceiver"\s+android:exported="false">\s*<intent-filter>[\s\S]*?<action android:name="android\.intent\.action\.MY_PACKAGE_REPLACED" \/>[\s\S]*?<\/intent-filter>/);
  const receiver = read(`${JAVA}/UsWidgetSystemReceiver.java`);
  assert.match(receiver, /case Intent\.ACTION_MY_PACKAGE_REPLACED:[\s\S]*?UsWidgets\.refreshAll\(context\);/);
  // refreshAll draws every kind from the stored snapshot, with the new layouts.
  const widgets = read(`${JAVA}/UsWidgets.java`);
  assert.match(widgets, /static synchronized void refreshAll\(Context context\)/);
});

test('Impostazioni › Widget: each tile is its widget, a soft field of colour, never a flat one', () => {
  const css = read('dc-settings.css');
  assert.ok(css.includes('#usWidgetHub .us-widget-hub-preview>*{--us-wp-aurora:radial-gradient('));
  for (const rule of ['.us-wp-think{background:var(--us-wp-aurora)', '.us-wp-countdown{background:var(--us-wp-aurora)', '.us-wp-daily{display:grid', '.us-wp-message{background:var(--us-wp-aurora)', '.us-wp-memories{position:relative;background:var(--us-wp-aurora)', '.us-wp-status{display:grid', '.us-wp-photo:not(.has-photo){background:var(--us-wp-aurora)']) {
    assert.ok(css.includes(`#usWidgetHub ${rule}`), rule);
  }
  const hub = read('widget-hub.js');
  assert.match(hub, /data-style="pastel"/);
  assert.doesNotMatch(hub, /data-style="\$\{esc\(c\.style/);
});

// Pastello (founder, 02/11/2026): the light theme of the approved board.
test('Ti penso, Foto protagonista: illustration and grain, Fraunces drawn as a picture, only the heart', () => {
  const small = res('layout/us_widget_think.xml');
  const medium = res('layout/us_widget_think_medium.xml');
  const provider = read(`${JAVA}/UsThinkWidgetProvider.java`);
  for (const [layout, art] of [[small, 'think_s'], [medium, 'think_m']]) {
    assert.match(layout, /android:background="@drawable\/us_widget_card"\s+android:clipToOutline="true"/);
    assert.match(layout, /android:id="@\+id\/us_think_art"[\s\S]*?android:scaleType="centerCrop"/);
    assert.ok(layout.includes(`@drawable/us_widget_art_${art}"`), art);
    assert.match(layout, /android:id="@\+id\/us_think_grain"[\s\S]*?@drawable\/us_widget_grain"/);
    assert.match(layout, /android:id="@\+id\/us_think_line"[\s\S]*?android:scaleType="fitStart"/);
    assert.match(layout, /android:fontFamily="@font\/us_figtree"/);
    assert.match(layout, /@drawable\/us_widget_glass"[\s\S]*@drawable\/us_widget_pastel_heart/);
    assert.doesNotMatch(layout.replace(/<!--[\s\S]*?-->/g, ''), /us_widget_cta|Ricambia/, 'only the heart answers (founder, 02/11/2026)');
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, 'nothing under 11sp');
  }
  assert.match(res('values/colors.xml'), /<color name="us_widget_pastel_ink">#FF1A1020<\/color>/);
  assert.ok(provider.includes('UsWidgetArt.serif(small, context, R.id.us_think_line, model.line, 19f'));
  assert.ok(provider.includes('UsWidgetArt.avatar(views, context, avatar, R.id.us_think_avatar, R.id.us_think_initial, model.partner'));
  assert.ok(provider.includes('UsWidgets.themedColor(views, context, R.id.us_widget_heart_bg, "setColorFilter", model.done ? ROSA : 0, model.done ? ROSA : 0);'));
  assert.ok(provider.includes('views.setInt(R.id.us_widget_heart, "setColorFilter", model.done ? 0xFFFFFFFF : ROSA);'));
  assert.doesNotMatch(provider, /us_widget_cta/);
  // The fonts are the app's own, decompressed to TTF for Android.
  for (const font of ['us_font_fraunces.ttf', 'us_font_fraunces_italic.ttf', 'us_font_figtree.ttf']) {
    const bytes = fs.readFileSync(path.join(ROOT, PLUGIN, 'res/font', font));
    assert.equal(bytes.readUInt32BE(0), 0x00010000, font);
  }
  assert.match(res('font/us_fraunces.xml'), /@font\/us_font_fraunces_italic/);
});

// Distanza e batteria (Pastello, 02/11): the round portraits come from the
// HTTP cache like every avatar; tests/widget-distance.test.js has the rest.
test('Distanza e batteria 2x1: the illustrated card, the same round portraits', () => {
  const layout = res('layout/us_widget_noi.xml');
  const widgets = read('widgets.js');
  assert.match(layout, /android:background="@drawable\/us_widget_card"/);
  assert.match(layout, /@drawable\/us_widget_art_noi_m"/);
  assert.doesNotMatch(layout, /us_widget_background|us_widget_two_dots|♡/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)sp"/);
  const round = widgets.slice(widgets.indexOf('async function composeRoundPortrait'), widgets.indexOf('function clearRoundPreviews'));
  assert.match(round, /canvas\.toBlob\(resolve, 'image\/png'\)/, 'transparent, sits on the card');
  assert.doesNotMatch(round, /no-store/, 'a reused signed URL comes from the HTTP cache');
});

// Countdown Pastello (02/11): one look for every style; tests/widget-countdown.test.js.
test('Countdown: one illustrated look replaces the night card and the reward looks', () => {
  const provider = read(`${JAVA}/UsCountdownWidgetProvider.java`);
  const layout = res('layout/us_widget_countdown.xml');
  assert.match(layout, /@drawable\/us_widget_art_countdown_s"/);
  assert.ok(provider.includes('UsWidgetArt.serif(views, context, R.id.us_cd_value, model.value'));
  assert.doesNotMatch(provider, /rewardBase|us_widget_cd_|Look look/);
  for (const name of ['aurora_bg', 'aurora_glow', 'chrome_tag', 'glass_bg', 'orbit_ring', 'signal_bg', 'signal_tag']) {
    assert.equal(fs.existsSync(path.join(ROOT, PLUGIN, `res/drawable/us_widget_cd_${name}.xml`)), false, name);
  }
});
