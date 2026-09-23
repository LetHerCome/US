const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadApi() {
  const source = read('left-for-you.js');
  const context = { module: { exports: {} }, exports: {}, console };
  vm.runInNewContext(source, context, { filename: 'left-for-you.js' });
  return context.module.exports;
}

test('M5E entry is a single envelope control, not a Stories or bottom-nav destination', () => {
  const html = read('index.html');
  assert.match(html, /id="leftForYouPartnerEntry"/);
  assert.match(html, /onclick="usEnvelopeTap\(\)"/);
  assert.doesNotMatch(html, /data-page="left-for-you"/);
  assert.doesNotMatch(html, /data-page="stories"/);
  assert.match(html, /left-for-you\.js/);
  assert.match(html, /left-for-you\.css/);
});

test('M5E content model renders exactly the five supported kinds', () => {
  const api = loadApi();
  const kinds = ['text', 'photo', 'audio', 'video', 'music'];
  for (const kind of kinds) {
    const html = api.renderItemMarkup({ id: `id-${kind}`, kind, body: 'Una nota', media_path: kind === 'music' ? 'https://music.example/track' : `couple/sender/${kind}.bin` });
    assert.match(html, new RegExp(`data-left-kind="${kind}"`));
  }
});

test('M5F unseen state derives from seen_at and the envelope exposes the canonical labels', () => {
  const api = loadApi();
  assert.equal(api.isUnseen({ seen_at: null }), true);
  assert.equal(api.isUnseen({ seen_at: '2026-09-23T10:00:00Z' }), false);
  const html = read('index.html');
  assert.match(html, /aria-label="Lasciato per te"/, 'stato neutro finché il dato non risolve');
  const source = read('left-for-you.js');
  assert.match(source, /\$\{personName\} ti ha lasciato qualcosa/);
  assert.match(source, /Lascia qualcosa a \$\{personName\}/);
});

test('M5E integrates server-authoritative seen and Conserva RPCs', () => {
  const source = read('left-for-you.js');
  assert.match(source, /rpc\('mark_left_item_seen'/);
  assert.match(source, /rpc\('conserve_left_for_you'/);
  assert.match(source, /status.*existing|existing.*status/);
  assert.match(source, /Conservato/);
});

test('M5E has loading, empty, retry and no Stories semantics in the UI owner', () => {
  const html = read('index.html');
  const source = read('left-for-you.js');
  assert.match(html, /leftForYouLoading/);
  assert.match(html, /leftForYouEmpty/);
  assert.match(html, /leftForYouRetry/);
  assert.match(source, /Lasciato per te/);
  assert.doesNotMatch(source, /story|stories|carousel|swipe|24h|commenti|reazioni/i);
});

test('M5E disables the legacy media surface in the active Web/PWA shell', () => {
  const html = read('index.html');
  const stories = read('stories.js');
  assert.match(html, /__US_LEFT_FOR_YOU_ACTIVE__/);
  assert.doesNotMatch(html, /usTopProfiles|usStoryPartner|usStoryPartnerOpen|openOwnStories\(\)/);
  assert.match(stories, /if \(window\.__US_LEFT_FOR_YOU_ACTIVE__\) return/);
  assert.match(html, /id="leftForYouPartnerEntry"[\s\S]{0,220}usEnvelopeTap/);
});

test('M5E partner entry is one unified envelope control, not an avatar or Stories ring', () => {
  const css = read('left-for-you.css');
  const html = read('index.html');
  assert.match(css, /#leftForYouPartnerEntry\.us-envelope-control\{[^}]*border:1px solid/);
  assert.match(css, /\.us-envelope-face--closed\{[^}]*mask-image:url\("\/assets\/icons\/phosphor\/envelope-simple-regular\.svg"\)/);
  assert.match(css, /\.us-envelope-face--open\{[^}]*mask-image:url\("\/assets\/icons\/phosphor\/envelope-open-regular\.svg"\)/);
  assert.doesNotMatch(html, /id="leftForYouPartnerBadge"/);
  assert.doesNotMatch(css, /#leftForYouPartnerBadge/);
});

test('M5F visual shell keeps the top-right slot clean and the empty state intimate', () => {
  const html = read('index.html');
  const css = read('left-for-you.css');
  assert.match(html, /Qui apparirà qualcosa che Beatrice ha lasciato per te/);
  assert.doesNotMatch(html, /leftForYouEmpty[\s\S]*left-for-you-mark/);
  assert.match(css, /\.left-for-you-sheet\{[^}]*width:min\(100%,430px\)/);
  assert.doesNotMatch(html, /id="profileAvatarBtn"/);
  assert.match(css, /#leftForYouPartnerEntry\.is-loading\{[^}]*pointer-events:none/);
  assert.match(css, /#leftForYouPartnerEntry:active\{[^}]*transform:scale\(\.94\)/);
});

test('M5E media uses the existing private signed-url helper', () => {
  const source = read('left-for-you.js');
  assert.match(source, /usGetSignedUrl/);
  assert.doesNotMatch(source, /getPublicUrl|bucket\.update\(\{\s*public/i);
});
