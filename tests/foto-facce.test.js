// Centrare le facce nelle foto (founder, 21/11/2026, grill-me D1–D13). The
// phone finds the faces on the device (MediaPipe, vendored) after an upload
// and saves one point (focus_x, focus_y); where a photo is cropped the faces
// stay in view. Nothing about the faces is stored.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const MIGRATION = 'supabase/migrations/20261121092821_foto_punto_facce.sql';

function focusApi() {
  const listeners = [];
  const ctx = { window: {}, document: { addEventListener: (...a) => listeners.push(a) }, console };
  ctx.window.WebAssembly = {};
  vm.runInNewContext(read('photo-focus.js'), ctx);
  return ctx.window.UsPhotoFocus;
}
const face = (x, y, w, h) => ({ boundingBox: { originX: x, originY: y, width: w, height: h } });

test('Facce: the point is the group of faces; tiny faces do not count; no face is the centre', () => {
  const F = focusApi();
  assert.deepEqual({ ...F.focusFrom([], 1000, 800) }, { x: 50, y: 50 }, 'no face: the centre, as before');
  assert.deepEqual({ ...F.focusFrom([face(700, 100, 200, 200)], 1000, 1000) }, { x: 80, y: 20 }, 'one face');
  // Two faces close together: the middle of the two.
  assert.deepEqual({ ...F.focusFrom([face(300, 200, 200, 200), face(550, 250, 200, 200)], 1000, 1000) }, { x: 53, y: 33 });
  // A face far away in a landscape (under 3% of the photo) is not the subject.
  assert.deepEqual({ ...F.focusFrom([face(900, 50, 40, 40)], 1000, 1000) }, { x: 50, y: 50 });
  // Too spread out for a crop: the biggest face wins.
  assert.deepEqual({ ...F.focusFrom([face(0, 300, 200, 200), face(750, 300, 250, 250)], 1000, 1000) }, { x: 88, y: 43 });
});

test('Facce: cropped with cover, the faces sit centred and at about 40% from the top, as far as the photo allows', () => {
  const F = focusApi();
  // A tall photo in a wide frame: only the vertical position moves.
  assert.equal(F.positionFor(50, 20, 1000, 2000, 400, 300), '50.0% 8.0%');
  // A wide photo in a tall frame: the face on the right comes to the middle.
  assert.equal(F.positionFor(80, 50, 2000, 1000, 300, 400), '98.0% 50.0%');
  // The photo cannot move past its edge.
  assert.equal(F.positionFor(98, 50, 2000, 1000, 300, 400), '100.0% 50.0%');
  assert.equal(F.positionFor(50, 50, 0, 0, 300, 400), null);
  assert.equal(F.attr({ focus_x: 30, focus_y: 70 }), '30,70');
  assert.equal(F.attr({ focus_x: null, focus_y: null }), '', 'not looked at yet: no point');
});

test('Facce static: vendored detector loaded only when needed, saved after the upload, used where the photo is cropped', () => {
  const src = read('photo-focus.js');
  assert.match(src, /const BASE = '\/assets\/vendor\/mediapipe';/);
  assert.match(src, /await import\(`\$\{BASE\}\/vision_bundle\.mjs`\)/, 'loaded only when a photo is looked at');
  assert.match(src, /modelAssetPath: `\$\{BASE\}\/blaze_face_short_range\.tflite`/);
  for (const f of ['vision_bundle.mjs', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm', 'blaze_face_short_range.tflite']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/vendor/mediapipe', f)), f);
  }
  assert.doesNotMatch(read('service-worker.js'), /vendor\/mediapipe/, 'never in the offline shell');
  const app = read('app.js');
  assert.match(app, /if\(created\?\.id\)window\.UsPhotoFocus\?\.saveFor\?\.\('moments',created\.id,thumbnail\);/);
  assert.match(read('moments-albums.js'), /if\(row\?\.id\)window\.UsPhotoFocus\?\.saveFor\?\.\('moment_photos',row\.id,compressed\);/);
  assert.match(app, /\.eq\('created_by',me\.id\)\.is\('focus_x',null\)\.order\('created_at',\{ascending:false\}\)\.limit\(6\)/, 'each phone its own photos, six at a time');
  assert.match(app, /momentsQuery\(`\$\{US_MOMENT_COLUMNS\},\$\{US_MOMENT_PLACE_COLUMNS\},\$\{US_MOMENT_FOCUS_COLUMNS\}`\)/, 'a database without the columns still reads');
  const diario = read('diario.js');
  assert.match(diario, /w\.UsPhotoFocus\?\.apply\?\.\(img, has \?/);
  assert.match(diario, /data-us-focus="\$\{w\.UsPhotoFocus\.attr\(row\)\}"/);
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(f), /'photo-focus\.js',/);
  assert.match(read('index.html'), /<script defer src="\/photo-focus\.js\?v=/);
  assert.match(read('privacy.html'), /senza riconoscere chi sono: dei volti non salviamo niente/);
  assert.match(read('privacy-en.html'), /without recognising who they are: nothing about the faces is stored/);
});

