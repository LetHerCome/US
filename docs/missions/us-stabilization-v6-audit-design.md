# US V6 — Daily audit e progetto della partecipazione settimanale

Data: 2026-10-09. Stato: Missione 1 implementata, candidato per review;
Missione 2 progettata, nessuna implementazione SQL.
Branch: `codex/us-v6-daily-reveal`. Base remota verificata: `1251e49` (PR #175).
Checkout autorizzato: worktree Codex del repository `LetHerCome/US`; i metadati
Git condivisi sono in `F:/AI/US`. Il checkout principale non è stato modificato.

## Missione 1: evidenze sulla base corrente

- La PR #175 ha già semplificato `renderTodayReveal`: due risposte senza
  reazioni; editor, CTA e banner nascosti. Non duplicare questa implementazione.
- `hydrateToday` riabilita editor e CTA prima di attendere `get_daily_state`.
  Su errore restituito dalla RPC esce senza una UI di errore/retry. Su eccezione
  di rete l'await non è protetto. Questo può lasciare controlli attivi insieme
  al reveal precedente, oppure un editor senza stato verificato.
- Anche una riapertura di un reveal già caricato riabilita provvisoriamente
  l'editor durante la lettura. Conservare la UI autorizzata finché la nuova
  lettura non è valida; a cambio domanda nascondere il vecchio scambio subito.
- `renderTodayQuestionUnavailable` su main ripristina già `locked.hidden`:
  nessuna correzione ulteriore necessaria su quel punto. Il difetto è il ramo
  errore di `get_daily_state` che non lo richiama.
- `openToday` non azzera lo scroll del pannello. Dopo una risposta lunga la
  riapertura può partire sotto la domanda. `closeToday` ripristina overflow a
  stringa vuota invece del valore precedente; verificare gli overlay annidati.
- CSS Daily distribuito in `styles.css`, `fix4.css`, `ui-foundation.css`,
  `polish4.css` e `modal-center.css`. La shell resta `is-bottom`, benché sia
  centrata dal CSS finale. `fix4.css` forza padding-bottom con safe area già
  applicata anche all'overlay. Overlay e pannello possono scorrere entrambi.
  Sono conflitti/ridondanze verificati nel codice; la causalità del difetto
  Android deve ancora essere confermata con confronto visivo sul browser.
- `stories.js` avvolge `hydrateToday` per un timer legacy che controlla
  `today.active`, mentre il popup corrente usa `today.open`. Rimuovere wrapper,
  timer e hint dedicato; non modificare Stories o record persistiti.
- Runtime delle riflessioni e reazioni ancora presenti, benché non esposti dal
  reveal V5. Prima di eliminarli, verificare tutti i riferimenti e aggiornare
  i test client; mantenere tabelle, RPC, receipt e storico server.

### Correzione realizzata, circoscritta

1. Un solo stato UI Daily coerente applicato dopo la risposta server: loading,
   errore/retry, non risposto, attesa e reveal. Nessun editor attivo senza stato
   valido. Conservare le bozze e lo scambio precedente della stessa domanda
   su errore transitorio, con un avviso visibile e retry.
2. Mantenere `get_or_create_daily_question`, `get_daily_state`, receipt e
   `UsDailyKeepsake`. Non introdurre un nuovo dominio Daily o nuove scritture.
3. Usare shell floating e un solo pannello scrollabile entro il viewport e le
   safe area, senza doppio padding. Ripristinare la domanda in cima all'apertura;
   mantenere chiusura, Back, focus e cancellazione dell'exit nel sistema esistente.
4. Eliminare solo UI/helper effettivamente senza consumatori. Nessun DELETE SQL.
5. Test comportamentali degli stati, risposta lenta, retry, riapertura, bozze,
   reveal già visto e Conserva. Verifica 320×568, 390×844, 844×390, tastiera,
   reduced motion, risposte lunghe e stringhe senza spazi, safe area simulate.

File: `app.js`, `index.html`, CSS Daily nei file esistenti, `stories.js`,
`stories.css`, test Daily e job CI. Nessun file SW, cache ID, build marker,
manifest o database modificato. Nessun asset approvato modificato.

La review indipendente ha riprodotto anche due corse corrette con test RED →
GREEN: refresh durante l'invio riabilitava il bottone (ora lock di operazione
indipendente dal rendering); Conserva accettava una lettura/scrittura tardiva
di un'altra coppia sulla stessa domanda globale (ora identità + generazione
nel runtime esistente). Il vecchio salvataggio di A non cambia la UI del nuovo
salvataggio dopo un ciclo A → B → A.

