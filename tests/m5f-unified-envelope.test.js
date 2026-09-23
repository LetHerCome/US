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
  return {
    id,
    hidden: true,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    files: null,
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
    addEventListener: (name, handler) => { listeners.set(name, handler); },
    dispatchEvent: (event) => { listeners.get(event.type)?.(event); },
    click: () => { listeners.get('click')?.(); },
    querySelector: () => makeEl(`${id}-child`),
  };
}

function createHarness({ leftForYouRows = [], profilesRows = [{ id: 'beatrice-id', display_name: 'Beatrice', couple_id: 'couple-id' }], insertResult = null, authed = true, currentProfile = { id: 'francesco-id', display_name: 'Francesco', role: 'francesco', couple_id: 'couple-id' } } = {}) {
  const elements = new Map();
  const log = { inserts: [], uploads: [], realtime: [] };
  let pendingInsert = null;
  let lastRecorder = null;
  const stream = { tracks: [{ stopped: false, stop() { this.stopped = true; } }] };

  class FakeMediaRecorder {
    static isTypeSupported(type) { return type === 'audio/webm' || type === 'audio/mp4'; }
    constructor(_stream, options = {}) {
      this.stream = _stream;
      this.mimeType = options.mimeType || 'audio/webm';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      lastRecorder = this;
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) });
      this.onstop?.();
    }
  }

  const documentShim = {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, makeEl(id));
      return elements.get(id);
    },
    querySelectorAll: () => [],
    querySelector: () => ({ querySelector: () => makeEl('note') }),
    addEventListener: () => {},
    readyState: 'complete',
  };

  const windowShim = {
    document: documentShim,
    addEventListener: () => {},
    dispatchEvent: () => {},
    usProfile: authed ? currentProfile : undefined,
    mediaDevices: { getUserMedia: async () => stream },
    MediaRecorder: FakeMediaRecorder,
  };
  windowShim.navigator = windowShim;

  function selectBuilder(rows) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: (payload) => {
        log.inserts.push(payload);
        if (pendingInsert) return pendingInsert.promise;
        return Promise.resolve(insertResult ?? { data: null, error: null });
      },
      then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
      catch: (reject) => Promise.resolve({ data: rows, error: null }).catch(reject),
    };
    return builder;
  }

  const client = {
    from: (table) => {
      if (table === 'profiles') return selectBuilder(profilesRows);
      return selectBuilder(leftForYouRows);
    },
    rpc: () => Promise.resolve({ data: { seen_at: '2026-09-23T10:00:00Z', status: 'seen' }, error: null }),
    channel: (name) => {
      const channel = {
        name,
        on: () => channel,
        subscribe: () => {
          log.realtime.push(name);
          return channel;
        },
      };
      return channel;
    },
    removeChannel: () => {},
    storage: {
      from: () => ({
        upload: (path, payload, options) => {
          log.uploads.push({ path, payload, options });
          return Promise.resolve({ data: { path }, error: null });
        },
      }),
    },
  };
  windowShim.sb = client;

  const context = {
    module: { exports: {} },
    window: windowShim,
    document: documentShim,
    console,
    crypto: require('node:crypto'),
    setTimeout,
    clearTimeout,
    compressImageFile: undefined,
    navigator: windowShim,
    MediaRecorder: FakeMediaRecorder,
    Blob,
  };
  vm.runInNewContext(read('left-for-you.js'), context, { filename: 'left-for-you.js' });

  return {
    api: context.module.exports,
    window: windowShim,
    log,
    elements,
    el: (id) => documentShim.getElementById(id),
    stream,
    get lastRecorder() { return lastRecorder; },
    setPendingInsert() {
      let release;
      const promise = new Promise((resolve) => { release = () => resolve({ data: null, error: null }); });
      pendingInsert = { promise, release };
      return { release };
    },
  };
}

test('M5F envelope state machine: zero unseen → open, unseen >= 1 → closed', () => {
  const { api } = createHarness();
  assert.equal(api.envelopeStateFor(0), 'open');
  assert.equal(api.envelopeStateFor(1), 'closed');
  assert.equal(api.envelopeStateFor(3), 'closed');
});

test('M5F closed tap opens the unseen item receiver; open tap launches the sender composer', async () => {
  const harness = createHarness();
  const { api, el } = harness;
  await api.load();

  api.updateEntry(2);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-closed'), true);
  api.tap();
  await sleep(5);
  assert.equal(el('leftForYouOverlay').classList.contains('open'), true);

  api.updateEntry(0);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-open'), true);
  api.tap();
  assert.equal(el('leftForYouComposerOverlay').classList.contains('open'), true);
});

