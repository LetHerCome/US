// Inglese completo (27/11/2026): every Italian text these screens can show has
// its English entry in i18n-en.js. Same literal scan as scripts/i18n-extract.mjs
// (string and template literals, each ${…} as a {xN} part, HTML pieces and
// their labels), with a wider idea of «Italian» and no code: selectors, CSS,
// class lists, key names and the halves of nested templates are left out.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const I18n = require('../i18n.js');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['intro.js', 'us-ricorda.js', 'bacheca.js', 'oggi-look.js', 'personaggi.js', 'widget-hub.js', 'noi-v2.js'];
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const KEYS = /^(Escape|Tab|Enter|Backspace|Space|Arrow(Left|Right|Up|Down))$/;
const ITALIAN = /[àèéìòù]|\b(il|lo|la|le|gli|un|una|uno|di|da|del|della|dei|delle|che|per|non|con|col|sono|siete|ancora|tua|tuo|tue|tuoi|vostr[aoie]|nostr[aoie]|questo|questa|qui|oggi|domani|insieme|cosa|come|quando|dove|niente|nessun[oa]?|ogni|prima|dopo|poi|più|già|anche|solo|tutto|tutti|tocca|ti|vi|ci|mi|si|ne|al|ai|alla|alle|nel|nella|sul|sulla|tra|fra|anni|anno|giorni|mesi|ricordi?|bacheca|foto|apri|chiudi|metti|scrivi|e|te|ha|hai|ho)\b/i;
const WORD = /^[A-ZÀ-Ý][a-zà-ÿ’']+[.!?…]?$/;

const collapse = (text) => text.replace(/\s+/g, ' ').trim();
const decode = (text) => text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function looksItalian(text) {
  const words = text.replace(/\{x\d+\}/g, ' ').trim();
  if (words.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(words)) return false;
  if (KEYS.test(words)) return false;
  // Code: selectors, CSS, markup or JS left over from a nested template.
  if (/^[:.#[@-]|^\(|[$`{}()[\]<>=;|\\]|\b(px|rgba?|var|calc|translate|scale|cubic-bezier|srgb)\b/.test(words)) return false;
  // Keys and storage names: one lowercase word, or words glued by a colon (us:bacheca:seen).
  if (/^[a-z0-9_-]+$/.test(words) || /[A-Za-z0-9}]:[A-Za-z0-9{]/.test(text.replace(/\d+:\d+/g, ''))) return false;
  // Class lists and ids: lowercase tokens with - or _.
  const tokens = words.split(/\s+/);
  if (tokens.every((t) => /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(t)) && tokens.some((t) => /[-_]/.test(t))) return false;
  return ITALIAN.test(words) || WORD.test(words);
}

function literals(file) {
  const out = [];
  fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, index) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /console\.(log|warn|error|info|debug)\(/.test(line)) return;
    for (const match of line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      let raw = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ');
      let n = 0;
      raw = raw.replace(/\$\{[^}]*\}/g, () => `{x${++n}}`);
      const pieces = [];
      if (/<[a-z][^>]*>/i.test(raw)) {
        for (const piece of raw.split(/(<[^>]+>)/)) {
          if (!piece.startsWith('<')) { pieces.push(piece); continue; }
          for (const name of ATTRS) {
            const value = piece.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
            if (value) pieces.push(value);
          }
        }
      } else pieces.push(raw);
      for (const piece of pieces) {
        const text = collapse(decode(piece));
        if (looksItalian(text)) out.push({ text, where: `${file}:${index + 1}` });
      }
    }
  });
  return out;
}

// A {xN} part becomes a sample number (every pattern capture takes one); an
// icon or a suffix glued to the text (${icon('x')}Testo, Testo${extra}) is left out.
function covered(dict, text) {
  const key = text.replace(/^(\{x\d+\})+(?=[A-ZÀ-Ý])/, '').replace(/(?<=[A-Za-zà-ÿ])(\{x\d+\})+$/, '').trim();
  if (dict.exact.has(key)) return true;
  return I18n.lookup(dict, key.replace(/\{x\d+\}/g, '1')) !== null;
}

test('inglese completo: every Italian text of the intro, US vi ricorda, the bacheca, the Oggi looks, the characters, the widgets and Noi has its English', () => {
  const dict = I18n.compile(require('../i18n-en.js'));
  const found = FILES.flatMap(literals);
  assert.ok(found.length > 150, `the scan sees the texts (${found.length})`);
  const missing = found.filter((row) => !covered(dict, row.text)).map((row) => `${row.where}  ${row.text}`);
  assert.deepEqual([...new Set(missing)], [], 'add these to i18n-en.js');
});

test('inglese completo: the scan leaves code alone and still sees text', () => {
  for (const code of ['Escape', 'Tab', 'bacheca', 'anni', 'us:bacheca:seen:v1:{x1}', 'bacheca:{x1}', 'us:tocca-a-te', ':scope > .us-oggi-tint', '#usAngolo [data-angolo-tab]', '(prefers-reduced-motion: reduce)', 'ub-item ub-{x1}{x2}', 'translate({x1}px, {x2}px) scale({x3})', 'us-oggi-fx mini-fx', ": c.name)}\"{x1}>"]) {
    assert.equal(looksItalian(code), false, code);
  }
  for (const text of ['Eccomi', 'Una prima volta', 'Tocca: le foglie vicine saltano e ruzzolano.', 'Siete arrivati a {x1} ricordi.', 'Contati uno a uno: {x1} giorni.', '{x1} ha giocato e aspetta te.']) {
    assert.equal(looksItalian(text), true, text);
  }
  const dict = I18n.compile({ 'In uso su Oggi': 'In use on Today', 'Si sblocca al livello {n} di Sintonia': 'Unlocks at Sync level {n}' });
  assert.equal(covered(dict, '{x1}In uso su Oggi'), true, 'an icon before the text');
  assert.equal(covered(dict, '{x1}Si sblocca al livello {x2} di Sintonia{x3}'), true, 'a suffix after the text');
  assert.equal(covered(dict, '{x1}: oggi si festeggia.'), false);
});
