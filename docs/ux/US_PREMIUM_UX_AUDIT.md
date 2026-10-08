# US: audit UX critico e valutazione commerciale

**Stato:** AUDIT DI PRODOTTO · nessuna modifica runtime
**Missione:** `docs/missions/us-premium-ux-maudit-product-review-v1.md` (Work package A + E)
**Baseline:** `main` @ `df7760b` (D5 incluso)
**Documenti collegati:** [`US_TOPBAR_OPTIONS.md`](US_TOPBAR_OPTIONS.md) · [`US_NATIVE_SHEETS_DESIGN_SYSTEM.md`](US_NATIVE_SHEETS_DESIGN_SYSTEM.md) · [`MASCOTTE_SINTONIA_REWARDS_VISION.md`](MASCOTTE_SINTONIA_REWARDS_VISION.md) · [`US_PREMIUM_UX_ROADMAP.md`](US_PREMIUM_UX_ROADMAP.md)
**Legenda:** **[F]** fatto verificato (codice o browser) · **[G]** giudizio estetico o di prodotto · **[H]** ipotesi da validare

---

## 0. Verdetto esecutivo: se potessimo cambiare solo 3 cose

1. **Una sola grammatica per finestre e fogli** (alert · foglio contestuale con maniglia che funziona · dettaglio immersivo · celebrazione), con niente card dentro i fogli e lo sblocco Sintonia portato dentro il sistema modale. È il cambiamento che fa sembrare *tutta* l'app più nativa e costosa, senza aggiungere una sola feature. → `US_NATIVE_SHEETS_DESIGN_SYSTEM.md`
2. **Barra compatta e scroll-aware, con “‹ Noi” nello slot sinistro delle sottosezioni.** Recupera 12 px misurati ovunque e 62 nelle sottosezioni; Ti penso e busta tornano raggiungibili a metà pagina (oggi spariscono scorrendo); Ti penso arriva a 44 px. → `US_TOPBAR_OPTIONS.md`
3. **Sintonia ricostruita attorno ai Compagni, con un solo vocabolario.** Maudit diventa il primo compagno della collezione, si aggiungono 4 animali veri, si smette di annunciare i cosmetici invisibili e spariscono dalla UI XP, LV, Bond e “Punti Sintonia”. → `MASCOTTE_SINTONIA_REWARDS_VISION.md`

E una cosa da **non** fare: aggiungere altro vetro, aurore o glow. Il prodotto ne ha già troppo (**[F]** 74 `backdrop-filter`, 66 `@keyframes`, 885 `!important` in 20 fogli CSS per 491 KB). Il passo premium adesso è **togliere**.

---

## 1. Come è stato fatto l'audit

- **App reale servita in locale** (`python3 -m http.server`) e aperta in **Chromium (Playwright)** con un Supabase finto che risponde da fixture sintetiche. Le RPC di Game V2 girano su **PGlite** con le migrazioni del repository. Nessuna rete esterna, nessun account reale, nessun accesso a Supabase. Harness: `/mnt/project-files/qa/us-premium-ux-maudit-audit-v1/harness/` (`tour.mjs`, `steps.mjs`, `measure-topbar.mjs`, `fake-supabase.js`), derivato da quello di HUMAN-UI-03.
- **30 stati × 2 viewport** (390×844 e 320×568, safe area Android emulata 32/24 px) = **60 screenshot**, più **60 misure** della top bar a 390×844, 320×568 e 844×390. Cartelle: `…/screens/` e `…/topbar/`; log con metriche per ogni stato: `…/screens/tour-log.txt`.
- Il catalogo dei premi nella fixture è quello **reale** (letto dalla baseline SQL); la coppia è al livello 7.
- **Limiti dichiarati:**
  - nessun dispositivo fisico (iOS e Android restano un gate);
  - 844×390 è stato misurato senza safe area e con layout non-mobile;
  - la fixture usa `couples.bond_xp = 340` per la card Sintonia in Noi (“Livello 2”) e livello 7 per la pagina Sintonia: l'incoerenza è **dell'harness**, non dell'app;
  - nella conferma di prova ho passato un'opzione sbagliata (`danger:true` invece di `tone:'danger'`), quindi lo screenshot 30 mostra il tono normale e non va letto come difetto;
  - il primo avvio post-MC3 **non** è stato visto (Codex lo sta implementando).
- Nessuna affermazione su schermate non viste: dove una cosa viene dal codice e non dal browser, è indicato.

