// Rewrites the generated US content 1.1 block (between its begin/end markers)
// inside the content 1.1 migration from supabase/game-v2/content-1-1. With
// --print it only writes the block to stdout.
//   node scripts/build-content-1-1-sql.mjs [--print]
// tests/content-1-1-catalog.test.js fails when the migration and the JSON
// sources disagree.
import fs from 'node:fs';
import path from 'node:path';
import { extractBlock } from '../supabase/game-v2/catalog-contract.mjs';
import { BLOCK, MIGRATION, REPO, contentSql } from '../supabase/game-v2/content-1-1-contract.mjs';

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
