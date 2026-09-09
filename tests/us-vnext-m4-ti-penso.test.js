const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M4 espone la reaction recipient dentro Oggi e mantiene Ti penso sender-only', () => {
  const html = read('index.html');
  assert.match(html, /id="thinkReceivedContext"/);
  assert.match(html, /id="thinkButton"[^>]*onclick="sendThinkSignal\(\)"/);
  assert.doesNotMatch(html, /thinkButton[^]*data-think-reaction/);
});

test('M4 vocabulary client è chiuso esattamente a heart hug miss_you', () => {
  const app = read('app.js');
  assert.match(app, /US_THINK_REACTIONS=Object\.freeze\(\{heart:'♡',hug:'Abbraccio',miss_you:'Mi manchi'\}\)/);
  assert.doesNotMatch(app, /US_THINK_REACTIONS[^\n]*smile/);
  assert.match(app, /target_reaction:reaction/);
  assert.match(app, /target_message_id:receivedThinkMessage\.id/);
});

test('M4 usa solo RPC dedicate per set/delete e legge think_reactions per message_id', () => {
  const app = read('app.js');
  assert.match(app, /from\('think_reactions'\)\.select\('id,message_id,reaction,updated_at'\)/);
  assert.match(app, /rpc\('set_think_reaction'/);
  assert.match(app, /rpc\('delete_think_reaction'/);
  assert.doesNotMatch(app, /from\('think_reactions'\)\.insert|from\('think_reactions'\)\.update|from\('think_reactions'\)\.delete/);
});

test('M4 migration conserva una sola reaction per messaggio e il CHECK approvato', () => {
  const sql = read('supabase/migrations/20260902114732_think_reactions.sql');
  assert.match(sql, /message_id uuid not null unique references public\.shared_messages\(id\) on delete cascade/);
  assert.match(sql, /reaction text not null check \(reaction in \('heart', 'hug', 'miss_you'\)\)/);
  assert.match(sql, /recipient_id = auth\.uid\(\)/);
  assert.doesNotMatch(sql, /create table public\.reactions/i);
  assert.doesNotMatch(sql, /alter table public\.shared_messages/i);
});

test('M4 blocca valori non approvati prima del RPC e gestisce delete idempotente', () => {
  const app = read('app.js');
  assert.match(app, /if\(!receivedThinkMessage\|\|!US_THINK_REACTIONS\[reaction\]\)return/);
  assert.match(app, /data\?\.status==='already_absent'/);
  assert.match(app, /data\?\.status==='deleted'/);
});
