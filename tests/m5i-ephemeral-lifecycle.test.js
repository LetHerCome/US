const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const MIGRATION = 'supabase/migrations/20260924160000_m5i_ephemeral_left_for_you.sql';

test('M5I client loads only unseen items and cannot deep-link into historical content', () => {
  const source = read('left-for-you.js');
  assert.match(source, /\.is\(['"]seen_at['"],\s*null\)/i);
  assert.match(source, /window\.openLeftForYou\s*=\s*open/);
  assert.match(source, /if\s*\(!items\.length\)\s*\{\s*showState\(['"]empty['"]\)/i);
  assert.doesNotMatch(source, /\.eq\(['"]recipient_id['"].*\n?\s*\.order\(['"]created_at['"]/, 'the ordinary receive query must include unseen eligibility');
});

test('M5I client reconciles realtime updates/deletes without resurrecting consumed rows', () => {
  const source = read('left-for-you.js');
  assert.match(source, /event:\s*['"]UPDATE['"]/);
  assert.match(source, /event:\s*['"]DELETE['"]/);
  assert.match(source, /handleIncoming/);
});

test('M5I migration establishes a server-side legacy boundary and durable storage outbox', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /add column if not exists cleanup_eligible_at timestamptz/i);
  assert.match(sql, /set_left_for_you_cleanup_eligible_at/i);
  assert.match(sql, /cleanup_eligible_at is not null/i);
  assert.match(sql, /create table(?: if not exists)? private\.left_for_you_cleanup_queue/i);
  assert.match(sql, /source_deleted_at timestamptz/i);
  assert.match(sql, /completed_at timestamptz/i);
  assert.match(sql, /claimed_at\s*<\s*now\(\)\s*-\s*interval\s*'15 minutes'/i);
  assert.match(sql, /not exists\s*\(\s*select 1\s+from public\.conserva_contributions/i);
  assert.match(sql, /for update(?: of [\w.]+)?\s+skip locked/i);
});

test('M5I cleanup is service-authoritative, idempotent, and preserves Conserva sources', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create or replace function public\.claim_left_for_you_cleanup/i);
  assert.match(sql, /create or replace function public\.finalize_left_for_you_cleanup/i);
  assert.match(sql, /create or replace function public\.complete_left_for_you_cleanup/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /grant execute on function public\.claim_left_for_you_cleanup[^;]*service_role/i);
  assert.match(sql, /grant execute on function public\.finalize_left_for_you_cleanup[^;]*service_role/i);
  assert.match(sql, /grant execute on function public\.complete_left_for_you_cleanup[^;]*service_role/i);
  assert.match(sql, /delete from public\.left_for_you/i);
  assert.match(sql, /source_deleted_at = now\(\)/i);
});

test('M5I migration protects the dedicated media namespace and Conserva lock', () => {
  const sql = read(MIGRATION);
  const edge = read('supabase/functions/cleanup-left-for-you/index.ts');
  assert.match(sql, /starts_with\(media_path,[\s\S]*\/left\//i);
  assert.match(sql, /from public\.left_for_you as entry[\s\S]*for update/i);
  assert.match(edge, /x-m5i-cleanup-secret/);
  assert.match(edge, /M5I_CLEANUP_SECRET/);
  assert.match(edge, /row\.couple_id.*row\.sender_id.*left\//s);
  assert.match(edge, /storage\.from\(['"]us-media['"]\)\.remove/);
  assert.match(edge, /finalize_left_for_you_cleanup/);
  assert.match(edge, /complete_left_for_you_cleanup/);
  assert.match(edge, /kind.*music|MEDIA_KINDS/si);
  assert.ok(edge.indexOf('finalize_left_for_you_cleanup') < edge.indexOf('storage.from'), 'source must be finalized before storage cleanup');
});

test('M5I does not schedule or execute destructive cleanup in the migration', () => {
  const sql = read(MIGRATION);
  assert.doesNotMatch(sql, /pg_cron|cron\.schedule|http_post/i);
  assert.doesNotMatch(sql, /delete\s+from\s+storage\.objects/i);
});
