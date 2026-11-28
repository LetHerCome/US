// Widget «Lavagna» 2x2 (founder, 03/11/2026; board Lavagna.dc.html): the last
// drawing on the couple's board, Pastello with the phone's light theme and
// Midnight with the dark one, and who drew last, when. US paints the drawing
// while it is open (as the stack of Ricordi): two pictures reach native,
// never the strokes. The tap opens US on the board; nobody draws on the widget.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);
const png = (dir) => fs.readFileSync(path.join(ROOT, PLUGIN, `res/${dir}/us_widget_preview_lavagna.png`));

test('app: two pictures and who drew last reach native, the link opens the board', () => {
  const widgets = read('widgets.js');
  assert.match(widgets, /const KINDS = Object\.freeze\(\[[^\]]*'lavagna'[^\]]*\]\);/);
  assert.match(widgets, /lavagna: 'bond' ?[,}]/);
  assert.match(widgets, /if \(path === 'lavagna'\) return \{ kind: 'lavagna', target: 'lavagna', url: urlValue \};/);
  assert.match(widgets, /platform\.writeWidgetNoiPortrait\(owner, input\.light, 'lavagna'\)/);
  assert.match(widgets, /platform\.writeWidgetNoiPortrait\(owner, input\.dark, 'lavagna_night'\)/);
  assert.match(widgets, /lavagna: \{ \.\.\.lavagna \}/, 'in the snapshot');
  assert.match(widgets, /lavagna = \['ready', 'empty'\]\.includes\(native\.lavagna\?\.state\)/, 'restored from the phone');
  assert.match(widgets, /lavagna = emptyLavagna\(\);/, 'cleared at logout');
  assert.match(widgets, /if \(kind === 'lavagna'\) await window\.UsLavagna\?\.syncWidget\?\.\(\{ force: true \}\);/);
  assert.match(widgets, /\n {4}syncLavagna,\n/);
  const platform = read('platform.js');
  assert.match(platform, /\['pair', 'me', 'partner', 'memories', 'memories_wide', 'lavagna', 'lavagna_night'\]\.includes\(slot\)/);
  assert.match(platform, /const WIDGET_KINDS = \[[^\]]*'lavagna'[^\]]*\];/);
  assert.match(platform, /lavagna: widgetLavagna\(input\?\.lavagna\)/);
  const lavagna = read('lavagna.js');
  assert.match(lavagna, /widgets\.syncLavagna\(\{state,by:/);
  // Noi, Fase B.2 (D12): the couple's colours, deeper on the light Home.
  assert.ok(lavagna.includes('const pal=palette();[light,dark]=await Promise.all([picture(saved,pastelOf(pal)),picture(saved,pal)]);'), 'Pastello and Midnight inks');
  assert.match(lavagna, /c\.toBlob\(resolve,'image\/webp',0\.92\)/, 'transparent: the paper is the widget\'s');
});

test('native: a provider of its own, 2x2, the picture by theme, the tap on the board', () => {
  const provider = read(`${JAVA}/UsLavagnaWidgetProvider.java`);
  assert.match(provider, /state\.store\.readNoiPortrait\("lavagna"\)/);
  assert.match(provider, /state\.store\.readNoiPortrait\("lavagna_night"\)/);
  // The two pictures through the shared helper (widget del redesign, 26/11/2026):
  // Android 12+ the launcher switches them with the theme, before the theme of this render.
  assert.match(provider, /UsWidgetCharacter\.themed\(views, context, R\.id\.us_lav_drawing, light, dark\);/);
  assert.match(read(`${JAVA}/UsWidgetCharacter.java`), /static void themed\(RemoteViews views, Context context, int id, Bitmap day, Bitmap night\)/);
  // 2x2 and 4x2 since the redesign, with the pencil and whoever drew.
  assert.match(provider, /return UsWidgets\.sized\(options, small, medium\);/);
  assert.match(provider, /UsWidgets\.open\(context, "lavagna", 4901\)/);
  assert.doesNotMatch(provider, /HttpURLConnection|supabase|fetch\(|setOnClickFillInIntent/i);
  const widgetsJava = read(`${JAVA}/UsWidgets.java`);
  assert.match(widgetsJava, /static final String LAVAGNA = "lavagna";/);
  assert.match(widgetsJava, /static final String\[\] KINDS = \{[^}]*\bLAVAGNA\b[^}]*\};/);
  assert.match(widgetsJava, /case LAVAGNA: return UsLavagnaWidgetProvider\.class;/);
  assert.match(widgetsJava, /case LAVAGNA: return UsLavagnaWidgetProvider\.render\(context, state, options\);/);
  assert.match(read(`${JAVA}/UsWidgetStore.java`), /PORTRAIT_SLOTS = \{ "pair", "me", "partner", "memories", "memories_wide", "lavagna", "lavagna_night" \};/);
  const manifest = read(`${PLUGIN}/AndroidManifest.xml`);
  assert.match(manifest, /<receiver\s+android:name="com\.usapp\.widget\.UsLavagnaWidgetProvider"\s+android:exported="false"\s+android:label="@string\/us_widget_lavagna_name">[\s\S]*?android\.appwidget\.action\.APPWIDGET_UPDATE[\s\S]*?android:resource="@xml\/us_widget_lavagna_info" \/>/);
  const info = res('xml/us_widget_lavagna_info.xml');
  assert.match(info, /android:initialLayout="@layout\/us_widget_lavagna"/);
  assert.match(info, /android:previewLayout="@layout\/us_widget_preview_lavagna"/);
  assert.match(info, /android:previewImage="@drawable\/us_widget_preview_lavagna"/);
  assert.match(info, /android:targetCellWidth="2"[\s\S]*android:targetCellHeight="2"/);
  assert.match(info, /android:widgetCategory="home_screen"/);
});

