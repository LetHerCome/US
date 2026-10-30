// Premi Sintonia V2, Fase 2 (founder, 29/10/2026): the companions wear an
// accessory chosen on this phone. Stickers placed on top looked «messi
// malissimo»: each accessory is now drawn on each companion (the founder's
// ChatGPT sheets), cut into the approved frames. Maudit and the dragon get the
// boys' versions (blue scarf, laurel instead of flowers, bow tie instead of
// pearls). The moving parts (ears, wings, tail) stay the approved ones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const PET = require('../pet.js');
const WORN = ['scarf', 'gala', 'flowers', 'crown'];
const POSES = ['awake', 'body', 'sleep', 'happy'];

test('every companion has every drawn accessory in every pose, light and approved', () => {
  assert.deepEqual([...PET.WORN], WORN);
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const boys = ['maudit', 'dragon'];
  for (const id of PET.COMPANION_IDS) for (const acc of WORN) for (const pose of POSES) {
    const rel = `assets/derived/pet/us-pet-${id}-${acc}-${pose}-v1.webp`;
    const file = path.join(ROOT, rel);
    assert.ok(fs.existsSync(file), `${id} ${acc} ${pose}`);
    assert.ok(fs.statSync(file).size < 24 * 1024, `${id} ${acc} ${pose} stays light`);
    const entry = manifest.assets.find((a) => a.path === rel);
    assert.equal(entry?.status, 'APPROVED', rel);
    // Maudit and the dragon wear the laurel where the goat and the owl wear flowers.
    const sheet = acc === 'flowers' && boys.includes(id) ? 'laurel' : acc;
    assert.equal(entry.source, `assets/source/pet/us-pet-worn-${sheet}-sheet-v1.png`, rel);
  }
});

test('the accessory swaps the pictures of the poses, never the moving parts', () => {
  assert.equal(PET.wornArt('goat', 'scarf'), '/assets/derived/pet/us-pet-goat-scarf-awake-v1.webp');
  assert.equal(PET.wornArt('maudit', ''), '/assets/derived/pet/us-pet-maudit-awake-v2.webp');
  assert.equal(PET.wornArt('atlantide', 'gala'), '/assets/derived/pet/us-pet-maudit-gala-awake-v1.webp', 'unknown companion: Maudit');
  const pet = read('pet.js');
  assert.match(pet, /const WORN_POSES=Object\.freeze\(\['awake','body','sleep','happy'\]\);/);
  assert.match(pet, /WORN\.includes\(worn\)&&WORN_POSES\.includes\(name\)\?worn\+'-'\+name\+'-v1':name\+'-'\+COMPANIONS\[id\]\.v/);
  assert.match(pet, /worn=want;figure\.innerHTML=companionMarkup\(id,worn\);/, 'the figure stays, so the dragon keeps flying');
  // A crown stands above the frame: worn pictures are 24 px taller and grow upwards.
  assert.match(pet, /\(WORN\.includes\(worn\)&&WORN_POSES\.includes\(name\)\?' us-pet-worn':''\)/);
  assert.match(read('pet.css'), /\.us-pet-rig img\.us-pet-worn\{top:auto;bottom:0;height:112\.5%\}/);
  assert.doesNotMatch(pet, /us-pet-acc-pose|--acc-img/, 'no sticker on top any more');
  assert.doesNotMatch(read('pet.css'), /us-pet-acc|us-acc-[a-z]+-v1\.webp/);
});

test('in the collection: a group of its own, chosen on this phone, Niente by default', () => {
  const p = read('progression.js');
  assert.match(p, /pet_accessory: \{ pref: 'pet_accessory', label: 'Accessori', place: 'sul vostro Compagno'/);
  assert.match(p, /pet_accessory: \{ id: 'none', title: 'Niente', description: 'Il vostro Compagno com’è\.' \}/);
  assert.match(p, /'ti_penso', 'pet_accessory', 'app_icon', 'countdown', 'companion'/);
  assert.match(p, /const accessory = value\('pet_accessory'\);/);
  assert.match(p, /window\.USPet\?\.setAppearance\?\.\(\{ accessory: accessory \|\| '' \}\);/);
  assert.match(p, /if \(id === 'none' \|\| pet\?\.WORN\?\.includes\(id\)\) return pet\?\.wornArt\?\.\(who, id === 'none' \? '' : id\)/, 'the tile shows this phone\'s companion wearing it');
});
