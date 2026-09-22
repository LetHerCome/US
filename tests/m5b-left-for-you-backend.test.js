const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const V1 = 'supabase/migrations/20260922180436_left_for_you_v1.sql';
const FIX = 'supabase/migrations/20260922182210_fix_left_for_you_partner_scope_and_grants.sql';
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

test('M5B history: due migration forward-only allineate al remote', () => {
  assert.ok(fs.existsSync(path.join(ROOT, V1)), 'la V1 deve esistere col timestamp remote 20260922180436');
  assert.ok(fs.existsSync(path.join(ROOT, FIX)), 'il fix deve essere una migration separata 20260922182210');
  const v1 = read(V1);
  // La V1 è preservata esattamente come primo deploy: il fix NON è retroattivo.
  assert.match(v1, /create table public\.left_for_you/i);
  assert.doesNotMatch(v1, /revoke update[\s\S]*from authenticated/i, 'il grants fix non è retroattivo nella V1');
  assert.match(v1, /alter publication supabase_realtime add table public\.left_for_you/i);
});

test('M5B V1: dominio dedicato con contratto text/photo, nessuna scadenza', () => {
  const sql = read(V1);
  const statements = stripComments(sql);
  assert.match(sql, /sender_id uuid not null/i);
  assert.match(sql, /recipient_id uuid not null/i);
  assert.match(sql, /kind in \('text', 'photo'\)/i);
  assert.match(sql, /left_for_you_text_contract_check/i);
  assert.match(sql, /left_for_you_photo_contract_check/i);
  assert.match(sql, /left_for_you_no_self_check[\s\S]*?check \(sender_id <> recipient_id\)/i);
  assert.match(sql, /seen_at timestamptz/i);
  assert.doesNotMatch(statements, /expires_at/i, 'nessuna scadenza 24h: semantica non-Stories');
  assert.doesNotMatch(statements, /duration_seconds/i);
  assert.doesNotMatch(statements, /moment_photos|public\.stories|story_views/i,
    'la migration non deve toccare le tabelle authority M5A');
});

test('M5B V1: text whitespace-only rejected (btrim), 1-1000 effettivi, no media', () => {
  const sql = read(V1);
  assert.match(sql, /left_for_you_text_contract_check[\s\S]*?btrim\(body\)/i,
    'il contenuto deve essere validato dopo il trim degli spazi');
  assert.match(sql, /left_for_you_text_contract_check[\s\S]*?char_length\(btrim\(body\)\) between 1 and 1000/i);
  assert.match(sql, /left_for_you_text_contract_check[\s\S]*?media_path is null/i);
});

test('M5B V1: photo con ownership namespace e photo contract', () => {
  const sql = read(V1);
  assert.match(sql, /left_for_you_photo_contract_check[\s\S]*?media_path is not null/i);
  assert.match(sql, /left_for_you_photo_contract_check[\s\S]*?body is null or char_length\(body\) <= 280/i);
  assert.match(sql, /starts_with\(\s*media_path,\s*couple_id::text \|\| '\/' \|\| auth\.uid\(\)::text \|\| '\/'/i,
    'un path fuori da couple/sender namespace deve essere rejected dal with check');
});

test('M5B V1: indici necessari', () => {
  const sql = read(V1);
  assert.match(sql, /left_for_you_recipient_created_idx/i);
  assert.match(sql, /left_for_you_couple_created_idx/i);
  assert.match(sql, /left_for_you_recipient_unseen_idx[\s\S]*where seen_at is null/i);
  assert.match(sql, /left_for_you_media_path_unique\s*\n\s*unique \(media_path\)/i);
});

test('M5B V1: RLS partecipanti e solo sender inserisce; nessuna DELETE client', () => {
  const sql = read(V1);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /left_for_you_select_participants[\s\S]*auth\.uid\(\) in \(sender_id, recipient_id\)/i);
  assert.match(sql, /left_for_you_insert_own[\s\S]*sender_id = auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /for delete/i, 'nessuna DELETE policy client per left_for_you V1');
  assert.doesNotMatch(sql, /left_for_you_delete/i);
});

test('M5B V1: seen server-authoritative originale (item alias, transizione unica)', () => {
  const sql = read(V1);
  assert.match(sql, /create or replace function public\.mark_left_item_seen\(target_item_id uuid\)/i);
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /item\.recipient_id = auth\.uid\(\)/i);
  assert.match(sql, /left_item_recipient_required/i);
  assert.match(sql, /if item\.seen_at is null then[\s\S]*?set seen_at = now\(\)/i);
  assert.doesNotMatch(sql, /set seen_at = null/i, 'lo seen non è revocabile né mutabile');
  assert.match(sql, /revoke all on function public\.mark_left_item_seen\(uuid\)[\s\S]*grant execute[\s\S]*authenticated/i);
});

