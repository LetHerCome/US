// Batteria del partner (founder, grill del 31/10/2026): the client side.
// The phone reports only while US is open (launch, foreground), at most every
// 15 minutes; Noi shows the partner's last reading with how long ago; the
// Android widget "Noi" gets the same reading. No background work, no push.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('wiring: launch and foreground only, own Realtime channel, Noi row and widget', () => {
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
  // Noi: a discreet row with the partner's name (never translated), icon, level and age.
  const row = html.slice(html.indexOf('id="usPartnerBattery"') - 80, html.indexOf('id="usPartnerBattery"') + 900);
  assert.match(row, /hidden/);
  assert.match(row, /data-battery-name translate="no"/);
  assert.match(row, /class="us-icon" data-us-icon="battery-high" data-battery-icon aria-hidden="true"/);
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

test('English: every new text has a translation', () => {
  const en = read('i18n-en.js');
  // The row is read from its pieces (each translated on its own), not from one long label.
  for (const key of ["'Batteria:'", "'in carica'"]) {
    assert.ok(en.includes(key), key);
  }
});
