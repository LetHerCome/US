# Fogli, finestre e momenti di sblocco: un solo sistema

**Stato:** BLUEPRINT · nessuna modifica a `ui-foundation.css` / `ui-foundation.js` in questa missione
**Autorità da estendere, non da sostituire:** `UsUiFoundation` (`ui-foundation.js`: focus trap, `inert` sul resto, Escape, `data-us-surface`, `exitSurface`, `confirm()`/`notice()`), `ui-foundation.css` (`.us-sheet`, `.us-modal-backdrop`, `.us-modal-close`, token di layer, motion e vetro), `navigation.js` (Back).
**Evidenze:** screenshot del tour in `/mnt/project-files/qa/us-premium-ux-maudit-audit-v1/screens/` (390×844 e 320×568).
**Legenda:** **[F]** fatto · **[G]** giudizio · **[H]** ipotesi

---

## 1. Diagnosi

US ha già una base giusta: un solo materiale di vetro L3, un solo scrim (`rgba(6,3,10,.44)` + blur 6 px), un solo bottone di chiusura da 44 px, una sola conferma (`UsUiFoundation.confirm`), il focus trap e il ritorno del focus all'apertore. **[F]** `ui-foundation.css:660-740`, `ui-foundation.js:196-300`

Quello che manca è una **grammatica**: oggi decide ogni feature.

| Problema | Evidenza |
|---|---|
| Fogli in basso e fogli centrati usati per lo stesso tipo di compito: *Lasciato per te* (lettura e composizione) è centrato, Eventi, Domanda e Countdown sono in basso | **[F]** `is-floating` su LFY/composer/camera/Ti penso; `is-bottom` su Countdown, Today, Eventi, Settings, Conservati, Calendario |
| **Maniglie decorative senza gesto**: il foglio Impostazioni e il compositore di Ricordi mostrano un grabber, ma nessun foglio si chiude trascinando | **[F]** `index.html:684,694`, `moments-albums.js:691`; nessun handler di drag in `ui-foundation.js`; unico swipe: `momentViewer` (`app.js:3159`) |
| **Il momento di sblocco è fuori dal sistema**: `#usProgressionUnlock` non è `[data-us-modal]`, quindi niente focus trap, niente `inert`, niente Escape, niente Back, e uno scrim proprio `.70` + blur 12 | **[F]** `index.html:812`, `progression.css:218` |
| **Layer fuori scala**: Impostazioni 10090, Conservati 10130, Calendario 10140/10145, lightbox album e sblocco 10120, contro una scala che dichiara sheet = 10060 | **[F]** `settings.css:6`, `moments-albums.css`, `calendar.css`, `progression.css:218` |
| **Fogli dentro fogli**: dettaglio e form del Calendario si aprono come secondo `is-bottom` dentro il foglio Calendario | **[F]** `index.html:904,920` |
| **Card dentro il foglio**: la Domanda del giorno mette domanda, campo e pulsante in una card con bordo, dentro un foglio con bordo; il Countdown mette l'anteprima in una card scura dentro il foglio | **[F]** `07-daily-sheet-390x844.png`, `11-countdown-sheet-390x844.png` |
| **La X si accende con un anello rosa all'apertura** (Domanda, LFY, Eventi, Calendario), mentre nel Countdown e nelle Impostazioni no | **[F]** screenshot 07, 09, 18, 19. **[F]** all'apertura il focus va sulla X (`[data-us-modal-close]`, `ui-foundation.js:254-258`); **[H]** l'anello è lo stile di focus mostrato anche senza tastiera |
| **Ti penso ricevuto**: in primo piano arriva solo un toast “… ti pensa ♡”, mentre il sheet `#thinkArrival` resta per altri percorsi | **[F]** `08-think-arrival-390x844.png` |
| **Distruttivo in evidenza**: nel viewer del ricordo “Elimina” è il primo bottone sotto il titolo, rosa pieno; “Aggiungi foto” fluttua sopra il riquadro vuoto e ne taglia il testo (“Solo la foto principal…”) | **[F]** `23-moment-viewer-390x844.png` |
| Il bottone “Annulla” della conferma riceve l'anello di focus e sembra il primario | **[F]** `30-confirm-390x844.png` |