test('Facce DB: two points per photo, 0-100 or none, the author writes them on their own photo only', async () => {
  const pg = new PGlite();
  const me = crypto.randomUUID(), other = crypto.randomUUID(), couple = crypto.randomUUID();
  await pg.exec(`
    create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, private to authenticated; grant execute on function auth.uid() to authenticated;
    create function private.current_couple_id() returns uuid language sql stable as $$ select '${couple}'::uuid $$;
    grant execute on function private.current_couple_id() to authenticated;
    create table public.moments (id uuid primary key default gen_random_uuid(), couple_id uuid not null, created_by uuid not null, storage_path text not null, created_at timestamptz default now());
    create table public.moment_photos (id uuid primary key default gen_random_uuid(), moment_id uuid, couple_id uuid not null, created_by uuid not null, storage_path text not null, created_at timestamptz default now());
    alter table public.moments enable row level security; alter table public.moment_photos enable row level security;
    grant select, update on public.moments, public.moment_photos to authenticated;
    create policy moments_select on public.moments for select to authenticated using (couple_id = private.current_couple_id());
    create policy moments_update_own on public.moments for update to authenticated using (couple_id = private.current_couple_id() and created_by = auth.uid()) with check (couple_id = private.current_couple_id() and created_by = auth.uid());
    insert into public.moments (couple_id, created_by, storage_path) values ('${couple}', '${me}', 'a'), ('${couple}', '${other}', 'b');
  `);
  await pg.exec(read(MIGRATION));
  await pg.exec(`select set_config('request.jwt.claim.sub', '${me}', false); set role authenticated;`);
  const mine = await pg.query(`update public.moments set focus_x = 30, focus_y = 70 where storage_path = 'a' returning focus_x, focus_y`);
  assert.deepEqual(mine.rows, [{ focus_x: 30, focus_y: 70 }]);
  const theirs = await pg.query(`update public.moments set focus_x = 10, focus_y = 10 where storage_path = 'b' returning id`);
  assert.equal(theirs.rows.length, 0, 'not on the other person’s photo');
  await assert.rejects(pg.query(`update public.moments set focus_x = 120, focus_y = 50 where storage_path = 'a'`), /moments_focus_range/);
  await assert.rejects(pg.query(`update public.moments set focus_x = 40, focus_y = null where storage_path = 'a'`), /moments_focus_range/, 'both or none');
  await pg.exec('reset role');
  const cols = await pg.query(`select table_name, column_name, data_type from information_schema.columns where column_name like 'focus_%' order by 1, 2`);
  assert.deepEqual(cols.rows.map((r) => `${r.table_name}.${r.column_name}:${r.data_type}`), ['moment_photos.focus_x:smallint', 'moment_photos.focus_y:smallint', 'moments.focus_x:smallint', 'moments.focus_y:smallint']);
});

test('Facce browser: the vendored detector loads and looks at a photo; a Ricordo with a point keeps it in view', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    try {
      // A plain picture with no face: the detector runs and answers the centre.
      const found = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 320; c.height = 240;
        const g = c.getContext('2d'); g.fillStyle = '#7a5'; g.fillRect(0, 0, 320, 240);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        return window.UsPhotoFocus.find(blob);
      });
      assert.deepEqual(found, { x: 50, y: 50 });
      // An image with a point takes its position when it loads.
      const pos = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 1000; c.height = 2000;
        c.getContext('2d').fillRect(0, 0, 1000, 2000);
        const img = document.createElement('img');
        img.style.cssText = 'width:400px;height:300px;object-fit:cover;position:fixed;left:0;top:0';
        img.dataset.usFocus = '50,20';
        document.body.append(img);
        await new Promise((r) => { img.onload = r; img.src = c.toDataURL(); });
        await new Promise((r) => setTimeout(r, 50));
        return { got: img.style.objectPosition, want: window.UsPhotoFocus.positionFor(50, 20, 1000, 2000, img.clientWidth, img.clientHeight) };
      });
      assert.equal(pos.got, pos.want.replace(/.0%/g, '%'));
      assert.notEqual(pos.got, '', 'the point moved the crop');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});
