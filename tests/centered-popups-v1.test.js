// US modal-centering V1 — design consistency and release packaging contracts.
// Static guards are deliberately additive: feature JS retains its open/close flow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root,name),'utf8');

const popups = [
  'today','thinkArrival','usCountdownSheet','usEventsOverlay',
  'usSettingsOverlay','usWidgetHub','leftForYouOverlay',
  'leftForYouComposerOverlay','conservatiOverlay','usCalendarOverlay',
  'usCalendarDetailSheet','usCalendarFormSheet'
];

test('popup surfaces share a centred container and matching modal-panel shell', () => {
  const css = read('modal-center.css');
  const html = read('index.html');
  for (const id of popups) {
    assert.match(html, new RegExp('id="'+id+'"'));
    assert.match(css, new RegExp('#'+id+'(?:[\\s,]|$)'));
  }
  assert.match(css,/align-items: center !important/);
  assert.match(css,/justify-content: center !important/);
  assert.match(css,/border-radius: var\(--us-popup-radius\) !important/);
  assert.match(css,/max-height: var\(--us-popup-safe-height\) !important/);
  assert.match(css,/overscroll-behavior: contain/);
});

test('entry/exit both animate softly from centre and respect motion preferences', () => {
  const css = read('modal-center.css');
  assert.match(css,/transform: translateY\(8px\) scale\(\.965\)/);
  assert.match(css,/\[data-us-motion-exiting\]/);
  assert.match(css,/\[aria-hidden="false"\]/);
  assert.match(css,/\.us-confirm:not\(\.open\)/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/data-us-motion="reduced"/);
  assert.match(read('ui-foundation.js'),/event\.propertyName === 'transform'/);
});

test('Calendar nested details and form receive the shared centre-motion treatment', () => {
  const html = read('index.html');
  const calendar = read('calendar.js');
  for(const id of ['usCalendarDetailSheet','usCalendarFormSheet']) {
    assert.match(html,new RegExp('id="'+id+'" aria-hidden="true" data-us-modal data-us-motion-surface'));
    assert.match(calendar,new RegExp("'"+id+"'"));
  }
});

test('authentication and immersive media keep their current full-screen layouts', () => {
  const css = read('modal-center.css');
  assert.doesNotMatch(css, /#momentViewer|#usAlbumOverlay|#usAlbumLightbox|#leftForYouCameraOverlay|\.auth-overlay\s*[,\{]/);
  assert.match(read('index.html'), /id="leftForYouCameraOverlay"/);
  assert.match(read('moments-albums.js'), /class="us-album-lightbox"/);
});

test('PWA and Capacitor both bundle centred popup CSS and release same PWA build ID', () => {
  const html = read('index.html');
  const sw = read('service-worker.js');
  const cloudflare = read('scripts/build-cloudflare-pages.mjs');
  const native = read('scripts/build-capacitor-web.mjs');
  const version = JSON.parse(read('version.json')).version;
  const meta = html.match(/<meta name="us-build" content="([^"]+)"/);
  const worker = sw.match(/const BUILD_ID = "([^"]+)"/);
  assert.equal(meta?.[1],version);
  assert.equal(worker?.[1],version);
  assert.match(html,new RegExp('/modal-center\\.css\\?v='+version));
  assert.ok(html.indexOf('href="/modal-center.css')>html.indexOf('href="/top-chrome.css'));
  for(const s of [cloudflare,native]) assert.match(s,/'modal-center\.css'/);
  assert.match(sw,/versioned\("\/modal-center\.css"\)/);
  assert.ok(JSON.parse(read('manifest.webmanifest')).icons.length>0);
});
