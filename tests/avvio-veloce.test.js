// Avvio più veloce (27/11/2026): cold and warm start of the Android and iOS app.
// - the web bundle inside the apps ships minified (as the web one);
// - the English dictionary is read only in English;
// - back after a few seconds away, nothing is reread (UsForeground);
// - one moment marks the first screen on display (UsAppReady, us:app-ready):
//   the hook of the entry animation;
// - Android paints the splash colour, not white, before the first web frame.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const html = read('index.html');
const app = read('app.js');

function headModule() {
  const start = html.indexOf('// Avvio più veloce (27/11/2026). Two small facts');
  assert.ok(start > 0, 'the start module is in index.html');
  const open = html.lastIndexOf('<script>', start);
  const close = html.indexOf('</script>', start);
  return html.slice(open + '<script>'.length, close);
}

function runHead({ now = () => 0 } = {}) {
  const docListeners = {};
  const winListeners = {};
  const classes = new Set();
  const events = [];
  const timers = [];
  const document = {
    hidden: false,
    documentElement: { classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) } },
    addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); }
  };
  const window = {
    document,
    performance: { now: () => 1234.4 },
    requestAnimationFrame: (fn) => fn(),
    addEventListener: (type, fn) => { (winListeners[type] ||= []).push(fn); },
    dispatchEvent: (event) => { events.push(event); (winListeners[event.type] || []).forEach((fn) => fn(event)); }
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const DateStub = { now };
  vm.runInNewContext(headModule(), { window, document, CustomEvent, Date: DateStub, setTimeout: (fn, ms) => timers.push({ fn, ms }), Promise });
  const setHidden = (value) => { document.hidden = value; (docListeners.visibilitychange || []).forEach((fn) => fn()); };
  return { window, document, classes, events, timers, setHidden, fire: (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail })) };
}

test('start module: in <head>, before every deferred script and before the launch intro', () => {
  const at = html.indexOf('// Avvio più veloce (27/11/2026). Two small facts');
  assert.ok(at < html.indexOf('<script defer'), 'before the deferred scripts');
  assert.ok(at < html.indexOf('</head>'));
  assert.ok(at < html.indexOf('id="usLaunchIntro"'));
});

test('UsForeground: how long US was away; a quick trip is short, the first return is not', () => {
  let clock = 1000;
  const h = runHead({ now: () => clock });
  const fg = h.window.UsForeground;
  assert.equal(fg.SHORT_AWAY_MS, 30000);
  assert.equal(fg.awayMs(), Infinity, 'never away yet');
  assert.equal(fg.shortAway(), false);
  // A visibilitychange to visible without a hidden one before it stays "long".
  h.setHidden(false);
  assert.equal(fg.shortAway(), false);
  h.setHidden(true); clock += 8000; h.setHidden(false);
  assert.equal(fg.awayMs(), 8000);
  assert.equal(fg.shortAway(), true);
  h.setHidden(true); clock += 45000; h.setHidden(false);
  assert.equal(fg.awayMs(), 45000);
  assert.equal(fg.shortAway(), false);
  assert.equal(fg.shortAway(60000), true, 'a module may ask for its own limit');
});

test('UsForeground: a listener that runs before the module still reads this return', () => {
  let clock = 100;
  const h = runHead({ now: () => clock });
  h.setHidden(true);
  clock = 5100;
  // Visible, but the module has not seen the event yet (an earlier listener asks).
  h.document.hidden = false;
  assert.equal(h.window.UsForeground.awayMs(), 5000);
  assert.equal(h.window.UsForeground.shortAway(), true);
  // A clock moved backwards is never "short".
  h.setHidden(true); clock = 1000; h.setHidden(false);
  assert.equal(h.window.UsForeground.shortAway(), false);
});

test('UsAppReady: once, after paint, with the class, the event and the promise', async () => {
  const h = runHead();
  const ready = h.window.UsAppReady;
  assert.equal(ready.ready, false);
  ready.mark('oggi');
  ready.mark('again');
  assert.equal(ready.ready, true);
  assert.ok(h.classes.has('us-app-ready'));
  const fired = h.events.filter((e) => e.type === 'us:app-ready');
  assert.equal(fired.length, 1);
  assert.deepEqual({ ...fired[0].detail }, { reason: 'oggi', at: 1234 });
  assert.deepEqual({ ...(await ready.whenReady) }, { reason: 'oggi', at: 1234 });
});

