// The read-only query packs are the single source of the fingerprint SQL: the
// rebuild test runs the very same SELECTs on the rebuilt database that were
// run on production, and compares the results.
const fs = require('node:fs');
const path = require('node:path');
const { DOCS } = require('./evidence.cjs');

// Splits a pack into { label: sql } using its "-- <label>. Title" headers.
function parsePack(file, headerPattern) {
  const text = fs.readFileSync(file, 'utf8');
  const body = text.slice(text.indexOf("set local statement_timeout = '60s';") + 37, text.lastIndexOf('rollback;'));
  const blocks = {};
  let label = null;
  let lines = [];
  const flush = () => {
    if (!label) return;
    const sql = lines.filter((l) => !/^\s*--/.test(l)).join('\n').trim();
    if (sql) blocks[label] = sql.replace(/;\s*(--.*)?$/, '');
  };
  for (const line of body.split('\n')) {
    const m = line.match(headerPattern);
    if (m) { flush(); label = m[1]; lines = []; } else lines.push(line);
  }
  flush();
  return blocks;
}

const F2A_PACK = path.join(DOCS, 'F2A_PRODUCTION_READONLY_QUERIES.sql');
const F2A1_PACK = path.join(DOCS, 'F2A_1_PRODUCTION_CAPTURE.sql');

const f2aQueries = () => parsePack(F2A_PACK, /^-- (\d+)\. /);
const captureQueries = () => parsePack(F2A1_PACK, /^-- (c\d\d[ab]?)\. /);

// The alias a block's SELECT returns its single JSON cell under.
function aliasOf(sql) {
  const m = sql.match(/\bas (f2a1?_[a-z0-9_]+)\s*(?:\n|from|$)/g);
  if (!m) throw new Error('block has no f2a alias');
  return m[m.length - 1].match(/f2a1?_[a-z0-9_]+/)[0];
}

module.exports = { parsePack, f2aQueries, captureQueries, aliasOf, F2A_PACK, F2A1_PACK };
