const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const countdown = read('countdown.js');
const countdownCss = read('countdown.css');
const styles = read('styles.css');
const app = read('app.js');

// 1.0 (O9): the entry is the quiet way back when Oggi shows no countdown
// ("Nessuno in Oggi"); it replaces the retired corner button.
// Round 3 (mockup 032, #cdBtn): the visible countdown opens the list, where "Crea countdown" is;
// it used to open the active editor (often "Insieme da", with no fields), and adding one seemed impossible.
test('Countdown: the entry comes back only when Oggi shows none, and the visible countdown opens the list', () => {
  const home = html.match(/<main id="home"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(home, /id="usCountdownEntry"[^>]*aria-haspopup="dialog" hidden>/);
  assert.doesNotMatch(home, /id="usCountdownEntry"[^>]*(tabindex="-1"|aria-hidden="true")/);
  assert.match(countdown, /const entry=\$\('usCountdownEntry'\);if\(entry\)entry\.hidden=shown\|\|!state;/);
  assert.match(read('dc-oggi.css'), /#home #homeHero \.us-countdown-entry:not\(\[hidden\]\)\{[\s\S]*?display:inline-flex!important;/);
  assert.match(countdown, /async function open\(mode='collection'\)\{[\s\S]*?if\(mode==='active'&&state\?\.active_id\)editor\(state\.active_id,0\);else collection\(\);/);
  assert.match(countdown, /surface\.addEventListener\('click',\(\)=>open\(\)\)/);
  assert.match(countdown, /Modifica countdown/);
});
