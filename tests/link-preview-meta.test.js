// Audit 05/11/2026, punti 3 e 9: link previews for the site and the invite,
// one canonical address, and the first-screen fonts fetched with the CSS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const meta = (html, key) => {
  const match = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"/>`));
  return match ? match[1] : null;
};

for (const page of ['index.html', 'invito.html']) {
  test(`${page}: a preview card with title, sentence and an image that exists`, () => {
    const html = read(page);
    for (const key of ['description', 'og:type', 'og:site_name', 'og:title', 'og:description', 'og:image', 'twitter:card']) {
      assert.ok(meta(html, key), `${page} has ${key}`);
    }
    assert.ok(meta(html, 'og:description').length <= 160, 'short enough for a chat preview');
    const image = meta(html, 'og:image');
    assert.match(image, /^https:\/\/www\.uscouple\.app\/[a-z0-9-]+\.png$/, 'absolute, on the main address, never versioned');
    assert.ok(fs.existsSync(path.join(ROOT, new URL(image).pathname)), 'the image is a file that ships');
    for (const script of ['scripts/build-cloudflare-pages.mjs']) {
      assert.ok(read(script).includes(`'${new URL(image).pathname.slice(1)}'`), `${image} is packaged for the site`);
    }
  });
}

test('index.html: www is the canonical address', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.uscouple\.app\/"\/>/);
  assert.equal(meta(html, 'og:url'), 'https://www.uscouple.app/');
});

test('invito.html: the preview never carries an address, so the code after # cannot end up in it', () => {
  const html = read('invito.html');
  assert.equal(meta(html, 'og:url'), null);
  assert.match(html, /<meta name="robots" content="noindex"\/>/, 'the invite stays out of search');
});

test('index.html: the first-screen fonts are preloaded with the exact URLs of ui-foundation.css', () => {
  const html = read('index.html');
  const css = read('ui-foundation.css');
  const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin\/>/g)].map((m) => m[1]);
  assert.deepEqual(preloads, ['/assets/fonts/Fraunces-Soft-Roman.woff2', '/assets/fonts/Fraunces-Soft-Italic.woff2', '/assets/fonts/Figtree-Latin.woff2']);
  for (const url of preloads) {
    assert.ok(css.includes(`url("${url}")`), `${url} is the one @font-face asks for`);
    assert.ok(fs.existsSync(path.join(ROOT, url)), `${url} exists`);
  }
  assert.ok(html.indexOf('rel="preload"') < html.indexOf('href="/styles.css'), 'before the stylesheets');
});
