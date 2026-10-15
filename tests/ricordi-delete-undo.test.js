const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const albumsSource = read('moments-albums.js').replace(/\r\n/g, '\n');
const ALBUMS_CORE = albumsSource.slice(0, albumsSource.indexOf("console.info('[US] Moments Albums attivo');\n})();") + "console.info('[US] Moments Albums attivo');\n})();".length);
const appSource = read('app.js').replace(/\r\n/g, '\n');
const COMMIT = appSource.slice(appSource.indexOf('async function commitMomentDeletion('), appSource.indexOf('window.usCommitMomentDeletion=commitMomentDeletion;'));

function fakeEl(id, doc) {
  const classes = new Set();
  const attrs = {};
  const listeners = {};
  const el = {
    id, hidden: false, disabled: false, dataset: {}, style: { setProperty() {} }, innerHTML: '', textContent: '', tabIndex: 0,
    classList: {
      add: (...n) => n.forEach((x) => classes.add(x)), remove: (...n) => n.forEach((x) => classes.delete(x)),
      contains: (x) => classes.has(x), toggle: (x, f) => { const on = f === undefined ? !classes.has(x) : Boolean(f); if (on) classes.add(x); else classes.delete(x); return on; }
    },
    setAttribute(n, v) { attrs[n] = String(v); }, getAttribute: (n) => attrs[n] ?? null, removeAttribute(n) { delete attrs[n]; },
    addEventListener(t, fn) { listeners[t] = fn; }, removeEventListener() {},
    click() { return listeners.click?.({ stopPropagation() {}, preventDefault() {}, target: el }); },
    focus() { doc.activeElement = el; }, scrollIntoView() {}, appendChild() {}, insertAdjacentHTML() {}, replaceChildren() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null
  };
  return el;
}

function harness({ owner = 'me', partnerPhotos = [], commitResult = true, confirmResult = true } = {}) {
  const doc = { activeElement: null, readyState: 'complete', hidden: false };
  const elements = new Map();
  let mounted = false;
  doc.getElementById = (id) => {
    if (id === 'usAlbumOverlay' && !mounted) return null;
    if (!elements.has(id)) elements.set(id, fakeEl(id, doc));
    return elements.get(id);
  };
  doc.body = fakeEl('body', doc);
  doc.body.insertAdjacentHTML = () => { mounted = true; };
  doc.createElement = (tag) => fakeEl(`new-${tag}`, doc);
  doc.addEventListener = () => {};
  const card = fakeEl('card', doc);
  Object.assign(card.dataset, { momentId: 'm1', momentOwner: owner, storagePath: 'c/me/moments/m1.webp', url: 'blob:x', author: 'Francesco', date: '20 set', momentIso: '2026-09-20', caption: 'Lago' });
  doc.querySelectorAll = (sel) => (sel.includes('.moment-card[data-moment-id]') ? [card] : []);

  const timers = new Map();
  let nextTimer = 1;
  const commits = [];
  const toasts = [];
  const confirms = [];
  const query = (rows) => {
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej) };
    return q;
  };
  const sb = {
    from: (table) => (table === 'moment_photos' ? query(partnerPhotos) : query([{ id: 'me', display_name: 'Francesco' }])),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'blob:y' }, error: null }) }) }
  };
  const window = {
    document: doc,
    usProfile: { id: 'me', couple_id: 'c' },
    usGetSignedUrls: async (paths) => new Map(paths.map((p) => [p, `signed:${p}`])),
    usCommitMomentDeletion: async (id) => { commits.push({ id }); return commitResult; },
    UsFeedback: { action() {} }
  };
  const context = {
    window, document: doc, sb, console,
    toast: (msg) => toasts.push(msg),
    // US 1.0 R2: whole-memory deletion asks first, saying it disappears for both.
    usConfirm: async (options) => { confirms.push(options); return confirmResult; },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    URL, Promise
  };
  vm.runInNewContext(ALBUMS_CORE, context, { filename: 'moments-albums.js' });
  const el = doc.getElementById;
  const fireGrace = async () => {
    for (const [id, t] of [...timers]) if (t.ms === 4000) { timers.delete(id); await t.fn(); }
    await new Promise((r) => setImmediate(r));
  };
  return { window, el, card, commits, toasts, confirms, timers, doc, fireGrace, open: () => window.openUsMomentAlbum(card) };
}

