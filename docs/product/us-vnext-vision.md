# US vNext — Product Vision

**Status:** PRODUCT AUTHORITY
**Scope:** direzione di prodotto e principi architetturali per l’evoluzione di US
**Repository:** `F:\AI\US`

Questo documento è l’autorità persistente della product vision US vNext. Le specification di milestone possono restringere e rendere eseguibile questa vision, ma non possono contraddirne il modello di prodotto senza una decisione esplicita di Francesco.

---

## 1. Visione

US deve smettere di sembrare un insieme di feature che due persone utilizzano separatamente.

Deve diventare uno spazio privato in cui ciò che una persona lascia cambia l’esperienza dell’altra, la risposta dell’altra produce una nuova conseguenza e le interazioni significative costruiscono progressivamente la storia della coppia.

La misura del prodotto non è quante feature vengono aperte, ma se un gesto di una persona produce una conseguenza significativa per l’altra o per la coppia.

## 2. Core loop

```text
azione di A
  → cambia US di B
  → B ritorna
  → B risponde o scopre
  → cambia US di A
  → outcome condiviso
  → eventuale memoria
```

Il modello operativo di riferimento resta:

```text
leave → receive → respond → resolve/preserve
```

Non ogni interazione deve attraversare tutte le fasi. Ogni interazione significativa deve però avere almeno una conseguenza reale:

1. cambia qualcosa per il partner;
2. cambia qualcosa per la coppia;
3. lascia una traccia nella storia condivisa.

## 3. Principi di prodotto

- **Reciprocità prima dell’engagement:** niente card, streak, XP o notifiche create soltanto per aumentare aperture.
- **Fatti prima delle feature:** il prodotto deve rendere visibili eventi e stati reali, non un catalogo di possibilità.
- **Una sola autorità per ogni fatto:** la UI compone e presenta; non crea copie concorrenti dello stato di dominio.
- **Progressione narrativa:** l’avanzamento deve rappresentare esperienze, contenuti lasciati, risposte, decisioni e ricordi; XP e livelli artificiali sono transitori.
- **Memoria come esito, non come obbligo:** una traccia si conserva quando ha significato, non per accumulare elementi.
- **Privacy di coppia:** US resta uno spazio privato per due persone, non un social network.
- **Migrazione verticale:** ogni milestone deve produrre un comportamento completo e utile, estendendo i sistemi esistenti invece di costruire prima un’infrastruttura universale.

## 4. Superfici di prodotto

### 4.1 Oggi

Oggi deve rispondere:

> **Che cosa sta succedendo adesso tra noi?**

Non deve funzionare come catalogo di feature o dashboard permanente. Deve comporre poche priorità reali, mantenendo l’hero e il contesto della Home quando non esiste nulla di prioritario.

### 4.2 Daily Question

Evoluzione desiderata:

```text
domanda
  → risposta separata
  → waiting for partner
  → reveal
  → confronto/conversazione
  → eventuale decisione o memoria
```

La domanda deve diventare un piccolo loop reciproco. Il reveal non è il prodotto finale: è l’inizio del confronto.

### 4.3 Quiz / Gioca

Gioca non deve ridursi a una percentuale generica di compatibilità.

Gli esiti devono produrre almeno uno tra:

- interpretazione reciproca;
- sorpresa utile;
- risposta dell’altro;
- conversazione;
- eventuale traccia significativa.

La metrica non è il punteggio, ma la conseguenza relazionale dell’esito.

### 4.4 Ti penso

Ti penso deve evolvere da bottone/reward a gesto reciproco, con segnali come:

- Ti penso;
- Mi manchi;
- Ho pensato a noi.

Il partner deve poter reagire o lasciare qualcosa in risposta. Il gesto non deve essere premiato artificialmente; il suo valore è la conseguenza per l’altra persona e, quando appropriato, la traccia condivisa.

### 4.5 Stories → Lasciato per te

Il concetto social di Story deve evolvere verso contenuto lasciato specificamente al partner:

- foto;
- testo;
- voce;
- domanda;
- eventualmente apertura differita.

La ricezione deve essere personale e verificabile senza introdurre prematuramente un’inbox universale. Un’interazione significativa può successivamente diventare un Ricordo.

### 4.6 Events

Events deve evolvere lungo il ciclo:

```text
prima → durante → dopo
```

Un evento può generare anticipazione prima e diventare un Moment condiviso dopo. Il passaggio Event → Moment deve usare autorità e dati esistenti o introdurre la minima persistence dimostrata necessaria.

### 4.7 Quest

Le Quest non devono essere task artificiali per ottenere XP.

Devono rappresentare esperienze realmente fatte insieme e produrre, quando appropriato, una traccia o memoria. L’XP esistente è compatibilità legacy, non la direzione del prodotto.

### 4.8 Shared Decisions

Shared Decisions deve supportare:

```text
proposta → alternative → scelta condivisa → outcome reale
```

Una decisione può alimentare successivamente un Event o un Ricordo. La scelta condivisa deve avere un outcome verificabile, non essere un semplice sondaggio isolato.

### 4.9 Ricordi

Ricordi non deve restare una semplice gallery.

Deve diventare progressivamente una timeline narrativa composta da:

- Moments;
- esperienze;
- domande significative;
- contenuti lasciati;
- eventi;
- decisioni;
- altre interazioni preservate.

La timeline deve mantenere la provenienza e il significato degli elementi senza duplicare i dati dei sistemi sorgente.

### 4.10 Noi / Progressione

