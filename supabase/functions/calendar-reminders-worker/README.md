# calendar-reminders-worker (M6D)

Worker schedulato dei reminder del Calendario. **Non è un endpoint utente.**

## Contratto
- POST con header `x-us-cron-key`, verificato contro l'Edge secret
  `CALENDAR_REMINDERS_CRON_SECRET` — chiave **dedicata** a questo worker
  (stesso pattern di `M5I_CLEANUP_SECRET`), nessuna condivisione con i
  segreti di altri job. Nessun valore di secret vive nel repo: solo il nome.
- Trova le righe `calendar_reminders` con `sent_at is null`, calcola per
  ciascuna il momento della notifica **dagli eventi reali** (non da copie):
  - timed → `starts_at - offset_minutes`
  - all-day → 18:00 Europe/Rome del giorno precedente a `start_date`
- Invia via web-push esistente (`push_subscriptions`, `push_event_log` con
  dedupe `calendar-reminder:<id>`), poi imposta `sent_at`.
- Nessun ritento di righe già inviate: niente spam, niente duplicati.

## Deploy + scheduling (manuale, fuori repo perché tocca il secret)
1. `supabase functions deploy calendar-reminders-worker`
   (`verify_jwt = false` già registrato in `supabase/config.toml`).
2. Chiave cron dedicata (una volta, CLI; il VALORE non vive mai nel repo):
   `supabase secrets set CALENDAR_REMINDERS_CRON_SECRET=<valore generato>`
3. Registrazione pg_cron (una volta, SQL editor; `<CRON_SECRET>` è lo stesso
   valore del punto 2, passato inline — mai committato):
   ```sql
   select cron.schedule(
     'us-calendar-reminders-dispatch',
     '* * * * *',
     $cron$
       select net.http_post(
         url := 'https://<project-ref>.supabase.co/functions/v1/calendar-reminders-worker',
         headers := jsonb_build_object(
           'Content-Type','application/json',
           'x-us-cron-key','<CRON_SECRET>'
         ),
         body := '{}'::jsonb
       );
     $cron$
   );
   ```

## Perché ogni minuto
Gli offset più fini sono 10 minuti: il worker gira ogni minuto e invia solo
righe effettivamente scadute e non inviate — idempotente per costruzione.