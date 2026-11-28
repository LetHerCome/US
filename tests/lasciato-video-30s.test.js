// Lasciato per te: video di 30 secondi pieni (27/11/2026). «Fai un video»
// records inside US where the WebView makes an MP4 (getUserMedia +
// MediaRecorder, ~720p, 3 Mbit/s + 128 kbit/s), stops by itself at 30 s and
// goes through the gallery video's checks and upload. Elsewhere the phone
// camera, as before. A refused camera says where to turn it back on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); await new Promise((resolve) => setImmediate(resolve)); };
const MP4 = 'video/mp4;codecs=avc1.42E01F,mp4a.40.2';

function makeEl(id, tag = 'div') {
  const classes = new Set();
  const attrs = {};
  const listeners = new Map();
  const el = {
    id, tagName: tag.toUpperCase(), hidden: false, disabled: false, value: '', textContent: '', innerHTML: '', dataset: {}, files: null, isConnected: true,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => { const next = force === undefined ? !classes.has(name) : Boolean(force); if (next) classes.add(name); else classes.delete(name); return next; },
    },
    setAttribute: (name, value) => { attrs[name] = String(value); },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    removeAttribute: (name) => { delete attrs[name]; },
    addEventListener: (name, handler) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener: (name, handler) => { listeners.get(name)?.delete(handler); },
    fire: (name, extra = {}) => { [...(listeners.get(name) || [])].forEach((handler) => handler({ type: name, target: el, ...extra })); },
    click: () => el.fire('click'),
    play: () => Promise.resolve(),
    pause: () => {},
    load: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return el;
}

function createHarness({ native = false, ios = false, types = [MP4], gum, probeSeconds = 12, openSettings } = {}) {
  const elements = new Map();
  const log = { inserts: [], uploads: [], gum: [], recorders: [], inputClicks: 0, settingsCalls: 0, stopped: 0 };
  const clock = { now: 1_800_000_000_000, timers: [] };
  let timerId = 0;
  const fakeSetTimeout = (fn, ms = 0) => { const id = ++timerId; clock.timers.push({ id, at: clock.now + ms, fn }); return id; };
  const fakeClear = (id) => { clock.timers = clock.timers.filter((timer) => timer.id !== id); };
  const fakeSetInterval = (fn, ms) => { const id = ++timerId; clock.timers.push({ id, at: clock.now + ms, fn, every: ms }); return id; };
  const advance = (ms) => {
    const end = clock.now + ms;
    for (;;) {
      const next = clock.timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      clock.now = next.at;
      if (next.every) next.at += next.every; else fakeClear(next.id);
      next.fn();
    }
    clock.now = end;
  };
  class FakeDate extends Date { static now() { return clock.now; } }

  const windowListeners = new Map();
  const tracks = () => [{ kind: 'video', stop() { log.stopped += 1; } }, { kind: 'audio', stop() { log.stopped += 1; } }];
  class FakeRecorder {
    static isTypeSupported(type) { return types.includes(type); }
    constructor(stream, options) { this.stream = stream; this.options = options; this.mimeType = options?.mimeType || ''; this.state = 'inactive'; log.recorders.push(this); }
    start(slice) { this.state = 'recording'; this.slice = slice; }
    emit(bytes) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) }); }
    stop() { if (this.state === 'inactive') return; this.state = 'inactive'; this.emit(1024); this.onstop?.(); }
  }

  const documentShim = {
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (tag) => {
      const el = makeEl(`created-${tag}`, tag);
      if (tag === 'video') {
        // The metadata probe of videoProblem(): it answers with probeSeconds.
        Object.defineProperty(el, 'src', { set(value) { if (value) Promise.resolve().then(() => { el.duration = probeSeconds; el.fire('loadedmetadata'); }); }, get() { return ''; } });
      }
      return el;
    },
    addEventListener: () => {},
    readyState: 'complete',
    documentElement: { classList: { contains: (name) => ios && name === 'us-native-ios' } },
  };
  documentShim.getElementById('leftForYouComposerOverlay').classList.add('open');

  function builder(table) {
    const b = {
      select: () => b, eq: () => b, is: () => b, order: () => b, limit: () => b,
      insert: (payload) => { log.inserts.push(payload); const done = Promise.resolve({ data: { id: 'new-item' }, error: null }); return { select: () => ({ single: () => done }) }; },
      then: (resolve, reject) => Promise.resolve({ data: table === 'profiles' ? [{ id: 'bea-id', display_name: 'Bea', couple_id: 'couple-id' }] : [], error: null }).then(resolve, reject),
    };
    return b;
  }

  const platform = { isNative: native };
  if (openSettings) { platform.openWidgetSettings = async () => { log.settingsCalls += 1; return openSettings(); }; platform.hasWidgetBridge = () => true; }
  const windowShim = {
    document: documentShim,
    addEventListener: (name, handler) => { if (!windowListeners.has(name)) windowListeners.set(name, []); windowListeners.get(name).push(handler); },
    dispatchEvent: () => {},
    usProfile: { id: 'fra-id', display_name: 'Fra', role: 'francesco', couple_id: 'couple-id' },
    UsPlatform: platform,
    MediaRecorder: types === null ? undefined : FakeRecorder,
    mediaDevices: {
      getUserMedia: async (constraints) => { log.gum.push(constraints); if (gum) return gum(constraints); return { getTracks: tracks }; },
      enumerateDevices: async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }],
    },
    sendWebPushEvent: async () => ({}),
    sb: {
      from: builder,
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
      removeChannel: () => {},
      storage: { from: (bucket) => ({ upload: (p, payload, options) => { log.uploads.push({ bucket, path: p, payload, options }); return Promise.resolve({ data: { path: p }, error: null }); } }) },
    },
  };
  windowShim.navigator = windowShim;
  const context = {
    module: { exports: {} }, window: windowShim, document: documentShim, console: { ...console, warn() {} }, crypto: require('node:crypto'),
    URL, Blob, File, Date: FakeDate, setTimeout: fakeSetTimeout, clearTimeout: fakeClear, setInterval: fakeSetInterval, clearInterval: fakeClear,
    navigator: windowShim, globalThis: {},
  };
  context.globalThis = context;
  require('./helpers/identity-fixture').install(context, [
    { id: 'fra-id', role: 'francesco', display_name: 'Fra' },
    { id: 'bea-id', role: 'beatrice', display_name: 'Bea' },
  ]);
  vm.runInNewContext(read('left-for-you.js'), context, { filename: 'left-for-you.js' });
  const el = (id) => documentShim.getElementById(id);
  const fireWindow = (name, detail) => (windowListeners.get(name) || []).forEach((handler) => handler({ type: name, ...detail }));
  const videoInput = el('leftForYouComposerVideoFile');
  videoInput.setAttribute('accept', 'video/mp4,video/webm,video/quicktime');
  videoInput.addEventListener('click', () => { log.inputClicks += 1; });
  return { api: context.module.exports, el, log, advance, fireWindow };
}

