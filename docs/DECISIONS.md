# US — Decisions

Only durable decisions belong here. New missions should not reopen them without an explicit product decision.

## 2026-10-04

- Production frontend is **Cloudflare Pages**. Vercel is legacy/out of scope.
- `main` is production.
- US 2.0 backend foundation is complete; do not reopen broad backend-cleanup work without a concrete product need.
- Agent context belongs in repository docs, not repeated in large prompts.
- One meaningful mission uses one branch/worktree through audit, implementation, fixes and review.

### Gioca

- Gioca should become a strong return loop, not only a questionnaire catalog.
- Questionnaire/Game V2 content refreshes on a weekly rhythm.
- Planned questionnaire allowance: **5 sessions/week** instead of 3.
- “Crea domanda” stays, but its UX becomes: **write → seal → partner discovers it while playing**.
- Add a distinct **Arcade** area for non-verbal/touch minigames.
- First live arcade game: **Pulse**.
- Planned order: **Pulse → Stack Together → Relay → Duo Maze**.
- Live arcade uses the already-known partner: no room codes, usernames, public lobbies or matchmaking.
- First Pulse mission does **not** consume the Game V2 weekly questionnaire allowance.
- Build one reusable live-game invitation/lobby/reconnect/rematch foundation, then reuse it rather than rebuilding multiplayer per game.

### Product restraint

- Do not add new top-level navigation tabs for these features.
- Do not add fake currencies, energy systems or grind loops.
- Engagement should come from partner consequence, anticipation, live play and meaningful shared outcomes.

## 2026-10-06

### Native iOS (M15)

- iOS is a Capacitor 8 target in `ios/` (Swift Package Manager) sharing the Android web bundle; deployment target **iOS 16.0**. Bundle id **`app.uscouple`** (13/11/2026: `com.usapp.us` was already taken on Apple; Android, Play and Firebase keep `com.usapp.us`). Team ID `KW79XL4LBZ` (individual account, Francesco Monti).
- Shared product JS stays platform-neutral; iOS specifics live in `ios/` and native-only glue in `native-entry.mjs` / `app-links.mjs`.
- iOS Back = left-edge swipe into `UsNavigation.handleNativeBack()`; never exits the app.
- Public URL scheme `com.usapp.us` (shared with Android, unchanged); reserved App Group `group.app.uscouple.shared` for all future extensions; refresh tokens never go in the App Group.
- WebView data (session) is excluded from iOS backups, mirroring Android `allowBackup=false`.
- The iOS WebView origin (`capacitor://localhost`) is frozen: changing it orphans stored sessions.

### Native Security V1

- Biometrics gate access to the existing Supabase session on this phone; they never create an identity, replace email + password, or revive an expired/revoked session.
- The Supabase session stays in the WebView store; only a protection record (no credential) goes to Android Keystore-encrypted prefs / iOS Keychain `ThisDeviceOnly`.
- Android accepts only **class 3 (strong)** biometrics, bound to a Keystore key invalidated by a new enrollment. iOS uses Face ID / Touch ID only (no passcode shortcut) and checks the enrollment hash.
- Locked on cold start and after **60 s** in background; shorter interruptions never re-prompt.
- Off by default, device-local, never a couple setting. Any end of the session removes it; recovery is always the email + password login.

### Native Notifications V1

- One notification domain: producers authorize and apply preferences, then hand ONE canonical notification (`_shared/notification-core.mjs`) to one dispatcher; Web Push, FCM and APNs only serialize it. No per-transport business rules.
- Dedupe stays logical: one `push_event_log` claim per event covers every transport; released when nothing was delivered.
- iOS uses direct APNs (token auth), not FCM-for-iOS: no Firebase SDK in the iOS app.
- Native registration is per app installation (random UUID, rotated at logout), only through authenticated RPCs; logout removes only this installation.
- Payloads carry an allow-listed target and an optional UUID, never a URL; navigation waits for the session and the app lock. Notification actions never mutate data.
- Native credentials live only in Supabase Edge secrets; unset = native transport off, Web Push unchanged.


## 2026-10-07

### Multi-couple foundation

- US is a single-couple UX on a multi-couple architecture.
- `couple_id` is the tenant boundary for shared state and authorization.
- V1 keeps `profiles.id = auth.users.id` plus `profiles.couple_id` as the active membership authority.
- A separate `couple_members` table is deferred until an account needs multiple simultaneous or historical couple memberships.
- Relationship age is data-driven from `couples.started_on`; no private-couple date belongs in runtime logic.
- Legacy `francesco | beatrice` values remain compatibility slot tokens for now. Their database-wide normalization is a separate atomic migration.
- Any auth/bootstrap change must pass the dedicated Boot/Auth safety contract and a signed Android candidate must be tested before merge.

### MC2 couple creation and invites (review candidate)

- Membership remains `auth.users.id → profiles.id → profiles.couple_id → couples.id`; one active couple/account, two server-assigned legacy slots. No `couple_members` or role normalization.
- Public signup remains OFF. Bearer invites use server-generated 128-bit Crockford Base32 codes, SHA-256 only at rest, fixed 48-hour expiry, revocation and single use.
- No legacy Auth/session/Storage cleanup. Confirmed eligible permanent orphans may create/join an isolated couple; anonymous accounts are denied regardless of user metadata.
- Membership writes are restricted to the four MC2 mutation RPCs; profile client INSERT/DELETE/TRUNCATE and other legacy write privileges are revoked. SELECT and avatar UPDATE stay intact.
- The migration accepts exact legacy, verifies/no-ops exact target, and refuses partial/unknown states without repair. Lock order is user advisory → actor → invite → membership checks/locks.
- `list_couple_questions()` stays retired with client `42501`; MC2 does not restore its grant. Native Notifications ledger drift remains outside scope.
- Repository validation and review do not authorize production rollout or a real Couple B launch; onboarding and legacy UI copy are separate work.

## 2026-10-09 — UI Refinement & Personalization V3 (review candidate)

- Oggi personalisation is two device-local slots of the existing cosmetics system: **Tema di Oggi** and **Effetto di Oggi**. `data-us-theme` stays the global atmosphere; Oggi themes only define `--oggi-*` tokens scoped to Oggi.
- Frames and stickers are no longer rewards. Badges and rings are retired with them (no visible place since Noi V2). Unlock history and stored choices are kept; nothing is deleted.
- Rewards that entitle Countdown styles stay active and are presented as Countdown styles.
- Server catalog changes go through a reviewed migration; until it is applied the client hides looks the server does not know (no fake rewards).
- Gioca keeps two tabs; games are one grid (no sideways deck), rounds waiting for you are shown directly.
- Noi "Lavagna" = the existing Calendar Week view.

## 2026-10-09 — Noi canonical Calendar V4

- **Noi's large month/list calendar is the only user-facing calendar**. All legacy Calendar launchers from Oggi, deep links and Da vivere navigate to this view rather than a second sheet.
- Lavagna's former week modal is replaced by an in-page Week view in Noi (with return to month). Quest and Eventi retain their existing sections.
- One persistent **+** creates an impegno for the selected date using the existing Calendar editor; keep title, all-day, start/end, date editing, authorization, reminders, edit/delete and Da vivere links. No new backend schema or duplicate write authority.
- Legacy Calendar overlay markup/helpers remain inert temporarily for backward compatibility, while the form/detail sheets are reparented to the document root. Remove legacy scaffolding only after comprehensive browser/device QA; never delete calendar data.
- Official Phosphor glyphs are centrally aligned in their control shapes. Distance continues to be hidden but preserved.

## 2026-10-10 — Delibera Presidenza US Store 1.0 (D1–D5)

**Fonte:** decisione esplicita della Presidenza del 10 ottobre 2026. Questa sezione prevale su proposte roadmap incompatibili, lasciandole come storia.

1. **D1 APPROVATO — Identità:** US è lo spazio privato e reciproco di una coppia. Il core loop è lasciare → ricevere → rispondere → esito condiviso → eventuale Ricordo. Niente piattaforma social generalista.
2. **D2 APPROVATO — Contenuto V1:** la release commerciale mantiene quattro tab Oggi / Noi / Ricordi / Gioca. Il focus è consolidare, non inventare un nuovo prodotto. Sintonia resta una scheda dentro Gioca; Calendario unico in Noi; top bar completa solo su Oggi; Maudit esistente preservato.
3. **D3 APPROVATO — Ordine Store:** Google Play Android prima, Apple App Store successivamente. La base iOS continua a compilare, ma la mancanza di QA iPhone non blocca la V1 Android.
4. **D4 DA RIVEDERE — Modello economico:** **nessun** prezzo, US Plus, abbonamento, paywall, billing, freemium o promozione commerciale sono approvati. La monetizzazione richiede successiva analisi e nuova delibera. Non implementare sistema commerciale sulla base di una proposta passata. **Superato il 28/10/2026** dalla nuova D4 (sotto).
5. **D5 APPROVATO — Freeze di nuove feature:** stop fino alla V1 per nuovi Arcade (Pulse, Stack Together, Relay, Duo Maze), Diario/Scrapbook esteso, Compagni oltre Maudit, nuovi moduli e redesign generali. Restano **necessari e permessi come release scope**: registrazione/onboarding, account recovery, deletion/export, policy di separazione, privacy, sicurezza, bugfix, performance, accessibilità, compliance e release packaging.

**N.B.:** Il piano del 4 ottobre che prospettava aumento da 3 a 5 sessioni settimanali Game V2 è una proposta futura sospesa; nessun cambio quota V1 autorizzato. **Superata il 28/10/2026:** la nuova D4 porta Gioca a una partita al giorno. Eventuali reward DB o feature branch in sospeso richiedono SQL/client rollout separato e approvato.

**Fonte unica per lo Store 1.0:** [Carta](store/US_STORE_1_0_CHARTER.md) · [Baseline](store/US_STORE_1_0_BASELINE.md) · [Piano](store/US_STORE_1_0_EXECUTION.md) · [Release gates](store/US_STORE_1_0_QUALITY_GATES.md).

**Governance:** la delibera approva la direzione di prodotto e la preparazione documentale; non autorizza per implicazione merge, produzione, modifica Supabase, acquisto account, pubblicazione o marketing a pagamento.

## 2026-10-13 — Ciclo di vita dell'account (S3.2, PR #190)

**Fonte:** delibere del fondatore pubblicate sulla PR #190 ([handoff](https://github.com/LetHerCome/US/pull/190#issuecomment-6148261382), [D-5](https://github.com/LetHerCome/US/pull/190#issuecomment-6149834067)). Le altre voci D-1…D-19 restano default tecnici da ratificare, elencati in [`docs/store/US_S3_2_ACCOUNT_DELETION_V1.md`](store/US_S3_2_ACCOUNT_DELETION_V1.md) §5.

1. **Policy A APPROVATA:** quando un membro esce, il partner può conservare i ricordi condivisi idonei; i dati strettamente personali, la posizione, le credenziali e i token del membro che esce vengono cancellati. L'eliminazione unilaterale di un account non cancella la storia del partner. Restano necessarie la revisione dei diritti sui contenuti e l'informativa sulla conservazione.
2. **D-5 APPROVATA:** «Se A elimina il proprio account, B conserva il diritto ad accedere ai ricordi condivisi legittimamente preservati della coppia precedente **e può creare un nuovo legame con un'altra persona senza dover eliminare il proprio account**. L'archivio precedente e il nuovo spazio di coppia sono rigorosamente separati.» La chiusura del legame precedente può restare irreversibile, ma non deve bloccare il riabbinamento futuro di B.
3. **Tempi di D-5 (fondatore, 14/10):** il nuovo legame arriva **dopo la 1.0**, insieme alla schermata Archivio. Nella 1.0 chi resta tiene tutti i ricordi nell'app; la parte server è già sulla #190, eseguibile solo da `service_role`.

