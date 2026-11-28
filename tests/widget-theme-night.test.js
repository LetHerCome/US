// Widget: Pastello with the phone's light theme, Midnight (the night colours
// of US, the board's "notte") with the dark one (founder, 02/11/2026: "dando
// la possibilità al widget di switchare in base al colore del sistema"). No
// extra widget: resources with the -night qualifier, and code colours given
// in both forms, so the launcher switches them when the theme changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RES = 'native-plugins/us-widget-bridge/android/src/main/res';
const JAVA = 'native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget';
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

test('the Pastello colours keep their Midnight form', () => {
  // The Pastello cards themselves left with the redesign (27/11/2026 cleanup);
  // the one Pastello drawable still used keeps its night twin.
  assert.ok(exists(`${RES}/drawable/us_widget_pastel_tick_off.xml`));
  assert.ok(exists(`${RES}/drawable-night/us_widget_pastel_tick_off.xml`));
  const night = read(`${RES}/values-night/colors.xml`);
  for (const [name, hex] of [['ink', 'FFF7EFE9'], ['sub', 'B8F7EFE9'], ['plum', 'FFF7EFE9'], ['heart_bg', 'FF3B2F3F']]) {
    assert.match(night, new RegExp(`<color name="us_widget_pastel_${name}">#${hex}</color>`), name);
    assert.match(read(`${RES}/values/colors.xml`), new RegExp(`<color name="us_widget_pastel_${name}">`), `${name} light`);
  }
});

test('no layout of a themed widget hard-codes a light colour', () => {
  for (const file of fs.readdirSync(path.join(ROOT, RES, 'layout'))) {
    if (!/^us_widget_(think|countdown|daily|noi|message|memories|status)/.test(file)) continue;
    const xml = read(`${RES}/layout/${file}`);
    assert.doesNotMatch(xml, /android:(textColor|tint)="#FF(1A1020|5B4A63|3B1F5C|FFFFFF|FFF1F0)"/i, file);
  }
});

test('code colours come in both forms; the launcher switches them with the theme', () => {
  const widgets = read(`${JAVA}/UsWidgets.java`);
  assert.match(widgets, /static void themedColor\(RemoteViews views, Context context, int id, String method, int light, int dark\) \{\s*if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.S\) views\.setColorInt\(id, method, light, dark\);\s*else views\.setInt\(id, method, night\(context\) \? dark : light\);/);
  assert.match(widgets, /Configuration\.UI_MODE_NIGHT_YES/);
  // Widget del redesign (26/11/2026): pictures come in both forms too (the
  // characters, the blended heart, the pill), switched by the launcher from Android 12.
  const pictures = read(`${JAVA}/UsWidgetCharacter.java`);
  assert.match(pictures, /views\.setIcon\(id, "setImageIcon", Icon\.createWithBitmap\(day\), Icon\.createWithBitmap\(night\)\);/);
  assert.match(pictures, /else \{\s*views\.setImageViewBitmap\(id, UsWidgets\.night\(context\) \? night : day\);/);
  const noi = read(`${JAVA}/UsNoiWidgetProvider.java`);
  assert.match(noi, /UsWidgets\.themedColor\(views, context, R\.id\.us_noi_battery, "setTextColor", color, dark\);/);
  assert.doesNotMatch(noi, /views\.setTextColor\(R\.id\.us_noi_battery/);
});

test('picker previews: light in the light theme, dark in the dark one', () => {
  // Widget del redesign (26/11/2026): every widget sits on the card of its theme,
  // the Post-it too (its paper stays paper on it), so every preview has two pictures.
  for (const kind of ['think', 'postit', 'noi', 'daily', 'message', 'memories', 'status', 'lavagna', 'photo']) {
    const light = fs.readFileSync(path.join(ROOT, RES, `drawable-nodpi/us_widget_preview_${kind}.png`));
    const dark = fs.readFileSync(path.join(ROOT, RES, `drawable-night-nodpi/us_widget_preview_${kind}.png`));
    assert.deepEqual([dark.readUInt32BE(16), dark.readUInt32BE(20)], [light.readUInt32BE(16), light.readUInt32BE(20)], kind);
    assert.notDeepEqual(dark, light, `${kind}: a different picture`);
  }
});