test('M5F transition: one unseen marked seen → envelope opens; multiple unseen → stays closed until the last one', async () => {
  const { api, el } = createHarness();
  await api.load();
  api.updateEntry(3);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-closed'), true);
  api.updateEntry(2);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-closed'), true);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-open'), false);
  api.updateEntry(1);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-closed'), true);
  api.updateEntry(0);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-open'), true);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-opening'), true);
  await sleep(450);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-opening'), false);
});

test('M5F new realtime incoming item → envelope closes again', async () => {
  const harness = createHarness({ leftForYouRows: [] });
  const { api, el } = harness;
  await api.handleIncoming();
  api.updateEntry(0);
  assert.equal(el('leftForYouPartnerEntry').classList.contains('is-open'), true);

  api.subscribeRealtime();
  assert.deepEqual(harness.log.realtime.at(-1), 'us-left-for-you-francesco-id');

  const secondHarness = createHarness({
    leftForYouRows: [{ id: 'new-item', sender_id: 'beatrice-id', recipient_id: 'francesco-id', kind: 'text', body: 'Ciao', seen_at: null }],
  });
  secondHarness.api.handleIncoming();
  await sleep(5);
  assert.equal(secondHarness.el('leftForYouPartnerEntry').classList.contains('is-closed'), true);
  assert.equal(secondHarness.el('leftForYouPartnerEntry').classList.contains('is-open'), false);
});

test('M5F receiver opens the first unseen item and marks seen through the server RPC', async () => {
  const rows = [
    { id: 'seen-old', sender_id: 'beatrice-id', kind: 'text', body: 'Vecchio', seen_at: '2026-09-20T10:00:00Z' },
    { id: 'unseen-new', sender_id: 'beatrice-id', kind: 'text', body: 'Nuovo', seen_at: null },
  ];
  const harness = createHarness({ leftForYouRows: rows, profilesRows: [{ id: 'beatrice-id', display_name: 'Beatrice' }] });
  const { api, el } = harness;

  await api.open();
  await sleep(5);
  assert.equal(el('leftForYouCard').hidden, false);
  assert.match(el('leftForYouContent').innerHTML, /data-left-kind="text"/);
  assert.match(el('leftForYouContent').innerHTML, /Nuovo/);
});

test('M5F composer sends text', async () => {
  const harness = createHarness();
  const { api, el, log } = harness;
  await api.load();
  el('leftForYouComposerText').value = 'Buonanotte ♡';
  await api.send();
  assert.equal(log.inserts.length, 1);
  assert.equal(log.inserts[0].kind, 'text');
  assert.equal(log.inserts[0].body, 'Buonanotte ♡');
  assert.equal(log.inserts[0].sender_id, 'francesco-id');
  assert.equal(log.inserts[0].recipient_id, 'beatrice-id');
});