test('the in-app recorder is used only where an MP4 (H.264 + AAC) recorder and getUserMedia exist', () => {
  assert.equal(createHarness().api.canRecordVideoInApp(), true);
  assert.equal(createHarness().api.videoRecordingMimeType(), MP4);
  assert.equal(createHarness({ types: null }).api.canRecordVideoInApp(), false, 'no MediaRecorder');
  assert.equal(createHarness({ types: ['video/webm', 'video/webm;codecs=vp8'] }).api.canRecordVideoInApp(), false, 'WebM only: never uploaded from here');
  // WebKit: a bare video/mp4 is H.264 + AAC. Where VP9 fits in MP4, a bare type could be VP9: not used.
  assert.equal(createHarness({ types: ['video/mp4'] }).api.videoRecordingMimeType(), 'video/mp4');
  assert.equal(createHarness({ types: ['video/mp4', 'video/mp4;codecs=vp9'] }).api.videoRecordingMimeType(), '');
});

test('without an MP4 recorder «Fai un video» is still the phone camera (capture input)', async () => {
  const { el, log } = createHarness({ types: ['video/webm'] });
  el('leftForYouComposerVideoCamera').click();
  await flush();
  assert.equal(log.inputClicks, 1);
  assert.equal(el('leftForYouComposerVideoFile').getAttribute('capture'), 'environment');
  assert.equal(log.gum.length, 0);
});

