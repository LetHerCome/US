# Mission — us-rewards-countdown-pet-foundation-v1

**Status:** CANDIDATE (locale, nessun merge/deploy/production)
**Branch:** `mission/us-rewards-countdown-pet-foundation-v1`
**Base:** `main` = `origin/main` = `5220806` (2026-10-05)

## Goal

Rendere i premi di Sintonia più desiderabili e visibili, dare a ogni stile Countdown un'identità vera e posare le fondamenta di un PET che vive sopra la bottom navigation, riusando le authority esistenti e senza un nuovo backend.

## 1. Audit dello stato corrente

### Sintonia / progression / rewards / unlocks

- Authority server: `get_progression_v1`, `ack_progression_unlock` (+ legacy `equip_progression_reward`, non più chiamata dal client). Catalogo `progression_reward_catalog` (27 premi, livelli 1–15, 7 categorie con `CHECK` sul valore della categoria), unlock lazy in `private.progression_sync_unlocks`, viste per profilo in `progression_reward_views`.
- Client `progression.js`: 7 slot indipendenti (`frame`, `sticker`, `badge`, `ring`, `theme`, `accent`, `effect`), equip **locale al dispositivo** (`us:cosmetics:v1:<couple>:<profile>`), un solo markup condiviso tra superficie reale e anteprima (`previewMarkup`).
- Unlock moment: overlay `#usProgressionUnlock` (z 10120), card generica con swoosh unico per tutte le categorie, coda `n di m`, “Usalo ora” / “Più tardi”, haptic `UsFeedback.success`.
- Collezione: solo in Noi → Sintonia (`data-noi-view="resonance"`), griglia 3 colonne in una lista scrollabile limitata a `min(440px,56dvh)`.

### Countdown Oggi

- `countdown.js` (UMD, testabile in Node) + `countdown.css`; persistence condivisa `couple_countdown_preferences` tramite `get/save_countdown_oggi_v1` con versione ottimistica.
- Sei style id **validati dal server**: `editorial`, `signal`, `glass` (liberi), `aurora`→`frame_aurora` L4, `orbit`→`ring_orbit` L9, `chrome`→`frame_chrome` L12. Entitlement verificato dal server su `couple_reward_unlocks`.
- Tick 1 s solo con Oggi visibile, nessun loop rAF, pausa con `data-us-visibility="hidden"`, `#home:not(.active)` e reduced motion.

### Navbar / navigation shell

- `.nav.us-nav.us-nav-premium` (4 tab) fixed bottom, `bottom:max(8px,safe-bottom)`, `width:min(456px,…)`, `z-index:20`, `overflow:hidden`, indicatore CSS `:has()`.
- Nascosta con `body.us-keyboard-open` (`fix4.js`). Modali canoniche rendono `inert` i fratelli del body (`ui-foundation.js`).
- Oggetti già nella fascia sopra la nav: toast, `app-status-bar`, `app-update-bar`, `#usDailyNudge`, hero di Oggi con 88 px riservati sopra la nav quando c'è il countdown.

### Animazione, reduced motion, lifecycle PWA

- `UsUiFoundation.motion` (`data-us-motion="reduced|full"`, `onChange`), `playOnce`, `exitSurface`; `data-us-visibility` su `<html>`. Decisione M12A: **nessun loop di animazione JS**, motion decorativo in CSS.
- Service worker con shell precache versionato da `BUILD_ID`; ogni nuovo file runtime va aggiunto a SW, build Cloudflare e build Capacitor, con marker allineati (`npm run build:id`).
- Asset: nessun asset PET in `assets/ASSET_MANIFEST.json`.

## 2. Problemi dei rewards attuali

