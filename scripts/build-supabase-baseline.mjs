// Regenerates supabase/baseline/ and the baseline migration from the committed production evidence.
//   node scripts/build-supabase-baseline.mjs          write the files
//   node scripts/build-supabase-baseline.mjs --check  fail if any file differs
// Reads only committed JSON; never connects to a database.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ROOT, loadF2A, loadCapture, loadLedgerExport } = require('./supabase-baseline/evidence.cjs');
const { generate } = require('./supabase-baseline/generate.cjs');
const { buildCutoff } = require('./supabase-baseline/cutoff.cjs');
const { BASELINE_PATH, baselineMigration } = require('./supabase-baseline/migration.cjs');
const { digestSql } = require('./supabase-baseline/digest.cjs');
const { repairSet, ledgerHistoryFiles } = require('./supabase-baseline/repair.cjs');

const OUT = path.join(ROOT, 'supabase/baseline');
const check = process.argv.includes('--check');

const f2a = loadF2A();
const files = {
  'MIGRATION_CUTOFF.json': `${JSON.stringify(buildCutoff(f2a), null, 2)}\n`,
  '../../docs/us-2.0/F2A_2_SCHEMA_DIGEST.sql': digestSql(),
};
const capture = loadCapture();
if (capture) {
  Object.assign(files, generate(capture, f2a));
  // Relative to the repo root, not supabase/baseline/.
  files[`../../${BASELINE_PATH}`] = baselineMigration(files);
  files['LEDGER_REPAIR.json'] = `${JSON.stringify(repairSet(capture), null, 2)}\n`;
}
const exported = loadLedgerExport();
if (exported) {
  for (const [name, text] of Object.entries(ledgerHistoryFiles(exported).files)) files[`../migrations_history/ledger/${name}`] = text;
}
if (!capture) console.warn('No docs/us-2.0/F2A_1_PRODUCTION_CAPTURE*.json yet: only MIGRATION_CUTOFF.json is generated.');

let stale = 0;
for (const [name, text] of Object.entries(files)) {
  const target = path.join(OUT, name);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === text) continue;
  stale += 1;
  if (check) console.error(`stale: ${path.relative(ROOT, target)}`);
  else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    console.log(`wrote ${path.relative(ROOT, target)}`);
  }
}
if (check && stale) process.exit(1);
