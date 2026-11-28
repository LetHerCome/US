// Lasciato per te: fotocamera e video (27/11/2026). «Scatta una foto» and
// «Fai un video» open the phone's own camera through <input capture>; the
// behaviour is in tests/lasciato-1-0.test.js, the wiring is checked here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const JAVA = 'android/app/src/main/java/com/usapp/us/UsWebChromeClient.java';

test('the video panel has «Fai un video» next to the gallery, with the same limits line', () => {
  const html = read('index.html');
  const panel = html.slice(html.indexOf('data-us-composer-panel="video"'), html.indexOf('data-us-composer-panel="music"'));
  assert.match(panel, /id="leftForYouComposerVideoCamera" data-pick="video"><b>Fai un video<\/b>/);
  assert.match(panel, /id="leftForYouComposerVideoPick" data-pick="gallery"><b>Scegli un video<\/b>/);
  assert.match(panel, /id="leftForYouComposerVideoHint">Fino a 30 secondi e 20 MB\.</);
  assert.ok(panel.indexOf('leftForYouComposerVideoCamera') < panel.indexOf('leftForYouComposerVideoPick'), 'camera first, as for the photo');
  // The inputs keep their gallery types; the camera ones are set on tap.
  assert.match(html, /id="leftForYouComposerPhotoFile" accept="image\/jpeg,image\/png,image\/webp" hidden>/);
  assert.match(html, /id="leftForYouComposerVideoFile" accept="video\/mp4,video\/webm,video\/quicktime" hidden>/);
  assert.doesNotMatch(html, /capture=/, 'capture only for the camera buttons, never on the gallery');
});

test('both camera buttons use Phosphor icons that exist and keep a 44 px target', () => {
  const css = read('dc-ricordi.css');
  assert.match(css, /data-pick="camera"\]\{--pick-icon:url\("\/assets\/icons\/phosphor\/camera-regular\.svg"\)/);
  assert.match(css, /data-pick="video"\]\{--pick-icon:url\("\/assets\/icons\/phosphor\/video-camera-regular\.svg"\)/);
  for (const icon of ['camera-regular.svg', 'video-camera-regular.svg', 'image-regular.svg']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/phosphor', icon)), icon);
  }
  assert.match(read('dc-oggi.css'), /#leftForYouComposerOverlay \.left-for-you-composer-pick\{\s*min-height:56px/);
});

test('the new words have their English', () => {
  const i18n = require(path.join(ROOT, 'i18n.js'));
  const dict = i18n.compile(require(path.join(ROOT, 'i18n-en.js')));
  assert.equal(i18n.lookup(dict, 'Fai un video'), 'Record a video');
  assert.equal(i18n.lookup(dict, 'Resta privato, solo tra voi due'), 'Stays private, just between you two');
});

test('Android sees the camera apps: <queries> for IMAGE_CAPTURE and VIDEO_CAPTURE, CAMERA declared', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const queries = manifest.slice(manifest.indexOf('<queries>'), manifest.indexOf('</queries>'));
  assert.match(queries, /android\.media\.action\.IMAGE_CAPTURE/);
  assert.match(queries, /android\.media\.action\.VIDEO_CAPTURE/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.doesNotMatch(manifest, /READ_MEDIA_VIDEO|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/, 'the camera app needs no storage permission');
});

test('Android «Fai un video» asks the camera app for the composer limits', () => {
  const java = read(JAVA);
  const js = read('left-for-you.js');
  const seconds = Number(/VIDEO_MAX_SECONDS = (\d+);/.exec(js)[1]);
  assert.equal(Number(/VIDEO_MAX_SECONDS = (\d+);/.exec(java)[1]), seconds);
  assert.match(java, /EXTRA_DURATION_LIMIT, VIDEO_MAX_SECONDS/);
  // A little under the 20 MB the composer accepts: camera apps stop near, not at, the limit.
  const mb = Number(/VIDEO_MAX_BYTES = (\d+)L \* 1024 \* 1024;/.exec(java)[1]);
  assert.ok(mb > 0 && mb < 20, String(mb));
  assert.match(java, /EXTRA_SIZE_LIMIT, VIDEO_MAX_BYTES/);
  assert.match(java, /isCaptureEnabled\(\) && Arrays\.asList\(params\.getAcceptTypes\(\)\)\.contains\("video\/\*"\)/);
  assert.match(java, /return super\.onShowFileChooser\(webView, callback, params\)/, 'photos and pickers stay Capacitor\'s');
  assert.match(java, /hasPermission\(Manifest\.permission\.CAMERA\)/);
  // The approximate-location answer is still there.
  assert.match(java, /onGeolocationPermissionsShowPrompt/);
  assert.match(java, /ACCESS_COARSE_LOCATION/);
  assert.doesNotMatch(java, /ACCESS_FINE_LOCATION/);
  assert.match(read('android/app/src/main/java/com/usapp/us/UsActivity.java'), /setWebChromeClient\(new UsWebChromeClient\(bridge\)\)/);
});

test('iOS has the Italian camera and microphone sentences for photos and videos', () => {
  const plist = read('ios/App/App/Info.plist');
  assert.match(plist, /<key>NSCameraUsageDescription<\/key>\s*<string>[^<]*foto e i video[^<]*<\/string>/);
  assert.match(plist, /<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]*audio dei video[^<]*<\/string>/);
  const it = read('ios/App/App/it.lproj/InfoPlist.strings');
  assert.match(it, /"NSCameraUsageDescription" = "US usa la fotocamera/);
  assert.match(it, /"NSMicrophoneUsageDescription" = "US usa il microfono/);
});