1. **Percettibilità bassa**: spille a 9.5 px sotto i ritratti di Noi, anelli su avatar di 26–44 px, effetti sul simbolo della top bar, accenti che cambiano solo l'inchiostro dei controlli. Metà del catalogo si vede solo se lo si cerca.
2. **Visibili solo in Noi → Sintonia**: la collezione vive dentro una lista scrollabile e dentro una sotto-vista; il “prossimo sblocco” è lì e basta.
3. **Valore nascosto**: Aurora, Orbita e Cromo sbloccano anche uno stile Countdown, ma né la card di unlock né la collezione lo dicono.
4. **Unlock moment generico**: stessa coreografia per tutte le categorie, anteprima piccola, nessuna indicazione di *dove* il premio vivrà, nessun ponte verso il posto in cui si vede.
5. **Tassonomia sbilanciata**: 5 cornici, 5 temi, 3 accenti, 3 effetti, 3 adesivi, 4 spille, 4 anelli. Mancano le ricompense che si vivono ogni giorno (stili Countdown, PET). Gli accenti sono quasi indistinguibili dai temi.
6. **XP come motore**: legacy per la vision, ma resta l'unica economia. **Non** si crea una seconda progression: ogni nuova ricompensa resta una riga del catalogo esistente o un entitlement derivato da una riga esistente.

### Tassonomia proposta (riuso dell'economia esistente)

| Famiglia | Dove si percepisce | Stato |
|---|---|---|
| Atmosfera (temi) | tutta US | esistente, invariata |
| Cornice foto | foto di Oggi | esistente |
| Ritratti (anelli + spilla) | Noi | esistente; da rendere più visibile in M6 |
| Stili Countdown | foto di Oggi, ogni giorno | **visibili come premi** in questa candidate (entitlement esistente) |
| PET: skin / accessori / gesti | sopra la nav, ovunque | **progettati qui**; catalogo in M7 dopo l'asset approvato |
| Micro (adesivi, effetti, accenti) | dettagli | esistenti; consolidamento accenti → temi da decidere |

Le nuove categorie `countdown` e `pet_*` nel catalogo richiedono una migrazione additiva (estensione del `CHECK` e nuove righe). È fuori da questa candidate: serve il workflow Supabase CLI e un gate separato.

## 3. Proposta stili Countdown

Stessi sei id (nessuna modifica a persistence o validazione server), identità nuove:

| id | Nome | Identità | Motion |
|---|---|---|---|
| `editorial` | Editoriale | copertina: titolo in maiuscoletto tra due filetti, numero Newsreader ottico, unità in corsivo minuscolo | cifra che sale dalla riga di base |
| `signal` | Partenze | tabellone da stazione: ogni cifra in una tessera di vetro scuro con linea di taglio, unità come etichetta | flip verticale solo della tessera cambiata |
| `glass` | Vetro | lente orizzontale: titolo in alto a sinistra, numero sottile, unità allineata alla baseline, riflesso interno | riflesso raro (ogni 11 s) |
| `aurora` *(L4)* | Aurora | numero corsivo serif con luce iridescente dentro la cifra e alone sotto | deriva lenta del colore |
| `orbit` *(L9)* | Orbita | quadrante: 60 tacche, un punto di luce che percorre il giro **in sincrono con i secondi reali** | un giro al minuto, fase dal clock |
| `chrome` *(L12)* | Cromo | numero scolpito con targhetta incisa per il titolo | lampo di luce sul metallo ogni 9 s |

Vincoli: solo `transform`/`opacity`/`background-position`; pausa con pagina nascosta, Oggi inattivo e Focus Photo; reduced motion = statico; viewport bassi e landscape già coperti dalle media query esistenti.

## 4. Architettura PET

