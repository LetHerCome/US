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
const worker = read('service-worker.js');
// 1.0 (O4/T2): home-cleanup.js is gone; its Gioca card lives in app.js.

test('Home cleanup: Oggi keeps photo/countdown dominant and retires the dashboard stack', () => {
  const home = html.match(/<main id="home"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(home, /id="usCountdownDisplay"/);
  assert.match(home, /id="usOggiStack"/, 'legacy state anchors remain mounted for existing authorities');
  assert.match(styles, /#home #usOggiStack\{height:0!important;[^}]*visibility:hidden!important;[^}]*pointer-events:none!important\}/);
  assert.ok(home.indexOf('id="usTodayPriorityRegion"') < home.indexOf('id="usOggiStack"'), 'actionable notice lives outside the retired dashboard stack');
  assert.match(read('dc-oggi.css'), /#home \.us-oggi-dock\{[\s\S]*?position:fixed;/, 'the actionable notice and the Domanda di oggi share one dock above the nav');
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
  const start = app.indexOf('// ===== 1.0 — La domanda di oggi in Gioca');
  const end = app.indexOf('function dailyHubMarkup', start);
  const source = app.slice(start, end);
  const window = {
    usProfile: { role: 'francesco' },
    todayQuestion: { id: 'q1', question: 'Cosa ti farebbe partire bene questa settimana?' },
    todayState: state,
    todayRevealMeta: reveal
  };
  const context = vm.createContext({ window, String, Boolean, oggiPartnerName: () => 'Beatrice' });
  vm.runInContext(`${source}\nthis.result=dailyHubModel();`, context);
  return JSON.parse(JSON.stringify(context.result));
}

test('Daily Question: Gioca view model follows canonical state and never exposes partner answer text', () => {
  const secret = 'RISPOSTA-PARTNER-SEGRETA';
  const fresh = dailyModel({ my_answer: null, partner_has_answer: false, both_answered: false, partner_answer: secret });
  assert.deepEqual({ state: fresh.state, cta: fresh.cta }, { state: 'answer', cta: 'Rispondi' });

  const partnerFirst = dailyModel({ my_answer: null, partner_has_answer: true, both_answered: false, partner_answer: secret });
  assert.equal(partnerFirst.state, 'answer');
  assert.equal(partnerFirst.meta, 'Beatrice ha già risposto · tocca a te');

  const waiting = dailyModel({ my_answer: 'La mia', partner_has_answer: false, both_answered: false, partner_answer: secret });
  assert.deepEqual({ state: waiting.state, cta: waiting.cta }, { state: 'waiting', cta: 'Apri' });

  const reveal = dailyModel({ my_answer: 'La mia', partner_has_answer: true, both_answered: true, partner_answer: secret }, { my_reveal_seen_at: null });
  assert.deepEqual({ state: reveal.state, cta: reveal.cta }, { state: 'reveal', cta: 'Scopri' });

  for (const model of [fresh, partnerFirst, waiting, reveal]) assert.doesNotMatch(JSON.stringify(model), new RegExp(secret));
  assert.doesNotMatch(app.slice(app.indexOf('function dailyHubModel'), app.indexOf('function dailyHubMarkup')), /partner_answer/);
});

test('1.0 O1/G1: no transient nudge; the Oggi card and the Gioca card open the same sheet where you are', () => {
  assert.match(gamesCss, /\.us-gv2-daily\{/);
  assert.doesNotMatch(html, /usDailyNudge|us-daily-nudge/);
  assert.doesNotMatch(app, /openDailyInGioca|window\.openToday\s*=\s*(?!openToday)/, 'openToday is never redirected to another tab');
  assert.match(html, /id="usDailyRitual"[^>]*onclick="openToday\(\)"/);
  assert.match(app, /if\(!event\.target\.closest\?\.\('\[data-us-daily-entry\]'\)\)return;\n  event\.preventDefault\(\);\n  openToday\(\);/);
  assert.match(app, /if\(target==='today'\)\{openToday\(\);return;\}/, 'the Daily push target still enters openToday');
});

test('1.0 O4/T2: home-cleanup.js is removed and unregistered everywhere', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'home-cleanup.js')), false);
  assert.doesNotMatch(html, /home-cleanup\.js/);
  assert.doesNotMatch(worker, /home-cleanup\.js/);
  assert.doesNotMatch(read('scripts/build-cloudflare-pages.mjs'), /home-cleanup\.js/);
  assert.doesNotMatch(read('scripts/build-capacitor-web.mjs'), /home-cleanup\.js/);
  assert.doesNotMatch(read('.github/workflows/ui-polish-regression.yml'), /home-cleanup\.js/);
  // Its old Lavagna refresh wiring went with the Lavagna itself (N10, "La nostra settimana" refreshes on its own).
  assert.doesNotMatch(app, /refreshNoiBoardIfActive|refreshNoiWeekBoard/);
});
