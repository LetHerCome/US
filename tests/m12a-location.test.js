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

function harness({ permission = 'granted', server = null, geo = 'ok', localDev = false, consent = true, hidden = false, coords = { latitude: 41.902783, longitude: 12.496366 } } = {}) {
  const calls = { geolocation: [], upserts: [], selects: 0, rpc: [], toasts: [] };
  const store = new Map(consent ? [['us:location:consent', 'approximate-v1']] : []);
  const capsule = { hidden: true, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const value = { textContent: '' };
  let currentServer = server;
  const state = { permission, geo, server: () => currentServer, setServer: (s) => { currentServer = s; }, rpcError: null };
  const sandbox = {
    window: { usProfile: { id: 'me', couple_id: 'c', role: 'francesco' }, __US_LOCAL_DEV__: localDev },
    document: { hidden, getElementById: (id) => ({ distanceWidget: capsule, distanceValue: value })[id] || null },
    navigator: {
      geolocation: {
        getCurrentPosition(ok, fail, options) {
          calls.geolocation.push(options);
          if (state.geo === 'ok') ok({ coords: { ...coords, accuracy: 30 }, timestamp: Date.now() });
          else fail({ code: state.geo === 'denied' ? 1 : 2 });
        }
      },
      permissions: { query: async () => ({ get state() { return state.permission; }, onchange: null }) }
    },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sb: {
      from: (table) => ({
        select: () => ({ eq: async () => { calls.selects += 1; return { data: [], error: null }; } }),
        upsert: async (payload) => { calls.upserts.push({ table, payload }); return { error: null }; }
      }),
      rpc: async (name) => {
        calls.rpc.push(name);
        if (state.rpcError) return { data: null, error: state.rpcError };
        if (name === 'stop_sharing_location') { currentServer = null; return { data: true, error: null }; }
        return { data: state.server(), error: null };
      }
    },
    toast: (message) => calls.toasts.push(message),
    setInterval: () => 7,
    clearInterval() {},
    console: { warn() {} },
    Date, Number, Math, Promise, JSON, Infinity, Object, Array, String, Boolean, isFinite: Number.isFinite, parseFloat
  };
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(`${block}\nthis.api={decideLocationRefresh,distanceCapsuleModel,maybeAutoRefreshLocation,refreshMyLocation,startLocationRefreshTimer,hydrateDistance,openDistanceDetail,openLocationDisclosure,openLocationSettings,stopSharingLocation,usLocationCell,usLocationRuntime};`, sandbox);
  return { api: sandbox.api, calls, capsule, value, state, store, sandbox };
}

const ago = (minutes) => new Date(Date.now() - minutes * MIN).toISOString();
// couple_distance(): never coordinates, only a rounded distance or "near".
const pair = (mineAge, partnerAge, extra = {}) => ({ sharing: true, my_updated_at: ago(mineAge), partner_sharing: true, partner_updated_at: ago(partnerAge), near: false, distance_km: 477, ...extra });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('launch refresh: consent + granted permission and no reading triggers one silent, approximate read', async () => {
  const h = harness({ server: null });
  const decision = await h.api.maybeAutoRefreshLocation('launch');
  await tick();
  assert.equal(decision.refresh, true);
  assert.equal(h.calls.geolocation.length, 1);
  assert.equal(h.calls.geolocation[0].enableHighAccuracy, false, 'never GPS precision');
  assert.equal(h.calls.upserts.length, 1);
  assert.deepEqual(h.calls.toasts, [], 'automatic refresh is silent');
});

test('without the explanation accepted nothing is ever read, whatever the permission says', async () => {
  for (const permission of ['granted', 'unknown', 'prompt']) {
    const h = harness({ permission, consent: false, server: null });
    const decision = await h.api.maybeAutoRefreshLocation('launch');
    assert.equal(decision.why, 'no-consent');
    h.api.refreshMyLocation({ silent: true });
    h.api.refreshMyLocation({});
    assert.equal(h.calls.geolocation.length, 0, permission);
    assert.equal(h.capsule.dataset.usDistanceState, 'needs-permission');
    assert.equal(h.value.textContent, 'Attiva posizione');
  }
});

test('the phone sends only the grid cell: no accuracy, no precise coordinates', async () => {
  const h = harness({ server: null });
  await h.api.maybeAutoRefreshLocation('launch');
  await tick();
  const { table, payload } = h.calls.upserts[0];
  assert.equal(table, 'couple_locations');
  assert.equal(payload.accuracy_m, null);
  assert.deepEqual({ latitude: payload.latitude, longitude: payload.longitude }, { ...h.api.usLocationCell(41.902783, 12.496366) });
  assert.notEqual(payload.latitude, 41.902783);
});

test('grid cells are at least 3 km2 everywhere people live, and snapping is stable', () => {
  const { api } = harness();
  const R = 6371.0088;
  for (const lat of [-60, -33.87, 0, 0.01, 41.9, 45.46, 59.9, 64.1, 69.6]) {
    const lonCells = Math.max(1, Math.floor(360 * Math.cos(((Math.floor((lat + 90) / 0.02) + 0.5) * 0.02 - 90) * Math.PI / 180) / 0.02));
    const centre = api.usLocationCell(lat, 12.5);
    const heightKm = 0.02 * Math.PI / 180 * R;
    const widthKm = (360 / lonCells) * Math.PI / 180 * R * Math.cos(centre.latitude * Math.PI / 180);
    assert.ok(heightKm * widthKm >= 3, `${lat}: ${heightKm * widthKm}`);
    assert.deepEqual(api.usLocationCell(centre.latitude, centre.longitude), centre, 'a cell centre snaps to itself');
  }
  const a = api.usLocationCell(41.9028, 12.4964);
  const b = api.usLocationCell(41.9031, 12.4969);
  assert.deepEqual(a, b, 'two points a few metres apart are indistinguishable');
  assert.equal(api.usLocationCell(91, 0), null);
  assert.equal(api.usLocationCell('x', 0), null);
});

test('stale resume refreshes; fresh resume does not touch geolocation', async () => {
  const stale = harness({ server: pair(30, 2) });
  await stale.api.maybeAutoRefreshLocation('resume');
  assert.equal(stale.calls.geolocation.length, 1, 'a 30 minute old reading is refreshed');

  const fresh = harness({ server: pair(2, 2) });
  const decision = await fresh.api.maybeAutoRefreshLocation('resume');
  assert.equal(decision.why, 'fresh');
  assert.equal(fresh.calls.geolocation.length, 0, 'a 2 minute old reading is left alone');
  await fresh.api.maybeAutoRefreshLocation('resume');
  assert.equal(fresh.calls.geolocation.length, 0);
});

test('rapid repeated resumes never spam geolocation', async () => {
  const h = harness({ server: pair(45, 2) });
  await h.api.maybeAutoRefreshLocation('resume');
  await tick();
  await h.api.maybeAutoRefreshLocation('resume');
  await h.api.maybeAutoRefreshLocation('resume');
  assert.equal(h.calls.geolocation.length, 1);
});

test('permission: denied never prompts; prompt never auto-prompts; denial from the browser stops retries', async () => {
  const denied = harness({ permission: 'denied', server: null });
  for (let i = 0; i < 4; i += 1) await denied.api.maybeAutoRefreshLocation('resume');
  assert.equal(denied.calls.geolocation.length, 0);
  assert.equal(denied.capsule.dataset.usDistanceState, 'denied');
  assert.equal(denied.value.textContent, 'Posizione non disponibile');

  const prompt = harness({ permission: 'prompt', server: null });
  for (let i = 0; i < 3; i += 1) await prompt.api.maybeAutoRefreshLocation('resume');
  assert.equal(prompt.calls.geolocation.length, 0, 'the dialog only ever comes from an explicit tap');
  assert.equal(prompt.capsule.dataset.usDistanceState, 'needs-permission');
  assert.equal(prompt.value.textContent, 'Attiva posizione');

  const refused = harness({ permission: 'granted', geo: 'denied', server: null });
  await refused.api.maybeAutoRefreshLocation('launch');
  await tick();
  assert.equal(refused.calls.geolocation.length, 1);
  refused.state.permission = 'denied';
  await refused.api.maybeAutoRefreshLocation('resume');
  await refused.api.maybeAutoRefreshLocation('resume');
  assert.equal(refused.calls.geolocation.length, 1, 'no endless re-asking');
});

test('unknown permission state auto-refreshes only after consent', async () => {
  const never = harness({ permission: 'unknown', server: null, consent: false });
  await never.api.maybeAutoRefreshLocation('launch');
  assert.equal(never.calls.geolocation.length, 0);
  const before = harness({ permission: 'unknown', server: null, consent: true });
  await before.api.maybeAutoRefreshLocation('launch');
  assert.equal(before.calls.geolocation.length, 1);
});

test('refresh failure keeps the last known distance and backs off', async () => {
  const h = harness({ server: pair(40, 40), geo: 'unavailable' });
  await h.api.maybeAutoRefreshLocation('launch');
  await tick();
  assert.equal(h.calls.geolocation.length, 1);
  assert.equal(h.value.textContent, '477 km', 'the last good distance is still on screen');
  assert.equal(h.capsule.hidden, false);
  assert.notEqual(h.capsule.dataset.usDistanceState, 'denied');
  assert.deepEqual(h.calls.toasts, [], 'no error card or toast for a background failure');
  await h.api.maybeAutoRefreshLocation('resume');
  assert.equal(h.calls.geolocation.length, 1, 'failure back-off: not retried immediately');
});

test('a failed server read never replaces a valid last-known distance', async () => {
  const h = harness({ server: pair(2, 2) });
  await h.api.hydrateDistance();
  const shown = h.value.textContent;
  assert.equal(shown, '477 km');
  h.state.rpcError = new Error('offline');
  await h.api.hydrateDistance();
  assert.equal(h.value.textContent, shown);
});

test('the distance comes only from couple_distance(): partner coordinates are never read', async () => {
  const h = harness({ server: pair(2, 2) });
  await h.api.maybeAutoRefreshLocation('launch');
  assert.ok(h.calls.rpc.includes('couple_distance'));
  assert.equal(h.calls.selects, 0, 'no table read of couple_locations');
  assert.doesNotMatch(block, /from\('couple_locations'\)\s*\.select/);
  assert.doesNotMatch(block, /position\.coords\.latitude\.toFixed/, 'no raw coordinates are sent');
});

test('capsule model: compact states, near under 3 km, stale stays visible, nothing invites a manual refresh', () => {
  const { api } = harness();
  const fresh = api.distanceCapsuleModel({ server: pair(1, 1), partnerName: 'Beatrice', consent: true });
  assert.equal(fresh.state, 'ready');
  assert.equal(fresh.text, '477 km');
  assert.match(fresh.detail, /tra voi$/);

  const near = api.distanceCapsuleModel({ server: pair(1, 1, { near: true, distance_km: null }), consent: true });
  assert.equal(near.state, 'ready');
  assert.equal(near.text, 'vicini');
  assert.equal(near.detail, 'Siete vicini');
  assert.equal(near.km, 0);

  const stale = api.distanceCapsuleModel({ server: pair(200, 1), partnerName: 'Beatrice', consent: true });
  assert.equal(stale.state, 'stale');
  assert.equal(stale.visible, true);
  assert.equal(stale.text, fresh.text, 'the value is kept');

  const waiting = api.distanceCapsuleModel({ server: { ...pair(1, 1), partner_sharing: false, partner_updated_at: null, distance_km: null }, partnerName: 'Beatrice', consent: true });
  assert.equal(waiting.state, 'waiting');
  assert.equal(api.distanceCapsuleModel({ supported: false }).visible, false);
  assert.equal(api.distanceCapsuleModel({ permission: 'granted', consent: true }).visible, false, 'consented and granted but not yet read: nothing to show');
  assert.equal(api.distanceCapsuleModel({ permission: 'granted', consent: false }).state, 'needs-permission');
});

test('the explanation comes before the system dialog; "Non ora" asks nothing', async () => {
  const seen = [];
  const h = harness({ permission: 'prompt', server: null, consent: false });
  h.sandbox.window.UsUiFoundation = { confirm: async (o) => { seen.push(o); return false; } };
  assert.equal(await h.api.openLocationDisclosure(), false);
  assert.equal(h.calls.geolocation.length, 0);
  assert.equal(h.store.has('us:location:consent'), false);
  const body = seen[0].body;
  assert.match(body, /posizione approssimativa di questo telefono, solo ad app aperta, per calcolare la distanza tra voi/);
  assert.match(body, /vede solo la distanza, mai dove sei/);
  assert.match(body, /Puoi smettere quando vuoi/);
  assert.equal(seen[0].confirmLabel, 'Attiva');
  assert.equal(seen[0].cancelLabel, 'Non ora');

  h.sandbox.window.UsUiFoundation = { confirm: async () => true };
  assert.equal(await h.api.openLocationDisclosure(), true);
  await tick();
  assert.equal(h.store.get('us:location:consent'), 'approximate-v1');
  assert.equal(h.calls.geolocation.length, 1, 'only now the system dialog may appear');
});

test('"Smetti e cancella" deletes the reading on the server and stops every automatic read', async () => {
  const h = harness({ server: pair(30, 2) });
  h.store.set('usLocationEnabled', '1');
  h.sandbox.window.UsUiFoundation = { confirm: async (o) => { assert.equal(o.confirmLabel, 'Smetti e cancella'); assert.equal(o.tone, 'danger'); return true; } };
  await h.api.hydrateDistance();
  await h.api.openLocationSettings();
  assert.ok(h.calls.rpc.includes('stop_sharing_location'));
  assert.equal(h.store.has('us:location:consent'), false);
  assert.equal(h.store.has('usLocationEnabled'), false);
  assert.ok(h.calls.toasts.includes('Posizione cancellata'));
  assert.equal(h.capsule.dataset.usDistanceState, 'needs-permission');
  await h.api.maybeAutoRefreshLocation('resume');
  assert.equal(h.calls.geolocation.length, 0);
});

test('a failed stop keeps the consent and says so', async () => {
  const h = harness({ server: pair(2, 2) });
  await h.api.hydrateDistance();
  h.state.rpcError = new Error('offline');
  assert.equal(await h.api.stopSharingLocation(), false);
  assert.equal(h.store.get('us:location:consent'), 'approximate-v1');
  assert.match(h.calls.toasts.at(-1), /Non riesco a cancellare/);
});

test('policy windows are documented in code: fresh 10 min, stale-display 60 min', () => {
  assert.match(app, /const US_LOCATION_FRESH_MS=10\*60\*1000;/);
  assert.match(app, /const US_LOCATION_STALE_DISPLAY_MS=60\*60\*1000;/);
  assert.match(app, /const US_LOCATION_MIN_GAP_MS=45\*1000;/);
  assert.match(app, /const US_LOCATION_FAILURE_BACKOFF_MS=5\*60\*1000;/);
  assert.match(app, /const US_LOCATION_CELL_DEG=0\.02;/);
});

test('triggers are event driven: launch, foreground and one slow visible-only check', () => {
  assert.match(app, /maybeAutoRefreshLocation\('launch'\)/);
  // 20/10: just after the page on screen has refreshed (usAfterForeground).
  assert.match(app, /if\(options\.foreground\)usAfterForeground\(\(\)=>maybeAutoRefreshLocation\('resume'\),\d+\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange',\(\)=>\{if\(!document\.hidden&&window\.usProfile\)refreshVisibleState\(\{foreground:true\}\);\}\);/);
  assert.match(app, /if\(document\.hidden\|\|!window\.usProfile\)return;\s*maybeAutoRefreshLocation\('check'\)/);
  assert.doesNotMatch(app, /watchPosition/, 'no continuous geolocation watch');
  assert.doesNotMatch(app, /enableHighAccuracy:true|enableHighAccuracy:!silent/, 'never high accuracy');
});

test('local Visual Lab still never requests or saves a production location', async () => {
  const h = harness({ localDev: true, server: null });
  await h.api.maybeAutoRefreshLocation('launch');
  h.api.refreshMyLocation({ silent: true });
  h.api.startLocationRefreshTimer();
  assert.equal(h.calls.geolocation.length, 0);
  assert.equal(h.calls.upserts.length, 0);
});

test('no visible manual refresh UI remains on Oggi', () => {
  const capsule = html.match(/<button[^>]*id="distanceWidget"[\s\S]*?<\/button>/)[0];
  assert.doesNotMatch(capsule, /Aggiorna|arrows-clockwise|distanceAction|distanceMeta|Tocca per/i);
  assert.match(capsule, /<b id="distanceValue"><\/b>/);
  assert.doesNotMatch(capsule, /onclick="refreshMyLocation/);
  assert.doesNotMatch(app, /Aggiorno la distanza|Aggiorna distanza|'Aggiorna'/);
  assert.match(read('styles.css'), /\.us-distance-capsule\{[^}]*height:36px/);
});

test('tapping the capsule opens a tiny sheet; the explanation only when sharing is off', async () => {
  const seen = [];
  const h = harness({ server: pair(4, 4) });
  h.sandbox.window.UsUiFoundation = { notice: async (o) => seen.push(['notice', o]), confirm: async (o) => { seen.push(['confirm', o]); return false; } };
  await h.api.hydrateDistance();
  await h.api.openDistanceDetail();
  assert.equal(seen[0][0], 'notice');
  assert.equal(seen[0][1].title, '477 km tra voi');
  assert.match(seen[0][1].body, /^Aggiornata 4 min fa\. Puoi smettere di condividerla da Impostazioni › Posizione\.$/);

  const needs = harness({ permission: 'prompt', server: null, consent: false });
  needs.sandbox.window.UsUiFoundation = { notice: async () => assert.fail('no notice'), confirm: async (o) => { seen.push(['confirm', o]); return false; } };
  await needs.api.maybeAutoRefreshLocation('launch');
  await needs.api.openDistanceDetail();
  assert.equal(seen.at(-1)[0], 'confirm');
  assert.equal(seen.at(-1)[1].confirmLabel, 'Attiva');
  assert.equal(needs.calls.geolocation.length, 0, 'declining the sheet asks nothing');
});

// Batteria del partner (founder, 31/10/2026, option C): the sheet the capsule
// opens says the partner's battery under the distance, only beside a real one.
test('the distance sheet carries the partner battery line beside a distance', async () => {
  const seen = [];
  const h = harness({ server: pair(4, 4) });
  h.sandbox.window.UsUiFoundation = { notice: async (o) => seen.push(o) };
  h.sandbox.window.UsPartnerBattery = { sheetLine: () => 'Bea · 18% · 2 ore fa' };
  await h.api.hydrateDistance();
  await h.api.openDistanceDetail();
  assert.equal(seen[0].title, '477 km tra voi');
  assert.equal(seen[0].note, 'Bea · 18% · 2 ore fa');
  assert.match(seen[0].body, /^Aggiornata 4 min fa\. /, 'the location sentence stays as it was');

  const waiting = harness({ server: { ...pair(1, 1), partner_sharing: false, partner_updated_at: null, distance_km: null } });
  waiting.sandbox.window.UsUiFoundation = { notice: async (o) => seen.push(o) };
  waiting.sandbox.window.UsPartnerBattery = { sheetLine: () => 'Bea · 18% · 2 ore fa' };
  await waiting.api.hydrateDistance();
  await waiting.api.openDistanceDetail();
  assert.equal(seen.at(-1).note, undefined, 'no distance yet: no battery either');

  const none = harness({ server: pair(4, 4) });
  none.sandbox.window.UsUiFoundation = { notice: async (o) => seen.push(o) };
  none.sandbox.window.UsPartnerBattery = { sheetLine: () => '' };
  await none.api.hydrateDistance();
  await none.api.openDistanceDetail();
  assert.equal(seen.at(-1).note, undefined, 'no reading: nothing');
});