---

## 2. Scorecard per schermata

Scala 1–5 (5 = migliore). “Complessità” = quanto costa portarla al livello premium (5 = facile). **[G]** salvo le note.

| Schermata | Chiarezza | Finitura | Valore emotivo | Ritorno | Performance | Complessità | Nota principale |
|---|---|---|---|---|---|---|---|
| Login | 4 | 4 | 2 | — | 4 | 4 | elegante ma generico; “Bentornato” anche al primo accesso |
| Oggi (foto + Countdown) | 4 | 4 | **5** | 4 | 3 | 4 | il cuore del prodotto: proteggerlo |
| Oggi senza foto | 3 | 3 | 2 | 2 | 5 | 4 | stato vuoto corretto ma piatto |
| Nudge Domanda | 3 | 2 | 3 | 4 | 5 | 4 | coperto in parte da Maudit **[F]** |
| Domanda del giorno (foglio) | 4 | 3 | 4 | 4 | 4 | 4 | card nel foglio, eyebrow ripetuto |
| Lasciato per te (lettura) | 4 | 3 | **5** | 4 | 4 | 3 | il nome del mittente compare due volte **[F]** |
| Lasciato per te (composizione) | 4 | 3 | 4 | 3 | 4 | 3 | “Musica” troncata a 320 **[F]** |
| Ti penso (invio/ricezione) | 3 | 3 | 4 | 4 | 5 | 4 | bersaglio 38 px **[F]**, sparisce scorrendo **[F]** |
| Noi | 3 | 3 | 3 | 3 | 4 | 3 | “distanza non nota” su 2 righe, ingranaggio 36 px **[F]** |
| Sintonia | 2 | 3 | 2 | 3 | 3 | 2 | 4 vocabolari per la stessa cosa **[F]** |
| Collezione | 2 | 3 | 2 | 2 | 3 | 2 | card dentro card dentro card; molti premi invisibili |
| Sblocco | 4 | 4 | 3 | 3 | 4 | 4 | fuori dal sistema modale **[F]** |
| Quest | 3 | 3 | 2 | 3 | 4 | 3 | rarità ed XP contro la vision |
| Eventi | 4 | 4 | 3 | 3 | 4 | 4 | “Prossimo” ripete la prima riga **[F]** |
| Calendario | 3 | 3 | 3 | 3 | 3 | 2 | 3 righe di controlli prima della griglia, celle 39 px di altezza **[F]** |
| Ricordi | 3 | 3 | 4 | 3 | 3 | 3 | una sola foto enorme per mese, data ripetuta |
| Ricordi vuoto | 2 | **1** | 2 | 2 | 5 | 5 | **difetto visivo**: il glifo si sovrappone al titolo **[F]** |
| Viewer ricordo | 3 | 2 | 4 | 3 | 4 | 4 | “Elimina” primario, “Aggiungi foto” sovrapposto **[F]** |
| Gioca | 3 | 3 | 4 | **5** | 4 | 3 | densa ma funziona; tile ruotate e “Swipe” ripetuto |
| Partita (domanda) | 4 | 3 | 4 | 4 | 4 | 4 | card dentro la pagina; pulsante non a tutta larghezza |
| Impostazioni | 3 | 3 | 2 | — | 4 | 3 | voci da sviluppatore esposte (build id, Sincronizzazione, Ottimizza) |
| Conferma | 4 | 3 | — | — | 5 | 5 | “Annulla” con anello sembra il primario **[F]** |

---

## 3. Audit per schermata

Per ogni schermata: **cosa funziona**, **cosa non va**, **cambiamento concreto**, **cosa togliere**, poi valore, costo e rischio. Valore e costo: A = alto, M = medio, B = basso.

### 3.1 Shell (top bar, nav, Maudit)
- **Funziona:** nav da 56 px con indicatore chiaro e 4 voci giuste; nessun controllo nella banda della status bar **[F]** (`underStatus` vuoto in tutti gli stati); il PET sopra la nav dà vita.
- **Non va:**
  - la top bar è `position:absolute` e scorre via **[F]**: su Ricordi, Sintonia, Quest, Impostazioni e, a 320 px, anche su Noi e Gioca, Ti penso e busta spariscono a metà pagina;
  - Ti penso è 38×38 **[F]**;
  - la pillola con l'aurora è decorazione sopra la foto;
  - **a 320 px Maudit copre testo** di card su Gioca e Impostazioni **[F]** (`24-gioca-320x568.png`, `27-settings-320x568.png`) e il bordo del nudge della Domanda a 390 **[F]** (`06-oggi-daily-390x844.png`);
  - a 320 px la terza tile di Gioca esce dal bordo destro **[F]** (`24-gioca-320x568.png`) e l'ultima riga di Noi e Gioca sta sotto la nav, quindi serve scorrere.
