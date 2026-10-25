// US 1.0 polish, 18/10/2026 (founder QA on a phone): album composer and bin,
// the full-screen photo without a second view, notifications on mobile data,
// and the Android splash that follows the app theme.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('album: the add-photo composer rises over the full-screen photo instead of under it', () => {
  const css = read('dc-ricordi.css');
  assert.match(css, /\.us-album-section:not\(:has\(#usAlbumComposer\[hidden\]\)\)\{position:fixed;left:0;right:0;bottom:0;z-index:7;/);
  assert.match(css, /:has\(#usAlbumComposer:not\(\[hidden\]\)\) \.us-album-acts\{visibility:hidden\}/);
});

test('album: once "Eliminato" shows, the bin steps aside instead of covering it', () => {
  const css = read('dc-ricordi.css');
  assert.match(css, /\.us-album-acts \.us-undo-delete:is\(\[data-state="done"\],\[data-state="committing"\]\) \.us-undo-delete-go\{opacity:0;transform:translateX\(-12px\);pointer-events:none\}/);
  // It must come after the Galleria rule that forces the bin visible.
  assert.ok(css.indexOf('.us-undo-delete-go{opacity:0') > css.indexOf('.us-album-acts :is(.us-album-carousel-arrow,.us-album-floating-add,.us-album-current-delete,.us-undo-delete-go){position:static'));
});

test('album: a tap on the full-screen photo opens nothing else', () => {
  const js = read('moments-albums.js');
  assert.match(js, /cover\.onclick=null;\n    cover\.onkeydown=null;/);
  assert.doesNotMatch(js, /cover\.onclick=\(\)=>/);
});

test('notifications: "Attiva" waits longer on mobile data and retries a slow network once', () => {
  const js = read('notifications.js');
  assert.match(js, /const REGISTRATION_TIMEOUT_MS = 30000;/);
  assert.match(js, /const REGISTER_CALL_TIMEOUT_MS = 15000;/);
  assert.match(js, /const ENABLE_ATTEMPTS = 2;/);
  assert.match(js, /withTimeout\(request, REGISTER_CALL_TIMEOUT_MS\)/);
  assert.match(js, /if \(attempt >= ENABLE_ATTEMPTS \|\| !isRetryable\(error\)\) throw error;/);
  // 25/10: a refused Google token counts as the network too (it works on Wi-Fi).
  assert.ok(js.includes("const network = isRetryable(error) || /^registration_failed/.test(String(error?.message || ''));"));
  assert.match(js, /kind: network \? 'network' : 'error'/);
  // Background calls keep the short limit.
  assert.match(js, /const CALL_TIMEOUT_MS = 6000;/);
  const message = 'Rete lenta: riprova tra poco, oppure con il Wi-Fi';
  assert.ok(read('app.js').includes("result.kind==='network')toast(`"+message));
  assert.ok(read('onboarding.js').includes(`result?.kind==='network'?'${message}'`));
  assert.ok(read('i18n-en.js').includes(`'${message}': 'Slow connection: try again in a moment, or on Wi-Fi'`));
});

test('splash: one colour per app theme, a transparent symbol, and the app tells Android which one', () => {
  const colors = read('android/app/src/main/res/values/colors.xml');
  assert.match(colors, /<color name="us_splash_background">#26142E<\/color>/);
  const themes = { Rose: 'rose', Midnight: 'midnight', Film: 'film', BlueHour: 'blue_hour', Graphite: 'graphite' };
  const v31 = read('android/app/src/main/res/values-v31/styles.xml');
  const base = read('android/app/src/main/res/values/styles.xml');
  for (const [style, id] of Object.entries(themes)) {
    assert.match(colors, new RegExp(`<color name="us_splash_background_${id}">#[0-9A-F]{6}</color>`));
    assert.match(base, new RegExp(`<style name="AppTheme\\.NoActionBarLaunch\\.${style}" />`));
    assert.match(v31, new RegExp(`<style name="AppTheme\\.NoActionBarLaunch\\.${style}">[\\s\\S]*?android:windowSplashScreenBackground">@color/us_splash_background_${id}<`));
  }
  // Android 8–11: the default colour with the transparent symbol, never the dark master.
  const legacy = read('android/app/src/main/res/drawable/us_splash_background.xml');
  assert.match(legacy, /@drawable\/us_splash_symbol/);
  assert.doesNotMatch(legacy, /us_splash_master_v1/);
  const brand = JSON.parse(read('android/brand-assets-manifest.json'));
  assert.equal(brand.derivatives.find((d) => d.path.endsWith('/us_splash_symbol.png'))?.operation, 'FIT_CIRCLE_SAFE_TRANSPARENT');

  const plugin = read('native-plugins/us-splash-theme/android/src/main/java/com/usapp/splash/UsSplashThemePlugin.java');
  assert.match(plugin, /@CapacitorPlugin\(name = "UsSplashTheme"\)/);
  assert.match(plugin, /Build\.VERSION_CODES\.TIRAMISU/);
  assert.match(plugin, /setSplashScreenTheme\(style\)/);
  for (const [style, id] of Object.entries(themes)) assert.ok(plugin.includes(`case "${id}": return DEFAULT_STYLE + ".${style}";`), id);
  assert.equal(JSON.parse(read('package.json')).dependencies['@us/splash-theme'], 'file:native-plugins/us-splash-theme');
  assert.match(read('android/capacitor.settings.gradle'), /include ':us-splash-theme'/);
  assert.match(read('android/app/capacitor.build.gradle'), /implementation project\(':us-splash-theme'\)/);

  const progression = read('progression.js');
  assert.match(progression, /root\.dataset\.usTheme = theme; else delete root\.dataset\.usTheme; \}\n  syncSplashTheme\(theme\);/);
  assert.match(progression, /delete root\.dataset\[name\];\n    syncSplashTheme\(''\);/);
});

test('Ricordi: coming back to the app never leaves it empty ("Nessun ricordo")', () => {
  const app = read('app.js');
  // supabase-js re-announces SIGNED_IN on resume: for the account already open the boot does not run again.
  assert.match(app, /if\(event==='SIGNED_IN'&&window\.usProfile&&usAuthUserId&&\(_session\?\.user\?\.id\|\|''\)===usAuthUserId\)return;/);
  assert.ok(app.indexOf("event==='SIGNED_IN'&&window.usProfile") < app.lastIndexOf("setTimeout(initCloud,0);"));
  // A load already running when the grid was cleared queues one more.
  assert.match(app, /if\(document\.getElementById\('momentsGrid'\)\?\.dataset\.loaded!=='1'\)return momentsHydrateInFlight\.then\(\(\)=>hydrateMoments\(\)\);/);
  // When the couple comes back, an emptied Ricordi on screen loads again.
  assert.match(app, /classList\.contains\('active'\)&&document\.getElementById\('momentsGrid'\)\?\.dataset\.loaded!=='1'\)Promise\.resolve\(hydrateMoments\(\)\)/);
});

test('notifications: a failed "Attiva" says at which step and why (19/10, still failing on 5G)', () => {
  const js = read('notifications.js');
  const has = (text) => assert.ok(js.includes(text), text);
  // FCM's own reason is kept (only letters and underscores, never the token) and is retryable.
  has("const reason = message.match(/[A-Z][A-Z_]{3,}/g)?.pop() || message.replace(/[^A-Za-z_]/g, '').slice(0, 40);");
  has("settleToken(new Error('registration_failed:' + reason));");
  has('SERVICE_NOT_AVAILABLE|INTERNAL_SERVER_ERROR|TIMEOUT');
  for (const stage of ['N', 'T', 'S', 'O']) has(`enableStage = '${stage}';`);
  has("kind: network ? 'network' : 'error', code: failureCode(error)");
  has('await new Promise((resolve) => setTimeout(resolve, 2000));');
  assert.ok(read('app.js').includes("toast(`Non riesco ad attivare le notifiche${result.code?` · ${result.code}`:''}`)"));
});

test('opening animation: installed app only, at load (never on resume), from the splash colour, under a second', () => {
  const html = read('index.html');
  const has = (text) => assert.ok(html.includes(text), text);
  has('<div class="us-launch-intro" id="usLaunchIntro" aria-hidden="true">');
  has("if (!intro || (!native && !standalone) || reduced) { intro?.remove(); return; }");
  has("localStorage.getItem('us:splash-theme:v1')");
  has('setTimeout(done, 1600);');
  has('@media (prefers-reduced-motion:reduce){html.us-launch-play .us-launch-intro{display:none}}');
  // It lives in the page markup: a resume does not reload the page, so it never replays.
  assert.ok(html.indexOf('id="usLaunchIntro"') < html.indexOf('id="usAppLock"'));
  assert.doesNotMatch(read('app.js') + read('notifications.js'), /usLaunchIntro|us-launch-play/);
  // The colour matches what Android really showed (theme on 13+, default otherwise).
  assert.ok(read('progression.js').includes("window.localStorage.setItem('us:splash-theme:v1', result?.applied ? name : '')"));
});
