import Foundation
import WidgetKit

/// The only network call a widget makes: "Ti penso" with the device-scoped
/// widget token (never a Supabase session), to the Edge of the build that
/// issued it (iOS twin of UsWidgetActionClient.java). The server deduplicates
/// on (token, actionId), so repeating an actionId cannot send twice.
enum UsWidgetActionClient {
    enum Result: String {
        case sent, failed, unauthorized
        case rateLimited = "rate_limited"
    }

    /// taps (Ti penso ×N, 27/11/2026): the taps of the burst, 1..99; an older server ignores them and stores 1.
    static func send(functionsBase: String, token: String, actionId: String, taps: Int = 1) async -> Result {
        let payload: [String: Any] = ["actionId": actionId, "taps": max(1, min(UsWidgetModels.maxTaps, taps))]
        guard let url = URL(string: UsWidgetEndpoints.thinkSend(functionsBase)),
              let body = try? JSONSerialization.data(withJSONObject: payload) else { return .failed }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "X-US-Widget-Token")
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 10
        let session = URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 || status == 403 { return .unauthorized }
            if status == 429 { return .rateLimited }
            guard (200..<300).contains(status), data.count <= 16_384,
                  let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return .failed }
            return UsWidgetContract.bool(json["sent"]) ? .sent : .failed
        } catch {
            return .failed
        }
    }

    /// The token may only reach the address it was checked against.
    private final class NoRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }
}

/// Sends "Ti penso" from the Home or Lock Screen with US closed (iOS twin of
/// UsThinkWidgetActionReceiver.java). Double sends are prevented by the busy
/// window re-checked on every tap and by retries that reuse the actionId.
///
/// Ti penso ×N (founder, 27/11/2026: «deve funzionare anche sul widget questa
/// cosa ripetuta»): each tap is one intent. It counts itself in the App Group
/// (UsWidgetStore.countTap, «×3» on the widget at once), waits
/// UsWidgetModels.burst, and only the intent whose tap was the last one sends
/// ONE Ti penso with all the taps (claimBurst); the others return without
/// sending. The 99th tap sends at once. The intent stays well inside the
/// time an App Intent may run (1.5 s plus a request of at most 10 s).
enum UsThinkSender {
    static func send(now: Date = Date()) async {
        guard let store = UsWidgetStore.shared() else { return }
        let owner = store.owner()
        guard !owner.isEmpty else { return }
        let credentials = UsWidgetCredentials()
        let token = credentials.readToken(owner)
        let snapshot = store.readSnapshot()
        let action = store.readAction()
        let model = UsWidgetModels.think(snapshot, action: action, hasCredential: !token.isEmpty, now: now)
        let lastSent = UsWidgetContract.instant(UsWidgetContract.string(action?["sentAt"]))
        let cooldown = lastSent.map { $0 <= now && now.timeIntervalSince($0) < UsWidgetModels.sendCooldown } ?? false
        guard model.canSend, !model.busy, !cooldown || model.counting else { return }

        // "Ricambiato" when the burst answers the partner's thought, "Inviato" otherwise.
        let reply = UsWidgetModels.unanswered(UsWidgetContract.object(snapshot?["think"]), action: action)
        guard let counted = store.countTap(replyIfNew: reply, now: now) else { return }
        WidgetCenter.shared.reloadTimelines(ofKind: UsWidgetShared.widgetKind("think"))

        if !counted.tap.full {
            try? await Task.sleep(nanoseconds: UInt64(UsWidgetModels.burst * 1_000_000_000))
        }
        // A later tap came: its own intent sends the burst.
        guard let taps = store.claimBurst(actionId: counted.tap.actionId, tapId: counted.tapId) else { return }
        WidgetCenter.shared.reloadTimelines(ofKind: UsWidgetShared.widgetKind("think"))

        let result = await UsWidgetActionClient.send(functionsBase: credentials.functionsBase(owner), token: token,
                                                     actionId: counted.tap.actionId, taps: taps)
        // Logout or account switch while the request was in flight: drop the result.
        guard store.owner() == owner else { return }
        if result == .unauthorized { credentials.clear() }
        store.writeAction(status: result.rawValue, actionId: counted.tap.actionId)
        WidgetCenter.shared.reloadTimelines(ofKind: UsWidgetShared.widgetKind("think"))
    }
}
