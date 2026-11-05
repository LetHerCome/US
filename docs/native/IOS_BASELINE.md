# US iOS Native Baseline (M15)

**Status:** baseline, extended by iOS Store V1 (05/11/2026, [mission](../missions/ios-store-v1.md)): Store-ready
except what needs the Apple Developer account. No signing material in the repository, no extensions yet.

## Shape

```
shared web app (index.html + *.js/*.css)       platform-neutral product logic
  └─ scripts/build-capacitor-web.mjs            → dist/capacitor (same bundle as Android)
native-entry.mjs (+ app-links.mjs)              native-only glue, bundled into native-entry.js
platform.js                                     capability boundary (unchanged in M15)
ios/App/App.xcodeproj                           Capacitor 8 iOS target, Swift Package Manager (CapApp-SPM)
  App/AppDelegate.swift                         backup exclusion for WebView data at launch
  App/SceneDelegate.swift                       root = UsBridgeViewController
  App/UsBridgeViewController.swift              CAPBridgeViewController + left-edge Back
  App/UsAppConfiguration.swift                  bundle id, reserved App Group, URL scheme, colours
  App/UsPrivateStorage.swift                    Library/WebKit excluded from iCloud/Finder backups
  App/PrivacyInfo.xcprivacy                     privacy manifest: no tracking, collected data, boot-time reason
  App/App.entitlements                          aps-environment + applinks:www.uscouple.app
  App/{it,en}.lproj/InfoPlist.strings           permission prompts in Italian and English
  App/Assets.xcassets/AppIcon*.appiconset       default icon + Night/Gold/Neon alternate icons
native-plugins/us-app-icon/ios                  UsAppIcon: setAlternateIconName (Premi Sintonia V2)
android/                                        untouched by M15
```

