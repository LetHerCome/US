# US vNext — M2 Oggi

**Status:** specification / not implemented  
**Repository:** `F:\AI\US`  
**Baseline di analisi:** `main` a `18a2ec1a75d70a43825d6ee3bc1a8ff42414889f`

Questo documento è l'authority persistente per M2 — Oggi. Deve essere letto insieme a `AGENTS.md` e a `docs/milestones/us-vnext-foundation-01.md`. M2 definisce il contratto della superficie Oggi; non autorizza ancora l'implementazione.

---

## 1. Product objective

Trasformare Oggi dalla Home attuale, composta principalmente da feature accessibili, in una superficie che risponde automaticamente alla domanda:

> **Che cosa sta succedendo adesso tra noi due?**

L'utente non dovrebbe dover aprire US e scegliere tra molte feature per capire cosa merita attenzione. Oggi deve far emergere poche informazioni reali e rilevanti per la coppia, mantenendo l'hero/Home come contesto principale quando non c'è nulla di prioritario.

Il modello di prodotto resta quello di Foundation 01:

`leave → receive → respond → resolve/preserve`

M2 non introduce un nuovo modello universale di interazioni. Compone segnali già esistenti in una superficie gerarchica e piccola.

---

## 2. Current-state findings

### 2.1 Home/Oggi attuale

La pagina interna `home` è già la superficie Oggi della navigation Foundation 01. In `index.html` contiene:

- hero fotografico con due layer per la rotazione dell'immagine;
- stato vuoto intenzionale (`homeEmptyState`);
- widget distanza/contesto;
- opt-in Push;
- accesso alle Stories tramite UI Stories inserita nel top bar;
- `Ti penso` globale;
- accesso alla Daily Question tramite `todayOrb` e relativo overlay;
- anchor vuoto `#usTodayPriorityRegion`, già `hidden` e con `aria-live="polite"`.

In `app.js` la Home conserva:

- caricamento e rotazione oraria delle foto da `moments`/`moment_photos` o da `couples.home_photo_path`;
- cache locale della foto Home;
- distinzione tra vuoto reale ed errore di caricamento;
- distance/context e push UI;
- sincronizzazione realtime per Daily Question, Moments, posizione e altri segnali esistenti.

**Implicazione M2:** la priority region deve essere inserita nella Home senza sostituire il hero, senza cambiare il comportamento di caricamento/fallback e senza diventare una dashboard permanente.

### 2.2 Daily Question

La Daily Question è un sistema già funzionante:

- domanda corrente da `daily_questions`, filtrata per `question_date`;
- stato reciproco da RPC `get_daily_state`;
- risposta personale e risposta partner già distinte;
- stato `partner_has_answer` quando il partner ha risposto e l'utente no;
- stato `my_answer` quando l'utente ha risposto;
- stato `both_answered` quando il reveal è sbloccato;
- salvataggio in `daily_answers` con il flusso esistente;
- aggiornamento realtime su `daily_answers`.

La UI esistente presenta già stati utili a Oggi:

- partner ha risposto → l'utente deve rispondere per sbloccare;
- io ho risposto → attesa del partner;
- entrambi hanno risposto → reveal disponibile.

**Implicazione M2:** Daily Question è la fonte più affidabile per `Waiting for me` e, quando applicabile, per `Received / ready`. Deve essere riusata tramite il suo RPC e il suo overlay, non duplicata in un nuovo stato locale o backend.

### 2.3 Events

Events è un sistema già presente in `events.js` e usa dati reali:

- `shared_events` per gli eventi della coppia;
- `shared_event_completions` per le occorrenze completate;
- `couples.started_on` e `relationship_milestones` per il contesto della relazione;
- calcolo di prossime occorrenze, ricorrenze e giorni mancanti;
- `openEvents()` come entry point e overlay esistente.

Foundation 01 ha spostato l'accesso principale agli Events dentro Noi e ha rimosso il vecchio calendar entry globale.

**Implicazione M2:** il prossimo evento reale può alimentare `Couple context`, ma la card deve aprire `openEvents()`/il sistema Events esistente. Non va creato un calendario parallelo né duplicata la logica di date, ricorrenze o completamento.

### 2.4 Quest/Bond

Il sistema Bond esistente conserva:

- livello, XP e progressione;
- quest e badge;
- `hydrateBond()`/funzioni di riepilogo;
- eventi e attività che possono contribuire al Bond.

Tuttavia, nello stato corrente non esiste un contratto unico già pronto che identifichi in modo affidabile una quest “rilevante oggi” per il singolo partner. Il mero conteggio XP o la presenza di una quest non è sufficiente per renderla prioritaria.