- **Cambiamento:** vedi `US_TOPBAR_OPTIONS.md` (barra compatta 44 px senza pillola, fissa, scroll-aware, “‹ Noi” nelle sottosezioni). Per Maudit, piani di card ammessi solo se la prima riga di testo è a ≥ 40 px dal bordo; a 320 preferenza per la nav.
- **Togliere:** aurora della barra; i 4 blocchi CSS concorrenti per `.top.us-premium-top` in `identity.css` (righe 184, 273, 316, 330 → uno solo).
- Valore A · costo M · rischio PWA/Capacitor basso-medio (barra fixed + tastiera iOS da provare).

### 3.2 Login / primo avvio
- **Funziona [F]:** card pulita, campi grandi, CTA chiara, nessun nome di coppia (D5).
- **Non va [G]:**
  - “Bentornato” è sbagliato per chi entra la prima volta;
  - il marchio è piccolo e la storia del prodotto assente;
  - “Voi ♡ due” è decorativo.
  - Il primo avvio dopo MC3 (crea coppia / invito) **non è visto qui**: è in corso nel worktree di Codex.
- **Cambiamento (dopo MC3, a valle):**
  1. Schermata di benvenuto con **una** frase di prodotto (“Uno spazio solo vostro, dove quello che lasci cambia la giornata dell'altro”).
  2. Login.
  3. Dopo l'ingresso, un passo solo: “Scegli la foto di Oggi”. È il momento “aha”: la foto diventa casa.
  4. Maudit compare **una volta** con una riga (“Maudit vive qui. Puoi spostarlo prendendolo per la collottola”).
- **Togliere:** la riga sotto il pulsante “Accedi con email e password per entrare in US” (ripete il sottotitolo).
- Valore A (commerciale) · costo M · dipende da MC3.

### 3.3 Oggi
- **Funziona:**
  - foto a tutto schermo + Countdown editoriale: è la schermata più bella e più “vostra” **[G]**;
  - nessuno scroll **[F]** (`docScroll:0` in ogni stato);
  - stato senza foto con un'azione sola **[F]**.
- **Non va:**
  - la pillola della barra copre la parte più luminosa della foto;
  - il nudge della Domanda è una card larga e alta sopra la nav, e Maudit ci sale sopra **[F]**;
  - in landscape 844×390 il titolo del Countdown si tronca (“IL NOSTRO VIAG…”) **[F]** (`topbar/current-home-844x390.png`);
  - con molte cose da fare, Oggi oggi non mostra **nulla** oltre al nudge: le card sono state ritirate dalla Home Cleanup **[F]**. Per chi apre US per la prima volta Oggi sembra quindi una foto con un timer **[G]**.
- **Cambiamento:**
  - barra senza pillola;
  - nudge → pillola di avviso da 44 px (§5 sheets);
  - **una sola** riga di stato sotto il Countdown quando c'è qualcosa di reciproco in sospeso: “Beatrice ti ha lasciato qualcosa”, “Tocca a te nella Domanda”. È coerente con l'arbitraggio “max 1 primaria + 1 quieta”, e oggi il nudge già fa questo lavoro: va solo reso più sobrio e vicino al Countdown.
  - In landscape, titolo del Countdown su due righe invece di troncarlo.
- **Togliere:** l'aurora e il glow dietro la barra; il “Rispondi ›” rosa: basta un chevron.
- Valore A · costo B · rischio basso.

### 3.4 Ti penso
- **Funziona:** il gesto con un tocco è il migliore dell'app per rapporto tra valore e sforzo **[G]**; la ricezione è un avviso discreto (“… ti pensa ♡”) che non interrompe **[F]**.
- **Non va:** 38 px **[F]**; nessuna conferma visiva forte dell'invio (icona `sent` animata 220 ms **[F]** `identity.css:373`); sparisce scorrendo **[F]**.
- **Cambiamento:** 44 px; all'invio il cuore si riempie e un piccolo “Inviato” compare per 1,2 s nella pillola di avviso. Ricezione invariata. Il compagno attivo reagisce (già previsto da `USPet.react('think')`).
- Valore A · costo B.

### 3.5 Lasciato per te
- **Funziona:** il contenuto in serif grande è emozionante **[F]** (`09-left-for-you-390x844.png`); “Conserva” è il verbo giusto.
- **Non va [F]:**
  - testata “Lasciato per te / Beatrice” e subito sotto “♡ Da Beatrice”: il nome compare due volte;
  - “Apri il prossimo” sembra disabilitato;
  - la finestra è centrata e piccola, quindi la lettera non ha spazio per essere una lettera;
  - il compositore tronca “Musica” a 320.
- **Cambiamento:** lettura **immersiva** (tutto schermo, sfondo carta scura, mittente e data in piccolo in alto, contenuto al centro, “Conserva” e “Rispondi” in basso); composizione come foglio sopra la tastiera con 5 tipi in un selettore segmentato a icone (Phosphor) + etichetta sotto.
- **Togliere:** la riga “Da …” duplicata, l'eyebrow “PER VOI DUE”.
- Valore A · costo M.

### 3.6 Domanda del giorno
- **Funziona:** il patto “le risposte si sbloccano quando avete risposto entrambi” è chiaro **[F]**.
- **Non va [F]:**
  - eyebrow “OGGI” sopra “La domanda di oggi”;
  - card con bordo dentro il foglio;
  - nota col lucchetto emoji in un riquadro tratteggiato;
  - si apre sopra Gioca (instradamento della Home Cleanup), quindi chi arriva da Oggi si ritrova su un'altra tab dopo la chiusura **[F]** (`07-daily-sheet` mostra Gioca sotto lo scrim).
- **Cambiamento:** foglio contestuale senza card; domanda in serif 24; campo direttamente sul materiale; “Rispondi” a tutta larghezza sopra la tastiera; la nota diventa una riga 13 px con icona Phosphor `lock-simple`. Alla chiusura si torna dove si era (**[H]** richiede una scelta: tenere l'instradamento su Gioca solo per le push).
- Valore A · costo B.

### 3.7 Noi
- **Funziona:** la Lavagna è la migliore invenzione recente, utile e leggibile **[G]**; Sintonia e Quest in righe chiare.
- **Non va [F]:**
  - riga coppia con anelli grandi e un segnaposto tratteggiato “distanza non nota” su 2 righe in corsivo;
  - ingranaggio Impostazioni da 36 px, staccato dalla riga;
  - a 390 restano ~120 px vuoti sotto le righe, mentre a 320 l'ultima riga finisce sotto la nav;
  - “Squadra formata · Livello 2” è un titolo da gioco, non da coppia.
- **Cambiamento:**
  - riga coppia compatta (avatar 44, nomi, distanza solo quando nota, altrimenti niente);
  - Impostazioni come icona 44 nello **slot destro della riga coppia**, oppure nella barra al posto della busta solo su Noi. **[G]** Preferisco la prima: la busta deve restare costante.
  - Card Sintonia con il **compagno attivo** al posto dell'icona ∞ e del titolo di livello: “Ciottolo arriva al livello 3 · mancano 120”.
- **Togliere:** “distanza non nota”, i cerchi decorativi della card Sintonia.
- Valore M · costo M.

### 3.8 Sintonia e collezione
- **Funziona:** “Prossimo sblocco” con anteprima e descrizione è il pattern giusto **[F]** (`14-sintonia-390x844.png`); il Ritmo senza punizione è sano.
- **Non va [F]:**
  - **quattro vocabolari** per la stessa progressione: “Livello 7 · Legame profondo”, “649 XP al prossimo livello”, “Punti Sintonia accumulati insieme 3.901”, “LV 2 Bond” in Impostazioni, “+20 XP Bond” nella celebrazione (`polish4.js:26`);
  - pagina lunga **1.050 px di scroll a 320** (`docScroll`);
  - collezione = card che contiene gruppi che contengono tile con bordo (3 livelli di contenitore);
  - le cornici bloccate sono rettangoli quasi neri indistinguibili;
  - “Tocca per usare · ritocca per togliere” come istruzione permanente.
- **Cambiamento:**
  - un solo nome, **Sintonia**, con un solo numero, il **livello**, e una barra; mai “XP” in UI.
  - Ordine: Compagni (riga orizzontale grande) → Prossimo sblocco → Cornici e Countdown → Temi → Ritratti → Dettagli (chiuso).
  - Tile bloccate con silhouette dell'oggetto e “Livello N”, non un rettangolo scuro.
  - Il tocco apre una scheda con anteprima reale e “Usa” / “Togli”, senza istruzioni permanenti.
- **Togliere:** “Punti Sintonia accumulati”, “Ultime crescite” come lista di XP (diventa “Le ultime cose fatte insieme”, senza numeri), la sezione “Come cresce” sempre aperta (va in un “?”).
- Valore A · costo M. La parte Compagni è nel documento dedicato.

### 3.9 Quest
- **Funziona:** la conferma reciproca (“Beatrice ha confermato · manca la tua conferma”) è un vero loop di coppia **[F]**.
- **Non va [F]:**
  - rarità **Comune / Rara / Epica** con colori e “+50 XP” su ogni card: è un gioco di raccolta, contro la vision §4.7 (“Le Quest non devono essere task artificiali per ottenere XP”);
  - 3 righe di intestazione (“‹ Noi”, titolo + ↗, card settimana) prima della prima quest;
  - pulsante lucchetto accanto a “Conferma anche tu” senza significato evidente.
- **Cambiamento:** togliere rarità ed XP dalle card e tenere la categoria come icona; intestazione nella barra (“‹ Noi”); la settimana diventa una riga “1 di 3 fatte · nuove lunedì”.
- **Rispetto dei vincoli:** M12C Quest/Risonanza è una milestone già nominata da Francesco. Qui c'è solo la direzione visiva; il modello dati resta di M12C.
- Valore M · costo B (UI) / da decidere in M12C.

### 3.10 Eventi
- **Funziona:** chiaro, date leggibili, “Tra 12 giorni” **[F]**.
- **Non va [F]:** il “Prossimo” in evidenza ripete la prima riga di “In arrivo”; la X si accende all'apertura.
- **Cambiamento:** il prossimo evento solo in evidenza; la lista parte dal secondo. Foglio contestuale con maniglia vera.
- Valore B · costo B.

### 3.11 Calendario
- **Funziona:** proprietà come testo (B/F/Noi) e non solo colore, coerente con la decisione di prodotto **[F]**; griglia unica condivisa.
- **Non va [F]:**
  - tre righe di controlli (‹ Oggi ›, Mese/Settimana, legenda) prima della griglia;
  - celle alte 39 px (sotto i 44);
  - foglio a tutta altezza **con fogli annidati** (dettaglio e form);
  - legenda a etichette (“B Beatrice · F Francesco · Noi Insieme”) che occupa una riga intera.
- **Cambiamento:**
  - dettaglio immersivo;
  - testata = mese + ‹ › nella stessa riga + selettore Mese/Settimana a destra;
  - legenda dentro un “?” o nella prima apertura;
  - celle quadrate ≥ 44;
  - dettaglio e form come push interni.
- **Vincolo:** “F / B / F+B” resta testo; nessun colore come unico segnale.
- Valore M · costo M.

### 3.12 Ricordi
- **Funziona:** “Conservati” in cima; fotografie protagoniste; capitoli **[F]**.
- **Non va [F]:**
  - una sola foto enorme per mese (“Mese per mese”), con 8 ricordi = 2.300 px di scroll;
  - mese e anno ripetuti (“Ottobre 2026” sopra “08 ott 2026”);
  - mittente in maiuscoletto viola sopra la data;
  - **stato vuoto rotto**: il glifo a cerchi si sovrappone al titolo “La vostra storia parte da qui” (`22-ricordi-empty-390x844.png`);
  - contatore “8 ricordi” / “Nessun ricordo” accanto al +.
- **Cambiamento:**
  - griglia a 2 colonne con la foto più recente del mese a doppia larghezza (pattern Foto di iOS “Giorni/Mesi”);
  - didascalia sotto la foto, senza riquadro;
  - data solo giorno + mese;
  - stato vuoto: illustrazione sopra e titolo sotto, un pulsante “Aggiungi il primo ricordo”.
- **Togliere:** il contatore; il nome del mittente in maiuscolo (resta in VoiceOver e nel dettaglio).
- Valore A · costo M · rischio: performance delle miniature (le thumbnail esistono già: `ricordi-thumbnails-v1`).

### 3.13 Viewer del ricordo
- **Funziona:** foto grande, swipe per chiudere **[F]** `app.js:3159`.
- **Non va [F]:** “Elimina” come primo bottone pieno sotto il titolo; “Aggiungi foto” fluttuante sopra il riquadro vuoto, che taglia “Solo la foto principal…”; il tasto indietro “‹” è sopra la foto, quindi poco contrastato su foto chiare.
- **Cambiamento:** menu “···” in alto a destra con Elimina (alert distruttivo); “Aggiungi foto” come riga nel riquadro vuoto; chiusura con X in alto a destra su scrim scuro (`is-on-media`).
- Valore M · costo B.

### 3.14 Gioca
- **Funziona:** la tab con più ritorno; “Per voi” come eroe; “Tocca a te 1”, “Risposte pronte 1” come stato reciproco reale **[F]**.
- **Non va [F]:**
  - fila di 3 indicatori sopra (“●○○ 2 rimasti”, poi due chip) prima dell'eroe;
  - card Swipe con “Swipe” ripetuto a destra;
  - tile delle modalità **ruotate**: carine, ma a 320 la terza esce dal bordo;
  - “La vostra domanda” in fondo, sotto la nav a 320.
- **Cambiamento:**
  - chip di stato **dentro** l'eroe Per voi (“Tocca a te” è l'azione: diventa il pulsante);
  - “2 rimasti” come piccola riga sotto il titolo;
  - modalità in griglia 3 colonne dritta (la rotazione resta solo in reveal/celebrazione);
  - Swipe senza etichetta ripetuta.
- **Coerenza:** Arcade/Pulse arriveranno qui (`CURRENT_STATE.md`); serve spazio, quindi questa semplificazione va fatta **prima** di aggiungere Arcade.
- Valore A · costo M.

### 3.15 Partita
- **Funziona:** una domanda per volta, progress 1 di 5 **[F]**.
- **Non va [F]:** tutto dentro una card con bordo; “‹ Gioca” dentro la card; “Avanti” non a tutta larghezza e lontano dal pollice; la serif della domanda è più piccola della sua importanza.
- **Cambiamento:** pagina pulita senza card; “‹ Gioca” nella barra; domanda serif 26; campo a tutta larghezza; “Avanti” a tutta larghezza sopra la tastiera.
- Valore M · costo B.

### 3.16 Impostazioni
- **Funziona:** separazione Tu / Su questo telefono / Voi, cioè chi è coinvolto da ogni preferenza **[F]**; interruttori veri.
- **Non va [F]:**
  - voci tecniche per l'utente finale: “Ottimizza Ricordi · Anteprime leggere, originali intatti”, “Sincronizzazione · Tutto ok”, “Foto Home · Gestisci”, il **build id** `us-ricordi-thumbnails-v1-20261007-1`;
  - card coppia con “LV 2 Bond / 8 Moments / 0 vissuti” (inglese e gergo);
  - pallino di stato in alto a destra senza etichetta visibile.
  - La voce “Maudit” è un semplice interruttore: Maudit non si può scegliere né conoscere da qui.
- **Cambiamento (allineato a M12D Settings, senza anticiparlo):**
  - “Ottimizza Ricordi” e “Sincronizzazione” vanno in una sottopagina “Avanzate”;
  - build id solo con 5 tocchi sulla versione;
  - card coppia: “Insieme da 2 anni e 5 mesi” come unica riga;
  - “Maudit” → “**Compagno** · Maudit” con interruttore e scheda (documento Compagni).
- **Vincolo:** nessun “indietro” in Impostazioni (contratto M1).
- Valore M · costo B.

### 3.17 Conferme, avvisi, stati
- **Conferma:** grammatica giusta; serve il tono distruttivo obbligatorio e un focus iniziale che non accenda “Annulla” come se fosse il primario **[F]**.
- **Toast / nudge / status / update / XP / livello:** sei forme diverse sopra la nav → una pillola di avviso con priorità (§5 sheets).
- **Loading:** le pagine mostrano scheletri e stati “…” (`usNotificationsValue` = “…”) **[F]**. Va bene; uniformarli allo stesso shimmer statico (niente animazione con riduzione del movimento).
- **Errore/offline:** `app-status-bar` già chiara **[F]**.
- **App lock:** fuori da questo redesign (Native Security V1).
- **Landscape:** contenuto in una colonna da 480 px con bordi neri a 844×390 **[F]**; chrome = 123 px su 390 (32%). La barra scroll-aware aiuta soprattutto qui.

---

## 4. Problemi di sistema (trasversali)

| Problema | Evidenza | Proposta |
|---|---|---|
| Debito di stratificazione CSS | **[F]** 20 file, 491 KB, 885 `!important` (moments-albums 291, styles 148, identity 117), 28 valori diversi di `z-index`, 53 dimensioni di font in px, 29 raggi | “Consolidamento CSS senza redesign” è già in `CURRENT_STATE.md`: farlo **prima** del redesign dei fogli, non dopo |
| Card dentro card | **[F]** Sintonia (3 livelli), Domanda, Partita, Countdown | regola: un contenitore per contenuto; la pagina e il foglio sono già contenitori |
| Vetro e glow ovunque | **[F]** 74 `backdrop-filter`; anello rosa sulla X all'apertura | vetro solo per barra, nav e fogli; niente glow sui controlli a riposo |
| Gerarchia tipografica | token esistenti (26/19/15/14/12/11/10/9) ma 53 font-size reali | 6 stili: Titolo 28 serif · Sezione 20 serif · Corpo 16 · Etichetta 14/600 · Meta 13 · Eyebrow 11 maiuscoletto (solo dove aggiunge contesto) |
| Bersagli < 44 px | **[F]** Ti penso 38, ingranaggio Noi 36, “‹ Noi” 40, chip compositore 40, celle calendario 39, “Annulla” dell'eliminazione nell'album 34, radio Partita 18 (la label è il bersaglio: da verificare) | criterio di accettazione automatico nel tour (§6) |
| Lingua | **[F]** “Moments”, “Bond”, “LV”, “Swipe”, “Stories” accanto all'italiano | italiano coerente in UI; “Swipe” può restare come nome di modalità |

---

## 5. Valutazione commerciale (Work package E)

### 5.1 Che cosa vede una coppia che non conosce US
**[G]** Una coppia sconosciuta capisce subito **Oggi**: la vostra foto e il tempo che vi separa da qualcosa. Capisce **Gioca**. Fatica invece su **Noi** (cosa sono Sintonia, Ritmo, Quest, Lavagna, Eventi, Da vivere, tutti insieme?) e non trova da sola **Lasciato per te**, la cosa più preziosa, nascosta in una busta da 44 px.

**Blocchi commerciali reali (fatti), oltre alla UX:**
- **Iscrizione pubblica disattivata** e coppie B create in modo controllato (decisione MC2 D1) **[F]** `DECISIONS.md`: oggi non si può “provare” US. MC3 sta lavorando sull'onboarding.
- **Fuso orario della coppia fisso su Europe/Rome** nelle regole server (Ritmo, giorno della Domanda, settimana di Gioca) **[F]** `get_progression_v1` (`today_rome`), M11F. Per coppie fuori dall'Italia o a distanza è un difetto funzionale.
- **Solo italiano** **[F]**.
- **Nomi:** D5 ha reso generici i nomi visibili (risolti dai profili); i token `francesco|beatrice` restano solo come slot di compatibilità interni **[F]** `app.js:129-132`, `games.js:25`, `calendar.js:13`. Non sono un blocco visivo, ma vanno normalizzati prima di avere coppie in cui le due persone non sono “slot A/B” fissi (decisione già presa: migrazione atomica separata).

### 5.2 Racconto di prodotto
> **US è un posto per due.** Quello che lasci all'altro (un pensiero, una foto, una risposta) cambia la sua giornata. Quello che fate insieme diventa la vostra storia.

Tre promesse, in ordine:
1. **Lasciare** (Ti penso, Lasciato per te, Domanda).
2. **Giocare** (Per voi, Swipe, presto Arcade).
3. **Ricordare** (Ricordi, Conservati, Countdown).

La progressione e i Compagni sono la **conseguenza visibile**, non la promessa.

### 5.3 Momenti “aha” del primo uso
1. **Minuto 1:** “Scegli la foto di Oggi” → la Home diventa vostra. È la cosa più forte che avete.
2. **Minuto 2:** Maudit compare una volta, si lascia prendere per la collottola, si rimette sulla barra. È un gesto fisico che nessuna app di coppia ha.
3. **Primo giorno:** la prima Domanda, con il patto “si sblocca quando avete risposto entrambi”.
4. **Prima settimana:** il primo *Lasciato per te* ricevuto e aperto a tutto schermo.
5. **Settimane 2–4:** il primo compagno nuovo (Ciottolo, livello 3).

### 5.4 Tre screenshot da store
1. **Oggi:** foto della coppia a tutto schermo + Countdown editoriale + Maudit sulla barra. Didascalia: “La vostra foto. Il vostro tempo.”
2. **Lasciato per te, lettura immersiva:** una frase vera in serif grande. Didascalia: “Lascia qualcosa che l'altro troverà.”
3. **Collezione Compagni:** Maudit, Ciottolo, Nodo in fila. Didascalia: “Crescono con voi.”

(Gioca resta il quarto se lo store ne chiede di più.)

### 5.5 Ritorno quotidiano senza rumore
Va bene ciò che nasce dall'altro: Domanda in attesa, busta piena, partita in cui tocca a te, Ti penso ricevuto. Non va bene ciò che nasce dal sistema: streak in pericolo, XP, “torna a trovarci”. I compagni rispettano la regola: reagiscono a fatti reali e mai a mancanze.

### 5.6 Dove investire (alto valore contro estetica fine a se stessa)

| Investimento | Valore per una coppia nuova | Costo | Verdetto |
|---|---|---|---|
| Onboarding MC3 di qualità (foto di Oggi come primo passo) | **altissimo** | M | prima di tutto, ma nel lane di Codex |
| Grammatica dei fogli + niente card annidate | alto, ovunque | M | **P1** |
| Barra compatta scroll-aware | medio-alto | B-M | **P1** |
| Fuso orario della coppia | alto fuori dall'Italia | M (SQL) | da pianificare a parte |
| Maudit dentro Sintonia + scheda + preferenza per account | medio-alto (identità) | M | **P2** |
| Nuovi compagni (arte + SQL) | alto per il ritorno a 2–8 settimane | A (arte) | **P3**, uno alla volta |
| Ricordi a griglia | alto (emotivo) | M | P1/P2 |
| Altro vetro, aurore, glow, animazioni | **negativo** | — | no |
| Accenti ed effetti sul simbolo | quasi nullo | — | smettere di annunciarli |

---

## 6. Criteri di accettazione misurabili

Da automatizzare nel tour Playwright (estendendo `tour.mjs`) a 320×568, 390×844, 844×390:

| # | Criterio | Oggi (misurato) | Obiettivo |
|---|---|---|---|
| 1 | Bersagli interattivi visibili < 44 px (escluse label di radio con area estesa) | Ti penso 38, ingranaggio 36, “‹ Noi” 40, celle 39, chip 40 | **0** |
| 2 | Contenuto sotto la safe area su Noi, Ricordi, Gioca | 64 px | **≤ 52** |
| 3 | Chrome sopra il contenuto in Sintonia e Quest | 114 px | **≤ 52** |
| 4 | Ti penso e busta raggiungibili dopo 400 px di scroll + 20 px su | no | **sì** |
| 5 | Scroll verticale di Oggi | 0 | **0** (invariato) |
| 6 | PET sopra testo di card a 320 | almeno 2 stati su 30 (Gioca, Impostazioni) | **0** |
| 7 | Overlay fuori da `[data-us-modal]` | 1 (sblocco) | **0** |
| 8 | `z-index` letterali ≥ 10000 fuori dai token | 7 (10050, 10090, 10120 ×2, 10130, 10140, 10145) | **0** |
| 9 | Fogli con maniglia senza gesto | 2 | **0** |
| 10 | Tap per aprire un *Lasciato per te* da qualsiasi tab | 1, solo in cima | **1 sempre** (con eventuale scroll su) |
| 11 | Tap per cambiare compagno da Noi | n/a | **≤ 3** (Sintonia → Compagno → Porta con te) |
| 12 | Parole “XP”, “LV”, “Bond”, “Punti” in UI | ≥ 5 occorrenze | **0** |
| 13 | Costo di paint di un foglio aperto (Chromium Performance, 6× CPU throttle) | da misurare | baseline registrata prima di P1, nessun peggioramento |
| 14 | Overflow orizzontale | 1 (tile Gioca a 320) | **0** |

---

## 7. Decisioni richieste a Francesco
1. Approvare la grammatica a 4 tipi (alert / foglio / immersivo / celebrazione) e la regola “mai card nel foglio”.
2. Barra: default **A + B** con “‹ Noi” nelle sottosezioni (solo Noi, non Impostazioni)?
3. Rimozione da UI di XP / LV / Bond / Punti, con un solo “Livello” di Sintonia?
4. Rarità ed XP fuori dalle card Quest (direzione visiva da passare a M12C)?
5. Lettura di *Lasciato per te* a tutto schermo?
6. Ricordi a griglia invece di “una foto per mese”?
7. Vedi anche le decisioni dei documenti Compagni, Top bar e Roadmap.
