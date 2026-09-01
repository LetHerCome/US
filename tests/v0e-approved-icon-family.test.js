const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const CUSTOM_ICONS = {
  moments: 'assets/source/ui/us-icon-moments-v1.png',
  bond: 'assets/source/ui/us-icon-bond-v1.png',
  settings: 'assets/source/ui/us-icon-settings-v1.png',
  'daily-question': 'assets/source/ui/us-icon-daily-question-v1.png',
  stories: 'assets/source/ui/us-icon-stories-v1.png'
};

test('V0E usa direttamente i sei master custom approvati nelle rispettive superfici', () => {
  const html = read('index.html');
  const stories = read('stories.js');
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));

  Object.entries(CUSTOM_ICONS).forEach(([id, asset]) => {
    const record = manifest.assets.find((entry) => entry.path === asset);
    assert.equal(record?.status, 'APPROVED', `${id} deve restare approvato`);
    assert.equal(record?.immutable, true, `${id} deve restare immutabile`);
  });

  ['moments', 'bond', 'settings'].forEach((id) => {
    const asset = CUSTOM_ICONS[id].replaceAll('/', '\\/');
    assert.match(html, new RegExp(`us-nav-icon--${id}[\\s\\S]{0,320}${asset}`));
  });
  assert.match(html, /id="todayOrb"[\s\S]{0,340}assets\/source\/ui\/us-icon-daily-question-v1\.png/);
  assert.doesNotMatch(html.match(/<button[^>]+id="thinkButton"[\s\S]*?<\/button>/)?.[0] || '', /us-icon-ti-penso-v1\.png/);
  assert.match(stories, /id="usStoryAdd"[\s\S]{0,340}assets\/source\/ui\/us-icon-stories-v1\.png/);
});

test('V0E conserva i master senza stretching o decorazioni CSS duplicate e li precarica', () => {
  const css = read('identity.css');
  const worker = read('service-worker.js');

  assert.match(css, /\.us-approved-custom-icon\{[\s\S]*object-fit:contain/);
  assert.match(css, /\.us-approved-custom-icon\{[\s\S]*background:transparent/);
  assert.match(css, /\.us-approved-custom-icon\{[\s\S]*box-shadow:none/);
  Object.values(CUSTOM_ICONS).forEach((asset) => {
    assert.match(worker, new RegExp(`"\\/${asset.replaceAll('/', '\\/').replaceAll('.', '\\.') }"`));
  });
});
