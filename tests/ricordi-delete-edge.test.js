const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const source = read('supabase/functions/delete-moment/index.ts').replace(/\r\n/g, '\n');
const config = read('supabase/config.toml').replace(/\r\n/g, '\n');
const app = read('app.js');

test('delete-moment Edge Function is JWT protected and validates the real caller', () => {
  assert.match(config, /\[functions\.delete-moment\]\nverify_jwt = true/);
  assert.match(source, /npm:@supabase\/supabase-js@2\.112\.4/);
  assert.match(source, /supabaseSecretKey/);
  assert.match(source, /admin\.auth\.getUser\(token\)/);
  assert.match(source, /if \(!token\).*401/);
  assert.match(source, /const UUID = /);
});

test('delete-moment accepts only a moment id and derives ownership and media server-side', () => {
  assert.match(source, /const momentId = typeof body\?\.moment_id/);
  assert.doesNotMatch(source, /body\?\.(?:storage|path|couple|created_by)/);
  assert.match(source, /\.from\("profiles"\)[\s\S]*\.eq\("id", authData\.user\.id\)/);
  assert.match(source, /\.from\("moments"\)[\s\S]*\.eq\("id", momentId\)/);
  assert.match(source, /moment\.couple_id !== profile\.couple_id \|\| moment\.created_by !== authData\.user\.id/);
  assert.match(source, /\.from\("moment_photos"\)[\s\S]*\.eq\("moment_id", momentId\)/);
  assert.match(source, /path\.startsWith\(prefix\)/);
});

test('delete-moment removes the authorized row then cleans cover and album objects through Storage API', () => {
  const rowDelete = source.indexOf('.from("moments")\n      .delete()');
  const storageDelete = source.indexOf('admin.storage.from("us-media").remove(paths)');
  assert.ok(rowDelete >= 0, 'authorized Moment delete is present');
  assert.ok(storageDelete > rowDelete, 'Storage cleanup happens after the row deletion is proven');
  assert.match(source, /\.eq\("created_by", authData\.user\.id\)[\s\S]*\.select\("id"\)/);
  assert.match(source, /return json\(\{ deleted: true, storage_cleanup: storageCleanup/);
});

test('whole-Moment privileged cleanup never exposes server credentials to the PWA', () => {
  assert.doesNotMatch(app, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS|supabaseSecretKey/);
  assert.match(app, /sb\.functions\.invoke\('delete-moment'/);
});