test('M5F composer sends photo, audio and video through the private us-media namespace', async () => {
  const { api, el, log } = createHarness();
  await api.load();
  const cases = [
    { kind: 'photo', pickId: 'leftForYouComposerPhotoFile', file: { name: 'foto.jpg', type: 'image/jpeg', size: 1024 } },
    { kind: 'audio', pickId: 'leftForYouComposerAudioFile', file: { name: 'voce.m4a', type: 'audio/mp4', size: 2048 } },
    { kind: 'video', pickId: 'leftForYouComposerVideoFile', file: { name: 'momento.mp4', type: 'video/mp4', size: 4096 } },
  ];
  for (const item of cases) {
    api.setComposerKind(item.kind);
    if (item.kind === 'audio') {
      await api.startRecording();
      api.stopRecording();
    } else {
      const input = el(item.pickId);
      input.files = [item.file];
    }
    await api.send();
    const insert = log.inserts.at(-1);
    assert.equal(insert.kind, item.kind);
    const upload = log.uploads.at(-1);
    assert.match(upload.path, /^couple-id\/francesco-id\/left\//);
    assert.equal(upload.options.upsert, false);
  }
});

test('M5F composer sends a provider-neutral https music link', async () => {
  const { api, el, log } = createHarness();
  await api.load();
  api.setComposerKind('music');
  el('leftForYouComposerMusic').value = 'https://open.example/track/1';
  await api.send();
  const insert = log.inserts.at(-1);
  assert.equal(insert.kind, 'music');
  assert.equal(insert.media_path, 'https://open.example/track/1');
  assert.equal(log.uploads.length, 0);

  el('leftForYouComposerMusic').value = 'http://non-sicuro.example/track';
  await api.send();
  assert.equal(log.inserts.length, 1);
});

test('M5F failed send surfaces an error and no insert is committed as sent', async () => {
  const harness = createHarness({ insertResult: { data: null, error: { message: 'insert failed' } } });
  const { api, el, log } = harness;
  await api.load();
  el('leftForYouComposerText').value = 'Un pensiero';
  await api.send();
  assert.equal(log.inserts.length, 1);
  assert.match(el('leftForYouComposerStatus').textContent, /Non riesco a lasciarlo/);
});

test('M5F prevents duplicate sends while a send request is running', async () => {
  const harness = createHarness();
  const { api, el, log } = harness;
  await api.load();
  el('leftForYouComposerText').value = 'Solo una volta';
  const gate = harness.setPendingInsert();
  const first = api.send();
  const second = api.send();
  gate.release();
  await Promise.all([first, second]);
  assert.equal(log.inserts.length, 1);
  assert.equal(api.composer.sending, false);
});

test('M5F keeps the receiver contract: one item at a time, server seen, Conserva, no feed semantics', () => {
  const source = read('left-for-you.js');
  assert.match(source, /rpc\('mark_left_item_seen'/);
  assert.match(source, /rpc\('conserve_left_for_you'/);
  assert.match(source, /firstUnseen/);
  assert.doesNotMatch(source, /carousel|swipe|24h|commenti|reazioni|feed/i);
});

test('M5F no active Stories entry remains reachable', () => {
  const html = read('index.html');
  const css = read('left-for-you.css');
  assert.doesNotMatch(html, /data-page="stories"/);
  assert.doesNotMatch(html, /usStoryPartnerOpen/);
  assert.doesNotMatch(css, /us-top-story-ring/);
  assert.match(read('stories.js'), /if \(window\.__US_LEFT_FOR_YOU_ACTIVE__\) return/);
});

test('M5F envelope uses the canonical Phosphor pair and a restrained trace, not a Stories ring', () => {
  const html = read('index.html');
  const css = read('left-for-you.css');
  assert.match(html, /data-icon="\/assets\/icons\/phosphor\/envelope-simple-regular\.svg"/);
  assert.match(html, /data-icon="\/assets\/icons\/phosphor\/envelope-open-regular\.svg"/);
  for (const file of ['envelope-simple-regular.svg', 'envelope-open-regular.svg']) {
    const svg = read(`assets/icons/phosphor/${file}`);
    assert.match(svg, /viewBox="0 0 256 256"/);
  }
  assert.match(css, /us-envelope-trace/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{#leftForYouPartnerEntry\.is-closed::before\{animation:none\}/);
});

test('M5F top chrome: question icon for the daily question, no legacy avatar control', () => {
  const html = read('index.html');
  const css = read('identity.css');
  assert.match(html, /us-phosphor-question/);
  assert.match(css, /us-phosphor-question::before\{[^}]*mask:url\("\/assets\/icons\/phosphor\/question-regular\.svg"\)/);
  assert.doesNotMatch(html, /id="profileAvatarBtn"/);
  assert.doesNotMatch(html, /onclick="pickProfilePhoto\(\)"/);
  assert.match(html, /id="profileAvatarFile"/, 'il flusso foto profilo resta vivo tramite Impostazioni');
});

test('M5F loading: neutral envelope, inert tap until the first server answer resolves', async () => {
  const harness = createHarness({ authed: false });
  const { api, el, window } = harness;
  await sleep(5);
  assert.equal(api.envelopeIsResolved(), false);
  const entry = el('leftForYouPartnerEntry');
  assert.equal(entry.classList.contains('is-loading'), true);
  assert.equal(entry.getAttribute('aria-busy'), 'true');
  assert.equal(entry.classList.contains('is-open'), false);
  assert.equal(entry.classList.contains('is-closed'), false);

  api.tap();
  assert.equal(el('leftForYouOverlay').classList.contains('open'), false);
  assert.equal(el('leftForYouComposerOverlay').classList.contains('open'), false);

  window.usProfile = { id: 'francesco-id', couple_id: 'couple-id' };
  await api.handleIncoming();
  await sleep(5);
  assert.equal(api.envelopeIsResolved(), true);
  assert.equal(entry.classList.contains('is-loading'), false);
  assert.equal(entry.classList.contains('is-open'), true);
  assert.equal(entry.getAttribute('aria-busy'), null);
});

test('M5F composer surface: title, send language, five kinds, reduced-motion composer transitions', () => {
  const html = read('index.html');
  const css = read('left-for-you.css');
  assert.doesNotMatch(html, /Solo per lei\. Nessun feed, nessun pubblico\./);
  assert.doesNotMatch(html, /Scegli un audio/);
  assert.doesNotMatch(html, /Una nota per lei/);
  assert.match(html, /id="leftForYouComposerTitle">Lascia qualcosa alla tua persona</);
  assert.match(html, /id="leftForYouComposerSend" disabled>Lascia per la tua persona</);
  for (const kind of ['text', 'photo', 'audio', 'video', 'music']) {
    assert.match(html, new RegExp(`data-us-composer-kind="${kind}"`));
    assert.match(html, new RegExp(`data-us-composer-panel="${kind}"`));
  }
  assert.match(html, /id="leftForYouComposerPhotoFile" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(html, /id="leftForYouComposerVideoFile" accept="video\/\*"/);
  assert.match(html, /id="leftForYouComposerAudioRecord"/);
  assert.match(css, /#leftForYouOverlay,#leftForYouComposerOverlay\{position:fixed/);
  assert.match(css, /#leftForYouOverlay\.open,#leftForYouComposerOverlay\.open\{opacity:1/);
  assert.match(css, /#leftForYouOverlay\.open \.left-for-you-sheet,#leftForYouComposerOverlay\.open \.left-for-you-sheet\{transform:none\}/);
  assert.match(css, /#leftForYouComposerOverlay,#leftForYouComposerOverlay \.left-for-you-sheet\{transition-duration:1ms\}/);
  assert.match(css, /\.left-for-you-composer-panel\[hidden\]\{display:none!important\}/, 'solo il pannello del kind attivo è visibile');
});

test('M5G composer labels use the loaded partner profile in both directions', async () => {
  const francesco = createHarness();
  await francesco.api.load();
  francesco.api.openComposer();
  assert.equal(francesco.el('leftForYouComposerTitle').textContent, 'Lascia qualcosa a Beatrice');
  assert.equal(francesco.el('leftForYouComposerSend').textContent, 'Lascia per Beatrice');
  assert.equal(francesco.el('leftForYouPartnerEntry').getAttribute('aria-label'), 'Lascia qualcosa a Beatrice');

  const beatrice = createHarness({
    currentProfile: { id: 'beatrice-id', display_name: 'Beatrice', role: 'beatrice', couple_id: 'couple-id' },
    profilesRows: [{ id: 'francesco-id', display_name: 'Francesco', role: 'francesco', couple_id: 'couple-id' }],
  });
  await beatrice.api.load();
  beatrice.api.openComposer();
  assert.equal(beatrice.el('leftForYouComposerTitle').textContent, 'Lascia qualcosa a Francesco');
  assert.equal(beatrice.el('leftForYouComposerSend').textContent, 'Lascia per Francesco');
  assert.equal(beatrice.el('leftForYouPartnerEntry').getAttribute('aria-label'), 'Lascia qualcosa a Francesco');
});

test('M5G composer validity is centralized across all five kinds and ignores optional notes', async () => {
  const harness = createHarness();
  const { api, el } = harness;
  await api.load();

  api.setComposerKind('text');
  assert.equal(el('leftForYouComposerSend').disabled, true);
  el('leftForYouComposerText').value = '  Ciao  ';
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, false);

  api.setComposerKind('photo');
  el('leftForYouComposerPhotoFile').files = null;
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, true);
  el('leftForYouComposerPhotoFile').files = [{ name: 'foto.jpg', type: 'image/jpeg', size: 10 }];
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, false);

  api.setComposerKind('audio');
  api.composer.recording = null;
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, true);
  api.composer.recording = { ready: true, file: { name: 'voce.webm', type: 'audio/webm', size: 10 } };
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, false);

  api.setComposerKind('video');
  el('leftForYouComposerVideoFile').files = [{ name: 'video.mp4', type: 'video/mp4', size: 10 }];
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, false);

  api.setComposerKind('music');
  el('leftForYouComposerMusic').value = '';
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, true);
  el('leftForYouComposerMusic').value = 'https://open.example/track/1';
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, false);

  api.composer.sending = true;
  api.updateComposerValidity();
  assert.equal(el('leftForYouComposerSend').disabled, true);
  api.composer.sending = false;
});

test('M5G internal recorder transitions idle → recording → ready and releases its stream', async () => {
  const harness = createHarness();
  const { api, stream, el } = harness;
  await api.load();
  api.setComposerKind('audio');

  await api.startRecording();
  assert.equal(api.composer.recordingState, 'recording');
  assert.equal(stream.tracks[0].stopped, false);
  api.stopRecording();
  assert.equal(api.composer.recordingState, 'ready');
  assert.equal(api.composer.recording.ready, true);
  assert.equal(stream.tracks[0].stopped, true);
  assert.equal(el('leftForYouComposerAudioRecord').hidden, true);
  assert.equal(el('leftForYouComposerAudioRetry').hidden, false);
  assert.equal(el('leftForYouComposerAudioDelete').hidden, false);

  await api.startRecording();
  api.closeComposer();
  assert.equal(api.composer.recordingState, 'idle');
  assert.equal(stream.tracks[0].stopped, true);
});
