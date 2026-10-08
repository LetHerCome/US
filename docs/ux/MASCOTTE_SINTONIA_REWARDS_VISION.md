# Compagni — Mascotte sbloccabili dentro Sintonia

**Stato:** BLUEPRINT DI PRODOTTO · nessun codice, nessuna SQL, nessuna modifica al catalogo in questa missione
**Missione:** `docs/missions/us-premium-ux-maudit-product-review-v1.md` (Work package C)
**Baseline verificata:** `main` @ `df7760b` (D5)
**Legenda:** **[F]** fatto verificato nel codice o nel browser · **[G]** giudizio di design · **[H]** ipotesi da validare

---

## 0. Decisione in una riga

Maudit diventa il **primo compagno** di una nuova famiglia **Compagni** dentro la collezione di Sintonia: **posseduto da subito** da ogni coppia, sempre visibile in collezione e mai revocabile. Ogni coppia può poi sbloccare altri **quattro animali veri**, ognuno con il proprio carattere, sulla stessa progressione di oggi. L'economia resta una sola, senza valuta per i compagni, senza gacha e senza scadenze. Il primo compagno nuovo da disegnare è **Ciottolo, il pinguino**.

---

## 1. Cosa c'è oggi (fatti)

| Area | Stato | Fonte |
|---|---|---|
| Economia | Una sola progressione server: `couples.bond_xp` → `private.progression_level_info` (soglia per salire: 200 + (livello−1)·150 XP). Livello 15 = 16.450 XP totali. | **[F]** baseline `20261004000000_us_2_0_baseline.sql:2597` |
| Catalogo | `progression_reward_catalog`: **27 premi**, livelli 1–15, 7 categorie bloccate da `CHECK (category IN frame,theme,accent,effect,badge,sticker,ring)`. | **[F]** baseline `:6266`, `:7341` |
| Sblocco | `private.progression_sync_unlocks` inserisce in `couple_reward_unlocks` ogni riga attiva con `level_required <= livello`. È generico per categoria. | **[F]** baseline `:2699` |
| Annuncio | `get_progression_v1` restituisce `pending_unlocks` (riga `announce=true` non ancora vista dal profilo), `ack_progression_unlock` registra la vista. | **[F]** baseline `:4297`, `:2906` |
| Equip | Locale al dispositivo, `us:cosmetics:v1:<couple>:<profile>`, validato contro `unlocked` del server (`sanitizeDevicePreferences`). | **[F]** `progression.js:16-110` |
| Collezione | Solo in Noi → Sintonia → “I vostri sblocchi”: 7 gruppi + “Stili Countdown”, griglia di tile 3 colonne. Le categorie sconosciute vengono **ignorate** dalla griglia. | **[F]** `progression.js:280-296`, screenshot `15-sintonia-collection-390x844.png` |
| Unlock moment | `#usProgressionUnlock` (z 10120). **Non** è un `[data-us-modal]`: niente focus trap, niente `inert` sul resto, niente Escape, niente integrazione con Back. La coda **non filtra** le categorie sconosciute. | **[F]** `index.html:812`, `progression.js:308-352`, nessuna occorrenza in `navigation.js`/`ui-foundation.js` |
| Maudit | `pet.js`: renderer `sprite` = kitten v0 **APPROVED**, stati idle/walk/rest/react/pet/held/fall/snap, piani sicuri (`PLANES`), hit target 40×34, `USPet.react(reason)` con `think`, `left-for-you`, `reward`, `streak`, `daily-question`. Preferenze locali **non scoperte per account**: `us:maudit:v1:enabled`, `us:maudit:v1:placement`. Unico ingresso utente: interruttore in Impostazioni → “Su questo telefono”. | **[F]** `pet.js:23,168-190,232-266`, `index.html:522` |
| Contratto renderer | `registerRenderer({id, mount(host) → {setState, setFacing, setAppearance, destroy}})`, selezione atomica e fail-closed. | **[F]** `pet.js:166-215`, `us-pet-asset-spec-v1.md` |

