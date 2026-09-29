const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const MIGRATION = 'supabase/migrations/20260929121350_m7a_da_vivere_bucket_items_domain.sql';
const CLAIM_ROLE_FIX = 'supabase/migrations/20260929121430_m7a_claim_us_role_bucket_items_transfer.sql';
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

test('M7A migrations exist as fresh forward-only files after the M6 history', () => {
  assert.ok(fs.existsSync(path.join(ROOT, MIGRATION)), 'domain migration missing');
  assert.ok(fs.existsSync(path.join(ROOT, CLAIM_ROLE_FIX)), 'claim_us_role fix migration missing');
  const files = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort();
  const lastThree = files.slice(-3);
  assert.deepEqual(lastThree, [
    '20260928210000_m6d_calendar_reminders.sql',
    path.basename(MIGRATION),
    path.basename(CLAIM_ROLE_FIX)
  ], 'M7A migrations stay after the full M6 history, in order');
});

test('M7A: evolves the existing bucket_items authority additively, never a new Da Vivere table', () => {
  const sql = stripComments(read(MIGRATION));
  assert.match(sql, /alter table public\.bucket_items add column/i, 'must be additive ALTERs on the existing table');
  assert.doesNotMatch(sql, /create table public\.(living_items|shared_experiences|proposals|da_vivere)/i,
    'M3 already asserts no such table exists; M7A must not introduce one');
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
});

test('M7A: does not touch shared_events or its legacy XP/countdown/recurrence authority', () => {
  const sql = stripComments(read(MIGRATION));
  assert.doesNotMatch(sql, /shared_events/i);
  assert.doesNotMatch(sql, /shared_event_completions|relationship_milestones/i);
  assert.doesNotMatch(sql, /complete_shared_event/i);
});

test('M7A: touches calendar_entries only via an outgoing foreign key, never mutates its rows/policies', () => {
  const sql = stripComments(read(MIGRATION));
  assert.doesNotMatch(sql, /alter table public\.calendar_entries/i);
  assert.doesNotMatch(sql, /create policy calendar_entries_/i);
  assert.match(sql, /references public\.calendar_entries\(id\)/i);
});

test('M7A: new columns cover the required Da Vivere semantics, additive only', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /alter table public\.bucket_items add column note text/i);
  assert.match(sql, /alter table public\.bucket_items add column link_url text/i);
  assert.match(sql, /alter table public\.bucket_items add column status text/i);
  assert.match(sql, /alter table public\.bucket_items add column calendar_entry_id uuid/i);
  assert.match(sql, /alter table public\.bucket_items add column updated_at timestamptz/i);
});

test('M7A: status is backfilled from legacy `completed` before NOT NULL/default/check are imposed', () => {
  const sql = stripComments(read(MIGRATION));
  const backfillIdx = sql.search(/update public\.bucket_items\s+set status = case when completed then 'lived' else 'idea' end/i);
  const notNullIdx = sql.search(/alter table public\.bucket_items alter column status set not null/i);
  const defaultIdx = sql.search(/alter table public\.bucket_items alter column status set default 'idea'/i);
  const checkIdx = sql.search(/add constraint bucket_items_status_check/i);
  assert.ok(backfillIdx > -1, 'missing status backfill from legacy completed');
  assert.ok(backfillIdx < notNullIdx && backfillIdx < defaultIdx && backfillIdx < checkIdx,
    'existing production row must get a meaningful status before the column is locked down');
});

test('M7A: updated_at backfills from created_at for historical rows, not from migration apply time', () => {
  const sql = stripComments(read(MIGRATION));
  assert.match(sql, /update public\.bucket_items set updated_at = created_at where updated_at is null/i);
});

test('M7A: completed_at backfill is defensive and never overwrites an existing value', () => {
  const sql = stripComments(read(MIGRATION));
  assert.match(sql, /update public\.bucket_items\s+set completed_at = coalesce\(completed_at, now\(\)\)\s+where completed = true and completed_at is null/i);
});

test('M7A: lifecycle values are restricted to idea/scheduled/lived/archived', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /bucket_items_status_check\s*\n\s*check \(status in \('idea', 'scheduled', 'lived', 'archived'\)\)/i);
});

test('M7A: link_url, when present, must look like a URL', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /bucket_items_link_url_check\s*\n\s*check \(link_url is null or link_url ~\* '\^https\?:\/\/'\)/i);
});

test('M7A: calendar_entry_id has an outgoing FK to calendar_entries with ON DELETE RESTRICT', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /bucket_items_calendar_entry_id_fkey\s*\n\s*foreign key \(calendar_entry_id\) references public\.calendar_entries\(id\) on delete restrict/i);
});

