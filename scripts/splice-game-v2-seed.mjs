// Rewrites a generated block (between its begin/end markers) inside a
// migration from the JSON editorial sources. Usage:
//   node scripts/splice-game-v2-seed.mjs <migration.sql> <catalog|recipes>
import fs from 'node:fs';
import * as contract from '../supabase/game-v2/catalog-contract.mjs';

const [file, which = 'catalog'] = process.argv.slice(2);
const name = which === 'catalog' ? 'game-v2-catalog' : 'game-v2-recipes';
const block = which === 'catalog' ? contract.catalogSql() : contract.recipesSql();
const sql = fs.readFileSync(file, 'utf8');
const current = contract.extractBlock(sql, name);
if (!current) throw new Error(`markers for ${name} not found in ${file}`);
fs.writeFileSync(file, sql.replace(current, block));
