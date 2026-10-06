const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const IOS_APP = path.join(ROOT, 'ios', 'App', 'App');

function read(relative) {
  const target = path.join(ROOT, relative);
  assert.ok(fs.existsSync(target), `${relative} deve esistere`);
  return fs.readFileSync(target, 'utf8');
}

function plistKeys(source) {
  return [...source.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
}

function loadAppLinks() {
  return import(pathToFileURL(path.join(ROOT, 'app-links.mjs')).href);
}

test('M15 iOS: identità Capacitor stabile com.usapp.us, edge-to-edge, nessun server remoto', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'com.usapp.us');
  assert.equal(config.appName, 'US');
  assert.equal(config.webDir, 'dist/capacitor');
  assert.equal(config.server, undefined, 'la app carica il bundle locale, mai un URL remoto');
  assert.equal(config.ios.contentInset, 'never', 'safe area gestite dal CSS env(safe-area-inset-*)');
  assert.equal(config.ios.backgroundColor, '#08040E');
  assert.equal(config.ios.limitsNavigationsToAppBoundDomains, false);
  // Keyboard: WebKit default (visualViewport shrinks) is what fix4.js measures.
  // A native resize mode would shrink innerHeight too and break that contract.
  assert.equal(config.plugins?.Keyboard, undefined);
  assert.match(read('fix4.js'), /window\.visualViewport\?\.addEventListener\('resize'/);
});

test('M15 iOS: progetto Xcode con bundle id, deployment target 16.0 e nessun team/firma committati', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const bundleIds = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((match) => match[1]);
  assert.deepEqual(bundleIds, ['com.usapp.us', 'com.usapp.us']);
  const targets = [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)].map((match) => match[1]);
  assert.equal(targets.length, 4);
  assert.ok(targets.every((value) => value === '16.0'), `deployment target: ${targets.join(',')}`);
  assert.doesNotMatch(pbx, /DEVELOPMENT_TEAM\s*=/, 'nessun Apple Team ID nel repo');
  assert.doesNotMatch(pbx, /PROVISIONING_PROFILE/);
  assert.doesNotMatch(pbx, /CODE_SIGN_ENTITLEMENTS/, 'nessuna capability firmata in questa milestone');

  for (const file of ['UsBridgeViewController.swift', 'UsAppConfiguration.swift', 'UsPrivateStorage.swift']) {
    assert.match(pbx, new RegExp(`/\\* ${file.replace('.', '\\.')} in Sources \\*/,`), `${file} deve compilare nel target App`);
    assert.ok(fs.existsSync(path.join(IOS_APP, file)));
  }
  assert.match(pbx, /\/\* PrivacyInfo\.xcprivacy in Resources \*\/,/);
  assert.match(pbx, /XCLocalSwiftPackageReference "CapApp-SPM"/, 'Swift Package Manager, niente CocoaPods');
  assert.equal(fs.existsSync(path.join(ROOT, 'ios', 'App', 'Podfile')), false);
});

test('M15 iOS: Info.plist dichiara scheme, permessi reali e nessuna capability prematura', () => {
  const plist = read('ios/App/App/Info.plist');
  const keys = plistKeys(plist);
  assert.match(plist, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>com\.usapp\.us<\/string>\s*<\/array>/);
  for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSPhotoLibraryUsageDescription']) {
    assert.ok(keys.includes(key), `${key} mancante`);
  }
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  assert.match(plist, /<key>UIUserInterfaceStyle<\/key>\s*<string>Dark<\/string>/);
  assert.match(plist, /<key>UIStatusBarStyle<\/key>\s*<string>UIStatusBarStyleLightContent<\/string>/);
  assert.match(plist, /<string>arm64<\/string>/);
  assert.doesNotMatch(plist, /armv7/);
  for (const forbidden of ['NSAppTransportSecurity', 'NSAllowsArbitraryLoads', 'UIBackgroundModes', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSFaceIDUsageDescription', 'UIApplicationShortcutItems', 'WKAppBoundDomains']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} appartiene a una milestone successiva`);
  }
  const privacy = read('ios/App/App/PrivacyInfo.xcprivacy');
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.deepEqual(fs.readdirSync(IOS_APP).filter((name) => name.endsWith('.entitlements')), []);
});

