// Redesign definitivo, fase 7 (founder 23/11/2026, D14): the intro with the
// characters. The tour before the account is three scenes with the two
// characters; at sign-up each of you makes their character (shape and
// colour) instead of the step with the circles; while waiting your character
// waits beside the other one's empty place; when the other one arrives the
// two meet and make festa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const ob = read('onboarding.js');

test('the tour: three scenes with the two characters, no circles', () => {
  const tour = html.slice(html.indexOf('<section class="us-tour" id="usTour"'), html.indexOf('id="usTourDots"'));
  assert.ok(tour, 'the tour');
  const slides = tour.match(/<section class="us-tour-slide"[\s\S]*?<\/section>/g) || [];
  assert.equal(slides.length, 3);
  for (const slide of slides) {
    assert.equal((slide.match(/class="us-tour-char" data-tour-char="[ab]"/g) || []).length, 2, 'two characters in each scene');
  }
  assert.doesNotMatch(tour, /class="t1-a"|class="t1-b"|class="t2-a"|class="t2-b"|class="us-duo-a"/, 'no circles left');
  assert.match(slides[0], /<h2>Un posto solo <em>per voi due<\/em><\/h2>/);
  assert.match(ob, /const TOUR_CHAR=\{a:\{shape:'palla',color:'var\(--us-rosa\)'\},b:\{shape:'quadrato',color:'var\(--us-lilla\)'\}\};/);
  assert.match(ob, /const TOUR_REACTION=\[\['',''\],\['','cuore'\],\['festa','festa'\]\];/, 'side by side, a Ti penso, festa');
  assert.match(ob, /paintTourPhotos\(root\);paintTourDuos\(root\);/);
});

test('the step that had the circles: my character and the other one\'s place, or the two of us', () => {
  const src = ob.slice(ob.indexOf('  const DUO_SIZE=92;'), ob.indexOf('  // D14: at the first opening each of you makes their character'));
  const vm = require('node:vm');
  const host = { dataset: {}, innerHTML: '', append() {} };
  const ctx = vm.createContext({
    document: { createElement: () => ({ append() {}, className: '', textContent: '' }) },
    globalThis: { UsPersonaggi: { character: (who, o) => `<svg data-shape="${who.shape}" data-color="${who.color}" data-reaction="${o.reaction || ''}"></svg>`, slot: (shape) => `<svg data-slot="${shape}"></svg>`, shapeOf: () => undefined } },
  });
  vm.runInContext(`${src};this.drawVenn=drawVenn;`, ctx);
  ctx.drawVenn(host, { kind: 'wait', role: 'beatrice', partner: '', shape: 'nuvola' });
  assert.match(host.innerHTML, /<span class="ov-char ov-wait ov-wait-a"><svg data-slot="palla"><\/svg><\/span>/, 'the other one\'s empty place');
  assert.match(host.innerHTML, /<span class="ov-char ov-b ov-me"><svg data-shape="nuvola" data-color="var\(--us-lilla\)" data-reaction=""><\/svg><\/span>/, 'my character, my shape');
  ctx.drawVenn(host, { kind: 'joined', role: 'francesco', partner: 'Bea' });
  assert.match(host.innerHTML, /ov-a ov-me"><svg data-shape="palla" data-color="var\(--us-rosa\)" data-reaction="festa">/);
  assert.match(host.innerHTML, /ov-b ov-partner"><svg data-shape="quadrato" data-color="var\(--us-lilla\)" data-reaction="festa">/, 'they meet and make festa');
  assert.doesNotMatch(host.innerHTML, /<circle/);
});

test('«Chi sei in US?»: shape and colour, saved with the guardaroba\'s rule', () => {
  assert.match(html, /<div class="us-ob-shapes" id="mc3Shapes" role="group" aria-label="La forma" hidden><\/div>/);
  assert.match(html, /<div class="us-ob-shapes" id="usSetupShapes" role="group" aria-label="La forma" hidden><\/div>/);
  assert.match(html, /<div id="mc3Waiting" data-us-enter="flat" hidden>\n\s*<div class="us-ob-venn" id="mc3WaitDuo" aria-hidden="true"><\/div>/);
  assert.match(ob, /color:\['Chi sei in ','US\?'\]/, 'who creates the couple');
  assert.match(ob, /if\(step==='color'\)\{setTitle\(title,'Chi sei in ','US\?'\);/, 'who joins');
  assert.match(ob, /colourIO\.rpc\('set_my_character_shape',\{p_shape:shape\}\)/);
  assert.match(ob, /if\(step==='noi'\)\{setTitle\(title,'Ora siete ','in due'\);drawVenn\(venn,\{kind:'joined'/);
  assert.match(ob, /drawVenn\(node\('mc3WaitDuo'\),\{kind:'wait'/);
  assert.match(read('app.js'), /select\('id,display_name,role,couple_id,avatar_path,character_shape'\)/);
  assert.match(read('app.js'), /select\('id,role,person_color,character_shape'\)/);
  for (const it of ['Chi sei in', 'Un posto solo', 'per voi due', 'Scegli forma e colore: sarà il tuo personaggio, in tutta l’app.', 'in due']) assert.ok(read('i18n-en.js').includes(`'${it}'`), it);
});
