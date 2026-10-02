const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://us.example.test';
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const worker = read('service-worker.js');
const build = html.match(/<meta name="us-build" content="([^"]+)"\/>/)?.[1];

const localRuntime = () => [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(\/[^"/][^"]*\.(?:js|css)(?:\?[^"]*)?)"/g)].map((m) => m[1]);

test('perf 1.0: every local script and stylesheet is requested at its BUILD_ID URL', () => {
  const assets = localRuntime();
  assert.ok(assets.length >= 30, 'index.html loads the whole runtime');
  for (const asset of assets) assert.equal(asset.split('?v=')[1], build, asset);
  const preload = html.match(/<link rel="preload" href="([^"]+)" as="script">/)?.[1];
  assert.equal(preload, `/app.js?v=${build}`, 'the preload hits the same URL as the app.js script tag');
  assert.ok(html.includes(`<script defer src="${preload}"></script>`));
});

test('perf 1.0: every versioned runtime file is in the build precache', () => {
  for (const asset of localRuntime()) {
    const file = asset.split('?')[0];
    assert.ok(worker.includes(`versioned("${file}")`), `${file} is precached at its ?v= URL`);
  }
});

test('perf 1.0: the native staging copies every runtime file index.html loads', () => {
  const staging = read('scripts/build-capacitor-web.mjs');
  for (const asset of localRuntime()) {
    const file = asset.slice(1).split('?')[0];
    assert.match(staging, new RegExp(`'${file.replace('.', '\\.')}'`), `${file} is in RUNTIME_FILES`);
  }
  assert.match(staging, /\/\(<script defer src="\\\/platform\\\.js\(\?:\\\?v=\[\^"\]\+\)\?"><\\\/script>\)\//, 'native-entry.js is inserted whatever the platform.js query');
});

function serviceWorker() {
  const listeners = new Map();
  const buckets = new Map();
  const network = [];
  let online = true;
  const key = (input) => (typeof input === 'string' ? new URL(input, ORIGIN).href : input.url);
  class AbsoluteRequest extends Request {
    constructor(input, init) { super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init); }
  }
  const respond = (input) => {
    if (!online) throw new Error('offline');
    const url = new URL(key(input));
    network.push(url.pathname + url.search);
    return new Response(`asset:${url.pathname}`, { status: 200 });
  };
  const bucket = (name) => { if (!buckets.has(name)) buckets.set(name, new Map()); return buckets.get(name); };
  const caches = {
    async open(name) {
      const entries = bucket(name);
      return {
        async addAll(list) { for (const item of list) entries.set(key(item), respond(item)); },
        async match(input) { return entries.get(key(input))?.clone(); },
        async put(input, response) { entries.set(key(input), response.clone()); },
        async keys() { return [...entries.keys()].map((k) => new Request(k)); },
        async delete(input) { return entries.delete(key(input)); }
      };
    },
    async match(input) { for (const entries of buckets.values()) if (entries.has(key(input))) return entries.get(key(input)).clone(); return undefined; },
    async keys() { return [...buckets.keys()]; },
    async delete(name) { return buckets.delete(name); }
  };
  const self = {
    location: { origin: ORIGIN },
    registration: { async showNotification() {} },
    clients: { async claim() {}, async matchAll() { return []; }, async openWindow() {} },
    addEventListener(type, handler) { listeners.set(type, handler); },
    async skipWaiting() {}
  };
  vm.runInContext(worker, vm.createContext({ self, caches, fetch: async (input) => respond(input), URL, Request: AbsoluteRequest, Response, console }), { filename: 'service-worker.js' });
  const extendable = async (type) => { const waits = []; listeners.get(type)({ waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  const fetchEvent = async (pathname, extra = {}) => {
    let responded; const waits = [];
    listeners.get('fetch')({ request: { url: new URL(pathname, ORIGIN).href, method: 'GET', mode: 'cors', destination: '', ...extra }, respondWith: (p) => { responded = p; }, waitUntil: (p) => waits.push(p) });
    const response = await responded;
    await Promise.all(waits.map((p) => p.catch(() => {})));
    return response;
  };
  return { extendable, fetchEvent, network, buckets, setOnline: (value) => { online = value; } };
}

test('perf 1.0: a launch inside the same build serves the precached shell without touching the network', async () => {
  const sw = serviceWorker();
  await sw.extendable('install');
  await sw.extendable('activate');
  sw.network.length = 0;
  for (const asset of [...localRuntime(), '/assets/fonts/Inter-Variable.woff2', '/assets/derived/runtime/us-icon-settings-128-v1.png', '/assets/derived/runtime/us-symbol-256-v1.png', '/assets/icons/phosphor/house-fill.svg']) {
    const response = await sw.fetchEvent(asset);
    assert.equal(await response.text(), `asset:${asset.split('?')[0]}`, asset);
  }
  assert.deepEqual(sw.network, [], 'no background revalidation of build assets');
  assert.ok(sw.buckets.has('us-private-media-v1') === false, 'the private media cache is untouched by shell traffic');
});

test('perf 1.0: navigation, version.json and non-shell assets keep their network strategies', async () => {
  const sw = serviceWorker();
  await sw.extendable('install');
  await sw.extendable('activate');
  sw.network.length = 0;
  await sw.fetchEvent('/home', { mode: 'navigate' });
  await sw.fetchEvent('/version.json?ts=1');
  await sw.fetchEvent('/assets/icons/phosphor/not-in-shell.svg');
  assert.deepEqual(sw.network, ['/home', '/version.json?ts=1', '/assets/icons/phosphor/not-in-shell.svg']);
  sw.setOnline(false);
  const offline = await sw.fetchEvent('/assets/fonts/Newsreader-Variable.woff2');
  assert.equal(await offline.text(), 'asset:/assets/fonts/Newsreader-Variable.woff2', 'offline launch still boots from the shell cache');
});

test('perf 1.0: Settings pre-fills after Home settles, but hydrates at once when it is the launch page', () => {
  const settings = read('settings.js');
  assert.match(settings, /if\(window\.usProfile\)\{clearInterval\(wait\);hydrateWhenHomeSettles\(\);\}/);
  const fn = settings.match(/function hydrateWhenHomeSettles\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(fn, /getElementById\('settings'\)\?\.classList\.contains\('active'\)\)return hydrateUsSettings\(\)/);
  assert.match(fn, /requestIdleCallback\(run/);
  assert.match(read('app.js'), /if\(id==='settings' && window\.usProfile\) window\.hydrateUsSettings\?\.\(\);/, 'opening Settings still hydrates on demand');
});

test('perf 1.0: concurrent Oggi refreshes share one Events read; a realtime change forces a fresh one', async () => {
  const events = read('events.js');
  const source = events.match(/let prioritySourceLoad=null;\nasync function getTodayEventPrioritySource\(\{fresh=false\}=\{\}\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'getTodayEventPrioritySource is present');
  let loads = 0; const pending = [];
  const context = vm.createContext({
    window: { usProfile: { id: 'f', couple_id: 'c' } },
    loadEventsData: () => { loads += 1; return new Promise((resolve) => pending.push(resolve)); },
    upcomingRows: () => [{ id: 'e', days_left: 1 }]
  });
  vm.runInContext(`${source};globalThis.get=getTodayEventPrioritySource;`, context);
  const a = context.get(); const b = context.get();
  assert.equal(loads, 1, 'two concurrent refreshes, one read');
  const c = context.get({ fresh: true });
  assert.equal(loads, 2, 'realtime asks for a fresh read');
  pending.forEach((resolve) => resolve(true));
  assert.deepEqual((await Promise.all([a, b, c])).map((row) => row.id), ['e', 'e', 'e']);
  const d = context.get();
  pending[2](true);
  await d;
  assert.equal(loads, 3, 'a later refresh reads again once nothing is in flight');

  const app = read('app.js');
  assert.match(app, /getTodayEventPrioritySource\?\.\(\{fresh:freshEvents\}\)/);
  assert.match(app, /if\(kind==='events'\)\{[\s\S]{0,160}window\.UsTodayPriority\?\.refresh\?\.\(\{freshEvents:true\}\);/);
});

test('perf 1.0: runtime derivatives are reproducible, registered, small and leave every master untouched', async () => {
  const crypto = require('node:crypto');
  const { DERIVATIVES, buildDerivative, decodePng } = await import('../scripts/build-runtime-derivatives.mjs');
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
  assert.equal(DERIVATIVES.length, 3);
  for (const entry of DERIVATIVES) {
    assert.equal(sha(entry.source), entry.sourceSha256, `${entry.source}: master is byte-identical to its approved hash`);
    const committed = fs.readFileSync(path.join(ROOT, entry.output));
    assert.ok(buildDerivative(entry).equals(committed), `${entry.output} is exactly what the script produces from the master`);
    const record = manifest.assets.find((asset) => asset.path === entry.output);
    assert.equal(record?.status, 'APPROVED');
    assert.equal(record.sha256, sha(entry.output));
    assert.equal(record.source, entry.source);
    assert.equal(record.sourceSha256, entry.sourceSha256);
    assert.ok(committed.length < 40 * 1024, `${entry.output} is ${committed.length} bytes`);
    const master = decodePng(fs.readFileSync(path.join(ROOT, entry.source)));
    const derived = decodePng(committed);
    assert.equal(derived.width, entry.width);
    assert.equal(derived.height, Math.round((master.height * entry.width) / master.width), 'aspect ratio preserved');
  }
  // Displayed sizes (CSS px) the derivatives must cover at 3x: logo 58, settings/stories 22.
  assert.ok(DERIVATIVES.find((d) => /symbol/.test(d.output)).width >= 58 * 3);
  assert.ok(DERIVATIVES.filter((d) => /icon/.test(d.output)).every((d) => d.width >= 22 * 3));
});


test('perf 1.0: build:id pins newly-added bare local CSS/JS refs', () => {
  const helper = read('scripts/set-build-id.mjs');
  assert.match(
    helper,
    /\(\(\?:href\|src\)="\\\/\[\^"\]\+\\\.\(\?:css\|js\)\)/,
    'build:id must add ?v=BUILD_ID even when a future local CSS/JS ref was introduced bare'
  );
});
