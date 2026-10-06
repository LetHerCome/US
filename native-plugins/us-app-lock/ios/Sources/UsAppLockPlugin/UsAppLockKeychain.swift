import Foundation
import Security

/// Keychain storage for the app-lock record (generic password item,
/// WhenUnlockedThisDeviceOnly: never synced, never restored onto another phone).
final class UsAppLockKeychain {
    enum ReadResult: Equatable {
        case none
        case record(UsAppLockRecord)
        /// Keychain temporarily unreadable (e.g. before first unlock). Callers fail closed.
        case unreadable
    }

    private let service = "com.usapp.us.app-lock"
    private let account = "protection.v1"

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    func read() -> ReadResult {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data, let record = UsAppLockRecord.decode(data) else {
                return .record(.corrupted)
            }
            return .record(record)
        case errSecItemNotFound:
            return .none
        case errSecInteractionNotAllowed:
            return .unreadable
        default:
            return .record(.corrupted)
        }
    }

    func write(_ record: UsAppLockRecord) throws {
        let data = try JSONEncoder().encode(record)
        SecItemDelete(baseQuery as CFDictionary)
        var attributes = baseQuery
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: "UsAppLockKeychain", code: Int(status))
        }
    }

    func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
