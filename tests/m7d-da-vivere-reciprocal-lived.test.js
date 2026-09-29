// M7D fix — reciprocal "vissuta": real migration SQL on embedded Postgres
// (pglite). Partner A proposes, partner B confirms, only then status=lived.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const M7A = 'supabase/migrations/20260929121350_m7a_da_vivere_bucket_items_domain.sql';
const M7C = 'supabase/migrations/20260929190126_m7c_da_vivere_calendar_unschedule.sql';
const M7D = 'supabase/migrations/20260929190145_m7d_da_vivere_reciprocal_lived.sql';
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
  create table public.moments (id uuid primary key default gen_random_uuid(), couple_id uuid not null);
  grant select, insert on public.moments to authenticated;
  create table public.calendar_entries (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null,
    entry_type text not null check (entry_type in ('personal', 'shared'))
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
`;

let db;
let legacyLivedId;
let legacyCouple;
test.before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE_SQL);
  await db.exec(read(M7A));
  await db.exec(read(M7C));
  // A row that was already lived under the pre-fix contract (M7A).
  legacyCouple = { coupleId: uuid(), a: uuid(), b: uuid() };
  await db.query('insert into public.profiles (id, couple_id) values ($1, $2), ($3, $2)', [legacyCouple.a, legacyCouple.coupleId, legacyCouple.b]);
  legacyLivedId = uuid();
  await db.query(`insert into public.bucket_items (id, couple_id, created_by, title, completed) values ($1, $2, $3, 'Vecchia cena', true)`, [legacyLivedId, legacyCouple.coupleId, legacyCouple.a]);
  await db.exec(read(M7D));
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
async function idea({ coupleId, a }, { scheduled = false } = {}) {
  await asUser(a);
  const id = uuid();
  await db.query('insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)', [id, coupleId, a, 'Lisbona']);
  let entry = null;
  if (scheduled) {
    entry = uuid();
    await db.query(`insert into public.calendar_entries (id, couple_id, entry_type) values ($1, $2, 'shared')`, [entry, coupleId]);
    await db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [id, entry]);
  }
  return { id, entry };
}
const row = async (id) => (await db.query('select status, completed, completed_at, calendar_entry_id, lived_proposed_by from public.bucket_items where id = $1', [id])).rows[0];
const confirm = async (uid, id) => { await asUser(uid); return (await db.query('select public.confirm_bucket_item_lived($1) as r', [id])).rows[0].r; };
const rejects = async (fn, pattern) => { await assert.rejects(fn, pattern); };

test('A proposes: the idea stays not-lived and the proposal is durable', async () => {
  const c = await couple();
  const { id } = await idea(c);
  const r = await confirm(c.a, id);
  assert.equal(r.status, 'idea');
  assert.equal(r.lived_proposed_by, c.a);
  await asSuperuser();
  const stored = await row(id);
  assert.equal(stored.status, 'idea');
  assert.equal(stored.completed, false);
  assert.equal(stored.completed_at, null);
  assert.equal(stored.lived_proposed_by, c.a);
});

test('A cannot self-finalize, and a duplicate A confirmation is idempotent', async () => {
  const c = await couple();
  const { id } = await idea(c);
  const first = await confirm(c.a, id);
  const again = await confirm(c.a, id);
  const third = await confirm(c.a, id);
  for (const r of [first, again, third]) assert.equal(r.status, 'idea');
  assert.equal(again.lived_proposed_at, first.lived_proposed_at, 'the original proposal is never rewritten');
  await asSuperuser();
  assert.equal((await row(id)).status, 'idea');
});

test('B confirms: only then lived, completed/completed_at set, calendar link preserved, retries idempotent', async () => {
  const c = await couple();
  const { id, entry } = await idea(c, { scheduled: true });
  await confirm(c.a, id);
  const done = await confirm(c.b, id);
  assert.equal(done.status, 'lived');
  assert.equal(done.completed, true);
  assert.ok(done.completed_at);
  assert.equal(done.calendar_entry_id, entry);
  const retry = await confirm(c.b, id);
  const retryA = await confirm(c.a, id);
  assert.equal(retry.completed_at, done.completed_at);
  assert.equal(retryA.completed_at, done.completed_at);
  await asSuperuser();
  const stored = await row(id);
  assert.equal(stored.status, 'lived');
  assert.equal(stored.calendar_entry_id, entry);
});

test('the same proposal cannot be finalized by the same account through any number of calls', async () => {
  const c = await couple();
  const { id } = await idea(c, { scheduled: true });
  await Promise.all([confirm(c.a, id), confirm(c.a, id)]);
  await asSuperuser();
  assert.equal((await row(id)).status, 'scheduled');
});

test('cross-couple user is rejected and learns nothing', async () => {
  const c = await couple();
  const other = await couple();
  const { id } = await idea(c);
  await rejects(() => confirm(other.a, id), /bucket_items_not_found/);
  await rejects(() => confirm(other.a, uuid()), /bucket_items_not_found/);
  await asSuperuser();
  assert.equal((await row(id)).lived_proposed_by, null);
});

test('direct status=lived bypass is rejected, also from the partner and from scheduled', async () => {
  const c = await couple();
  const plain = await idea(c);
  const sched = await idea(c, { scheduled: true });
  for (const uid of [c.a, c.b]) {
    await asUser(uid);
    await rejects(() => db.query(`update public.bucket_items set status = 'lived' where id = $1`, [plain.id]), /bucket_items_lived_requires_reciprocal_confirmation/);
    await rejects(() => db.query(`update public.bucket_items set status = 'lived' where id = $1`, [sched.id]), /bucket_items_lived_requires_reciprocal_confirmation/);
  }
  await asSuperuser();
  assert.equal((await row(plain.id)).status, 'idea');
  assert.equal((await row(sched.id)).status, 'scheduled');
});

test('legacy completed=true bypass is rejected on update and on insert', async () => {
  const c = await couple();
  const { id } = await idea(c);
  await asUser(c.b);
  await rejects(() => db.query(`update public.bucket_items set completed = true where id = $1`, [id]), /bucket_items_lived_requires_reciprocal_confirmation/);
  await rejects(() => db.query(`insert into public.bucket_items (couple_id, created_by, title, completed) values ($1, $2, 'x', true)`, [c.coupleId, c.b]), /bucket_items_lived_requires_reciprocal_confirmation/);
  await asSuperuser();
  assert.equal((await row(id)).status, 'idea');
});

test('a client cannot forge or erase the proposal directly', async () => {
  const c = await couple();
  const { id } = await idea(c);
  await asUser(c.a);
  await rejects(() => db.query(`update public.bucket_items set lived_proposed_by = $2, lived_proposed_at = now() where id = $1`, [id, c.b]), /bucket_items_lived_proposal_requires_confirm_rpc/);
  await rejects(() => db.query(`insert into public.bucket_items (couple_id, created_by, title, lived_proposed_by, lived_proposed_at) values ($1, $2, 'x', $3, now())`, [c.coupleId, c.a, c.b]), /bucket_items_lived_proposal_requires_confirm_rpc/);
  await confirm(c.a, id);
  await asUser(c.a);
  await rejects(() => db.query(`update public.bucket_items set lived_proposed_by = null, lived_proposed_at = null where id = $1`, [id]), /bucket_items_lived_proposal_requires_confirm_rpc/);
});

test('a proposal from someone who left the couple does not count as the partner confirmation', async () => {
  const c = await couple();
  const { id } = await idea(c);
  await confirm(c.a, id);
  await asSuperuser();
  await db.query('delete from public.profiles where id = $1', [c.a]);
  const r = await confirm(c.b, id);
  assert.equal(r.status, 'idea');
  assert.equal(r.lived_proposed_by, c.b);
});

test('existing already-lived legacy rows stay readable, unchanged and confirm is a no-op on them', async () => {
  await asUser(legacyCouple.b);
  const seen = (await db.query('select status, completed, completed_at, lived_proposed_by from public.bucket_items where id = $1', [legacyLivedId])).rows[0];
  assert.equal(seen.status, 'lived');
  assert.equal(seen.completed, true);
  assert.ok(seen.completed_at);
  assert.equal(seen.lived_proposed_by, null);
  const r = await confirm(legacyCouple.a, legacyLivedId);
  assert.equal(r.status, 'lived');
  assert.ok(r.completed_at);
  await asUser(legacyCouple.a);
  await db.query(`update public.bucket_items set status = 'archived' where id = $1`, [legacyLivedId]);
  await asSuperuser();
  assert.equal((await row(legacyLivedId)).status, 'archived', 'lived -> archived still works');
});

test('an archived item cannot become lived', async () => {
  const c = await couple();
  const { id } = await idea(c);
  await asUser(c.a);
  await db.query(`update public.bucket_items set status = 'archived' where id = $1`, [id]);
  await rejects(() => confirm(c.b, id), /bucket_items_lived_not_allowed_from/);
});

test('no Moment is ever created and the RPC is not reachable by anon', async () => {
  const c = await couple();
  const { id } = await idea(c);
  await confirm(c.a, id);
  await confirm(c.b, id);
  await asSuperuser();
  assert.equal(Number((await db.query('select count(*) as n from public.moments')).rows[0].n), 0);
  await db.exec('set role anon');
  await rejects(() => db.query('select public.confirm_bucket_item_lived($1)', [id]), /permission denied/);
  await asSuperuser();
});

test('migration: additive, locks the row, never touches shared_events or calendar_entry_id', () => {
  const sql = read(M7D).replace(/--.*$/gm, '');
  assert.match(sql, /for update;/);
  assert.match(sql, /set_config\('us\.bucket_items_lived_confirm', 'on', true\)/);
  assert.doesNotMatch(sql, /shared_events|insert into public\.moments|drop table|drop column/i);
  assert.doesNotMatch(sql.match(/create or replace function public\.confirm_bucket_item_lived[\s\S]*$/)[0], /calendar_entry_id\s*=/);
});
