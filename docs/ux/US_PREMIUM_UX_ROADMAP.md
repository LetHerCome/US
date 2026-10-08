# US Premium UX: roadmap di implementazione

**Stato:** PIANO · nessuna implementazione in questa missione
**Dipendenze esterne:** MC3 (onboarding, worktree di Codex, in corso) · M12C Quest/Risonanza · M12D Settings restructure · Live Games / Pulse (`CURRENT_STATE.md`)
**Regole che valgono per ogni incremento** (`AGENTS.md`, memoria di progetto):
- un branch per missione;
- commit separato per ogni milestone;
- test mirati, `npm test`, `npm run build:cloudflare-pages`, `git diff --check`;
- QA a 320×568, 390×844 e 844×390 con l'harness del tour;
- se cambia il runtime: bump unico di `us-build` + `version.json` + `CACHE_NAME` del SW per release candidate;
- nessun merge, deploy o modifica Supabase senza autorizzazione esplicita;
- Android widget invariati.

**Stima:** giorni-ingegnere (gg) per un agente con review. Bande: S ≤ 1 gg · M 2–4 gg · L 5–8 gg · XL > 8 gg.

---

## Grafo delle dipendenze

```
P0 (subito, MC3-safe) ──────────────────────────────┐
                                                    ▼
MC3 merge ──► P1.1 CSS consolidation ──► P1.2 barra ──► P1.3 grammatica fogli ──► P1.4 sblocco nel sistema
                                                                      │
                                                                      ▼
                                       P2.1 Maudit in Sintonia ──► P2.2 scheda Compagno + preferenza per account
                                                                      │
                     arte Ciottolo APPROVED ───────────────┐          ▼
                                                           ▼   P3.1 client compatibile `companion`
                                                   P3.2 migrazione additiva (CLI, non applicata)
                                                           ▼
                                                   P3.3 annuncio (announce=true, autorizzato)
                                                           ▼
                                                   P3.4+ Nodo, Spillo, Lume (uno per volta)
P4 (store, device QA) dopo P1–P3.3
```

---

## P0: correzioni sicure, non invasive, compatibili con MC3

Non toccano auth, bootstrap, `app.js` né i file di onboarding: possono partire **mentre MC3 è in corso**.

| # | Incremento | File probabili | Prereq | Stima | Accettazione visibile | SQL/Edge/native |
|---|---|---|---|---|---|---|
| P0.1 | Ricordi vuoto: glifo e titolo non più sovrapposti | `moments-albums.css` | — | S | `22-ricordi-empty` a 320 e 390 senza sovrapposizione | no |
| P0.2 | Viewer ricordo: “Aggiungi foto” non sovrapposto al riquadro; “Elimina” nel menu “···” con `confirm({tone:'danger'})` | `moments-albums.js/.css` | — | S | il testo del riquadro vuoto è intero; nessun bottone pieno distruttivo a riposo | no |
| P0.3 | Bersagli a 44: Ti penso, ingranaggio Noi, “‹ Noi”, chip compositore LFY | `identity.css`, `left-for-you.css`, `styles.css` | — | S | metrica `small` del tour vuota per questi id | no |
| P0.4 | Gioca a 320: tile modalità senza overflow orizzontale | `games.css` | — | S | `overflow:false` e nessun elemento oltre `innerWidth` | no |
| P0.5 | Maudit non si posa su card la cui prima riga di testo è entro 40 px dal bordo; a 320 preferisce la nav | `pet.js` (solo la funzione piani) | test esistenti di Maudit | S–M | a 320 nessuna sovrapposizione PET/testo in Gioca e Impostazioni | no |
| P0.6 | Anello di focus della X solo con `:focus-visible` (il primo focus **resta** sulla X: è un contratto testato in `tests/ui-foundation.test.js:156`) | `ui-foundation.css` e i CSS feature che ridefiniscono il focus | — | S | aprendo Domanda, LFY, Eventi e Calendario col dito la X non mostra l'anello; con la tastiera sì; `ui-foundation.test.js` verde | no |
| P0.7 | Eventi: il “Prossimo” non si ripete nella lista | `events.js` | — | S | 1 sola occorrenza del primo evento | no |

**Gate P0:** test esistenti di Maudit (`pet-*`), navigazione e soak, i test M1/HUMAN-UI-02 che pinnano la shell, tour completo. Rischio regressione basso. Nessun dato toccato.

---

## P1: fondamenta di shell e fogli (dopo il merge di MC3)

Aspetta MC3 perché tocca `index.html` e i file di shell che l'onboarding può cambiare.

