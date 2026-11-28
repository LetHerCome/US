// US Plus in vetrina (founder, 28/11/2026): the Plus questions are played only with
// Plus but seen in Gioca: a tile «Sbloccabili con US Plus» and a sheet with every
// one of them, locked, by theme, with «Avvisatemi». With Plus the tile goes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Gioca: the Plus tile, its sheet and the waitlist', () => {
  const src = read('games.js');
  assert.match(src, /sb\.rpc\('get_plus_preview_v1'\)/);
  assert.match(src, /if \(!d \|\| d\.has_plus \|\| !Array\.isArray\(d\.items\) \|\| !d\.items\.length\) return '';/, 'no tile with Plus');
  assert.match(src, /\$\{plusTile\(\)\}/);
  assert.match(src, /Sbloccabili con US Plus/);
  assert.match(src, /else if \(action === 'plus-preview'\) showPlusPreview\(\);/);
  assert.match(src, /sb\.rpc\('plus_waitlist', \{ join: true \}\)/);
  assert.match(read('games.css'), /data-gv2-icon="lock-simple"\]\{-webkit-mask-image:url\("\/assets\/icons\/phosphor\/lock-simple-fill\.svg"\)/);
  const sql = read('supabase/migrations/20261128113629_contenuti_plus_vetrina.sql');
  assert.match(sql, /security definer/);
  assert.match(sql, /grant execute on function public\.get_plus_preview_v1\(\) to authenticated;/);
  assert.doesNotMatch(sql, /'options'|options_en|'id'/, 'only the words, never the answers or ids');
});
