// Audit 05/11/2026, punto 13: RLS policies compute auth.uid() and
// private.current_couple_id() once per statement (wrapped in a sub-select),
// and every foreign key of schema public has an index on its column. Full
// repo schema in disposable PGlite. The RLS behaviour itself is covered by the
// rest of the suite, which runs on the same rebuilt schema.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_rls_initplan_fk_indexes\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
test.before(async () => { db = await h.database({ seed: false }); });
test.after(async () => { await db?.close(); });

// Every call must sit right after «SELECT »: ( SELECT auth.uid() AS uid).
const unwrapped = (expression) => {
  if (!expression) return [];
  const hits = [];
  for (const call of ['auth.uid()', 'private.current_couple_id()']) {
    let at = expression.indexOf(call);
    while (at !== -1) {
      const before = expression.slice(Math.max(0, at - 8), at);
      if (!/SELECT \(?$/.test(before)) hits.push(call);
      at = expression.indexOf(call, at + call.length);
    }
  }
  return hits;
};

test('migration is listed in the cutoff', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_rls_initplan_fk_indexes.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('no RLS policy of public or storage calls auth.uid() or current_couple_id() once per row', async () => {
  const offenders = [];
  for (const p of await q("select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname in ('public', 'storage')")) {
    const hits = [...unwrapped(p.qual), ...unwrapped(p.with_check)];
    if (hits.length) offenders.push(`${p.schemaname}.${p.tablename}.${p.policyname}: ${hits.join(', ')}`);
  }
  assert.deepEqual(offenders, [], 'a new policy must write (select auth.uid()) and (select private.current_couple_id())');
});

test('every foreign key of schema public has an index that starts with its columns', async () => {
  const missing = await q(`select c.conrelid::regclass::text || '.' || c.conname as fk
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
        and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey::int2[])
    order by 1`);
  assert.deepEqual(missing.map((r) => r.fk), [], 'a new foreign key needs its index');
});
