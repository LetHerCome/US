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
4. **D4 DA RIVEDERE — Modello economico:** **nessun** prezzo, US Plus, abbonamento, paywall, billing, freemium o promozione commerciale sono approvati. La monetizzazione richiede successiva analisi e nuova delibera. Non implementare sistema commerciale sulla base di una proposta passata.
5. **D5 APPROVATO — Freeze di nuove feature:** stop fino alla V1 per nuovi Arcade (Pulse, Stack Together, Relay, Duo Maze), Diario/Scrapbook esteso, Compagni oltre Maudit, nuovi moduli e redesign generali. Restano **necessari e permessi come release scope**: registrazione/onboarding, account recovery, deletion/export, policy di separazione, privacy, sicurezza, bugfix, performance, accessibilità, compliance e release packaging.

**N.B.:** Il piano del 4 ottobre che prospettava aumento da 3 a 5 sessioni settimanali Game V2 è una proposta futura sospesa; nessun cambio quota V1 autorizzato. Eventuali reward DB o feature branch in sospeso richiedono SQL/client rollout separato e approvato.

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
