// Founder, 24/11/2026 (tavola «US · icone e colori»): icons B, two-tone, the
// outline in the icon's colour over the official Phosphor fill in the other
// one's colour. No coloured background in the end: a warm black.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('icons: the outline on top, the official fill under it in the other one\'s colour, only where a fill exists', () => {
  const css = read('ui-foundation.css');
  assert.match(css, /\.us-icon::before\{-webkit-mask-image:var\(--us-icon-fill,none\);mask-image:var\(--us-icon-fill,none\);background-color:var\(--us-icon-tint,var\(--us-partner,#a98bff\)\);opacity:var\(--us-icon-tint-alpha,0\)\}/);
  assert.match(css, /\.us-icon::after\{background-color:currentColor\}/);
  assert.match(css, /\.us-icon\[data-us-icon="bell"\]\{--us-icon-src:url\("\/assets\/icons\/phosphor\/bell-regular\.svg"\);--us-icon-fill:url\("\/assets\/icons\/phosphor\/bell-fill\.svg"\);--us-icon-tint-alpha:\.5\}/);
  assert.match(css, /\.us-icon\[data-us-icon="x"\]\{--us-icon-src:url\("\/assets\/icons\/phosphor\/x-regular\.svg"\)\}/, 'no fill: one line');
  for (const file of fs.readdirSync(path.join(ROOT, 'assets/icons/phosphor')).filter((f) => f.endsWith('-fill.svg'))) {
    assert.match(read(`assets/icons/phosphor/${file}`), /^<svg [^>]*viewBox="0 0 256 256"/, `${file} is a Phosphor fill`);
  }
  const nav = read('colori.css');
  assert.match(nav, /\.us-nav-premium button \.us-nav-icon-on\{display:block!important;z-index:0;color:color-mix\(in srgb,var\(--us-partner\) 26%,transparent\)!important\}/);
  assert.match(nav, /\.us-nav-premium button\.active \.us-nav-icon-on\{color:color-mix\(in srgb,var\(--us-partner\) 55%,transparent\)!important\}/);
});

test('the background: a warm black, no colour behind; no switch left (founder 24/11: «Nero caldo»)', () => {
  const css = read('colori.css');
  assert.match(css, /html{background:#120d11!important;background-attachment:fixed!important}/);
  assert.doesNotMatch(css, /data-us-sfondo/);
  assert.doesNotMatch(read('person-colors.js'), /sfondo/);
});
