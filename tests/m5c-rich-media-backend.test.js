const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const M5C = 'supabase/migrations/20260923130000_m5c_left_for_you_rich_media.sql';
const V1 = 'supabase/migrations/20260922180436_left_for_you_v1.sql';
const FIX = 'supabase/migrations/20260922182210_fix_left_for_you_partner_scope_and_grants.sql';
const HARDEN = 'supabase/migrations/20260923100236_enforce_left_for_you_insert_unseen.sql';
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

const m5c = () => read(M5C);
const m5cStatements = () => stripComments(m5c());

test('M5C history: migration forward-only separata, le M5B non riscritte', () => {
  assert.ok(fs.existsSync(path.join(ROOT, M5C)), 'la migration M5C deve esistere');
  // Le tre migration M5B restano identiche come file: M5C è additiva.
  assert.match(read(V1), /kind in \('text', 'photo'\)/i,
    'la V1 M5B non è riscritta retroattivamente');
  assert.match(read(HARDEN), /seen_at is null/i,
    'l hardening M5B seen_at resta invariato');
  const statements = m5cStatements();
  assert.doesNotMatch(statements, /drop table/i);
  assert.doesNotMatch(statements, /drop function/i);
  assert.doesNotMatch(statements, /alter publication/i,
    'Realtime M5B non ritoccato: la publication resta quella della V1');
});

test('M5C kind: audio, video, music validi; kind sconosciuti rifiutati', () => {
  const sql = m5c();
  assert.match(sql, /drop constraint left_for_you_kind_v1_check/i);
  assert.match(sql, /left_for_you_kind_m5c_check\s*\n?\s*check \(kind in \('text', 'photo', 'audio', 'video', 'music'\)\)/i);
});

