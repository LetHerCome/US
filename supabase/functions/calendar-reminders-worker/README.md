# calendar-reminders-worker (M6D)

Worker schedulato dei reminder del Calendario. **Non è un endpoint utente.**

## Contratto
- POST con header `x-us-cron-key`, verificato contro la chiave DEDICATA
  `us_calendar_reminders_cron_key` che vive **solo nel Vault** (mai in env,
  mai nel repo, mai condivisa con i segreti di altri job.
  chiave propria). Il worker la legge con
  `get_internal_calendar_reminders_cron_key()` (SECURITY DEFINER, eseguibile
  solo da service_role); il cron la inietta via `vault.decrypted_secrets`.
- Trova le righe `calendar_reminders` con `sent_at is null`, calcola per
  ciascuna il momento della notifica **dagli eventi reali** (non da copie):
  - timed → `starts_at - offset_minutes`
  - all-day → 18:00 Europe/Rome del giorno precedente a `start_date`
- Prima di consumare qualsiasi chiave dedupe configura VAPID (F2C): chiave
  privata dal Vault via `get_internal_vapid_private_key()`, subject dalla
  configurazione Edge `VAPID_SUBJECT` (`_shared/web-push-vapid.mjs`).
  Configurazione mancante → 500, nessuna chiave consumata, si ritenta.
- Invia via web-push esistente (`push_subscriptions`, `push_event_log` con
  dedupe `calendar-reminder:<id>`), poi imposta `sent_at`.
- Nessun ritento di righe già inviate: niente spam, niente duplicati.

## Deploy + scheduling
1. `supabase functions deploy calendar-reminders-worker`
   (`verify_jwt = false` già registrato in `supabase/config.toml`).
2. Migration `20260928210000_m6d_calendar_reminders.sql` (supabase db push):
   crea tabella+RLS, **genera** la chiave nel Vault (idempotente: il valore
   è prodotto dal database e non è mai noto fuori), registra il cron job
   `us-calendar-reminders-dispatch` (idempotente). Storico: dal F2C il
   cron vive in `supabase/migrations/20261004110718_f2c_edge_cron_source_of_truth.sql`
   e l'URL viene dal Vault `us_project_url`.

## Perché ogni minuto
Gli offset più fini sono 10 minuti: il worker gira ogni minuto e invia solo
righe effettivamente scadute e non inviate — idempotente per costruzione.