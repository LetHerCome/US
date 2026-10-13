# US 1.0 — Piano tecnico consolidato: cancellazione account (Squadra 3, S3.2)

**Data:** 2026-10-13 · **Tipo:** piano, nessuna implementazione · **Stato:** consolidato con la revisione indipendente (verdetto *approve with changes*: tutti i MUST sono integrati, §13).
**Base:** `main` `9de2073` (+ roadmap `729ee93`); PR #190 `c4568b0` (letta, non modificata, resta aperta: il suo lavoro viene riusato, §12); PR #180 `c5602b6` e #187 `8b0a0ec` solo per il coordinamento.
**Convenzioni:** `:NNNN` indica una riga di `supabase/migrations/20261004000000_us_2_0_baseline.sql`. "INFERRED" indica un ragionamento non ancora verificato su un ambiente reale. Gli sforzi sono **stime**. Nessuna operazione distruttiva e nessuna chiamata a Supabase sono state eseguite per questo piano.

## 0. Sintesi

1. **Conservazione in loco, non vault.** Il contenuto condiviso che chi esce (L) decide di lasciare resta nelle tabelle originali, con l'autore a `NULL`. Lo Storage è già leggibile da tutta la coppia (:7314), quindi non si copia nessun media. Condizione: il preflight P-1 deve dimostrare che `deleteUser` non è bloccato dagli oggetti posseduti (§4.5). I quattro vault di #190 restano parcheggiati.
2. **Scelta esplicita di L, non preselezionata:** "lascia al partner (S) i ricordi condivisi che ho creato" (`keep_shared=true`) oppure "eliminali". Sostituisce la revisione per singolo elemento di #190.
3. **Blocco davvero fail-closed:** un unico helper `private.active_member()` usato da *tutte* le funzioni e policy che derivano la coppia, più un test CI su `pg_proc`. Basta un flag in `current_couple_id()` **non** è sufficiente: L può rientrare con la password per tutto il periodo di grazia (§2).
4. **Il solo `SET NULL` non basta** (§4.2). Servono: FK *fail-closed* `NO ACTION` (comprese 6 FK tra contenuti non coperte da #190), gestione esplicita di ogni tabella (anche quelle per ruolo e gli array), trigger con bypass mirati, stato client `PARTNER_DEPARTED`, coppia chiusa a nuovi membri e pulizia di Storage solo tramite API.
5. **Flusso:** richiesta (app, route web minima, email) → blocco immediato (inviti revocati, push, widget e posizione cancellati) → 7 giorni di grazia → ban → worker idempotente (Storage, poi DB, poi Auth) → completamento entro 30 giorni.
6. **Prerequisiti di ordine:** #187 unita → deriva del ledger risolta (P-10) → #180 → migrazione M-1. Stima rivista: **16–20 giorni** di sviluppo.

## 1. Richiesta di cancellazione e verifica dell'identità

| Canale | Meccanismo | Verifica identità |
|---|---|---|
| **In app** (Android + PWA) | Impostazioni → "Privacy e dati" → "Elimina account" (`settings.js:549-558`). Schermata con gli effetti, la scelta `keep_shared` (nessuna opzione preselezionata), il campo password e la conferma. Il client esegue `signInWithPassword` e poi chiama l'Edge `request-account-deletion` (`verify_jwt=true`) | L'Edge controlla nel JWT il claim `amr` del metodo `password` (≤ 300 s; formato INFERRED, da verificare su staging) |
| **Web** (requisito Play) | Pagina pubblica `/elimina-account`: nome dell'app e dello sviluppatore come nella scheda Play, passaggi, dati cancellati, dati conservati (incluso il contenuto lasciato al partner), retention (backup, ricevuta). Pulsante "Accedi ed elimina" verso una **route web minima** (login + conferma), non l'avvio completo della PWA: niente service worker, push o cache media. Va verificato che la navigazione del SW non intercetti la route | Come in app |
| **Email** (ripiego: password dimenticata, telefono perso; il recupero #189 non è in produzione) | L'operatore risponde **all'email dell'account** con un codice monouso e la domanda `keep_shared`. Alla conferma esegue `private.operator_request_account_deletion(uid,'email',keep_shared)` secondo il runbook (autorizzazione permanente D-18) | Controllo della casella dell'account; nessuna richiesta del partner per conto di L |

**Oggetti nuovi:**
- `private.account_lifecycle(user_id pk, couple_id, role, state, keep_shared, channel, requested_at, due_at, attempts, last_error_code, completed_at)`. Lo stato vive in uno **schema privato**, non in `profiles` (che il partner può leggere, :6756). Nessuna FK verso `auth.users`, così la riga sopravvive come ricevuta minima (retention D-17). RLS forzata, nessun grant ai client.
- `private.account_deletion_objects(user_id, path, disposition)` e `private.account_deletion_retained(user_id, table_name, row_id)` (mappatura temporanea del contenuto conservato, D-16).
- **Esecuzione delle RPC:** `request_account_deletion(uid, keep_shared, channel)` e `cancel_account_deletion(uid)` sono **eseguibili solo da `service_role`** e vengono chiamate dall'Edge dopo la verifica `amr`. Se fossero eseguibili da `authenticated`, un JWT rubato o vecchio potrebbe saltare la ri-autenticazione via PostgREST. Entrambe sono idempotenti e `cancel` vale solo in stato `locked` prima di `due_at`. Nessun grant UPDATE aggiuntivo su `profiles`: oggi `authenticated` può aggiornare solo `avatar_path` (:6932), e la deriva va tenuta allineata con il controllo MC2 (`mc2_couple_invites.sql:408-411`).

**Accettazione:** solo per sé stessi; nessun duplicato; senza `amr` recente la richiesta è rifiutata; `authenticated` non può eseguire la RPC (test con `has_function_privilege`); la pagina e la route sono raggiungibili senza l'app e il testo coincide con il comportamento reale.

## 2. Blocco immediato (stato `locked`)

### 2.1 Perché un flag nell'helper non basta

Dopo `signOut('global')`, L **può rientrare con la password**, perché serve per "Annulla". Ottiene così un nuovo JWT valido e ogni percorso che non controlla il blocco resta aperto per **7 giorni**. Percorsi verificati che oggi leggono `profiles.couple_id` direttamente, senza `current_couple_id()`:

| Percorso | Dove |
|---|---|
| `private.m11a_actor()` / `m11a_actor_locked()` (23 occorrenze: domande di coppia, Gioca v2, outcomes, `create/revoke_partner_invite`) | :2255-2296 |
| `get_daily_state` (legge la risposta del partner), `get_quiz_state`, `save_quiz_answer`, `get_partner_knowledge_hub`, `complete_partner_knowledge_deck`, `get_weekly_*_sets` | :4005-4019, :4437, :5107, :4271, :3281, :4497, :4536 |
| `complete_shared_event`, `ack_progression_unlock`, `equip_progression_reward`, `get_progression_v1`; `get/save_countdown_oggi_v1` | :3319, :2917, :3742, :4320; `countdown_oggi_v1.sql:19,36` |
| `register_native_push_device`, `register_web_push_subscription`, `register_push_token`: **la ri-registrazione all'avvio riattiverebbe le push dell'attività di S verso L** | `native_notifications_v1.sql:107`; :4902; :4865 |
| Policy `weekly_quiz_rewards_same_couple_select` (join su `profiles`); `daily_answers_update_own` + trigger S2 (L modifica risposte già rivelate a S); `messages_update_recipient` (USING) | :6807-6810; :6697, #180 `…week_participation.sql:36`; :6786 |
| Edge service-role `delete-moment` (nessun controllo sull'autore: L potrebbe cancellare **tutti** i Momenti di S), `send-web-push`, `game-v2-push`, `widget-device-token`, `spotify-search` | `delete-moment/index.ts:33-50,59-82` |
| Edge a token `us-widget-state`, `widget-think-send` | Si chiudono solo cancellando i token |
| Worker cron (reminder, left-for-you, domanda del giorno, game-v2, monthiversary) | Inviano a token ri-registrati; consegnano i messaggi programmati di L |

### 2.2 Meccanismo (MUST 1, 3)

| Effetto | Meccanismo |
|---|---|
| **Helper unico** | `private.active_member()` restituisce `(uid, couple_id, role)` solo se `auth.uid()` ha un profilo **e** nessuna riga `account_lifecycle` attiva. `current_couple_id()`, `m11a_actor*` e **tutte** le funzioni e policy di §2.1 vengono riscritte sopra l'helper; sono circa 40 oggetti. Le policy che controllano il *destinatario* (`messages_insert_own` :6780, `left_for_you_insert_own` :6710) verificano anche che il partner sia attivo: S non può più inviare a L durante la grazia (D-15) |
| **Guardia CI** | Test che rigenera lo schema (PGlite) e scansiona `pg_proc` (`prosrc`) e `pg_policies`: fallisce se un oggetto SECURITY DEFINER o una policy legge `public.profiles` insieme a `auth.uid()` senza passare da `active_member()`. Una allowlist esplicita copre MC2 e l'helper stesso |
| **Edge** | Helper condiviso `_shared/require-active-member` (chiama un'RPC `service_role` che legge `account_lifecycle`), usato da tutte le Edge con JWT. Va applicato **dopo il merge di #187** (§10) |
| **Inviti** | Nella transazione di blocco si revocano gli inviti pendenti della coppia. `accept_partner_invite` rifiuta se un membro qualsiasi della coppia di destinazione ha una riga attiva (oggi controlla solo `member_count=1` e il creatore, `mc2_couple_invites.sql:203-208`). `private.mc2_require_account()` (`:10-23`) rifiuta gli uid con una riga non annullata, così `create_couple`/`accept` non possono ricreare un profilo con l'uid di L |
| **Sessioni** | L'Edge di richiesta esegue `auth.admin.signOut(jwt,'global')`. L'access JWT resta valido fino alla scadenza (default 3600 s; `jwt_expiry` non è in `config.toml`), ma l'helper lo rende innocuo |
| **Ban** | Da `due`, il worker imposta `ban_duration` tramite l'Admin API. `mc2_require_account` già rispetta `banned_until` (`:18`). Il login dopo la grazia non è più possibile |
| **Push, widget, posizione** | Delete delle righe di L in `device_push_tokens`, `push_subscriptions`, `widget_tokens`, `widget_action_tokens`, `widget_scriptable_*`, `couple_locations` (in realtime, :7281). Sul dispositivo corrente il client esegue `revokeCurrentDevice()` (`app.js:792-802`) e il plugin widget `clearAll` (`UsWidgetCredentialStore.clear()` + `UsWidgetStore.clearAll()`) |
| **Messaggi programmati** | Gli `shared_messages` di L con `unlock_at>now()` vengono cancellati al blocco: non consegnati, decisione D-15 |
| **Membership** | `get_couple_membership` restituisce a L `{member:false, pending_deletion:true, due_at}` (schermata unica "Eliminazione programmata il …" con "Annulla"); a S restituisce `partner_state:'departing'` (avviso neutro, nessuna push, D-4) |
| **Residui dichiarati** | Signed URL già emesse: 6 h (`app.js:365,373`) e 24 h per la foto home del widget (`us-widget-state/index.ts:113`). Realtime filtrato da RLS: chiuso dall'helper (INFERRED, verifica su staging) |

**Accettazione (PGlite):** con un **nuovo** JWT di L ottenuto dopo il blocco, ogni RPC e policy dell'elenco restituisce 0 righe o un errore; la registrazione push fallisce; `delete-moment` restituisce 403; un terzo non può accettare un invito della coppia; S e l'altra coppia restano invariati; il test CI fallisce se si aggiunge una funzione che legge `profiles` senza l'helper.

## 3. Worker e macchina a stati

- **Componenti:** `private.process_account_deletion_db(user_id)` (SECURITY DEFINER, solo `service_role`, **una transazione**, `pg_advisory_xact_lock` sulla coppia) ed Edge `process-account-deletions` (`verify_jwt=false`, chiave cron in Vault come gli altri worker). Il cron parte **disattivato**: l'operatore lo esegue con il runbook e lo attiva solo dopo il collaudo su staging.
- **Stati:** `locked → due (ban) → planned → storage_done → db_done → auth_deleted → completed`, più `failed_retryable` (backoff) e `failed_needs_operator` (5 tentativi). Ogni passo è idempotente.
- **Ordine (Storage prima del DB):**
  1. **`planned`:** sotto lock, lettura delle righe e calcolo del *keep-set* (oggetti referenziati dal contenuto conservato) e del *delete-set* = `list('<couple>/<L>/')` − keep-set, salvato in `account_deletion_objects`.
  2. **`storage_done`:** `remove` paginato del delete-set tramite l'API Storage. Il passo si chiude solo quando una nuova `list` restituisce esattamente il keep-set. Prima del DB, così S non può elencare né firmare oggetti di L le cui righe sono già sparite: la SELECT Storage vale per tutta la coppia.
  3. **`db_done`:** gestione per tabella (§4), `couples.member_departed_at=now()`, delete del profilo.
  4. **`auth_deleted`:** `auth.admin.deleteUser`; un 404 conta come successo.
  5. **`completed`:** restano solo id, date, canale e stato.
- **Fallimento a metà:** il DB è atomico, quindi S non vede stati parziali. Un errore Storage lascia L bloccato e la richiesta viene ritentata. Una FK `NO ACTION` violata (tabella dimenticata) produce `failed_needs_operator` senza perdita di dati. Una query SLA (`requested_at + 30 g`) segnala i ritardi.
- **Scadenza:** "entro 30 giorni dalla richiesta" (pubblica); obiettivo interno ≤ 1 giorno dopo `due_at`.

## 4. Conservazione lecita del contenuto condiviso

### 4.1 Classificazione per tabella (L = chi esce, S = sopravvissuto)

| Tabella (FK) | Classe | `keep_shared=true` | `keep_shared=false` |
|---|---|---|---|
| `profiles` (:6364) | personale | delete + avatar | delete + avatar |
| `couple_locations`, `moods`, `quiz_responses`, `partner_knowledge_attempts`, `notification_preferences`, `progression_reward_views`, `story_views`, `push_event_log`, token/widget, `calendar_reminders` da/per L, `think_reactions` di L | personale | delete | delete |
| `daily_answers` (:6329) | personale | **delete**: mai UPDATE, perché il trigger S2 lo blocca senza JWT | delete |
| `stories` (+oggetti), `left_for_you` di L **non conservati** da S | personale effimero | delete | delete |
| `left_for_you` di L **conservati** da S (`conserva_contributions.source_item_id` → CASCADE :6309) | condiviso, scelto da S | resta (riga + media, `sender_id=NULL`) | delete; i Conservati di S si perdono (D-13). Va corretto il client che oggi blocca l'intera vista se manca una sorgente (`moments-albums.js:1066-1069`) |
| `left_for_you` / `shared_messages` di S verso L | di S | resta, `recipient_id=NULL` | idem |
| `shared_messages` di L già consegnati | condiviso | resta, `sender_id=NULL` | delete (+ `think_reactions` a cascata, :6392) |
| `moments` di L (:6357) | condiviso | resta, `created_by=NULL` | delete; se contiene foto di S, il guscio resta e la prima foto di S diventa copertina; `living_provenance.target_moment_id` CASCADE (:6352) va dichiarato |
| `moment_photos` di L / di S nei Momenti di L | condiviso / di S | resta `NULL` / resta | delete / **resta** |
| `calendar_entries` personali di L | personale | delete (CHECK :6131) | delete |
| `calendar_entries` condivise di L (:6301) | condiviso | resta, `created_by=NULL` | delete; `bucket_items.calendar_entry_id` RESTRICT (:6297) e il trigger `unschedule_bucket_items` riportano a `idea` i desideri **di S** collegati: è una modifica ai dati di S, va dichiarata |
| `shared_events` di L (:6384) | condiviso | resta, `NULL` | resta come guscio anonimo se ha completamenti (`event_id` RESTRICT :6382, storia comune); altrimenti delete (D-14) |
| `bucket_items` di L (:6299) | condiviso | resta, `NULL`; `lived_proposed_by` a `NULL` con GUC `us.bucket_items_lived_confirm` (:1066-1070) | `idea`/`archived` → delete; `lived`/`scheduled` → guscio anonimo, perché la guardia :1002 ne vieta la delete (D-14) |
| `shared_event_completions.completed_by` (NO ACTION :6380) | storia comune | `NULL` | `NULL` |
| `daily_question_keepsakes` (risposte per ruolo :310-311) | creato insieme | resta | colonna del ruolo di L redatta con bypass mirato di `keepsakes_guard_update` (:1318) |
| `daily_question_outcomes`, `couple_questions` (`author_role`), `game_session_answers`/`sides`, `daily_question_reveal_states` (`actor_role`) | creato insieme, per ruolo | resta | delete delle righe del ruolo di L; `couple_questions` solo se non referenziata da `game_session_items.source_question_id` (NO ACTION :6341), altrimenti testo redatto |
| `game_sessions` (`started_by_role`, `subject_heavy_role`), `game_session_items` (`subject_role`, `context` jsonb), `living_provenance` (`source_title`), `shared_event_completions.event_title_snapshot` | coppia, con **copie di testo** | resta | resta; le copie di testo di contenuti cancellati sono dichiarate (redazione post-1.0) |
| `bond_weekly_quests.confirmed_by uuid[]` (senza FK) | operativo | uid di L rimosso dall'array | idem |
| `progression_events.actor_id`, `activity.actor_id`, `couple_invites.*` (già SET NULL) | operativo | `NULL`; delete delle righe `activity` di L (il `payload` può contenere testo) | idem |
| `conserva_contributions.source_sender_id` (:210 NOT NULL, :6310) | di S | `NULL` | riga di S cancellata con la sorgente (D-13) |
| `relationship_milestones`, `bond_*`, `couple_reward_unlocks`, `couples.bond_xp` | coppia | resta | resta |
| `couples.home_photo_path` caricata da L | condiviso | resta | oggetto rimosso, colonna `NULL` |

Il nome di L scritto liberamente nel contenuto di S non viene modificato.

### 4.2 Perché il solo `SET NULL` non basta (evidenze verificate)

1. **NOT NULL:** `moments.created_by` (:550), `moment_photos.created_by` (:538), `shared_messages.sender/recipient` (:745-746), `left_for_you.*` (:502-503), `calendar_entries.created_by` (:178), `shared_events.created_by` (:730), `bucket_items.created_by` (:158), `shared_event_completions.completed_by` (:718), `conserva_contributions.source_sender_id` (:210).
2. **FK tra contenuti fuori dall'inventario #190**, che copre solo i genitori `auth.users/profiles/couples`: `shared_event_completions.event_id` RESTRICT (:6382), `bucket_items.calendar_entry_id` RESTRICT (:6297), `game_session_items.source_question_id` NO ACTION (:6341), `conserva_contributions.source_item_id` CASCADE (:6309), `think_reactions.message_id` CASCADE (:6392), `living_provenance.target_moment_id` CASCADE (:6352).
3. **CHECK:** `calendar_entries_owner_by_type_check` (:6131); `left_for_you_no_self_check` (:6248) passa con `NULL` solo per caso.
4. **Trigger toccati dal worker:** S2 (#180, INSERT/UPDATE senza JWT); `keepsakes_guard_update` (:1318, :6527); `bucket_items_guard_delete` (:995-1007, blocca `lived` e `scheduled`); `bucket_items_guard_update` (GUC per `lived_proposed_by`); `calendar_entries_unschedule_bucket_items` (:6524, modifica desideri di S); `calendar_entries_guard_update` / `shared_events_touch_updated_at` (aggiornano `updated_at`); le guardie su `created_by` (:1054, :1139) lasciano passare `NULL` solo perché `NULL <> x` è NULL (serve un test esplicito). Nessun trigger `progression_*` scatta sulle colonne toccate.
5. **RLS e diritto di S sulla propria copia:** `moments` (:6731), `moment_photos` (:6718) e `calendar_entries` condivise (:6652) richiedono `created_by=auth.uid()` per DELETE e UPDATE. I Momenti interi sono già cancellabili da entrambi tramite `delete-moment`. Servono nuove policy di **sola DELETE** su orfani (`created_by is null`) per `moment_photos` e `calendar_entries` condivise. `shared_events` e `bucket_items` sono già cancellabili **e modificabili** da tutta la coppia (:6641-6649, :6771-6779). Si dichiara che sono liste collaborative, quindi S può modificarne anche il testo (D-6), senza restringere le policy.
6. **Accesso effettivo:** senza il profilo di L, `get_couple_membership` restituisce `partner_joined:false` e MC3 mostra "Il tuo spazio è pronto, invita la tua persona" (`onboarding.js:22-30,155-157`): l'archivio è irraggiungibile e l'invito si riapre. Servono lo stato `PARTNER_DEPARTED` (app normale + banner, nessun invito) e la coppia chiusa (§7).
7. **Rendering:** autore `NULL` → "Noi" (`app.js:2993,3119,3168`; `moments-albums.js:302`; anche `calendar.js:1151`, `left-for-you.js:271`). Serve l'etichetta "Account eliminato" (D-4).
8. **Client vecchi:** un'APK precedente porta S in `MEMBER_WAITING_PARTNER` senza archivio. La funzione si attiva solo quando tutti i client attivi sono aggiornati (D-19).

### 4.3 Vault #190 o conservazione in loco

La conservazione in loco evita copie di media, ledger di approvazione (ricevute falsificabili, #183 12:34Z) e nuove tabelle `public` da renderizzare. Usa le schermate esistenti con un'etichetta. I vault costerebbero più di 10 giorni aggiuntivi. **Scelta: in loco.**

### 4.4 FK *fail-closed*

Su tutte le colonne autore/destinatario del contenuto condiviso: `DROP NOT NULL` + `ON DELETE NO ACTION` (non differibile). `RESTRICT` non va bene: controlla subito, dentro la cascata, e può far fallire in modo spurio il `DELETE couples` dell'ultimo membro (§8). Il worker azzera esplicitamente ogni riferimento; una tabella dimenticata blocca l'operazione invece di cancellare. Lo stesso vale per una cancellazione dalla dashboard (B-04). Le cascate puramente personali restano. Test PGlite dedicato sull'ultimo membro.

### 4.5 Storage e oggetti posseduti (MUST 7)

Gli oggetti conservati restano in `<couple>/<L>/…` con `owner_id=L`; solo il service role può cancellarli. `delete-moment` copre Momenti e album interi; per singole foto d'album, foto home sostituita e Conservati serve un'estensione della stessa Edge. **P-1, bloccante:** su staging, con un utente sintetico, si prova se `auth.admin.deleteUser` fallisce quando l'utente possiede oggetti (segnalato dalla community, INFERRED). In quel caso si prova `move` (che probabilmente **non** cambia `owner_id`) e il ripiego `copy` con service role + `remove` dell'originale, aggiornando i path nelle righe. Questo riusa `s3-2-media-copy-rehearsal.cjs`. La conservazione in loco si conferma solo dopo P-1.

### 4.6 Anonimizzazione e richieste successive di L (D-16)

Dopo `created_by=NULL` nessuno saprebbe più ritrovare il contenuto di L. Raccomandazione: la mappatura privata `account_deletion_retained` si conserva per 30 giorni dopo `completed`, per consentire una revoca o correzione, poi viene cancellata. Da quel momento il contenuto appartiene all'archivio di S, sulla base giuridica indicata nell'informativa (revisione D-10).

## 5. Protezione dei dati del partner

- **Invariante testata:** nessuna riga con autore o proprietario S viene cancellata, confrontando i conteggi prima e dopo su ogni tabella con `couple_id`. Eccezioni dichiarate: `calendar_reminders` relativi a L; desideri di S riportati a `idea` (§4.1); Conservati di S solo se `keep_shared=false` (D-13).
- Gli elementi ricevuti da S restano (`recipient_id=NULL`). Le foto di S nei Momenti di L non subiscono più la cascata (:6355). `completed_by` va a `NULL`, la storia comune resta.

## 6. Dati personali e media da cancellare

- **Righe:** tutte quelle `delete` in §4.1, più `auth.users` (Admin API), sessioni e identità. Inventario: 78 FK (#190) + 6 FK tra contenuti + tabelle per ruolo e array + elenco `claim_us_role` (:3135-3163, funzione ritirata, `service_role` only :7107-7108; il runbook ne vieta l'uso).
- **Storage, solo via API:** avatar, copertine e miniature, foto d'album, `left/` (voce, video, foto), storie, foto home (se `false`). Validazione dei path con `safePath` di `s3-2-media-inventory.cjs`.
- **Cache altrui (residuo dichiarato):** SW `us-private-media-v1` fino a 100 voci (`service-worker.js:244-248`), signed URL in `localStorage` (`app.js:310-333`), snapshot dei widget.
- **Backup:** il piano Free non ha backup; con Pro la retention reale va dichiarata (D-8). Ricevuta minima: D-17.
- **Accettazione:** dopo `completed`, 0 righe con l'uid di L (anche negli array), `list('<couple>/<L>/')` = keep-set, L assente da `auth.users`.

## 7. Isolamento e ri-accoppiamento

| Soggetto | Deve vedere | Meccanismo |
|---|---|---|
| L in grazia | Nulla della coppia | `active_member()` + Edge + inviti revocati |
| L dopo `completed` | Nulla | Utente cancellato (ban dal `due`) |
| S | I propri dati + il contenuto conservato di L | Policy esistenti + verifica `list` |
| Nuovo partner nella stessa `couple_id` | Senza regola vedrebbe **tutto** (risposte dell'ex attribuite al suo slot per ruolo) | Chiusura della coppia |
| Altre coppie | Nulla | Invariato |

**Regola (D-5):** al blocco gli inviti pendenti vengono revocati; `create_partner_invite` e `accept_partner_invite` rifiutano con `couple_closed` sia durante la grazia (membro in cancellazione) sia dopo (`member_departed_at`). In una coppia completa gli inviti pendenti non esistono (`couple_full`, `mc2_couple_invites.sql:142-144`): il rischio riguarda la coppia con un solo membro. Conseguenza per S: `create_couple` restituisce `already_member` (`:111-115`), quindi senza il futuro "nuovo spazio" (post-1.0) l'unico modo per avere un nuovo partner è eliminare il proprio account, perdendo l'archivio. Va dichiarato.

**Test:** PGlite con `tests/helpers/mc2-db.js` (coppie A{F,B} e B{U1,U2}; U3 come terzo): L con nuovo JWT, S, U3 e l'altra coppia; inviti in grazia e dopo; profilo ricreato con l'uid di L rifiutato. Una sola verifica su staging con 4 account sintetici e oggetti innocui (`scripts/s3-3-storage-jwt-readonly.cjs`, `s3-3-seed-and-verify-stage.cjs`), **con autorizzazione del fondatore**.

## 8. Ultimo membro e cancellazione dell'intera coppia

- Se L è l'unico membro: `remove` dell'intero prefisso `<couple>/`, poi delete **esplicita dei figli** in ordine e infine `DELETE couples` (compatibile con `NO ACTION`), poi `deleteUser`. L'archivio di un ex viene eliminato con l'ultimo membro (dichiarato).
- Se entrambi chiedono la cancellazione: l'advisory lock serializza; il primo è un'uscita singola, il secondo trova un solo membro ed esegue la cancellazione della coppia. Nessuna richiesta singola cancella la coppia se l'altro membro è presente.

## 9. Export e separazione in v1

- **Export:** su richiesta via email entro 30 giorni (D-7). L'operatore usa `s3-2-export-core.mjs` + paging in uno script locale limitato all'uid verificato; i media vengono inviati come signed URL brevi. L'Edge `export-my-data` resta parcheggiata.
- **Separazione:** in v1 solo tramite eliminazione o supporto (D-9). Chi esce può registrarsi di nuovo con la stessa email.

## 10. Migrazione e coordinamento

**Ordine vincolante (MUST 6):**
1. **#187 unita a `main`.** Le Edge push in produzione girano già con il codice di #187 (deploy dell'11/10) e la ri-registrazione all'avvio è area sua. Le modifiche di questo piano a `register_*` e alle Edge push vengono **dopo**. Nessun deploy di Edge da `main` finché la deriva non è risolta. `UNIQUE(token)` (:390) resta della Squadra 1: qui si cancellano solo le righe di L.
2. **Deriva del ledger delle migrazioni risolta** (P-10: V3 non applicata in produzione).
3. **#180:** il trigger S2 blocca INSERT/UPDATE senza JWT, non DELETE; il piano usa solo DELETE su `daily_answers`. Serve un test con S2 + M-1 insieme.
4. **P-1 preflight in sola lettura** (staging; produzione con autorizzazione): riusa `foreign-key-preflight` e `staging-readonly-preflight` di #190, più la definizione di `storage.objects.owner/owner_id`, `jwt_expiry`, le FK tra contenuti, i conteggi per ruolo e il **test di `deleteUser` con oggetti posseduti** (staging, sintetico, autorizzato).
5. **M-1 schema** (staging, poi produzione con autorizzazione DDL). Contenuto: `account_lifecycle` e tabelle private, `active_member()` + riscrittura di circa 40 funzioni e policy, FK `NO ACTION` + `DROP NOT NULL`, chiusura degli inviti e `mc2_require_account`, policy DELETE sugli orfani, bypass mirati dei trigger. Reversibile: ripristino delle FK, delle funzioni e di `SET NOT NULL` se nessuna riga è `NULL`. Nessuna riga reale cambia.
6. **M-2:** RPC ed Edge (`request-account-deletion`, `process-account-deletions`, helper Edge); cron disattivato.
7. **#189** tocca `app.js`: va coordinata con gli stati client di PR-3; il suo recupero password migliora il ripiego email.
8. **Runbook operatore:** verifica email, `operator_request…`, esecuzione manuale, query SLA, `failed_needs_operator`, divieto di `claim_us_role`, esclusione della coppia del fondatore e della coppia demo del revisore (D-12).

## 11. Decisioni del fondatore (prima di qualsiasi implementazione distruttiva)

Ogni voce va registrata **parola per parola** in `docs/DECISIONS.md`: oggi Policy A esiste solo in testi scritti da agenti. Le raccomandazioni sono **solo proposte**.

| # | Decisione | Raccomandazione |
|---|---|---|
| D-1 | Ratifica di Policy A semplificata | "Chi elimina l'account sceglie se i ricordi condivisi che ha creato restano al partner; i suoi dati personali vengono comunque eliminati." |
| D-2 | Valore predefinito se L non sceglie (web/email) | `keep_shared=false`; in app nessuna preselezione |
| D-3 | Grazia, reversibilità, SLA | 7 giorni, annullabile con login + "Annulla"; completamento "entro 30 giorni" |
| D-4 | Cosa vede il partner | Avviso neutro in app; etichetta "Account eliminato"; nessuna push |
| D-5 | Ri-accoppiamento | Coppia chiusa al blocco e dopo; "nuovo spazio" post-1.0; limite dichiarato a S |
| D-6 | Cosa resta nell'archivio di S | Se `keep_shared`: Momenti, foto, messaggi consegnati, keepsake, calendario, eventi, desideri, finché S non li cancella. Sempre eliminati: lasciati-per-te non conservati, storie, risposte giornaliere, umore, posizione. S può modificare eventi e desideri condivisi (liste collaborative) |
| D-7 | Export | Su richiesta via email entro 30 giorni |
| D-8 | Backup e piano Supabase | Pro prima del closed test; retention reale dichiarata |
| D-9 | Separazione v1 | Solo tramite eliminazione o supporto |
| D-10 | Revisione legale | Informativa, pagina e Policy A riviste prima della produzione (non blocca staging) |
| D-11 | Supporto e titolare del trattamento | Indirizzo dedicato; titolare = il fondatore, salvo società |
| D-12 | Account esclusi dai test | Coppia del fondatore e coppia demo del revisore |
| D-13 | Conservati di S (lasciati-per-te di L conservati da S) | Seguono `keep_shared`: restano se `true`, si perdono in modo dichiarato se `false` |
| D-14 | Con `false`: eventi con completamenti, desideri `lived`/`scheduled` | Guscio anonimo (storia vissuta insieme), non cancellazione |
| D-15 | Messaggi programmati di L; invii di S a L durante la grazia | Programmati non consegnati cancellati al blocco; invii di S a L bloccati |
| D-16 | Richiesta successiva di L sul contenuto conservato | Mappatura privata per 30 giorni dopo `completed`, poi la scelta diventa definitiva |
| D-17 | Retention della ricevuta minima | 12 mesi, solo uid, date, canale, stato |
| D-18 | Autorizzazione dell'operatore in produzione | Autorizzazione permanente limitata ai passi del runbook per richieste verificate, con registro |
| D-19 | Client vecchi | Funzione attivata solo dopo l'aggiornamento di tutti i client attivi (oggi solo i fondatori); gate di versione minima post-1.0 |

## 12. PR, sforzo e riuso di #190

| PR | Contenuto | Dipende da | Sforzo (stima) |
|---|---|---|---|
| PR-0 | D-1…D-19 in `DECISIONS.md` | — | fondatore |
| PR-1 | Preflight P-1 + test contratto PGlite scritti prima: blocco con nuovo JWT, guardia CI `pg_proc`, FK fail-closed, inviti, ruoli, ultimo membro | #187 unita | 2 g |
| PR-2 | M-1 schema: helper + circa 40 funzioni/policy, FK, trigger, inviti, policy orfani | PR-0, PR-1, ledger, #180 | 5–6 g |
| PR-3 | Richiesta e blocco: RPC service-only, Edge con `amr`, revoche, helper Edge, UI, stati `PENDING_DELETION`/`PARTNER_DEPARTED`, etichetta, fix Conservati, nuovo gate CI #190 | PR-2 | 4 g |
| PR-4 | Worker Storage → DB → Auth, ban, ultimo membro, runbook | PR-2 | 4 g |
| PR-5 | Pagina `/elimina-account`, route web minima, informativa, runbook email/export | PR-0, PR-3 | 1,5 g |
| PR-6 | Collaudo su staging con 4 account sintetici + un telefono | PR-3, PR-4, autorizzazione | 1 g |

**Totale ≈ 16–20 giorni** di sviluppo (stima; prima erano 10–11), escluse le attese per decisioni e autorizzazioni. PR-3 e PR-4 possono procedere in parallelo, su file diversi.

**Riuso di #190** (R = riuso, A = adattare, P = parcheggiare; #190 resta aperta):

| File #190 | Esito | Uso |
|---|---|---|
| `fk-coverage-20261012.json` + `tests/s3-2-fk-coverage.test.mjs` | R/A | Baseline delle 78 FK; aggiungere `resolution` e le 6 FK tra contenuti; il test fallisce su FK nuove o non risolte |
| `foreign-key-preflight-20261012.sql`, `s3-3-staging-readonly-preflight-20261012.sql` (+test) | R | P-1 |
| `tests/s3-2-account-exit-real-schema.test.js` | A | Asserzione invertita: la delete ingenua ora fallisce e nulla viene perso |
| `tests/s3-2-exit-impact-db.test.js`, `tests/s3-2-integrated-account-exit-db.test.js` | A | Semina a due coppie senza vault; U3; entrambe le modalità `keep_shared` |
| `stage1-exit-preview-draft.sql` (+test) | A | Anteprima "cosa verrà eliminato" (facoltativa) |
| `_shared/s3-2-export-core.mjs`, `s3-2-export-paging.mjs` (+test) | R | Export su richiesta |
| `export-my-data/index.ts` | P | Export in app post-1.0 |
| `s3-2-media-inventory.cjs` (+test) | A | `safePath` per il purge |
| `s3-2-media-copy-rehearsal.cjs` (+test) | A se P-1 lo richiede | Ripiego `copy+remove` |
| `s3-2-preservation-a-preview.cjs` (+test) | A | Tabella §4.1 nel codice |
| 4 draft vault + 4 test DB | P | Riferimento |
| `lifecycle-contract-20261012.json`, `tests/s3-2-lifecycle-design-gate.test.js`, `.github/workflows/s3-2-lifecycle-design.yml` | A | Il gate oggi vieta il backend (`:66-67`): va riscritto in PR-3 |
| `lifecycle-risk-gates`, `export-migration-plan`, `partner-photo-reference-gate` (.md) | R | Riferimento |
| `scripts/s3-3-*`, `storage-policy-baseline-20261012.json` (+test) | R | Guardia contro la deriva Storage + PR-6 |

**Verifiche su dispositivo reale ancora necessarie (non dichiarabili superate senza prova):** logout forzato su Android dopo una richiesta dalla route web; nessuna push a L dopo un nuovo login durante la grazia (app uccisa e offline); schermata "Annulla"; stato archivio ed etichetta sul telefono di S; widget svuotati.

## 13. Revisione indipendente (sintesi)

Revisore indipendente (Opus), 2026-10-13, in sola lettura. **Verdetto: APPROVE WITH CHANGES.** L'architettura è corretta e preferibile ai vault (conservazione in loco, scelta esplicita, FK fail-closed, coppia chiusa, worker idempotente). Il blocco come scritto prima **non** era fail-closed e c'erano due contraddizioni nell'inventario.

Affermazioni **smentite:** `current_couple_id()` come unico punto di derivazione della coppia (→ §2.1); "i Conservati restano" (→ §4.1, D-13). **Parziali:** policy di S su `shared_events`/`bucket_items` (→ §4.2.5); 78 FK sufficienti (→ §4.2.2); signed URL 6 h (24 h per il widget). Le altre 15 verifiche sono confermate e ricontrollate per questa versione (righe `:210, :6297, :6309, :6341, :6352, :6382, :6807, :6932, :1002, :1066`, `m11a_actor*`, `get_daily_state`, `register_*`, `moments-albums.js:1066`, `us-widget-state:113`).

| Requisito | Integrato in |
|---|---|
| MUST 1 helper unico + guardia CI `pg_proc` | §2.2, PR-1/PR-2 |
| MUST 2 RPC di richiesta non chiamabile da `authenticated` | §1 |
| MUST 3 revoca inviti, `accept`/`mc2_require_account`, ban da `due` | §2.2, §7 |
| MUST 4 6 FK tra contenuti, trigger, Conservati, eventi con completamenti | §4.1, §4.2, D-13/D-14 |
| MUST 5 `NO ACTION` + test sull'ultimo membro | §4.4, §8 |
| MUST 6 #187 prima, nessun deploy Edge da `main` | §10 |
| MUST 7 P-1 `deleteUser` con oggetti + `copy+remove` | §4.5, §10 |
| SHOULD: Storage prima del DB, stato in tabella privata, route web minima, array e copie di testo, modificabilità dichiarata, client vecchi, stima 16–20 g | §3, §1, §4.1, D-6, D-19, §12 |