test('«Fai un video» opens the US viewfinder with sound, records at the safe bitrate and stops by itself at 30 s', async () => {
  const { api, el, log, advance } = createHarness({ probeSeconds: 30.02 });
  api.setComposerKind('video');
  el('leftForYouComposerVideoCamera').click();
  await flush();
  assert.equal(log.inputClicks, 0, 'no system camera');
  assert.equal(log.gum.length, 1);
  const constraints = log.gum[0];
  assert.equal(constraints.audio, true, 'with sound');
  assert.equal(constraints.video.facingMode, 'environment', 'the back camera first');
  assert.deepEqual([constraints.video.width.ideal, constraints.video.height.ideal], [1280, 720]);
  assert.equal(api.composer.cameraOpen, true);
  assert.equal(el('leftForYouCameraOverlay').getAttribute('data-mode'), 'video');
  assert.equal(el('leftForYouCameraTitle').textContent, 'Fai un video');
  assert.equal(el('leftForYouCameraKicker').textContent, 'VIDEO PRIVATO');
  assert.equal(el('leftForYouCameraTimer').hidden, false);
  assert.equal(el('leftForYouCameraTimer').textContent, '0:00 / 0:30');
  assert.equal(el('leftForYouCameraCapture').getAttribute('aria-label'), 'Inizia il video');

  el('leftForYouCameraCapture').click();
  const [recorder] = log.recorders;
  assert.ok(recorder, 'recording');
  assert.equal(recorder.options.mimeType, MP4);
  assert.equal(recorder.options.videoBitsPerSecond, 3000000);
  assert.equal(recorder.options.audioBitsPerSecond, 128000);
  assert.equal(recorder.slice, 1000, 'chunks every second, so the size is watched');
  assert.equal(el('leftForYouCameraCapture').getAttribute('aria-label'), 'Ferma il video');
  assert.equal(el('leftForYouCameraCapture').classList.contains('is-recording'), true);
  assert.equal(el('leftForYouCameraSwitch').hidden, true, 'no camera switch while recording');

  advance(12_000);
  recorder.emit(4 * 1024 * 1024);
  assert.equal(el('leftForYouCameraTimer').textContent, '0:12 / 0:30');
  advance(17_900);
  assert.equal(recorder.state, 'recording', 'still recording at 29.9 s');
  advance(200);
  assert.equal(recorder.state, 'inactive', 'stopped by itself at 30 s');
  const take = api.composer.videoCapture;
  assert.ok(take, 'a take to review');
  assert.equal(take.seconds, 30);
  assert.equal(take.file.type, 'video/mp4', 'plain MP4, whatever codecs the recorder names');
  assert.match(take.file.name, /^video-\d+\.mp4$/);
  assert.equal(el('leftForYouCameraRecorded').hidden, false);
  assert.equal(el('leftForYouCameraUse').hidden, false);
  assert.equal(el('leftForYouCameraUse').textContent, 'Usa video');
  assert.equal(el('leftForYouCameraRetake').hidden, false);
  assert.equal(log.stopped, 2, 'camera and microphone off while reviewing');

  el('leftForYouCameraUse').click();
  await flush();
  assert.equal(api.composer.cameraOpen, false);
  assert.equal(api.composer.videoTake.file, take.file);
  assert.equal(el('leftForYouComposerVideoName').textContent, 'Video registrato · 0:30');
  assert.equal(api.composerCanSend(), true);

  await api.send();
  await flush();
  assert.equal(log.uploads.length, 1);
  assert.equal(log.uploads[0].bucket, 'us-media');
  assert.match(log.uploads[0].path, /^couple-id\/fra-id\/left\/\d+-[0-9a-f-]+\.mp4$/);
  assert.equal(log.uploads[0].options.contentType, 'video/mp4');
  assert.equal(log.inserts[0].kind, 'video');
  assert.equal(api.composer.videoTake, null, 'sent: the composer is empty again');
});

test('a take is checked like a gallery video before it can be used', async () => {
  const { api, el, log, advance } = createHarness({ probeSeconds: 31.2 });
  await api.openVideoCamera();
  el('leftForYouCameraCapture').click();
  advance(5_000);
  el('leftForYouCameraCapture').click();
  assert.ok(api.composer.videoCapture);
  el('leftForYouCameraUse').click();
  await flush();
  assert.equal(el('leftForYouCameraStatus').textContent, 'Il video è troppo lungo (massimo 30 secondi).');
  assert.equal(api.composer.videoTake, null);
  assert.equal(api.composer.cameraOpen, true, 'still in the camera, «Rifai» is there');
  el('leftForYouCameraRetake').click();
  await flush();
  assert.equal(api.composer.videoCapture, null);
  assert.equal(log.gum.length, 2, 'the camera turns back on');
  assert.equal(el('leftForYouCameraTimer').textContent, '0:00 / 0:30');
});

