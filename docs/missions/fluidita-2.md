# Mission — Fluidità 2: i momenti «fatto!»

**Status:** IN BRANCH
**Branch:** `claude/fluidita-2` (da `main` dopo #223)
**Origine:** confronto con Paired del 22/10/2026 (ogni passo ha un piccolo premio visivo) e richiesta del founder del 25/10/2026 («andiamo», dopo la proposta: prima Fluidità 2, poi l'accoglienza personalizzata).

## Goal

Ogni azione che fate insieme finisce con un piccolo «fatto!»: una vibrazione leggera, un segno visivo sul punto toccato, un messaggio chiaro. Gli stessi tre ingredienti dappertutto, senza schermate nuove e senza cambiare i dati.

## Cosa c'è già e va bene

| Momento | Oggi | Dove |
|---|---|---|
| Ti penso inviato | Il cuore prende il colore, due scintille, vibrazione `action`, messaggio | `app.js` `sendThinkSignal` |
| Missione completata | Il momento di Sintonia (XP) o messaggio + vibrazione `success` | `app.js`, `progression.js` |
| Risposte pronte | Il reveal della domanda del giorno: riempimento, i due cerchi che si avvicinano, la fioritura | `app.js` rituale Daily |
| Sblocco Sintonia | La card dello sblocco e la scintilla `burst` | `progression.js` |

## Cosa manca (lettura del codice, da verificare nel browser)

| # | Momento | Oggi | Cosa manca |
|---|---|---|---|
| A | Risposta del giorno inviata | Messaggio «Risposta inviata»; nessuna vibrazione. In errore: «Errore sync Today» | La vibrazione `success`; un testo d'errore umano («Non riesco a inviare la risposta. Riprova.») |
| B | Reazione inviata (Ti penso e domanda del giorno) | Solo il messaggio | Vibrazione `action` e un piccolo «pop» sulla reazione scelta |
| C | «Conserva in Ricordi» | Messaggio e la riga «Conservato» che si assesta (`is-fresh`) | Solo la vibrazione `success` |
| D | Ricordo aggiunto | Vibrazione, messaggio e il ricordo nuovo che si illumina una volta (`ricordi-new`, M12A) | Niente: c'era già, verificato nel codice |
| E | Idea aggiunta (Le vostre idee) | Solo il messaggio | Vibrazione `action` e la comparsa della riga nuova |

## Come

- **Un solo aiuto condiviso** in `ui-foundation.js`, per esempio `UsUiFoundation.done(el, {kind})`: vibrazione (`UsFeedback`), scintilla sul punto toccato (lo stesso disegno di `USProgression.burst`), nessun suono nuovo. Gli stessi tempi e la stessa curva delle animazioni che ci sono già.
- **Riduci animazioni:** resta la vibrazione (se le vibrazioni sono attive) e il messaggio; niente movimento.
- **Testi:** gli errori diventano frasi umane in italiano inclusivo, con l'inglese allineato. Nessun testo tecnico («sync», «Today») davanti alle persone.
- **Nessun cambio** a dati, RPC, notifiche o schermate.

## Fuori scope

Nuove funzioni, l'accoglienza personalizzata (missione successiva), Gioca e i giochi (hanno già i loro momenti), il check-in (congelato su staging).

## Acceptance

- I cinque momenti A–E hanno vibrazione, segno visivo e messaggio, misurati nell'app vera con il backend finto.
- Con «riduci animazioni» niente movimento; vibrazioni solo se attive nelle impostazioni.
- Nessun «Errore sync Today» o altro testo tecnico nelle stringhe toccate; inglese allineato.
- Test mirati, `npm test`, `npm run build:cloudflare-pages`, `git diff --check`. Poi staging, e la produzione solo con l'OK del founder.
