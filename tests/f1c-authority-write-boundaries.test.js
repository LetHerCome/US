// US 2.0 F1C — authority / RLS write-boundary regression suite.
//
// The fixture rebuilds, in an embedded Postgres (@electric-sql/pglite), the
// four tables F1C hardens with their production columns, ACLs, RLS policies,
// triggers and constraint helpers (read live on 2026-10-03), plus
// private.current_couple_id() verbatim. Two couples: Francesco + Beatrice
// (the real shape) and a foreign user X in another couple.
//
// Every attack is first shown to SUCCEED on the pre-F1C fixture (so the test
// proves the real hole, not a strawman), then the real migration is applied
// and the same attack must fail while the product's legitimate writes keep
// working. AUTHORITY_MATRIX drives the assertions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const F1C_MIGRATION = path.join(ROOT, 'supabase/migrations_history/20261003200000_f1c_authority_write_boundaries.sql');

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const F = 'f0000000-0000-4000-8000-00000000000f';
const B = 'b0000000-0000-4000-8000-00000000000b';
const X = 'a0000000-0000-4000-8000-00000000000a';
const MSG = 'd0000000-0000-4000-8000-000000000001';
const EV = 'e0000000-0000-4000-8000-000000000001';
const ENTRY_SHARED = 'c0000000-0000-4000-8000-000000000001';
const ENTRY_BEA = 'c0000000-0000-4000-8000-000000000002';
const REM = 'r0000000-0000-4000-8000-000000000001'.replace('r', 'a');

