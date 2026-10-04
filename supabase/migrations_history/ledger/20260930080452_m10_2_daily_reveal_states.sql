-- Production ledger 20260930080452 m10_2_daily_reveal_states: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 7b90338129b238b5f75dd7c2ca0c81e9; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M10.2 — Daily Question reveal: stato canonico PERSONALE (ricevuta, avviso
-- nascosto, reazione alla risposta del partner).
--
-- Prepared only: NON applicare in produzione da questa missione.
--
-- Autorità riusate, mai duplicate:
--   public.get_daily_state(uuid)              = risposte e reveal (invariata)
--   private.daily_question_reveal_ready(uuid) = "both_answered" via get_daily_state
--   private.current_couple_id()               = coppia del chiamante
--   push `daily_answer` (send-web-push)       = "Le vostre risposte sono pronte ♡" (invariata)
--
-- Ownership: coppia + ruolo relazionale (francesco|beatrice), NON user_id/UID.
-- Stessa scelta di daily_question_outcomes (M3): claim_us_role sostituisce
-- l'UID del profilo durante un re-pair, mentre il ruolo resta stabile. Così
-- ricevuta/avviso/reazione sopravvivono al re-pair senza toccare claim_us_role
-- e senza foreign key verso profili che verrebbero cancellati. Il ruolo è
-- sempre derivato dal server (profiles), mai passato dal client.
--
-- Nessun client scrive o legge la tabella direttamente: tutto passa da RPC
-- SECURITY DEFINER con controllo esplicito di auth, coppia e reveal. Nessuna
-- push di reazione: la reazione si vede aprendo il reveal.
--
-- Additiva, forward-only: nuova tabella + funzioni. Non tocca daily_questions,
-- daily_answers, get_daily_state, RLS esistenti né migration già applicate.

create table public.daily_question_reveal_states (
  couple_id uuid not null references public.couples(id) on delete cascade,
  question_id uuid not null references public.daily_questions(id) on delete cascade,
  actor_role text not null check (actor_role in ('francesco', 'beatrice')),
  reaction text check (reaction is null or reaction in ('heart', 'angry', 'cry')),
  reveal_seen_at timestamptz,
  notice_dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (couple_id, question_id, actor_role)
);

create index daily_question_reveal_states_question_idx
  on public.daily_question_reveal_states (question_id);

-- Deny-by-default: nessuna policy, nessun grant ai ruoli client.
alter table public.daily_question_reveal_states enable row level security;
alter table public.daily_question_reveal_states force row level security;
revoke all on public.daily_question_reveal_states from public, anon, authenticated;

comment on table public.daily_question_reveal_states is
  'M10.2: per-person (couple + role) Daily reveal receipt, dismissed-notice flag and reaction to the partner answer. RPC-only access.';

