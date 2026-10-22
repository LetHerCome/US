# Mission — Fluidità 1

**Status:** IN BRANCH
**Branch:** `claude/payred-app-comparison-b2594e`
**Origine:** richiesta del founder del 22/10/2026: rendere l'esperienza «fluida e carina» prendendo ispirazione da Paired, senza cambiare il core di US.

## Come è stato misurato

L'app vera è stata aperta nel browser, a 390×844, con il backend finto della suite di test (la coppia di prova di `tests/helpers/countdown-browser.js`), senza Service Worker. Poi è stato letto il codice delle azioni principali.

**Cosa c'è già e va bene:**
- dopo foto, Ti penso, missioni e giochi arrivano un messaggio, una vibrazione (`UsFeedback`) e, dove serve, un'animazione;
- i pulsanti hanno il «press» del mockup e le card uno `:active`;
- i fogli si aprono e si chiudono in meno di mezzo secondo.

**Cosa si sente:**

| # | Attrito | Misura | Dove |
|---|---|---|---|
| A | Cambiare scheda fa aspettare | Il contenuto della scheda compare dopo **~490 ms** da ogni tocco della barra; tutta la transizione dura circa 1 s | `due-colori.js`: `COVER_MS = 440`, poi `REVEAL_MS = 560` |
| B | Le prime aperture mostrano una scritta di attesa | Nessun segnaposto: «Carico il calendario…», «Carico i vostri eventi…», «Carico…» con un'icona che gira | `index.html`, `noi-v2.js`, `app.js` (Ricordi) |
| C | Un testo non inclusivo nel momento più usato | «Le risposte si sbloccano quando avete risposto **entrambi**» (e altri 4 punti con «entrambi») | `app.js`, `index.html` |

## Cosa si fa

1. **B — Segnaposto al posto delle scritte.**
   - Una primitiva `us-skeleton` in `ui-foundation.css`: blocchi nella forma del contenuto che arriverà, con un riflesso lento; ferma con «riduci animazioni».
   - Una classe `us-sr` per i lettori di schermo, che continuano a sentire «Carico…».
   - Usata nei primi caricamenti di Noi (calendario, eventi, momenti del giorno) e di Ricordi.
   - Nessun cambio di dati né di logica: cambia solo cosa si vede mentre si aspetta.
2. **C — Testi inclusivi:** «entrambi» diventa «voi due», o una frase equivalente, nelle stringhe dell'interfaccia, con l'inglese allineato.
3. **A — Transizione tra schede: decisione del founder.** È copiata dal mockup approvato «Due colori», quindi non si cambia senza un tuo sì. Le opzioni:
   - **Lasciarla com'è** (~490 ms).
   - **Accorciarla, consigliato:** copertura 440 → 260 ms e rivelazione 560 → 340 ms. Il contenuto compare dopo ~280 ms; stesso disegno e stessa onda di colore, solo più svelta.
   - **Toglierla:** cambio istantaneo con una dissolvenza breve, come già succede con «riduci animazioni».

## Fuori scope

Nuove funzioni, ridisegni di schermate, Gioca, il check-in (resta su staging).

## Acceptance

- I segnaposto compaiono al primo caricamento e spariscono quando arrivano i dati. Leggibili dai lettori di schermo; fermi con «riduci animazioni».
- Nessun «entrambi» nelle stringhe dell'interfaccia toccate; l'inglese corrisponde.
- Test mirati, `npm test`, `npm run build:cloudflare-pages`, `git diff --check`. Controllo visivo nel browser con il backend finto.
