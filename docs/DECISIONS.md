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

- iOS is a Capacitor 8 target in `ios/` (Swift Package Manager) sharing the Android web bundle; bundle id `com.usapp.us`, deployment target **iOS 16.0**.
- Shared product JS stays platform-neutral; iOS specifics live in `ios/` and native-only glue in `native-entry.mjs` / `app-links.mjs`.
- iOS Back = left-edge swipe into `UsNavigation.handleNativeBack()`; never exits the app.
- Public URL scheme `com.usapp.us`; reserved App Group `group.com.usapp.us.shared` for all future extensions; refresh tokens never go in the App Group.
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
- Il cuore (founder, 29/10: «cambierei anche l'animazione del mi piace … e ogni 3 mi piace una più grande»): i cuori di Oggi (risposta del partner) e di Ti penso hanno la stessa animazione, rosa→lilla con i puntini; ogni terzo cuore di una persona è quello grande, con i fuochi d'artificio. Il conto sta sul telefono di ciascuno.
- Rimandati, ognuno con la sua decisione: Sintonia più semplice (prima un prima/dopo), il mega recap di «Il vostro anno su US» e i recap dei mesiversari, foto senza posizione (selettore nativo).
