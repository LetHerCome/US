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

test('every Pastello card and surface has its Midnight form', () => {
  for (const name of ['think', 'countdown', 'daily', 'distance', 'left', 'memories', 'status', 'status_me', 'status_partner',
    'pill', 'pill_blush', 'bubble', 'badge', 'heart_badge', 'progress', 'dash_off', 'line']) {
    const file = `${RES}/drawable-night/us_widget_pastel_${name}.xml`;
    assert.ok(exists(file), file);
    assert.ok(exists(`${RES}/drawable/us_widget_pastel_${name}.xml`), `${name}: the light one too`);
  }
  // The board's notte, and US night (#17111c) at the bottom of the cards.
  assert.match(read(`${RES}/drawable-night/us_widget_pastel_countdown.xml`), /#FF2B2140[\s\S]*#FF1D1523|#FF1D1523[\s\S]*#FF2B2140/);
  assert.match(read(`${RES}/drawable-night/us_widget_pastel_memories.xml`), /#FF17111C/);
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
  // Ti penso (04/11/2026): only the rosa heart, the same in both themes.
  assert.match(read(`${JAVA}/UsThinkWidgetProvider.java`), /views\.setInt\(R\.id\.us_widget_heart, "setColorFilter", ROSA\);/);
  const noi = read(`${JAVA}/UsNoiWidgetProvider.java`);
  assert.match(noi, /UsWidgets\.themedColor\(views, context, R\.id\.us_noi_battery, "setTextColor", color, dark\);/);
  assert.doesNotMatch(noi, /views\.setTextColor\(R\.id\.us_noi_battery/);
});

test('picker previews: light in the light theme, dark in the dark one', () => {
  for (const kind of ['think', 'countdown', 'noi', 'daily', 'message', 'memories', 'status']) {
    const light = fs.readFileSync(path.join(ROOT, RES, `drawable-nodpi/us_widget_preview_${kind}.png`));
    const dark = fs.readFileSync(path.join(ROOT, RES, `drawable-night-nodpi/us_widget_preview_${kind}.png`));
    assert.deepEqual([dark.readUInt32BE(16), dark.readUInt32BE(20)], [light.readUInt32BE(16), light.readUInt32BE(20)], kind);
    assert.notDeepEqual(dark, light, `${kind}: a different picture`);
  }
});
