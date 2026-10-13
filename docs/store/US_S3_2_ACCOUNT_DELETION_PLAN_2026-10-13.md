# US 1.0 — Piano tecnico consolidato: cancellazione account (Squadra 3, S3.2)

**Data:** 2026-10-13 · **Tipo:** piano, nessuna implementazione · **Base:** `main` `9de2073` (+ roadmap `729ee93`), PR #190 `c4568b0` (letta, non modificata), PR #180 `c5602b6` (solo per l'interazione con il trigger S2).
**Vincoli:** nessuna operazione distruttiva, nessuna chiamata a Supabase, PR #190 resta aperta: il suo lavoro viene riusato (§12). Le stime di sforzo sono **stime**. "INFERRED" indica un ragionamento non ancora verificato su un ambiente reale.

## 0. Sintesi della raccomandazione

1. **Conservazione in loco, non vault.** Il contenuto condiviso che chi esce decide di lasciare resta nelle tabelle originali, con l'autore anonimizzato (`NULL`). Il bucket `us-media` è già leggibile da tutta la coppia (`baseline.sql:7314`), quindi non serve copiare file *se* P-1 conferma che `deleteUser` non è bloccato dagli oggetti posseduti (§4.2.5). I quattro vault di #190 vengono parcheggiati.
2. **Il solo `SET NULL` non basta** (§4.2). Sono necessari anche: un flag di blocco nel helper RLS, FK *fail-closed* (`RESTRICT`) invece di cascate, la gestione esplicita di ogni tabella in un worker, una regola sul ri-accoppiamento, uno stato "partner uscito" nel client, un permesso di cancellazione per il sopravvissuto sugli elementi orfani e la pulizia di Storage tramite API.
3. **Scelta di chi esce al momento della richiesta:** "lascia al partner i ricordi condivisi che ho creato" (`keep_shared=true`) oppure "eliminali" (`false`). Questa scelta sostituisce la revisione per singolo elemento prevista da #190, che nessuno opererebbe.
4. **Flusso:** richiesta (app o web loggato, email come ripiego) → blocco immediato → periodo di ripensamento → worker service-role con macchina a stati idempotente → eliminazione dell'utente Auth entro lo SLA dichiarato.

## 1. Richiesta di cancellazione e verifica dell'identità