**Implicazione M2:** Bond/Quest è una fonte eleggibile solo quando il dato esistente espone già una scadenza, uno stato personale o un'azione chiaramente dovuta. M2 non deve inventare una semantica di urgenza per quest né costruire il Pending Action Engine.

### 2.5 Stories/Moments

Stories è un sistema reale e già integrato:

- profili della coppia da `profiles`;
- Stories/media e visualizzazione personale/partner;
- viewer, retry, delete e upload esistenti;
- aggiornamento realtime su `moments` e `moment_photos`;
- avatar partner e Stories personali accessibili dall'header/avatar.

Moments mantiene album, foto e data model esistenti.

Nello stato corrente, la presenza di una nuova Story o di un nuovo Moment non costituisce ancora un contratto generale di `received`, `ready` o “da fare” per Oggi. Può comunque essere utilizzata se il sistema esistente espone già un segnale non ambiguo, per esempio contenuto del partner non ancora visto, senza introdurre tracking parallelo.

**Implicazione M2:** Stories/Moments è una fonte condizionata. Non va introdotta una nuova tabella di viste o uno stato universale non richiesto per ottenere una card.

### 2.6 Navigation e action authority

La navigation Foundation 01 usa:

- `go()` come autorità per le pagine;
- `pages = ['home','bond','moments','quiz','settings']`;
- `swipePages = ['home','bond','moments','quiz']`;
- Settings fuori da bottom navigation e swipe primario;
- layer/overlay esistenti con i propri opener e close behavior.

M2 deve usare gli entry point esistenti. Una priority card è un punto di accesso a un sistema, non una nuova pagina o un nuovo router.

---

## 3. Oggi UX contract

### 3.1 Struttura

Oggi è composta da due livelli:

1. **Priority region**: area piccola e gerarchica, sopra o in posizione definita rispetto all'hero senza oscurarlo inutilmente;
2. **Home context**: hero fotografico e componenti Home già esistenti.

La priority region usa l'anchor Foundation 01:

```html
id="usTodayPriorityRegion"
```

Quando non ci sono priorità reali, deve restare vuota e nascosta. Non deve mostrare un titolo vuoto, una card placeholder, uno skeleton permanente o una call to action generica.

### 3.2 Limiti

- Massimo **tre** elementi prioritari visibili.
- L'ordine visivo deve rispettare il priority model v1.
- Non è obbligatorio mostrare tre elementi.
- Una card deve essere mostrata solo se la fonte è reale, disponibile e sufficientemente affidabile.
- La priority region non deve diventare una lista di tutte le feature disponibili.
- Nessuna card deve essere generata soltanto per aumentare aperture, streak, XP o engagement.

### 3.3 Forma della card

Ogni elemento prioritario deve avere:

- messaggio breve e comprensibile senza conoscere l'architettura interna;
- indicazione del contesto reale, quando utile;
- una singola azione primaria verso il sistema esistente;
- stato di caricamento/error handling coerente con la fonte;
- accessibilità semantica e target touch conformi alle primitive esistenti.

La copy deve descrivere ciò che è realmente successo, non promettere un contenuto non disponibile. Non copiare letteralmente gli esempi di prodotto se i dati correnti richiedono una formulazione più precisa.

---

## 4. Priority ordering

Il priority model v1 è:

### P1 — Received / ready

Prima vengono le cose già arrivate dal partner o già pronte per il prossimo passo:

- contenuto ricevuto dal partner, se il sistema esistente ne identifica in modo affidabile la novità/non lettura;
- reveal pronto, come Daily Question con `both_answered`;
- stato reciproco già pronto per il prossimo passo, solo quando rappresentato da uno stato esistente non ambiguo.

Questa categoria non autorizza un Reveal Engine né una nuova inbox.

### P2 — Waiting for me

Poi vengono le cose che richiedono una risposta o azione dell'utente corrente:

- Daily Question con `partner_has_answer` e assenza di `my_answer`;
- eventuale quest/azione esistente con stato personale esplicito di attesa, se già disponibile senza nuovo modello;
- eventuale altra fonte che dichiari realmente un'azione dovuta al current user.

Non è sufficiente che una feature sia incompleta o disponibile: deve attendere proprio l'utente corrente.

### P3 — Couple context

Infine viene il contesto utile per la coppia oggi:

- prossimo Event reale, preferibilmente con data/contesto derivati da Events;
- quest rilevante solo se il sistema esistente ne fornisce una rilevanza reale;
- Moment/Story o altra informazione già disponibile che aggiunga contesto concreto alla giornata.

