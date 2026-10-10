# US — Android UI feedback V2

This is a **UI/native-widget-only** follow-up on draft PR #170.

## Ti penso
- On a confirmed send, the native widget returns immediately to the ready “Ti penso” state. A short 1.8s anti-double-tap guard remains, but the widget does **not** depend on an Android alarm to clear an “Inviato” message.
- Local account-bound, deduplicated confirmed sends from **this widget on this device only** appear as `N inviati · 24h`. These are rolling 24 hours (not calendar day), not an app-wide server statistic.
- The record uses app-private no-backup storage, is wiped on account change/logout, and counts only an acknowledged send. No new backend endpoint or permission.

## Noi 2x1
- Soft cream-pink background, one tap on the whole card to open Noi. No GIOCA CTA or invitations.
- Its two portraits are taken from the two avatars already visible on the Noi page, composed into a small private on-device JPEG by the WebView. Missing avatars show a tasteful fallback. URLs/credentials never reach the native widget.
- Displays only the sanitized *distance text* and whether it is the last known reading. Never stores or fetches coordinates in widget code. Updates while US is active; does not promise real-time location with US closed.
- Retains the original app widget provider name and installed widget IDs.

## Gestures and help
- Global left/right navigation swipe has been removed; system edge Back and bottom tabs remain. Ricordi carousels, game swipe and dismiss gestures are untouched.
- Static, noninteractive widget instructions removed. The native one-tap “Aggiungi alla Home” action stays; unsuccessful attempts now show brief status text.

## Required device QA
Install the signed internal Android build as an **update** over the existing US. Never uninstall or clear data. Check:
1. Ti penso ready immediately after send, counter increments once on actual success; no increment on offline/error/duplicate; counter ages out after 24 hours and is private to active account.
2. Noi two profile photos (when configured), brighter card, current or last-known distance identical to Noi screen, no fake distance with permissions denied.
3. Existing pinned widgets survive update and open Noi on tap.
4. Edge Back works; sideways swipes cannot switch the four main tabs; carousel swipe inside Ricordi still works.
5. Widget Hub has no obsolete instructions, add button still works.
6. Regression: Foto & Noi still follows Oggi, Countdown, sounds/haptics, iOS build, Android keyboard and Ricordi photos.

Do not merge to main or deploy production until combined CI and physical Android QA are approved.
