# US vNext — Roadmap

**Status:** ROADMAP AUTHORITY
**Product authority:** [`docs/product/us-vnext-vision.md`](../product/us-vnext-vision.md)
**Repository:** `F:\AI\US`

Questa roadmap deriva dalla product vision e dallo stato reale del repository, non da un ordine o da nomi milestone precedentemente discussi. Gli stati sono espliciti e deve esistere sempre una sola milestone `CURRENT`.

## 1. Stato sintetico

| Milestone | Stato | Valore principale |
|---|---|---|
| Foundation 01 — contratti e information architecture | **DONE** | Contratti vNext, navigation e confini preservati |
| M2 — Oggi | **DONE** | Priorità reali nella Home senza dashboard permanente |
| M3 — Daily Question: loop reciproco | **CURRENT** | Trasformare domanda/reveal in conseguenza e confronto |
| M4 — Ti penso reciproco | PLANNED | Da gesto singolo a scambio significativo |
| M5 — Lasciato per te | PLANNED | Contenuto personale lasciato al partner |
| M6 — Eventi prima/durante/dopo | PLANNED | Collegare anticipazione, esperienza e traccia |
| M7 — Gioca: esiti interpretativi | PLANNED | Da score generico a conversazione |
| M8 — Shared Decisions | PLANNED | Proposta, scelta e outcome reale |
| M9 — Ricordi: timeline narrativa | PLANNED | Una storia composta senza duplicare i domini |
| M10 — Noi: progressione narrativa | PLANNED | Ridurre la dipendenza da XP/livelli artificiali |

`M3` è l’unica `CURRENT`. Nessuna milestone successiva deve essere avviata prima della chiusura di M3 e dell’aggiornamento di questo documento.

## 2. Baseline completata

### Foundation 01 — contratti e information architecture

**Stato:** DONE
**Evidenza:** `docs/milestones/us-vnext-foundation-01.md`, codice e test Foundation 01.

- **Goal:** stabilire il linguaggio prodotto, la mappa Oggi/Noi/Ricordi/Gioca, i confini e la compatibilità con gli ID interni.
- **Perché serve:** senza una mappa stabile ogni evoluzione rischia di creare nuove route, duplicare sistemi o confondere le feature con il prodotto.
- **Dipendenze:** baseline US 1.0 e sistemi esistenti.
- **Principali sistemi interessati:** `index.html`, `navigation.js`, `app.js`, Events, Stories, Settings, Moments, Quiz, native-back.
- **Rischio:** MEDIO, soprattutto navigation/history/native-back e regressioni di entry point.
- **Classification:** DEEP.
- **Definition of Done:** contratti documentati; quattro destinazioni primarie con ID esistenti; Settings secondario; Events sotto Noi; Stories dall’avatar; Home preservata; test e build di regressione passati.
- **Fuori:** nuove feature relazionali, Daily Question v2, memory engine, narrative progression, Event → Moment, universal engine.

### M2 — Oggi

**Stato:** DONE
**Evidenza:** commit `1bd8f8c` integrato in `main` con fast-forward, `docs/milestones/us-vnext-m2-oggi.md`, test focused M2, suite completa, build web, review indipendente e manual QA passati.

- **Goal:** rendere Oggi una superficie che mostra poche priorità reali e gerarchiche.
- **Perché serve:** è il primo punto in cui US risponde automaticamente a “che cosa sta succedendo adesso tra noi?”.
- **Dipendenze:** Foundation 01, stato Daily Question esistente, Events esistente.
- **Principali sistemi interessati:** `app.js`, `events.js`, `index.html`, `styles.css`, `usTodayPriorityRegion`.
- **Rischio:** MEDIO, per composizione/error isolation e preservazione Home.
- **Classification:** STANDARD.
- **Definition of Done:** massimo tre priorità; ordine P1/P2/P3 deterministico; Daily Question ed Events azionabili tramite opener esistenti; empty hidden senza placeholder; errori isolati; suite, build e manual QA passati.
- **Fuori:** interaction engine generale, tracking unread universale, Stories/Moments come fonte artificiale, Quest urgency, redesign Home.

## 3. Milestone future derivate dalla vision

### M3 — Daily Question: loop reciproco

**Stato:** CURRENT