### Cosa vale e cosa no nella collezione attuale

| Famiglia (n.) | Dove si vede | Visibilità reale | Verdetto |
|---|---|---|---|
| Cornici (6) | foto di Oggi | Alta: la foto è lo schermo intero | **Tenere.** Il premio migliore che avete. |
| Temi (5) | tutta US | Alta | **Tenere.** |
| Stili Countdown (3, derivati) | Oggi | Alta, ogni giorno | **Tenere e promuovere.** |
| Adesivi (3) | Oggi + ultimo ricordo | Media | Tenere. |
| Anelli (4) | ritratti di 44–58 px in Noi | Bassa | Fondere con Spille in un unico gruppo “Ritratti”. |
| Spille (4) | sotto i ritratti di Noi | Bassa (testo 9.5 px **[F]** foundation-v1 §2) | Come sopra. |
| Accenti (3) | colore dei controlli | Quasi nulla, si confondono con i temi | **Smettere di annunciarli.** |
| Effetti (3) | simbolo US nella top bar, 48 px | Quasi nulla, e spariscono se la barra diventa compatta | **Smettere di annunciarli.** |

**[G]** Metà del catalogo (accenti, effetti, spille, anelli: 14 righe su 27) produce una schermata di sblocco per qualcosa che l'utente non vede nella vita quotidiana. Ogni livello oggi dà “due piccole cose”. Con i compagni ogni 3 livelli arriva invece “qualcuno di nuovo”, e il rapporto tra sforzo e ricompensa si inverte.

---

## 2. Maudit nel catalogo: tre opzioni

| | A · Posseduto da subito | B · Sbloccato al livello 2 | C · Scelta del primo compagno |
|---|---|---|---|
| Nuova coppia | Lo vede dal primo giorno; la collezione dice “Con voi dall'inizio” | Vede una silhouette, lo ottiene dopo circa 200 XP | Sceglie tra 2–3 animali al primo avvio |
| Coppie esistenti | Nessun cambiamento, nessuna perdita | Avrebbero Maudit “già sbloccato” (livello > 2), quindi coerente | Dovrebbero “scegliere” qualcosa che già hanno |
| Valore | Momento “aha” immediato: US ha un abitante | Un primo traguardo rapido | Scelta forte, ma richiede da subito 2–3 personaggi finiti e approvati |
| Entitlement | Nessuno: il default non ha bisogno di diritti, come l'aspetto standard | Riga di catalogo livello 2 (SQL) | Una nuova autorità di scelta (SQL + regola) |
| Rischio | Nullo | Basso | Alto: blocca l'onboarding sull'arte |

**Raccomandazione: A.** Maudit è il compagno iniziale. Non richiede diritti e non può essere perso. Quando arriva l'estensione del catalogo (§6 opzione B) riceve per uniformità una riga `companion_maudit` di livello 1 con `announce=false`: le coppie esistenti non vedono una finta schermata di sblocco, e quelle nuove lo trovano già con sé. La “scelta” vera arriva al primo compagno sbloccato, quando l'utente decide chi tenere in giro.

---

## 3. I nuovi compagni (concept, nessun asset esiste)

I principi valgono per tutti e ricalcano la specifica approvata di Maudit: box logico 40×40, leggibile a 28 px, nessun testo o emoji nell'asset, una posa statica completa per ogni stato con riduzione del movimento, nessuna espressione triste o di rimprovero. Nessuno chiede attenzione. Ogni animale ha **un'idea di coppia** che ne giustifica l'esistenza e **un comportamento firma** costruito su un fatto reale dell'app.

