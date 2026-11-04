// Widget, Foto protagonista (founder, 02/11/2026: "dobbiamo pulire questi
// widget, sono troppo poco artistici"; "ha senso prendere la foto solo quando
// si tratta di riferimenti"). The photo fills the widget only where the photo
// is the content (Foto & Noi, Ricordi a pila); every other widget is a soft
// illustration under a light grain, never a flat disc of colour. Fraunces is
// drawn as a picture because the launcher shows widget text in its own font.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RES = 'native-plugins/us-widget-bridge/android/src/main/res';
const JAVA = 'native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget';
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

const ART = ['think_s', 'think_m', 'photo', 'daily_s', 'daily_m', 'noi_s', 'noi_m',
  'message_s', 'message_m', 'memories_s', 'memories_m', 'memories_back', 'status_s', 'status_m', 'field'];

test('every illustration in Pastello and in Midnight, small WebP files', () => {
  let total = 0;
  for (const name of ART) {
    for (const dir of ['drawable-nodpi', 'drawable-night-nodpi']) {
      const file = path.join(ROOT, RES, dir, `us_widget_art_${name}.webp`);
      assert.ok(fs.existsSync(file), `${dir}/${name}`);
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', name);
      total += bytes.length;
    }
  }
  assert.ok(total < 600 * 1024, `all the illustrations stay light (${Math.round(total / 1024)} KB)`);
  assert.ok(exists(`${RES}/drawable-nodpi/us_widget_grain_tile.png`));
  assert.match(read(`${RES}/drawable/us_widget_grain.xml`), /android:tileMode="repeat"/);
});

test('the shared surfaces have their Midnight form', () => {
  for (const name of ['card', 'glass', 'glass_pill', 'fade', 'note']) {
    assert.ok(exists(`${RES}/drawable/us_widget_${name}.xml`), name);
    assert.ok(exists(`${RES}/drawable-night/us_widget_${name}.xml`), `${name} night`);
  }
  assert.match(read(`${RES}/drawable/us_widget_card.xml`), /#FFFFF6EE/);
  assert.match(read(`${RES}/drawable-night/us_widget_card.xml`), /#FF17111C/);
});

test('Fraunces as a picture, tinted with the theme; the initial on a soft field', () => {
  const art = read(`${JAVA}/UsWidgetArt.java`);
  assert.match(art, /context\.getResources\(\)\.getFont\(R\.font\.us_fraunces\)/);
  assert.match(art, /StaticLayout\.Builder\.obtain/);
  assert.match(art, /UsWidgets\.themedColor\(views, context, id, "setColorFilter", light, dark\);/);
  assert.match(art, /views\.setImageViewResource\(imageId, R\.drawable\.us_widget_art_field\);/);
  // From Android 12 the card clips the illustration and the launcher switches it with the theme.
  assert.match(art, /if \(clips\(\)\) \{\s*views\.setImageViewResource\(artId, drawable\);/);
});
