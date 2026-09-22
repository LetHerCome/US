const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const FIX = 'supabase/migrations/20260922215330_enforce_left_for_you_insert_unseen.sql';
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

test('M5B seen_at invariant: forward-only fix migration exists, non-rewriting', () => {
  assert.ok(fs.existsSync(path.join(ROOT, FIX)),
    'la migration di hardening deve esistere col timestamp successivo al remote tail');
  const sql = read(FIX);
  const statements = stripComments(sql);
  // Forward-only: ricrea la policy, non riscrive le migration già applicate.
  assert.match(statements, /drop policy if exists left_for_you_insert_own on public\.left_for_you/i);
  assert.match(statements, /create policy left_for_you_insert_own/i);
  assert.doesNotMatch(statements, /drop table|drop function/i);
  assert.doesNotMatch(statements, /alter table public\.(stories|story_views|moments|moment_photos|shared_messages)/i,
    'la migration non deve toccare gli altri domini');
});

test('M5B seen_at invariant: WITH CHECK vieta INSERT con seen_at popolato', () => {
  const sql = read(FIX);
  const statements = stripComments(sql);
  // Il vincolo deve stare nel with check della policy INSERT.
  assert.match(statements,
    /for insert to authenticated[\s\S]*?with check \([\s\S]*?and seen_at is null[\s\S]*?\)/i,
    'un client non deve poter INSERTare un item con seen_at già valorizzato');
  // seen_at non deve essere riportato a NULL altrove (niente revoca via SQL client).
  assert.doesNotMatch(statements, /set seen_at\s*=\s*null/i);
});

test('M5B seen_at invariant: policy ricreata identica su coppia/sender/recipient/path', () => {
  const sql = read(FIX);
  const statements = stripComments(sql);
  assert.match(statements, /couple_id = private\.current_couple_id\(\)/i);
  assert.match(statements, /sender_id = auth\.uid\(\)/i);
  assert.match(statements, /recipient_id <> sender_id/i);
  assert.match(statements, /partner\.id = left_for_you\.recipient_id/i);
  assert.match(statements, /partner\.couple_id = private\.current_couple_id\(\)/i);
  assert.match(statements,
    /starts_with\(\s*media_path,\s*couple_id::text \|\| '\/' \|\| auth\.uid\(\)::text \|\| '\/'/i,
    "l'ownership namespace photo resta invariato");
});

test('M5B seen_at invariant: nessun nuovo percorso UPDATE/DELETE client', () => {
  const sql = read(FIX);
  const statements = stripComments(sql);
  assert.doesNotMatch(statements, /for update to|for delete to/i);
  assert.doesNotMatch(statements, /grant update|grant delete|grant all/i);
  assert.doesNotMatch(statements, /alter publication/i);
  // La RPC seen resta l'unica via di transizione: nessuna nuova funzione.
  assert.doesNotMatch(statements, /create (or replace )?function/i);
});

test('M5B seen_at invariant: la RPC mark_left_item_seen resta intatta in remote', () => {
  // La migration non tocca la RPC: il lifecycle seen passa solo da lì.
  const sql = read(FIX);
  assert.doesNotMatch(sql, /mark_left_item_seen[\s\S]*create or replace/i);
  // Nota documentale: la transizione avviene via UPDATE interno (owner
  // postgres con bypassrls), quindi la policy INSERT non la influenza.
  assert.doesNotMatch(sql, /revoke execute/i);
});
