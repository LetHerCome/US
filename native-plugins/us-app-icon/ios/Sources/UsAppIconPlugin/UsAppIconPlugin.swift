import Foundation
import UIKit
import Capacitor

/// Premi Sintonia V2 (29/10/2026) on iOS: the couple picks the app icon.
/// The web layer sends an id from a closed list (us, night, gold, neon), never
/// a file or asset name; iOS swaps the icon with setAlternateIconName and
/// always shows its own alert ("You have changed the icon for US"). The web
/// layer asks `get` first and calls `set` only when the icon really changes
/// (progression.js syncAppIcon), so the alert appears only after a choice.
@objc(UsAppIconPlugin)
public class UsAppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UsAppIconPlugin"
    public let jsName = "UsAppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    @objc func get(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["icon": UsAppIconCatalog.icon(forAlternateName: UIApplication.shared.alternateIconName)])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let icon = call.getString("icon") ?? ""
        guard case .some(let name) = UsAppIconCatalog.alternateName(for: icon) else {
            call.resolve(["applied": false])
            return
        }
        DispatchQueue.main.async {
            let application = UIApplication.shared
            guard application.supportsAlternateIcons else {
                call.resolve(["applied": false])
                return
            }
            if application.alternateIconName == name {
                call.resolve(["applied": true, "icon": icon])
                return
            }
            application.setAlternateIconName(name) { error in
                DispatchQueue.main.async {
                    call.resolve(error == nil ? ["applied": true, "icon": icon] : ["applied": false])
                }
            }
        }
    }
}
