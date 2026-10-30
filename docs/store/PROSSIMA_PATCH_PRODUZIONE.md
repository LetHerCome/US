# Prossima patch in produzione

**Stato:** in prova su staging (https://us-staging-s31.pages.dev). Niente è in produzione. Ogni passo qui sotto ha il via separato del founder (regola «prove solo su staging», `docs/DECISIONS.md`, 28/10/2026).
**Build:** `us-fix-apk-20261029-66`.
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