// US 1.0 R2 replaces "both partners can delete": only who created a memory sees
// Elimina, and a confirm says it disappears for both before the grace period.
test('Ricordi delete: only the creator can delete a memory, after a confirm that says "per tutti e due"', async () => {
  const own = harness();
  await own.open();
  assert.equal(own.el('usAlbumDelete').hidden, false);
  assert.equal(own.el('usAlbumDelete').dataset.state, 'idle');

  const partner = harness({ owner: 'partner' });
  await partner.open();
  assert.equal(partner.el('usAlbumDelete').hidden, true, 'the partner never sees Elimina on a memory they did not create');
  await partner.el('usAlbumDeleteGo').click();
  assert.equal(partner.window.USRicordiDelete.pending(), null);
  assert.deepEqual(partner.confirms, []);

  const album = harness({ partnerPhotos: [{ id: 'p1', moment_id: 'm1', created_by: 'partner', storage_path: 'c/partner/x.webp', position: 1 }] });
  await album.open();
  assert.equal(album.el('usAlbumDelete').hidden, false, 'album photos do not hide whole-Moment deletion');

  const said = harness();
  await said.open();
  await said.el('usAlbumDeleteGo').click();
  assert.equal(said.confirms.length, 1);
  assert.match(said.confirms[0].body, /per tutti e due/);
  assert.equal(said.confirms[0].tone, 'danger');

  const kept = harness({ confirmResult: false });
  await kept.open();
  await kept.el('usAlbumDeleteGo').click();
  assert.equal(kept.window.USRicordiDelete.pending(), null, 'cancelling the confirm deletes nothing');
  assert.equal(kept.card.classList.contains('is-pending-delete'), false);
});

test('Ricordi delete: Elimina (once confirmed) only starts a grace period — nothing is deleted, no toast', async () => {
  const h = harness();
  await h.open();
  await h.el('usAlbumDeleteGo').click();
  assert.deepEqual(h.commits, [], 'no permanent deletion on tap');
  assert.equal(h.el('usAlbumDelete').dataset.state, 'done');
  assert.equal(h.card.classList.contains('is-pending-delete'), true, 'photo leaves the collection immediately');
  assert.equal(h.el('usAlbumOverlay').classList.contains('is-pending-delete'), true);
  assert.equal(h.doc.activeElement?.id, 'usAlbumDeleteUndo');
  assert.deepEqual([...h.timers.values()].map((t) => t.ms).filter((ms) => ms === 4000), [4000], 'exactly one grace timer');
  assert.deepEqual(h.toasts, []);
});

test('Ricordi delete: Annulla cancels the timer and restores the photo without any write', async () => {
  const h = harness();
  await h.open();
  await h.el('usAlbumDeleteGo').click();
  h.el('usAlbumDeleteUndo').click();
  assert.equal([...h.timers.values()].filter((t) => t.ms === 4000).length, 0, 'grace timer cancelled');
  await h.fireGrace();
  assert.deepEqual(h.commits, []);
  assert.equal(h.card.classList.contains('is-pending-delete'), false);
  assert.equal(h.el('usAlbumDelete').dataset.state, 'idle');
  assert.equal(h.doc.activeElement?.id, 'usAlbumDeleteGo');
});

test('Ricordi delete: grace expiry commits exactly once, then the viewer closes', async () => {
  const h = harness();
  await h.open();
  h.el('usAlbumOverlay').classList.add('show');
  await Promise.all([h.el('usAlbumDeleteGo').click(), h.el('usAlbumDeleteGo').click()]);
  assert.equal(h.confirms.length, 1, 'a double tap asks once');
  await h.fireGrace();
  assert.deepEqual(h.commits, [{ id: 'm1' }]);
  assert.equal(h.window.USRicordiDelete.pending(), null);
  assert.equal(h.el('usAlbumOverlay').classList.contains('show'), false);
  assert.deepEqual(h.toasts, [], 'no success toast');
});

