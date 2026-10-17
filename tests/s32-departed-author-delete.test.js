// S3.2 Policy A — the member still in the couple deletes what the departed
// author left: whole memories and single album photos (staging QA, 16/10).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness.js');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COUPLE = UUID(900);
const OTHER = UUID(901);
const A = UUID(1); // deleted account: created_by is null on what A left
const B = UUID(2); // still in COUPLE
const X = UUID(3); // another couple
const M = UUID(90);
const MB = UUID(91);
const P = UUID(80);
const PB = UUID(81);

const world = () => {
  const removed = [];
  const admin = createFakeAdmin({
    tables: {
      profiles: [{ id: B, couple_id: COUPLE }, { id: X, couple_id: OTHER }],
      moments: [
        { id: M, couple_id: COUPLE, created_by: null, storage_path: `${COUPLE}/${A}/m.webp`, thumbnail_path: `${COUPLE}/${A}/m-thumb.webp` },
        { id: MB, couple_id: COUPLE, created_by: B, storage_path: `${COUPLE}/${B}/mb.webp`, thumbnail_path: null },
      ],
      moment_photos: [
        { id: P, moment_id: MB, couple_id: COUPLE, created_by: null, storage_path: `${COUPLE}/${A}/album-a.webp` },
        { id: PB, moment_id: MB, couple_id: COUPLE, created_by: B, storage_path: `${COUPLE}/${B}/album-b.webp` },
      ],
    },
    users: { 'jwt-b': { id: B }, 'jwt-x': { id: X } },
  });
  admin.storage = { from: (bucket) => ({ remove: async (paths) => { removed.push([bucket, ...paths]); return { error: null }; } }) };
  return { admin, removed };
};
const call = async (w, token, body) => {
  const fn = await loadEdgeFunction('delete-moment', { admin: w.admin, webpush: createFakeWebPush() });
  return fn.call(new Request('https://x/functions/v1/delete-moment', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
};

test('S3.2 delete-moment: the member still here deletes a memory whose author left, with its media', async () => {
  const w = world();
  const ok = await call(w, 'jwt-b', { moment_id: M });
  assert.deepEqual(ok, { status: 200, body: { deleted: true, storage_cleanup: true, removed_objects: 2 } });
  assert.deepEqual(w.admin.db.moments.map((r) => r.id), [MB]);
  assert.deepEqual(w.removed, [['us-media', `${COUPLE}/${A}/m.webp`, `${COUPLE}/${A}/m-thumb.webp`]]);
});

test('S3.2 delete-moment: another couple can delete neither the memory nor the photo', async () => {
  const w = world();
  assert.equal((await call(w, 'jwt-x', { moment_id: M })).status, 403);
  assert.equal((await call(w, 'jwt-x', { photo_id: P })).status, 403);
  assert.equal(w.admin.db.moments.length, 2);
  assert.equal(w.admin.db.moment_photos.length, 2);
  assert.deepEqual(w.removed, []);
});

test('S3.2 delete-moment: one album photo without author is deleted with its file; a photo with an author is not', async () => {
  const w = world();
  const ok = await call(w, 'jwt-b', { photo_id: P });
  assert.deepEqual(ok, { status: 200, body: { deleted: true, storage_cleanup: true, removed_objects: 1 } });
  assert.deepEqual(w.admin.db.moment_photos.map((r) => r.id), [PB]);
  assert.deepEqual(w.removed, [['us-media', `${COUPLE}/${A}/album-a.webp`]]);
  // Own photos keep the client RLS path; this server path is only for the departed author's.
  assert.equal((await call(w, 'jwt-b', { photo_id: PB })).status, 403);
  assert.equal(w.admin.db.moment_photos.length, 1);
});

test('S3.2 delete-moment: a request names one memory or one photo, never both', async () => {
  const w = world();
  assert.equal((await call(w, 'jwt-b', { moment_id: M, photo_id: P })).status, 400);
  assert.equal((await call(w, 'jwt-b', { photo_id: 'nope' })).status, 400);
  assert.equal(w.admin.db.moments.length, 2);
});

test('S3.2 client: Elimina appears on memories and photos whose author left, and those photos go through the server', () => {
  const app = read('app.js');
  const albums = read('moments-albums.js');
  assert.match(app, /const canDelete=own\|\|row\.created_by==null;/);
  assert.match(app, /ricordiMomentCard\(row,displayUrls,author,canDelete,/);
  assert.match(app, /\$\{row\.created_by==null\?' data-moment-orphan="1"':''\}/);
  assert.match(albums, /orphan:card\.dataset\.momentOrphan==='1'/);
  assert.match(albums, /currentAlbum\.orphan\|\|\(currentAlbum\.owner&&currentAlbum\.owner===window\.usProfile\.id\)/);
  assert.match(albums, /own:row\.created_by===window\.usProfile\.id,orphan:row\.created_by==null/);
  assert.match(albums, /sb\.functions\.invoke\('delete-moment',\{body:\{photo_id:id\}\}\)/);
});
