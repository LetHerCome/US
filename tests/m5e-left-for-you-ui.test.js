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

test('M5E entry is partner presence, not a Stories or bottom-nav destination', () => {
  const html = read('index.html');
  assert.match(html, /id="leftForYouPartnerEntry"/);
  assert.match(html, /onclick="openLeftForYou\(\)"/);
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

test('M5E unseen state is derived from seen_at and partner access exposes a badge', () => {
  const api = loadApi();
  assert.equal(api.isUnseen({ seen_at: null }), true);
  assert.equal(api.isUnseen({ seen_at: '2026-09-23T10:00:00Z' }), false);
  const html = read('index.html');
  assert.match(html, /id="leftForYouPartnerBadge"/);
  assert.match(html, /aria-label="Apri Lasciato per te"/);
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
  assert.match(html, /id="leftForYouPartnerEntry"[\s\S]{0,220}openLeftForYou/);
});

test('M5E partner entry uses an integrated avatar control, not a Stories ring', () => {
  const css = read('left-for-you.css');
  assert.match(css, /#leftForYouPartnerEntry\{[^}]*border:0[^}]*background:transparent/);
  assert.match(css, /#leftForYouPartnerEntry\.has-unseen\{[^}]*box-shadow:none/);
  assert.match(css, /#leftForYouPartnerEntry\.has-unseen:after\{content:none/);
  assert.match(css, /#leftForYouPartnerBadge\{[^}]*width:6px[^}]*height:6px/);
});

test('M5E media uses the existing private signed-url helper', () => {
  const source = read('left-for-you.js');
  assert.match(source, /usGetSignedUrl/);
  assert.doesNotMatch(source, /getPublicUrl|bucket\.update\(\{\s*public/i);
});
