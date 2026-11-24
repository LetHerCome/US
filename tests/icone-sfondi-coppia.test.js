// Founder, 24/11/2026 (tavola «US · icone e colori»): «B e Marea». The icons are
// two-tone, the outline in the icon's colour over the official Phosphor fill in
// the other one's colour; the backgrounds slide from your colour to theirs.
// Due luci and Aurora stay to compare on staging (?sfondo=…).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

test('backgrounds: Marea by default, Due luci, Aurora and the night before on request', () => {
  const css = read('colori.css');
  assert.match(css, /html\{background:linear-gradient\(165deg,color-mix\(in srgb,var\(--us-tu\) 40%,transparent\) 0%,color-mix\(in srgb,var\(--us-tab\) 24%,transparent\) 48%,color-mix\(in srgb,var\(--us-partner\) 38%,transparent\) 100%\),#140c14!important;/);
  for (const v of ['luci', 'aurora', 'notte']) assert.match(css, new RegExp(`html\\[data-us-sfondo="${v}"\\]\\{background:`), v);
  const run = (search, stored = null) => {
    const store = stored ? { 'us:sfondo:v1': stored } : {};
    const html = { dataset: {} };
    const window = { document: { documentElement: html }, location: { search }, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
    const src = read('person-colors.js');
    vm.runInNewContext(src.slice(0, src.indexOf('(function (root, factory)')), { window, URLSearchParams });
    return { attr: html.dataset.usSfondo, store };
  };
  assert.equal(run('').attr, undefined, 'Marea needs no attribute');
  assert.deepEqual(run('?sfondo=luci'), { attr: 'luci', store: { 'us:sfondo:v1': 'luci' } });
  assert.equal(run('', 'aurora').attr, 'aurora', 'this phone keeps the choice');
  assert.equal(run('?sfondo=marea', 'aurora').attr, undefined, 'back to Marea');
  assert.equal(run('?sfondo=<x>').attr, undefined);
});
