# Mission — US Plus V1 su staging

**Status:** §1 (Gioca una partita al giorno) fatto sul branch `claude/gioca-una-al-giorno`, in prova su staging. Il resto da iniziare. Nessun passo è autorizzato per implicazione: ognuno ha il via del founder.
**Decisione:** nuova D4 del 28/10/2026 in [`docs/DECISIONS.md`](../DECISIONS.md), più la regola «prove solo su staging» dello stesso giorno.
**Ricerca:** [`docs/product/lancio-marketing-monetizzazione.md`](../product/lancio-marketing-monetizzazione.md), §3 (Play Billing, RevenueCat, schema dell'accesso) e §4.5 (prova su staging).
**Dove:** US-STAGING (`com.usapp.us.staging`, Supabase `us-staging-s31`). In produzione arrivano solo patch mirate di ciò che su staging funziona.

## 0. Prima di iniziare (founder)

- Commercialista: partita IVA e dati pubblici del venditore su Play. Finché non risponde, la vendita in produzione resta bloccata. Il lavoro su staging può andare avanti.
- Play Console: un'app separata con il pacchetto `com.usapp.us.staging`, solo nel test interno, con Francesco e Bea come tester con licenza.
- RevenueCat: un account e un progetto di prova collegati all'app di staging (gratis fino a 2.500 $ di ricavi al mese).

## 1. Gioca: una partita al giorno (primo passo, utile anche senza Plus)

- **Oggi:** `private.game_v2_week_limits()` dà 1 «Per voi» + 2 libere a settimana, con al massimo 3 partite aperte (`supabase/migrations/20261004000000_us_2_0_baseline.sql`). Il controllo è in `start_game_round` (`20261014220000_content_1_0.sql`); la settimana è in Europe/Rome.
- **Dopo:** una partita al giorno, di qualsiasi tipo, sul giorno di Europe/Rome; 7 a settimana. Restano invariati la ripresa delle partite aperte, il blocco a 3 aperte e i lock. Con Plus, nessun limite (passo 4).
- **Fatto (28/10):** la migrazione `20261028201759_gioca_daily_limit_v1.sql` ridefinisce solo `private.game_v2_week_limits` e `private.game_v2_week_usage`. `start_game_round`, `start_swipe_round` e `get_game_v2_home` leggono già tutto da lì e non cambiano. Il risultato ha le stesse chiavi di prima, più `period: 'day'` e `day`; `resets_on` diventa domani. I messaggi d'errore restano «weekly allowance exhausted» e «weekly per voi played», così l'app già installata continua a capirli.
- **Client:** `games.js` dice «Da domani», «Nuovi giochi domani», «Per oggi avete giocato» e «Userete il gioco di oggi»; l'inglese è in `i18n-en.js`. «Giocato questa settimana» resta sulle schede dei tipi già giocati nella settimana.
- **Test:** `tests/gioca-daily-limit-v1-db.test.js` (8, con tutte le migrazioni del repo in PGlite) e i test del client di Gioca aggiornati. `tests/m11f-game-v2-weekly-rhythm.test.js` resta com'è: prova la catena storica `migrations_history`, non la produzione di oggi.
- **Ordine in produzione:** prima l'SQL, poi l'AAB. Tra i due, l'app vecchia dice ancora «lunedì» per una partita che torna domani: solo le scritte sono sbagliate, i limiti no.
- **Contenuti (controllati il 28/10 sulle migrazioni):** circa 230 domande curate su 5 tipi di partita (da circa 32 per «Rivivete» a circa 64 per «Quanto mi conosci»), 5 per partita. La selezione non si blocca mai: quando le domande sono a riposo (30–120 giorni) ripropone le meno recenti. Con una partita al giorno sparsa sui tipi, le prime ripetizioni arrivano dopo circa 6 settimane. Con Plus e partite illimitate arrivano prima: i pacchetti a tema servono prima di vendere Plus.
- **Produzione:** patch mirata solo dopo la prova su staging, con il via del founder (SQL dal workflow «Supabase SQL (manual)» più l'AAB con il client).

## 2. L'accesso della coppia su Supabase staging

- Tabella degli abbonamenti per utente:
  - colonne: utente, fonte (`play`, `beta`, `manuale`), prodotto, stato, scadenza, ultimo evento;
  - RLS: ognuno vede solo la propria riga.
- RPC di lettura «la coppia ha Plus?»: vero se **almeno uno** dei due membri attuali ha un accesso attivo. Restituisce anche il nome di chi paga, per «Plus attivo, grazie a [nome]».
- Se la coppia si chiude, il partner perde l'accesso subito: l'RPC guarda solo i membri attuali.
- Edge Function del webhook di RevenueCat:
  - verifica dell'autorizzazione;
  - è l'unica che scrive;
  - eventi idempotenti.
- Test della funzione:
  - acquisto, rinnovo, disdetta, scadenza;
  - rimborso, periodo di tolleranza;
  - coppia chiusa, account eliminato;
  - fonte `beta` con scadenza.

## 3. L'app su staging

- SDK `@revenuecat/purchases-capacitor` (Billing Library 8 o successiva). L'ID utente di RevenueCat è l'ID Supabase.
- **Schermata Plus:**
  - mensile e annuale, con 7 giorni di prova sull'annuale;
  - «Ripristina acquisti»;
  - link alla gestione degli abbonamenti di Play.
- **Il partner di chi paga** vede «Plus attivo, grazie a [nome]» al posto del pulsante d'acquisto. Il pulsante torna quando l'abbonamento sta per scadere.
- **Eliminazione dell'account:** prima della conferma, avviso che l'abbonamento su Play non si disdice da solo, con il link.
- **Interruttore lato server:** spento in produzione. La build di produzione non mostra acquisti finché non c'è il via.
- Niente Stripe né link a pagamenti esterni nell'app Android.

## 4. Cosa sblocca Plus

- Gioca senza limite.
- Ricordi oltre il limite gratuito: il numero si fissa con i dati d'uso, letti in sola lettura.
- «Il vostro anno» completo; senza Plus, una versione breve.
- Archivio delle domande passate, con la possibilità di rispondere a quelle perse.
- Pacchetti a tema per Gioca: contenuti nuovi, consentiti come eccezione a D5 solo per Plus.
- Restano gratis per sempre:
  - Ti penso, Lasciato per te, la domanda di oggi, il widget, il calendario, i Compagni;
  - tutto ciò che la coppia ha già creato, anche dopo la fine di Plus.

## 5. Coppie fondatrici

- Le coppie del test chiuso ricevono 6 mesi di Plus dal lancio di Plus, con fonte `beta` e scadenza.
- L'elenco si prende in sola lettura dalla produzione. L'assegnazione è una patch approvata.

## 6. Prima di vendere in produzione

- Informativa privacy (IT/EN) e sezione Sicurezza dei dati di Play aggiornate: RevenueCat è un nuovo fornitore.
- Risposta del commercialista.
- Prodotti e prezzo sull'app `com.usapp.us`: 3,99 €/mese e 24,99 €/anno da provare; il prezzo finale si fissa dopo il questionario alla beta.
- Ogni patch in produzione (SQL, Edge, AAB, interruttore) ha un via separato.

## Acceptance (su staging, con le carte di prova di Play)

- Acquisto, rinnovo, disdetta, carta rifiutata, periodo di tolleranza, rimborso.
- Il partner vede Plus attivo e non può ricomprarlo.
- Coppia chiusa: il partner perde l'accesso subito. Account eliminato: avviso sull'abbonamento visto prima.
- Reinstallazione e «Ripristina acquisti».
- Gioca: una partita al giorno senza Plus, illimitate con Plus; le partite aperte si riprendono senza consumare.
- Con l'interruttore spento, nessuna traccia di acquisti nell'app.
