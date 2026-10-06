import Foundation
import UIKit
import UserNotifications
import Capacitor

/// US Native Notifications V1 — the native pieces the official
/// @capacitor/push-notifications plugin does not provide (iOS):
///
///  - getStatus: the APNs environment of this build's token;
///  - the US_THINK category with the foreground action "Ricambia" (it only
///    opens US: no mutation happens from the notification);
///  - openSettings: the notification settings of US;
///  - setBadge: the app badge (V1 only clears it).
///
/// It never sees a push token, a payload or a Supabase credential.
@objc(UsPushSupportPlugin)
public class UsPushSupportPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UsPushSupportPlugin"
    public let jsName = "UsPushSupport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBadge", returnType: CAPPluginReturnPromise)
    ]

    static let thinkCategory = "US_THINK"
    static let ricambiaAction = "ricambia"

    override public func load() {
        let ricambia = UNNotificationAction(identifier: UsPushSupportPlugin.ricambiaAction,
                                            title: "Ricambia",
                                            options: [.foreground])
        let think = UNNotificationCategory(identifier: UsPushSupportPlugin.thinkCategory,
                                           actions: [ricambia],
                                           intentIdentifiers: [],
                                           options: [])
        UNUserNotificationCenter.current().setNotificationCategories([think])
    }

    private func environment() -> String {
        #if targetEnvironment(simulator)
        let simulator = true
        #else
        let simulator = false
        #endif
        let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision")
        let data = url.flatMap { try? Data(contentsOf: $0) }
        return UsPushEnvironment.fromProvisioningProfile(data, isSimulator: simulator)
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        let env = environment()
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve([
                "platform": "ios",
                "provider": "apns",
                // Remote-notification registration itself reports a missing
                // Push capability (registrationError); nothing to read here.
                "configured": true,
                "environment": env,
                "notificationsEnabled": settings.authorizationStatus == .authorized
                    || settings.authorizationStatus == .provisional
                    || settings.authorizationStatus == .ephemeral,
                "partnerBlocked": false,
                "remindersBlocked": false
            ])
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else {
                call.resolve(["opened": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    @objc func setBadge(_ call: CAPPluginCall) {
        let count = max(0, call.getInt("count") ?? 0)
        UNUserNotificationCenter.current().setBadgeCount(count) { error in
            call.resolve(["supported": true, "ok": error == nil])
        }
    }
}