## Missione 2: contratto della settimana

Una riga per ciascuna data da lunedì a domenica, calendario **Europe/Rome**.
La spunta è esclusivamente la congiunzione di:

- entrambi i membri correnti hanno risposto alla stessa Daily di quella data
  durante quella giornata;
- ciascun membro ha completato almeno una sessione di gioco durante quella
  giornata, usando una completion server persistita, non avvio o reveal visto.

Il requisito non impone che le due sessioni siano identiche. La proposta conta
la completion personale in `game_session_sides.completed_at`, collegata a una
sessione della coppia. Se A finisce lunedì e B martedì, quella sola sessione
non rende verde né lunedì né martedì. Una completion personale valida può
essere in attesa del partner: la distinzione dal completamento condiviso deve
restare esplicita. Se si vuole contare solo sessioni già concluse da entrambi,
aggiungere anche `game_sessions.completed_at IS NOT NULL`: è una scelta di
prodotto da confermare prima dell'implementazione della Missione 2.

### Autorità esistenti verificate

- `profiles.id = auth.uid()` e `profiles.couple_id`: appartenenza attiva.
- `daily_questions.question_date`: data della domanda globale; le risposte
  sono isolate da `daily_answers.couple_id` e `user_id`.
- `complete_game_session_side`: autorizza la coppia, verifica tutte le risposte,
  blocca la sessione e persiste `completed_at = now()` una sola volta.
- `game_sessions.completed_at`: conclusione condivisa, impostata dalla seconda
  completion. Nessuna equivalenza con `started_at`.
- Grant produzione verificati in sola lettura: `authenticated` non ha
  INSERT/UPDATE su `game_sessions` o `game_session_sides`; quindi il timestamp
  personale viene realmente dal percorso RPC server, diversamente dal Daily.
- `progression_events`: XP effettivamente attribuiti e chiave idempotente per
  sorgente/coppia. Non ricostruire XP moltiplicando completamenti per costanti.
- `get_progression_v1`: autorità della Sintonia totale, da riusare.

### Vincolo di affidabilità Daily

Lettura metadata produzione, senza record personali: `authenticated` ha
INSERT/UPDATE su `daily_answers.created_at` e `updated_at`; l'unico trigger
non interno è quello della progressione, senza normalizzazione dei timestamp.
Il client usa un upsert diretto. Una semplice nuova RPC che legge questi
timestamp **non soddisfa la richiesta di evidenza temporale server**.

Proposta concreta per la Missione 2: una colonna nullable
`daily_answers.server_answered_at timestamptz`, nello stesso dominio e nella
stessa riga già autorizzata. Un trigger BEFORE INSERT/UPDATE assegna
`transaction_timestamp()` all'INSERT autorizzato, ignorando ogni valore client,
e conserva esattamente `OLD.server_answered_at` all'UPDATE. Questo dato attesta
la prima risposta, non l'ultima modifica. Le identità di una risposta esistente
(`user_id`, `couple_id`, `question_id`) diventano immutabili per le scritture
client, per impedire di trasferire una ricevuta a un'altra persona/data/coppia.
Il trigger verifica actor, appartenenza e domanda; RLS resta obbligatoria.
Revocare anche i privilegi diretti superflui individuati dal preflight, senza
modificare autonomamente l'intero modello dei grant.

La colonna non ha un DEFAULT per le righe già esistenti e **non viene
backfillata** con `created_at`, `updated_at`, `now()` o eventi XP. Questi non
provano quando ciascun partner abbia risposto. Le righe legacy mantengono
valori e dati originali e ricevuta NULL: stato `unverifiable`, nessuna spunta
dedotta. Un UPDATE legacy conserva NULL, anche se modifica la risposta.
Così una modifica successiva non fabbrica una prima risposta giornaliera.
Il payload deve distinguere giorno incompleto da giorno non verificabile.

