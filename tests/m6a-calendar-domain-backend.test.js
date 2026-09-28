const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const MIGRATION = 'supabase/migrations/20260928071627_m6a_shared_calendar_domain.sql';
const CLAIM_ROLE_FIX = 'supabase/migrations/20260928071749_m6a_claim_us_role_calendar_entries_transfer.sql';
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

test('M6A migrations exist as fresh forward-only files after the M5 history', () => {
  assert.ok(fs.existsSync(path.join(ROOT, MIGRATION)));
  assert.ok(fs.existsSync(path.join(ROOT, CLAIM_ROLE_FIX)));
  const files = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort();
  const lastThree = files.slice(-3);
  assert.deepEqual(lastThree, [path.basename(MIGRATION), path.basename(CLAIM_ROLE_FIX), '20260928210000_m6d_calendar_reminders.sql'],
    'M6A migrations stay in order; the newest file is the M6D reminders migration (additive, later milestone)');
});

test('M6A does not touch shared_events or any other existing authority (28: existing data preserved)', () => {
  const sql = stripComments(read(MIGRATION));
  assert.doesNotMatch(sql, /shared_events/i, 'shared_events is legacy authority preserved separately, untouched by M6A');
  assert.doesNotMatch(sql, /shared_event_completions|relationship_milestones/i);
  assert.doesNotMatch(sql, /alter table public\.couples|alter table public\.profiles/i, 'base tables are production-owned and out of scope');
  assert.doesNotMatch(sql, /drop table|drop function|drop policy(?!\s+if exists on public\.calendar_entries)/i);
});

test('M6A (30): migration contains no destructive or production-mutating statements', () => {
  const sql = stripComments(read(MIGRATION));
  assert.doesNotMatch(sql, /truncate|delete from public\.(?!calendar_entries)/i);
  assert.doesNotMatch(sql, /supabase db push|pg_dump|COPY /i);
  assert.match(sql, /^create table public\.calendar_entries/m, 'additive-only: a brand new table, no ALTER of existing ones');
});

test('M6A: calendar_entries has the smallest sufficient durable field set', () => {
  const sql = read(MIGRATION);
  for (const column of [
    'id uuid not null default gen_random_uuid\\(\\) primary key',
    'couple_id uuid not null references public\\.couples\\(id\\)',
    'entry_type text not null',
    'owner_id uuid references public\\.profiles\\(id\\)',
    'created_by uuid not null references public\\.profiles\\(id\\)',
    'title text not null',
    'description text',
    'location text',
    'is_all_day boolean not null default false',
    'starts_at timestamptz',
    'ends_at timestamptz',
    'start_date date',
    'end_date date',
    "visibility text not null default 'full'",
    'created_at timestamptz not null default now\\(\\)',
    'updated_at timestamptz not null default now\\(\\)'
  ]) {
    assert.match(sql, new RegExp(column, 'i'), `missing/renamed column contract: ${column}`);
  }
});

test('M6A (14/16): invariants reject invalid entry_type, timed range, all-day range and title', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /calendar_entries_entry_type_check\s*\n\s*check \(entry_type in \('personal', 'shared'\)\)/i);
  assert.match(sql, /calendar_entries_timed_range_check\s*\n\s*check \(is_all_day = true or ends_at > starts_at\)/i,
    '(14) a timed entry with end <= start must be rejected by the database');
  assert.match(sql, /calendar_entries_all_day_range_check\s*\n\s*check \(is_all_day = false or end_date >= start_date\)/i,
    '(16) an all-day entry with end_date < start_date must be rejected');
  assert.match(sql, /calendar_entries_title_check[\s\S]*?char_length\(btrim\(title\)\) between 1 and 200/i);
});

test('M6A (15): all-day uses plain date columns, never a UTC timestamptz midnight-to-midnight trick', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /start_date date,/i);
  assert.match(sql, /end_date date,/i);
  assert.match(sql, /calendar_entries_temporal_representation_check[\s\S]*?is_all_day = false[\s\S]*?starts_at is not null and ends_at is not null[\s\S]*?start_date is null and end_date is null/i);
  assert.match(sql, /calendar_entries_temporal_representation_check[\s\S]*?is_all_day = true[\s\S]*?start_date is not null and end_date is not null[\s\S]*?starts_at is null and ends_at is null/i,
    'an all-day row must never carry a timestamptz value that timezone conversion could shift off its calendar day');
});

