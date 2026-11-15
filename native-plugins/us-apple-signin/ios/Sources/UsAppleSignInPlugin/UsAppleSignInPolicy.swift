import Foundation

/// Accedi con Apple (iOS Store V1, 05/11/2026): what the plugin checks and
/// how it answers, in pure Foundation so it is checked without a simulator.
enum UsAppleSignInPolicy {
    private static let hex = Set("0123456789abcdef")

    /// sha256(raw nonce) in lowercase hex, as google-auth.js sends it (Apple puts it in the token).
    static func validNonce(_ nonce: String?) -> Bool {
        guard let nonce = nonce, nonce.count == 64 else { return false }
        return nonce.allSatisfy { hex.contains($0) }
    }

    /// ASAuthorizationError codes (AuthenticationServices): 1000 unknown (no Apple ID on
    /// the phone, or the capability missing), 1001 canceled, 1002 invalid response,
    /// 1003 not handled, 1004 failed, 1005 not interactive. One short code for the web layer.
    static func errorCode(_ code: Int?) -> String {
        switch code {
        case 1001: return "cancelled"
        case 1000: return "unavailable"
        default: return "failed"
        }
    }

    /// Apple's token and code arrive as UTF-8 Data.
    static func text(_ data: Data?, limit: Int = 8192) -> String? {
        guard let data = data, let value = String(data: data, encoding: .utf8), !value.isEmpty, value.count <= limit else { return nil }
        return value
    }

    /// The name Apple gives only at the first sign-in, for the onboarding name field: short, one line.
    static func displayName(given: String?, family: String?) -> String {
        let parts = [given, family].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        let joined = parts.joined(separator: " ").components(separatedBy: .newlines).joined(separator: " ")
        return String(joined.prefix(40))
    }
}
