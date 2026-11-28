// Redesign definitivo (founder 23/11/2026, D5: «Compagni in pensione per
// tutti»; «togliere le mascotte»): nobody sits above the bar any more. The
// client of the companions is gone; the server (get_companions_v1) and the
// approved pictures stay, as data and as assets.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

test('the companions leave the shell: no files, no tags, no builds, no precache', () => {
  for (const file of ['pet.js', 'companions.js', 'pet.css', 'companions.css']) {
    assert.equal(exists(file), false, `${file} is gone`);
    assert.doesNotMatch(read('index.html'), new RegExp(`/${file.replace('.', '\\.')}\\?v=`), `${file} is not loaded`);
    for (const build of ['scripts/build-capacitor-web.mjs', 'scripts/build-cloudflare-pages.mjs']) assert.doesNotMatch(read(build), new RegExp(`'${file.replace('.', '\\.')}'`), `${build}: ${file}`);
    assert.doesNotMatch(read('service-worker.js'), new RegExp(`"/${file.replace('.', '\\.')}"`), `precache: ${file}`);
  }
});

test('nothing calls them any more, and Impostazioni has no Compagni switch', () => {
  for (const file of ['app.js', 'settings.js', 'progression.js', 'due-colori.js', 'cosa-di-oggi.js', 'ui-foundation.js']) {
    assert.doesNotMatch(read(file), /window\.USPet|w\.USPet|UsCompanions\?\.(?:reset|todayPriority|open|choose)/, file);
  }
  assert.doesNotMatch(read('index.html'), /data-us-setting="maudit"|id="usMauditSetting"|id="usPetLayer"/);
  assert.doesNotMatch(read('settings.js'), /syncMauditSetting|toggleMaudit|us:maudit:v1:enabled/);
  // The arrival «È arrivato Maudit» no longer reaches Oggi.
  assert.doesNotMatch(read('app.js'), /oggiPetHop|action==='companion'/);
});

test('the accessories of the companions are retired: kept readable, never offered', () => {
  assert.match(read('progression.js'), /pet_accessory: \{ pref: 'pet_accessory', retired: true, label: 'Accessori'/);
});

test('the server and the approved pictures stay', () => {
  assert.ok(fs.readdirSync(path.join(ROOT, 'supabase/migrations')).some((f) => /companions/.test(f)) || fs.readdirSync(path.join(ROOT, 'supabase/migrations_history')).some((f) => /companions/.test(f)), 'get_companions_v1 is still in the migrations');
  assert.ok(exists('assets/derived/pet/us-pet-maudit-awake-v2.webp'), 'the approved pictures stay in the repository');
});
