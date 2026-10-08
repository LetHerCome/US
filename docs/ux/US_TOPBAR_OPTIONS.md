# Top bar — tre alternative misurate e una raccomandazione

**Stato:** BLUEPRINT · nessun CSS/JS di produzione modificato
**Baseline:** `main` @ `df7760b` · **Misure:** Chromium (Playwright) sull'app reale servita in locale, backend finto, safe area Android emulata (`--safe-area-inset-top: 32px`, bottom 24px) a 390×844 e 320×568. A 844×390 il tour gira senza safe area e con layout non-mobile.
**Harness:** `/mnt/project-files/qa/us-premium-ux-maudit-audit-v1/harness/measure-topbar.mjs`. Il CSS dei concept viene **iniettato solo nella pagina sotto test**, mai nel repository.
**Dati grezzi:** `…/topbar/topbar-measurements.json` · **Screenshot:** `…/topbar/<concept>-<pagina>[-scrolled]-<viewport>.png`
**Legenda:** **[F]** misurato o letto nel codice · **[G]** giudizio · **[H]** ipotesi

---

## 1. Come è fatta davvero oggi

| Fatto | Valore | Fonte |
|---|---|---|
| Struttura | `.top.us-premium-top`: Ti penso (sinistra) · simbolo US (centro) · busta *Lasciato per te* (destra) · `#onlineBadge`, **sempre nascosto** dentro la barra (`display:none!important`) | **[F]** `index.html:181`, `identity.css:188` |
| Posizione | `position:absolute` dentro `.app`: **non è sticky né fixed**. Scorre via con il documento. | **[F]** `identity.css:184`, misura `barPosition:"absolute"` |
| Altezza | pillola di 46 px, `top = safe + 6` | **[F]** `ui-foundation.css:103`, misura `[38,84,46]` |
| Inizio contenuti | Noi, Ricordi, Gioca **64 px** sotto la safe area; Impostazioni **77 px** | **[F]** misura `chromeAboveContent` |
| Ti penso | bersaglio **38×38**: sotto i 44 px minimi | **[F]** misura `btns[0] = [38,38]`, a tutte le viewport |
| Busta | 44×44 | **[F]** |
| Oggi | la foto parte già **sotto** la barra (hero da y = 30) e il Countdown si posiziona con `--us-top-chrome-height + 22px` | **[F]** `countdown.css:6`, misura `heroTop:[30,842]` |
| Dopo lo scroll | su Ricordi, Impostazioni e (a 320 px) Noi e Gioca la barra **sparisce scorrendo e torna solo in cima**: Ti penso e busta non sono raggiungibili a metà pagina | **[F]** `21-ricordi-scrolled-390x844.png`, misure `down.barVisible:false` |
| Sottosezioni | Sintonia e Quest aggiungono una seconda riga di chrome, la pillola “‹ Noi” (40 px + 10 di margine) | **[F]** probe `noiSectionBar [98,40]` |
| Landscape 844×390 | barra 46 + nav: lo spazio leggibile tra inizio contenuti e nav è **264–267 px su 390** | **[F]** misura `readable` |

**Conseguenza [G]:** il problema non è “la barra è troppo alta” (lo è di poco). Sono tre problemi: (1) 64 px di chrome a riposo, che diventano **114** nelle sottosezioni; (2) le due azioni più emotive dell'app spariscono appena si scorre; (3) Ti penso non rispetta il minimo di 44 px.

---

## 2. Le tre alternative

### A · Barra compatta sempre presente
```
 safe area ───────────────────────────────────────
 ( ♡ )                 US                 ( ✉ )      44 px, nessun contenitore a pillola
 ─────────── materiale solo quando c'è contenuto sotto ───────────
 [contenuto della pagina]
```
- Restano Ti penso, il simbolo (scala 0.78) e la busta. Ognuno ha un bersaglio di 44×44 sulla linea della safe area. Il contenitore a pillola, l'aurora e il bordo spariscono.
- Lo stato di connessione resta come oggi: compare solo come `app-status-bar` in caso di errore o offline.
- **Recupero misurato:** **12 px** su Noi, Ricordi, Gioca e Impostazioni a 390×844, 320×568 e 844×390 (64 → 52). Su Oggi **0 px** di layout, perché il Countdown dipende dal token; con il token a 44 sono **2 px**.
- Ti penso passa a **44×44** **[F]** misura.
- Pro: affidabile, nessuna logica, nessuna oscillazione. Contro: guadagno piccolo; il problema delle azioni irraggiungibili dopo lo scroll resta.

### B · Nasconde scendendo, ricompare risalendo
- La barra diventa `position:fixed`, a riposo identica a oggi. Si nasconde con `translateY` dopo uno scroll **intenzionale** verso il basso e ricompare con uno scroll verso l'alto, vicino alla cima, al focus o su un evento.
- **Recupero misurato a riposo: 0 px.** Durante lo scroll lo spazio leggibile è uguale a oggi (732 px a 390, 456 a 320, 331 in landscape) perché **oggi la barra se ne va già scorrendo**.
- Il guadagno vero è un altro: Ti penso e busta **tornano disponibili** con un piccolo gesto verso l'alto, senza risalire fino in cima.
- Contro: serve un listener di scroll con isteresi (§4) e un materiale quando il contenuto passa sotto la barra fissa.