Identity: bundle id `com.usapp.us` (same as Android `applicationId`), display name `US`, iPhone only
(`TARGETED_DEVICE_FAMILY = 1`). The committed `MARKETING_VERSION 1.0` / `CURRENT_PROJECT_VERSION 1` are
placeholders: `ios-testflight.yml` sets the version name and a build number in minutes since 2026-01-01
UTC (like Play's `versionCode`, so `get_app_min_version('ios')` reads the same way).

**Deployment target: iOS 16.0.** The shared CSS relies on `:has()` and `dvh` (WebKit 15.4+),
Capacitor 8 requires 15.0, and iOS 16 is the first release with lock-screen WidgetKit
accessories. iOS 17-only APIs (interactive widgets, App Intents) are availability-gated later.

## Behaviour decisions

| Area | Decision |
| --- | --- |
| Edge-to-edge / safe areas | `ios.contentInset = never`; the web layer already uses `env(safe-area-inset-*)` via `--us-safe-*` with `viewport-fit=cover`. Status bar light content, app forced to Dark appearance (matches `color-scheme: dark`). |
| Launch | LaunchScreen.storyboard: approved US symbol (byte copy of the Android splash symbol) centred on `#26142E`, the default Android splash colour; the WebView background before first paint is the same, and the opening animation (index.html) starts from it. The colour per Atmosfera is Android-only: the iOS launch screen is static. |
| App icon | 1024×1024 opaque, the icon of Android 1.4: `us-launcher-symbol-v2` on white; Night, Gold and Neon as alternate icons from their approved layers. Operation `ANDROID_ADAPTIVE_VISIBLE_1024_OPAQUE`: the part an Android adaptive launcher shows (central 2/3), as in the approved collection tiles. Regenerate with `python3 scripts/build-ios-brand-assets.py` (Pillow); hashes in `ios/brand-assets-manifest.json`. |
| App icon choice | `UsAppIcon` (`get`/`set`, same ids as Android) calls `setAlternateIconName`; the names come from `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`. iOS always shows its own alert when the icon changes. |
| Languages | `CFBundleLocalizations` it/en, development region `en`: Italian on Italian phones, English elsewhere, like `i18n.js`. |
| Updates | `app-update.js` with `@capawesome/capacitor-app-update`: no in-app update on iOS; below `get_app_min_version('ios')` «Aggiorna» opens the App Store page (`APP_STORE_ID`). When the App Store lookup fails, the installed build comes from `App.getInfo`. |
| Keyboard | WebKit default (overlay + `visualViewport` shrink), i.e. the behaviour of the installed iOS PWA that `fix4.js` already measures. No `@capacitor/keyboard` resize mode: it would shrink `innerHeight` too and defeat `us-keyboard-open` detection. |
| Back | Left-edge swipe calls `window.UsNavigation.handleNativeBack()` — the exact function Android Back calls. WKWebView back/forward swipes stay off (no forward replay, no snapshots). When nothing is left to close, nothing happens (iOS apps do not exit). |
| Foreground / background / resume | WKWebView fires `visibilitychange`; `app.js` already refreshes on foreground (`refreshVisibleState({foreground:true})`). `@capacitor/app` `appStateChange`/`resume` are available through `UsCapacitorRuntime.app` for later needs. |
| Cold start | Local bundle (`capacitor://localhost`), no remote `server.url`. The launch URL is read once (`App.getLaunchUrl`) and deduplicated against `appUrlOpen`. |
| Session persistence | Supabase session in IndexedDB (`auth-storage.js`) inside the app's WebKit store, origin `capacitor://localhost`. **Do not change `ios.scheme`/hostname later**: it would orphan every stored session. |
| Privacy-sensitive storage | `Library/WebKit` excluded from backups at launch (iOS mirror of Android `allowBackup=false`): a restored/migrated device signs in again. Default Data Protection class. No service worker, no Web Push, no private web media cache natively (`platform.js`). |
| Deep links | URL scheme `com.usapp.us` (reverse-DNS, collision-resistant). `app-links.mjs` accepts only `com.usapp.us://open/<oggi|noi|ricordi|gioca>`; no actions, no parameters. Links arriving before a paired profile wait for `us-auth-resolved`. Android does not register this scheme (unchanged). |
| Universal Links | Entitlement `applinks:www.uscouple.app`; the site file comes from `scripts/write-apple-app-site-association.mjs <TEAM ID>` and is served as JSON (`cloudflare/_headers`). Capacitor turns the link into `appUrlOpen`; `onboarding.js` reads `https://www.uscouple.app/invito#CODE` as on Android. |
| Removed surfaces | Same staged bundle as Android: no Stories, no manifest/PWA install, no service worker, no Scriptable. Widget Hub stays hidden on iOS because `UsWidgetBridge` is Android-only (`widgets.js` → `nativeEnabled` false). |

## Prepared for later (not implemented)

| Feature | Foundation in place | Still needed |
| --- | --- | --- |
| Push / APNs | Done in the app (`@capacitor/push-notifications`, `us-push-support`, `aps-environment`) and on the server (`native-push-transport.mjs`). | APNs auth key (.p8) in the Supabase secrets; Push capability on the App ID. |
| Haptics | `@capacitor/haptics` already linked via SPM; `UsPlatform.haptic()` works on iOS. | Product tuning only. |
| Biometrics | Done: `us-app-lock` iOS (Native Security V1). | Device QA. |
| WidgetKit | Reserved App Group `group.com.usapp.us.shared` (`UsAppConfiguration.appGroupIdentifier`); widget URLs will use `com.usapp.us://widget/<kind>`. | Widget extension target `com.usapp.us.widgets`, App Groups entitlement on app + extension, an iOS `UsWidgetBridge` implementation with the same JS contract, extending `widgets.js` link parsing to the iOS scheme. |
| Share Extension | Same App Group. | Extension target `com.usapp.us.share`, upload handoff design. |
| Quick Actions | `app-links.mjs` routes already map to the four primary pages. | `UIApplicationShortcutItems` + scene `performActionFor` forwarding to the same routes. |
| Universal Links | Done: entitlement, AASA generator, `_headers`. | Team ID, then the AASA file published with the site. |

App Group plan: one group, `group.com.usapp.us.shared`, shared by the app and every future
extension. Contents limited to what Android already shares with its widgets (semantic snapshot,
bounded photo cache, owner hash); never the Supabase refresh token. Credentials shared with
extensions go in a Keychain access group, not in the App Group container.

## Build and validation

Local (macOS with Xcode 16+/26):

```
npm ci
npm run build:capacitor-web
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

`npm run build:capacitor-web` now runs on macOS/Linux too: off Windows the web brand prebuild
verifies the committed APPROVED derivative by hash instead of regenerating it with System.Drawing.

CI: `.github/workflows/ios-native.yml` (macOS runner, `workflow_dispatch` + path-filtered push/PR)
runs the native contract tests and the host `swiftc` checks of the plugins' pure logic, the web build,
`cap sync ios`, checks the sync left the committed project unchanged, then unsigned Debug and Release
simulator builds, inspects the built bundle (alternate icons, permission prompts, iPhone only, privacy
manifest) and launches the app in an iPhone simulator, keeping a screenshot as an artifact.

Signing and TestFlight: `.github/workflows/ios-testflight.yml`, manual, from `main`, in the GitHub
environment `ios-deploy` (founder approval): Xcode automatic signing with an App Store Connect API key,
upload straight to App Store Connect; the .ipa is never an artifact (public repository).
Setup: [`docs/store/ios/GIORNO_ACQUISTO.md`](../store/ios/GIORNO_ACQUISTO.md).

## Apple setup still required (Francesco)

Superseded by the step-by-step list [`docs/store/ios/GIORNO_ACQUISTO.md`](../store/ios/GIORNO_ACQUISTO.md) (05/11/2026); kept as the original M15 outline.

1. Apple Developer Program membership (paid) and the **Team ID**.
2. Register App ID **`com.usapp.us`** (explicit). No capabilities needed for the M15 build.
3. App Store Connect: create the app record (name "US", bundle `com.usapp.us`, SKU, primary language Italian), and add internal TestFlight testers.
4. Signing: in Xcode set the Team on target App (Automatic signing), or for CI create an Apple Distribution certificate (.p12 + password) and an App Store provisioning profile for `com.usapp.us`; for CI uploads an App Store Connect API key (Issuer ID, Key ID, .p8).
5. App Store Connect privacy questionnaire ("nutrition labels") and export compliance (the app declares `ITSAppUsesNonExemptEncryption = false`: HTTPS only).
6. Later milestones: App Group `group.com.usapp.us.shared`, Push Notifications + APNs key, Associated Domains — each must be enabled on the App ID and the profiles regenerated.

Until 1–4 exist there is no signed device build or TestFlight upload; the simulator build is the proof the target compiles.
