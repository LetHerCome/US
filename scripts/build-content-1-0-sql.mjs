// Rewrites the generated US 1.0 content block (between its begin/end markers)
// inside the content migration from supabase/game-v2/content-1-0. With
// --print it only writes the block to stdout.
//   node scripts/build-content-1-0-sql.mjs [--print]
// tests/content-1-0-catalog.test.js fails when the migration and the JSON
// sources disagree.
import fs from 'node:fs';
import path from 'node:path';
import { extractBlock } from '../supabase/game-v2/catalog-contract.mjs';
import { BLOCK, MIGRATION, REPO, contentSql } from '../supabase/game-v2/content-1-0-contract.mjs';

const block = contentSql();
if (process.argv.includes('--print')) {
  process.stdout.write(`${block}\n`);
} else {
  const file = path.join(REPO, MIGRATION);
  const sql = fs.readFileSync(file, 'utf8');
  const current = extractBlock(sql, BLOCK);
  if (!current) throw new Error(`markers for ${BLOCK} not found in ${MIGRATION}`);
  fs.writeFileSync(file, sql.replace(current, () => block));
}
