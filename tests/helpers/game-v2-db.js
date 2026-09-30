// Game V2 test database: an isolated PGlite with the minimal Supabase surface
// (auth.uid(), roles, couples/profiles) plus the real M11A, M11A.1 and Game
// V2 migrations from supabase/migrations. Nothing here touches production.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const GAME_MIGRATIONS = fs.readdirSync(MIGRATIONS)
  .filter((f) => /^20260930(105724_m11a_|121312_m11a_1_|\d{6}_m11[b-f]_)/.test(f))
  .sort();

// Production-shaped stand-ins for tables the context adapters and push
// functions read (vault / pg_cron / pg_net as in the M10C test). Only the
// columns the repository already relies on are declared.
const FIXTURE = `
  create role authenticated; create role anon; create role service_role;
  grant usage on schema public to authenticated, anon, service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  create table public.couples (id uuid primary key, bond_xp integer not null default 0);
  create table public.profiles (
    id uuid primary key, couple_id uuid references public.couples(id), role text, display_name text,
    unique (couple_id, role)
  );
  create table public.calendar_entries (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
    entry_type text not null, owner_id uuid, created_by uuid, title text not null, description text,
    location text, is_all_day boolean not null default false, starts_at timestamptz, ends_at timestamptz,
    start_date date, end_date date, visibility text not null default 'full',
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table public.bucket_items (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
    created_by uuid, title text not null, completed boolean not null default false, completed_at timestamptz,
    created_at timestamptz not null default now(), note text, link_url text, status text not null default 'idea',
    calendar_entry_id uuid, updated_at timestamptz not null default now()
  );
  create table public.moments (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
    created_by uuid, storage_path text, caption text, moment_date date, created_at timestamptz not null default now()
  );
  create table public.left_for_you (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
    sender_id uuid, recipient_id uuid, body text, created_at timestamptz not null default now()
  );
  create table public.conserva_contributions (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
    source_item_id uuid not null references public.left_for_you(id), source_sender_id uuid, conserved_by uuid,
    created_at timestamptz not null default now()
  );
  create table public.daily_questions (id uuid primary key default gen_random_uuid(), question_date date, question text);
  create table public.daily_answers (id uuid primary key default gen_random_uuid(), question_id uuid, couple_id uuid, user_id uuid, answer text);
  create schema vault;
  create table vault.secrets (name text primary key, secret text);
  create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(value text, secret_name text) returns uuid language sql as $$
    insert into vault.secrets values (secret_name, value); select gen_random_uuid();
  $$;
  create function public.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat('ab', n), 'hex') $$;
  create schema cron;
  create table cron.job (jobname text primary key, schedule text, command text);
  create function cron.schedule(job_name text, job_schedule text, job_command text) returns bigint language sql as $$
    insert into cron.job values (job_name, job_schedule, job_command); select 1::bigint;
  $$;
  create schema net;
  create table net.calls (url text, headers jsonb, body jsonb);
  create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$
    insert into net.calls values (url, headers, body); select 1::bigint;
  $$;
  create table public.notification_preferences (
    user_id uuid primary key, think boolean not null default true, today boolean not null default true,
    bond boolean not null default true, relationship boolean not null default true, left_for_you boolean not null default true,
    updated_at timestamptz not null default now()
  );
`;

const id = () => randomUUID();

async function createDb({ upTo = null } = {}) {
  const db = new PGlite();
  await db.exec(FIXTURE);
  for (const file of GAME_MIGRATIONS) {
    if (upTo && file.localeCompare(upTo) > 0) break;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

async function couple(db) {
  const c = id(), f = id(), b = id();
  await db.exec(`insert into public.couples(id) values ('${c}');
    insert into public.profiles(id, couple_id, role, display_name) values ('${f}','${c}','francesco','Francesco'),('${b}','${c}','beatrice','Beatrice');`);
  return { c, f, b };
}

// Pins private.game_v2_clock() so week/cooldown logic is deterministic.
async function setClock(db, iso) {
  await db.exec(`create or replace function private.game_v2_clock() returns timestamptz language sql stable set search_path = '' as $$ select '${iso}'::timestamptz $$;`);
}

async function as(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

async function readOnly(db, uid, fn) {
  return as(db, uid, async () => {
    await db.exec('begin read only');
    try { return await fn(); } finally { await db.exec('rollback'); }
  });
}

const rpc = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]?.r;

module.exports = { ROOT, GAME_MIGRATIONS, FIXTURE, createDb, couple, setClock, as, readOnly, rpc, id };

// Answers every item of a session for one partner and finalizes that side.
async function playSide(db, uid, sessionId, pick = () => 0) {
  return as(db, uid, async () => {
    let state = await rpc(db, 'select public.get_game_session($1::uuid) r', [sessionId]);
    for (const item of state.items) {
      const choice = item.answer_kind === 'choice';
      state = await rpc(db, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
        [sessionId, item.id, choice ? null : `Risposta ${item.position}`, choice ? pick(item) : null]);
    }
    return rpc(db, 'select public.complete_game_session_side($1::uuid) r', [sessionId]);
  });
}

const startRound = (db, uid, family, requestId = id()) =>
  as(db, uid, () => rpc(db, 'select public.start_game_round($1::text, $2::uuid) r', [family, requestId]));

const createWeekly = (db, uid, { requestId = id(), text = 'Qual è la cosa che ti ha fatto ridere di più questa settimana?', kind = 'open', options = [], families = ['scopritevi'] } = {}) =>
  as(db, uid, () => rpc(db, 'select public.create_weekly_question($1::uuid,$2::text,$3::text,$4::jsonb,$5::text[]) r',
    [requestId, text, kind, JSON.stringify(options), families]));

module.exports.playSide = playSide;
module.exports.startRound = startRound;
module.exports.createWeekly = createWeekly;
