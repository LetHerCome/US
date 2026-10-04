// M7A behavior tests: exercises the real migration SQL (DDL, RLS policies,
// triggers, PL/pgSQL guard functions) against an embedded real Postgres
// engine (@electric-sql/pglite), not string/regex matching against the
// migration source. Docker's daemon is not running and psql is not
// installed in this environment, so pglite is used as the minimal
// Postgres-compatible runtime capable of executing the actual SQL.
//
// Fixture scope: bucket_items (M7A's own authority, full production ACL/RLS
// contract as read live from production by prior recon) plus a minimal
// calendar_entries stand-in (M6A's authority — only the columns M7A's FK
// and guard function actually read/reference: id, couple_id, entry_type).
// The claim_us_role migration is applied as-is (CREATE OR REPLACE FUNCTION
// is pure DDL; plpgsql bodies are not semantically checked until first
// call), but the repair-transfer carve-out itself is exercised directly at
// the trigger/GUC level that M7A's own migration owns, rather than by
// invoking the full claim_us_role RPC (which depends on unrelated
// M6A/pre-existing production schema — auth.users, couple_invites,
// extensions.digest — outside this migration's scope and already covered
// elsewhere by verbatim-preservation tests).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations_history/20260929121350_m7a_da_vivere_bucket_items_domain.sql');
const CLAIM_ROLE_FIX = path.join(ROOT, 'supabase/migrations_history/20260929121430_m7a_claim_us_role_bucket_items_transfer.sql');

const { PGlite } = require('@electric-sql/pglite');

const uuid = () => crypto.randomUUID();

const FIXTURE_SQL = `
  create role authenticated;
  create role anon;
  grant usage on schema public to authenticated, anon;

  create schema auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;

  create schema private;

  -- M6A authority stand-in: only the columns M7A's FK/guard actually touch.
  create table public.calendar_entries (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null,
    entry_type text not null check (entry_type in ('personal', 'shared'))
  );
  grant select on public.calendar_entries to authenticated;

  -- M7A production baseline: pre-existing bucket_items, no migration in the
  -- repo before this one. Columns and ACL/RLS as read live from production.
  create table public.bucket_items (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null,
    created_by uuid not null,
    title text not null,
    completed boolean not null default false,
    completed_at timestamptz,
    created_at timestamptz not null default now()
  );

  create table public.profiles (
    id uuid primary key,
    couple_id uuid not null,
    role text
  );
  grant select on public.profiles to authenticated;

  alter table public.bucket_items enable row level security;
  create policy bucket_items_select on public.bucket_items for select
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  create policy bucket_items_insert on public.bucket_items for insert
    with check (
      couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid())
      and created_by = auth.uid()
    );
  create policy bucket_items_update on public.bucket_items for update
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  create policy bucket_items_delete on public.bucket_items for delete
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on table public.bucket_items to authenticated;

  -- Orthogonal authority M7A must never touch, verified after migration apply.
  create table public.shared_events (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null,
    title text not null
  );
`;

async function buildFixture() {
  const db = new PGlite();
  await db.exec(FIXTURE_SQL);
  const migrationSql = fs.readFileSync(MIGRATION, 'utf8');
  await db.exec(migrationSql);
  // claim_us_role's DECLARE block resolves `public.couple_invites%rowtype`
  // at CREATE-time (check_function_bodies=on by default requires it), but
  // couple_invites/extensions.digest/etc. are unrelated production schema
  // this fixture intentionally doesn't build — the repair-transfer
  // carve-out itself is exercised directly at the trigger/GUC level owned
  // by migration 090000, not by invoking the full RPC. Disabling the check
  // only lets CREATE OR REPLACE FUNCTION succeed against this narrower
  // fixture; it does not change the migration file being applied.
  await db.exec('set check_function_bodies = off;');
  const claimRoleSql = fs.readFileSync(CLAIM_ROLE_FIX, 'utf8');
  await db.exec(claimRoleSql);
  await db.exec('set check_function_bodies = on;');
  return db;
}

