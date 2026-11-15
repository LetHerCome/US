import Foundation

// iOS Store V1: checks UsAppIconCatalog without a simulator
// (swiftc -o /tmp/icon-check UsAppIconCatalog.swift main.swift && /tmp/icon-check).
var failures = 0
func expect(_ actual: String?, _ expected: String?, _ label: String) {
    if actual != expected { failures += 1; print("FAIL \(label): \(String(describing: actual)) != \(String(describing: expected))") }
}

// Same closed list as Android (UsAppIconPlugin.IDS = us, night, gold, neon).
expect(UsAppIconCatalog.alternateNames.keys.sorted().joined(separator: ","), "gold,neon,night,us", "ids")

if case .some(let name) = UsAppIconCatalog.alternateName(for: "us") { expect(name, nil, "us = primary icon") } else { failures += 1; print("FAIL us unknown") }
if case .some(let name) = UsAppIconCatalog.alternateName(for: "night") { expect(name, "AppIcon-Night", "night") } else { failures += 1; print("FAIL night unknown") }
if case .some(let name) = UsAppIconCatalog.alternateName(for: "gold") { expect(name, "AppIcon-Gold", "gold") } else { failures += 1; print("FAIL gold unknown") }
if case .some(let name) = UsAppIconCatalog.alternateName(for: "neon") { expect(name, "AppIcon-Neon", "neon") } else { failures += 1; print("FAIL neon unknown") }
for rejected in [nil, "", "AppIcon-Neon", "Neon", "../AppIcon", "rainbow"] as [String?] {
    if case .some(_) = UsAppIconCatalog.alternateName(for: rejected) { failures += 1; print("FAIL accepted \(String(describing: rejected))") }
}

expect(UsAppIconCatalog.icon(forAlternateName: nil), "us", "primary")
expect(UsAppIconCatalog.icon(forAlternateName: "AppIcon-Night"), "night", "night back")
expect(UsAppIconCatalog.icon(forAlternateName: "AppIcon-Gold"), "gold", "gold back")
expect(UsAppIconCatalog.icon(forAlternateName: "AppIcon-Neon"), "neon", "neon back")
expect(UsAppIconCatalog.icon(forAlternateName: "Something-Else"), "us", "unknown = default")

if failures > 0 { exit(1) }
print("UsAppIconCatalog: all checks passed")