- **File**: `pet.js` (UMD come `countdown.js`: nucleo puro testabile in Node + installer DOM), `pet.css`.
- **Layer**: `#usPetLayer`, fratello di `.nav` nel body, `position:fixed`, `pointer-events:none` su layer e discendenti, `aria-hidden="true"`, `z-index:19`. Allineato ai bordi della nav misurati con `ResizeObserver`; poggia sul bordo superiore della nav e non la copre mai.
- **Stati**: `idle`, `walk`, `rest`, `react` (+ `hidden` come stato del layer). Uno scheduler a timer, senza rAF, sceglie pause naturali (idle 2.5–7 s, rest 9–22 s) e destinazioni lungo l'asse della nav. Lo spostamento è una `transition` CSS su `transform` con durata proporzionale alla distanza.
- **Lifecycle**: timer fermi con `document.hidden`, keyboard aperta, modale aperta (il layer eredita `inert`), Focus Photo, toast/status/update bar/nudge visibili. Reduced motion: nessuna camminata, nessun loop, `react` come semplice cambio di posa.
- **Renderer sostituibile**: `USPet.registerRenderer({ id, mount(host) → { setState(state, { reason }), setFacing(facing), setAppearance({ skin, accessory }), destroy() } })`. Selezione fail-closed (`canMount`): id sconosciuto o mount fallito lasciano il renderer corrente; `placeholder` (segnaposto geometrico **non finale**) si monta solo in preview esplicita, mai come fallback.
- **Gate asset**: senza un asset `APPROVED` il PET resta spento in produzione. Si accende solo in locale (`?us-pet=preview` o `localStorage['us:pet:v1:preview']='1'`). Specifica in [`us-pet-asset-spec-v1.md`](us-pet-asset-spec-v1.md).
- **Event interface**: `USPet.react(reason)` oppure `window.dispatchEvent(new CustomEvent('us:pet', { detail: { type: 'react', reason } }))`. Motivi ammessi: `think`, `left-for-you`, `reward`, `streak`, `daily-question`; con rate limit e coda di una sola reazione. In V1 è collegato solo `reward` (unlock moment).
- **Aspetto / rewards**: `USPet.setAppearance({ skin, accessory })` scrive `data-pet-skin` / `data-pet-accessory`. Futuri slot `pet_skin` / `pet_accessory` nello stesso modello device-local di `progression.js`.
- **Native**: stesso codice in PWA Android/iOS e in Capacitor (build web condivisa), nessun plugin.

## 5. Rischi performance / UX

- Paint continuo dei gradienti `background-clip:text` (Aurora, Cromo): limitato a una superficie, in pausa fuori da Oggi.
- PET sopra contenuti scrollabili: `pointer-events:none` e area ridotta (~44 px) non bloccano tap, ma possono coprire visivamente l'ultima riga. Mitigazione: si ferma sui bordi e sparisce quando appaiono toast/nudge/barre.
- Reazioni troppo frequenti diventano rumore: rate limit e nessun suono.
- Il segnaposto non deve mai arrivare agli utenti: gate asset più test dedicato.
- iOS PWA: `bottom` fixed con safe area, nessun `backdrop-filter` sul PET.
- La correzione di rendering degli stili countdown cambia l'aspetto per chi li usa già (stessi id): cambiamento visivo voluto, dati intatti.

## 6. File toccati

`countdown.js`, `countdown.css`, `progression.js`, `progression.css`, `pet.js` (nuovo), `pet.css` (nuovo), `index.html`, `service-worker.js`, `version.json`, `manifest.webmanifest`, `scripts/build-cloudflare-pages.mjs`, `scripts/build-capacitor-web.mjs`, test nuovi (`tests/pet-foundation.test.js`, `tests/rewards-countdown-visual-pass.test.js`), allineamento del marker in `tests/us-home-cleanup-noi-board-daily-move.test.js`, docs della missione.

Non toccati: Supabase (schema, RPC, migrazioni), `app.js`, navigation authority, Push, Service Worker lifecycle (solo lista precache e marker).

## 7. Roadmap

- **M1** — Piano + specifica asset PET *(questa candidate)*.
- **M2** — Countdown visual pass sui sei id esistenti *(questa candidate)*.
- **M3** — Unlock moment premium: coreografia per categoria, “dove lo vedrai”, chip dello stile Countdown sbloccato, reazione PET *(questa candidate)*.
- **M4** — Collezione: gruppo “Stili Countdown” derivato dagli entitlement esistenti; i premi dicono anche cosa sbloccano *(questa candidate)*.
- **M5** — PET foundation: layer, stati, scheduler, lifecycle, event API, renderer segnaposto dietro gate *(questa candidate)*.
- **M6** — Approvazione asset PET (fuori dal codice) → renderer sprite/vector, rimozione del gate.
- **M7** — Migrazione catalogo additiva: categorie `pet_skin` / `pet_accessory` (ed eventualmente `countdown`) via Supabase CLI, test DB su pglite, nessuna applicazione in production senza autorizzazione.
- **M8** — Wiring delle reazioni PET: Ti penso, Lasciato per te, streak/Ritmo, Daily Question, ciascuno vicino alla propria authority.
- **M9** — Percettibilità dei ritratti (spille/anelli) e consolidamento accenti/temi.

