import Foundation
import LocalAuthentication

/// Pure rules of the US app lock (Native Security V1), mirrored by
/// UsAppLockPolicy.java and app-lock.js.
///
/// Locking policy:
///  - protection OFF: never locks;
///  - cold start / process recreation with protection ON: locked;
///  - back to the foreground after at least `graceNanos` in the background: locked;
///  - shorter interruptions (Control Centre, a call, the Face ID sheet itself) never re-prompt.
/// Time is CLOCK_MONOTONIC (includes sleep, ignores wall-clock changes).
enum UsAppLockPolicy {
    static let graceMilliseconds: UInt64 = 60_000
    static let graceNanos: UInt64 = graceMilliseconds * 1_000_000
    static let recordVersion = 1

    static let stateOk = "ok"
    static let stateInvalidated = "invalidated"
    static let stateCorrupted = "corrupted"

    static func shouldLockOnForeground(enabled: Bool, backgroundedAt: UInt64?, now: UInt64, grace: UInt64 = graceNanos) -> Bool {
        guard enabled, let since = backgroundedAt else { return false }
        if now < since { return true } // never trust a clock that went backwards
        return now - since >= grace
    }

    static func isOwnerHash(_ value: String) -> Bool {
        value.count == 64 && value.allSatisfy { ("0"..."9").contains($0) || ("a"..."f").contains($0) }
    }

    /// LAError from evaluatePolicy → the error codes shared with Android.
    static func promptErrorCode(_ code: Int) -> String {
        switch LAError.Code(rawValue: code) {
        case .userCancel?, .appCancel?, .systemCancel?, .notInteractive?:
            return "cancelled"
        case .userFallback?:
            return "fallback"
        case .authenticationFailed?:
            return "failed"
        case .biometryLockout?:
            return "lockout"
        case .biometryNotEnrolled?, .passcodeNotSet?:
            return "not_enrolled"
        case .biometryNotAvailable?:
            return "unavailable"
        default:
            return "error"
        }
    }

    /// canEvaluatePolicy failure → capability reason (same vocabulary as Android).
    static func capabilityReason(_ code: Int?, hasBiometryHardware: Bool) -> String {
        guard let code = code else { return "ok" }
        switch LAError.Code(rawValue: code) {
        case .biometryNotEnrolled?, .passcodeNotSet?:
            return "not_enrolled"
        case .biometryLockout?:
            return "locked_out"
        case .biometryNotAvailable?:
            // Hardware present but refused (e.g. Face ID turned off for US).
            return hasBiometryHardware ? "denied" : "unsupported"
        default:
            return "unavailable"
        }
    }

    /// Capability reason → the error code a refused prompt returns.
    static func capabilityErrorCode(_ reason: String) -> String {
        switch reason {
        case "locked_out": return "lockout"
        case "not_enrolled": return "not_enrolled"
        case "unsupported": return "unsupported"
        default: return "unavailable"
        }
    }

    /// Enrollment check after a successful prompt. Same source → must match.
    /// A different source only happens once, when iOS 18 replaces the legacy
    /// API: the caller re-baselines instead of locking the user out.
    enum DomainCheck: Equatable { case match, changed, rebaseline }

    static func checkDomain(storedSource: String?, storedHash: String?, currentSource: String, currentHash: String?) -> DomainCheck {
        guard let currentHash = currentHash, !currentHash.isEmpty else { return .changed }
        guard let storedSource = storedSource, let storedHash = storedHash, !storedHash.isEmpty else { return .changed }
        if storedSource != currentSource { return .rebaseline }
        return storedHash == currentHash ? .match : .changed
    }
}

/// The protection record kept in the Keychain. Never a credential or token.
struct UsAppLockRecord: Codable, Equatable {
    var v: Int
    var ownerHash: String
    var enabledAt: Double
    var state: String
    var domainSource: String?
    var domainHash: String?

    var isValid: Bool {
        v == UsAppLockPolicy.recordVersion
            && UsAppLockPolicy.isOwnerHash(ownerHash)
            && (state == UsAppLockPolicy.stateOk || state == UsAppLockPolicy.stateInvalidated)
    }

    static let corrupted = UsAppLockRecord(v: UsAppLockPolicy.recordVersion, ownerHash: "", enabledAt: 0,
                                           state: UsAppLockPolicy.stateCorrupted, domainSource: nil, domainHash: nil)

    static func decode(_ data: Data?) -> UsAppLockRecord? {
        guard let data = data else { return nil }
        guard !data.isEmpty else { return .corrupted }
        guard let record = try? JSONDecoder().decode(UsAppLockRecord.self, from: data), record.isValid else {
            return .corrupted
        }
        return record
    }
}
