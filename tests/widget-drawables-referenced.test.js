// Every drawable of the widget plugin is used (audit 27/11/2026): the redesign
// left ~90 drawables and illustrations behind (art, pastel, glass, the old
// wordmark and Ti penso icon, ~1.8 MB in every APK). A drawable counts as used
// when Java, a layout, an appwidget-provider xml, the manifest or another used
// drawable names it. UsDaysWidgetProvider renders Foto & Noi, so everything it
// needs is reached through UsPhotoWidgetProvider.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'native-plugins', 'us-widget-bridge', 'android', 'src');
const RES = path.join(SRC, 'main', 'res');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
const nameOf = (file) => path.basename(file).replace(/\..*$/, '');
const isDrawable = (file) => path.basename(path.dirname(file)).startsWith('drawable');

test('widget plugin: no drawable is left unreferenced', () => {
  const drawables = new Map();
  for (const file of walk(RES).filter(isDrawable)) {
    if (!drawables.has(nameOf(file))) drawables.set(nameOf(file), []);
    drawables.get(nameOf(file)).push(path.relative(RES, file));
  }
  assert.ok(drawables.size > 10);
  const sources = walk(SRC).filter((file) => /\.(java|kt|xml)$/.test(file))
    .map((file) => ({ file, drawable: isDrawable(file) ? nameOf(file) : null, text: fs.readFileSync(file, 'utf8') }));
  const mentions = (name, source) => new RegExp(`(?:R\\.drawable\\.|@drawable/)${name}\\b`).test(source.text);

  // Fixpoint: a drawable only named by unused drawables is unused too.
  let unused = new Set();
  for (;;) {
    const next = new Set([...drawables.keys()].filter((name) => !sources.some((source) =>
      source.drawable !== name && !unused.has(source.drawable) && mentions(name, source))));
    if (next.size === unused.size) break;
    unused = next;
  }
  assert.deepEqual([...unused].sort().map((name) => drawables.get(name).join(', ')), [],
    'remove the drawables nothing uses (or use them)');
});

test('widget plugin: every drawable Java and the layouts name exists', () => {
  const have = new Set(walk(RES).filter(isDrawable).map(nameOf));
  const missing = new Set();
  for (const file of walk(SRC).filter((item) => /\.(java|kt|xml)$/.test(item))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:R\.drawable\.|@drawable\/)([a-z0-9_]+)/g)) {
      if (!have.has(match[1])) missing.add(`${path.relative(SRC, file)}: ${match[1]}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('widget plugin: the retired illustrations and the copied masters do not come back', () => {
  const files = walk(RES).filter(isDrawable).map(nameOf);
  assert.deepEqual(files.filter((name) => /^us_widget_art_(?!field$)|^us_widget_glass|^us_widget_pastel_(?!circle$|heart$|tick_off$)|^us_wordmark_v1$|^us_icon_ti_penso_v1$/.test(name)), []);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'sync-approved-widget-assets.mjs')), false);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'), /assets:widget|sync-approved-widget-assets/);
});
