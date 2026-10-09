// V6 retires the frontend reflection composer; the historical server migration remains protected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M3 reveal helper delega a get_daily_state e non conta daily_answers autonomamente', () => {
  const migration = read('supabase/migrations_history/20260902101619_daily_question_reveal_authority.sql');
  assert.match(migration, /create or replace function private\.daily_question_reveal_ready\(target_question_id uuid\)/);
  assert.match(migration, /public\.get_daily_state\(target_question_id\)/);
  assert.match(migration, /->>\s*'both_answered'/);
  assert.doesNotMatch(migration, /from\s+public\.daily_answers/i);
  assert.doesNotMatch(migration, /count\s*\(\s*\*\s*\)\s*>=\s*2/i);
});
