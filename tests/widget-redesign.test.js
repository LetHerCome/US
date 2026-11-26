// Widget del redesign (founder, 26/11/2026; tavola Hkj3ojVe3bwEHfg9XeJf6A,
// «Android ok», «tutte okay»): the widgets speak the app's language. Paper of
// the Quaderno by day and the warm night in the dark; the couple's colours in
// the things (tape, strokes, characters); the two blended only on the Ti penso
// and the main button; the characters instead of circles and portraits, the
// same the app draws: «se i personaggi cambiano di forma, in tutte le cose
// dove sono presenti ci saranno quei personaggi».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const res = (file) => read(`${PLUGIN}/res/${file}`);

test('the characters are the app\'s: the same five bodies, the same things to wear', () => {
  const app = read('personaggi.js');
  const shapes = read(`${JAVA}/UsCharacterShapes.java`);
  for (const name of ['palla', 'quadrato', 'triangolo', 'goccia', 'nuvola']) {
    const body = app.match(new RegExp(`${name}: \\{ body: '([^']+)'`))[1];
    assert.ok(shapes.includes(`"${body}"`), `${name}: the same body as personaggi.js`);
  }
  const contract = read(`${JAVA}/UsWidgetContract.java`);
  const head = app.match(/const LOOK_HEAD = Object\.freeze\(\[([^\]]+)\]\)/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1));
  const face = app.match(/const LOOK_FACE = Object\.freeze\(\[([^\]]+)\]\)/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1));
  assert.ok(contract.includes(`Pattern.compile("^(${head.join('|')})$")`), 'heads');
  assert.ok(contract.includes(`Pattern.compile("^(${face.join('|')})$")`), 'faces');
  for (const item of [...head, ...face]) assert.match(shapes, new RegExp(`case "${item}":`), item);
  // The outline in the dark of the colour (Stile unico), the ink and the heart eyes of the app.
  assert.match(app, /color-mix\(in srgb, \$\{color\} 42%, #1a1020\)/);
  assert.match(shapes, /return mix\(color, 0\.42, 0xFF1A1020\);/);
  assert.match(app, /const INK = '#14120E';/);
  assert.match(shapes, /static final int INK = 0xFF14120E;/);
});