### 3.1 Ciottolo — il pinguino *(primo da creare)*
- **Perché le coppie ci tengono:** i pinguini regalano un sassolino a chi scelgono. È il compagno del “lasciare qualcosa”.
- **Silhouette:** ovale verticale, pancia bianca, ali corte aperte, piedi arancio pallido; si distingue da Maudit già dalla sagoma (verticale contro orizzontale).
- **Temperamento:** serio e premuroso, cammina dondolando, si ferma a guardare.
- **Stati:** `idle` dondola sul posto · `walk` passo corto a ondeggio (6 frame) · `rest` si accuccia sulla pancia · `react` ali aperte, piccolo saltello · `held` ali rigide, piedi a penzoloni (si prende dal collo come Maudit, così la meccanica resta una).
- **Firma:** quando arriva un *Lasciato per te* (`USPet.react('left-for-you')`), alla prossima apertura dell'app cammina fino al bordo della barra sotto la busta e posa un sassolino; il sassolino sparisce quando la busta viene aperta. È un solo stato visivo legato a un fatto che esiste già, senza notifiche aggiuntive.
- **Sblocco proposto:** livello 3.

### 3.2 Nodo — la lontra
- **Perché:** le lontre dormono tenendosi per mano per non allontanarsi. È il compagno della costanza, cioè del Ritmo.
- **Silhouette:** lunga e bassa, coda spessa, muso tondo con baffi accennati (pochi tratti a 40 px).
- **Temperamento:** pigra e affettuosa.
- **Stati:** `idle` si liscia il muso · `walk` andatura ondulata · `rest` **sdraiata sulla schiena** sul bordo della card, zampe sul petto (la posa più riconoscibile) · `react` si gira su se stessa una volta.
- **Firma:** quando oggi avete fatto qualcosa insieme (`rhythm_today = true`, già restituito da `get_progression_v1`) si addormenta sulla schiena sul piano della Lavagna. Se non l'avete fatto non succede nulla: niente senso di colpa, niente streak in pericolo.
- **Sblocco:** livello 6.

### 3.3 Spillo — il riccio
- **Perché:** si apre solo con chi si fida. È il compagno della Domanda del giorno, cioè delle cose dette davvero.
- **Silhouette:** cupola di aculei morbidi (forma, non linee sottili), musetto a punta.
- **Temperamento:** timido e curioso.
- **Stati:** `walk` passi rapidi · `rest` palla · **`held`: invece di penzolare si chiude a palla** (unica variazione della presa; serve un renderer con la propria posa `held`) · `react` sbuca dalla palla.
- **Firma:** dopo un reveal della Domanda del giorno (`react('daily-question')`) si apre e resta aperto fino a sera.
- **Sblocco:** livello 9.

### 3.4 Lume — la lucciola
- **Perché:** una luce piccola che c'è anche quando siete lontani. È il compagno di *Ti penso*.
- **Silhouette:** corpo minuscolo con addome luminoso; l'ingombro visivo arriva a circa 24 px, mentre il bersaglio resta 40×34.
- **Temperamento:** quieta e notturna.
- **Locomozione:** **non cammina**. Si posa sui piani come gli altri (riusa `PLANES`, gravità e snap) e sale di 4–6 px con un ondeggio CSS lento. Niente volo libero e niente loop JS.
- **Firma:** a un *Ti penso* ricevuto si accende per 3 s. Con la riduzione del movimento resta solo un cambio di luminosità statico.
- **Sblocco:** livello 12. È il più economico da disegnare, ma va per ultimo perché la luce va provata sul serio sul vetro scuro della nav.

### 3.5 Riserva: Ottavio, il gufo
Sveglio di sera (ora di Roma), dorme di giorno. Va tenuto in riserva per una futura estensione oltre il livello 15. **Non** va disegnato ora.

---

## 4. Esempi di sblocchi (14)

“SQL” significa che serve una nuova riga di catalogo, cioè l'opzione B. “Riuso” significa che si appoggia a un diritto già esistente senza falsificarlo.

