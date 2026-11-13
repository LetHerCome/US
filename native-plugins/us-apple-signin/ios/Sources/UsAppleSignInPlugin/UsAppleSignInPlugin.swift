import Foundation
import UIKit
import AuthenticationServices
import Capacitor

/// Accedi con Apple (iOS Store V1, 05/11/2026). App Store rule 4.8: an app
/// that offers Google sign-in also offers Sign in with Apple. Apple's own
/// sheet (AuthenticationServices) returns an identity token bound to the
/// nonce the web layer sends; Supabase checks it with the raw nonce
/// (google-auth.js, Apple part). signIn({ nonce }) resolves
/// { idToken, authorizationCode, name } or rejects with one short code:
/// cancelled, unavailable, interrupted, invalid_request, failed.
/// The authorization code is for the server, which keeps Apple's refresh
/// token to revoke it when the account is deleted (TN3194). Nothing is stored here.
@objc(UsAppleSignInPlugin)
public class UsAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "UsAppleSignInPlugin"
    public let jsName = "UsAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    // Touched only on the main queue.
    private var pendingCall: CAPPluginCall?
    private var controller: ASAuthorizationController?

    @objc func signIn(_ call: CAPPluginCall) {
        let nonce = call.getString("nonce") ?? ""
        guard UsAppleSignInPolicy.validNonce(nonce) else {
            call.reject("invalid_request", "invalid_request")
            return
        }
        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("interrupted", "interrupted")
                return
            }
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.pendingCall = call
            self.controller = controller
            controller.performRequests()
        }
    }

    private func finish(_ answer: @escaping (CAPPluginCall) -> Void) {
        DispatchQueue.main.async {
            guard let call = self.pendingCall else { return }
            self.pendingCall = nil
            self.controller = nil
            answer(call)
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let token = UsAppleSignInPolicy.text(credential.identityToken) else {
            finish { $0.reject("failed", "failed") }
            return
        }
        let result: [String: Any] = [
            "idToken": token,
            "authorizationCode": UsAppleSignInPolicy.text(credential.authorizationCode, limit: 2048) ?? "",
            // Apple gives the name only the first time: the onboarding can start from it.
            "name": UsAppleSignInPolicy.displayName(given: credential.fullName?.givenName, family: credential.fullName?.familyName)
        ]
        finish { $0.resolve(result) }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let nsError = error as NSError
        let code = UsAppleSignInPolicy.errorCode(nsError.domain == ASAuthorizationError.errorDomain ? nsError.code : nil)
        finish { $0.reject(code, code) }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
