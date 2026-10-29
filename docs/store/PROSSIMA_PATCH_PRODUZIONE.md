# Prossima patch in produzione

**Stato:** in prova su staging (https://us-staging-s31.pages.dev). Niente è in produzione. Ogni passo qui sotto ha il via separato del founder (regola «prove solo su staging», `docs/DECISIONS.md`, 28/10/2026).
**Build:** `us-emoji-20261029-56`.
**Branch:** `claude/gioca-una-al-giorno` (PR #232), sopra `claude/fix-amici-beta` (PR #233) poi `claude/traguardi-giorni` (PR #234) poi `claude/invito-app-links` (PR #235) poi `claude/aggiornamento-app` (PR #236) poi `claude/colori-plus` (PR #237) e infine `claude/emoji-tastiera`.
**Patch unica (founder, 29/10):** tutte queste PR più i fix dei tester che arrivano nel frattempo, in produzione insieme e solo con il via del founder.

## Testo «Novità» per Google Play

Italiano (massimo 500 caratteri):

> Gioca: una partita al giorno, con il conto di quelle rimaste.
> Invito: un link che apre US con il codice già pronto.
> Registrazione: password visibile, Google anche in «Crea un account», accesso automatico dopo la mail di verifica.
> «Insieme dal» con giorno, mese e anno.
> Google: niente più schermate sovrapposte.
> Traguardi ogni 100 giorni insieme: i 1000 valgono di più.
> D'ora in poi US si aggiorna da sola.
> Emoji: la tastiera le propone in ogni campo dove scrivete.

English (500 characters max):

> Play: one game a day, with a count of what is left.
> Invites: a link that opens US with the code ready.
> Sign-up: show your password, Google in “Create an account” too, automatic sign-in after the verification email.
> “Together since” with day, month and year.
> Google: no more overlapping screens.
> Milestones every 100 days together: 1000 is worth the most.
> From now on US updates itself.
> Emoji: the keyboard offers them in every field where you write.

## Cosa cambia

### Gioca: una partita al giorno (D4, PR #232)

- **Server:** la migrazione `20261028201759_gioca_daily_limit_v1.sql` concede una nuova partita per giorno di Roma, di qualsiasi tipo; prima erano 1 «Per voi» più 2 libere a settimana. Le partite aperte si riprendono senza consumare; al massimo 3 restano aperte.
- **App:** «Da domani», «Nuovi giochi domani», «Per oggi avete giocato».
- **Contatore:** sotto «I vostri giochi» si legge «1 partita da giocare oggi» oppure «Domani un'altra partita».

### Fix dal test chiuso (amici del founder, 28/10)

- **Password:** un pulsante con l'occhio la mostra o la nasconde, in accesso, registrazione e nuova password. Torna nascosta quando cambia schermata. Icone Phosphor 2.1.1 `Eye` ed `EyeSlash`.
- **Google anche nella registrazione:** «Continua con Google» c'è anche in «Crea il tuo account». Il passaggio dei Termini resta quello di prima.
- **Google, schermate sovrapposte:** dopo «Prima di entrare» (i Termini di Google), «Iniziamo da te» si apriva sotto i Termini, che restavano a schermo. Ora la configurazione prende il posto di ogni schermata d'accesso.
- **Invito con un link:**
  - «Condividi» manda «Ti aspetto su US ♡ / Apri il mio invito: / https://us-a33.pages.dev/invito#CODICE», senza la scadenza: la scadenza la dice chi invita, che la vede in US.
  - La pagina `/invito` mostra il codice da solo, con «Copia codice», «Usa US dal browser» e «Scarica US da Google Play».
  - Il codice sta dopo `#`, quindi non arriva nei log del server.
- **Codice incollato:** nel campo del codice si può incollare tutto il messaggio di WhatsApp, anche quello vecchio, oppure il link. US trova da solo il codice.
- **Il link apre l'app Android (App Links, 29/10):**
  - con US installata, `https://us-a33.pages.dev/invito#CODICE` apre l'app e non il browser;
  - il codice resta pronto per «Ho un codice d'invito»: se sei su «Voi», US ci va da sola;
  - il sito lo dimostra ad Android con `/.well-known/assetlinks.json` (pacchetto `com.usapp.us` e impronta SHA-256 della chiave di firma di Play);
  - nel manifest c'è un intent-filter `autoVerify` su `/invito`; l'app di staging usa `us-staging-s31.pages.dev`.
- **App web aperta dal link:** se l'invito apre US dal browser, il codice è già compilato in «Ho un codice d'invito».
- **«Insieme dal»:** tre tendine, giorno, mese e anno (dal più recente al 1900), al posto del calendario.
- **Dopo la mail di verifica:**
  - tornando in US, la schermata «Verifica la tua email» prova da sola ad accedere, al massimo una volta ogni 15 secondi e 12 volte in tutto, per restare lontani dal limite di Supabase (circa 30 accessi ogni 5 minuti);
  - la password resta solo in memoria, mai salvata, e si dimentica appena si lascia quella schermata;
  - il testo ora dice «Poi torna qui: l'accesso è automatico.».

### Traguardi dei giorni insieme (founder, 29/10)

- **Quando:** ogni 100 giorni da «Insieme dal», contati in giorni di calendario come il contatore di Oggi. Il giorno di «Insieme dal» non conta.
- **Punti Sintonia:** 80 per ogni centinaio; 300 per 1000, 2000, … (più dei 200 dell'anniversario).
- **Server:**
  - la migrazione `20261028232743_days_together_milestones_v1.sql` aggiunge il tipo `days` e la colonna `days_together` a `relationship_milestones`;
  - `award_relationship_days_milestone` è solo per service_role e ricontrolla che i giorni corrispondano a «Insieme dal».
- **Funzione oraria** `monthiversary-job`, alle 9 di Roma:
  - assegna il traguardo dei giorni accanto al mesiversario, e se cadono lo stesso giorno contano tutti e due;
  - manda una sola notifica a testa, sul traguardo dei giorni: «US. · 100 giorni ♡ / Oggi sono 100 giorni insieme»; per i 1000, «US. · Mille giorni ♡».
- **App:**
  - in Oggi, il giorno stesso, «Oggi sono mille giorni ♡ · Un traguardo tutto vostro» (per gli altri centinaia, «Oggi sono 300 giorni ♡ · Un traguardo insieme»), al posto del mesiversario;
  - in Eventi e nel calendario di Noi, il prossimo traguardo con il conto alla rovescia;
  - in Rivivi, il traguardo festeggiato.
- **Nessun arretrato:** chi ha già passato un traguardo vede il prossimo.

### Aggiornamento dell'app (founder, 29/10)

- **Dentro l'app (Google Play In-app updates):** plugin `@capawesome/capacitor-app-update` 8.1.0 (MIT), nuovo modulo `app-update.js`. All'avvio e a ogni ritorno nell'app, al massimo ogni 6 ore, US chiede a Play se c'è una versione nuova:
  - **normale** (priorità 0–3): Play la scarica in sottofondo, poi compare «Aggiornamento pronto · Riavvia». La richiesta di Play di scaricarla compare al massimo una volta al giorno per versione;
  - **urgente** (priorità 4–5): la schermata di aggiornamento di Play a tutto schermo, che si può rimandare.
- **Versione minima dal server:**
  - la migrazione `20261029012149_app_min_version_v1.sql` crea la tabella `app_min_version` (android e ios, partono da 0) e la funzione `get_app_min_version`, leggibile solo dopo l'accesso (regola F1B: nessuna funzione per `anon`); se non si legge, l'app riprova al ritorno successivo;
  - sotto la versione minima, US mostra «Aggiorna US» e non si apre finché non è aggiornata: con l'aggiornamento di Play se Play ha la versione nuova, altrimenti apre la pagina dello Store.
- **Workflow «Android Play bundle»:** nuova scelta `update_priority` (0–5) quando carica l'AAB.
- **Come si usa:**
  - di norma non si fa niente: con priorità 0 l'aggiornamento arriva da solo;
  - per un rilascio che rompe le versioni vecchie, **dopo** che il nuovo AAB è su Play, una SQL approvata: `update public.app_min_version set min_version_code = <versionCode>, updated_at = now() where platform = 'android';`
- **Attenzione:** funziona dalla versione che contiene il plugin. Chi ha la 1.2.4 deve aggiornare a mano un'ultima volta.

### Colori a scelta con US Plus (founder, 29/10)

- **Decisione:** `docs/DECISIONS.md` del 29/10. Modifica «Due colori, un Noi» del 14/10.
- **Cosa:** ognuno sceglie il proprio colore tra 8 (Rosa, Lilla, Cielo, Salvia, Oro, Pesca, Rubino, Perla) in Impostazioni › Profilo › «Il tuo colore». Lo vedete tutti e due, e i due colori della coppia sono sempre diversi. «Torna al colore di sempre» rimette rosa (chi ha creato lo spazio) o lilla (chi è entrato). Il colore di Noi non cambia.
- **Solo con US Plus:** il colore si cambia solo se almeno uno dei due ha Plus, e quello scelto resta anche dopo la fine di Plus.
- **Senza Plus la voce si vede, bloccata:** lucchetto e «US Plus»; toccandola si vedono gli 8 colori, più chiari e senza cerchietti di scelta, e «Si sblocca con US Plus». Toccare un colore mostra l'avviso «Si sblocca con US Plus». Nessun acquisto, prezzo o abbonamento finché Plus non è in vendita.
- **Server:** migrazione `20261029014653_person_colors_plus_v1.sql`:
  - `plus_entitlements`: la base dell'accesso Plus (missione `plus-v1-staging.md` §2, sola lettura). Una riga per persona e fonte (play, beta, manuale); la scrive solo il server; ognuno legge la propria;
  - `get_couple_plus()`: «la coppia ha Plus?» e grazie a chi;
  - colonna `profiles.person_color` e `set_my_color()`, che ricontrolla Plus, gli 8 colori e il colore del partner.
- **App:** nuovo `person-colors.js`. I colori arrivano dal profilo all'avvio e al ritorno nell'app; tutta l'interfaccia legge `--us-rosa` e `--us-lilla`, quindi cambia insieme.
- **Restano uguali:** logo, icona, splash, animazione d'apertura e, per ora, **i widget Android** (oggi «io» è sempre lilla e il partner rosa). Collegarli ai colori scelti è un passo a parte, nativo.
- **In produzione tutti vedranno la voce bloccata** finché Plus non c'è. Per sbloccarla a una coppia serve una riga in `plus_entitlements` (fonte `manuale` o `beta`).

### Emoji sulla tastiera (founder, 29/10)

- **Problema:** nell'APK la tastiera a volte offriva le emoji e a volte no.
- **Causa:** alcuni campi avevano `autocomplete="off"`. Il WebView di Android lo passa alla tastiera come «niente suggerimenti», e lì Gboard toglie le emoji. Il founder ha confermato sul telefono: le emoji mancavano proprio in quei campi.
- **Correzione:** il segno è tolto dai campi dove si scrive:
  - titolo del calendario («Che cosa fai?»);
  - nome del conto alla rovescia («Il nostro viaggio»);
  - didascalie di foto e vocali in Lasciato per te.
- **Resta** dove le emoji non servono: codice d'invito, parole di conferma («ELIMINA», uscita dalla coppia), orari del calendario, ricerca del brano e nomi dell'iscrizione.
- **Test:** `tests/keyboard-emoji.test.js` tiene l'elenco dei soli campi che possono avere il segno.
- **Da provare sull'APK:** serve un APK nuovo, perché le schermate sono dentro l'app.

## Ordine in produzione (ognuno con il suo via)

0. **Mail di conferma** (founder, in Supabase produzione: Authentication › Emails › Templates › Confirm signup): la riga «Poi torna in US e accedi con email e password.» diventa «Poi torna in US: l'accesso è automatico.».
1. **SQL** con il workflow «Supabase SQL (manual)», target `production` e conferma `PRODUZIONE`, nell'ordine: Gioca (`20261028201759_gioca_daily_limit_v1.sql`), traguardi (`20261028232743_days_together_milestones_v1.sql`), versione minima (`20261029012149_app_min_version_v1.sql`), colori e Plus (`20261029014653_person_colors_plus_v1.sql`). Prima serve un token Supabase che includa il progetto di produzione: quello attuale vale solo per staging.
1b. **Edge Function** `monthiversary-job` con il workflow «Supabase Edge deploy», target `production`, dopo l'SQL dei traguardi: usa la nuova funzione del database.
2. **Sito web** (Cloudflare Pages `us-a33`): porta `/invito`, `/.well-known/assetlinks.json` e l'app web nuova. Va pubblicato prima dell'AAB: il link condiviso dall'app punta a `us-a33.pages.dev/invito`, e Android verifica il file quando installa l'app.
3. **AAB** sul test chiuso «Alpha» di Play, con il testo «Novità» qui sopra.

Tra il passo 1 e il passo 3 l'app vecchia dice ancora «lunedì» per una partita che torna domani: sono sbagliate solo le scritte, i limiti funzionano.

## Da sapere

- **App Links e build installate a mano:** il file dichiara solo la chiave di firma di Play. Un APK installato a mano (staging o interno) apre il link nel browser.
- **Google Play dalla pagina d'invito:** durante il test chiuso la scheda dello store si apre solo per i tester.
- **Staging:** i cron sono spenti, quindi i traguardi non arrivano da soli alle 9. Plus si dà a tutti gli account con `docs/store/US_STAGING_PLUS_PER_TUTTI.sql`, e tutta la Sintonia si sblocca con `docs/store/US_STAGING_SINTONIA_TUTTA.sql`. Sono dati di prova: **non fanno parte della patch** e non vanno mai eseguiti in produzione.
- **Mail di verifica nello spam:** si risolve con un mittente email nostro (SMTP personalizzato in Supabase). È una decisione a parte.
- **App di staging:** dall'APK di staging il link d'invito punta comunque al sito di produzione. Sul web di staging punta a staging.

## Dopo la patch unica: Premi Sintonia V2 (non incluso)

Decisa il 29/10 (`docs/DECISIONS.md`, «Nuova scala dei premi Sintonia»; missione `docs/missions/sintonia-premi-v2.md`). Va in una patch successiva, in due fasi, ognuna con il via del founder.

- **Fase 1, server** (branch `claude/sintonia-premi-v2`):
  - la migrazione `20261029031726_sintonia_rewards_v2_phase1.sql` sposta i 21 premi di oggi ai livelli 2–12, segna i premi principali e aggiunge Ti penso animato (5), Tema delle stagioni (10, l'ex «Autunno»), Il vostro cielo (20) e Aurora (4, extra Plus);
  - i premi Plus si sbloccano con il livello e Plus, e restano;
  - `get_progression_v1` dà anche il prossimo premio principale con i punti che mancano e i punti delle ultime 2 settimane;
  - chi è già a un livello riceve i premi nuovi, già segnati come visti.
- **Fase 1, app:**
  - in Noi, «Prossimo sblocco» mostra il prossimo premio principale (o il Compagno se arriva prima), con «mancano X XP · circa N giorni» sul ritmo delle ultime 2 settimane;
  - gli extra Plus bloccati dicono «Livello N · US Plus», nella collezione e nella galleria di Oggi;
  - **Aurora** (extra Plus, livello 4): bande di luce verdi, azzurre e viola che si muovono sopra la foto di Oggi;
  - **Stagioni** (livello 10, ex «Autunno»): Oggi cambia da solo con la stagione di Roma, con fiori in primavera, sole d'estate, foglie d'autunno e neve d'inverno;
  - i livelli di riserva di temi ed effetti nell'app seguono la scala nuova;
  - **Ti penso animato** (livello 5):
    - nella collezione della Sintonia c'è il gruppo «Ti penso», con «Classico» gratis e «Cuori»;
    - chi ha scelto «Cuori» sul suo telefono, quando riceve un Ti penso, vede salire una pioggia di cuori nei colori della coppia;
    - niente animazione con «riduci animazioni».
  - **«Il vostro cielo»** (livello 20, un tema di Oggi):
    - le stelle vere di «Insieme dal», sopra la città della coppia, scelta da una lista di 45 città italiane («Dove eravate quella sera?»), all'ora che dicono loro («A che ora vi siete messi insieme?», le 22 se non la cambiano). L'ora conta più della città: il cielo gira di circa 15° ogni ora, mentre tra due città italiane cambia di una decina di gradi;
    - su Oggi le stelle stanno **sopra la foto**, che resta visibile e solo più scura in alto (founder, 29/10: niente disco che la copre); il disco con N, E, S, O resta solo nell'immagine da salvare;
    - le stelle più luminose hanno un alone;
    - dopo il livello 20, una stella d'oro in più a ogni livello;
    - «Salva l'immagine» crea un PNG con titolo, data, città e ora.
    - **Dati:** le 904 stelle fino alla magnitudine 4,5 del catalogo Yale Bright Star (NASA ADC / CDS V/50), in `assets/data/stars-bsc5-v1.json`, 24 KB, caricate solo quando il cielo si vede.
    - **Server:** colonne `couples.sky_city` e `couples.sky_minutes` (minuti dopo mezzanotte, vuoto = 22:00) e `set_sky(città, minuti)` nella stessa migrazione della Fase 1, che si può rieseguire. La prima versione `set_sky_city()`, solo su staging, viene tolta.
  - **Peso dell'app:** il limite sale da 2,85 a 2,9 MB.
  - **Galleria di Oggi, anteprima nel dettaglio:** era vuota per tutti i temi e gli effetti (altezza in percentuale risolta a 0, dal 9/10); ora ha un'altezza esplicita.
  - **Da provare sul telefono:**
    - «Salva l'immagine» nell'app Android installata: il WebView potrebbe non scaricare il file;
    - i cuori quando arriva un Ti penso vero.