test('M6A: visibility is restricted to \'full\' — busy_only would be unenforceable by RLS', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /calendar_entries_visibility_check\s*\n\s*check \(visibility = 'full'\)/i,
    'RLS cannot mask columns, so busy_only must stay rejected until a read path actually enforces detail-masking');
  assert.doesNotMatch(stripComments(sql), /'busy_only'/i,
    'no accepted value or policy branch may reference busy_only until it is actually enforced');
});

test('M6A: explicit table ACL hardens the new relation beyond the RLS policies', () => {
  const statements = stripComments(read(MIGRATION));
  assert.match(statements, /revoke all on table public\.calendar_entries from anon, authenticated/i,
    'project default privileges would otherwise leave TRUNCATE/REFERENCES/TRIGGER/MAINTAIN reachable, which RLS does not gate');
  assert.match(statements, /grant select, insert, update, delete on table public\.calendar_entries to authenticated/i,
    'this table needs client UPDATE/DELETE (owner/creator authority), unlike left_for_you');
});

test('M6A (21): owner/entry_type coherence keeps a shared entry as exactly one non-duplicated row', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /calendar_entries_owner_by_type_check[\s\S]*?entry_type = 'personal' and owner_id is not null[\s\S]*?entry_type = 'shared' and owner_id is null/i,
    'shared rows carry no per-partner owner column, so there is no per-partner duplication path in the schema');
  assert.match(sql, /calendar_entries_personal_owner_is_creator_check[\s\S]*?owner_id = created_by/i,
    'a personal entry can only be created by its own owner, never on behalf of the partner');
});

test('M6A (29): RLS is enabled and forced on calendar_entries', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /alter table public\.calendar_entries enable row level security/i);
  assert.match(sql, /alter table public\.calendar_entries force row level security/i);
});

test('M6A (5/6/3/4): select is couple-scoped only, covering both entry types for both partners', () => {
  const sql = read(MIGRATION);
  const block = sql.match(/create policy calendar_entries_select_couple[\s\S]*?;/i)?.[0] || '';
  assert.match(block, /for select to authenticated/i);
  assert.match(block, /using \(\s*couple_id = private\.current_couple_id\(\)\s*\)/i);
  assert.doesNotMatch(block, /owner_id|created_by/i, 'select must not additionally restrict by owner/creator: both partners read both entry types');
});

test('M6A (1/6): personal insert requires self as both creator and owner, inside the caller couple', () => {
  const sql = read(MIGRATION);
  const block = sql.match(/create policy calendar_entries_insert_personal[\s\S]*?;/i)?.[0] || '';
  assert.match(block, /entry_type = 'personal'/i);
  assert.match(block, /couple_id = private\.current_couple_id\(\)/i);
  assert.match(block, /created_by = auth\.uid\(\)/i);
  assert.match(block, /owner_id = auth\.uid\(\)/i);
});

test('M6A (2/6): shared insert requires the caller as creator, no owner, inside the caller couple', () => {
  const sql = read(MIGRATION);
  const block = sql.match(/create policy calendar_entries_insert_shared[\s\S]*?;/i)?.[0] || '';
  assert.match(block, /entry_type = 'shared'/i);
  assert.match(block, /couple_id = private\.current_couple_id\(\)/i);
  assert.match(block, /created_by = auth\.uid\(\)/i);
  assert.match(block, /owner_id is null/i);
});

test('M6A (7/8): only the personal owner may update, and only within their couple', () => {
  const sql = read(MIGRATION);
  const block = sql.match(/create policy calendar_entries_update_personal[\s\S]*?;/i)?.[0] || '';
  assert.match(block, /for update to authenticated/i);
  assert.match(block, /using \([\s\S]*?owner_id = auth\.uid\(\)[\s\S]*?\)/i);
  assert.match(block, /with check \([\s\S]*?owner_id = auth\.uid\(\)[\s\S]*?\)/i);
});

test('M6A (9/10): only the personal owner may delete', () => {
  const sql = read(MIGRATION);
  const block = sql.match(/create policy calendar_entries_delete_personal[\s\S]*?;/i)?.[0] || '';
  assert.match(block, /for delete to authenticated/i);
  assert.match(block, /using \([\s\S]*?owner_id = auth\.uid\(\)[\s\S]*?\)/i);
});