test('M7A: a calendar entry can back at most one bucket item (unique partial index, NULLs excluded)', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create unique index bucket_items_calendar_entry_id_key\s*\n\s*on public\.bucket_items \(calendar_entry_id\)\s*\n\s*where calendar_entry_id is not null/i);
});

test('M7A: status/calendar_entry_id coherence check matches the M7C-ready contract', () => {
  const sql = read(MIGRATION);
  const block = sql.match(/bucket_items_status_calendar_link_check[\s\S]*?;/i)?.[0] || '';
  assert.match(block, /status = 'idea' and calendar_entry_id is null/i, 'idea must not carry a link yet');
  assert.match(block, /status = 'scheduled' and calendar_entry_id is not null/i, 'scheduled requires a linked event');
  assert.match(block, /\(status = 'lived'\)/i, 'lived must tolerate either a link or none (legacy completion / lived without M7C)');
  assert.doesNotMatch(block, /status = 'lived' and calendar_entry_id is not null/i, 'lived must not require a link');
  assert.match(block, /status = 'archived'/i, 'archived tolerates either a preserved link or none');
});

test('M7A: table ACL is (re)asserted explicitly, matching the couple-scoped RLS contract', () => {
  const sql = stripComments(read(MIGRATION));
  assert.match(sql, /revoke all on table public\.bucket_items from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.bucket_items to authenticated/i);
});

test('M7A: calendar link guard rejects cross-couple and non-shared entries', () => {
  const sql = stripComments(read(MIGRATION));
  assert.match(sql, /create or replace function private\.bucket_items_guard_calendar_link/i);
  assert.match(sql, /v_couple_id <> p_couple_id/i);
  assert.match(sql, /v_entry_type <> 'shared'/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /revoke all on function private\.bucket_items_guard_calendar_link\(uuid, uuid\) from public, anon, authenticated/i);
});

test('M7A: calendar link guard local variables never shadow-collide with calendar_entries columns', () => {
  const sql = stripComments(read(MIGRATION));
  const block = sql.match(/create or replace function private\.bucket_items_guard_calendar_link[\s\S]*?\$\$;/i)?.[0] || '';
  assert.doesNotMatch(block, /declare\s*\n\s*entry_couple_id uuid;\s*\n\s*entry_type text;/i,
    'local variable names must not collide with calendar_entries.entry_type, or the SELECT target list becomes ambiguous');
  assert.match(block, /select ce\.couple_id, ce\.entry_type\s*\n\s*into v_couple_id, v_entry_type\s*\n\s*from public\.calendar_entries ce\s*\n\s*where ce\.id = p_calendar_entry_id/i,
    'the source columns must be alias-qualified, not just the local variables renamed');
});

test('M7A: insert guard forces a new item to start as idea and validates any initial link', () => {
  const sql = stripComments(read(MIGRATION));
  const block = sql.match(/create or replace function private\.bucket_items_guard_insert[\s\S]*?\$\$;/i)?.[0] || '';
  assert.match(block, /new\.status is distinct from 'idea'/i, 'a row cannot be inserted already scheduled/lived/archived');
  assert.match(block, /perform private\.bucket_items_guard_calendar_link\(new\.couple_id, new\.calendar_entry_id\)/i);
  assert.match(sql, /create trigger bucket_items_guard_insert\s*\n\s*before insert on public\.bucket_items/i);
});

test('M7A: insert guard honors a legacy completed=true write as an already-lived row, never silently discards it', () => {
  const sql = stripComments(read(MIGRATION));
  const block = sql.match(/create or replace function private\.bucket_items_guard_insert[\s\S]*?\$\$;/i)?.[0] || '';
  assert.match(block, /if new\.completed then/i);
  assert.match(block, /new\.status := 'lived'/i);
  assert.match(block, /new\.completed_at := now\(\)/i, 'completed_at on insert must always be server-side now(), never a caller-supplied value');
});

test('M7A: update guard makes couple_id immutable unconditionally, created_by immutable with a narrow repair carve-out', () => {
  const sql = stripComments(read(MIGRATION));
  const block = sql.match(/create or replace function private\.bucket_items_guard_update[\s\S]*?\$\$;/i)?.[0] || '';
  assert.match(block, /repair_transfer boolean := coalesce\(current_setting\('us\.bucket_items_repair_transfer', true\), ''\) = 'on'/i);
  assert.match(block, /new\.couple_id <> old\.couple_id/i);
  assert.match(block, /new\.created_by <> old\.created_by and not repair_transfer/i);
  assert.doesNotMatch(block, /new\.couple_id <> old\.couple_id[\s\S]{0,10}and not repair_transfer/i,
    'couple_id must have NO carve-out, unlike created_by');
  assert.match(sql, /create trigger bucket_items_guard_update\s*\n\s*before update on public\.bucket_items/i);
});

