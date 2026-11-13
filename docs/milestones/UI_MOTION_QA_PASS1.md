# US — Motion & Visual QA (UI only) · 2026-10-09

## Scope
Only front-end presentation and existing native UI. Do not alter RLS, couple membership, invitations, storage policy, notifications or backend contracts. Keep **Diario 3D** and **N3.7 native sizing** frozen; report layout breakages without changing those frozen passes.

## Visual motion language
- Taps: ~90 ms tactile press, never an unrelated animation on every nested element.
- Page navigation by tab: 220–240 ms directional fade/translate, with no overlapping stale timers.
- Swipe: direct 1:1 tracking during drag; ease only when released. No duplicate fade when promoting preview to active page.
- Centered popups: opacity and 3D/scale movement synchronized over ~260 ms, fixed scrim, no bottom sheet.
- Content updates: small local fades and no jumps of the full page.
- Photo change: preload and decode, then crossfade; keep previous image visible until the new one is ready.
- Widget RemoteViews: do not promise arbitrary animations or always-on private photo rotation while the app is closed.
- Respect `prefers-reduced-motion` and the shared UI motion switch.

## Test matrix — real Android first
| Surface | Entry / interaction | What to verify |
| --- | --- | --- |
| Oggi | Open, photo rotation, Focus Photo | No black frame, hero never blanks, overlays fade as a unit |
| Noi / Sintonia | Hub → subpage → hub, rewards toggle | No jumping scroll, clipped reward card or asynchronous flash |
| Ricordi | Feed, multi-photo swipe, lightbox | Photo remains decoded, captions don't jump, swipe doesn't accidentally change tab |
| Gioca | Deck horizontal swipe, quiz, reveal | Deck swipe remains independent of tab swipe, status updates are local |
| Impostazioni | Section navigation, dialogs, toggle | Same centered sheet timing, keyboard never clips controls |
| Calendar / Countdown | Month change, create/edit | Dialog and date picker do not overlap bottom nav |
| Ti penso | Send, incoming display, close/reopen | No duplicated entrance pulse, haptic and sound align to actual outcome |
| Widget Hub | Preview, install, manual help | Preview current, closed accordion accessible, launcher does not conflict |

## Dimensions / states
- Portrait 360×800, 393×852, 412×915; Android with keyboard open, low battery, reduced motion.
- Test opening and closing each modal quickly three times; rapid tab taps back and forth; drag and cancel swipe at either edge.
- Check both empty and populated screens, slow photo loads, and offline state without showing stale confirmation.
- Capture short screen recording plus before/after screenshots for every concrete visual bug.
- Verify no auth, storage, couple, game or reward domain code changes.

## Gate
Pass 1 is only complete after native CI and physical Android QA. No automatic merge or deploy; do not treat automated CSS contracts as visual validation.