La RPC considera una ricevuta solo se la sua data Rome è uguale a
`daily_questions.question_date` e alla data della riga settimanale. Domande
vecchie risposte oggi, timestamp client futuri e modifiche a una risposta
precedente non qualificano oggi. INSERT/upsert concorrenti preservano un solo
istante iniziale attraverso l'unicità esistente `(question_id,user_id)`.
Verificare esplicitamente che il trigger INSERT + ramo UPDATE dell'upsert non
riscrivano la ricevuta. Nessun trigger nuovo richiama `progression_award`;
quello XP esistente e la sua chiave idempotente restano l'unica autorità XP.

Per DELETE/re-INSERT e operazioni privilegiate di manutenzione: il percorso
client non deve poter eliminare/trasferire una risposta per ricrearne la
provenienza. Verificare i grant/policy reali e ritirare il DELETE client se
effettivamente concesso; eventuali strumenti amministrativi restano separati.
Nessun dato esistente è cancellato. Se una futura operazione amministrativa
deve trasferire una risposta, la conservazione della ricevuta richiede un
percorso esplicito e testato, non un'eccezione basata su user_metadata.

Questa protezione e la RPC saranno una migrazione **futura**, creata tramite
CLI e testata localmente. In questa PR non viene implementata né applicata.
Il frontend corrente può continuare a inviare il vecchio `updated_at`: la
nuova evidenza non lo legge. Non cambiare oggi l'upsert in un dominio parallelo.

### RPC di lettura proposta

`get_couple_week_participation_v1()` senza parametro couple_id e senza data
fornita dal dispositivo; restituisce solo la settimana corrente del server.

Payload: `week_start`, `week_end`, `today`, `timezone`, `days` (sette date con
`daily_complete`, `game_complete`, `complete`, stato della verificabilità),
`completed_days`, `weekly_xp_awarded`. Nessun testo sigillato, ID utente o
contenuto delle risposte. Nessun XP nuovo e nessuna mutation.

Preferire un helper privato e una facciata pubblica autenticata. Se serve
SECURITY DEFINER per le due risposte protette da RLS, motivarlo, usare
`search_path = ''`, nomi qualificati, `auth.uid()` e appartenenza corrente,
revocare EXECUTE a PUBLIC/anon, grant ristretto ad authenticated. Il ruolo
authenticated da solo non autorizza una coppia. Niente user_metadata.

La query unisce sette date generate, ricevute Daily server e completion personali con
filtri obbligatori sulla stessa coppia. Join dei due membri attuali, nessun
count generico di due righe. Date e limiti UTC derivati dalle mezzanotti Rome,
non da blocchi di 24 ore: coprire i cambi d'ora. Gli XP settimanali sono la somma
dei valori realmente registrati secondo `progression_events.action_day`;
il totale della Sintonia continua a provenire da `get_progression_v1`.

Frontend: sostituire solo `dayRail()`; usare le sette date server e il conteggio
server. Loading e errore non sono zero completamenti. Niente verde ottimistico,
localStorage, streak, backfill o bonus. Refresh nel load di Gioca, al ritorno
in primo piano e dopo le mutation Daily/Game esistenti; nessun nuovo Realtime.

### Rinnovo settimanale e ripetizioni

`private.game_v2_week_start` calcola lunedì in Rome; `week_bounds` usa le
mezzanotti locali; `week_usage` conta sessioni **iniziate** e limiti 1 Per voi +
2 libere. È il budget, non la partecipazione. Il catalogo non è un elenco di
tre titoli fissi da rigenerare: la selezione server usa cooldown e rotazione.
Conservare queste regole e le sessioni aperte della settimana precedente.
Testare domenica/lunedì, entrambi i cambi DST, ripresa senza nuovo consumo,
famiglia già giocata e fallback quando il catalogo disponibile è limitato.

