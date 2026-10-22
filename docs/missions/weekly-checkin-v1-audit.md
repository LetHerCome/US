# Audit — Check-in settimanale V1 («Il punto della settimana»)

**Data:** 2026-10-22 · **Base:** `main` 542b986 · **Branch:** `claude/payred-app-comparison-b2594e`
**Tipo:** sola lettura. Nessun file di runtime toccato, nessun accesso a staging o produzione.
**Spec:** [weekly-checkin-v1.md](weekly-checkin-v1.md), già corretta con i risultati qui sotto.

## Verdetto

La missione si può fare riusando le authority esistenti, ma la prima versione della spec andava corretta in **sei punti**:

1. reazioni e Conservati non sono generici;
2. la retention non è lo strumento giusto;
3. dal 30/10 Supabase non espone più le tabelle nuove;
4. il ciclo di vita è già su `main` e va esteso;
5. le notifiche passano da `send-web-push`;
6. le nuove frasi Android richiedono un nuovo AAB.

Nessuno di questi punti blocca la missione.

## Risultati

### 1. Attore e coppia: riuso diretto
- `private.m11a_actor()` e `m11a_actor_locked()` (baseline, riga 2255 e seguenti) ricavano `couple_id` e `role` da `profiles` partendo da `auth.uid()`. Rifiutano con `42501` chi non è autenticato o non ha una coppia, e accettano solo i ruoli `francesco` o `beatrice`. Sono le funzioni da usare.
- I dati personali che si cancellano all'uscita (`daily_answers`, `moods`, `quiz_responses`) sono legati a `user_id`. Il check-in segue lo stesso modello: `couple_id` + `user_id`, e il ruolo si legge da `profiles` al momento della lettura.

### 2. Settimana: riuso diretto
- `private.bond_week_start_rome(at_time)` restituisce il lunedì in Europe/Rome (`date_trunc('week', …)`). La usano già le Quest settimanali.

### 3. Sigillo fino a entrambe le risposte: va replicato, non riusato
- `get_daily_state` e `private.daily_reveal_context` sono legati a `question_id`. Per il check-in serve lo **stesso schema**: la riga dell'altro esce solo quando esistono due righe per `(couple_id, week_start)`. È una RPC nuova, non un'estensione di quelle della Daily.

### 4. Reazioni: non esiste un sistema generico
- Le reazioni della Daily vivono in `daily_question_reveal_states`, con chiave `(couple_id, question_id, actor_role)` e valori ammessi `heart | angry | cry` (`set_daily_answer_reaction`).
- **Correzione alla spec:** non si estende la tabella della Daily. La reazione all'apprezzamento dell'altro va in una colonna `appreciation_reaction` sulla **propria** riga del check-in, con gli stessi tre valori e lo stesso componente client (`US_DAILY_REACTIONS`), tramite una RPC `set_weekly_checkin_reaction`. È lo stesso vocabolario e la stessa interfaccia, quindi non nasce un secondo sistema.
- La notifica «ha reagito» resta fuori dalla V1.

### 5. Conservati in Ricordi: va affiancato
- `daily_question_keepsakes` (M12B.4) è specifica della Daily: `question_id` obbligatorio, colonne `francesco_answer` e `beatrice_answer`, `UNIQUE (couple_id, question_id)`. Le righe sono scritte solo dal server con `keep_daily_question` e non cambiano più.
- Ricordi compone l'archivio lato client (`ricordiTimeline`, `app.js` riga 3953 e seguenti) per chiave canonica `kind:ref`, leggendo le tabelle direttamente con `sb.from(...)`.
- **Correzione alla spec:**
  - nuova tabella `weekly_checkin_keepsakes`, con la stessa forma e le stesse regole di M12B.4 (istantanea scritta dal server, immutabile, lettura per la stessa coppia);
  - RPC `keep_weekly_appreciation`;
  - un tipo in più nell'archivio: `weekly_checkin:<id>`, con etichetta in `RICORDI_SOURCE_LABEL`;
  - nessuna modifica a `daily_question_keepsakes`.
- **Policy A:** come i keepsake della Daily, un apprezzamento conservato è un ricordo condiviso e resta al partner. Va aggiunto al contratto di lifecycle insieme a `daily-keepsakes`, che è già marcato `requiresReview`.

