# US font provenance

Design "Due colori, un Noi" (approved by the founder on 2026-10-14): titles in Fraunces, text and controls in Figtree. They replace Newsreader and Inter.

## Fraunces

- Upstream: https://github.com/undercasetype/Fraunces, as packaged by Fontsource (`@fontsource-variable/fraunces` 5.3.0, files `fraunces-latin-full-normal.woff2` and `fraunces-latin-full-italic.woff2`).
- Local files: `Fraunces-Soft-Roman.woff2`, `Fraunces-Soft-Italic.woff2`.
- Change: the `SOFT` axis is pinned at 100 and `WONK` at 1 with fontTools `varLib.instancer`, so every title gets the soft shapes without `font-variation-settings`. The `opsz` and `wght` axes stay variable. Latin subset only.
- License: SIL Open Font License 1.1 (`Fraunces-OFL.txt`). No Reserved Font Name.
- Copyright: The Fraunces Project Authors.

## Figtree

- Upstream: https://github.com/erikdkennedy/figtree, as packaged by Fontsource (`@fontsource-variable/figtree` 5.3.0).
- Local files: `Figtree-Latin.woff2` (`figtree-latin-wght-normal.woff2`) and `Figtree-LatinExt.woff2` (`figtree-latin-ext-wght-normal.woff2`), unchanged. The `wght` axis is variable.
- License: SIL Open Font License 1.1 (`Figtree-OFL.txt`). No Reserved Font Name.
- Copyright: The Figtree Project Authors.

Downloaded from the npm registry on 2026-10-14. No runtime CDN or Google Fonts dependency is used.

## Android widgets

- `native-plugins/us-widget-bridge/android/src/main/res/font/`: `us_font_fraunces.ttf`, `us_font_fraunces_italic.ttf` and `us_font_figtree.ttf` are the files above, decompressed from WOFF2 to TTF without changes (Google's `woff2` decoder, `wawoff2` 2.0.1), because Android font resources do not read WOFF2. Same licences. Added on 2026-11-02 for the «Pastello» widgets.

## Gochi Hand e Permanent Marker (diario pulito, 15/11/2026)

Studio «Il diario, ma pulito», approvato dal founder il 15/11/2026: la scrittura a mano solo per quello che scrive la coppia (Gochi Hand) e «us» in alto su Oggi (Permanent Marker).

- **Gochi Hand:** `@fontsource/gochi-hand` 5.3.0, file `gochi-hand-latin-400-normal.woff2` → `GochiHand-Latin.woff2`, senza modifiche. Licenza SIL Open Font License 1.1 (`GochiHand-OFL.txt`), Reserved Font Names «Gochi» e «Gochi Hand»: il file non è modificato e il nome resta quello. Copyright (c) 2011, HT Fonts.
- **Permanent Marker:** `@fontsource/permanent-marker` 5.3.0, file `permanent-marker-latin-400-normal.woff2` → `PermanentMarker-Latin.woff2`, senza modifiche. Licenza Apache 2.0 (`PermanentMarker-Apache-2.0.txt`). Font Diner.

Presi dal registro npm il 15/11/2026. Nessun Google Fonts a runtime.
