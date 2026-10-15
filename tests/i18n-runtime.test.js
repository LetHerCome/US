const assert = require('node:assert/strict');
const test = require('node:test');
const I18n = require('../i18n.js');
const { loadChromium, startServer } = require('./helpers/oggi-browser');

const FIXTURE = {
  Oggi: 'Today',
  'Scrivi qualcosa': 'Write something',
  'Lasciato per {name} ♡': 'Left for {name} ♡',
  '{n} giorni insieme': '{n} days together',
  'Il tuo {kind} per {name}': 'Your {kind} for {name}',
  pensiero: 'note',
  Mare: 'Sea',
  'Vuoi davvero uscire?': 'Do you really want to sign out?'
};

test('i18n: exact text, whitespace and patterns with names in any order', () => {
  const dict = I18n.compile(FIXTURE);
  assert.equal(I18n.lookup(dict, '  Oggi\n'), '  Today\n');
  assert.equal(I18n.lookup(dict, 'Scrivi   qualcosa'), 'Write something');
  assert.equal(I18n.lookup(dict, 'Lasciato per Beatrice ♡'), 'Left for Beatrice ♡');
  assert.equal(I18n.lookup(dict, '430 giorni insieme'), '430 days together');
  assert.equal(I18n.lookup(dict, 'Il tuo pensiero per Bea'), 'Your note for Bea', 'a placeholder value that is itself UI text is translated too');
  assert.equal(I18n.lookup(dict, 'Ciao a tutti'), null, 'unknown text stays as it is');
  assert.equal(I18n.lookup(dict, '12:30'), null, 'numbers and symbols are never looked up');
});

test('i18n: the phone language decides unless this device chose one', () => {
  const win = (href, languages, saved) => {
    const store = new Map(saved ? [[I18n.STORE_KEY, saved]] : []);
    return { location: { href }, navigator: { languages }, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  };
  assert.equal(I18n.chooseLocale(win('https://us.app/', ['it-IT', 'en'])), 'it');
  assert.equal(I18n.chooseLocale(win('https://us.app/', ['en-US'])), 'en');
  assert.equal(I18n.chooseLocale(win('https://us.app/', ['fr-FR', 'it'])), 'en', 'any other first language gets English');
  assert.equal(I18n.chooseLocale(win('https://us.app/', ['en-US'], 'it')), 'it', 'a saved choice wins');
  assert.equal(I18n.chooseLocale(win('https://us.app/?us-lang=en', ['it-IT'], 'it')), 'en', '?us-lang= wins and is saved');
  assert.equal(I18n.locale, 'it', 'Node has no window: Italian');
  assert.equal(I18n.t('Lasciato per {name} ♡', { name: 'Bea' }), 'Lasciato per Bea ♡');
});

async function withPage(t, lang, html, check) {
  let chromium;
  try { chromium = loadChromium(); } catch (_) { return t.skip('Playwright unavailable'); }
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.US_CHROMIUM || '/opt/pw-browsers/chromium' }).catch(() => null);
  if (!browser) { server.close(); return t.skip('Chromium unavailable'); }
  try {
    const page = await browser.newPage({ locale: lang === 'en' ? 'en-US' : 'it-IT' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(`${base}/i18n-fixture.html`, (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Oggi</title><script src="/i18n.js"></script><script>UsI18n.register('en', ${JSON.stringify(FIXTURE)});</script></head><body>${html}</body></html>`
    }));
    await page.goto(`${base}/i18n-fixture.html`);
    await check(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
}

const BODY = '<h1>Oggi</h1><p id="mine" translate="no">Mare</p><p id="ui">Mare</p><input id="field" placeholder="Scrivi qualcosa"><button id="b" aria-label="Oggi">Oggi</button><svg><text>Oggi</text></svg>';

test('i18n browser: an English phone sees the parsed page and later changes in English, never what people wrote', async (t) => {
  await withPage(t, 'en', BODY, async (page) => {
    const first = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      title: document.title,
      h1: document.querySelector('h1').textContent,
      mine: document.getElementById('mine').textContent,
      ui: document.getElementById('ui').textContent,
      placeholder: document.getElementById('field').placeholder,
      label: document.getElementById('b').getAttribute('aria-label'),
      svg: document.querySelector('svg text').textContent
    }));
    assert.deepEqual(first, { lang: 'en', title: 'Today', h1: 'Today', mine: 'Mare', ui: 'Sea', placeholder: 'Write something', label: 'Today', svg: 'Oggi' });
    const later = await page.evaluate(async () => {
      const note = document.createElement('p');
      note.textContent = 'Lasciato per Beatrice ♡';
      document.body.append(note);
      const ui = document.getElementById('ui');
      ui.textContent = '430 giorni insieme';
      const caption = document.getElementById('mine');
      caption.textContent = 'Oggi';
      document.getElementById('field').setAttribute('placeholder', 'Oggi');
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { note: note.textContent, ui: ui.textContent, caption: caption.textContent, placeholder: document.getElementById('field').placeholder, t: window.usT('Lasciato per {name} ♡', { name: 'Bea' }) };
    });
    assert.deepEqual(later, { note: 'Left for Beatrice ♡', ui: '430 days together', caption: 'Oggi', placeholder: 'Today', t: 'Left for Bea ♡' });
    const dialog = new Promise((resolve) => page.once('dialog', async (d) => { resolve(d.message()); await d.dismiss(); }));
    await page.evaluate(() => { window.confirm('Vuoi davvero uscire?'); });
    assert.equal(await dialog, 'Do you really want to sign out?');
  });
});

test('i18n browser: an Italian phone keeps the page exactly as written and installs nothing', async (t) => {
  await withPage(t, 'it', BODY, async (page) => {
    const view = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      locale: window.UsI18n.locale,
      h1: document.querySelector('h1').textContent,
      ui: document.getElementById('ui').textContent,
      placeholder: document.getElementById('field').placeholder,
      t: window.usT('Lasciato per {name} ♡', { name: 'Bea' })
    }));
    assert.deepEqual(view, { lang: 'it', locale: 'it', h1: 'Oggi', ui: 'Mare', placeholder: 'Scrivi qualcosa', t: 'Lasciato per Bea ♡' });
  });
});
