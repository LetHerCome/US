// M12B.2 — Da vivere: an idea archived without ever being lived releases its
// Calendario event. Real M7A/M7C/M7D + M12B.2 migration SQL on embedded
// Postgres (pglite). Partner races run against a real server in
// m12b-da-vivere-archived-link-race.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const BEFORE = ['20260929121350_m7a_da_vivere_bucket_items_domain', '20260929190126_m7c_da_vivere_calendar_unschedule', '20260929190145_m7d_da_vivere_reciprocal_lived']
  .map((n) => `supabase/migrations_history/${n}.sql`);
const M12B2 = 'supabase/migrations_history/20260930225935_m12b_2_da_vivere_archived_link_release.sql';
const uuid = () => crypto.randomUUID();

const FIXTURE_SQL = `
  create role authenticated;
  create role anon;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  create table public.profiles (id uuid primary key, couple_id uuid not null);
  grant select on public.profiles to authenticated;
  create table public.calendar_entries (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null,
    entry_type text not null check (entry_type in ('personal', 'shared')),
    created_by uuid
  );
  alter table public.calendar_entries enable row level security;
  create policy calendar_entries_all on public.calendar_entries for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.calendar_entries to authenticated;
  create table public.bucket_items (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null,
    created_by uuid not null,
    title text not null,
    completed boolean not null default false,
    completed_at timestamptz,
    created_at timestamptz not null default now()
  );
  alter table public.bucket_items enable row level security;
  create policy bucket_items_all on public.bucket_items for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.bucket_items to authenticated;
`;

let db;
let legacy; // a row left in the broken state BEFORE the migration (production shape)
test.before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE_SQL);
  for (const f of BEFORE) await db.exec(read(f));
  legacy = await couple();
  legacy.pinned = await scheduledIdea(legacy);
  legacy.lived = await scheduledIdea(legacy);
  await confirm(legacy.b, legacy.lived.item); await confirm(legacy.a, legacy.lived.item);
  await asUser(legacy.a);
  await db.query(`update public.bucket_items set status = 'archived' where id in ($1, $2)`, [legacy.pinned.item, legacy.lived.item]);
  // Pre-fix behaviour, reproduced: the never-lived archived idea pins its event.
  await assert.rejects(db.query('delete from public.calendar_entries where id = $1', [legacy.pinned.entry]), (e) => e.code === '23001');
  await asSuperuser();
  await db.exec(read(M12B2));
});
test.after(async () => { await db.close(); });

async function asUser(uid) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
}
async function asSuperuser() {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
}
async function couple() {
  const coupleId = uuid(); const a = uuid(); const b = uuid();
  await asSuperuser();
  await db.query('insert into public.profiles (id, couple_id) values ($1, $2), ($3, $2)', [a, coupleId, b]);
  return { coupleId, a, b };
}
async function idea(c) {
  await asUser(c.a);
  const item = uuid();
  await db.query('insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)', [item, c.coupleId, c.a, 'Provare quel ristorante']);
  return item;
}
async function scheduledIdea(c) {
  const item = await idea(c);
  const entry = uuid();
  await db.query(`insert into public.calendar_entries (id, couple_id, entry_type, created_by) values ($1, $2, 'shared', $3)`, [entry, c.coupleId, c.a]);
  await db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [item, entry]);
  return { item, entry };
}
const confirm = async (uid, id) => { await asUser(uid); return (await db.query('select public.confirm_bucket_item_lived($1) as r', [id])).rows[0].r; };
const archive = async (uid, id) => { await asUser(uid); return db.query(`update public.bucket_items set status = 'archived' where id = $1 returning id`, [id]); };
const row = async (id) => { await asSuperuser(); return (await db.query('select status, completed, completed_at, calendar_entry_id, lived_proposed_by from public.bucket_items where id = $1', [id])).rows[0]; };
const entryExists = async (id) => { await asSuperuser(); return (await db.query('select 1 from public.calendar_entries where id = $1', [id])).rows.length === 1; };