**[G]** Il risultato è un'app in cui ogni finestra è bella da sola, ma il sistema non si impara: l'utente non sa se può trascinare, dove trova la chiusura, né perché una cosa appare al centro e un'altra in basso.

---

## 2. La gerarchia: quattro tipi, nient'altro

| Tipo | Quando | Forma | Chiusura | Esempi |
|---|---|---|---|---|
| **1 · Alert** | una decisione binaria, spesso distruttiva | piccolo, in basso, larghezza piena meno 12 px, raggio 24 | solo i due bottoni + Escape/Back = annulla | `UsUiFoundation.confirm`, eliminazioni, logout |
| **2 · Foglio contestuale** | un compito breve legato a ciò che c'è sotto | in basso, **altezza al contenuto** fino al 92% (detent unico “auto”), maniglia **che funziona** | trascina giù, tocco sullo scrim, X, Back | Domanda del giorno, Countdown, Impostazioni (righe), Eventi, compositore LFY, form Calendario |
| **3 · Dettaglio immersivo** | contenuto da guardare: foto, messaggi, calendario, compagno | **a tutto schermo** (sotto la status bar), niente scrim visibile | “‹” in alto a sinistra o X in alto a destra (una sola delle due per tipo), swipe giù per le foto | viewer Ricordi, album, Stories, Lasciato per te (lettura), Calendario mese, scheda Compagno |
| **4 · Celebrazione** | qualcosa di nuovo è vostro | card centrata e grande, scrim più scuro, entrata con scala | solo i suoi due bottoni + Back = “Non ora” | sblocco Sintonia, nuovo compagno, nuovo livello |

Regole:
- **Mai due fogli impilati.** Un secondo livello dentro un foglio è una **pagina dentro lo stesso foglio** (push laterale con “‹” e titolo), come già fanno l'editor Countdown e il form Eventi. Il Calendario passa da “foglio con fogli” a “dettaglio immersivo con push interni”.
- **Mai card dentro un foglio**, se non per il contenuto stesso (foto, anteprima di un premio). I campi stanno direttamente sul materiale del foglio.
- **Lasciato per te**: la **lettura** diventa un dettaglio immersivo (tipo 3): la lettera occupa lo schermo, come aprire una busta. La **composizione** diventa un foglio contestuale (tipo 2), sopra la tastiera.
- **Ti penso ricevuto** resta un avviso effimero sopra la nav, senza diventare un modale. È la scelta giusta: non interrompe. Va però allineato al tipo “avviso” della §5.

---

## 3. Specifica visiva (token `attuale → proposto`)

