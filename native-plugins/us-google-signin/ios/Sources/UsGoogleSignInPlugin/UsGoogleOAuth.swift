import Foundation
import CryptoKit

/// Accesso con Google on the iPhone (iOS Store V1, 05/11/2026). The Android
/// plugin gets a Google ID token from Credential Manager; iOS has no such
/// system sheet, so this is the OAuth 2.0 flow of a native app (RFC 8252),
/// without Google's SDK: the system browser (ASWebAuthenticationSession),
/// PKCE S256, the iOS client's own redirect scheme, no client secret. The ID
/// token carries the nonce the web layer sends (sha256 of the raw nonce,
/// google-auth.js), and Supabase checks it with the raw one.
/// Pure Foundation + CryptoKit, so it is checked without a simulator.
enum UsGoogleOAuth {
    static let authorizationEndpoint = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    static let tokenEndpoint = URL(string: "https://oauth2.googleapis.com/token")!
    static let scope = "openid email profile"
    private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    private static let hex = Set("0123456789abcdef")

    /// The iOS OAuth client of the US Google Cloud project ("<number>-<id>.apps.googleusercontent.com").
    struct Client: Equatable {
        let clientID: String
        /// com.googleusercontent.apps.<number>-<id>: the scheme Google redirects an iOS client to.
        let redirectScheme: String
        var redirectURI: String { "\(redirectScheme):/oauthredirect" }

        init?(clientID raw: String?) {
            let value = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let suffix = ".apps.googleusercontent.com"
            guard value.hasSuffix(suffix) else { return nil }
            let id = String(value.dropLast(suffix.count))
            let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789-")
            guard (8...120).contains(id.count), id.contains("-"), id.allSatisfy({ allowed.contains($0) }) else { return nil }
            clientID = value
            redirectScheme = "com.googleusercontent.apps.\(id)"
        }
    }

    /// sha256(raw nonce) in lowercase hex, as google-auth.js sends it.
    static func validNonce(_ nonce: String?) -> Bool {
        guard let nonce = nonce, nonce.count == 64 else { return false }
        return nonce.allSatisfy { hex.contains($0) }
    }

    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// A random URL-safe value: the PKCE verifier (48 bytes → 64 characters) and the state.
    static func randomToken(bytes count: Int = 32) -> String {
        var generator = SystemRandomNumberGenerator()
        return base64URL(Data((0..<count).map { _ in UInt8.random(in: 0...255, using: &generator) }))
    }

    /// PKCE (RFC 7636): base64url(sha256(verifier)).
    static func codeChallenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    static func authorizationURL(client: Client, codeChallenge: String, state: String, nonce: String) -> URL {
        var components = URLComponents(url: authorizationEndpoint, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: client.clientID),
            URLQueryItem(name: "redirect_uri", value: client.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            // Like Android: the account is chosen in Google's own sheet every time.
            URLQueryItem(name: "prompt", value: "select_account")
        ]
        return components.url!
    }

    enum Callback: Equatable {
        case code(String)
        case cancelled
        case failed
    }

    /// Google's redirect back to US: the code, and only for the state this phone sent.
    static func callback(_ url: URL?, client: Client, expectedState: String) -> Callback {
        guard let url = url, url.scheme == client.redirectScheme,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return .failed }
        func value(_ name: String) -> String? { items.first(where: { $0.name == name })?.value }
        guard !expectedState.isEmpty, value("state") == expectedState else { return .failed }
        if let error = value("error") { return error == "access_denied" ? .cancelled : .failed }
        guard let code = value("code"), !code.isEmpty, code.count <= 2048 else { return .failed }
        return .code(code)
    }

    /// The form body of the code exchange (an iOS client has no secret).
    static func tokenRequestBody(client: Client, code: String, verifier: String) -> Data {
        let fields = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", client.clientID),
            ("redirect_uri", client.redirectURI),
            ("code_verifier", verifier)
        ]
        let body = fields.map { "\($0.0)=\($0.1.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "")" }
        return Data(body.joined(separator: "&").utf8)
    }

    /// The ID token of the token response, only if it looks like a JWT. Never the access or refresh token.
    static func idToken(fromTokenResponse data: Data?) -> String? {
        guard let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["id_token"] as? String, token.count <= 8192 else { return nil }
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 3 && parts.allSatisfy({ !$0.isEmpty }) ? token : nil
    }
}
