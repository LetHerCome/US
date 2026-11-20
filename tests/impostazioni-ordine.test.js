// Impostazioni riordinate (founder, 20/11/2026): five groups (Tu, Voi due with
// the distance in one place, App, Aiuto, Account with the two exits last),
// plain words, and the back arrow returns to the page you came from.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const page = read('index.html').match(/<main id="settings"[\s\S]*?<\/main>/)?.[0] || '';

test('Impostazioni: five groups in order, plain words, no jargon left', () => {
  const titles = [...page.matchAll(/<h3 class="dy-set-title" id="[^"]+">([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['Tu', 'Voi due', 'App', 'Aiuto', 'Account']);
  for (const word of ['<b>Come ti scriviamo</b>', '<b>Usa la posizione</b>', '<b id="usDistanceUnitLabel">Misura in</b>', '<b>Esci dall’account</b><small>Solo da questo telefono</small>', '<b>Esci dalla coppia</b><small>Non si può annullare</small>']) {
    assert.ok(page.includes(word), word);
  }
  assert.doesNotMatch(page, /Scollega questo telefono|Le tue parole|Aiuto e account|Torna a Noi/);
  assert.match(page, /<button type="button" class="dy-ib" onclick="usSettingsReturn\(\)" aria-label="Indietro">/);
  assert.match(read('settings.js'), /openModal\('Esci dall’account'/);
  // Every new word has its English line.
  const en = read('i18n-en.js');
  for (const key of ['Aiuto', 'Account', 'Indietro', 'Come ti scriviamo', 'Usa la posizione', 'Misura in', 'Esci dall’account', 'Solo da questo telefono', 'Non si può annullare', 'Il tuo personaggio lo mostra']) {
    assert.ok(en.includes(`'${key}':`), key);
  }
});

test('Impostazioni browser: the back arrow returns where you came from', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page: p, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    try {
      await p.waitForTimeout(500);
      const active = () => p.evaluate(() => document.querySelector('.page.active')?.id);
      for (const tab of ['moments', 'quiz', 'home', 'bond']) {
        await p.click(`.dy-nav button[data-page="${tab}"]`); await p.waitForTimeout(700);
        await p.click(`#${tab} [data-dy-me]`); await p.waitForTimeout(900);
        assert.equal(await active(), 'settings', `opened from ${tab}`);
        await p.click('#settings .dy-set-hd .dy-ib'); await p.waitForTimeout(900);
        assert.equal(await active(), tab, `back to ${tab}`);
      }
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});
