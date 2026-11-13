// iOS Store V1 (05/11/2026): the iPhone app at the level of Android 1.4,
// everything that does not need the Apple Developer account
// (docs/missions/ios-store-v1.md). Windows cannot build iOS: these checks read
// the files; .github/workflows/ios-native.yml compiles and launches the app.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const IOS_APP = path.join(ROOT, 'ios', 'App', 'App');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const sha = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relative))).digest('hex');
const plistKeys = (source) => [...source.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);

function plistString(source, key) {
  return source.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))?.[1];
}

function stringsFile(relative) {
  return Object.fromEntries([...read(relative).matchAll(/^"([^"]+)" = "((?:[^"\\]|\\.)*)";$/gm)].map((m) => [m[1], m[2]]));
}

test('icone: predefinita e premi Sintonia dagli strati APPROVED, come il launcher Android', () => {
  const manifest = JSON.parse(read('ios/brand-assets-manifest.json'));
  const approved = new Map(JSON.parse(read('assets/ASSET_MANIFEST.json')).assets.map((asset) => [asset.path, asset]));
  const icons = manifest.derivatives.filter((d) => d.path.includes('.appiconset/'));
  assert.deepEqual(icons.map((d) => path.basename(path.dirname(d.path))),
    ['AppIcon.appiconset', 'AppIcon-Night.appiconset', 'AppIcon-Gold.appiconset', 'AppIcon-Neon.appiconset']);
  for (const icon of icons) {
    assert.equal(icon.operation, 'ANDROID_ADAPTIVE_VISIBLE_1024_OPAQUE');
    assert.equal(sha(icon.path), icon.sha256, `${icon.path} cambiata a mano: rigenerala con scripts/build-ios-brand-assets.py`);
    for (const [source, hash] of Object.entries(icon.sources)) {
      const entry = approved.get(source);
      assert.equal(entry?.status, 'APPROVED', `${source} non è APPROVED`);
      assert.equal(entry.immutable, true);
      assert.equal(entry.sha256, hash, `${source}: hash diverso dal manifest degli asset`);
    }
    const png = fs.readFileSync(path.join(ROOT, icon.path));
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
    assert.equal(png[25], 2, `${icon.path}: RGB senza alpha (App Store)`);
    const contents = JSON.parse(fs.readFileSync(path.join(path.dirname(path.join(ROOT, icon.path)), 'Contents.json'), 'utf8'));
    assert.deepEqual(contents.images, [{ filename: path.basename(icon.path), idiom: 'universal', platform: 'ios', size: '1024x1024' }]);
  }
  // The same layers as the Android reward icons (us_launcher_fg_*/bg_* come from these sources).
  const sources = icons.flatMap((icon) => Object.keys(icon.sources)).sort();
  assert.deepEqual(sources, [
    'assets/source/brand/app-icon/us-launcher-background-neon-v1.png',
    'assets/source/brand/app-icon/us-launcher-background-notte-v1.png',
    'assets/source/brand/app-icon/us-launcher-background-oro-v1.png',
    'assets/source/brand/app-icon/us-launcher-symbol-neon-v1.png',
    'assets/source/brand/app-icon/us-launcher-symbol-notte-v1.png',
    'assets/source/brand/app-icon/us-launcher-symbol-oro-v1.png',
    'assets/source/brand/app-icon/us-launcher-symbol-v2.png'
  ]);
  // Android 1.4 shows the frameless logo on white (04/11/2026).
  assert.match(read('android/app/src/main/res/values/colors.xml'), /<color name="ic_launcher_background">#FFFFFF<\/color>/);
  assert.equal(icons[0].background, '#FFFFFF');
});

test('icone premio: stessi id di Android, nomi del catalogo nel progetto Xcode e nel plugin', () => {
  const manifest = JSON.parse(read('ios/brand-assets-manifest.json'));
  assert.deepEqual(manifest.alternateIcons, { night: 'AppIcon-Night', gold: 'AppIcon-Gold', neon: 'AppIcon-Neon' });
  const android = read('native-plugins/us-app-icon/android/src/main/java/com/usapp/appicon/UsAppIconPlugin.java');
  assert.match(android, /static final String\[\] IDS = \{ "us", "night", "gold", "neon" \};/);
  const catalog = read('native-plugins/us-app-icon/ios/Sources/UsAppIconPlugin/UsAppIconCatalog.swift');
  assert.match(catalog, /"us": nil,/);
  for (const [id, name] of Object.entries(manifest.alternateIcons)) assert.match(catalog, new RegExp(`"${id}": "${name}"`));
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const settings = [...pbx.matchAll(/ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "([^"]+)";/g)].map((m) => m[1]);
  assert.deepEqual(settings, ['AppIcon-Night AppIcon-Gold AppIcon-Neon', 'AppIcon-Night AppIcon-Gold AppIcon-Neon'], 'Debug e Release');
  assert.doesNotMatch(read('ios/App/App/Info.plist'), /CFBundleIcons|CFBundleAlternateIcons/, 'le scrive Xcode dalla build setting');
});

test('plugin us-app-icon iOS: stesso nome JS e metodi di Android, collegato da Capacitor', () => {
  const pkg = JSON.parse(read('native-plugins/us-app-icon/package.json'));
  assert.deepEqual(pkg.capacitor, { android: { src: 'android' }, ios: { src: 'ios' } });
  assert.match(read('native-plugins/us-app-icon/Package.swift'), /name: "UsAppIcon"/);
  const swift = read('native-plugins/us-app-icon/ios/Sources/UsAppIconPlugin/UsAppIconPlugin.swift');
  assert.match(swift, /public let jsName = "UsAppIcon"/);
  assert.match(swift, /CAPPluginMethod\(name: "get"/);
  assert.match(swift, /CAPPluginMethod\(name: "set"/);
  assert.match(swift, /setAlternateIconName\(name\)/);
  assert.match(swift, /supportsAlternateIcons/);
  assert.match(swift, /if application\.alternateIconName == name/, 'niente avviso di iOS se l\'icona non cambia');
  const spm = read('ios/App/CapApp-SPM/Package.swift');
  assert.match(spm, /\.package\(name: "UsAppIcon", path: "\.\.\/\.\.\/\.\.\/native-plugins\/us-app-icon"\)/);
  assert.match(spm, /\.product\(name: "UsAppIcon", package: "UsAppIcon"\)/);
  assert.ok(!spm.includes(String.fromCharCode(92)), 'percorsi con / come li scrive cap sync su macOS (su Windows scrive \\)');
  // The web layer is unchanged and neutral: get first, set only when it changes.
  const progression = read('progression.js');
  assert.match(progression, /window\.Capacitor\?\.Plugins\?\.UsAppIcon/);
  assert.match(progression, /current\?\.icon === name \? null : plugin\.set\(\{ icon: name \}\)/);
});

test('Info.plist: salvare in Galleria non chiude l\'app, permessi in italiano e inglese, solo iPhone', () => {
  const plist = read('ios/App/App/Info.plist');
  const keys = plistKeys(plist);
  // «Salva immagine» from the share sheet (moments-albums.js) needs this key, or iOS terminates US.
  assert.ok(keys.includes('NSPhotoLibraryAddUsageDescription'));
  assert.match(read('moments-albums.js'), /navigator\.share\(\{files:\[file\]\}\)/);
  assert.match(plist, /<key>CFBundleLocalizations<\/key>\s*<array>\s*<string>it<\/string>\s*<string>en<\/string>\s*<\/array>/);
  assert.equal(plistString(plist, 'CFBundleDevelopmentRegion'), 'en', 'fuori dall\'italiano vale l\'inglese, come i18n.js');
  assert.match(read('i18n.js'), /return first\.startsWith\('it'\) \? 'it' : 'en';/);
  const usage = keys.filter((key) => /^NS.*UsageDescription$/.test(key)).sort();
  assert.deepEqual(usage, ['NSCameraUsageDescription', 'NSFaceIDUsageDescription', 'NSLocationWhenInUseUsageDescription',
    'NSMicrophoneUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSPhotoLibraryUsageDescription']);
  const it = stringsFile('ios/App/App/it.lproj/InfoPlist.strings');
  const en = stringsFile('ios/App/App/en.lproj/InfoPlist.strings');
  assert.deepEqual(Object.keys(it).sort(), usage);
  assert.deepEqual(Object.keys(en).sort(), usage);
  for (const key of usage) {
    assert.equal(it[key], plistString(plist, key), `${key}: it.lproj uguale all'Info.plist`);
    assert.ok(en[key].startsWith('US '), `${key}: frase inglese`);
    assert.notEqual(en[key], it[key]);
  }
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.match(pbx, /knownRegions = \(\s*en,\s*it,\s*Base,\s*\);/);
  assert.match(pbx, /\/\* InfoPlist\.strings in Resources \*\/,/);
  assert.match(pbx, /path = en\.lproj\/InfoPlist\.strings;/);
  assert.match(pbx, /path = it\.lproj\/InfoPlist\.strings;/);
  const families = [...pbx.matchAll(/TARGETED_DEVICE_FAMILY = ([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(families, ['1', '1'], 'solo iPhone nel primo rilascio: niente screenshot iPad');
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
});

test('manifesto privacy: nessun tracciamento, dati collegati all\'account solo per far funzionare US', () => {
  const privacy = read('ios/App/App/PrivacyInfo.xcprivacy');
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(privacy, /<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
  const types = [...privacy.matchAll(/<string>(NSPrivacyCollectedDataType[A-Za-z]+)<\/string>/g)].map((m) => m[1])
    .filter((name) => !name.startsWith('NSPrivacyCollectedDataTypePurpose'));
  assert.deepEqual(types.sort(), [
    'NSPrivacyCollectedDataTypeAudioData',
    'NSPrivacyCollectedDataTypeCoarseLocation',
    'NSPrivacyCollectedDataTypeDeviceID',
    'NSPrivacyCollectedDataTypeEmailAddress',
    'NSPrivacyCollectedDataTypeName',
    'NSPrivacyCollectedDataTypeOtherDataTypes',
    'NSPrivacyCollectedDataTypeOtherUserContent',
    'NSPrivacyCollectedDataTypePhotosorVideos',
    'NSPrivacyCollectedDataTypePreciseLocation',
    'NSPrivacyCollectedDataTypeProductInteraction',
    'NSPrivacyCollectedDataTypeSearchHistory',
    'NSPrivacyCollectedDataTypeUserID'
  ]);
  const entries = privacy.split('<key>NSPrivacyCollectedDataType</key>').slice(1);
  assert.equal(entries.length, types.length);
  for (const entry of entries) {
    assert.match(entry, /<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/);
    assert.match(entry, /<key>NSPrivacyCollectedDataTypePurposes<\/key>\s*<array>\s*<string>NSPrivacyCollectedDataTypePurposeAppFunctionality<\/string>\s*<\/array>/);
  }
  // us-app-lock measures time in background with the monotonic clock.
  assert.match(read('native-plugins/us-app-lock/ios/Sources/UsAppLockPlugin/UsAppLockPlugin.swift'), /clock_gettime_nsec_np\(CLOCK_MONOTONIC\)/);
  assert.match(privacy, /NSPrivacyAccessedAPICategorySystemBootTime<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>35F9\.1<\/string>/);
  // The labels for App Store Connect say the same.
  const labels = read('docs/store/ios/PRIVACY_LABELS.md');
  for (const label of ['Indirizzo email', 'Nome', 'Foto o video', 'Dati audio', 'Altri contenuti dell’utente', 'Posizione precisa', 'Posizione approssimativa', 'ID utente', 'ID dispositivo', 'Interazioni con il prodotto', 'Cronologia delle ricerche', 'Altri tipi di dati']) {
    assert.ok(labels.includes(label), `etichetta mancante: ${label}`);
  }
});

test('Universal Links: entitlement per /invito, file del sito scritto col Team ID, servito come JSON', async () => {
  const entitlements = read('ios/App/App/App.entitlements');
  assert.deepEqual(plistKeys(entitlements), ['aps-environment', 'com.apple.developer.applesignin', 'com.apple.developer.associated-domains']);
  assert.deepEqual([...entitlements.matchAll(/<string>(applinks:[^<]+)<\/string>/g)].map((m) => m[1]), ['applinks:www.uscouple.app']);
  assert.doesNotMatch(entitlements, /application-groups|keychain-access-groups/, 'App Group e Keychain condiviso arrivano con i widget (W0)');

  const { appSiteAssociation, BUNDLE_ID, INVITE_PATH } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'write-apple-app-site-association.mjs')).href);
  assert.equal(BUNDLE_ID, 'app.uscouple');
  assert.deepEqual(appSiteAssociation('ABCDE12345'), {
    applinks: { details: [{ appIDs: ['ABCDE12345.app.uscouple'], components: [{ '/': '/invito', comment: 'Invito di coppia di US' }] }] }
  });
  for (const bad of ['', 'abcde12345', 'ABCDE1234', 'ABCDE123456', 'ABCDE-1234', null]) assert.throws(() => appSiteAssociation(bad));
  // The same page Android opens (App Links) and onboarding.js reads.
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:path="\/invito"/);
  assert.equal(INVITE_PATH, '/invito');
  assert.match(read('onboarding.js'), /const INVITE_HOSTS=\['www\.uscouple\.app'/);
  // Capacitor forwards a Universal Link as appUrlOpen (SceneDelegate → SceneDelegateProxy).
  assert.match(read('ios/App/App/SceneDelegate.swift'), /SceneDelegateProxy\.shared\.scene\(scene, continue: userActivity\)/);

  const headers = read('cloudflare/_headers');
  assert.match(headers, /\/\.well-known\/apple-app-site-association\n  Content-Type: application\/json\n/);
  // Served only once the Team ID exists: then the file and its line in the build list arrive together.
  const site = path.join(ROOT, '.well-known', 'apple-app-site-association');
  const listed = read('scripts/build-cloudflare-pages.mjs').includes("'.well-known/apple-app-site-association'");
  assert.equal(fs.existsSync(site), listed, 'file e build devono arrivare insieme');
  if (listed) {
    const served = JSON.parse(fs.readFileSync(site, 'utf8'));
    assert.match(served.applinks.details[0].appIDs[0], /^[A-Z0-9]{10}\.app\.uscouple$/);
  }
});

test('lancio: stesso colore della splash Android e dell\'animazione d\'apertura, niente lampo scuro', () => {
  const colors = read('android/app/src/main/res/values/colors.xml');
  assert.match(colors, /<color name="us_splash_background">#26142E<\/color>/);
  assert.match(read('index.html'), /colors\[theme\] \|\| '#26142E'/);
  assert.equal(JSON.parse(read('capacitor.config.json')).ios.backgroundColor, '#26142E');
  assert.match(read('ios/App/App/UsAppConfiguration.swift'), /launchBackground = UIColor\(red: 38\.0 \/ 255\.0, green: 20\.0 \/ 255\.0, blue: 46\.0 \/ 255\.0, alpha: 1\.0\)/);
  assert.equal(JSON.parse(read('ios/brand-assets-manifest.json')).launchBackground, '#26142E');
  // The approved splash symbol, byte for byte.
  assert.equal(sha('ios/App/App/Assets.xcassets/Splash.imageset/us-launch-symbol@3x.png'), sha('android/app/src/main/res/drawable-nodpi/us_splash_symbol.png'));
});

test('CI iOS: nuovi controlli, avvio nel simulatore, nessuna credenziale', () => {
  const workflow = read('.github/workflows/ios-native.yml');
  for (const piece of ['native-plugins/us-app-icon/**', 'app-update.js', 'tests/ios-store-v1.test.js', 'cloudflare/_headers']) {
    assert.equal(workflow.split(`- '${piece}'`).length - 1, 2, `${piece}: push e pull_request`);
  }
  assert.match(workflow, /tests\/ios-store-v1\.test\.js tests\/app-update\.test\.js tests\/app-icons\.test\.js/);
  assert.match(workflow, /UsAppIconCatalog\.swift/);
  assert.match(workflow, /CFBundleIcons:CFBundleAlternateIcons/);
  assert.match(workflow, /NSPhotoLibraryAddUsageDescription/);
  assert.match(workflow, /xcrun simctl launch "\$DEVICE" app\.uscouple/);
  assert.match(workflow, /xcrun simctl io "\$DEVICE" screenshot/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test('TestFlight: solo a mano, da main, dopo l\'approvazione in ios-deploy, mai l\'IPA negli artifact', () => {
  const workflow = read('.github/workflows/ios-testflight.yml');
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(workflow, /environment: ios-deploy/);
  assert.match(workflow, /"\$GITHUB_REF" != "refs\/heads\/main"/);
  assert.match(workflow, /-allowProvisioningUpdates/);
  assert.match(workflow, /-authenticationKeyPath "\$RUNNER_TEMP\/asc\/AuthKey\.p8"/);
  assert.match(workflow, /<key>method<\/key><string>app-store-connect<\/string>/);
  assert.match(workflow, /<key>destination<\/key><string>upload<\/string>/);
  assert.match(workflow, /code="\$\(\( \( \$\(date -u \+%s\) - 1767225600 \) \/ 60 \)\)"/, 'build come il versionCode di Play');
  assert.match(workflow, /CURRENT_PROJECT_VERSION="\$US_IOS_BUILD_NUMBER"/);
  assert.match(workflow, /if: always\(\)\n\s+run: rm -rf "\$RUNNER_TEMP\/asc"/);
  const uploads = [...workflow.matchAll(/path: ([^\n]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(uploads, ['build/*.log'], 'solo i log: il repository è pubblico');
  assert.doesNotMatch(workflow, /DEVELOPMENT_TEAM = /);
  assert.doesNotMatch(read('ios/App/App.xcodeproj/project.pbxproj'), /DEVELOPMENT_TEAM/, 'il Team ID arriva dalla variabile, mai dal progetto');
});

test('documenti: missione, scheda App Store, etichette privacy e lista del giorno dell\'acquisto', () => {
  const mission = read('docs/missions/ios-store-v1.md');
  for (const part of ['## 1. Audit', '## 3. Accesso', '## 4. Widget iOS', '## 5. Dopo l\'acquisto', '## 6. Da provare']) assert.ok(mission.includes(part), part);
  const listing = read('docs/store/ios/APP_STORE_SCHEDA.md');
  for (const part of ['## Italiano', '## English', 'Note per la revisione', 'Screenshot', 'Età']) assert.ok(listing.includes(part), part);
  const day = read('docs/store/ios/GIORNO_ACQUISTO.md');
  for (const part of ['Team ID', 'app.uscouple', 'APNS_PRIVATE_KEY', 'APP_STORE_CONNECT_KEY_P8_B64', 'TestFlight', 'apple-app-site-association', 'APP_STORE_ID']) assert.ok(day.includes(part), part);
});
