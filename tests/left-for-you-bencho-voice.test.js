const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadRenderer() {
  const source = read('left-for-you.js');
  const context = { module: { exports: {} }, exports: {}, console, URL, globalThis: {} };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'left-for-you.js' });
  return context.module.exports;
}

test('Bencho voice note replaces the native Left for You recorder surface (tap to start, tap to stop)', () => {
  const html = read('index.html');
  const js = read('left-for-you.js');
  const css = read('left-for-you.css');

  assert.match(html, /id="leftForYouComposerAudioRecord"[^>]*data-phase="idle"/);
  assert.match(html, /id="leftForYouComposerAudioRecord"[^>]*aria-label="Tocca per registrare una voce"/);
  assert.doesNotMatch(html, /Tieni premuto|Scorri per annullare/);
  assert.match(html, /id="leftForYouComposerAudioHint"[^>]*>Tocca per registrare</);
  assert.match(html, /id="leftForYouComposerAudioWave"/);
  assert.match(html, /id="leftForYouComposerAudioClipWave"/);
  assert.match(html, /id="leftForYouComposerAudioPreviewToggle"/);
  assert.match(html, /id="leftForYouComposerAudioPreview" preload="metadata" hidden/);
  assert.doesNotMatch(html, /<audio[^>]*\scontrols/);

  assert.match(js, /const VOICE_MIN_MS = 500/);
  assert.match(js, /const VOICE_MAX_MS = 30000/);
  assert.match(js, /getUserMedia\(\{ audio: true \}\)/);
  assert.match(js, /new MediaRecorderCtor\(stream/);
  assert.match(js, /createMediaStreamSource\(stream\)/);
  assert.match(js, /getByteTimeDomainData/);
  assert.match(js, /function toggleVoiceRecording\(event\)/);
  assert.match(js, /voiceRecord\?\.addEventListener\('click', toggleVoiceRecording\)/);
  assert.doesNotMatch(js, /addEventListener\('pointerdown', beginVoicePress\)|recordingPressHeld|requireHold|VOICE_CANCEL_PX/);
  assert.match(js, /Tocca per fermare/);
  assert.match(js, /seekComposerPreview/);

  assert.match(css, /\.left-for-you-vn\{/);
  assert.match(css, /\.left-for-you-vn\{[^}]*width:56px/);
  assert.match(css, /width:min\(316px,100%\)/);
  assert.match(css, /grid-template-columns:repeat\(28/);
  assert.match(css, /\.left-for-you-vn-mic::before\{[\s\S]*left:50%/);
  assert.match(css, /\.left-for-you-vn-mic\{[^}]*transform:translateY\(-1px\)/, 'mic is optically lifted');
  assert.match(css, /\.left-for-you-vn-mic i::after\{/);
  assert.match(css, /\.left-for-you-vn-stop\{/);
  assert.match(css, /\.left-for-you-vn-x::before,[\s\S]*\.left-for-you-vn-x::after/);
  assert.match(css, /\.left-for-you-vn-x \.us-icon\{display:none\}/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('voice glyphs keep their optical-centre contract (20px artboard, 44px discs)', () => {
  const css = read('left-for-you.css');
  const triangle = css.match(/\.left-for-you-vn-playmark i:first-child\{[^}]*\}/)?.[0] || '';
  assert.match(triangle, /clip-path:polygon\(0 0,100% 50%,0 100%\)/);
  const left = Number(triangle.match(/left:([\d.]+)px/)?.[1]);
  const width = Number(triangle.match(/width:([\d.]+)px/)?.[1]);
  assert.doesNotMatch(triangle, /transform:/, 'no extra nudge on top of the geometry');
  const boxCentre = left + width / 2;
  const centroid = left + width / 3;
  assert.ok(boxCentre > 10 && centroid < 10, 'triangle sits between box-centred and centroid-centred');
  assert.ok(Math.abs((boxCentre + centroid) / 2 - 10) <= 0.5, 'halfway between the two reads centred');
  assert.match(css, /\.left-for-you-vn-play[^{]*\{[^}]*width:44px[^}]*height:44px/);
  assert.match(css, /\.left-for-you-vn-play\[data-playing="true"\] \.left-for-you-vn-playmark i:first-child\{left:4px\}/);
  assert.match(css, /\.left-for-you-vn-play\[data-playing="true"\] \.left-for-you-vn-playmark i:last-child\{left:12px\}/);
  assert.match(css, /\.left-for-you-vn-stop i\{[^}]*width:14px[^}]*height:14px/);
});

test('received Left for You audio uses the Bencho step-player instead of native controls', () => {
  const api = loadRenderer();
  const markup = api.renderItemMarkup({ id: 'audio-1', kind: 'audio', body: '', media_path: 'private/audio.webm' }, 'blob:https://example.test/audio');

  assert.match(markup, /class="left-for-you-step-player"/);
  assert.match(markup, /data-left-audio-player/);
  assert.match(markup, /data-left-audio-el/);
  assert.match(markup, /data-left-audio-toggle/);
  assert.equal((markup.match(/data-left-audio-step="/g) || []).length, 5);
  assert.doesNotMatch(markup, /<audio controls/);

  const js = read('left-for-you.js');
  const css = read('left-for-you.css');
  assert.match(js, /RECEIVER_AUDIO_STEPS = 5/);
  assert.match(js, /requestAnimationFrame\(tick\)/);
  assert.match(js, /wakeAudioSteps/);
  assert.match(js, /morphAudioPlayerMark/);
  assert.match(js, /audio\.currentTime = \(index \/ dots\.length\) \* audio\.duration/);
  assert.match(css, /\.left-for-you-spl-dot\[aria-current="step"\]/);
  // The path itself carries the optical offset (triangle x 6.5–20 on a 24 box);
  // an extra CSS nudge pushed it past its centroid.
  assert.match(css, /\.left-for-you-spl-go svg\{[\s\S]*transform:translateX\(0\)/);
  assert.match(js, /const AUDIO_PLAY_L = \[6\.5, 4, 13\.25, 8, 13\.25, 16, 6\.5, 20\]/);
  assert.match(css, /\.left-for-you-spl-tool\{[^}]*width:44px/, 'received play key is a 44px target like the composer');
  assert.match(css, /@keyframes left-for-you-step-wake/);
});

test('Bencho voice transplant stays scoped to Left for You and preserves existing media authority', () => {
  const js = read('left-for-you.js');
  assert.match(js, /usGetSignedUrl/);
  assert.match(js, /storage\.from\('us-media'\)\.upload/);
  assert.match(js, /kind === 'audio'/);
  assert.doesNotMatch(js, /getPublicUrl/);
});
