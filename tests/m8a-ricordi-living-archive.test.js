// M8A — Ricordi living archive. Pure resurfacing/timeline/chapter logic is
// executed for real (vm), the page/detail structure is asserted on source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = () => read('app.js');
const archiveBlock = () => app().match(/\/\/ ===== M8A — Ricordi living archive =====[\s\S]*?(?=async function hydrateMomentsCore\(\))/)?.[0] || '';

function loadArchive() {
  const window = {};
  const context = { window, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null }, escapeHtml: (s) => String(s), go() {}, openMomentViewer() {}, console };
  vm.createContext(context);
  vm.runInContext(archiveBlock(), context);
  return window.UsRicordiArchive;
}
const m = (id, date, extra = {}) => ({ id, moment_date: date, created_at: `${date}T10:00:00Z`, storage_path: `p/${id}`, created_by: 'u', ...extra });

test('M8A Rivivi: an anniversary within ±3 days of a past year wins, closest first', () => {
  const api = loadArchive();
  const pick = api.pickRivivi([m('a', '2026-09-20'), m('b', '2025-10-01'), m('c', '2024-09-29'), m('d', '2025-06-01')], '2026-09-29');
  assert.equal(pick.row.id, 'c');
  assert.equal(pick.reason, 'anniversary');
  assert.equal(pick.label, '2 anni fa, in questi giorni');
});

test('M8A Rivivi: otherwise a real memory at least 30 days old, stable for the day; never a recent one, never filler', () => {
  const api = loadArchive();
  const rows = [m('recent', '2026-09-20'), m('old1', '2026-06-01'), m('old2', '2026-03-10')];
  const a = api.pickRivivi(rows, '2026-09-29');
  const b = api.pickRivivi(rows, '2026-09-29');
  assert.equal(a.row.id, b.row.id);
  assert.notEqual(a.row.id, 'recent');
  assert.equal(a.reason, 'resurface');
  assert.match(a.label, /mesi fa|mese fa/);
  assert.equal(api.pickRivivi([m('recent', '2026-09-20')], '2026-09-29'), null);
  assert.equal(api.pickRivivi([], '2026-09-29'), null);
});

test('M8A storia: moments and lived Da vivere experiences merge chronologically with their provenance', () => {
  const api = loadArchive();
  const t = api.timeline([m('m1', '2026-09-27'), m('m2', '2026-08-02')], [{ id: 'x', title: 'Mostra', completed_at: '2026-09-10T18:00:00' }]);
  assert.deepEqual([...t].map((i) => `${i.kind}:${i.row.id}`), ['moment:m1', 'experience:x', 'moment:m2']);
  assert.deepEqual({ ...api.periodLabel('2026-08-02') }, { month: 'Agosto', year: '2026' });
});

test('M8A capitoli: secondary collections by year, with real counts and the newest photo as cover', () => {
  const api = loadArchive();
  const t = api.timeline([m('m1', '2026-09-27'), m('m2', '2026-01-02'), m('m3', '2024-10-02')], [{ id: 'x', title: 'Mostra', completed_at: '2026-09-10T18:00:00' }]);
  const ch = [...api.chapters(t)].map((c) => ({ year: c.year, moments: c.moments, experiences: c.experiences, cover: c.cover?.id }));
  assert.deepEqual(ch, [{ year: '2026', moments: 2, experiences: 1, cover: 'm1' }, { year: '2024', moments: 1, experiences: 0, cover: 'm3' }]);
});

test('M8A page: Rivivi, Conservati, La vostra storia, Capitoli in this order inside Ricordi', () => {
  const page = read('index.html').match(/<main id="moments" class="page">[\s\S]*?<\/main>/)?.[0] || '';
  const order = ['id="ricordiRivivi"', 'id="conservatiEntry"', 'Mese per mese', 'id="momentsGrid"', 'id="ricordiChapters"'].map((s) => page.indexOf(s));
  assert.ok(order.every((i) => i >= 0), 'all four surfaces exist');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('M8A data: reads only existing domains (moments, profiles, lived bucket_items) and writes nothing new', () => {
  const src = app().match(/async function hydrateMomentsCore\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  const tables = [...src.matchAll(/sb\.from\('([a-z_]+)'\)/g)].map((x) => x[1]).sort();
  assert.deepEqual(tables, ['bucket_items', 'moments', 'profiles']);
  assert.match(src, /from\('bucket_items'\)\.select\('id,title,completed_at'\)\.eq\('couple_id',profile\.couple_id\)\.eq\('status','lived'\)/);
  assert.doesNotMatch(src + archiveBlock(), /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.match(src, /if\(window\.usProfile!==profile\)return;/, 'identity switch mid-load never paints the old couple');
});

test('M8A visual: no dominant beige paper in the story or the Moment detail, plum glass instead', () => {
  const css = read('moments-albums.css').split('M8A · Ricordi living archive')[1] || '';
  assert.notEqual(css, '');
  assert.match(css, /#moments \.ricordi-story \.moment-card\.moment-postit\{[^}]*background-color:rgba\(24,18,32,\.88\)!important/);
  assert.match(css, /#usAlbumOverlay \.us-album-photo-card\{[^}]*background-color:rgba\(24,18,32,\.9\)!important/);
  assert.match(css, /#usAlbumOverlay \.us-album-caption-postit\{display:none!important\}/);
  assert.doesNotMatch(css, /#e9e2d5|#eee9dc|#f1eee8|--us-paper/);
});

test('M8A Moment detail: long date, title, real authors and provenance; existing actions preserved', () => {
  const albums = read('moments-albums.js');
  for (const id of ['usAlbumProvenance', 'usAlbumTitle', 'usAlbumByline', 'usAlbumAddBtn', 'usAlbumLightbox']) assert.match(albums, new RegExp(`id="${id}"`));
  assert.match(albums, /provenance\.textContent=`Moment · \$\{longDate\}`/);
  assert.match(albums, /Aggiunto da \$\{currentAlbum\.author\}\$\{others\.length\?` · con foto di/);
});

test('M8A icon authority: the lived experience mark is the approved Phosphor heart, never a text glyph', () => {
  const card = archiveBlock().match(/function ricordiExperienceCard\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(card, /<span class="ricordi-experience-mark" aria-hidden="true"><\/span>/);
  assert.doesNotMatch(card, /[✓✔☑]/);
  assert.match(read('moments-albums.css'), /#moments \.ricordi-experience-mark::before\{[^}]*mask:url\("\/assets\/icons\/phosphor\/heart-straight-regular\.svg"\)/);
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/phosphor/heart-straight-regular.svg')));
});