### 6. Ciclo di vita: già su `main`, va esteso
- **`docs/CURRENT_STATE.md` è indietro:** #190, #196, #194, #214 e #220 sono già su `main`, mentre il documento li indica ancora come DRAFT. Se le migrazioni S3.2 siano applicate in produzione **non è verificato** da questo audit.
- `s32_account_deletion_v1` e `s32_close_membership` (leave) cancellano a mano le tabelle personali, una per una. `s32_export_user_data` le esporta una per una.
- **Correzione alla spec:**
  - FK `couple_id → couples ON DELETE CASCADE`, come per gli altri dati di coppia: copre il caso «ultimo membro, si cancella tutta la coppia»;
  - FK `user_id → auth.users ON DELETE CASCADE`: copre l'eliminazione dell'account;
  - **modifiche obbligatorie** in `s32_close_membership` (si esce dalla coppia ma l'account resta) e in `s32_export_user_data`;
  - ridefinire quelle funzioni con una migrazione nuova e una preflight sull'md5 del corpo atteso, come fa `content_1_0` per `start_game_round`, così una modifica sconosciuta in produzione non viene mai sovrascritta.

### 7. Retention: da togliere
- `run_operational_retention` (F2A.3) si dichiara *«bounded technical retention, never product history»*. Usarla per cancellare check-in non rivelati andrebbe contro quella regola.
- **Correzione alla spec:** le tornate a cui ha risposto uno solo restano sigillate e non vengono mai mostrate. Si cancellano solo con il ciclo di vita dell'account. Nessun job nuovo.

### 8. Notifiche: passano da `send-web-push`
- **Come funziona oggi:** il client chiama `sendWebPushEvent(type, ref)`. L'Edge `send-web-push` accetta solo i tipi in `EVENT_TYPES`, **ricontrolla sul server** con il client admin (per la Daily conta le righe in `daily_answers`), sceglie turno o reveal, filtra per `notification_preferences` (`prefKey` `today` o `bond`) e compone il testo da `notification-core.mjs`.
- **Per il check-in:**
  - un tipo `weekly_checkin_answer`, che diventa `weekly_checkin_turn` (all'altro) oppure `weekly_checkin_reveal` (a entrambi);
  - `target: 'today'`, perché la card priority è su Oggi, e `prefKey: 'today'`;
  - `tag` per settimana, per deduplicare.
- **Android:** due tipi nuovi in `ANDROID_NOTICE_KINDS` (`checkin_turn`, `checkin_ready`) e i casi IT/EN in `UsPushNotices.java`, con il solo campo `k` come da decisione del 16/10.
- **Le build già installate** non conoscono questi tipi e mostrano «Apri US per vedere le novità»: è il fallback previsto. Le frasi giuste arrivano con il prossimo AAB.
- Il deploy di `send-web-push` è un gate separato.

### 9. Supabase: modifica del 30/10/2026 che ci riguarda
- **Dal 30/10/2026** le tabelle nuove in `public` **non vengono più esposte da sole** all'API dei dati, anche nei progetti esistenti ([changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)). Senza grant espliciti:
  - l'Edge `send-web-push` (`service_role`) non potrebbe leggere `weekly_checkins`;
  - Ricordi non potrebbe leggere `weekly_checkin_keepsakes`.
- **Correzione alla spec:** la migrazione scrive tutti i grant in modo esplicito, così il risultato è lo stesso prima e dopo il 30/10:
  - `weekly_checkins`: `revoke all` da `anon` e `authenticated`; `grant select` a `service_role`; RLS attiva senza policy per i client;
  - `weekly_checkin_keepsakes`: `grant select` ad `authenticated` con una policy RLS per la stessa coppia (come `daily_question_keepsakes`), `grant select` a `service_role`;
  - ogni RPC: `revoke all … from public, anon` e `grant execute … to authenticated`.
- **Funzioni:** la nota non dice come cambiano i grant sulle funzioni. Per questo li scriviamo comunque in modo esplicito.
- **Strumenti:** Supabase CLI 2.117.0 disponibile. Dopo l'applicazione su staging va eseguito `supabase db advisors`.

### 10. Client
- **Oggi:** `US_TODAY_PRIORITY_ORDER` ha già `waiting_for_me` e `answers_ready` (`app.js` riga 2287). Basta aggiungere il check-in come sorgente di item, rispettando `usTodayConsumedFacts` e `US_TODAY_PRIORITY_LIMIT`.
- **Noi:** la riga «Il punto della settimana» va in `#bond`, vicino alla sezione «Missioni di coppia» (`noiLivingTitle`). Nessuna voce nuova nella barra delle sezioni.
- **Moduli:** i file nuovi vanno aggiunti in `scripts/build-cloudflare-pages.mjs`, in `scripts/build-capacitor-web.mjs`, nella precache di `service-worker.js` (`versioned(...)`) e in `index.html` con il marker di versione. I test da aggiornare sono `us-perf-1-0-precache` e `service-worker-static-runtime`.
- **Lingua:** i testi sono scritti in italiano e tradotti in `i18n-en.js` partendo dalla frase italiana. Quello che scrivono le persone va sotto `translate="no"`. Il glossario riceve «Il punto della settimana» = «Weekly check-in».
- **Rientro in primo piano:** il check-in si aggiorna solo se è sullo schermo; altrimenti dopo, con `usAfterForeground`.

## Rischi

- **Lifecycle (alto):** ridefinire `s32_close_membership` e `s32_export_user_data` tocca funzioni sensibili. Servono la preflight sull'md5 e i test della suite S3.2 rieseguiti per intero.
- **Grant (medio):** se la migrazione viene applicata dopo il 30/10 senza grant espliciti, le funzioni smettono di funzionare senza dare errori evidenti. Serve un test che controlli i grant reali.
- **Contenuto sensibile (medio):** livelli «Lontani» ripetuti. La V1 si limita a una frase calma, senza AI e senza rimandi clinici. Ci sarà una nota nella pagina Privacy.
- **Documenti (basso):** `CURRENT_STATE.md` non riflette i merge del 18–21/10. Da aggiornare in una PR di documentazione a parte.

## Passo successivo

Missione pronta per la fase 2 del piano: **SQL in TDD su staging**, cioè prima i test RED, poi la migrazione creata con la CLI. Servono due account QA di staging e l'autorizzazione del founder ad applicare su staging.
