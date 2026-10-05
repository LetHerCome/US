# US PET — Asset requirement V1

**Status:** CONCEPT APPROVATO (personaggio) · asset finali NON ancora approvati
**Concept approvato:** un piccolo gattino, pelo bianco e grigio, occhi azzurri.
**Owner decision:** Francesco (approva gli asset finali e li registra come `APPROVED` in `assets/ASSET_MANIFEST.json`)

Il personaggio è deciso; i file definitivi no. Finché non esiste un asset finale `APPROVED`, il PET resta spento in produzione. Il renderer `placeholder` di `pet.js` disegna il **kitten preview v0**, un'interpretazione temporanea di questo concept, visibile solo in preview esplicita (`?us-pet=preview`). Non è un asset finale e non va nel manifest.

## Direzione

- Mascotte premium, morbida, affettuosa: un gattino che vive con voi, non un personaggio di un gioco.
- **Non** fotorealistico (niente texture di pelo, niente ciglia), **non** emoji (niente faccina frontale piatta), **non** cartoon infantile (niente occhi enormi, guance gonfie o espressioni esagerate).
- Linguaggio del simbolo US: curve morbide, volumi pieni, sfumature leggere; nessun contorno nero spesso.
- Leggibilità prima del dettaglio: il gattino deve essere riconoscibile a 40 px CSS sopra la nav scura, anche su schermi @1x.

## Proporzioni e silhouette (box 40 × 40, vista di tre quarti, rivolto a destra)

| Elemento | Regola |
|---|---|
| Altezza figura | 30–34 px incluse le orecchie; piedi sulla riga y = 38–39 |
| Testa | ≈ 45% dell'altezza (gattino, non gatto adulto); diametro 16–17 px; leggermente avanti rispetto al corpo |
| Corpo | ovale basso e morbido, 20 × 12 px; nessuna vita stretta |
| Zampe | corte, 4 visibili (2 vicine più chiare, 2 lontane più scure), estremità arrotondate |
| Orecchie | due triangoli morbidi, alti ≈ 8 px, interno rosa; l'orecchio vicino un po' più grande |
| Coda | grigia, spessa ≈ 3 px, curva verso l'alto, punta arrotondata, lunga quanto il corpo |
| Silhouette | da sola (riempita di nero) deve dire “gattino”: orecchie + testa grande + coda alzata. Spazio negativo tra zampe, coda e corpo. |

## Mantello e palette

Bicolore: **grigio** su testa (cappuccio), orecchie, sella del dorso, coda e zampa posteriore vicina; **bianco** su muso, petto, pancia, zampa anteriore e “calzini”. Una lista bianca a V rovesciata scende dalla fronte tra gli occhi e si apre sul muso.

| Ruolo | Colore | Note |
|---|---|---|
| Bianco pelo | `#fbf8f4` → `#e2dbd3` | bianco caldo, mai `#ffffff` puro sui volumi |
| Grigio pelo | `#a7acb5` → `#7c818b` | grigio freddo-neutro; zampe lontane `#757a84` |
| Interno orecchie, naso | `#e8a7b0` / `#e39aa6` | rosa polvere |
| Iride | `#b4dcff` → `#5e9ce0` → `#3a6cab` | l'azzurro è il colore più saturo della figura |
| Pupilla | `#1c2230` | verticale, stretta |
| Riflesso | `#ffffff` | un punto per occhio, in alto a sinistra |
| Linee (bocca, occhi chiusi) | `#9c8a8d` / `#4a505a` | ≥ 0.4 px nel box 40 |
| Guance | `#f1b6bf` al 45% | appena percettibili |

Il pelo non prende colori dal tema. Temi e accenti entrano solo tramite gli **accessori** (es. collare con `--us-color-accent-strong`).

## Viso ed espressione

- Occhi a mandorla, ovali verticali (vicino ≈ 3.2 × 3.9 px, lontano ≈ 2.7 × 3.4 px), distanza ≈ 1.5 volte la larghezza di un occhio; iride azzurra che riempie l'occhio, pupilla verticale, un riflesso.
- Naso: piccolo triangolo rosa arrotondato al centro del muso bianco; bocca a “ω” sottilissima.
- Nessun sopracciglio, nessuna lingua, nessun dente, nessun baffo disegnato (sotto i 40 px diventa rumore).
- Regole d'espressione: calmo di default; contento = occhi leggermente più aperti e orecchie dritte; assonnato = occhi chiusi a mezzaluna verso il basso. Mai triste, arrabbiato o sorpreso a bocca aperta: il PET non giudica e non chiede attenzione.

## Stati

| Stato | Posa | Movimento | Sprite (frame @ fps) |
|---|---|---|---|
| `idle` | in piedi/seduto composto, testa alta, coda alzata a uncino | respiro lieve del corpo, coda che oscilla lenta, un battito di ciglia ogni ~5 s | 4 @ 4 (+ 2 frame di blink) |
| `walk` | quattro zampe, coda portata alta | passo a coppie diagonali, testa che ondeggia di ≤ 1 px | 6 @ 10 |
| `rest` | “pagnotta”: zampe nascoste, corpo basso e largo, testa abbassata e inclinata, occhi chiusi, coda corta appoggiata a terra | solo respiro lento | 2 @ 1 |
| `react` | orecchie dritte, occhi un filo più aperti, coda verticale | un piccolo salto (≤ 9 px) e una vibrazione della coda, non in loop | 5 @ 12 |