test('UsAppReady: the login and the lock are first screens too; a paired boot waits for Oggi; 8 s at most', () => {
  let h = runHead();
  h.fire('us-auth-resolved', { paired: true });
  assert.equal(h.window.UsAppReady.ready, false, 'paired: app.js marks it when Oggi is painted');
  h.fire('us-auth-resolved', { paired: false });
  assert.equal(h.window.UsAppReady.detail.reason, 'auth');
  h = runHead();
  h.fire('us-app-lock-change', { locked: false });
  assert.equal(h.window.UsAppReady.ready, false);
  h.fire('us-app-lock-change', { locked: true });
  assert.equal(h.window.UsAppReady.detail.reason, 'lock');
  h = runHead();
  const safety = h.timers.find((t) => t.ms === 8000);
  assert.ok(safety);
  safety.fn();
  assert.equal(h.window.UsAppReady.detail.reason, 'timeout');
});

test('app.js marks the first screen after its photo and the question, never later than 2.5 s', () => {
  const body = app.slice(app.indexOf('async function hydrateCloud'), app.indexOf('function escapeHtml'));
  assert.match(body, /const todayFirst=new Promise\(resolve=>usRunWhenIdle\(\(\)=>hydrateToday\(\)\.finally\(resolve\),120\)\);/);
  assert.match(body, /if\(!homePhotoHasPainted\)firstScreen\.push\(new Promise\(resolve=>window\.addEventListener\('us:home-photo-changed',resolve,\{once:true\}\)\)\);/);
  assert.match(body, /usMarkAppReadyAfter\(firstScreen,'oggi'\);/);
  assert.ok(body.indexOf('usMarkAppReadyAfter') < body.indexOf('await Promise.allSettled(critical)'));
  const helper = app.slice(app.indexOf('function usMarkAppReadyAfter'), app.indexOf('const US_AUTH_SESSION_TIMEOUT_MS'));
  assert.match(helper, /capMs=2500/);
  assert.match(helper, /Promise\.race\(\[Promise\.allSettled\(tasks\),new Promise\(resolve=>setTimeout\(resolve,capMs\)\)\]\)/);
});