| # | Nome | Tipo | Perché conta per la coppia | Livello / trigger | Anteprima nella card di sblocco | Dove si usa | Asset nuovi | Diritto |
|---|---|---|---|---|---|---|---|---|
| 1 | **Maudit** | compagno | È già con voi | posseduto | ritratto a figura intera, posa `idle` | shell (nav e card) | no (APPROVED v0) | nessuno (default) |
| 2 | **Il cuscino di Maudit** | luogo di riposo | Il compagno ha un posto suo | L2 | cuscino sul bordo nav con il compagno in `rest` | nav | sì (≤2 KB) | SQL |
| 3 | **Ciottolo** | compagno | Il compagno di chi lascia pensieri | L3 | pinguino in `react`, sassolino accanto | shell | sì | SQL |
| 4 | **Sciarpa a righe** | accessorio (tutti i compagni) | Un dettaglio vostro | L4 | compagno attivo con sciarpa | ancoraggio `neck` | sì | SQL |
| 5 | **Il sassolino** | comportamento di Ciottolo | Vedi che ti hanno lasciato qualcosa senza aprire nulla | L5 | sequenza in 3 pose statiche | sotto la busta | sì (pose) | SQL |
| 6 | **Nodo** | compagno | La costanza, senza streak | L6 | lontra sdraiata sulla schiena | shell | sì | SQL |
| 7 | **Maudit “Notte”** | mantello di Maudit | Un Maudit solo vostro | L7 | Maudit grigio fumo, occhi ambra | shell | sì (nuova versione, nuova approvazione; il v0 resta) | SQL |
| 8 | **Dormono vicini** | posa | Due compagni insieme una sola volta, non sempre | L8 | compagno attivo che dorme accanto a Maudit sulla Lavagna | piano `noi-week-board-top`, una volta al giorno, solo se `rhythm_today` | sì (pose) | SQL |
| 9 | **Spillo** | compagno | Le cose dette davvero | L9 | riccio mezzo aperto | shell | sì | SQL |
| 10 | **Cappello di lana** | accessorio | Calore | L10 | compagno attivo col cappello | ancoraggio `head` | sì | SQL |
| 11 | **Ti aspetta** | comportamento (tutti) | Il compagno ti aspetta vicino alla busta quando c'è qualcosa | L11 | posa `idle` vicino all'icona | bordo nav sotto la busta | no | SQL o **riuso** (stato derivato dalla busta, senza diritto) |
| 12 | **Lume** | compagno | La vicinanza a distanza | L12 | lucciola accesa | shell | sì | SQL |
| 13 | **Fiocco** | accessorio | Per le occasioni | L13 | compagno con fiocco | `neck` | sì | SQL |
| 14 | **Ritratto di famiglia** | momento annuale | Il vostro anniversario | L15, solo nel giorno dell'anniversario (`couples.started_on`) | tutti i compagni sbloccati sulla Lavagna | una volta all'anno, per 1 giorno | sì (composizione) | SQL |

**Nota sul n. 14:** è l'unico caso in cui più compagni compaiono insieme. È giustificato perché accade una volta all'anno, sul piano più stabile, ed è un'occasione vera, non un effetto continuo.

**Effetto sul ritmo:** dal livello 2 al 15 ogni livello porta un compagno, un oggetto per il compagno o un premio visivo forte (cornici, temi, Countdown). Accenti ed effetti smettono di avere una schermata propria.

---

## 5. Esperienza utente

### 5.1 Dove si scopre
1. **Collezione (primaria):** il primo gruppo di “I vostri sblocchi” diventa **Compagni**, prima delle Cornici. Mostra una riga orizzontale di card **grandi** (circa 120×150) con l'animale vivo in posa `idle` per gli sbloccati e una silhouette grigia con “Livello N” per quelli bloccati. Nome e una riga di carattere.
2. **Card Sintonia in Noi:** il prossimo sblocco, se è un compagno, mostra la silhouette al posto della miniatura. È già il punto in cui l'utente guarda “che cosa viene dopo”.
3. **Tocco lungo sul compagno nella shell:** oltre alla presa per la collottola già esistente, un menu non è necessario. Il **doppio tocco** apre il foglio del compagno (stesso foglio di §5.3). **[H]** Va provato su dispositivo per evitare conflitti con pet/held. In alternativa si apre la scheda dalla collezione e basta.
4. **Impostazioni (secondario):** la riga “Maudit” diventa **“Compagno”**, con valore = nome attivo e interruttore incluso. Apre lo stesso foglio di §5.3. L'interruttore On/Off resta lì perché è una preferenza del telefono.

