const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'stories.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'stories.css'), 'utf8');

function functionSource(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `blocco mancante: ${start}`);
  assert.notEqual(to, -1, `fine blocco mancante: ${end}`);
  return source.slice(from, to);
}

function viewerHarness({ online = true } = {}) {
  const states = [];
  const seen = [];
  const progress = [];
  let advances = 0;
  const media = {
    hidden: true,
    removeAttribute(name) { if (name === 'src') this.src = ''; }
  };
  const caption = { hidden: true, textContent: '' };
  const time = { textContent: '' };
  const elements = { usStoryMedia: media, usStoryCaption: caption, usStoryTime: time };
  const context = vm.createContext({
    STORY_SECONDS: 10,
    clearStoryAdvance() {},
    closeStoryViewer() {},
    console: { warn() {} },
    currentViewerIndex: 0,
    currentViewerStories: [{
      id: 'story-1', author_id: 'partner-1', media_path: 'couple/partner/story.webp',
      caption: 'Una caption reale', created_at: '2026-08-25T10:00:00Z', duration_seconds: 10
    }],
    document: { getElementById: (id) => elements[id] || null },
    markStorySeen: (id) => seen.push(id),
    applyStoryMediaEntry() {},
    navigator: { onLine: online },
    nextStory: () => { advances += 1; },
    relativeStoryTime: () => 'ora',
    renderProgress: (...args) => progress.push(args),
    requestAnimationFrame: (callback) => callback(),
    sb: {},
    setStoryViewerState: (kind, message) => states.push({ kind, message }),
    startStoryPlayback() {},
    setTimeout: () => 1,
    storyLoadToken: 0,
    window: {
      usProfile: { id: 'me' },
      usGetSignedUrl: async () => 'https://media.example.test/story.webp'
    }
  });
  vm.runInContext(functionSource('async function showStoryAt(', 'async function markStorySeen('), context);
  return { context, media, states, seen, progress, get advances() { return advances; } };
}

test('una Story viene segnata vista soltanto dopo il caricamento del media', async () => {
  const harness = viewerHarness();

  await harness.context.showStoryAt(0);
  assert.deepEqual(harness.seen, []);

  harness.media.onload();
  assert.deepEqual(harness.seen, ['story-1']);
});

test('un errore media resta nel viewer con retry e non salta automaticamente', async () => {
  const harness = viewerHarness({ online: false });

  await harness.context.showStoryAt(0);
  harness.media.onerror();

  assert.equal(harness.advances, 0);
  assert.equal(harness.states.at(-1).kind, 'offline');
});

test('la progress bar parte soltanto quando il media è disponibile', async () => {
  const harness = viewerHarness();

  await harness.context.showStoryAt(0);
  assert.deepEqual(harness.progress, [[0, 10, false]]);

  harness.media.onload();
  assert.deepEqual(harness.progress, [[0, 10, false], [0, 10, true]]);
});

