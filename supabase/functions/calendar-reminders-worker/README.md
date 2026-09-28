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
- Invia via web-push esistente (`push_subscriptions`, `push_event_log` con
  dedupe `calendar-reminder:<id>`), poi imposta `sent_at`.
- Nessun ritento di righe già inviate: niente spam, niente duplicati.

## Deploy + scheduling
1. `supabase functions deploy calendar-reminders-worker`
   (`verify_jwt = false` già registrato in `supabase/config.toml`).
2. Migration `20260928210000_m6d_calendar_reminders.sql` (supabase db push):
   crea tabella+RLS, **genera** la chiave nel Vault (idempotente: il valore
   è prodotto dal database e non è mai noto fuori), registra il cron job
   `us-calendar-reminders-dispatch` (idempotente).

## Perché ogni minuto
Gli offset più fini sono 10 minuti: il worker gira ogni minuto e invia solo
righe effettivamente scadute e non inviate — idempotente per costruzione.