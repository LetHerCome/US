const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const settings = read('settings.js');
const html = read('index.html');
const migration = [
  read('supabase/migrations/20261007160733_ricordi_thumbnails_v1_column.sql'),
  read('supabase/migrations/20261007160744_ricordi_thumbnails_v1_rpc.sql')
].join('\n');
const deleteMoment = read('supabase/functions/delete-moment/index.ts');

test('Ricordi thumbnails keep the original and add one optional derivative path', () => {
  assert.match(migration, /add column if not exists thumbnail_path text/);
  assert.match(app, /compressImageFile\(file,\{maxDimension:1920,quality:\.82\}\)/);
  assert.match(app, /compressImageFile\(file,\{maxDimension:720,quality:\.72\}\)/);
  assert.match(app, /storage_path:path,\s*thumbnail_path:uploadedThumbnail\?thumbnailPath:null/);
  assert.match(app, /derived-thumbnails/);
});

test('same-couple thumbnail RPC is narrow and caller-owned', () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /uid uuid := auth\.uid\(\)/);
  assert.match(migration, /cid uuid := private\.current_couple_id\(\)/);
  assert.match(migration, /target_thumbnail_path not like cid::text \|\| '\/' \|\| uid::text \|\| '\/derived-thumbnails\/%'/);
  assert.match(migration, /o\.owner_id = uid::text/);
  assert.match(migration, /m\.couple_id = cid/);
  assert.match(migration, /m\.thumbnail_path is null/);
  assert.doesNotMatch(migration, /set storage_path\s*=/i);
  assert.match(migration, /revoke all on function public\.set_moment_thumbnail\(uuid, text\) from anon/);
  assert.match(migration, /grant execute on function public\.set_moment_thumbnail\(uuid, text\) to authenticated/);
});

test('Ricordi cards download thumbnail previews but retain full originals for viewer', () => {
  assert.match(app, /function ricordiPreviewPath\(row\)\{return row\?\.thumbnail_path\|\|row\?\.storage_path/);
  assert.match(app, /const fullUrl=signedUrls\.get\(row\.storage_path\)/);
  assert.match(app, /const previewUrl=ricordiPreviewUrl\(row,signedUrls\)/);
  assert.match(app, /data-url="\$\{escapeHtml\(fullUrl\)\}"/);
  assert.match(app, /src="\$\{escapeHtml\(previewUrl\)\}"/);
  assert.match(app, /select\('id,created_by,storage_path,thumbnail_path,caption,moment_date,created_at'\)/);
  assert.match(app, /flatMap\(row=>\[row\.storage_path,row\.thumbnail_path\]\)/);
});

test('native legacy optimization is manual, bounded to derivatives and never removes originals', () => {
  assert.match(html, /id="usOptimizeRicordiSetting" hidden/);
  assert.match(settings, /falla una volta quando sei sotto Wi-Fi/);
  assert.match(settings, /Le foto originali restano intatte/);
  assert.match(app, /if\(!window\.UsPlatform\?\.isNative\)return \{ok:false,code:'native_only'\}/);
  assert.match(app, /if\(connection\?\.saveData\)return \{ok:false,code:'data_saver'\}/);
  assert.match(app, /\.is\('thumbnail_path',null\)/);
  assert.match(app, /target_moment_id:row\.id,\s*target_thumbnail_path:thumbnailPath/);
  assert.doesNotMatch(app.slice(app.indexOf('async function usOptimizeLegacyRicordiThumbnails'), app.indexOf('window.UsRicordiThumbnails')), /remove\(\[row\.storage_path\]\)/);
});

test('whole-Moment deletion also removes its thumbnail derivative', () => {
  assert.match(deleteMoment, /select\("id,couple_id,created_by,storage_path,thumbnail_path"\)/);
  assert.match(deleteMoment, /moment\.storage_path,\s*moment\.thumbnail_path,/);
  assert.match(deleteMoment, /admin\.storage\.from\("us-media"\)\.remove\(paths\)/);
});
