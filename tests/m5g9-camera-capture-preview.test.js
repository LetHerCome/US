const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setTimeout: sleep } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const cameraSource = read('left-for-you.js');

function extract(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

/* Cascade resolver: the defect was a CSS precedence bug, so the guard has to be proven, not spelled. */
function parseRules(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutAtRules = withoutComments.replace(/@[\w-]+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const rules = [];
  for (const [, selectorList, declarations] of withoutAtRules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of selectorList.split(',')) {
      rules.push({ selector: selector.trim(), declarations, order: rules.length });
    }
  }
  return rules;
}

function parseCompound(text) {
  const tokens = text.match(/^[a-zA-Z][\w-]*|#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?/g) || [];
  if (tokens.join('') !== text) return null; // combinator or syntax this resolver does not model
  const compound = { tag: '', id: '', classes: [], attrs: [], specificity: [0, 0, 0] };
  for (const token of tokens) {
    if (token.startsWith('#')) { compound.id = token.slice(1); compound.specificity[0] += 1; continue; }
    if (token.startsWith('.')) { compound.classes.push(token.slice(1)); compound.specificity[1] += 1; continue; }
    if (token.startsWith('[')) {
      const [name, value] = token.slice(1, -1).split('=');
      compound.attrs.push({ name: name.trim(), value: value === undefined ? undefined : value.trim().replace(/^["']|["']$/g, '') });
      compound.specificity[1] += 1;
      continue;
    }
    if (token.startsWith(':')) return null;
    compound.tag = token.toLowerCase();
    compound.specificity[2] += 1;
  }
  return compound;
}

function parseSelector(selector) {
  const compounds = selector.trim().split(/\s+/).map(parseCompound);
  return compounds.every(Boolean) ? compounds : null;
}

function matchesCompound(node, compound) {
  if (compound.tag && compound.tag !== node.tag) return false;
  if (compound.id && compound.id !== node.id) return false;
  if (compound.classes.some((name) => !(node.classes || []).includes(name))) return false;
  return compound.attrs.every(({ name, value }) => {
    const actual = node.attrs?.[name];
    if (actual === undefined || actual === null || actual === false) return false;
    return value === undefined || String(actual) === value;
  });
}

function matchesSelector(ancestry, compounds) {
  if (!matchesCompound(ancestry[ancestry.length - 1], compounds[compounds.length - 1])) return false;
  let index = ancestry.length - 2;
  for (let position = compounds.length - 2; position >= 0; position -= 1) {
    while (index >= 0 && !matchesCompound(ancestry[index], compounds[position])) index -= 1;
    if (index < 0) return false;
    index -= 1;
  }
  return true;
}

function beats(candidate, winner) {
  if (!winner) return true;
  if (candidate.important !== winner.important) return candidate.important;
  for (let i = 0; i < 3; i += 1) {
    if (candidate.specificity[i] !== winner.specificity[i]) return candidate.specificity[i] > winner.specificity[i];
  }
  return candidate.order > winner.order;
}

// The user-agent [hidden] rule loses to every author declaration, so it is only the fallback here.
function resolveDisplay(rules, ancestry) {
  const node = ancestry[ancestry.length - 1];
  let winner = null;
  for (const rule of rules) {
    const compounds = parseSelector(rule.selector);
    if (!compounds || !matchesSelector(ancestry, compounds)) continue;
    const declaration = [...rule.declarations.matchAll(/(?:^|;)\s*display\s*:\s*([^;]+)/g)].pop();
    if (!declaration) continue;
    const raw = declaration[1].trim();
    const important = /!\s*important$/i.test(raw);
    const candidate = {
      value: raw.replace(/!\s*important$/i, '').trim(),
      important,
      order: rule.order,
      specificity: compounds.reduce((total, compound) => total.map((part, i) => part + compound.specificity[i]), [0, 0, 0]),
    };
    if (beats(candidate, winner)) winner = candidate;
  }
  if (winner) return winner.value;
  return node.attrs?.hidden ? 'none' : 'initial';
}

const cameraAncestry = (leaf) => [
  { tag: 'div', id: 'leftForYouCameraOverlay', classes: ['left-for-you-overlay', 'left-for-you-camera-overlay'], attrs: {} },
  { tag: 'section', classes: ['left-for-you-sheet', 'left-for-you-camera-sheet'], attrs: {} },
  { tag: 'div', classes: ['left-for-you-body', 'left-for-you-camera-body'], attrs: {} },
  ...(leaf.tag === 'button' ? [] : [{ tag: 'div', classes: ['left-for-you-camera-preview-wrap'], attrs: {} }]),
  leaf,
];

const previewVideo = (hidden) => cameraAncestry({ tag: 'video', id: 'leftForYouCameraPreview', classes: [], attrs: hidden ? { hidden: true } : {} });
const capturedImage = (hidden) => cameraAncestry({ tag: 'img', id: 'leftForYouCameraCaptured', classes: [], attrs: hidden ? { hidden: true } : {} });
const shutterButton = (hidden) => cameraAncestry({ tag: 'button', id: 'leftForYouCameraCapture', classes: ['left-for-you-camera-shutter'], attrs: hidden ? { hidden: true } : {} });
const pickButton = (id, hidden) => cameraAncestry({ tag: 'button', id, classes: ['left-for-you-composer-pick'], attrs: hidden ? { hidden: true } : {} });

function makeElement(id, tag, initial = {}) {
  const classes = new Set(initial.classes || []);
  return {
    id,
    tagName: tag.toUpperCase(),
    hidden: Boolean(initial.hidden),
    disabled: Boolean(initial.disabled),
    src: '',
    srcObject: null,
    textContent: '',
    value: '',
    dataset: {},
    files: [],
    attributes: {},
    playCount: 0,
    videoWidth: 640,
    videoHeight: 480,
    clientWidth: 640,
    clientHeight: 480,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
    },
    setAttribute(name, attributeValue) { this.attributes[name] = attributeValue; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    play() { this.playCount += 1; return Promise.resolve(); },
  };
}

function cameraHarness() {
  const calls = { getUserMedia: 0, stops: 0, createObjectURL: 0, revokeObjectURL: 0, drawImage: 0, facings: [] };
  const elements = {
    cameraOverlay: makeElement('leftForYouCameraOverlay', 'div'),
    composerOverlay: makeElement('leftForYouComposerOverlay', 'div', { classes: ['open'] }),
    preview: makeElement('leftForYouCameraPreview', 'video'),
    captured: makeElement('leftForYouCameraCaptured', 'img', { hidden: true }),
    capture: makeElement('leftForYouCameraCapture', 'button'),
    use: makeElement('leftForYouCameraUse', 'button', { hidden: true }),
    retake: makeElement('leftForYouCameraRetake', 'button', { hidden: true }),
    switcher: makeElement('leftForYouCameraSwitch', 'button'),
    status: makeElement('leftForYouCameraStatus', 'div'),
    send: makeElement('leftForYouComposerSend', 'button', { disabled: true }),
    photoFile: makeElement('leftForYouComposerPhotoFile', 'input'),
  };
  const byId = new Map(Object.values(elements).map((element) => [element.id, element]));
  const context = {
    document: {
      getElementById: (id) => byId.get(id) || null,
      querySelectorAll: () => [],
      createElement: (tag) => (tag === 'canvas'
        ? {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage() { calls.drawImage += 1; } }),
          toBlob: (done) => done({ size: 2048, type: 'image/jpeg' }),
        }
        : makeElement('created', tag)),
    },
    window: {
      navigator: {
        mediaDevices: {
          getUserMedia: async (constraints) => {
            calls.getUserMedia += 1;
            calls.facings.push(constraints?.video?.facingMode);
            return { label: `stream-${calls.getUserMedia}`, getTracks: () => [{ stop() { calls.stops += 1; } }] };
          },
          enumerateDevices: async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }],
        },
      },
      URL: {
        createObjectURL: () => { calls.createObjectURL += 1; return `blob:capture-${calls.createObjectURL}`; },
        revokeObjectURL: () => { calls.revokeObjectURL += 1; },
      },
    },
    File: class File {
      constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options?.type; }
    },
    setComposerStatus() {},
    updateRecorderUi() {},
    console: { warn() {}, error() {} },
  };
  const source = [
    extract(cameraSource, 'const composer = {', 'function getClient'),
    extract(cameraSource, 'function selectedComposerFile', 'function releaseCameraStream'),
    extract(cameraSource, 'function releaseCameraStream', 'function recordingMimeType'),
    'function composerState(){ return composer; }',
  ].join('\n');
  vm.runInNewContext(source, vm.createContext(context), { filename: 'left-for-you-camera-boundary.js' });
  return { context, elements, calls, state: context.composerState() };
}

test('M5G9 the captured photo wins the display cascade over the live preview video', () => {
  const rules = parseRules(read('left-for-you.css'));
  // Before the fix the author display:block outranked the user-agent [hidden] rule and nothing ever hid.
  assert.equal(resolveDisplay(rules, previewVideo(true)), 'none');
  assert.equal(resolveDisplay(rules, capturedImage(true)), 'none');
  assert.equal(resolveDisplay(rules, shutterButton(true)), 'none');
  assert.equal(resolveDisplay(rules, pickButton('leftForYouCameraUse', true)), 'none');
  assert.equal(resolveDisplay(rules, pickButton('leftForYouCameraRetake', true)), 'none');
});

test('M5G9 the visible camera surfaces keep their layout when they are not hidden', () => {
  const rules = parseRules(read('left-for-you.css'));
  assert.equal(resolveDisplay(rules, previewVideo(false)), 'block');
  assert.equal(resolveDisplay(rules, capturedImage(false)), 'block');
  assert.equal(resolveDisplay(rules, shutterButton(false)), 'grid');
});

test('M5G9 the camera markup still nests the preview surfaces the cascade guard targets', () => {
  const html = read('index.html');
  const body = extract(html, 'left-for-you-body left-for-you-camera-body', '</section>');
  assert.match(body, /class="left-for-you-camera-preview-wrap"><video id="leftForYouCameraPreview"/);
  assert.match(body, /<img id="leftForYouCameraCaptured"[^>]*hidden>/);
  assert.match(body, /id="leftForYouCameraUse" hidden>/);
  assert.match(body, /id="leftForYouCameraRetake" hidden>/);
});

test('M5G9 capturing shows the photo in the preview surface and keeps the camera open', async () => {
  const { context, elements, state } = cameraHarness();
  await context.openCamera();
  assert.equal(elements.preview.hidden, false);
  assert.equal(elements.captured.hidden, true);
  await context.captureCameraPhoto();
  assert.equal(elements.preview.hidden, true);
  assert.equal(elements.captured.hidden, false);
  assert.match(elements.captured.src, /^blob:capture-/);
  assert.equal(elements.captured.src, state.cameraCapture.url);
  assert.equal(elements.use.hidden, false);
  assert.equal(elements.retake.hidden, false);
  assert.equal(elements.capture.hidden, true);
  assert.equal(elements.switcher.hidden, true);
  assert.equal(state.cameraOpen, true);
});

test('M5G9 retake drops the captured photo and resumes the live camera', async () => {
  const { context, elements, calls, state } = cameraHarness();
  await context.openCamera();
  await context.captureCameraPhoto();
  const acquisitions = calls.getUserMedia;
  context.retakeCameraPhoto();
  await sleep(5);
  assert.equal(state.cameraCapture, null);
  assert.equal(elements.captured.hidden, true);
  assert.equal(elements.preview.hidden, false);
  assert.equal(elements.capture.hidden, false);
  assert.equal(elements.use.hidden, true);
  assert.equal(elements.retake.hidden, true);
  assert.equal(calls.getUserMedia, acquisitions + 1);
  assert.ok(elements.preview.srcObject, 'the live stream must be reattached to the preview');
  assert.equal(state.cameraOpen, true);
});

test('M5G9 use-photo closes only the camera and enables photo validity', async () => {
  const { context, elements, calls, state } = cameraHarness();
  state.kind = 'photo';
  await context.openCamera();
  await context.captureCameraPhoto();
  context.useCameraPhoto();
  assert.equal(state.cameraOpen, false);
  assert.equal(state.cameraCapture.selected, true);
  assert.equal(elements.cameraOverlay.classList.contains('open'), false);
  assert.equal(elements.composerOverlay.classList.contains('open'), true);
  assert.equal(elements.send.disabled, false);
  assert.equal(calls.revokeObjectURL, 0, 'the selected photo url must survive for the composer');
  assert.equal(context.selectedComposerFile('photo'), state.cameraCapture.file);
  assert.match(state.cameraCapture.file.name, /^foto-\d+\.jpg$/);
});

test('M5G9 camera lifecycle still releases the stream on capture and close', async () => {
  const { context, elements, calls, state } = cameraHarness();
  state.kind = 'photo';
  await context.openCamera();
  assert.ok(elements.preview.srcObject);
  await context.captureCameraPhoto();
  assert.equal(calls.stops > 0, true);
  assert.equal(elements.preview.srcObject, null);
  context.closeCamera();
  assert.equal(state.cameraOpen, false);
  assert.equal(state.cameraCapture, null);
  assert.equal(calls.revokeObjectURL, 1);
  assert.equal(elements.send.disabled, true);
});