test('backfill: a row already pinned before the migration is released; lived history is not', async () => {
  const pinned = await row(legacy.pinned.item);
  assert.equal(pinned.status, 'archived');
  assert.equal(pinned.calendar_entry_id, null);
  assert.equal(pinned.completed_at, null);
  assert.ok(await entryExists(legacy.pinned.entry), 'the calendar event itself is never deleted by the migration');
  const lived = await row(legacy.lived.item);
  assert.equal(lived.status, 'archived');
  assert.equal(lived.calendar_entry_id, legacy.lived.entry);
  assert.ok(lived.completed_at);
  await asUser(legacy.a);
  await db.query('delete from public.calendar_entries where id = $1', [legacy.pinned.entry]);
  assert.equal(await entryExists(legacy.pinned.entry), false);
  await assert.rejects(db.query('delete from public.calendar_entries where id = $1', [legacy.lived.entry]), (e) => e.code === '23001');
});

test('A — an unscheduled idea archived: unchanged behaviour, no link, still hard-deletable', async () => {
  const c = await couple();
  const item = await idea(c);
  await archive(c.b, item);
  const r = await row(item);
  assert.equal(r.status, 'archived');
  assert.equal(r.calendar_entry_id, null);
  await asUser(c.a);
  await db.query('delete from public.bucket_items where id = $1', [item]);
  assert.equal((await db.query('select 1 from public.bucket_items where id = $1', [item])).rows.length, 0);
});

test('B — a scheduled, never-lived idea archived: link released, the event stays and becomes deletable', async () => {
  const c = await couple();
  const { item, entry } = await scheduledIdea(c);
  await archive(c.b, item); // the partner archives
  const r = await row(item);
  assert.equal(r.status, 'archived');
  assert.equal(r.calendar_entry_id, null);
  assert.equal(r.completed, false);
  assert.equal(r.completed_at, null);
  assert.ok(await entryExists(entry), 'archiving never deletes the Calendario event (Calendario stays the authority)');
  await asUser(c.a);
  await db.query('delete from public.calendar_entries where id = $1', [entry]);
  assert.equal(await entryExists(entry), false);
  assert.equal((await row(item)).status, 'archived');
});

test('B — a pending lived proposal does not count as lived: the link is still released, the proposal kept', async () => {
  const c = await couple();
  const { item, entry } = await scheduledIdea(c);
  await confirm(c.a, item); // proposal only
  await archive(c.a, item);
  const r = await row(item);
  assert.equal(r.status, 'archived');
  assert.equal(r.calendar_entry_id, null);
  assert.equal(r.lived_proposed_by, c.a);
  await asUser(c.a);
  await db.query('delete from public.calendar_entries where id = $1', [entry]);
});

test('C — a scheduled idea lived by both, then archived: the event keeps its link and cannot be deleted', async () => {
  const c = await couple();
  const { item, entry } = await scheduledIdea(c);
  await confirm(c.a, item); await confirm(c.b, item);
  const livedAt = (await row(item)).completed_at;
  await archive(c.a, item);
  const r = await row(item);
  assert.equal(r.status, 'archived');
  assert.equal(r.calendar_entry_id, entry);
  assert.equal(r.completed, true);
  assert.equal(String(r.completed_at), String(livedAt));
  await asUser(c.b);
  await assert.rejects(db.query('delete from public.calendar_entries where id = $1', [entry]), (e) => e.code === '23001');
  await assert.rejects(db.query('delete from public.bucket_items where id = $1', [item]), /bucket_items_delete_requires_unlinked_idea_or_archived/);
  assert.ok(await entryExists(entry));
});

test('D — a repeated archive request is idempotent', async () => {
  const c = await couple();
  const { item, entry } = await scheduledIdea(c);
  const first = await archive(c.a, item);
  const second = await archive(c.a, item);
  const third = await archive(c.b, item);
  assert.equal(first.rows.length, 1); assert.equal(second.rows.length, 1); assert.equal(third.rows.length, 1);
  const r = await row(item);
  assert.equal(r.status, 'archived');
  assert.equal(r.calendar_entry_id, null);
  assert.ok(await entryExists(entry));
});

