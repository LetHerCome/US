import Foundation
import UIKit
import AuthenticationServices
import Capacitor

/// Accesso con Google on the iPhone (iOS Store V1, 05/11/2026): the same
/// JS contract as the Android plugin (google-auth.js). signIn({ serverClientId,
/// nonce }) resolves { idToken } or rejects with one short code: cancelled,
/// not_configured, unavailable, interrupted, invalid_request, failed.
/// The iOS client id comes from Info.plist (UsGoogleIOSClientID); the web
/// client id the web layer sends is the audience of Android tokens only.
/// Nothing is stored: no token, no email, no cookie of our own.
@objc(UsGoogleSignInPlugin)
public class UsGoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "UsGoogleSignInPlugin"
    public let jsName = "UsGoogleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    static let clientIDKey = "UsGoogleIOSClientID"
    // Touched only on the main queue.
    private var session: ASWebAuthenticationSession?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let client = UsGoogleOAuth.Client(clientID: Bundle.main.object(forInfoDictionaryKey: Self.clientIDKey) as? String) else {
            call.reject("not_configured", "not_configured")
            return
        }
        let nonce = call.getString("nonce") ?? ""
        guard UsGoogleOAuth.validNonce(nonce) else {
            call.reject("invalid_request", "invalid_request")
            return
        }
        let verifier = UsGoogleOAuth.randomToken(bytes: 48)
        let state = UsGoogleOAuth.randomToken()
        let url = UsGoogleOAuth.authorizationURL(client: client, codeChallenge: UsGoogleOAuth.codeChallenge(for: verifier), state: state, nonce: nonce)

        DispatchQueue.main.async {
            guard self.session == nil else {
                call.reject("interrupted", "interrupted")
                return
            }
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: client.redirectScheme) { callbackURL, error in
                DispatchQueue.main.async { self.session = nil }
                if let error = error {
                    let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                    call.reject(cancelled ? "cancelled" : "failed", cancelled ? "cancelled" : "failed")
                    return
                }
                switch UsGoogleOAuth.callback(callbackURL, client: client, expectedState: state) {
                case .cancelled:
                    call.reject("cancelled", "cancelled")
                case .failed:
                    call.reject("failed", "failed")
                case .code(let code):
                    self.exchange(code: code, verifier: verifier, client: client, call: call)
                }
            }
            session.presentationContextProvider = self
            // Google's session in Safari is reused: the account sheet, not a blank login.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("unavailable", "unavailable")
            }
        }
    }

    private func exchange(code: String, verifier: String, client: UsGoogleOAuth.Client, call: CAPPluginCall) {
        var request = URLRequest(url: UsGoogleOAuth.tokenEndpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = UsGoogleOAuth.tokenRequestBody(client: client, code: code, verifier: verifier)
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200, let token = UsGoogleOAuth.idToken(fromTokenResponse: data) else {
                call.reject("failed", "failed")
                return
            }
            call.resolve(["idToken": token])
        }.resume()
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
