import Foundation

/// Names shared by the US app and its widget extension (app.uscouple.widgets).
/// DECISIONS.md, Native iOS: one App Group for every extension; the send
/// credential lives in the shared Keychain, never in the App Group, and no
/// Supabase session ever leaves the WebView.
enum UsWidgetShared {
    static let appGroup = "group.app.uscouple.shared"
    /// Info.plist key holding "$(AppIdentifierPrefix)app.uscouple.shared" (app and extension).
    static let keychainGroupInfoKey = "UsWidgetKeychainGroup"
    static let keychainService = "app.uscouple.widget"

    /// The widget kinds, the same names as Android (UsWidgets.KINDS) and widgets.js.
    /// WidgetKit kinds are "us.widget.<kind>".
    static let kinds = ["think", "postit", "noi", "photo", "daily", "message", "memories", "status", "lavagna"]
    static func widgetKind(_ kind: String) -> String { "us.widget." + kind }
    static func kind(fromWidgetKind widgetKind: String) -> String? {
        guard widgetKind.hasPrefix("us.widget.") else { return nil }
        let kind = String(widgetKind.dropFirst("us.widget.".count))
        return kinds.contains(kind) ? kind : nil
    }

    /// Opens US on a destination: the same us://widget/<path> links widgets.js reads on Android.
    static func openURL(_ path: String) -> URL {
        URL(string: "us://widget/" + path)!
    }

    /// Settings › Widget on iPhone: iOS has no "add to Home" request, so the
    /// hub shows these steps (founder, 14/11/2026).
    static let addSteps = "Su iPhone: tieni premuto su uno spazio vuoto della Home, tocca Modifica › Aggiungi widget e cerca US."
}

/// Where a widget may send its device token: the Edge functions of the US
/// project of this build, over https only (iOS twin of UsWidgetEndpoints.java).
/// The source names production only, like Android's Play bundle.
enum UsWidgetEndpoints {
    static let production = "https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1"
    static let projects = ["iiakdfsxpywdkxravqjh"]

    /// The normalised Edge address, or "" when it is not the US project of this build.
    static func functionsBase(_ url: String?) -> String {
        guard let raw = url?.trimmingCharacters(in: .whitespaces), !raw.isEmpty,
              let components = URLComponents(string: raw) else { return "" }
        let path = components.percentEncodedPath.replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        guard components.scheme == "https", components.user == nil, components.password == nil,
              components.port == nil, components.percentEncodedQuery == nil, components.fragment == nil,
              path == "/functions/v1", let host = components.host else { return "" }
        for project in projects where host == project + ".supabase.co" {
            return "https://" + host + "/functions/v1"
        }
        return ""
    }

    /// Ti penso: a credential stored without an address came from production.
    static func thinkSend(_ functionsBase: String) -> String {
        let base = self.functionsBase(functionsBase)
        return (base.isEmpty ? production : base) + "/widget-think-send"
    }
}
