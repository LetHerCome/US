// Batteria del partner (founder, grill del 31/10/2026): the client side.
// The phone reports only while US is open (launch, foreground), at most every
// 15 minutes. Oggi shows the partner's last reading beside the distance
// (founder, option C: "( 12 km · 🔋 18% )"), the Distanza sheet says how long
// ago; the Android widget "Noi" gets the same reading. No background work, no push.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const battery = require('../partner-battery.js');

const NOW = Date.parse('2026-10-31T15:00:00Z');
const minutes = (n) => new Date(NOW - n * 60000).toISOString();

test('report: at most every 15 minutes, only on screen, one at a time', () => {
  const { shouldReport } = battery;
  assert.equal(shouldReport({ now: NOW }), true, 'no reading yet');
  assert.equal(shouldReport({ now: NOW, mineAt: minutes(14) }), false, 'the server has one from 14 minutes ago');
  assert.equal(shouldReport({ now: NOW, mineAt: minutes(15) }), true);
  assert.equal(shouldReport({ now: NOW, mineAt: minutes(60), lastTriedAt: NOW - 5 * 60000 }), false, 'tried 5 minutes ago (failed or no battery)');
  assert.equal(shouldReport({ now: NOW, mineAt: minutes(60), hidden: true }), false);
  assert.equal(shouldReport({ now: NOW, mineAt: minutes(60), inFlight: true }), false);
});

test('model: level, charging and how long ago; nothing without a reading or after a day', () => {
  const { model } = battery;
  const row = { user_id: 'b', level: 18, charging: false, updated_at: minutes(125) };
  const m = model(row, { now: NOW, partnerName: 'Bea' });
  assert.deepEqual(
    { text: m.text, when: m.when, icon: m.icon, low: m.low, name: m.name },
    { text: '18%', when: '2 ore fa', icon: 'battery-low', low: true, name: 'Bea' }
  );

  const charging = model({ ...row, charging: true, updated_at: minutes(0) }, { now: NOW, partnerName: 'Bea' });
  assert.equal(charging.icon, 'battery-charging');
  assert.equal(charging.low, false, 'charging is never shown as low');
  assert.equal(charging.when, 'proprio ora');

  assert.equal(model({ ...row, level: 60 }, { now: NOW }).icon, 'battery-medium');
  assert.equal(model({ ...row, level: 61 }, { now: NOW }).icon, 'battery-high');
  assert.equal(model({ ...row, updated_at: minutes(1) }, { now: NOW }).when, '1 min fa');
  assert.equal(model({ ...row, updated_at: minutes(60) }, { now: NOW }).when, '1 ora fa');
  assert.equal(model(row, { now: NOW }).name, 'La tua persona');

  assert.equal(model(null, { now: NOW }), null);
  assert.equal(model({ ...row, updated_at: minutes(24 * 60) }, { now: NOW }), null, 'a day old: not shown');
  for (const level of [-1, 101, 18.5, '18', null]) assert.equal(model({ ...row, level }, { now: NOW }), null, String(level));
  assert.equal(model({ ...row, updated_at: 'ieri' }, { now: NOW }), null);
});

test('sheet line: name, level, charging and how long ago, each piece translated', () => {
  const { model, line } = battery;
  const row = { user_id: 'b', level: 18, charging: false, updated_at: minutes(125) };
  assert.equal(line(model(row, { now: NOW, partnerName: 'Bea' })), 'Bea · 18% · 2 ore fa');
  assert.equal(line(model({ ...row, level: 64, charging: true, updated_at: minutes(0) }, { now: NOW, partnerName: 'Bea' })), 'Bea · 64% · in carica · proprio ora');
  const en = { 'in carica': 'charging', '2 ore fa': '2 hours ago' };
  assert.equal(line(model({ ...row, charging: true }, { now: NOW, partnerName: 'Bea' }), (s) => en[s] || s), 'Bea · 18% · charging · 2 hours ago');
  assert.equal(line(null), '');
});