const FIXTURE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private;
  grant usage on schema public, auth, private to anon, authenticated, service_role;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create table public.couples (id uuid primary key, name text, started_on date, created_at timestamptz default now(), home_photo_path text, bond_xp int default 0);
  create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text, couple_id uuid references public.couples(id) on delete cascade,
    role text check (role = any (array['francesco', 'beatrice'])),
    created_at timestamptz default now(), avatar_path text);
  create unique index profiles_one_role_per_couple on public.profiles (couple_id, role) where couple_id is not null;

  -- verbatim production definition
  create function private.current_couple_id() returns uuid language sql stable security definer set search_path to 'public' as $$
    select couple_id from public.profiles where id = auth.uid() $$;
  revoke all on function private.current_couple_id() from public;
  grant execute on function private.current_couple_id() to authenticated;

  create function private.us_touch_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at := now(); return new; end $$;

  create table public.shared_messages (
    id uuid primary key default gen_random_uuid(), couple_id uuid references public.couples(id) on delete cascade,
    sender_id uuid references auth.users(id), recipient_id uuid references auth.users(id),
    kind text check (kind = any (array['normal', 'open_when', 'poke', 'scheduled', 'think'])),
    title text, body text, unlock_at timestamptz, opened_at timestamptz, created_at timestamptz default now(), think_operation_id uuid);

  create table public.shared_events (
    id uuid primary key default gen_random_uuid(), couple_id uuid references public.couples(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete cascade, title text check (char_length(title) between 1 and 120),
    event_date date, event_time time, location text, note text, recurs_yearly boolean default false,
    created_at timestamptz default now(), updated_at timestamptz default now());
  create trigger shared_events_touch_updated_at before update on public.shared_events for each row execute function private.us_touch_updated_at();

  create table public.calendar_entries (
    id uuid primary key default gen_random_uuid(), couple_id uuid references public.couples(id), entry_type text,
    owner_id uuid references public.profiles(id), created_by uuid references public.profiles(id), title text, is_all_day boolean default true);

  create function public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer) returns boolean
    language sql stable security definer set search_path to 'public' as $$
    select not exists (select 1 from public.calendar_entries where id = p_entry_id and is_all_day and p_offset_minutes <> 1440) $$;
  create function public.calendar_reminder_recipient_in_couple(p_couple_id uuid, p_recipient_id uuid) returns boolean
    language sql stable security definer set search_path to 'public' as $$
    select exists (select 1 from public.profiles where id = p_recipient_id and couple_id = p_couple_id) $$;
  revoke all on function public.calendar_reminder_offset_valid(uuid, integer), public.calendar_reminder_recipient_in_couple(uuid, uuid) from public;
  grant execute on function public.calendar_reminder_offset_valid(uuid, integer), public.calendar_reminder_recipient_in_couple(uuid, uuid) to authenticated, service_role;

  create table public.calendar_reminders (
    id uuid primary key default gen_random_uuid(), couple_id uuid references public.couples(id) on delete cascade,
    entry_id uuid references public.calendar_entries(id) on delete cascade, recipient_id uuid references public.profiles(id) on delete cascade,
    offset_minutes int check (offset_minutes = any (array[10, 30, 60, 1440])), requested_by uuid references public.profiles(id) on delete cascade,
    created_at timestamptz default now(), sent_at timestamptz,
    constraint calendar_reminders_allday_offset_check check (public.calendar_reminder_offset_valid(entry_id, offset_minutes)),
    constraint calendar_reminders_recipient_in_couple_check check (public.calendar_reminder_recipient_in_couple(couple_id, recipient_id)));

  alter table public.couples enable row level security;
  alter table public.profiles enable row level security;
  alter table public.shared_messages enable row level security;
  alter table public.shared_events enable row level security;
  alter table public.calendar_entries enable row level security;
  alter table public.calendar_reminders enable row level security;

  -- production policies (pg_policies, 2026-10-03)
  create policy couples_select_own on public.couples for select to authenticated using (id = private.current_couple_id());
  create policy couples_update_own on public.couples for update to authenticated using (id = private.current_couple_id()) with check (id = private.current_couple_id());
  create policy profiles_select_same_couple on public.profiles for select to authenticated using ((id = auth.uid()) or (couple_id = private.current_couple_id()));
  create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
  create policy messages_select on public.shared_messages for select to authenticated using (couple_id = private.current_couple_id());
  create policy messages_insert_own on public.shared_messages for insert to authenticated with check (
    (couple_id = private.current_couple_id()) and (sender_id = auth.uid())
    and exists (select 1 from public.profiles p where p.id = shared_messages.recipient_id and p.couple_id = private.current_couple_id()));
  create policy messages_update_recipient on public.shared_messages for update to authenticated
    using (recipient_id = auth.uid()) with check ((couple_id = private.current_couple_id()) and (recipient_id = auth.uid()));
  create policy shared_events_select on public.shared_events for select to authenticated using (couple_id = private.current_couple_id());
  create policy shared_events_insert_same_couple on public.shared_events for insert to authenticated with check ((couple_id = private.current_couple_id()) and (created_by = auth.uid()));
  create policy shared_events_update_same_couple on public.shared_events for update to authenticated using (couple_id = private.current_couple_id()) with check (couple_id = private.current_couple_id());
  create policy shared_events_delete_same_couple on public.shared_events for delete to authenticated using (couple_id = private.current_couple_id());
  create policy calendar_entries_select on public.calendar_entries for select to authenticated using (couple_id = private.current_couple_id());
  create policy calendar_reminders_select_couple on public.calendar_reminders for select to authenticated using (couple_id = private.current_couple_id());
  create policy calendar_reminders_insert_couple on public.calendar_reminders for insert to authenticated with check (
    (couple_id = private.current_couple_id()) and (requested_by = auth.uid())
    and exists (select 1 from public.profiles p where p.id = calendar_reminders.recipient_id and p.couple_id = p.couple_id)
    and exists (select 1 from public.calendar_entries e where e.id = calendar_reminders.entry_id and e.couple_id = e.couple_id
                and (e.entry_type = 'shared' or e.owner_id = auth.uid())));
  create policy calendar_reminders_update_requester on public.calendar_reminders for update to authenticated
    using ((couple_id = private.current_couple_id()) and (requested_by = auth.uid()))
    with check ((couple_id = private.current_couple_id()) and (requested_by = auth.uid()));
  create policy calendar_reminders_delete_requester on public.calendar_reminders for delete to authenticated
    using ((couple_id = private.current_couple_id()) and ((requested_by = auth.uid()) or (recipient_id = auth.uid())));

  -- production table ACLs (relacl, 2026-10-03)
  grant select, insert, update, delete, references, trigger, truncate on public.profiles, public.shared_messages, public.shared_events to anon, authenticated, service_role;
  grant select, insert, update, delete on public.calendar_reminders to authenticated;
  grant select, insert, update, delete, references, trigger, truncate on public.calendar_reminders to service_role;
  grant select on public.couples, public.calendar_entries to authenticated, service_role;
  grant update (name, started_on, home_photo_path) on public.couples to authenticated;

  insert into auth.users values ('${F}'), ('${B}'), ('${X}');
  insert into public.couples (id, name) values ('${C1}', 'US'), ('${C2}', 'foreign');
  insert into public.profiles (id, display_name, couple_id, role, avatar_path) values
    ('${F}', 'Francesco', '${C1}', 'francesco', 'f.jpg'),
    ('${B}', 'Beatrice', '${C1}', 'beatrice', 'b.jpg'),
    ('${X}', 'Foreign', '${C2}', 'francesco', 'x.jpg');
  insert into public.shared_messages (id, couple_id, sender_id, recipient_id, kind, body) values ('${MSG}', '${C1}', '${B}', '${F}', 'think', 'ti penso');
  insert into public.shared_events (id, couple_id, created_by, title, event_date) values ('${EV}', '${C1}', '${B}', 'Anniversario', '2026-04-21');
  insert into public.calendar_entries (id, couple_id, entry_type, owner_id, created_by, title) values
    ('${ENTRY_SHARED}', '${C1}', 'shared', null, '${F}', 'Cena'),
    ('${ENTRY_BEA}', '${C1}', 'personal', '${B}', '${B}', 'Bea privato');
  insert into public.calendar_reminders (id, couple_id, entry_id, recipient_id, offset_minutes, requested_by) values
    ('${REM}', '${C1}', '${ENTRY_SHARED}', '${F}', 1440, '${F}');
