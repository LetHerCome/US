# US iOS Native Baseline (M15)

**Status:** baseline for review. No signing material, no capabilities, no extensions.

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
  App/PrivacyInfo.xcprivacy                     app privacy manifest (no tracking)
android/                                        untouched by M15
```

Identity: bundle id `com.usapp.us` (same as Android `applicationId`), display name `US`,
`MARKETING_VERSION 1.0`, `CURRENT_PROJECT_VERSION 1`.

**Deployment target: iOS 16.0.** The shared CSS relies on `:has()` and `dvh` (WebKit 15.4+),
Capacitor 8 requires 15.0, and iOS 16 is the first release with lock-screen WidgetKit
accessories. iOS 17-only APIs (interactive widgets, App Intents) are availability-gated later.

## Behaviour decisions

| Area | Decision |
| --- | --- |
| Edge-to-edge / safe areas | `ios.contentInset = never`; the web layer already uses `env(safe-area-inset-*)` via `--us-safe-*` with `viewport-fit=cover`. Status bar light content, app forced to Dark appearance (matches `color-scheme: dark`). |
| Launch | LaunchScreen.storyboard: approved US symbol (byte copy of the Android splash symbol) centred on `#08040E`; WebView background `#08040E`, so no white flash before first paint. |
| App icon | 1024×1024 opaque, `FIT_CENTER_DARK_08040E` of `assets/source/brand/us-symbol-master-v1.png` — the Android launcher operation. Regenerate with `python3 scripts/build-ios-brand-assets.py` (Pillow); hashes in `ios/brand-assets-manifest.json`. |
| Keyboard | WebKit default (overlay + `visualViewport` shrink), i.e. the behaviour of the installed iOS PWA that `fix4.js` already measures. No `@capacitor/keyboard` resize mode: it would shrink `innerHeight` too and defeat `us-keyboard-open` detection. |
| Back | Left-edge swipe calls `window.UsNavigation.handleNativeBack()` — the exact function Android Back calls. WKWebView back/forward swipes stay off (no forward replay, no snapshots). When nothing is left to close, nothing happens (iOS apps do not exit). |
| Foreground / background / resume | WKWebView fires `visibilitychange`; `app.js` already refreshes on foreground (`refreshVisibleState({foreground:true})`). `@capacitor/app` `appStateChange`/`resume` are available through `UsCapacitorRuntime.app` for later needs. |
| Cold start | Local bundle (`capacitor://localhost`), no remote `server.url`. The launch URL is read once (`App.getLaunchUrl`) and deduplicated against `appUrlOpen`. |
| Session persistence | Supabase session in IndexedDB (`auth-storage.js`) inside the app's WebKit store, origin `capacitor://localhost`. **Do not change `ios.scheme`/hostname later**: it would orphan every stored session. |
| Privacy-sensitive storage | `Library/WebKit` excluded from backups at launch (iOS mirror of Android `allowBackup=false`): a restored/migrated device signs in again. Default Data Protection class. No service worker, no Web Push, no private web media cache natively (`platform.js`). |
| Deep links | URL scheme `com.usapp.us` (reverse-DNS, collision-resistant). `app-links.mjs` accepts only `com.usapp.us://open/<oggi|noi|ricordi|gioca>`; no actions, no parameters. Links arriving before a paired profile wait for `us-auth-resolved`. Android does not register this scheme (unchanged). |
| Removed surfaces | Same staged bundle as Android: no Stories, no manifest/PWA install, no service worker, no Scriptable. Widget Hub stays hidden on iOS because `UsWidgetBridge` is Android-only (`widgets.js` → `nativeEnabled` false). |

## Prepared for later (not implemented)

| Feature | Foundation in place | Still needed |
| --- | --- | --- |
| Push / APNs | `UIApplicationDelegate` + `SceneDelegate` in our module; web push already disabled natively. | Push Notifications capability, `aps-environment` entitlement, APNs auth key (.p8), `@capacitor/push-notifications`, backend sender for APNs. |
| Haptics | `@capacitor/haptics` already linked via SPM; `UsPlatform.haptic()` works on iOS. | Product tuning only. |
| Biometrics | Root VC is ours (`UsBridgeViewController`) for a privacy cover/lock overlay. | `NSFaceIDUsageDescription`, a LocalAuthentication plugin, Keychain-held session key. |
| WidgetKit | Reserved App Group `group.com.usapp.us.shared` (`UsAppConfiguration.appGroupIdentifier`); widget URLs will use `com.usapp.us://widget/<kind>`. | Widget extension target `com.usapp.us.widgets`, App Groups entitlement on app + extension, an iOS `UsWidgetBridge` implementation with the same JS contract, extending `widgets.js` link parsing to the iOS scheme. |
| Share Extension | Same App Group. | Extension target `com.usapp.us.share`, upload handoff design. |
| Quick Actions | `app-links.mjs` routes already map to the four primary pages. | `UIApplicationShortcutItems` + scene `performActionFor` forwarding to the same routes. |
| Universal Links | `SceneDelegateProxy` already forwards `continue userActivity`. | Associated Domains entitlement + `apple-app-site-association` on Cloudflare Pages. |

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
runs the native contract tests, the web build, `cap sync ios`, checks the sync left the committed
project unchanged, then unsigned Debug and Release simulator builds and inspects the built bundle.

## Apple setup still required (Francesco)

1. Apple Developer Program membership (paid) and the **Team ID**.
2. Register App ID **`com.usapp.us`** (explicit). No capabilities needed for the M15 build.
3. App Store Connect: create the app record (name "US", bundle `com.usapp.us`, SKU, primary language Italian), and add internal TestFlight testers.
4. Signing: in Xcode set the Team on target App (Automatic signing), or for CI create an Apple Distribution certificate (.p12 + password) and an App Store provisioning profile for `com.usapp.us`; for CI uploads an App Store Connect API key (Issuer ID, Key ID, .p8).
5. App Store Connect privacy questionnaire ("nutrition labels") and export compliance (the app declares `ITSAppUsesNonExemptEncryption = false`: HTTPS only).
6. Later milestones: App Group `group.com.usapp.us.shared`, Push Notifications + APNs key, Associated Domains — each must be enabled on the App ID and the profiles regenerated.

Until 1–4 exist there is no signed device build or TestFlight upload; the simulator build is the proof the target compiles.