test('an archived never-lived idea can never be re-linked, and a forged completed_at cannot keep the link', async () => {
  const c = await couple();
  const { item, entry } = await scheduledIdea(c);
  await asUser(c.a);
  await db.query(`update public.bucket_items set status = 'archived', completed_at = now() where id = $1`, [item]);
  let r = await row(item);
  assert.equal(r.completed_at, null, 'completed_at stays server-owned (M7A guard)');
  assert.equal(r.calendar_entry_id, null);
  await asUser(c.a);
  await db.query('update public.bucket_items set calendar_entry_id = $2 where id = $1', [item, entry]);
  r = await row(item);
  assert.equal(r.calendar_entry_id, null);
  await assert.rejects(confirm(c.b, item), /bucket_items_lived_not_allowed_from: archived/);
});

test('F — history: lived items keep their event through every path; scheduled still returns to idea', async () => {
  const c = await couple();
  const lived = await scheduledIdea(c);
  await confirm(c.a, lived.item); await confirm(c.b, lived.item);
  await asUser(c.a);
  await assert.rejects(db.query('delete from public.calendar_entries where id = $1', [lived.entry]), (e) => e.code === '23001');
  assert.equal((await row(lived.item)).calendar_entry_id, lived.entry);
  const scheduled = await scheduledIdea(c);
  await asUser(c.b);
  await db.query('delete from public.calendar_entries where id = $1', [scheduled.entry]);
  const s = await row(scheduled.item);
  assert.equal(s.status, 'idea');
  assert.equal(s.calendar_entry_id, null);
});

test('couple isolation: another couple cannot archive, release or delete anything', async () => {
  const c = await couple();
  const other = await couple();
  const { item, entry } = await scheduledIdea(c);
  const res = await archive(other.a, item);
  assert.equal(res.rows.length, 0);
  assert.equal((await row(item)).status, 'scheduled');
  await asUser(other.a);
  const del = await db.query('delete from public.calendar_entries where id = $1 returning id', [entry]);
  assert.equal(del.rows.length, 0);
  assert.equal((await row(item)).calendar_entry_id, entry);
});

test('the invariant is enforced by the database, not only by the trigger', async () => {
  const c = await couple();
  const { item } = await scheduledIdea(c);
  await asSuperuser();
  await db.exec('alter table public.bucket_items disable trigger bucket_items_release_archived_link');
  try {
    await assert.rejects(db.query(`update public.bucket_items set status = 'archived' where id = $1`, [item]), /bucket_items_archived_unlived_unlinked_check/);
  } finally {
    await db.exec('alter table public.bucket_items enable trigger bucket_items_release_archived_link');
  }
  assert.equal((await row(item)).status, 'scheduled');
});

test('the release trigger runs after the M7A/M7D guard (name order)', async () => {
  await asSuperuser();
  const names = (await db.query(`select tgname from pg_trigger where tgrelid = 'public.bucket_items'::regclass and not tgisinternal and tgtype & 16 = 16 order by tgname`)).rows.map((r) => r.tgname);
  assert.ok(names.indexOf('bucket_items_guard_update') >= 0);
  assert.ok(names.indexOf('bucket_items_guard_update') < names.indexOf('bucket_items_release_archived_link'), names.join(','));
});

test('migration: minimal, forward-only, touches only bucket_items and never deletes', () => {
  const sql = read(M12B2).replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /\bdelete\b/i);
  assert.doesNotMatch(sql, /\bdrop\b/i);
  assert.doesNotMatch(sql, /shared_events|shared_event_completions|relationship_milestones|moments|claim_us_role/);
  assert.doesNotMatch(sql, /(alter|update|insert into)\s+(table\s+)?public\.calendar_entries/i);
  assert.doesNotMatch(sql, /create or replace function private\.bucket_items_guard_(update|insert|delete)/);
  assert.doesNotMatch(sql, /confirm_bucket_item_lived/);
  assert.match(sql, /create trigger bucket_items_release_archived_link\s+before update on public\.bucket_items/);
  assert.match(sql, /check \(status <> 'archived' or completed_at is not null or calendar_entry_id is null\)/);
  // Applies after every migration it builds on, and after the last one in production at M12B (M11F).
  for (const before of [...BEFORE, 'supabase/migrations_history/20260930172615_m11f_game_v2_weekly_rhythm.sql']) {
    assert.ok(path.basename(before) < path.basename(M12B2), `${before} must precede M12B.2`);
  }
});
