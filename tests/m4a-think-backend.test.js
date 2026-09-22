const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M4A recupera la migration think_reactions autorevole e conserva il contratto remoto', () => {
  const sql = read('supabase/migrations/20260902114732_think_reactions.sql');
  assert.match(sql, /create table public\.think_reactions/i);
  assert.match(sql, /unique references public\.shared_messages/i);
  assert.match(sql, /heart.*hug.*miss_you/s);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /set_think_reaction/i);
  assert.match(sql, /delete_think_reaction/i);
});

test('M4A protegge send_think con operation id e rende la reaction terminale', () => {
  const sql = read('supabase/migrations/20260922120726_think_send_idempotency_final_reaction.sql');
  const fix = read('supabase/migrations/20260922120945_fix_send_think_conflict_ambiguity.sql');
  assert.match(sql, /add column if not exists think_operation_id uuid/i);
  assert.match(sql, /shared_messages_think_operation_idx/i);
  assert.match(sql, /create or replace function public\.send_think\(operation_id uuid\)/i);
  assert.match(sql, /on conflict \(sender_id, think_operation_id\)/i);
  assert.doesNotMatch(sql, /think_send_conflict_unresolved/);
  assert.match(fix, /on conflict do nothing/i);
  assert.match(fix, /think_send_conflict_unresolved/);
  assert.ok(fix.indexOf('select message.* into existing') < fix.indexOf('current_couple :='), 'il retry deve essere risolto prima del partner lookup');
  assert.match(sql, /return query select existing\.id[\s\S]*true/i);
  assert.match(sql, /already_reacted/i);
  assert.match(sql, /revoke all on function public\.delete_think_reaction\(uuid\)[\s\S]*grant execute[\s\S]*service_role/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.think_reactions/i);
});

test('M4A push reaction valida l oggetto e usa dedupe stabile', () => {
  const shared = read('supabase/functions/_shared/think-web-push.ts');
  const edge = read('supabase/functions/send-web-push/index.ts');
  assert.match(shared, /dispatchThinkReactionWebPush/);
  assert.match(shared, /think-reaction:/);
  assert.match(shared, /Ha reagito al tuo Ti penso/);
  assert.doesNotMatch(shared, /ha risposto con/);
  assert.match(edge, /think_reaction/);
  assert.match(edge, /think_reactions/);
  assert.match(edge, /message\.recipient_id/);
  assert.match(edge, /message\.sender_id/);
});