### C · Oggi immersiva, il resto come B
- Su Oggi: due bottoni da 44 px fluttuanti sulla foto, niente pillola, niente simbolo. Sulle altre pagine: B.
- **Recupero misurato su Oggi: 0 px di layout**, perché la foto è già a tutto schermo sotto la barra. Il guadagno è solo visivo (meno vetro sopra la foto).
- **Rischio verificato:** con la foto chiara il cuore di Ti penso senza contenitore perde contrasto (`contextual-home-390x844.png`). Serve uno scrim radiale di circa 56 px dietro ogni bottone (`rgba(8,4,14,.42)`, lo stesso di `.us-modal-close.is-on-media`).
- Contro: due comportamenti diversi della stessa barra (più codice e più test), per un guadagno solo estetico.

### Confronto

| | A compatta | B scroll-aware | C contestuale |
|---|---|---|---|
| Px recuperati a riposo (Noi/Ricordi/Gioca) | **12** (390, 320, 844×390) | 0 | 0 (12 se combinata con A) |
| Px recuperati su Oggi | 0–2 | 0 | 0 (visivo) |
| Azioni raggiungibili a metà pagina | no (come oggi) | **sì** | sì fuori da Oggi |
| Ti penso 44 px | **sì** | no (se non combinata) | no su Oggi senza correzione |
| Raggiungibilità col pollice | invariata (azioni in alto) | uguale, ma sempre richiamabili | uguale |
| Leggibilità sulla foto | buona con materiale | come oggi | a rischio senza scrim |
| Affidabilità | massima | media (isteresi) | media-bassa (due modi) |
| JS nuovo | nessuno | un listener passivo | un listener + stato di pagina |
| Rischio PWA/Capacitor | nullo | basso: `position:fixed` + tastiera su iOS va provato | basso-medio |

---

## 3. Raccomandazione: **A + B insieme**, con la barra che assorbe la riga “‹ Noi”

**Default: barra compatta (A) fissa e scroll-aware (B).** Oggi resta com'è nei contenuti; la barra perde la pillola anche lì, quindi C nasce gratis senza un secondo comportamento.

In più, una regola che dà il guadagno più grande: **nelle sottosezioni di Noi (Sintonia, Quest, Da vivere, Eventi come pagina) lo slot sinistro diventa “‹ Noi”** al posto di Ti penso, e la pillola “‹ Noi” nella pagina sparisce. È il modello della barra di navigazione iOS: chi è “dentro” vede la via d'uscita dove se l'aspetta.

| Pagina | Oggi (misurato) | Raccomandato | Guadagno |
|---|---|---|---|
| Noi, Ricordi, Gioca | contenuto a +64 | +52 | **12 px** (misurato) |
| Sintonia, Quest | +64 +50 (riga “‹ Noi”) = 114 | +52 | **62 px** (12 misurati + 50 misurati della riga rimossa) |
| Impostazioni | +77 | +65 | **12 px** (misurato) |
| Oggi | foto sotto la barra | uguale, senza pillola | 0 px, meno vetro sulla foto |
| Durante lo scroll | barra già sparita | sparisce, ma **ricompare risalendo** | disponibilità |

**Vincolo da rispettare [F]:** Impostazioni **non** deve avere un bottone indietro (`usSettingsBack` è vietato da `web-visual-reconciliation-m1.test.js`, vedi report pre-native). La regola “‹ Noi” vale quindi **solo** per le sottosezioni di Noi, non per Impostazioni. Se Francesco volesse anche lì “‹ Noi”, serve una decisione esplicita che cambi quel contratto.

**Fallback:**
1. Se il comportamento scroll-aware dà problemi su un dispositivo (tastiera iOS, WebView Android vecchia): si resta su **A sola**, cioè la barra compatta che scorre via come oggi. È una regressione zero rispetto al presente.
2. Se la rimozione della pillola peggiora la riconoscibilità del marchio: si torna alla pillola, ma a 44 px e con Ti penso a 44×44.

**Il simbolo US deve essere sempre presente?** **[G]** No nelle sottosezioni, dove il titolo o la via d'uscita sono più utili. Sì nelle 4 pagine principali, a dimensione ridotta: è la firma del prodotto e funziona come “torna in cima” (tocco sul simbolo = scroll top, comportamento iOS sulla status bar).

---

## 4. Comportamento: regole precise

Unico listener `scroll` passivo su `window`, nessun `requestAnimationFrame` in loop, nessun timer periodico. Lo stato vive in un attributo: `html[data-us-bar="shown|hidden"]`.

