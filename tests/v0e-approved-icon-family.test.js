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

  assert.match(html, /us-nav-icon--moments[\s\S]{0,320}phosphor\/images-(?:regular|fill)\.svg/);
  assert.match(html, /us-nav-icon--bond[\s\S]{0,320}phosphor\/heart-straight-(?:regular|fill)\.svg/);
  // M10.1B: il controllo top-left "Oggi / Domanda" è rimosso; la domanda vive nella card di Oggi.
  assert.doesNotMatch(html, /id="todayOrb"/);
  assert.match(html, /id="usDailyRitual"/);
  assert.doesNotMatch(html.match(/<button[^>]+id="thinkButton"[\s\S]*?<\/button>/)?.[0] || '', /us-icon-ti-penso-v1\.png/);
  assert.match(stories, /id="usStoryAdd"[\s\S]{0,340}assets\/derived\/runtime\/us-icon-stories-128-v1\.png/);
});

test('V0E conserva i master senza stretching o decorazioni CSS duplicate; il runtime precarica solo i derivati dimensionati', () => {
  const css = read('identity.css');
  const worker = read('service-worker.js');
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));

  assert.match(css, /\.us-approved-custom-icon\{[\s\S]*object-fit:contain/);
  assert.match(css, /\.us-approved-custom-icon\{[\s\S]*background:transparent/);
  assert.match(css, /\.us-approved-custom-icon\{[\s\S]*box-shadow:none/);

  // Perf 1.0: the masters (1.3-1.8 MB each) are never loaded or precached by the shell.
  // Settings and Stories are shown at icon size, through their 128 px derivatives.
  for (const [id, runtime] of [['settings', 'assets/derived/runtime/us-icon-settings-128-v1.png'], ['stories', 'assets/derived/runtime/us-icon-stories-128-v1.png']]) {
    const derived = manifest.assets.find((entry) => entry.path === runtime);
    assert.equal(derived?.status, 'APPROVED', runtime);
    assert.equal(derived?.source, CUSTOM_ICONS[id], 'derived from the approved master, which stays untouched');
    assert.ok(worker.includes(`"/${runtime}"`), `${runtime} is precached`);
  }
  assert.match(read('index.html'), /us-approved-custom-icon" src="\/assets\/derived\/runtime\/us-icon-settings-128-v1\.png"/);
  for (const file of ['index.html', 'stories.js', 'identity.css', 'stories.css']) {
    assert.doesNotMatch(read(file), /us-icon-(settings|stories)-v1\.png/, `${file} loads no master`);
  }
  Object.values(CUSTOM_ICONS).forEach((asset) => {
    assert.ok(!worker.includes(`"/${asset}"`), `${asset}: the master is not part of the shell precache`);
    assert.ok(fs.existsSync(path.join(ROOT, asset)), `${asset}: the master stays in the repository`);
  });
  assert.match(worker, /"\/assets\/icons\/phosphor\/calendar-dots-regular\.svg"/);
});
