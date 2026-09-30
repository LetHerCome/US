# M9E — Daily Question permanente

## Causa

`public.daily_questions` conteneva solo un blocco finito di 31 righe datate (2026-08-18 → 2026-09-17). Il client cercava `question_date = localDateISO()`: finito il seed, non trovava nulla e mostrava "La prossima domanda sta arrivando…". Non si risolve con un altro blocco finito.

## Authority (invariate)

- `public.daily_questions`: istanza concreta della domanda per un giorno di calendario.
- `public.daily_answers`: risposte. Il motore non le legge e non le scrive.
- `public.get_daily_state(question_id)`: visibilità delle risposte e reveal.
- `private.daily_question_reveal_ready` e `public.daily_question_outcomes` (M3).

## Aggiunte (migration `20260930045233_m9e_daily_question_engine.sql`)

| Oggetto | Ruolo |
| --- | --- |
| `public.daily_question_templates` | Banca curata: `id` stabile (`<tema>-NN`), `weekday_slot` ISO, `sequence`, `question`, `theme`, `active`, `created_at`. RLS forzata, nessuna policy, nessun grant client. |
| `daily_questions.template_id` | Provenienza opzionale, FK `ON DELETE RESTRICT`. `NULL` per le righe storiche. |
| `private.daily_question_day(ts)` | Autorità del giorno. |
| `private.materialize_daily_question(date)` | Unico writer di nuove righe `daily_questions`. |
| `public.get_or_create_daily_question()` | RPC autenticato, senza argomenti, usato da `hydrateToday()`. |
| cron `us-daily-question-materialize` | Ogni ora al minuto 1, solo se `pg_cron` esiste: materializza il giorno perché anche `us-widget-state` veda la riga dalle 00:01. |

Una sola riga per data: `question_date` è già `UNIQUE` in produzione. La migration crea un indice unico solo se non ne trova uno.

## Autorità del giorno: Europe/Rome

Il giorno della Domanda è la data di calendario in **Europe/Rome** dell'istante `now()` sul server: `(now() at time zone 'Europe/Rome')::date`. È il fuso che il prodotto usa già (`romeToday()` in `us-widget-state`, il worker dei promemoria calendario). Il client non invia mai una data, quindi i due partner ottengono la stessa domanda anche aprendo US a cavallo della mezzanotte o da dispositivi con fusi diversi. La mezzanotte cade alle 22:00Z con l'ora legale e alle 23:00Z con l'ora solare.

## Selezione e ciclo

- Il weekday ISO del giorno sceglie la famiglia: lun `noi_adesso`, mar `scoprirsi`, mer `ricordi`, gio `desideri`, ven `vicinanza`, sab `gioco`, dom `profonda`.
- Dentro la famiglia vince il template attivo mai usato (per provenienza o per testo identico a una riga storica), in ordine di `sequence`; quando sono stati usati tutti, torna quello usato meno di recente.
- Con 26 template per famiglia nessun template si ripete prima di 26 settimane (182 giorni).
- Concorrenza: lettura veloce, poi `pg_advisory_xact_lock`, riletura, `INSERT … ON CONFLICT (question_date) DO NOTHING`, riletura. Idempotente.
- Banca vuota per un weekday → errore `P0002 daily_question_template_bank_empty`, nessuna riga creata. Il client mostra un errore onesto con Riprova.
- Per ritirare un template: `active = false`. Un template già usato non si può cancellare.

## Client

`hydrateToday()` chiama `get_or_create_daily_question` al posto della query per data. Tre stati distinti: caricamento (nessuna textarea, nessun invio), errore reale (messaggio e Riprova, anche sulla card M9B di Oggi) e domanda pronta. Un errore transitorio non cancella una domanda valida dello stesso giorno. `get_daily_state` resta l'unica fonte per risposte e reveal; il flusso di notifica `daily_answer` non cambia.

## Applicazione

Solo nel repo. Francesco applica la migration; nessun deploy di Edge Function richiesto.
