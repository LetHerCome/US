# US — Audit della produzione (5 novembre 2026)

**Tipo:** audit in sola lettura di server, app e sito di produzione, durante il test chiuso «Alpha».
**Base:** `main` a `dd70e38a` (rilascio 1.4), sito `www.uscouple.app` con la build `us-rilascio-20261104-101`, Supabase di produzione `iiakdfsxpywdkxravqjh`.
**Cosa ho toccato:** niente in produzione. Solo letture (vedi «Come l'ho controllato» in fondo).
**Seguito:** il confronto con i concorrenti e il piano economico sono in [`docs/product/2026-11-05-concorrenti-e-piano-economico.md`](../product/2026-11-05-concorrenti-e-piano-economico.md). Le correzioni dei punti 1, 2, 3 (minificazione e font), 4 (integrità, non la CSP), 9, 12 e 13 sono pronte nella patch 1.4.1 ([nota](../store/PROSSIMA_PATCH_PRODUZIONE.md)); i punti 7 e 12 sono stati corretti dopo una verifica più a fondo.

---

## In breve

La base è solida. I controlli di Supabase non trovano errori gravi, nessuna funzione è aperta a chi non ha un account, le 59 chiamate al server che l'app usa esistono tutte con i permessi giusti, i 10 lavori programmati girano senza errori e i backup giornalieri ci sono. Nell'HTML i testi scritti dagli utenti passano sempre dall'escape.

I problemi veri, in ordine di importanza:

| # | Problema | Dove | Gravità | Correzione |
|---|---|---|---|---|
| 1 | «Scollega questo telefono» scollega l'account da **tutti** i dispositivi, e il testo parla ancora del «codice privato» | app | Media | `signOut({scope:'local'})` e testo nuovo IT/EN |
| 2 | Le **cancellazioni non arrivano** all'altro telefono (Ricordi, foto, post-it, eventi, storie); il calendario non è in tempo reale | server + app | Media | segnale di revisione per coppia, come la lavagna |
| 3 | **Primo caricamento lento** del sito: circa 7,7 s su un telefono medio in 4G | sito | Media | minificare, inglese solo se serve, font precaricati |
| 4 | supabase-js e MapLibre presi da jsDelivr **senza controllo di integrità**; nessuna Content-Security-Policy | sito e app | Media | `integrity` o file nella build; CSP prima in prova |
| 5 | Protezione dalle **password già rubate** spenta | Auth | Media | interruttore in Supabase (tuo) |
| 6 | Il registro delle migrazioni di produzione ne conosce **9 su 41**; `config.toml` ha ancora `us-a33.pages.dev` come Site URL | processo | Media | `migration repair` e `config.toml` allineato |
| 7 | Il widget Scriptable, ritirato nel repo il 06/10, **in produzione è ancora acceso e il telefono di Bea lo usa**; il codice che lo serve non è più nel repo | server | Media | decidere: tenerlo fino all'app iPhone o spegnerlo |
| 8 | **Tre indirizzi** per lo stesso sito, senza reindirizzamento | Cloudflare | Bassa | 301 verso `www` |
| 9 | Link d'invito **senza anteprima** (niente Open Graph) | sito | Bassa | 5 meta per pagina |
| 10 | **15 test nel browser su 75 falliscono** su `main` e non fanno parte del controllo | test | Bassa | Playwright nel repo, test aggiornati |
| 11 | Schermi da 320 px: «Come stai?» copre il conto alla rovescia | app | Bassa | spazi in `dc-oggi.css` |
| 12 | Promemoria degli impegni: il server c'è, l'app no; la regola di inserimento è scritta male (mai sfruttabile) | server + app | Bassa | riscriverla prima di riaccenderli |
| 13 | Database: regole RLS ricalcolate a ogni riga, 50 chiavi esterne senza indice | server | Bassa | una migrazione di pulizia |
| 14 | Due chiamate dei cron su 450 scadute oggi (alle 7 e alle 9) | server | Bassa | lotti o timeout più lungo |
| 15 | Nessun limite di spazio per coppia | server | Bassa | tetto sul server, insieme al limite gratuito di Plus |
| 16 | 8 account anonimi rimasti dal periodo prima di email e Google | dati | Bassa | cancellarli |
| 17 | L'informativa non cita i disegni della lavagna né le foto della sfida | privacy | Bassa | due righe IT/EN e Sicurezza dei dati |
| 18 | Zoom bloccato, `/robots.txt` e pagine inesistenti rispondono con l'app | sito | Bassa | viewport, robots, 404 |

---

## Dettagli

### 1. «Scollega questo telefono» scollega tutto

- **Prova.** `settings.js:1027` chiama `sb.auth.signOut()` senza `scope`. In supabase-js lo scope predefinito è `global`: chiude le sessioni dell'account su tutti i dispositivi e gli altri se ne accorgono al rinnovo del token (documentazione Supabase, «Signing out»). Le altre uscite dell'app usano già `{scope:'local'}`: `app.js:959`, `app.js:2443`, `settings.js:814`.
- **Effetto.** Chi scollega il telefono viene scollegato anche dal sito o da un secondo telefono. Le registrazioni delle notifiche di quei dispositivi restano.
- **Testo.** Il pannello (`settings.js:1010`, inglese in `i18n-en.js:1638`) dice «Dovrai inserire di nuovo il codice privato per rientrare in US». Il codice privato non esiste più da quando si entra con email o Google.
- **Correzione.** `sb.auth.signOut({scope:'local'})` e un testo come «Per rientrare userai la tua email o Google». Da valutare anche l'uscita dall'onboarding (`app.js:995`), che oggi è globale.

### 2. Tempo reale: le cancellazioni non arrivano

- **Prova.** L'app ascolta i cambi con `event:'*'` e un filtro `couple_id=eq.…` (`app.js:5818–5835`, `stories.js:919`). Le 22 tabelle in Realtime hanno replica identity `DEFAULT`, quindi una riga cancellata porta solo l'`id`. La documentazione Supabase dice che le DELETE si filtrano solo con replica identity `FULL`; nella funzione di produzione `realtime.is_visible_through_filters` il filtro su `couple_id` non trova la colonna e scarta l'evento.
- **Effetto.** Se l'altra persona elimina un Ricordo, una foto, un post-it, un evento o una storia, sul tuo telefono resta lì finché non riapri la pagina (i post-it si rileggono al massimo una volta al minuto con Noi aperta). L'avviso «L'altra persona ha staccato questo post-it» (`couple-notes.js:461–467`) in produzione non parte mai. Un Ricordo già eliminato, se lo apri, ha foto che non si caricano.
- **Calendario.** `calendar_entries` non è nella pubblicazione Realtime. Un impegno nuovo dell'altra persona compare quando torni nell'app o riapri Noi (`noi-v2.js:672`), non mentre la guardi.
- **Correzione consigliata.** Lo schema che la lavagna usa già: un trigger `AFTER DELETE` aggiorna una riga della coppia (`lavagna_strokes_removed` → `lavagna_boards`) e l'app ascolta quell'UPDATE, che passa dalla RLS. Per esempio una tabella `couple_sync (couple_id, kind, revision)` aggiornata dai trigger di `moments`, `moment_photos`, `couple_notes`, `shared_events`, `stories` e `calendar_entries`. Sconsiglio `REPLICA IDENTITY FULL`: sulle DELETE la RLS non si applica. Prima su staging.

### 3. Il sito è lento al primo caricamento

Misure con Playwright (Chromium) su `www.uscouple.app`, schermata di benvenuto senza account. «Telefono medio» vuol dire CPU 4 volte più lenta e rete da 1,6 Mbit/s con 150 ms di latenza.

| Profilo | Primo contenuto (FCP) | Contenuto principale (LCP) | Trasferito | Richieste |
|---|---|---|---|---|
| PC, prima visita | 1,2–4,1 s | 4,8 s | ~1 MB | 117 |
| PC, seconda visita (service worker) | 0,6 s | 1,3 s | ~0 | 119 |
| Telefono medio, prima visita | 7,3 s | 7,7 s | ~1 MB | 117 |
| Telefono medio, seconda visita | 2,9 s | 3,4 s | ~0 | 116 |

Google considera buono un LCP sotto i 2,5 s.

- **Cause.** 42 fogli di stile, di cui 38 bloccano la prima pittura, e 46 script, nessuno minificato: circa 1 MB di CSS e 1,9 MB di JavaScript da leggere (supabase-js compreso). `i18n-en.js` (172 KB) si carica in modo bloccante anche per chi usa l'italiano. I font (158 KB) si scoprono solo dal CSS, senza preload. Maudit si carica anche nella schermata di benvenuto.
- **Chi lo sente.** Chi ha un iPhone e usa US dal sito, chi apre un link d'invito, chi arriva da TikTok. Nell'app Android i file sono già sul telefono, ma la CPU deve comunque leggerli: circa 1 s di attività lunga con la CPU rallentata 4 volte.
- **Correzione (solo build).** Minificare ogni file con esbuild in `scripts/build-cloudflare-pages.mjs` (esbuild è già nelle dipendenze), caricare l'inglese solo con la lingua inglese, `<link rel="preload">` per Fraunces e Figtree, CSS di Gioca, Ricordi e Impostazioni non bloccanti. Stima: circa metà dei byte in meno. Da provare su staging con i test nel browser.

### 4. Codice esterno senza controllo e niente CSP

- `index.html:159` carica supabase-js da `cdn.jsdelivr.net` senza `integrity`; `elimina-account.html:44` invece lo ha.
- `ricordi-place.js:21–22` e `278–281` caricano MapLibre (JS e CSS) dallo stesso CDN senza `integrity`, anche nell'app Android.
- Il sito non manda una Content-Security-Policy. Le intestazioni attuali sono solo `X-Content-Type-Options`, `Referrer-Policy` e `X-Frame-Options` (`cloudflare/_headers`).
- **Rischio.** Se il CDN servisse un file alterato, girerebbe con la sessione dell'utente. L'escape dell'HTML è fatto bene (ho controllato le interpolazioni dei testi degli utenti), quindi la CSP qui è una seconda difesa.
- **Correzione.** `integrity` e `crossorigin`, oppure il file copiato nella build come già fa la build Capacitor per supabase-js. La CSP prima come `Content-Security-Policy-Report-Only`, perché ci sono gestori inline (`onerror="usRecoverPrivateImage(this)"`) e script inline in `index.html`.

### 5. Password già rubate

L'advisor `auth_leaked_password_protection` dice che il controllo con HaveIBeenPwned è spento. Con la registrazione aperta conviene accenderlo: Authentication › impostazioni delle password, incluso nel piano Pro. È un'impostazione di sicurezza: la cambi tu.

### 6. Registro delle migrazioni e `config.toml`

- In produzione `supabase_migrations.schema_migrations` ha 9 versioni, il repo 41. Mancano 34 migrazioni, applicate col workflow SQL che non le registra; due versioni registrate non sono nel repo (`20261006210215`, `20261007232641`). Un `supabase db push` lanciato per sbaglio proverebbe a rieseguirle, e `supabase migration list` non dice niente di utile.
- `supabase/config.toml` ha `site_url = "https://us-a33.pages.dev"`, mentre dal 30/10 la produzione usa `https://www.uscouple.app`, impostato a mano. Un `supabase config push` riporterebbe indietro il Site URL delle mail.
- **Correzione.** `supabase migration repair --status applied <versioni>` (scrive solo il registro, ma è produzione: serve il tuo via) e `config.toml` allineato (solo repo).

### 7. Il widget Scriptable è ancora acceso in produzione

*Corretto il 05/11, durante le correzioni: la prima versione di questo punto diceva che nessuno usava queste funzioni.*

- Il 06/10 il repo ha ritirato i widget Scriptable per iPhone: `us-widget-state` rifiuta i token Scriptable e `widget-scriptable-setup` è stata tolta (lo fissa `tests/pre-native-cleanup.test.js`). **Quel ritiro non è mai stato pubblicato:** in produzione girano ancora `us-widget-state` v9 e `widget-scriptable-setup` v6 del 25/09, che servono le installazioni Scriptable.
- In produzione c'è un'installazione Scriptable attiva, e il suo token è stato usato il **5/11 alle 8:46**: è il widget sull'iPhone di Bea. Gli altri due token di `us-widget-state` («Beatrice iPhone», «Francesco Android») non si usano dal 25/09 e dal 20/08.
- Il cron `us-widget-scriptable-state-expiry` (ogni minuto) fa scadere quei token: finché il widget resta, serve.
- **Rischio:** pubblicare `us-widget-state` dal repo spegnerebbe il widget di Bea senza avviso. Il codice che lo serve oggi si recupera con `supabase functions download us-widget-state --project-ref iiakdfsxpywdkxravqjh --use-api` (stesso comando per `widget-scriptable-setup`).
- **Decisione tua:** tenere Scriptable finché l'app iPhone non ha i suoi widget (proposta), oppure spegnerlo adesso. Nel frattempo si possono revocare i due token morti.
- `calendar-reminders-worker` (v12) è pubblicata senza cron e senza interfaccia (vedi il punto 12).

### 8. Tre indirizzi per lo stesso sito

`www.uscouple.app`, `uscouple.app` e `us-a33.pages.dev` rispondono tutti con l'app, senza reindirizzamento. Ogni indirizzo ha la sua sessione, la sua installazione PWA e le sue notifiche web: chi entra da `uscouple.app` e poi da `www` deve accedere di nuovo.

**Correzione.** Una regola 301 su Cloudflare da `uscouple.app` e `us-a33.pages.dev` verso `www`, lasciando raggiungibile `/.well-known/assetlinks.json` per gli App Links del vecchio indirizzo. Gli inviti già mandati continuano a funzionare: il codice sta dopo `#` e il browser lo conserva nel reindirizzamento.

### 9. Link d'invito senza anteprima

`index.html` e `invito.html` non hanno `meta description`, `og:title`, `og:description` né `og:image`. Su WhatsApp e Telegram l'invito arriva senza immagine e senza frase. Bastano cinque righe di meta per pagina e un'immagine 1200×630 presa da un asset approvato.

### 10. Test nel browser

`npm test` passa: 2.662 test, 0 falliti, 124 saltati. I saltati sono i test nel browser, perché Playwright non è nel repo. Con il Playwright di `F:/AI/WARDROBE` i test nel browser danno **60 passati e 15 falliti su 75** su `main`:

- la maggior parte sono rimasti indietro rispetto all'app: colore scelto alla prima apertura, invito con il link, premi di Sintonia V2, pulsante «Sblocca», link a Termini e Privacy nella registrazione;
- uno è rotto (`mc3-browser.test.js`: `page is not defined`);
- due o tre trovano difetti veri sugli schermi piccoli (punto 11).

Oggi una regressione nell'interfaccia vera non la vede nessun controllo. **Correzione:** Playwright come devDependency, un job di CI, test aggiornati.

### 11. Schermi da 320 px

A 320×568 la pillola «Come stai?» copre la scritta del conto alla rovescia, e il conto alla rovescia tocca la riga di distanza e batteria (`countdown-oggi-v1-browser.test.js`). A 360, 390 e 412 px di larghezza è tutto pulito e il conto alla rovescia si tocca. Telefoni così piccoli sono rari: priorità bassa.

### 12. Promemoria degli impegni

Il server c'è (tabella `calendar_reminders`, `calendar-reminders-worker`), l'app non li offre più dal commit `89fd9a10` («simplify calendar entry creation»). La regola `calendar_reminders_insert_couple` ha un errore di scrittura: `p.couple_id = p.couple_id` ed `e.couple_id = e.couple_id` sono sempre veri.

*Verificato il 05/11 durante le correzioni:* non si è mai potuto sfruttare. Gli utenti non hanno il permesso INSERT, e le regole RLS di `profiles` e `calendar_entries` nascondono comunque alle sottoquery le righe delle altre coppie (provato in PGlite con la regola vecchia). La correzione rende la regola chiara prima di riaccendere i promemoria. Per riaccenderli serve anche una RPC, o il permesso di eseguire le due funzioni dei CHECK, tolto all'app in F1B.

### 13. Database: igiene delle prestazioni

Dagli advisor di produzione:

- 38 regole RLS ricalcolano `auth.uid()` o `private.current_couple_id()` per ogni riga; si risolve scrivendo `(select auth.uid())`;
- 50 chiavi esterne senza indice, che pesano sulle cancellazioni a cascata dell'account;
- 14 indici mai usati;
- il server Auth è fissato a 10 connessioni invece che a una percentuale.

Con 9 coppie non si sente. Conviene sistemarlo prima della crescita, in una sola migrazione.

### 14. Chiamate dei cron scadute

`pg_net` aspetta 5 secondi. Nelle ultime ore 2 chiamate su 450 sono scadute: alle 7:00 per il DNS e alle 9:00 perché la funzione ha risposto dopo 5 s (sono le chiamate dei minuti :00, domanda del giorno o Gioca). La funzione continua a girare lo stesso, ma con più coppie l'invio delle 9 durerà di più: va fatto a lotti o con un timeout più lungo.

### 15. Nessun limite di spazio per coppia

Il bucket `us-media` accetta file fino a 40 MB, video compresi, senza un tetto per coppia. Con la registrazione aperta un solo account può consumare molto dei 100 GB inclusi nel piano. Il limite gratuito dei Ricordi previsto da Plus aiuta, ma serve anche un controllo sul server.

### 16. Account anonimi rimasti

In `auth.users` ci sono 8 account anonimi del periodo prima di email e Google, senza profilo. Da cancellare, per tenere solo i dati che servono.

### 17. Informativa privacy

L'informativa (IT ed EN, aggiornata il 2/11) cita batteria e «Come stai», ma non i disegni della lavagna né le foto della sfida della settimana, arrivati con la 1.4. Vanno aggiunti, e va controllata la Sicurezza dei dati su Play.

### 18. Piccole cose del sito

- `maximum-scale=1, user-scalable=no` nel viewport: non si può ingrandire con le dita (accessibilità).
- `/robots.txt` e qualsiasi indirizzo inesistente rispondono 200 con l'app.
- Le sezioni vecchie di `docs/CURRENT_STATE.md` dicono «nessun backup di produzione»: oggi c'è un backup al giorno (l'ultimo del 5/11 alle 5:56), senza ripristino a un istante preciso.