| # | Incremento | File | Prereq | Stima | Accettazione | SQL/Edge/native |
|---|---|---|---|---|---|---|
| P1.1 | **Consolidamento CSS senza redesign**: un solo blocco `.top.us-premium-top`, z-index letterali → token (`--us-layer-*`), raggi a 2 token, eliminazione dei duplicati con `!important` dove non cambiano il calcolato | `identity.css`, `styles.css`, `fix4.css`, `settings.css`, `calendar.css`, `moments-albums.css`, `ui-foundation.css` | MC3 in main | L | **pixel-diff** del tour prima/dopo ≤ 0,5% per stato; 0 `z-index` ≥ 10000 letterali | no |
| P1.2 | **Barra compatta + scroll-aware + “‹ Noi”** (vedi `US_TOPBAR_OPTIONS.md` §3–5) | `identity.css`, `ui-foundation.css/.js` o `navigation.js`, `index.html`, `app.js` (`openNoiSection`) | P1.1 | M | i 10 test di accettazione della top bar | no; da provare su iOS PWA e Capacitor |
| P1.3 | **Grammatica dei fogli**: maniglia con gesto su tutti i fogli contestuali, scrim senza blur, token di motion, alert distruttivo obbligatorio, niente card nei fogli (Domanda, Countdown, Partita) | `ui-foundation.css/.js`, `index.html`, `app.js`, `countdown.css`, `games.css` | P1.1 | L | trascinare chiude (o chiede per le bozze); nessun foglio impilato; Back chiude solo il livello in cima (soak) | no |
| P1.4 | **Sblocco dentro `[data-us-modal]`** + anteprima reale + “Usala ora” che porta al luogo + “Non ora” | `progression.js/.css`, `index.html` | P1.3 | M | focus trap, Escape, Back = Non ora; la cornice appare sulla vera foto di Oggi | no |
| P1.5 | **Lasciato per te**: lettura immersiva, composizione come foglio sopra la tastiera, mittente una sola volta | `left-for-you.js/.css`, `index.html` | P1.3 | M | test LFY esistenti verdi; a 320 tutti i 5 tipi leggibili | no |
| P1.6 | **Calendario** immersivo con push interni (niente fogli annidati), celle ≥ 44 | `calendar.js/.css`, `index.html` | P1.3 | L | F / B / F+B ancora testuali; test calendario esistenti verdi | no |
| P1.7 | **Pillola di avviso unica** (toast, nudge Domanda, status, update, Ti penso, XP) | `fix4.css`, `polish4.js`, `home-cleanup.js`, `app.js` | P1.3 | M | un solo avviso visibile alla volta; priorità errore > Ti penso > Domanda > toast | no |
| P1.8 | **Vocabolario**: via XP / LV / Bond / Punti dalla UI | `progression.js`, `polish4.js`, `index.html`, `settings.js` | — | S | 0 occorrenze nel DOM renderizzato del tour | no |

**Gate P1:** suite completa, tour completo con pixel-diff e metriche, build Cloudflare, build web Capacitor (`node scripts/build-capacitor-web.mjs` su Linux; quella completa su Windows), **prova su dispositivo** Android (Xiaomi) e iOS per barra e tastiera. Un solo release candidate per P1 con bump coerente di build/SW.

---

## P2: Maudit dentro Sintonia (senza SQL)

| # | Incremento | File | Prereq | Stima | Accettazione | SQL/Edge/native |
|---|---|---|---|---|---|---|
| P2.1 | **Famiglia Compagni** in collezione con Maudit “Con voi dall'inizio”; riorganizzazione (Compagni → Prossimo → Cornici/Countdown → Temi → Ritratti → Dettagli chiusi); accenti ed effetti **non** annunciati lato client (filtro della coda, senza toccare il catalogo) | `progression.js/.css` | P1.4 | M | la prima card di Sintonia è Maudit; nessuna schermata di sblocco per accent/effect | no |
| P2.2 | **Scheda Compagno** (dettaglio immersivo) + Impostazioni “Compagno · Maudit” + chiave `us:companion:v1:<couple>:<profile>` con migrazione dalle chiavi `us:maudit:v1:*` (lette, non cancellate) | `pet.js`, `progression.js`, `settings.js`, `index.html` | P2.1 | M | due account sullo stesso telefono hanno posizione e on/off separati; rollback a P1 senza perdita | no |
| P2.3 | **Filtri difensivi**: la coda di sblocco e “Prossimo sblocco” ignorano le categorie che il client non conosce | `progression.js` | — | S | test unitario con un reward `category:'companion'` sconosciuto → nessuna card vuota | no |
| P2.4 | *(opzionale)* accessorio di Maudit come “IN PIÙ” di un premio esistente (pattern Stili Countdown) | `pet.js`, `progression.js`, asset nuovo | asset approvato | M | appare solo se il premio ospite è sbloccato lato server | no SQL; **asset** |

**P2.3 deve arrivare in produzione e restare per almeno un ciclo di aggiornamento del SW prima di P3.2.**

---

## P3: nuovi compagni (arte approvata + estensione del catalogo)

