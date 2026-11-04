// Founder, 03/11/2026 (staging review): distance, battery and "Come stai" stay
// on Oggi when a card waits, and the daily question stays readable on short phones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'dc-oggi.css'), 'utf8');

function mediaBlock(query) {
  const start = css.indexOf(`@media(${query}){`);
  assert.notEqual(start, -1, `missing @media(${query})`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`unclosed @media(${query})`);
}

test('a waiting card no longer hides the row with distance, battery and Come stai', () => {
  assert.doesNotMatch(css, /:has\(#usTodayPriorityRegion:not\(\[hidden\]\)\) #usOggiRow/);
  assert.doesNotMatch(css, /:has\(#pushOptInCard:not\(\[hidden\]\)\) #usOggiRow/);
});

test('short phones keep two lines of the daily question instead of one', () => {
  assert.match(mediaBlock('max-height:700px'), /#home #usDailyRitual \.us-daily-ritual-question\{[^}]*-webkit-line-clamp:2/);
  assert.doesNotMatch(mediaBlock('max-height:700px'), /\.us-daily-ritual-question\{[^}]*-webkit-line-clamp:1/);
});

test('the shortest phones still show the daily question', () => {
  assert.doesNotMatch(mediaBlock('max-height:600px'), /\.us-daily-ritual-question\{display:none\}/);
});