`;

async function fixture({ migrated }) {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(FIXTURE);
  if (migrated) await db.exec(fs.readFileSync(F1C_MIGRATION, 'utf8'));
  return db;
}

// Run `sql` as `uid` (authenticated) inside a transaction that is always rolled
// back, so attempts never leak into each other. Returns affected rows or the
// error code.
async function attempt(db, uid, sql, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    await db.exec(`set local role ${role}`);
    const res = await db.query(sql);
    return { ok: true, rows: res.affectedRows ?? res.rows.length, data: res.rows };
  } catch (error) {
    return { ok: false, code: error.code, message: error.message };
  } finally {
    await db.exec('rollback');
  }
}

const changed = (r) => r.ok && r.rows > 0;

// Table | operation | actor | authority column | statement. `before` is what
// the pre-F1C production grants allowed; after F1C every row must be refused.
const AUTHORITY_MATRIX = [
  ['profiles', 'UPDATE', F, 'couple_id', `update public.profiles set couple_id = null where id = '${F}'`],
  ['profiles', 'UPDATE', B, 'couple_id', `update public.profiles set couple_id = null where id = '${B}'`],
  ['profiles', 'UPDATE', F, 'couple_id (foreign couple)', `update public.profiles set couple_id = '${C2}', role = 'beatrice' where id = '${F}'`],
  ['profiles', 'UPDATE', B, 'couple_id (foreign couple)', `update public.profiles set couple_id = '${C2}' where id = '${B}'`],
  ['profiles', 'UPDATE', F, 'role', `update public.profiles set role = 'francesco' where id = '${F}'`],
  ['profiles', 'UPDATE', B, 'role', `update public.profiles set role = 'beatrice' where id = '${B}'`],
  ['profiles', 'UPDATE', F, 'display_name (unused by client)', `update public.profiles set display_name = 'x' where id = '${F}'`],
  ['shared_messages', 'UPDATE', F, 'sender_id/body/kind (as recipient)', `update public.shared_messages set sender_id = '${F}', body = 'forged', kind = 'normal' where id = '${MSG}'`],
  ['shared_messages', 'UPDATE', F, 'recipient_id', `update public.shared_messages set recipient_id = '${F}' where id = '${MSG}'`],
  ['shared_messages', 'UPDATE', F, 'couple_id', `update public.shared_messages set couple_id = '${C1}' where id = '${MSG}'`],
  ['shared_events', 'UPDATE', F, 'created_by', `update public.shared_events set created_by = '${F}' where id = '${EV}'`],
  ['shared_events', 'UPDATE', B, 'created_by', `update public.shared_events set created_by = '${F}' where id = '${EV}'`],
  ['shared_events', 'UPDATE', B, 'couple_id', `update public.shared_events set couple_id = '${C1}' where id = '${EV}'`],
  ['calendar_reminders', 'UPDATE', F, 'entry_id/recipient_id', `update public.calendar_reminders set entry_id = '${ENTRY_BEA}', recipient_id = '${B}' where id = '${REM}'`],
  ['calendar_reminders', 'INSERT', F, 'requested_by/recipient_id', `insert into public.calendar_reminders (couple_id, entry_id, recipient_id, offset_minutes, requested_by) values ('${C1}', '${ENTRY_SHARED}', '${B}', 1440, '${F}')`],
  ['calendar_reminders', 'DELETE', F, '(row)', `delete from public.calendar_reminders where id = '${REM}'`],
];

// Legitimate writes the shipped client performs (or must keep performing).
const LEGITIMATE = [
  ['profiles avatar (Francesco)', F, `update public.profiles set avatar_path = 'f2.jpg' where id = '${F}'`],
  ['profiles avatar (Beatrice)', B, `update public.profiles set avatar_path = 'b2.jpg' where id = '${B}'`],
  ['shared_events edit (creator)', B, `update public.shared_events set title = 'Anniversario 5', event_date = '2026-04-22', event_time = '20:00', location = 'Roma', note = 'n', recurs_yearly = true where id = '${EV}'`],
  ['shared_events edit (partner)', F, `update public.shared_events set title = 'Cena insieme' where id = '${EV}'`],
  ['shared_events insert', F, `insert into public.shared_events (couple_id, created_by, title, event_date) values ('${C1}', '${F}', 'Nuovo', '2026-05-01')`],
  ['shared_events delete', F, `delete from public.shared_events where id = '${EV}'`],
  ['shared_messages insert (think)', F, `insert into public.shared_messages (couple_id, sender_id, recipient_id, kind, body) values ('${C1}', '${F}', '${B}', 'think', 'ciao')`],
  ['couples relationship date', F, `update public.couples set started_on = '2026-04-21' where id = '${C1}'`],
];

test('F1C fixture reproduces the production holes before the migration', async () => {
  const db = await fixture({ migrated: false });
  try {
    for (const [table, op, actor, column, sql] of AUTHORITY_MATRIX) {
      if (table === 'profiles' && column === 'role') continue; // blocked only by the unique index while the couple is intact
      if (column.startsWith('display_name')) continue;
      const r = await attempt(db, actor, sql);
      assert.ok(changed(r), `pre-F1C ${table}.${op} ${column} by ${actor === F ? 'F' : 'B'} should succeed: ${r.code || ''} ${r.message || ''}`);
    }
    // Moving to another couple re-scopes current_couple_id(): the foreign couple becomes readable.
    await db.exec('begin');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [F]);
    await db.exec('set local role authenticated');
    await db.query(`update public.profiles set couple_id = '${C2}', role = 'beatrice' where id = '${F}'`);
    const { rows } = await db.query(`select name from public.couples`);
    assert.deepEqual(rows.map((r) => r.name), ['foreign']);
    await db.exec('rollback');
    // Role change once the couple slot is free.
    await db.exec('begin');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [F]);
    await db.exec('set local role authenticated');
    await db.query(`update public.profiles set couple_id = null where id = '${F}'`);
    const role = await db.query(`update public.profiles set role = 'beatrice' where id = '${F}'`);
    assert.equal(role.affectedRows, 1);
    await db.exec('rollback');
  } finally {
    await db.close();
  }
});

test('F1C: every authority mutation in the matrix is refused after the migration', async () => {
  const db = await fixture({ migrated: true });
  try {
    for (const [table, op, actor, column, sql] of AUTHORITY_MATRIX) {
      const r = await attempt(db, actor, sql);
      assert.equal(r.ok, false, `${table}.${op} ${column} by ${actor === F ? 'F' : 'B'} must be refused`);
      assert.equal(r.code, '42501', `${table}.${op} ${column}: refused by privilege (${r.message})`);
    }
  } finally {
    await db.close();
  }
});

test('F1C: the legitimate client writes still work for both partners', async () => {
  const db = await fixture({ migrated: true });
  try {
    for (const [label, actor, sql] of LEGITIMATE) {
      const r = await attempt(db, actor, sql);
      assert.ok(changed(r), `${label}: ${r.code || ''} ${r.message || ''}`);
    }
    // updated_at still maintained by the trigger on a column-scoped update.
    const r = await attempt(db, F, `update public.shared_events set note = 'x' where id = '${EV}' returning updated_at > created_at as touched`);
    assert.equal(r.data[0].touched, true);
  } finally {
    await db.close();
  }
});

test('F1C profiles: both partners read their profile, stay in their couple, cannot touch each other', async () => {
  const db = await fixture({ migrated: true });
  try {
    for (const [me, partner, role] of [[F, B, 'francesco'], [B, F, 'beatrice']]) {
      const read = await attempt(db, me, `select id, couple_id, role, avatar_path from public.profiles where id = '${me}'`);
      assert.deepEqual(read.data, [{ id: me, couple_id: C1, role, avatar_path: me === F ? 'f.jpg' : 'b.jpg' }]);
      const couple = await attempt(db, me, 'select private.current_couple_id() as c');
      assert.equal(couple.data[0].c, C1);
      // Partner row: RLS hides it from UPDATE even for the column that is grantable.
      const other = await attempt(db, me, `update public.profiles set avatar_path = 'evil.jpg' where id = '${partner}'`);
      assert.ok(other.ok && other.rows === 0);
      // Foreign profile: not visible, not updatable.
      const foreign = await attempt(db, me, `update public.profiles set avatar_path = 'evil.jpg' where id = '${X}'`);
      assert.ok(foreign.ok && foreign.rows === 0);
    }
  } finally {
    await db.close();
  }
});

test('F1C shared_messages / shared_events: foreign users cannot reach the couple rows', async () => {
  const db = await fixture({ migrated: true });
  try {
    const ev = await attempt(db, X, `update public.shared_events set title = 'owned' where id = '${EV}'`);
    assert.ok(ev.ok && ev.rows === 0);
    const del = await attempt(db, X, `delete from public.shared_events where id = '${EV}'`);
    assert.ok(del.ok && del.rows === 0);
    const msg = await attempt(db, X, `insert into public.shared_messages (couple_id, sender_id, recipient_id, kind, body) values ('${C1}', '${X}', '${F}', 'think', 'x')`);
    assert.equal(msg.code, '42501');
    const sel = await attempt(db, X, `select count(*)::int as n from public.shared_messages`);
    assert.equal(sel.data[0].n, 0);
  } finally {
    await db.close();
  }
});

test('F1C calendar_reminders: browser reads only; the service-role worker still marks sent_at', async () => {
  const db = await fixture({ migrated: true });
  try {
    const read = await attempt(db, F, `select id from public.calendar_reminders`);
    assert.equal(read.data.length, 1);
    const worker = await attempt(db, null, `update public.calendar_reminders set sent_at = now() where id = '${REM}'`, 'service_role');
    assert.ok(changed(worker), `${worker.code || ''} ${worker.message || ''}`);
    // Deleting a calendar entry still cascades to its reminders (RI runs as owner).
    await db.exec(`alter table public.calendar_entries owner to postgres; grant delete on public.calendar_entries to authenticated;
      create policy calendar_entries_delete_shared on public.calendar_entries for delete to authenticated using (couple_id = private.current_couple_id() and created_by = auth.uid())`);
    const cascade = await attempt(db, F, `delete from public.calendar_entries where id = '${ENTRY_SHARED}'`);
    assert.ok(changed(cascade), `${cascade.code || ''} ${cascade.message || ''}`);
  } finally {
    await db.close();
  }
});

test('F1C migration: grants only, idempotent, self-check guards the boundary', async () => {
  const sql = fs.readFileSync(F1C_MIGRATION, 'utf8');
  const code = sql.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''");
  assert.doesNotMatch(code, /\b(drop|delete\s+from|insert\s+into|update\s+public|truncate|alter|create)\b|policy|security definer|service_role/i);
  const db = await fixture({ migrated: true });
  try {
    await db.exec(sql); // idempotent
    const loose = await fixture({ migrated: false });
    try {
      await assert.rejects(loose.exec(sql.slice(sql.indexOf('do $$'))), /F1C: public\.profiles\.couple_id is still updatable/);
    } finally {
      await loose.close();
    }
  } finally {
    await db.close();
  }
});

test('F1C client contract: the shipped client writes only the columns F1C keeps', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const runtime = read('scripts/build-cloudflare-pages.mjs').match(/const RUNTIME_FILES = \[([\s\S]*?)\];/)[1];
  const files = [...runtime.matchAll(/'([^']+\.(?:js|html))'/g)].map((m) => m[1]);
  const writes = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/\.from\(\s*['"`](profiles|shared_messages|shared_events|calendar_reminders)['"`]\s*\)\s*\.(insert|update|upsert|delete)\(([^)]*)\)/g)) {
      writes.push(`${m[1]}.${m[2]}(${m[3].replace(/\s+/g, '')})`);
    }
  }
  assert.deepEqual(writes.sort(), [
    'profiles.update({avatar_path:path})',
    'shared_events.delete()',
    'shared_events.insert({...payload,couple_id:window.usProfile.couple_id,created_by:window.usProfile.id})',
    'shared_events.update(payload)',
  ]);
  const events = read('events.js');
  const payload = events.match(/const payload=\{([^}]*)\}/)[1];
  // Keys of the object literal, including shorthand properties (`{title,…}`).
  const keys = payload.split(/,(?![^(]*\))/).map((p) => p.trim().match(/^(\w+)/)[1]).sort();
  assert.deepEqual(keys, ['event_date', 'event_time', 'location', 'note', 'recurs_yearly', 'title'],
    'shared_events editor payload must stay inside the F1C column grant');
});