P3 è subordinato a P1 e P2. Se non c'è un contesto abbastanza utile, non va mostrato nulla.

### Regole di ordinamento aggiuntive

- Una sola rappresentazione per lo stesso fatto.
- Massimo un elemento per categoria e massimo tre elementi complessivi.
- Una priorità P1 non deve essere duplicata come P2 o P3.
- Prima si rispetta l'ordine delle categorie `Received / ready` → `Waiting for me` → `Couple context`; solo dopo si applicano urgenza temporale e recency.
- A parità di categoria e priorità, usare prima il dato temporalmente più urgente e poi quello più recente; la regola deve essere deterministica e testata.
- L'ordine non deve cambiare in modo casuale tra render consecutivi.
- Il calcolo deve tollerare dati mancanti, errori di una singola fonte e assenza di rete senza trasformare un errore in una priorità falsa.

---

## 5. Source eligibility

### Fonti eleggibili per M2 v1

1. **Daily Question** — fonte primaria per P1/P2, usando `get_daily_state`, `daily_questions` e il flusso `openToday()`/`hydrateToday()` esistenti.
2. **Events** — fonte primaria per P3, usando dati e calcoli già presenti in `events.js` e aprendo `openEvents()`.
3. **Stories/Moments** — non usare in M2 se richiede nuovo read/unread tracking; può essere considerata solo se il segnale affidabile è già disponibile senza nuova persistence.
4. **Quest/Bond** — non usare come fonte M2 salvo uno stato già esistente e inequivocabilmente rilevante; non introdurre nuove euristiche o persistence.

### Fonti non obbligatorie

M2 non deve usare tutte le fonti. È preferibile una Oggi con una sola priorità affidabile a una Oggi con tre card speculative.

### Criterio di affidabilità

Una fonte è eleggibile solo se:

- il dato deriva da storage/RPC/sincronizzazione già esistenti;
- il significato per l'utente corrente è determinabile senza inferenze arbitrarie;
- l'azione conduce a un sistema già funzionante;
- il fallimento o l'assenza del dato può degradare a “nessuna priorità” senza rompere Home;
- non richiede una nuova tabella universale, un nuovo lifecycle parallelo o una duplicazione del dominio.

---

## 6. Empty-state behavior

Quando non esistono priorità reali:

- `usTodayPriorityRegion` resta `hidden`;
- non viene inserito contenuto fake;
- non viene mostrato testo placeholder;
- l'hero/Home corrente resta il contenuto principale;
- distanza/context, Push, Stories, `Ti penso` e Daily Question restano accessibili secondo il comportamento attuale;
- un errore di una fonte non deve essere presentato come stato vuoto se il sistema esistente distingue già errore e vuoto;
- un errore della priority composition non deve bloccare o sostituire il caricamento Home.

La tranquillità è uno stato valido del prodotto, non un errore da riempire.

---

## 7. Navigation and action behavior

### Action routing

Ogni card deve inviare l'utente all'authority esistente:

| Fonte | Azione prevista |
|---|---|
| Daily Question | aprire l'overlay esistente tramite `openToday()` |
| Events | aprire Events tramite `openEvents()` |
| Quest/Bond | usare l'entry/azione Bond già esistente, senza nuova pagina |
| Stories/Moments | usare il viewer/album esistente e il relativo entry point |

Non introdurre route come `today-priority`, `pending`, `reveal` o equivalenti.

### Navigation invariants

- Oggi continua a essere la pagina interna `home`.
- Le card non modificano bottom navigation, swipe order o Settings.
- Gli overlay devono continuare a chiudersi prima della navigazione quando previsto dalla navigation authority.
- Native back deve continuare a usare i test e le authority già presenti.
- L'apertura di una card non deve creare una history entry artificiale se l'azione apre un overlay esistente.
- Close/back deve riportare a Oggi senza perdere l'hero o lo stato Home già caricato, salvo il comportamento già previsto dal sistema target.

---

## 8. Architectural constraints

