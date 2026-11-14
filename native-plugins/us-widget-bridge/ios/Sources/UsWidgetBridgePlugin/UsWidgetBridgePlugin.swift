import Foundation
import UIKit
import WidgetKit
import Capacitor

/// The only door between the US WebView and the iPhone widgets (iOS twin of
/// UsWidgetBridgePlugin.java, same methods and answers). It accepts semantic
/// state, a device-scoped send credential and downscaled private pictures.
/// It never accepts or returns a Supabase session, URL or raw account id.
@objc(UsWidgetBridgePlugin)
public class UsWidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UsWidgetBridgePlugin"
    public let jsName = "UsWidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "activateAccount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceIdentity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActionCredential", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearActionCredential", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeNoiPortrait", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getInstalledWidgets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBatteryStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openWidgetSettings", returnType: CAPPluginReturnPromise)
    ]

    private var store: UsWidgetStore?
    private let credentials = UsWidgetCredentials()

    override public func load() {
        store = UsWidgetStore.shared()
    }

    private func reloadWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func decode(_ base64: String) -> Data? {
        guard base64.count <= UsWidgetStore.maxPhotoBytes * 2 else { return nil }
        return Data(base64Encoded: base64, options: .ignoreUnknownCharacters)
    }

    // MARK: - Account and credential

    @objc func activateAccount(_ call: CAPPluginCall) {
        let ownerHash = call.getString("ownerHash") ?? ""
        credentials.clearForOwnerChange(ownerHash)
        guard let store = store, store.activateAccount(ownerHash) else {
            return call.reject("Invalid widget account")
        }
        reloadWidgets()
        call.resolve(["credential": credentials.status(ownerHash)])
    }

    @objc func getDeviceIdentity(_ call: CAPPluginCall) {
        let deviceId = store?.deviceId() ?? ""
        guard !deviceId.isEmpty else { return call.reject("Widget device identity unavailable") }
        call.resolve(["deviceId": deviceId])
    }

    @objc func setActionCredential(_ call: CAPPluginCall) {
        let ownerHash = call.getString("ownerHash") ?? ""
        guard let store = store, ownerHash == store.owner(),
              credentials.write(ownerHash: ownerHash, token: call.getString("token") ?? "",
                                expiresAt: call.getString("expiresAt") ?? "",
                                functionsUrl: call.getString("functionsUrl") ?? "") else {
            return call.reject("Invalid widget action credential")
        }
        reloadWidgets()
        call.resolve()
    }

    @objc func clearActionCredential(_ call: CAPPluginCall) {
        credentials.clear()
        reloadWidgets()
        call.resolve()
    }

    // MARK: - Snapshot and pictures

    @objc func writeSnapshot(_ call: CAPPluginCall) {
        guard let store = store, let snapshot = call.getObject("snapshot"),
              store.write(snapshot: snapshot as [String: Any]) else {
            return call.reject("Invalid widget snapshot")
        }
        reloadWidgets()
        call.resolve(["photoKey": store.photoKey()])
    }

    /// The last semantic state of the active account, so a fresh WebView starts
    /// from what the widgets show instead of overwriting them with blanks.
    @objc func readSnapshot(_ call: CAPPluginCall) {
        var result: [String: Any] = ["photoKey": store?.photoKey() ?? ""]
        if let snapshot = store?.readSnapshot() { result["snapshot"] = snapshot }
        call.resolve(result)
    }

    @objc func writePhoto(_ call: CAPPluginCall) {
        guard let store = store,
              store.writePhoto(ownerHash: call.getString("ownerHash") ?? "", key: call.getString("key") ?? "",
                               bytes: decode(call.getString("data") ?? "")) else {
            return call.reject("Invalid widget photo")
        }
        reloadWidgets()
        call.resolve()
    }

    @objc func writeNoiPortrait(_ call: CAPPluginCall) {
        guard let store = store,
              store.writePortrait(ownerHash: call.getString("ownerHash") ?? "", slot: call.getString("slot") ?? "pair",
                                  bytes: decode(call.getString("data") ?? "")) else {
            return call.reject("Invalid Noi portrait")
        }
        reloadWidgets()
        call.resolve()
    }

    /// Logout: semantic state, action state, cached pictures and credential all go.
    @objc func clearAll(_ call: CAPPluginCall) {
        credentials.clear()
        store?.clearAll()
        reloadWidgets()
        call.resolve()
    }

    @objc func clearSnapshot(_ call: CAPPluginCall) {
        clearAll(call)
    }

    // MARK: - Home screen

    /// How many US widgets of each kind are placed (Home and Lock Screen).
    @objc func getInstalledWidgets(_ call: CAPPluginCall) {
        WidgetCenter.shared.getCurrentConfigurations { result in
            var counts: [String: Int] = [:]
            for kind in UsWidgetShared.kinds { counts[kind] = 0 }
            if case .success(let widgets) = result {
                for widget in widgets {
                    if let kind = UsWidgetShared.kind(fromWidgetKind: widget.kind) { counts[kind, default: 0] += 1 }
                }
            }
            call.resolve(["installed": counts, "pinSupported": false, "vendor": "ios"])
        }
    }

    /// iOS lets no app place a widget: the steps instead (founder, 14/11/2026).
    @objc func requestPin(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        guard UsWidgetShared.kinds.contains(kind) else { return call.reject("Unknown widget") }
        call.resolve(["kind": kind, "supported": false, "requested": false, "steps": UsWidgetShared.addSteps])
    }

    /// Batteria del partner: this phone's own level, read only when the open app asks.
    /// iOS reports it in 5% steps.
    @objc func getBatteryStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let device = UIDevice.current
            let wasMonitoring = device.isBatteryMonitoringEnabled
            device.isBatteryMonitoringEnabled = true
            let level = device.batteryLevel
            let state = device.batteryState
            device.isBatteryMonitoringEnabled = wasMonitoring
            guard level >= 0, state != .unknown else { return call.resolve(["supported": false]) }
            call.resolve([
                "supported": true,
                "level": Int((level * 100).rounded()),
                "charging": state == .charging || state == .full
            ])
        }
    }

    /// No widget permission screen exists on iOS: US's page in Settings.
    @objc func openWidgetSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return call.resolve(["opened": "none"]) }
            UIApplication.shared.open(url) { opened in call.resolve(["opened": opened ? "app" : "none"]) }
        }
    }
}
