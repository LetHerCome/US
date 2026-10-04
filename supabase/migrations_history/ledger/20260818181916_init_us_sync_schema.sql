-- Production ledger 20260818181916 init_us_sync_schema: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 165f048a780836692989c55122c77c84; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create extension if not exists pgcrypto;

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'US.',
  started_on date not null default date '2026-04-21',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  couple_id uuid references public.couples(id) on delete cascade,
  role text not null check (role in ('francesco','beatrice')),
  created_at timestamptz not null default now()
);

create unique index profiles_one_role_per_couple on public.profiles(couple_id, role) where couple_id is not null;

create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  question_date date not null unique,
  question text not null,
  category text not null default 'daily',
  created_at timestamptz not null default now()
);

create table public.daily_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(question_id, user_id)
);

create table public.quiz_sets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.quiz_sets(id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  unique(set_id, position)
);

create table public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.quiz_sets(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  answer_index smallint not null check (answer_index between 0 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(question_id, user_id)
);

create table public.bucket_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.shared_messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'normal' check (kind in ('normal','open_when','poke','scheduled')),
  title text,
  body text not null,
  unlock_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.moods (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null,
  note text,
  mood_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique(user_id, mood_date)
);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.daily_questions enable row level security;
alter table public.daily_answers enable row level security;
alter table public.quiz_sets enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_responses enable row level security;
alter table public.bucket_items enable row level security;
alter table public.shared_messages enable row level security;
alter table public.moods enable row level security;
alter table public.activity enable row level security;

create policy couples_select_own on public.couples
for select to authenticated
using (id = public.current_couple_id());

create policy profiles_select_same_couple on public.profiles
for select to authenticated
using (id = auth.uid() or couple_id = public.current_couple_id());

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy daily_questions_read on public.daily_questions
for select to authenticated using (true);

create policy daily_answers_insert_own on public.daily_answers
for insert to authenticated
with check (user_id = auth.uid() and couple_id = public.current_couple_id());

create policy daily_answers_update_own on public.daily_answers
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and couple_id = public.current_couple_id());

create policy daily_answers_read_same_couple on public.daily_answers
for select to authenticated
using (couple_id = public.current_couple_id());

create policy quiz_sets_read on public.quiz_sets
for select to authenticated using (true);

create policy quiz_questions_read on public.quiz_questions
for select to authenticated using (true);

create policy quiz_responses_insert_own on public.quiz_responses
for insert to authenticated
with check (user_id = auth.uid() and couple_id = public.current_couple_id());

create policy quiz_responses_update_own on public.quiz_responses
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and couple_id = public.current_couple_id());

create policy quiz_responses_read_same_couple on public.quiz_responses
for select to authenticated
using (couple_id = public.current_couple_id());

create policy bucket_read_same_couple on public.bucket_items
for select to authenticated using (couple_id = public.current_couple_id());
create policy bucket_insert_same_couple on public.bucket_items
for insert to authenticated with check (couple_id = public.current_couple_id() and created_by = auth.uid());
create policy bucket_update_same_couple on public.bucket_items
for update to authenticated using (couple_id = public.current_couple_id()) with check (couple_id = public.current_couple_id());
create policy bucket_delete_same_couple on public.bucket_items
for delete to authenticated using (couple_id = public.current_couple_id());

create policy messages_read_own_couple on public.shared_messages
for select to authenticated
using (couple_id = public.current_couple_id() and (sender_id = auth.uid() or recipient_id = auth.uid()));
create policy messages_insert_own on public.shared_messages
for insert to authenticated
with check (couple_id = public.current_couple_id() and sender_id = auth.uid());
create policy messages_update_recipient on public.shared_messages
for update to authenticated
using (recipient_id = auth.uid())
with check (couple_id = public.current_couple_id() and recipient_id = auth.uid());

create policy moods_read_same_couple on public.moods
for select to authenticated using (couple_id = public.current_couple_id());
create policy moods_insert_own on public.moods
for insert to authenticated with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy moods_update_own on public.moods
for update to authenticated using (user_id = auth.uid()) with check (couple_id = public.current_couple_id() and user_id = auth.uid());

create policy activity_read_same_couple on public.activity
for select to authenticated using (couple_id = public.current_couple_id());
create policy activity_insert_same_couple on public.activity
for insert to authenticated with check (couple_id = public.current_couple_id() and actor_id = auth.uid());

create index daily_answers_couple_question_idx on public.daily_answers(couple_id, question_id);
create index quiz_responses_couple_set_idx on public.quiz_responses(couple_id, set_id);
create index bucket_items_couple_idx on public.bucket_items(couple_id, created_at desc);
create index messages_couple_idx on public.shared_messages(couple_id, created_at desc);
create index activity_couple_idx on public.activity(couple_id, created_at desc);;
