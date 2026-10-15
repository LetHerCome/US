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
  assert.match(source, /keep the last resolved board visible while the canonical calendar refreshes/);
  assert.doesNotMatch(source, /if \(body\) body\.innerHTML = '<span class="noi-week-board-loading">Carico gli impegni…<\/span>';/, 'same-couple refresh never replaces resolved Lavagna with a loader');
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
  // Its Noi Lavagna refresh wiring moved to app.js, unchanged.
  assert.match(app, /new MutationObserver\(refreshNoiBoardIfActive\)\.observe\(bond,\{attributes:true,attributeFilter:\['class'\]\}\)/);
  assert.match(app, /window\.addEventListener\('online',refreshNoiBoardIfActive\)/);
  assert.match(app, /event\.target\.closest\?\.\('\[data-noi-week-board-open\]'\)\)setTimeout\(\(\)=>window\.refreshNoiWeekBoard\?\.\(\),250\)/);
});
