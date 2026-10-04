const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const MIGRATION = 'supabase/migrations_history/20260929121430_m7a_claim_us_role_bucket_items_transfer.sql';
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

// Every reassignment statement present in claim_us_role as of the M6A fix
// (the last known-good reproduction of production in this repo). M7A must
// reproduce every one of these verbatim, plus wrap the bucket_items line in
// its own repair-transfer carve-out.
const UNCHANGED_REASSIGNMENT_STATEMENTS = [
  "update public.daily_answers set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;",
  "update public.quiz_responses set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;",
  "update public.shared_messages set sender_id = uid where sender_id = old_uid and couple_id = inv.couple_id;",
  "update public.shared_messages set recipient_id = uid where recipient_id = old_uid and couple_id = inv.couple_id;",
  "update public.moods set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;",
  "update public.activity set actor_id = uid where actor_id = old_uid and couple_id = inv.couple_id;",
  "update public.couple_locations set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;",
  "update public.device_push_tokens set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;",
  "update public.moments set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;",
  "update public.moment_photos set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;",
  "update public.notification_preferences set user_id = uid where user_id = old_uid;",
  "update public.partner_knowledge_attempts set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;",
  "update public.push_event_log set sender_id = uid where sender_id = old_uid and couple_id = inv.couple_id;",
  "update public.push_subscriptions set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;",
  "update public.shared_event_completions set completed_by = uid where completed_by = old_uid and couple_id = inv.couple_id;",
  "update public.shared_events set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;",
  "update public.stories set author_id = uid where author_id = old_uid and couple_id = inv.couple_id;",
  "update public.story_views set viewer_id = uid where viewer_id = old_uid;",
  "update public.widget_tokens set profile_id = uid where profile_id = old_uid and couple_id = inv.couple_id;"
];

test('M7A fix: migration exists', () => {
  assert.ok(fs.existsSync(path.join(ROOT, MIGRATION)));
});

test('M7A fix: every unrelated original reassignment statement is preserved verbatim', () => {
  const sql = read(MIGRATION);
  for (const statement of UNCHANGED_REASSIGNMENT_STATEMENTS) {
    assert.ok(sql.includes(statement), `missing or altered original statement: ${statement}`);
  }
});

test('M7A fix: the calendar_entries repair-transfer block from the M6A fix is preserved verbatim', () => {
  const statements = stripComments(read(MIGRATION));
  assert.match(statements, /perform set_config\('us\.calendar_entries_repair_transfer', 'on', true\);/);
  assert.match(statements, /update public\.calendar_entries\s*\n\s*set created_by = uid,\s*\n\s*owner_id = case when owner_id = old_uid then uid else owner_id end\s*\n\s*where couple_id = inv\.couple_id\s*\n\s*and \(created_by = old_uid or owner_id = old_uid\);/i);
  assert.match(statements, /perform set_config\('us\.calendar_entries_repair_transfer', 'off', true\);/);
});

test('M7A fix: function signature and security attributes are unchanged from production', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create or replace function public\.claim_us_role\(invite_code text, chosen_role text\)/i);
  assert.match(sql, /\breturns jsonb\b/i);
  assert.match(sql, /\blanguage plpgsql\b/i);
  assert.match(sql, /\bsecurity definer\b/i);
  assert.match(sql, /set search_path to 'public', 'auth', 'extensions'/i);
});

test('M7A fix: original control flow, exceptions and non-repair branch are untouched', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /raise exception 'Authentication required';/);
  assert.match(sql, /raise exception 'Anonymous session required for private pairing';/);
  assert.match(sql, /raise exception 'Invalid role';/);
  assert.match(sql, /raise exception 'Invalid private code';/);
  assert.match(sql, /raise exception 'This device is already linked to another profile';/);
  assert.match(sql, /if old_uid is not null and old_uid <> uid then/);
  assert.match(sql, /update public\.couple_invites set used_by = uid, used_at = now\(\) where id = inv\.id;/);
  assert.match(sql, /delete from public\.profiles where id = old_uid;/);
  assert.match(sql, /return jsonb_build_object\('couple_id', inv\.couple_id, 'role', chosen_role, 'display_name', display\);/);
  assert.match(sql, /else\s*\n\s*insert into public\.profiles\(id, display_name, couple_id, role, avatar_path\)/);
});

test('M7A fix: bucket_items transfer runs before the profile delete, inside the re-pair branch', () => {
  const sql = stripComments(read(MIGRATION));
  const widgetTokensIdx = sql.indexOf('update public.widget_tokens set profile_id = uid');
  const bucketUpdateIdx = sql.indexOf('update public.bucket_items set created_by = uid');
  const deleteIdx = sql.indexOf('delete from public.profiles where id = old_uid;');
  assert.ok(widgetTokensIdx > -1 && bucketUpdateIdx > -1 && deleteIdx > -1);
  assert.ok(bucketUpdateIdx < deleteIdx, 'bucket_items must be reassigned before the old profile is deleted');
});

test('M7A fix: the bucket_items guard-trigger carve-out is scoped to exactly the transfer statement, then turned back off', () => {
  const statements = stripComments(read(MIGRATION));
  const onIdx = statements.indexOf("set_config('us.bucket_items_repair_transfer', 'on', true)");
  const updateIdx = statements.indexOf('update public.bucket_items set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;');
  const offIdx = statements.indexOf("set_config('us.bucket_items_repair_transfer', 'off', true)");
  assert.ok(onIdx > -1 && updateIdx > -1 && offIdx > -1);
  assert.ok(onIdx < updateIdx && updateIdx < offIdx, 'the flag must be turned on immediately before, and off immediately after, the transfer statement');
  assert.match(statements, /perform set_config\('us\.bucket_items_repair_transfer', 'on', true\);/);
  assert.match(statements, /perform set_config\('us\.bucket_items_repair_transfer', 'off', true\);/);
});

test('M7A fix: no other production table/statement is touched by this migration', () => {
  const statements = stripComments(read(MIGRATION));
  const updateStatements = statements.match(/update public\.\w+/g) || [];
  const uniqueTables = [...new Set(updateStatements.map((s) => s.replace('update public.', '')))];
  const expectedTables = [
    'profiles', 'daily_answers', 'quiz_responses', 'bucket_items', 'shared_messages',
    'moods', 'activity', 'couple_locations', 'device_push_tokens', 'moments',
    'moment_photos', 'notification_preferences', 'partner_knowledge_attempts',
    'push_event_log', 'push_subscriptions', 'shared_event_completions', 'shared_events',
    'stories', 'story_views', 'widget_tokens', 'calendar_entries', 'couple_invites'
  ].sort();
  assert.deepEqual(uniqueTables.sort(), expectedTables);
  assert.doesNotMatch(statements, /drop table|drop function|truncate/i);
});
