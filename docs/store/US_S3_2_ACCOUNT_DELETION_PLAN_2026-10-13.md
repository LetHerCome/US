# US 1.0 — Piano tecnico consolidato: cancellazione account (Squadra 3, S3.2)

**Data:** 2026-10-13 · **Tipo:** piano, nessuna implementazione · **Base:** `main` `9de2073` (+ roadmap `729ee93`), PR #190 `c4568b0` (letta, non modificata), PR #180 `c5602b6` (solo per l'interazione con il trigger S2).
**Vincoli:** nessuna operazione distruttiva, nessuna chiamata a Supabase, PR #190 resta aperta: il suo lavoro viene riusato (§12). Le stime di sforzo sono **stime**. "INFERRED" indica un ragionamento non ancora verificato su un ambiente reale.

## 0. Sintesi della raccomandazione

1. **Conservazione in loco, non vault.** Il contenuto condiviso che chi esce decide di lasciare resta nelle tabelle originali, con l'autore anonimizzato (`NULL`). Il bucket `us-media` è già leggibile da tutta la coppia (`baseline.sql:7314`), quindi non serve copiare file. I quattro vault di #190 vengono parcheggiati.
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

**Criteri di accettazione:** un utente può creare solo la propria richiesta; una richiesta per un altro uid o coppia è impossibile; una richiesta ripetuta non crea duplicati; senza ri-autenticazione la chiamata viene rifiutata; la pagina web è raggiungibile senza login e il suo testo coincide con il comportamento reale. **Sforzo (stima):** 1,5 g, UI esclusa (+0,5 g UI, +0,5 g pagina).

## 2. Effetti immediati (stato `locked`)

| Effetto | Meccanismo | Evidenza / nota |
|---|---|---|
| Blocco dei dati di coppia | Nuova colonna `profiles.deletion_requested_at`. `private.current_couple_id()` diventa `... where id=auth.uid() and deletion_requested_at is null`. Tutte le policy di coppia (moments, messages, calendar, storage…) restituiscono 0 righe **anche con un JWT ancora valido** | Helper: `baseline.sql:1277-1283`. Policy Storage: `:7310-7317` |
| Edge con service role | Le funzioni con service role ignorano RLS, quindi serve un helper condiviso `requireActiveMember()` che verifichi il flag. Si applica a `delete-moment` (che legge `profiles.couple_id` con il client admin, `index.ts:34-48`), `send-web-push`, `game-v2-push`, `widget-device-token`, `spotify-search` e alla futura export | Senza questo controllo chi è in uscita potrebbe ancora cancellare Momenti del partner tramite `delete-moment` |
| RPC MC2 | `get_couple_membership` restituisce `{member:false, pending_deletion:true}`; `create/accept/revoke_partner_invite` rifiutano la chiamata | `mc2_couple_invites.sql:235-255` |
| Sessioni | L'Edge di richiesta chiama `auth.admin.signOut(jwt,'global')`, che revoca i refresh token di tutti i dispositivi. L'access JWT resta valido fino alla scadenza (default 3600 s, INFERRED: `jwt_expiry` non è gestito in `config.toml`), ma il flag lo rende innocuo. Nei canali email/operatore il worker revoca le sessioni lato server | Signed URL già emesse restano valide fino a 6 h (`app.js:365,373`, `21600`): rischio residuo dichiarato |
| Push | Nella stessa transazione si cancellano le righe in `device_push_tokens` e `push_subscriptions` dell'utente. Il client esegue `revokeCurrentDevice()` (`app.js:792-802`) sul dispositivo corrente | `UNIQUE(token)` (`baseline.sql:390`): coordinamento con la Squadra 1 (§10) |
| Widget | Cancellazione di `widget_tokens`, `widget_action_tokens`, `widget_scriptable_*` dell'utente. `us-widget-state` non ricontrolla l'appartenenza alla coppia (P-11), quindi la cancellazione delle righe è obbligatoria | Il client pulisce lo store Android cifrato (`UsWidgetCredentialStore.clearAll`) |
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
| `shared_events` di L (:6384), `bucket_items` di L (:6299) | condiviso | resta, `NULL`; anche `lived_proposed_by` (senza FK) va a `NULL` | delete; per i desideri collegati serve sgancio preliminare (`bucket_items_guard_delete`) |
| `shared_event_completions.completed_by` (NO ACTION :6380) | storia comune | `NULL` | `NULL` |
| `daily_question_keepsakes` (risposte copiate per ruolo :310-311) | creato insieme | resta | colonna di L redatta (`''` + marcatore); serve un bypass controllato del trigger `keepsakes_guard_update` |
| `daily_question_outcomes`, `couple_questions` (`author_role`), `game_session_answers`/`sides` (`actor_role`) | creato insieme, per ruolo | resta | delete delle righe del ruolo di L |
| `game_sessions`, `game_session_items`, `living_provenance`, `relationship_milestones`, `bond_*`, `couple_reward_unlocks`, `couples.bond_xp` | coppia, non personale | resta | resta |
| `progression_events.actor_id`, `activity.actor_id`, `couple_invites.*` (già SET NULL) | operativo | `NULL`; delete delle righe `activity` di L (il `payload` jsonb può contenere testo) | idem |
| `conserva_contributions` (:6307/:6310) | di S | resta, `source_sender_id=NULL` | idem |
| `couples.home_photo_path` caricata da L | condiviso | resta | oggetto rimosso e colonna a `NULL` |