test('M6A (11/13): only the shared creator may update, per M6A (no mutual consent)', () => {
  const sql = read(MIGRATION);
  const block = sql.match(/create policy calendar_entries_update_shared[\s\S]*?;/i)?.[0] || '';
  assert.match(block, /using \([\s\S]*?created_by = auth\.uid\(\)[\s\S]*?\)/i);
  assert.match(block, /with check \([\s\S]*?created_by = auth\.uid\(\)[\s\S]*?\)/i);
});

test('M6A (12/13): only the shared creator may delete', () => {
  const sql = read(MIGRATION);
  const block = sql.match(/create policy calendar_entries_delete_shared[\s\S]*?;/i)?.[0] || '';
  assert.match(block, /for delete to authenticated/i);
  assert.match(block, /using \([\s\S]*?created_by = auth\.uid\(\)[\s\S]*?\)/i);
});

test('M6A (13/29): a BEFORE UPDATE guard closes the multi-policy OR cross-authority gap', () => {
  const sql = read(MIGRATION);
  const statements = stripComments(sql);
  // With independent permissive policies, Postgres ORs each policy's USING and
  // WITH CHECK separately; without a guard a personal-owner update could pass
  // USING via the personal policy and WITH CHECK via the shared policy (or vice
  // versa), silently flipping entry_type/creator/couple. The trigger blocks this
  // unconditionally, on the OLD row, before any WITH CHECK is evaluated.
  assert.match(statements, /create or replace function private\.calendar_entries_guard_update\(\)/i);
  assert.match(statements, /new\.entry_type <> old\.entry_type/i);
  assert.match(statements, /new\.couple_id <> old\.couple_id/i);
  assert.match(statements, /security definer/i);
  assert.match(statements, /set search_path = ''/i);
  assert.match(statements, /revoke all on function private\.calendar_entries_guard_update\(\) from public, anon, authenticated/i);
  assert.match(statements, /create trigger calendar_entries_guard_update\s*\n\s*before update on public\.calendar_entries/i);
  assert.match(statements, /new\.updated_at := now\(\)/i);
});

test('M6A: created_by immutability has a narrow, session-local carve-out for claim_us_role re-pair transfers only', () => {
  const statements = stripComments(read(MIGRATION));
  assert.match(statements, /repair_transfer boolean := coalesce\(current_setting\('us\.calendar_entries_repair_transfer', true\), ''\) = 'on'/i);
  assert.match(statements, /new\.created_by <> old\.created_by and not repair_transfer/i,
    'created_by stays blocked by default; only the explicit session-local flag lifts it');
  // entry_type and couple_id must have NO such carve-out: unconditional in every case.
  assert.doesNotMatch(statements, /new\.entry_type <> old\.entry_type[\s\S]{0,10}and not repair_transfer/i);
  assert.doesNotMatch(statements, /new\.couple_id <> old\.couple_id[\s\S]{0,10}and not repair_transfer/i);
});

test('M6A: no realtime publication added (no UI consumer yet; kept out of scope for the domain milestone)', () => {
  const sql = read(MIGRATION);
  assert.doesNotMatch(sql, /alter publication supabase_realtime/i);
});

test('M6A: exactly the six expected policies exist, no extra authority surface', () => {
  const sql = read(MIGRATION);
  const policyNames = [...sql.matchAll(/create policy (\w+)/gi)].map((m) => m[1]).sort();
  assert.deepEqual(policyNames, [
    'calendar_entries_delete_personal',
    'calendar_entries_delete_shared',
    'calendar_entries_insert_personal',
    'calendar_entries_insert_shared',
    'calendar_entries_select_couple',
    'calendar_entries_update_personal',
    'calendar_entries_update_shared'
  ].sort());
});

test('M6A: interval-scoped query contract indexes exist with query justification', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /calendar_entries_couple_timed_idx\s*\n\s*on public\.calendar_entries \(couple_id, starts_at\)\s*\n\s*where is_all_day = false/i);
  assert.match(sql, /calendar_entries_couple_allday_idx\s*\n\s*on public\.calendar_entries \(couple_id, start_date\)\s*\n\s*where is_all_day = true/i);
});

test('M6A: no recurrence, reminders, or Da Vivere/Moments coupling introduced', () => {
  const statements = stripComments(read(MIGRATION));
  assert.doesNotMatch(statements, /rrule|recurs|recurring|reminder|notification/i);
  assert.doesNotMatch(statements, /source_type|source_id|moment_id|left_for_you/i);
});