test('Delete applica ownership e couple id nella query prima di rimuovere il media', async () => {
  const filters = [];
  const removed = [];
  const query = {
    delete() { return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    select() { return this; },
    async maybeSingle() { return { data: { id: 'story-1', media_path: 'couple/me/story.webp' }, error: null }; }
  };
  const context = vm.createContext({
    console: { warn() {} },
    sb: {
      from(table) { assert.equal(table, 'stories'); return query; },
      storage: { from(bucket) { assert.equal(bucket, 'us-media'); return { remove: async (paths) => { removed.push(...paths); return { error: null }; } }; } }
    },
    window: { usProfile: { id: 'me', couple_id: 'couple-1' } }
  });
  vm.runInContext(functionSource('async function deleteOwnStory(', 'function openStoryDeleteConfirmation('), context);

  const deleted = await context.deleteOwnStory({ id: 'story-1', author_id: 'me', media_path: 'couple/me/story.webp' });

  assert.equal(deleted, true);
  assert.deepEqual(filters, [['id', 'story-1'], ['author_id', 'me'], ['couple_id', 'couple-1']]);
  assert.deepEqual(removed, ['couple/me/story.webp']);
});

test('Delete non interroga Supabase per una Story attribuita al partner', async () => {
  let queries = 0;
  const context = vm.createContext({
    console: { warn() {} },
    sb: { from() { queries += 1; throw new Error('query non autorizzata'); } },
    window: { usProfile: { id: 'me', couple_id: 'couple-1' } }
  });
  vm.runInContext(functionSource('async function deleteOwnStory(', 'function openStoryDeleteConfirmation('), context);

  assert.equal(await context.deleteOwnStory({ id: 'partner-story', author_id: 'partner' }), false);
  assert.equal(queries, 0);
});

test('la conferma Delete congela la Story e conserva il target scelto', () => {
  let clears = 0;
  const root = { classList: { add() {} }, setAttribute() {} };
  const context = vm.createContext({
    clearStoryAdvance: () => { clears += 1; },
    document: { getElementById: () => root },
    stories: [{ id: 'story-1', author_id: 'me' }],
    window: { usProfile: { id: 'me' } }
  });
  vm.runInContext(`
    let currentViewerStories = stories;
    let currentViewerIndex = 0;
    let pendingDeleteStoryId = null;
    ${functionSource('function openStoryDeleteConfirmation(', 'function closeStoryDeleteConfirmation(')}
    this.openDelete = openStoryDeleteConfirmation;
    this.pendingDelete = () => pendingDeleteStoryId;
  `, context);

  context.openDelete();
  assert.equal(clears, 1);
  assert.equal(context.pendingDelete(), 'story-1');
});

test('il retry riusa lo stesso blob in memoria e lo libera soltanto al successo', async () => {
  const blob = { type: 'image/webp', bytes: 42 };
  const attempts = [];
  let closes = 0;
  const retryContext = vm.createContext({
    blob, closeStoryCamera: () => { closes += 1; },
    publishStoryBlob: async (value) => { attempts.push(value); return attempts.length > 1; },
    setCameraFeedback() {}, uploadBusy: false
  });
  vm.runInContext(`
    let pendingStoryBlob = blob;
    ${functionSource('async function retryPendingStoryUpload(', 'async function openStoryCamera(')}
    this.retry = retryPendingStoryUpload;
    this.pending = () => pendingStoryBlob;
  `, retryContext);

  assert.equal(await retryContext.retry(), false);
  assert.equal(retryContext.pending(), blob);
  assert.equal(await retryContext.retry(), true);
  assert.equal(retryContext.pending(), null);
  assert.deepEqual(attempts, [blob, blob]);
  assert.equal(closes, 1);
});

test('la camera rilascia lo stream acquisito se il video non riesce ad avviarsi', async () => {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => { stopped += 1; } }] };
  const video = {
    srcObject: null,
    async play() { throw new Error('play failed'); }
  };
  const context = vm.createContext({
    cameraFacing: 'environment',
    document: { getElementById: (id) => id === 'usCameraVideo' ? video : null },
    navigator: { mediaDevices: { getUserMedia: async () => stream } }
  });
  vm.runInContext(`
    let cameraStream = null;
    ${functionSource('async function startCameraStream(', 'function closeStoryCamera(')}
    this.start = startCameraStream;
  `, context);

  await assert.rejects(context.start(), /play failed/);
  assert.equal(stopped, 1);
  assert.equal(video.srcObject, null);
});

test('un doppio tap su Scatta durante la conversione produce un solo upload', async () => {
  const blobCallbacks = [];
  let uploads = 0;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {}, scale() {}, translate() {} }),
    toBlob: (callback) => blobCallbacks.push(callback)
  };
  const context = vm.createContext({
    cameraFacing: 'environment',
    document: {
      createElement: () => canvas,
      getElementById: (id) => id === 'usCameraVideo' ? { videoWidth: 1200, videoHeight: 800 } : null
    },
    publishStoryBlob: async () => { uploads += 1; return false; },
    setCameraBusy() {},
    setCameraFeedback() {}
  });
  vm.runInContext(`
    let uploadBusy = false;
    let captureBusy = false;
    let pendingStoryBlob = null;
    ${functionSource('async function captureStoryPhoto(', 'async function openStoriesFor(')}
    this.capture = captureStoryPhoto;
  `, context);

  const first = context.capture();
  const second = context.capture();
  assert.equal(blobCallbacks.length, 1);
  blobCallbacks[0]({ type: 'image/webp' });
  await Promise.all([first, second]);
  assert.equal(uploads, 1);
});