test('M7A: lifecycle transitions are an explicit whitelist, rejecting anything not listed', () => {
  const sql = stripComments(read(MIGRATION));
  const block = sql.match(/create or replace function private\.bucket_items_guard_update[\s\S]*?\$\$;/i)?.[0] || '';
  assert.match(block, /old\.status = 'idea' and resolved_status = 'scheduled'/i);
  assert.match(block, /old\.status = 'idea' and resolved_status = 'lived'/i,
    'idea -> lived must be reachable directly: no M7C UI exists yet and legacy completed=true writes never touch scheduled');
  assert.match(block, /old\.status = 'scheduled' and resolved_status = 'lived'/i);
  assert.match(block, /old\.status = 'idea' and resolved_status = 'archived'/i);
  assert.match(block, /old\.status = 'scheduled' and resolved_status = 'archived'/i);
  assert.match(block, /old\.status = 'lived' and resolved_status = 'archived'/i);
  assert.match(block, /bucket_items_invalid_status_transition/i);
  // No transition ever leaves archived, and lived never reverts.
  assert.doesNotMatch(block, /old\.status = 'archived' and resolved_status/i);
  assert.doesNotMatch(block, /old\.status = 'lived' and resolved_status = 'idea'/i);
  assert.doesNotMatch(block, /old\.status = 'lived' and resolved_status = 'scheduled'/i);
});

test('M7A: legacy `completed` boolean writes resolve to the same whitelist, never bypass or silently discard', () => {
  const sql = stripComments(read(MIGRATION));
  const block = sql.match(/create or replace function private\.bucket_items_guard_update[\s\S]*?\$\$;/i)?.[0] || '';
  assert.match(block, /resolved_status text := new\.status/i);
  assert.match(block, /new\.status = old\.status and new\.completed and not old\.completed/i,
    'an old client that only flips completed=true (status untouched) must resolve to a lived transition');
  assert.match(block, /resolved_status := 'lived'/i);
  assert.match(block, /new\.status = old\.status and old\.status = 'lived' and not new\.completed/i,
    'an old client trying to flip completed=false on an already-lived row must be caught, never silently reverted');
  assert.match(block, /bucket_items_cannot_revert_lived_via_completed_flag/i);
  assert.match(block, /new\.status := resolved_status/i, 'the resolved status must be the one validated and actually written');
});

test('M7A: completed/completed_at stay server-derived from status and are sticky once lived', () => {
  const sql = stripComments(read(MIGRATION));
  const block = sql.match(/create or replace function private\.bucket_items_guard_update[\s\S]*?\$\$;/i)?.[0] || '';
  assert.match(block, /if new\.status = 'lived' then/i);
  assert.match(block, /new\.completed := true/i);
  assert.match(block, /new\.completed_at := coalesce\(old\.completed_at, now\(\)\)/i,
    'completed_at must never read new.completed_at — a caller-supplied value must never be honoured, even on first transition');
  assert.match(block, /new\.completed := old\.completed/i, 'non-lived updates must not let the client flip completed directly');
  assert.match(block, /new\.completed_at := old\.completed_at/i);
});

test('M7A: hard-delete is only ever allowed for an unlinked idea/archived item', () => {
  const sql = stripComments(read(MIGRATION));
  assert.match(sql, /create or replace function private\.bucket_items_guard_delete/i);
  assert.match(sql, /old\.status not in \('idea', 'archived'\) or old\.calendar_entry_id is not null/i);
  assert.match(sql, /bucket_items_delete_requires_unlinked_idea_or_archived/i);
  assert.match(sql, /create trigger bucket_items_guard_delete\s*\n\s*before delete on public\.bucket_items/i);
});

test('M7A: no categories, votes, priorities, budgets, tags, or workflow machinery introduced', () => {
  const sql = stripComments(read(MIGRATION));
  assert.doesNotMatch(sql, /categor|vote|priorit|budget|\btag\b|workflow/i);
});

test('M7A: no realtime publication, UI, or Moments/Ricordi coupling introduced', () => {
  const sql = stripComments(read(MIGRATION));
  assert.doesNotMatch(sql, /alter publication supabase_realtime/i);
  assert.doesNotMatch(sql, /moment_id|moments\.|moment_photos/i);
});
