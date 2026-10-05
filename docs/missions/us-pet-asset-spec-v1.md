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
| Direzione | disegnato rivolto a destra; la sinistra si ottiene in CSS con `scaleX(-1)` |
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

- Il renderer sprite/vector implementa il contratto `USPet.registerRenderer({ id, mount(host) })` già presente.
- Con l'asset approvato: aggiungere le voci `APPROVED` al manifest, i file al precache SW e alle build, poi togliere il gate `PET_ASSET_STATUS`.
