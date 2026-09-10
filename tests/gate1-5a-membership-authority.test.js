const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function readMembershipMigration() {
  const directory = path.join(ROOT, 'supabase/migrations');
  const migrations = fs.readdirSync(directory)
    .filter((name) => name.endsWith('_gate_1_5a_membership_authority.sql'));
  assert.equal(migrations.length, 1, 'Gate 1.5A must have exactly one membership authority migration');
  return fs.readFileSync(path.join(directory, migrations[0]), 'utf8');
}

test('Gate 1.5A removes broad and inherited profile UPDATE authority before granting only personal columns', () => {
  const sql = readMembershipMigration();

  const tableRevoke = sql.search(/revoke\s+update\s+on\s+table\s+public\.profiles\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  const allColumnRevoke = sql.search(/revoke update \(%s\) on public\.profiles from public, anon, authenticated/i);
  const safeGrant = sql.match(/grant\s+update\s*\(([^)]+)\)\s+on\s+table\s+public\.profiles\s+to\s+authenticated/i);

  assert.notEqual(tableRevoke, -1, 'table-level UPDATE must be revoked from every client role');
  assert.notEqual(allColumnRevoke, -1, 'pre-existing per-column UPDATE grants must also be revoked');
  assert.ok(safeGrant, 'authenticated must receive an explicit safe-column UPDATE grant');
  assert.ok(tableRevoke < safeGrant.index);
  assert.ok(allColumnRevoke < safeGrant.index);
  assert.deepEqual(
    safeGrant[1].split(',').map((column) => column.trim().toLowerCase()).sort(),
    ['avatar_path', 'display_name'],
  );
});

test('Gate 1.5A has executable catalog contracts denying membership-column UPDATE to authenticated', () => {
  const sql = readMembershipMigration();

  assert.match(sql, /has_column_privilege\(\s*'authenticated'\s*,\s*'public\.profiles'\s*,\s*'couple_id'\s*,\s*'UPDATE'\s*\)/i);
  assert.match(sql, /has_column_privilege\(\s*'authenticated'\s*,\s*'public\.profiles'\s*,\s*'role'\s*,\s*'UPDATE'\s*\)/i);
  assert.match(sql, /attname\s+not\s+in\s*\(\s*'display_name'\s*,\s*'avatar_path'\s*\)/i);
  assert.match(sql, /has_column_privilege\([\s\S]*attribute\.attnum[\s\S]*'UPDATE'/i);
  assert.match(sql, /not\s+has_column_privilege\(\s*'authenticated'\s*,\s*'public\.profiles'\s*,\s*'display_name'\s*,\s*'UPDATE'\s*\)/i);
  assert.match(sql, /not\s+has_column_privilege\(\s*'authenticated'\s*,\s*'public\.profiles'\s*,\s*'avatar_path'\s*,\s*'UPDATE'\s*\)/i);
});

test('Gate 1.5A preserves claim_us_role as the SECURITY DEFINER membership authority', () => {
  const sql = readMembershipMigration();

  assert.match(sql, /to_regprocedure\(\s*'public\.claim_us_role\(text,text\)'\s*\)/i);
  assert.match(sql, /pg_proc\.prosecdef/i);
  assert.match(sql, /has_column_privilege\([\s\S]*v_claim_owner[\s\S]*'couple_id'[\s\S]*'UPDATE'/i);
  assert.match(sql, /has_column_privilege\([\s\S]*v_claim_owner[\s\S]*'role'[\s\S]*'UPDATE'/i);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.claim_us_role/i);
  assert.doesNotMatch(sql, /drop\s+function\s+(?:if\s+exists\s+)?public\.claim_us_role/i);
});
