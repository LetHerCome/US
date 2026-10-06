import Foundation

/// US Native Notifications V1 — which APNs environment this build's device
/// token belongs to. Pure Foundation, so it is checked without a simulator.
///
///  - a provisioning profile embedded in the app (development / ad hoc builds)
///    states it in Entitlements["aps-environment"];
///  - no embedded profile = App Store / TestFlight = production;
///  - the simulator registers against the sandbox = development.
enum UsPushEnvironment {
    static func fromProvisioningProfile(_ data: Data?, isSimulator: Bool) -> String {
        if isSimulator { return "development" }
        guard let data = data else { return "production" }
        guard let text = String(data: data, encoding: .isoLatin1),
              let start = text.range(of: "<?xml"),
              let end = text.range(of: "</plist>", range: start.lowerBound..<text.endIndex) else {
            return "production"
        }
        let plistText = String(text[start.lowerBound..<end.upperBound])
        guard let plistData = plistText.data(using: .isoLatin1),
              let plist = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any],
              let entitlements = plist["Entitlements"] as? [String: Any],
              let value = entitlements["aps-environment"] as? String else {
            return "production"
        }
        return value == "development" ? "development" : "production"
    }
}