test('the faces follow the app: asleep from 22 to 6, else the face of Come stai', () => {
  const pictures = read(`${JAVA}/UsWidgetCharacter.java`);
  assert.match(pictures, /if \(hour >= 22 \|\| hour < 6\) return "dorme";/);
  assert.match(pictures, /return UsCharacterShapes\.faceOf\(status\.optString\("status", ""\)\);/);
  assert.match(read('personaggi.js'), /return h >= 22 \|\| h < 6 \? 'sera' : '';/);
  // Every widget with characters draws them from the snapshot, never from a photo.
  for (const kind of ['Think', 'Status', 'Noi', 'Photo', 'Daily', 'Lavagna']) {
    assert.match(read(`${JAVA}/Us${kind}WidgetProvider.java`), /UsWidgetCharacter\.put\(/, kind);
  }
});

test('the palette: the Quaderno by day, the warm night in the dark, from the app\'s sheets', () => {
  const day = res('values/colors.xml');
  const night = res('values-night/colors.xml');
  const giorno = read('giorno.css');
  for (const [name, hex] of [['us_w_surface', 'fbf7f0'], ['us_w_board', 'f3ece1'], ['us_w_ink', '231b1d'], ['us_w_label', 'b8452f']]) {
    assert.match(day, new RegExp(`<color name="${name}">#FF${hex}</color>`, 'i'), name);
    assert.match(giorno, new RegExp(`#${hex}`, 'i'), `${hex} is the Quaderno's`);
  }
  assert.match(night, /<color name="us_w_surface">#FF120D11<\/color>/);
  assert.match(read('colori.css'), /html\{background:#120d11!important/);
  assert.match(night, /<color name="us_w_ink">#FFF7EFE9<\/color>/);
  // The card is one drawable whose colours switch with the theme.
  assert.match(res('drawable/us_w_card.xml'), /@color\/us_w_surface[\s\S]*@color\/us_w_line[\s\S]*android:radius="24dp"/);
  // Paper stays paper at night: the envelope, the polaroid, the post-its (founder, 24/11/2026).
  assert.doesNotMatch(night, /us_w_paper"|us_w_polaroid"/);
});

test('every widget sits on the new card; the illustrations of before are gone from the widgets', () => {
  const layouts = fs.readdirSync(path.join(ROOT, PLUGIN, 'res/layout')).filter((f) => /^us_widget_(?!preview_).*\.xml$/.test(f));
  assert.ok(layouts.length >= 18, `${layouts.length} layouts`);
  for (const file of layouts) {
    const xml = res(`layout/${file}`);
    assert.match(xml, /android:background="@drawable\/us_w_(?:board_)?card"/, file);
    assert.doesNotMatch(xml, /us_widget_art_|us_widget_grain|us_widget_pastel_/, file);
  }
  const java = fs.readdirSync(path.join(ROOT, JAVA)).filter((f) => /Provider\.java$/.test(f)).map((f) => read(`${JAVA}/${f}`)).join('\n');
  assert.doesNotMatch(java, /UsWidgetArt\.art\(|UsWidgetArt\.avatar\(|us_widget_art_/);
  // Two colours blended: only the Ti penso's heart and the main button.
  const pictures = read(`${JAVA}/UsWidgetCharacter.java`);
  assert.match(pictures, /static void heart\(RemoteViews views, Context context, int id, Person me, Person partner, float sizeDp, boolean blend\)/);
  assert.match(pictures, /static void pill\(RemoteViews views, Context context, int id, Person me, Person partner, float widthDp, float heightDp\)/);
  assert.match(pictures, /pill\(widthDp \* density, heightDp \* density, 0xFFB8452F, 0xFFB8452F\)/, 'ceralacca on paper');
});

test('Lavagna and Post-it come in 4x2 too', () => {
  for (const kind of ['lavagna', 'postit']) {
    assert.ok(fs.existsSync(path.join(ROOT, PLUGIN, `res/layout/us_widget_${kind}_medium.xml`)), kind);
    assert.match(res(`xml/us_widget_${kind}_info.xml`), /android:resizeMode="horizontal\|vertical"/, kind);
  }
});

test('the app hands over both characters and writes again when a shape, colour or look changes', async () => {
  const source = read('widgets.js');
  assert.match(source, /const emptyCharacter = \(\) => \(\{ shape: '', head: '', face: '', color: '', day: '' \}\);/);
  assert.match(source, /window\.addEventListener\('us-identity-change', \(\) => \{ setTimeout\(\(\) => \{ syncCharacters\(\)\.catch\(\(\) => \{\}\); \}, 300\); \}\);/);
  const body = source.match(/  function syncCharacters\(\) \{[\s\S]*?\n  \}\n/)[0];
  let writes = 0;
  const profiles = [{ role: 'francesco', person_color: 'blu' }, { role: 'beatrice', person_color: null }];
  const looks = { francesco: { head: 'corona', face: null }, beatrice: { head: null, face: 'occhiali' } };
  const shapes = { francesco: 'nuvola', beatrice: 'quadrato' };
  const sandbox = {
    window: {
      usProfile: { role: 'beatrice', couple_id: 'c' },
      UsCoupleContext: { snapshot: () => ({ profiles }) },
      UsPersonaggi: { shapeOf: (role) => shapes[role], lookOf: (role) => looks[role] },
      UsPersonColors: require('../person-colors.js')
    },
    ownerHash: 'h',
    memories: { state: 'none' },
    couple: { characters: { me: {}, partner: {} } },
    setTimeout: () => {},
    syncMemories: () => Promise.resolve(false),
    scheduleWrite: () => { writes += 1; return Promise.resolve(true); }
  };
  vm.runInNewContext(`${body}; this.syncCharacters = syncCharacters; this.read = () => couple;`, sandbox);
  await sandbox.syncCharacters();
  await sandbox.syncCharacters();
  assert.equal(writes, 1, 'the same characters twice: one write');
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.read().characters)), {
    me: { shape: 'quadrato', head: '', face: 'occhiali', color: '#a98bff', day: '#ab9ddb' },
    partner: { shape: 'nuvola', head: 'corona', face: '', color: '#6f9bff', day: '#8faad6' }
  });
  shapes.beatrice = 'goccia';
  await sandbox.syncCharacters();
  assert.equal(writes, 2, 'a new shape is written again');
  assert.equal(sandbox.read().characters.me.shape, 'goccia');
});
