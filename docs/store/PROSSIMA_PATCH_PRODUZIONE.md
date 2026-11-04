# Prossima patch in produzione

## Uscita in produzione: l'ordine (preparato il 04/11/2026, ogni passo col via del founder)

Controllo prima dell'uscita (04/11): revisione del codice main…staging (3 correzioni fatte, nessun errore aperto); suite completa 2537 passati e 0 falliti; test nel browser vero con gli stessi 15 fallimenti che ha già main (test vecchi, non errori nuovi); APK firmato costruito e widget provati sull'emulatore.

1. **Database di produzione**, una migrazione per volta, in quest'ordine (workflow «Supabase SQL», target production, conferma PRODUZIONE):
   1. `20261031120000_ortografia_domande.sql`
   2. `20261031132258_couple_notes_v1.sql`
   3. `20261031134410_couple_battery_v1.sql`
   4. `20261102170000_member_status_v1.sql`
   5. `20261103010817_s32_export_notes_battery_status.sql`
   6. `20261103204751_couple_notes_color.sql`
   7. `20261103205050_lavagna_v1.sql`
   8. `20261103205157_weekly_challenge_v1.sql`
2. **Funzioni del server in produzione:** `send-web-push` (lavagna, foto della sfida) e `weekly-challenge-job` (nuova). La funzione della sfida va **prima** della sua pianificazione.
3. **Database, ultime due:** `20261103205200_weekly_challenge_job_cron.sql` (in produzione il cron parte davvero: primo invio il lunedì alle 9) e `20261104140000_atmosfere_gradienti.sql`.
4. **Sito:** PR da staging a main e merge; Cloudflare pubblica la produzione da main. Prima del merge: build id di produzione al posto di quello di staging.
5. **Android:** AAB nuovo su Play (test interno, poi chiuso), con versione più alta; poi Sicurezza dei dati su Play Console (il widget Post-it mostra il testo dei post-it sulla Home; nessun tipo di dato nuovo).
6. **Dopo l'uscita:** staging riparte da main (nuovo branch di staging) e il branch lungo `mission/us-store-s3-1-public-auth-staging-20261011` si archivia.

Note: `export-my-data` resta spenta (D-7), quindi le modifiche a `s3-2-export-core.mjs` non si distribuiscono. `notification-core.mjs` cambia solo con voci nuove: `calendar-reminders-worker` e `monthiversary-job` non vanno ridistribuite.

## Android live, strumento di prova (04/11/2026)

**Stato:** solo strumento di sviluppo, niente da portare agli utenti. `scripts/android-live.mjs` e `docs/native/ANDROID_LIVE.md`. Tocca `android/app/build.gradle` (id `com.usapp.us.staging.live` solo con `US_STAGING_QA` e `US_ANDROID_LIVE`) e aggiunge `android/app/src/debug/` (HTTP verso localhost e nome «US LIVE», solo nelle build di debug). Release e AAB di produzione restano uguali: quando staging va su `main` questi file possono venire con il resto.

## Lavagna in Noi e widget «Lavagna» (03/11/2026, fase 2 della Noi nuova)

**Stato:** su staging dal 03/11 (SQL e `send-web-push` applicati con il via del founder), non in produzione. Va in produzione insieme a tutta la Noi nuova, solo con il via del founder. Missione: `docs/missions/lavagna-v1.md`.

