// Regenerates supabase/baseline/ from the committed production evidence.
//   node scripts/build-supabase-baseline.mjs          write the files
//   node scripts/build-supabase-baseline.mjs --check  fail if any file differs
// Reads only committed JSON; never connects to a database.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ROOT, loadF2A, loadCapture } = require('./supabase-baseline/evidence.cjs');
const { generate } = require('./supabase-baseline/generate.cjs');
const { buildCutoff } = require('./supabase-baseline/cutoff.cjs');

const OUT = path.join(ROOT, 'supabase/baseline');
const check = process.argv.includes('--check');

const f2a = loadF2A();
const files = { 'MIGRATION_CUTOFF.json': `${JSON.stringify(buildCutoff(f2a), null, 2)}\n` };
const capture = loadCapture();
if (capture) Object.assign(files, generate(capture, f2a));
else console.warn('No docs/us-2.0/F2A_1_PRODUCTION_CAPTURE*.json yet: only MIGRATION_CUTOFF.json is generated.');

let stale = 0;
for (const [name, text] of Object.entries(files)) {
  const target = path.join(OUT, name);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === text) continue;
  stale += 1;
  if (check) console.error(`stale: supabase/baseline/${name}`);
  else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    console.log(`wrote supabase/baseline/${name}`);
  }
}
if (check && stale) process.exit(1);
