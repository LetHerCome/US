#!/usr/bin/env node
// Lists the Italian texts the app can show, for the English dictionary.
// Usage: node scripts/i18n-extract.mjs [--missing] [--json]
//   --missing  only the texts i18n-en.js does not translate yet
//   --json     machine-readable output
// Sources: index.html (text and the labels i18n.js translates) and the string
// and template literals of every local script index.html loads. The literal
// scan is a heuristic: it errs on listing too much, never on hiding text.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const collapse = (text) => text.replace(/\s+/g, ' ').trim();
const SKIP_SCRIPTS = new Set(['i18n.js', 'i18n-en.js']);
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const ITALIAN = /[àèéìòù]|\b(il|lo|la|le|gli|un|una|di|da|del|della|dei|che|per|non|con|sono|è|ancora|tua|tuo|tue|tuoi|vostr[aoie]|questo|questa|qui|oggi|insieme|cosa|come|quando|dove|niente|nessun[oa]?|ogni|prima|dopo|poi|più|già|anche|solo|tutto|tutti)\b/i;
const WORD = /^[A-ZÀ-Ý][a-zà-ÿ']+(?: [a-zà-ÿ']+)*[.!?…]?$/;

function textOf(fragment) {
  return collapse(fragment
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, '’'));
}

function looksLikeText(text) {
  if (!text || text.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(text)) return false;
  if (/^(https?:|\/|#|\.|\[|data:|[a-z-]+:[a-z]|--)/.test(text)) return false;
  if (/^[a-z0-9_.:-]+$/.test(text) || /^[a-z]+[A-Z][A-Za-z]+$/.test(text)) return false;
  if (/[{};=]|=>|\(\)|\bfunction\b|\bselect\b.*\bfrom\b/i.test(text) && !/\{[a-z]+\}/.test(text)) return false;
  return ITALIAN.test(text) || WORD.test(text);
}

function fromHtml(html, where, out) {
  const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const noTranslate = [];
  for (const piece of body.split(/(<[^>]+>)/)) {
    if (piece.startsWith('<')) {
      if (/translate="no"/.test(piece)) noTranslate.push(true);
      for (const name of ATTRS) {
        const value = piece.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
        if (value && looksLikeText(textOf(value))) out.push({ text: textOf(value), where, kind: name });
      }
      continue;
    }
    const text = textOf(piece);
    if (looksLikeText(text)) out.push({ text, where, kind: 'text' });
  }
}

// String literals, and template literals with each ${…} as a {x} part.
function fromScript(source, file, out) {
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /console\.(log|warn|error|info|debug)\(/.test(line)) return;
    const where = `${file}:${index + 1}`;
    for (const match of line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      let raw = match[1] ?? match[2] ?? match[3] ?? '';
      raw = raw.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ');
      let n = 0;
      raw = raw.replace(/\$\{[^}]*\}/g, () => `{x${++n}}`);
      if (/<[a-z][^>]*>/i.test(raw)) { fromHtml(raw, where, out); continue; }
      const text = collapse(raw);
      if (looksLikeText(text)) out.push({ text, where, kind: match[3] !== undefined ? 'template' : 'string' });
    }
  });
}

const html = read('index.html');
const found = [];
fromHtml(html, 'index.html', found);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="\/([^"?]+\.js)/g)].map((m) => m[1]).filter((file) => !SKIP_SCRIPTS.has(file));
for (const file of scripts) {
  if (fs.existsSync(path.join(ROOT, file))) fromScript(read(file), file, found);
}

const seen = new Map();
for (const row of found) {
  const entry = seen.get(row.text) || { text: row.text, where: [], kind: row.kind };
  if (entry.where.length < 3) entry.where.push(row.where);
  seen.set(row.text, entry);
}
let rows = [...seen.values()];
if (process.argv.includes('--missing')) {
  const I18n = require(path.join(ROOT, 'i18n.js'));
  const dict = I18n.compile(require(path.join(ROOT, 'i18n-en.js')));
  rows = rows.filter((row) => !/\{x\d+\}/.test(row.text) && I18n.lookup(dict, row.text) === null || /\{x\d+\}/.test(row.text) && !dict.patterns.some((p) => p.re.test(row.text.replace(/\{x\d+\}/g, 'X'))));
}
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
else {
  for (const row of rows) console.log(`${row.text}\t${row.where.join(' ')}`);
  console.error(`${rows.length} texts`);
}
