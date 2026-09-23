const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setTimeout: sleep } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function extract(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

function locationHarness(localDev) {
  const calls = { geolocation: 0, upserts: 0, intervals: 0, hydrate: 0 };
  const profile = { id: 'francesco-id', couple_id: 'couple-id' };
  const position = { coords: { latitude: 41.9, longitude: 12.5, accuracy: 8 }, timestamp: Date.now() };
  const context = {
    window: { __US_LOCAL_DEV__: localDev, usProfile: profile },
    navigator: {
      geolocation: {
        getCurrentPosition(success) {
          calls.geolocation += 1;
          success(position);
        },
      },
      permissions: {
        query: async () => ({ state: 'granted', onchange: null }),
      },
    },
    document: { hidden: false },
    localStorage: {
      values: new Map(),
      getItem(key) { return this.values.get(key) ?? null; },
      setItem(key, value) { this.values.set(key, value); },
      removeItem(key) { this.values.delete(key); },
    },
    sb: {
      from() {
        return {
          upsert: async () => {
            calls.upserts += 1;
            return { error: null };
          },
        };
      },
    },
    setInterval() {
      calls.intervals += 1;
      return 1;
    },
    clearInterval() {},
    renderDistanceState() {},
    hydrateDistance: async () => { calls.hydrate += 1; },
    geolocationError() {},
    toast() {},
    console: { warn() {} },
    Date,
    Number,
    Boolean,
    Promise,
  };
  const source = [
    'let locationRefreshInFlight=false;',
    'let locationTimer=null;',
    extract(appSource, 'async function saveMyLocation', 'function geolocationError'),
    extract(appSource, 'function refreshMyLocation', 'window.refreshMyLocation=refreshMyLocation;'),
    extract(appSource, 'async function maybeAutoRefreshLocation', 'function startLocationRefreshTimer'),
    extract(appSource, 'function startLocationRefreshTimer', 'function setAvatarSlot'),
  ].join('\n');
  vm.runInNewContext(source, vm.createContext(context), { filename: 'app-location-boundary.js' });
  return { context, calls };
}

test('M5G local Visual Lab cannot save or even request a production location', async () => {
  const { context, calls } = locationHarness(true);
  await context.saveMyLocation({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: Date.now() });
  context.refreshMyLocation({ silent: true });
  await context.maybeAutoRefreshLocation();
  context.startLocationRefreshTimer();
  assert.equal(calls.upserts, 0);
  assert.equal(calls.geolocation, 0);
  assert.equal(calls.intervals, 0);
});

test('M5G production runtime still requests geolocation and upserts the real couple row', async () => {
  const { context, calls } = locationHarness(false);
  context.refreshMyLocation({ silent: true });
  await sleep(5);
  assert.equal(calls.geolocation, 1);
  assert.equal(calls.upserts, 1);
});

test('M5G local-dev guard remains in front of timer and auto-refresh paths', () => {
  const source = appSource;
  assert.match(source, /function startLocationRefreshTimer\(\)\{\s*if\(window\.__US_LOCAL_DEV__\)return;/);
  assert.match(source, /async function maybeAutoRefreshLocation\(\)\{\s*if\(window\.__US_LOCAL_DEV__\)return;/);
  assert.match(source, /async function saveMyLocation\(position\)\{\s*if\(window\.__US_LOCAL_DEV__\)return false;/);
  assert.match(source, /function refreshMyLocation\(options=\{\}\)\{\s*if\(window\.__US_LOCAL_DEV__\)return;/);
});