test('an encoder that ignores the bitrate is stopped before 20 MB and the take stays under the limit', async () => {
  const { api, el, log, advance } = createHarness();
  await api.openVideoCamera();
  el('leftForYouCameraCapture').click();
  const [recorder] = log.recorders;
  for (let second = 1; second <= 12; second += 1) { advance(1000); if (recorder.state === 'recording') recorder.emit(1.6 * 1024 * 1024); }
  assert.equal(recorder.state, 'inactive');
  const take = api.composer.videoCapture;
  assert.ok(take.file.size < 20 * 1024 * 1024, String(take.file.size));
  assert.match(el('leftForYouCameraStatus').textContent, /^Fermato a 0:1\d: il video aveva raggiunto 20 MB\.$/);
});

test('the bitrate keeps 30 seconds well under 20 MB', () => {
  const js = read('left-for-you.js');
  const video = Number(/VIDEO_RECORD_VIDEO_BPS = (\d+);/.exec(js)[1]);
  const audio = Number(/VIDEO_RECORD_AUDIO_BPS = (\d+);/.exec(js)[1]);
  const bytes = ((video + audio) * 30) / 8;
  const limit = 20 * 1024 * 1024;
  assert.ok(bytes < limit * 0.6, `${(bytes / 1048576).toFixed(1)} MiB for 30 s`);
  assert.match(js, /VIDEO_RECORD_GUARD_BYTES = Math\.floor\(18\.5 \* 1024 \* 1024\)/);
});

test('closing the camera mid-recording keeps nothing; a gallery video replaces a recorded one', async () => {
  const { api, el, log, advance } = createHarness();
  await api.openVideoCamera();
  el('leftForYouCameraCapture').click();
  advance(3000);
  api.closeCamera();
  assert.equal(api.composer.videoRecorder, null);
  assert.equal(api.composer.videoCapture, null);
  assert.equal(log.stopped, 2);

  await api.openVideoCamera();
  el('leftForYouCameraCapture').click();
  advance(4000);
  el('leftForYouCameraCapture').click();
  el('leftForYouCameraUse').click();
  await flush();
  assert.ok(api.composer.videoTake);
  const input = el('leftForYouComposerVideoFile');
  input.files = [new File([new Uint8Array(10)], 'VID.mp4', { type: 'video/mp4' })];
  input.fire('change');
  await flush();
  assert.equal(api.composer.videoTake, null);
  assert.equal(el('leftForYouComposerVideoName').textContent, 'VID.mp4');
});

test('a refused camera or microphone for a video says where to turn them on, with Settings where it can open', async () => {
  const refused = () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
  const android = createHarness({ native: true, gum: refused, openSettings: () => false });
  await android.api.openVideoCamera();
  assert.equal(android.api.composer.cameraOpen, false);
  assert.equal(android.el('leftForYouComposerStatus').textContent, 'Per i video servono la fotocamera e il microfono. Attivali da Impostazioni del telefono › App › US › Autorizzazioni.');
  assert.equal(android.el('leftForYouComposerSettings').hidden, false);
  assert.equal(android.log.inputClicks, 0, 'a refusal does not fall back to the camera app');
  android.el('leftForYouComposerSettings').click();
  await flush();
  assert.equal(android.log.settingsCalls, 1);
  assert.equal(android.el('leftForYouComposerSettings').hidden, true, 'Settings did not open: never a dead button');

  const ios = createHarness({ native: true, ios: true, gum: refused, openSettings: () => true });
  await ios.api.openVideoCamera();
  assert.equal(ios.el('leftForYouComposerStatus').textContent, 'Per i video servono la fotocamera e il microfono. Attivali da Impostazioni del telefono › US.');
  ios.el('leftForYouComposerSettings').click();
  await flush();
  assert.equal(ios.el('leftForYouComposerSettings').hidden, false);

  const browser = createHarness({ gum: refused });
  await browser.api.openVideoCamera();
  assert.equal(browser.el('leftForYouComposerStatus').textContent, 'Per i video servono la fotocamera e il microfono. Attivali dalle impostazioni del browser per questo sito.');
  assert.equal(browser.el('leftForYouComposerSettings').hidden, true, 'no Settings button in a browser');
});

test('no camera at all (not a refusal): the phone camera instead, as before', async () => {
  const { api, el, log } = createHarness({ gum: () => { throw Object.assign(new Error('none'), { name: 'NotFoundError' }); } });
  await api.openVideoCamera();
  assert.equal(api.composer.cameraOpen, false);
  assert.equal(log.inputClicks, 1);
  assert.equal(el('leftForYouComposerVideoFile').getAttribute('capture'), 'environment');
});