test('layout: paper and blackboard by resource, no Space, nothing under 11sp, no sample', () => {
  for (const name of ['us_widget_lavagna', 'us_widget_lavagna_medium']) {
    const layout = res(`layout/${name}.xml`);
    assert.match(layout, /android:background="@drawable\/us_w_board_card"\s+android:clipToOutline="true"/, name);
    for (const id of ['us_lav_root', 'us_lav_drawing', 'us_lav_empty', 'us_lav_line', 'us_lav_pen_bg', 'us_lav_pen']) assert.match(layout, new RegExp(`@\\+id/${id}"`), `${name} ${id}`);
    assert.doesNotMatch(layout, /<Space\b|android\.widget\.Space/, 'RemoteViews refuse Space: the widget would not show');
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/);
    assert.doesNotMatch(layout, /android:(textColor|tint)="#/i, 'colours from the theme resources');
    assert.match(layout, /android:textColor="@color\/us_w_sub"/);
  }
  assert.match(res('layout/us_widget_lavagna_medium.xml'), /@\+id\/us_lav_by"[\s\S]*@string\/us_widget_lavagna_draw"/);
  assert.match(res('values/colors.xml'), /<color name="us_w_board">#FFF3ECE1<\/color>/);
  // A real blackboard (founder, 04/11/2026), like the board in the app.
  assert.match(res('values-night/colors.xml'), /<color name="us_w_board">#FF141416<\/color>/);
  assert.match(read('lavagna.css'), /\.us-lav-board\{[^}]*background:#141416;box-shadow:inset 0 0 0 6px #0b0b0d/);
  const preview = res('layout/us_widget_preview_lavagna.xml');
  assert.doesNotMatch(preview, /android:text="[^@]/);
  assert.match(preview, /@drawable\/us_widget_preview_lavagna"/);
  const strings = res('values/strings.xml');
  assert.match(strings, /<string name="us_widget_lavagna_name">Lavagna<\/string>/);
  assert.match(strings, /<string name="us_widget_lavagna_description">[^<]+<\/string>/);
  assert.match(strings, /<string name="us_widget_lavagna_empty">[^<]+<\/string>/);
});

test('picker previews: 336 px square, RGBA, light and dark, small', () => {
  const light = png('drawable-nodpi');
  const dark = png('drawable-night-nodpi');
  for (const [name, bytes] of [['light', light], ['dark', dark]]) {
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [336, 336], name);
    assert.equal(bytes[25], 6, `${name}: RGBA, the rounded corners are transparent`);
    assert.ok(bytes.length < 160 * 1024, `${name}: small`);
  }
  assert.notDeepEqual(dark, light);
});

test('Impostazioni › Widget: listed, square, with an English copy and the drawing as a preview', () => {
  const hub = read('widget-hub.js');
  assert.match(hub, /\{ kind: 'lavagna', name: 'Lavagna', copy: '[^']+', shape: 'square' \}/);
  assert.match(hub, /if \(kind === 'lavagna'\) return lavagnaPreview\(snapshot\);/);
  assert.match(hub, /window\.UsLavagna\?\.preview\?\.\(\)/);
  const copy = hub.match(/\{ kind: 'lavagna', name: 'Lavagna', copy: '([^']+)'/)[1];
  assert.ok(read('i18n-en.js').includes(`'${copy}':`), copy);
});