## Preview / screenshot strategy

- Countdown: `COUNTDOWN_SCREENSHOTS=<dir> node --test tests/countdown-oggi-v1-browser.test.js` → 6 stili × 320×568 / 390×844 / 844×390 + `style-collection.png`.
- PET, unlock e collezione: `PET_SCREENSHOTS=<dir> node --test tests/pet-foundation-browser.test.js` → `pet-preview-*`, `unlock-frame-aurora-390x844`, `sintonia-countdown-styles-390x844`.
- Playwright non è una dipendenza del repo: `PLAYWRIGHT_NODE_MODULES` (cartella con il pacchetto `playwright`) + `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, come per i test browser esistenti.
- Dispositivo reale (Android PWA, iOS PWA, Capacitor): aprire una volta l'app con `?us-pet=preview`; il flag resta su quel dispositivo e anche nella PWA installata. Si spegne con `?us-pet=off`. In produzione, senza flag, non viene montato nulla.

## Ledger

- 2026-10-05 — Audit e piano (questo file) + specifica asset PET. Nessun blocker architetturale: stili Countdown sugli id esistenti, nessuna migrazione; PET dietro gate asset.
- Countdown visual pass: sei identità, `previewMarkup` condiviso, Orbita sincronizzata ai secondi reali senza loop JS.
- Unlock moment V2 + gruppo “Stili Countdown” nella collezione; il PET reagisce a `reward` solo dopo la chiusura del momento.
- PET Foundation: `pet.js` / `pet.css`, layer sul bordo della nav, stati, gate, event API; marker build `us-rewards-countdown-pet-foundation-v1-20261005-1`. Candidate `014d61e` pubblicata su origin.
- Review indipendente — 2 blocker + 1 contratto, corretti sullo stesso branch:
  - **F1** una sola decisione runtime `blockers()` (hidden/pagehide, keyboard, inert, status, update, nudge, toast, Focus Photo, auth). Bloccato ⇒ `pet.stop()`, zero timer, reazioni ignorate e coda svuotata; sbloccato ⇒ un solo restart. Reattivo via MutationObserver limitato ai 6 nodi/attributi letti (niente subtree, polling o rAF).
  - **F2** `useRenderer` fail-closed: `placeholder` solo in preview, id sconosciuti o mount che falliscono restituiscono `false` e mantengono il renderer valido; senza renderer montabile il PET resta disattivato.
  - **F3** contratto renderer allineato: `setFacing(facing)` separato (al mount e a ogni cambio di direzione), `setState(state, { reason })`; specifica asset aggiornata.
- Seconda review — F1/F2/F3 confermati (`52395cb`); due ultimi punti:
  - **F4** sostituzione renderer atomica: ogni renderer ha il proprio host `.us-pet-renderer`; il candidato monta in un host staccato; renderer, host e nodi correnti non vengono toccati finché il mount non riesce; in caso di errore il candidato viene scartato. Se il primo mount all'install fallisce, il PET resta disattivato senza nulla agganciato.
  - **F5** un solo ingresso `react()` per `USPet.react` e l'evento `us:pet`: valuta `blockers()` in modo sincrono prima di toccare la macchina, quindi rifiuta anche prima che il MutationObserver consegni la mutazione. L'observer resta il responsabile di stop/resume dello scheduler.

## Acceptance (questa candidate)

- focused tests; `npm test`; `npm run build:cloudflare-pages`; build Capacitor web (Windows); `git diff --check`.

## Stop conditions

Stop and report before broadening scope, changing production, deploying or merging.
