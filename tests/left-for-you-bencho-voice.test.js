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

test('Bencho voice note replaces the native Left for You recorder surface', () => {
  const html = read('index.html');
  const js = read('left-for-you.js');
  const css = read('left-for-you.css');

  assert.match(html, /id="leftForYouComposerAudioRecord"[^>]*data-phase="idle"/);
  assert.match(html, /Tieni premuto/);
  assert.match(html, /id="leftForYouComposerAudioWave"/);
  assert.match(html, /id="leftForYouComposerAudioClipWave"/);
  assert.match(html, /id="leftForYouComposerAudioPreviewToggle"/);
  assert.match(html, /id="leftForYouComposerAudioPreview" preload="metadata" hidden/);
  assert.doesNotMatch(html, /leftForYouComposerAudioPreview" controls/);

  assert.match(js, /const VOICE_CANCEL_PX = 90/);
  assert.match(js, /const VOICE_MIN_MS = 500/);
  assert.match(js, /const VOICE_MAX_MS = 30000/);
  assert.match(js, /getUserMedia\(\{ audio: true \}\)/);
  assert.match(js, /createMediaStreamSource\(stream\)/);
  assert.match(js, /getByteTimeDomainData/);
  assert.match(js, /pointerdown/);
  assert.match(js, /pointermove/);
  assert.match(js, /pointerup/);
  assert.match(js, /Rilascia per annullare/);
  assert.match(js, /seekComposerPreview/);

  assert.match(css, /\.left-for-you-vn\{/);
  assert.match(css, /width:min\(216px,100%\)/);
  assert.match(css, /width:min\(316px,100%\)/);
  assert.match(css, /grid-template-columns:repeat\(28/);
  assert.match(css, /\.left-for-you-vn-mic::before\{[\s\S]*left:50%/);
  assert.match(css, /\.left-for-you-vn-mic i::after\{/);
  assert.match(css, /\.left-for-you-vn-playmark i:first-child\{[\s\S]*clip-path:polygon\(0 0,100% 50%,0 100%\)[\s\S]*transform:translate\(1\.5px,0\)/);
  assert.match(css, /\.left-for-you-vn-playmark i:last-child\{[\s\S]*display:none/);
  assert.match(css, /\.left-for-you-vn-x::before,[\s\S]*\.left-for-you-vn-x::after/);
  assert.match(css, /\.left-for-you-vn-x \.us-icon\{display:none\}/);
  assert.match(css, /prefers-reduced-motion:reduce/);
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
  assert.match(css, /\.left-for-you-spl-go svg\{[\s\S]*transform:translateX\(1px\)/);
  assert.match(css, /\.left-for-you-step-player\[data-playing="true"\] \.left-for-you-spl-go svg\{[\s\S]*translateX\(0\)/);
  assert.match(css, /@keyframes left-for-you-step-wake/);
});

test('Bencho voice transplant stays scoped to Left for You and preserves existing media authority', () => {
  const js = read('left-for-you.js');
  assert.match(js, /usGetSignedUrl/);
  assert.match(js, /storage\.from\('us-media'\)\.upload/);
  assert.match(js, /kind === 'audio'/);
  assert.doesNotMatch(js, /getPublicUrl/);
});
