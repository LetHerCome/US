# Premi di Oggi e la scala dei premi

**Stato:** fase 1 in branch (`claude/premi-fase1-effetti`), fasi 2–4 da fare.
**Fonte:** grill-me D1–D25 del 25/11/2026 e tavola approvata https://claude.ai/artifact/M8dY8C3Rvu4Mwvb6Rnw362 (v5). Decisione: `docs/DECISIONS.md`, 2026-11-25 «Premi: una scala che cresce e parla della coppia».

## Fase 1 — Effetti e temi di Oggi (questa)
- `oggi-fx.js`: motore unico su canvas, un solo ciclo che disegna solo ciò che è a schermo, meno pezzi sui telefoni modesti, un fotogramma fermo con Riduci movimento. Otto effetti: hearts, petals, dandelions, snow, leaves, shooting, lanterns, memories.
- `oggi-look.js`: catalogo nuovo (4 temi, 8 effetti con gradino), via Il vostro cielo e le particelle CSS; anteprime della galleria e dei Premi dell'angolo dallo stesso motore; tocco/swipe in Foto a fuoco con la pillola «Torna a Oggi»; `burst()` per i momenti forti.
- `app.js`: il tocco in Foto a fuoco non esce più se c'è un effetto; `usOggiMemoriesForFx` (6 foto del giorno, URL firmati) e l'apertura del ricordo toccato; momento forte dopo un Ti penso ricevuto.
- `progression.js`: anteprime dei Premi dal motore unico; momento forte a fine del momento del livello.
- Migrazione `20261126000000_premi_oggi_effetti.sql` (solo staging, col sì): righe nuove degli effetti, livelli di Neve/Chiaro di luna/Stagioni, via le righe uscite (active = false), sblocchi già dati segnati come visti.

## Fase 2 — Ti penso
Il premio parte quando si apre il Ti penso, dopo la scena dei personaggi. Cuori (5) dagli occhi a cuore, nei due colori, che scoppiano al tocco. Lettera (15): busta nel colore di chi pensa, interno a cuoricini, sigillo di ceralacca col personaggio che si spezza, lembo, foglio che esce e viene avanti («Ti penso», firma, personaggio).

## Fase 3 — Countdown e Simbolo US
Countdown: escono Aurora, Orbita, Cromo (chi li aveva torna a Editoriale); entrano Calendario da strappare (3), Partenze a palette (9, girano al tocco), Filo rosso coi due personaggi (18). Simbolo US: Respiro → Battito (2), Riflesso → Due colori (8, ricolora il simbolo approvato: deciso dal founder), Costellazione resta (17).

## Fase 4 — Guardaroba
Dal livello 8 accessori più grandi e con un dettaglio animato (Gala papillon e colletto con luccichio, Cuffie con la nota, Coroncina coi fiori che ondeggiano, Corona con le gemme), ritocco di Occhiali e Sciarpina; animazioni solo dove il personaggio è grande. Le soglie per punti restano quelle di `personaggi.js`.

## Poi
Icone dell'app solo US Plus (fuori scala), fondo di Oro da ritoccare; icone alternative su iPhone più avanti. Pulizia: `sky.js` e `tests/sky.test.js` non più caricati, colonne `couples.sky_city/sky_minutes` inutilizzate.