test('gesture Stories distingue orizzontale, chiusura e caption scrollabile', () => {
  const context = vm.createContext({});
  vm.runInContext(functionSource('function resolveStoryGesture(', 'function wireStoryGestures('), context);

  assert.equal(context.resolveStoryGesture(180, 200, 82, 212), 'next');
  assert.equal(context.resolveStoryGesture(90, 200, 178, 206), 'previous');
  assert.equal(context.resolveStoryGesture(180, 140, 188, 232), 'close');
  assert.equal(context.resolveStoryGesture(180, 140, 195, 174), null);

  const captionTarget = { closest: (selector) => selector.includes('.us-story-caption') ? {} : null };
  assert.equal(context.shouldIgnoreStoryGestureTarget(captionTarget), true);
});

test('reduced motion chiude lo swipe senza animazione differita', () => {
  const listeners = new Map();
  let closes = 0;
  let timers = 0;
  const viewer = {
    dataset: {},
    classList: { contains: (name) => name === 'open', add() {}, remove() {} },
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const context = vm.createContext({
    clearStoryAdvance() {}, closeStoryViewer: () => { closes += 1; },
    document: { getElementById: () => viewer }, nextStory() {}, previousStory() {},
    resolveStoryGesture: () => 'close', setTimeout: () => { timers += 1; },
    shouldIgnoreStoryGestureTarget: () => false,
    window: { matchMedia: () => ({ matches: true }) }
  });
  vm.runInContext(`
    let storySwipeStartY = null, storySwipeStartX = null, storySwipeEndY = null, storySwipeEndX = null;
    ${functionSource('function wireStoryGestures(', 'function closeStoryViewer(')}
    wireStoryGestures();
  `, context);

  listeners.get('touchstart')({ target: {}, touches: [{ clientX: 100, clientY: 100 }] });
  listeners.get('touchend')({ changedTouches: [{ clientX: 104, clientY: 190 }] });
  assert.equal(closes, 1);
  assert.equal(timers, 0);
});

test('Escape chiude soltanto la superficie Story più in alto', () => {
  const open = new Set(['usStoryViewer', 'usStoryDeleteConfirm']);
  const closed = [];
  const context = vm.createContext({
    closeProfilePreview: () => closed.push('profile'),
    closeStoryCamera: () => closed.push('camera'),
    closeStoryDeleteConfirmation: () => { closed.push('delete'); open.delete('usStoryDeleteConfirm'); },
    closeStoryViewer: () => closed.push('viewer'),
    document: { getElementById: (id) => ({ classList: { contains: (name) => name === 'open' && open.has(id) } }) }
  });
  vm.runInContext(functionSource('function handleStoryKeydown(', 'function startStoryRealtime('), context);

  context.handleStoryKeydown({ key: 'Escape', preventDefault() {} });
  assert.deepEqual(closed, ['delete']);
});

test('la caption lunga mantiene scroll verticale prioritario', () => {
  const rule = css.match(/\.us-story-caption\{[^}]+\}/)?.[0] || '';
  assert.match(rule, /max-height:/);
  assert.match(rule, /overflow-y:auto/);
  assert.match(rule, /touch-action:pan-y/);
  assert.match(rule, /pointer-events:auto/);
});

test('retry, manage e delete mantengono target touch da 44px', () => {
  for (const selector of ['us-story-retry', 'us-story-delete', 'us-camera-retry', 'us-camera-manage']) {
    const rule = css.match(new RegExp(`\\.${selector}\\{[^}]+\\}`))?.[0] || '';
    assert.match(rule, /min-(?:width|height):44px|width:44px/, `${selector}: larghezza touch`);
    assert.match(rule, /min-height:44px|height:44px/, `${selector}: altezza touch`);
    assert.match(css, new RegExp(`\\.${selector}\\[hidden\\]\\{display:none\\}`), `${selector}: hidden effettivo`);
  }
});

test('il controllo partner descrive esplicitamente lo stato Stories vuoto', () => {
  const context = vm.createContext({});
  vm.runInContext(functionSource('function storyPartnerLabel(', 'function renderStoryRings('), context);

  assert.equal(context.storyPartnerLabel({ display_name: 'Beatrice' }, 0), 'Beatrice non ha Stories attive');
  assert.equal(context.storyPartnerLabel({ display_name: 'Beatrice' }, 2), 'Apri le 2 Stories di Beatrice');
});
