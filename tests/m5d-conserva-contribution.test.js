const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const M5D = 'supabase/migrations/20260923112331_m5d_conserva_contribution.sql';
const M5D_HARDEN = 'supabase/migrations/20260923112428_harden_conserva_contribution_grants.sql';
const M5B_V1 = 'supabase/migrations/20260922180436_left_for_you_v1.sql';
const M5B_FIX = 'supabase/migrations/20260922182210_fix_left_for_you_partner_scope_and_grants.sql';
const M5B_HARDEN = 'supabase/migrations/20260923100236_enforce_left_for_you_insert_unseen.sql';
const M5C = 'supabase/migrations/20260923110119_m5c_left_for_you_rich_media.sql';
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

const m5d = () => read(M5D);
const m5dHardening = () => read(M5D_HARDEN);
const m5dStatements = () => stripComments(m5d());
const m5dHardeningStatements = () => stripComments(m5dHardening());

test('M5D history: migration forward-only separata, M5B/M5C non riscritte', () => {
  assert.ok(fs.existsSync(path.join(ROOT, M5D)), 'la migration M5D deve esistere');
  assert.ok(fs.existsSync(path.join(ROOT, M5D_HARDEN)), 'la migration di hardening grant deve esistere');
  // Le migration precedenti restano identiche: M5D è additiva.
  assert.match(read(M5B_V1), /create table public\.left_for_you/i);
  assert.match(read(M5C), /left_for_you_kind_m5c_check/i);
  const statements = m5dStatements();
  assert.doesNotMatch(statements, /drop table/i);
  assert.doesNotMatch(statements, /drop function/i);
  assert.doesNotMatch(statements, /alter publication/i,
    'Realtime non toccato: la conservazione non è un evento realtime');
  assert.doesNotMatch(statements, /drop policy if exists left_for_you_insert_own/i,
    'le policy M5B/M5C di left_for_you non vengono riscritte');
});

test('M5D: modello dedicato minimo con provenance, nessuna riga moments finta', () => {
  const sql = m5d();
  const statements = m5dStatements();
  assert.match(statements, /create table public\.conserva_contributions/i);
  assert.match(statements, /couple_id uuid not null references public\.couples\(id\)/i);
  assert.match(statements, /source_item_id uuid not null references public\.left_for_you\(id\)/i,
    'provenance dura al left_for_you sorgente');
  assert.match(statements, /source_sender_id uuid not null references public\.profiles\(id\)/i);
  assert.match(statements, /conserved_by uuid not null references public\.profiles\(id\)/i);
  assert.match(statements, /created_at timestamptz not null default now\(\)/i);
  assert.match(statements, /constraint conserva_source_item_unique\s*\n\s*unique \(source_item_id\)/i,
    'un solo contributo logico per item left_for_you');
  // Nessuna duplicazione payload: niente body/media_path/kind/copie contenuto.
  assert.doesNotMatch(statements, /media_path|body|kind/i,
    'niente snapshot payload: la provenance FK basta per contratto M5B');
  // Nessun blob JSON di metadati (colonne json/jsonb nella definizione tabella).
  const createTable = statements.match(/create table public\.conserva_contributions[\s\S]*?\);/i)[0];
  assert.doesNotMatch(createTable, /jsonb|json/i);
  // Nessuna scadenza.
  assert.doesNotMatch(statements, /expires_at|expiry/i);
});

test('M5D: nessun Moment finito creato dalla migration', () => {
  const statements = m5dStatements();
  assert.doesNotMatch(statements, /insert into public\.moments/i);
  assert.doesNotMatch(statements, /insert into public\.moment_photos/i);
  assert.doesNotMatch(statements, /alter table public\.moments/i);
  assert.doesNotMatch(statements, /alter table public\.moment_photos/i);
  assert.doesNotMatch(statements, /drop policy if exists moments_/i);
  assert.doesNotMatch(statements, /drop policy if exists moment_photos_/i);
});

