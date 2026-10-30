// Emoji on the keyboard (founder, 29/10/2026): in the APK the keyboard
// sometimes offered emoji and sometimes not. Android's WebView passes
// autocomplete="off" to the keyboard as «no suggestions»
// (TYPE_TEXT_FLAG_NO_SUGGESTIONS, Chromium ImeUtils.computeEditorInfo), and
// Gboard drops the emoji there. Fields where the couple writes do not carry it;
// it stays only where emoji are of no use: codes, confirmation words, hours,
// and the names typed once at sign-up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCES = ['index.html', ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.js') && !/^i18n-|^service-worker/.test(f))];

function fieldsWithoutSuggestions() {
  const ids = [];
  for (const file of SOURCES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const [tag] of src.matchAll(/<(?:textarea|input)\b[^>]*>/g)) {
      if (!/autocomplete=\\?["']off/.test(tag)) continue;
      if (/type=\\?["'](?:password|email|search|hidden|checkbox|radio|number|date|time)/.test(tag)) continue;
      ids.push(/id=\\?["']([^"'\\]+)/.exec(tag)?.[1] || `${file}: ${tag.slice(0, 60)}`);
    }
  }
  return ids.sort();
}

test('only codes, confirmation words, hours and sign-up names tell the keyboard «no suggestions»', () => {
  assert.deepEqual(fieldsWithoutSuggestions(), [
    'mc3Code', 'mc3CoupleName', 'mc3CreateName', 'mc3JoinCode', 'mc3JoinName',
    'usAccountDeleteConfirm', 'usCalendarEndTimeInput', 'usCalendarStartTimeInput', 'usLeaveCoupleConfirm',
  ]);
});

test('where the couple writes, the keyboard keeps its emoji', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const id of ['usCalendarTitleInput', 'usCountdownTitle', 'leftForYouComposerPhotoCaption', 'leftForYouComposerAudioCaption', 'leftForYouComposerText', 'momentCaption', 'answer']) {
    const tag = new RegExp(`<(?:textarea|input)\\b[^>]*id="${id}"[^>]*>`).exec(html)?.[0];
    assert.ok(tag, id);
    assert.doesNotMatch(tag, /autocomplete="off"/, id);
  }
});
