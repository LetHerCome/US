// A widget layout may only use the views RemoteViews can inflate: anything
// else (a Space, a plain View) makes the launcher show "Impossibile caricare
// il widget" (founder, 02/11/2026: Ti penso and La domanda di oggi "non si
// vedono"). Allow-list from android.widget.RemoteViews (API 31+ adds the
// compound buttons, which US does not use).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LAYOUTS = path.resolve(__dirname, '../native-plugins/us-widget-bridge/android/src/main/res/layout');
const ALLOWED = new Set(['FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout', 'AnalogClock', 'Button', 'Chronometer',
  'ImageButton', 'ImageView', 'ProgressBar', 'TextView', 'ViewFlipper', 'ListView', 'GridView', 'StackView', 'AdapterViewFlipper', 'ViewStub']);

test('every widget layout uses only views RemoteViews can inflate', () => {
  const files = fs.readdirSync(LAYOUTS).filter((f) => /^us_widget_.*\.xml$/.test(f));
  assert.ok(files.length >= 20);
  for (const file of files) {
    const xml = fs.readFileSync(path.join(LAYOUTS, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const [, tag] of xml.matchAll(/<([A-Za-z][\w.]*)[\s/>]/g)) {
      assert.ok(ALLOWED.has(tag), `${file}: <${tag}> cannot be inflated by RemoteViews`);
    }
  }
});
