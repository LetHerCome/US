const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M5G6 camera backdrop closes only for the actual backdrop/overlay target', () => {
  const source = read('left-for-you.js');
  assert.match(source, /cameraOverlay\?\.addEventListener\('click', \(event\) => \{\s*if \(event\.target === cameraOverlay\) closeCamera\(\);/);
  assert.match(source, /cameraBackdrop\?\.addEventListener\('click', \(event\) => \{\s*if \(event\.target === cameraBackdrop\) closeCamera\(\);/);
  assert.match(source, /leftForYouCameraClose'\)\?\.addEventListener\('click', closeCamera\)/);
});

test('M5G6 capture and switch controls do not close the camera overlay', () => {
  const source = read('left-for-you.js');
  assert.match(source, /leftForYouCameraSwitch'\)\?\.addEventListener\('click', switchCamera\)/);
  assert.match(source, /leftForYouCameraCapture'\)\?\.addEventListener\('click', captureCameraPhoto\)/);
  const captureBlock = source.slice(source.indexOf('async function captureCameraPhoto'), source.indexOf('function discardCameraCapture'));
  const switchBlock = source.slice(source.indexOf('async function switchCamera'), source.indexOf('function retakeCameraPhoto'));
  assert.doesNotMatch(captureBlock, /composer\.cameraOpen\s*=\s*false/);
  assert.doesNotMatch(switchBlock, /composer\.cameraOpen\s*=\s*false/);
  assert.match(captureBlock, /composer\.cameraCapture =/);
  assert.match(captureBlock, /releaseCameraStream\(\)/);
  assert.match(captureBlock, /updateCameraUi\(\)/);
});

test('M5G6 camera use-photo flow selects the capture and returns to the composer', () => {
  const source = read('left-for-you.js');
  const useBlock = source.slice(source.indexOf('function useCameraPhoto'), source.indexOf('async function captureCameraPhoto'));
  assert.match(useBlock, /composer\.cameraCapture\.selected = true/);
  assert.match(useBlock, /composer\.cameraOpen = false/);
  assert.match(useBlock, /updateComposerValidity\(\)/);
});

test('M5G6 enabled CTA has active foreground and disabled CTA stays muted', () => {
  const css = read('left-for-you.css');
  assert.match(css, /button:not\(:disabled\)\{[^}]*color:#fffafc/);
  assert.match(css, /button:disabled\{[^}]*color:rgba\(247,242,248,\.48\)/);
});
