import Foundation
import UIKit
import LocalAuthentication
import Capacitor

/// US Native Security V1 — device-local biometric app lock (iOS).
///
/// The web app owns the lock screen; this plugin owns what must be native:
/// the Face ID / Touch ID prompt (LocalAuthentication), the protection record
/// (Keychain, this device only), the lifecycle lock policy and a privacy
/// cover for the app switcher. It never sees or stores Supabase credentials.
@objc(UsAppLockPlugin)
public class UsAppLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UsAppLockPlugin"
    public let jsName = "UsAppLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseCover", returnType: CAPPluginReturnPromise)
    ]

    private static let coverSafetySeconds = 1.5
    private static let coverColor = UIColor(red: 8.0 / 255.0, green: 4.0 / 255.0, blue: 14.0 / 255.0, alpha: 1.0)

    private let keychain = UsAppLockKeychain()
    // All mutable state below is only touched on the main queue.
    private var protectedOn = false
    private var locked = false
    private var backgroundedAt: UInt64?
    private var promptInFlight = false
    private var coverHeldForLock = false
    private var coverView: UIView?

    override public func load() {
        refreshProtection(coldStart: true)
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appWillResignActive), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(appWillEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
        center.addObserver(self, selector: #selector(appDidBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - JS API

    @objc func getStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.refreshProtection(coldStart: false)
            call.resolve(self.status())
        }
    }

    @objc func enable(_ call: CAPPluginCall) {
        let ownerHash = call.getString("ownerHash") ?? ""
        DispatchQueue.main.async {
            guard UsAppLockPolicy.isOwnerHash(ownerHash) else { return self.reject(call, "invalid_argument") }
            self.authenticate(call) { domain in
                let record = UsAppLockRecord(v: UsAppLockPolicy.recordVersion, ownerHash: ownerHash,
                                             enabledAt: Date().timeIntervalSince1970 * 1000,
                                             state: UsAppLockPolicy.stateOk,
                                             domainSource: domain.source, domainHash: domain.hash)
                do {
                    try self.keychain.write(record)
                } catch {
                    return self.reject(call, "error")
                }
                self.protectedOn = true
                self.locked = false
                call.resolve(self.status())
            }
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            switch self.keychain.read() {
            case .none:
                self.clearProtection()
                return call.resolve(self.status())
            case .unreadable:
                return self.reject(call, "unavailable")
            case .record(let record):
                guard record.state == UsAppLockPolicy.stateOk else { return self.reject(call, "invalidated") }
                if self.capability().reason != "ok" {
                    // Biometrics are gone: confirming is no longer feasible and
                    // the caller is already inside an unlocked session.
                    self.clearProtection()
                    return call.resolve(self.status())
                }
                self.authenticate(call, expecting: record) { _ in
                    self.clearProtection()
                    call.resolve(self.status())
                }
            }
        }
    }

    @objc func unlock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            switch self.keychain.read() {
            case .none:
                self.protectedOn = false
                self.locked = false
                return call.resolve(self.status())
            case .unreadable:
                return self.reject(call, "unavailable")
            case .record(let record):
                guard record.state == UsAppLockPolicy.stateOk else { return self.reject(call, "invalidated") }
                self.authenticate(call, expecting: record) { _ in
                    self.locked = false
                    call.resolve(self.status())
                }
            }
        }
    }

    /// Logout, account switch or recovery after the session was destroyed.
    @objc func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.clearProtection()
            call.resolve(self.status())
        }
    }

    /// The web lock screen is painted (or nothing needs hiding): drop the cover.
    @objc func releaseCover(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.coverHeldForLock = false
            self.hideCover()
            call.resolve()
        }
    }

    // MARK: - Lifecycle policy

    @objc private func appWillResignActive() {
        if protectedOn { showCover() }
    }

    @objc private func appDidEnterBackground() {
        guard protectedOn else { return }
        backgroundedAt = UsAppLockPlugin.monotonicNow()
        showCover()
    }

    @objc private func appWillEnterForeground() {
        let since = backgroundedAt
        backgroundedAt = nil
        guard UsAppLockPolicy.shouldLockOnForeground(enabled: protectedOn, backgroundedAt: since, now: UsAppLockPlugin.monotonicNow()) else { return }
        locked = true
        coverHeldForLock = true
        notifyListeners("lockRequired", data: ["reason": "background"], retainUntilConsumed: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + UsAppLockPlugin.coverSafetySeconds) { [weak self] in
            guard let self = self, self.coverHeldForLock else { return }
            self.coverHeldForLock = false
            self.hideCover()
        }
    }

    @objc private func appDidBecomeActive() {
        if !coverHeldForLock { hideCover() }
    }

    // MARK: - Biometrics

    private struct Domain { let source: String; let hash: String? }

    private func authenticate(_ call: CAPPluginCall, expecting record: UsAppLockRecord? = nil, onSuccess: @escaping (Domain) -> Void) {
        guard !promptInFlight else { return reject(call, "busy") }
        let context = LAContext()
        context.localizedCancelTitle = UsAppLockPlugin.text(call, "cancel", fallback: "Annulla", max: 30)
        context.localizedFallbackTitle = UsAppLockPlugin.text(call, "fallback", fallback: "Usa l’account", max: 30)
        var canError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &canError) else {
            let reason = UsAppLockPolicy.capabilityReason(canError?.code, hasBiometryHardware: context.biometryType != .none)
            return reject(call, UsAppLockPolicy.capabilityErrorCode(reason))
        }
        promptInFlight = true
        let reason = UsAppLockPlugin.text(call, "title", fallback: "Sblocca US", max: 80)
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            DispatchQueue.main.async {
                self.promptInFlight = false
                guard success else {
                    return self.reject(call, UsAppLockPolicy.promptErrorCode((error as NSError?)?.code ?? LAError.Code.authenticationFailed.rawValue))
                }
                let domain = UsAppLockPlugin.domain(of: context)
                if var stored = record {
                    switch UsAppLockPolicy.checkDomain(storedSource: stored.domainSource, storedHash: stored.domainHash,
                                                       currentSource: domain.source, currentHash: domain.hash) {
                    case .match:
                        break
                    case .rebaseline:
                        stored.domainSource = domain.source
                        stored.domainHash = domain.hash
                        try? self.keychain.write(stored)
                    case .changed:
                        // Face ID / Touch ID enrollment changed since protection was enabled.
                        stored.state = UsAppLockPolicy.stateInvalidated
                        try? self.keychain.write(stored)
                        return self.reject(call, "invalidated")
                    }
                }
                onSuccess(domain)
            }
        }
    }

    private static func domain(of context: LAContext) -> Domain {
        if #available(iOS 18.0, *) {
            return Domain(source: "domainState", hash: context.domainState.biometry.stateHash?.base64EncodedString())
        }
        return Domain(source: "evaluatedPolicy", hash: context.evaluatedPolicyDomainState?.base64EncodedString())
    }

    private func capability() -> (available: Bool, kind: String, reason: String) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        let kind: String
        switch context.biometryType {
        case .faceID: kind = "faceId"
        case .touchID: kind = "touchId"
        case .none: kind = "none"
        default: kind = "biometric"
        }
        let reason = available ? "ok" : UsAppLockPolicy.capabilityReason(error?.code, hasBiometryHardware: context.biometryType != .none)
        return (available, kind, reason)
    }

    // MARK: - State

    private func refreshProtection(coldStart: Bool) {
        switch keychain.read() {
        case .none:
            protectedOn = false
            locked = false
        case .unreadable:
            // Fail closed until the Keychain can be read.
            protectedOn = true
            locked = true
        case .record:
            if coldStart || !protectedOn { locked = true }
            protectedOn = true
        }
    }

    private func clearProtection() {
        keychain.clear()
        protectedOn = false
        locked = false
        backgroundedAt = nil
        coverHeldForLock = false
        hideCover()
    }

    private func status() -> [String: Any] {
        let cap = capability()
        let read = keychain.read()
        var protection: [String: Any] = ["enabled": false, "ownerHash": "", "state": "off"]
        switch read {
        case .none:
            break
        case .unreadable:
            protection = ["enabled": true, "ownerHash": "", "state": UsAppLockPolicy.stateCorrupted]
        case .record(let record):
            protection = ["enabled": true, "ownerHash": record.ownerHash, "state": record.state]
        }
        return [
            "platform": "ios",
            "biometry": ["available": cap.available, "kind": cap.kind, "reason": cap.reason],
            "protection": protection,
            "locked": protectedOn && locked,
            "graceMs": UsAppLockPolicy.graceMilliseconds
        ]
    }

    // MARK: - Privacy cover (app switcher snapshot, resume before the lock screen paints)

    private func showCover() {
        guard coverView == nil, let window = bridge?.viewController?.view.window else { return }
        let cover = UIView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = UsAppLockPlugin.coverColor
        cover.accessibilityElementsHidden = true
        if let mark = UIImage(named: "Splash") {
            let image = UIImageView(image: mark)
            image.contentMode = .scaleAspectFit
            image.frame = CGRect(x: 0, y: 0, width: 96, height: 96)
            image.center = CGPoint(x: cover.bounds.midX, y: cover.bounds.midY)
            image.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin, .flexibleTopMargin, .flexibleBottomMargin]
            cover.addSubview(image)
        }
        window.addSubview(cover)
        coverView = cover
    }

    private func hideCover() {
        coverView?.removeFromSuperview()
        coverView = nil
    }

    // MARK: - Helpers

    private static func monotonicNow() -> UInt64 {
        clock_gettime_nsec_np(CLOCK_MONOTONIC)
    }

    private static func text(_ call: CAPPluginCall, _ key: String, fallback: String, max: Int) -> String {
        let raw = (call.getString(key) ?? fallback)
            .components(separatedBy: .controlCharacters).joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let value = raw.isEmpty ? fallback : raw
        return String(value.prefix(max))
    }

    private func reject(_ call: CAPPluginCall, _ code: String) {
        call.reject(code, code)
    }
}