test('device: native first, then the browser; a desktop without a battery says nothing', async () => {
  const { readDevice } = battery;
  assert.deepEqual(await readDevice({ UsPlatform: { readNativeBattery: async () => ({ level: 42, charging: true }) } }), { level: 42, charging: true });
  const web = (b) => ({ UsPlatform: { readNativeBattery: async () => null }, navigator: { getBattery: async () => b } });
  assert.deepEqual(await readDevice(web({ level: 0.184, charging: false, chargingTime: Infinity, dischargingTime: 7200 })), { level: 18, charging: false });
  // Chrome on a desktop without a battery reports "full and charging".
  assert.equal(await readDevice(web({ level: 1, charging: true, chargingTime: 0, dischargingTime: Infinity })), null);
  assert.equal(await readDevice({ navigator: {} }), null, 'no Battery API (iOS, Firefox)');
  assert.equal(await readDevice({ navigator: { getBattery: async () => { throw new Error('denied'); } } }), null);
});

test('wiring: launch and foreground only, own Realtime channel, distance capsule and widget', () => {
  const app = read('app.js');
  const source = read('partner-battery.js');
  const html = read('index.html');
  // Launch (after the couple is known) and return to the foreground; no timer sends.
  assert.match(app, /usRunWhenIdle\(\(\)=>window\.UsPartnerBattery\?\.onForeground\?\.\('launch'\),\d+\);/);
  assert.match(app, /if\(options\.foreground\)usAfterForeground\(\(\)=>window\.UsPartnerBattery\?\.onForeground\?\.\('resume'\),\d+\);/);
  assert.doesNotMatch(source, /setInterval\([^)]*report/);
  // Realtime on its own channel, opened only once the table answered, so a
  // web build that lands before the SQL never breaks the main US channel.
  assert.match(source, /table: 'couple_batteries', filter: `couple_id=eq\.\$\{profile\.couple_id\}`/);
  assert.doesNotMatch(app, /couple_batteries/);
  assert.match(source, /db\.rpc\('report_battery', \{ p_level: reading\.level, p_charging: reading\.charging \}\)/);
  // Oggi: in the distance capsule, after the distance (name for screen readers
  // only, never translated). Noi has no battery row.
  const capsule = html.match(/<button[^>]*id="distanceWidget"[\s\S]*?<\/button>/)[0];
  const slot = capsule.slice(capsule.indexOf('<span class="us-distance-battery"'));
  assert.ok(capsule.indexOf('id="distanceValue"') < capsule.indexOf('id="distanceBattery"'), 'the battery comes after the distance');
  assert.match(slot, /^<span class="us-distance-battery" id="distanceBattery" hidden>/);
  assert.match(slot, /data-battery-name translate="no"/);
  assert.match(slot, /class="us-icon" data-us-icon="battery-high" data-battery-icon aria-hidden="true"/);
  assert.match(slot, /<b data-battery-level><\/b>/);
  assert.doesNotMatch(html, /usPartnerBattery/);
  assert.doesNotMatch(read('noi-v2.css'), /partner-battery/);
  assert.match(read('dc-oggi.css'), /\.og-row \.home-distance-pill \.us-distance-battery\{/);
  // The Distanza sheet: one line under the title (UsUiFoundation.notice note).
  assert.match(app, /note:battery\|\|undefined/);
  assert.match(read('ui-foundation.js'), /if \(options\.note\)/);
  assert.match(read('ui-foundation.css'), /\.us-confirm-sheet \.us-confirm-note\{/);
  assert.match(html, /<script defer src="\/partner-battery\.js\?v=[^"]+"><\/script>/);
  for (const list of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(list), /'partner-battery\.js',/, list);
  assert.match(read('service-worker.js'), /versioned\("\/partner-battery\.js"\)/);
  // Widget "Noi": the reading travels in the snapshot, validated on both sides.
  const widgets = read('widgets.js');
  assert.match(widgets, /window\.UsPartnerBattery\?\.widgetState\?\.\(\)/);
  assert.match(widgets, /window\.addEventListener\('us:partner-battery-changed'/);
  assert.match(read('platform.js'), /batteryLevel: level, batteryCharging: couple\.batteryCharging === true, batteryAt: at/);
  assert.match(read('platform.js'), /plugin\.getBatteryStatus\(\)/);
});

// The page side, in a small fake page: the battery shows only beside a real
// distance (ready or last known), and the capsule's description follows it.
function page({ distanceState = 'ready' } = {}) {
  const events = new Map();
  const el = (extra = {}) => ({ hidden: true, dataset: {}, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, ...extra });
  const parts = { name: el(), icon: el({ dataset: { usIcon: 'battery-high' } }), level: el(), charging: el() };
  const slot = el({ querySelector: (q) => ({ '[data-battery-name]': parts.name, '[data-battery-icon]': parts.icon, '[data-battery-level]': parts.level, '[data-battery-charging]': parts.charging })[q] });
  const pill = el({ hidden: false, dataset: { usDistanceState: distanceState } });
  const window = {
    usProfile: { id: 'f', couple_id: 'c' },
    UsIdentity: { current: () => ({ partnerName: 'Bea' }) },
    usT: (s) => s,
    document: { hidden: false, getElementById: (id) => ({ distanceWidget: pill, distanceBattery: slot })[id] || null },
    addEventListener: (name, fn) => events.set(name, fn),
    dispatchEvent: () => true
  };
  const sandbox = { window, Event: class { constructor(type) { this.type = type; } }, setInterval: () => 1, console, Date, Number, Math, String, Set, Promise, Array };
  vm.runInNewContext(read('partner-battery.js'), sandbox);
  return { api: window.UsPartnerBattery, pill, slot, parts, fire: (name) => events.get(name)?.({}) };
}

test('capsule: the partner battery beside a distance, nothing without one', () => {
  const p = page();
  assert.equal(p.slot.hidden, true, 'no reading yet');
  p.api.onRealtime({ eventType: 'UPDATE', new: { user_id: 'b', level: 18, charging: false, updated_at: new Date(Date.now() - 125 * 60000).toISOString() } });
  assert.equal(p.slot.hidden, false);
  assert.equal(p.parts.level.textContent, '18%');
  assert.equal(p.parts.name.textContent, 'Bea');
  assert.equal(p.parts.icon.dataset.usIcon, 'battery-low');
  assert.equal(p.slot.dataset.low, 'true');
  assert.equal(p.parts.charging.hidden, true);
  assert.equal(p.pill.attrs['aria-describedby'], 'distanceBattery');
  assert.equal(p.api.sheetLine(), 'Bea · 18% · 2 ore fa');

  // The capsule turns into "In attesa" / "Attiva posizione": the battery steps out.
  p.pill.dataset.usDistanceState = 'waiting';
  p.fire('us:distance-changed');
  assert.equal(p.slot.hidden, true);
  assert.equal(p.pill.attrs['aria-describedby'], undefined);
  p.pill.dataset.usDistanceState = 'stale';
  p.fire('us:distance-changed');
  assert.equal(p.slot.hidden, false, 'a last known distance keeps it');
  p.pill.hidden = true;
  p.fire('us:distance-changed');
  assert.equal(p.slot.hidden, true, 'no capsule, no battery');

  const old = page();
  old.api.onRealtime({ eventType: 'UPDATE', new: { user_id: 'b', level: 64, charging: true, updated_at: new Date(Date.now() - 25 * 3600000).toISOString() } });
  assert.equal(old.slot.hidden, true, 'a day old: not shown');
  assert.equal(old.api.sheetLine(), '');
});

test('English: every new text has a translation', () => {
  const en = read('i18n-en.js');
  // The battery is read from its pieces (each translated on its own), not from one long label.
  for (const key of ["'Batteria:'", "'in carica'"]) {
    assert.ok(en.includes(key), key);
  }
});
