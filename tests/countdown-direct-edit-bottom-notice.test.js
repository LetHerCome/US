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
test('Countdown: the entry comes back only when Oggi shows none, and the visible countdown opens its active editor', () => {
  const home = html.match(/<main id="home"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(home, /id="usCountdownEntry"[^>]*aria-haspopup="dialog" hidden>/);
  assert.doesNotMatch(home, /id="usCountdownEntry"[^>]*(tabindex="-1"|aria-hidden="true")/);
  assert.match(countdown, /const entry=\$\('usCountdownEntry'\);if\(entry\)entry\.hidden=shown\|\|!state;/);
  assert.match(read('dc-oggi.css'), /#home #homeHero \.us-countdown-entry:not\(\[hidden\]\)\{[\s\S]*?display:inline-flex!important;/);
  assert.match(countdown, /async function open\(mode='collection'\)\{[\s\S]*?if\(mode==='active'&&state\?\.active_id\)editor\(state\.active_id\);else collection\(\);/);
  assert.match(countdown, /surface\.addEventListener\('click',\(\)=>open\('active'\)\)/);
  assert.match(countdown, /Modifica countdown/);
});

test('Oggi: only actionable personal priority notices survive the cleanup', () => {
  const source = app.slice(app.indexOf('function renderTodayPriorities'), app.indexOf('function thinkTodayPriorityViewModel'));
  assert.match(source, /filter\(item=>item\?\.attention\)/);
  const home = html.match(/<main id="home"[\s\S]*?<\/main>/)?.[0] || '';
  assert.ok(home.indexOf('id="usTodayPriorityRegion"') < home.indexOf('id="usOggiStack"'));
});

test('Oggi: actionable notice is fixed just above the nav and Daily nudge stacks above it', () => {
  assert.match(styles, /#home #usTodayPriorityRegion\{[\s\S]*?position:fixed!important;[\s\S]*?bottom:calc\(10px \+ var\(--us-safe-bottom\) \+ var\(--us-nav-height\) \+ 12px\)!important;/);
  assert.match(styles, /body:has\(#home\.active #usTodayPriorityRegion:not\(\[hidden\]\)\) \.us-daily-nudge\{[\s\S]*?bottom:calc\(10px \+ var\(--us-safe-bottom\) \+ var\(--us-nav-height\) \+ 82px\);/);
  assert.match(app, /target\.closest\('#usTodayPriorityRegion,/);
});
