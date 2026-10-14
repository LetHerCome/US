// US 1.0 · Lasciato per te corrections (L1, L2, L3, L5, L6, L8) and the
// public composer API other areas call: window.UsLeftForYou.openComposer(options).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setTimeout: sleep } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function makeEl(id) {
  const classes = new Set();
  const attrs = {};
  const listeners = new Map();
  const el = {
    id,
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    files: null,
    isConnected: true,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const next = force === undefined ? !classes.has(name) : Boolean(force);
        if (next) classes.add(name); else classes.delete(name);
        return next;
      },
    },
    setAttribute: (name, value) => { attrs[name] = String(value); },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    removeAttribute: (name) => { delete attrs[name]; },
    addEventListener: (name, handler) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener: (name, handler) => { listeners.get(name)?.delete(handler); },
    fire: (name) => { [...(listeners.get(name) || [])].forEach((handler) => handler({ type: name })); },
    click: () => el.fire('click'),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return el;
}

function createHarness({ rows = [], sentRows = [], kept = [], native = false, ios = false } = {}) {
  const elements = new Map();
  const log = { inserts: [], rpcs: [], queries: [] };
  // The viewer content: each render makes a fresh media element, like innerHTML does.
  const content = makeEl('leftForYouContent');
  let media = null;
  Object.defineProperty(content, 'innerHTML', {
    get() { return this._html || ''; },
    set(value) {
      if (media) media.isConnected = false;
      this._html = value;
      media = /<(img|audio|video)\b/.exec(value) ? makeEl('media') : null;
      if (media) { media.complete = false; media.naturalWidth = 0; media.readyState = 0; }
    },
  });
  content.querySelector = () => media;
  elements.set('leftForYouContent', content);

  const documentShim = {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, makeEl(id));
      return elements.get(id);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (tag) => makeEl(`created-${tag}`),
    addEventListener: () => {},
    readyState: 'complete',
    documentElement: { classList: { contains: (name) => ios && name === 'us-native-ios' } },
  };

  function builder(table) {
    const filters = {};
    const b = {
      select: () => b,
      eq: (column, value) => { filters[column] = value; return b; },
      is: () => b,
      order: () => b,
      limit: () => b,
      insert: (payload) => {
        log.inserts.push(payload);
        const done = Promise.resolve({ data: { id: 'new-item' }, error: null });
        return { select: () => ({ single: () => done }) };
      },
      then: (resolve, reject) => {
        log.queries.push({ table, filters: { ...filters } });
        let data = [];
        if (table === 'profiles') data = [{ id: 'bea-id', display_name: 'Bea', couple_id: 'couple-id' }];
        if (table === 'left_for_you') data = filters.sender_id ? sentRows : rows;
        if (table === 'conserva_contributions') data = kept.filter((row) => row.source_item_id === filters.source_item_id);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return b;
  }

  const windowShim = {
    document: documentShim,
    addEventListener: () => {},
    dispatchEvent: () => {},
    usProfile: { id: 'fra-id', display_name: 'Fra', role: 'francesco', couple_id: 'couple-id' },
    UsPlatform: { isNative: native },
    sendWebPushEvent: async () => ({}),
    sb: {
      from: builder,
      rpc: (name, args) => { log.rpcs.push({ name, args }); return Promise.resolve({ data: { seen_at: '2026-10-14T10:00:00Z' }, error: null }); },
      channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
      removeChannel: () => {},
      storage: { from: () => ({ upload: (p) => Promise.resolve({ data: { path: p }, error: null }) }) },
    },
    usGetSignedUrl: async (p) => `https://signed.example/${p}`,
  };
  windowShim.navigator = windowShim;
  const context = {
    module: { exports: {} }, window: windowShim, document: documentShim, console, crypto: require('node:crypto'),
    URL, setTimeout, clearTimeout, navigator: windowShim, Blob, globalThis: {},
  };
  context.globalThis = context;
  require('./helpers/identity-fixture').install(context, [
    { id: 'fra-id', role: 'francesco', display_name: 'Fra' },
    { id: 'bea-id', role: 'beatrice', display_name: 'Bea' },
  ]);
  vm.runInNewContext(read('left-for-you.js'), context, { filename: 'left-for-you.js' });
  const el = (id) => documentShim.getElementById(id);
  return { api: context.module.exports, el, log, media: () => media, window: windowShim };
}

const seenCalls = (log) => log.rpcs.filter(({ name }) => name === 'mark_left_item_seen');

test('L1 viewer says it opens once, shows the oldest first and hides "Apri il prossimo" on the last one', async () => {
  const html = read('index.html');
  assert.match(html, /id="leftForYouOnce">Si apre una volta: conservalo se vuoi tenerlo\.</);
  assert.match(read('left-for-you.js'), /order\('created_at', \{ ascending: true \}\)/);

  const { api, el, log } = createHarness({ rows: [
    { id: 'new', sender_id: 'bea-id', kind: 'text', body: 'Secondo', created_at: '2026-10-14T09:00:00Z', seen_at: null },
    { id: 'old', sender_id: 'bea-id', kind: 'text', body: 'Primo', created_at: '2026-10-14T08:00:00Z', seen_at: null },
  ] });
  await api.open();
  assert.match(el('leftForYouContent').innerHTML, /Primo/);
  assert.equal(el('leftForYouCounter').textContent, '1 di 2');
  assert.equal(el('leftForYouNext').hidden, false);
  assert.equal(el('leftForYouOnce').hidden, false);
  assert.deepEqual(seenCalls(log).map(({ args }) => args.target_item_id), ['old']);

  el('leftForYouNext').click();
  await sleep(5);
  assert.match(el('leftForYouContent').innerHTML, /Secondo/);
  assert.equal(el('leftForYouCounter').textContent, '2 di 2');
  assert.equal(el('leftForYouNext').hidden, true);

  await api.conserve();
  assert.equal(el('leftForYouOnce').hidden, true, 'once kept, the warning has done its job');
});

test('L1 a photo, a vocale or a video is marked opened only once its media has loaded', async () => {
  for (const [kind, event] of [['photo', 'load'], ['audio', 'loadedmetadata'], ['video', 'loadeddata']]) {
    const harness = createHarness({ rows: [{ id: `${kind}-1`, sender_id: 'bea-id', kind, media_path: `couple-id/bea-id/left/${kind}.bin`, created_at: '2026-10-14T08:00:00Z', seen_at: null }] });
    await harness.api.open();
    assert.equal(seenCalls(harness.log).length, 0, `${kind}: not seen before it loads`);
    harness.media().fire(event);
    await sleep(5);
    assert.equal(seenCalls(harness.log).length, 1, `${kind}: seen once loaded`);
    harness.media().fire(event);
    await sleep(5);
    assert.equal(seenCalls(harness.log).length, 1, `${kind}: seen only once`);
  }
});

test('L1 a photo that loads after the viewer was closed or skipped stays waiting', async () => {
  const closed = createHarness({ rows: [{ id: 'p1', sender_id: 'bea-id', kind: 'photo', media_path: 'x', created_at: '2026-10-14T08:00:00Z', seen_at: null }] });
  await closed.api.open();
  const media = closed.media();
  closed.api.close();
  media.fire('load');
  await sleep(5);
  assert.equal(seenCalls(closed.log).length, 0);

  const skipped = createHarness({ rows: [
    { id: 'p1', sender_id: 'bea-id', kind: 'photo', media_path: 'x', created_at: '2026-10-14T08:00:00Z', seen_at: null },
    { id: 't2', sender_id: 'bea-id', kind: 'text', body: 'Dopo', created_at: '2026-10-14T09:00:00Z', seen_at: null },
  ] });
  await skipped.api.open();
  const photo = skipped.media();
  skipped.el('leftForYouNext').click();
  await sleep(5);
  photo.fire('load');
  await sleep(5);
  assert.deepEqual(seenCalls(skipped.log).map(({ args }) => args.target_item_id), ['t2']);
});

test('L2 Rispondi closes the viewer and opens the composer on text, addressed to the partner', async () => {
  const html = read('index.html');
  assert.match(html, /<button type="button" id="leftForYouReply">Rispondi<\/button>/);
  const { api, el } = createHarness({ rows: [{ id: 't1', sender_id: 'bea-id', kind: 'text', body: 'Ciao', created_at: '2026-10-14T08:00:00Z', seen_at: null }] });
  await api.open();
  api.setComposerKind('music');
  el('leftForYouReply').click();
  assert.equal(el('leftForYouOverlay').classList.contains('open'), false);
  assert.equal(el('leftForYouComposerOverlay').classList.contains('open'), true);
  assert.equal(api.composer.kind, 'text');
  assert.equal(el('leftForYouComposerTitle').textContent, 'Lascia qualcosa a Bea');
});

test('Composer API: openComposer() is unchanged, {kind} picks a tab, {text} opens the text composer prefilled', () => {
  const { api, el } = createHarness();
  api.setComposerKind('photo');
  el('leftForYouComposerText').value = 'bozza';
  api.openComposer();
  assert.equal(api.composer.kind, 'photo', 'no argument: same tab as before');
  assert.equal(el('leftForYouComposerText').value, 'bozza', 'no argument: draft untouched');
  api.closeComposer();

  api.openComposer({ kind: 'voice' });
  assert.equal(api.composer.kind, 'audio');
  api.openComposer({ kind: 'nope' });
  assert.equal(api.composer.kind, 'audio', 'an unknown kind changes nothing');
  api.openComposer({ text: 'Mi mandi le tue foto di quel giorno?' });
  assert.equal(api.composer.kind, 'text');
  assert.equal(el('leftForYouComposerText').value, 'Mi mandi le tue foto di quel giorno?');
  assert.equal(el('leftForYouComposerSend').disabled, false, 'prefilled text is ready to send');
  api.openComposer({ type: 'click', target: {} });
  assert.equal(api.composer.kind, 'text', 'an event object passed by a click handler is ignored');
});

test('L3 the sender sees what happened to the last thing they left', async () => {
  const { api } = createHarness();
  const now = new Date(2026, 9, 14, 12, 0);
  const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();
  const last = (seen) => ({ id: 'x', created_at: at(12, 9, 0), seen_at: seen });
  assert.equal(api.lastOutcomeText(last(null), { now }), "L'ultima cosa che hai lasciato a Bea: ancora da aprire.");
  assert.equal(api.lastOutcomeText(last(at(14, 9, 5)), { now }), "L'ultima cosa che hai lasciato a Bea: aperta oggi alle 9:05.");
  assert.equal(api.lastOutcomeText(last(at(13, 21, 40)), { now }), "L'ultima cosa che hai lasciato a Bea: aperta ieri alle 21:40.");
  assert.equal(api.lastOutcomeText(last(at(10, 21, 40)), { now }), "L'ultima cosa che hai lasciato a Bea: aperta sabato alle 21:40.");
  assert.equal(api.lastOutcomeText({ id: 'x', created_at: at(1, 9, 0), seen_at: at(2, 8, 0) }, { now }), "L'ultima cosa che hai lasciato a Bea: aperta il 2 ottobre alle 8:00.");
  assert.equal(api.lastOutcomeText(last(at(13, 21, 40)), { now, conserved: true }), "L'ultima cosa che hai lasciato a Bea: conservata.");
  assert.equal(api.lastOutcomeText({ id: 'x', created_at: new Date(2026, 8, 1).toISOString(), seen_at: null }, { now }), '', 'older than 30 days: maybe no longer the last one');
  assert.equal(api.lastOutcomeText(null, { now }), '');
});

test('L3 the outcome line is read from the sender rows and Conserva, and hidden when there is nothing', async () => {
  const recent = new Date(Date.now() - 3600000).toISOString();
  const kept = createHarness({ sentRows: [{ id: 'mine', created_at: recent, seen_at: recent }], kept: [{ id: 'c1', source_item_id: 'mine' }] });
  kept.api.openComposer();
  await sleep(5);
  assert.equal(kept.el('leftForYouComposerLast').hidden, false);
  assert.equal(kept.el('leftForYouComposerLast').textContent, "L'ultima cosa che hai lasciato a Bea: conservata.");
  const query = kept.log.queries.find(({ table, filters }) => table === 'left_for_you' && filters.sender_id);
  assert.deepEqual(query.filters, { sender_id: 'fra-id', couple_id: 'couple-id' });

  const none = createHarness();
  none.api.openComposer();
  await sleep(5);
  assert.equal(none.el('leftForYouComposerLast').hidden, true);
});

test('L5/L6 voice is "un vocale"; photo and vocale send an optional caption, the photo shows a preview', async () => {
  const html = read('index.html');
  assert.match(html, /data-us-composer-kind="audio">Vocale</);
  assert.match(html, /id="leftForYouComposerPhotoCaption" maxlength="280"/);
  assert.match(html, /id="leftForYouComposerAudioCaption" maxlength="280"/);
  assert.match(html, /id="leftForYouComposerPhotoPreviewImage"/);
  const { api, el, log } = createHarness();
  await sleep(5); // the partner profile is loaded at boot
  assert.equal(api.labelForKind('audio'), 'Un vocale');

  api.setComposerKind('photo');
  el('leftForYouComposerPhotoFile').files = [new Blob(['photo'], { type: 'image/jpeg' })];
  el('leftForYouComposerPhotoCaption').value = '  Ti ricordi?  ';
  api.updateComposerValidity();
  await api.send();
  assert.equal(log.inserts.at(-1).kind, 'photo');
  assert.equal(log.inserts.at(-1).body, 'Ti ricordi?');
  assert.equal(el('leftForYouComposerPhotoCaption').value, '', 'caption cleared after sending');

  api.setComposerKind('audio');
  api.composer.recording = { ready: true, file: new Blob(['voice'], { type: 'audio/webm' }), url: '', duration: 2, levels: [] };
  api.composer.recordingState = 'ready';
  el('leftForYouComposerAudioCaption').value = 'Buongiorno';
  await api.send();
  assert.equal(log.inserts.at(-1).kind, 'audio');
  assert.equal(log.inserts.at(-1).body, 'Buongiorno');

  api.setComposerKind('video');
  el('leftForYouComposerVideoFile').files = [{ name: 'v.mp4', type: 'video/mp4', size: 10 }];
  el('leftForYouComposerPhotoCaption').value = 'non per il video';
  await api.send();
  assert.equal(log.inserts.at(-1).kind, 'video');
  assert.equal(log.inserts.at(-1).body, null);
});

test('L6 the chosen photo is previewed and "Cambia foto" goes back to the choice', () => {
  const { api, el, window } = createHarness();
  let made = 0; let revoked = 0;
  window.URL = { createObjectURL: () => `blob:preview-${++made}`, revokeObjectURL: () => { revoked += 1; } };
  api.setComposerKind('photo');
  el('leftForYouComposerPhotoFile').files = [new Blob(['photo'], { type: 'image/jpeg' })];
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerPhotoPreview').hidden, false);
  assert.equal(el('leftForYouComposerPhotoPreviewImage').src, 'blob:preview-1');
  assert.equal(el('leftForYouComposerPhotoActions').hidden, true);
  assert.equal(el('leftForYouComposerPhotoName').textContent, '', 'no file name next to a preview');
  el('leftForYouComposerPhotoFile').files = null;
  el('leftForYouComposerPhotoChange').click();
  assert.equal(el('leftForYouComposerPhotoPreview').hidden, true);
  assert.equal(el('leftForYouComposerPhotoActions').hidden, false);
  assert.equal(revoked, 1);
  assert.doesNotMatch(read('index.html') + read('left-for-you.js'), /autodistrugg/i);
});

test('L8 a refused camera or microphone says where to turn it back on', async () => {
  const deny = async (harness, device) => {
    const refused = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    harness.window.mediaDevices = { getUserMedia: async () => { throw refused; }, enumerateDevices: async () => [] };
    harness.window.MediaRecorder = class {};
    if (device === 'camera') await harness.api.openCamera(); else await harness.api.startRecording();
    return harness.el('leftForYouComposerStatus').textContent;
  };
  assert.equal(await deny(createHarness({ native: true }), 'camera'), 'Manca il permesso per la fotocamera. Attivalo da Impostazioni del telefono › App › US › Autorizzazioni.');
  assert.equal(await deny(createHarness({ native: true }), 'microphone'), 'Manca il permesso per il microfono. Attivalo da Impostazioni del telefono › App › US › Autorizzazioni.');
  assert.equal(await deny(createHarness({ native: true, ios: true }), 'camera'), 'Manca il permesso per la fotocamera. Attivalo da Impostazioni del telefono › US.');
  assert.equal(await deny(createHarness(), 'microphone'), 'Manca il permesso per il microfono. Attivalo dalle impostazioni del browser per questo sito.');
});

test('every new Italian text has its English in i18n-new-lasciato.json', () => {
  const entries = JSON.parse(read('i18n-new-lasciato.json'));
  const i18n = require(path.join(ROOT, 'i18n.js'));
  const dict = i18n.compile(entries);
  const samples = [
    'Si apre una volta: conservalo se vuoi tenerlo.',
    'Un vocale',
    'Vocale',
    'Didascalia (facoltativa)',
    "L'ultima cosa che hai lasciato a Bea: ancora da aprire.",
    "L'ultima cosa che hai lasciato alla tua persona: conservata.",
    "L'ultima cosa che hai lasciato a Bea: aperta ieri alle 9:40 PM.",
    "L'ultima cosa che hai lasciato a Bea: aperta Monday alle 9:40 PM.",
    "L'ultima cosa che hai lasciato a Bea: aperta il October 2 alle 8:00 AM.",
    'Manca il permesso per la fotocamera. Attivalo da Impostazioni del telefono › App › US › Autorizzazioni.',
  ];
  for (const text of samples) assert.notEqual(i18n.lookup(dict, text), null, text);
  assert.equal(i18n.lookup(dict, "L'ultima cosa che hai lasciato a Bea: aperta Monday alle 9:40 PM."), 'The last thing you left for Bea: opened Monday at 9:40 PM.');
  assert.equal(i18n.lookup(dict, "L'ultima cosa che hai lasciato a Bea: aperta il October 2 alle 8:00 AM."), 'The last thing you left for Bea: opened on October 2 at 8:00 AM.');
});
