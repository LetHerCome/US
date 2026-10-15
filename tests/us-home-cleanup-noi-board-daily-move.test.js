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

// US 1.0 (N3/N10): the Lavagna board is now "La nostra settimana", the week
// view of the Noi calendar; its free evenings read nothing new.
test('Noi: "La nostra settimana" replaces Lavagna and reads the existing calendar authority only', () => {
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(bond, /data-noi-open-link="lavagna"[^>]*>[\s\S]*?<b>La nostra settimana<\/b>/);
  assert.doesNotMatch(bond, /id="noiWeekBoard"|id="noiWeekBoardOpen"|id="noiWeekBoardBody"|id="noiHub"/);
  assert.doesNotMatch(bond, /id="usCalendarEntry"|noi-hub-card--calendar/);
  assert.doesNotMatch(calendar, /US_NOI_WEEK_BOARD_LIMIT|refreshNoiWeekBoard/);

  const start = calendar.indexOf('function noiFreeEvenings(');
  const end = calendar.indexOf('\n}', start);
  const source = calendar.slice(start, end);
  assert.ok(start >= 0 && end > start, 'free evenings source exists');
  assert.match(source, /freeEveningFor\(appointments, dateISO, roleOf, eventTimesByDate\[dateISO\] \|\| \[\]\)/);
  assert.doesNotMatch(source, /sb\.|localStorage|sessionStorage|indexedDB|\.insert\(|\.update\(|\.upsert\(/);
  const noi = read('noi-v2.js');
  assert.match(noi, /if\(data\)\{snapshot=data;refreshedAt=Date\.now\(\);\}/, 'the last resolved month stays until the new one arrives');
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
  require('./helpers/identity-fixture').install(context);
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
  assert.equal(build, 'us-native-notifications-v1-20261006-1');
  assert.equal(html.match(/<meta name="us-build" content="([^"]+)"/)?.[1], build);
  assert.equal(worker.match(/const BUILD_ID = "([^"]+)"/)?.[1], build);
  assert.match(worker, /versioned\("\/home-cleanup\.js"\)/);
  assert.match(read('scripts/build-cloudflare-pages.mjs'), /'home-cleanup\.js'/);
  assert.match(read('scripts/build-capacitor-web.mjs'), /'home-cleanup\.js'/);
  assert.match(html, new RegExp(`src="/home-cleanup\\.js\\?v=${build}"`));
});
