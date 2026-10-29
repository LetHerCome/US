// Premi Sintonia V2, Fase 2 (founder, 29/10/2026): the companions wear an
// accessory chosen on this phone. One approved picture per accessory, placed
// per companion and pose; neck pieces hide when the companion lies down.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const ACCESSORIES = ['scarf', 'gala', 'flowers', 'crown'];

test('the pictures are the approved ones, light, and fetched only when worn', () => {
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  for (const acc of ACCESSORIES) {
    const file = `assets/derived/rewards/us-acc-${acc}-v1.webp`;
    const entry = manifest.assets.find((a) => a.path === file);
    assert.equal(entry?.status, 'APPROVED', file);
    assert.equal(entry.source, `assets/source/rewards/us-acc-${acc}-v1.png`);
    assert.ok(fs.statSync(path.join(ROOT, file)).size < 40 * 1024, `${file} stays light`);
  }
  assert.doesNotMatch(read('pet.css'), /us-acc-[a-z]+-v1\.webp/, 'never a first-paint stylesheet asset');
  assert.match(read('pet.js'), /layer\.style\.setProperty\('--acc-img','url\("\/assets\/derived\/rewards\/us-acc-'\+appearance\.accessory\+'-v1\.webp"\)'\)/);
});

test('every pose carries the accessory, so it moves with the companion', () => {
  const pet = read('pet.js');
  assert.match(pet, /const acc=pose=>'<span class="us-pet-acc-pose us-pet-acc-'\+pose\+'" aria-hidden="true"><i class="us-pet-acc"><\/i><\/span>';/);
  assert.match(pet, /blink\+acc\('awake'\)\+'<\/span>'/, 'inside the awake pose: it breathes and tilts with it');
  assert.match(pet, /img\('us-pet-pose us-pet-pose-sleep','sleep'\)\+acc\('sleep'\)\+img\('us-pet-pose us-pet-pose-happy','happy'\)\+acc\('happy'\)/);
});

test('each companion has a place for head and neck pieces in each pose; lying down hides the neck', () => {
  const css = read('pet.css');
  for (const acc of ACCESSORIES) assert.match(css, new RegExp(`\\.us-pet-layer\\[data-pet-accessory="${acc}"\\] \\.us-pet-acc\\{--acc-w:[^}]+;--acc-ratio:\\d+/\\d+\\}`), acc);
  assert.match(css, /\.us-pet-maudit \.us-pet-acc-pose\{--hx:[^}]*--nx:/, 'Maudit sleeps sitting up: one place for every pose');
  for (const pet of ['goat', 'owl', 'dragon']) {
    for (const pose of ['awake', 'happy']) assert.match(css, new RegExp(`\\.us-pet-${pet} \\.us-pet-acc-${pose}\\{--hx:[^}]*--nx:[^}]*--ny:[^}]*--nw:`), `${pet} ${pose}`);
    assert.match(css, new RegExp(`\\.us-pet-${pet} \\.us-pet-acc-sleep\\{[^}]*--nshow:none\\}`), `${pet} lying down`);
  }
  assert.match(css, /\.us-pet-layer\[data-pet-state="sleep"\] :is\(\.us-pet-pose-sleep,\.us-pet-acc-sleep\)\{transform-origin:50% 100%;animation:us-pet-breathe/);
});

test('in the collection: a group of its own, chosen on this phone, Niente by default', () => {
  const p = read('progression.js');
  assert.match(p, /pet_accessory: \{ pref: 'pet_accessory', label: 'Accessori', place: 'sul vostro Compagno'/);
  assert.match(p, /pet_accessory: \{ id: 'none', title: 'Niente', description: 'Il vostro Compagno com’è\.' \}/);
  assert.match(p, /'ti_penso', 'pet_accessory', 'countdown', 'companion'/);
  assert.match(p, /const accessory = value\('pet_accessory'\);/);
  assert.match(p, /window\.USPet\?\.setAppearance\?\.\(\{ accessory: accessory \|\| '' \}\);/);
});