| Token | Attuale | Proposto | Perché |
|---|---|---|---|
| `--us-radius-sheet` | 29px | **28px** | un solo raggio “di sistema”, multiplo di 4 |
| `--us-radius-alert` | — (usa sheet) | **24px** | gerarchia: l'alert è più piccolo |
| `--us-radius-card` | 20px | **18px** | oggi convivono 14/15/16/17/18/20/22/24 px (**[F]** conteggio CSS: 29 valori px diversi di `border-radius`); due livelli bastano |
| `--us-scrim` | rgba(6,3,10,.44) + 6px | **rgba(6,3,10,.40) + 0px** per i fogli contestuali; **.62 + 0px** per celebrazione e alert | il blur sotto lo scrim costa GPU su Android medio e confonde il vetro del foglio con quello dello sfondo; iOS usa un dimming senza blur |
| `--us-glass-3-bg` | 4 gradienti sovrapposti | **un colore solido** `#16111c` al 94% + **un** gradiente di luce in alto | leggibilità e costo di paint; il vetro resta, ma pulito |
| `--us-glass-3-blur` | blur(28px) saturate(1.35) | **blur(24px) saturate(1.2)** solo sui fogli; **nessun blur** su celebrazione e immersivo | meno layer compositi |
| maniglia | decorativa, 2 fogli su 9 | **36×5 px**, `rgba(255,255,255,.28)`, area di presa 44 px, **su tutti i tipi 2**, con il gesto | affordance vera |
| `--us-sheet-pad` | varia (14–22) | **20px** laterali, **8px** sopra la maniglia, `max(20px, safe-bottom)` sotto | ritmo unico |
| Titolo foglio | eyebrow 10px + serif 24px | **serif 22/26**, eyebrow solo se aggiunge contesto (non “OGGI” sopra “La domanda di oggi”) | togliere ripetizioni |
| `.us-modal-close` | 44px, sfondo vetro L2, anello al focus | 44px di bersaglio, **cerchio visivo da 30 px**, anello **solo con `:focus-visible`** | più leggero, come nei fogli iOS |
| `--us-motion-sheet` | 260ms, `--us-ease-enter` | entrata **340ms** `cubic-bezier(.32,.72,0,1)` (curva con decelerazione lunga, senza rimbalzo), uscita **220ms** `--us-ease-exit` | sensazione fisica senza molle che oscillano |
| `--us-motion-celebrate` | — | 420ms, scala .92→1 + opacità; reduced motion: 1ms | |
| Layer | 10060 / 10090 / 10120 / 10130 / 10140 / 10145 | **sheet 10060 + 10 per livello di stack** calcolato da `ui-foundation.js`; celebrazione = `--us-layer-reward: 10120` come token | una scala sola |
| Bottone distruttivo | `us-btn-danger` (esiste, opt-in con `tone:'danger'`) | **obbligatorio** per ogni “Elimina”; mai il gradiente rosa | colore = significato |

### Tastiera
- Il foglio contestuale con un campo si appoggia a `visualViewport`: `bottom = window.innerHeight - visualViewport.height - visualViewport.offsetTop`, già noto a `fix4.js` (classe `us-keyboard-open`). Il campo attivo resta visibile e l'azione primaria sta **sopra** la tastiera, non sotto.
- **[H]** Va provato su iOS PWA standalone, dove `visualViewport` cambia senza resize, e su Android con `adjustResize` (Capacitor).

### Gesti e chiusura (tipo 2)
- Trascinare la maniglia o la testata: il foglio segue il dito (`transform` diretto, nessuna transizione). Se si rilascia oltre il 30% dell'altezza o con velocità > 0,6 px/ms si chiude, altrimenti ritorna con la curva di entrata.
- Il trascinamento parte **solo** dalla maniglia, dalla testata o da un contenuto già scrollato in cima. Non si combatte mai con lo scroll interno.
- Se il foglio contiene modifiche non salvate (Countdown, form, composer con testo): trascinare **non chiude**. Il foglio torna su e mostra un alert “Eliminare la bozza?”. È la stessa regola di iOS.
- Back hardware/gesto iOS = chiudi il livello più alto (già garantito da `navigation.js` dopo la stabilizzazione pre-native).

### Accessibilità (invariata, estesa)
- Ogni tipo 1–4 è `[data-us-modal]` con `role="dialog"` o `alertdialog`, `aria-modal`, etichetta, focus trap, ritorno del focus, `inert` sul resto, Escape. **Lo sblocco Sintonia oggi no: va portato dentro.**
- Focus iniziale: **oggi va sulla X per contratto** (`tests/ui-foundation.test.js:156`, “il primo focus deve andare al close della superficie”). Subito: l'anello solo con `:focus-visible`, così il tocco non lo accende. Proposta da decidere: spostare il primo focus sul **titolo** (`tabindex="-1"`), così lo screen reader legge prima di cosa si tratta, come nei fogli di sistema. Serve cambiare quel contratto, quindi è una decisione di Francesco.
- Il gesto di trascinamento ha sempre un'alternativa (X o Back).
- Riduzione del movimento: entrata e uscita a 1 ms, nessuna scala nella celebrazione, il trascinamento resta.

---

