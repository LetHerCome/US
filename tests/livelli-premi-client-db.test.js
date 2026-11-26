// Reward levels on the client = the server catalog (14/11/2026). The server
// (progression_reward_catalog) is the authority on when a reward unlocks; the
// client keeps a copy of the level for the locked tiles («Livello N», «Si
// sblocca al livello N di Sintonia»). Orbita and Cromo said 9 and 12 while the
// server unlocked them at 8 and 10, so the tile and «Prossimo sblocco» spoke
// of different levels. Here every client look with a reward is checked against
// the catalog the whole migration chain builds (PGlite).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Countdown = require('../countdown.js');
const { database } = require('./helpers/mc2-db');

// oggi-look.js is a browser IIFE: run it with just enough of a page to reach
// its export, without booting it (the page is still "loading").
function oggiLook() {
  const document = { readyState: 'loading', addEventListener() {}, getElementById: () => null };
  const context = vm.createContext({ document });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'oggi-look.js'), 'utf8'), context, { filename: 'oggi-look.js' });
  return context.window.USOggiLook;
}

test('every countdown style, Oggi theme and Oggi effect with a reward says the level of the server catalog', async () => {
  const look = oggiLook();
  const client = [
    ...Countdown.STYLES.map((s) => ['countdown.js', s]),
    ...look.THEMES.map((t) => ['oggi-look.js', t]),
    ...look.EFFECTS.map((e) => ['oggi-look.js', e]),
  ].filter(([, item]) => item.reward);
  // Today: Aurora, Orbita, Cromo; Cinema, Chiaro di luna, Il vostro cielo, Stagioni;
  // Petali, Lucciole, Luci sfocate, Neve, Aurora. A new one is checked too.
  assert.ok(client.length >= 12, `only ${client.length} looks with a reward`);

  const db = await database({ seed: false });
  try {
    const { rows } = await db.query('select id, level_required, active from public.progression_reward_catalog');
    const server = new Map(rows.map((r) => [r.id, r]));
    for (const [file, item] of client) {
      const row = server.get(item.reward);
      assert.ok(row, `${file} ${item.id}: ${item.reward} is not in the catalog`);
      assert.equal(row.active, true, `${file} ${item.id}: ${item.reward} is not active`);
      assert.equal(item.level, row.level_required, `${file} ${item.id}: client level ${item.level}, server level ${row.level_required}`);
    }
  } finally {
    await db.close();
  }
});

// Temi e countdown (26/11/2026): Post-it 3, Biglietto 9, Filo rosso 18 on the old ids.
test('Post-it unlocks at 3, Biglietto at 9 and Filo rosso at 18, as on the server', () => {
  const level = (id) => Countdown.STYLES.find((s) => s.id === id).level;
  assert.equal(level('aurora'), 3);
  assert.equal(level('orbit'), 9);
  assert.equal(level('chrome'), 18);
});