Il nome di chi esce scritto liberamente nelle didascalie del partner **non** viene modificato: è contenuto del partner.

### 4.2 Perché il solo `SET NULL` non basta (evidenze)

1. **NOT NULL:** `moments.created_by`, `moment_photos.created_by`, `shared_messages.sender_id/recipient_id`, `left_for_you.*`, `calendar_entries.created_by`, `shared_events.created_by`, `bucket_items.created_by` e `shared_event_completions.completed_by` sono `not null` (`baseline.sql:547-555, 534, 742, 499, 173, 727, 155, 713`). `SET NULL` fallirebbe e farebbe abortire l'intera eliminazione.
2. **CHECK:** `calendar_entries_owner_by_type_check` (:6131) richiede `owner_id` sulle voci personali. `left_for_you_no_self_check` (:6248) con `NULL` passa, ma solo per caso.
3. **Trigger:** S2 di #180 rifiuta ogni UPDATE di `daily_answers` senza `auth.uid()` (#180 `…week_participation.sql:29-60`); `keepsakes_guard_update` rende immutabili i keepsake (:6527); `bucket_items_guard_delete` blocca la cancellazione dei desideri collegati (:6519). Le guardie su `created_by` (:1054, :1139) oggi lasciano passare `NULL` solo perché `NULL <> x` vale NULL: serve un test esplicito.
4. **RLS:** update e delete richiedono `created_by = auth.uid()` (`moments_delete_own` :6731, `moment_photos_delete_own` :6718, `calendar_entries_delete_shared` :6652). Il sopravvissuto **non potrebbe cancellare la propria copia** dei ricordi rimasti. Serve una policy di sola DELETE `created_by is null and couple_id=current_couple_id()` su moments, moment_photos, calendar_entries condivise, shared_events e bucket_items. La modifica resta vietata, così il testo di chi esce non viene riscritto.
5. **Storage:** gli oggetti restano in `<couple>/<L>/…` con `owner_id=L`; `us_media_delete_own` (:7310) li rende non cancellabili dal sopravvissuto. Per i Momenti esiste già `delete-moment` con service role (`index.ts:59-77`). Per le foto di album e le copertine serve un'estensione dello stesso Edge. INFERRED da verificare su staging per primo (P-1): se `auth.admin.deleteUser` fallisce quando l'utente possiede ancora oggetti, gli oggetti conservati vanno spostati con l'API Storage `move` in `<couple>/<S>/…` e le righe aggiornate. Questo riusa la logica di path di `s3-2-media-copy-rehearsal.cjs`.
6. **Accesso effettivo:** dopo la cancellazione del profilo, `get_couple_membership` restituisce `partner_joined:false` e il client porta il sopravvissuto alla schermata "Il tuo spazio è pronto, invita la tua persona" (`onboarding.js:29,155-157`). **I ricordi conservati diventano irraggiungibili** e l'invito di un nuovo partner si riapre. Serve lo stato `PARTNER_DEPARTED`, che apre l'app normale con un banner e senza invito.
7. **Rendering:** con autore `NULL` il client mostra **"Noi"** (`app.js:2993,3119,3168`; `moments-albums.js:302`), cioè attribuisce a entrambi un contenuto di chi è uscito. In `calendar.js:1151` e `left-for-you.js:271` serve un'etichetta esplicita (es. "Account eliminato", D-4).
8. **Ruoli per slot (`'francesco'/'beatrice'`):** keepsake, outcomes, risposte di gioco, `couple_questions` e `living_provenance` sono legati al **ruolo**, non all'uid. Queste tabelle sono assenti dalle 78 FK di #190 e `SET NULL` non le tocca. Un nuovo partner che occupa lo stesso slot apparirebbe come autore delle risposte dell'ex (§7).
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
5. **Coordinamento con PR #187 (Squadra 1):** `UNIQUE(token)` su `device_push_tokens` e la policy di ri-registrazione sono di competenza della Squadra 1. Questo piano si limita a **cancellare** le righe dell'utente. Non tocca la colonna né il vincolo, quindi non ci sono conflitti di file.
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
