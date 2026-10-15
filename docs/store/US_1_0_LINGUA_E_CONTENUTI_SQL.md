# US 1.0 · Contenuti, lingua e correzioni server: cosa incollare e cosa pubblicare

Dove: Supabase › SQL Editor. Prima su **staging**, controlla che l'app funzioni, poi su **produzione**.
Ogni file si incolla intero e si esegue una volta. Se si ferma con un errore non ha cambiato nulla: fermati e scrivimi l'errore.

**1. SQL, in quest'ordine** (cartella `supabase/migrations/`):
1. `20261014220000_content_1_0.sql`: le nuove domande e carte, le correzioni e l'inglese salvato.
2. `20261014230000_us_1_0_locale_content_en.sql`: ognuno legge nella sua lingua; «E se…?» entra in «Confrontatevi».
3. `20261015000000_us_1_0_server_fixes.sql`: spegne il controllo dei promemoria ogni minuto (tornano nella 1.1, nessun dato cancellato) e toglie permessi inutili al database (nessuno può più svuotare i messaggi).

Controllo dopo il 3 (deve dare `0 | 0 | true`):
```sql
select (select count(*) from cron.job where jobname = 'us-calendar-reminders-dispatch') as promemoria_attivi,
       (select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and table_name <> 'profiles') as permessi_anon,
       to_regprocedure('public.set_my_locale(text)') is not null as lingua_pronta;
```

**2. Edge Functions, DOPO l'SQL** (Supabase › Edge Functions, o `supabase functions deploy <nome>`):
- `send-web-push`: «Risposte pronte» solo al partner, reazione alla risposta del giorno, «Bea è entrata», missione con il titolo, reazione al Ti penso con il nome.
- `game-v2-push` e `game-v2-push-worker`: la notifica dice il nome del gioco.
- `daily-question-push-worker`: il promemoria delle 20:30 a chi la sua persona sta aspettando.
- `monthiversary-job`: mesiversario anche per chi ha iniziato il 29, 30 o 31, senza punti nel testo, apre Eventi.
- `delete-moment`: solo chi ha creato un ricordo può cancellarlo.
- `left-for-you-push-worker` e `widget-think-send`: stesso testo nella lingua di chi riceve.

Attenzione: su staging `send-web-push` oggi è la versione di prova solo-test (#187). Sostituiscila solo se vuoi provare queste notifiche su staging.
Le notifiche Android restano generiche («Apri US per vedere le novità»): è voluto.
