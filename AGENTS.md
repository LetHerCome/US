# US Project Authority

**IMPLEMENTATION — CREDIT EFFICIENCY — EXECUTION EFFICIENCY**

- US is a private couple app built with vanilla HTML, CSS, and JavaScript, backed by Supabase and shipped as a PWA.
- Preserve the existing visual identity. Do not introduce React, Tailwind, new frameworks, rewrites, or redesigns unless explicitly requested.
- `ui-foundation.css` and `ui-foundation.js` are the authority for cross-cutting UI primitives.
- Work on a dedicated branch: implement, test proportionally to risk, review, then merge. Never work directly on `main`.
- Reuse existing systems and helpers before creating new ones. Do not create parallel implementations.
- Auth, Push, Sync, private caching, and the Service Worker are sensitive surfaces. Preserve `us-private-media-v1` unless an explicitly authorized flow requires clearing it.
- Any Service Worker or cache change requires the relevant release gate.
- Design and verify mobile-first, including safe areas and constrained viewports when affected.
- A native shell follows the US 1.0 Freeze. Do not introduce duplicate native/web systems now.
- Keep micro-fixes as small prompts/tasks. Give architectural milestones deeper analysis before implementation.

## Visual Asset Authority

- Assets marked `APPROVED` in `assets/ASSET_MANIFEST.json` are the visual authority.
- Codex must not redraw, modify, recolor, crop, simplify, optimize, overwrite, or replace an approved asset.
- If an approved asset is not suitable for a technical target, stop and report the constraint.
- Any derivative must originate from the master without altering its source.
- Do not invent a visual asset when an approved one is missing.

## UI Icon Authority

- Phosphor is the only approved standard icon library.
- Do not replace Phosphor icons with another icon library.
- Do not invent custom icons; if the required custom icon does not exist, stop and report it.
- Do not generate custom SVG icons autonomously.
