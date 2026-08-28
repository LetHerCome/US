const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function loadPlatform({ runtime = null, vibrate = null } = {}) {
  const sandbox = { console: { warn() {} }, navigator: { vibrate } };
  if (runtime) sandbox.UsCapacitorRuntime = runtime;
  sandbox.window = sandbox;
  vm.runInContext(read('platform.js'), vm.createContext(sandbox), { filename: 'platform.js' });
  return sandbox.UsPlatform;
}

test('SystemBars Capacitor 8.5 usa inset CSS e contenuto chiaro sul shell scuro', () => {
  const config = JSON.parse(read('capacitor.config.json'));

  assert.deepEqual(config.plugins.SystemBars, {
    insetsHandling: 'css',
    style: 'DARK',
    hidden: false
  });

  const css = read('ui-foundation.css');
  assert.match(css, /--us-safe-top:\s*var\(--safe-area-inset-top,\s*env\(safe-area-inset-top,0px\)\)/);
  assert.match(css, /--us-safe-bottom:\s*var\(--safe-area-inset-bottom,\s*env\(safe-area-inset-bottom,0px\)\)/);
});

test('haptic usa il plugin nativo quando disponibile senza vibrazione web duplicata', async () => {
  const notifications = [];
  const vibrations = [];
  const platform = loadPlatform({
    runtime: {
      isNativePlatform: () => true,
      isPluginAvailable: (name) => name === 'Haptics',
      registerPlugin: () => ({
        notification: async (payload) => notifications.push(payload)
      })
    },
    vibrate: (pattern) => vibrations.push(pattern)
  });

  await platform.haptic('success', [28, 18, 38]);

  assert.deepEqual(notifications.map((payload) => ({ ...payload })), [{ type: 'SUCCESS' }]);
  assert.deepEqual(vibrations, []);
});

test('haptic mantiene il pattern web e degrada in modo sicuro quando il plugin manca', async () => {
  const vibrations = [];
  const platform = loadPlatform({ vibrate: (pattern) => vibrations.push(pattern) });

  await platform.haptic('light', [30, 25, 45]);

  assert.deepEqual(vibrations, [[30, 25, 45]]);
});

test('haptic native senza plugin resta fail-safe e usa soltanto il fallback disponibile', async () => {
  const vibrations = [];
  const platform = loadPlatform({
    runtime: {
      isNativePlatform: () => true,
      isPluginAvailable: () => false,
      registerPlugin: () => { throw new Error('non deve registrare plugin assenti'); }
    },
    vibrate: (pattern) => vibrations.push(pattern)
  });

  await platform.haptic('medium', [45, 35, 80]);

  assert.deepEqual(vibrations, [[45, 35, 80]]);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, getTracks: () => [track] };
}

function loadCameraHarness(getUserMedia) {
  const source = read('stories.js');
  const start = source.indexOf("  let cameraStream = null;");
  const end = source.indexOf('  async function openStoriesFor');
  assert.ok(start >= 0 && end > start, 'blocco camera Stories non trovato');
  const block = `let uploadBusy = false; let captureBusy = false;\n${source.slice(start, end)}`;
  const listeners = new Map();
  const video = {
    srcObject: null,
    videoWidth: 1080,
    videoHeight: 1920,
    readyState: 2,
    play: async () => {},
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
    emit(name) { listeners.get(name)?.(); }
  };
  const frame = { hidden: true, removeAttribute() { this.src = ''; } };
  const root = { classList: { contains: () => true, remove() {} }, setAttribute() {} };
  const document = {
    body: { style: {} },
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/webp;base64,frame'
      };
    },
    getElementById(id) {
      return ({ usCameraVideo: video, usCameraSwitchFrame: frame, usStoryCamera: root })[id] || null;
    }
  };
  const sandbox = {
    window: { usProfile: null },
    document,
    navigator: { mediaDevices: { getUserMedia }, onLine: true },
    console: { warn() {} },
    toast() {},
    crypto: { randomUUID: () => 'test' },
    File: class File {},
    setTimeout,
    clearTimeout
  };
  sandbox.window.window = sandbox.window;
  vm.runInContext(`${block}\n;globalThis.__camera = { startCameraStream, stopCameraStream, flipStoryCamera, closeStoryCamera, state: () => ({ facing: cameraFacing, stream: cameraStream }) };`, vm.createContext(sandbox), { filename: 'stories.js' });
  return { camera: sandbox.__camera, video, frame };
}

test('flip camera conserva un frame mentre il nuovo stream non e pronto e ignora un secondo tap', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const { camera, video, frame } = loadCameraHarness(() => (++calls === 1 ? first.promise : second.promise));
  const rear = createStream();
  const front = createStream();

  const opening = camera.startCameraStream();
  first.resolve(rear);
  await opening;
  video.readyState = 0;
  const flipping = camera.flipStoryCamera();
  const ignored = camera.flipStoryCamera();

  assert.equal(calls, 2);
  assert.equal(frame.hidden, false);
  assert.equal(frame.src, 'data:image/webp;base64,frame');
  assert.equal(video.srcObject, null);

  second.resolve(front);
  video.readyState = 2;
  video.emit('loadeddata');
  await Promise.all([flipping, ignored]);

  assert.equal(camera.state().facing, 'user');
  assert.equal(video.srcObject, front);
  assert.equal(frame.hidden, true);
});

test('close durante camera flip rilascia lo stream tardivo senza riattaccarlo al video', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const { camera, video } = loadCameraHarness(() => (++calls === 1 ? first.promise : second.promise));
  const rear = createStream();
  const front = createStream();

  const opening = camera.startCameraStream();
  first.resolve(rear);
  await opening;
  video.readyState = 0;
  const flipping = camera.flipStoryCamera();
  camera.closeStoryCamera();
  second.resolve(front);
  video.readyState = 2;
  video.emit('loadeddata');
  await flipping;

  assert.equal(front.track.stopped, true);
  assert.equal(video.srcObject, null);
});
