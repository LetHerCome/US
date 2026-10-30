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
