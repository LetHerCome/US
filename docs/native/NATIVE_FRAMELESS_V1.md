# US — Native Frameless / Edge-to-edge V1

Status: **review candidate**, not merged, not installed, not deployed.

## Goal
Android and iOS draw the US canvas under the visible system status bar (clock,
notifications, battery, cutouts) and gesture navigation area. This is *not*
immersive fullscreen: system bars must stay visible and icons legible.

## Platform implementation
- Android Capacitor 8: `MainActivity` calls `EdgeToEdge.enable(this)` after
  bridge startup. Configuration keeps `SystemBars.hidden=false`,
  `style=DARK` (light icons on dark UI), `insetsHandling=css` for older
  WebView insets, and `initialViewportFitValueHint=cover`.
- iOS: existing `UIViewControllerBasedStatusBarAppearance=true`,
  `UIStatusBarStyleLightContent` and `ios.contentInset=never` stay in
  place. The root controller extends under system bars; WKWebView disables
  UIKit's automatic content inset and keeps dark launch background.
- `native-frameless.css` is injected **only** into Capacitor's staged
  `index.html`. PWA index, service worker, build ID and Cloudflare bundle
  stay unchanged.
- Oggi: hero photo extends under the status bar; top shell, daily ritual and
  Countdown keep safe-area-aware positioning.
- Noi / Ricordi / Gioca / Impostazioni: existing app safe-area padding and
  Home-only top chrome behavior remain intact. The nav dock stays above the
  lower gesture inset.

## Device QA before release
1. Android 17 physical device (gesture navigation): background/photo visible
   under clock and notification icons; white icons legible; notifications and
   pull-down shade still operate.
2. Android 3-button navigation (if available): contrast scrim may remain for
   legibility; do not attempt to hide navigation buttons.
3. Oggi with photo, without photo, with Countdown, and with the daily prompt:
   no content or controls overlap cutout/status region.
4. Noi, Ricordi, Gioca, Sintonia and Impostazioni: first card is below safe
   area, bottom dock and interactive controls stay above gesture region.
5. Android keyboard open/close: form fields and focused controls accessible,
   no double top/bottom padding.
6. Rotation / small screens: no black rectangular band or notch collision.
7. iPhone 13 Pro simulator/device (when available): status icons remain
   visible, photograph is full-bleed under the notch, popups and tab bar avoid
   home indicator.
8. Compare native and PWA: web styling and updates unchanged.
9. Repeat with an older Android WebView: Capacitor CSS inset fallback can
   choose safe letterboxing over full-bleed; never sacrifice readable controls.

## Release policy
Do not publish signed Android APK or request Apple signing yet. Integrate with
the other approved UX tasks, then run full device QA and create an Android
update signed with the **existing** key and incremented versionCode. iOS
device testing requires a compatible signing/provisioning path; simulator CI
only verifies buildability.
