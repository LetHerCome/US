import Foundation

/// Premi Sintonia V2 on iOS (iOS Store V1, 05/11/2026): the icon ids the web
/// layer sends (the same closed list as Android's UsAppIconPlugin.IDS) and the
/// alternate icon sets of the asset catalog (ios/App/App/Assets.xcassets,
/// ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES). Pure Foundation, so it is
/// checked without a simulator.
enum UsAppIconCatalog {
    static let defaultIcon = "us"
    /// nil = the primary icon (AppIcon).
    static let alternateNames: [String: String?] = [
        "us": nil,
        "night": "AppIcon-Night",
        "gold": "AppIcon-Gold",
        "neon": "AppIcon-Neon"
    ]

    /// The alternate icon name for an id; `.none` when the id is not ours.
    static func alternateName(for icon: String?) -> String?? {
        guard let icon = icon, let entry = alternateNames[icon] else { return .none }
        return .some(entry)
    }

    /// The id of what the phone shows now. An unknown name counts as the default.
    static func icon(forAlternateName name: String?) -> String {
        guard let name = name else { return defaultIcon }
        return alternateNames.first(where: { $0.value == name })?.key ?? defaultIcon
    }
}
