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

test('Countdown: corner edit button is visually retired and the visible countdown opens its active editor', () => {
  const home = html.match(/<main id="home"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(home, /id="usCountdownEntry"[^>]*hidden[^>]*tabindex="-1"[^>]*aria-hidden="true"/);
  assert.match(countdownCss, /\.us-countdown-entry\{display:none!important\}/);
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
