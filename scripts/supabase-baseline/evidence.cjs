// Loads committed production evidence (F2A blocks and the F2A.1 capture) as
// plain data. The connector wraps every result in an untrusted-data envelope;
// it is unwrapped and parsed as JSON only, never executed or interpreted.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(ROOT, 'docs/us-2.0');

const F2A_FILES = [
  'F2A_PRODUCTION_RESULTS_01_05.json',
  'F2A_PRODUCTION_RESULTS_06_10.json',
  'F2A_PRODUCTION_RESULTS_11_14_AND_FUNCTIONS.json',
];

// Returns the JSON value inside a connector result, whatever the wrapping:
// {"result": "...<untrusted-data-x>JSON</untrusted-data-x>..."}, the bare
// envelope text, or plain JSON.
function unwrap(text) {
  let value = text;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{"result"')) value = JSON.parse(trimmed).result;
  }
  if (value && typeof value === 'object' && typeof value.result === 'string') value = value.result;
  if (typeof value !== 'string') return value;
  // The preamble names the tag once before the real opening tag, so take the
  // last opening tag before the closing one.
  const close = value.match(/<\/untrusted-data-([0-9a-f-]+)>/);
  if (!close) return JSON.parse(value);
  const open = `<untrusted-data-${close[1]}>`;
  const start = value.lastIndexOf(open, close.index) + open.length;
  return JSON.parse(value.slice(start, close.index));
}

// Collects every `{alias: value}` produced by a capture block, keyed by the
// SELECT alias (f2a_02_counts, f2a1_c04_constraints, ...). Walks any nesting
// so it does not depend on how the results file names its blocks.
function collectAliases(node, prefix, out) {
  if (node == null) return out;
  if (typeof node === 'string') {
    let parsed;
    try { parsed = unwrap(node); } catch { return out; }
    if (parsed !== node) collectAliases(parsed, prefix, out);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectAliases(item, prefix, out);
    return out;
  }
  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith(prefix)) {
        if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error(`capture alias ${key} appears twice`);
        out[key] = value;
      } else collectAliases(value, prefix, out);
    }
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadF2A() {
  const out = {};
  for (const file of F2A_FILES) collectAliases(readJson(path.join(DOCS, file)), 'f2a_', out);
  const extra = readJson(path.join(DOCS, 'F2A_PRODUCTION_RESULTS_11_14_AND_FUNCTIONS.json'));
  out.edge_functions = unwrap(extra.edge_functions.text);
  out.monthiversary_job = unwrap(extra.monthiversary_job.text);
  return out;
}

function captureFiles(dir = DOCS) {
  return fs.readdirSync(dir).filter((f) => /^F2A_1_PRODUCTION_CAPTURE.*\.json$/.test(f)).sort().map((f) => path.join(dir, f));
}

// The F2A.1 capture, or null while it has not been committed yet.
function loadCapture(dir = DOCS) {
  const files = captureFiles(dir);
  if (!files.length) return null;
  const out = {};
  for (const file of files) collectAliases(readJson(file), 'f2a1_', out);
  return out;
}

// F2A.2 evidence, or null while not committed: the preflight re-run of the
// F2A.1 pack, the ledger export, and the schema digest before / after repair.
function loadEvidence(pattern, prefix, dir = DOCS) {
  const files = fs.readdirSync(dir).filter((f) => pattern.test(f)).sort();
  if (!files.length) return null;
  const out = {};
  for (const file of files) collectAliases(readJson(path.join(dir, file)), prefix, out);
  return out;
}
const loadPreflight = (dir) => loadEvidence(/^F2A_2_PREFLIGHT_CAPTURE.*\.json$/, 'f2a1_', dir);
const loadLedgerExport = (dir) => loadEvidence(/^F2A_2_LEDGER_EXPORT.*\.json$/, 'f2a2_', dir);
const loadDigest = (when, dir) => loadEvidence(new RegExp(`^F2A_2_SCHEMA_DIGEST_${when}\\.json$`), 'f2a2_', dir);

module.exports = { ROOT, DOCS, unwrap, collectAliases, loadF2A, loadCapture, captureFiles, loadPreflight, loadLedgerExport, loadDigest };
