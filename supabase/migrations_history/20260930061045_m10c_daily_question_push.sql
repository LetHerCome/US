-- M10C — Domanda del giorno: push di sistema quando nasce la domanda del giorno.
--
-- Prepared only: NON applicare in produzione da questa missione.
--
-- Ogni 10 minuti il cron `us-daily-question-push`:
--   1) materializza la domanda del giorno Europe/Rome con la stessa autorità
--      M9E (private.materialize_daily_question, idempotente), così funziona
--      anche se nessuno apre US;
--   2) chiama l'Edge Function `daily-question-push-worker` con una chiave cron
--      DEDICATA generata nel vault (mai nel repo, letta solo da service_role).
-- Il worker notifica ogni membro idoneo una sola volta per daily_questions.id
-- (dedupe `daily-question:<question id>:<user id>` in push_event_log) e decide
-- lui la finestra oraria di invio. Nessun client può chiedere questa push.
--
-- È una notifica di SISTEMA: push_event_log.sender_id resta null, nessun
-- mittente finto. La colonna era valorizzata da tutti gli eventi precedenti;
-- se in produzione è NOT NULL il vincolo viene rilassato (le righe esistenti
-- restano invariate, nessun altro vincolo toccato).
--
-- Additive/forward-only. Non tocca RLS, grant client, daily_questions,
-- daily_answers, la reveal authority, la template bank, push_subscriptions o
-- notification_preferences.

-- 1) Chiave cron dedicata.
create or replace function public.get_internal_daily_question_push_cron_key()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'us_daily_question_push_cron_key' limit 1
$$;

revoke all on function public.get_internal_daily_question_push_cron_key() from public, anon, authenticated;
grant execute on function public.get_internal_daily_question_push_cron_key() to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'us_daily_question_push_cron_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'us_daily_question_push_cron_key'
    );
  end if;
end
$$;

-- 2) Il worker legge la domanda del giorno (id/data) e chi ha già risposto (solo user_id).
grant select on table public.daily_questions to service_role;
grant select on table public.daily_answers to service_role;

-- 3) Evento di sistema senza mittente.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'push_event_log'
       and column_name = 'sender_id'
       and is_nullable = 'NO'
  ) then
    alter table public.push_event_log alter column sender_id drop not null;
  end if;
end
$$;

-- 4) Schedulazione idempotente: materializza, poi chiama il worker.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'us-daily-question-push') then
    perform cron.schedule(
      'us-daily-question-push',
      '*/10 * * * *',
      $cron$
        with today as (
          select private.materialize_daily_question(private.daily_question_day(now())) as question
        )
        select net.http_post(
          url := 'https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/daily-question-push-worker',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_daily_question_push_cron_key' limit 1)
          ),
          body := '{}'::jsonb
        )
        from today;
      $cron$
    );
  end if;
end
$$;