test('Ricordi delete: a failed commit restores the photo and the control', async () => {
  const h = harness({ commitResult: false });
  await h.open();
  await h.el('usAlbumDeleteGo').click();
  await h.fireGrace();
  assert.equal(h.commits.length, 1);
  assert.equal(h.card.classList.contains('is-pending-delete'), false);
  assert.equal(h.el('usAlbumDelete').dataset.state, 'idle');
  assert.equal(h.toasts.length, 1, 'only failure speaks');
});

test('Ricordi delete commit: frontend invokes authenticated delete-moment then refreshes dependent surfaces', async () => {
  const order = [];
  const invokes = [];
  const run = async ({ data = { deleted: true, storage_cleanup: true }, error = null } = {}) => {
    order.length = 0;
    invokes.length = 0;
    const ctx = {
      window: { usProfile: { id: 'me' } }, console: { warn() {} },
      sb: { functions: { invoke: async (name, options) => { invokes.push({ name, options }); return { data, error }; } } },
      hydrateMoments: async () => order.push('hydrateMoments'),
      hydrateHomeMemory: async () => order.push('hydrateHomeMemory'),
      hydrateHomePhoto: async () => order.push('hydrateHomePhoto'),
      homePhotoPath: 'old-path'
    };
    vm.runInNewContext(`${COMMIT}\nthis.result = commitMomentDeletion('m1');`, ctx);
    return ctx.result;
  };

  assert.equal(await run(), true);
  assert.equal(invokes.length, 1);
  assert.equal(invokes[0].name, 'delete-moment');
  assert.equal(invokes[0].options?.body?.moment_id, 'm1');
  assert.deepEqual(order, ['hydrateMoments', 'hydrateHomeMemory', 'hydrateHomePhoto']);
  assert.doesNotMatch(COMMIT, /\.from\('moments'\)|storage\.from\('us-media'\)/, 'privileged whole-Moment deletion must not live in the browser');

  assert.equal(await run({ data: null, error: { message: 'denied' } }), false);
  assert.deepEqual(order, [], 'failed deletion does not pretend the UI was refreshed');
  assert.equal(await run({ data: { deleted: false }, error: null }), false);
});

test('Ricordi delete: visible action, no client secret, no SQL storage deletes, legacy confirm path removed', () => {
  const albums = read('moments-albums.js');
  const app = read('app.js');
  const css = read('moments-albums.css');
  const styles = read('styles.css');
  assert.doesNotMatch(albums + app, /service_role|SUPABASE_SECRET|storage\.objects/);
  assert.doesNotMatch(app, /title:'Eliminare questo ricordo\?'/);
  assert.doesNotMatch(app, /toast\('Ricordo eliminato'\)/);
  assert.match(app, /aria-label="Elimina ricordo"[^>]*>Elimina<\/button>/);
  assert.match(app, /sb\.functions\.invoke\('delete-moment'/);
  assert.match(styles, /\.moment-delete\{[^}]*min-width:72px[^}]*height:44px/);
  assert.match(albums, /const DELETE_GRACE_MS=4000/);
  // US 1.0 R2: the creator only (the delete-moment Edge Function must check it too).
  // S3.2 Policy A: also a memory whose author left (orphan), for the member still here.
  assert.match(albums, /window\.usProfile\?\.couple_id&&albumLoaded&&\(currentAlbum\.orphan\|\|\(currentAlbum\.owner&&currentAlbum\.owner===window\.usProfile\.id\)\)\)/);
  assert.doesNotMatch(albums, /albumRows\.length===0/);
  assert.match(albums, />Elimina</);
  assert.match(albums, />Eliminato</);
  assert.match(albums, />Annulla</);
  assert.match(css, /\.us-undo-delete\{[^}]*width:112px[^}]*height:44px/);
  assert.match(css, /\.us-undo-delete\[data-state="done"\],\.us-undo-delete\[data-state="committing"\]\{width:206px/);
  assert.match(css, /@keyframes us-undo-fuse/);
});
