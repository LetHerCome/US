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
  const base = read('top-chrome.css').match(/\.top\.us-premium-top \{([^}]*)\}/);
  assert.ok(base, 'base rule of the top bar');
  assert.doesNotMatch(base[1], /visibility:\s*visible/);
  assert.match(base[1], /visibility:\s*inherit/);
});
