# Missione 2 — La vostra settimana

Base: `origin/main` `b0c9f82d7830f13a0310016067e36da961855d23` (PR #176 integrata).
Branch: `codex/us-v6-week-participation`. Nessuna applicazione SQL o modifica dei dati in produzione.

## Problema e cause verificate

La fascia Gioca calcolava il calendario sul dispositivo e non leggeva completamenti persistiti. `daily_answers.created_at` e `updated_at` erano scrivibili dal client: non costituiscono prove del giorno di partecipazione. Game ha già sessioni condivise, completamenti server e un limite di tre sessioni per settimana; Sintonia ha già il ledger `progression_events`.

## Correzione

- Ricevuta `daily_answers.server_answered_at` della prima INSERT autenticata, immutabile anche attraverso upsert e UPDATE. I valori forniti dal client vengono ignorati. Le righe precedenti conservano NULL, senza backfill; DELETE/TRUNCATE client e reset attraverso il parent Daily vengono revocati.
- RPC senza argomenti `get_couple_week_participation_v1()`: autentica l'utente permanente e ricava la coppia dal profilo server. Helper privato non eseguibile dai client, `search_path` vuoto, grant espliciti. Lettura di sette giorni lunedì–domenica con limiti di mezzanotte Europe/Rome.
- Verde solo con entrambe le ricevute della domanda di quella data e una stessa sessione avente entrambe le side e il completamento condiviso in quella data. Sessioni differenti, incompiute e completamenti a cavallo della mezzanotte non valgono.
- XP settimanali: somma del ledger esistente per `action_day`, per tutti i suoi contributi. Nessun bonus, cambio di XP già assegnati o nuova scrittura del ledger.
- Gioca usa esclusivamente date, stati, conteggio e XP della RPC. Lettura indipendente dal catalogo Game, invalidazione su errore/cambio identità, retry e refresh al ritorno rete e dopo Daily/Game. Offline non presenta zero o spunte inventate.
- Marker PWA coerenti `us-week-participation-v6-20261009-1`; upgrade da V5 e dalla release Missione 1 testati su un'installazione già presente.

File materiali: migrazione `20261009185803_us_v6_week_participation.sql`, `games.js`, `games.css`, `app.js`, marker in `index.html`, `service-worker.js`, `version.json`, `manifest.webmanifest`; suite `us-week-participation-*`, fixture MC2 e job CI dedicato.

## Verifiche

Le suite SQL eseguono baseline e migrazioni reali in PGlite: spoof timestamp, upsert, identità immutabili, grant/RLS, anonimato e isolamento fra coppie, storico NULL, date della domanda, sessioni differenti/attese, cambio settimana e giornate DST di 23/25 ore. Fingerprint delle authority Game/Sintonia e ledger rimangono invariati. Un substrate con grant Game inattesi viene rifiutato prima di aggiungere colonne.

La suite client copre richieste fuori ordine, cambio A→B→A, payload malformati, errori/offline/retry e calendario server anche con data dispositivo errata. Le regressioni del ritmo Game verificano budget tre, rollover lunedì e rotazione esistenti.

La suite PostgreSQL usa due connessioni e le RPC Game reali: upsert concorrenti preservano la prima ricevuta; nessun verde prima del commit di entrambi; retry non duplicano XP e la sessione consuma una sola unità del budget tre. Su Windows questi due casi sono saltati esplicitamente; il job `week-concurrency` richiede PostgreSQL e fallisce se non può eseguirli.

Il primo job CI si è fermato prima dei test perché Ubuntu forniva PG16, incompatibile con i grant MAINTAIN della baseline PG17. L'harness ora espone il diagnostico SQL originale e il job installa PG17 dal [repository ufficiale PGDG](https://www.postgresql.org/download/linux/ubuntu/). La baseline viene eseguita senza trasformazioni.

Browser Chromium: prima/dopo a 320×568, 390×844 e 844×390, classi Android native, safe area 24/20, movimento ridotto, errori/retry e Back del Daily. Screenshots prodotti dal runtime e revisionati visivamente in `visual/before/` e `visual/after/`. La cattura attende la chiusura naturale del nudge Daily; conteggio e XP devono essere visibili e non coperti dalla navigazione. Upgrade PWA: vecchi HTML/JS/CSS realmente installati, activation, hash di tutti gli asset precached/serviti, reload offline, precache interrotto e cache privata preservata. Daily Reveal conserva le regressioni mobile della PR #176.

Baseline `npm test` su main prima delle modifiche: **1771 test, 1625 pass, 40 fail, 106 skip**. I fallimenti preesistenti vanno confrontati per nome, non soltanto per numero. Esiti finali e CI vengono riportati nella PR.

Verifica finale locale: **1793 test, 1642 pass, 40 fail, 111 skip**; confronto dei nomi: nessun nuovo fallimento e nessun fallimento baseline occultato. Suite Missione 2: 17 pass, 2 skip PostgreSQL reali; MC2/controller/ritmo Game e nuova partecipazione: 41 pass, 3 skip del ritmo concorrente su Windows. Daily/client/Conserva/PWA runtime/logout/push: 73 pass. Un precedente run concorrente aveva superato il timeout 10s di un test branding P1: il rerun isolato (5 pass) e la suite finale senza carichi aggiuntivi confermano il recupero, senza modifica del test.

Build disponibili: Cloudflare Pages e Capacitor web, sync Android locale. Gradle locale `testDebugUnitTest assembleDebug --offline --no-daemon` si arresta prima della compilazione per `Unable to establish loopback connection`, già noto sulla baseline. La build iOS richiede macOS. Nessun APK aggiornato/installato e nessun deploy manuale.

Build finali riuscite: Cloudflare 169 file; Capacitor 166 file, hash `60411385f1547f019481030c395f548c930fab1808d0cc1596be784105835caa`; sync Android senza diff dei sorgenti native. Syntax JS, YAML workflow e `git diff --check` passano. CI PostgreSQL e native vanno verificati sulla PR draft prima del rollout.

Ultimo run browser combinato: **19 pass, zero fail/skip** (9 PWA startup/upgrade, 6 Daily mobile, 4 fascia settimanale). Le catture revisionate sono del run con `US_WEEK_QA_SHOTS` impostato alla cartella `visual`; il rerun finale senza esportazione conferma gli stessi controlli.

## Review e limiti

Review indipendente dell'intero diff: nessun rilievo Critical/Important. Il rilievo minore sulla visibilità degli XP nelle catture è stato corretto nel test con nuove immagini e controllo geometrico/hit-test.

Game identifica i partecipanti mediante gli slot server `actor_role`, come il dominio esistente. La normale API MC2 non sostituisce un membro di una coppia completa. Una sostituzione amministrativa diretta dei profili/ruoli richiede un audit dello storico Game prima di riusarlo per un nuovo membro; questa PR non crea un nuovo dominio d'identità Game.

Ricevute legacy NULL restano non verificabili anche dopo modifica della risposta. Un gioco completato dai due partner in date diverse non completa nessun giorno. La RPC assente prima del rollout mostra indisponibilità esplicita. La protezione riguarda i client autenticati/anonimi; un amministratore database resta un'autorità privilegiata.

## Android fisico ancora da eseguire

- WebView Capacitor e PWA installata su dispositivo reale: portrait/landscape, font aumentato, gesture bar e safe area OEM.
- Due account su due dispositivi: prima risposta/attesa, risposta partner, completamento delle due side, aggiornamento Gioca dopo ritorno in foreground.
- Rete intermittente e ripresa dall'offline; cambio account senza contenuti della coppia precedente.
- Back hardware/gesture dal Daily e navigazione Gioca, sospensione/ripresa e passaggio mezzanotte/lunedì con orologio dispositivo errato.
- Upgrade di un'installazione reale Missione 1 e precedente V5, reload offline e verifica versione coerente.

Le emulazioni Chromium non certificano queste verifiche su hardware Android.
