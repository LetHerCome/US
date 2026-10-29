# Mission — Premi Sintonia V2

**Status:** decisa il 29/10/2026 (`docs/DECISIONS.md`, «Nuova scala dei premi Sintonia»). Fase 1 in corso su staging. Non fa parte della patch unica #232–#237.
**Dove:** prima US-STAGING; in produzione solo con il via del founder, fase per fase.

## Fase 1 — senza immagini nuove

1. **Catalogo:**
   - livelli nuovi per i 21 premi di oggi (contorno nei livelli 2–12);
   - Istantanea e Filo d'oro tornano;
   - gli altri 12 premi spenti escono;
   - colonna `requires_plus`;
   - chi è già a un livello riceve i premi che gli spettano, segnati come visti.
2. **Premi Plus:** sbloccati con il livello e Plus della coppia, e una volta presi restano. Senza Plus si vedono con il lucchetto, senza acquisti.
3. **Anteprima** in Noi del prossimo premio principale, con la stima dei giorni sul ritmo delle ultime 2 settimane.
4. **Ti penso animato** (livello 5): chi lo riceve vede un'esplosione di cuori nei colori della coppia.
5. **Tema delle stagioni** (livello 10): l'attuale «Autunno» diventa un tema che cambia da solo con la stagione.
6. **Aurora** (extra Plus, livello 4): effetto animato sulla foto di Oggi.
7. **«Il vostro cielo»** (livello 20): la mappa delle stelle della sera di «Insieme dal» sulla città scelta; tema di Oggi e immagine da salvare. Oltre il 20, una stella in più a ogni livello.

## Fase 2 — con le immagini approvate

- Accessori I e II, corona e abiti «Gala» (Plus) per i 4 Compagni.
- Il drago che vola.
- Widget «Notte» e «Oro» (Android, nativo).
- Icone dell'app «Notte», «Oro» e «Neon» (Plus): Android, `activity-alias`.
- Cornice Istantanea, Filo d'oro, Ti penso «lettera».

## Acceptance

- Nessuna coppia perde un premio; nessuna ondata di annunci dopo la migrazione.
- I premi Plus non si attivano senza Plus e restano dopo la fine di Plus; nessun acquisto visibile finché Plus non è in vendita.
- Ogni premio principale ha la sua anteprima prima di essere sbloccato.
