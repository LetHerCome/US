const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function functionSource(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `blocco mancante: ${start}`);
  assert.notEqual(to, -1, `fine blocco mancante: ${end}`);
  return source.slice(from, to);
}

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) { if (force) this.add(value); else this.remove(value); }
}

function homeHarness() {
  const images = [];
  const hero = { classList: new FakeClassList(), attributes: new Map(), setAttribute(name, value = '') { this.attributes.set(name, value); }, removeAttribute(name) { this.attributes.delete(name); } };
  const empty = { hidden: true };
  const layers = {
    homePhotoLayerA: { style: {}, classList: new FakeClassList(['active']) },
    homePhotoLayerB: { style: {}, classList: new FakeClassList() }
  };
  const context = vm.createContext({
    console: { warn() {} },
    document: { getElementById: (id) => ({ homeHero: hero, homeEmptyState: empty, ...layers })[id] || null },
    requestAnimationFrame: (callback) => callback(),
    Image: class {
      constructor() { images.push(this); }
      set src(value) { this.url = value; }
      decode() { return new Promise((resolve) => { this.resolveDecode = resolve; }); }
    }
  });
  const source = read('app.js');
  vm.runInContext(`
    let homePhotoActiveLayer = 'A';
    let homePhotoRequestId = 0;
    let homePhotoHasPainted = false;
    ${functionSource(source, 'function crossfadeHomePhoto(', 'async function hydrateHomePhoto(')}
  `, context);
  return { context, hero, empty, layers, images };
}

test('Home attende load e decode, dipinge la prima foto senza transizione e ignora un decode stale', async () => {
  const harness = homeHarness();

  harness.context.crossfadeHomePhoto('https://media.test/first.webp');
  const first = harness.images[0];
  first.onload();
  assert.equal(harness.layers.homePhotoLayerB.style.backgroundImage, undefined, 'nessuna foto viene applicata prima del decode');

  harness.context.crossfadeHomePhoto('https://media.test/second.webp');
  const second = harness.images[1];
  second.onload();
  second.resolveDecode();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.layers.homePhotoLayerB.style.backgroundImage, 'url("https://media.test/second.webp")');
  assert.equal(harness.layers.homePhotoLayerB.classList.contains('active'), true);
  assert.equal(harness.hero.attributes.has('data-us-home-photo-instant'), false, 'la prima foto non deve lasciare uno stato motion persistente');

  first.resolveDecode();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.layers.homePhotoLayerB.style.backgroundImage, 'url("https://media.test/second.webp")', 'un decode lento non deve sovrascrivere una foto pi\u00f9 recente');
});

test('viewer e album usano il lifecycle foundation senza rendere l apertura dipendente dal decode', () => {
  const html = read('index.html');
  const app = read('app.js');
  const albums = read('moments-albums.js');

  const viewer = html.match(/<div class="moment-viewer"[\s\S]*?<\/div>\s*<script/)?.[0] || '';
  assert.match(viewer, /data-us-motion-surface/);
  assert.match(viewer, /class="moment-viewer-card"[^>]*data-us-modal-panel/);
  assert.match(app, /UsUiFoundation\.exitSurface\(viewer,finalize\)/);
  assert.match(app, /showMomentViewer\(viewer/);
  assert.match(app, /const previewUrl=card\.querySelector\('img'\)\?\.currentSrc/);
  assert.match(app, /const preload=new Image\(\)/);
  assert.match(app, /cancelSurfaceExit\?\.\(viewer\)/);
  assert.match(albums, /data-us-motion-surface/);
  assert.match(albums, /UsUiFoundation\.exitSurface\(lb,finalize\)/);
});

test('lightbox conserva tracking diretto e prepara il frame entrante prima del settle breve', () => {
  const albums = read('moments-albums.js');
  const css = read('moments-albums.css');

  assert.match(albums, /loadDecodedPhoto/);
  assert.match(albums, /lightboxRenderToken/);
  assert.match(albums, /let lightboxSettleCancel=null/);
  assert.match(albums, /function cancelLightboxSettle\(\)/);
  assert.match(albums, /showLightbox\(index,direction=0\)/);
  assert.match(albums, /showLightbox\(lightboxIndex\+1,1\)/);
  assert.match(albums, /showLightbox\(lightboxIndex-1,-1\)/);
  assert.match(css, /--us-motion-base/);
  assert.match(css, /us-lightbox-enter-next/);
  assert.match(css, /us-lightbox-exit-next/);
  assert.match(css, /is-preparing\.us-lightbox-enter-next\{opacity:1;transform:translateX\(14%\);transition:none\}/);
  assert.doesNotMatch(css, /usAlbumLightbox.*crossfade/i);
});

test('reduced motion fotografico resta un fade senza translate o scale', () => {
  const styles = read('styles.css');
  const albums = read('moments-albums.css');

  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.moment-viewer/);
  assert.match(albums, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.us-album-lightbox/);
  assert.match(styles, /opacity 100ms/);
  assert.match(albums, /opacity 100ms/);
});
