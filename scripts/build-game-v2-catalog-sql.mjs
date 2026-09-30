// Prints the generated Game V2 SQL seed blocks. Paste the output between the
// matching begin/end markers of the migration; tests/m11b-game-v2-editorial
// fails when the migration and the JSON sources disagree.
import { catalogSql } from '../supabase/game-v2/catalog-contract.mjs';

const which = process.argv[2] || 'catalog';
if (which === 'catalog') process.stdout.write(`${catalogSql()}\n`);
else if (which === 'recipes') {
  const { recipesSql } = await import('../supabase/game-v2/catalog-contract.mjs');
  if (typeof recipesSql !== 'function') throw new Error('recipes block not available');
  process.stdout.write(`${recipesSql()}\n`);
} else throw new Error(`unknown block ${which}`);