| # | Incremento | File | Prereq | Stima | Accettazione | SQL/Edge/native |
|---|---|---|---|---|---|---|
| P3.0 | **Specifica e arte di Ciottolo** (sul modello di `us-pet-asset-spec-v1.md`): tavola di 4 pose statiche a 40 e 28 px, approvazione, voce `APPROVED` nel manifest | `docs/missions/…`, `assets/source/pet/…`, `assets/ASSET_MANIFEST.json` | decisione D-C2 | M (+ tempo creativo) | approvazione esplicita di Francesco | asset |
| P3.1 | **Renderer per compagno** (`registerRenderer('companion:ciottolo')`) + scelta compagno nella scheda + comportamento firma (sassolino sotto la busta) | `pet.js/.css`, `progression.js` | P3.0, P2.2 | M | cambio compagno atomico; fallback a Maudit se il renderer fallisce; con riduzione del movimento pose statiche | no |
| P3.2 | **Migrazione additiva** creata con la Supabase CLI: `CHECK` esteso a `companion`/`companion_item`, righe a `announce=false` (Maudit L1, Ciottolo L3, …), test PGlite in `tests/progression-rewards-v2-db.test.js` | `supabase/migrations/<ts>_companions_v1.sql`, test | P2.3 in produzione | M | lazy unlock per livello; `ack` 42501 su non sbloccato; catalogo esistente invariato; nessun grant nuovo | **SQL (non applicata: la applica Francesco)** |
| P3.3 | **Annuncio**: `update … set announce=true` per i compagni scelti; la coda client raggruppa più compagni in una scheda | migrazione dati separata + `progression.js` | P3.2 applicata | S | coppia a livello ≥ 12 vede **una** scheda “Sono arrivati nuovi compagni” | **SQL dati** |
| P3.4 | Nodo (lontra), poi Spillo (riccio), poi Lume (lucciola): stesso ciclo P3.0 → P3.1 → riga già presente | come sopra | P3.3 | M ciascuno + arte | come P3.1 | asset |

**Gate P3:**
- test DB su PGlite + test di sicurezza di progressione esistenti;
- nessuna modifica a `get_progression_v1` / `ack_progression_unlock`;
- ordine di rollout **client → migrazione → annuncio**;
- rollback = `announce=false` / `active=false` sulle sole righe `companion*` (il client torna a Maudit fail-closed).

---

## P4: presentazione e QA su dispositivo

| # | Incremento | Prereq | Stima | Accettazione |
|---|---|---|---|---|
| P4.1 | Ricordi a griglia (miniature esistenti) | P1.3 | M | scroll di 8 ricordi ≤ 1 schermo a 390; tempo di primo paint invariato o migliore (harness perf di `us-perf-1-0`) |
| P4.2 | Fixture “coppia dimostrativa” per gli screenshot da store (dati sintetici, nessun dato reale) | P1–P3.3 | S | 3 screenshot (Oggi, Lasciato per te, Compagni) a 1290×2796 e 1080×2400 |
| P4.3 | QA su dispositivo: iPhone con Dynamic Island, iPhone SE (320 logico), Android Xiaomi, landscape, riduzione del movimento, VoiceOver/TalkBack, tastiera | tutto | M | checklist firmata da Francesco |
| P4.4 | Primo avvio (dopo MC3): passo “Scegli la foto di Oggi” + presentazione di Maudit una sola volta | MC3 in main, P2.2 | M | coppia nuova: foto impostata e Maudit visto in ≤ 3 tap dopo il login |

---

## Fuori da questa roadmap, ma da decidere
- **Fuso orario per coppia** al posto di `Europe/Rome` fisso (SQL, più RPC): blocca la vendita fuori dall'Italia.
- **Normalizzazione degli slot `francesco|beatrice`**: migrazione atomica già decisa come separata.
- **Quest senza rarità ed XP**: direzione visiva consegnata, modello dati di M12C.
- **Impostazioni “Avanzate”**: dentro M12D.

## Rischi principali
| Rischio | Mitigazione |
|---|---|
| Regressioni visive dal consolidamento CSS | pixel-diff del tour prima/dopo, nessun cambio intenzionale in P1.1 |
| Barra fixed + tastiera iOS PWA | stato congelato con `us-keyboard-open`; fallback A sola |
| Client vecchi davanti a `companion` | P2.3 prima, `announce=false` iniziale |
| Arte dei compagni sotto la qualità di Maudit | gate di approvazione, nessuna riga annunciata senza asset `APPROVED` |
| Conflitto con MC3 | P0 non tocca auth/bootstrap/onboarding; P1+ solo dopo il merge |
| Troppe reazioni del compagno | una reazione per evento reale, coda 1, nessun suono, rispetto dell'Off |

## Definizione di “fatto” per ogni incremento
1. Test mirati + `npm test` con numeri reali, base e head nello stesso ambiente.
2. Tour a 3 viewport, metriche senza peggioramenti, screenshot nella cartella QA della missione.
3. Build Cloudflare OK; build web Capacitor OK.
4. `git diff --check` pulito.
5. Nessuna voce runtime non autorizzata.
6. Report con branch, SHA, file, rischi residui.
