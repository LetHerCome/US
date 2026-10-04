-- Production ledger 20260818181951 add_private_pairing_and_seed: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 88729e86176a7a295d106938543bdc09; 2 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  role text not null check (role in ('francesco','beatrice')),
  code_hash text not null unique,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique(couple_id, role)
);

alter table public.couple_invites enable row level security;
-- No direct client policies by design: invite codes are consumed only via the security-definer RPC below.

create or replace function public.join_us(invite_code text, chosen_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.couple_invites%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select * into inv
  from public.couple_invites
  where code_hash = encode(digest(invite_code, 'sha256'), 'hex')
  for update;

  if inv.id is null then
    raise exception 'Invalid invite code';
  end if;

  if inv.used_by is not null and inv.used_by <> uid then
    raise exception 'Invite already used';
  end if;

  if exists(select 1 from public.profiles where id = uid and couple_id is distinct from inv.couple_id) then
    raise exception 'User already belongs to another couple';
  end if;

  if exists(select 1 from public.profiles where couple_id = inv.couple_id and role = inv.role and id <> uid) then
    raise exception 'Role already claimed';
  end if;

  insert into public.profiles(id, display_name, couple_id, role)
  values (uid, nullif(trim(chosen_name), ''), inv.couple_id, inv.role)
  on conflict (id) do update
    set display_name = excluded.display_name,
        couple_id = excluded.couple_id,
        role = excluded.role;

  update public.couple_invites
  set used_by = uid, used_at = now()
  where id = inv.id;

  return jsonb_build_object('couple_id', inv.couple_id, 'role', inv.role);
end;
$$;

revoke all on function public.join_us(text,text) from public;
grant execute on function public.join_us(text,text) to authenticated;

-- Seed the private couple space.
insert into public.couples(name, started_on)
values ('Francesco + Beatrice', date '2026-04-21');

-- Seed the two private pairing codes using hashes only.
with c as (
  select id from public.couples where name='Francesco + Beatrice' order by created_at desc limit 1
)
insert into public.couple_invites(couple_id, role, code_hash)
select id, 'francesco', encode(digest('<redacted>', 'sha256'),'hex') from c
union all
select id, 'beatrice', encode(digest('<redacted>', 'sha256'),'hex') from c;

-- Seed quiz categories currently used by the V2 UI.
insert into public.quiz_sets(slug,title,category) values
('preferenze','Preferenze','preferenze'),
('noi','Noi due','noi'),
('quotidiano','Quotidiano','quotidiano'),
('futuro','Futuro','futuro');

insert into public.daily_questions(question_date, question, category)
values (current_date, 'Qual è una cosa che vorresti rifare insieme per la prima volta?', 'noi')
on conflict (question_date) do nothing;;