La progressione deve abbandonare progressivamente XP e livelli artificiali a favore di segnali narrativi:

- esperienze fatte;
- cose lasciate;
- ricordi creati;
- domande significative;
- capitoli o periodi della relazione;
- resurfacing di contenuti passati.

La rimozione di XP è una migrazione di prodotto e dati, non un refactor cosmetico da anticipare.

## 5. Visione vs stato corrente verificato

La baseline di riferimento è `main` a `f24d0d0` e l’implementazione presente nel branch M2. Lo stato seguente deriva dalle specification e dai file runtime presenti nel repository.

| Area | Stato reale corrente | Distanza dalla vision |
|---|---|---|
| Foundation/navigation | Foundation 01 completata: Oggi → `home`, Noi → `bond`, Ricordi → `moments`, Gioca → `quiz`; Settings secondario; authority `go()` e native back preservate | La struttura d’accesso è pronta, ma le superfici conservano semantiche legacy |
| Oggi | M2 compone priorità reali da Daily Question ed Events in `usTodayPriorityRegion`, con empty state tranquillo | È il primo aggregatore relazionale, ma non coordina ancora un lifecycle condiviso tra feature |
| Daily Question | Esistono `daily_questions`, `daily_answers`, RPC `get_daily_state`, stati reciproci e reveal | Manca il confronto/conversazione e l’eventuale preservazione come outcome |
| Quiz / Gioca | Hub, set settimanali, risposte reciproche e scoring esistenti in `games.js` | L’esito è ancora principalmente score/XP, non interpretazione o conseguenza |
| Ti penso | Gesto globale con backend/push/widget esistenti in `app.js`, `ti-penso-widget.js` e superfici native | Non è ancora un ciclo reciproco con reazione o traccia significativa |
| Stories / Moments | Stories, media, viewer, profili e Moments sono sistemi reali con persistence e realtime | Non esiste ancora il concetto affidabile e dedicato di “Lasciato per te” |
| Events | Eventi, ricorrenze, completamenti, milestone e `openEvents()` esistono in `events.js` | Il ciclo prima/durante/dopo e Event → Moment non è ancora integrato |
| Quest / Bond | XP, livelli, badge e quest settimanali esistono e sono mantenuti per compatibilità | La progressione è ancora gamificata; la sostituzione narrativa non è iniziata |
| Shared Decisions | Non risulta una superficie o autorità di decisione condivisa dedicata | Manca il loop proposta → scelta → outcome |
| Ricordi | `moments` conserva album/foto e relativa persistence | Manca una timeline narrativa multi-provenienza |
| Interaction lifecycle | Foundation 01 definisce stati concettuali e M2 compone view model effimeri; non esiste un lifecycle universale runtime/persistito | Serve validare un protocollo minimo attraverso milestone verticali, senza creare subito un universal engine |

### Fonti runtime principali

- `index.html`: shell, superfici, entry point e anchor Oggi.
- `app.js`: auth, sync, Daily Question, Home, Ti penso e composizione M2.
- `events.js`: Events, ricorrenze, completamenti e prossimi eventi.
- `games.js`: Quiz/Gioca, set, scoring e stato quiz.
- `stories.js`, `moments-albums.js`: Stories, media, viewer e Moments.
- `navigation.js`: history, layer lifecycle, routing interno e native-back.
- `platform.js`, `native-entry.mjs`, `android/`: confini PWA/Capacitor e comportamento native.
- `docs/milestones/us-vnext-foundation-01.md`: contratti Foundation 01.
- `docs/milestones/us-vnext-m2-oggi.md`: contratto e acceptance M2.

## 6. Vincoli permanenti

- Vanilla HTML/CSS/JavaScript, Supabase, PWA e shell Capacitor restano l’architettura corrente.
- `go()` e `navigation.js` restano l’autorità di navigazione.
- Supabase, IndexedDB e runtime conservano i rispettivi confini; nessun nuovo writer senza prova di necessità.
- Nuova persistence soltanto quando lo stato non è derivabile in modo affidabile o deve sopravvivere a offline/process death.
- Nessun universal interaction engine, database universale o seconda state authority introdotti prematuramente.
- Auth, security, Push, sync, Service Worker, private media e native shell sono superfici sensibili.
- Le milestone devono preservare compatibilità con i client e i dati esistenti, usare rollout reversibili e mantenere le feature legacy finché l’equivalenza non è dimostrata.

## 7. Criterio di successo della vision

US sta convergendo verso la vision quando, per una coppia reale:

1. un gesto lasciato da una persona produce una conseguenza visibile per l’altra;
2. il ritorno dell’altra persona produce un nuovo stato o outcome, non soltanto un contatore;
3. gli outcome importanti possono diventare memoria senza copia concorrente del dominio;
4. Oggi rende evidente ciò che richiede attenzione senza diventare un catalogo;
5. la progressione racconta la storia della coppia più di quanto misuri l’attività.

## 8. Decisioni future che richiedono esplicita autorità

Questa vision non decide in anticipo:

- quale schema/persistence concreta serva per ogni lifecycle;
- se e come supportare voce, apertura differita o notifiche dedicate;
- quali contenuti siano eleggibili per la timeline narrativa;
- la semantica finale di capitoli e resurfacing;
- la strategia e i tempi di rimozione di XP/livelli;
- eventuali requisiti legali, retention o cancellazione dei contenuti;
- release, deploy, store publication o modifiche a auth/security.

Questi punti vengono decisi nella specification della milestone che li rende necessari, oppure da Francesco se la scelta modifica sostanzialmente la vision.
