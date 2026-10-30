// US Store 1.0: the public Privacy and Terms pages (Play listing, sign-up box,
// Settings › Privacy e dati). Static, published with the web build, in Italian
// and English, with no placeholders left from the drafts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PAGES = {
  'privacy.html': { lang: 'it', other: '/privacy-en' },
  'privacy-en.html': { lang: 'en', other: '/privacy' },
  'termini.html': { lang: 'it', other: '/termini-en' },
  'termini-en.html': { lang: 'en', other: '/termini' }
};

test('legal pages: published with the web build, together with their stylesheet', () => {
  const build = read('scripts/build-cloudflare-pages.mjs');
  for (const file of [...Object.keys(PAGES), 'legal.css']) assert.match(build, new RegExp(`'${file.replace('.', '\\.')}'`), file);
});

test('legal pages: the service worker never answers them with the app shell', () => {
  const sw = read('service-worker.js');
  const set = sw.match(/const US_STANDALONE_DOCUMENTS = new Set\(\[([^\]]*)\]\)/)?.[1] || '';
  for (const file of Object.keys(PAGES)) {
    const route = `/${file.replace(/\.html$/, '')}`;
    assert.ok(set.includes(`"${route}"`) && set.includes(`"${route}.html"`), route);
  }
});

test('legal pages: standalone, complete and linked to their other language', () => {
  for (const [file, { lang, other }] of Object.entries(PAGES)) {
    const html = read(file);
    assert.match(html, new RegExp(`<html lang="${lang}">`), file);
    assert.match(html, /<link rel="stylesheet" href="\/legal\.css"\/>/, file);
    assert.doesNotMatch(html, /<script/i, `${file}: no scripts`);
    assert.doesNotMatch(html, /noindex/, `${file}: must be reachable by Google Play`);
    assert.doesNotMatch(html, /\[[A-Z][A-Z ]+\]|TODO|DIPENDE|BOZZA|DRAFT/, `${file}: no draft placeholders`);
    assert.match(html, new RegExp(`href="${other}"`), `${file} links ${other}`);
    assert.match(html, /href="\/elimina-account"/, `${file} links the deletion page`);
    assert.match(html, /Moonee Lab \(Francesco Monti\)/, `${file} names the controller`);
    assert.match(html, /mailto:moonee\.team@gmail\.com/, `${file} gives the contact`);
    assert.match(html, /(Ultimo aggiornamento|Last updated): (17|25|30) (ottobre|October) 2026/, file);
  }
});

test('legal pages: the sign-up box and Settings point to the published pages', () => {
  global.window = global.window || {};
  const S31 = require('../public-auth.js');
  assert.equal(S31.legalUrl(S31.LEGAL_URLS.privacy), 'https://www.uscouple.app/privacy');
  assert.equal(S31.legalUrl(S31.LEGAL_URLS.terms), 'https://www.uscouple.app/termini');
  const settings = read('settings.js');
  assert.match(settings, /https:\/\/www\.uscouple\.app\/\$\{page\}\$\{en\?'-en':''\}/);
  assert.match(settings, /legal\('privacy'\)[^]*legal\('termini'\)/);
});
