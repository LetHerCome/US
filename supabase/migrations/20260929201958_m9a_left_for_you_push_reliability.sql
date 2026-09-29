-- M9A — Lasciato per te: ogni nuovo item notifica, in modo affidabile.
--
-- Prepared only: NON applicare in produzione da questa missione.
--
-- 1) Rete di sicurezza server-side per le push.
--    Il percorso veloce resta invariato (il mittente chiama send-web-push
--    subito dopo l'insert). Se quella chiamata si perde, la riga resta in
--    public.left_for_you senza chiave `left-for-you:<id>` in push_event_log:
--    il worker `left-for-you-push-worker`, schedulato ogni minuto, la
--    notifica con la stessa chiave (una notifica logica per riga, nessun
--    duplicato). Stesso schema del worker dei reminder M6D: chiave cron
--    DEDICATA generata nel vault, mai nel repo, letta solo da service_role.
--
-- 2) Musica ripetibile.
--    Il vincolo unique(media_path) su tutta la tabella impediva di lasciare
--    due volte lo stesso brano Spotify (media_path = URL canonico del brano):
--    il secondo insert falliva e quindi non partiva nessuna notifica.
--    L'unicità serve solo ai media caricati nel bucket (ownership e cleanup
--    dello storage), quindi resta tale e quale per photo/audio/video.
--
-- Additive/forward-only. Non tocca RLS, grant client, push_subscriptions,
-- notification_preferences o il contenuto delle righe esistenti.

-- 1a) Chiave cron dedicata.
create or replace function public.get_internal_left_for_you_push_cron_key()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'us_left_for_you_push_cron_key' limit 1
$$;

revoke all on function public.get_internal_left_for_you_push_cron_key() from public, anon, authenticated;
grant execute on function public.get_internal_left_for_you_push_cron_key() to service_role;

-- Il worker legge le righe recenti non ancora viste (solo id/tempi/partecipanti).
grant select on table public.left_for_you to service_role;

-- Il worker cerca le righe recenti e non viste per created_at.
create index if not exists left_for_you_unseen_created_idx
  on public.left_for_you (created_at)
  where seen_at is null;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'us_left_for_you_push_cron_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'us_left_for_you_push_cron_key'
    );
  end if;
end
$$;

-- 1b) Schedulazione idempotente (ogni minuto; il worker lascia 45 secondi al
--     percorso veloce e rinuncia dopo 15 minuti).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'us-left-for-you-push-sweep') then
    perform cron.schedule(
      'us-left-for-you-push-sweep',
      '* * * * *',
      $cron$
        select net.http_post(
          url := 'https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/left-for-you-push-worker',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_left_for_you_push_cron_key' limit 1)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  end if;
end
$$;

-- 2) Unicità del media_path solo per i media caricati nel bucket.
alter table public.left_for_you
  drop constraint if exists left_for_you_media_path_unique;

create unique index if not exists left_for_you_uploaded_media_path_unique
  on public.left_for_you (media_path)
  where kind in ('photo', 'audio', 'video');
