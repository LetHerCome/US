// M12B.4 test stand-ins for the production-only Daily Question authority.
// daily_questions / daily_answers / get_daily_state predate the migration
// history, so the tests declare them with the shape recorded in
// docs/milestones/us-vnext-m3-daily-question.md (production DDL and RLS) and
// the facts verified in production for M12B:
//   - daily_answers(id, question_id, user_id, couple_id, answer, created_at,
//     updated_at), unique (question_id, user_id); the client reads only its
//     own row (RLS user_id = auth.uid());
//   - get_daily_state(uuid) is SECURITY DEFINER and returns my_answer,
//     partner_has_answer, both_answered and partner_answer, the last one only
//     once both partners answered.
// The answer UPDATE policy stays open after the reveal (worst case for the
// snapshot: the server rule is not known), so the tests prove a keepsake does
// not follow later edits.
const DAILY_FIXTURE = `
  create or replace function private.current_couple_id() returns uuid
  language sql stable security definer set search_path = '' as $$
    select p.couple_id from public.profiles p where p.id = auth.uid()
  $$;
  grant usage on schema private to authenticated;
  grant execute on function private.current_couple_id() to authenticated;

  drop table if exists public.daily_answers;
  drop table if exists public.daily_questions cascade;
  create table public.daily_questions (
    id uuid primary key default gen_random_uuid(), question_date date not null unique, question text not null,
    category text not null default 'daily', created_at timestamptz not null default now());
  alter table public.daily_questions enable row level security;
  create policy daily_questions_read on public.daily_questions for select to authenticated using (true);
  grant select on public.daily_questions to authenticated;

  create table public.daily_answers (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.daily_questions(id) on delete cascade,
    user_id uuid not null, couple_id uuid not null references public.couples(id) on delete cascade,
    answer text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (question_id, user_id));
  alter table public.daily_answers enable row level security;
  create policy daily_answers_select_own on public.daily_answers for select to authenticated using (user_id = auth.uid());
  create policy daily_answers_insert_own on public.daily_answers for insert to authenticated
    with check (user_id = auth.uid() and couple_id = private.current_couple_id());
  create policy daily_answers_update_own on public.daily_answers for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid() and couple_id = private.current_couple_id());
  grant select, insert, update on public.daily_answers to authenticated;

  create or replace function public.get_daily_state(target_question_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
  declare me uuid := auth.uid(); c uuid; mine text; partner text; answered integer;
  begin
    if me is null then raise exception 'authentication required'; end if;
    select p.couple_id into c from public.profiles p where p.id = me;
    select a.answer into mine from public.daily_answers a where a.question_id = target_question_id and a.user_id = me;
    select count(*) into answered from public.daily_answers a where a.question_id = target_question_id and a.couple_id = c;
    select a.answer into partner from public.daily_answers a where a.question_id = target_question_id and a.couple_id = c and a.user_id <> me limit 1;
    return jsonb_build_object('my_answer', mine, 'partner_has_answer', partner is not null, 'both_answered', answered >= 2,
      'partner_answer', case when answered >= 2 then partner end);
  end $$;
  revoke all on function public.get_daily_state(uuid) from public, anon;
  grant execute on function public.get_daily_state(uuid) to authenticated;
`;

const M12B4 = 'supabase/migrations_history/20261001093123_m12b_4_daily_question_keepsakes.sql';

module.exports = { DAILY_FIXTURE, M12B4 };