### 5.2 Card di collezione (stati)
| Stato | Aspetto | Azione |
|---|---|---|
| Attivo | animale in `idle` animato (statico con riduzione del movimento), etichetta “Con te ora”, bordo accento | tocco → foglio del compagno |
| Sbloccato | animale statico, “Sbloccato” | tocco → foglio con “Porta con te” |
| Bloccato | silhouette piena `--us-color-locked`, “Livello N · mancano X” | tocco → foglio di anteprima con la silhouette, il carattere e il “come si sblocca” |
| Non disponibile (asset non caricato, renderer non registrato) | card nascosta | nessuna promessa visibile |
| Compagni spenti in Impostazioni | card normali + banner sottile “I compagni sono nascosti su questo telefono · Mostra” | toggle diretto |

### 5.3 Foglio del compagno (sheet, tipo “dettaglio immersivo”, vedi `US_NATIVE_SHEETS_DESIGN_SYSTEM.md`)
```
┌────────────────────────────────────┐
│            ───  (grabber)          │
│                                    │
│          [ animale 160 px ]        │  ← lo stesso renderer, scalato (SVG), posa idle
│                                    │
│  Ciottolo                          │  serif 28
│  Il pinguino che porta sassolini.  │  15/secondario
│                                    │
│  ◦ Quando vi lasciate qualcosa,    │  2–3 righe di comportamento reale
│    porta un sassolino alla busta.  │
│  ◦ Si prende per il collo.         │
│                                    │
│  [   Porta con te   ]  (primario)  │  oppure “Con te ora ✓” disabilitato
│  Accessori: Sciarpa · Cappello     │  chip, solo quelli sbloccati
└────────────────────────────────────┘
```
“Porta con te” cambia subito il compagno nella shell. Il compagno uscente esce con un `fade` di 160 ms, il nuovo entra con l'`arrive` esistente (240 ms) **sullo stesso piano e alla stessa x**: la posizione salvata resta del “compagno nella shell”, non del singolo animale.

### 5.4 Momento di sblocco di un compagno
È l'unlock card esistente con tre differenze:
- l'anteprima è **l'animale grande** che fa una volta `react` (statico con riduzione del movimento);
- il testo dice **dove vivrà**: “Cammina sopra la barra e sulle vostre card”;
- i pulsanti sono **“Porta con te”** e **“Non ora”**. “Non ora” lo lascia in collezione.
- Dopo la chiusura, il compagno attivo esegue `react('reward')`, come già succede per gli altri premi.
- Se arrivano più compagni insieme (vedi §7.3), la coda li unisce in **una** scheda “Sono arrivati nuovi compagni”, con una riga di 2–3 animali e un solo “Scegli chi portare”.

### 5.5 Reazioni: regole di misura
- Una reazione per evento reale, coda di uno, rate limit esistente. Niente reazioni periodiche “per farsi notare”.
- Mai sopra un foglio aperto (già garantito da `blockers()`).
- Nessun suono legato al compagno.
- Se i compagni sono spenti non succede nulla, nemmeno sotto forma di notifica sostitutiva.
- Mai legare una reazione a un fatto **mancato** (streak persa, domanda non risposta).

---

## 6. Diritti: opzione A (senza SQL) contro opzione B (estensione additiva)

### Opzione A — senza nuova SQL
Cosa si può fare onestamente:
- **Maudit in collezione** come voce client “posseduta”: è vero, perché Maudit è il default.
- **Tutta l'infrastruttura multi-compagno** su un solo personaggio: famiglia Compagni in UI, foglio, scelta del compagno attivo con una sola opzione, chiave di preferenza nuova scoperta per account, Impostazioni “Compagno”.
- **Accessori di Maudit** agganciati a un premio **esistente**, sullo schema degli Stili Countdown (`USCountdown.STYLES` → `reward`). Esempio: la sciarpa insieme a `frame_glow` (L2), mostrata come “IN PIÙ” nella card di sblocco di quel premio. È **vincolante quanto gli altri cosmetici**, perché esiste una riga server di sblocco.