- **Lavagna:** in cima alla bacheca di Noi una tessera con l'ultimo disegno («Lavagna · Bea, 5 min fa», «Disegna»); toccandola si apre la lavagna a tutto schermo. Si disegna col dito in due: quattro colori, due spessori, gomma, «Annulla» dell'ultimo tratto proprio, «Pulisci» con conferma per tutti e due. Ogni tratto si salva quando si alza il dito; l'altra persona lo vede in un paio di secondi.
- **Notifica:** «Bea ha disegnato sulla lavagna», al massimo una volta ogni 2 ore per chi la riceve; si spegne in Impostazioni › Notifiche › Lavagna.
- **Widget Android «Lavagna» 2×2:** l'ultimo disegno, Pastello con il tema chiaro e Midnight con quello scuro; toccandolo apre US sulla lavagna. Si aggiorna quando US è aperta (come «Ricordi a pila»).
- **Database:** migrazione `20261103205050_lavagna_v1.sql` (tabelle `lavagna_strokes` e `lavagna_boards`, RLS di coppia, tempo reale, export dei dati, autori staccati quando qualcuno lascia la coppia o elimina l'account, preferenza `lavagna`). Ordine: SQL, poi Edge `send-web-push` ed `export-my-data`, poi web, poi APK/AAB.
- **Privacy:** i disegni sono contenuto della coppia come le note; entrano nell'export dei dati. Nessun nuovo tipo di dato per Google Play.

## Note condivise in Noi (31/10/2026)

**Stato:** su staging, non in produzione. **Branch:** `claude/note-condivise`. **Build:** `us-note-condivise-20261031-76`. Missione: `docs/missions/note-condivise-v1.md`.

- In Noi, sotto il calendario, un quarto collegamento **Note** apre un Foglio con le note della coppia come **quadratini**: si leggono senza aprirle, le voci si spuntano sul quadratino e toccandolo ci si scrive sopra (si allarga sul posto). Titolo, testo e lista a spunta, di tutti e due. Si salvano da sole; se l'altra persona salva la nota aperta compare un avviso.
- **Database:** migrazione `20261031132258_couple_notes_v1.sql` (tabella `couple_notes`, RLS di coppia, tempo reale, export dei dati, autori staccati quando qualcuno lascia la coppia o elimina l'account). Su staging e poi in produzione solo con il workflow «Supabase SQL (manual)» e il via del founder.
- **Privacy:** le note sono contenuto della coppia come le Idee; entrano nell'export dei dati. Nessun nuovo tipo di dato per Google Play.

## Dopo la 1.3.0 (fix dalle prove in produzione, 30/10/2026)

**Stato:** su staging, non ancora in produzione. **Branch:** `claude/fix-prod-1-3-1`. **Build:** `us-fix-20261030-75`.

- **Mappa dei Ricordi:** «Aggiungi il posto» ora sta nella foto a schermo intero, sotto la nota. Prima, sui ricordi caricati prima della 1.3, finiva sotto lo schermo e non si poteva toccare (`dc-ricordi.css`, test in `tests/ricordi-place-client.test.js`).
- **Mappa dei Ricordi, salvataggio del posto:** scegliere il posto di un ricordo già caricato non salvava niente: `ricordi-place.js` cercava il client in `window.sb`, che non esiste (in `app.js` `sb` è una costante). Ora usa `sb` come gli altri moduli. Trovato dalla sessione dei widget il 31/10; test in `tests/ricordi-place-client.test.js`.
- **Controllo ortografico di tutte le domande (31/10):** migrazione `20261031120000_ortografia_domande.sql` (solo testi, test in `tests/ortografia-domande-db.test.js`). Su staging serve il run del workflow «Supabase SQL (manual)» con l'approvazione del founder; in produzione lo stesso file, con il suo via.
- **Oggi, riga di distanza (e su staging batteria e «Come stai»):** con la scheda «Tocca a te» o l'avviso delle notifiche la riga spariva del tutto, per la regola del mockup di ottobre in `dc-oggi.css`. Ora resta sempre (founder, 03/11, dalla revisione di staging; test in `tests/oggi-riga-sempre-visibile.test.js`).
- **Oggi, domanda del giorno sui telefoni bassi:** sotto i 700 px d'altezza restava una riga sola («Quale canzone ti mette di…»), sotto i 600 px spariva. Ora due righe in tutti e due i casi.
- **Revisione di staging, problemi minori (03/11):**
  - **Mappa dei Ricordi:** i nomi dei posti arrivano sempre in italiano, anche con il telefono in inglese (prima «Lake Garda»); con un posto solo la mappa apre su città e dintorni (zoom 9), non su una strada al buio; se la mappa si apre prima dei ricordi, poi si sposta su di loro (prima restava sull'Italia); le scritte della mappa in italiano («Monaco di Baviera», non «MUNICH»); niente più avvisi per le icone che mancano allo stile scuro (`ricordi-place.js`, test in `tests/ricordi-place-client.test.js`).
  - **Gattino:** mentre una pagina scorre si fa quasi trasparente e lascia leggere il testo, poi torna (`pet.js`, `pet.css`).
  - **Avvio:** la barra in alto (cuore, logo, busta) non compare più da sola prima della presentazione (`top-chrome.css`); «Notifiche disattivate» non lampeggia più in Oggi, perché aspetta il primo caricamento delle schede in attesa (`app.js`).
  - **Impostazioni:** sotto «US 1.0» si vede la build, per sapere quale versione c'è sul telefono.
- **Emoji di Gboard nella risposta alla domanda del giorno:** ancora aperto. Il campo non ha `autocomplete="off"` (la causa trovata il 29/10 per gli altri campi), quindi la causa è un'altra. Il 31/10, nell'emulatore con Gboard e un APK di debug, il campo passa a Gboard testo normale a più righe (`inputType=0x2c001`): tastiera completa, tasto emoji e pannello emoji funzionanti. Serve una registrazione dal telefono del founder per vedere quando cambia la tastiera.

## Patch 1.3.0 (in produzione dal 30/10/2026)

Quello che segue è la storia della patch 1.3.0, già in produzione.

**Stato:** in prova su staging (https://us-staging-s31.pages.dev). Niente è in produzione. Ogni passo qui sotto ha il via separato del founder (regola «prove solo su staging», `docs/DECISIONS.md`, 28/10/2026).
**Build:** `us-fix-apk-20261029-66`.
**Build della Mappa dei Ricordi:** `us-mappa-ricordi-20261030-73` (con il dominio www.uscouple.app da `claude/sintonia-premi-v2`; branch `claude/mappa-ricordi`, PR #242).
**Branch:** `claude/gioca-una-al-giorno` (PR #232), sopra `claude/fix-amici-beta` (PR #233) poi `claude/traguardi-giorni` (PR #234) poi `claude/invito-app-links` (PR #235) poi `claude/aggiornamento-app` (PR #236) poi `claude/colori-plus` (PR #237) poi `claude/emoji-tastiera` (PR #238) poi `claude/app-ariosa` (PR #239) poi `claude/icona-senza-cornice` (PR #240) e infine `claude/fix-prova-apk`.
**Patch unica (founder, 29/10):** tutte queste PR più i fix dei tester che arrivano nel frattempo, in produzione insieme e solo con il via del founder.

## Testo «Novità» per Google Play

Italiano (massimo 500 caratteri):

> Gioca: una partita al giorno, con il conto di quelle rimaste.
> Invito: un link che apre US con il codice pronto.
> Registrazione: password visibile, Google anche in «Crea un account», accesso automatico dopo la verifica.
> «Insieme dal» con giorno, mese e anno.
> Google: niente più schermate sovrapposte.
> Traguardi ogni 100 giorni insieme.
> US si aggiorna da sola.
> Emoji in ogni campo dove scrivete.
> App più ariosa, il tuo colore già all'inizio.
> Rivivi nel giorno esatto di un ricordo.

English (500 characters max):

> Play: one game a day, with a count of what is left.
> Invites: a link that opens US with the code ready.
> Sign-up: show your password, Google in “Create an account” too, automatic sign-in after verification.
> “Together since” with day, month and year.
> Google: no more overlapping screens.
> Milestones every 100 days together: 1000 is worth the most.
> US now updates itself.
> Emoji in every field where you write.
> Airier screens, your colour from the start.
> Relive on the exact day of a memory.

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
- **In beta i colori sono gratis per tutti** (fix dalla prova dell'APK, sotto): la voce bloccata si vedrà solo il giorno in cui Plus va in vendita.

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

### App più ariosa (founder, 29/10)

- **Perché:** confrontata con Couple Joy, US sembrava «tutto più grande». Il testo normale era già uguale; erano i titoli e le parti in evidenza a riempire lo schermo. Misure prese dagli screenshot del founder (Couple Joy: titoli di pagina 19–21, di scheda circa 17).
- **Cosa cambia** (nei file di design `dc-*.css`, `countdown.css`, `due-colori.css`; niente regole aggiunte sopra):
  - titoli di pagina («Noi», «Ricordi», «Impostazioni»): da 40–46 a 26–28;
  - titoli di sezione (mesi, «I vostri giochi», «I vostri sblocchi», «Tu», il giorno in Noi): circa 20;
  - titoli delle schede: giochi 17, Sfida di oggi 20, didascalie dei Ricordi 15–18, nomi della coppia 18;
  - Oggi: numero dei giorni da 92 a 64, titolo del ricordo da 30 a 22, domanda di oggi 18 / 16 / 15 secondo la lunghezza, pulsanti in alto da 46 a 40;
  - Noi: righe del calendario da 46 a 40, pulsanti del mese un po' più piccoli;
  - barra in basso da 70 a 58, icone 21, etichette 11.
- **La mascotte** segue l'altezza della barra (`--us-nav-height`), quindi resta appoggiata sul bordo.
- **Restano uguali:** testo normale, bersagli da toccare (almeno 40), illustrazioni approvate.
- **Test:** due test aggiornati alle misure nuove. I test nel browser che di solito vengono saltati (Playwright) danno gli stessi 16 errori di prima, con gli stessi messaggi: non dipendono da questo cambio.

### Icona dell'app: resta quella di sempre (founder, 30/10)

- **Decisione:** l'icona senza cornice (PR #240) **non** entra nella patch: in produzione resta l'icona di sempre, con la cornice. Chi vuole un'altra icona la sblocca in Sintonia (US, Notte, Oro, Neon).
- **Codice:** `ic_launcher*.xml`, `mipmap-*/ic_launcher*.png`, `scripts/build-android-brand-assets.ps1`, `android/brand-assets-manifest.json` e il loro test tornano come in produzione (byte per byte); via `us_adaptive_foreground_v2`. Il logo senza cornice (`us-launcher-symbol-v2`) resta solo come base delle icone premio.

### Fix dalla prova dell'APK (founder, 29/10)

- **«Compagni»:** in Impostazioni la voce «Maudit» diventa «Compagni» (acceso o spento), con «Il vostro Compagno sopra la barra».
- **Tema ed Effetto solo in Sintonia:** via da Impostazioni il blocco «Personalizza Oggi». In Sintonia i gruppi Tema ed Effetto hanno «Apri la galleria con le anteprime»; il cielo della vostra prima sera apre la sua pagina.
- **Il tuo colore alla prima apertura:**
  - chi crea la coppia lo sceglie nel passo del colore, chi entra con il codice nel passo «Scegli il tuo colore» della configurazione;
  - 8 cerchi, quello del partner (scelto o di sempre) non si può prendere; la scelta colora subito i cerchi.
- **Colori gratis in beta:** finché US Plus non è in vendita il colore si sceglie e si cambia senza Plus, anche in Impostazioni.
  - Server: migrazione `20261029203000_colors_free_in_beta.sql`. Nuova tabella `app_flags` (solo il server la legge), con `plus_on_sale` spento; `set_my_color()` chiede Plus solo quando è acceso; `get_couple_plus()` dice all'app `colors_free`.
  - Il giorno in cui Plus va in vendita, il founder la accende nell'SQL Editor: `update public.app_flags set enabled = true, updated_at = now() where key = 'plus_on_sale';`. Da lì cambiare colore richiede Plus; il colore già scelto resta.
- **Rivivi solo nel giorno giusto:** in Ricordi «Rivivi» compare solo se oggi è lo stesso giorno di un ricordo passato: «Un anno fa, oggi» (o «N anni fa») nello stesso giorno e mese, altrimenti «N mesi fa, oggi» nello stesso giorno del mese. Gli anni vincono sui mesi. Negli altri giorni non c'è.
- **«Il vostro anno su US»:** in Noi la riga compare solo quando la coppia compie un anno su US (dal giorno in cui l'ha creata nell'app, ora di Roma), per 30 giorni, ogni anno. Negli altri giorni non c'è. La scheda di Oggi per l'anniversario della relazione apre Eventi, come i mesiversari. Il contenuto del recap resta quello di oggi: il mega recap e i recap dei mesiversari sono un passo a parte.
- **Il cuore nuovo:** il cuore sulla risposta del partner in Oggi, quello per rispondere a un Ti penso e il Ti penso in alto a sinistra (al posto delle due scintille) hanno un'animazione sola, veloce e senza coriandoli: al tocco il cuore si schiaccia e scatta oltre la sua misura, mentre un'onda dal rosa al lilla (i vostri colori, anche quelli scelti) si apre attorno e sfuma (circa 0,4 s). **Ogni 3 cuori** che una persona mette, quello grande: scatto più alto, vibrazione più forte e una seconda onda più ampia. Il conto è di ciascuno, sul suo telefono. Togliere il cuore non anima; con «riduci movimento» resta solo la vibrazione. Codice nostro (`ui-foundation.js` `heart()`).

### Novità alla prima apertura (founder, 30/10)

- Dopo l'aggiornamento, alla prima apertura, chi usava già US su quel telefono vede una volta il foglio «Novità · US si è aggiornata» con 8 righe su cosa è cambiato, e «Ho capito». Chi installa per la prima volta non lo vede.
- Codice: `US_WHATS_NEW` e `usShowWhatsNew()` in `app.js` (id `1.3`: per il prossimo rilascio basta cambiare id e righe); `releaseNotesDue()` e l'elenco nel foglio informativo in `ui-foundation.js`.

## Ordine in produzione (ognuno con il suo via)

0. **Mail di conferma** (founder, in Supabase produzione: Authentication › Emails › Templates › Confirm signup): la riga «Poi torna in US e accedi con email e password.» diventa «Poi torna in US: l'accesso è automatico.».
1. **SQL** con il workflow «Supabase SQL (manual)», target `production` e conferma `PRODUZIONE`, nell'ordine: Gioca (`20261028201759_gioca_daily_limit_v1.sql`), traguardi (`20261028232743_days_together_milestones_v1.sql`), versione minima (`20261029012149_app_min_version_v1.sql`), colori e Plus (`20261029014653_person_colors_plus_v1.sql`), colori gratis in beta (`20261029203000_colors_free_in_beta.sql`). Prima serve un token Supabase che includa il progetto di produzione: quello attuale vale solo per staging.
1b. **Edge Function** `monthiversary-job` con il workflow «Supabase Edge deploy», target `production`, dopo l'SQL dei traguardi: usa la nuova funzione del database. Con lo stesso workflow `delete-account`, `leave-couple` e `account-deletion-worker`, perché accettino anche `www.uscouple.app`.
2. **Sito web** (Cloudflare Pages `us-a33`): porta `/invito`, `/.well-known/assetlinks.json` e l'app web nuova. Va pubblicato prima dell'AAB: il link condiviso dall'app punta a `us-a33.pages.dev/invito`, e Android verifica il file quando installa l'app.
3. **AAB** sul test chiuso «Alpha» di Play, con il testo «Novità» qui sopra.

Tra il passo 1 e il passo 3 l'app vecchia dice ancora «lunedì» per una partita che torna domani: sono sbagliate solo le scritte, i limiti funzionano.

## Da sapere

- **App Links e build installate a mano:** il file dichiara solo la chiave di firma di Play. Un APK installato a mano (staging o interno) apre il link nel browser.
- **Google Play dalla pagina d'invito:** durante il test chiuso la scheda dello store si apre solo per i tester.
- **Staging:** i cron sono spenti, quindi i traguardi non arrivano da soli alle 9. Plus si dà a tutti gli account con `docs/store/US_STAGING_PLUS_PER_TUTTI.sql`, e tutta la Sintonia si sblocca con `docs/store/US_STAGING_SINTONIA_TUTTA.sql`. Sono dati di prova: **non fanno parte della patch** e non vanno mai eseguiti in produzione.
- **Dominio e mail (già fatti dal founder in produzione, 29–30/10):**
  - dominio `uscouple.app` (Cloudflare): `uscouple.app` e `www.uscouple.app` servono già il sito di produzione (progetto Pages `us`, alias `us-a33.pages.dev`). Indirizzo principale scelto: **www.uscouple.app**;
  - Resend: dominio `uscouple.app` verificato (DKIM, SPF) e DMARC `v=DMARC1; p=none;`;
  - Supabase produzione: SMTP personalizzato attivo con Resend, mittente «US <noreply@uscouple.app>», provato dal founder (mail arrivata). Per tornare indietro: spegnere «Enable custom SMTP». Limite iniziale circa 30 mail/ora (Authentication › Rate Limits). Staging resta con la mail di Supabase (scelta del founder);
  - nella patch (codice, 30/10): l'indirizzo principale è `www.uscouple.app`:
    - il link d'invito è `https://www.uscouple.app/invito#CODICE`, anche dall'app e dal vecchio indirizzo; i link vecchi `us-a33.pages.dev/invito` funzionano ancora;
    - App Links: l'app Android si apre da `www.uscouple.app/invito` e da `us-a33.pages.dev/invito` (due host nello stesso intent-filter; lo stesso `assetlinks.json` vale per tutti gli indirizzi del progetto Pages);
    - privacy, termini (nel box di registrazione e in Impostazioni) e il link a «elimina account» nelle pagine privacy puntano a `www.uscouple.app`;
    - la pagina «elimina account» funziona anche su `uscouple.app` e `www`; le Edge Function `delete-account`, `leave-couple` e `account-deletion-worker` accettano anche le origini `https://www.uscouple.app` e `https://uscouple.app`;
  - ancora da fare a mano: Redirect URLs di produzione con `https://uscouple.app/**` e `https://www.uscouple.app/**` (prima della patch); dopo la patch Site URL di Supabase `https://www.uscouple.app` e URL privacy in Play Console `https://www.uscouple.app/privacy`.
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
- **Fase 2, server:** la migrazione `20261029161354_sintonia_rewards_v2_phase2.sql` aggiunge i premi con le immagini approvate dal founder il 29/10:
  - accessori dei Compagni: sciarpina (9), «Gala» (Plus, 10), coroncina di fiori (12), corona (19);
  - Ti penso «lettera» (15);
  - icone dell'app «Notte» (13), d'oro (18), «Neon» (Plus, 7);
  - chi ha già passato quei livelli li riceve già visti;
  - la Fase 1 accetta anche le due categorie nuove, così le due migrazioni si possono rieseguire in qualsiasi ordine.
- **Fase 2, app:**
  - **Accessori** (nuovo gruppo nella collezione, scelto su questo telefono, «Niente» di partenza): ogni accessorio è **disegnato addosso** a ognuno dei quattro Compagni, nelle tre pose, dai fogli che il founder ha generato con ChatGPT (gli adesivi sopra il disegno erano «messi malissimo», 29/10). Le parti che si muovono (orecchie, ali, coda) restano quelle di sempre, così il Compagno continua a muoverle e il drago a volare.
    - Maudit e il drago sono maschi: sciarpina blu notte, coroncina d'alloro, colletto con papillon; la capra e il gufo: sciarpina rosa, coroncina di fiori, collana di perle.
    - Corona da re per Maudit e il drago, da regina per la capra e il gufo.
    - Le immagini indossate sono 24 px più alte del riquadro (una corona sta sopra la testa): l'app le alza della stessa misura, così le parti che si muovono restano allineate.
    - 64 immagini, scaricate solo quando un Compagno le indossa.
  - **Ti penso «lettera»:** chi l'ha scelta, quando riceve un Ti penso, vede una busta che sale al centro e si apre sul sigillo a cuore. Niente animazione con «riduci animazioni».
  - Le immagini (`assets/derived/rewards`, 17–27 KB l'una) si scaricano solo quando servono: non pesano sull'avvio.
  - **Icone dell'app** (nuovo gruppo «Icona dell'app», scelto su questo telefono): US, Notte, Oro, Neon.
    - Android: ogni icona è un ingresso del launcher (`activity-alias`), uno solo acceso; il plugin `native-plugins/us-app-icon` accende il nuovo prima di spegnere gli altri. L'app cambia icona solo quando cambia davvero.
    - La schermata vera si chiama ora `UsActivity`; l'ingresso di sempre tiene il nome `.MainActivity`, così l'icona già sulla schermata home resta dopo l'aggiornamento.
    - Quando si cambia icona, molti telefoni tolgono quella vecchia dalla schermata home e mettono la nuova nell'elenco delle app: va detto nell'app.
    - Il controllo del bundle per Play accetta solo la schermata di US e i quattro ingressi delle icone.
  - **Prova tecnica della Mappa dei Ricordi:** sostituita dalla Mappa dei Ricordi vera (sezione qui sotto); il toast di staging non c'è più.
  - **Da provare sul telefono:** gli accessori sul Compagno sopra la barra e la lettera quando arriva un Ti penso vero.

## 2026-10-29 — Mappa dei Ricordi

**Fonte:** founder, 29/10/2026: grill «Mappa dei Ricordi» (D1–D7) e risposte del giro successivo («concordo con tutto»).

**Su staging (30/10/2026, con il via del founder):** SQL `20261029222210_ricordi_place_v1.sql` applicato con il workflow «Supabase SQL (manual)» (run 40968815705, HTTP 201); web `us-mappa-ricordi-20261029-71` su us-staging-s31; APK di staging dal run 40968819284 (plugin `us-photo-place` compilato). Non ancora provato sul telefono. Decisione in `docs/DECISIONS.md`. **Branch:** `claude/mappa-ricordi`, sopra `claude/sintonia-premi-v2`.

- **Server:** la migrazione `20261029222210_ricordi_place_v1.sql` aggiunge ai Ricordi `place_lat`, `place_lon` (tre decimali, circa 100 m, li arrotonda la colonna stessa), `place_label` (nome breve, 1–120 caratteri) e `place_source` (`photo` o `search`), più `set_moment_place()` per tutti e due i membri della coppia. Il posto lo legge solo la coppia (RLS dei Ricordi) ed entra nell'export dei dati.
  - **Ordine:** prima l'SQL, poi il web. Senza le colonne Ricordi si legge come prima, ma **salvare un Ricordo con un posto fallisce**.
- **App:**
  - **«Dove · facoltativo»** nel composer, sotto la data: il posto della foto compare da solo con la ✕ per toglierlo, oppure «Aggiungi il posto» apre la ricerca. Il nome è il posto o la via senza numero civico, poi la città.
  - **Nell'album del Ricordo** la riga «Dove» aggiunge, cambia o toglie il posto, anche sui Ricordi vecchi e su quelli caricati dall'altra persona.
  - **Mappa:** in Ricordi l'interruttore «Mappa» accanto a «Mese per mese». Ogni Ricordo è la sua foto in un piccolo riquadro; avvicinando la mappa compare sotto, in piccolo, la nota del Ricordo (o il posto se non c'è nota). I vicini si raggruppano con una foto e il numero; un tocco apre il Ricordo.
  - **Consenso:** la prima volta US spiega a cosa serve il posto delle foto («Continua» / «Non ora»), poi Android chiede il permesso.
- **Android, posizione dalla foto:** nuovo plugin `native-plugins/us-photo-place`. «Aggiungi un ricordo» apre il **selettore documenti di sistema** (`ACTION_OPEN_DOCUMENT`) al posto della galleria; con `ACCESS_MEDIA_LOCATION` legge il GPS dell'originale (`MediaStore.getMediaUri` + `setRequireOriginal`) e lo arrotonda prima di passarlo all'app. Niente `READ_MEDIA_IMAGES`. Se qualcosa non va, il posto resta vuoto e la foto entra lo stesso.
- **Servizi esterni nuovi (senza chiave né account):**
  - **Photon** (komoot, Germania) per la ricerca e per il nome del posto delle foto: riceve il testo cercato e le coordinate già arrotondate. Fair use, nessuna garanzia di servizio.
  - **OpenFreeMap** per le tile della mappa (stile «dark»): riceve la zona guardata.
  - **MapLibre GL JS 5.24.0** da jsdelivr, caricata solo quando si apre la mappa.
- **Peso dell'app:** il limite sale da 2,9 a 2,95 MB (`ricordi-place.js` e `.css`, circa 28 KB).
- **Export dei dati:** il posto entra nell'export (`s3-2-export-core.mjs`). La Edge function dell'export va pubblicata **dopo** l'SQL, altrimenti chiede colonne che non esistono.
- **Prima della produzione:**
  - aggiornare l'informativa privacy (Photon e OpenFreeMap come destinatari; posizione delle foto);
  - Sicurezza dei dati su Play: «Posizione approssimativa» anche per le foto (`ACCESS_MEDIA_LOCATION`), condivisa con nessuno, facoltativa;
  - Play Console: controllare che `ACCESS_MEDIA_LOCATION` non chieda una dichiarazione (dalle pagine di Play non risulta tra i permessi limitati);
  - testo «Novità»: aggiungere la Mappa dei Ricordi (va accorciato il resto per stare nei 500 caratteri).
- **Da provare sul telefono (APK di staging):**
  - il selettore documenti mostra le foto della fotocamera e ne fa scegliere più di una;
  - la spiegazione di US e poi la richiesta di Android;
  - una foto nuova con «Salva posizione» attivo nella fotocamera dello Xiaomi: «Dove» si riempie da solo;
  - una foto senza posizione: «Dove» resta vuoto e si cerca a mano;
  - la mappa: segnaposti, gruppi, tocco che apre il Ricordo, ritorno a «Mese per mese».

## 2026-10-31 — Batteria del partner

**Fonte:** founder, grill del 31/10/2026 (dopo lo studio di Love8: posizione rispettosa, niente tracciamento continuo). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; niente su staging né in produzione.

- **Cosa fa:** quando US è aperta (all'avvio e al ritorno in primo piano) il telefono manda il proprio livello di batteria e se è in carica, al massimo ogni 15 minuti. Niente lavori in background, nessuna notifica. L'altra persona vede l'ultimo livello e da quanto tempo; dopo un giorno non si vede più. Senza dato non compare niente.
- **Oggi (scelta del founder del 31/10, in `DECISIONS.md`):** nella pillola della distanza, dopo i chilometri, l'icona Phosphor della batteria (bassa, media, alta, in carica) e la percentuale: «12 km · 🔋 18%». Sotto il 20% e non in carica l'icona è corallo. Si vede solo accanto a una distanza (anche l'ultima nota): con «Attiva posizione» o «In attesa» non compare. Si aggiorna col tempo reale, dal canale unico dell'app (`startUsRealtime`), come le Note: niente canali paralleli. Per questo l'SQL va su prima del web.
- **Scheda «Distanza»** (tocco sulla pillola): sotto la distanza la riga «Bea · 18% · 2 ore fa» (con «in carica» se serve). Per questa riga la scheda di conferma (`UsUiFoundation.notice`) ha una nuova opzione `note`.
- **Noi:** invariato, nessuna riga della batteria.
- **Widget Android «Noi»:** accanto a «NOI», in alto a destra, l'icona e la percentuale. Dopo un'ora più tenue, dopo un giorno sparisce (il widget si ridisegna da solo a quelle ore). La riga in corsivo sotto la distanza resta libera per «a casa / fuori» (lavoro successivo, con i recinti).
- **Database:** migrazione `20261031134410_couple_battery_v1.sql`: tabella `couple_batteries` (una riga per persona, FK verso `profiles` con cascade), RLS «stessa coppia» finché il proprietario ne fa parte, scrittura solo con `report_battery(p_level, p_charging)` (orario del server; lo stesso invio entro un minuto non scrive niente), pubblicazione `supabase_realtime`. Test: `tests/couple-battery-v1-db.test.js`.
  - **Ordine:** prima l'SQL, poi il web. La tabella è nel canale Realtime unico dell'app, quindi un web arrivato prima dell'SQL potrebbe fermare il tempo reale di tutta l'app finché la tabella non c'è (vale anche per le Note). Le letture della batteria invece, senza tabella, smettono di chiedere da sole.
  - **Export dei dati:** la batteria entra nell'export (`s3-2-export-core.mjs`); la Edge `export-my-data` va pubblicata **dopo** l'SQL.
- **Android:** nuovo metodo `getBatteryStatus` nel plugin `us-widget-bridge` (`BatteryManager`, nessun permesso). Serve un APK nuovo; l'APK vecchio usa la Battery API del WebView, se c'è. Sul web vale la Battery API del browser (Chrome sì; Safari e Firefox no: lì non si manda niente). Un computer senza batteria non manda niente.
- **Icone:** Phosphor `battery-low`, `battery-medium`, `battery-high`, `battery-charging` (regular, `@phosphor-icons/core` 2.1.1), registrate in `assets/ICON_REGISTRY.json`; nel widget gli stessi tracciati come vector drawable.
- **Privacy:** `privacy.html` e `privacy-en.html` aggiornate al 31/10 (tabella dei dati, «Batteria», chi vede, conservazione, eliminazione).
- **Prima della produzione:**
  - Sicurezza dei dati su Play: decidere se dichiarare il livello della batteria (la voce più vicina è «Informazioni e prestazioni dell'app › Diagnostica», che cita la durata della batteria), raccolto per «Funzionalità dell'app»;
  - non c'è un interruttore per non condividere la batteria: da decidere se serve prima della produzione;
  - testo «Novità»: «Oggi: la batteria di chi ami accanto alla distanza, anche nel widget.» / «Today: your partner's battery beside the distance, in the widget too.»;
  - senza posizione condivisa la batteria si vede solo nel widget: da decidere se serve anche su Oggi senza distanza.
- **Da provare dall'APK di staging (dopo SQL e web su staging):**
  - sui due telefoni, con la posizione condivisa: aprire US, poi su Oggi la pillola dice «12 km · 🔋 18%» con la batteria dell'altro; il tocco apre la scheda «Distanza» con «Bea · 18% · proprio ora»;
  - un telefono senza posizione condivisa: la pillola dice «Attiva posizione» senza batteria;
  - mettere in carica un telefono, chiudere e riaprire US dopo 15 minuti: sull'altro compare l'icona col fulmine senza ricaricare la pagina (tempo reale);
  - riaprire US entro 15 minuti: non manda niente di nuovo (l'orario non cambia);
  - widget «Noi» sulla schermata Home: icona e percentuale accanto a «NOI»; dopo un'ora più tenue; il tocco apre Noi;
  - un telefono sotto il 20%: icona corallo nella pillola e nel widget;
  - Noi: nessuna riga della batteria.

## 2026-10-31 — Widget «Noi» stile mappa (solo Android)

**Fonte:** founder, 31/10/2026 (tre modelli da un'app di riferimento più il widget delle note; questo è il primo). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo.

- **Cosa cambia:** da 4×2 in su il widget «Noi» mostra:
  - le due foto rotonde ai lati, io a sinistra e il partner a destra, con gli anelli rosa e lilla di sempre;
  - in mezzo la distanza su una linea tratteggiata, con «tra voi» o «ultima nota»;
  - sopra ogni foto una nuvoletta con l'ultimo Ti penso di quella persona: «ti ha pensato · 10 min fa» sopra il partner, «hai pensato a Bea · 2 ore fa» sopra di me. Nella prima ora va a passi di 5 minuti, poi a ore e a giorni; dopo una settimana la nuvoletta sparisce;
  - sotto la foto del partner, piccola, la sua batteria.
  Più avanti nella nuvoletta andrà lo stato con emoji.
- **Il 2×1 già messo** resta la scheda di prima (foto in coppia, distanza, batteria accanto a «NOI»). Android 12+ sceglie da solo la vista in base alla misura; sui telefoni più vecchi decide la misura che il launcher comunica. Un widget nuovo parte da 4×2.
- **Sfondo (founder: «Vera, ma solo sfondo»):** un pezzo fisso di mappa scura, Torino col Po, sempre lo stesso.
  - Disegnata una volta con lo stile scuro di OpenFreeMap della Mappa dei Ricordi, senza scritte, e inclusa nell'app (`drawable-nodpi/us_widget_noi_map_v1.webp`, 1600×800, 85 KB). Il widget non si collega a nessun servizio di mappe e non mostra mai dove siete.
  - È **candidata**: `DRAFT` in `assets/ASSET_MANIFEST.json`, la approva il founder dall'APK di staging.
  - Attribuzione «© OpenStreetMap contributors» (ODbL) e OpenFreeMap / OpenMapTiles nella privacy, italiano e inglese.
  - Da Android 12 la mappa resta dentro gli angoli arrotondati della scheda. Su Android 11 e precedenti gli angoli della mappa restano squadrati, quasi invisibili sul nero.
- **Dati:** nessun dato nuovo. Le nuvolette usano gli orari di Ti penso che il widget già riceveva; le foto rotonde le prepara l'app quando è aperta (come la foto in coppia), con gli stessi anelli. Il widget non va in rete.
- **Anteprima nel selettore dei widget** (Android 12+): la vista a mappa, generica, senza volti né nomi. L'immagine PNG per Android 11 e precedenti è ancora quella del 2×1.
- **Da provare dall'APK di staging:**
  - mettere il widget «Noi»: deve partire grande (4×2) con la mappa scura dietro, le due foto, la distanza sulla linea tratteggiata e la batteria del partner;
  - dire se la mappa va bene (è candidata);
  - mandarsi un Ti penso: dopo aver aperto US, la nuvoletta sopra il partner dice «ti ha pensato · proprio ora», poi «5 min fa», «10 min fa»;
  - mandare un Ti penso dal widget Ti penso: la nuvoletta sopra di me cambia subito;
  - rimpicciolire il widget a 2×1: torna la scheda di prima;
  - il tocco apre Noi.

## 2026-10-31 — Widget «Messaggio» (solo Android)

**Fonte:** founder, 31/10/2026 (secondo dei widget scelti). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo.

- **Cosa fa:** widget 2×2.
  - In alto la foto rotonda del partner.
  - Sotto, in una nuvoletta chiara con un piccolo cuore rosa, il messaggio più recente tra il suo ultimo Ti penso («Ti ha pensato · 10 min fa») e il suo Lasciato per te ancora chiuso («Ti ha lasciato una foto · 5 min fa»; anche messaggio, vocale, video, canzone).
  - Senza niente di recente: «Il suo prossimo pensiero arriverà qui», con il cuore vuoto. Un Ti penso più vecchio di una settimana non è più una novità; una busta chiusa resta finché non si apre.
- **Il tocco** apre quel messaggio nell'app, per la stessa strada delle notifiche: Ti penso apre il foglio per ricambiare, la busta apre Lasciato per te. Sul freddo aspetta l'accesso.
- **Privacy (founder: «Solo tipo e ora»):** del Lasciato per te il widget conosce solo il tipo e l'ora, mai le parole, la foto o il link. Così la sorpresa resta nell'app, sulla schermata Home non compare il contenuto, e niente sopravvive alla pulizia dei Lasciato per te.
- **Corretto per strada (stesso contratto dei widget):** l'app non passava mai al widget «La domanda di oggi» la domanda (`platform.js` scartava il blocco `daily`), e quel widget non si poteva aggiungere dalla galleria di Impostazioni (mancava nell'elenco dei tipi). Ora passano tutti e due.
- **Galleria in Impostazioni:** nuova voce «Messaggio» (inglese «Message»), con la sua anteprima.
- **Da provare dall'APK di staging:**
  - aggiungere «Messaggio» da Impostazioni › Widget;
  - farsi mandare un Ti penso e aprire US: «Ti ha pensato · proprio ora»; il tocco apre il foglio per ricambiare;
  - farsi lasciare una foto in Lasciato per te: «Ti ha lasciato una foto»; il tocco apre la busta; aperta la busta, torna il Ti penso;
  - «La domanda di oggi»: ora mostra la domanda del giorno e si aggiunge da Impostazioni.

## 2026-10-31 — Widget «Giorni insieme» (solo Android)

**Fonte:** founder, 31/10/2026 (terzo dei widget scelti). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo.

- **Cosa fa:** widget 2×2 con le due foto rotonde vicine e un cuore rosa in mezzo. Sotto, grande in serif, il numero dei giorni insieme, con «giorni insieme» («193 giorni insieme»). Cambia a mezzanotte di Roma. Il tocco apre Noi.
- **Dati:** nessuno nuovo. La data d'inizio della coppia arrivava già ai widget per «Foto & Noi» e per il Countdown «Insieme da». I giorni si contano come nell'app (`countdown.js`: il primo giorno è 0). Le foto rotonde sono le stesse del widget «Noi» stile mappa.
- **Verifica chiesta dal founder:** il Countdown «Insieme da» e «Foto & Noi» mostravano già i giorni, ma senza le due foto e il cuore. Questo widget li mette insieme e non tocca gli altri.
- **Senza data:** «I vostri giorni insieme», senza numero.
- **Galleria in Impostazioni:** nuova voce «Giorni insieme».
- **Da provare dall'APK di staging:**
  - aggiungere «Giorni insieme» da Impostazioni › Widget;
  - il numero è lo stesso dell'app su Oggi («Insieme da»);
  - il giorno dopo, a mezzanotte, cresce di uno senza aprire US;
  - il tocco apre Noi.

## 2026-10-31 — Ti penso dal widget: al server giusto anche da staging (solo Android)

**Fonte:** trovato durante il widget «Nota»; il founder: «correggilo come la Nota». **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo.

- **Prima:** il widget Ti penso mandava sempre all'Edge di produzione (indirizzo fisso in `UsWidgetActionClient.java`). Nell'APK di staging il cuore del widget non partiva: la produzione rifiutava il token di staging, e il widget chiedeva di aprire US.
- **Ora:**
  - insieme al token l'app passa al telefono l'indirizzo delle sue Edge (`SB_URL` + `/functions/v1`, quindi staging nell'APK di staging);
  - il codice nativo accetta solo i due progetti US in https (`UsWidgetEndpoints`), così il token non può andare su un altro server;
  - niente redirect.
- **Chi ha già il widget in produzione:** la credenziale salvata prima non ha l'indirizzo, quindi va alla produzione come oggi. Non serve fare niente.
- **Test:** `UsWidgetEndpointsTest` (JVM), `tests/w1-3-silent-send.test.js`, `tests/widget-system.test.js`.
- **Da provare dall'APK di staging:** il cuore del widget Ti penso manda davvero il pensiero; l'altro telefono lo riceve.

## 2026-11-02 — Widget «Pastello» (solo Android)

**Fonte:** founder, 02/11/2026, tavola approvata (`docs/DECISIONS.md`, «Widget: la famiglia Pastello»). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo. Il widget «Nota» è tolto (revert di `1e0d8e9a`): niente migrazione `widget_note_v1` né Edge `widget-note`.

- **2 · Ti penso:**
  - nuova carta chiara, Fraunces e Figtree, avatar con la foto o l'iniziale e il colore della persona;
  - «Bea ti ha pensato · 2 min fa» e «Ricambia»;
  - al tocco il widget passa subito a «Ricambiato · adesso» (o «Inviato» se non era una risposta) e invia in sottofondo; «Ancora» manda di nuovo. Se non parte: «Non è partito · Riprova»;
  - il cuore fa la stessa animazione dell'app (1→0,72→1,3→0,96→1 in 440 ms, onda da rosa a lilla), in una finestrella trasparente di un attimo sopra la Home (`UsThinkHeartActivity`, non esportata); con le animazioni spente invia e basta;
  - nel medio (4×2): «12 volte che vi siete pensati oggi», i Ti penso di tutti e due di oggi (giorno di Roma), contati dall'app più quelli mandati dal widget dopo.
  - **Font:** Fraunces e Figtree dell'app, decompressi da WOFF2 a TTF (`res/font`, circa 290 KB).
  - **Da provare:** il cuore sul widget, che diventa subito rosa con «Ricambiato · adesso» e fa l'animazione dell'app; il medio con il contatore; la foto dell'altro nell'avatar, o la sua iniziale sul suo colore.
- **1 · Foto & giorni** (rifà «Foto & Noi»; «Giorni insieme» confluisce qui):
  - **Giorni insieme** non c'è più: chi l'aveva sulla Home vede Foto & Noi (stessa classe, nascosta dalla lista dei widget, col nome Foto & Noi).
  - **Dopo la prova dell'APK (founder, 02/11):** torna lo **stile di prima** e il nome «Foto & Noi» (foto a tutto riquadro, velo scuro in basso, giorni in serif, un solo layout per ogni misura). Resta la foto che cambia ogni ora; via trattini, foto rotonde e riga del posto del Pastello.
  - la foto di Oggi di quest'ora e quelle delle due ore successive, scelte con lo stesso calcolo di Oggi (`homeRotationPick`). Il widget le cambia da solo ogni ora anche a US chiusa, e i tre trattini in alto dicono quale delle tre è; dopo la terza resta sull'ultima finché US non si riapre;
  - sotto, i giorni insieme in Fraunces («195 giorni insieme»); nel 4×2 anche le vostre due foto e «dal 21 aprile · Lisbona, 12 ottobre» (da quando, e il posto o la didascalia e la data della foto);
  - sul telefono restano al massimo tre foto, solo quelle che il widget nomina; le altre si cancellano;
  - i widget «Giorni insieme» già messi mostrano Foto & giorni, che in Impostazioni non c'è più come voce a sé.
  - **Da provare:** mettere Foto & giorni, chiudere US e tornare dopo un'ora: la foto è cambiata ed è la stessa di Oggi; il 4×2 con le due foto e la riga del posto.
- **3 · La domanda di oggi:** carta lilla-pesca; l'etichetta bianca «Oggi» (nel 4×2 «La domanda di oggi»); la domanda in Figtree extra grassetto; chi ha risposto, con il pallino del suo colore. Nel 4×2 anche le vostre due foto con un cuore e una barretta a testa, che si colora quando quella persona ha risposto, e «Bea ha risposto · **tocca a te**». Mai le risposte.
  - **Colori:** ora il widget conosce il colore che ognuno mostra nell'app (rosa, lilla o quello scelto), per pallini, barrette e avatar senza foto.
  - **Da provare:** rispondere da un telefono: sull'altro, aperta US, il widget dice «Bea ha risposto · tocca a te» e colora la barretta di Bea.
- **4 · Distanza e batteria** (sostituisce «Noi» e la sua mappa): carta pesca-rosa-lilla; le vostre due foto; la distanza in Fraunces («12 km», «vicini» o «Distanza non nota») e la batteria di chi ami. Nel 4×2 «Tu» a sinistra e il partner a destra con la sua batteria, un arco a puntini con il cuore in mezzo, e sotto la distanza «aggiornato 10 min fa» (dopo una settimana sparisce). Il «Noi» già messo come 2×1 diventa una riga sola con le stesse cose.
  - **Niente mappa:** tolti lo sfondo `us_widget_noi_map_v1.webp` (era `DRAFT`, non più nel manifest), le nuvolette dei Ti penso e la doppia foto del vecchio 2×1. Nella privacy resta l'attribuzione di OpenStreetMap per la Mappa dei Ricordi; via la frase sullo sfondo del widget, e il widget si chiama «Distanza e batteria» (italiano e inglese).
  - **Dati:** nessuno nuovo. Al widget arrivano anche «vicini» (prima si perdeva) e l'ora della lettura più vecchia delle due, già calcolate dall'app; mai le coordinate.
  - **Da provare:** mettere il widget nel 2×2 e nel 4×2; con la posizione condivisa la distanza e «aggiornato …», vicini sotto i 3 km; la batteria del partner; il tocco apre Noi.
- **9 · Countdown** (sostituisce l'attuale): lo stesso Countdown scelto su Oggi.
  - 2×2: carta azzurro-lilla-rosa, l'etichetta bianca «Mancano» («Ci siamo» il giorno stesso, «Insieme da» per i giorni insieme), il numero in Fraunces prugna, «giorni · Lisbona» in corsivo e la barra rosa-lilla;
  - 4×2: un cielo con la sera a sinistra, «Lisbona · 14 novembre», il numero con «giorni» e le ore («4 ore»), 14 tacche;
  - barra e tacche sono le ultime due settimane: a 12 giorni se ne accendono 2, il giorno stesso tutte. Per «Insieme da» l'anno verso il prossimo anniversario;
  - l'ultimo giorno di un Countdown con l'ora il numero diventa il conto alla rovescia che va da solo, come prima;
  - **differenze dalla tavola:** le ore senza i minuti («4 ore», non «4 ore · 21 minuti»), così il widget si ridisegna una volta all'ora e non ogni minuto; la riga «giorni a Lisbona» diventa «giorni · Lisbona» perché il titolo è libero («giorni a Il nostro momento» non va). Gli stili premio del Countdown (Aurora, Chrome, Orbit…) restano nell'app ma non cambiano più l'aspetto del widget.
  - **Da provare:** un Countdown a una data e uno con l'ora, nel 2×2 e nel 4×2; l'ultimo giorno il conto alla rovescia; «Insieme da».
- **7 · Lasciato per te** (sostituisce «Messaggio», che in Impostazioni ora si chiama così): carta lilla-rosa, la foto di chi ami (o la sua iniziale sul suo colore), una nuvoletta bianca «Ti ha lasciato una foto», sotto «10 min fa» e la busta rosa. Nel 4×2 anche «la scopri solo dentro US», «Bea · 10 min fa» e la pillola rosa «Apri». Il tocco apre il Lasciato per te.
  - **Solo tipo e ora** (founder, 31/10): mai le parole, la foto o il link.
  - **Cambia:** mostra solo il Lasciato per te ancora chiuso, non più l'ultimo Ti penso (per quello c'è il widget Ti penso). Senza niente da aprire: «Il prossimo Lasciato per te arriverà qui».
  - **Da provare:** lasciare una foto da un telefono: sull'altro, aperta US, il widget dice «Ti ha lasciato una foto · ora»; aprirla: il widget torna vuoto; il 4×2 con «Apri».
- **6 · Ricordi a pila** (widget nuovo): carta crema-lilla con una pila di tre foto, quelle dietro girate, quella sopra col bordo bianco. Sotto il posto in Fraunces e il giorno («Lisbona · 12 ott»); nel 4×2 a destra «Un anno fa», il posto, «12 ottobre · 8 foto» e un trattino per ogni foto della pila.
  - **Quali foto:** le foto di questo giorno in un anno passato («Un anno fa», «2 anni fa»: vince l'anno più lontano, come Rivivi); altrimenti le tre più recenti, con «I più recenti». «Un anno fa» vale solo quel giorno: a mezzanotte l'etichetta sparisce, la pila resta finché US non si riapre.
  - **Come:** la pila la disegna US mentre è aperta (all'avvio, ogni 6 ore, quando cambia Ricordi), dalle anteprime che Ricordi già usa, e passa al widget due immagini (2×2 e 4×2). Nella fotografia del widget c'è solo quale ricordo è, mai un percorso o un link. Le immagini stanno nella memoria privata del widget e si cancellano con l'account.
  - **Dati:** nessuno nuovo; legge i Ricordi come la pagina Ricordi. Il tocco apre Ricordi.
  - **Da provare:** mettere il widget; con una foto di oggi un anno fa compare «Un anno fa»; senza, le tre più recenti; aggiungere una foto in Ricordi: la pila cambia.
- **Anteprime Pastello:** nella lista dei widget del telefono ogni widget ha la sua carta Pastello, sia come layout (Android 12+) sia come immagine PNG, che molti launcher (Xiaomi compreso) mostrano al posto del layout. In Impostazioni › Widget ogni tessera è la carta del suo widget. «Giorni insieme» non compare più nella lista (è dentro Foto & giorni); quelli già sulla Home continuano a funzionare.
  - **Dopo un aggiornamento** i widget già sulla Home si ridisegnano da soli col layout nuovo (`MY_PACKAGE_REPLACED`, c'era già dalla V1; ora ha un test). Su Xiaomi, se l'avvio automatico di US è spento, il sistema può bloccare questo segnale: allora si ridisegnano alla prima apertura di US o al giro dell'ora.
  - **Da provare:** aprire la lista dei widget del telefono: tutte carte chiare, nessuna scura; Impostazioni › Widget in US.
- **Correzioni dopo la prova dell'APK (founder, 02/11):**
  - **Ti penso e la Domanda «non si vedevano»:** il launcher scriveva «Impossibile caricare il widget» per un elemento (`Space`) che i widget Android non accettano. Tolto ovunque; un test ora accetta solo gli elementi ammessi. Visti sull'emulatore uno per uno, in chiaro e in scuro.
  - **Ti penso:** il cuore usciva dal bordo, ora sta dentro. **Distanza e batteria:** senza distanza «Distanza non nota» copriva le foto, ora è piccola.
  - **Tema del telefono:** chiaro = Pastello, scuro = «Midnight» (i colori notte di US); cambia da solo appena cambia il tema, anteprime comprese. Su Android 11 e precedenti i colori del cuore e della batteria si aggiornano al giro successivo.
  - **Da provare:** cambiare il tema del telefono con i widget sulla Home.
  - **Limite noto:** i launcher non applicano i caratteri Fraunces e Figtree nei widget: si vede il carattere del sistema.
- **5 · Come stai** (funzione nuova, app e widget; `docs/missions/widget-come-stai-v1.md`):
  - **In Oggi** una pillola accanto alla distanza: l'emoji di chi ami e la tua, o «Come stai?». Il tocco apre i 12 stati (🥰 😊 😴 😔 😤 🤒 🥳 💼 📚 🏋️ 🚗 🍝); un tocco salva, «Togli» lo toglie. Dura 12 ore. Niente notifica.
  - **In Impostazioni › Tu › «Come stai»** ognuno sceglie le sue parole al maschile o al femminile; senza scelta, parole che non cambiano («in amore», «senza energie»).
  - **Widget** (Android): 2×2 con lo stato di chi ami («innamorata · da 1 ora»); 4×2 con te su metà rosa e chi ami su metà lilla, il cuore nel mezzo. Il tocco apre i 12 stati in Oggi; il widget non scrive mai.
  - **SQL:** `20261102170000_member_status_v1.sql` (tabella `member_status`, RLS di coppia, ore del server, Realtime). Va su staging **prima** del web, col workflow «Supabase SQL (manual)» approvato dal founder; senza tabella l'app non mostra la pillola.
  - **Privacy:** aggiunte la riga dei dati e una frase («Come stai»), italiano e inglese.
  - **Da provare:** scegliere uno stato su un telefono: sull'altro compare subito in Oggi e nel widget; cambiare la forma in Impostazioni; dopo 12 ore sparisce.

## 2026-11-02 — Widget «Foto protagonista» (solo Android)

**Fonte:** founder, 02/11/2026 (`docs/DECISIONS.md`, «Widget: "Foto protagonista"»). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo. Nessun SQL, nessun dato nuovo.

- **Base comune:** 17 illustrazioni morbide (chiaro e scuro, WebP, circa 180 KB in tutto) e una grana leggera; i titoli e i numeri in Fraunces disegnati dal widget, perché il launcher non usa i caratteri dell'app; le iniziali su un fondo sfumato al posto dei dischi di colore.
- **Ti penso:** illustrazione col cuore disegnato, la foto di chi ami piccola e tonda (o l'iniziale), «Bea ti ha pensato» in Fraunces, solo il cuore di vetro: niente «Ricambia», anche nel 4×2. Nel 4×2 «12 volte oggi» in rosa accanto al cuore. Non collegato: «Apri US» e sotto «per riattivare l'invio» (prima «Apri US per riattivare…» tagliato).
  - **Da provare:** il cuore diventa rosa al tocco; «Apri US» non si taglia; tema chiaro e scuro.
- **La domanda di oggi:** illustrazione con due nuvolette, l'etichetta di vetro «Domanda di oggi», la domanda in Fraunces; sotto la piccola foto di chi ha risposto e «ha risposto · tocca a te». Nel 4×2 le vostre due foto (quella di chi non ha ancora risposto più tenue) e «Bea ha risposto · **tocca a te**». Il vuoto sotto la domanda non c'è più. Via pallini e barrette colorate.
  - **Da provare:** rispondere da un telefono: sull'altro, aperta US, compare la foto di chi ha risposto; tema chiaro e scuro.
- **Distanza e batteria:** illustrazione col sentiero a puntini e il cuore, la distanza in Fraunces e «aggiornato 10 min fa»; le vostre foto piccole e tonde (nel 2×2 in basso accanto a «Tu» e a «Bea 78%», nel 4×2 negli angoli in alto); il 2×1 già messo con la stessa illustrazione.
  - **Da provare:** 2×1, 2×2 e 4×2; senza distanza «Distanza non ancora nota» piccola; tema chiaro e scuro.
- **Countdown:** sempre illustrato (il sole sull'orizzonte), l'etichetta di vetro «Mancano», il numero in Fraunces con «giorni / Lisbona» in corsivo, 14 tacche (rosa i giorni passati) anche nel 2×2 al posto della barra; nel 4×2 «Lisbona · 14 novembre · 4 ore» sotto le tacche. L'ultimo giorno resta il conto alla rovescia.
  - **Da provare:** un Countdown a una data e uno con l'ora, 2×2 e 4×2, tema chiaro e scuro.
- **Lasciato per te:** busta disegnata, la foto piccola di chi te l'ha lasciato, un bigliettino inclinato col sigillo rosa: «Ti ha lasciato una foto» in Fraunces e «da Bea · 10 min fa»; nel 4×2 sotto «la scopri solo dentro US». La sorpresa resta chiusa. Via la pillola «Apri» (apre il tocco su tutto il widget).
  - **Da provare:** lasciare una foto da un telefono e guardare l'altro; senza account «Apri US per collegarlo» non si taglia; tema chiaro e scuro.
- **Come stai:** fondo sfumato, la foto tonda di chi ami (o l'iniziale) con l'emoji come adesivo, il nome in Fraunces e «innamorata · da 1 ora»; nel 4×2 due metà sfumate, tu a sinistra e chi ami a destra, il cuore in mezzo. Via le metà di colore piatto.
  - **Da provare:** scegliere uno stato: compare sulla foto; senza foto l'iniziale; tema chiaro e scuro.
- **Foto & Noi** (foto a tutto widget, segue il tema): la foto di Oggi con la grana leggera che in basso sfuma nella carta del tema (crema col tema chiaro, notte col tema scuro, come prima), «195» in Fraunces e «giorni insieme» in corsivo. Senza foto: illustrazione col sole e la luna e «La foto di Oggi apparirà qui». Resta la foto che cambia ogni ora.
  - **Da provare:** con la foto, tema chiaro e scuro; senza foto.
- **Ricordi a pila** (foto a tutto widget): nel 2×2 il ricordo più recente riempie il widget e gli altri due spuntano dal bordo in alto; la data va su una riga sua («2 nov · un anno fa») e il titolo in Fraunces sotto, così «Weekend a Firenze» non si taglia più. Nel 4×2 un ventaglio di tre foto su un fondo sfumato, «Un anno fa», il titolo e «2 novembre · 8 foto». Senza ricordi: polaroid vuote disegnate. Le immagini le disegna US (`widgets.js`), quindi serve anche il web nuovo.
  - **Da provare:** con un ricordo di oggi un anno fa e senza; un titolo lungo.
- **Anteprime:** nella lista dei widget del telefono ogni widget ha la sua immagine Foto protagonista, generica (nessun nome, viso o foto vera), chiara col tema chiaro e scura col tema scuro, anche Foto & Noi; da Android 12 il layout d'anteprima mostra la stessa immagine. In Impostazioni › Widget le tessere hanno fondi sfumati al posto dei colori pieni.
  - **Da provare:** la lista dei widget del telefono in chiaro e in scuro; Impostazioni › Widget.

## 2026-11-03 — Copia dei dati: note, batteria e Come stai

- **Database:** migrazione `20261103010817_s32_export_notes_battery_status.sql`. Ridefinisce `s32_export_user_data`, la funzione che legge l'Edge `export-user-data` (la copia preparata dal supporto su richiesta, D-7). Aggiunge:
  - le note condivise scritte o modificate per ultima da quella persona;
  - la sua lettura della batteria;
  - il suo «Come stai».

  Gli id del partner restano esclusi, anche `updated_by`. Resta riservata a service_role. Test: `tests/s32-export-notes-battery-status-db.test.js`.
  - **Ordine:** dopo le migrazioni delle Note (`20261031132258`), della Batteria (`20261031134410`) e di Come stai (`20261102170000`), perché legge le loro tabelle. Su staging e poi in produzione solo con il workflow «Supabase SQL (manual)» e il via del founder.
- **Uscita dalla coppia:** batteria e Come stai di chi esce spariscono già. `s32_close_membership` cancella il suo profilo e le due tabelle vanno in cascata. Nessuna migrazione: lo copre `tests/leave-couple-personal-rows-db.test.js`.

## 2026-11-03 — La sfida della settimana al posto delle missioni (fase 3 della Noi nuova)

**Stato:** su staging dal 03/11 (due migrazioni e due Edge applicate con il via del founder), non in produzione. Missione: `docs/missions/sfida-settimana-v1.md`.

- **Una sfida a settimana per coppia**, scelta dal server secondo «Come vi vedete», con un solo cambio; in Gioca › Giochi sotto la domanda del giorno, su Oggi da venerdì se non è fatta.
- **Si chiude con una foto**, che diventa un Ricordo segnato «Sfida». Coppie a distanza: due foto affiancate, e con una sola a fine settimana valgono 30 punti invece di 60. Serie di settimane di fila: 100 punti in più ogni 4.
- **Notifiche:** lunedì alle 9 la sfida nuova, sabato alle 10 il promemoria se non è fatta, e «manca solo la tua foto» per chi è a distanza. Interruttore in Impostazioni › Notifiche › La sfida della settimana (colonna `bond` già esistente).
- **Missioni vecchie:** tabelle e storico restano; non si creano più bacheche settimanali.
- **Database:** `20261103205157_weekly_challenge_v1.sql` (catalogo, `couple_weekly_challenges`, `couple_weekly_challenge_photos`, RPC, export con anche i tratti della lavagna) e `20261103205200_weekly_challenge_job_cron.sql` (cron orario solo dove c'è `us_project_url`: su staging non pianifica nulla). Edge nuova `weekly-challenge-job`; `send-web-push` con `challenge_photo`.
- **Android:** tre tipi di notifica nuovi in `UsPushNotices.java`: serve l'APK nuovo.
- **Ordine in produzione:** le quattro migrazioni della Noi nuova in ordine di nome (`…204751_couple_notes_color`, `…205050_lavagna_v1`, `…205157_weekly_challenge_v1`, `…205200_weekly_challenge_job_cron`), poi le Edge `send-web-push` e `weekly-challenge-job`, poi web e AAB. Su produzione il cron parte davvero: controllare il primo lunedì.

## 2026-11-03 — Noi nuova, fase 1: calendario protagonista e bacheca

**Stato:** su staging dal 03/11 (migrazione applicata con il via del founder), non in produzione. Decisione in `docs/DECISIONS.md` («Noi nuova, lavagna e sfida della settimana»); tavole `Main.dc.html` e `Bacheca.dc.html` del canvas «Noi · rework». In produzione solo insieme alle fasi 2 e 3, con il via del founder.

- **Calendario:** caselle grandi, niente cerchi, pallini né legenda. Ogni impegno è un'etichetta col suo nome nel colore di chi l'ha messo (due al massimo, poi «+n»); un giorno con un Ricordo mostra la sua foto. Oggi in grassetto, il giorno scelto con una cornice. Sotto, l'agenda del giorno: il Ricordo (si apre nel suo album), gli impegni con orario e di chi, «Aggiungi a questo giorno» (l'editor che c'era). Viste «Mese» e «Prossimi»: da oggi a un anno, con compleanni, mesiversari, anniversario e traguardi dei giorni (al massimo 30 voci).
- **Via da Noi:** le tessere Lavagna, Missioni, Eventi e Note e il pulsante «Il nostro giorno» (la data resta in Impostazioni). Eventi e anniversari si aprono dalle loro date nel calendario. Il codice delle missioni resta: lo sostituisce la fase 3.
- **Bacheca:** sotto il calendario i post-it, scritti e spuntati sulla pagina, carta gialla, rosa, azzurra o verde, autore in basso. Su Noi al massimo 6; «Tutti i post-it (n)» apre la bacheca intera con i filtri per colore. In cima il post-it fisso «Da vivere» con le idee di prima: spuntarne una vuol dire «vissuta» (la prima persona propone, l'altra conferma, come prima). Sopra i post-it c'è il posto vuoto per la Lavagna (fase 2).
- **Database:** migrazione `20261103204751_couple_notes_color.sql`: colonna `color` in `couple_notes` (yellow, pink, blue, green; giallo di default; nessun dato cancellato). Stessa RLS e stessa guardia. L'export SQL la include già; l'Edge `export-user-data` la elenca (`s3-2-export-core.mjs`), quindi va ridistribuita **dopo** la migrazione. Ordine: SQL, poi Edge, poi sito/APK. Test: `tests/couple-notes-color-db.test.js`.
- **Privacy:** nessun dato nuovo oltre al colore del post-it.

## 2026-11-04 — Bacheca: un post-it non sparisce più da solo

**Stato:** su staging dal 04/11 (build 95), non in produzione. Va in produzione con la Noi nuova.

- **Post-it sicuri:** chiudere un post-it vuoto lo cancellava senza chiedere. Ora se ne va da solo solo un post-it nuovo mai riempito (non è mai arrivato al server); uno che è sulla bacheca, svuotato a mano, chiede sempre (anche se scritto un attimo prima) «Staccare il post-it?» («Stacca» o «Tienilo»: in quel caso resta com'era). Un evento Realtime che arriva senza il testo del post-it (Supabase toglie i valori oltre 64 byte quando una modifica è troppo grande) non lo svuota più: la bacheca si rilegge. Test: `tests/couple-notes-close.test.js` e `tests/couple-notes-close-browser.test.js` (tutti i modi di chiudere un post-it, nel browser).
- **Calendario:** nelle caselle le date di coppia dicono quanto, anche su due righe («34 mesi», «3 anni», «4100 giorni») invece di «Mesi…». In «Prossimi» e nell'agenda il traguardo dei cento giorni non ripete più il numero sotto il titolo.
- **Post-it storti:** inclinati tra 1° e 2°, a destra o a sinistra, come nella tavola (prima molti erano a 0° o mezzo grado e sembravano dritti).
- **Database:** niente.

## 2026-11-04 — Widget nuovi, sei Atmosfere, Ricordi come album, Prossimi senza trattini

**Stato:** su staging dal 04/11, non in produzione. Va in produzione con la Noi nuova, solo con il via del founder. Tavole nel canvas «Widget, sfondi e Ricordi» (https://claude.ai/artifact/PiHBn6bmN7G5JCYiTsQURg).

- **Widget Android:**
  - **Ti penso:** solo un cuore vuoto. Toccandolo si riempie con un pop sopra la Home e parte il Ti penso.
  - **Distanza e batteria:** solo l'altra persona (foto, nome, distanza, batteria). La tua foto e «Tu» non ci sono più.
  - **Come stai:** solo le due foto, ognuna con la sua faccina; niente nomi, righe e cuore in mezzo.
  - **La domanda di oggi:** la domanda in grande su uno sfondo calmo, il tasto «Rispondi» («Leggi» quando avete risposto tutti e due) che apre la domanda in US.
  - **Lasciato per te:** sfondo nuovo, una busta color crema con il sigillo; sopra «Ti ha lasciato una foto · da Bea · 10 min fa».
  - **Countdown tolto.** Al suo posto il widget **Post-it**: l'ultimo post-it della bacheca sulla sua carta, chi l'ha scritto e «+2» se ce ne sono altri. Toccandolo apre Noi. Si aggiorna quando US è aperta.
  - Anteprime nuove nel selettore dei widget. Serve l'APK nuovo.
- **Sfondi (Atmosfere):** US parte su **Vino**, un gradiente vino scuro che resta fermo mentre la pagina scorre (prima: nero pieno). Le Atmosfere di Sintonia diventano gradienti: **Prugna** (livello 3, era Rosé), **Notte blu** (5, era Mezzanotte), Pellicola (7), Ora blu (9), **Grafite** (12, grafite e argento con un riflesso). Chi le aveva già sbloccate le ritrova: stessi id e livelli.
- **Ricordi:** solo l'album. Le foto mese per mese, tre per riga, quadrate, senza scritte. Escono Conservati, i «Vissuto insieme» senza foto, le domande conservate, le idee e i capitoli per anno: i dati restano salvati, non si vedono più in Ricordi. Attenzione: Conservati (le cose tenute di Lasciato per te) ora non ha più un ingresso nell'app.
- **Noi, Prossimi e agenda:** niente più «—» al posto dell'ora. Un mesiversario o un traguardo ha un cuore dorato, un impegno senza ora il calendario; i riquadri non hanno più il bordo.
- **Database:** migrazione `20261104140000_atmosfere_gradienti.sql`, solo titoli e descrizioni di cinque premi (nessun dato cancellato). Ordine: SQL, poi web, poi APK/AAB.
- **Privacy:** il widget Post-it mostra sulla Home le parole dell'ultimo post-it della coppia (come la domanda del giorno). Nessun nuovo tipo di dato per Google Play.
- **Conservati in Lasciato per te** (founder, 04/11): la voce «Conservati» (con quante cose avete tenuto) è in fondo a Lasciato per te, sia quando lasci qualcosa sia quando apri; compare solo se avete conservato qualcosa e apre Conservati sopra. Il titolino in Conservati ora dice «LASCIATO PER TE».
- **Nuovo impegno** (founder, 04/11): accanto a Lavoro, Università e Uscita c'è un «+» per aggiungere un titolo rapido proprio (es. «Palestra»): resta tra i titoli, su questo telefono, per chi l'ha aggiunto (al massimo 8); una pressione lunga lo toglie, dopo aver chiesto. Inizio e Fine partono vuoti con «00:00» come suggerimento (prima 09:00 → 10:00) e i due punti compaiono da soli mentre scrivi («9» diventa «09:», «2.00» diventa «02:00»); la fine non si riempie più da sola un'ora dopo l'inizio.
- **Lavagna nera** (founder, 04/11): la lavagna nell'app e il widget «Lavagna» con il tema scuro sono neri, come una lavagna vera (prima prugna).
- **Icona dell'app senza riquadro** (founder, 04/11): l'icona sul telefono è «US» con la stellina, senza la cornice attorno (il logo approvato il 29/10). Sostituisce la scelta del 30/10 di tenere l'icona di sempre. Splash e notifiche non cambiano. Si vede solo con l'APK/AAB nuovo.