- Preservare vanilla HTML/CSS/JavaScript, PWA, Supabase e architettura native esistente.
- Riutilizzare `ui-foundation.css`/`ui-foundation.js` per primitive UI, focus, inert, motion e touch target.
- Riutilizzare `go()`, gli overlay esistenti e i loro lifecycle.
- Non introdurre un router, una navigation state machine o un secondo sistema di layer.
- Non creare un `Pending Action Engine` generale.
- Non introdurre un database universale degli interaction states.
- Evitare nuova persistence; preferire derivazione in memoria da dati già caricati o da query/RPC esistenti.
- Non duplicare stato di Daily Question, Events, Quest, Stories o Moments.
- Non cambiare schema, migration, RPC, RLS, Auth, Push, private storage, Service Worker o `us-private-media-v1` salvo una decisione futura esplicita separata.
- Preservare asset approvati, Phosphor/icon authority e identità visiva.
- Non fare un redesign complessivo Midnight Correspondence né trasformare Oggi in una dashboard densa.
- Mantenere mobile-first, safe areas, reduced motion, loading/error states e comportamento offline esistente.

### Strategia dati raccomandata

La prima implementazione dovrebbe preferire:

1. leggere/derivare lo stato Daily Question già disponibile;
2. riusare il prossimo Event già calcolato dal dominio Events;
3. aggiungere fonti Stories/Moments o Quest solo se una lettura esistente dimostra un segnale affidabile;
4. comporre al massimo tre view model effimeri per il render, senza salvarli come nuovo stato di dominio.

Questa è una direzione architetturale, non un'autorizzazione a implementare prima della milestone approvata.

---

## 9. Scope

M2 comprende:

- definizione e implementazione futura della priority region Oggi v1;
- composizione di un massimo di tre priorità reali;
- ordinamento P1/P2/P3;
- integrazione minima con Daily Question;
- integrazione minima con Events;
- eventuale integrazione condizionata con Stories/Moments e Quest/Bond;
- action routing verso sistemi esistenti;
- empty/error behavior della priority region;
- test di composizione, ordering, source eligibility, rendering vuoto e navigation handoff;
- protezione della Home attuale e dei suoi invarianti.

M2 non comprende redesign della Home, migrazione dei sistemi esistenti o unificazione dei loro modelli dati.

---

## 10. Explicitly excluded future work

Restano milestone future:

- Pending Action Engine generale;
- nuovo database universale degli interaction states;
- Daily Question v2 completa;
- Reveal Engine;
- `Lasciato per te` come sistema dedicato;
- Event → Moment;
- XP removal;
- narrative progression;
- nuovo Content Engine;
- Shared Play;
- redesign complessivo Midnight Correspondence;
- nuova persistence per notifiche/non-letti se non indispensabile e approvata separatamente;
- nuove feature o card generate senza una fonte reale;
- nuovi native screens, widget o lavoro iOS;
- modifiche a Supabase schema/RPC/RLS, Auth, Push, Service Worker o private media non necessarie a Oggi v1.

---

## 11. Regression requirements

M2 deve proteggere almeno:

- caricamento Home, hero fotografico, rotazione e intentional empty state;
- distinzione Home loading/error/empty;
- distance/context widget;
- Stories personali e Stories partner;
- Moments e relativo data model;
- Daily Question, risposta reciproca, reveal e realtime update;
- Events, ricorrenze, completamenti, XP e `openEvents()`;
- Bond, quest, XP, livelli e badge;
- `Ti penso`;
- Push opt-in e online/offline feedback;
- navigation `go()`, history, layers, directional transitions e native back;
- bottom navigation a quattro destinazioni e swipe order Foundation 01;
- Settings header entry, Settings fuori da bottom navigation/swipe e cambio foto esistente;
- safe areas, reduced motion e touch target;
- Android shell/widget behavior;
- Service Worker/cache behavior e private media.

Un errore di una fonte secondaria non deve rendere inutilizzabile Oggi. Se la composizione non è disponibile, il sistema deve preservare l'hero e il comportamento Home.

---

## 12. Test and validation expectations

Prima dell'implementazione:

- verificare che la baseline sia pulita e il lavoro avvenga su branch dedicato;
- eseguire i test baseline già richiesti da Foundation 01;
- non modificare le aspettative dei test esistenti salvo cambiamenti di contratto espliciti.

Durante l'implementazione futura, i test Foundation/M2 devono coprire almeno:

1. massimo tre elementi;
2. ordine P1 → P2 → P3;
3. determinismo a parità di dati;
4. nessuna card quando le fonti non producono priorità;
5. Daily Question `partner_has_answer` → azione `openToday()`;
6. Daily Question `both_answered` → reveal/azione reale esistente;
7. prossimo Event reale → `openEvents()`;
8. fonte con errore isolato → Home preservata e nessuna priorità falsa;
9. Stories/Moments e Quest/Bond inclusi solo quando il segnale affidabile è presente;
10. `usTodayPriorityRegion` vuota, hidden e senza placeholder nello stato empty;
11. action routing senza nuovo router o nuova history artificiale;
12. regressioni della suite esistente.