test('warm start: after a short trip away the screen is not reread', () => {
  assert.match(app, /function usShortAway\(\)\{return Boolean\(window\.UsForeground\?\.shortAway\?\.\(\)\);\}/);
  assert.match(app, /if\(!document\.hidden&&window\.usProfile&&!usShortAway\(\)\)refreshVisibleState\(\{foreground:true\}\)/);
  assert.match(app, /if\(document\.hidden\|\|!window\.usProfile\|\|usShortAway\(\)\)return;\n\s*if\(document\.getElementById\('moments'\)/);
  const gates = {
    'countdown.js': /if\(key\(\)&&!w\.UsForeground\?\.shortAway\?\.\(\)\)hydrate\(\)/,
    'distance.js': /if\(!d\.hidden&&key\(\)&&!w\.UsForeground\?\.shortAway\?\.\(\)\)hydrate\(\)/,
    'games.js': /if \(window\.UsForeground\?\.shortAway\?\.\(\)\) return;\n\s*\(window\.usAfterForeground/,
    'widgets.js': /if \(document\.hidden \|\| !ownerHash \|\| window\.UsForeground\?\.shortAway\?\.\(\)\) return;/,
    'fix4.js': /if \(!window\.UsForeground\?\.shortAway\?\.\(\)\) \(window\.usAfterForeground/,
    'app-update.js': /doc\.visibilityState === 'visible' && !globalThis\.UsForeground\?\.shortAway\?\.\(\)\) updater\.check\(\)/,
    'moments-albums.js': /if\(!document\.hidden&&window\.usProfile&&!window\.UsForeground\?\.shortAway\?\.\(\)\)\{/,
    'noi-v2.js': /classList\.contains\('active'\)&&!window\.UsForeground\?\.shortAway\?\.\(\)\)refresh\(\)/,
    'settings.js': /classList\.contains\('active'\)&&!window\.UsForeground\?\.shortAway\?\.\(\)\)hydrateUsSettings\(\)/,
    'weekly-challenge.js': /#quiz\.active'\) && !globalThis\.UsForeground\?\.shortAway\?\.\(\)\) load\(\)/,
    'lavagna.js': /if\(loaded&&key\(\)===owner&&!w\.UsForeground\?\.shortAway\?\.\(\)\)load\(\{force:true\}\)/
  };
  for (const [file, pattern] of Object.entries(gates)) assert.match(read(file), pattern, file);
  // What is not a reread stays: the strokes waiting to leave, the lock, push taps.
  assert.match(read('lavagna.js'), /placed=null;\n\s*if\(outbox\.length\)flush\(\);/);
  assert.doesNotMatch(read('app-lock.js'), /UsForeground/);
  assert.doesNotMatch(read('notifications.js'), /UsForeground/);
});

test('English dictionary: only in English, written in while the head is parsed', () => {
  assert.doesNotMatch(html, /<script src="\/i18n-en\.js/, 'no static tag: Italian phones never parse it');
  const tag = html.match(/<script src="(\/i18n\.js\?v=[^"]+)" data-us-en="(\/i18n-en\.js\?v=[^"]+)"><\/script>/);
  assert.ok(tag, 'i18n.js names the dictionary');
  assert.equal(tag[1].split('?')[1], tag[2].split('?')[1], 'same build');
  assert.ok(html.indexOf(tag[0]) < html.indexOf('<link rel="stylesheet"'), 'still before the body and the styles');
  const source = read('i18n.js');
  const run = ({ lang, readyState = 'loading', src = '/i18n-en.js?v=us-rilascio-1' }) => {
    const written = [];
    const window = {
      location: { href: `https://www.uscouple.app/?us-lang=${lang}` },
      localStorage: { getItem: () => lang, setItem() {} },
      navigator: { language: lang },
      document: { readyState, currentScript: { getAttribute: (name) => (name === 'data-us-en' ? src : null) }, write: (markup) => written.push(markup), documentElement: {} }
    };
    vm.runInNewContext(source, { window, URL });
    return written;
  };
  assert.deepEqual(run({ lang: 'it' }), []);
  assert.deepEqual(run({ lang: 'en' }), ['<script src="/i18n-en.js?v=us-rilascio-1"></script>']);
  assert.deepEqual(run({ lang: 'en', readyState: 'complete' }), [], 'never after parsing');
  assert.deepEqual(run({ lang: 'en', src: 'https://evil.example/x.js' }), [], 'only the local dictionary');
  assert.deepEqual(run({ lang: 'en', src: '/i18n-en.js?v="><img onerror=x>' }), []);
  // Both bundles still ship the dictionary and the web keeps it precached.
  for (const file of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(file), /'i18n-en\.js',/);
  assert.match(read('service-worker.js'), /versioned\("\/i18n-en\.js"\)/);
});

test('the web bundle of the apps is minified like the web one, before its manifest', () => {
  const build = read('scripts/build-capacitor-web.mjs');
  assert.match(build, /import \{ minifyWebBundle \} from '\.\/minify-web\.mjs';/);
  assert.ok(build.indexOf('await minifyWebBundle(OUTPUT)') > build.indexOf('await writeFile(stagedIndexPath, html'), 'after the native index rewrite');
  assert.ok(build.indexOf('await minifyWebBundle(OUTPUT)') < build.indexOf('const filesBeforeManifest'), 'before the manifest hashes');
  assert.match(read('scripts/minify-web.mjs'), /\['dist\/cloudflare-pages', 'dist\/s31-staging-preview', 'dist\/capacitor'\]/);
});

test('Android: the WebView starts in the splash colour, as iOS already does', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  const splash = read('android/app/src/main/res/values/colors.xml').match(/<color name="us_splash_background">(#[0-9A-F]{6})<\/color>/)[1];
  assert.equal(config.android.backgroundColor, splash);
  assert.equal(config.ios.backgroundColor, splash);
});