## 4. Il momento di sblocco, rifatto

```
┌──────────────────────────────────────┐
│ NUOVA CORNICE · 1 di 2               │ eyebrow + contatore coda
│                                      │
│   ┌──────────────────────────────┐   │
│   │                              │   │ ANTEPRIMA REALE, larga 100%:
│   │   (la VOSTRA foto di Oggi    │   │ la cornice applicata alla vera
│   │    con la cornice Istantanea)│   │ foto corrente, non a un placeholder
│   │                              │   │
│   └──────────────────────────────┘   │
│                                      │
│ Istantanea                           │ serif 30
│ Il bordo avorio di una foto          │ 15/secondario, 2 righe max
│ istantanea.                          │
│ ◉ Sulla foto di Oggi                 │ “dove vivrà”, già presente
│                                      │
│ [        Usala ora        ]          │ primario a tutta larghezza
│            Non ora                   │ testo, sotto
└──────────────────────────────────────┘
```
- **Anteprima reale:** cornici e adesivi sulla vera foto di Oggi (URL firmato già in cache), temi su una miniatura della vera Noi, compagni come animale grande in `react` una volta. Oggi l'anteprima usa un gradiente generico (**[F]** `16-unlock-390x844.png`).
- **“Usala ora”** applica il premio e **porta l'utente dove vive**: chiude, naviga a Oggi se è una cornice o a Noi se è un ritratto, e il premio appare con `playOnce` per 600 ms. Oggi il premio si applica senza mostrarlo (**[H]** dal codice, `useUnlock` → `equipReward` senza navigazione).
- **“Non ora”** (al posto di “Più tardi”): stesso `ack`, testo più onesto, perché il premio resta in collezione.
- Dopo la chiusura il compagno attivo fa `react('reward')`, come già avviene.
- Più sblocchi insieme: un solo foglio con contatore e swipe orizzontale tra le card, non una sequenza di modali.
- Accenti ed effetti (vedi documento Compagni) non hanno più un momento proprio.

---

## 5. Avvisi non modali (toast, stato, aggiornamento, nudge, Ti penso)

Oggi sono quattro oggetti diversi sopra la nav (toast z 30, nudge 65, status/update 70, Ti penso 10030). **[F]** `ui-foundation.css:17-27`, `fix4.css:13`

Proposta: **una “pillola di avviso”** sopra la nav, con priorità `errore > Ti penso > Domanda > toast`. Mostra un avviso alla volta e mette in coda gli altri (massimo 1 in attesa). Stessa forma per tutti: altezza 44, raggio pieno, icona Phosphor, testo 14/600, un'azione opzionale a destra.

Il **nudge della Domanda** (oggi una card larga che Maudit copre in parte, **[F]** `06-oggi-daily-390x844.png`) diventa questa pillola.

---

## 6. Inventario: selettore → tipo desiderato

