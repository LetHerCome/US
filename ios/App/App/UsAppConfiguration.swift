import UIKit

/// Single source of truth for native identifiers that later iOS targets
/// (WidgetKit, Share Extension, Notification Service Extension) must share.
/// Nothing here enables a capability: App Groups, Push and Keychain sharing
/// need entitlements + provisioning that are added with their milestones.
enum UsAppConfiguration {
    static let bundleIdentifier = "com.usapp.us"
    /// Reserved App Group for app <-> extension data (widget snapshots,
    /// shared media cache). Not in the entitlements yet; see docs/native/IOS_BASELINE.md.
    static let appGroupIdentifier = "group.com.usapp.us.shared"
    /// Public URL scheme registered in Info.plist (CFBundleURLTypes).
    static let urlScheme = "com.usapp.us"

    /// #26142E — the default Android splash colour (iOS Store V1, 05/11/2026):
    /// the launch screen, then the WebView until its first paint, which is the
    /// opening animation starting from the same colour (index.html).
    static let launchBackground = UIColor(red: 38.0 / 255.0, green: 20.0 / 255.0, blue: 46.0 / 255.0, alpha: 1.0)

    static let backGestureMinimumTranslation: CGFloat = 64
    static let backGestureMinimumVelocity: CGFloat = 600
    static let nativeBackScript = "(function(){try{var n=window.UsNavigation;return Boolean(n&&typeof n.handleNativeBack==='function'&&n.handleNativeBack());}catch(_){return false;}})()"
}
