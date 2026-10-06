import Foundation

// Native Notifications V1: checks UsPushEnvironment without a simulator
// (swiftc -o /tmp/env-check UsPushEnvironment.swift main.swift && /tmp/env-check).
func profile(_ env: String?) -> Data {
    let entitlement = env.map { "<key>aps-environment</key><string>\($0)</string>" } ?? ""
    let text = "\u{30}\u{82}junk<?xml version=\"1.0\" encoding=\"UTF-8\"?><plist version=\"1.0\"><dict><key>Entitlements</key><dict>\(entitlement)</dict></dict></plist>junk"
    return text.data(using: .isoLatin1)!
}

var failures = 0
func expect(_ actual: String, _ expected: String, _ label: String) {
    if actual != expected { failures += 1; print("FAIL \(label): \(actual) != \(expected)") }
}
expect(UsPushEnvironment.fromProvisioningProfile(nil, isSimulator: true), "development", "simulator")
expect(UsPushEnvironment.fromProvisioningProfile(nil, isSimulator: false), "production", "App Store / TestFlight")
expect(UsPushEnvironment.fromProvisioningProfile(profile("development"), isSimulator: false), "development", "development profile")
expect(UsPushEnvironment.fromProvisioningProfile(profile("production"), isSimulator: false), "production", "ad hoc profile")
expect(UsPushEnvironment.fromProvisioningProfile(profile(nil), isSimulator: false), "production", "no push entitlement")
expect(UsPushEnvironment.fromProvisioningProfile(Data([0, 1, 2]), isSimulator: false), "production", "garbage")
if failures > 0 { exit(1) }
print("UsPushEnvironment: all checks passed")
