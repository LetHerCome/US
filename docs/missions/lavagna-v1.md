# Lavagna V1 — fase 2 della Noi nuova

**Fonte:** founder, 03/11/2026, `docs/DECISIONS.md` «2026-11-03 — Noi nuova, lavagna e sfida della settimana» (sul branch `claude/fix-prod-1-3-1`). Tavole sul canvas «Noi · rework»: `Main.dc.html` (la tessera nella bacheca), `LavagnaAperta.dc.html` (la lavagna aperta), `Lavagna.dc.html` (il widget).
**Branch:** `claude/lavagna-ad3ef8`, sopra `claude/noi-rework-base` (b24ccf23). Le fasi 1 (Noi e bacheca) e 3 (sfida) sono in branch a parte; le unisce la sessione coordinatrice.

## Cosa fa

- Una sola lavagna per coppia. In cima alla bacheca di Noi una tessera (196 px) con l'ultimo disegno inquadrato, «Lavagna · Bea, 5 min fa» e «Disegna»: non ci si disegna sopra, la si tocca per aprire la lavagna a tutto schermo.
- Si disegna col dito (pointer events, un dito solo). Quattro colori (rosa `#ff7c96`, lilla `#a98bff`, ambra `#f3b76e`, latte `#f7efe9`), due spessori, gomma (taglia l'inchiostro, non la lavagna), «Annulla» dell'ultimo tratto proprio, «Pulisci» con la conferma condivisa: cancella per tutti e due.
- Ogni tratto si salva quando si alza il dito: punti semplificati (Ramer–Douglas–Peucker) in unità della lavagna (x 0..1000, y 0..1600), al massimo 600 punti. L'altra persona lo riceve dal canale Realtime unico (`startUsRealtime`) in 1-2 secondi; niente dito in movimento in tempo reale.
- Notifica «X ha disegnato sulla lavagna»: il telefono la chiede quando il disegno si ferma (8 s) o quando si chiude la lavagna; il server la manda al massimo una volta ogni 2 ore per chi la riceve. Si spegne in Impostazioni › Notifiche › Lavagna.
- Widget Android «Lavagna» 2×2: l'ultimo disegno e «Bea · 5 min fa». L'app lo disegna due volte (inchiostro Pastello per la Home chiara, Midnight per quella scura) come immagini trasparenti sulla carta del widget; da Android 12 il launcher cambia immagine col tema da solo. Toccandolo apre US sulla lavagna. Sul widget non si disegna.

## Server

Migrazione `supabase/migrations/20261103205050_lavagna_v1.sql`:
- `lavagna_strokes` (id scelto dall'app, `couple_id`, `author_id` e `created_at` dal server, `tool` pen/eraser, `color`, `width` 1/2, `points smallint[]`); RLS di coppia (lettura, inserimento, cancellazione), nessun update; al massimo 1500 tratti per lavagna (`lavagna_full`).
- `lavagna_boards` (una riga per coppia, scritta solo dal trigger dopo ogni cancellazione: `removed` con gli id tolti, `cleared_at` quando la lavagna resta vuota). Serve perché Realtime non filtra le cancellazioni per coppia.
- `lavagna_undo()` e `lavagna_clear()` (security invoker, solo `authenticated`).
- Autori staccati in `private.s32_close_membership` (uscita dalla coppia, eliminazione account); export in `s32_export_user_data` e in `_shared/s3-2-export-core.mjs` (che ora accetta liste di valori semplici solo per `lavagna_strokes.points` e `couple_notes.items`).
- `notification_preferences.lavagna` (default on) in `get_notification_preferences` / `set_notification_preference`.

Edge: `send-web-push` (tipo `lavagna`, `_shared/lavagna-push-core.mjs`, kind FCM `lavagna`) ed `export-my-data` (export core).

## Test

`tests/lavagna-v1-db.test.js`, `tests/lavagna-push.test.js`, `tests/lavagna-client.test.js`, `tests/widget-lavagna.test.js`; JVM `UsWidgetModelsTest` (contratto e modello) e `UsPushNoticesTest`.

## Limiti noti

- Con US chiusa il widget non si aggiorna da solo (come «Ricordi a pila»): mostra il disegno dell'ultima volta che US era aperta su quel telefono.
- La tessera si aggancia a `#usNoiLavagnaSlot`; se la bacheca della fase 1 disegna lo slot dopo l'avvio, deve chiamare `UsLavagna.mount()`.