Validation proportionate alla superficie modificata:

- focused M2 tests;
- `npm test` completo;
- `git diff --check`;
- syntax validation dei JS/MJS modificati;
- `npm run build:capacitor-web` se viene modificato il bundle web;
- `npx cap sync android` e Android build se vengono toccate superfici native o il processo di staging;
- verifiche manuali solo se realmente eseguite, con particolare attenzione a Home vuota, una priorità, tre priorità, apertura/chiusura delle action e native back.

---

## 13. Acceptance criteria

M2 è accettabile solo quando:

1. Oggi continua a usare `home` e preserva l'hero/Home attuale.
2. `usTodayPriorityRegion` viene usata come unica priority region M2.
3. La region mostra zero, uno, due o al massimo tre elementi.
4. Gli elementi sono ordinati P1 Received/ready, P2 Waiting for me, P3 Couple context.
5. Non vengono creati fake content, placeholder visibili o priorità artificiali.
6. Daily Question può produrre una priorità solo da dati reali del suo stato esistente.
7. Un Daily Question completata dal partner ma non dall'utente conduce all'azione Daily Question esistente.
8. Un reveal realmente pronto conduce all'overlay/azione Daily Question esistente.
9. Un prossimo Event reale può apparire come Couple context e conduce a `openEvents()`.
10. Stories/Moments e Quest/Bond sono usati solo se un segnale reale e non ambiguo è già disponibile; altrimenti non vengono forzati in M2.
11. Una fonte assente o in errore non rompe Home e non viene trasformata in una card falsa.
12. Se non esistono priorità reali, la region resta hidden e l'hero/Home rimane invariato.
13. Ogni card usa l'azione del sistema esistente e non introduce route, router, persistence o lifecycle paralleli.
14. Navigation, bottom navigation, swipe order, Settings secondario, Stories/avatar e native back restano invariati.
15. Non sono introdotti Pending Action Engine, Reveal Engine, database universale, Daily Question v2 o altra scope esclusa.
16. I test focused M2 e la suite di regressione prevista passano.
17. Le validation richieste dalla superficie modificata passano e ogni controllo manuale dichiarato è stato realmente eseguito.

---

## 14. Definition of Done

### Product

- Oggi risponde alla domanda “Che cosa sta succedendo adesso tra noi due?” senza diventare una dashboard piena.
- Le priorità sono poche, gerarchiche e basate su fatti reali.
- Received/ready precede Waiting for me, che precede Couple context.
- L'assenza di priorità è una superficie tranquilla con hero/Home preservata.
- Daily Question ed Events sono azionabili tramite i loro sistemi esistenti.
- Stories/Moments e Quest/Bond non sono usati artificialmente solo per riempire spazio.

### Engineering

- `usTodayPriorityRegion` è l'unico anchor M2.
- Nessun secondo router, Pending Action Engine, Reveal Engine o interaction-state database universale.
- Nessuna duplicazione di query, persistence o lifecycle dei domini esistenti senza motivazione approvata.
- Nessuna modifica non necessaria a schema, RPC, Auth, Push, Service Worker, private media o native shell.
- Home, navigation authority, Settings, Stories, Events e Daily Question rispettano i contratti Foundation 01.

### Validation

- Focused M2 contract tests passano.
- Test di regressione esistenti passano.
- `git diff --check` passa.
- I file JS/MJS modificati superano syntax validation.
- Build web/native eseguite quando pertinenti passano.
- Le verifiche manuali riportate corrispondono esclusivamente a controlli realmente effettuati.
- La milestone è implementata su branch dedicato e revisionata indipendentemente prima del merge.

---

## 15. Open product decisions

La seguente decisione è già fissata da questa authority:

- M2 può usare solo fonti reali e non è obbligato a usare tutte le fonti elencate.

Le seguenti decisioni sono definitive:

1. **Finestra Events:** un Event è rilevante se cade oggi o entro le prossime 48 ore.
2. **Stories/Moments:** non usare in M2 se richiedono nuovo read/unread tracking.
3. **Quest/Bond:** non usare salvo stato già esistente e inequivocabilmente rilevante; nessuna nuova euristica o persistence.
4. **Tie-break:** prima ordine delle categorie, poi urgenza temporale, poi recency; massimo un elemento per categoria e massimo tre totali.
5. **Placement:** `usTodayPriorityRegion` sta sopra l'hero principale quando contiene elementi; quando è vuota resta `hidden` e la Home deve restare visivamente invariata.

Non restano default alternativi da scegliere per questi punti.