async function asUser(db, uid) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
}

async function asSuperuser(db) {
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
}

async function makeCouple(db, coupleId, members) {
  await asSuperuser(db);
  for (const { id, role } of members) {
    await db.query(`insert into auth.users (id) values ($1)`, [id]);
    await db.query(`insert into public.profiles (id, couple_id, role) values ($1, $2, $3)`, [id, coupleId, role]);
  }
}

async function makeCalendarEntry(db, { id, coupleId, entryType }) {
  await asSuperuser(db);
  await db.query(
    `insert into public.calendar_entries (id, couple_id, entry_type) values ($1, $2, $3)`,
    [id, coupleId, entryType]
  );
}

let db;

test.before(async () => {
  db = await buildFixture();
});

test.after(async () => {
  await db.close();
});

test('behavior: both-member same-couple CRUD — partner (not creator) can read and advance a shared idea', async () => {
  const coupleId = uuid();
  const francesco = uuid();
  const beatrice = uuid();
  await makeCouple(db, coupleId, [{ id: francesco, role: 'francesco' }, { id: beatrice, role: 'beatrice' }]);

  await asUser(db, francesco);
  const itemId = uuid();
  await db.query(
    `insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`,
    [itemId, coupleId, francesco, 'Weekend trip']
  );

  await asUser(db, beatrice);
  const seenByPartner = await db.query(`select * from public.bucket_items where id = $1`, [itemId]);
  assert.equal(seenByPartner.rows.length, 1, 'partner in the same couple must see the idea, even though not the creator');

  const calId = uuid();
  await makeCalendarEntry(db, { id: calId, coupleId, entryType: 'shared' });

  await asUser(db, beatrice);
  await db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [itemId, calId]);
  const afterSchedule = await db.query(`select status, calendar_entry_id from public.bucket_items where id = $1`, [itemId]);
  assert.equal(afterSchedule.rows[0].status, 'scheduled', 'partner must be able to advance a same-couple idea to scheduled');

  await db.query(`update public.bucket_items set status = 'lived' where id = $1`, [itemId]);
  const afterLive = await db.query(`select status, completed, completed_at from public.bucket_items where id = $1`, [itemId]);
  assert.equal(afterLive.rows[0].status, 'lived');
  assert.equal(afterLive.rows[0].completed, true, 'completed must be server-derived true once lived');
  assert.ok(afterLive.rows[0].completed_at, 'completed_at must be set on first transition to lived');
});

test('behavior: other-couple invisibility and denial', async () => {
  const coupleA = uuid();
  const coupleB = uuid();
  const memberA = uuid();
  const memberB = uuid();
  await makeCouple(db, coupleA, [{ id: memberA, role: 'francesco' }]);
  await makeCouple(db, coupleB, [{ id: memberB, role: 'francesco' }]);

  await asUser(db, memberA);
  const itemId = uuid();
  await db.query(
    `insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`,
    [itemId, coupleA, memberA, 'Couple A idea']
  );

  await asUser(db, memberB);
  const selectAsB = await db.query(`select * from public.bucket_items where id = $1`, [itemId]);
  assert.equal(selectAsB.rows.length, 0, 'other-couple member must not see the row at all (RLS select denial)');

  const updateAsB = await db.query(`update public.bucket_items set title = 'hijacked' where id = $1`, [itemId]);
  assert.equal(updateAsB.affectedRows ?? 0, 0, 'other-couple member update must silently affect zero rows');

  const deleteAsB = await db.query(`delete from public.bucket_items where id = $1`, [itemId]);
  assert.equal(deleteAsB.affectedRows ?? 0, 0, 'other-couple member delete must silently affect zero rows');

  await assert.rejects(
    () => db.query(
      `insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`,
      [uuid(), coupleA, memberB, 'cross-couple forged insert']
    ),
    /row-level security/i,
    'inserting into a foreign couple must be rejected by the RLS insert policy'
  );
});

