import Foundation

/// Widget storage in the App Group (iOS twin of UsWidgetStore.java), read by
/// the widget extension and written by the app. Excluded from backups.
///
/// Three separate kinds of data, separately cleared:
///  - semantic shared state: snapshot-v2.json (written by the WebView);
///  - action state: think-action-v1.json (owned by the native send path);
///  - cached private media: media/photo-<key>.jpg and the round portraits.
/// The send token lives only in the shared Keychain (UsWidgetCredentials).
/// Everything is bound to an account hash; a different account wipes it all.
final class UsWidgetStore {
    static let maxPhotoBytes = 2 * 1024 * 1024
    static let maxPhotos = 3
    /// "me" and "partner": the round portraits; "memories", "memories_wide": the
    /// stack of Ricordi a pila; "lavagna", "lavagna_night": the couple's drawing.
    static let portraitSlots = ["pair", "me", "partner", "memories", "memories_wide", "lavagna", "lavagna_night"]

    let directory: URL
    private let media: URL
    private let lock = NSLock()

    /// The App Group store; nil when the group is not in the entitlements (unsigned builds).
    static func shared() -> UsWidgetStore? {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: UsWidgetShared.appGroup) else { return nil }
        return UsWidgetStore(directory: container.appendingPathComponent("Library/us-widget", isDirectory: true))
    }

    init(directory: URL) {
        self.directory = directory
        self.media = directory.appendingPathComponent("media", isDirectory: true)
        try? FileManager.default.createDirectory(at: media, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = directory
        try? url.setResourceValues(values)
    }

    private func file(_ name: String) -> URL { directory.appendingPathComponent(name) }
    private func mediaFile(_ name: String) -> URL { media.appendingPathComponent(name) }

    // MARK: - Account

    @discardableResult
    func activateAccount(_ ownerHash: String) -> Bool {
        guard UsWidgetContract.validOwner(ownerHash) else { return false }
        lock.lock(); defer { lock.unlock() }
        let current = ownerLocked()
        if !current.isEmpty && current != ownerHash { wipeAccountData() }
        return write(file("owner-v1.txt"), Data(ownerHash.utf8))
    }

    func owner() -> String {
        lock.lock(); defer { lock.unlock() }
        return ownerLocked()
    }

    private func ownerLocked() -> String {
        let value = readText(file("owner-v1.txt")).trimmingCharacters(in: .whitespacesAndNewlines)
        return UsWidgetContract.validOwner(value) ? value : ""
    }

    func clearAll() {
        lock.lock(); defer { lock.unlock() }
        wipeAccountData()
        remove(file("owner-v1.txt"))
    }

    private func wipeAccountData() {
        remove(file("snapshot-v2.json"))
        remove(file("think-action-v1.json"))
        remove(file("think-history-v1.json"))
        remove(mediaFile("photo-meta.json"))
        let names = (try? FileManager.default.contentsOfDirectory(atPath: media.path)) ?? []
        for name in names where name.hasPrefix("photo-") && name.hasSuffix(".jpg") { remove(mediaFile(name)) }
        for slot in Self.portraitSlots {
            remove(portraitFile(slot))
            remove(portraitMetaFile(slot))
        }
    }

    // MARK: - Semantic snapshot

    @discardableResult
    func write(snapshot input: [String: Any]) -> Bool {
        guard let normalized = UsWidgetContract.normalize(input) else { return false }
        lock.lock(); defer { lock.unlock() }
        let owner = ownerLocked()
        guard !owner.isEmpty, owner == (normalized["ownerHash"] as? String),
              let data = try? JSONSerialization.data(withJSONObject: normalized) else { return false }
        guard write(file("snapshot-v2.json"), data) else { return false }
        // The photo cache follows the snapshot: only the photos it names stay.
        prunePhotos(UsWidgetContract.object(normalized["photo"]))
        return true
    }

    /// Widget signals (27/11/2026): the other person's new look, from a background push for this
    /// account only. Validated again by UsWidgetContract.character; nothing else in the snapshot moves.
    @discardableResult
    func writePartnerLook(ownerHash: String, look: [String: Any]) -> Bool {
        guard UsWidgetContract.validOwner(ownerHash), var snapshot = readSnapshot(),
              (snapshot["ownerHash"] as? String) == ownerHash else { return false }
        var couple = UsWidgetContract.object(snapshot["couple"])
        var characters = UsWidgetContract.object(couple["characters"])
        characters["partner"] = UsWidgetContract.character(look)
        couple["characters"] = characters
        snapshot["couple"] = couple
        return write(snapshot: snapshot)
    }

    func readSnapshot() -> [String: Any]? {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? Data(contentsOf: file("snapshot-v2.json")),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let normalized = UsWidgetContract.normalize(json) else { return nil }
        let owner = ownerLocked()
        guard !owner.isEmpty, owner == (normalized["ownerHash"] as? String) else { return nil }
        return normalized
    }

    // MARK: - Ti penso action state

    func readAction() -> [String: Any]? {
        lock.lock(); defer { lock.unlock() }
        return readActionLocked()
    }

    private func readActionLocked() -> [String: Any]? {
        guard let data = try? Data(contentsOf: file("think-action-v1.json")),
              let action = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        let owner = ownerLocked()
        guard !owner.isEmpty, owner == (action["ownerHash"] as? String) else { return nil }
        return action
    }

    /// Records the action status; keeps the pending action id for idempotent retries.
    /// reply: the tap answered the partner's thought ("Ricambiato", not "Inviato").
    @discardableResult
    func writeAction(status: String, actionId: String, reply: Bool? = nil, now: Date = Date()) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let owner = ownerLocked()
        guard !owner.isEmpty else { return false }
        let previous = readActionLocked()
        let stamp = UsWidgetContract.format(now)
        let next: [String: Any] = [
            "ownerHash": owner,
            "status": status,
            "at": stamp,
            "actionId": actionId,
            "sentAt": status == "sent" ? stamp : UsWidgetContract.string(previous?["sentAt"]),
            "reply": reply ?? UsWidgetContract.bool(previous?["reply"])
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: next) else { return false }
        return write(file("think-action-v1.json"), data)
    }

    // MARK: - Portraits and pictures prepared by the WebView (never a URL)

    static func validPortraitSlot(_ slot: String) -> Bool { portraitSlots.contains(slot) }

    private func portraitFile(_ slot: String) -> URL {
        mediaFile(slot == "pair" ? "noi-portrait.jpg" : "noi-portrait-\(slot).png")
    }

    private func portraitMetaFile(_ slot: String) -> URL {
        mediaFile(slot == "pair" ? "noi-portrait-meta.json" : "noi-portrait-\(slot)-meta.json")
    }

    @discardableResult
    func writePortrait(ownerHash: String, slot: String, bytes: Data?) -> Bool {
        guard Self.validPortraitSlot(slot), let bytes = bytes, Self.isImage(bytes),
              bytes.count >= 64, bytes.count <= Self.maxPhotoBytes else { return false }
        lock.lock(); defer { lock.unlock() }
        let owner = ownerLocked()
        guard !owner.isEmpty, owner == ownerHash, write(portraitFile(slot), bytes),
              let meta = try? JSONSerialization.data(withJSONObject: ["ownerHash": owner]) else { return false }
        return write(portraitMetaFile(slot), meta)
    }

    func readPortrait(_ slot: String) -> Data? {
        guard Self.validPortraitSlot(slot) else { return nil }
        lock.lock(); defer { lock.unlock() }
        let owner = ownerLocked()
        guard !owner.isEmpty, let data = try? Data(contentsOf: portraitMetaFile(slot)),
              let meta = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              owner == (meta["ownerHash"] as? String) else { return nil }
        return try? Data(contentsOf: portraitFile(slot))
    }

    // MARK: - Foto & Noi: Oggi's photo of this hour and of the next two

    private func photoFile(_ key: String) -> URL { mediaFile("photo-\(key).jpg") }

    @discardableResult
    func writePhoto(ownerHash: String, key: String, bytes: Data?) -> Bool {
        guard UsWidgetContract.validMediaKey(key), let bytes = bytes, Self.isImage(bytes),
              bytes.count >= 64, bytes.count <= Self.maxPhotoBytes else { return false }
        lock.lock(); defer { lock.unlock() }
        let owner = ownerLocked()
        guard !owner.isEmpty, owner == ownerHash, write(photoFile(key), bytes) else { return false }
        var keys = [key]
        for other in photoKeysLocked() where other != key && keys.count < Self.maxPhotos + 1 { keys.append(other) }
        guard let meta = try? JSONSerialization.data(withJSONObject: ["ownerHash": owner, "keys": keys] as [String: Any]) else { return false }
        return write(mediaFile("photo-meta.json"), meta)
    }

    /// The cached photo bytes, only when they belong to this account.
    func readPhoto(_ key: String) -> Data? {
        lock.lock(); defer { lock.unlock() }
        guard photoKeysLocked().contains(key) else { return nil }
        return try? Data(contentsOf: photoFile(key))
    }

    func photoKey() -> String {
        lock.lock(); defer { lock.unlock() }
        return photoKeysLocked().first ?? ""
    }

    private func photoKeysLocked() -> [String] {
        let owner = ownerLocked()
        guard !owner.isEmpty, let data = try? Data(contentsOf: mediaFile("photo-meta.json")),
              let meta = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              owner == (meta["ownerHash"] as? String) else { return [] }
        return ((meta["keys"] as? [Any]) ?? []).compactMap { $0 as? String }.filter { UsWidgetContract.validMediaKey($0) }
    }

    /// Only the photos the snapshot names stay on the phone.
    private func prunePhotos(_ photo: [String: Any]) {
        var keep = Set<String>()
        if UsWidgetContract.string(photo["state"]) == "ready" {
            keep.insert(UsWidgetContract.string(photo["key"]))
            for item in (photo["next"] as? [Any]) ?? [] { keep.insert(UsWidgetContract.string(UsWidgetContract.object(item)["key"])) }
        }
        var kept: [String] = []
        for key in photoKeysLocked() {
            if keep.contains(key) { kept.append(key) } else { remove(photoFile(key)) }
        }
        if kept.isEmpty { remove(mediaFile("photo-meta.json")); return }
        if let meta = try? JSONSerialization.data(withJSONObject: ["ownerHash": ownerLocked(), "keys": kept] as [String: Any]) {
            _ = write(mediaFile("photo-meta.json"), meta)
        }
    }

    static func isImage(_ bytes: Data) -> Bool {
        guard bytes.count >= 12 else { return false }
        let b = [UInt8](bytes.prefix(12))
        let jpeg = b[0] == 0xFF && b[1] == 0xD8
        let png = b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47
        let webp = b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46 && b[8] == 0x57 && b[9] == 0x45
        return jpeg || png || webp
    }

    // MARK: - Device id (not a secret: the server only ever sees its hash)

    func deviceId() -> String {
        lock.lock(); defer { lock.unlock() }
        let current = readText(file("device-id-v1.txt")).trimmingCharacters(in: .whitespacesAndNewlines)
        if let uuid = UUID(uuidString: current) { return uuid.uuidString.lowercased() }
        let created = UUID().uuidString.lowercased()
        return write(file("device-id-v1.txt"), Data(created.utf8)) ? created : ""
    }

    // MARK: - Files

    private func readText(_ url: URL) -> String {
        guard let data = try? Data(contentsOf: url) else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }

    private func write(_ url: URL, _ data: Data) -> Bool {
        do {
            #if os(iOS)
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            #else
            try data.write(to: url, options: [.atomic])
            #endif
            return true
        } catch {
            return false
        }
    }

    private func remove(_ url: URL) {
        try? FileManager.default.removeItem(at: url)
    }
}
