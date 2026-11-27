// Lasciato per te: video di 30 secondi pieni (27/11/2026), in the real app
// shell with Chromium's fake camera and microphone. «Fai un video» records
// inside US as MP4 (H.264 + AAC) at the safe bitrate, shows the time, lets
// you review, retake and use the take, and uploads it as a gallery MP4.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, loadChromium } = require('./helpers/oggi-browser');
const { pageFor } = require('./helpers/countdown-browser');

async function startWithFakeCamera() {
  const chromium = loadChromium();
  if (!chromium) return null;
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  } catch (error) {
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
  return { browser, server, base: `http://127.0.0.1:${server.address().port}`, close: async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); } };
}

const box = (page, id) => page.evaluate((target) => {
  const r = document.getElementById(target).getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, id);

test('«Fai un video» records inside US, stops, retakes and sends an MP4', { timeout: 120000 }, async (t) => {
  const h = await startWithFakeCamera();
  if (!h) { t.skip('Chromium not available (PLAYWRIGHT_NODE_MODULES)'); return; }
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 360, height: 740 });
    const supported = await page.evaluate(() => MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01F,mp4a.40.2'));
    if (!supported) { t.skip('this Chromium cannot record MP4'); await ctx.close(); return; }
    let choosers = 0;
    page.on('filechooser', () => { choosers += 1; });
    await page.evaluate(() => {
      // Spies only: the real recorder and camera do the work.
      window.__rec = { options: [], constraints: [], streams: [], uploads: [] };
      const Real = window.MediaRecorder;
      window.MediaRecorder = class extends Real { constructor(stream, options) { super(stream, options); window.__rec.options.push({ ...options, actual: this.mimeType }); } };
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => { window.__rec.constraints.push(constraints); const stream = await gum(constraints); window.__rec.streams.push(stream); return stream; };
      const from = sb.storage.from.bind(sb.storage);
      sb.storage.from = (bucket) => {
        const store = from(bucket);
        const upload = store.upload.bind(store);
        store.upload = (where, payload, options) => { window.__rec.uploads.push({ bucket, where, type: payload.type, size: payload.size, contentType: options?.contentType }); return upload(where, payload, options); };
        return store;
      };
      window.UsLeftForYou.openComposer({ kind: 'video' });
    });
    await page.waitForSelector('#leftForYouComposerVideoCamera', { state: 'visible' });
    await page.click('#leftForYouComposerVideoCamera');
    await page.waitForFunction(() => document.getElementById('leftForYouCameraOverlay').classList.contains('open') && document.getElementById('leftForYouCameraPreview').videoWidth > 0);
    assert.equal(choosers, 0, 'no system camera where US can record');

    const viewfinder = await page.evaluate(() => ({
      mode: document.getElementById('leftForYouCameraOverlay').dataset.mode,
      title: document.getElementById('leftForYouCameraTitle').textContent,
      kicker: document.getElementById('leftForYouCameraKicker').textContent,
      timer: document.getElementById('leftForYouCameraTimer').textContent,
      timerShown: getComputedStyle(document.getElementById('leftForYouCameraTimer')).display !== 'none',
      shutter: document.getElementById('leftForYouCameraCapture').getAttribute('aria-label'),
      constraints: window.__rec.constraints[0],
    }));
    assert.deepEqual(
      { mode: viewfinder.mode, title: viewfinder.title, kicker: viewfinder.kicker, timer: viewfinder.timer, timerShown: viewfinder.timerShown, shutter: viewfinder.shutter },
      { mode: 'video', title: 'Fai un video', kicker: 'VIDEO PRIVATO', timer: '0:00 / 0:30', timerShown: true, shutter: 'Inizia il video' },
    );
    assert.equal(viewfinder.constraints.audio, true);
    assert.equal(viewfinder.constraints.video.facingMode, 'environment');

    // Mobile first: 44 px targets inside the screen, the time under the header.
    const shutter = await box(page, 'leftForYouCameraCapture');
    const close = await box(page, 'leftForYouCameraClose');
    const timer = await box(page, 'leftForYouCameraTimer');
    assert.ok(shutter.width >= 44 && shutter.height >= 44 && close.width >= 44 && close.height >= 44, JSON.stringify({ shutter, close }));
    assert.ok(shutter.bottom <= 740 && timer.left >= 16 && timer.right <= 360 - 16, JSON.stringify({ shutter, timer }));
    assert.ok(timer.top >= close.bottom, 'the time sits under the header');

    await page.click('#leftForYouCameraCapture');
    await page.waitForTimeout(2300);
    const recording = await page.evaluate(() => ({
      timer: document.getElementById('leftForYouCameraTimer').textContent,
      dot: document.getElementById('leftForYouCameraTimer').dataset.recording,
      shutter: document.getElementById('leftForYouCameraCapture').getAttribute('aria-label'),
      square: getComputedStyle(document.querySelector('#leftForYouCameraCapture span')).borderRadius,
      switchHidden: document.getElementById('leftForYouCameraSwitch').hidden,
      options: window.__rec.options[0],
    }));
    assert.match(recording.timer, /^0:0[23] \/ 0:30$/);
    assert.equal(recording.dot, 'true');
    assert.equal(recording.shutter, 'Ferma il video');
    assert.equal(recording.square, '7px');
    assert.equal(recording.switchHidden, true);
    assert.equal(recording.options.mimeType, 'video/mp4;codecs=avc1.42E01F,mp4a.40.2');
    assert.equal(recording.options.videoBitsPerSecond, 3000000);
    assert.equal(recording.options.audioBitsPerSecond, 128000);
    assert.match(recording.options.actual, /^video\/mp4;codecs=avc1\.[0-9a-f]{6},mp4a\.40\.2$/i, 'H.264 + AAC');

    await page.click('#leftForYouCameraCapture');
    await page.waitForFunction(() => !document.getElementById('leftForYouCameraRecorded').hidden && document.getElementById('leftForYouCameraRecorded').readyState >= 1);
    const review = await page.evaluate(() => ({
      duration: document.getElementById('leftForYouCameraRecorded').duration,
      use: document.getElementById('leftForYouCameraUse').textContent,
      retake: !document.getElementById('leftForYouCameraRetake').hidden,
      tracksEnded: window.__rec.streams[0].getTracks().every((track) => track.readyState === 'ended'),
      file: { type: window.UsLeftForYou.composer.videoCapture.file.type, name: window.UsLeftForYou.composer.videoCapture.file.name, size: window.UsLeftForYou.composer.videoCapture.file.size },
    }));
    assert.ok(review.duration > 1.5 && review.duration < 4, String(review.duration));
    assert.equal(review.use, 'Usa video');
    assert.equal(review.retake, true);
    assert.equal(review.tracksEnded, true, 'camera and microphone off while reviewing');
    assert.equal(review.file.type, 'video/mp4');
    assert.match(review.file.name, /^video-\d+\.mp4$/);
    assert.ok(review.file.size > 0 && review.file.size < 20 * 1024 * 1024);
    const recorded = await box(page, 'leftForYouCameraRecorded');
    const use = await box(page, 'leftForYouCameraUse');
    assert.ok(recorded.bottom <= use.top, 'the take\'s controls stay above the buttons');

    // «Rifai»: the camera comes back, the time from zero; then a second take is used.
    await page.click('#leftForYouCameraRetake');
    await page.waitForFunction(() => window.__rec.streams.length === 2 && document.getElementById('leftForYouCameraPreview').videoWidth > 0);
    assert.equal(await page.textContent('#leftForYouCameraTimer'), '0:00 / 0:30');
    await page.click('#leftForYouCameraCapture');
    await page.waitForTimeout(1600);
    await page.click('#leftForYouCameraCapture');
    await page.waitForSelector('#leftForYouCameraUse', { state: 'visible' });
    await page.click('#leftForYouCameraUse');
    await page.waitForFunction(() => !document.getElementById('leftForYouCameraOverlay').classList.contains('open'));
    assert.match(await page.textContent('#leftForYouComposerVideoName'), /^Video registrato · 0:0[12]$/);
    assert.equal(await page.isEnabled('#leftForYouComposerSend'), true);

    await page.click('#leftForYouComposerSend');
    await page.waitForFunction(() => window.__rec.uploads.length === 1);
    const [upload] = await page.evaluate(() => window.__rec.uploads);
    assert.equal(upload.bucket, 'us-media');
    assert.equal(upload.contentType, 'video/mp4');
    assert.equal(upload.type, 'video/mp4');
    assert.match(upload.where, /\.mp4$/);
    assert.ok(upload.size > 0 && upload.size < 20 * 1024 * 1024);
    assert.equal(choosers, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('with reduced motion the recording dot does not blink', { timeout: 120000 }, async (t) => {
  const h = await startWithFakeCamera();
  if (!h) { t.skip('Chromium not available (PLAYWRIGHT_NODE_MODULES)'); return; }
  try {
    const { page, ctx } = await pageFor(h, { width: 390, height: 844, reduced: true });
    if (!(await page.evaluate(() => window.UsLeftForYou.canRecordVideoInApp()))) { t.skip('this Chromium cannot record MP4'); await ctx.close(); return; }
    await page.evaluate(() => window.UsLeftForYou.openComposer({ kind: 'video' }));
    await page.click('#leftForYouComposerVideoCamera');
    await page.waitForFunction(() => document.getElementById('leftForYouCameraPreview').videoWidth > 0);
    await page.click('#leftForYouCameraCapture');
    await page.waitForFunction(() => document.getElementById('leftForYouCameraTimer').dataset.recording === 'true');
    const motion = await page.evaluate(() => ({
      dot: getComputedStyle(document.getElementById('leftForYouCameraTimer'), '::before').animationName,
      shutter: getComputedStyle(document.querySelector('#leftForYouCameraCapture span')).transitionDuration,
    }));
    assert.equal(motion.dot, 'none');
    assert.ok(parseFloat(motion.shutter) < 0.01, motion.shutter);
    await page.click('#leftForYouCameraClose');
    await ctx.close();
  } finally {
    await h.close();
  }
});
