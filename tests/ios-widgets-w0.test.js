// iPhone widgets, phases W0 (bridge, extension, signing) and W1 (Foto & Noi,
// Ti penso). docs/missions/ios-store-v1.md §4, DECISIONS.md 14/11/2026.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const PLUGIN = 'native-plugins/us-widget-bridge';
const IOS = `${PLUGIN}/ios/Sources/UsWidgetBridgePlugin`;
const CORE = `${IOS}/Core`;
const EXT = 'ios/App/UsWidgets';
const ANDROID = `${PLUGIN}/android/src/main`;
const coreFiles = ['UsWidgetContract.swift', 'UsWidgetShared.swift', 'UsWidgetStore.swift', 'UsWidgetCredentials.swift', 'UsWidgetModels.swift'];
const sha = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relative))).digest('hex');

test('W0 ponte: stesso plugin UsWidgetBridge di Android, con gli stessi metodi', () => {
  const pkg = JSON.parse(read(`${PLUGIN}/package.json`));
  assert.deepEqual(pkg.capacitor, { android: { src: 'android' }, ios: { src: 'ios' } });
  const swiftPackage = read(`${PLUGIN}/Package.swift`);
  assert.match(swiftPackage, /name: "UsWidgetBridge"/);
  assert.match(swiftPackage, /platforms: \[\.iOS\(\.v16\)\]/);
  assert.match(swiftPackage, /path: "ios\/Sources\/UsWidgetBridgePlugin"/);
  const swift = read(`${IOS}/UsWidgetBridgePlugin.swift`);
  assert.match(swift, /@objc\(UsWidgetBridgePlugin\)/);
  assert.match(swift, /public let jsName = "UsWidgetBridge"/);
  const java = read(`${ANDROID}/java/com/usapp/widget/UsWidgetBridgePlugin.java`);
  const androidMethods = [...java.matchAll(/@PluginMethod\s+public void (\w+)\(/g)].map((m) => m[1]).sort();
  const iosMethods = [...swift.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(iosMethods, androidMethods, 'stessa interfaccia JS dei due ponti');
  for (const method of iosMethods) assert.match(swift, new RegExp(`@objc func ${method}\\(_ call: CAPPluginCall\\)`), method);
});

test('W0 ponte: nessuna sessione, nessun URL; il token di Ti penso solo nel Keychain condiviso', () => {
  const all = [`${IOS}/UsWidgetBridgePlugin.swift`, ...coreFiles.map((f) => `${CORE}/${f}`)].map(read).join('\n');
  assert.doesNotMatch(all, /access_token|refresh_token|supabase\.auth|sb-[a-z]+-auth/i);
  const store = read(`${CORE}/UsWidgetStore.swift`);
  const code = (text) => text.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
  assert.doesNotMatch(code(store), /token/i, 'l\'App Group non conserva mai il token');
  const credentials = read(`${CORE}/UsWidgetCredentials.swift`);
  assert.match(credentials, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.match(credentials, /kSecAttrAccessGroup/);
  assert.match(credentials, /\^\[A-Z0-9\]\{10\}\\\\\.app\\\\\.uscouple\\\\\.shared\$/, 'solo il gruppo condiviso col Team ID');
  assert.match(store, /isExcludedFromBackup = true/);
  assert.match(store, /completeFileProtectionUntilFirstUserAuthentication/);
  const shared = read(`${CORE}/UsWidgetShared.swift`);
  assert.match(shared, /appGroup = "group\.app\.uscouple\.shared"/);
  // The same single Edge project as Android's Play bundle.
  const javaEndpoints = read(`${ANDROID}/java/com/usapp/widget/UsWidgetEndpoints.java`);
  const project = javaEndpoints.match(/PROJECTS = \{ "([a-z0-9]+)" \}/)[1];
  assert.match(shared, new RegExp(`projects = \\["${project}"\\]`));
  assert.match(shared, new RegExp(`production = "https://${project}\\.supabase\\.co/functions/v1"`));
});

test('W0 contratto: l\'istantanea iOS ha gli stessi campi di UsWidgetContract.java', () => {
  const java = read(`${ANDROID}/java/com/usapp/widget/UsWidgetContract.java`);
  const swift = read(`${CORE}/UsWidgetContract.swift`);
  const javaKeys = new Set([...java.matchAll(/\.put\("(\w+)"/g)].map((m) => m[1]));
  const swiftKeys = new Set([...swift.matchAll(/"(\w+)": /g)].map((m) => m[1]));
  assert.ok(javaKeys.size > 40, `campi Android: ${javaKeys.size}`);
  assert.deepEqual([...javaKeys].filter((k) => !swiftKeys.has(k)), [], 'campi Android mancanti su iOS');
  for (const pattern of ['\\^\\[a-f0-9\\]\\{64\\}\\$', '\\^\\[a-f0-9\\]\\{32\\}\\$', '\\^\\(todo\\|your_turn\\|waiting\\|ready\\)\\$', '\\^\\(text\\|photo\\|audio\\|video\\|music\\)\\$', '\\^\\(yellow\\|pink\\|blue\\|green\\)\\$']) {
    assert.match(java, new RegExp(pattern), pattern);
    assert.match(swift, new RegExp(pattern), pattern);
  }
  for (const max of ['40', '60', '240', '24', '120']) assert.match(swift, new RegExp(`, ${max}\\)`), `taglio a ${max}`);
});

test('W0 modelli: stessi tempi di Ti penso e della foto di Android', () => {
  const java = read(`${ANDROID}/java/com/usapp/widget/UsWidgetModels.java`);
  const swift = read(`${CORE}/UsWidgetModels.swift`);
  const ms = (name) => Number(java.match(new RegExp(`${name} = ([0-9_ *L]+);`))[1].replace(/[_L ]/g, '').split('*').reduce((a, b) => a * Number(b), 1));
  const sec = (name) => {
    const expr = swift.match(new RegExp(`static let ${name}: TimeInterval = ([0-9_. *]+)`))[1];
    return expr.replace(/[_ ]/g, '').split('*').reduce((a, b) => a * Number(b), 1);
  };
  assert.equal(sec('sentVisible') * 1000, ms('SENT_VISIBLE_MS'));
  assert.equal(sec('sendCooldown') * 1000, ms('SEND_COOLDOWN_MS'));
  assert.equal(sec('failedVisible') * 1000, ms('FAILED_VISIBLE_MS'));
  assert.equal(sec('sendingStale') * 1000, ms('SENDING_STALE_MS'));
  assert.equal(sec('retrySameAction') * 1000, ms('RETRY_SAME_ACTION_MS'));
  assert.match(swift, /TimeZone\(identifier: "Europe\/Rome"\)/);
  assert.match(java, /static final long SENT_VISIBLE_MS/);
  assert.match(read(`${ANDROID}/java/com/usapp/widget/UsWidgetStore.java`), /MAX_PHOTOS = 3;/);
  assert.match(read(`${CORE}/UsWidgetStore.swift`), /static let maxPhotos = 3/);
});

test('W0 estensione: target WidgetKit app.uscouple.widgets, incorporato nell\'app, solo iPhone, iOS 16', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.match(pbx, /productType = "com\.apple\.product-type\.app-extension";/);
  assert.match(pbx, /\/\* UsWidgets\.appex in Embed Foundation Extensions \*\//);
  assert.match(pbx, /dstSubfolderSpec = 13;/);
  assert.match(pbx, /remoteInfo = UsWidgets;/);
  const widgetsBlocks = pbx.split('isa = XCBuildConfiguration;').filter((b) => b.includes('PRODUCT_BUNDLE_IDENTIFIER = app.uscouple.widgets;'));
  assert.equal(widgetsBlocks.length, 2);
  for (const block of widgetsBlocks) {
    assert.match(block, /APPLICATION_EXTENSION_API_ONLY = YES;/);
    assert.match(block, /CODE_SIGN_ENTITLEMENTS = UsWidgets\/UsWidgets\.entitlements;/);
    assert.match(block, /CODE_SIGN_STYLE = Automatic;/, 'la CI la fissa a mano solo sul runner');
    assert.match(block, /INFOPLIST_FILE = UsWidgets\/Info\.plist;/);
    assert.match(block, /IPHONEOS_DEPLOYMENT_TARGET = 16\.0;/);
    assert.match(block, /TARGETED_DEVICE_FAMILY = 1;/);
  }
  // The shared core is compiled from the plugin, never copied.
  assert.match(pbx, /path = "\.\.\/\.\.\/native-plugins\/us-widget-bridge\/ios\/Sources\/UsWidgetBridgePlugin\/Core";/);
  for (const file of coreFiles) {
    assert.match(pbx, new RegExp(`${file.replace('.', '\\.')} in Sources`), file);
    assert.equal(fs.existsSync(path.join(ROOT, EXT, file)), false, `${file} non duplicato`);
  }
  for (const file of fs.readdirSync(path.join(ROOT, EXT)).filter((f) => f.endsWith('.swift'))) {
    assert.match(pbx, new RegExp(`${file.replace('.', '\\.')} in Sources`), file);
  }
  const plist = read(`${EXT}/Info.plist`);
  assert.match(plist, /<key>NSExtensionPointIdentifier<\/key>\s*<string>com\.apple\.widgetkit-extension<\/string>/);
  assert.match(plist, /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/);
  assert.match(plist, /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/);
  assert.match(plist, /<key>UsWidgetKeychainGroup<\/key>\s*<string>\$\(AppIdentifierPrefix\)app\.uscouple\.shared<\/string>/);
  for (const font of [...plist.matchAll(/<string>([\w-]+\.ttf)<\/string>/g)].map((m) => m[1])) {
    assert.ok(fs.existsSync(path.join(ROOT, EXT, 'Resources', font)), font);
    assert.match(pbx, new RegExp(`${font.replace('.', '\\.')} in Resources`), font);
  }
  const entitlements = read(`${EXT}/UsWidgets.entitlements`);
  assert.match(entitlements, /<key>com\.apple\.security\.application-groups<\/key>\s*<array>\s*<string>group\.app\.uscouple\.shared<\/string>\s*<\/array>/);
  assert.match(entitlements, /<key>keychain-access-groups<\/key>\s*<array>\s*<string>\$\(AppIdentifierPrefix\)app\.uscouple\.shared<\/string>\s*<\/array>/);
  assert.doesNotMatch(entitlements, /aps-environment|associated-domains|applesignin/, 'l\'estensione non riceve notifiche né link');
  assert.match(read('ios/App/App/Info.plist'), /<key>UsWidgetKeychainGroup<\/key>\s*<string>\$\(AppIdentifierPrefix\)app\.uscouple\.shared<\/string>/);
});

test('Estensione widget: nessuna immagine spedita senza che lo Swift la usi', () => {
  // Piccolezze prima del rilascio (27/11/2026): the redesign draws the widgets
  // natively, the old art_* illustrations and the grain left the extension.
  const IMAGE = /\.(png|jpe?g|webp|gif|heic|pdf|svg)$/i;
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name.endsWith('.imageset') ? [relative] : walk(relative);
    return IMAGE.test(entry.name) ? [relative] : [];
  });
  const swift = [EXT, CORE].flatMap((dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.swift')).map((f) => read(`${dir}/${f}`))).join('\n');
  const used = (name) => new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.\\w+)?"`).test(swift);
  for (const file of walk(EXT)) {
    const name = path.basename(file).replace(/\.(imageset|\w+)$/, '');
    assert.ok(used(name), `${file}: immagine non usata dallo Swift dei widget`);
  }
  // The extension's resources phase carries only what the Swift uses.
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const phase = pbx.match(/B1D6E700000000000000000B \/\* Resources \*\/ = \{[\s\S]*?\};/);
  assert.ok(phase, 'fase Resources dell\'estensione');
  const shipped = [...phase[0].matchAll(/\/\* (.+?) in Resources \*\//g)].map((m) => m[1]);
  assert.ok(shipped.includes('Fraunces.ttf') && shipped.includes('Figtree.ttf'), 'i caratteri restano');
  // Images, also those of an asset catalog (walked above), only when the Swift names them.
  for (const file of shipped.filter((f) => IMAGE.test(f))) {
    assert.ok(used(file.replace(IMAGE, '')), `${file}: spedita ma non usata`);
  }
  for (const name of ['art_photo', 'art_think_s', 'art_think_m', 'grain_tile']) {
    assert.doesNotMatch(pbx, new RegExp(name), `${name} fuori dal progetto`);
  }
});

test('W1 caratteri: gli stessi file di Android, byte per byte', () => {
  // The Pastello illustrations and the grain left the Android widgets with the
  // redesign (27/11/2026 cleanup); the iPhone extension no longer draws them either.
  const pairs = [
    ['Fraunces.ttf', 'font/us_font_fraunces.ttf'], ['Fraunces-Italic.ttf', 'font/us_font_fraunces_italic.ttf'], ['Figtree.ttf', 'font/us_font_figtree.ttf']
  ];
  for (const [ios, android] of pairs) assert.equal(sha(`${EXT}/Resources/${ios}`), sha(`${ANDROID}/res/${android}`), ios);
  const theme = read(`${EXT}/UsWidgetTheme.swift`);
  // Android's axes (res/font/us_fraunces.xml, us_figtree.xml).
  assert.match(theme, /axes: \[wght: 400, opsz: 72\]/);
  assert.match(theme, /axes: \[wght: bold \? 700 : 500\]/);
  // Widget del redesign (26/11/2026): the same tokens as the Android widgets, the same Phosphor heart.
  const day = read(`${ANDROID}/res/values/colors.xml`);
  const night = read(`${ANDROID}/res/values-night/colors.xml`);
  for (const [token, hex] of [['us_w_surface', 'FBF7F0'], ['us_w_ink', '231B1D'], ['us_w_label', 'B8452F'], ['us_w_board', 'F3ECE1']]) {
    assert.match(day, new RegExp(`<color name="${token}">#FF${hex}</color>`), token);
    assert.match(theme, new RegExp(`0xFF${hex.slice(0, 2)}_${hex.slice(2)}`), `${token} su iPhone`);
  }
  for (const [token, hex] of [['us_w_surface', '120D11'], ['us_w_board', '141416']]) {
    assert.match(night, new RegExp(`<color name="${token}">#FF${hex}</color>`), token);
    assert.match(theme, new RegExp(`0xFF${hex.slice(0, 2)}_${hex.slice(2)}`), `${token} di notte su iPhone`);
  }
  const heart = read(`${ANDROID}/java/com/usapp/widget/UsWidgetCharacter.java`).match(/HEART = "([^"]+)"/)[1];
  assert.ok(theme.includes(`static let heart = "${heart}"`), 'lo stesso cuore di Android');
});

// Widget del redesign (26/11/2026): the characters on iPhone are the app's, like Android's.
test('Personaggi su iPhone: gli stessi corpi e accessori di personaggi.js e di Android', () => {
  const app = read('personaggi.js');
  const swift = read(`${CORE}/UsCharacterShapes.swift`);
  const java = read(`${ANDROID}/java/com/usapp/widget/UsCharacterShapes.java`);
  for (const name of ['palla', 'quadrato', 'triangolo', 'goccia', 'nuvola']) {
    const body = app.match(new RegExp(`${name}: \\{ body: '([^']+)'`))[1];
    assert.ok(swift.includes(`body: "${body}"`), `${name} su iPhone`);
    assert.ok(java.includes(`"${body}"`), `${name} su Android`);
  }
  for (const item of ['cappello', 'fiocco', 'cuffie', 'corona', 'coroncina', 'festa', 'cento', 'occhiali', 'sole', 'sciarpina', 'gala', 'macchinetta']) {
    assert.match(swift, new RegExp(`case "${item}":`), item);
  }
  assert.match(swift, /static let ink: UInt32 = 0xFF14_120E/);
  assert.match(swift, /static func edge\(_ color: UInt32\) -> UInt32 \{ mix\(color, 0\.42, 0xFF1A_1020\) \}/);
  const view = read(`${EXT}/UsCharacterView.swift`);
  assert.match(view, /let oneTint = mono \|\| renderingMode != \.fullColor/, 'blocca schermo e Home colorata: in una tinta');
  // The new files are in the extension's build (project.pbxproj).
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  for (const file of ['UsCharacterView.swift', 'UsCardWidgets.swift', 'UsCharacterShapes.swift']) {
    assert.match(project, new RegExp(`/\\* ${file.replace('.', '\\.')} in Sources \\*/,`), `${file} compilato`);
  }
});

test('W1 Foto & Noi e Ti penso: taglie, tocchi e link uguali ad Android', () => {
  const bundle = read(`${EXT}/UsWidgetsBundle.swift`);
  assert.match(bundle, /@main/);
  // Widget del redesign (26/11/2026): the same nine as Android, then the iOS 18 control.
  assert.match(bundle, /UsPhotoWidget\(\)\s+UsThinkWidget\(\)\s+UsDailyWidget\(\)\s+UsStatusWidget\(\)\s+UsNoiWidget\(\)\s+UsMessageWidget\(\)\s+UsMemoriesWidget\(\)\s+UsLavagnaWidget\(\)\s+UsPostitWidget\(\)\s+if #available\(iOS 18\.0, \*\) \{\s+UsThinkControl\(\)/);
  const photo = read(`${EXT}/UsPhotoWidget.swift`);
  assert.match(photo, /widgetKind\("photo"\)/);
  assert.match(photo, /\.supportedFamilies\(\[\.systemSmall, \.systemMedium, \.systemLarge, \.accessoryCircular, \.accessoryInline\]\)/);
  assert.match(photo, /\.widgetURL\(UsWidgetShared\.openURL\("photo"\)\)/);
  assert.match(photo, /\.containerBackgroundRemovable\(false\)/, 'StandBy tiene la foto');
  assert.match(photo, /widgetAccentedRenderingMode\(\.fullColor\)/, 'Home colorata: la foto resta a colori');
  const think = read(`${EXT}/UsThinkWidget.swift`);
  assert.match(think, /widgetKind\("think"\)/);
  assert.match(think, /\.supportedFamilies\(\[\.systemSmall, \.systemMedium, \.accessoryCircular, \.accessoryInline\]\)/);
  assert.match(think, /if #available\(iOS 17\.0, \*\) \{\s*if model\.canSend \{\s*Button\(intent: UsThinkIntent\(\)\)/);
  assert.match(think, /content\.widgetURL\(UsWidgetShared\.openURL\("think"\)\)/, 'iOS 16 e non collegato: apre US');
  assert.match(think, /static var openAppWhenRun = false/);
  assert.match(think, /ControlWidgetButton\(action: UsThinkIntent\(\)\)/, 'il Controllo «Ti penso» di iOS 18');
  const cards = read(`${EXT}/UsCardWidgets.swift`);
  for (const kind of ['daily', 'status', 'noi', 'message', 'memories', 'lavagna', 'postit']) {
    assert.match(cards, new RegExp(`widgetKind\\("${kind}"\\), provider: UsCardProvider\\(kind: "${kind}"\\)`), kind);
  }
  // The lock screen (solo iPhone): one tint, never answers, contents or places.
  assert.match(cards, /\.supportedFamilies\(\[\.systemSmall, \.systemMedium, \.accessoryCircular, \.accessoryRectangular\]\)/);
  assert.match(cards, /\.supportedFamilies\(\[\.systemSmall, \.systemMedium, \.accessoryRectangular\]\)/);
  assert.match(cards, /\.supportedFamilies\(\[\.systemSmall, \.systemMedium, \.accessoryCircular, \.accessoryRectangular, \.accessoryInline\]\)/);
  assert.doesNotMatch(cards, /answer"\]|"text"\]\)\.font|latitude|longitude/);
  const sender = read(`${EXT}/UsThinkSender.swift`);
  assert.match(sender, /X-US-Widget-Token/);
  assert.match(sender, /willPerformHTTPRedirection[\s\S]*completionHandler\(nil\)/, 'mai seguire un redirect col token');
  assert.match(sender, /guard model\.canSend, !model\.busy, !cooldown else \{ return \}/);
  assert.match(sender, /guard store\.owner\(\) == owner else \{ return \}/);
  // Links: the kinds widgets.js already reads (us://widget/<kind>), Giorni insieme not ported.
  const kinds = read('widgets.js').match(/const KINDS = Object\.freeze\(\[([^\]]+)\]\)|const KINDS = \[([^\]]+)\]/);
  const shared = read(`${CORE}/UsWidgetShared.swift`);
  assert.match(shared, /static let kinds = \["think", "postit", "noi", "photo", "daily", "message", "memories", "status", "lavagna"\]/);
  assert.match(read('platform.js'), /const WIDGET_KINDS = \['think', 'postit', 'noi', 'photo', 'daily', 'message', 'memories', 'status', 'lavagna'\];/);
  assert.ok(kinds, 'KINDS in widgets.js');
  assert.match(shared, /URL\(string: "us:\/\/widget\/" \+ path\)/);
});

test('W0 Impostazioni › Widget: su iPhone i passi, dal ponte, senza controlli di piattaforma nel JS', () => {
  const shared = read(`${CORE}/UsWidgetShared.swift`);
  const steps = shared.match(/addSteps = "([^"]+)"/)[1];
  assert.match(steps, /tieni premuto[\s\S]*Modifica › Aggiungi widget/);
  assert.match(read(`${IOS}/UsWidgetBridgePlugin.swift`), /"supported": false, "requested": false, "steps": UsWidgetShared\.addSteps/);
  const platform = read('platform.js');
  assert.match(platform, /const steps = typeof result\?\.steps === 'string' \? result\.steps\.trim\(\)\.slice\(0, 200\) : '';/);
  assert.match(read('widget-hub.js'), /\(result\.steps \|\| 'Questo telefono non aggiunge widget da solo\. Usa i widget della Home\.'\)/);
  assert.ok(read('i18n-en.js').includes(`'${steps}':`), 'i passi anche in inglese');
  for (const file of ['platform.js', 'widgets.js', 'widget-hub.js']) assert.doesNotMatch(read(file), /getPlatform\(\)\s*===?\s*['"](ios|android)['"]|isIOS|iPhone/, file);
});

test('W0 CI: il cuore condiviso si prova con swiftc e l\'app costruita contiene l\'estensione', () => {
  const workflow = read('.github/workflows/ios-native.yml');
  assert.match(workflow, /swiftc native-plugins\/us-widget-bridge\/ios\/Sources\/UsWidgetBridgePlugin\/Core\/\*\.swift \\\n\s+native-plugins\/us-widget-bridge\/ios\/Tests\/CoreCheck\/main\.swift/);
  assert.match(workflow, /EXT="\$APP\/PlugIns\/UsWidgets\.appex"/);
  assert.match(workflow, /tests\/ios-widgets-w0\.test\.js/);
  assert.match(workflow, /- 'native-plugins\/us-widget-bridge\/\*\*'/);
  const check = read(`${PLUGIN}/ios/Tests/CoreCheck/main.swift`);
  assert.ok((check.match(/check\(/g) || []).length > 70, 'casi del cuore condiviso');
});