| Superficie | Selettore | Oggi | Tipo desiderato | Note |
|---|---|---|---|---|
| Conferma | `UsUiFoundation.confirm` / `.us-confirm-sheet` | foglio piccolo flottante | **1 Alert** | il “danger” va reso obbligatorio per le eliminazioni |
| Domanda del giorno | `#today .today-sheet` | is-bottom, card nel foglio | **2 Foglio** | togliere la card interna e l'eyebrow “OGGI” |
| Countdown | `#usCountdownSheet` | is-bottom con lista ↔ editor | **2 Foglio** con push interno | anteprima a tutta larghezza, senza card |
| Impostazioni (righe) | `#usSettingsOverlay` | is-bottom, z 10090, maniglia finta | **2 Foglio** | layer al token |
| Widget | `#usWidgetHub` | is-bottom, maniglia finta | **2 Foglio** | |
| Eventi | `#usEventsOverlay` | is-bottom, form interno | **2 Foglio** con push | “Prossimo” ripete la prima riga della lista: tenerne una |
| Conservati | `#conservatiOverlay` | is-bottom, z 10130 | **3 Immersivo** | è una raccolta da sfogliare |
| Calendario | `#usCalendarOverlay` + `#usCalendarDetailSheet` + `#usCalendarFormSheet` | foglio a tutta altezza + fogli annidati, z 10140/10145 | **3 Immersivo** con push interni | elimina l'annidamento |
| Lasciato per te, lettura | `#leftForYouOverlay` | is-floating centrato | **3 Immersivo** | la lettera prende lo schermo |
| Lasciato per te, composizione | `#leftForYouComposerOverlay` | is-floating | **2 Foglio** sopra la tastiera | |
| Fotocamera LFY | `#leftForYouCameraOverlay` | is-floating | **3 Immersivo** (nero, a tutto schermo) | come la fotocamera di sistema |
| Viewer ricordo | `#momentViewer` | immersivo con swipe | **3 Immersivo** | “Elimina” nel menu “···”, mai primario |
| Album / lightbox | `.us-album-shell`, `#usAlbumLightbox` (z 10120) | immersivo | **3 Immersivo** | layer al token |
| Compositore ricordo | `.us-moment-compose-sheet` | is-bottom con maniglia finta | **2 Foglio** | |
| Stories | viewer/camera/preview (`stories.js`) | immersivo z 10050 | **3 Immersivo** | invariato |
| Ti penso ricevuto | `#thinkArrival` + toast | foglio flottante transitorio / toast | **Avviso** (§5) | |
| Sblocco Sintonia | `#usProgressionUnlock` | overlay custom, fuori sistema | **4 Celebrazione** | entra in `[data-us-modal]` |
| XP / livello | `#usXpCelebration`, `#usLevelCelebration` (`polish4.js`) | toast custom | **Avviso** (§5) per gli XP; **4** solo per il livello | “+20 XP Bond” va riscritto senza XP (vedi audit) |
| Nudge Domanda | `#usDailyNudge` | card sopra la nav | **Avviso** (§5) | |
| Status / update | `#appStatusBar`, `#appUpdateBar` | barre sopra la nav | **Avviso** (§5), priorità errore | |
| App lock | `#usAppLock` | schermo intero | invariato (fuori da questa grammatica) | Native Security V1 |
| Login | `#authOverlay` | schermo intero | invariato; stile del primo avvio in MC3 | non toccare finché MC3 è in corso |

---

## 7. Priorità sulle finestre ad alto traffico

1. **Sblocco Sintonia** dentro `[data-us-modal]`, con anteprima reale e navigazione al luogo. È quello che rende i premi desiderabili.
2. **Domanda del giorno**: foglio senza card interna, focus sul titolo, azione sopra la tastiera.
3. **Lasciato per te**: lettura immersiva e composizione come foglio. Sono il gesto e la ricezione più emotivi dell'app.
4. **Countdown**: anteprima a tutta larghezza, maniglia che funziona, alert per la bozza.
5. **Viewer foto**: “Elimina” spostato nel menu, “Aggiungi foto” non sovrapposto.
6. **Gioca**: il pannello di gioco è già una pagina; va uniformato solo il titolo e il back “‹ Gioca” al pattern della barra (vedi top bar).
7. **Impostazioni**: maniglia vera, layer al token.

## 8. Riferimenti

Sono ispirazione, non regole da copiare: Apple HIG [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout). Le pagine HIG non sono leggibili da questo ambiente (richiedono JavaScript), quindi i principi citati vengono dalla conoscenza della guida e **non** da una lettura fatta in questa missione: foglio = compito circoscritto legato al contesto, dimensioni con detent, maniglia solo se il foglio si ridimensiona o si trascina, conferma prima di scartare modifiche, niente fogli impilati, alert rari e con stile distruttivo, movimento che comunica e rispetta Reduce Motion, bersagli di almeno 44×44 pt.

**Adattamento ad Android [G]:** stessa grammatica, perché il bottom sheet modale è nativo anche in Material. Back di sistema = chiudi. Niente rimbalzo iOS-only. Nessun asset o glifo Apple: solo Phosphor (`AGENTS.md`).