Con tre nuove sessioni settimanali non promettere sette giornate completabili
con nuove partite. Non alzare il budget a cinque in questa missione.

### Sicurezza e regressioni richieste

PGlite con SQL reale: coppia A/B, anon, senza profilo, senza coppia, una sola
persona, cambio appartenenza, sessione altrui, role spoofing e timestamp
retrodatato. Prove di lettura senza effetti collaterali/XP/unlock nuovi.
Completion a cavallo di mezzanotte, giornata domanda diversa dalla risposta,
sessione iniziata ieri ma finita oggi, retry idempotente e due completamenti
concorrenti. Tutte le combinazioni Daily/Game incomplete e complete.

Migrazione creata via Supabase CLI; nessuna applicazione produzione. Missione
2 in branch/PR separata dopo Missione 1; questo documento non la implementa.

## Verifiche eseguite e limiti

- Fetch remoto: `main = 1251e49`; PR #170 OPEN, tocca `app.js`, `index.html`,
  `styles.css`, `modal-center.css` oltre a widget/motion. Ricontrollare diff e
  conflitti prima della PR. Non incorporare il lavoro widget.
- Test focused finali: 80 test, 72 pass, 8 skipped (harness di concorrenza
  richiede binari PostgreSQL/Linux, utente postgres e root non presenti qui;
  le prove PGlite pertinenti sono eseguite).
- `npm test`: 1769 test, 1625 pass, 40 fail, 104 skipped. Nessun nuovo
  fallimento contro main: base isolata 1757 test, 1614 pass, 42 fail,
  101 skipped. Il contratto legacy del pulsante Daily è aggiornato; il test
  P1 recovery non ha riprodotto il timeout ambientale della base. Non è una
  dichiarazione di suite verde. Elenco completo in [QA](us-stabilization-v6/QA.md).
- Playwright 1.62.1 del runtime Codex con Chrome locale: 6 test Daily pass,
  0 skipped; 320×568, 390×844, 844×390, safe area simulate, testo lungo,
  stringhe senza spazi, scroll/riapertura, Back, tastiera simulata e reduced
  motion. Coppia di fixture Giulia/Marco; Conserva ancora disponibile.
  Schermate prima/dopo salvate. Nessun dato reale nel browser.
- Due test browser generali di navigazione falliscono sulle vecchie tile Noi
  nascoste: stesso timeout riprodotto nella copia isolata di main. Non modificare
  la navigazione generale in questa Missione Daily.
- Cloudflare Pages e Capacitor web build pass; `cap sync android` pass e nessun
  diff sui sorgenti Android. Gradle test/build debug non eseguiti fino in fondo:
  errore ambientale `Unable to establish loopback connection`, riprodotto anche
  con IPv4, con causa `UnixDomainSockets: Invalid argument: connect`.
  Nessun APK prodotto/installato; build iOS non eseguibile su Windows.
- Gate PWA: 38 test static/runtime/logout pass e 5 browser startup pass,
  inclusi update simulato, offline, fallimento precache/vecchia shell e cache
  media conservata. Sintassi JS e diff-check pass. Marker V5 ancora coerenti:
  nessun rilascio/cache bump è parte della Missione 1.
- Check su Android fisico/iOS e tastiera nativa restano da fare, elencati in QA.
  Candidato per review, **NOT READY per release** finché i gate aperti non sono
  risolti. Non sostituire le prove browser con una dichiarazione device PASS.
- Metadata Supabase letti: RPC e ledger. La migrazione dei reward Oggi
  `20261009100419` non compare nel ledger applicato (Missione 3 futura).
- Nessuna scrittura su Supabase, nessun merge/deploy/APK/publish. PR dedicata
  prevista in draft dopo i controlli. La base resta `1251e49`, ricontrollata
  prima della PR; SHA candidato e link riportati nel risultato della missione.

Documentazione consultata: [Database functions](https://supabase.com/docs/guides/database/functions).
Il fetch web di `https://supabase.com/changelog.md` è fallito per content-type;
ricontrollarlo prima di qualsiasi implementazione Supabase.