---

## Numeri della produzione (5/11, solo conteggi)

- **Account:** 28, di cui 19 con l'email confermata. Dal 25/10 ne sono nati 15 (9 email, 6 Google): 14 confermati, 13 con il profilo, 12 in una coppia completa.
- **Coppie:** 9, di cui 8 complete e 1 in attesa del partner. Attive negli ultimi 7 giorni: 6.
- **Ultimi 7 giorni:** 30 Ti penso, 37 risposte alla domanda del giorno, 14 partite.
- **Contenuti:** 26 Ricordi, 96 file per 80 MB, database da 57 MB.
- **Notifiche:** 14 telefoni Android e 5 browser registrati.
- **Segnalazioni:** 0. **Plus:** 0.

## Cosa è a posto

- Advisor di sicurezza senza errori. Nessuna funzione eseguibile da chi non ha un account. Le 57 funzioni con privilegi hanno lo `search_path` fissato e ricavano la coppia da `auth.uid()`, con i lock giusti.
- RLS su tutte le 70 tabelle, con regole per coppia; l'unica vista usa `security_invoker`. Storage privato con tipi e dimensioni limitati.
- Le 59 chiamate RPC dell'app esistono in produzione con i permessi giusti.
- Notifiche controllate sul server evento per evento: Ti penso al massimo una ogni 2 minuti, lavagna una ogni 2 ore, segnalazioni 5 al giorno.
- 10 lavori programmati, tutte le esecuzioni degli ultimi 3 giorni riuscite. Backup giornalieri.
- Il link «Apri il brano» di Lasciato per te accetta solo indirizzi `https://`, perché lo impone un CHECK nel database.
- Android: niente backup dei dati dell'app, niente traffico in chiaro.

## Ordine consigliato

1. **Su staging, poi una patch in produzione col tuo via:** punti 1, 3, 4, 9, 11 (app) e 2, 12, 13, 16 (server).
2. **Impostazioni e decisioni tue:** password rubate (5), reindirizzamento (8), widget Scriptable (7), registro delle migrazioni (6).
3. **Controllo:** i test nel browser nel gate (10).

## Come l'ho controllato

- **Supabase di produzione, sola lettura**, con la CLI collegata al tuo account: advisor di sicurezza e prestazioni, catalogo (funzioni, permessi, regole RLS, vincoli, trigger, pubblicazione Realtime), cron e risposte di `pg_net`, funzioni pubblicate, backup, conteggi aggregati senza dati personali. Per le query la CLI crea da sola un ruolo di accesso temporaneo («Initialising login role…»): è il suo funzionamento normale, nessun dato è stato scritto.
- **Sito di produzione:** intestazioni con `curl`, tempi e caricamento con Playwright.
- **Codice** di `main`, `npm test` e i test nel browser.
- **Documentazione** Supabase via Context7 per Realtime e `signOut`.