4. **Esci dalla coppia nella 1.0 (fondatore, audit del 14/10, decisione 3):** chiude lo spazio di coppia come l'eliminazione, con le stesse regole di Policy A e D-5, ma tiene gli account. Insieme, "Segnala un problema o un contenuto" in Impostazioni con una procedura scritta per il team (requisito Play per le app 1:1). Dettagli: [`docs/store/US_1_0_LEAVE_REPORT_EXPORT.md`](store/US_1_0_LEAVE_REPORT_EXPORT.md).
5. **Copia dei dati (fondatore, audit del 14/10, decisione 8):** su richiesta al supporto, inviata per email; il tasto in app viene dopo la 1.0. Finché non ci sono indirizzo e dominio, l'operatore manda il link a mano. Default tecnici da ratificare: link valido 7 giorni, segnalazioni conservate 12 mesi, massimo 5 segnalazioni al giorno per utente.

**Governance:** approvazioni di prodotto. Non autorizzano merge, migrazioni su staging o produzione, cancellazione di utenti né deploy.

## 2026-10-16 — Notifiche Android che dicono cosa è successo

**Fonte:** decisione esplicita del founder del 16/10/2026 («tipo dal server, testo scritto dal telefono dopo il controllo dell'account»). Modifica la scelta di Native Notifications S3 (#187), per cui il pacchetto FCM non doveva rivelare nemmeno la categoria dell'evento.

- Il pacchetto FCM v2 resta solo dati, con un unico banner (`us-private-notice`), e aggiunge **un solo campo `k`**: il tipo di evento, preso da un elenco chiuso (`ANDROID_NOTICE_KINDS` in `native-push-transport.mjs`, per esempio `think`, `daily_ready`, `game_turn`). **Mai** testi, nomi, id, ref, tag o destinazioni.
- **Compromesso accettato:** Google, che trasporta le notifiche, vede la categoria dell'evento (per esempio «Ti penso»), mai il contenuto.
- Il telefono scrive la frase (`UsPushNotices.java`), nella lingua del telefono, **solo dopo** il controllo dell'account (`UsPushOwnerGate`). Il nome dell'altra persona viene dal telefono stesso: l'app lo salva nel controllo per l'account proprietario, viene letto sotto lo stesso blocco che pubblica la notifica e si cancella al logout o al cambio di account. Senza nome: «La tua persona». Tipo assente o sconosciuto: «Apri US per vedere le novità».
- Toccando la notifica si apre una delle quattro schede pubbliche (`com.usapp.us://open/<oggi|noi|ricordi|gioca>`): mai un'azione, un ref o dati privati.
- Visibilità sulla schermata di blocco: `VISIBILITY_PRIVATE`, invariata.
- iOS/APNs non cambia.

## 2026-10-17 — Privacy e Termini pubblicati

**Fonte:** decisione esplicita del founder del 17/10/2026 (titolare «Moonee Lab (Francesco Monti)», solo email, niente indirizzo postale).

- Le pagine pubbliche sono `/privacy` e `/termini` su `us-a33.pages.dev`, con le versioni inglesi `/privacy-en` e `/termini-en`. Sono statiche, senza script, fuori dall'app shell e fuori dal Service Worker.
- Il testo viene dalle bozze `docs/store/play/*_DRAFT*.md` aggiornate al 17/10 (#213), con i campi compilati: titolare, data, regione Supabase (UE, Parigi), backup assenti, pagina di eliminazione.
- `LEGAL_URLS` punta a `/termini` e `/privacy`; Impostazioni › Privacy e dati apre le pagine nella lingua dell'app. Il nome sviluppatore della pagina di eliminazione è **Moonee Lab**, come su Play.
- La revisione di un consulente legale (D-10) resta da fare. Quando cambia il testo, si aggiornano insieme bozza, pagina e data «Ultimo aggiornamento».

## 2026-10-18 — Rifiniture dopo le prove sul telefono

**Fonte:** prove del founder del 18/10/2026.

- **Album:** il riquadro per aggiungere una foto sale dal basso sopra la foto a tutto schermo (prima finiva sotto la foto). Con «Eliminato · Annulla» il cestino si sposta e non copre più la barra.
- **Foto a tutto schermo:** toccare la foto non apre più la seconda visualizzazione ridotta («quella va tolta»).
- **Notifiche su rete mobile:** «Attiva» aspetta fino a 30 s il token e 15 s la registrazione, con un secondo tentativo se la rete è lenta; se fallisce ancora, il messaggio dice «Rete lenta: riprova tra poco, oppure con il Wi-Fi». Le chiamate in background mantengono il limite di 6 s.
- **Splash Android:** il colore segue il tema dell'app («Atmosfera»): Originale prugna `#26142E`, Rosa, Mezzanotte, Pellicola, Ora blu, Grafite. Il simbolo è trasparente e sta nel cerchio della splash. Su Android 13+ il plugin locale `us-splash-theme` (`SplashScreen.setSplashScreenTheme`) fa valere il tema dalla prossima apertura; su Android 8–12 resta la prugna.
- **Ricordi vuoto al rientro (video del founder):** supabase-js riannuncia SIGNED_IN quando l'app torna in primo piano; l'app lo trattava come un nuovo accesso, azzerava la coppia e svuotava Ricordi, mentre l'aggiornamento già partito non ridisegnava. Ora per lo stesso account aperto SIGNED_IN non rifà l'avvio, un caricamento di Ricordi partito prima dello svuotamento ne accoda un altro e, quando la coppia torna, Ricordi vuoto sullo schermo si ricarica.

## 2026-10-19 — Domande senza durata, animazione d'apertura, diagnosi notifiche

**Fonte:** note del founder del 19/10/2026 (`US PROBLEMI 18 OTTOBRE`).

- **Domande:** la domanda del giorno è una sola per tutte le coppie, quindi non si sceglie in base a quanto una coppia sta insieme. I testi non presuppongono più una durata o una convivenza: «da quando stiamo insieme» al posto di «nell’ultimo anno» (profonda-03, ricordi-26, scopritevi-003) e «ci faresti seguire» al posto di «in casa nostra» (gioco-21). Migrazione `20261019120000`, solo contenuti; i giorni già mostrati restano come sono.
- **Animazione d'apertura:** solo all'avvio dell'app installata (non al rientro dal background, non nel browser, non con «riduci animazioni»). Parte dal colore e dal logo della splash Android e dura meno di un secondo.
- **Notifiche in 5G:** il motivo di FCM non viene più perso (es. `SERVICE_NOT_AVAILABLE`, ora ritentato) e il messaggio d'errore mostra un codice: N stato nativo, T token Google, S server, O collegamento al telefono. Serve per capire, alla prossima prova, dove si ferma.
- **Icona Android (stesso giorno):** il founder tiene il logo di sempre ma su **sfondo bianco** invece che nero: `ic_launcher_background` `#FFFFFF` e icone legacy `FIT_CENTER_WHITE` (script `build-android-brand-assets.ps1`). Anche l'icona 512 e l'immagine in primo piano del Play Store hanno l'icona bianca. iOS non è ancora pubblicata e resta com'è.

## 2026-10-20 — Avvio e rientro più reattivi

**Fonte:** richiesta del founder prima della 1.0.6 («rendere l’app più reattiva al primo avvio e a tutti gli altri riavvii»).

- **Avvio:** la domanda del giorno parte insieme alla foto di Oggi, non dopo che la foto è caricata. Nessun cambio all’accesso: la coppia viene sempre verificata dal server prima di mostrare l’app.
- **Rientro dal background:** si aggiorna per prima la pagina sullo schermo; widget del telefono, Gioca fuori da Gioca, pallino di Ricordi, posizione, avatar e controllo aggiornamenti partono un attimo dopo (`usAfterForeground`, 0,9–2,5 s, poi quando il telefono è libero).
- **Doppioni tolti:** al rientro le Stories si ricaricavano due volte (visibilitychange + focus) e Gioca due volte quando era la pagina aperta.
- Da provare su un AAB firmato prima del merge (regola Boot/Auth del 07/10).

## 2026-10-22 — Eccezione a D5: check-in settimanale di coppia

**Fonte:** risposta esplicita del founder del 22/10/2026 alla spec [`weekly-checkin-v1`](missions/weekly-checkin-v1.md) («1. adesso»).

- Il check-in settimanale di coppia (vicinanza, energia, apprezzamento, supporto) può essere implementato **prima della 1.0 Store**, in deroga al freeze D5. L'eccezione vale **solo** per questa missione e non riapre gli altri moduli congelati da D5.
- Restano validi D4 (gratis, nessun paywall) e la product restraint del 04/10 (nessuna nuova tab, niente XP, streak o valute).
- **Governance:** l'eccezione autorizza il lavoro sul branch e le prove su staging. Non autorizza merge, SQL o Edge in produzione, né la pubblicazione: ognuno di questi passi richiede un'approvazione separata.

## 2026-10-22 — Il check-in resta su staging

**Fonte:** prova del founder sull'APK di staging, 22/10/2026 («al momento non mi fa impazzire, lasciamola su staging»).

- Il check-in settimanale resta **solo su US-STAGING** (SQL, `send-web-push` v11, APK QA e anteprima web) per un periodo di prova. **Non va in produzione**: niente SQL, Edge, merge su `main` né AAB su Play finché il founder non decide diversamente.
- Il branch `claude/payred-app-comparison-b2594e` resta aperto, senza PR verso `main`.
- **Direzione di prodotto:** da Paired si prende ispirazione, senza copiarne le funzioni. US non è terapia di coppia. L'obiettivo è un'esperienza più fluida e più ricca di contenuti, coerente con il core di US; tra le idee, compagni oltre il gatto (Maudit).

## 2026-10-22 — Eccezione a D5: Il vostro anno (riepilogo dell'anniversario)

**Fonte:** richiesta esplicita del founder del 22/10/2026 («vai facciamo riepilogo anniversario»), dopo il confronto con Paired.

- Il riepilogo dell'anniversario «Il vostro anno» ([spec](missions/year-recap-v1.md)) si fa adesso, in deroga al freeze D5, **solo** per questa missione.
- È fatto con i dati veri della coppia, è privato (niente condivisione esterna nella V1) e non contiene punteggi né classifiche.
- **Governance:** il lavoro va sul branch e su staging. Merge, SQL ed Edge in produzione e pubblicazione hanno ciascuno un'approvazione separata.

## 2026-10-22 — Eccezione a D5: Compagni V1

**Fonte:** richiesta esplicita del founder del 22/10/2026 («io voglio sicuro un draghetto che svolazza e si ripoggia sempre dove sta Maudit… un sistema di sblocco dei pet, non di crescita»; poi «Maudit, una capretta, un gufetto e il draghetto»).

- I «Compagni oltre Maudit» congelati da D5 si fanno adesso, **solo** per tre compagni: la capretta, il gufetto e il draghetto ([spec](missions/companions-v1.md)).
- I compagni **si sbloccano** con il livello Sintonia della coppia e non crescono: niente evoluzioni o barre proprie. All'inizio nessun compagno; Maudit al livello 3, il gufetto al 5, la capretta all'8, il draghetto all'11 (decisione del founder, 22/10 sera). Hanno una tabella loro, non il catalogo dei premi di Sintonia.
- **Disegni:** i nuovi compagni diventano asset approvati solo dopo l'OK del founder sulle bozze.
- **Governance:** il lavoro va sul branch e su staging. Merge, SQL in produzione e pubblicazione hanno ciascuno un'approvazione separata.
- **22/10, sera:** il founder fornisce i disegni dei compagni e un **Maudit 2.0** nello stesso stile («li voglio così»; «usa la mia nuova immagine anche per Maudit»). Sostituiscono le bozze SVG e Maudit 1.0, che resta su disco ritirato. Niente video generati a pagamento per ora: l'animazione è fatta a pezzi dalle immagini.

## 2026-10-25 — Registrazione aperta e accesso con Google per il test chiuso

**Fonte:** founder, 25/10/2026: «non possiamo sbloccare la registrazione in produzione prima di darla ai test? o collegare l'accesso con google»; poi «facciamo sia mail con gmail che accesso con google».

- In produzione la registrazione con email si apre (`PRODUCTION_SIGNUP_RELEASED = true`), con la conferma dell'indirizzo obbligatoria. Le email partono dal Gmail di Moonee Lab via SMTP finché non c'è un dominio ([missione](missions/accesso-v1.md)).
- Si aggiunge l'accesso con Google. Su Android passa da un plugin nostro su Credential Manager, senza pacchetti di terze parti che portino l'ID pubblicità. Un account Google conferma 18+ e Termini una volta, prima di qualsiasi dato di coppia. Per eliminare l'account o uscire dalla coppia conferma con lo stesso account Google.
- Facebook no: richiede la verifica di Meta e non aggiunge niente su Android.
- **Governance:** il lavoro va sul branch e su staging. Impostazioni Supabase e Google Cloud, Edge in produzione, merge e pubblicazione hanno ciascuno un'approvazione separata.

## 2026-10-28 — Nuova D4: modello a pagamento «US Plus»

**Fonte:** founder, 28/10/2026, dopo la ricerca in [`lancio-marketing-monetizzazione.md`](product/lancio-marketing-monetizzazione.md) e un giro di domande: «concordo con tutto», con una modifica su Gioca («le 3 sessioni a settimana sono troppo poche»), poi «concordo» sul riepilogo. Sostituisce il punto 4 della delibera del 10/10 («D4 da rivedere») e la sua N.B. sulla quota di Game V2.

1. **Modello:** freemium con un abbonamento, per ora chiamato «Plus». L'uso di tutti i giorni è gratis; si paga per avere di più.
2. **Per coppia:** un abbonamento per coppia. Paga uno, sbloccano tutti e due.
3. **Gratis per sempre:** il gesto verso l'altro, cioè Ti penso, Lasciato per te, la domanda di oggi, il widget e il calendario. **Niente ostaggi:** chi smette di pagare non perde niente di quello che ha creato, che resta visibile; si blocca solo il «di più».
4. **Tempi:** il lancio in produzione su Play è gratis, con «Plus in arrivo». Plus arriva nel primo aggiornamento, 4–6 settimane dopo. Il lavoro su staging parte subito.
5. **Cosa sblocca Plus:**
   - partite illimitate in Gioca;
   - Ricordi oltre un limite gratuito, da fissare con i dati d'uso;
   - «Il vostro anno» completo (gratis resta una versione breve);
   - contenuti nuovi: l'archivio delle domande passate e pacchetti a tema.

   Per i soli contenuti di Plus vale un'eccezione a D5. Gli stili del widget restano fuori per ora. I Compagni restano gratis.
6. **Gioca gratis:** una partita al giorno, cioè 7 a settimana, già dal lancio e non solo con Plus. Sostituisce la quota V1 (1 «Per voi» + 2 libere a settimana). Con Plus le partite sono illimitate.
7. **Tecnica:** RevenueCat sopra Google Play Billing (Billing Library 8 o successiva). Supabase resta l'unica autorità su chi vede cosa: l'ID utente di RevenueCat è l'ID Supabase dell'utente; scrive solo la Edge Function del webhook, il client legge tramite RPC. Stripe solo sul web, mai mostrato né linkato nell'app Android. Prima della vendita vanno aggiornate l'informativa privacy e la sezione Sicurezza dei dati di Play (RevenueCat è un nuovo fornitore).
8. **Casi limite:**
   - se la coppia si chiude, l'abbonamento resta a chi paga e il partner perde l'accesso subito;
   - prima di eliminare l'account si avvisa che l'abbonamento su Play non si disdice da solo, con il link alla gestione degli abbonamenti;
   - il partner di chi paga vede «Plus attivo, grazie a [nome]» al posto del pulsante d'acquisto, così nessuno paga due volte; il pulsante torna quando l'abbonamento sta per scadere.
9. **Coppie fondatrici:** le coppie del test chiuso ricevono 6 mesi di Plus in regalo dal lancio di Plus (fonte `beta`, con scadenza), dichiarati come tali fin dall'inizio. Durante il test chiuso nessuno vede pagamenti.
10. **Prezzo da provare:** 3,99 €/mese o 24,99 €/anno, con 7 giorni di prova sull'annuale. Il prezzo finale si fissa dopo il questionario alle coppie della beta.
11. **Fisco:** il commercialista (partita IVA, dati pubblici del venditore su Play) si sente in parallelo. La vendita in produzione resta bloccata finché non risponde.

**Governance:** la delibera approva la direzione e il lavoro su staging. Ogni passo resta da approvare uno per uno: app di staging su Play Console, account RevenueCat, prodotti di prova, SQL ed Edge su staging, merge, patch in produzione, prezzo finale e pubblicazione.

## 2026-10-28 — Prove solo su staging

**Fonte:** founder, 28/10/2026: «da oggi le prove le faremo tutte su staging perche produzione lo hanno in mano utenti veri e quando la roba su staging funziona faremo delle patch mirate su produzione».

- Ogni prova (SQL, Edge, interruttori, build di prova, dati di test) si fa su US-STAGING (`com.usapp.us.staging`). La produzione è in mano ai tester del test chiuso e poi agli utenti.
- In produzione arrivano solo **patch mirate** di cose già funzionanti su staging, ciascuna con il via del founder. Le letture in produzione restano ammesse; le scritture di prova no.

## 2026-10-29 — Colori delle persone a scelta, con US Plus

**Fonte:** founder, 29/10/2026: «dare la possibilità di cambiare il colore dei cerchi con altre variazioni di colore» e «metterei il cambio colore per la versione premium».

Modifica «Due colori, un Noi» del 14/10 («i premi non toccano mai i colori delle persone»):
- Ognuno può scegliere il proprio colore da una tavolozza di 8: rosa, lilla, cielo, salvia, oro, pesca, rubino, perla. Tutti e due lo vedete uguale sui due telefoni. I due colori della coppia devono essere diversi.
- Senza scelta valgono quelli di sempre: rosa per chi ha creato lo spazio, lilla per chi è entrato con il codice.
- Il colore di Noi non cambia: resta l'orchidea o l'accento sbloccato.
- **Solo con US Plus**, cioè quando almeno uno dei due ha Plus (D4). Il colore già scelto resta anche dopo la fine di Plus, come tutto ciò che la coppia ha creato.
- **Senza Plus la voce si vede, bloccata** (founder, 29/10: «facciamo vedere che si sblocca solo con plus, c'è il pulsante bloccato»): lucchetto e «US Plus»; toccandola si vedono gli 8 colori bloccati e «Si sblocca con US Plus». Nessun pulsante d'acquisto, prezzo o abbonamento finché Plus non è in vendita: per il test chiuso vale ancora D4, «chi è nel test chiuso non vede pagamenti».
- Restano come sono: logo US, icona dell'app, splash e animazione d'apertura (asset approvati).
- Per farlo serve la base dell'accesso Plus su Supabase (missione `plus-v1-staging.md` §2, solo la lettura). Gli acquisti e il webhook di RevenueCat restano ai passi successivi.

## 2026-10-29 — Nuova scala dei premi Sintonia

**Fonte:** founder, 29/10/2026, sessione /grill-me: «devono essere veramente fighe le cose e ovviamente a scalare, quello di livello più alto è più figo del livello basso»; «quelli grandi che ci si arriva piano piano li teniamo [gratis], ne mettiamo giusto un po' a livelli più bassi che possono far venire gola, ovviamente più curati, quelli con il Plus».

1. **Niente si toglie mai.** Chi ha un premio lo tiene. Chi è già a un livello riceve subito, senza annunci a raffica, i premi nuovi che gli spettano.
2. **La scala arriva al livello 20.** Oltre il 20, una stella in più nel vostro cielo a ogni livello. La curva dei punti non cambia (200 per il livello 2, poi +150 a livello); si rivede solo se i dati di produzione la smentiscono.
3. **Un premio principale per livello**, e i 21 premi piccoli di oggi come contorno nei livelli bassi. Dei 14 premi mai usciti tornano solo Istantanea e Filo d'oro; gli altri 12 escono dal catalogo.
4. **Scala gratuita:**

   | Livello | Premio principale |
   |---|---|
   | 2 | Petali |
   | 3 | Maudit |
   | 4 | Cinematic |
   | 5 | Ti penso animato, gufo |
   | 6 | Widget «Notte» |
   | 7 | Istantanea |
   | 8 | Capra |
   | 9 | Accessori I |
   | 10 | Tema delle stagioni |
   | 11 | Drago |
   | 12 | Accessori II |
   | 13 | Icona «Notte» |
   | 14 | Filo d'oro |
   | 15 | Ti penso «lettera» |
   | 16 | Drago che vola |
   | 17 | Widget «Oro» |
   | 18 | Icona d'oro |
   | 19 | Corona per i Compagni |
   | 20 | «Il vostro cielo» |

5. **Extra US Plus** ai livelli 4, 7 e 10, molto curati, accanto al premio gratuito senza mai sostituirlo: Aurora sulla foto di Oggi (livello 4), icona «Neon» dell'app (livello 7), abiti «Gala» per i Compagni (livello 10). Servono il livello e Plus (di uno dei due). Senza Plus si vedono con il lucchetto e «Si sblocca con US Plus», senza acquisti finché Plus non è in vendita. Una volta presi restano anche dopo la fine di Plus.
6. **Regola fissa:** premi Plus solo tra il livello 2 e il 12; mai tra i premi principali gratuiti, mai in cima.
7. **In Noi** si vede in grande il prossimo premio principale, con un'anteprima e la stima «tra circa N giorni» sul ritmo della coppia.
8. **«Il vostro cielo»:** le stelle della sera di «Insieme dal», sopra la città scelta da una lista quando si sblocca. Niente GPS.
9. **Immagini:** prompt scritti da Claude, immagini generate e approvate dal founder (ChatGPT), stile identico al foglio dei Compagni; le icone partono dal logo approvato.
10. **Rilascio:** non nella patch unica (#232–#237), ma in una patch successiva in due fasi. Missione: `docs/missions/sintonia-premi-v2.md`.

## 2026-10-29 — App più ariosa: titoli più piccoli

**Fonte:** founder, 29/10/2026: «la grandezza di tutto all'interno della nostra app la stavo confrontando con couple joy e lì sembra tutto più arioso»; scelto il «dopo» del prima/dopo di sette schermate.

- Il testo normale resta com'è (14–15). Si rimpiccioliscono titoli e parti in evidenza: titoli di pagina 26–28, di sezione circa 20, di scheda circa 17; barra in basso 58.
- I bersagli da toccare restano almeno 40 px; le illustrazioni approvate non cambiano.
- La mascotte segue l'altezza della barra (`--us-nav-height`).
- Le misure si cambiano nei file di design che già decidono (`dc-*.css`, `countdown.css`, `due-colori.css`), non con regole aggiunte sopra.

## 2026-10-29 — Icona dell'app senza cornice

**Fonte:** founder, 29/10/2026: il bordo attorno al logo «forse potrebbe dare problemi a telefoni con le icone a cerchio»; logo nuovo generato e approvato dal founder («Approvate»).

- L'icona del telefono è solo «US» con la stellina, sullo sfondo bianco di sempre: la forma del telefono fa da cornice.
- Il logo con la cornice resta dove non c'è una forma attorno: splash d'apertura, logo in alto nell'app, icona web e notifiche.
- Le icone premio «Notte», «Oro» e «Neon» (Sintonia V2) partono dallo stesso logo senza cornice.

## 2026-10-29 — Accessori dei Compagni disegnati addosso, versioni da maschio e da femmina

**Fonte:** founder, 29/10/2026: gli accessori incollati sopra i Compagni sono «messi malissimo»; «Maudit e il drago sono maschi, quindi la sciarpa sì ma un altro colore e la coroncina evitiamola»; «corona da re e corona da regina»; per il Gala «la gonna su un gufo stona».

- Ogni accessorio è disegnato addosso a ogni Compagno su un foglio ChatGPT identico all'originale, poi tagliato nelle pose approvate. Mai più adesivi sopra il disegno.
- Maschi (Maudit, drago): sciarpina blu notte, coroncina d'alloro, papillon, corona da re. Femmine (capra, gufo): sciarpina rosa, coroncina di fiori, collana di perle, corona da regina.
- Il premio resta uno («Sciarpina», «Coroncina», «Gala», «Corona»): ognuno lo vede nella versione del suo Compagno.

## 2026-10-29 — Fix dalla prova dell'APK di staging

**Fonte:** founder, 29/10/2026, provando l'APK di staging: «in impostazioni la scritta maudit cambiamola con ''compagni''», «il tuo colore facciamolo scegliere anche quando aprono per la prima volta l'app», «tema e effetto perchè sono li in impostazioni se poi sono anche in ''sintonia''», «esce rivivi solo quando è il giorno stesso di quel ricordo»; sul colore: «per la beta però lo lasciamo gratis perchè ancora non inseriamo il plus».

- In Impostazioni la voce dei compagni si chiama «Compagni» (acceso o spento).
- Tema ed Effetto si scelgono solo in Sintonia, dove c'è anche la galleria con le anteprime. Impostazioni non li ripete.
- Ognuno sceglie il proprio colore già alla prima apertura (creazione della coppia o ingresso con il codice). Il colore del partner non si può prendere.
- Finché US Plus non è in vendita i colori sono gratis per tutti. Lo decide il server con l'interruttore `app_flags.plus_on_sale`, che accende solo il founder; da quel giorno cambiare colore richiede Plus e il colore già scelto resta. Modifica la decisione «Colori a scelta con US Plus» del 29/10.
- «Rivivi» compare solo nel giorno esatto di un ricordo passato: stesso giorno e mese («Un anno fa, oggi»), altrimenti stesso giorno del mese («N mesi fa, oggi»). Gli anni vincono sui mesi; negli altri giorni non c'è.
- «Il vostro anno su US» (founder, 29/10: «è rimasto il vostro anno..»): in Noi compare solo quando la coppia compie un anno su US (`couples.created_at`, giorno di Roma; il 29 febbraio vale il 28), per 30 giorni, ogni anno. L'anniversario della relazione in Oggi apre Eventi.
- Il cuore (founder, 29/10: «cambierei anche l'animazione del mi piace … e ogni 3 mi piace una più grande»): i cuori di Oggi (risposta del partner), della risposta a un Ti penso e del Ti penso in alto a sinistra («la stessa cosa anche al Ti penso») hanno la stessa animazione, contati insieme, rosa→lilla, reattiva e senza coriandoli (founder: «più reattivo e satisfied … senza coriandoli»): il cuore scatta al tocco e un'onda si apre attorno; ogni terzo cuore di una persona è quello grande, con lo scatto più alto e una seconda onda. Il conto sta sul telefono di ciascuno.
- Rimandati, ognuno con la sua decisione: Sintonia più semplice (prima un prima/dopo), il mega recap di «Il vostro anno su US» e i recap dei mesiversari, foto senza posizione (selettore nativo).

## 2026-10-29 — Mappa dei Ricordi

**Fonte:** founder, 29/10/2026: grill «Mappa dei Ricordi» (D1–D8, con la prova tecnica D8 sull'APK di staging: la foto della galleria dello Xiaomi è arrivata senza posizione), poi il giro sulla posizione automatica, il fornitore e il posto nell'interfaccia («concordo con tutto»). Patch: [`PROSSIMA_PATCH_PRODUZIONE.md`](store/PROSSIMA_PATCH_PRODUZIONE.md).

- **D1:** un posto per Ricordo.
- **D2:** il posto viene dal GPS della foto **e** dalla ricerca a mano di un posto o di un indirizzo.
- **D3:** serve il consenso. Il posto è arrotondato a circa 100 m (tre decimali, li tiene la colonna stessa) e lo vede solo la coppia (RLS dei Ricordi). Il nome salvato è breve: il posto o la via **senza numero civico**, poi la città.
- **D4:** MapLibre, con le tile di **OpenFreeMap** e la ricerca di **Photon** (komoot): niente chiavi, account o costi. MapTiler no: chiederebbe un account e una chiave del founder. Se l'uso cresce, Photon va ospitato da noi o sostituito: il servizio pubblico è «fair use», senza garanzie.
- **D5:** gratis, niente Plus.
- **D6:** i Ricordi vecchi si collocano solo a mano. **Tutti e due** possono aggiungere, cambiare o togliere il posto di qualsiasi Ricordo della coppia (`set_moment_place`), anche di quelli caricati dall'altra persona.
- **D7:** i traguardi (città e paesi visitati) vengono dopo.
- **Android, posizione automatica:** Android toglie il GPS alle foto che arrivano dal Photo Picker o dal file input del WebView. Il plugin nativo `us-photo-place` apre il **selettore documenti di sistema** (`ACTION_OPEN_DOCUMENT`) e, con `ACCESS_MEDIA_LOCATION`, legge il GPS dell'originale. Niente `READ_MEDIA_IMAGES`: Play lo riserva alle app di sole foto. La prima volta US spiega a cosa serve il posto («Continua» / «Non ora»), poi Android chiede il permesso; nel browser vale la stessa spiegazione prima di leggere il posto dal file.
- **Interfaccia:** «Dove · facoltativo» nel composer, sotto la data; la riga «Dove» nell'album del Ricordo; in Ricordi l'interruttore «Mappa» accanto a «Mese per mese», con i Ricordi come foto rotonde, raggruppati quando sono vicini.
- **Couple Joy (analisi dell'APK 4.29.0 del 29/10, solo per confronto):** usa Google Maps e la ricerca di Google passando dal proprio server (`/v1/places/search`, `/v1/maps/reverse-geocode`, `/v1/map/pins`). Non dichiara `ACCESS_MEDIA_LOCATION`, quindi su Android non legge il posto dalle foto. Conta anche città e paesi visitati, cioè il nostro D7.
- **Governance:** il lavoro va sul branch e su staging. SQL, Edge dell'export, merge e pubblicazione in produzione hanno ciascuno un'approvazione separata; prima vanno aggiornate l'informativa privacy (Photon e OpenFreeMap) e la Sicurezza dei dati su Play.

## 2026-10-30 — Dominio www.uscouple.app

**Fonte:** founder, 29–30/10/2026: dominio `uscouple.app` comprato su Cloudflare, «io volevo www», «il dominio deve stare in produzione»; Resend verificato su `uscouple.app` e SMTP di Supabase produzione attivo («funziona»).

- L'indirizzo principale di US è `https://www.uscouple.app`. `uscouple.app` e `us-a33.pages.dev` restano lo stesso sito, e i link già condivisi continuano a funzionare.
- Inviti, App Links, privacy e termini usano `www.uscouple.app`; l'app Android accetta anche il vecchio indirizzo.
- Le mail di US partono da «US <noreply@uscouple.app>» via Resend, solo in produzione; lo staging resta con la mail di Supabase (scelta del founder).

## 2026-10-30 — L'icona dell'app resta quella di sempre

**Fonte:** founder, 30/10/2026: «su produzione rimane la stessa icona e poi se una persona vuole prende le altre icone sbloccandole su Sintonia».

- In produzione l'icona predefinita resta quella con la cornice. Sostituisce la decisione «Icona dell'app senza cornice» del 29/10, che non va in produzione.
- Le altre icone (Notte, Oro, Neon) si sbloccano in Sintonia, come premi.

## 2026-10-31 — Posizione, widget e Note condivise (dopo lo studio di Love8)

**Fonte:** founder, 31/10/2026: grill D1–D16 sullo studio dell'app Love8, riepilogo confermato («Sì, è giusto»).

- **Posizione:** niente tracciamento continuo. Si aggiungono, in quest'ordine: la batteria del partner (aggiornata solo ad app aperta, con l'orario, senza notifiche); «a casa / fuori» in automatico con un solo recinto attorno alla Casa che ognuno mette sulla mappa (la posizione di casa non lascia il telefono, al server arriva solo lo stato; va attivato da tutti e due; serve «Consenti sempre» e la dichiarazione a Play); la notifica solo per l'arrivo a casa, che ognuno può spegnere; la condivisione a tempo (30 minuti o 1 ora, punto preciso, «Smetti», poi cancellata).
- **Widget:** il primo è «Noi» con a casa / fuori, batteria e distanza; il widget del Compagno è tolto per ora; poi lo stato con emoji e il carosello di foto. Solo Android.
- **Note condivise in Noi:** titolo, testo e lista a spunta, modificabili da tutti e due; vince l'ultimo salvataggio, con l'avviso quando l'altra persona salva la nota aperta. Missione: `docs/missions/note-condivise-v1.md`.
- **Ordine:** Note condivise e widget «Noi» con batteria e distanza; poi «a casa»; poi la condivisione a tempo. Tutto prima su staging.

## 2026-10-31 — Batteria del partner: accanto alla distanza su Oggi

**Fonte:** founder, 31/10/2026: «Accanto alla distanza su Oggi» (scelta tra tre posti, con l'anteprima «( 12 km · 🔋 18% )»). Completa «Posizione, widget e Note condivise» del 31/10, per il posto della batteria nell'app.

- **Oggi:** la batteria del partner sta nella pillola della distanza, dopo i chilometri: icona Phosphor e percentuale. Sotto il 20% e non in carica l'icona è corallo.
- **Scheda «Distanza»** (si apre toccando la pillola): sotto la distanza, una riga con nome, percentuale e da quanto tempo: «Bea · 18% · 2 ore fa».
- La batteria si vede solo accanto a una distanza (anche l'ultima nota). Con «Attiva posizione», «In attesa» o senza pillola, su Oggi non compare.
- **Noi** resta com'è: niente riga della batteria, e la scheda della coppia con la distanza resta spenta.
- **Widget «Noi»:** invariato, con icona e percentuale accanto a «NOI».
- Dopo un giorno la batteria non si vede più, né su Oggi né nel widget.

## 2026-10-31 — Widget: la mappa di «Noi» e il «Messaggio»

**Fonte:** founder, 31/10/2026. Per la mappa ha risposto «li deve prendere da maps», poi, alla domanda di chiarimento, «Vera, ma solo sfondo». Per «Messaggio» ha scelto «Solo tipo e ora». Completa «Posizione, widget e Note condivise» del 31/10.

**Superata il 02/11/2026** dalla famiglia «Pastello» (sotto): niente più mappa, l'asset `us_widget_noi_map_v1` è tolto. Resta valido «Solo tipo e ora» per il Lasciato per te.

- **Mappa del widget «Noi»:** decorativa e fissa, **mai la posizione della coppia**. È un pezzo vero di città, scuro e sempre lo stesso: Torino, il Po. Si disegna una volta con lo stile scuro di OpenFreeMap della Mappa dei Ricordi, senza scritte, e sta dentro l'app. Il widget non si collega a nessun servizio di mappe.
  - Niente Google Maps: le sue condizioni vietano di salvare le immagini, e la Static API chiede una chiave a pagamento.
  - Dati © OpenStreetMap contributors (ODbL), stile OpenFreeMap / OpenMapTiles, citati nella privacy.
  - È candidata (`DRAFT` in `assets/ASSET_MANIFEST.json`) finché il founder non la approva dall'APK di staging.
- **«Messaggio»:** di un Lasciato per te il widget mostra solo il tipo e l'ora («Ti ha lasciato una foto · 10 min fa»), mai le parole, la foto o il link.

## 2026-11-02 — Widget: la famiglia «Pastello»

**Fonte:** founder, 02/11/2026: «mi fanno schifo un po tutti, quelli manterrei per ora sono i 195 giorni insieme con la foto che cambia e quello che dice il partner ''beatrice'' ti ha pensato e sotto ricambia, al massimo lo farei piu veloce e toccando il cuore con la stessa animazione del ti penso dentro l'app». Riferimenti: Love8 e Paired. Tavola approvata: https://claude.ai/artifact/PvmHiSaPhF27JhLr1DzBg4. Sostituisce l'aspetto dei widget del 16/10 («Due colori») e la mappa di «Noi» del 31/10.

- **Stile:** «Pastello», il tema chiaro della tavola: carte chiare a sfumatura, Fraunces per titoli e numeri, Figtree per il testo, inchiostro `#1a1020`. Tutti in piccolo (2×2) e medio (4×2).
- **Avatar:** le foto vere dei profili, tonde, con il colore della persona come bordo. Senza foto, l'iniziale sul colore (rosa per chi ha il ruolo francesco, lilla per beatrice, o il colore scelto).
- **I widget:**
  1. Foto & giorni (rifà «Foto & Noi»; «Giorni insieme» confluisce qui);
  2. Ti penso, più veloce: al tocco passa subito a «Ricambiato · adesso» e invia in sottofondo; il cuore fa la stessa animazione dell'app, in una finestrella trasparente di un attimo sopra la Home; nel medio, quante volte vi siete pensati oggi;
  3. La domanda di oggi;
  4. Distanza e batteria, senza mappa (sostituisce «Noi»);
  5. Come stai, con l'emoji di ognuno: funzione nuova anche nell'app, per ultima, dopo un disegno;
  6. Ricordi a pila;
  7. Lasciato per te (sostituisce «Messaggio»): solo tipo e ora;
  9. Countdown.
- **Non scelti:** il widget «Nota» (la 8). Tolto con un revert: niente migrazione `widget_note_v1`, niente Edge `widget-note`, niente scope `note:rw`. Le Note condivise restano.
- Le classi dei widget che ne sostituiscono uno restano le stesse, così i widget già messi sulla Home non spariscono.

## 2026-11-02 — «Come stai»: le risposte del founder

**Fonte:** founder, 02/11/2026, risposte alle cinque domande di `docs/missions/widget-come-stai-v1.md`, tutte con la proposta.

1. **Dove si sceglie:** nell'app, in Oggi, accanto alla distanza e alla batteria. Il tocco sul widget apre lì. Nessuna scrittura dal widget e nessun token nuovo.
2. **Parole:** ognuno sceglie una volta in Impostazioni la forma maschile o femminile; app e widget usano quella. Senza scelta, la parola non declinata («in amore», «senza energie», «nervi tesi»).
3. **Stati:** i 12 proposti (🥰 😊 😴 😔 😤 🤒 🥳 💼 📚 🏋️ 🚗 🍝). Niente testo libero.
4. **Durata:** 12 ore, con l'ora del server.
5. **Notifica:** nessuna; solo widget e app.

**Dati:** `public.member_status`, una riga per persona, senza storico: stato, forma, `set_at` ed `expires_at` scritti dal server. RLS: la coppia legge, ognuno scrive solo il suo. Va con l'account e con l'uscita dalla coppia, entra nell'export, passa dal canale Realtime unico. Migrazione su staging solo col workflow approvato dal founder.

## 2026-11-02 — Widget: correzioni dopo la prova dell'APK

**Fonte:** founder, 02/11/2026, prova dell'APK di staging (run 41477230331, staging d80f4d57).

- **Foto & Noi:** torna lo stile di prima del Pastello («è più carino») e il nome «Foto & Noi». Resta la foto che cambia ogni ora.
- **Giorni insieme:** era uguale a Foto & Noi, ne resta uno solo, Foto & Noi. La classe resta, nascosta dalla lista dei widget (`hide_from_picker`) e con il nome Foto & Noi, e disegna Foto & Noi: togliere il provider farebbe diventare «Impossibile caricare il widget» quelli già sulla Home. L'app non lo offre e non lo conta più.
- **Tema chiaro e scuro:** ogni widget segue il tema del telefono. Pastello col tema chiaro, «Midnight» (i colori notte di US, il ramo `notte` della tavola) col tema scuro. Niente widget in più: risorse `-night` (colori, sfondi, anteprime) e i colori messi dal codice in due forme (`setColorInt`), così da Android 12 il launcher cambia da solo quando cambia il tema. Le immagini disegnate da US (avatar, pila dei Ricordi) hanno lo sfondo trasparente e vanno bene in tutti e due. Foto & Noi resta com'era prima, scuro.

## 2026-11-02 — Widget: «Foto protagonista»

**Fonte:** founder, 02/11/2026 («dobbiamo pulire questi widget, sono troppo poco artistici»), proposte sul canvas (https://claude.ai/artifact/PvmHiSaPhF27JhLr1DzBg4, sezione «Rework»), poi «ha senso prendere la foto solo quando si tratta di riferimenti», «Segue il tema (B)» e «Sì, implementa».

- **La foto solo dove è il contenuto:** a tutto widget in Foto & Noi (la foto di Oggi) e in Ricordi a pila (le foto del ricordo), sempre prese dall'app. Gli altri sei sono illustrati.
- **Illustrazioni:** campi di colore sfocati e un disegno a tratto per widget, con una grana leggera sopra; mai dischi di colore piatto. Le foto profilo restano piccole e tonde, per dire chi è; senza foto, l'iniziale in Fraunces su un fondo sfumato. Sono risorse WebP con la forma Pastello e quella Midnight, così da Android 12 il launcher le cambia col tema; prima di Android 12 il codice le disegna con gli angoli arrotondati nel tema del momento, senza grana.
- **Fraunces:** il launcher scrive i testi dei widget nel suo carattere. Titoli e numeri (la frase di Ti penso, la domanda, i km, i giorni) sono disegnati da `UsWidgetArt` come immagine bianca col carattere dell'app e colorati col tema; i testi piccoli restano testo vero nel carattere del sistema. Nessun WebView in più.
- **Ti penso:** solo il cuore, nessuna scritta «Ricambia», anche nel 4×2. Non collegato: «Apri US» e sotto il perché, mai tagliato.
- **Foto & Noi** segue il tema (scelta B): col tema chiaro la foto sfuma nella crema Pastello, col tema scuro come prima.
- **Lasciato per te** resta una busta chiusa: la sorpresa non si vede nel widget.
- **Countdown** sempre illustrato: nessun dato nuovo per una foto del viaggio.

## 2026-11-04 — L'icona dell'app perde il riquadro, la stellina resta

**Fonte:** founder, 04/11/2026: «lasciamo la stella di prima, togliamo solo il riquadro» (dopo aver scartato tre versioni con i cuori al posto della stellina).

- Sostituisce «L'icona dell'app resta quella di sempre» del 30/10: l'icona predefinita del telefono è il logo senza cornice approvato il 29/10 (`assets/source/brand/app-icon/us-launcher-symbol-v2.png`), con la stellina com'era. Splash, notifiche e logo dentro l'app restano quelli di sempre.
- Codice: lo stesso del 29/10 (`us_adaptive_foreground_v2`, `mipmap-*/ic_launcher*.png`, `scripts/build-android-brand-assets.ps1`, `android/brand-assets-manifest.json`, `tests/n3-android-brand-assets.test.js`).
- Le icone premio di Sintonia (Notte, Oro, Neon) non cambiano. Su staging dal 04/11; in produzione con la patch, solo con il via del founder.

## 2026-11-03 — Noi nuova, lavagna e sfida della settimana

**Fonte:** founder, 03/11/2026, dopo la revisione di staging: «prima di portare tutto in produzione dobbiamo ripensare alla pagina noi» (missioni inutilizzate, calendario poco protagonista, cerchi e pallini che danno fastidio, Note che si apre in un'altra pagina, Lavagna che non fa da lavagna). Riferimenti: Between, TimeTree, Cupla, Couple Joy e le app per disegnare in due. Mockup approvato sul canvas «Noi · rework»; decisioni D1–D22 del grill-me, riepilogo confermato con «vai».

- **Noi:** due parti. In alto il calendario protagonista (caselle grandi; niente cerchi, pallini né legenda; ogni impegno è un'etichetta col nome nel colore di chi l'ha messo, rosa tu, lilla l'altra persona, orchidea insieme; nei giorni con un Ricordo la casella è la sua foto), viste «Mese» e «Prossimi», e sotto l'agenda del giorno toccato. Eventi, ricorrenze e anniversari stanno nel calendario. Spariscono le tessere Lavagna, Missioni, Eventi e Note e il pulsante «Il nostro giorno» (la data della relazione resta in Impostazioni).
- **Bacheca:** in cima la **lavagna** da disegnare in due (una sola; ogni tratto si salva quando si alza il dito e l'altro lo vede in 1-2 secondi; «Pulisci» chiede conferma; notifica al massimo ogni 2 ore, spegnibile; widget «Lavagna» con l'ultimo disegno, chiaro e scuro, che apre la lavagna). Sotto i **post-it**, scritti e spuntati sul posto, carta a scelta tra quattro colori con l'autore in basso, al massimo 6 su Noi più «Tutti i post-it». Un post-it fisso **«Da vivere»** prende il posto di «Le vostre idee», con le idee già scritte.
- **Sfida della settimana** al posto delle missioni: una sola, scelta da US secondo «Come vi vedete», un cambio a settimana; in Gioca sotto la domanda del giorno, e su Oggi da venerdì se non è fatta. Si chiude con la foto di uno dei due (coppie a distanza: due foto affiancate; una sola a domenica vale 30 punti). La foto diventa un Ricordo segnato «Sfida». 60 punti fissi; scade domenica alle 23:59 di Roma senza penalità; 100 punti in più ogni 4 settimane di fila. Notifiche il lunedì mattina e il sabato se non è fatta, spegnibili.
- **Come si procede:** prima le tavole che mancano (bacheca intera, lavagna aperta, sfida in Gioca e su Oggi, sfida a distanza); dopo l'ok del founder tre fasi su staging in tre sessioni parallele (Noi e bacheca; lavagna e widget; sfida). In produzione tutto insieme, solo dopo l'approvazione del founder; ogni migrazione e ogni passo con la sua approvazione.

## 2026-11-05 — iPhone adesso (cambia D3)

**Fonte:** richiesta del founder del 05/11/2026, arrivata dalla sessione principale: portare iOS al livello della produzione Android adesso, per comprare l'account Apple Developer il prima possibile (iOS è al 36,5% in Italia; in circa una coppia su due c'è un iPhone, che oggi usa solo il sito). Missione: `docs/missions/ios-store-v1.md`.

- **D3 cambia:** Apple non aspetta più la fine di Android. Android resta com'è; l'app iOS si prepara adesso, senza account, e si pubblica dopo l'acquisto.
- **Restano** le scelte iOS del 06/10 (iOS 16, SPM, schema `com.usapp.us` — il bundle iOS è `app.uscouple` dal 13/11, App Group riservato, origine congelata, swipe Indietro, APNs diretto, Face ID/Touch ID).
- **Proposte tecniche della missione, da confermare o cambiare dal founder:** stessa icona di Android 1.4 e stesse icone premio, con l'inquadratura del launcher Android (dagli asset APPROVED); schermata di lancio `#26142E` come la splash Android; solo iPhone nel primo rilascio; italiano e inglese; numero di build come il `versionCode` di Play; firma e caricamento su TestFlight solo dal CI (`ios-testflight.yml`, ambiente `ios-deploy`).
- **Accesso su iPhone (founder, stesso giorno: «Apple e Google»):** Sign in with Apple e Google già nel primo rilascio iOS (strada A della missione, §3). Google su iPhone senza l'SDK di Google: browser di sistema con PKCE, come Credential Manager su Android non porta pacchetti di terzi. Quando si elimina un account Apple, US revoca il token di Apple dal server (regola 5.1.1(v), TN3194).
- **Da decidere dal founder:** ordine delle fasi dei widget.
- **Governance:** acquisto dell'account, push, workflow, merge, secret e pubblicazione hanno ciascuno il suo via esplicito.

## 2026-11-13 — Versione pubblica: tre partite al giorno e «US Plus, in arrivo»

**Fonte:** founder, 13/11/2026, dopo i 14 giorni del test chiuso: «uscire così», «le partite gratis al giorno sono 3 con un contatore visibile delle partite rimanenti»; poi «sì» al riepilogo (colori gratis finché Plus non è in vendita, schermata «in arrivo» con «Avvisatemi»), con la prova solo nell'emulatore di staging e poi la produzione.

- **Si esce senza funzioni nuove.** US va pubblica su Play gratis, con Plus «in arrivo» (D4 §4).
- **Gioca gratis: tre partite al giorno** di qualsiasi tipo, sul giorno di Europe/Rome. Sostituisce D4 §6 («una partita al giorno»). Con Plus resteranno illimitate. In Gioca un contatore con un pallino per partita dice quante ne restano («Ancora 2 su 3 oggi»); finite, «Domani altre 3» e la riga «Partite illimitate con US Plus · In arrivo».
- **Colori a scelta:** restano gratis per tutti finché Plus non si può comprare (come nella beta, `plus_on_sale` spento).
- **«US Plus, in arrivo»:** in Impostazioni (gruppo US Plus) e dalla riga di Gioca, una schermata con cosa sbloccherà (D4 §5, senza i Ricordi finché il limite non è fissato), «Quello che usate oggi resta gratis, per sempre» e «Avvisatemi quando arriva». Nessun prezzo e nessun acquisto. «Avvisatemi» salva solo l'account e la data (`private.plus_waitlist`), si toglie con «Non avvisarmi più» e va via con l'account; il founder legge solo il conteggio.
- **Le sponsorizzate aspettano Plus in vendita;** il marketing parte con i video di Bea, gratis.

## 2026-11-13 — «La cosa di oggi»: riquadro unico, settimana guidata e serie gentile

**Fonte:** founder, 13/11/2026, giro di grill-me (D1–D18) dopo l'analisi dell'uso dei tester (7 su 14 ancora attivi dopo 7 giorni di coppia; domanda del giorno e Ti penso in calo), poi «sì concordo» al riepilogo, chiusura dopo 21 giorni compresa. Da costruire prima dell'uscita in produzione, insieme alla patch della mascotte (1.5.1).

- **Riquadro (D1, D7):** in cima a Oggi, per tutti e sempre, un riquadro «La cosa di oggi» con un'azione sola e un pulsante; il resto di Oggi resta, più in basso. Ordine nei giorni normali: domanda di oggi → «<nome> ha risposto, tocca a te» → «Risposte pronte» → «Mandale/Mandagli un Ti penso» → «Oggi ci siete stati tutti e due ♡» con la serie.
- **Settimana guidata (D4, D5, D8, D9, D13, D14, D12):** solo per le coppie che si completano dopo l'uscita. Sette passi, uno al giorno, sempre dopo la domanda: domanda → primo Ti penso → prima partita → primo Ricordo → impegno nel calendario → Lasciato per te → widget sulla Home. Un passo già fatto si salta; il widget si salta su iPhone finché non c'è l'app nativa. Un passo è della coppia (basta uno dei due), tranne la domanda (tutti e due) e il widget (ciascuno sul suo telefono). Un passo saltato resta lì; il successivo arriva il giorno dopo che è fatto; niente «giorno 3 di 7», solo 7 pallini dei passi fatti; fatto il passo di oggi, «Domani: …». Chiusura automatica 21 giorni dopo l'inizio. Alla fine 100 punti Sintonia, una volta sola.
- **Serie gentile (D2, D3, D11, D15, D16, D12):** un giorno conta quando tutti e due fanno almeno un gesto qualsiasi nel giorno di Europe/Rome (domanda, Ti penso, partita, Ricordo, post-it, Lasciato per te, lavagna, impegno). Un giorno di tolleranza a settimana; con due giorni saltati riparte da 1 senza messaggi tristi e resta il record. Si mostra con il cuore: «♡ 12 giorni di fila insieme». La conta il server (una RPC che dà serie, record e passo guidato) e al rilascio parte dai gesti già salvati. Ai traguardi solo la festa, niente punti.
- **Notifiche (D6, D17):** nessuna nuova; restano domanda alle 9:00, «ha risposto», «Risposte pronte» e il promemoria delle 20:30. L'ora a scelta è rimandata a una patch successiva.
- **Animazioni (D10):** brevi, con «riduci animazioni» rispettato e con i sistemi che ci sono (vibrazioni e suoni di US, gattino, cuore di Ti penso): passo o gesto fatto (spunta, cuori, vibrazione, gattino che salta); serie +1 (numero che scatta, cuore che pulsa); giornata chiusa (le due foto profilo che si toccano); settimana finita o nuovo record (festa grande, una volta sola).
- **Procedura (D18):** disegno delle schermate da approvare → staging ed emulatore → produzione, ogni passo col via del founder.
- **Precisazione (founder, 13/11, «va bene»):** il riquadro della domanda su Oggi esiste già e cambia da solo (domanda → «tocca a te» → «aspettiamo» → «Risposte pronte» → «Rivedi»). Non si rifà: ci si costruisce sopra. Dopo le risposte, al posto di «Rivedi», arrivano il gesto successivo (Ti penso) e la giornata chiusa; la serie prende il posto di «Una domanda, due risposte»; i passi della prima settimana arrivano dopo la domanda; si aggiungono le animazioni. Le frasi usano il nome dell'altra persona («Manda un Ti penso a Bea»), senza indovinare il genere. Il widget è un passo solo sui telefoni che hanno i widget (oggi Android). I 100 punti sono un traguardo Sintonia una volta sola per coppia e non contano nel Ritmo. Dopo la prova nell'emulatore (founder, 13/11: «cozza con il resto e non c'è un tasto») il riquadro ha sempre un pulsante come le altre schede di Oggi: «Fatto ♡», giornata chiusa e settimana finita mostrano «Rivedi» (le risposte di oggi) al posto delle due iniziali, con la stessa misura del testo; la giornata chiusa si festeggia con i cuori.

## 2026-11-14 — Widget su iPhone: tutti quelli di Android più la schermata di blocco

**Fonte:** founder, 14/11/2026, risposte alle quattro domande della sessione dei widget iOS (tabella in `docs/missions/ios-store-v1.md` §4).

- **Cosa:** su iPhone (WidgetKit, estensione `app.uscouple.widgets`, App Group `group.app.uscouple.shared`) tutti i widget Android tranne «Giorni insieme» (su Android è solo un nome tenuto per i widget già messi). Stesso contratto JS e stessa istantanea v2: il JS condiviso non cambia, salvo i passi di «Aggiungi alla Home» qui sotto.
- **Ordine:** W0 ponte, firma e CI → W1 Foto & Noi e Ti penso → W2 La domanda di oggi, Distanza e batteria, Come stai → W3 Ricordi a pila, Lasciato per te, Lavagna, Post-it → W4 schermata di blocco. Dopo W1 sull'iPhone di Bea si propone lo spegnimento del widget Scriptable, ogni passo col suo via.
- **Schermata di blocco:** Ti penso (cuore, invia da iOS 17), Giorni insieme (anche sopra l'ora), Distanza e batteria, Come stai, Lasciato per te (la busta), e il Controllo «Ti penso» di iOS 18 (Centro di Controllo, pulsanti in basso della schermata di blocco, tasto Azione). Niente foto, nomi solo dopo Face ID. Non scelti per ora: l'ultimo Ti penso ricevuto e la domanda di oggi; la sfida della settimana chiede un dato nuovo nell'istantanea.
- **Cuore di Ti penso:** su iPhone l'animazione sopra la Home non esiste; il cuore batte dentro il widget e la scritta passa subito a «Ricambiato · adesso». Su iOS 16 il tocco apre US su Ti penso.
- **«Aggiungi alla Home»:** iOS non lo permette; Impostazioni › Widget mostra i passi per iPhone (tieni premuto sulla Home › Modifica › Aggiungi widget › US). Il testo arriva dal ponte iOS e il JS lo mostra senza controlli di piattaforma: è l'unico cambio al JS condiviso.
- **Procedura:** disegni SwiftUI Pastello e Midnight approvati prima del codice; ogni fase è una PR verde in `ios-native.yml` con la build TestFlight pronta, lanciata e unita solo col via del founder e dopo che Bea ha confermato la build 1.5.0 (457497).
- **Disegni (founder, 14/11, «il resto tutto bello»):** tavola https://claude.ai/artifact/7r3PaBCzW1AP1sgqruCo71 approvata. su iPhone nessun disegno a tratto dietro ai widget (l'arco di Distanza e batteria «mi fa cacare», poi «anche tutti gli altri widget con quel disegnino»): Distanza e batteria piccolo e medio senza l'arco, La domanda di oggi senza il fumetto, Ricordi a pila senza le cornici disegnate; solo il fondo sfumato. Resta la busta chiusa di Lasciato per te, che è il soggetto del widget. Su Android i widget non cambiano finché il founder non lo chiede.

## 2026-11-23 — Il redesign definitivo: staging riparte da main

**Fonte:** founder, 23/11/2026: «dobbiamo buttare il progetto staging, dobbiamo riprendere il progetto principale che al momento è su main e riportarlo su staging» (personaggi al posto dei cerchi, Impostazioni nel profilo in alto a destra, intro coi personaggi, Sintonia rinominata senza mascotte e con il guardaroba, Gioca senza il gioco delle foto né la domanda, gettoni, Oggi senza suggerimenti, Ti penso al centro della barra, colori della coppia, Ricordi a polaroid con una bacheca da detective legata alla mappa); poi «concordo» alle risposte consigliate D1–D14. Piano e decisioni: [`missions/redesign-definitivo.md`](missions/redesign-definitivo.md).

- **Base:** l'app di produzione (`main`). Il diario pulito di staging è archiviato nell'etichetta `archivio/staging-diario-pulito-20261123`; dei suoi pezzi restano solo i personaggi (con il loro database e la tavolozza del 15/11), il Ti penso al centro della barra, la busta e il profilo negli angoli in alto, e le correzioni senza grafica (D1).
- **Sostituisce:** la direzione «Il diario, ma pulito» del 15/11; «Sintonia dentro Gioca» della governance V1 (ora «Il vostro angolo», aperto dai personaggi); i colori fissi delle schede (ora dai due colori della coppia, D7); la regola «niente si toglie mai» del 29/10 per i soli Compagni (D5).
- **Procedura:** tavola approvata prima del codice, poi una fase alla volta su staging; push, unioni, SQL e produzione ciascuno col via del founder.

## 2026-11-24 — Redesign: il guardaroba sui livelli vuoti, il Simbolo US resta

**Fonte:** founder, 24/11/2026, sui numeri della scala dei premi: «il simbolo US il logo lo lasci, per il resto continua con proposta A».

- **Guardaroba:** i primi cinque accessori restano a 150, 400, 700, 1000 e 1350 punti; gala, cuffie, coroncina e corona arrivano all'inizio dei livelli 8, 11, 14 e 19 (4550, 8750, 14300, 26550 punti), che dopo l'uscita di Atmosfere, Colore di Noi e compagni erano vuoti. Il server tiene la regola (migrazione `20261123231417_personaggi_scala_premi.sql`, solo staging finché il founder non dice altro). Il momento del nuovo livello nomina l'accessorio.
- **Simbolo US:** resta tra i premi della Sintonia (effetti ai livelli 6, 9 e 13). Sostituisce la parte di D4 del 23/11 che lo faceva uscire.

## 2026-11-25 — La crescita di US: US vi ricorda, i personaggi parlano

**Fonte:** founder, 25/11/2026: «US deve essere un'app che cresce insieme alla coppia… al momento come cresce?», poi «tutto quanto US pian piano ricorda… e facciamo parlare i personaggini, raramente»; /grill-me D1–D22 confermato con «Tutto okay possiamo partire». Progetto: [`docs/product/2026-11-25-us-vi-ricorda.md`](product/2026-11-25-us-vi-ricorda.md).

- **Crescere** vuol dire che US conosce sempre di più la coppia e le restituisce le sue cose (date, un anno fa, ti aspetta, traguardi, il gioco «Ti ricordi?») per bocca dei personaggi; la crescita si vede in «Cosa US sa di voi». È gratis per tutti.
- **A regole, senza AI** nella prima versione: i dati non escono da US. L'AI si valuta dopo, col sì di tutti e due e un nuovo fornitore dichiarato.
- **Regole fisse:** parla il tuo personaggio; al massimo una battuta al giorno, 9–21; solo dati che entrambi vedono già, con una lista di parole delicate; sorprese a senso unico; ogni battuta prepara il gesto, mai lo fa al posto di nessuno; «Non ora», «Non dirmelo più» e un interruttore unico.
- **Staging e produzione:** su staging prova solo il founder; in produzione si va eventualmente direttamente con la seconda versione, perché US è in beta. Ogni passo con tavola prima, migrazione e lavoro notturno su staging col suo sì.
- **Sostituisce** la parte di Cupido del 13/11 che legava la voce ai Compagni, a US Plus e al livello 3: i Compagni non ci sono più e la crescita è gratis.

## 2026-11-25 — Ti penso ricevuto coi personaggi

**Fonte:** founder, 25/11/2026, dall'APK: «studia la schermata di quando viene ricevuto il ti penso che é ancora quella vecchia… falla più carina nella nuova us fammela vedere prima»; tavola «US · Ti penso ricevuto» (https://claude.ai/artifact/YQ12MPCHsZUiqiRd4ZXCUL) approvata («Approvo»), icona dell'abbraccio A («La A»).

- **La schermata:** il personaggio dell'altra persona scende dall'alto con gli occhi a cuore e dice «Ti penso!» in un fumetto; sotto il nome e «ti pensa». Tre risposte a un tono con il loro nome: Un cuore, Un abbraccio (i due personaggi guancia a guancia), Anch'io (la nuvola). Niente più cerchi e reazioni senza nome.
- **La risposta:** al tocco arriva il tuo personaggio e risponde (un cuore che vola, l'abbraccio, una nuvoletta col cuore), poi la schermata si chiude da sola. Le parole non dicono lui o lei.
- **Restano** le tre reazioni del server (`heart`, `hug`, `miss_you`) e il loro invio: cambia solo l'aspetto.

## 2026-11-25 — Icona con la cornice e apertura coi personaggi

**Fonte:** founder, 25/11/2026: «rifare anche sia la splash art… e anche l'icona prendendo questa che é quella della pwa di staging la voglio anche come icona dell'apk», poi «voglio il quadrato al confine dell'icona», «in quella tonda non si veda il quadrato esterno» e, sulla tavola «US · Icona e apertura» (https://claude.ai/artifact/JyMuw3y4fXnP3PCmQuxKbF), «La A».

- **Icona Android:** il logo con la cornice su bianco, come la PWA, con la cornice sul bordo; l'icona tonda (`roundIcon`) tiene il logo senza cornice. Sostituisce la decisione del 29/10 sull'icona senza cornice, che resta solo per le icone tonde.
- **Apertura A:** dopo la splash di Android, i due personaggi escono da dietro il logo, un cuore e «il vostro spazio», poi l'app (circa 2 s). I personaggi vengono dal telefono (salvati all'ultima apertura, cancellati all'uscita dall'account); senza, solo il logo. Il colore della splash resta #26142E, anche su iPhone.

## 2026-11-25 — Lasciato per te nuovo

**Fonte:** founder, 25/11/2026: «revamp di lasciato per te sempre nel nostro nuovo stile», tavola «US · Lasciato per te» (https://claude.ai/artifact/95kvj2AwMbwjXgRtiPbSmL), «perfetto puoi unire».

- **Ricevere:** un momento a schermo intero col personaggio di chi l'ha lasciato; busta nel suo colore col sigillo della sua forma; la lettera diventa un foglio, la foto una polaroid, il vocale un fumetto. La busta si apre da sola dopo un attimo o al tocco del sigillo, così «si apre una volta» resta com'era (conta quando si vede).
- **Scrivere:** un foglio sempre presente e una sola cosa da aggiungere (foto, vocale, video, musica); le parole del foglio vanno con la cosa aggiunta. Il server resta uguale (un tipo per messaggio, parole fino a 280 con una cosa aggiunta).
- **Parole:** «Tienila/Tienilo» al posto di «Conserva»; niente lui/lei nelle frasi nuove.
- **Dopo:** Conservati come scatola di lettere e polaroid (seconda fase, da disegnare).

## 2026-11-25 — La vostra bacheca, tenuta da US

**Fonte:** founder, 25/11/2026: «studiare bacheca dentro a ricordi… dargli più senso… può essere utilizzata anche dal nostro "cupido"», grill-me D1–D27 («Cupido… è il detentore della bacheca, poi noi abbiamo l'ultima parola»; «uno spazio 3D navigabile… un limite per i free… il resto con il premium»), tavola «US · La vostra bacheca» (https://claude.ai/artifact/8LuLvzRzMcVTDmsHdKnUWG), «Approvo, vai».

- **Cos'è:** la Bacheca in Ricordi è l'anta del frigo della coppia, tenuta da US a regole (niente AI): la prima volta la storia (fino a 8), poi un anno fa, traguardi, il ricordo della settimana e le cose tenute; post-it del perché; fumetto dentro il limite di una battuta al giorno.
- **Ultima parola alla coppia:** fissa, stacca, non appenderla più, sposta (diventa vostra); appendere da sé arriva con la ricerca.
- **Spazio:** bacheca infinita con profondità (CSS 3D, niente motore 3D), strada nel tempo, «Adesso» e «Tutta la storia».
- **Limite:** 12 cose gratis, US Plus senza limite. Sostituisce «la bacheca dei posti» del redesign fase 8 (D12) e, per la sola bacheca, «gratis per tutti» (D8 del grill).
- **Dopo:** post-it vostri (fase 2), ricerca in Ricordi con «Appendi» (fase 3), «Da appuntare» nella Mappa, il gioco «Ti ricordi?».

## 2026-11-25 — Gioca: gettoni che scendono davvero e la giostra dei giochi

**Fonte:** founder, 25/11/2026: «nella sezione gioca i gettoni non vengono utilizzati quando parte un gioco… ne abbiamo 3 giornalieri, aggiungiamo poi una sorta di carosello per i giochi, o un card swapper… rendere la schermata un po' più interattiva».

- **Gettoni:** il server li spendeva già (3 partite nuove al giorno, ora di Roma; riprendere una partita aperta non costa), ma l'app non rileggeva Gioca dopo l'avvio: la scritta restava «Ancora 3 su 3» e chiudendo la partita il gettone tornava acceso. Ora il gettone vola al tocco solo se il server può aprire una partita (ne resta uno e c'è posto fra le 3 aperte); il conto scende quando il server risponde `resumed: false`; con `resumed: true` o un errore il gettone torna acceso; Gioca si rilegge dietro il foglio. Il server resta l'autorità.
- **La giostra, solo per pochi:** poi il founder: «non tutti a carosello… alcuni a carosello e gli altri come prima sono carini… se aggiungiamo dopo dei giochi non diventa un letamaio». In alto «Oggi per voi»: una fila di tre carte grandi da scorrere (agganciate al centro, quelle ai lati più piccole e inclinate, i pallini sotto): Per voi, «Il gioco di oggi» (uno dei giochi a domande, lo stesso per tutti e due tutto il giorno, il prossimo domani) e Questo o quello. Ogni carta dice cosa si fa, quanto dura e cosa costa il suo tasto («Gioca» col gettone, «Continua»/«Rispondi»/«Scopri» senza costo, «Domani» a zero); un tocco su una carta di lato la porta al centro, solo quella al centro parte. Sotto «Tutti i giochi»: le schede di prima, due per riga, ognuno dei giochi a domande una volta. Sostituisce «games are one grid (no sideways deck)» del 2026-10.
- **Giochi nuovi:** ogni gioco a domande ha un genere (Per conoscervi, Per parlarvi, Per ridere, Per ricordare). Oltre sei, «Tutti i giochi» si divide da sola per genere, con un titolino ciascuno. I giochi con un modo di giocare loro (come Questo o quello) vanno nella giostra.
- **Di giorno:** i gettoni spenti e il riquadro a zero hanno l'inchiostro tenue (prima erano tratteggi chiari invisibili sulla carta).

## 2026-11-26 — L'intro col tuo personaggio

**Fonte:** founder, 26/11/2026: «facciamo l'intro quando una persona entra per la prima volta in US deve avere una sorta di tutorial guidato dal suo personaggio e al massimo anche qualche battuta dall'altro». Quattro scelte, tutte col consiglio: subito su Oggi dopo «Entra in US», tappe con Avanti, due battute dell'altro, «Rivedi l'intro» nel Profilo. Poi sulla tavola (https://claude.ai/artifact/5bU5oAjgf9osRX8aumr1z4): «specifichiamo anche come funziona profilo/impostazioni e che la barra dei personaggi si deve toccare e che prima è solo il logo»; «Sì, vai al codice».

- Otto tappe: benvenuto, domanda di oggi, Ti penso, Noi, Ricordi, Gioca, Profilo e Impostazioni, il logo che si tocca e si apre nella barra e nel vostro angolo.
- Illumina e spiega, non fa al posto di nessuno; «Salta» e Indietro chiudono e non torna da sola.
- Una volta per persona per telefono, solo al primo ingresso (non al rientro su un telefono nuovo); chi aspetta da solo ha una riga nella schermata del codice.
- Chi ha già US (i beta tester) la vede una volta da sola al primo avvio dopo l'aggiornamento completo del redesign (founder, 26/11: «parte l'intro a tutti i betatester che hanno già l'app una sola volta»). La memoria è per telefono.
- Parole neutre sull'altra persona (niente «la stai pensando», «mandale»).

## 2026-11-26 — Temi di Oggi e countdown rifatti

**Fonte:** founder, 26/11/2026, sulla tavola «Temi e countdown di Oggi» (https://claude.ai/artifact/Gh85EKBZ7bsKTJ72qNnZUY), sette giri: «I vostri colori mi fa cacare», «adoro» Ora d'oro, Stagioni «non deve rifare la neve» e poi «alberi in alto… falli più realistici»; i countdown «devono essere piccolini», Cartolina e Calendario no, al 9 «Biglietto»; infine «Sì, vai al codice».

- **Temi:** Originale e Pellicola gratis, Ora d'oro 6, Stagioni 12. Escono Romantico e Chiaro di luna (chi li aveva torna su Originale). Notte blu tenuta da parte.
- **Stagioni:** una cosa sui bordi della foto e una dietro la domanda di oggi, ferme: ciliegi e petali, sole e mare, alberi d'autunno, castagne e foglie, ghiaccio e neve. Niente che cade, per non doppiare gli effetti. Cambia da sola col mese di Roma.
- **Countdown:** restano gratis Editoriale, Partenze, Vetro; i premi tengono gli id che il server valida (aurora, orbit, chrome) con disegno e nome nuovi: Post-it 3, Biglietto 9, Filo rosso 18. Tutti piccoli, alla misura vera di Oggi.
- Sostituisce, per countdown e temi, la scala del 25/11 (Calendario 3, Partenze 9, Chiaro di luna 6).

## 2026-11-25 — Premi: una scala che cresce e parla della coppia

**Fonte:** founder, 25/11/2026: «i premi proprio non ci siamo… più avanti si sblocca più belli devono essere e anche un senso con l'app». Grill-me D1–D25 (tutte col consiglio, tranne: Costellazione resta, «è molto bello»; icone solo US Plus), tavola «Premi di Oggi» (https://claude.ai/artifact/M8dY8C3Rvu4Mwvb6Rnw362, v5) approvata: «Approvo, vai». Piano a fasi in `docs/missions/premi-oggi.md`.

- **Effetti di Oggi in tre gradini**, disegnati a mano su canvas (`oggi-fx.js`), nei due colori della coppia, giorno e notte: Base gratis (Cuori, Petali), Natura (Soffioni 4, Neve 7, Foglie 10), Vostri (Stelle cadenti 13, Lanterne 16, Ricordi in volo 20 con le foto vere). Escono Stelle luminose, Lucciole, Luci sfocate, Aurora; temi Cinema, Sogno pastello e Il vostro cielo («non uscirà mai bene»). Niente GIF né immagini generate.
- **Tocco:** in Foto a fuoco ogni effetto risponde al dito (i Vostri anche allo swipe); con un effetto acceso si esce con «Torna a Oggi» o Indietro.
- **Momenti forti:** Ti penso ricevuto (dopo la sua scena), giorno speciale (una volta), livello nuovo; niente con Riduci movimento.
- **Plus** non blocca mai un gradino; le icone dell'app (Notte, Oro, Neon) sono solo Plus, fuori scala; più avanti anche su iPhone.
- **Scala:** subito Cuori/Petali/Romantico/primi accessori; 2 Battito; 3 Countdown Calendario; 4 Soffioni; 5 Ti penso Cuori; 6 Chiaro di luna; 7 Neve; 8 Gala + Due colori; 9 Countdown Partenze; 10 Foglie; 11 Cuffie; 12 Stagioni; 13 Stelle cadenti; 14 Coroncina; 15 Ti penso Lettera; 16 Lanterne; 17 Costellazione; 18 Countdown Filo rosso; 19 Corona; 20 Ricordi in volo.
- **Fasi:** 1 effetti e temi di Oggi; 2 Ti penso (premio quando si apre, Cuori dagli occhi, Lettera vera); 3 countdown (Calendario, Partenze, Filo rosso) e Simbolo US (Battito, Due colori); 4 guardaroba (accessori alti più grandi e animati). Ogni fase porta la sua parte di catalogo, solo su staging e col sì.

## 2026-11-26 — Widget col redesign, Android e iPhone, e il blocca schermo

**Fonte:** founder, 26/11/2026: «dobbiamo rivedere con il nostro redesign i widget presenti su android dare okay e poi ripensarli uguali su ios e studiare anche quelli per il blocca schermo». Tavola «US · Widget del redesign» (https://claude.ai/artifact/Hkj3ojVe3bwEHfg9XeJf6A): «Android ok», poi «tutte okay», con la condizione «se i personaggi cambiano di forma, in tutte le cose dove sono presenti ci saranno quei personaggi».

- **Linguaggio:** foglio del Quaderno di giorno, nero caldo di notte, col tema del telefono. Il colore della coppia sta nelle cose (nastri, tratti, personaggi); la sfumatura dei due solo sul cuore del Ti penso e sul tasto principale (ceralacca di giorno). Polaroid, post-it e busta restano di carta anche di notte.
- **Personaggi:** i widget disegnano i personaggi dell'app, nativi (`UsCharacterShapes`/`UsWidgetCharacter` su Android, gli stessi tracciati di `personaggi.js`), non immagini fisse: l'app passa forma, testa, viso e i due colori (notte e carta) in `couple.characters` e li riscrive a ogni `us-identity-change`. Faccia: il Come stai, addormentati dalle 22 alle 6. Il cambio dell'altra persona arriva sul tuo widget quando la tua app si sincronizza; un avviso silenzioso per farlo arrivare ad app chiusa è rimandato.
- **Set:** gli stessi nove widget su Android e iPhone (misure di ciascuno); Come stai diventa «Voi due»; Distanza senza arco (14/11); Lavagna e Post-it anche 4x2. Solo iPhone: il grande con la foto, i modi Colorata/Trasparente, StandBy.
- **Blocca schermo (solo iPhone):** tinta unica con le sagome dei personaggi e il cuore pieno; sopra l'ora i giorni o l'ultima cosa arrivata; cerchi (Ti penso, Giorni, Distanza con l'anello della batteria, Come sta, busta) e rettangoli (Voi due, Lasciato per te, La domanda, Distanza); il Controllo «Ti penso» di iOS 18 al posto della torcia. Mai risposte, contenuti o posizioni.
- **Ordine:** Android prima (fatto sul ramo `claude/widget-redesign-android-ios-fb63c1`), poi iPhone e blocca schermo dalla stessa tavola.

## 2026-11-27 — Nell'intro prima si crea il personaggio

**Fonte:** founder, 27/11/2026, dopo la prova dell'APK di staging. Chi ha solo aggiornato vedeva l'intro con il personaggio di partenza (tondo rosa per chi ha creato la coppia, quadrato lilla per chi è entrato) senza averlo mai scelto: «aggiungi nell'intro una parte che si spiega e ti fa scegliere il personaggio prima del tutorial e te lo fa creare e personalizzare il minimo senza il guardaroba che si sblocca dopo».

- **Chi:** chi non ha né forma né colore scelti (`character_shape` e `person_color` vuoti). Chi li ha già scelti nella prima apertura va dritto al giro. «Rivedi l'intro» mostra sempre anche la scelta.
- **Cosa:** forma (le cinque) e colore (gli otto, quello dell'altra persona escluso). Si salvano subito con le stesse funzioni della prima apertura e delle Impostazioni (`set_my_character_shape`, `set_my_color`), con le loro regole sul server. Niente accessori: il guardaroba resta nell'angolo, coi suoi sblocchi.
## 2026-11-27 — L'invito dura 14 giorni e chi aspetta riceve un promemoria

**Fonte:** founder, 27/11/2026, sulle idee del controllo generale: «per il resto va bene tutto».

- **Scadenza:** 14 giorni invece di 48 ore. Il codice resta quello di MC2 (128 bit casuali, sul server solo l'impronta), quindi la sicurezza non cambia.
- **Rinnovo:** un codice scaduto si rifà da solo, una volta per apertura, solo se era scaduto. Uno ancora valido non si tocca, perché ne annullerebbe uno già mandato.
- **Notifiche per chi aspetta:** «Avvisami quando entra» le accende con un tocco, mai da sola. Promemoria al giorno 1 e al giorno 3 dalla creazione della coppia, alle 18 di Roma, solo a una coppia di una persona, una volta sola. L’interruttore «Ricorrenze» spento lo blocca.
## 2026-11-27 — La prima settimana guidata, solo per le coppie nuove

**Fonte:** founder, 27/11/2026: «la prima settimana di guida la farei ma solamente per gli account appena creati, quindi per i Beta tester no».

- **Dove:** dentro «US vi ricorda», come un tipo di frase in più (`primi_passi`, priorità 2). Nessuna schermata nuova.
- **Chi:** solo le coppie create dopo che la migrazione è stata applicata (`private.us_primi_passi_start`). Il giorno 1 è quello dopo l'ingresso dell'altra persona: il giorno stesso ci sono già l'intro e la presentazione.
- **Sette passi**, uno al giorno: domanda di oggi, prima foto, una partita, un post-it, il Ti penso, i compleanni, la settimana. Un passo già fatto si salta. Si spengono con «Non dirmelo più», e compleanni e anniversario vincono.
## 2026-11-27 — Avvisi di US vi ricorda e personaggi sempre aggiornati

**Fonte:** founder, 27/11/2026 (via libera alla costruzione): le battute si vedevano solo aprendo l'app; il personaggio dell'altra persona e i widget devono seguire i cambi anche ad app chiusa.

- **Avvisi di US vi ricorda:** solo le battute datate più forti diventano notifica: compleanno tra 7 giorni e il giorno stesso (solo all'altra persona), anniversario tra una settimana (a tutti e due), «un anno fa», e un ricordo appeso oggi da US in bacheca. Mai mesiversario, cento giorni e anniversario del giorno (li manda già «Ricorrenze»), mai le prime volte e le domande.
- **Regole:** al massimo una al giorno a persona (`us-ricorda:<persona>:<giorno>` in `push_event_log`); solo alle 10 e alle 18 di Roma (mai di notte: non esistono ore di silenzio per persona, quindi l'orario è fisso e di giorno); mai una battuta già vista nell'app; rispettano «Non dirmelo più», «Le voci dei personaggi» spente e il nuovo interruttore **US vi ricorda** in Profilo › Notifiche (acceso di serie). Decide il server con le stesse regole delle battute (`us_ricorda_push_due_v1`), senza AI; il testo è nella lingua di chi riceve.
- **Personaggio dell'altra persona dal vivo:** un cambio di colore, forma o vestiti muove `couple_sync` (tipo `looks`); l'app aperta dell'altra persona lo sente su Realtime e rilegge i look.
- **Widget ad app chiusa (Android):** dopo il cambio l'app di chi l'ha fatto chiede a `send-web-push` (`partner_look`) un avviso silenzioso FCM v3 per i telefoni dell'altra persona, col look letto dal server (forma, testa, viso, due colori: niente nomi, foto o testo). Quando l'altra persona esce dalla coppia o cancella l'account, lo stesso avviso (`clear`) svuota i widget come al logout. v3 apposta: le app di prima accettano solo v2 e lo scartano senza mostrare nulla.
- **iPhone:** per ora niente avviso silenzioso (l'app non dichiara `UIBackgroundModes`, scelta da fare a parte); il server è pronto (`apnsSignalRequest`, `IOS_WIDGET_SIGNALS` spento). Su iPhone il personaggio arriva con l'app aperta o al ritorno in primo piano.

## 2026-11-27 — Widget dell'iPhone: avviso silenzioso in background

**Fonte:** founder, 27/11/2026: «fai fix per ios».

- L'app dichiara un solo modo in background, `remote-notification` (`UIBackgroundModes`), solo per i widget.
- `AppDelegate` passa l'avviso a `UsWidgetSignals` (plugin dei widget). Il plugin controlla la versione (3) e che l'account sia quello dei widget (impronta = SHA-256 dell'id, come `widgets.js`). Poi scrive il personaggio dell'altra persona col contratto dei widget, oppure svuota tutto come al logout, e ricarica WidgetKit. Gli altri avvisi passano come prima da `@capacitor/push-notifications`.
- Il server manda ora il segnale anche agli iPhone (`IOS_WIDGET_SIGNALS = true`) e calcola da sé l'impronta del proprietario. Limiti di iOS accettati: consegna quando vuole, mai ad app chiusa a mano.