- **Goal:** trasformare il flusso esistente domanda → risposta separata → waiting → reveal in un primo loop completo che renda il confronto e l’eventuale outcome espliciti.
- **Perché serve:** Daily Question è la fonte più affidabile già esistente per testare il principio “azione di A → cambia US di B → risposta → outcome” senza introdurre subito una nuova feature o un motore universale.
- **Dipendenze:** Foundation 01; M2; RPC `get_daily_state`; `daily_questions`/`daily_answers`; overlay `openToday()`; realtime esistente.
- **Principali sistemi interessati:** `app.js`, overlay Daily Question in `index.html`, eventuali primitive UI; solo persistence esistente salvo lacuna dimostrata.
- **Rischio:** ALTO, perché tocca reciprocità, reveal, realtime, refresh/offline e può diventare un falso universal engine se generalizzata troppo presto.
- **Classification:** DEEP.
- **Definition of Done:** il partner può vedere chiaramente waiting/reveal con dati reali; il reveal conduce a un confronto o risposta successiva concreta; eventuale preservazione usa un’autorità esistente o una persistence minima motivata; stale/realtime/offline/back sono coperti; Oggi e navigation restano integri; rollout reversibile e testati i due partner.
- **Fuori:** universal interaction engine; nuova inbox; Reveal Engine; capitoli; nuove notifiche; decisioni generiche; rifacimento del modello Daily Question completo.

### M4 — Ti penso reciproco

**Stato:** PLANNED

- **Goal:** evolvere Ti penso in un gesto con tipo/significato e reazione o risposta del partner.
- **Perché serve:** estende il core loop a un’interazione breve e ad alta frequenza senza il peso di un contenuto complesso.
- **Dipendenze:** M3 per le regole minime di reciprocità e outcome; sistemi Ti penso/Web Push/widget esistenti.
- **Principali sistemi interessati:** `app.js`, `ti-penso-widget.js`, bridge/widget Android, Push e relative RPC già esistenti.
- **Rischio:** ALTO, per cross-platform, notifiche, deduplica e compatibilità con widget/native.
- **Classification:** DEEP.
- **Definition of Done:** un gesto arriva al partner; il partner può reagire o lasciare una risposta; retry/deduplica e offline sono coerenti; nessun reward è necessario per dare valore; web/widget/native restano compatibili; eventuale traccia è derivata o minimale.
- **Fuori:** social feed; reazioni illimitate; nuova piattaforma di notifiche; ranking/streak; universal message engine.

### M5 — Lasciato per te

**Stato:** PLANNED

- **Goal:** creare una vertical slice di contenuto lasciato specificamente al partner, iniziando dal tipo con il minor rischio tecnico dimostrato e mantenendo foto/testo come estensioni separate se necessario.
- **Perché serve:** rende concreto il passaggio da Story social a gesto personale diretto.
- **Dipendenze:** M3 per il lifecycle minimo; Stories/Moments e storage privato esistenti; M4 solo se la reazione viene condivisa.
- **Principali sistemi interessati:** `stories.js`, `moments-albums.js`, Supabase media/storage/RLS esistenti, viewer e realtime.
- **Rischio:** ALTO/CRITICO se include voce, apertura differita o nuove policy di accesso.
- **Classification:** DEEP.
- **Definition of Done:** il creator lascia un contenuto indirizzato al partner; il partner lo riceve tramite entry esistente o estesa; ownership/privacy/delete/retry sono verificati; nessun tracking unread parallelo se non indispensabile; un contenuto può essere candidato a memoria senza duplicare il file.
- **Fuori:** voice e apertura differita nella prima slice salvo decisione; inbox universale; social Stories generalizzate; nuovo media engine.

### M6 — Eventi prima/durante/dopo

**Stato:** PLANNED

- **Goal:** estendere Events dal semplice calendario a un ciclo con anticipazione, esperienza vissuta e chiusura/provenienza verso un Moment.
- **Perché serve:** collega il tempo futuro al ricordo condiviso, realizzando una delle conseguenze più concrete della vision.
- **Dipendenze:** Events attuale; Moments attuale; regole di outcome da M3; eventuale M9 per la destinazione narrativa.
- **Principali sistemi interessati:** `events.js`, `moments-albums.js`, tabelle/RPC esistenti; schema solo se la derivazione non è affidabile.
- **Rischio:** ALTO per correlazione Event/Moment, ricorrenze, completamenti, XP legacy e ownership dei dati.
- **Classification:** DEEP.
- **Definition of Done:** un evento futuro è utile prima; dopo l’evento la coppia può creare o collegare una traccia reale; la relazione tra fonti è esplicita e idempotente; ricorrenze e completamenti legacy non si rompono; rollback possibile.
- **Fuori:** calendario nuovo; event-sourcing universale; import massivo; automaticità obbligatoria; rimozione XP.

