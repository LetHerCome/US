'use strict';
// Shared PGlite fixture for the progression migrations (V1 → Rewards V2).
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS = [
  'supabase/migrations/20261002181500_us_progression_v1.sql',
  'supabase/migrations/20261002181501_progression_reward_toggle_unequip.sql',
  'supabase/migrations/20261003090000_progression_rewards_v2.sql'
];
const readMigration = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const uuid = (() => { let n = 1; return () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`; })();

const FIXTURE = `
create role anon;
create role authenticated;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.couples(id uuid primary key, bond_xp integer not null default 0);
create table public.profiles(id uuid primary key, couple_id uuid references public.couples(id), role text, created_at timestamptz default now());
create function private.current_couple_id() returns uuid language sql stable security definer set search_path='' as $$
  select p.couple_id from public.profiles p where p.id=auth.uid()
$$;

create table public.bond_weekly_quests(
 id uuid primary key, couple_id uuid not null references public.couples(id), xp smallint not null,
 completed_at timestamptz
);
create table public.shared_event_completions(
 id uuid primary key, event_id uuid not null, couple_id uuid not null references public.couples(id),
 occurrence_date date not null, completed_by uuid not null references public.profiles(id),
 xp_awarded integer not null, completed_at timestamptz not null default now()
);
create table public.relationship_milestones(
 id uuid primary key, couple_id uuid not null references public.couples(id), milestone_date date not null,
 kind text not null, months_together integer not null, xp_awarded integer not null, awarded_at timestamptz not null default now()
);
create table public.game_sessions(
 id uuid primary key, couple_id uuid not null references public.couples(id), completed_at timestamptz
);
create table public.daily_answers(
 id uuid primary key default gen_random_uuid(), question_id uuid not null, user_id uuid not null references public.profiles(id),
 couple_id uuid not null references public.couples(id), answer text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(question_id,user_id)
);
create table public.shared_messages(
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
 sender_id uuid not null references public.profiles(id), recipient_id uuid not null references public.profiles(id),
 kind text not null default 'normal', created_at timestamptz not null default now()
);
create table public.moments(
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
`;

async function fresh({ upTo = MIGRATIONS.length } = {}) {
  const db = new PGlite();
  await db.exec(FIXTURE);
  for (const file of MIGRATIONS.slice(0, upTo)) await db.exec(readMigration(file));
  const c = uuid(), f = uuid(), b = uuid();
  await db.query('insert into public.couples(id,bond_xp) values ($1,0)', [c]);
  await db.query("insert into public.profiles(id,couple_id,role) values ($1,$3,'francesco'),($2,$3,'beatrice')", [f, b, c]);
  return { db, c, f, b };
}

async function asUser(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid || ''}',false);`);
  try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }
}

const state = (db, uid) => asUser(db, uid, () => db.query('select public.get_progression_v1() s').then((r) => r.rows[0].s));
const equip = (db, uid, id) => asUser(db, uid, () => db.query('select public.equip_progression_reward($1) s', [id]).then((r) => r.rows[0].s));

module.exports = { MIGRATIONS, readMigration, uuid, fresh, asUser, state, equip };