test('Android: a refused phone camera («Scatta una foto», old «Fai un video») is said, not silent', async () => {
  const { el, fireWindow } = createHarness({ native: true, openSettings: () => true });
  fireWindow('uscamerapermissiondenied', { permanent: true });
  assert.equal(el('leftForYouComposerStatus').textContent, 'Manca il permesso per la fotocamera. Attivalo da Impostazioni del telefono › App › US › Autorizzazioni.');
  assert.equal(el('leftForYouComposerSettings').hidden, false);

  const java = read('android/app/src/main/java/com/usapp/us/UsWebChromeClient.java');
  assert.match(java, /static final String CAMERA_DENIED_EVENT = "uscamerapermissiondenied";/);
  assert.match(read('left-for-you.js'), /const CAMERA_DENIED_EVENT = 'uscamerapermissiondenied';/);
  assert.match(java, /boolean takePhoto = !recordVideo && params\.isCaptureEnabled\(\) && accept\.contains\("image\/\*"\);/);
  assert.match(java, /cameraLauncher\.launch\(Manifest\.permission\.CAMERA\)/);
  const result = java.slice(java.indexOf('private void onCameraResult'), java.indexOf('private void finishCapture'));
  assert.match(result, /callback\.onReceiveValue\(null\);/, 'the WebView chooser is always answered');
  assert.match(result, /shouldShowRequestPermissionRationale/);
  assert.match(result, /bridge\.triggerWindowJSEvent\(CAMERA_DENIED_EVENT/);
  // Once granted, the photo goes on through Capacitor's own camera intent.
  assert.match(java, /: \(\) -> super\.onShowFileChooser\(webView, callback, params\);/);
});

test('Android WebView and iOS can ask for camera and microphone', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/);
  const plist = read('ios/App/App/Info.plist');
  assert.match(plist, /<key>NSCameraUsageDescription<\/key>/);
  assert.match(plist, /<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]*audio dei video/);
});

test('the viewfinder markup, styles and English for the video', () => {
  const html = read('index.html');
  const camera = html.slice(html.indexOf('id="leftForYouCameraOverlay"'), html.indexOf('id="usProgressionUnlock"'));
  assert.match(camera, /<div class="tiny" id="leftForYouCameraKicker">FOTO PRIVATA<\/div>/);
  assert.match(camera, /<video id="leftForYouCameraRecorded" class="left-for-you-camera-recorded" controls playsinline[^>]*hidden><\/video>/);
  assert.match(camera, /id="leftForYouCameraTimer" role="timer"[^>]*hidden>0:00 \/ 0:30</);
  assert.match(html, /id="leftForYouComposerStatus"[^>]*><\/div><button type="button" class="ghost left-for-you-composer-settings" id="leftForYouComposerSettings" hidden>Apri le impostazioni<\/button>/);
  const css = read('dc-ricordi.css');
  assert.match(css, /\.left-for-you-camera-shutter\.is-video\.is-recording span\{width:28px;height:28px/);
  assert.match(css, /:root\[data-us-motion="reduced"\] #leftForYouCameraOverlay \.left-for-you-camera-timer::before\{animation:none!important\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*#leftForYouCameraOverlay \.left-for-you-camera-shutter\.is-video span\{transition:none\}/);
  assert.match(css, /\.left-for-you-composer-settings\{display:flex;align-items:center;justify-content:center;min-height:44px/);
  const i18n = require(path.join(ROOT, 'i18n.js'));
  const dict = i18n.compile(require(path.join(ROOT, 'i18n-en.js')));
  for (const text of ['VIDEO PRIVATO', 'Inizia il video', 'Ferma il video', 'Usa video', 'Anteprima del video', 'Durata del video, massimo 30 secondi',
    'Registrazione in corso. Si ferma da sola a 30 secondi.', 'Non riesco a registrare il video. Riprova.', 'Il video è troppo corto. Riprova.', 'Apri le impostazioni',
    'Per i video servono la fotocamera e il microfono. Attivali da Impostazioni del telefono › App › US › Autorizzazioni.',
    'Per i video servono la fotocamera e il microfono. Attivali da Impostazioni del telefono › US.',
    'Per i video servono la fotocamera e il microfono. Attivali dalle impostazioni del browser per questo sito.']) {
    assert.notEqual(i18n.lookup(dict, text), null, text);
  }
  assert.equal(i18n.lookup(dict, 'Video registrato · 0:24'), 'Recorded video · 0:24');
  assert.equal(i18n.lookup(dict, 'Fermato a 0:18: il video aveva raggiunto 20 MB.'), 'Stopped at 0:18: the video had reached 20 MB.');
});
