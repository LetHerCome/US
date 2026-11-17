import Foundation
import Security

/// The device-scoped "Ti penso" token (never a Supabase session), in the
/// Keychain group shared by the app and the widget extension (iOS twin of
/// UsWidgetCredentialStore.java). Readable after the first unlock so the
/// widget can send from the Lock Screen; this device only, never in backups
/// restored elsewhere, never in the App Group.
final class UsWidgetCredentials {
    private static let account = "think-credential-v1"
    private let accessGroup: String?
    private let lock = NSLock()

    /// accessGroup: "$(AppIdentifierPrefix)app.uscouple.shared" from Info.plist; nil in unsigned builds.
    init(accessGroup: String? = UsWidgetCredentials.configuredGroup()) {
        self.accessGroup = accessGroup
    }

    static func configuredGroup(_ bundle: Bundle = .main) -> String? {
        let value = (bundle.object(forInfoDictionaryKey: UsWidgetShared.keychainGroupInfoKey) as? String) ?? ""
        // Unsigned builds leave the prefix empty: no shared group, the app's own Keychain.
        return UsWidgetCredentialPolicy.validGroup(value) ? value : nil
    }

    @discardableResult
    func write(ownerHash: String, token: String, expiresAt: String, functionsUrl: String) -> Bool {
        guard let payload = UsWidgetCredentialPolicy.payload(ownerHash: ownerHash, token: token,
                                                             expiresAt: expiresAt, functionsUrl: functionsUrl),
              let data = try? JSONSerialization.data(withJSONObject: payload) else { return false }
        lock.lock(); defer { lock.unlock() }
        SecItemDelete(baseQuery() as CFDictionary)
        var item = baseQuery()
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    /// The token, only when it was issued for ownerHash (the active account).
    func readToken(_ ownerHash: String) -> String {
        guard let payload = read(), UsWidgetContract.string(payload["ownerHash"]) == ownerHash else { return "" }
        let token = UsWidgetContract.string(payload["token"])
        return UsWidgetCredentialPolicy.validToken(token) ? token : ""
    }

    /// The Edge address stored with the credential, re-checked on every read.
    func functionsBase(_ ownerHash: String) -> String {
        guard let payload = read(), UsWidgetContract.string(payload["ownerHash"]) == ownerHash else { return "" }
        return UsWidgetEndpoints.functionsBase(UsWidgetContract.string(payload["functionsUrl"]))
    }

    /// missing | ready | renew, like Android.
    func status(_ ownerHash: String, now: Date = Date()) -> String {
        UsWidgetCredentialPolicy.status(read(), ownerHash: ownerHash, now: now)
    }

    func clearForOwnerChange(_ ownerHash: String) {
        guard UsWidgetContract.validOwner(ownerHash), let payload = read() else { return }
        let current = UsWidgetContract.string(payload["ownerHash"])
        if !current.isEmpty && current != ownerHash { clear() }
    }

    func clear() {
        lock.lock(); defer { lock.unlock() }
        SecItemDelete(baseQuery() as CFDictionary)
    }

    private func read() -> [String: Any]? {
        lock.lock(); defer { lock.unlock() }
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func baseQuery() -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: UsWidgetShared.keychainService,
            kSecAttrAccount as String: Self.account
        ]
        if let group = accessGroup { query[kSecAttrAccessGroup as String] = group }
        return query
    }
}

/// The pure rules of the credential, checked on the CI host.
enum UsWidgetCredentialPolicy {
    static func validToken(_ token: String) -> Bool { UsWidgetContract.matches(token, "^[A-Za-z0-9_-]{43}$") }

    /// "ABCDE12345.app.uscouple.shared": a Team ID prefix in front of the shared name.
    static func validGroup(_ value: String) -> Bool {
        UsWidgetContract.matches(value, "^[A-Z0-9]{10}\\.app\\.uscouple\\.shared$")
    }

    static func payload(ownerHash: String, token: String, expiresAt: String, functionsUrl: String) -> [String: Any]? {
        guard UsWidgetContract.validOwner(ownerHash), validToken(token) else { return nil }
        // A wrong address is refused, never stored: a token can only go to the US project.
        let base = UsWidgetEndpoints.functionsBase(functionsUrl)
        if !functionsUrl.isEmpty && base.isEmpty { return nil }
        var payload: [String: Any] = [
            "ownerHash": ownerHash,
            "token": token,
            "expiresAt": UsWidgetContract.instantText(expiresAt)
        ]
        if !base.isEmpty { payload["functionsUrl"] = base }
        return payload
    }

    /// "renew" asks the app to provision a fresh credential (expiring within 30 days or unreadable).
    static func status(_ payload: [String: Any]?, ownerHash: String, now: Date) -> String {
        guard let payload = payload, UsWidgetContract.string(payload["ownerHash"]) == ownerHash else { return "missing" }
        guard validToken(UsWidgetContract.string(payload["token"])) else { return "renew" }
        guard let expires = UsWidgetContract.instant(UsWidgetContract.string(payload["expiresAt"])) else { return "renew" }
        return expires.addingTimeInterval(-30 * 86_400) < now ? "renew" : "ready"
    }
}
