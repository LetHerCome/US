const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const styles = read('styles.css');
const gamesCss = read('games.css');
const app = read('app.js');
const calendar = read('calendar.js');
const cleanup = read('home-cleanup.js');
const worker = read('service-worker.js');

test('Home cleanup: Oggi keeps photo/countdown dominant and retires the dashboard stack', () => {
  const home = html.match(/<main id="home"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(home, /id="usCountdownDisplay"/);
  assert.match(home, /id="usOggiStack"/, 'legacy state anchors remain mounted for existing authorities');
  assert.match(styles, /#home #usOggiStack\{height:0!important;[^}]*visibility:hidden!important;[^}]*pointer-events:none!important\}/);
  assert.ok(home.indexOf('id="usTodayPriorityRegion"') < home.indexOf('id="usOggiStack"'), 'actionable notice lives outside the retired dashboard stack');
  assert.match(styles, /#home #usTodayPriorityRegion\{[\s\S]*?position:fixed!important;[\s\S]*?bottom:calc\(10px \+ var\(--us-safe-bottom\) \+ var\(--us-nav-height\) \+ 12px\)!important;/);
  assert.doesNotMatch(home, /noi-week-board|us-gv2-daily/, 'new destinations do not leak back into Oggi');
});

test('Noi Lavagna: it replaces the Calendar tile and reads the existing calendar authority only', () => {
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(bond, /id="noiWeekBoard"/);
  assert.match(bond, /id="noiWeekBoardOpen" data-noi-week-board-open/);
  assert.match(bond, /id="noiWeekBoardBody"/);
  assert.ok(bond.indexOf('id="noiWeekBoard"') < bond.indexOf('id="noiHub"'));
  assert.doesNotMatch(bond, /id="usCalendarEntry"|noi-hub-card--calendar/);

  const start = calendar.indexOf('const US_NOI_WEEK_BOARD_LIMIT');
  const end = calendar.indexOf('function ownerMarkOf', start);
  const source = calendar.slice(start, end);
  assert.ok(start >= 0 && end > start, 'weekly board source exists');
  assert.match(source, /fetchEntriesForRange\(coupleId, today, end\)/);
  assert.match(source, /sb\.from\('profiles'\)\.select\('id,display_name'\)/);
  assert.match(source, /window\.openCalendarSurface\?\.\(date\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|\.insert\(|\.update\(|\.upsert\(|sb\.rpc\(/);
  assert.match(calendar, /if \(\$\('bond'\)\?\.classList\.contains\('active'\)\) window\.refreshNoiWeekBoard\?\.\(\);/);
});

function dailyModel(state, reveal = null) {
  const start = cleanup.indexOf('function partnerName()');
  const end = cleanup.indexOf('function dailyMarkup', start);
  const source = cleanup.slice(start, end);
  const window = {
    usProfile: { role: 'francesco' },
    todayQuestion: { id: 'q1', question: 'Cosa ti farebbe partire bene questa settimana?' },
    todayState: state,
    todayRevealMeta: reveal
  };
  const context = vm.createContext({ window, String, Boolean });
  vm.runInContext(`${source}\nthis.result=dailyModel();`, context);
  return JSON.parse(JSON.stringify(context.result));
}

test('Daily Question: Gioca view model follows canonical state and never exposes partner answer text', () => {
  const secret = 'RISPOSTA-PARTNER-SEGRETA';
  const fresh = dailyModel({ my_answer: null, partner_has_answer: false, both_answered: false, partner_answer: secret });
  assert.deepEqual({ state: fresh.state, cta: fresh.cta, nudge: fresh.nudge }, { state: 'answer', cta: 'Rispondi', nudge: true });

  const partnerFirst = dailyModel({ my_answer: null, partner_has_answer: true, both_answered: false, partner_answer: secret });
  assert.equal(partnerFirst.state, 'answer');
  assert.equal(partnerFirst.nudge, true);
  assert.match(partnerFirst.meta, /ha già risposto/);

  const waiting = dailyModel({ my_answer: 'La mia', partner_has_answer: false, both_answered: false, partner_answer: secret });
  assert.deepEqual({ state: waiting.state, cta: waiting.cta, nudge: waiting.nudge }, { state: 'waiting', cta: 'Apri', nudge: false });

  const reveal = dailyModel({ my_answer: 'La mia', partner_has_answer: true, both_answered: true, partner_answer: secret }, { my_reveal_seen_at: null });
  assert.deepEqual({ state: reveal.state, cta: reveal.cta, nudge: reveal.nudge }, { state: 'reveal', cta: 'Scopri', nudge: true });

  for (const model of [fresh, partnerFirst, waiting, reveal]) assert.doesNotMatch(JSON.stringify(model), new RegExp(secret));
  assert.doesNotMatch(cleanup.slice(cleanup.indexOf('function dailyModel'), cleanup.indexOf('function dailyMarkup')), /partner_answer/);
});

test('Daily Question: Gioca owns the visible entry; transient nudge and existing push converge on the same flow', () => {
  assert.match(gamesCss, /\.us-gv2-daily\{/);
  assert.match(html, /id="usDailyNudge" class="us-daily-nudge/);
  assert.match(cleanup, /head\.insertAdjacentHTML\('afterend', dailyMarkup/);
  assert.match(cleanup, /window\.openQuizHub\?\.\(\{ motionCommit: true \}\)/);
  assert.match(cleanup, /window\.openToday = openDailyInGioca/);
  assert.match(app, /if\(target==='today'\)\{openToday\(\);return;\}/, 'existing Daily push target still enters openToday, now redirected under Gioca');
});

test('Home cleanup runtime is present in Cloudflare/native builds and in the atomic PWA shell', () => {
  const build = JSON.parse(read('version.json')).version;
  assert.equal(build, 'us-pet-kitten-preview-v1-20261005-1');
  assert.equal(html.match(/<meta name="us-build" content="([^"]+)"/)?.[1], build);
  assert.equal(worker.match(/const BUILD_ID = "([^"]+)"/)?.[1], build);
  assert.match(worker, /versioned\("\/home-cleanup\.js"\)/);
  assert.match(read('scripts/build-cloudflare-pages.mjs'), /'home-cleanup\.js'/);
  assert.match(read('scripts/build-capacitor-web.mjs'), /'home-cleanup\.js'/);
  assert.match(html, new RegExp(`src="/home-cleanup\\.js\\?v=${build}"`));
});