test('M15 iOS: Back nativo = swipe dal bordo sinistro sulla stessa history di Android, mai uscita', () => {
  const controller = read('ios/App/App/UsBridgeViewController.swift');
  const config = read('ios/App/App/UsAppConfiguration.swift');
  assert.match(controller, /class UsBridgeViewController: CAPBridgeViewController/);
  assert.match(controller, /UIScreenEdgePanGestureRecognizer/);
  assert.match(controller, /gesture\.edges = \.left/);
  assert.match(controller, /allowsBackForwardNavigationGestures = false/);
  assert.match(config, /window\.UsNavigation/);
  assert.match(config, /handleNativeBack\(\)/);
  assert.doesNotMatch(config + controller, /exitApp|exit\(/);
  assert.match(read('navigation.js'), /window\.UsNavigation=Object\.freeze\(\{handleNativeBack\}\)/);
  assert.match(read('ios/App/App/SceneDelegate.swift'), /rootViewController = UsBridgeViewController\(\)/);
  assert.match(read('ios/App/App/Base.lproj/Main.storyboard'), /customClass="UsBridgeViewController" customModule="App"/);
});

test('M15 iOS: sessione fuori dai backup e App Group riservato ma non attivato', () => {
  const delegate = read('ios/App/App/AppDelegate.swift');
  const storage = read('ios/App/App/UsPrivateStorage.swift');
  const config = read('ios/App/App/UsAppConfiguration.swift');
  const launch = delegate.match(/didFinishLaunchingWithOptions[\s\S]*?return true/)?.[0] || '';
  assert.match(launch, /UsPrivateStorage\.excludeWebDataFromBackup\(\)/);
  assert.match(storage, /appendingPathComponent\("WebKit"/);
  assert.match(storage, /isExcludedFromBackup = true/);
  assert.match(config, /appGroupIdentifier = "group\.com\.usapp\.us\.shared"/);
  assert.match(config, /bundleIdentifier = "com\.usapp\.us"/);
  assert.equal(fs.existsSync(path.join(ROOT, 'ios', 'App', 'UsWidgets')), false, 'nessuna WidgetKit extension in M15');
});

test('M15 iOS: icona 1024 opaca e launch screen derivate dagli asset APPROVED, verificate per hash', () => {
  const manifest = JSON.parse(read('ios/brand-assets-manifest.json'));
  const approved = JSON.parse(read('assets/ASSET_MANIFEST.json')).assets;
  const sha = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relative))).digest('hex');
  assert.equal(manifest.derivatives.length, 2);
  for (const derivative of manifest.derivatives) {
    assert.equal(sha(derivative.path), derivative.sha256, `${derivative.path} modificato a mano`);
    for (const [source, hash] of Object.entries(derivative.sources)) assert.equal(sha(source), hash, `${source} cambiato`);
  }
  const symbol = approved.find((asset) => asset.path === 'assets/source/brand/us-symbol-master-v1.png');
  assert.equal(symbol.status, 'APPROVED');
  assert.equal(manifest.derivatives[0].sources[symbol.path], symbol.sha256);

  const icon = fs.readFileSync(path.join(IOS_APP, 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-1024.png'));
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
  assert.equal(icon[25], 2, 'App Store: icona RGB senza canale alpha');
  const contents = JSON.parse(read('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'));
  assert.deepEqual(contents.images.map((image) => image.filename), ['AppIcon-1024.png']);

  const launch = read('ios/App/App/Base.lproj/LaunchScreen.storyboard');
  assert.match(launch, /image="Splash"/);
  assert.match(launch, /red="0\.031372549019607843" green="0\.015686274509803921" blue="0\.054901960784313725"/);
  assert.doesNotMatch(launch, /systemBackgroundColor/, 'niente flash bianco al lancio');
  const splashFiles = fs.readdirSync(path.join(IOS_APP, 'Assets.xcassets', 'Splash.imageset')).filter((name) => name.endsWith('.png'));
  assert.deepEqual(splashFiles, ['us-launch-symbol@3x.png']);
});

test('M15 iOS: il bundle web e i file generati non vengono committati', () => {
  const gitignore = read('ios/.gitignore');
  assert.match(gitignore, /^App\/App\/public$/m);
  assert.match(gitignore, /^App\/App\/capacitor\.config\.json$/m);
  assert.match(gitignore, /^App\/App\/config\.xml$/m);
  assert.match(gitignore, /^DerivedData$/m);
});

test('M15 app links: solo com.usapp.us://open/<pagina primaria>, tutto il resto ignorato', async () => {
  const { parseAppLink, APP_LINK_PAGES } = await loadAppLinks();
  assert.deepEqual({ ...APP_LINK_PAGES }, { oggi: 'home', noi: 'bond', ricordi: 'moments', gioca: 'quiz' });
  assert.equal(parseAppLink('com.usapp.us://open/oggi').page, 'home');
  assert.equal(parseAppLink({ url: 'com.usapp.us://open/noi' }).page, 'bond');
  assert.equal(parseAppLink('com.usapp.us://open/Ricordi/').page, 'moments');
  assert.equal(parseAppLink('com.usapp.us://open/gioca?x=1').page, 'quiz');
  for (const rejected of [
    '', null, undefined, 42, 'not a url',
    'us://widget/think',
    'com.usapp.us://widget/think',
    'com.usapp.us://open/settings',
    'com.usapp.us://open/stories',
    'com.usapp.us://open/oggi/extra',
    'com.usapp.us://open/__proto__',
    'https://open/oggi',
    `com.usapp.us://open/${'x'.repeat(300)}`
  ]) {
    assert.equal(parseAppLink(rejected), null, `accettato: ${String(rejected)}`);
  }
});

test('M15 app links: cold start deduplicato e destinazione tenuta fino ad auth pronta', async () => {
  const { installAppLinks } = await loadAppLinks();
  const listeners = {};
  const calls = [];
  let urlHandler = null;
  const target = {
    usProfile: null,
    go: (page, options) => calls.push(['go', page, options?.nav === true]),
    openQuizHub: (options) => calls.push(['quiz', options?.nav === true]),
    addEventListener: (name, handler) => { listeners[name] = handler; }
  };
  const app = {
    addListener: (name, handler) => { assert.equal(name, 'appUrlOpen'); urlHandler = handler; return Promise.resolve({ remove() {} }); },
    getLaunchUrl: () => Promise.resolve({ url: 'com.usapp.us://open/noi' })
  };
  let clock = 1000;
  const links = installAppLinks({ app, target, now: () => clock });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(urlHandler({ url: 'com.usapp.us://open/noi' }), true, 'stesso URL del launch: assorbito');
  assert.equal(links.pending(), 'bond');
  assert.deepEqual(calls, [], 'niente navigazione prima del profilo');

  listeners['us-auth-resolved']({ detail: { paired: true } });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(calls, [['go', 'bond', true]]);

  target.usProfile = { id: 'me' };
  clock += 5000;
  urlHandler({ url: 'com.usapp.us://open/gioca' });
  assert.deepEqual(calls.at(-1), ['quiz', true]);
  assert.equal(urlHandler({ url: 'us://widget/think' }), false, 'i link widget restano di widgets.js');
  assert.equal(installAppLinks({ app: null }), null);
});

test('M15 native entry: runtime piattaforma-neutro, app links installati solo nel container native', () => {
  const entry = read('native-entry.mjs');
  assert.match(entry, /import \{ installAppLinks \} from '\.\/app-links\.mjs'/);
  assert.match(entry, /getPlatform: \(\) => Capacitor\.getPlatform\(\)/);
  assert.match(entry, /if \(Capacitor\.isNativePlatform\(\)\) installAppLinks\(/);
  // Shared product JS stays platform-neutral: no iOS/Android branching added.
  for (const file of ['platform.js', 'widgets.js', 'widget-hub.js', 'navigation.js', 'app.js']) {
    assert.doesNotMatch(read(file), /getPlatform\(\)\s*===?\s*['"](ios|android)['"]/, file);
  }
  assert.doesNotMatch(read('index.html'), /app-links/, 'app-links vive solo nel bundle native');
});

test('M15 regressione Android: widget system, minSdk 26 e allowBackup=false invariati', () => {
  assert.match(read('android/variables.gradle'), /minSdkVersion = 26\b/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:allowBackup="false"/);
  const bridge = JSON.parse(read('native-plugins/us-widget-bridge/package.json'));
  assert.deepEqual(Object.keys(bridge.capacitor), ['android'], 'il bridge widget resta solo Android');
  const widgets = read('widgets.js');
  assert.match(widgets, /url\.protocol !== 'us:' \|\| url\.hostname !== 'widget'/);
  assert.match(widgets, /const nativeEnabled = Boolean\(platform\?\.isNative && platform\?\.hasWidgetBridge\?\.\(\) !== false\)/,
    'su iOS (bridge assente) Widget Hub e widget restano spenti');
  assert.match(read('platform.js'), /return isPluginAvailable\('UsWidgetBridge'\)/);
  const swiftPackage = read('ios/App/CapApp-SPM/Package.swift');
  assert.doesNotMatch(swiftPackage, /widget-bridge|UsWidgetBridge/);
});

test('M15 CI macOS: npm ci, build web, cap sync ios e build Xcode simulator senza firma', () => {
  const workflow = read('.github/workflows/ios-native.yml');
  assert.match(workflow, /runs-on: macos-/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run build:capacitor-web/);
  assert.match(workflow, /run: npx cap sync ios/);
  assert.match(workflow, /-sdk iphonesimulator/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(workflow, /git diff --exit-code -- ios/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./, 'nessuna credenziale Apple richiesta');
  assert.doesNotMatch(workflow, /xcodebuild[^\n]*\barchive\b|-exportArchive|altool|notarytool|upload-app/);
});