-- Contesto del chiamante: auth, coppia, ruolo e reveal pronto (delegato a
-- get_daily_state tramite l'helper M3). Solo per le RPC qui sotto.
create or replace function private.daily_reveal_context(target_question_id uuid)
returns table (caller_couple uuid, caller_role text, ready boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_couple uuid;
  actor_role text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if target_question_id is null then
    raise exception using errcode = '22004', message = 'question id required';
  end if;

  select profile.couple_id, profile.role
    into current_couple, actor_role
    from public.profiles as profile
   where profile.id = auth.uid()
     and profile.couple_id is not null;

  if current_couple is null or actor_role not in ('francesco', 'beatrice') then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;

  return query select current_couple, actor_role, private.daily_question_reveal_ready(target_question_id);
end;
$$;

revoke all on function private.daily_reveal_context(uuid) from public, anon, authenticated;

-- Forma unica restituita da tutte le RPC. Mai testo di risposta: quello resta
-- di get_daily_state. Prima del reveal non espone nulla.
create or replace function private.daily_reveal_meta(target_question_id uuid, current_couple uuid, caller_role text, ready boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'question_id', target_question_id,
    'both_answered', ready,
    'my_reveal_seen_at', case when ready then mine.reveal_seen_at end,
    'my_notice_dismissed_at', case when ready then mine.notice_dismissed_at end,
    'my_reaction', case when ready then mine.reaction end,
    'partner_reaction', case when ready then partner.reaction end
  )
  from (select 1) as anchor
  left join public.daily_question_reveal_states as mine
    on mine.couple_id = current_couple and mine.question_id = target_question_id and mine.actor_role = daily_reveal_meta.caller_role
  left join public.daily_question_reveal_states as partner
    on partner.couple_id = current_couple and partner.question_id = target_question_id and partner.actor_role <> daily_reveal_meta.caller_role;
$$;

revoke all on function private.daily_reveal_meta(uuid, uuid, text, boolean) from public, anon, authenticated;

create or replace function public.get_daily_reveal_meta(target_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
begin
  select * into ctx from private.daily_reveal_context(target_question_id);
  return private.daily_reveal_meta(target_question_id, ctx.caller_couple, ctx.caller_role, ctx.ready);
end;
$$;

create or replace function public.mark_daily_reveal_seen(target_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
begin
  select * into ctx from private.daily_reveal_context(target_question_id);
  if not ctx.ready then
    raise exception using errcode = '42501', message = 'daily question reveal is not ready';
  end if;

  insert into public.daily_question_reveal_states as state (couple_id, question_id, actor_role, reveal_seen_at)
  values (ctx.caller_couple, target_question_id, ctx.caller_role, now())
  on conflict (couple_id, question_id, actor_role) do update
    set reveal_seen_at = coalesce(state.reveal_seen_at, excluded.reveal_seen_at),
        updated_at = now();

  return private.daily_reveal_meta(target_question_id, ctx.caller_couple, ctx.caller_role, true);
end;
$$;

-- "Nascondi avviso": NON è una ricevuta di lettura (reveal_seen_at resta com'è).
create or replace function public.dismiss_daily_reveal_notice(target_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
begin
  select * into ctx from private.daily_reveal_context(target_question_id);
  if not ctx.ready then
    raise exception using errcode = '42501', message = 'daily question reveal is not ready';
  end if;

  insert into public.daily_question_reveal_states as state (couple_id, question_id, actor_role, notice_dismissed_at)
  values (ctx.caller_couple, target_question_id, ctx.caller_role, now())
  on conflict (couple_id, question_id, actor_role) do update
    set notice_dismissed_at = coalesce(state.notice_dismissed_at, excluded.notice_dismissed_at),
        updated_at = now();

  return private.daily_reveal_meta(target_question_id, ctx.caller_couple, ctx.caller_role, true);
end;
$$;

-- Reazione alla risposta del PARTNER (target implicito: nessun user/couple id
-- dal client). Un solo valore per persona e domanda; null la rimuove.
create or replace function public.set_daily_answer_reaction(target_question_id uuid, target_reaction text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
begin
  if target_reaction is not null and target_reaction not in ('heart', 'angry', 'cry') then
    raise exception using errcode = '22023', message = 'invalid daily reaction';
  end if;

  select * into ctx from private.daily_reveal_context(target_question_id);
  if not ctx.ready then
    raise exception using errcode = '42501', message = 'daily question reveal is not ready';
  end if;

  insert into public.daily_question_reveal_states as state (couple_id, question_id, actor_role, reaction)
  values (ctx.caller_couple, target_question_id, ctx.caller_role, target_reaction)
  on conflict (couple_id, question_id, actor_role) do update
    set reaction = excluded.reaction,
        updated_at = now();

  return private.daily_reveal_meta(target_question_id, ctx.caller_couple, ctx.caller_role, true);
end;
$$;

revoke all on function public.get_daily_reveal_meta(uuid) from public, anon;
revoke all on function public.mark_daily_reveal_seen(uuid) from public, anon;
revoke all on function public.dismiss_daily_reveal_notice(uuid) from public, anon;
revoke all on function public.set_daily_answer_reaction(uuid, text) from public, anon;
grant execute on function public.get_daily_reveal_meta(uuid) to authenticated;
grant execute on function public.mark_daily_reveal_seen(uuid) to authenticated;
grant execute on function public.dismiss_daily_reveal_notice(uuid) to authenticated;
grant execute on function public.set_daily_answer_reaction(uuid, text) to authenticated;

comment on function public.get_daily_reveal_meta(uuid) is
  'M10.2: caller-only reveal meta (seen/dismissed/reactions). Never returns answer text; nothing before both answered.';
comment on function public.mark_daily_reveal_seen(uuid) is
  'M10.2: caller opened the reveal. Idempotent; requires both answered; independent from dismiss.';
comment on function public.dismiss_daily_reveal_notice(uuid) is
  'M10.2: caller hides the Oggi "Risposte pronte" notice. Idempotent; does NOT mark the reveal as seen.';
comment on function public.set_daily_answer_reaction(uuid, text) is
  'M10.2: caller reaction (heart|angry|cry, null clears) to the PARTNER answer. Requires both answered.';;
