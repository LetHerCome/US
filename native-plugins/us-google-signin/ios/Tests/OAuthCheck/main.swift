import Foundation

// iOS Store V1: checks UsGoogleOAuth without a simulator
// (swiftc -o /tmp/oauth-check UsGoogleOAuth.swift main.swift && /tmp/oauth-check).
var failures = 0
func check(_ condition: Bool, _ label: String) {
    if !condition { failures += 1; print("FAIL \(label)") }
}

let clientID = "792714579837-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com"
guard let client = UsGoogleOAuth.Client(clientID: clientID) else { print("FAIL client"); exit(1) }
check(client.redirectScheme == "com.googleusercontent.apps.792714579837-abcdefghijklmnopqrstuvwxyz012345", "reversed client id")
check(client.redirectURI == "com.googleusercontent.apps.792714579837-abcdefghijklmnopqrstuvwxyz012345:/oauthredirect", "redirect uri")
for bad in [nil, "", "792714579837.apps.googleusercontent.com", "x.apps.googleusercontent.com", "792714579837-ABC.apps.googleusercontent.com",
            "792714579837-abc.apps.example.com", "792714579837-a/b.apps.googleusercontent.com"] as [String?] {
    check(UsGoogleOAuth.Client(clientID: bad) == nil, "rejected client \(String(describing: bad))")
}

let nonce = String(repeating: "a1", count: 32)
check(UsGoogleOAuth.validNonce(nonce), "hex nonce")
for bad in [nil, "", String(repeating: "A1", count: 32), String(repeating: "a", count: 63), String(repeating: "g", count: 64)] as [String?] {
    check(!UsGoogleOAuth.validNonce(bad), "rejected nonce \(String(describing: bad))")
}

// RFC 7636, appendix B.
check(UsGoogleOAuth.codeChallenge(for: "dBjftJeZ4CVP-mJ92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "PKCE S256")
let verifier = UsGoogleOAuth.randomToken(bytes: 48)
check(verifier.count == 64 && !verifier.contains("=") && !verifier.contains("+") && !verifier.contains("/"), "verifier 43-128 url-safe")
check(UsGoogleOAuth.randomToken() != UsGoogleOAuth.randomToken(), "random state")

let url = UsGoogleOAuth.authorizationURL(client: client, codeChallenge: "challenge", state: "state-1", nonce: nonce)
let items = Dictionary(uniqueKeysWithValues: (URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
check(url.host == "accounts.google.com" && url.path == "/o/oauth2/v2/auth", "authorization endpoint")
check(items["client_id"] == clientID, "client_id")
check(items["redirect_uri"] == client.redirectURI, "redirect_uri")
check(items["response_type"] == "code", "code flow")
check(items["scope"] == "openid email profile", "scope")
check(items["code_challenge"] == "challenge" && items["code_challenge_method"] == "S256", "PKCE in the request")
check(items["state"] == "state-1" && items["nonce"] == nonce, "state and nonce")
check(items["client_secret"] == nil, "no secret")

let ownScheme = client.redirectScheme
func callbackURL(_ query: String, scheme: String? = nil) -> URL? { URL(string: "\(scheme ?? ownScheme):/oauthredirect?\(query)") }
check(UsGoogleOAuth.callback(callbackURL("state=state-1&code=4/abc"), client: client, expectedState: "state-1") == .code("4/abc"), "code")
check(UsGoogleOAuth.callback(callbackURL("state=other&code=4/abc"), client: client, expectedState: "state-1") == .failed, "other state")
check(UsGoogleOAuth.callback(callbackURL("code=4/abc"), client: client, expectedState: "state-1") == .failed, "no state")
check(UsGoogleOAuth.callback(callbackURL("state=state-1&error=access_denied"), client: client, expectedState: "state-1") == .cancelled, "denied = cancelled")
check(UsGoogleOAuth.callback(callbackURL("state=state-1&error=server_error"), client: client, expectedState: "state-1") == .failed, "error")
check(UsGoogleOAuth.callback(callbackURL("state=state-1&code=4/abc", scheme: "com.evil.app"), client: client, expectedState: "state-1") == .failed, "other scheme")
check(UsGoogleOAuth.callback(nil, client: client, expectedState: "state-1") == .failed, "no url")
check(UsGoogleOAuth.callback(callbackURL("state=&code=x"), client: client, expectedState: "") == .failed, "empty state")

let body = String(data: UsGoogleOAuth.tokenRequestBody(client: client, code: "4/a b+c", verifier: "v-1"), encoding: .utf8) ?? ""
check(body.contains("grant_type=authorization_code"), "grant type")
check(body.contains("code=4%2Fa%20b%2Bc"), "code encoded")
check(body.contains("code_verifier=v-1"), "verifier")
check(body.contains("redirect_uri=com.googleusercontent.apps.792714579837-abcdefghijklmnopqrstuvwxyz012345%3A%2Foauthredirect"), "redirect encoded")
check(!body.contains("client_secret"), "no secret in the exchange")

let jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln"
check(UsGoogleOAuth.idToken(fromTokenResponse: Data("{\"id_token\":\"\(jwt)\",\"access_token\":\"ya29\"}".utf8)) == jwt, "id token")
check(UsGoogleOAuth.idToken(fromTokenResponse: Data("{\"access_token\":\"ya29\"}".utf8)) == nil, "no id token")
check(UsGoogleOAuth.idToken(fromTokenResponse: Data("{\"id_token\":\"not-a-jwt\"}".utf8)) == nil, "not a jwt")
check(UsGoogleOAuth.idToken(fromTokenResponse: Data("garbage".utf8)) == nil, "garbage")
check(UsGoogleOAuth.idToken(fromTokenResponse: nil) == nil, "no data")

if failures > 0 { exit(1) }
print("UsGoogleOAuth: all checks passed")
