// Revisione di staging (founder, 03/11/2026): on a first visit the top bar
// (heart, logo, envelope) showed alone for about two seconds before the welcome.
// Before sign-in onboarding.css hides the app (visibility:hidden on body > .app);
// the bar must follow it instead of forcing itself visible.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('before sign-in the hidden app hides its top bar too', () => {
  assert.match(read('onboarding.css'), /html:not\(\.us-auth-ready\) body > :not\(#authOverlay\):not\(#usAppLock\):not\(script\):not\(style\)/);
  // Il diario, ma pulito (15/11/2026): the old top bar is a hidden holder; the
  // header of Oggi (.dy-head) lives inside .app, so the rule above hides it too,
  // and nothing forces it visible.
  const html = read('index.html');
  assert.match(html, /<div class="top us-premium-top" hidden>/);
  assert.ok(html.indexOf('<div class="app">') < html.indexOf('<header class="dy-head">'), 'the Oggi header is inside .app');
  assert.doesNotMatch(read('diario.css'), /visibility:\s*visible/);
});
