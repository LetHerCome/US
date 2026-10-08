# US Premium UX — Decisioni sulla review del blueprint

**Stato:** PRODUCT DIRECTION REVIEWED — **non** autorizza implementazione, PR, merge, deploy, SQL o asset di produzione.  
**Review:** 2026-10-08 · baseline del blueprint `main@df7760b` · blueprint `b075e89`.  
**Fonte:** `docs/ux/README.md` e i cinque documenti associati.  
**Autorità:** raccomandazioni della review assistita richieste dall'owner; restano modificabili dall'owner. L'arte di ciascuna mascotte richiede comunque approvazione visiva esplicita.

## Le nove decisioni

### D1 — Finestre: APPROVARE, con eccezione funzionale
Adottare quattro tipi: alert di conferma, foglio contestuale, dettaglio immersivo, celebrazione. Conservare `UsUiFoundation` come unica authority (focus trap, inert, Escape/Back, layer). Niente **card decorative annidate** nel foglio; foto e anteprime dei premi possono avere il proprio contenitore. Non convertire tutti i dialog in un'unica PR. Test Back, bozze non salvate, keyboard, reduced motion e VoiceOver/TalkBack.

### D2 — Top bar: A+B APPROVATA per la prima candidate
Barra compatta 44px senza pillola, fissa e scroll-aware con isteresi (§3-5 del blueprint); fallback automatico **A sola** se la WebView/PWA presenta incompatibilità. `‹ Noi` assorbe lo slot sinistro nelle **sottosezioni di Noi soltanto**, rimuovendo la riga duplicata; Settings **senza back** come da contratto M1. Nelle 4 pagine principali restano Ti penso e busta, entrambi 44px. Oggi si semplifica visivamente senza introdurre un secondo stato immersivo (opzione C separata non approvata). Riconfermare su dispositivi reali prima della release. Beneficio misurato: 12 px pagine principali, 62 px sottosezioni; lo scroll-aware migliora la raggiungibilità, non ulteriormente lo spazio già liberato oggi dallo scroll.

### D3 — Compagni: APPROVARE il concetto, non gli asset
Nome famiglia: **Compagni**. Maudit è posseduto da subito, sempre in collezione, non revocabile; gli utenti esistenti conservano on/off e placement. Un solo compagno attivo nella shell per persona/dispositivo. Primo nuovo candidato: **Ciottolo, il pinguino** (L3); poi Nodo (L6), Spillo (L9), Lume (L12), **come concept provvisori**. Nessun animale nuovo è autorizzato per produzione senza una tavola/asset spec e approvazione del proprietario. Il primo onboarding del companion non deve bloccare MC3.

### D4 — Accenti ed effetti: NON annunciare più con modali, NON ritirarli
Restano sbloccabili ed equipaggiabili nel gruppo “Dettagli”; anelli e spille in un gruppo “Ritratti”. Niente `active=false` sui premi legacy. Il filtro UI per `accent`/`effect` deve **gestire correttamente** i `pending_unlocks`: ack server idempotente per premi effettivamente sbloccati e riconosciuti (o un altro criterio documentato che eviti coda permanente, duplicazioni e promesse perse). Errori/retry non devono riaprire pop-up che si è scelto di sopprimere. Test con vecchi cataloghi, upgrade e account switch.

### D5 — Estensione catalogo P3: APPROVATA SOLO COME DIREZIONE
Progettare e testare la futura migrazione additiva `companion` / `companion_item` senza alterare reward RPC esistenti e senza nuove valute. **Nessun SQL live autorizzato adesso.** Rollout rigoroso: (1) client capace di gestire categorie note/sconosciute e SW diffuso, (2) migrazione delle righe nuove con `announce=false`, (3) verifica/QA, (4) annuncio separatamente autorizzato. Tutti i diritti nuovi devono rimanere server-authoritative; non inventare livelli client-side nella fase zero-SQL. Rollback e compatibilità client vecchi sono gate bloccanti.

### D6 — Linguaggio: Sintonia soltanto in UX consumatore
Nascondere le etichette grezze `XP`, `LV`, `Bond`, `Punti Sintonia` dalle card principali. Mostrare **Sintonia · Livello N**, barra visibile, “Prossimo sblocco” e progressione comprensibile. Non cancellare numeri, economie o logica server; mantenere spiegazioni accessibili opzionali su come il livello cresce. Rimuovere rarità e XP dalle card Quest **come direzione UI**, coordinando il modello/contratti con M12C, non anticipando il suo sviluppo.

### D7 — Lasciato per te e Ricordi: APPROVARE CON QA
Lettura di `Lasciato per te` immersiva, composizione foglio tastiera-safe, nome mittente una sola volta; non alterare lettura/invio/push/Conserva. Ricordi: griglia cronologica a 2 colonne con foto del mese recente più grande e zero data duplicata; se la perf delle anteprime rallenta il primo paint, utilizzare progressive loading o mantenere layout attuale come fallback. Viewer: Elimina nel menu di overflow + conferma distruttiva, non CTA primaria. QA privacy/thumbnail/scorrimento su dispositivi.

### D8 — Focus iniziale: APPROVARE UNA POLICY PER TIPO, non una sostituzione universale
**Subito:** `:focus-visible` soltanto per l'anello della X, mantenendo i test esistenti. **Durante P1.3:** per fogli lunghi, dettaglio immersivo e celebrazione il focus iniziale va al **titolo programmaticamente focussabile** (`tabindex="-1"`), con etichetta accessibile e ritorno al trigger; negli alert distruttivi focus iniziale al comando meno rischioso (in genere Annulla). Per fogli di input brevi il focus può essere sul campo se la tastiera non irrompe senza scelta. Specificare e modificare `tests/ui-foundation.test.js` per tipo, non rimuovere la copertura. Verificare tastiera e screen reader reali.

### D9 — Fuso orario coppia: ROADMAP SÌ, beta Italia NO BLOCCO
Il fuso `Europe/Rome` fisso è un limite commerciale reale. Aprire una RFC **separata** per IANA timezone della coppia (`couples.timezone` o alternativa minima), default legacy `Europe/Rome`, validazione coerente delle RPC per giorni/Daily/ritmo/Quest, gestione DST e coppie in fusi diversi. **Non toccare MC3 né Supabase ora.** Deve essere implementato e provato prima di una distribuzione internazionale/self-serve; per beta controllata in Italia non è bloccante.

## Priorità e autorizzazioni

- **Adesso (MC3 ancora in corso):** solo eventuale P0 su branch dedicati e dopo richiesta esplicita; preferenza per fix reali che non toccano auth. Non cambiare MC3 worktree.
- **Dopo MC3:** P1.1 CSS consolidation con diff visivo; poi P1.2 topbar; P1.3 sheets; P1.4 unlock.
- **Poi:** P2 Maudit / Compagni senza SQL (inclusa chiave preferenze `<couple>:<profile>` e migrazione non distruttiva); P3 asset Ciottolo/altre mascotte e rollout compatibile con migrazione separata.
- **Prima di ogni merge:** CI, regressioni comparative, screenshot test 320/390/landscape, build PWA/Capacitor, dispositivo Android e per gesture/safe-area iOS. I 25 test falliti del tour Opus sono preesistenti nella base comparata; l'unica differenza è un test di geometria Oggi intermittente/ambientale, da riesaminare separatamente.
- **Nota:** quest'atto è una decisione di **prodotto e design**, non una autorizzazione al deployment. Non eseguire PR/merge/Edge/SQL per effetto di questo file.
