// «Il vostro cielo» (Premi Sintonia V2, livello 20): the stars above the
// couple's city at 22:00 of «Insieme dal», from the Yale Bright Star
// Catalogue. The astronomy is checked against facts that do not depend on
// the code: Polaris stands at the latitude, Sirius is a winter star.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKY = require('../sky.js');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets/data/stars-bsc5-v1.json'), 'utf8'));
const ROMA = SKY.cityById('roma');
const POLARIS = [37.955, 89.264, 2.02, 0.6];
const SIRIUS = DATA.stars[0];

test('the catalogue: the brightest stars of the Yale Bright Star Catalogue, with their source', () => {
  assert.match(DATA.source, /Yale Bright Star Catalogue.*V\/50/);
  assert.deepEqual(DATA.fields, ['ra_deg', 'dec_deg', 'vmag', 'b_v']);
  assert.ok(DATA.stars.length > 800 && DATA.stars.length < 1000);
  assert.ok(Math.abs(SIRIUS[0] - 101.29) < 0.05 && Math.abs(SIRIUS[1] + 16.72) < 0.05, 'Sirius first');
  assert.ok(DATA.stars.every(([ra, dec, v]) => ra >= 0 && ra < 360 && dec >= -90 && dec <= 90 && v <= 4.5));
});

test('the moment: 22:00 in Rome on that day, summer time included', () => {
  assert.equal(SKY.eveningUtc('2024-01-15').toISOString(), '2024-01-15T21:00:00.000Z');
  assert.equal(SKY.eveningUtc('2024-07-15').toISOString(), '2024-07-15T20:00:00.000Z');
  assert.equal(SKY.eveningUtc('nope'), null);
});

test('sidereal time at the J2000 epoch is the textbook 280.46°', () => {
  assert.ok(Math.abs(SKY.gmstDegrees(Date.UTC(2000, 0, 1, 12)) - 280.4606) < 0.01);
});

test('Polaris stands at the latitude; Sirius is up on winter evenings and down on summer ones', () => {
  const at = SKY.eveningUtc('2024-01-15');
  const polaris = SKY.horizontal(POLARIS, at, ROMA);
  assert.ok(Math.abs(polaris.alt - ROMA.lat) < 1.2, `Polaris ${polaris.alt}`);
  const winter = SKY.horizontal(SIRIUS, at, ROMA);
  assert.ok(winter.alt > 15 && winter.alt < 35 && winter.az > 120 && winter.az < 200, `Sirius in January ${JSON.stringify(winter)}`);
  assert.ok(SKY.horizontal(SIRIUS, SKY.eveningUtc('2024-07-15'), ROMA).alt < 0, 'Sirius in July is below the horizon');
});

test('the map: only stars above the horizon, brighter means bigger, one more golden star per level after 20', () => {
  const map = SKY.skySvg({ stars: DATA.stars, day: '2024-01-15', city: ROMA, level: 23 });
  assert.match(map, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1000 1000"/);
  const visible = DATA.stars.filter((s) => SKY.horizontal(s, SKY.eveningUtc('2024-01-15'), ROMA).alt > 0).length;
  assert.equal((map.match(/<circle class="s"/g) || []).length, visible);
  assert.ok(visible > 300 && visible < 600, `${visible} stars up`);
  assert.equal((map.match(/class="ours"/g) || []).length, 3, 'levels 21, 22 and 23');
  assert.equal((SKY.skySvg({ stars: DATA.stars, day: '2024-01-15', city: ROMA, level: 20 }).match(/class="ours"/g) || []).length, 0);
  assert.equal(SKY.skySvg({ stars: DATA.stars, day: '2024-01-15', city: ROMA, level: 23 }), map, 'the same evening, the same sky');
  assert.ok(SKY.starRadius(-1.46) > SKY.starRadius(1) && SKY.starRadius(1) > SKY.starRadius(4.5));
});

test('on Oggi the stars lie over the photo: no night disc, no N E S O, a portrait frame covered edge to edge', () => {
  const over = SKY.skySvg({ stars: DATA.stars, day: '2024-01-15', city: ROMA, level: 22, overlay: true });
  assert.match(over, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 600 1300" preserveAspectRatio="xMidYMid slice">/);
  assert.doesNotMatch(over, /fill="url\(#n\)"|<text /, 'nothing that hides the photo');
  assert.ok((over.match(/<circle class="s"/g) || []).length > 80, 'the stars of the upper sky');
  assert.equal((over.match(/class="ours"/g) || []).length, 2);
  const css = fs.readFileSync(path.join(__dirname, '..', 'oggi-look.css'), 'utf8');
  assert.match(css, /--oggi-deco:var\(--oggi-sky-map,linear-gradient\(transparent,transparent\)\) center\/cover no-repeat;/);
});

test('the cities: Italian, on the Rome clock, each with its place', () => {
  assert.ok(SKY.CITIES.length >= 30);
  for (const c of SKY.CITIES) {
    assert.match(c.id, /^[a-z_]{2,40}$/);
    assert.ok(c.lat > 35 && c.lat < 47.5 && c.lon > 6 && c.lon < 19, c.id);
  }
  assert.equal(SKY.cityById('milano').name, 'Milano');
  assert.equal(SKY.cityById('atlantide'), null);
});

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('in the app: a theme of Oggi, drawn from «Insieme dal», the city and the level', () => {
  const look = read('oggi-look.js');
  assert.match(look, /\{ id: 'sky', name: 'Il vostro cielo', kicker: 'Leggenda', note: '[^']+', reward: 'sky_ours', level: 20 \}/);
  assert.match(read('sky.js'), /fetch\('\/assets\/data\/stars-bsc5-v1\.json'\)/, 'the catalogue is fetched by sky.js, never by oggi-look.js');
  assert.match(look, /window\.UsSky\.skySvg\(\{ stars, day, city, level, overlay: true \}\)/, 'over the photo, never a disc that hides it');
  assert.match(look, /root\.style\.setProperty\('--oggi-sky-map', map\)/);
  assert.match(read('app.js'), /sb\.from\('couples'\)\.select\('id,name,started_on,sky_city'\)/);
  const css = read('oggi-look.css');
  assert.ok(css.includes('html[data-us-oggi-theme="sky"],\n.us-look-phone[data-oggi-theme="sky"]{'));
  assert.match(css, /--oggi-deco:var\(--oggi-sky-map,linear-gradient\(transparent,transparent\)\)/);
});

test('the city is asked when the sky is first used, and the picture can be saved', () => {
  const look = read('oggi-look.js');
  assert.match(look, /Dove eravate quella sera\?/);
  assert.match(read('sky.js'), /sb\.rpc\('set_sky_city', \{ p_city: id \}\)/);
  assert.match(look, /Salva l’immagine/);
  assert.match(read('sky.js'), /canvas\.toBlob\(/);
});

test('published with the app: sky.js before oggi-look.js, and the star data', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('/sky.js?v=') > 0 && html.indexOf('/sky.js?v=') < html.indexOf('/oggi-look.js?v='));
  for (const list of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) {
    assert.match(read(list), /'sky\.js',/, list);
    assert.match(read(list), /'assets\/data\/stars-bsc5-v1\.json',/, list);
  }
  assert.match(read('service-worker.js'), /versioned\("\/sky\.js"\)/);
});