### M7 — Gioca: esiti interpretativi

**Stato:** PLANNED

- **Goal:** trasformare almeno un esito Quiz da percentuale/XP a interpretazione reciproca con domanda di risposta o conversazione.
- **Perché serve:** rende Gioca una sorgente di significato relazionale invece di una misurazione generica.
- **Dipendenze:** Quiz esistente; M3 lifecycle/reveal; eventuale M9 per preservazione.
- **Principali sistemi interessati:** `games.js`, quiz RPC/database, overlay e Oggi solo se l’esito è davvero prioritario.
- **Rischio:** MEDIO/ALTO per contenuto, simmetria delle risposte e compatibilità con scoring/XP.
- **Classification:** STANDARD.
- **Definition of Done:** un set produce un’interpretazione verificabile; entrambi possono reagire o conversare; scoring legacy resta compatibile durante la transizione; nessuna percentuale viene presentata come verità della coppia; test su risposte asimmetriche e incomplete.
- **Fuori:** grande content engine; migrazione di tutti i quiz; abolizione immediata del punteggio; matchmaking o social comparison.

### M8 — Shared Decisions

**Stato:** PLANNED

- **Goal:** introdurre una vertical slice proposta → alternative → scelta condivisa → outcome reale.
- **Perché serve:** porta il prodotto dalla conversazione a una conseguenza concreta della coppia.
- **Dipendenze:** M3; navigation/layer authority; Events e Ricordi per gli outcome successivi.
- **Principali sistemi interessati:** nuova superficie web minima, runtime state, Supabase solo per fatti che non possono essere derivati; `navigation.js` e native-back.
- **Rischio:** CRITICO per concorrenza, cancellazione, modifica dopo scelta, privacy e persistenza irreversibile.
- **Classification:** DEEP.
- **Definition of Done:** entrambi vedono la stessa proposta e stato; la scelta è idempotente e con conflitti espliciti; l’outcome reale può essere seguito o collegato; back/cancel/refresh/offline sono definiti; migration/recovery sono verificati.
- **Fuori:** workflow engine generico; votazioni illimitate; automazioni esterne; cancellazione distruttiva senza policy.

### M9 — Ricordi: timeline narrativa

**Stato:** PLANNED

- **Goal:** comporre una timeline narrativa da Moments, Eventi, domande, contenuti lasciati, decisioni ed esperienze preservate.
- **Perché serve:** dà una forma duratura alle conseguenze prodotte dalle milestone precedenti senza ridurre Ricordi a gallery.
- **Dipendenze:** M3–M8 secondo le fonti realmente disponibili; Moments/Events esistenti; definizione di provenance e ordering.
- **Principali sistemi interessati:** `moments-albums.js`, `events.js`, Daily Question, eventuali decisioni/Lasciato per te; query/selector e performance offline.
- **Rischio:** ALTO per duplicazione, ordinamento, privacy, cancellazione e query cross-domain.
- **Classification:** DEEP.
- **Definition of Done:** la timeline mostra elementi reali con tipo, provenienza e data; le fonti restano autorevoli; delete/privacy propagano senza copie orfane; paginazione/offline/realtime hanno comportamento definito; nessun memory engine universale prematuro.
- **Fuori:** riscrittura dei domini sorgente; AI-generated narrative; ranking di ricordi; import storico senza piano dati.

### M10 — Noi: progressione narrativa

**Stato:** PLANNED

- **Goal:** sostituire gradualmente la centralità di XP/livelli con una progressione narrativa basata su esperienze, tracce, capitoli e resurfacing.
- **Perché serve:** completa il cambio di significato di Noi e rende la progressione coerente con la vision.
- **Dipendenze:** M9; dati sufficienti di outcome; decisione esplicita su compatibilità XP e rollout.
- **Principali sistemi interessati:** `app.js`, `games.js`, Bond/quest, Ricordi, Settings e schema solo se necessario.
- **Rischio:** CRITICO per migrazione di prodotto, dati e aspettative esistenti.
- **Classification:** DEEP.
- **Definition of Done:** la coppia vede progresso narrativo basato su fatti; XP/livelli legacy hanno una compatibilità e un piano di deprecazione; capitoli/resurfacing sono spiegabili e reversibili; analytics e cancellazione rispettano privacy; nessun dato storico viene perso.
- **Fuori:** cancellazione immediata di XP; reset dei livelli; gamification sostitutiva; universal narrative engine costruito senza dati reali.

