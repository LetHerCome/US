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
  const pairs = { us_widget_bg: '140c14', us_widget_surface: '1d1119', us_widget_text: 'f7efe9', us_widget_rosa: 'ff7c96', us_widget_lilla: 'a98bff', us_widget_orchidea: 'd98be0', us_widget_corallo: 'ff8b7b' };
  for (const [name, hex] of Object.entries(pairs)) {
    assert.match(colors, new RegExp(`<color name="${name}">#FF${hex}</color>`, 'i'), name);
    assert.match(css, new RegExp(`#${hex}`, 'i'), `${hex} is an app token`);
  }
  // The night card drawable (us_widget_background) left with the redesign (27/11/2026 cleanup).
});

// Widget Pastello (02/11/2026): every widget's picker preview is its Pastello
// card, both the layout (Android 12+) and the picture many launchers show
// instead (Xiaomi among them). Generic: never a real name, face or photo.
// 04/11/2026: the Countdown left the widgets; the Post-it took its place.
const KINDS = ['think', 'noi', 'photo', 'postit', 'daily', 'message', 'memories', 'status'];

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
  for (const k of ['think', 'photo', 'postit', 'message', 'memories']) assert.deepEqual(size(k), [336, 336], k);
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

// Widget del redesign (founder, 26/11/2026): each tile is its widget on the
// new card (night or the Quaderno's paper, with the app), the characters drawn
// by personaggi.js, the blended heart, paper that stays paper.
test('Impostazioni › Widget: each tile is its widget on the new card, with the real characters', () => {
  const css = read('dc-settings.css');
  assert.ok(css.includes('#usWidgetHub .us-widget-hub-preview{--us-w-tile:#120d11;'));
  assert.ok(css.includes(':root[data-us-luce="giorno"] #usWidgetHub .us-widget-hub-preview{--us-w-tile:#fbf7f0}'));
  assert.doesNotMatch(css, /--us-wp-aurora/, 'the pastel fields of before are gone');
  for (const rule of ['.us-wp-envelope{', '.us-wp-memories i{', '.us-widget-hub-preview>.us-wp-postit{', '.us-wp-duo{']) {
    assert.ok(css.includes(`#usWidgetHub ${rule}`), rule);
  }
  const hub = read('widget-hub.js');
  assert.match(hub, /const who = \(role, options = \{\}\) => window\.UsPersonaggi\?\.character\?\.\(role, \{ size: 28, \.\.\.options \}\) \|\| '';/);
  assert.match(hub, /<stop offset="0" style="stop-color:var\(--us-tu\)"\/><stop offset="1" style="stop-color:var\(--us-partner\)"\/>/);
  // 04/11/2026: the Countdown left the widgets; the Post-it took its place.
  assert.doesNotMatch(hub, /kind: 'countdown'|countdownPreview/);
  assert.match(hub, /kind: 'postit', name: 'Post-it'/);
});

// Pastello (founder, 02/11/2026): the light theme of the approved board.
// Ti penso (founder, 04/11/2026; tavole Main e TiPenso): only a heart. Empty
// until tapped; the tap fills it with a pop (UsThinkHeartActivity) and sends.
// Widget del redesign (founder, 26/11/2026): the heart from your colour to
// theirs, the only place where the two blend; their character when their
// thought arrives; you two in the 4x2. tests/widget-redesign.test.js has the rest.
test('Ti penso: the blended heart on the card, their character when their thought arrives', () => {
  const small = res('layout/us_widget_think.xml');
  const medium = res('layout/us_widget_think_medium.xml');
  const provider = read(`${JAVA}/UsThinkWidgetProvider.java`);
  for (const layout of [small, medium]) {
    assert.match(layout, /android:background="@drawable\/us_w_card"\s+android:clipToOutline="true"/);
    assert.match(layout, /android:id="@\+id\/us_widget_heart"/);
    assert.doesNotMatch(layout, /us_widget_art_|us_widget_grain|us_think_avatar|us_widget_cta/);
  }
  assert.match(small, /android:id="@\+id\/us_think_got"[\s\S]*android:id="@\+id\/us_think_partner"/);
  assert.match(medium, /android:id="@\+id\/us_think_me"[\s\S]*android:id="@\+id\/us_think_partner"/);
  assert.ok(provider.includes('UsWidgetCharacter.heart(views, context, R.id.us_widget_heart, me, partner, wide ? 32 : 68, true);'));
  assert.ok(provider.includes('UsWidgetCharacter.put(views, context, R.id.us_think_partner, partner, "innamorato", "", 84);'));
  assert.ok(provider.includes('views.setOnClickPendingIntent(R.id.us_widget_root, heart);'), 'the whole widget is the heart');
  assert.doesNotMatch(provider, /us_widget_cta|readNoiPortrait/);
  const pop = read(`${JAVA}/UsThinkHeartActivity.java`);
  assert.ok(pop.includes('heart.setColorFilter(ROSA);'), 'the pop fills the heart in rosa');
  assert.doesNotMatch(pop, /us_widget_pastel_circle/, 'no rosa button behind it any more');
  // The fonts are the app's own, decompressed to TTF for Android.
  for (const font of ['us_font_fraunces.ttf', 'us_font_fraunces_italic.ttf', 'us_font_figtree.ttf']) {
    const bytes = fs.readFileSync(path.join(ROOT, PLUGIN, 'res/font', font));
    assert.equal(bytes.readUInt32BE(0), 0x00010000, font);
  }
  assert.match(res('font/us_fraunces.xml'), /@font\/us_font_fraunces_italic/);
});

// Distanza e batteria (Pastello, 02/11): the round portraits come from the
// HTTP cache like every avatar; tests/widget-distance.test.js has the rest.
test('Distanza e batteria 2x1: the card of the redesign, the round portraits still drawn for Noi', () => {
  const layout = res('layout/us_widget_noi.xml');
  const widgets = read('widgets.js');
  assert.match(layout, /android:background="@drawable\/us_w_card"/);
  assert.doesNotMatch(layout, /us_widget_art_|us_widget_background|us_widget_two_dots|♡/);
  assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)sp"/);
  const round = widgets.slice(widgets.indexOf('async function composeRoundPortrait'), widgets.indexOf('function clearRoundPreviews'));
  assert.match(round, /canvas\.toBlob\(resolve, 'image\/png'\)/, 'transparent, sits on the card');
  assert.doesNotMatch(round, /no-store/, 'a reused signed URL comes from the HTTP cache');
});

// Countdown Pastello (02/11): one look for every style; tests/widget-countdown.test.js.
test('Countdown: gone from the widgets (founder, 04/11/2026); the Post-it took its place', () => {
  assert.equal(fs.existsSync(path.join(ROOT, JAVA, 'UsCountdownWidgetProvider.java')), false);
  for (const file of ['layout/us_widget_countdown.xml', 'layout/us_widget_countdown_medium.xml', 'xml/us_widget_countdown_info.xml']) {
    assert.equal(fs.existsSync(path.join(ROOT, PLUGIN, 'res', file)), false, file);
  }
  assert.doesNotMatch(read(`${PLUGIN}/AndroidManifest.xml`), /UsCountdownWidgetProvider/);
  assert.match(read(`${PLUGIN}/AndroidManifest.xml`), /android:name="com.usapp.widget.UsPostitWidgetProvider"/);
});
