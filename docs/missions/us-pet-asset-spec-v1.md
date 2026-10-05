# US PET — Asset requirement V1

**Status:** REQUIREMENT, nessun asset approvato
**Owner decision:** Francesco (approva l'asset e poi lo registra come `APPROVED` in `assets/ASSET_MANIFEST.json`)

Finché questo documento non ha un asset approvato, il PET resta spento in produzione. Il renderer `placeholder` di `pet.js` serve soltanto a sviluppare e verificare movimento, lifecycle e collisioni in locale.

## Carattere

- Parte di US, non una mascotte da gioco: piccolo, quieto, notturno, affettuoso.
- Linguaggio formale del simbolo US approvato: curve morbide, un solo volume, niente contorni spessi “cartoon”.
- Niente emoji, niente occhi giganti, niente animale riconoscibile da sticker pack. Un essere minimo che si legge da 28 px.
- Palette: neutro caldo (avorio/perla) con un solo punto di luce che prende `--us-color-accent-strong`, così temi e accenti lo colorano senza nuovi asset.

## Formato

Preferito: **SVG a parti separate** (corpo, occhio/i, punto di luce, ombra) con id stabili, animati da CSS. Alternativa: **sprite sheet** PNG/WebP @3x.

| Requisito | Valore |
|---|---|
| Ingombro logico | 40 × 40 px (box), corpo ≤ 32 px di altezza |
| Piedi/base | appoggiati sulla riga inferiore del box (y = 40) |
| Direzione | disegnato rivolto a destra; il renderer riceve `setFacing('left')` e può specchiare la figura (es. `scaleX(-1)`) |
| Peso | SVG ≤ 6 KB per stato; sprite ≤ 40 KB totali |
| Sfondo | trasparente; nessuna ombra esterna “cotta” nell'asset (l'ombra è CSS) |

## Stati e frame

| Stato | Uso | Sprite (frame @ fps) | SVG |
|---|---|---|---|
| `idle` | fermo, respiro | 4 @ 4 | corpo che scala 1→1.03 |
| `walk` | spostamento lungo la nav | 6 @ 10 | 2 pose alternate + rimbalzo |
| `rest` | seduto/accoccolato, occhi chiusi | 2 @ 1 | posa dedicata |
| `react` | piccolo salto + luce che si accende | 5 @ 12, non in loop | posa dedicata |

Reduced motion: serve **una posa statica per stato** (frame 0) leggibile senza animazione.

## Skin e accessori (futuri premi)

- Skin = variazione del materiale (es. perla, carta, notte), stesso contorno: nuovo file con lo stesso layout di parti/frame.
- Accessori = layer separato con anchor point dichiarati (`head`, `neck`) nel sistema 40 × 40; ogni accessorio ≤ 2 KB SVG.
- Nomi file: `assets/source/pet/us-pet-<skin>-v1.svg`, `assets/source/pet/accessories/us-pet-acc-<id>-v1.svg`, derivati runtime in `assets/derived/runtime/pet/`.

## Integrazione

- Il renderer sprite/vector si registra con `USPet.registerRenderer({ id: 'sprite', mount(host) })`. `mount` riceve un host dedicato 40 × 40, ancora staccato dal DOM: viene agganciato solo se il mount riesce. Restituisce:

  | Metodo | Quando | Argomenti |
  |---|---|---|
  | `setState(state, { reason })` | a ogni cambio di stato | `idle` / `walk` / `rest` / `react`; `reason` solo per `react` |
  | `setFacing(facing)` | al mount e quando la direzione cambia | `'left'` / `'right'` |
  | `setAppearance({ skin, accessory })` | al mount e quando cambia il premio equipaggiato | token già sanificati `[a-z0-9_-]` |
  | `destroy()` | quando il renderer viene sostituito | — |

  La posizione orizzontale resta del runtime (transform sul contenitore): il renderer disegna solo la figura e non dipende dalle classi CSS del placeholder. Il runtime chiama i metodi solo se presenti.
- Selezione fail-closed e atomica: un id sconosciuto o un `mount` che fallisce (anche dopo aver modificato il proprio host) lascia intatti renderer, host e nodi vivi correnti; il `destroy()` del precedente avviene solo dopo un mount riuscito; il `placeholder` si monta solo in preview esplicita, mai come fallback di produzione.
- Con l'asset approvato: aggiungere le voci `APPROVED` al manifest, i file al precache SW e alle build, registrare `sprite`, poi impostare `PET_ASSET_STATUS = 'APPROVED'`.