- **Soglia di attivazione:** sotto `scrollY < 64` la barra è sempre visibile.
- **Nascondi:** dopo **32 px cumulativi** di scroll verso il basso iniziati da un gesto dell'utente (`touchmove`/`wheel` negli ultimi 300 ms). Lo scroll programmatico (`scrollIntoView`, ritorno di pagina) non nasconde mai.
- **Mostra:** dopo **16 px cumulativi** verso l'alto, oppure `scrollY < 64`.
- **Isteresi:** l'accumulatore si azzera a ogni cambio di direzione. Un rimbalzo elastico iOS (`scrollY < 0` o oltre il massimo) non conta.
- **Transizione:** `transform` 220 ms `--us-ease-standard` + opacità 160 ms. Con riduzione del movimento: cambio istantaneo, logica identica.
- **Materiale:** trasparente a riposo in cima. Quando c'è contenuto sotto (`scrollY > 0`) diventa `--us-sheet-head-bg` + blur 20 px, come la testata sticky dei fogli: è lo “scroll edge appearance” di iOS.

### Tabella di verità

| Situazione | Barra |
|---|---|
| Oggi, qualsiasi stato | visibile (Oggi non scorre per contratto) |
| Pagina diversa da Oggi, `scrollY < 64` | visibile, trasparente |
| Scroll giù intenzionale ≥ 32 px | nascosta |
| Scroll su ≥ 16 px | visibile con materiale |
| Cambio pagina (`go()`) o Back | visibile (reset accumulatore) |
| Focus da tastiera o screen reader dentro la barra | visibile finché il focus resta lì |
| Tastiera aperta (`body.us-keyboard-open`) | stato congelato; nessun nascondi o mostra mentre si scrive |
| Foglio, dialog o viewer aperto (`body[data-us-surface="open"]`) | congelata e inerte come oggi (sotto lo scrim) |
| Arriva un *Lasciato per te* o un *Ti penso* mentre è nascosta | mostrata **una volta**, senza ri-nasconderla da sola: si nasconde solo al prossimo scroll giù |
| App lock / login | coperta dal livello lock/auth, nessun cambiamento |
| Riduzione del movimento | stessa logica, nessuna animazione |
| Landscape | stessa logica; a 844×390 è il caso con più guadagno |
| Stato offline o errore | la barra non cambia, il messaggio resta nella `app-status-bar` |

### Safe area, notch e cutout
- La barra si appoggia a `top: var(--us-safe-top)`, il valore che Capacitor e iOS iniettano già. Nascosta, trasla di `-(100% + safe-top + 8px)`, così non lascia mai un bordo sotto la Dynamic Island.
- La banda della status bar resta occupata da uno strato di colore `--us-color-bg` all'80% quando la barra è nascosta e il contenuto scorre sotto. Senza questo strato il testo passerebbe sotto l'orologio. **[H]** Va verificato su iPhone con Dynamic Island e su Android con cutout centrale.
- Il tour non ha trovato **nessun** controllo interattivo dentro la banda della status bar (`underStatus` vuoto, a parte il toggle Focus di 1 px che è nascosto).

---

## 5. Test di accettazione (per l'implementazione)

1. Browser, 320×568, 390×844, 844×390: Noi, Ricordi e Gioca con contenuto a **≤ 52 px** sotto la safe area; Sintonia e Quest senza la riga “‹ Noi”.
2. Ti penso e busta **44×44** a tutte le viewport.
3. Ricordi scorso di 400 px, poi scroll su di 20 px: barra visibile, entrambe le azioni toccabili.
4. Scroll programmatico (`scrollIntoView`) di 500 px: la barra **non** si nasconde.
5. Tastiera aperta in un campo di Impostazioni: nessun cambio di stato della barra.
6. Riduzione del movimento: nessuna `transition` attiva sulla barra (`getComputedStyle(...).transitionDuration === '0s'`).
7. Back da Sintonia → Noi: barra visibile con il simbolo.
8. Nessun controllo interattivo sopra `safe-top` (stesso controllo `underStatus` del tour).
9. Test Impostazioni senza `usSettingsBack` ancora verde.
10. Maudit: il piano `nav` e i piani card non cambiano. La barra non è un piano.

## 6. File coinvolti (in una missione futura)
`identity.css` (blocchi `.top.us-premium-top` alle righe 184-191, 273-300, 316-376, da **consolidare in uno solo**), `ui-foundation.css` (token `--us-top-chrome-*`), `ui-foundation.js` o un piccolo modulo in `navigation.js` per lo stato `data-us-bar`, `index.html` (slot sinistro contestuale), `app.js` (`openNoiSection` per la pillola “‹ Noi”), test di layout esistenti (HUMAN-UI-02, M1 reconciliation).

**Nota di metodo:** HUMAN-UI-01 (barra rimossa e capsula flottante) è stato escluso dalla produzione e **non** è una base per questo lavoro. L'idea qui è diversa: la barra resta, perde il contenitore e torna disponibile risalendo.