Cosa **non** si può fare con A:
- Annunciare un **compagno** come premio a sé: la card di sblocco annuncia il premio ospite, non l'animale.
- Dare a un compagno un livello proprio: eredita quello dell'ospite e lo perde se l'ospite viene ritirato.
- Mostrare silhouette “Livello N” per compagni che il server non conosce: sarebbe una promessa senza autorità. In A al massimo si mostra “In arrivo”, senza livello.

**Verdetto:** A è giusta per **P2** (Maudit dentro Sintonia, foglio, preferenza, eventuale accessorio “IN PIÙ”). **Non** basta per i nuovi animali.

### Opzione B — estensione additiva del catalogo
Una migrazione **creata con la Supabase CLI** (vedi `AGENTS.md` e `docs/agent/supabase-change.md`), non applicata in questa missione:
1. `alter table … drop constraint progression_reward_catalog_category_check`, poi `add constraint … check (category in (…7 esistenti…, 'companion', 'companion_item'))`.
2. Righe nuove: `companion_maudit` (L1, `announce=false`), `companion_ciottolo` (L3), `companion_nodo` (L6), `companion_spillo` (L9), `companion_lume` (L12), più gli oggetti della §4 come `companion_item`. `token` univoco, `sort_order` coerente.
3. **Nessuna** modifica a `get_progression_v1`, `ack_progression_unlock` o `progression_sync_unlocks`: sono già generiche per categoria. **[F]** baseline `:2717`, `:4357`
4. Nessuna nuova colonna in `couple_progression_preferences`: l'equip resta locale come per le altre categorie (lo slot JSON server non include `companion`, quindi `equipped` arriva `false` e il client lo ricalcola).
5. Test: `tests/progression-rewards-v2-db.test.js` su PGlite. Sblocco lazy per livello, idempotenza, `ack` rifiutato su un compagno non sbloccato (`42501`), catalogo esistente invariato, nessun grant nuovo.

**Rischio verificato sui client vecchi [F]:** `renderRewards` ignora le categorie sconosciute (ok), ma `startUnlockQueue` **non le filtra**: un client vecchio mostrerebbe una card “HAI SBLOCCATO” vuota e “Usalo ora” fallirebbe con “Non riesco ad applicarlo ora”. Inoltre `next_reward` potrebbe essere un compagno senza anteprima. Da qui l'ordine obbligatorio:
1. client che capisce `companion` e **filtra** le categorie sconosciute in coda e in “prossimo sblocco”, rilasciato e adottato (SW aggiornato);
2. solo dopo, migrazione con le nuove righe a `announce=false`;
3. poi un'unica `update … set announce=true` per le righe da annunciare, quando Francesco decide.

---

## 7. Compatibilità e migrazione degli utenti esistenti

### 7.1 Preferenze locali
- Nuova chiave **scoperta per account**: `us:companion:v1:<couple_id>:<profile_id>` = `{ v:1, active:'maudit', enabled:true, placements:{ shell:{plane,x} } }`.
- Al primo avvio: se la chiave non esiste, si legge `us:maudit:v1:enabled` e `us:maudit:v1:placement` (formato `{v,plane,x}`) e si copiano. **Le chiavi vecchie non si cancellano** per una release, così un rollback non perde nulla.
- **Perché:** oggi le chiavi Maudit valgono per tutto il telefono. Se un secondo account entra sullo stesso telefono eredita on/off e posizione del primo **[F]** `pet.js:232`. La nuova chiave chiude il problema senza cambiare comportamento a chi usa un solo account.
- `active` non valido (compagno non sbloccato, renderer assente, asset non approvato) → `maudit`, fail-closed come `canMount`.

