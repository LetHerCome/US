# Prossima patch in produzione

**Stato:** in prova su staging (https://us-staging-s31.pages.dev). Niente è in produzione. Ogni passo qui sotto ha il via separato del founder (regola «prove solo su staging», `docs/DECISIONS.md`, 28/10/2026).
**Build:** `us-traguardi-20261029-44`.
**Branch:** `claude/gioca-una-al-giorno` (PR #232), sopra `claude/fix-amici-beta` (PR #233) e sopra ancora `claude/traguardi-giorni`.

## Testo «Novità» per Google Play

Italiano (massimo 500 caratteri):

> Gioca: una partita al giorno, e vedi quante ne restano oggi.
> Invito più semplice: condividi un link, il codice si copia da solo.
> Registrazione: puoi vedere la password, c'è Google anche in «Crea un account» e dopo la mail di verifica l'accesso è automatico.
> «Insieme dal»: giorno, mese e anno, anche per chi sta insieme da tanti anni.
> Dopo l'accesso con Google, la configurazione non si sovrappone più all'accesso.
> Traguardi: ogni 100 giorni insieme si festeggia, e i 1000 valgono di più.

English (500 characters max):

> Play: one game a day, and you can see how many are left today.
> Easier invites: share a link, and the code copies on its own.
> Sign-up: show your password, continue with Google from “Create an account” too, and after the verification email you're signed in without typing again.
> “Together since”: day, month and year, even for long-time couples.
> After signing in with Google, setup no longer overlaps the sign-in screen.
> Milestones: every 100 days together is celebrated, and 1000 is worth the most.

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

## Ordine in produzione (ognuno con il suo via)

1. **SQL** con il workflow «Supabase SQL (manual)», target `production` e conferma `PRODUZIONE`, nell'ordine: Gioca (`20261028201759_gioca_daily_limit_v1.sql`), poi traguardi (`20261028232743_days_together_milestones_v1.sql`). Prima serve un token Supabase che includa il progetto di produzione: quello attuale vale solo per staging.
1b. **Edge Function** `monthiversary-job` con il workflow «Supabase Edge deploy», target `production`, dopo l'SQL dei traguardi: usa la nuova funzione del database.
2. **Sito web** (Cloudflare Pages `us-a33`): porta `/invito` e l'app web nuova. Va pubblicato prima dell'AAB, perché il link condiviso dall'app punta a `us-a33.pages.dev/invito`.
3. **AAB** sul test chiuso «Alpha» di Play, con il testo «Novità» qui sopra.

Tra il passo 1 e il passo 3 l'app vecchia dice ancora «lunedì» per una partita che torna domani: sono sbagliate solo le scritte, i limiti funzionano.

## Da sapere

- **Link d'invito e app Android:** il link si apre nel browser, non nell'app installata. Per aprire l'app serve Android App Links: `assetlinks.json` con l'impronta SHA-256 della chiave di firma di Play (Play Console › Integrità dell'app) e un intent-filter. È un passo successivo.
- **Google Play dalla pagina d'invito:** durante il test chiuso la scheda dello store si apre solo per i tester.
- **Mail di verifica nello spam:** si risolve con un mittente email nostro (SMTP personalizzato in Supabase). È una decisione a parte.
- **App di staging:** dall'APK di staging il link d'invito punta comunque al sito di produzione. Sul web di staging punta a staging.
