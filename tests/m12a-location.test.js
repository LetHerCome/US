// M12A — Location V2: ambient distance capsule with automatic, permission-respecting refresh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const html = read('index.html');
const block = app.slice(app.indexOf('let locationRefreshInFlight=false;'), app.indexOf('function setAvatarSlot('));
const MIN = 60 * 1000;

function harness({ permission = 'granted', rows = [], geo = 'ok', localDev = false, enabled = false, hidden = false } = {}) {
  const calls = { geolocation: [], upserts: 0, selects: 0, toasts: [] };
  const store = new Map(enabled ? [['usLocationEnabled', '1']] : []);
  const capsule = { hidden: true, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const value = { textContent: '' };
  let currentRows = rows;
  const state = { permission, geo, rows: () => currentRows, setRows: (r) => { currentRows = r; } };
  const sandbox = {
    window: { usProfile: { id: 'me', couple_id: 'c', role: 'francesco' }, __US_LOCAL_DEV__: localDev },
    document: { hidden, getElementById: (id) => ({ distanceWidget: capsule, distanceValue: value })[id] || null },
    navigator: {
      geolocation: {
        getCurrentPosition(ok, fail, options) {
          calls.geolocation.push(options);
          if (state.geo === 'ok') ok({ coords: { latitude: 41.9, longitude: 12.5, accuracy: 30 }, timestamp: Date.now() });
          else fail({ code: state.geo === 'denied' ? 1 : 2 });
        }
      },
      permissions: { query: async () => ({ get state() { return state.permission; }, onchange: null }) }
    },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sb: {
      from: () => ({
        select: () => ({ eq: async () => { calls.selects += 1; return { data: state.rows(), error: null }; } }),
        upsert: async () => { calls.upserts += 1; return { error: null }; }
      })
    },
    toast: (message) => calls.toasts.push(message),
    setInterval: () => 7,
    clearInterval() {},
    console: { warn() {} },
    Date, Number, Math, Promise, JSON, Infinity, Object, Array, String, Boolean, isFinite: Number.isFinite, parseFloat
  };
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(`${block}\nthis.api={decideLocationRefresh,distanceCapsuleModel,maybeAutoRefreshLocation,refreshMyLocation,startLocationRefreshTimer,hydrateDistance,openDistanceDetail,usLocationRuntime};`, sandbox);
  return { api: sandbox.api, calls, capsule, value, state, store, sandbox };
}

const ago = (minutes) => new Date(Date.now() - minutes * MIN).toISOString();
const pair = (mineAge, partnerAge) => [
  { user_id: 'me', latitude: 41.9, longitude: 12.5, updated_at: ago(mineAge) },
  { user_id: 'her', latitude: 45.46, longitude: 9.19, updated_at: ago(partnerAge) }
];
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('launch refresh: granted permission and no reading triggers one silent, cheap read', async () => {
  const h = harness({ rows: [] });
  const decision = await h.api.maybeAutoRefreshLocation('launch');
  await tick();
  assert.equal(decision.refresh, true);
  assert.equal(h.calls.geolocation.length, 1);
  assert.equal(h.calls.geolocation[0].enableHighAccuracy, false, 'automatic reads do not use GPS');
  assert.equal(h.calls.upserts, 1);
  assert.deepEqual(h.calls.toasts, [], 'automatic refresh is silent');
});

test('stale resume refreshes; fresh resume does not touch geolocation', async () => {
  const stale = harness({ rows: pair(30, 2) });
  await stale.api.maybeAutoRefreshLocation('resume');
  assert.equal(stale.calls.geolocation.length, 1, 'a 30 minute old reading is refreshed');

  const fresh = harness({ rows: pair(2, 2) });
  const decision = await fresh.api.maybeAutoRefreshLocation('resume');
  assert.equal(decision.why, 'fresh');
  assert.equal(fresh.calls.geolocation.length, 0, 'a 2 minute old reading is left alone');
  await fresh.api.maybeAutoRefreshLocation('resume');
  assert.equal(fresh.calls.geolocation.length, 0);
});

test('rapid repeated resumes never spam geolocation', async () => {
  const h = harness({ rows: pair(45, 2) });
  await h.api.maybeAutoRefreshLocation('resume');
  await tick();
  // The stored reading is still the old one in this fake; only the minimum gap stops the second read.
  await h.api.maybeAutoRefreshLocation('resume');
  await h.api.maybeAutoRefreshLocation('resume');
  assert.equal(h.calls.geolocation.length, 1);
});

test('permission: denied never prompts; prompt never auto-prompts; denial from the browser stops retries', async () => {
  const denied = harness({ permission: 'denied', rows: [] });
  for (let i = 0; i < 4; i += 1) await denied.api.maybeAutoRefreshLocation('resume');
  assert.equal(denied.calls.geolocation.length, 0);
  assert.equal(denied.capsule.dataset.usDistanceState, 'denied');
  assert.equal(denied.value.textContent, 'Posizione non disponibile');

  const prompt = harness({ permission: 'prompt', rows: [], enabled: true });
  for (let i = 0; i < 3; i += 1) await prompt.api.maybeAutoRefreshLocation('resume');
  assert.equal(prompt.calls.geolocation.length, 0, 'the dialog only ever comes from an explicit tap');
  assert.equal(prompt.capsule.dataset.usDistanceState, 'needs-permission');
  assert.equal(prompt.value.textContent, 'Attiva posizione');

  const refused = harness({ permission: 'granted', geo: 'denied', rows: [], enabled: true });
  await refused.api.maybeAutoRefreshLocation('launch');
  await tick();
  assert.equal(refused.calls.geolocation.length, 1);
  assert.equal(refused.store.has('usLocationEnabled'), false, 'the stale "enabled" flag is cleared');
  refused.state.permission = 'denied';
  await refused.api.maybeAutoRefreshLocation('resume');
  await refused.api.maybeAutoRefreshLocation('resume');
  assert.equal(refused.calls.geolocation.length, 1, 'no endless re-asking');
});

test('unknown permission state only auto-refreshes if the user enabled location before', async () => {
  const never = harness({ permission: 'unknown', rows: [] });
  await never.api.maybeAutoRefreshLocation('launch');
  assert.equal(never.calls.geolocation.length, 0);
  const before = harness({ permission: 'unknown', rows: [], enabled: true });
  await before.api.maybeAutoRefreshLocation('launch');
  assert.equal(before.calls.geolocation.length, 1);
});

test('refresh failure keeps the last known distance and backs off', async () => {
  const h = harness({ rows: pair(40, 40), geo: 'unavailable' });
  await h.api.maybeAutoRefreshLocation('launch');
  await tick();
  assert.equal(h.calls.geolocation.length, 1);
  assert.match(h.value.textContent, /^\d{3} km$/, 'the last good distance is still on screen');
  assert.equal(h.capsule.hidden, false);
  assert.notEqual(h.capsule.dataset.usDistanceState, 'denied');
  assert.deepEqual(h.calls.toasts, [], 'no error card or toast for a background failure');
  h.sandbox.Date = Date;
  await h.api.maybeAutoRefreshLocation('resume');
  assert.equal(h.calls.geolocation.length, 1, 'failure back-off: not retried immediately');
});

test('a failed database read never replaces a valid last-known distance', async () => {
  const h = harness({ rows: pair(2, 2) });
  await h.api.hydrateDistance();
  const shown = h.value.textContent;
  assert.match(shown, /km$/);
  h.sandbox.sb.from = () => ({ select: () => ({ eq: async () => ({ data: null, error: new Error('offline') }) }) });
  await h.api.hydrateDistance();
  assert.equal(h.value.textContent, shown);
});

test('capsule model: compact states, stale stays visible, nothing invites a manual refresh', () => {
  const { api } = harness();
  const fresh = api.distanceCapsuleModel({ mine: pair(1, 1)[0], partner: pair(1, 1)[1], partnerName: 'Beatrice' });
  assert.equal(fresh.state, 'ready');
  assert.match(fresh.text, /^\d{3} km$/);
  assert.match(fresh.detail, /tra voi$/);

  const stale = api.distanceCapsuleModel({ mine: pair(200, 1)[0], partner: pair(200, 1)[1], partnerName: 'Beatrice' });
  assert.equal(stale.state, 'stale');
  assert.equal(stale.visible, true);
  assert.equal(stale.text, fresh.text, 'the value is kept');

  const waiting = api.distanceCapsuleModel({ mine: pair(1, 1)[0], partner: null, partnerName: 'Beatrice' });
  assert.equal(waiting.state, 'waiting');
  assert.equal(api.distanceCapsuleModel({ supported: false }).visible, false);
  assert.equal(api.distanceCapsuleModel({ permission: 'granted' }).visible, false, 'granted but not yet read: nothing to show');
});

test('policy windows are documented in code: fresh 10 min, stale-display 60 min', () => {
  assert.match(app, /const US_LOCATION_FRESH_MS=10\*60\*1000;/);
  assert.match(app, /const US_LOCATION_STALE_DISPLAY_MS=60\*60\*1000;/);
  assert.match(app, /const US_LOCATION_MIN_GAP_MS=45\*1000;/);
  assert.match(app, /const US_LOCATION_FAILURE_BACKOFF_MS=5\*60\*1000;/);
});

test('triggers are event driven: launch, foreground and one slow visible-only check', () => {
  assert.match(app, /maybeAutoRefreshLocation\('launch'\)/);
  assert.match(app, /if\(options\.foreground\)maybeAutoRefreshLocation\('resume'\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange',\(\)=>\{if\(!document\.hidden&&window\.usProfile\)refreshVisibleState\(\{foreground:true\}\);\}\);/);
  assert.match(app, /if\(document\.hidden\|\|!window\.usProfile\)return;\s*maybeAutoRefreshLocation\('check'\)/);
  assert.doesNotMatch(app, /watchPosition/, 'no continuous geolocation watch');
});

test('local Visual Lab still never requests or saves a production location', async () => {
  const h = harness({ localDev: true, rows: [] });
  await h.api.maybeAutoRefreshLocation('launch');
  h.api.refreshMyLocation({ silent: true });
  h.api.startLocationRefreshTimer();
  assert.equal(h.calls.geolocation.length, 0);
  assert.equal(h.calls.upserts, 0);
});

test('no visible manual refresh UI remains on Oggi', () => {
  const capsule = html.match(/<button[^>]*id="distanceWidget"[\s\S]*?<\/button>/)[0];
  assert.doesNotMatch(capsule, /Aggiorna|arrows-clockwise|distanceAction|distanceMeta|Tocca per/i);
  assert.match(capsule, /<b id="distanceValue"><\/b>/);
  assert.doesNotMatch(capsule, /onclick="refreshMyLocation/);
  assert.doesNotMatch(app, /Aggiorno la distanza|Aggiorna distanza|'Aggiorna'/);
  assert.match(read('styles.css'), /\.us-distance-capsule\{[^}]*height:36px/);
});

test('tapping the capsule opens a tiny sheet; "Attiva posizione" only when genuinely required', async () => {
  const seen = [];
  const h = harness({ rows: pair(4, 4) });
  h.sandbox.window.UsUiFoundation = { notice: async (o) => seen.push(['notice', o]), confirm: async (o) => { seen.push(['confirm', o]); return false; } };
  await h.api.hydrateDistance();
  await h.api.openDistanceDetail();
  assert.equal(seen[0][0], 'notice');
  assert.match(seen[0][1].title, /km tra voi$/);
  assert.match(seen[0][1].body, /^Aggiornata 4 min fa$/);

  const needs = harness({ permission: 'prompt', rows: [] });
  needs.sandbox.window.UsUiFoundation = { notice: async () => assert.fail('no notice'), confirm: async (o) => { seen.push(['confirm', o]); return false; } };
  await needs.api.maybeAutoRefreshLocation('launch');
  await needs.api.openDistanceDetail();
  assert.equal(seen.at(-1)[0], 'confirm');
  assert.equal(seen.at(-1)[1].confirmLabel, 'Attiva');
  assert.equal(needs.calls.geolocation.length, 0, 'declining the sheet asks nothing');
});