test('M5D RLS: solo stessa coppia in SELECT, nessuna mutazione client', () => {
  const sql = m5d();
  const statements = m5dStatements();
  assert.match(statements, /enable row level security/i);
  assert.match(statements, /force row level security/i);
  assert.match(statements, /conserva_select_same_couple[\s\S]*?for select to authenticated[\s\S]*?couple_id = private\.current_couple_id\(\)/i);
  // Nessuna policy INSERT/UPDATE/DELETE client sul contributo.
  assert.doesNotMatch(statements, /for insert to authenticated/i);
  assert.doesNotMatch(statements, /for update to/i);
  assert.doesNotMatch(statements, /for delete to/i);
  // Grants authenticated = SELECT only are established by the forward-only hardening migration.
  const hardening = m5dHardeningStatements();
  assert.match(hardening, /revoke all on table public\.conserva_contributions\s+from public, anon, authenticated/i);
  assert.match(hardening, /grant select on table public\.conserva_contributions\s+to authenticated/i);
  assert.doesNotMatch(hardening, /grant insert/i);
  assert.doesNotMatch(hardening, /grant update/i);
  assert.doesNotMatch(hardening, /grant delete/i);
});

test('M5D RPC: conserve_left_for_you recipient-only, stessa coppia, hardening', () => {
  const sql = m5d();
  const statements = m5dStatements();
  assert.match(statements, /create or replace function public\.conserve_left_for_you\(target_item_id uuid\)/i);
  assert.match(statements, /security definer/i);
  assert.match(statements, /set search_path = ''/i, 'search_path fissato vuoto');
  assert.match(statements, /if auth\.uid\(\) is null then\s*\n\s*raise exception using errcode = '42501', message = 'authentication required'/i);
  // Recipient-only + same couple in un'unica condizione di lookup.
  assert.match(statements, /entry\.id = target_item_id\s*\n\s*and entry\.couple_id = private\.current_couple_id\(\)\s*\n\s*and entry\.recipient_id = auth\.uid\(\)/i);
  assert.match(statements, /conserva_recipient_required/i);
});

test('M5D RPC: idempotenza via ON CONFLICT, retry restituisce esistente invariato', () => {
  const sql = m5d();
  const statements = m5dStatements();
  assert.match(statements, /on conflict \(source_item_id\) do nothing/i);
  assert.match(statements, /'status', 'created'/i);
  assert.match(statements, /'status', 'existing'/i);
  // Il retry legge la riga esistente e NON riscrive nulla.
  assert.match(statements, /select e\.\* into existing_row\s*\n\s*from public\.conserva_contributions as e\s*\n\s*where e\.source_item_id = target_item\.id/i);
  assert.doesNotMatch(statements, /update public\.conserva_contributions/i);
  assert.doesNotMatch(statements, /delete from public\.conserva_contributions/i);
});

test('M5D RPC: niente mutazioni su left_for_you né creazione Moment', () => {
  const statements = m5dStatements();
  assert.doesNotMatch(statements, /update public\.left_for_you/i,
    'conservare non modifica l item sorgente');
  assert.doesNotMatch(statements, /delete from public\.left_for_you/i);
  assert.doesNotMatch(statements, /set seen_at/i,
    'il seen lifecycle M5B resta intatto');
  assert.doesNotMatch(statements, /insert into public\.moments/i);
  assert.doesNotMatch(statements, /insert into public\.moment_photos/i);
});

test('M5D RPC grants: anon e public senza execute, authenticated-only', () => {
  const statements = m5dStatements();
  assert.match(statements, /revoke all on function public\.conserve_left_for_you\(uuid\) from public, anon, authenticated/i);
  assert.match(statements, /grant execute on function public\.conserve_left_for_you\(uuid\) to authenticated/i);
});

test('M5D: nessuna semantics di consumo/eliminazione, fuori scope protetti', () => {
  const statements = m5dStatements();
  assert.doesNotMatch(statements, /stories|story_views/i);
  assert.doesNotMatch(statements, /alter table public\.(stories|story_views)/i);
  assert.doesNotMatch(statements, /consumed_at|consumed_by|moment_id/i,
    'nessuna semantics di consumo: la lascia al futuro flusso Moment');
  assert.doesNotMatch(statements, /drop schema|create schema/i);
});