// Host-side checks for UsAppLockPolicy.swift (compiled with swiftc on the
// macOS CI runner together with the policy file; no simulator needed).
import Foundation
import LocalAuthentication

var failures = 0
func check(_ condition: Bool, _ label: String) {
    if condition { print("ok - \(label)") } else { failures += 1; print("not ok - \(label)") }
}

let grace = UsAppLockPolicy.graceNanos
check(!UsAppLockPolicy.shouldLockOnForeground(enabled: false, backgroundedAt: 0, now: grace * 10), "protection off never locks")
check(!UsAppLockPolicy.shouldLockOnForeground(enabled: true, backgroundedAt: nil, now: grace * 10), "never backgrounded")
check(!UsAppLockPolicy.shouldLockOnForeground(enabled: true, backgroundedAt: 1_000, now: 1_000 + grace - 1), "short interruption stays unlocked")
check(UsAppLockPolicy.shouldLockOnForeground(enabled: true, backgroundedAt: 1_000, now: 1_000 + grace), "grace elapsed locks")
check(UsAppLockPolicy.shouldLockOnForeground(enabled: true, backgroundedAt: 5_000, now: 1_000), "clock backwards fails closed")
check(UsAppLockPolicy.graceMilliseconds == 60_000, "grace is 60 s like Android")

check(UsAppLockPolicy.promptErrorCode(LAError.Code.userCancel.rawValue) == "cancelled", "user cancel")
check(UsAppLockPolicy.promptErrorCode(LAError.Code.systemCancel.rawValue) == "cancelled", "system cancel")
check(UsAppLockPolicy.promptErrorCode(LAError.Code.userFallback.rawValue) == "fallback", "fallback button")
check(UsAppLockPolicy.promptErrorCode(LAError.Code.authenticationFailed.rawValue) == "failed", "failed attempts")
check(UsAppLockPolicy.promptErrorCode(LAError.Code.biometryLockout.rawValue) == "lockout", "lockout")
check(UsAppLockPolicy.promptErrorCode(LAError.Code.biometryNotEnrolled.rawValue) == "not_enrolled", "not enrolled")
check(UsAppLockPolicy.promptErrorCode(LAError.Code.biometryNotAvailable.rawValue) == "unavailable", "unavailable")
check(UsAppLockPolicy.promptErrorCode(12345) == "error", "unknown error")

check(UsAppLockPolicy.capabilityReason(nil, hasBiometryHardware: true) == "ok", "capability ok")
check(UsAppLockPolicy.capabilityReason(LAError.Code.biometryNotEnrolled.rawValue, hasBiometryHardware: true) == "not_enrolled", "capability not enrolled")
check(UsAppLockPolicy.capabilityReason(LAError.Code.passcodeNotSet.rawValue, hasBiometryHardware: true) == "not_enrolled", "no passcode")
check(UsAppLockPolicy.capabilityReason(LAError.Code.biometryNotAvailable.rawValue, hasBiometryHardware: false) == "unsupported", "no hardware")
check(UsAppLockPolicy.capabilityReason(LAError.Code.biometryNotAvailable.rawValue, hasBiometryHardware: true) == "denied", "Face ID refused for US")
check(UsAppLockPolicy.capabilityReason(LAError.Code.biometryLockout.rawValue, hasBiometryHardware: true) == "locked_out", "capability lockout")

check(UsAppLockPolicy.checkDomain(storedSource: "a", storedHash: "x", currentSource: "a", currentHash: "x") == .match, "same enrollment")
check(UsAppLockPolicy.checkDomain(storedSource: "a", storedHash: "x", currentSource: "a", currentHash: "y") == .changed, "enrollment changed")
check(UsAppLockPolicy.checkDomain(storedSource: "a", storedHash: "x", currentSource: "b", currentHash: "y") == .rebaseline, "OS API change re-baselines")
check(UsAppLockPolicy.checkDomain(storedSource: nil, storedHash: nil, currentSource: "a", currentHash: "x") == .changed, "missing stored state fails closed")
check(UsAppLockPolicy.checkDomain(storedSource: "a", storedHash: "x", currentSource: "a", currentHash: nil) == .changed, "missing current state fails closed")

let owner = String(repeating: "b", count: 64)
let good = UsAppLockRecord(v: 1, ownerHash: owner, enabledAt: 1, state: "ok", domainSource: "a", domainHash: "x")
check(UsAppLockRecord.decode(try! JSONEncoder().encode(good)) == good, "record round trip")
check(UsAppLockRecord.decode(nil) == nil, "no record = off")
check(UsAppLockRecord.decode(Data())?.state == "corrupted", "present but empty record fails closed")
check(UsAppLockRecord.decode(Data("{oops".utf8))?.state == "corrupted", "garbage fails closed")
check(UsAppLockRecord.decode(Data("{\"v\":1,\"ownerHash\":\"xyz\",\"enabledAt\":0,\"state\":\"ok\"}".utf8))?.state == "corrupted", "bad owner fails closed")
check(UsAppLockRecord.decode(Data("{\"v\":1,\"ownerHash\":\"\(owner)\",\"enabledAt\":0,\"state\":\"open\"}".utf8))?.state == "corrupted", "unknown state fails closed")
check(!String(data: try! JSONEncoder().encode(good), encoding: .utf8)!.contains("token"), "record holds no token")

print(failures == 0 ? "PolicyCheck: all passed" : "PolicyCheck: \(failures) failed")
exit(failures == 0 ? 0 : 1)
