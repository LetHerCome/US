// Beta fix (28/10/2026): the partner shares a link, not a message with the
// code inside. /invito#CODE shows the code on its own, to copy, and opens the
// web app with it. Standalone like the deletion page: no app, no Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inviteFromHash } = require('../invito.js');
const OB = require('../onboarding.js');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const CODE = '01JBX4Z7Q8M2N5P6R9S3T4V7W8';

test('the invite page reads the code from the fragment of the shared link', () => {
  const link = new URL(OB.inviteLink(CODE, 'https://us-a33.pages.dev'));
  assert.equal(link.pathname, '/invito');
  assert.equal(inviteFromHash(link.hash), CODE);
  assert.equal(inviteFromHash('#01jbx-4z7q8m2n5p6r9s3t4v7w8'), CODE, 'typed or lower case');
  for (const nope of ['', '#', '#abc', '#%E0%A4%A', `#${CODE}U`]) assert.equal(inviteFromHash(nope), '', nope);
});

test('the invite page stays standalone: published, outside the app shell, no backend', () => {
  const html = read('invito.html');
  assert.match(html, /<script defer src="\/invito\.js"><\/script>/);
  assert.doesNotMatch(html, /supabase|app\.js|service-worker/i);
  assert.match(html, /<meta name="referrer" content="no-referrer"\/>/);
  assert.match(html, /id="copyCode">Copia codice</);
  assert.match(read('invito.js'), /\$\('openWeb'\)\.href=`\/#invito=\$\{code\}`/, 'the web app takes it from /#invito=');
  const build = read('scripts/build-cloudflare-pages.mjs');
  assert.match(build, /'invito\.html',\n\s+'invito\.js',/);
  assert.match(read('service-worker.js'), /"\/invito", "\/invito\.html",/);
});
