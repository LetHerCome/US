// Oggi photo (founder decision 16/10, option A): it fills the screen, but
// when filling would cut more than a fifth of the picture (a landscape photo
// on a tall phone) it shows whole on a blurred copy of itself. Same rule for
// the Foto & Noi widget.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

class FakeClassList {
  constructor(items = []) { this.items = new Set(items); }
  contains(x) { return this.items.has(x); }
  toggle(x, on) { if (on) this.items.add(x); else this.items.delete(x); return on; }
  add(x) { this.items.add(x); }
  remove(x) { this.items.delete(x); }
}
function element(id, active = false) {
  return { id, style: {}, dataset: {}, attrs: new Set(), classList: new FakeClassList(active ? ['active'] : []),
    toggleAttribute(name, on) { if (on) this.attrs.add(name); else this.attrs.delete(name); },
    hasAttribute(name) { return this.attrs.has(name); } };
}

function fastBoot(heroW, heroH) {
  const els = {
    homeHero: { clientWidth: heroW, clientHeight: heroH },
    homePhotoLayerA: element('homePhotoLayerA', true), homePhotoLayerB: element('homePhotoLayerB'),
    homePhotoBackdropA: element('homePhotoBackdropA'), homePhotoBackdropB: element('homePhotoBackdropB'),
  };
  const window = { addEventListener() {}, UsPlatform: {} };
  const context = vm.createContext({
    window, console: { info() {} }, requestAnimationFrame: (f) => f(), localStorage: { getItem: () => null },
    document: { getElementById: (id) => els[id] || null, body: { classList: new FakeClassList() } },
  });
  vm.runInContext(read('fastboot2.js'), context);
  return { fit: window.UsHomePhotoFit, els };
}

test('Oggi: a landscape photo on a tall phone shows whole on its blurred copy', () => {
  const { fit, els } = fastBoot(400, 800);
  fit.set('A', 'https://x/land.webp', { naturalWidth: 1600, naturalHeight: 1000 });
  assert.equal(els.homePhotoLayerA.style.backgroundImage, 'url("https://x/land.webp")', 'the sharp image stays on the layer (Countdown, Stile, Settings read it)');
  assert.ok(els.homePhotoLayerA.hasAttribute('data-us-photo-whole'));
  assert.equal(els.homePhotoBackdropA.style.backgroundImage, 'url("https://x/land.webp")', 'same URL: no second download');
  assert.ok(els.homePhotoBackdropA.classList.contains('active'));
});

test('Oggi: a vertical photo close to the screen still fills it; the backdrop stays off', () => {
  const { fit, els } = fastBoot(400, 800);
  fit.set('A', 'https://x/tall.webp', { naturalWidth: 1000, naturalHeight: 1600 });
  assert.ok(!els.homePhotoLayerA.hasAttribute('data-us-photo-whole'));
  assert.equal(els.homePhotoBackdropA.style.backgroundImage, '');
  assert.ok(!els.homePhotoBackdropA.classList.contains('active'));
});

test('Oggi: the backdrop follows its layer through the crossfade and clears with the photo', () => {
  const { fit, els } = fastBoot(400, 800);
  fit.set('B', 'https://x/land.webp', { naturalWidth: 1600, naturalHeight: 1000 });
  assert.ok(!els.homePhotoBackdropB.classList.contains('active'), 'B is not shown yet');
  els.homePhotoLayerA.classList.remove('active');
  els.homePhotoLayerB.classList.add('active');
  fit.sync();
  assert.ok(els.homePhotoBackdropB.classList.contains('active'));
  fit.set('B', '', null);
  assert.equal(els.homePhotoLayerB.style.backgroundImage, '');
  assert.ok(!els.homePhotoBackdropB.classList.contains('active'));
});

test('Oggi: app.js paints through the shared rule and keeps the old path as fallback', () => {
  const app = read('app.js');
  assert.match(app, /if\(window\.UsHomePhotoFit\)window\.UsHomePhotoFit\.set\(nextKey,url,url\?preload:null\);/);
  assert.match(app, /homePhotoActiveLayer=nextKey;\n\s*window\.UsHomePhotoFit\?\.sync\(\);/);
  const html = read('index.html');
  assert.match(html, /id="homePhotoBackdropA"[\s\S]*id="homePhotoBackdropB"[\s\S]*id="homePhotoLayerA"/, 'backdrops paint under the layers');
  const css = read('dc-oggi.css');
  assert.match(css, /#homeHero \.home-photo-layer\[data-us-photo-whole\]\{background-size:contain;background-repeat:no-repeat\}/);
  assert.match(css, /#homeHero \.home-photo-backdrop\{[^}]*filter:blur\(28px\)/);
  assert.match(read('fastboot2.js'), /const HOME_PHOTO_CROP_LIMIT=0\.2;/);
});

test('Foto & Noi widget: same fifth-of-the-photo rule, whole on a soft blurred copy', () => {
  const provider = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsPhotoWidgetProvider.java');
  assert.match(provider, /static final float CROP_LIMIT = 0\.2f;/);
  assert.match(provider, /if \(cropsTooMuch\(source\.getWidth\(\), source\.getHeight\(\), outW, outH\)\) \{/);
  assert.match(provider, /Bitmap\.createScaledBitmap\(source, w, h, true\)/);
  assert.doesNotMatch(read('widgets.js').slice(read('widgets.js').indexOf('async function encodePhoto')), /cache: 'no-store'/);
});
