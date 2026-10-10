# US — Widget + Motion integrated UI branch (2026-10-09)

Sources: PR #167 (Ti penso, Foto & Noi and widget help), PR #169 (Noi action widget) and PR #168 (Premium Motion pass 1).
Scope: UI-only integration. Supabase, RLS, MC3, server push, Diario 3D, Ricordi scrapbook and N3.7 native sizing remain untouched.

Deep links: `think → home`, `countdown → home`, `noi → bond`, `noi/play → quiz`, `photo → home`.
One entrypoint cache/build version: `us-widget-motion-integration-v1-20261009-1`.

## Automated QA
- `node --test tests/widget-system.test.js tests/m5c1-photo-motion.test.js tests/premium-motion-v1.test.js tests/ui-widget-motion-integration.test.js`
- `npm test`
- `npm run build:capacitor-web`
- Android native CI, including `testDebugUnitTest` and compile.

## Physical Android QA (required before merging)
- Install a **signed** QA APK as an **update**, with the same permanent signing key and higher `versionCode`. Do NOT uninstall or wipe app data.
- Verify all four already-installed widgets survive the APK update, keeping preferences/positions.
- Foto & Noi follows the photograph that actually appears on Oggi after crossfade and on returning to foreground. Keep the previous cached photo until new image paint. This does NOT guarantee live private photo updates while app is closed.
- Tap Ti penso: remote widget immediately shows Invio…, then actual result. Do not force costly Foto & Noi redraw merely to show progress.
- Noi 2×1: tap the card for Noi; tap GIOCA for the existing Gioca hub. Confirm independent tap targets and no clipping on Xiaomi launcher.
- Settings > Widget includes a collapsible manual guide that is always reachable.
- Rapid tab switches and swipes, cancel/release transitions, centered popups, reduced-motion setting, and slow-photo transition.
- Regression-check emoji keyboard, Ricordi photo loading and session persistence after upgrade.

No production deploy or merge until explicit QA approval. Signing secret must stay in protected build infrastructure.