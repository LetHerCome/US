const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('tab entry: a stale timeout cannot kill a newer entry', () => {
  const app = read('app.js');
  const source = app.slice(0, app.indexOf('let usPageHydrationTicket=0;'));
  assert.ok(source.includes('const usEntryTimers = new WeakMap()'));
  let next = 1;
  const callbacks = new Map();
  const sandbox = {
    window: { UsUiFoundation: { isReducedMotion: () => false } },
    WeakMap,
    setTimeout(fn) { const id = next++; callbacks.set(id, fn); return id; },
    clearTimeout(id) { callbacks.delete(id); }
  };
  vm.runInNewContext(source + '\nthis.motion={animatePageEntry,clearPageEntry};', sandbox);
  const classes = new Set();
  const page = { classList: { add(k) { classes.add(k); }, remove(...keys) { keys.forEach((k)=>classes.delete(k)); } } };
  sandbox.motion.animatePageEntry(page, 1);
  const first = [...callbacks.values()][0];
  assert.ok(classes.has('us-motion5-enter-next'));
  sandbox.motion.animatePageEntry(page, -1);
  assert.ok(classes.has('us-motion5-enter-prev'));
  assert.equal(callbacks.size, 1, 'the old timer is cancelled');
  first();
  assert.ok(classes.has('us-motion5-enter-prev'), 'even a stale callback cannot clear the new transition');
  [...callbacks.values()][0]();
  assert.ok(!classes.has('us-motion5-enter-prev'));
});

test('premium navigation keeps swipe tracking compositor-only and respects reduced motion', () => {
  const polish = read('polish4.css');
  const styles = read('styles.css');
  assert.match(polish, /animation:usMotion5PageEnter 240ms/);
  assert.match(styles, /html\.us-native-android \.page\.active\.us-motion5-enter-next,[\s\S]*animation-duration:220ms!important/);
  assert.match(polish, /\.page\.us-motion31-current\{[\s\S]*transform:translate3d/);
  assert.match(polish, /@media\(prefers-reduced-motion:reduce\)\{/);
  assert.match(read('modal-center.css'), /opacity var\(--us-motion-surface\) var\(--us-ease-standard\)/);
  assert.match(read('ui-foundation.css'), /:root\[data-us-motion="reduced"\]/);
});