## 4. Protocollo di avanzamento autonomo

Per ogni milestone `CURRENT`, Hermes deve eseguire nell’ordine:

1. creare o aggiornare la specification dettagliata nella directory appropriata;
2. controllarne coerenza con `us-vnext-vision.md`, `AGENTS.md` e le authority tecniche esistenti;
3. scegliere compute e worker tramite `adaptive-compute-routing`, registrando la decisione effettiva;
4. implementare la milestone verticale, senza anticipare scope future;
5. validare focused tests, regressioni, build e invarianti pertinenti;
6. eseguire una review indipendente proporzionata al rischio;
7. correggere i finding bloccanti e riverificare;
8. eseguire manual QA solo quando realmente necessario; se non automatizzabile, richiedere Francesco;
9. committare soltanto dopo gate verde;
10. aggiornare roadmap e stato, mantenendo una sola `CURRENT`;
11. passare alla milestone successiva soltanto quando quella corrente è chiusa e verificata.

Il passaggio di stato è quindi:

```text
PLANNED → CURRENT → DONE
                    ↘ BLOCKED
```

`BLOCKED` richiede una motivazione concreta e una condizione di sblocco. Non si può lasciare una seconda milestone `CURRENT` per aggirare un blocco.

## 5. Quando fermarsi per Francesco

Hermes deve fermarsi e chiedere una decisione quando emerge:

- una vera decisione di prodotto non coperta dalla vision;
- un cambio sostanziale della vision;
- una migrazione dati rischiosa;
- auth o security;
- cancellazione o trasformazione irreversibile di dati;
- nuova spesa o nuovo servizio;
- deploy, release o store publication.

Le scelte locali reversibili e già coperte dalla vision devono essere risolte autonomamente e documentate nella specification della milestone.

## 6. Principali decisioni architetturali future non ancora da prendere

Queste sono domande da risolvere solo quando una milestone concreta le rende necessarie:

1. **Protocollo lifecycle condiviso:** non decidere ora se estrarre una state machine/coordinator comune. Prima M3 deve dimostrare quali transizioni sono realmente condivise.
2. **Persistence universale:** non decidere ora schema, tabella o outbox comune. Persistire soltanto fatti non derivabili e solo dopo una lacuna osservata.
3. **Source of truth della timeline:** non decidere ora se usare viste materializzate, una tabella timeline o query federate. La scelta dipende da volume, offline e delete semantics reali di M9.
4. **Semantica unread/received:** non introdurre ora tracking universale. Ogni sorgente deve dimostrare un segnale affidabile prima di alimentare Oggi o Lasciato per te.
5. **Voice e apertura differita:** sono opzioni di prodotto con implicazioni storage, privacy, notifiche e lifecycle; restano fuori finché M5 non le rende necessarie.
6. **Event → Moment:** non decidere ora automaticità, linkage o nuova tabella; M6 deve prima stabilire quale outcome è realmente utile.
7. **Rimozione XP/livelli:** non fissare una data o una migrazione prima di avere progressione narrativa sufficiente e una strategia di compatibilità.
8. **Capitoli e resurfacing:** non definire un algoritmo narrativo ora; servono dati reali da M9 e una decisione sulla privacy dei contenuti riproposti.
9. **Nuove notifiche o servizi:** nessuna scelta prima di una prova che il lifecycle non sia affidabile con i canali esistenti.
10. **Nuove schermate native:** la vision non le richiede; valutare solo davanti a un vincolo tecnico o valore prodotto dimostrato.

## 7. Regola di priorità della roadmap

Quando due milestone sembrano concorrenti, scegliere quella che:

1. produce una conseguenza reale per il partner con i dati e authority già disponibili;
2. esercita il core loop in una vertical slice piccola;
3. riduce incertezza architetturale senza creare un framework universale;
4. è reversibile e testabile;
5. non richiede una decisione riservata a Francesco.

Per questo motivo la roadmap mantiene `M3 — Daily Question: loop reciproco` come unica `CURRENT`: è la superficie con il miglior rapporto tra valore prodotto, dati già disponibili e rischio controllabile.
