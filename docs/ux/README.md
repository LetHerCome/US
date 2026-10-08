# US Premium UX: blueprint (indice)

**Stato:** `US_PREMIUM_UX_BLUEPRINT_READY_FOR_REVIEW`. Solo analisi, design e pianificazione: nessun codice runtime, SQL, asset di produzione, PR, merge o deploy.
**Missione:** [`docs/missions/us-premium-ux-maudit-product-review-v1.md`](../missions/us-premium-ux-maudit-product-review-v1.md) · **Baseline:** `main` @ `df7760b`

## Documenti
| # | File | Contenuto |
|---|---|---|
| 1 | [`US_PREMIUM_UX_AUDIT.md`](US_PREMIUM_UX_AUDIT.md) | audit critico per schermata, scorecard, problemi di sistema, valutazione commerciale, criteri di accettazione misurabili |
| 2 | [`US_TOPBAR_OPTIONS.md`](US_TOPBAR_OPTIONS.md) | tre alternative misurate nel browser, tabella di verità, raccomandazione A+B con “‹ Noi” |
| 3 | [`MASCOTTE_SINTONIA_REWARDS_VISION.md`](MASCOTTE_SINTONIA_REWARDS_VISION.md) | Compagni: Maudit nella collezione, 4 nuovi animali, 14 sblocchi, UX, diritti senza SQL e con migrazione additiva, compatibilità |
| 4 | [`US_NATIVE_SHEETS_DESIGN_SYSTEM.md`](US_NATIVE_SHEETS_DESIGN_SYSTEM.md) | grammatica a 4 tipi, token attuale → proposto, gesti, inventario delle finestre |
| 5 | [`US_PREMIUM_UX_ROADMAP.md`](US_PREMIUM_UX_ROADMAP.md) | P0–P4 con dipendenze, file, stime, accettazione, gate; compatibile con MC3 |
| 6 | [`../ux-concepts/us-premium-concepts.html`](../ux-concepts/us-premium-concepts.html) (+ `.png`) | 4 concept statici isolati, **non** UI di produzione |

## Verdetto: se potessimo cambiare solo 3 cose
1. **Una sola grammatica per le finestre** (alert · foglio con maniglia vera · dettaglio immersivo · celebrazione), niente card dentro i fogli, sblocco Sintonia dentro il sistema modale.
2. **Barra compatta e scroll-aware**: +12 px misurati ovunque, +62 nelle sottosezioni di Noi; Ti penso e busta raggiungibili a metà pagina; Ti penso a 44 px.
3. **Sintonia attorno ai Compagni**: Maudit primo compagno posseduto, Ciottolo come primo nuovo animale, stop agli annunci dei cosmetici invisibili, un solo vocabolario (niente XP/LV/Bond in UI).

## Evidenze (fuori dal repository, cartella QA del progetto)
`/mnt/project-files/qa/us-premium-ux-maudit-audit-v1/`
- `screens/`: 60 screenshot (30 stati × 390×844 e 320×568) + `tour-log.txt` con metriche per stato
- `topbar/`: 60 screenshot dei concept di barra + `topbar-measurements.json`
- `harness/`: `tour.mjs`, `steps.mjs`, `measure-topbar.mjs`, `fake-supabase.js` (app reale + Supabase finto + PGlite; niente rete, niente Supabase)

## Decisioni richieste a Francesco (riassunto)
1. Grammatica a 4 tipi per le finestre e regola “mai card nel foglio”.
2. Barra: default A+B con “‹ Noi” nelle sottosezioni di Noi (non in Impostazioni, per il contratto M1).
3. Maudit compagno posseduto da subito; primo nuovo compagno Ciottolo; nome della famiglia “Compagni”.
4. Smettere di annunciare accenti ed effetti, senza disattivarli.
5. In P3, una migrazione additiva `companion`/`companion_item` con ordine client → migrazione → annuncio.
6. Togliere XP, LV, Bond e Punti dalla UI; rarità ed XP fuori dalle card Quest (direzione per M12C).
7. Lettura immersiva di *Lasciato per te*; Ricordi a griglia.
8. Primo focus dei fogli sul titolo invece che sulla X (cambia il contratto in `tests/ui-foundation.test.js`); nel frattempo, anello solo con `:focus-visible`.
9. Da pianificare a parte: fuso orario per coppia (oggi `Europe/Rome` fisso), un blocco per la vendita fuori dall'Italia.
