import Foundation

// iOS Store V1: checks UsAppleSignInPolicy without a simulator
// (swiftc -o /tmp/apple-check UsAppleSignInPolicy.swift main.swift && /tmp/apple-check).
var failures = 0
func check(_ condition: Bool, _ label: String) {
    if !condition { failures += 1; print("FAIL \(label)") }
}

check(UsAppleSignInPolicy.validNonce(String(repeating: "0f", count: 32)), "hex nonce")
for bad in [nil, "", String(repeating: "0F", count: 32), String(repeating: "a", count: 65), "raw-nonce"] as [String?] {
    check(!UsAppleSignInPolicy.validNonce(bad), "rejected nonce \(String(describing: bad))")
}

check(UsAppleSignInPolicy.errorCode(1001) == "cancelled", "closing Apple's sheet is a choice")
check(UsAppleSignInPolicy.errorCode(1000) == "unavailable", "no Apple ID on this phone")
for code in [1002, 1003, 1004, 1005, 7, nil] as [Int?] {
    check(UsAppleSignInPolicy.errorCode(code) == "failed", "failed \(String(describing: code))")
}

check(UsAppleSignInPolicy.text(Data("eyJ.a.b".utf8)) == "eyJ.a.b", "token text")
check(UsAppleSignInPolicy.text(Data()) == nil, "empty")
check(UsAppleSignInPolicy.text(nil) == nil, "missing")
check(UsAppleSignInPolicy.text(Data(String(repeating: "x", count: 9000).utf8)) == nil, "too long")

check(UsAppleSignInPolicy.displayName(given: "Bea", family: "Rossi") == "Bea Rossi", "full name")
check(UsAppleSignInPolicy.displayName(given: " Bea ", family: nil) == "Bea", "given only")
check(UsAppleSignInPolicy.displayName(given: nil, family: nil) == "", "no name after the first time")
check(UsAppleSignInPolicy.displayName(given: "A\nB", family: "") == "A B", "one line")
check(UsAppleSignInPolicy.displayName(given: String(repeating: "x", count: 60), family: nil).count == 40, "short")

if failures > 0 { exit(1) }
print("UsAppleSignInPolicy: all checks passed")
