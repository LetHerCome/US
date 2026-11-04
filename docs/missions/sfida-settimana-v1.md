# La sfida della settimana — V1 (fase 3 del rework di Noi)

**Fonte:** founder, 03/11/2026 (`docs/DECISIONS.md`, «Noi nuova, lavagna e sfida della settimana»). Tavole approvate: `SfidaGioca`, `SfidaOggi`, `SfidaDistanza` sul canvas «Noi · rework».
**Stato:** IN BRANCH (`claude/sfida-settimana-be5fe6`). Niente SQL, Edge o APK pubblicati da questo branch.

## Cosa fa

- **Una sfida a settimana per coppia** (lunedì–domenica, ora di Roma), scelta dal server in base a «Come vi vedete» (`private.bond_mode_for_couple`): vicini → sfide `near` e `any`; lontani → sfide per due posti; non ancora risposto → sfide `any`. Un solo cambio a settimana, prima di qualsiasi foto.
- **Si chiude con una foto**: «Chiudi con una foto» apre il caricamento dei Ricordi con il titolo breve della sfida; il Ricordo salvato chiude la sfida (`add_weekly_challenge_photo`). Coppie a distanza: una foto a testa; la seconda va nell'album del primo Ricordo (due foto affiancate). Alla prima foto l'altro riceve «X ha messo la sua foto: manca solo la tua».
- **Punti** (eventi di progressione, sorgente `challenge`, e `couples.bond_xp`): 60 a tutti e due; a distanza con una sola foto la sfida si chiude con 30 quando inizia la settimana dopo; 100 in più ogni 4 settimane di fila. Scaduta senza foto: niente punti, nessuna penalità.
- **Dove:** Gioca › Giochi sotto la domanda del giorno; Oggi da venerdì se non è fatta (categoria `challenge`, rango 40), e in qualsiasi giorno se l'altro a distanza ha già messo la sua foto («Tocca a te»). Sui Ricordi il segno «Sfida».
- **Notifiche** (job orario `weekly-challenge-job`): lunedì alle 9 «La sfida della settimana» con il titolo; sabato alle 10 un promemoria a chi non ha ancora messo la foto, se non è fatta. Interruttore unico in Impostazioni › Notifiche («La sfida della settimana»), che riusa la colonna `bond` di `notification_preferences` (serviva solo alle missioni).

## Missioni vecchie

Tabelle e storico restano. `ensure_bond_week` non crea più la bacheca (le app vecchie ne vedono una vuota); `confirm_bond_quest` e `reroll_bond_quest` restano per le righe esistenti. Tolti la bacheca missioni dal foglio di Noi, l'avviso su Oggi e il codice client. «Le vostre idee» non è toccato.

## Server

- `20261103205157_weekly_challenge_v1.sql`: colonne del catalogo (`challenge`, `two_places`, `short_title`, `short_title_en`) con 39 sfide curate (10 nuove per due posti); tabelle `couple_weekly_challenges` e `couple_weekly_challenge_photos` (RLS: solo lettura della propria coppia; scrittura solo dalle funzioni); RPC `get_weekly_challenge`, `change_weekly_challenge`, `add_weekly_challenge_photo` (authenticated), `weekly_challenge_for_job` e `get_internal_weekly_challenge_cron_key` (service_role); `progression_award` con la sorgente `challenge`; `ensure_bond_week` senza creazione; `s32_export_user_data` con le foto della sfida; le due tabelle in Realtime.
- `20261103205200_weekly_challenge_job_cron.sql`: cron `us-weekly-challenge-hourly` (`12 * * * *`) e chiave `us_weekly_challenge_cron_key`, solo dove esiste `us_project_url` (su staging non fa nulla).
- Edge nuova `weekly-challenge-job` (`verify_jwt = false`); `send-web-push` accetta `challenge_photo`.
- Android: tre tipi nuovi in `UsPushNotices.java` (`challenge`, `challenge_reminder`, `challenge_photo`), servono in un APK nuovo.

## Ordine di rilascio

1. SQL `20261103205157` e poi `20261103205200`.
2. Edge `weekly-challenge-job` e `send-web-push`.
3. Web e APK.

## Provare il job a mano su staging (cron spento)

Su staging la migrazione del cron non crea né il job né la chiave. Per una prova, con l'approvazione del founder:

1. Nel SQL editor di staging, una chiave a caso solo per la prova:
   `select vault.create_secret(replace(gen_random_uuid()::text, '-', ''), 'us_weekly_challenge_cron_key');`
   e leggerla con `select public.get_internal_weekly_challenge_cron_key();`.
2. Chiamare l'Edge forzando il giorno (la chiave basta, l'ora non conta):
   `curl -X POST https://<ref-staging>.supabase.co/functions/v1/weekly-challenge-job -H "x-us-cron-key: <chiave>" -H "Content-Type: application/json" -d '{"force":"monday"}'`
   Risposta attesa: `{"ok":true,"kind":"new","couples":N,"delivered":M}`. Con `{"force":"saturday"}` il promemoria va solo a chi non ha la foto di una sfida non fatta.
3. A prova finita: `delete from vault.secrets where name = 'us_weekly_challenge_cron_key';`.

## Non verificato da qui

- Test JVM di Android (`:us-push-support:testDebugUnitTest`): serve Gradle con la sandbox disattivata.
- Caricamento vero di una foto (Storage, telefono), notifiche vere e Realtime: provati solo con un Supabase finto.