test('behavior: lifecycle allowed/blocked transitions', async () => {
  const coupleId = uuid();
  const member = uuid();
  await makeCouple(db, coupleId, [{ id: member, role: 'francesco' }]);
  const sharedEntry = uuid();
  const otherCoupleEntry = uuid();
  const personalEntry = uuid();
  await makeCalendarEntry(db, { id: sharedEntry, coupleId, entryType: 'shared' });
  await makeCalendarEntry(db, { id: personalEntry, coupleId, entryType: 'personal' });
  await makeCalendarEntry(db, { id: otherCoupleEntry, coupleId: uuid(), entryType: 'shared' });

  await asUser(db, member);

  const idea = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [idea, coupleId, member, 'idea']);

  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'scheduled' where id = $1`, [idea]),
    /bucket_items_status_calendar_link_check/i,
    'scheduled without a calendar link must be rejected by the check constraint'
  );

  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [idea, otherCoupleEntry]),
    /bucket_items_calendar_entry_cross_couple/i,
    'linking a cross-couple calendar entry must be rejected'
  );

  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [idea, personalEntry]),
    /bucket_items_calendar_entry_not_shared/i,
    'linking a personal (non-shared) calendar entry must be rejected'
  );

  await db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [idea, sharedEntry]);

  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'idea' where id = $1`, [idea]),
    /bucket_items_invalid_status_transition/i,
    'scheduled -> idea must never be allowed'
  );

  await db.query(`update public.bucket_items set status = 'lived' where id = $1`, [idea]);

  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'scheduled' where id = $1`, [idea]),
    /bucket_items_invalid_status_transition/i,
    'lived -> scheduled must never be allowed'
  );
  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'idea' where id = $1`, [idea]),
    /bucket_items_invalid_status_transition/i,
    'lived -> idea must never be allowed'
  );

  await db.query(`update public.bucket_items set status = 'archived' where id = $1`, [idea]);

  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'lived' where id = $1`, [idea]),
    /bucket_items_invalid_status_transition/i,
    'archived must be terminal — no transition leaves it'
  );
});

test('behavior: creator provenance is immutable without the repair carve-out', async () => {
  const coupleId = uuid();
  const memberA = uuid();
  const memberB = uuid();
  await makeCouple(db, coupleId, [{ id: memberA, role: 'francesco' }, { id: memberB, role: 'beatrice' }]);

  await asUser(db, memberA);
  const itemId = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [itemId, coupleId, memberA, 'idea']);

  await assert.rejects(
    () => db.query(`update public.bucket_items set created_by = $2 where id = $1`, [itemId, memberB]),
    /bucket_items_created_by_immutable/i,
    'created_by must be immutable for an ordinary write'
  );

  const otherCoupleId = uuid();
  await assert.rejects(
    () => db.query(`update public.bucket_items set couple_id = $2 where id = $1`, [itemId, otherCoupleId]),
    /bucket_items_couple_id_immutable/i,
    'couple_id must always be immutable, with no carve-out'
  );
});

test('behavior: authorized repair carve-out allows created_by transfer but never couple_id', async () => {
  const coupleId = uuid();
  const oldOwner = uuid();
  const newOwner = uuid();
  await makeCouple(db, coupleId, [{ id: oldOwner, role: 'francesco' }, { id: newOwner, role: 'francesco' }]);

  await asSuperuser(db);
  const itemId = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [itemId, coupleId, oldOwner, 'idea']);

  await db.query(`select set_config('us.bucket_items_repair_transfer', 'on', false)`);
  await db.query(`update public.bucket_items set created_by = $2 where id = $1`, [itemId, newOwner]);
  await db.query(`select set_config('us.bucket_items_repair_transfer', 'off', false)`);

  const afterTransfer = await db.query(`select created_by from public.bucket_items where id = $1`, [itemId]);
  assert.equal(afterTransfer.rows[0].created_by, newOwner, 'created_by must move under the authorized repair carve-out');

  const otherCoupleId = uuid();
  await db.query(`select set_config('us.bucket_items_repair_transfer', 'on', false)`);
  await assert.rejects(
    () => db.query(`update public.bucket_items set couple_id = $2 where id = $1`, [itemId, otherCoupleId]),
    /bucket_items_couple_id_immutable/i,
    'the repair carve-out must never extend to couple_id'
  );
  await db.query(`select set_config('us.bucket_items_repair_transfer', 'off', false)`);
});

test('behavior: link integrity — FK, cross-couple, shared-only, and 1:1 uniqueness', async () => {
  const coupleId = uuid();
  const member = uuid();
  await makeCouple(db, coupleId, [{ id: member, role: 'francesco' }]);
  const sharedEntry = uuid();
  await makeCalendarEntry(db, { id: sharedEntry, coupleId, entryType: 'shared' });

  await asUser(db, member);
  const idea1 = uuid();
  const idea2 = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [idea1, coupleId, member, 'idea 1']);
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [idea2, coupleId, member, 'idea 2']);

  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [idea1, uuid()]),
    /bucket_items_calendar_entry_not_found/i,
    'linking a nonexistent calendar entry must be rejected'
  );

  await db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [idea1, sharedEntry]);

  await assert.rejects(
    () => db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [idea2, sharedEntry]),
    /bucket_items_calendar_entry_id_key|duplicate key/i,
    'a calendar entry can back at most one bucket item (1:1 unique)'
  );
});

test('behavior: hard-delete guard only allows unlinked idea/archived rows', async () => {
  const coupleId = uuid();
  const member = uuid();
  await makeCouple(db, coupleId, [{ id: member, role: 'francesco' }]);
  const sharedEntry = uuid();
  await makeCalendarEntry(db, { id: sharedEntry, coupleId, entryType: 'shared' });

  await asUser(db, member);
  const idea = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [idea, coupleId, member, 'deletable idea']);
  const deleted = await db.query(`delete from public.bucket_items where id = $1`, [idea]);
  assert.equal(deleted.affectedRows, 1, 'an unlinked idea must be hard-deletable');

  const scheduled = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [scheduled, coupleId, member, 'scheduled item']);
  await db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [scheduled, sharedEntry]);
  await assert.rejects(
    () => db.query(`delete from public.bucket_items where id = $1`, [scheduled]),
    /bucket_items_delete_requires_unlinked_idea_or_archived/i,
    'a scheduled (linked) item must never be hard-deletable'
  );
});

test('behavior: legacy completed-row backfill preserves history and lands on lived', async () => {
  const legacyDb = new PGlite();
  await legacyDb.exec(FIXTURE_SQL);
  await legacyDb.exec(`reset role`);

  const coupleId = uuid();
  const owner = uuid();
  const legacyId = uuid();
  const legacyCreatedAt = '2024-01-05T10:00:00Z';
  const legacyCompletedAt = '2024-02-01T12:00:00Z';
  await legacyDb.query(`insert into auth.users (id) values ($1)`, [owner]);
  await legacyDb.query(`insert into public.profiles (id, couple_id, role) values ($1, $2, $3)`, [owner, coupleId, 'francesco']);
  await legacyDb.query(
    `insert into public.bucket_items (id, couple_id, created_by, title, completed, completed_at, created_at) values ($1, $2, $3, $4, true, $5, $6)`,
    [legacyId, coupleId, owner, 'legacy completed idea', legacyCompletedAt, legacyCreatedAt]
  );

  const migrationSql = fs.readFileSync(MIGRATION, 'utf8');
  await legacyDb.exec(migrationSql);
  await legacyDb.exec('set check_function_bodies = off;');
  const claimRoleSql = fs.readFileSync(CLAIM_ROLE_FIX, 'utf8');
  await legacyDb.exec(claimRoleSql);
  await legacyDb.exec('set check_function_bodies = on;');

  const row = await legacyDb.query(
    `select status, calendar_entry_id, completed, completed_at, updated_at, created_at from public.bucket_items where id = $1`,
    [legacyId]
  );
  assert.equal(row.rows[0].status, 'lived', 'legacy completed=true row must backfill to lived');
  assert.equal(row.rows[0].calendar_entry_id, null, 'legacy lived row must be allowed with no calendar link (pre-M7C)');
  assert.equal(row.rows[0].completed, true);
  assert.equal(
    new Date(row.rows[0].completed_at).toISOString(),
    new Date(legacyCompletedAt).toISOString(),
    'backfill must preserve the existing completed_at, never overwrite it'
  );
  assert.equal(
    new Date(row.rows[0].updated_at).toISOString(),
    new Date(legacyCreatedAt).toISOString(),
    'updated_at must inherit created_at for historical rows, not the migration apply time'
  );

  await legacyDb.close();
});

test('behavior: old-client legacy completed=true write is honored as a transition to lived, not silently reverted', async () => {
  const coupleId = uuid();
  const member = uuid();
  await makeCouple(db, coupleId, [{ id: member, role: 'francesco' }]);

  await asUser(db, member);
  const itemId = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [itemId, coupleId, member, 'old client idea']);

  // Old client only knows the legacy `completed` boolean — it never sets `status`.
  await db.query(`update public.bucket_items set completed = true where id = $1`, [itemId]);

  const after = await db.query(`select status, completed, completed_at, calendar_entry_id from public.bucket_items where id = $1`, [itemId]);
  assert.equal(after.rows[0].status, 'lived', 'a legacy completed=true write must move the row to lived, not be discarded');
  assert.equal(after.rows[0].completed, true);
  assert.ok(after.rows[0].completed_at, 'completed_at must be server-set on this transition');
  assert.equal(after.rows[0].calendar_entry_id, null, 'legacy completion must not require a calendar link');
});

test('behavior: a caller cannot forge completed_at directly, and cannot revert lived via completed=false', async () => {
  const coupleId = uuid();
  const member = uuid();
  await makeCouple(db, coupleId, [{ id: member, role: 'francesco' }]);

  await asUser(db, member);
  const itemId = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)`, [itemId, coupleId, member, 'idea']);

  const forgedTimestamp = '1999-01-01T00:00:00Z';
  await db.query(`update public.bucket_items set status = 'lived', completed_at = $2 where id = $1`, [itemId, forgedTimestamp]);
  const afterForgeAttempt = await db.query(`select completed_at from public.bucket_items where id = $1`, [itemId]);
  assert.notEqual(
    new Date(afterForgeAttempt.rows[0].completed_at).toISOString(),
    new Date(forgedTimestamp).toISOString(),
    'the server must ignore a caller-supplied completed_at and always use now() on first transition'
  );

  const firstCompletedAt = afterForgeAttempt.rows[0].completed_at;

  await assert.rejects(
    () => db.query(`update public.bucket_items set completed = false where id = $1`, [itemId]),
    /bucket_items_cannot_revert_lived_via_completed_flag|bucket_items_invalid_status_transition/i,
    'a legacy completed=false write against a lived row must never revert it'
  );

  const stillLived = await db.query(`select status, completed, completed_at from public.bucket_items where id = $1`, [itemId]);
  assert.equal(stillLived.rows[0].status, 'lived');
  assert.equal(stillLived.rows[0].completed, true);
  assert.equal(
    new Date(stillLived.rows[0].completed_at).toISOString(),
    new Date(firstCompletedAt).toISOString(),
    'completed_at must stay sticky and never be rewritten once set'
  );
});

test('behavior: shared_events fixture is completely untouched by the M7A migrations', async () => {
  await asSuperuser(db);
  const before = await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'shared_events' order by column_name`);
  assert.deepEqual(before.rows.map((r) => r.column_name), ['couple_id', 'id', 'title']);
  const countBefore = await db.query(`select count(*)::int as n from public.shared_events`);
  assert.equal(countBefore.rows[0].n, 0);
});