Reduced motion: ogni stato ha una **posa statica** completa (frame 0) che si legge senza animazione; in particolare `rest` mostra già occhi chiusi e corpo accucciato e `react` orecchie dritte e coda alzata.

## Formato

Preferito: **SVG a parti separate**, animate da CSS. Alternativa: **sprite sheet** WebP @3x (120 × 120 per frame).

| Requisito | Valore |
|---|---|
| Ingombro logico | 40 × 40 px (box) |
| Direzione | disegnato rivolto a destra; il renderer riceve `setFacing('left')` e specchia la figura |
| Parti SVG (classi stabili) | `k-tail`, `k-leg-hind-far`, `k-leg-front-far`, `k-body`, `k-leg-hind-near`, `k-leg-front-near`, `k-head`, `k-ear-far`, `k-ear-near`, `k-face`, `k-eyes-open`, `k-eyes-closed`, `k-nose`, `k-mouth`, ancoraggio `k-collar` |
| Ordine di disegno | coda → zampe lontane → corpo → zampe vicine → testa (orecchie, cranio, muso, occhi, naso, bocca) → accessori |
| Pivot | coda: attacco al corpo; zampe: spalla/anca; testa: collo; orecchie: base |
| Peso | SVG ≤ 8 KB per l'intero personaggio; sprite ≤ 60 KB totali |
| Sfondo | trasparente; nessuna ombra a terra nell'asset (l'ombra è CSS) |
| Test di leggibilità | verificare a 40 px e a 28 px, @1x e @3x, su `#1a1520` e su una foto chiara |

Il kitten preview v0 in `pet.js` / `pet.css` usa già queste classi e questo ordine: le pose CSS sono riutilizzabili dall'asset finale.

## Skin e accessori (futuri premi)

- Skin = variazione del mantello dello stesso gattino (es. bianco/grigio di base, notte, crema) con contorno, parti e pivot identici.
- Accessori = layer separato su ancoraggi dichiarati (`neck` = linea del collare tra muso e petto, `head` = tra le orecchie); ogni accessorio ≤ 2 KB SVG; colore dagli accenti di US. Primo esempio nel preview: `collar` (`setAppearance({ accessory: 'collar' })`).
- Nomi file: `assets/source/pet/us-pet-kitten-<skin>-v1.svg`, `assets/source/pet/accessories/us-pet-acc-<id>-v1.svg`, derivati runtime in `assets/derived/runtime/pet/`.

## Vincoli per il set finale

1. Stesso box, piedi, pivot e nomi di parte del preview v0, così il runtime e le pose non cambiano.
2. Leggibile a 28 px: orecchie, testa grande, occhi azzurri e coda devono restare distinti.
3. Niente testo, cuori, scintille o emoji nell'asset; le reazioni sono pose, non simboli.
4. Due versioni di posa per ogni stato (animata + statica per reduced motion).
5. Bianco caldo e grigio neutro sotto tutti i temi; contrasto della figura con la nav scura ≥ 3:1 sul bianco.
6. Consegna come sorgente vettoriale + derivati runtime ottimizzati; nessun asset scaricato da librerie esterne.

## Integrazione

- Il renderer sprite/vector si registra con `USPet.registerRenderer({ id: 'sprite', mount(host) })`. `mount` riceve un host dedicato 40 × 40, ancora staccato dal DOM: viene agganciato solo se il mount riesce. Restituisce:

  | Metodo | Quando | Argomenti |
  |---|---|---|
  | `setState(state, { reason })` | a ogni cambio di stato | `idle` / `walk` / `rest` / `react`; `reason` solo per `react` |
  | `setFacing(facing)` | al mount e quando la direzione cambia | `'left'` / `'right'` |
  | `setAppearance({ skin, accessory })` | al mount e quando cambia il premio equipaggiato | token già sanificati `[a-z0-9_-]` |
  | `destroy()` | quando il renderer viene sostituito | — |

  La posizione orizzontale resta del runtime (transform sul contenitore): il renderer disegna solo la figura e non dipende dalle classi CSS del placeholder. Il runtime chiama i metodi solo se presenti.
- Selezione fail-closed e atomica: un id sconosciuto o un `mount` che fallisce (anche dopo aver modificato il proprio host) lascia intatti renderer, host e nodi vivi correnti; il `destroy()` del precedente avviene solo dopo un mount riuscito; il `placeholder` (kitten preview v0) si monta solo in preview esplicita, mai come fallback di produzione.
- Con l'asset approvato: aggiungere le voci `APPROVED` al manifest, i file al precache SW e alle build, registrare `sprite`, poi impostare `PET_ASSET_STATUS = 'APPROVED'`.