### 7.2 Renderer
- Un renderer per animale: `registerRenderer({ id:'companion:ciottolo', mount })`, con lo stesso contratto. `USPet` resta l'unica autorità di stato, piani, gesture e blocchi.
- La selezione del compagno chiama `useRenderer(id)`, che è già atomica: se fallisce resta il compagno precedente.
- L'asset di Maudit v0 **non si tocca**. “Maudit Notte” è un file nuovo (`us-pet-kitten-night-v1.svg`) con nuova approvazione nel manifest.
- Specifica asset per ogni animale sul modello di `us-pet-asset-spec-v1.md`: stesso box, stessi nomi di stato e pivot per la presa (`neck`), peso ≤ 8 KB SVG.

### 7.3 Coppie già avanti nei livelli
Una coppia esistente a livello ≥ 12 riceverebbe 4 compagni insieme. Con `announce=false` iniziale e poi `true`, la coda client li raggruppa in **una** scheda (§5.4). Nessuno perde Maudit, nessuno trova un compagno attivo cambiato senza averlo scelto.

---

## 8. Qualità, sicurezza visiva e performance

- **Gate creativo:** ogni animale ha una specifica asset, una tavola di 4 pose statiche a 40 e 28 px su `#1a1520` e su foto chiara, e un'approvazione esplicita di Francesco prima di entrare nel manifest (`APPROVED`). Senza approvazione: niente renderer di produzione, niente card in collezione.
- **Footprint:** box 40×40, hit target 40×34, bordo inferiore lontano dalla nav, invariato.
- **Motion:** solo `transform`/`opacity` in CSS. La gravità JS breve esiste già ed è riusata. Niente rAF continuo.
- **Riduzione del movimento:** posa statica completa per stato, nessuna camminata, lo sblocco mostra il frame 0.
- **Lifecycle:** `blockers()` invariato (hidden, keyboard, inert, surface, focus, auth).
- **Accessibilità:** il layer resta `aria-hidden`. Le card della collezione hanno `aria-label` “Ciottolo, compagno sbloccato, con te ora”. Il foglio è un vero dialog. Il cambio compagno viene annunciato con `role=status`.
- **320 px:** nel tour reale a 320×568 Maudit copre parte del testo di card a Gioca e Impostazioni (**[F]** `24-gioca-320x568.png`, `27-settings-320x568.png`). È già così oggi e va corretto prima di aggiungere animali più grandi: in `PLANES` i piani devono escludere le card la cui prima riga di testo è a meno di 40 px dal bordo superiore, e a 320 px Maudit preferisce la nav.

---

## 9. Raccomandazione finale

1. **Cosa creare prima:** Ciottolo (pinguino), poi Nodo (lontra). Entrambi camminano, quindi riusano al 100% fisica e piani; hanno silhouette diverse da Maudit; il comportamento firma di ciascuno si appoggia a un fatto già esistente (busta, `rhythm_today`).
2. **Quando compare Maudit:** subito, come compagno posseduto (opzione A). In SQL entra a livello 1 con `announce=false`.
3. **Cosa sostituire:** accenti (3) ed effetti (3) smettono di essere annunciati e scendono in un gruppo chiuso “Dettagli” in fondo alla collezione. **Non** si disattivano (`active=false` li toglierebbe a chi li usa: `sanitizeDevicePreferences` li azzererebbe). Anelli e spille si fondono nel gruppo “Ritratti”.
4. **Ordine:** P2 = Maudit dentro Sintonia, foglio, preferenza per account, nessuna SQL. P3 = arte approvata di Ciottolo, client compatibile con `companion`, migrazione additiva, annuncio. Dettagli in `US_PREMIUM_UX_ROADMAP.md`.

## Decisioni richieste a Francesco
- D-C1: Maudit posseduto da subito (A)? *(raccomandato)*
- D-C2: primo nuovo compagno = Ciottolo?
- D-C3: smettere di annunciare accenti ed effetti, senza ritirarli?
- D-C4: autorizzare in P3 una migrazione additiva `companion` / `companion_item` (con l'ordine client → migrazione → annuncio)?
- D-C5: nome della famiglia in UI: **“Compagni”** *(raccomandato, più caldo)* o “Mascotte”?
