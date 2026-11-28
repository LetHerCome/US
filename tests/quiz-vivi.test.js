// Quiz vivi (founder, 28/11/2026, grill D2): the quizzes stay turn-based without a
// timer, but a tap on a choice goes on by itself, your character walks a path
// towards the other one, and at the reveal the two answers come from opposite
// sides (equal ones light up in gold).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('quiz vivi: the path, the tap that goes on, the meeting of the answers', () => {
  const src = read('games.js');
  const css = read('dc-gioca.css');
  assert.match(src, /function pathMarkup\(total\)/);
  assert.match(src, /class=\\"us-gv2-path-me\\"|class="us-gv2-path-me"/);
  assert.match(src, /characterOf\(partnerRoleOf\(\), \{ size: 28, reaction: 'sera' \}\)/, 'the other one waits at the end');
  assert.match(src, /walkPath\(root, total\);/);
  // Only a tap goes on (not the keyboard's arrows), never on the last question, never for Questo o quello.
  assert.match(src, /const tapped = Date\.now\(\) - pointerAt < 900;/);
  assert.match(src, /current\.game_family !== 'swipe' && index < current\.items\.length - 1/);
  assert.match(src, /style="--j:\$\{number - 1\}"/);
  assert.match(src, /us-gv5-reveal-duo/);
  for (const rule of ['us-gv5-from-left', 'us-gv5-from-right', 'us-gv5-gold', '.us-gv2-path-me{position:absolute']) assert.ok(css.includes(rule), rule);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{#quiz \.us-gv5-reveal\.is-first-reveal/);
});