| Canale | Meccanismo | Verifica identità |
|---|---|---|
| **In app** (Android + PWA) | Impostazioni → "Privacy e dati" → "Elimina account" (`settings.js:549-558`, oggi 4 righe di testo). Schermata con effetti, scelta `keep_shared`, campo password, conferma. Il client esegue `signInWithPassword` e poi chiama l'Edge `request-account-deletion` (`verify_jwt=true`) | Ri-autenticazione recente: l'Edge controlla nel JWT il claim `amr[].timestamp` del metodo `password` (≤ 300 s). INFERRED: il formato del claim va verificato su staging; in alternativa si usa il `iat` di una sessione appena creata |
| **Web** (requisito Play) | Pagina statica pubblica `/elimina-account` su Cloudflare Pages (C5). Spiega cosa si cancella, cosa resta e i tempi. Pulsante "Accedi ed elimina": la PWA già pubblicata (`https://us-a33.pages.dev`, `config.toml:8`) apre lo stesso flusso dell'app. Una route web autenticata soddisfa il requisito Play "richiesta senza reinstallare l'app" | Come in app |
| **Email** (ripiego: password dimenticata, telefono perso; il recupero password #189 non è in produzione) | Indirizzo di supporto indicato sulla pagina. L'operatore risponde **all'email dell'account** con un codice monouso e la domanda sulla scelta `keep_shared`. Alla conferma esegue la funzione service-only `private.operator_request_account_deletion(uid, channel:='email', keep_shared)` secondo il runbook | Controllo della casella email dell'account. Non si accettano richieste da altri indirizzi né richieste del partner per conto di chi esce |

**Oggetti nuovi (in una migrazione):**
- `private.account_deletion_requests(id, user_id uuid, couple_id uuid, channel, keep_shared bool, state, requested_at, due_at, attempts, last_error_code, completed_at)`. Nessuna FK verso `auth.users`, così la riga sopravvive come ricevuta minima. Schema non esposto, RLS forzata, nessun grant ai ruoli client.
- RPC `public.request_account_deletion(p_keep_shared bool)` (SECURITY DEFINER, `search_path=''`, solo `auth.uid()`, idempotente: una seconda richiesta restituisce lo stato esistente) e `public.cancel_account_deletion()`, valida solo in stato `locked` e prima di `due_at`.
- **[Rev. ind.]** Se `request_account_deletion` resta eseguibile da `authenticated`, chiunque abbia un JWT (anche rubato o vecchio) la chiama direttamente via PostgREST e **salta la ri-autenticazione** fatta nell'Edge. La funzione deve essere `service_role`-only con l'uid passato dall'Edge, oppure deve verificare `auth.jwt()->'amr'` al proprio interno. La nuova colonna `profiles.deletion_requested_at` non deve ricevere grant UPDATE: oggi `authenticated` può aggiornare solo `avatar_path` (:6932), e il controllo di deriva MC2 (`mc2_couple_invites.sql:408-411`) va tenuto allineato.

**Criteri di accettazione:** un utente può creare solo la propria richiesta; una richiesta per un altro uid o coppia è impossibile; una richiesta ripetuta non crea duplicati; senza ri-autenticazione la chiamata viene rifiutata; la pagina web è raggiungibile senza login e il suo testo coincide con il comportamento reale. **Sforzo (stima):** 1,5 g, UI esclusa (+0,5 g UI, +0,5 g pagina).

## 2. Effetti immediati (stato `locked`)

| Effetto | Meccanismo | Evidenza / nota |
|---|---|---|
| Blocco dei dati di coppia | Nuova colonna `profiles.deletion_requested_at`. `private.current_couple_id()` diventa `... where id=auth.uid() and deletion_requested_at is null`. Tutte le policy di coppia (moments, messages, calendar, storage…) restituiscono 0 righe **anche con un JWT ancora valido** | Helper: `baseline.sql:1277-1283`. Policy Storage: `:7310-7317`. **[Rev. ind.] Non basta:** almeno 15 RPC SECURITY DEFINER, `m11a_actor*` (~21 chiamanti), la policy `weekly_quiz_rewards_same_couple_select` (:6808) e gli RPC di registrazione push leggono `profiles.couple_id` direttamente, senza l'helper. Elenco in §R2 |
| Edge con service role | Le funzioni con service role ignorano RLS, quindi serve un helper condiviso `requireActiveMember()` che verifichi il flag. Si applica a `delete-moment` (che legge `profiles.couple_id` con il client admin, `index.ts:34-48`), `send-web-push`, `game-v2-push`, `widget-device-token`, `spotify-search` e alla futura export | Senza questo controllo chi è in uscita potrebbe ancora cancellare Momenti del partner tramite `delete-moment` |
| RPC MC2 | `get_couple_membership` restituisce `{member:false, pending_deletion:true}`; `create/accept/revoke_partner_invite` rifiutano la chiamata | `mc2_couple_invites.sql:235-255` |
| Sessioni | L'Edge di richiesta chiama `auth.admin.signOut(jwt,'global')`, che revoca i refresh token di tutti i dispositivi. L'access JWT resta valido fino alla scadenza (default 3600 s, INFERRED: `jwt_expiry` non è gestito in `config.toml`), ma il flag lo rende innocuo. Nei canali email/operatore il worker revoca le sessioni lato server | Signed URL già emesse restano valide fino a 6 h (`app.js:365,373`, `21600`), e fino a **24 h** per la foto home del widget (`us-widget-state/index.ts:113`, `86400`): rischio residuo dichiarato. **[Rev. ind.]** Dopo la revoca, chi esce può **rientrare con la password** (serve per "Annulla"), quindi ottiene un nuovo JWT valido per tutto il periodo di grazia: ogni percorso che non controlla il flag resta aperto per 7 giorni, non per 1 h |
| Push | Nella stessa transazione si cancellano le righe in `device_push_tokens` e `push_subscriptions` dell'utente. Il client esegue `revokeCurrentDevice()` (`app.js:792-802`) sul dispositivo corrente | `UNIQUE(token)` (`baseline.sql:390`): coordinamento con la Squadra 1 (§10) |
| Widget | Cancellazione di `widget_tokens`, `widget_action_tokens`, `widget_scriptable_*` dell'utente. `us-widget-state` non ricontrolla l'appartenenza alla coppia (P-11), quindi la cancellazione delle righe è obbligatoria | Il client pulisce lo store Android cifrato (`UsWidgetCredentialStore.clear()` e `UsWidgetStore.clearAll()`, esposti dal plugin `clearAll`; `UsWidgetCredentialStore.clearAll` non esiste) |
| Posizione | `couple_locations` dell'utente cancellata subito, perché è un dato sensibile ed è in realtime (`baseline.sql:7281`) | — |
| Realtime | I `postgres_changes` vengono filtrati da RLS con il JWT del sottoscrittore: dopo il flag, nessun evento (INFERRED, da verificare su staging) | — |
| Partner | Il `get_couple_membership` del sopravvissuto restituisce `partner_state:'departing'`. Il client mostra un avviso neutro in app, senza push e senza dettagli (decisione D-4) | — |
| Ripensamento | Login con password durante il periodo di grazia → schermata unica "Eliminazione programmata il …" con "Annulla" (`cancel_account_deletion`) | Decisione D-3 |

**Criteri di accettazione (PGlite):** dopo la richiesta, chi esce vede 0 righe di coppia e 0 oggetti Storage con il JWT precedente; push, widget e posizione dell'utente sono a 0; il partner e l'altra coppia restano invariati; `delete-moment` chiamato da chi esce restituisce 403. **Sforzo:** 1 g.

## 3. Elaborazione (worker) e macchina a stati

- **Componenti:** la funzione SQL `private.process_account_deletion_db(request_id)` (SECURITY DEFINER, `service_role` only) esegue l'intera parte relazionale in **una sola transazione** con `pg_advisory_xact_lock` sulla coppia. L'Edge `process-account-deletions` (`verify_jwt=false`, chiave cron in Vault come gli altri worker) esegue Storage e Auth. All'inizio il cron è **disattivato**: l'operatore lo lancia a mano con il runbook (§10) e lo attiva solo dopo il collaudo su staging.
- **Stati:** `locked → due → db_done → storage_done → auth_deleted → completed`, con `failed_retryable` (attempts+1, backoff) e `failed_needs_operator` dopo 5 tentativi. Ogni passo è idempotente: le delete di righe assenti sono no-op; la remove Storage di un oggetto mancante è ok; `deleteUser` con risposta 404 è ok.
- **Ordine:** (1) transazione DB: gestione per tabella secondo §4, scrittura dei percorsi da eliminare in `private.account_deletion_objects(request_id, path)`, `couples.member_departed_at=now()`, delete del profilo. (2) Storage: `list` del prefisso `<couple>/<uid>/` paginato, poi `remove` di tutto ciò che non è nel *keep-set*; il passo si chiude solo quando una nuova `list` restituisce esattamente il keep-set. (3) `auth.admin.deleteUser(uid)`. (4) `completed`: si cancellano le righe di oggetti e restano solo id, date, canale e stato.
- **Fallimento a metà:** il passo DB è atomico, quindi il partner non vede mai uno stato parziale. Se Storage fallisce, il blocco resta attivo e la richiesta viene ritentata. Gli oggetti orfani restano **elencabili dal sopravvissuto**, perché la SELECT Storage vale per tutta la coppia: per questo `completed` richiede la verifica con `list`. Una query SLA (`due_at + 30 giorni` superato) genera un avviso all'operatore.
- **Scadenza:** pubblicamente "entro 30 giorni dalla richiesta"; obiettivo interno di 1 giorno dopo la fine del periodo di grazia (D-3).
- **Criteri:** rieseguire ogni stato produce lo stesso risultato; un errore Storage simulato lascia `failed_retryable` con il partner intatto; due richieste concorrenti nella stessa coppia vengono serializzate. **Sforzo:** 3 g (SQL 1,5 + Edge/Storage 1 + runbook 0,5).

## 4. Conservazione lecita dei contenuti condivisi

### 4.1 Classificazione per tabella (L = chi esce, S = sopravvissuto)

| Tabella (FK, `baseline.sql`) | Classe | `keep_shared=true` | `keep_shared=false` |
|---|---|---|---|
| `profiles` (`id`→auth CASCADE :6364) | personale | delete + avatar | delete + avatar |
| `couple_locations`, `moods`, `quiz_responses`, `partner_knowledge_attempts`, `notification_preferences`, `progression_reward_views`, `story_views`, `push_event_log`(L), token/widget | personale | delete | delete |
| `daily_answers` (`user_id`→auth CASCADE :6329) | personale | **delete** (mai `SET NULL`: il trigger S2 di #180 blocca UPDATE senza JWT) | delete |
| `stories` (+oggetti) | personale effimero | delete | delete |
| `left_for_you` inviati da L (+audio/video/foto) | personale effimero | **delete** (D-6) | delete |
| `left_for_you`, `shared_messages` inviati da S a L | di S | resta, `recipient_id=NULL` | resta, `recipient_id=NULL` |
| `shared_messages` inviati da L (sender :6387) | condiviso, autore L | resta, `sender_id=NULL`; i messaggi con `unlock_at>now()` non ancora consegnati vengono cancellati | delete |
| `think_reactions` di L | personale | delete | delete |
| `moments` di L (:6357) | condiviso, autore L | resta, `created_by=NULL` | delete; se contiene foto di S, il guscio resta con `created_by=NULL` e la prima foto di S diventa copertina |
| `moment_photos` di L (:6354) / di S nei Momenti di L (:6355 CASCADE) | condiviso / di S | resta, `NULL` / resta | delete / **resta** (no cascata) |
| `calendar_entries` personali di L | personale | delete (la CHECK `owner_by_type` :6131 vieta `NULL`) | delete |
| `calendar_entries` condivise di L (:6301) | condiviso | resta, `created_by=NULL` | delete (il trigger `unschedule_bucket_items` sgancia i desideri) |
| `calendar_reminders` richiesti da/per L | personale | delete | delete |
| `shared_events` di L (:6384), `bucket_items` di L (:6299) | condiviso | resta, `NULL`; anche `lived_proposed_by` (senza FK) va a `NULL`, **[Rev. ind.]** ma richiede il GUC `us.bucket_items_lived_confirm` (`bucket_items_guard_update` :1066-1070) | delete; per i desideri collegati serve sgancio preliminare (`bucket_items_guard_delete`). **[Rev. ind.]** La guardia (:1002) blocca anche i desideri `lived`, non solo quelli collegati. Un `shared_event` con completamenti **non è cancellabile**: `shared_event_completions.event_id` è `ON DELETE RESTRICT` (:6382). Serve una decisione: guscio conservato oppure cancellazione dei completamenti (storia comune di S) |
| `shared_event_completions.completed_by` (NO ACTION :6380) | storia comune | `NULL` | `NULL` |
| `daily_question_keepsakes` (risposte copiate per ruolo :310-311) | creato insieme | resta | colonna di L redatta (`''` + marcatore); serve un bypass controllato del trigger `keepsakes_guard_update` |
| `daily_question_outcomes`, `couple_questions` (`author_role`), `game_session_answers`/`sides` (`actor_role`) | creato insieme, per ruolo | resta | delete delle righe del ruolo di L |
| `game_sessions`, `game_session_items`, `living_provenance`, `relationship_milestones`, `bond_*`, `couple_reward_unlocks`, `couples.bond_xp` | coppia, non personale | resta | resta |
| `progression_events.actor_id`, `activity.actor_id`, `couple_invites.*` (già SET NULL) | operativo | `NULL`; delete delle righe `activity` di L (il `payload` jsonb può contenere testo) | idem |
| `conserva_contributions` (:6307/:6310) | di S | resta, `source_sender_id=NULL` | idem |
| **[Rev. ind.] Correzione** `conserva_contributions` | di S, scelta esplicita di S | **Incoerente con la riga `left_for_you` qui sopra:** `source_item_id → left_for_you ON DELETE CASCADE` (:6309), quindi cancellare i lasciati-per-te di L cancella anche i "Conservati" di S. Il contenuto (testo e media) vive solo in `left_for_you`; il client lancia `conservati_source_unavailable` e blocca l'intera vista se manca una sorgente (`moments-albums.js:1066-1069`). `source_sender_id` è inoltre `not null` (:210) | Decisione D-13: i lasciati-per-te **conservati da S** restano (riga + media, `sender_id=NULL`) come contenuto condiviso, oppure vengono persi in modo dichiarato |
| `couples.home_photo_path` caricata da L | condiviso | resta | oggetto rimosso e colonna a `NULL` |

Il nome di chi esce scritto liberamente nelle didascalie del partner **non** viene modificato: è contenuto del partner.

### 4.2 Perché il solo `SET NULL` non basta (evidenze)

1. **NOT NULL:** `moments.created_by`, `moment_photos.created_by`, `shared_messages.sender_id/recipient_id`, `left_for_you.*`, `calendar_entries.created_by`, `shared_events.created_by`, `bucket_items.created_by` e `shared_event_completions.completed_by` sono `not null` (`baseline.sql:547-555, 534, 742, 499, 173, 727, 155, 713`). `SET NULL` fallirebbe e farebbe abortire l'intera eliminazione. **[Rev. ind.]** Vanno aggiunti `conserva_contributions.source_sender_id` (:210) e i riferimenti tra tabelle di contenuto che le 78 FK di #190 **non** coprono, perché quell'inventario include solo i genitori `auth.users/profiles/couples`: `shared_event_completions.event_id` RESTRICT (:6382), `bucket_items.calendar_entry_id` RESTRICT (:6297), `game_session_items.source_question_id` NO ACTION (:6341, blocca la delete di `couple_questions` del ruolo di L), `conserva_contributions.source_item_id` CASCADE (:6309), `think_reactions.message_id` CASCADE (:6392), `living_provenance.target_moment_id` CASCADE (:6352).
2. **CHECK:** `calendar_entries_owner_by_type_check` (:6131) richiede `owner_id` sulle voci personali. `left_for_you_no_self_check` (:6248) con `NULL` passa, ma solo per caso.
3. **Trigger:** S2 di #180 rifiuta ogni UPDATE di `daily_answers` senza `auth.uid()` (#180 `…week_participation.sql:29-60`); `keepsakes_guard_update` rende immutabili i keepsake (:6527); `bucket_items_guard_delete` blocca la cancellazione dei desideri collegati (:6519). Le guardie su `created_by` (:1054, :1139) oggi lasciano passare `NULL` solo perché `NULL <> x` vale NULL: serve un test esplicito.
4. **RLS:** update e delete richiedono `created_by = auth.uid()` (`moments_delete_own` :6731, `moment_photos_delete_own` :6718, `calendar_entries_delete_shared` :6652). Il sopravvissuto **non potrebbe cancellare la propria copia** dei ricordi rimasti. Serve una policy di sola DELETE `created_by is null and couple_id=current_couple_id()` su moments, moment_photos, calendar_entries condivise, shared_events e bucket_items. La modifica resta vietata, così il testo di chi esce non viene riscritto.
   **[Rev. ind.] Correzione (PARTIAL):** `shared_events` e `bucket_items` hanno già DELETE **e UPDATE** per tutta la coppia (`bucket_delete/update_same_couple` :6641-6649, `shared_events_delete/update_same_couple` :6771-6779). Il sopravvissuto quindi può già cancellarli, ma può anche **riscrivere** il testo di chi è uscito: la frase "la modifica resta vietata" oggi è falsa per queste due tabelle. I Momenti interi (con album e oggetti Storage) sono già cancellabili da entrambi tramite `delete-moment` (`app.js:3261`, `moments-albums.js:394-396`, `index.ts:41-77`, nessun controllo sull'autore). La nuova policy DELETE serve davvero solo per `moment_photos` (singola foto d'album) e per le `calendar_entries` condivise.
5. **Storage:** gli oggetti restano in `<couple>/<L>/…` con `owner_id=L`; `us_media_delete_own` (:7310) li rende non cancellabili dal sopravvissuto. Per i Momenti esiste già `delete-moment` con service role (`index.ts:59-77`). Per le foto di album e le copertine serve un'estensione dello stesso Edge. INFERRED da verificare su staging per primo (P-1): se `auth.admin.deleteUser` fallisce quando l'utente possiede ancora oggetti, gli oggetti conservati vanno spostati con l'API Storage `move` in `<couple>/<S>/…` e le righe aggiornate. Questo riusa la logica di path di `s3-2-media-copy-rehearsal.cjs`. **[Rev. ind.]** INFERRED: `move` cambia `name` ma probabilmente **non** `owner_id`, quindi potrebbe non sbloccare `deleteUser`. P-1 deve provare anche il ripiego `copy` (service role, con owner nullo) + `remove` dell'originale.
6. **Accesso effettivo:** dopo la cancellazione del profilo, `get_couple_membership` restituisce `partner_joined:false` e il client porta il sopravvissuto alla schermata "Il tuo spazio è pronto, invita la tua persona" (`onboarding.js:29,155-157`). **I ricordi conservati diventano irraggiungibili** e l'invito di un nuovo partner si riapre. Serve lo stato `PARTNER_DEPARTED`, che apre l'app normale con un banner e senza invito.
7. **Rendering:** con autore `NULL` il client mostra **"Noi"** (`app.js:2993,3119,3168`; `moments-albums.js:302`), cioè attribuisce a entrambi un contenuto di chi è uscito. In `calendar.js:1151` e `left-for-you.js:271` serve un'etichetta esplicita (es. "Account eliminato", D-4).
8. **Ruoli per slot (`'francesco'/'beatrice'`):** keepsake, outcomes, risposte di gioco, `couple_questions` e `living_provenance` sono legati al **ruolo**, non all'uid. Queste tabelle sono assenti dalle 78 FK di #190 e `SET NULL` non le tocca. Un nuovo partner che occupa lo stesso slot apparirebbe come autore delle risposte dell'ex (§7). **[Rev. ind.]** All'elenco vanno aggiunti `daily_question_reveal_states.actor_role`, `game_sessions.started_by_role/subject_heavy_role` e `game_session_items.subject_role`. Senza FK c'è anche `bond_weekly_quests.confirmed_by uuid[]`, che contiene l'uid di L. Infine `game_session_items.context` (jsonb), `shared_event_completions.event_title_snapshot` e `living_provenance.source_title` sono **copie di testo** che restano anche quando l'originale di L viene cancellato (`keep_shared=false`).
9. **Ledger e realtime:** `progression_events` e `bond_xp` restano coerenti. Le righe che passano a `NULL` generano eventi realtime di UPDATE verso il sopravvissuto, accettabili ma da coprire con un test UI.

### 4.3 Vault di #190 o conservazione in loco

| Criterio | Vault #190 (4 draft) | In loco (raccomandato) |
|---|---|---|
| Copia dei media | Sì (rehearsal in memoria, checksum) | No, gli oggetti restano dove sono |
| Revisione per elemento e ledger | Obbligatori (ricevute falsificabili, #183 12:34Z) | Sostituiti dalla scelta di chi esce |
| UI per il sopravvissuto | Nuove tabelle `s32_preserved_*` da renderizzare | Schermate esistenti + etichetta |
| Rischio | Alto: nuove superfici, tabelle `public` | Basso: modifiche limitate + FK fail-closed |
| Sforzo | > 10 g ulteriori | ≈ 3 g per la parte dati |

**Raccomandazione:** conservazione in loco. I draft dei vault restano parcheggiati su #190 come riferimento.

### 4.4 FK *fail-closed*

Per le colonne di autore e destinatario del contenuto condiviso: `DROP NOT NULL` + `ON DELETE RESTRICT`, non `SET NULL`. Il worker deve azzerare esplicitamente ogni riferimento prima di cancellare il profilo. Una tabella dimenticata **blocca** l'eliminazione (stato `failed_needs_operator`) invece di cancellare silenziosamente. Lo stesso vale per una cancellazione dalla dashboard (B-04): oggi distruggerebbe i dati del partner, dopo la migrazione fallisce. Le cascate personali restano invariate.

**[Rev. ind.]** Si preferisce `NO ACTION` non differibile a `RESTRICT`. Per una singola uscita la semantica fail-closed è identica: errore se a fine statement resta un riferimento. `RESTRICT` invece controlla subito, durante la cascata. Nella cancellazione dell'intera coppia (§8: `DELETE couples` → cascata su `profiles` e, in parallelo, su `moments`/`calendar_entries`…) l'ordine dei trigger RI può far fallire in modo spurio la cancellazione dell'ultimo membro (INFERRED, da coprire con un test PGlite). In alternativa, §8 cancella esplicitamente prima i figli e poi la coppia.

## 5. Protezione dei dati del partner

- Regola invariante, verificata da test: **nessuna riga con autore o proprietario S viene cancellata** dal processo di L. Si confrontano i conteggi per S prima e dopo su tutte le tabelle con `couple_id`. Le uniche eccezioni sono documentate: righe di relazione di L verso S, come `calendar_reminders` e i messaggi programmati non consegnati.
- Gli elementi ricevuti da S restano (`recipient_id=NULL`). Le foto di S dentro i Momenti di L non subiscono più la cascata da `moment_photos.moment_id` (:6355).
- `shared_event_completions.completed_by` (NO ACTION, :6380): diventa nullable con `RESTRICT` e il worker lo imposta a `NULL`, così il completamento fatto insieme resta storia comune.
- Criterio: in PGlite, le righe di S, i suoi oggetti e i conteggi dell'altra coppia sono identici prima e dopo, in entrambe le modalità.

## 6. Dati personali e media da cancellare

- **Righe:** tutte quelle marcate `delete` in §4.1, più `auth.users` (via Admin API), sessioni e identità. Sorgente di verifica: le 78 FK di `fk-coverage-20261012.json` + l'elenco dei riassegnamenti in `claim_us_role` (`baseline.sql:3135-3160`, già un inventario completo delle colonne legate al profilo) + le tabelle per ruolo (§4.2.8).
- **Storage, solo tramite API Storage (mai SQL diretto su `storage.objects`):** prefisso `<couple>/<L>/` meno il keep-set. Comprende avatar (`profiles.avatar_path`), copertine e miniature dei Momenti, foto di album, `left/` (voce, video, foto), storie e, se `keep_shared=false`, foto home. La validazione dei path riusa `safePath` di `s3-2-media-inventory.cjs`.
- **Cache su altri dispositivi:** cache SW della PWA `us-private-media-v1` (P-08: servita senza ricontrollo fino al logout); snapshot dei widget Android. Il dispositivo di L viene pulito al logout forzato. Sul dispositivo di S gli oggetti cancellati restano in cache fino a 100 voci. Rischio residuo dichiarato nell'informativa e mitigabile post-1.0 con un purge via realtime.
- **Backup:** il piano Free non ha backup né PITR (08 §3.1). Testo raccomandato: "i dati eliminati possono persistere nei backup del fornitore fino a N giorni" con N = retention reale del piano scelto (D-8). Log Edge: nessun contenuto, retention del fornitore.
- Criterio: dopo `completed`, 0 righe con uid L in tutte le colonne inventariate; `list('<couple>/<L>/')` restituisce esattamente il keep-set (vuoto se `false`); `auth.users` senza L.

## 7. Isolamento della coppia dopo l'uscita (RLS e Storage)

| Soggetto | Deve vedere | Meccanismo |
|---|---|---|
| L durante il periodo di grazia | Nulla della coppia | Flag in `current_couple_id()` + controlli Edge |
| L dopo `completed` | Nulla (account inesistente) | Utente Auth eliminato |
| S | I propri dati + i contenuti conservati di L. Mai i dati personali di L, perché le righe e gli oggetti sono stati cancellati | Policy esistenti + verifica `list` |
| **Nuovo partner** che entra nella stessa `couple_id` | Senza regole: **tutto** lo storico (Momenti, calendario, keepsake con le risposte dell'ex attribuite al suo slot, oggetti Storage via `list`) | `accept_partner_invite` accetta quando `member_count=1` (`mc2_couple_invites.sql:204-208`) |
| Altre coppie | Nulla | Invariato |

**Regola di ri-accoppiamento raccomandata (D-5):** in v1 una coppia con `member_departed_at` non nullo è **chiusa a nuovi membri**. `create_partner_invite` e `accept_partner_invite` rifiutano con `couple_closed`; il client mostra l'archivio con un banner. Chi vuole un nuovo partner potrà farlo con un "nuovo spazio" post-1.0, cioè una nuova `couple_id` con l'archivio separato o esportato, oppure oggi eliminando il proprio account. Per la v1 non esiste un'alternativa sicura e minima: riassegnare lo slot esporrebbe dati di terzi.

**[Rev. ind.] Lacune della regola:**
1. `member_departed_at` viene scritto solo nel passo DB del worker. Durante il periodo di grazia, se L è **solo** nella coppia e ha un invito `pending`, un terzo U può accettarlo: `accept_partner_invite` controlla solo `member_count=1` e l'esistenza del creatore (`mc2_couple_invites.sql:203-208`). Il worker troverebbe poi due membri e tratterebbe l'uscita come singola, consegnando a U l'archivio di L. Al momento del blocco vanno quindi **revocati gli inviti pendenti** della coppia, e `accept_partner_invite` deve rifiutare se un membro qualsiasi della coppia di destinazione ha una richiesta di cancellazione attiva.
2. Tra il passo DB (profilo cancellato) e `deleteUser`, L può rientrare con la password: `get_couple_membership` restituisce `member:false` → `AUTHENTICATED_NO_PROFILE` → `create_couple`/`accept_partner_invite` creano un nuovo profilo con lo stesso uid. `deleteUser` poi lo cancella a cascata o resta bloccato dalle FK fail-closed. `private.mc2_require_account()` (`mc2_couple_invites.sql:10-23`) deve rifiutare ogni uid con una richiesta in `account_deletion_requests` non annullata. In più, da `due` in poi: ban Auth (`ban_duration`), che `mc2_require_account` già rispetta (`banned_until`).
3. `claim_us_role` (riassegnazione legacy di tutto lo storico, :3060-3163) è ritirata e riservata a `service_role` (:7107-7108). Il runbook deve vietarne l'uso.
4. Il sopravvissuto non può creare una nuova coppia: `create_couple` restituisce `already_member` (`mc2_couple_invites.sql:111-115`). Finché non esiste il "nuovo spazio", l'unica via verso un nuovo partner è eliminare il proprio account, perdendo l'archivio. Va scritto nell'informativa (D-5).

**Test:** (a) PGlite con l'harness `tests/helpers/mc2-db.js`: coppia A (F,B) e coppia B (U1,U2), U3 come potenziale nuovo partner. Si verifica che L, S, U3 e l'altra coppia vedano esattamente ciò che previsto, con policy RLS e `storage.foldername` simulati; l'invito dopo l'uscita fallisce. (b) **Una** verifica su staging con 4 account sintetici e oggetti innocui, riusando `scripts/s3-3-storage-jwt-readonly.cjs` e `s3-3-seed-and-verify-stage.cjs`. **Richiede autorizzazione del fondatore** (dati e Storage di staging).

## 8. Ultimo membro e cancellazione dell'intera coppia

- Se L è l'unico membro (coppia mai completata, oppure S rimasto dopo un'uscita precedente che ora elimina il proprio account), il worker cancella **l'intera coppia**: remove Storage dell'intero prefisso `<couple>/` (paginato), poi `DELETE couples`. Le 41 cascate qui sono volute. Infine `deleteUser`. L'archivio conservato di un ex viene eliminato con l'ultimo membro: va detto nell'informativa.
- Richieste di entrambi: l'advisory lock sulla coppia serializza i due processi. Il primo segue §4 come uscita singola, il secondo trova `member_count=1` ed esegue la cancellazione della coppia. Test di concorrenza in PGlite con due connessioni, o simulato in sequenza con assert sugli stati.
- Nessuna richiesta di un solo membro può cancellare la coppia mentre l'altro è presente (principio di #190 `neverDeleteEntireCoupleOnSingleAccountRequest`).

## 9. Export e separazione in v1 (minimo)

- **Export:** su richiesta via email entro 30 giorni (D-7). L'operatore usa `s3-2-export-core.mjs` + paging (riuso integrale e test) in uno script locale con service role ristretto all'uid verificato. I media vengono consegnati come link firmati a scadenza breve. Nella schermata di eliminazione si offre il link "Richiedi prima una copia dei tuoi dati". L'Edge `export-my-data` resta parcheggiata (staging-locked).
- **Separazione / unpair:** in v1 nessuna funzione separata (D-9). La separazione avviene tramite eliminazione dell'account, oppure su richiesta al supporto, che la tratta come eliminazione con `keep_shared` scelto. Chi esce può poi registrarsi di nuovo con la stessa email. Va dichiarato nell'informativa.

## 10. Piano di migrazione e coordinamento

1. **P-1 Preflight in sola lettura** (staging, poi produzione; autorizzazione richiesta per la lettura in produzione). Si riusano `foreign-key-preflight-20261012.sql` e `s3-3-staging-readonly-preflight-20261012.sql`, con in più: definizione di `storage.objects.owner/owner_id` e presenza di FK verso `auth.users`; `jwt_expiry`; conteggio delle righe per ruolo; ledger delle migrazioni (P-10: V3 non applicata in produzione). Si confronta con le 78 FK di staging: ogni differenza blocca.
2. **M-1 migrazione schema** (staging prima). Colonne di flag, tabelle `private.*`, `DROP NOT NULL` + `RESTRICT` (§4.4), nuovo `current_couple_id()`, chiusura degli inviti, policy DELETE per gli orfani, bypass controllato dei keepsake. È reversibile: `SET NOT NULL` di nuovo se nessuna riga è `NULL`, ripristino delle FK, ripristino della funzione. Nessuna riga reale cambia. Test PGlite verdi prima di chiedere l'**autorizzazione DDL staging**, poi quella di **produzione**.
3. **M-2 funzioni** (`request/cancel/operator_request/process_db`) e Edge (`request-account-deletion`, `process-account-deletions`, helper `requireActiveMember`). Deploy solo su staging, poi produzione con autorizzazione. Cron disattivato.
4. **Coordinamento con PR #180 (S2):** il trigger rifiuta UPDATE e INSERT senza JWT, ma non DELETE. Il piano usa solo DELETE su `daily_answers`, quindi è compatibile. Serve un test che applichi S2 + M-1 insieme.
5. **Coordinamento con PR #187 (Squadra 1):** `UNIQUE(token)` su `device_push_tokens` e la policy di ri-registrazione sono di competenza della Squadra 1. Questo piano si limita a **cancellare** le righe dell'utente. Non tocca la colonna né il vincolo, quindi non ci sono conflitti di file. **[Rev. ind.] Correzione:** il conflitto esiste. (a) `register_native_push_device` (`native_notifications_v1.sql:107`), `register_web_push_subscription` (:4917) e `register_push_token` (:4885) leggono `profiles.couple_id` senza il flag, e la ri-registrazione all'avvio è proprio l'area di #187 (`notifications.js`). Vanno modificati dopo #187. (b) In produzione `send-web-push`, `game-v2-push` e i worker girano già con il codice del branch #187 (deploy dell'11/10). Una PR-3 basata su `main` che aggiunge `requireActiveMember` a quelle funzioni, se distribuita, **annullerebbe la correzione P0 sulla privacy push**. #187 va quindi unita a `main` prima di PR-3/PR-4.
6. **Runbook operatore** (`docs/store/`, PR-5): verifica identità email, `operator_request…`, esecuzione manuale del worker, query SLA, gestione di `failed_needs_operator`, esclusione degli account demo del revisore Play e della coppia del fondatore da ogni test automatico.

## 11. Decisioni del fondatore richieste PRIMA di qualsiasi implementazione distruttiva

Ogni voce va registrata **parola per parola** in `docs/DECISIONS.md`: oggi Policy A esiste solo in testi scritti da agenti (08 §1 i).

| # | Decisione | Raccomandazione (solo proposta) |
|---|---|---|
| D-1 | Ratifica di Policy A in forma semplificata | "Se un membro elimina l'account, sceglie se i ricordi condivisi che ha creato restano al partner. I suoi dati personali vengono comunque eliminati." |
| D-2 | Valore predefinito se chi esce non sceglie (web/email senza risposta) | `keep_shared=false`: è la scelta più protettiva per chi esce e non tocca i dati del partner |
| D-3 | Periodo di grazia, reversibilità, SLA | 7 giorni, annullabile con login + "Annulla"; completamento promesso "entro 30 giorni" |
| D-4 | Cosa vede il partner | Avviso neutro in app all'inizio del blocco; etichetta "Account eliminato" sui contenuti; nessuna push |
| D-5 | Regola di ri-accoppiamento | Coppia chiusa dopo un'uscita; "nuovo spazio" post-1.0 |
| D-6 | Parole, voce e foto di chi esce nell'archivio del partner | Si conservano Momenti, foto, messaggi consegnati, keepsake e calendario condiviso (se `keep_shared`) finché il partner non li cancella o non elimina l'account. Lasciati-per-te (voce/video), storie, risposte giornaliere individuali, umore e posizione **sempre** eliminati |
| D-7 | Canale di export | Su richiesta via email entro 30 giorni; nessun export in app nella v1 |
| D-8 | Backup e piano Supabase | Passaggio a Pro prima del closed test; dichiarare la retention reale (es. 7 giorni); Free = "nessun backup" |
| D-9 | Separazione nella v1 | Solo tramite eliminazione o supporto; niente unpair self-service |
| D-10 | Revisione legale | Revisione privacy professionale del testo di informativa, pagina e Policy A prima della produzione (non blocca staging) |
| D-11 | Indirizzo di supporto e titolare del trattamento | Indirizzo dedicato; titolare = il fondatore come persona fisica, salvo società |
| D-12 | Account esclusi dai test | Coppia del fondatore e coppia demo del revisore mai usate nei test del worker |

## 12. Scomposizione in PR e riuso di #190

| PR | Contenuto | Dipende da | Sforzo (stima) |
|---|---|---|---|
| PR-0 | Testo di D-1…D-12 in `DECISIONS.md` (fondatore) | — | fondatore |
| PR-1 | Preflight in sola lettura + test PGlite "contratto" (FK fail-closed, isolamento, ruoli) scritti prima della migrazione | — | 1 g |
| PR-2 | M-1 schema + test PGlite a due coppie (adattati da #190) | PR-0, PR-1 | 2 g |
| PR-3 | Richiesta e blocco: RPC, Edge di richiesta, helper Edge, UI Impostazioni, stati client `PENDING_DELETION`/`PARTNER_DEPARTED`, etichetta autore | PR-2 | 2,5 g |
| PR-4 | Worker DB + Edge Storage/Auth + cancellazione dell'ultimo membro + runbook | PR-2 | 3 g |
| PR-5 | Pagina `/elimina-account`, sezione informativa, runbook email/export | PR-0 (testo) | 1 g |
| PR-6 | Collaudo su staging con 4 account sintetici + un telefono (APK di staging): richiesta → blocco → elaborazione → verifica Storage e invito | PR-3, PR-4, autorizzazione | 1 g |

Totale ≈ **10–11 giorni di sviluppo** (stima), escluse le attese per decisioni e autorizzazioni. Le PR-3 e PR-4 possono procedere in parallelo, su file diversi.

**Riuso di #190, file per file** (R = riuso, A = adattare, P = parcheggiare su #190, che resta aperta):

| File #190 | Esito | Uso |
|---|---|---|
| `docs/missions/us-store-s3-2-fk-coverage-20261012.json` | R | Baseline delle 78 FK; aggiungere il campo `resolution` per ciascuna |
| `tests/s3-2-fk-coverage.test.mjs` | A | Fallisce se una FK non ha risoluzione o se ne compare una nuova |
| `…foreign-key-preflight-20261012.sql`, `…s3-3-staging-readonly-preflight-20261012.sql` (+test) | R | P-1 |
| `tests/s3-2-account-exit-real-schema.test.js` | A | Asserzione invertita: la delete ingenua ora **fallisce** (RESTRICT) e nulla viene perso |
| `tests/s3-2-exit-impact-db.test.js`, `tests/s3-2-integrated-account-exit-db.test.js` | A | Stessa semina a due coppie, senza vault; si aggiunge U3 come nuovo partner e le modalità `keep_shared` true/false |
| `…stage1-exit-preview-draft.sql` (+test) | A | Base dell'anteprima "cosa verrà eliminato" mostrata prima della conferma (facoltativa) |
| `supabase/functions/_shared/s3-2-export-core.mjs`, `s3-2-export-paging.mjs` (+test) | R | Export su richiesta (§9) |
| `supabase/functions/export-my-data/index.ts` | P | Export in app post-1.0 |
| `s3-2-media-inventory.cjs` (+test) | A | `safePath` per validare i path del purge |
| `s3-2-media-copy-rehearsal.cjs` (+test) | P/A | Solo se P-1 mostra che `deleteUser` è bloccato dagli oggetti posseduti |
| `s3-2-preservation-a-preview.cjs` (+test) | A | La classificazione diventa la tabella §4.1 nel codice del worker |
| 4 draft vault `.sql` + 4 test DB | P | Riferimento |
| `…lifecycle-contract-20261012.json`, `tests/s3-2-lifecycle-design-gate.test.js`, `.github/workflows/s3-2-lifecycle-design.yml` | A | Il gate oggi verifica che **non** esista un backend di cancellazione (`design-gate.test.js:67`) e va riscritto per il nuovo contratto |
| `…lifecycle-risk-gates`, `…export-migration-plan`, `…partner-photo-reference-gate` `.md` | R | Riferimento storico |
| `scripts/s3-3-*` (seed, storage JWT, policy audit, ps1), `…storage-policy-baseline-20261012.json` (+test) | R | Guardia contro la deriva delle policy Storage + collaudo su staging PR-6 (autorizzato) |

**Verifiche su dispositivo reale ancora necessarie (non dichiarabili come superate senza prova):** logout forzato su Android dopo una richiesta fatta dalla PWA; assenza di push su un dispositivo di chi esce con l'app uccisa o offline; ritorno della schermata "Annulla" dopo un nuovo login; etichetta "Account eliminato" e stato archivio sul telefono del sopravvissuto; cache dei widget svuotate.

## Revisione indipendente

**Revisore:** agente indipendente (Opus), 2026-10-13. Solo lettura su `main` `9de2073`/`729ee93` e sui ref di #180, #187 e #190. Nessuna chiamata a Supabase. Le correzioni fattuali sono inserite nel testo sopra, marcate **[Rev. ind.]**. Riferimenti `:NNNN` = `supabase/migrations/20261004000000_us_2_0_baseline.sql`.

### R1. Affermazioni verificate

| # | Affermazione del piano | Esito | Evidenza |
|---|---|---|---|
| 1 | NOT NULL su `moments/moment_photos.created_by`, `shared_messages.sender/recipient`, `left_for_you.*`, `calendar_entries.created_by`, `shared_events.created_by`, `bucket_items.created_by`, `shared_event_completions.completed_by` | CONFIRMED (incompleto) | :550, :538, :745-746, :502-503, :178, :730, :158, :718. Manca `conserva_contributions.source_sender_id` :210 |
| 2 | CHECK `calendar_entries_owner_by_type_check`, `left_for_you_no_self_check` | CONFIRMED | :6131, :6248 |
| 3 | Trigger S2 di #180 rifiuta INSERT/UPDATE senza JWT, non DELETE | CONFIRMED | #180 `…us_v6_week_participation.sql:29-60` |
| 4 | `keepsakes_guard_update` immutabile; `bucket_items_guard_delete`; guardie `created_by` lasciano passare `NULL` | CONFIRMED (incompleto) | :1318-1325/:6527; :995-1007 (blocca anche `lived`); :1054, :1139. `lived_proposed_by` richiede il GUC (:1066-1070) |
| 5 | Policy UPDATE/DELETE con `created_by=auth.uid()` impediscono a S di cancellare | PARTIAL | Vero per `moments` :6731, `moment_photos` :6718, `calendar_entries` :6652. Falso per `shared_events` :6771-6779 e `bucket_items` :6641-6649 (tutta la coppia, anche in UPDATE). I Momenti sono già cancellabili da entrambi via `delete-moment` |
| 6 | Policy Storage: SELECT per coppia, DELETE/UPDATE solo proprietario, tutte via helper | CONFIRMED | :7310-7317. Bucket unico `us-media`, privato |
| 7 | `private.current_couple_id()` è l'unico punto di derivazione della coppia | **REFUTED** | Helper :1277-1283, ma ~15 RPC e `m11a_actor*` leggono `profiles` direttamente (R2) |
| 8 | Dopo la rimozione del profilo partner, MC3 mostra "Il tuo spazio è pronto" e riapre l'invito | CONFIRMED | `onboarding.js:22-30,155-157`; `get_couple_membership` `mc2_couple_invites.sql:235-255`; `create_partner_invite` :133-155 rigenera il codice dello slot libero |
| 9 | Rendering autore `NULL` → "Noi" | CONFIRMED | `app.js:2993,3119,3168`; `moments-albums.js:302`; `calendar.js:1151`; `left-for-you.js:271` |
| 10 | Tabelle per ruolo non coperte dalle FK | CONFIRMED (incompleto) | Mancano `daily_question_reveal_states`, `game_sessions.*_role`, `game_session_items.subject_role`, `bond_weekly_quests.confirmed_by uuid[]` |
| 11 | `delete-moment` legge `profiles.couple_id` con service role e cancella i media | CONFIRMED | `delete-moment/index.ts:33-50,59-82`. Nessun controllo sull'autore: chi esce, con un nuovo login, può cancellare **tutti** i Momenti di S |
| 12 | `accept_partner_invite` accetta con `member_count=1` | CONFIRMED | `mc2_couple_invites.sql:203-208` |
| 13 | Signed URL 6 h | PARTIAL | `app.js:365,373`; il widget home usa 24 h (`us-widget-state/index.ts:113`) |
| 14 | `UNIQUE(token)` su `device_push_tokens` | CONFIRMED | :390; più `installation_id` unico (`native_notifications_v1.sql:56`) |
| 15 | `jwt_expiry` non gestito in `config.toml` | CONFIRMED | `supabase/config.toml` (`[auth]` :7, nessun `jwt_expiry`) |
| 16 | Inventario `claim_us_role` = colonne legate al profilo | CONFIRMED | :3135-3163; funzione ritirata, `service_role` only :7107-7108 |
| 17 | `conserva_contributions` "resta" | **REFUTED** | `source_item_id → left_for_you CASCADE` :6309 + cancellazione sempre dei lasciati-per-te di L = perdita dei Conservati di S |
| 18 | Gate #190 vieta `deleteAccount` in settings | CONFIRMED | #190 `tests/s3-2-lifecycle-design-gate.test.js:66-67` |
| 19 | Le 78 FK di #190 bastano come inventario | PARTIAL | Coprono solo i genitori `auth.users/profiles/couples`. Mancano 6 FK tra contenuti rilevanti (§4.2.1) |

### R2. Percorsi di accesso che il flag nell'helper NON chiude

Il chiarimento più importante: dopo `signOut('global')` chi esce **può rientrare con la password**, perché serve per "Annulla". Ogni percorso qui sotto resta quindi aperto **per tutto il periodo di grazia**, non solo per la durata del JWT.

| Percorso | Dove | Effetto possibile durante il blocco |
|---|---|---|
| `private.m11a_actor()` / `m11a_actor_locked()` | :2255-2296, ~21 chiamanti (domande di coppia, Gioca v2, outcomes, `create/revoke_partner_invite`) | Lettura e scrittura nella coppia |
| `get_daily_state` | :4005-4019 | Lettura della risposta del partner |
| `get_partner_knowledge_hub`, `complete_partner_knowledge_deck`, `get_quiz_state`, `save_quiz_answer`, `get_weekly_game_sets`, `get_weekly_quiz_sets` | :4271, :3281, :4449, :5107, :4497, :4536 | Lettura/scrittura dei giochi di coppia |
| `complete_shared_event`, `ack_progression_unlock`, `equip_progression_reward`, `get_progression_v1` | :3330, :2917, :3742, :4320 | Scritture su XP e preferenze della coppia |
| `get_countdown_oggi_v1`, `save_countdown_oggi_v1` | `countdown_oggi_v1.sql:19,36` | Lettura/scrittura |
| `register_native_push_device`, `register_web_push_subscription`, `register_push_token` | `native_notifications_v1.sql:107`; :4917; :4885 | **Ri-registrazione push all'avvio** → chi esce riceve di nuovo le notifiche sull'attività di S per 7 giorni |
| Policy `weekly_quiz_rewards_same_couple_select` | :6808-6810 | Lettura (join su `profiles`) |
| `daily_answers_update_own` (solo `user_id`) + trigger S2 (cid da `profiles`) | :6697; #180 `…week_participation.sql:36` | L modifica risposte già rivelate a S; scatta `progression_daily_trigger` (:6526) |
| `messages_update_recipient` (USING senza helper) | :6786-6788 | Basso: WITH CHECK usa l'helper |
| Edge `delete-moment`, `send-web-push`, `game-v2-push`, `widget-device-token`, `spotify-search` | già nel piano | Coperti da `requireActiveMember` |
| Edge `us-widget-state`, `widget-think-send` | basati su token | Chiusi **solo** dalla cancellazione dei token, che quindi è obbligatoria (piano corretto) |
| Worker cron (`calendar-reminders`, `left-for-you-push`, `daily-question-push`, `game-v2-push-worker`, `monthiversary-job`) | service role | Inviano a chi esce se ri-registra un token. Consegnano a S i messaggi programmati di L durante la grazia |
| Accettazione dell'invito pendente di L da parte di un terzo | `mc2_couple_invites.sql:203-208` | Un terzo entra nella coppia in cancellazione (§7 Rev.) |
| Login tra passo DB e `deleteUser` | `get_couple_membership` → `create_couple`/`accept` | Nuovo profilo con l'uid di L (§7 Rev.) |
| Realtime `postgres_changes` | `app.js:4439`, `left-for-you.js:515`, `stories.js:912` | Filtrato da RLS → chiuso dal flag (INFERRED, da verificare su staging) |

**Correzione strutturale richiesta:** un unico helper `private.active_member()` (uid, couple, role) che verifica il flag, usato da `current_couple_id()`, da `m11a_actor*` e da **tutte** le funzioni elencate. A questo si aggiunge un test CI che scansiona `pg_proc` (o le migrazioni) e fallisce se una funzione SECURITY DEFINER legge `public.profiles` con `auth.uid()` senza passare dall'helper. In alternativa, più semplice ma da valutare: al blocco si sposta `profiles.couple_id` in una colonna privata e lo si imposta a `NULL`. Così tutti i percorsi esistenti falliscono chiusi, perché ognuno richiede `couple_id is not null`. Il prezzo: il ripristino con "Annulla" deve rimetterlo a posto, e `profiles_couple_id` partecipa all'indice unico `(couple_id, role)`.

### R3. RESTRICT vs SET NULL
- La scelta fail-closed è **corretta** come principio. Si raccomanda `NO ACTION` al posto di `RESTRICT` (§4.4 Rev.).
- Lacune: le 6 FK tra contenuti (§4.2.1 Rev.) e i trigger toccati dal worker. `bucket_items_guard_update` (GUC per `lived_proposed_by`), `bucket_items_guard_delete` (`lived`/`scheduled`), `calendar_entries_unschedule_bucket_items` (riporta a `idea` i desideri **di S** collegati a voci di L: modifica i dati di S, va dichiarato), `calendar_entries_guard_update` e `shared_events_touch_updated_at` (aggiornano `updated_at` quando si annulla l'autore), `keepsakes_guard_update`.
- Nessun trigger rilevato invia push o scrive in tabelle di altre coppie durante il worker. I trigger `progression_*` scattano su INSERT/UPDATE di colonne che il worker non tocca.

### R4. Ri-accoppiamento
`couple_closed` è necessario, ma va applicato **al blocco**, non solo a `member_departed_at`: va revocato l'invito pendente e `accept` deve controllare tutti i membri. In una coppia completa non esistono inviti pendenti (`create_partner_invite` restituisce `couple_full`, `mc2_couple_invites.sql:142-144`). Il rischio riguarda la coppia con un solo membro. Conseguenza per S: un solo profilo, una sola coppia, nessun nuovo partner senza perdere l'archivio (§7 Rev. punto 4).

### R5. Storage
- `deleteUser` con oggetti posseduti: INFERRED. Il blocco viene segnalato dalla community Supabase. Va trattato come **bloccante di P-1**. Il ripiego `move` potrebbe non cambiare `owner_id` (§4.2.5 Rev.).
- Dopo l'eliminazione, gli oggetti conservati restano con `owner_id=L`. S può cancellarli solo via service role: `delete-moment` copre già Momenti e album interi. Per le singole foto d'album, la foto home sostituita (resta orfana e visibile a S) e i Conservati serve un'estensione Edge.
- Finestra di esposizione: tra il passo DB e il passo Storage (anche giorni, con i retry) S può elencare e firmare oggetti di L le cui righe sono già cancellate, per esempio i media di storie scadute. **SHOULD:** rimuovere gli oggetti non conservati **prima** della transazione DB, oppure nello stesso passaggio, perché L è già bloccato.
- Cache: SW `us-private-media-v1` limitata a 100 voci (`service-worker.js:244-248`), cache delle signed URL in `localStorage` (`app.js:310-333`), snapshot dei widget. Il rischio residuo dichiarato è corretto.

### R6. GDPR e Google Play
- Conservare in loco il contenuto di L con una sua scelta esplicita, non preselezionata (D-2 = `false`), e l'opposizione sempre possibile è difendibile, a condizione della revisione D-10. Va però risolto un punto: dopo l'anonimizzazione (`created_by=NULL`) **nessuno può più ritrovare** il contenuto di L se più tardi L chiede di cancellarlo o revoca il consenso. Servono una decisione e una dichiarazione: o la scelta è definitiva e il contenuto passa all'archivio di S (base giuridica da indicare), oppure si tiene una mappatura privata `request_id → righe conservate`, con una retention dichiarata.
- La pagina web soddisfa i requisiti di Play (raggiungibile senza reinstallare l'app; l'accesso è ammesso) se riporta: **nome dell'app e dello sviluppatore come nella scheda Play**, i passaggi, i dati cancellati e quelli conservati (incluso il contenuto lasciato al partner), le retention (backup, ricevuta minima). Il flusso "Accedi ed elimina" dovrebbe essere una route web minima, non l'avvio completo della PWA (service worker, push, cache dei media).
- Grazia di 7 giorni + completamento entro 30 giorni: compatibile con l'art. 12(3) GDPR se dichiarato.

### R7. Sforzo e ordine delle PR
- 10–11 g è **sottostimato**. Il fix strutturale di R2 (~40 funzioni + test CI) da solo vale 2–3 g. A questo si aggiungono le 6 FK tra contenuti, i casi Conservati/completamenti/desideri `lived`, la gestione dei client vecchi e la pagina web minima. Stima realistica: **16–20 g** di sviluppo, escluse le attese.
- Ordine vincolante: **#187 unita** (deriva in produzione e conflitto sulla registrazione push) → risoluzione della deriva del ledger delle migrazioni (P-10) → #180 (trigger S2, migrazione `20261009185803`) → M-1. #189 tocca `app.js` (auth solo su staging): da coordinare con gli stati client di PR-3, e il recupero password serve al ripiego email. Il gate CI di #190 va riscritto nella stessa PR che introduce la UI.
- Client vecchi: un S con un'APK precedente finisce in `MEMBER_WAITING_PARTNER` senza archivio. Serve una versione minima forzata prima di attivare la cancellazione.

### R8. Decisioni del fondatore mancanti
D-13 Conservati di S (lasciati-per-te di L conservati da S): restano o si perdono. D-14 Con `keep_shared=false`: eventi con completamenti e desideri `lived` di L (guscio o cancellazione della storia comune). D-15 Messaggi programmati di L che si sbloccano durante la grazia: consegnarli o sospenderli; S può ancora inviare a L durante la grazia? D-16 Cancellazione successiva del contenuto conservato su richiesta di L (definitività o mappatura privata, con retention). D-17 Retention della ricevuta minima `account_deletion_requests`. D-18 Autorizzazione permanente dell'operatore a eseguire il runbook in produzione (AGENTS vieta modifiche ai dati reali senza autorizzazione). D-19 Versione minima dell'app prima dell'attivazione.

### R9. Modifiche richieste

**MUST, prima dell'implementazione:**
1. Helper unico per il membro attivo, applicato a tutte le funzioni e policy di R2 (incluse le RPC di registrazione push e `m11a_actor*`), più un test CI anti-regressione su `pg_proc`.
2. `request_account_deletion` non chiamabile direttamente da `authenticated` (o con verifica `amr` nella funzione), così la ri-autenticazione non si può aggirare.
3. Al blocco: revocare gli inviti pendenti. `accept_partner_invite` deve rifiutare le coppie con un membro in cancellazione, e `mc2_require_account` deve rifiutare gli uid con una richiesta attiva. Ban Auth da `due`.
4. Gestire le 6 FK tra contenuti non coperte da #190 e i trigger di R3. Correggere la contraddizione su `conserva_contributions` (D-13) e su `shared_events` con completamenti (D-14).
5. Usare FK `NO ACTION` (o un ordine esplicito figli→coppia in §8), con un test PGlite sulla cancellazione dell'ultimo membro.
6. Unire #187 prima di qualsiasi modifica alle Edge di push o alle RPC di registrazione. Nessun deploy di Edge da `main` finché c'è la deriva.
7. P-1 deve provare `deleteUser` con oggetti posseduti e il ripiego `copy+remove`, prima di confermare la conservazione in loco.

**SHOULD:**
1. Storage dei non conservati rimosso prima della transazione DB.
2. Flag in una tabella privata invece che in `profiles` (visibile al partner).
3. Route web minima per "Accedi ed elimina".
4. Gestire i contenuti e gli identificatori senza FK: `bond_weekly_quests.confirmed_by`, snapshot di titoli e `context`.
5. Dichiarare che S può modificare `shared_events`/`bucket_items` di L, oppure restringerlo.
6. Versione minima del client.
7. Stima rivista a 16–20 g.

### Verdetto
**APPROVE WITH CHANGES.** L'architettura (conservazione in loco, scelta esplicita di chi esce, FK fail-closed, coppia chiusa, worker idempotente) è corretta e preferibile ai vault di #190. Il meccanismo di blocco però, così com'è scritto, **non è fail-closed**: lascia aperti per 7 giorni diversi percorsi di lettura e scrittura e la ri-registrazione delle push. L'inventario contiene inoltre due contraddizioni che causerebbero perdita di dati del sopravvissuto (Conservati) o il blocco del worker (eventi con completamenti). Gli MUST 1–7 vanno incorporati nel piano e nei test contratto PR-1 prima di chiedere l'autorizzazione DDL su staging.