test('M5B fix: recipient same-couple esplicito con qualifica left_for_you', () => {
  const sql = read(FIX);
  assert.match(sql, /drop policy if exists left_for_you_insert_own on public\.left_for_you/i);
  assert.match(sql, /create policy left_for_you_insert_own[\s\S]*?partner\.id = left_for_you\.recipient_id/i,
    'il partner lookup deve qualificare la colonna con la tabella');
  assert.match(sql, /partner\.couple_id = private\.current_couple_id\(\)/i,
    'il confronto same-couple deve usare la funzione, non la colonna ambigua');
  assert.match(sql, /starts_with\(\s*media_path,\s*couple_id::text \|\| '\/' \|\| auth\.uid\(\)::text \|\| '\/'/i,
    'l ownership namespace photo resta invariato');
});

test('M5B fix: authenticated solo SELECT + INSERT, niente UPDATE/DELETE client', () => {
  const sql = read(FIX);
  const statements = stripComments(sql);
  assert.match(statements, /revoke update, delete, truncate, references, trigger, maintain\s*\n\s*on table public\.left_for_you from authenticated/i);
  assert.match(statements, /revoke all on table public\.left_for_you from anon/i);
  assert.match(statements, /grant select, insert on table public\.left_for_you to authenticated/i);
  // Nessuna nuova policy UPDATE/DELETE (le clausole for update nel body RPC
  // sono row-lock interni alla security definer, non policy client).
  assert.doesNotMatch(statements, /for update to|for delete to/i);
  // La RPC seen resta l unica via per lo stato.
  assert.match(sql, /create or replace function public\.mark_left_item_seen\(target_item_id uuid\)/i);
});

test('M5B fix: mark_left_item_seen con alias espliciti e idempotenza hard', () => {
  const sql = read(FIX);
  const statements = stripComments(sql);
  assert.match(statements, /target_item public\.left_for_you%rowtype/i, 'alias esplicito target_item');
  assert.match(statements, /was_unseen boolean/i);
  assert.match(statements, /entry\.recipient_id = auth\.uid\(\)/i, 'solo il recipient può marcare seen');
  assert.match(statements, /left_item_recipient_required/i, 'il sender/non-partecipante riceve reject');
  // Transizione unica NULL -> now() con guardia nella WHERE dell update.
  assert.match(statements, /if was_unseen then[\s\S]*?set seen_at = now\(\)[\s\S]*?and entry\.seen_at is null/i);
  // Seconda lettura di protezione per la corsa concorrente.
  assert.match(statements, /if result_seen_at is null then[\s\S]*?select entry\.seen_at into result_seen_at[\s\S]*?where entry\.id = target_item\.id;/i,
    'se l update non ritorna riga (corsa), riletto il timestamp già impostato');
  assert.match(statements, /else\s*\n\s*result_seen_at := target_item\.seen_at;/i,
    'il retry restituisce il timestamp esistente senza mutarlo');
  assert.doesNotMatch(statements, /set seen_at = null/i, 'lo seen non è revocabile né mutabile');
  assert.match(statements, /jsonb_build_object\(\s*'id', target_item\.id,\s*'status',[\s\S]*?'seen_at', result_seen_at/i);
  assert.match(statements, /already_seen/i);
  assert.match(statements, /revoke all on function public\.mark_left_item_seen\(uuid\)[\s\S]*grant execute[\s\S]*authenticated/i);
});

test('M5B fix non introduce DELETE né tocca gli altri domini', () => {
  const sql = read(FIX);
  const statements = stripComments(sql);
  assert.doesNotMatch(statements, /for delete/i);
  assert.doesNotMatch(statements, /alter table public\.(stories|story_views|moments|moment_photos|shared_messages)/i);
  assert.doesNotMatch(statements, /drop table|drop function/i);
});

test('M5B Realtime: previsto nella V1, non duplicato nel fix', () => {
  assert.match(read(V1), /alter publication supabase_realtime add table public\.left_for_you/i);
  const fixStatements = stripComments(read(FIX));
  assert.doesNotMatch(fixStatements, /alter publication/i, 'la publication è già garantita dalla V1');
});