test('M5C audio/video: media_path obbligatorio + nota breve opzionale', () => {
  const sql = m5c();
  assert.match(sql, /left_for_you_av_contract_check\s*\n?\s*check\s*\(\s*kind not in \('audio', 'video'\)/i);
  assert.match(sql, /left_for_you_av_contract_check[\s\S]*?media_path is not null/i);
  assert.match(sql, /left_for_you_av_contract_check[\s\S]*?char_length\(media_path\) <= 512/i);
  assert.match(sql, /left_for_you_av_contract_check[\s\S]*?body is null or char_length\(body\) <= 280/i,
    'audio/video condividono il contratto nota breve della photo M5B');
});

test('M5C music: URL HTTPS esterno obbligatorio, provider-neutral', () => {
  const sql = m5c();
  assert.match(sql, /left_for_you_music_contract_check\s*\n?\s*check\s*\(\s*kind <> 'music'/i);
  assert.match(sql, /left_for_you_music_contract_check[\s\S]*?media_path is not null/i);
  assert.match(sql, /left_for_you_music_contract_check[\s\S]*?left\(media_path, 8\) = 'https:\/\/'/i,
    'solo https://: niente http, niente URL assente');
  assert.match(sql, /left_for_you_music_contract_check[\s\S]*?char_length\(media_path\) <= 512/i);
  assert.match(sql, /left_for_you_music_contract_check[\s\S]*?body is null or char_length\(body\) <= 280/i);
  const statements = m5cStatements();
  assert.doesNotMatch(statements, /spotify|apple|embed|iframe|oembed|metadata/i,
    'nessuna integrazione provider: solo URL HTTPS neutro');
});

test('M5C: il contratto text M5B resta invariato (testo non accetta media)', () => {
  // La migration M5C non tocca left_for_you_text_contract_check: media_path
  // resta vietato per text (vincolo V1 ancora attivo in remote).
  const statements = m5cStatements();
  assert.doesNotMatch(statements, /left_for_you_text_contract_check/i,
    'M5C non deve riscrivere né rimuovere il contratto text M5B');
  assert.doesNotMatch(statements, /drop constraint left_for_you_text_contract_check/i);
  assert.doesNotMatch(statements, /drop constraint left_for_you_photo_contract_check/i,
    'il contratto photo M5B resta intatto');
});

test('M5C insert policy: namespace sender-owned per photo, audio E video', () => {
  const sql = m5c();
  assert.match(sql, /drop policy if exists left_for_you_insert_own on public\.left_for_you/i);
  assert.match(sql, /kind not in \('photo', 'audio', 'video'\)\s*\n?\s*or starts_with\(\s*media_path,\s*couple_id::text \|\| '\/' \|\| auth\.uid\(\)::text \|\| '\/'\s*\)/i,
    'audio e video non possono bypassare la media authority della photo');
  // Invarianti M5B invariati nella policy ricreata.
  assert.match(sql, /create policy left_for_you_insert_own[\s\S]*?couple_id = private\.current_couple_id\(\)/i);
  assert.match(sql, /create policy left_for_you_insert_own[\s\S]*?sender_id = auth\.uid\(\)/i);
  assert.match(sql, /create policy left_for_you_insert_own[\s\S]*?recipient_id <> sender_id/i);
  assert.match(sql, /create policy left_for_you_insert_own[\s\S]*?partner\.id = left_for_you\.recipient_id[\s\S]*?partner\.couple_id = private\.current_couple_id\(\)/i,
    'recipient deve essere il partner della stessa coppia');
  assert.match(sql, /create policy left_for_you_insert_own[\s\S]*?seen_at is null/i,
    'INSERT sempre unseen: seen_at contraffato resta rifiutato');
});

test('M5C music: il media caricato nel bucket non può passare per music', () => {
  const sql = m5c();
  assert.match(sql, /kind <> 'music'\s*\n?\s*or not starts_with\(\s*media_path,\s*couple_id::text \|\| '\/' \|\| auth\.uid\(\)::text \|\| '\/'\s*\)/i,
    'un path di ownership del bucket non è un URL music valido');
});

test('M5C bucket: stesso us-media esteso, MIME allowlist conservativo, privato', () => {
  const sql = m5c();
  const statements = m5cStatements();
  assert.match(statements, /update storage\.buckets/i);
  assert.match(statements, /where id = 'us-media'/i,
    'solo us-media è toccato: nessun bucket parallelo');
  assert.doesNotMatch(statements, /insert into storage\.buckets/i,
    'nessun nuovo bucket: estensione del bucket esistente');
  assert.doesNotMatch(statements, /public\s*=\s*(true|'t'|TRUE)/i,
    'il bucket resta privato');
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg',
    'video/mp4', 'video/webm', 'video/quicktime']) {
    assert.ok(sql.includes(`'${mime}'`), `MIME allowlist deve includere ${mime}`);
  }
  assert.match(statements, /file_size_limit = 26214400/i,
    'ceiling globale unico: 25 MB, tradeoff documentato nel commento');
  assert.match(sql, /TRADEOFF/i, 'il tradeoff size ceiling deve essere documentato');
});

test('M5C: nessun client UPDATE/DELETE, grants e seen lifecycle intatti', () => {
  const statements = m5cStatements();
  assert.doesNotMatch(statements, /grant\s+(update|delete)/i);
  assert.doesNotMatch(statements, /revoke select|revoke insert/i);
  assert.doesNotMatch(statements, /for update to|for delete to/i);
  assert.doesNotMatch(statements, /mark_left_item_seen/i,
    'la RPC seen M5B non è ritoccata da M5C');
  assert.doesNotMatch(statements, /drop policy if exists left_for_you_select_participants/i);
});

test('M5C: fuori scope protetti non toccati', () => {
  const statements = m5cStatements();
  assert.doesNotMatch(statements, /stories|story_views|moments|moment_photos/i);
  assert.doesNotMatch(statements, /auth\.(users|sessions)/i);
  assert.doesNotMatch(statements, /drop table|drop schema|create table/i);
});